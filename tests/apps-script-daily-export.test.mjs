import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const code = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')

function createHarness() {
  const properties = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
  }
  const calls = []
  const sheets = new Map()
  let createdTriggers = 0

  class Sheet {
    constructor(name, rows = []) { this.name = name; this.rows = rows.map(row => [...row]) }
    getLastRow() { return this.rows.length }
    getLastColumn() { return Math.max(1, ...this.rows.map(row => row.length)) }
    getDataRange() { return { getValues: () => this.rows.map(row => [...row]) } }
    getRange(row, column, numRows = 1, numColumns = 1) {
      return {
        setValues: values => {
          for (let r = 0; r < numRows; r++) {
            const target = row - 1 + r
            while (this.rows.length <= target) this.rows.push([])
            for (let c = 0; c < numColumns; c++) this.rows[target][column - 1 + c] = values[r][c]
          }
        },
        clearContent: () => {
          for (let r = 0; r < numRows; r++) {
            const target = row - 1 + r
            if (this.rows[target]) this.rows[target].fill('')
          }
        },
        setValue: value => this.getRange(row, column, 1, 1).setValues([[value]]),
      }
    }
    appendRow(row) { this.rows.push([...row]) }
    setFrozenRows() {}
  }

  const ss = {
    getSheetByName: name => sheets.get(name) || null,
    insertSheet: name => { const sheet = new Sheet(name); sheets.set(name, sheet); return sheet },
  }

  const responses = {
    financialEntries: [
      { pay_date: '2026-08-27', acc_code: '1.1', description: '當日櫃檯銷售收入', currency: 'MOP', amount: 18, remarks: 'MPAY, received by Cici' },
      { pay_date: '2026-08-28', acc_code: '1.2', description: '當日櫃檯銷售收入', currency: 'RMB', amount: 16, remarks: 'WeChat; RMB unit price is MOP unit price minus 2, received by Hani' },
    ],
    shifts: [{ id: 'shift-1', staff_id: 'cici', opened_at: '2026-08-27T01:00:00.000Z', closed_at: '2026-08-27T03:00:00.000Z', mpay_expected: 10, wechat_expected: 8, mpay_actual: 10, wechat_actual: 8, difference: 0, note: '' }, { id: 'shift-2', staff_id: 'hani', opened_at: '2026-08-27T04:00:00.000Z', closed_at: '2026-08-27T06:00:00.000Z', mpay_expected: 12, wechat_expected: 0, mpay_actual: 12, wechat_actual: 0, difference: 0, note: '' }],
    transactions: [{ id: 'tx-1', shift_id: 'shift-1', staff_id: 'cici', type: 'NORMAL_SALE', total: 18, payment_method: 'MPAY', waste_reason: '', fulfillment_status: 'COMPLETED', created_at: '2026-08-27T02:00:00.000Z', transaction_items: [] }, { id: 'tx-2', shift_id: 'shift-2', staff_id: 'hani', type: 'STAFF', total: 9, payment_method: 'WECHAT_PAY', waste_reason: '', fulfillment_status: 'PENDING', created_at: '2026-08-27T05:00:00.000Z', transaction_items: [] }, { id: 'orphan', shift_id: 'shift-open', staff_id: 'hani', type: 'NORMAL_SALE', total: 20, payment_method: 'MPAY', created_at: '2026-08-27T05:30:00.000Z', transaction_items: [] }],
  }

  const context = {
    SpreadsheetApp: { getActive: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties[key] || '' }) },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ url, options })
      const data = url.includes('/rpc/get_financial_entries') ? responses.financialEntries : []
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(data) }
    } },
    Utilities: { formatDate: date => date.toISOString().slice(0, 10), getUuid: () => 'uuid' },
    Session: { getScriptTimeZone: () => 'Asia/Singapore' },
    LockService: { getDocumentLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() { createdTriggers += 1 } }) }) }) }) }) },
    ContentService: { createTextOutput: value => ({ setMimeType: () => value }), MimeType: { JSON: 'application/json' } },
  }
  vm.runInNewContext(code, context)
  sheets.set('Report_Shifts', new Sheet('Report_Shifts', [['shift_id','staff_id','opened_at','closed_at','mpay_expected','wechat_expected','mpay_actual','wechat_actual','difference','note','synced_at'], ['shift-1','old-staff','','',0,0,0,0,0,'old','old']]))
  sheets.set('Report_Transactions', new Sheet('Report_Transactions', [['transaction_id','shift_id','staff_id','type','total','payment_method','waste_reason','fulfillment_status','created_at','items_json','synced_at'], ['tx-1','shift-1','old-staff','NORMAL_SALE',0,'','','PENDING','','[]','old']]))
  sheets.set('Financial_Entries', new Sheet('Financial_Entries', [['Pay Date','Acc Code','Description','Currency','Amount','Remarks'], ['old-date','1.9','Old','MOP',999,'old']]))
  return { context, sheets, calls, getCreatedTriggers: () => createdTriggers }
}

test('daily Supabase export replaces the Financial_Entries sheet with current Supabase rows', () => {
  const { context, sheets, calls } = createHarness()
  const first = context.exportSupabaseReports()
  const second = context.exportSupabaseReports()

  assert.equal(first.entryCount, 2)
  assert.equal(second.entryCount, 2)
  assert.equal(sheets.get('Financial_Entries').rows.length, 3)
  assert.deepEqual(sheets.get('Financial_Entries').rows[1], ['2026-08-27','1.1','當日櫃檯銷售收入','MOP',18,'MPAY, received by Cici'])
  assert.deepEqual(sheets.get('Financial_Entries').rows[2], ['2026-08-28','1.2','當日櫃檯銷售收入','RMB',16,'WeChat; RMB unit price is MOP unit price minus 2, received by Hani'])
  assert.match(calls[0].url, /\/rpc\/get_financial_entries/)
  assert.equal(calls[0].options.method, 'post')
  assert.deepEqual(JSON.parse(calls[0].options.payload), {})
  assert.equal(calls.length, 2)
})

test('setupDailySupabaseExport creates one Singapore trigger at 03:00', () => {
  const { context, getCreatedTriggers } = createHarness()
  const result = context.setupDailySupabaseExport()
  assert.equal(result.handler, 'exportSupabaseReports')
  assert.equal(result.triggerCount, 1)
  assert.equal(result.timezone, 'Asia/Singapore')
  assert.equal(result.hour, 3)
  assert.equal(getCreatedTriggers(), 1)
})
