import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const expensesPath = new URL('../apps-script/expenses.gs', import.meta.url)
const expensesCode = fs.existsSync(expensesPath) ? fs.readFileSync(expensesPath, 'utf8') : ''

function createHarness() {
  class Sheet {
    constructor(name, rows = [], sheetId = 1) {
      this.name = name
      this.rows = rows.map(row => [...row])
      this.sheetId = sheetId
      this.frozenRows = 0
      this.lastValidation = null
    }

    getName() { return this.name }
    getSheetId() { return this.sheetId }
    getLastRow() { return this.rows.length }
    appendRow(row) { this.rows.push([...row]) }
    setFrozenRows(count) { this.frozenRows = count }
    getDataRange() { return { getValues: () => this.rows.map(row => [...row]) } }
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        getValues: () => {
          const values = []
          for (let r = 0; r < numRows; r++) {
            const source = this.rows[row - 1 + r] || []
            values.push(source.slice(column - 1, column - 1 + numColumns))
          }
          return values
        },
        setValues: values => {
          for (let r = 0; r < numRows; r++) {
            const targetRow = row - 1 + r
            while (this.rows.length <= targetRow) this.rows.push([])
            for (let c = 0; c < numColumns; c++) {
              this.rows[targetRow][column - 1 + c] = values[r][c]
            }
          }
        },
        setValue: value => this.getRange(row, column, 1, 1).setValues([[value]]),
        setDataValidation: validation => { this.lastValidation = { row, column, numRows, numColumns, validation } },
        setDataValidations: validations => { this.lastValidation = { row, column, numRows, numColumns, validations } },
      }
    }
  }

  class File {
    constructor(id, name, url, parent = null) {
      this.id = id
      this.name = name
      this.url = url
      this.parent = parent
      this.content = ''
      this.shouldFailMove = false
    }

    getId() { return this.id }
    getName() { return this.name }
    getUrl() { return this.url }
    setName(name) { this.name = name; return this }
    setContent(content) { this.content = content; return this }
    moveTo(folder) {
      if (this.shouldFailMove) throw new Error(`move failed for ${this.id}`)
      this.parent = folder
      return this
    }
    get parentName() { return this.parent ? this.parent.getName() : null }
  }

  class Folder {
    constructor(id, name, parent = null) {
      this.id = id
      this.name = name
      this.parent = parent
      this.folders = new Map()
      this.files = new Map()
    }

    getId() { return this.id }
    getName() { return this.name }
    createFolder(name) {
      const folder = new Folder(`${this.id}/${name}`, name, this)
      this.folders.set(name, folder)
      return folder
    }
    createFile(name, content = '') {
      const file = new File(`${this.id}/${name}`, name, `https://drive.google.com/file/d/${name}/view`, this)
      file.setContent(content)
      this.files.set(name, file)
      return file
    }
    getFoldersByName(name) {
      const folder = this.folders.get(name)
      return iteratorFor(folder ? [folder] : [])
    }
    getFilesByName(name) {
      const file = this.files.get(name)
      return iteratorFor(file ? [file] : [])
    }
  }

  function iteratorFor(items) {
    let index = 0
    return {
      hasNext: () => index < items.length,
      next: () => items[index++],
    }
  }

  const sheets = new Map()
  const files = new Map()
  const rootFolder = new Folder('root-folder', 'Expenses')
  const scriptProperties = { EXPENSE_ROOT_FOLDER_ID: rootFolder.getId() }
  const sheet = new Sheet('Form Responses 1', [], 99)
  sheets.set(sheet.getName(), sheet)
  files.set('receipt-1', new File('receipt-1', 'receipt-1.jpg', 'https://drive.google.com/file/d/receipt-1/view'))

  const spreadsheet = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => {
      const newSheet = new Sheet(name, [], sheets.size + 100)
      sheets.set(name, newSheet)
      return newSheet
    },
  }

  const existingTriggers = []
  let createdTriggers = 0
  let deletedTriggers = 0
  let lockWaits = 0
  let lockReleases = 0
  let builtValidation = null
  const context = {
    console,
    Session: { getScriptTimeZone: () => 'Asia/Singapore' },
    SpreadsheetApp: {
      getActive: () => spreadsheet,
      newDataValidation: () => ({
        config: { values: [], allowInvalid: true },
        requireValueInList(values) { this.config.values = [...values]; return this },
        setAllowInvalid(allowInvalid) { this.config.allowInvalid = allowInvalid; return this },
        build() { builtValidation = { ...this.config }; return { ...this.config } },
      }),
    },
    DriveApp: {
      getFolderById: id => {
        if (id === rootFolder.getId()) return rootFolder
        throw new Error(`Unknown folder: ${id}`)
      },
      getFileById: id => {
        const file = files.get(id)
        if (!file) throw new Error(`Unknown file: ${id}`)
        return file
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => scriptProperties[key] || '', setProperty: (key, value) => { scriptProperties[key] = value } }) },
    ScriptApp: {
      getProjectTriggers: () => existingTriggers,
      deleteTrigger: trigger => {
        const index = existingTriggers.indexOf(trigger)
        if (index >= 0) existingTriggers.splice(index, 1)
        deletedTriggers += 1
      },
      newTrigger: () => ({ forSpreadsheet: () => ({ onFormSubmit: () => ({ create() { createdTriggers += 1; return { getHandlerFunction: () => 'onExpenseFormSubmit' } } }) }) }),
    },
    LockService: {
      getDocumentLock: () => ({
        waitLock() { lockWaits += 1 },
        releaseLock() { lockReleases += 1 },
      }),
    },
    Utilities: {
      formatDate: (date, timeZone, pattern) => {
        if (!(date instanceof Date)) return String(date)
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: timeZone || 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
        const parts = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
        if (pattern === "yyyy-MM-dd'T'HH:mm:ss") return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`
        return `${parts.year}-${parts.month}-${parts.day}`
      },
      getUuid: () => 'uuid-1',
    },
  }

  if (expensesCode) vm.runInNewContext(expensesCode, context)

  const event = {
    range: { getRow: () => 7, getSheet: () => ({ getSheetId: () => 99, getName: () => 'Form Responses 1' }) },
    namedValues: {
      Timestamp: ['9/1/2026 10:30:00'],
      'Member name': ['Cici'],
      'Email Address': ['cici@example.com'],
      'Purchase date': ['9/1/2026'],
      Vendor: ['Market'],
      Amount: ['MOP 123.40'],
      Category: ['Ingredients'],
      Description: ['Milk and beans'],
      Receipt: ['https://drive.google.com/file/d/receipt-1/view'],
    },
    values: ['9/1/2026 10:30:00', 'cici@example.com', 'Cici', '9/1/2026', 'Market', 'MOP 123.40', 'Ingredients', 'Milk and beans', 'https://drive.google.com/file/d/receipt-1/view'],
  }

  return {
    context,
    event,
    sheets,
    files,
    rootFolder,
    scriptProperties,
    existingTriggers,
    get createdTriggers() { return createdTriggers },
    get deletedTriggers() { return deletedTriggers },
    get lockWaits() { return lockWaits },
    get lockReleases() { return lockReleases },
    get builtValidation() { return builtValidation },
  }
}

test('normalizes a valid Form response into the tracker contract', () => {
  const { context, event } = createHarness()
  const claim = context.expenseNormalizeResponse_(event)
  assert.equal(claim.sourceKey, '99:7')
  assert.equal(claim.memberName, 'Cici')
  assert.equal(claim.memberEmail, 'cici@example.com')
  assert.equal(claim.amount, 123.4)
  assert.equal(claim.category, 'Ingredients')
  assert.deepEqual(claim.receiptUrls, ['https://drive.google.com/file/d/receipt-1/view'])
  assert.equal(claim.status, 'SUBMITTED')
})

test('marks an incomplete response as NEEDS_INFO instead of dropping it', () => {
  const { context, event } = createHarness()
  const incomplete = { ...event, namedValues: { ...event.namedValues, Amount: ['not money'], Receipt: [''] } }
  const claim = context.expenseNormalizeResponse_(incomplete)
  assert.equal(claim.status, 'NEEDS_INFO')
  assert.match(claim.managerNote, /amount|receipt/i)
})

test('preserves the local purchase date and expense ID date key for near-midnight local timestamps', () => {
  const { context, event } = createHarness()
  const localDateEvent = {
    ...event,
    namedValues: {
      ...event.namedValues,
      Timestamp: ['2026-08-31T16:30:00.000Z'],
      'Purchase date': ['9/1/2026'],
    },
  }

  const claim = context.expenseNormalizeResponse_(localDateEvent)
  const expenseId = context.buildExpenseId_(claim.submittedAt, localDateEvent.range.getRow())

  assert.equal(claim.purchaseDate, '2026-09-01')
  assert.equal(claim.submittedAt, '2026-09-01T00:30:00')
  assert.equal(expenseId, 'EXP-20260901-0007')
})

test('preserves every uploaded receipt URL when Forms supplies multiple values', () => {
  const { context, event } = createHarness()
  const multipleReceiptsEvent = {
    ...event,
    namedValues: {
      ...event.namedValues,
      Receipt: [
        'https://drive.google.com/file/d/receipt-1/view',
        'https://drive.google.com/file/d/receipt-2/view',
      ],
    },
  }

  const claim = context.expenseNormalizeResponse_(multipleReceiptsEvent)

  assert.deepEqual(claim.receiptUrls, [
    'https://drive.google.com/file/d/receipt-1/view',
    'https://drive.google.com/file/d/receipt-2/view',
  ])
})

test('form submit appends one tracker row and organizes every receipt once per source key', () => {
  const harness = createHarness()
  const { context, event, sheets, files, rootFolder } = harness
  files.set('receipt-2', {
    ...files.get('receipt-1'),
    id: 'receipt-2',
    name: 'receipt-2.png',
    url: 'https://drive.google.com/file/d/receipt-2/view',
    getId() { return this.id },
    getName() { return this.name },
    getUrl() { return this.url },
    setName(name) { this.name = name; return this },
    setContent(content) { this.content = content; return this },
    moveTo(folder) { this.parent = folder; return this },
    get parentName() { return this.parent ? this.parent.getName() : null },
  })
  const multiReceiptEvent = {
    ...event,
    namedValues: {
      ...event.namedValues,
      Receipt: [
        'https://drive.google.com/file/d/receipt-1/view',
        'https://drive.google.com/file/d/receipt-2/view',
      ],
    },
  }

  const first = context.onExpenseFormSubmit(multiReceiptEvent)
  const second = context.onExpenseFormSubmit(multiReceiptEvent)
  const tracker = sheets.get('Expenses_Tracker')

  assert.equal(first.duplicate, false)
  assert.equal(first.expenseId, 'EXP-20260901-0007')
  assert.equal(second.duplicate, true)
  assert.equal(second.expenseId, 'EXP-20260901-0007')
  assert.equal(tracker.rows.length, 2)
  assert.deepEqual(tracker.rows[0], [
    'expense_id', 'source_key', 'submitted_at', 'member_name', 'member_email', 'purchase_date', 'vendor', 'amount', 'category', 'description', 'receipt_url', 'status', 'manager_note', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'payment_reference', 'updated_at',
  ])
  assert.equal(tracker.rows[1][0], 'EXP-20260901-0007')
  assert.equal(tracker.rows[1][1], '99:7')
  assert.match(tracker.rows[1][10], /receipt-1\/view,\s*https:\/\/drive\.google\.com\/file\/d\/receipt-2\/view/)
  assert.equal(files.get('receipt-1').parentName, 'EXP-20260901-0007_Market_Cici')
  assert.equal(files.get('receipt-2').parentName, 'EXP-20260901-0007_Market_Cici')
  assert.equal(rootFolder.getFoldersByName('2026').next().getFoldersByName('09').next().getFoldersByName('EXP-20260901-0007_Market_Cici').next().getName(), 'EXP-20260901-0007_Market_Cici')
  assert.equal(harness.lockWaits, 2)
  assert.equal(harness.lockReleases, 2)
})

test('submit keeps the tracker row when drive setup is unavailable', () => {
  const { context, event, sheets, scriptProperties } = createHarness()
  scriptProperties.EXPENSE_ROOT_FOLDER_ID = ''

  const result = context.onExpenseFormSubmit(event)
  const tracker = sheets.get('Expenses_Tracker')

  assert.equal(result.duplicate, false)
  assert.equal(tracker.rows.length, 2)
  assert.equal(tracker.rows[1][10], 'https://drive.google.com/file/d/receipt-1/view')
  assert.match(tracker.rows[1][12], /root folder/i)
})

test('setup removes duplicate triggers and creates one form-submit trigger', () => {
  const { context, sheets, existingTriggers } = createHarness()
  const keptTrigger = { getHandlerFunction: () => 'onExpenseFormSubmit' }
  const duplicateTrigger = { getHandlerFunction: () => 'onExpenseFormSubmit' }
  const otherTrigger = { getHandlerFunction: () => 'onOtherSubmit' }
  existingTriggers.push(keptTrigger, duplicateTrigger, otherTrigger)

  const result = context.setupExpenseAutomation()
  const tracker = sheets.get('Expenses_Tracker')

  assert.equal(result.trackerSheet, 'Expenses_Tracker')
  assert.equal(result.triggerCount, 1)
  assert.equal(tracker.getLastRow(), 1)
  assert.equal(tracker.frozenRows, 1)
  assert.deepEqual(tracker.rows[0], [
    'expense_id', 'source_key', 'submitted_at', 'member_name', 'member_email', 'purchase_date', 'vendor', 'amount', 'category', 'description', 'receipt_url', 'status', 'manager_note', 'approved_by', 'approved_at', 'paid_by', 'paid_at', 'payment_reference', 'updated_at',
  ])
})

test('setup applies status validation and deduplicates existing submit triggers', () => {
  const harness = createHarness()
  const { context, sheets, existingTriggers } = harness
  existingTriggers.push(
    { getHandlerFunction: () => 'onExpenseFormSubmit' },
    { getHandlerFunction: () => 'onExpenseFormSubmit' },
    { getHandlerFunction: () => 'someOtherHandler' },
  )

  const result = context.setupExpenseAutomation()
  const tracker = sheets.get('Expenses_Tracker')

  assert.equal(result.triggerCount, 1)
  assert.equal(harness.createdTriggers, 0)
  assert.equal(harness.deletedTriggers, 1)
  assert.deepEqual(harness.builtValidation, { values: ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PAID'], allowInvalid: true })
  assert.deepEqual(tracker.lastValidation, {
    row: 2,
    column: 12,
    numRows: 999,
    numColumns: 1,
    validation: { values: ['SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED', 'PAID'], allowInvalid: true },
  })
})
