import test from 'node:test'
import assert from 'node:assert/strict'
import { createSessionToken, readSessionToken } from '../src/lib/server/session.mjs'

test('session token round-trips staff identity', () => {
  const token = createSessionToken({ id: 'staff-1', role: 'STAFF' }, 'a'.repeat(32), 1_700_000_000_000)
  assert.deepEqual(readSessionToken(token, 'a'.repeat(32), 1_700_000_001_000), { id: 'staff-1', role: 'STAFF' })
})

test('expired or tampered session token is rejected', () => {
  const secret = 'b'.repeat(32)
  const token = createSessionToken({ id: 'staff-1', role: 'STAFF' }, secret, 1_700_000_000_000, 60)
  assert.equal(readSessionToken(token, secret, 1_700_000_061_000), null)
  assert.equal(readSessionToken(`${token}x`, secret, 1_700_000_001_000), null)
})
