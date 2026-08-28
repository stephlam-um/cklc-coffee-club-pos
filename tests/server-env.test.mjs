import test from 'node:test'
import assert from 'node:assert/strict'
import { readServerEnv } from '../src/lib/server/env.mjs'

test('readServerEnv rejects missing server-only credentials', () => {
  assert.throws(() => readServerEnv({}), /SUPABASE_URL/)
})
