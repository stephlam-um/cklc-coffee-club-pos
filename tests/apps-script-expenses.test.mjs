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
    }

    getName() { return this.name }
    getSheetId() { return this.sheetId }
    getLastRow() { return this.rows.length }
    appendRow(row) { this.rows.push([...row]) }
    setFrozenRows() {}
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
        setDataValidation() {},
        setDataValidations() {},
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
    }

    getId() { return this.id }
    getName() { return this.name }
    getUrl() { return this.url }
    setName(name) { this.name = name; return this }
    setContent(content) { this.content = content; return this }
    moveTo(folder) { this.parent = folder; return this }
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

  let createdTriggers = 0
  const context = {
    console,
    Session: { getScriptTimeZone: () => 'Asia/Singapore' },
    SpreadsheetApp: { getActive: () => spreadsheet, newDataValidation: () => ({ requireValueInList() { return this }, setAllowInvalid() { return this }, build() { return {} } }) },
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
      getProjectTriggers: () => [],
      newTrigger: () => ({ forSpreadsheet: () => ({ onFormSubmit: () => ({ create() { createdTriggers += 1; return { getHandlerFunction: () => 'onExpenseFormSubmit' } } }) }) }),
    },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
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

  return { context, event, sheets, files, rootFolder, createdTriggers }
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

test('builds a monthly Markdown report with totals and receipt links', () => {
  const { context } = createHarness()
  const markdown = context.buildExpenseMarkdownReport_([
    { expense_id: 'EXP-20260901-0007', purchase_date: '2026-09-01', member_name: 'Cici', vendor: 'Market', amount: 123.4, category: 'Ingredients', receipt_url: 'https://drive.google.com/receipt-1', status: 'PAID' },
  ], '2026-09', '2026-09-01T12:00:00.000Z')
  assert.match(markdown, /Expense Report — 2026-09/)
  assert.match(markdown, /MOP 123\.40/)
  assert.match(markdown, /EXP-20260901-0007/)
  assert.match(markdown, /https:\/\/drive\.google\.com\/receipt-1/)
})
