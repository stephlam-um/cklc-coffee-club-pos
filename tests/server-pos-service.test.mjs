import test from 'node:test'
import assert from 'node:assert/strict'
import { idempotencyResult } from '../src/lib/server/pos-service.mjs'

test('idempotencyResult returns duplicate for the same transaction fingerprint', () => {
  assert.deepEqual(idempotencyResult({ id: 'tx-1', payload_fingerprint: 'abc' }, 'abc'), {
    transactionId: 'tx-1', duplicate: true,
  })
})

test('idempotencyResult rejects a conflicting transaction fingerprint', () => {
  assert.throws(() => idempotencyResult({ id: 'tx-1', payload_fingerprint: 'abc' }, 'xyz'), /CONFLICTING_TRANSACTION/)
})
