const EXPENSE_TRACKER_SHEET_NAME = 'Expenses_Tracker'
const EXPENSE_STATUSES = ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PAID']
const EXPENSE_CATEGORIES = ['Ingredients', 'Supplies', 'Other']
const EXPENSE_HEADERS = ['expense_id', 'source_key', 'submitted_at', 'member_name', 'member_email', 'purchase_date', 'vendor', 'amount', 'category', 'description', 'receipt_url', 'status', 'manager_note', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'payment_reference', 'updated_at']
const EXPENSE_STATUS_COLUMN_INDEX = 12
const EXPENSE_ROOT_FOLDER_PROPERTY = 'EXPENSE_ROOT_FOLDER_ID'

function setupExpenseAutomation() {
  var trackerSheet = ensureExpenseTrackerSheet_()
  var triggers = typeof ScriptApp !== 'undefined' && ScriptApp && typeof ScriptApp.getProjectTriggers === 'function'
    ? ScriptApp.getProjectTriggers()
    : []
  var keptTrigger = null
  var triggersToDelete = []

  for (var i = 0; i < triggers.length; i += 1) {
    var trigger = triggers[i]
    if (expenseIsExpenseSubmitTrigger_(trigger)) {
      if (!keptTrigger) {
        keptTrigger = trigger
        continue
      }
      triggersToDelete.push(trigger)
      continue
    }
    if (expenseHasSubmitHandlerName_(trigger)) {
      triggersToDelete.push(trigger)
    }
  }

  for (var j = 0; j < triggersToDelete.length; j += 1) {
    if (typeof ScriptApp.deleteTrigger === 'function') ScriptApp.deleteTrigger(triggersToDelete[j])
  }

  if (!keptTrigger && typeof ScriptApp !== 'undefined' && ScriptApp && typeof ScriptApp.newTrigger === 'function') {
    ScriptApp
      .newTrigger('onExpenseFormSubmit')
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onFormSubmit()
      .create()
  }

  return { trackerSheet: EXPENSE_TRACKER_SHEET_NAME, triggerCount: 1 }
}

function onExpenseFormSubmit(event) {
  var lock = typeof LockService !== 'undefined' && LockService && typeof LockService.getDocumentLock === 'function'
    ? LockService.getDocumentLock()
    : null

  try {
    if (lock && typeof lock.waitLock === 'function') lock.waitLock(30000)
    var trackerSheet = ensureExpenseTrackerSheet_()
    var claim = expenseNormalizeResponse_(event)
    var duplicateRecord = expenseFindTrackerRowBySourceKey_(trackerSheet, claim.sourceKey)

    if (duplicateRecord) return { expenseId: duplicateRecord.expenseId, duplicate: true }

    var expenseId = buildExpenseId_(claim.submittedAt, expenseGetSourceRow_(event))
    var organization = organizeExpenseReceipts_(claim, expenseId)
    var trackerClaim = expenseMergeTrackerClaim_(claim, organization)

    trackerSheet.appendRow(expenseBuildTrackerRow_(trackerClaim, expenseId, trackerClaim.receiptUrls.join(', ')))

    return { expenseId: expenseId, duplicate: false }
  } finally {
    if (lock && typeof lock.releaseLock === 'function') lock.releaseLock()
  }
}

function generateExpenseMarkdownReport(yearMonth) {
  expenseValidateYearMonth_(yearMonth)

  var spreadsheet = SpreadsheetApp.getActive()
  var trackerSheet = spreadsheet.getSheetByName(EXPENSE_TRACKER_SHEET_NAME)
  if (!trackerSheet) throw new Error('Expense tracker sheet is missing.')

  var values = trackerSheet.getDataRange().getValues()
  var headers = values.length ? values[0] : []
  var headerIndexes = expenseBuildHeaderIndexes_(headers)
  var rows = []
  for (var i = 1; i < values.length; i += 1) rows.push(expenseBuildReportRow_(values[i], headerIndexes))

  var fileName = 'Expense_Report_' + yearMonth + '.md'
  var markdown = buildExpenseMarkdownReport_(rows, yearMonth, expenseNowIso_())
  var properties = PropertiesService.getScriptProperties()
  var rootFolderId = properties.getProperty(EXPENSE_ROOT_FOLDER_PROPERTY)
  if (!rootFolderId) throw new Error('Missing expense root folder configuration.')

  var rootFolder = DriveApp.getFolderById(rootFolderId)
  var matchingFiles = rootFolder.getFilesByName(fileName)
  if (matchingFiles.hasNext()) matchingFiles.next().setContent(markdown)
  else rootFolder.createFile(fileName, markdown)

  return { fileName: fileName, yearMonth: yearMonth, rowCount: expenseFilterReportRows_(rows, yearMonth).length }
}

function buildExpenseMarkdownReport_(rows, yearMonth, generatedAt) {
  expenseValidateYearMonth_(yearMonth)
  var matchingRows = expenseFilterReportRows_(rows, yearMonth)
  matchingRows.sort(function (left, right) {
    var leftDate = expenseFormatLocalDate_(expenseReportValue_(left, 'purchase_date'))
    var rightDate = expenseFormatLocalDate_(expenseReportValue_(right, 'purchase_date'))
    if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1
    var leftId = expenseReportValue_(left, 'expense_id')
    var rightId = expenseReportValue_(right, 'expense_id')
    return leftId === rightId ? 0 : leftId < rightId ? -1 : 1
  })

  var totalsByStatus = expenseReportTotals_(matchingRows, 'status')
  var totalsByCategory = expenseReportTotals_(matchingRows, 'category')
  var lines = [
    '# Expense Report: ' + yearMonth,
    '',
    'Generated: ' + expenseReportDisplayValue_(generatedAt),
    '',
    '## Totals by Status',
    '',
    '| Status | Total |',
    '| --- | ---: |',
  ]

  expenseAppendReportTotals_(lines, totalsByStatus)
  lines.push('', '## Totals by Category', '', '| Category | Total |', '| --- | ---: |')
  expenseAppendReportTotals_(lines, totalsByCategory)
  lines.push('', '## Expenses', '', '| Expense ID | Date | Member | Vendor | Description | Amount | Status | Receipt |', '| --- | --- | --- | --- | --- | ---: | --- | --- |')

  if (!matchingRows.length) lines.push('| - | - | - | - | - | - | - | - |')
  for (var i = 0; i < matchingRows.length; i += 1) {
    var row = matchingRows[i]
    var receiptUrl = expenseReportValue_(row, 'receipt_url')
    lines.push('| ' + [
      expenseReportTableValue_(expenseReportValue_(row, 'expense_id')),
      expenseReportTableValue_(expenseFormatLocalDate_(expenseReportValue_(row, 'purchase_date'))),
      expenseReportTableValue_(expenseReportValue_(row, 'member_name')),
      expenseReportTableValue_(expenseReportValue_(row, 'vendor')),
      expenseReportTableValue_(expenseReportValue_(row, 'description')),
      expenseFormatReportAmount_(expenseReportValue_(row, 'amount')),
      expenseReportTableValue_(expenseReportValue_(row, 'status')),
      receiptUrl ? '[Receipt](' + expenseEscapeMarkdown_(receiptUrl) + ')' : '-',
    ].join(' | ') + ' |')
  }

  return lines.join('\n') + '\n'
}

function expenseBuildHeaderIndexes_(headers) {
  var indexes = {}
  for (var i = 0; i < headers.length; i += 1) indexes[String(headers[i] || '')] = i
  return indexes
}

function expenseBuildReportRow_(values, headerIndexes) {
  var row = {}
  for (var i = 0; i < EXPENSE_HEADERS.length; i += 1) {
    var header = EXPENSE_HEADERS[i]
    row[header] = headerIndexes[header] === undefined ? '' : values[headerIndexes[header]]
  }
  return row
}

function expenseFilterReportRows_(rows, yearMonth) {
  var matchingRows = []
  var sourceRows = Array.isArray(rows) ? rows : []
  for (var i = 0; i < sourceRows.length; i += 1) {
    if (expenseFormatLocalDate_(expenseReportValue_(sourceRows[i], 'purchase_date')).slice(0, 7) === yearMonth) matchingRows.push(sourceRows[i])
  }
  return matchingRows
}

function expenseReportTotals_(rows, key) {
  var totals = {}
  for (var i = 0; i < rows.length; i += 1) {
    var group = expenseReportValue_(rows[i], key) || '-'
    var amount = Number(expenseReportValue_(rows[i], 'amount'))
    totals[group] = (totals[group] || 0) + (isFinite(amount) ? amount : 0)
  }
  return totals
}

function expenseAppendReportTotals_(lines, totals) {
  var keys = Object.keys(totals).sort()
  if (!keys.length) lines.push('| - | MOP 0.00 |')
  for (var i = 0; i < keys.length; i += 1) lines.push('| ' + expenseReportTableValue_(keys[i]) + ' | ' + expenseFormatReportAmount_(totals[keys[i]]) + ' |')
}

function expenseReportValue_(row, key) {
  if (Array.isArray(row)) {
    var index = EXPENSE_HEADERS.indexOf(key)
    return index >= 0 ? row[index] : ''
  }
  return row && row[key] !== undefined && row[key] !== null ? row[key] : ''
}

function expenseReportDisplayValue_(value) {
  return value === undefined || value === null || value === '' ? '-' : String(value)
}

function expenseReportTableValue_(value) {
  return expenseEscapeMarkdown_(expenseReportDisplayValue_(value))
}

function expenseEscapeMarkdown_(value) {
  return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/\|/g, '\\|')
}

function expenseFormatReportAmount_(value) {
  if (value === undefined || value === null || value === '') return '-'
  var amount = Number(value)
  return isFinite(amount) ? 'MOP ' + amount.toFixed(2) : '-'
}

function expenseValidateYearMonth_(yearMonth) {
  if (!/^\d{4}-\d{2}$/.test(yearMonth || '')) throw new Error('yearMonth must use YYYY-MM format.')
}

function expenseNormalizeResponse_(event) {
  const namedValues = event && event.namedValues ? event.namedValues : {}
  const row = expenseGetSourceRow_(event)
  const sheetId = expenseGetSourceSheetId_(event)
  const sourceKey = sheetId + ':' + row
  const submittedAtText = expenseReadNamedValue_(namedValues, ['Timestamp'])
  const submittedAt = expenseParseTimestamp_(submittedAtText)
  const memberName = expenseReadNamedValue_(namedValues, ['Member name'])
  const memberEmail = expenseReadNamedValue_(namedValues, ['Email Address', 'Email'])
  const purchaseDate = expenseParseDateOnly_(expenseReadNamedValue_(namedValues, ['Purchase date']))
  const vendor = expenseReadNamedValue_(namedValues, ['Vendor'])
  const amount = expenseParseAmount_(expenseReadNamedValue_(namedValues, ['Amount']))
  const category = expenseParseCategory_(expenseReadNamedValue_(namedValues, ['Category']))
  const description = expenseReadNamedValue_(namedValues, ['Description'])
  const receiptUrls = expenseParseReceiptUrls_(namedValues['Receipt'])
  const missingOrInvalid = []

  if (!memberName || !memberEmail) missingOrInvalid.push('member')
  if (!purchaseDate) missingOrInvalid.push('purchase date')
  if (!vendor) missingOrInvalid.push('vendor')
  if (!(amount > 0)) missingOrInvalid.push('amount')
  if (!category) missingOrInvalid.push('category')
  if (!receiptUrls.length) missingOrInvalid.push('receipt')

  return {
    sourceKey: sourceKey,
    submittedAt: submittedAt,
    memberName: memberName,
    memberEmail: memberEmail,
    purchaseDate: purchaseDate,
    vendor: vendor,
    amount: amount,
    category: category,
    description: description,
    receiptUrls: receiptUrls,
    status: missingOrInvalid.length ? 'NEEDS_INFO' : 'SUBMITTED',
    managerNote: missingOrInvalid.length ? 'Missing or invalid: ' + missingOrInvalid.join(', ') : '',
  }
}

function expenseBuildTrackerRow_(claim, expenseId, receiptUrl) {
  return [
    expenseId,
    claim.sourceKey || '',
    claim.submittedAt || '',
    claim.memberName || '',
    claim.memberEmail || '',
    claim.purchaseDate || '',
    claim.vendor || '',
    claim.amount || '',
    claim.category || '',
    claim.description || '',
    receiptUrl || '',
    claim.status || '',
    claim.managerNote || '',
    '',
    '',
    '',
    '',
    '',
    expenseNowIso_(),
  ]
}

function buildExpenseId_(submittedAt, sourceRow) {
  const datePart = expenseDateKeyFromValue_(submittedAt)
  const rowNumber = Number(sourceRow)
  const paddedRow = isFinite(rowNumber) && rowNumber > 0 ? String(Math.floor(rowNumber)).padStart(4, '0') : '0000'
  return 'EXP-' + datePart + '-' + paddedRow
}

function organizeExpenseReceipts_(claim, expenseId) {
  var originalUrls = claim && Array.isArray(claim.receiptUrls) ? claim.receiptUrls.slice() : []
  var properties = typeof PropertiesService !== 'undefined' && PropertiesService && typeof PropertiesService.getScriptProperties === 'function'
    ? PropertiesService.getScriptProperties()
    : null
  var rootFolderId = properties && typeof properties.getProperty === 'function'
    ? properties.getProperty(EXPENSE_ROOT_FOLDER_PROPERTY)
    : ''

  if (!rootFolderId) return { urls: originalUrls, error: 'Missing expense root folder configuration.' }

  try {
    var rootFolder = DriveApp.getFolderById(rootFolderId)
    var folderDate = claim && claim.purchaseDate ? claim.purchaseDate : claim && claim.submittedAt ? claim.submittedAt : ''
    var yearKey = expenseDateFolderPart_(folderDate, 0, 4, '0000')
    var monthKey = expenseDateFolderPart_(folderDate, 5, 7, '00')
    var yearFolder = expenseGetOrCreateFolderByName_(rootFolder, yearKey)
    var monthFolder = expenseGetOrCreateFolderByName_(yearFolder, monthKey)
    var claimFolder = expenseGetOrCreateFolderByName_(monthFolder, expenseBuildClaimFolderName_(expenseId, claim))
    var movedUrls = []
    var errors = []

    for (var i = 0; i < originalUrls.length; i += 1) {
      var originalUrl = originalUrls[i]
      try {
        var fileId = expenseExtractDriveFileId_(originalUrl)
        if (!fileId) throw new Error('invalid receipt URL')
        var file = DriveApp.getFileById(fileId)
        var fileName = file && typeof file.getName === 'function' ? file.getName() : ''
        var extension = expenseFileExtension_(fileName)
        if (extension && typeof file.setName === 'function') {
          file.setName(expenseId + '_' + String(i + 1).padStart(2, '0') + extension)
        }
        if (file && typeof file.moveTo === 'function') file.moveTo(claimFolder)
        movedUrls.push(file && typeof file.getUrl === 'function' ? file.getUrl() : originalUrl)
      } catch (error) {
        movedUrls.push(originalUrl)
        errors.push('Receipt organization failed for ' + (expenseExtractDriveFileId_(originalUrl) || ('file ' + String(i + 1))))
      }
    }

    return { urls: movedUrls, error: errors.join('; ') }
  } catch (error) {
    return { urls: originalUrls, error: 'Expense receipt folder setup failed.' }
  }
}

function expenseReadNamedValue_(namedValues, keys) {
  for (var i = 0; i < keys.length; i += 1) {
    var rawValue = namedValues[keys[i]]
    if (Array.isArray(rawValue) && rawValue.length) return String(rawValue[0]).trim()
    if (typeof rawValue === 'string') return rawValue.trim()
  }
  return ''
}

function expenseParseAmount_(value) {
  if (!value) return null
  var numericText = String(value).replace(/[^0-9.\-]/g, '')
  if (!numericText) return null
  var amount = Number(numericText)
  return isFinite(amount) && amount > 0 ? amount : null
}

function expenseParseCategory_(value) {
  return EXPENSE_CATEGORIES.indexOf(value) >= 0 ? value : ''
}

function expenseParseReceiptUrls_(value) {
  var uniqueUrls = Array.isArray(value) && typeof value.slice === 'function' ? value.slice(0, 0) : []
  var inputs = []
  if (Array.isArray(value)) inputs = value
  else if (typeof value === 'string') inputs = [value]
  for (var i = 0; i < inputs.length; i += 1) {
    var rawText = String(inputs[i] || '')
    if (!rawText) continue
    var matches = rawText.match(/https?:\/\/[^\s,]+/g)
    if (!matches) continue
    for (var j = 0; j < matches.length; j += 1) {
      var url = matches[j].trim()
      if (url && uniqueUrls.indexOf(url) < 0) uniqueUrls.push(url)
    }
  }
  return uniqueUrls
}

function expenseParseTimestamp_(value) {
  var date = expenseParseDateValue_(value)
  return date ? expenseFormatLocalTimestamp_(date) : ''
}

function expenseParseDateOnly_(value) {
  return expenseFormatLocalDate_(value)
}

function expenseParseDateValue_(value) {
  if (!value) return null
  var date = value instanceof Date ? value : new Date(value)
  return isNaN(date.getTime()) ? null : date
}

function expenseDateKeyFromValue_(value) {
  var dateText = expenseFormatLocalDate_(value)
  return dateText ? dateText.replace(/-/g, '') : '00000000'
}

function expenseGetSourceRow_(event) {
  if (event && event.range && typeof event.range.getRow === 'function') return event.range.getRow()
  return 0
}

function expenseGetSourceSheetId_(event) {
  if (event && event.range && typeof event.range.getSheet === 'function') {
    var sheet = event.range.getSheet()
    if (sheet && typeof sheet.getSheetId === 'function') return sheet.getSheetId()
  }
  return ''
}

function expenseNowIso_() {
  return new Date().toISOString()
}

function expenseFormatLocalDate_(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    var trimmed = value.trim()
    var isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3]
    var slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\b|$)/)
    if (slashMatch) {
      return slashMatch[3] + '-' + String(Number(slashMatch[1])).padStart(2, '0') + '-' + String(Number(slashMatch[2])).padStart(2, '0')
    }
  }
  var date = expenseParseDateValue_(value)
  if (!date) return ''
  return expenseGetDateParts_(date).year + '-' + expenseGetDateParts_(date).month + '-' + expenseGetDateParts_(date).day
}

function expenseFormatLocalTimestamp_(date) {
  var parts = expenseGetDateParts_(date)
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute + ':' + parts.second
}

function expenseGetDateParts_(date) {
  var timezone = expenseGetScriptTimeZone_()
  if (typeof Utilities !== 'undefined' && Utilities && typeof Utilities.formatDate === 'function') {
    var formatted = Utilities.formatDate(date, timezone, "yyyy-MM-dd'T'HH:mm:ss")
    var match = formatted && formatted.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/)
    if (match) {
      return { year: match[1], month: match[2], day: match[3], hour: match[4], minute: match[5], second: match[6] }
    }
    var dateOnly = Utilities.formatDate(date, timezone, 'yyyy-MM-dd')
    var dateMatch = dateOnly && dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateMatch) {
      return { year: dateMatch[1], month: dateMatch[2], day: dateMatch[3], hour: '00', minute: '00', second: '00' }
    }
  }
  return {
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, '0'),
    day: String(date.getDate()).padStart(2, '0'),
    hour: String(date.getHours()).padStart(2, '0'),
    minute: String(date.getMinutes()).padStart(2, '0'),
    second: String(date.getSeconds()).padStart(2, '0'),
  }
}

function expenseGetScriptTimeZone_() {
  if (typeof Session !== 'undefined' && Session && typeof Session.getScriptTimeZone === 'function') return Session.getScriptTimeZone()
  return 'UTC'
}

function ensureExpenseTrackerSheet_() {
  var spreadsheet = SpreadsheetApp.getActive()
  var trackerSheet = spreadsheet.getSheetByName(EXPENSE_TRACKER_SHEET_NAME)
  if (!trackerSheet) trackerSheet = spreadsheet.insertSheet(EXPENSE_TRACKER_SHEET_NAME)
  if (trackerSheet.getLastRow() === 0) trackerSheet.appendRow(EXPENSE_HEADERS)
  if (typeof trackerSheet.setFrozenRows === 'function') trackerSheet.setFrozenRows(1)
  expenseApplyStatusValidation_(trackerSheet)
  return trackerSheet
}

function expenseApplyStatusValidation_(trackerSheet) {
  if (!trackerSheet || typeof trackerSheet.getRange !== 'function' || typeof SpreadsheetApp === 'undefined' || !SpreadsheetApp || typeof SpreadsheetApp.newDataValidation !== 'function') return
  var validation = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(EXPENSE_STATUSES)
    .setAllowInvalid(true)
    .build()
  trackerSheet.getRange(2, EXPENSE_STATUS_COLUMN_INDEX, 999, 1).setDataValidation(validation)
}

function expenseFindTrackerRowBySourceKey_(trackerSheet, sourceKey) {
  if (!trackerSheet || !sourceKey || typeof trackerSheet.getLastRow !== 'function' || trackerSheet.getLastRow() < 2) return null
  var values = trackerSheet.getRange(2, 1, trackerSheet.getLastRow() - 1, 2).getValues()
  for (var i = 0; i < values.length; i += 1) {
    if (values[i][1] === sourceKey) return { rowIndex: i + 2, expenseId: values[i][0] || '' }
  }
  return null
}

function expenseMergeTrackerClaim_(claim, organization) {
  var managerNote = claim && claim.managerNote ? claim.managerNote : ''
  if (organization && organization.error) {
    managerNote = managerNote ? managerNote + ' | ' + organization.error : organization.error
  }
  return {
    sourceKey: claim && claim.sourceKey ? claim.sourceKey : '',
    submittedAt: claim && claim.submittedAt ? claim.submittedAt : '',
    memberName: claim && claim.memberName ? claim.memberName : '',
    memberEmail: claim && claim.memberEmail ? claim.memberEmail : '',
    purchaseDate: claim && claim.purchaseDate ? claim.purchaseDate : '',
    vendor: claim && claim.vendor ? claim.vendor : '',
    amount: claim && claim.amount ? claim.amount : '',
    category: claim && claim.category ? claim.category : '',
    description: claim && claim.description ? claim.description : '',
    receiptUrls: organization && Array.isArray(organization.urls) ? organization.urls : claim && Array.isArray(claim.receiptUrls) ? claim.receiptUrls.slice() : [],
    status: claim && claim.status ? claim.status : '',
    managerNote: managerNote,
  }
}

function expenseGetOrCreateFolderByName_(parentFolder, folderName) {
  var existingFolders = parentFolder.getFoldersByName(folderName)
  return existingFolders.hasNext() ? existingFolders.next() : parentFolder.createFolder(folderName)
}

function expenseBuildClaimFolderName_(expenseId, claim) {
  return expenseId + '_' + expenseSanitizeFolderNamePart_(claim && claim.vendor ? claim.vendor : 'UnknownVendor') + '_' + expenseSanitizeFolderNamePart_(claim && claim.memberName ? claim.memberName : 'UnknownMember')
}

function expenseSanitizeFolderNamePart_(value) {
  var sanitized = String(value || '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return sanitized || 'Unknown'
}

function expenseExtractDriveFileId_(url) {
  var text = String(url || '')
  var filePathMatch = text.match(/\/d\/([A-Za-z0-9_-]+)/)
  if (filePathMatch) return filePathMatch[1]
  var queryMatch = text.match(/[?&]id=([A-Za-z0-9_-]+)/)
  return queryMatch ? queryMatch[1] : ''
}

function expenseFileExtension_(fileName) {
  var match = String(fileName || '').match(/(\.[^.]+)$/)
  return match ? match[1] : ''
}

function expenseDateFolderPart_(value, start, end, fallback) {
  var dateText = expenseFormatLocalDate_(value)
  return dateText ? dateText.slice(start, end) : fallback
}

function expenseHasSubmitHandlerName_(trigger) {
  return trigger && typeof trigger.getHandlerFunction === 'function' && trigger.getHandlerFunction() === 'onExpenseFormSubmit'
}

function expenseIsExpenseSubmitTrigger_(trigger) {
  if (!expenseHasSubmitHandlerName_(trigger)) return false
  var triggerSource = trigger && typeof trigger.getTriggerSource === 'function' ? trigger.getTriggerSource() : ''
  var eventType = trigger && typeof trigger.getEventType === 'function' ? trigger.getEventType() : ''
  var spreadsheetSource = typeof ScriptApp !== 'undefined' && ScriptApp && ScriptApp.TriggerSource ? ScriptApp.TriggerSource.SPREADSHEETS : 'SPREADSHEETS'
  var formSubmitEvent = typeof ScriptApp !== 'undefined' && ScriptApp && ScriptApp.EventType ? ScriptApp.EventType.ON_FORM_SUBMIT : 'ON_FORM_SUBMIT'
  return triggerSource === spreadsheetSource && eventType === formSubmitEvent
}
