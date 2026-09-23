import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('close shift totals count only completed fulfillment orders', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/202609080001_completed_only_totals.sql', import.meta.url), 'utf8')
  assert.match(sql, /from transactions where shift_id = p_shift_id and status = 'COMPLETED' and fulfillment_status = 'COMPLETED'/)
})
