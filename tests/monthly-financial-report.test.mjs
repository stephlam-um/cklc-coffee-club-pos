import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

function load(extra = {}) {
  const path = new URL('../apps-script/financial-reports.gs', import.meta.url)
  const context = vm.createContext({ Date, ...extra })
  vm.runInContext(fs.existsSync(path) ? fs.readFileSync(path, 'utf8') : '', context)
  return context
}
const plain = value => JSON.parse(JSON.stringify(value))
const order = (overrides = {}) => ({
  id: 'tx-1', status: 'COMPLETED', fulfillment_status: 'COMPLETED', type: 'NORMAL_SALE',
  payment_method: 'WECHAT_PAY', created_at: '2026-08-31T16:00:00Z', total: 70,
  staff_id: 'sam', transaction_items: [{ unit_price: '20.00', quantity: 2 }, { unit_price: '30.00', quantity: 1 }],
  ...overrides,
})

test('staff reward drinks are excluded from financial reports without blocking report generation', () => {
  const report = load().buildMonthlyFinancialReport_([
    order(), order({ id: 'reward', type: 'STAFF_REWARD', total: 0, payment_method: '', transaction_items: [{ unit_price: 0, rmb_unit_price: null, quantity: 1 }] }),
  ], [], '2026-09')
  assert.equal(report.completedOrders, 1)
  assert.equal(report.totals.RMB.income, 64)
  assert.equal(report.audit.length, 1)
})

test('RMB correction subtracts two per unit, preserving original amounts and daily currency rows', () => {
  const c = load()
  assert.equal(typeof c.buildMonthlyFinancialReport_, 'function')
  const tx = order()
  const before = JSON.stringify(tx)
  const report = c.buildMonthlyFinancialReport_([tx, order({ id: 'tx-2', payment_method: 'MPAY' })], [], '2026-09')
  assert.deepEqual(plain(report.totals), { MOP: { income: 70, expenses: 0, net: 70 }, RMB: { income: 64, expenses: 0, net: 64 } })
  assert.equal(report.audit[0].originalTotal, 70)
  assert.equal(report.audit[0].correctedTotal, 64)
  assert.equal(report.income.length, 2)
  assert.equal(report.income[0].date, '2026-09-01')
  assert.equal(JSON.stringify(tx), before)
})

test('month boundaries use Macau time and pending, waste and cancelled rows never count', () => {
  const c = load()
  assert.equal(typeof c.buildMonthlyFinancialReport_, 'function')
  const report = c.buildMonthlyFinancialReport_([
    order({ id: 'before', created_at: '2026-08-31T15:59:59Z' }), order(),
    order({ id: 'end', created_at: '2026-09-30T15:59:59Z' }),
    order({ id: 'after', created_at: '2026-09-30T16:00:00Z' }),
    order({ id: 'pending', fulfillment_status: 'PENDING' }),
    order({ id: 'cancelled', status: 'CANCELLED' }), order({ id: 'waste', type: 'WASTE' }),
  ], [], '2026-09')
  assert.equal(report.completedOrders, 2)
  assert.equal(report.totals.RMB.income, 128)
  assert.deepEqual(plain(c.financialMonthBounds_('2026-12')), { start: '2026-12-01T00:00:00+08:00', end: '2027-01-01T00:00:00+08:00' })
  assert.throws(() => c.financialMonthBounds_('2026-13'), /month/i)
})

test('ambiguous prices, unsupported payments and conflicting IDs block reports rather than understate income', () => {
  const c = load()
  assert.equal(typeof c.buildMonthlyFinancialReport_, 'function')
  for (const tx of [order({ transaction_items: [] }), order({ transaction_items: [{ unit_price: '', quantity: 2 }] }),
    order({ transaction_items: [{ unit_price: 1, quantity: 1 }] }), order({ payment_method: 'CASH' }),
    order({ created_at: 'bad' }), order({ total: '' })]) {
    assert.throws(() => c.buildMonthlyFinancialReport_([tx], [], '2026-09'))
  }
  assert.throws(() => c.buildMonthlyFinancialReport_([order(), order({ total: 90 })], [], '2026-09'), /duplicate/i)
  assert.equal(c.buildMonthlyFinancialReport_([order(), order()], [], '2026-09').completedOrders, 1)
})

test('staff prices use recorded prices and daily aggregation retains cent precision', () => {
  const c = load()
  assert.equal(typeof c.buildMonthlyFinancialReport_, 'function')
  const report = c.buildMonthlyFinancialReport_([
    order({ type: 'STAFF', total: 10.1, transaction_items: [{ unit_price: 10.1, quantity: 1 }] }),
    order({ id: 'tx-2', type: 'STAFF', total: 10.2, transaction_items: [{ unit_price: 10.2, quantity: 1 }] }),
  ], [], '2026-09')
  assert.equal(report.totals.RMB.income, 16.3)
  assert.equal(report.income.length, 1)
  assert.equal(report.income[0].amount, 16.3)
})

test('paid expenses use payment date, negative amounts, separate currencies and tracked unpaid claims', () => {
  const c = load()
  assert.equal(typeof c.buildMonthlyFinancialReport_, 'function')
  const expense = { expense_id: 'ex-1', status: 'PAID', purchase_date: '2026-08-20', paid_at: '2026-09-03', amount: 15.5, vendor: 'Shop', description: 'Milk', receipt_url: 'receipt', paid_by: 'Sam', payment_reference: 'PO1' }
  const report = c.buildMonthlyFinancialReport_([], [expense,
    { ...expense, expense_id: 'ex-2', currency: 'RMB', amount: 10 },
    { ...expense, expense_id: 'outside', paid_at: '2026-10-01' },
    { ...expense, expense_id: 'unpaid', status: 'APPROVED', paid_at: '', purchase_date: '2026-09-04' },
  ], '2026-09')
  assert.equal(report.expenses.length, 2)
  assert.equal(report.expenses[0].amount, -15.5)
  assert.equal(report.totals.MOP.net, -15.5)
  assert.equal(report.totals.RMB.net, -10)
  assert.equal(report.unpaidExpenses.length, 1)
  assert.throws(() => c.buildMonthlyFinancialReport_([], [{ ...expense, paid_at: '' }], '2026-09'), /payment date/i)
  assert.throws(() => c.buildMonthlyFinancialReport_([], [{ ...expense, currency: 'USD' }], '2026-09'), /currency/i)
})

test('report layout follows the required income and expense columns with currency-specific formulas', () => {
  const c = load()
  assert.equal(typeof c.financialReportLayout_, 'function')
  const report = c.buildMonthlyFinancialReport_([order()], [], '2026-09')
  const layout = c.financialReportLayout_(report)
  assert.deepEqual(plain(layout.values[7].slice(0, 6)), ['Pay Date', 'Acc Code', 'Description', 'Currency', 'Amount', 'Remarks'])
  assert.equal(layout.values[8][3], 'RMB')
  assert.equal(layout.values[8][4], 64)
  assert.deepEqual(plain(layout.values[layout.expenseHeader - 1]), ['Pay Date', 'Acc Code', 'Description', 'Currency', 'Amount', 'Reference No.', 'Paid/Received By', 'Issue Date', 'Remarks'])
  assert.match(layout.values[4][0], /SUMIF\(D9:D9,"MOP",E9:E9\)/)
  assert.match(layout.values[4][3], /SUMIF\(D9:D9,"RMB",E9:E9\)/)
})

test('final export requires reviewed reconciliation and completed month, not merely a generated draft', () => {
  const c = load()
  assert.equal(typeof c.financialAssertReady_, 'function')
  const review = [['Month', '2026-09'], ['MPay checked', true], ['WeChat checked', false], ['Expenses checked', true], ['Approved by', 'Sam'], ['Reconciliation notes', '']]
  assert.throws(() => c.financialAssertReady_(review, '2026-10-02'), /WeChat/)
  review[2][1] = true
  assert.throws(() => c.financialAssertReady_(review, '2026-09-15'), /month/i)
  assert.doesNotThrow(() => c.financialAssertReady_(review, '2026-10-02'))
  review[4][1] = ''
  assert.throws(() => c.financialAssertReady_(review, '2026-10-02'), /Approved by/)
})

test('invalid calendar dates do not silently move financial records to another day', () => {
  const c = load()
  assert.throws(() => c.financialDate_('2026-02-30'), /date/i)
})

test('external spreadsheet text is escaped while generated summary formulas remain formulas', () => {
  const c = load()
  const report = c.buildMonthlyFinancialReport_([], [{ expense_id: 'ex', status: 'PAID', paid_at: '2026-09-02', purchase_date: '2026-09-01', amount: 10, description: '=IMPORTXML("https://example.com", "//a")', payment_reference: '+123', receipt_url: 'receipt' }], '2026-09')
  const layout = c.financialReportLayout_(report)
  assert.equal(layout.values[layout.expenseStart - 1][2], '\'=IMPORTXML("https://example.com", "//a")')
  assert.ok(layout.values[4][0].startsWith('=SUMIF'))
})

function spreadsheetHarness() {
  let id = 0
  const books = new Map()
  class Sheet {
    constructor(name, book) { this.name = name; this.book = book; this.id = ++id; this.cells = []; this.hidden = false }
    getName() { return this.name }
    getSheetId() { return this.id }
    getMaxRows() { return 1000 }
    setName(name) { this.name = name; return this }
    copyTo(book) { const sheet = book.insertSheet(this.name); sheet.cells = this.cells.map(row => [...row]); return sheet }
    clear() { this.cells = []; return this }
    getDataRange() { return this.getRange(1, 1, Math.max(1, this.cells.length), 9) }
    getRange(row, col, height = 1, width = 1) {
      if (typeof row === 'string') {
        const m = row.match(/^([A-Z])(\d+):([A-Z])(\d+)$/)
        if (!m) throw new Error('Unsupported test range ' + row)
        row = +m[2]; col = m[1].charCodeAt(0) - 64; height = +m[4] - row + 1; width = m[3].charCodeAt(0) - 64 - col + 1
      }
      const range = {
        getValues: () => Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, c) => this.cells[row - 1 + r]?.[col - 1 + c] ?? '')),
        getValue: () => this.cells[row - 1]?.[col - 1] ?? '',
        setValues: values => { values.forEach((valuesRow, r) => { this.cells[row - 1 + r] ||= []; valuesRow.forEach((v, c) => { this.cells[row - 1 + r][col - 1 + c] = v }) }); return range },
      }
      for (const method of ['breakApart', 'merge', 'setFontSize', 'setFontColor', 'setVerticalAlignment', 'setWrap', 'setBackground', 'setFontWeight', 'setNumberFormat', 'insertCheckboxes']) range[method] = () => range
      return range
    }
    hideSheet() { this.hidden = true }
    setFrozenRows() {}
    setHiddenGridlines() {}
    setColumnWidth() {}
    autoResizeColumns() {}
    autoResizeRows() {}
  }
  class Book {
    constructor(bookId) { this.id = bookId; this.sheets = []; books.set(bookId, this) }
    getId() { return this.id }
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id + '/edit' }
    insertSheet(name) { const sheet = new Sheet(name, this); this.sheets.push(sheet); return sheet }
    getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) }
    getSheets() { return this.sheets }
    deleteSheet(sheet) { this.sheets = this.sheets.filter(candidate => candidate !== sheet) }
    setSpreadsheetTimeZone() {}
  }
  const source = new Book('source')
  source.insertSheet('Expenses_Tracker').cells = [['expense_id', 'status', 'purchase_date', 'amount', 'paid_at']]
  const template = new Book('template')
  template.insertSheet('AUG').cells = [['Old template title'], ['Old financial data']]
  const props = new Map(Object.entries({ SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only', FINANCIAL_TEMPLATE_ID: 'template', FINANCIAL_REPORT_FOLDER_ID: 'folder' }))
  const requests = []
  let transactions = [order()]
  let financialEntries = [{ pay_date: '2026-09-01', acc_code: '1.1', description: '當日櫃檯銷售收入', currency: 'RMB', amount: 64, remarks: 'WeChat; RMB unit price is MOP unit price minus 2, received by Sam' }]
  const rpcCalls = []
  let locks = 0
  const c = load({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key), setProperty: (key, value) => props.set(key, value) }) },
    LockService: { getScriptLock: () => ({ waitLock: () => { locks++ }, releaseLock: () => { locks-- } }) },
    SpreadsheetApp: { getActive: () => source, openById: id => { if (!books.has(id)) throw new Error('Unknown workbook'); return books.get(id) }, create: () => { const book = new Book('draft-' + ++id); book.insertSheet('Sheet1'); return book }, flush: () => {} },
    DriveApp: { getFileById: () => ({ moveTo: () => {} }), getFolderById: () => ({}) },
    fetchSupabaseRows_: (url, key, resource) => { requests.push(resource); return resource.startsWith('staff?') ? [{ id: 'sam', name: 'Sam' }] : transactions },
    fetchSupabaseRpcRows_: (url, key, functionName, parameters) => { rpcCalls.push({ url, key, functionName, parameters }); return financialEntries },
  })
  return { c, source, template, props, books, requests, rpcCalls, setTransactions: value => { transactions = value; financialEntries = value.length ? financialEntries : [] }, get locks() { return locks } }
}

test('monthly generator queries fresh bounded data, refreshes one draft, resets approval and leaves originals untouched', () => {
  const h = spreadsheetHarness()
  const original = JSON.stringify(h.template.getSheetByName('AUG').cells)
  const first = h.c.generateMonthlyFinancialReport('2026-09')
  assert.equal(first.totals.RMB.income, 64)
  assert.deepEqual(plain(h.rpcCalls[0]), { url: 'https://db.example', key: 'test-only', functionName: 'get_financial_entries', parameters: { p_start_date: '2026-09-01', p_end_date: '2026-10-01' } })
  const query = new URL('https://db.example/' + h.requests[0]).searchParams
  assert.equal(query.get('fulfillment_status'), 'eq.COMPLETED')
  assert.equal(query.getAll('created_at')[0], 'gte.2026-09-01T00:00:00+08:00')
  assert.equal(query.getAll('created_at')[1], 'lt.2026-10-01T00:00:00+08:00')
  const draft = h.books.get(h.props.get('FINANCIAL_DRAFT_2026-09'))
  assert.ok(draft.getSheetByName('2026-09').cells[8][0] instanceof Date, 'financial dates must be typed spreadsheet dates')
  draft.getSheetByName('Review').cells[1][1] = true
  h.setTransactions([])
  const refreshed = h.c.generateMonthlyFinancialReport('2026-09')
  assert.equal(refreshed.url, first.url)
  assert.equal(refreshed.totals.RMB.income, 0)
  assert.equal(draft.getSheets().filter(sheet => sheet.name === '2026-09').length, 1)
  assert.equal(draft.getSheetByName('Review').cells[1][1], false)
  assert.equal(draft.getSheetByName('Calculation_Audit').cells.length, 1)
  assert.equal(JSON.stringify(h.template.getSheetByName('AUG').cells), original)
  assert.equal(h.locks, 0)
})

test('income-only drafts remain explicit when the expense tracker is absent', () => {
  const h = spreadsheetHarness()
  h.source.sheets = []
  const draft = h.c.generateMonthlyFinancialReport('2026-09')
  assert.equal(draft.status, 'DRAFT')
  assert.equal(draft.totals.MOP.expenses, 0)
  const book = h.books.get(h.props.get('FINANCIAL_DRAFT_2026-09'))
  const review = book.getSheetByName('Review').cells
  assert.equal(review[4][1], 'NOT CONFIGURED — income-only draft')
  assert.match(book.getSheetByName('2026-09').cells[4][6], /Expenses not included/)
})
