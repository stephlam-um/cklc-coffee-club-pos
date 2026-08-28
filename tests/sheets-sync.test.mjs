import test from 'node:test'
import assert from 'node:assert/strict'
import { buildShiftSyncPayload } from '../src/lib/server/sheets-sync.mjs'

test('buildShiftSyncPayload preserves stable shift and transaction identifiers', () => {
  const payload = buildShiftSyncPayload({ id: 'shift-1', status: 'CLOSED' }, [{ id: 'tx-1', total: 18 }])
  assert.deepEqual(payload, { shift: { id: 'shift-1', status: 'CLOSED' }, transactions: [{ id: 'tx-1', total: 18 }] })
})

test('buildShiftSyncPayload is deterministic for retries', () => {
  const input = { id: 'shift-1', status: 'CLOSED' }
  assert.equal(JSON.stringify(buildShiftSyncPayload(input, [{ id: 'tx-1', total: 18 }])), JSON.stringify(buildShiftSyncPayload(input, [{ id: 'tx-1', total: 18 }])))
})
