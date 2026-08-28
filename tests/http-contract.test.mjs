import test from 'node:test'
import assert from 'node:assert/strict'
import { errorResponse, successResponse } from '../src/lib/server/http.mjs'

test('successResponse uses the shared API envelope', async () => {
  const response = successResponse({ transactionId: 'tx-1', duplicate: false })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, data: { transactionId: 'tx-1', duplicate: false } })
})

test('errorResponse uses a stable code and status', async () => {
  const response = errorResponse('Unauthorized', 'UNAUTHORIZED', 401)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, code: 'UNAUTHORIZED', error: 'Unauthorized' })
})
