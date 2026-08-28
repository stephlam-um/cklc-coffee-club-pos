import test from 'node:test'
import assert from 'node:assert/strict'
import { hashPin, verifyPin } from '../src/lib/server/hash.mjs'

test('hashPin verifies the original PIN and rejects another PIN', async () => {
  const encoded = await hashPin('1234')
  assert.equal(await verifyPin('1234', encoded), true)
  assert.equal(await verifyPin('9999', encoded), false)
})
