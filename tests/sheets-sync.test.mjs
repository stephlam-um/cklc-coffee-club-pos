import test from 'node:test'
import assert from 'node:assert/strict'
import { buildShiftSyncPayload, filterCompletedTransactions } from '../src/lib/server/sheets-sync.mjs'

test('buildShiftSyncPayload carries financial entries only', () => {
  const payload = buildShiftSyncPayload({ id: 'shift-1', status: 'CLOSED' }, [{ pay_date: '2026-09-15', acc_code: '1.1', amount: 18 }])
  assert.deepEqual(payload, { shift: { id: 'shift-1', status: 'CLOSED' }, financialEntries: [{ pay_date: '2026-09-15', acc_code: '1.1', amount: 18 }] })
})

test('buildShiftSyncPayload is deterministic for retries', () => {
  const input = { id: 'shift-1', status: 'CLOSED' }
  assert.equal(JSON.stringify(buildShiftSyncPayload(input, [{ pay_date: '2026-09-15', acc_code: '1.1', amount: 18 }])), JSON.stringify(buildShiftSyncPayload(input, [{ pay_date: '2026-09-15', acc_code: '1.1', amount: 18 }])))
})

test('filterCompletedTransactions excludes pending fulfillment orders from reports', () => {
  assert.deepEqual(filterCompletedTransactions([
    { id: 'tx-complete', status: 'COMPLETED', fulfillment_status: 'COMPLETED' },
    { id: 'tx-pending', status: 'COMPLETED', fulfillment_status: 'PENDING' },
    { id: 'tx-legacy', status: 'COMPLETED' },
  ]), [{ id: 'tx-complete', status: 'COMPLETED', fulfillment_status: 'COMPLETED' }])
})
