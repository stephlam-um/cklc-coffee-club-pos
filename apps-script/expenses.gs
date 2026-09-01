const EXPENSE_TRACKER_SHEET_NAME = 'Expenses_Tracker'
const EXPENSE_STATUSES = ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PAID']
const EXPENSE_CATEGORIES = ['Ingredients', 'Supplies', 'Other']
const EXPENSE_HEADERS = ['expense_id', 'source_key', 'submitted_at', 'member_name', 'member_email', 'purchase_date', 'vendor', 'amount', 'category', 'description', 'receipt_url', 'status', 'manager_note', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'payment_reference', 'updated_at']

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
