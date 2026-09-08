import test from 'node:test'
import assert from 'node:assert/strict'
import { idempotencyResult } from '../src/lib/server/pos-service.mjs'
import { assertManager, deletePendingOrder } from '../src/lib/server/pos-data.mjs'

test('idempotencyResult returns duplicate for the same transaction fingerprint', () => {
  assert.deepEqual(idempotencyResult({ id: 'tx-1', payload_fingerprint: 'abc' }, 'abc'), {
    transactionId: 'tx-1', duplicate: true,
  })
})

test('idempotencyResult rejects a conflicting transaction fingerprint', () => {
  assert.throws(() => idempotencyResult({ id: 'tx-1', payload_fingerprint: 'abc' }, 'xyz'), /CONFLICTING_TRANSACTION/)
})

test('assertManager rejects staff members from permanently deleting orders', () => {
  assert.throws(() => assertManager({ id: 'staff-1', role: 'STAFF' }), /Manager access required/)
  assert.doesNotThrow(() => assertManager({ id: 'manager-1', role: 'MANAGER' }))
})

test('deletePendingOrder deletes only an order that is still pending', async () => {
  const calls = []
  const supabase = {
    from(table) {
      assert.equal(table, 'transactions')
      return {
        delete() { calls.push('delete'); return this },
        eq(column, value) { calls.push([column, value]); return this },
        select() { return { maybeSingle: async () => ({ data: { id: 'tx-1' }, error: null }) } },
      }
    },
  }

  assert.deepEqual(await deletePendingOrder(supabase, 'tx-1'), { transactionId: 'tx-1' })
  assert.deepEqual(calls, ['delete', ['id', 'tx-1'], ['fulfillment_status', 'PENDING']])
})
