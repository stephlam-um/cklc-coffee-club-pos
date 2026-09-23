import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncClosedShift } from '../src/lib/server/sheets-sync.mjs'

const migrationPath = new URL('../supabase/migrations/202609160001_reporting_rpc_decouple.sql', import.meta.url)
const retirementPath = new URL('../supabase/migrations/202609160002_retire_legacy_financial_entries.sql', import.meta.url)

test('decoupling migration exposes a read-only financial RPC and removes checkout rebuild triggers', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(sql, /create or replace function get_financial_entries\s*\(/i)
  assert.match(sql, /returns table\s*\([\s\S]*pay_date date[\s\S]*currency text[\s\S]*amount numeric/i)
  assert.match(sql, /language sql/i)
  assert.match(sql, /stable/i)
  assert.match(sql, /drop trigger if exists financial_entries_transactions_refresh on transactions/i)
  assert.match(sql, /drop trigger if exists financial_entries_items_refresh on transaction_items/i)
  assert.match(sql, /where shift_id = p_shift_id[\s\S]*fulfillment_status\s*=\s*'COMPLETED'/i)
  assert.doesNotMatch(sql, /create trigger .*financial_entries/i)
})

test('retirement migration drops only the legacy table and rebuild functions after verification', () => {
  const sql = fs.readFileSync(retirementPath, 'utf8')
  assert.match(sql, /drop function if exists refresh_financial_entries_trigger/i)
  assert.match(sql, /drop function if exists refresh_financial_entries/i)
  assert.match(sql, /drop table if exists financial_entries/i)
  assert.doesNotMatch(sql, /drop table if exists transactions/i)
})

test('manual sheet sync reads financial entries through the RPC and records success', async () => {
  const calls = []
  const shift = { id: 'shift-1', staff_id: 'staff-1', status: 'CLOSED' }
  const supabase = {
    from(table) {
      if (table === 'financial_entries') throw new Error('legacy table must not be queried')
      if (table === 'shifts') return {
        select() { return this },
        eq() { return this },
        single: async () => ({ data: shift, error: null }),
        update(patch) { calls.push(['update', patch]); return { eq: async () => ({ error: null }) } },
      }
      if (table === 'shift_sync_attempts') return { insert: async row => { calls.push(['attempt', row]); return { error: null } } }
      throw new Error('unexpected table ' + table)
    },
    async rpc(name, args) {
      calls.push(['rpc', name, args])
      return { data: [{ pay_date: '2026-09-15', acc_code: '1.1', currency: 'MOP', amount: 18 }], error: null }
    },
  }
  const result = await syncClosedShift(supabase, 'shift-1', {
    config: { sheetsSyncUrl: 'https://sheets.example/sync', sheetsSyncToken: 'token' },
    fetchImpl: async () => ({ ok: true, status: 200 }),
  })
  assert.equal(result.status, 'SYNCED')
  assert.deepEqual(calls.find(call => call[0] === 'rpc'), ['rpc', 'get_financial_entries', {}])
  assert.equal(calls.find(call => call[0] === 'attempt')[1].status, 'SYNCED')
})

test('manual sheet sync records a failed RPC and remains retryable', async () => {
  const calls = []
  const supabase = {
    from(table) {
      if (table === 'shifts') return {
        select() { return this },
        eq() { return this },
        single: async () => ({ data: { id: 'shift-2', status: 'CLOSED' }, error: null }),
        update(patch) { calls.push(['update', patch]); return { eq: async () => ({ error: null }) } },
      }
      if (table === 'shift_sync_attempts') return { insert: async row => { calls.push(['attempt', row]); return { error: null } } }
      throw new Error('unexpected table ' + table)
    },
    async rpc() { return { data: null, error: new Error('reporting temporarily unavailable') } },
  }
  let fetchCalled = false
  const result = await syncClosedShift(supabase, 'shift-2', {
    config: { sheetsSyncUrl: 'https://sheets.example/sync', sheetsSyncToken: 'token' },
    fetchImpl: async () => { fetchCalled = true; return { ok: true, status: 200 } },
  })
  assert.equal(result.status, 'FAILED')
  assert.match(result.error, /reporting temporarily unavailable/)
  assert.equal(fetchCalled, false)
  assert.equal(calls.find(call => call[0] === 'update')[1].sheet_sync_status, 'FAILED')
  assert.equal(calls.find(call => call[0] === 'attempt')[1].status, 'FAILED')
})

test('shift close route has no reporting or Sheets dependency', () => {
  const source = fs.readFileSync(new URL('../src/app/api/shifts/[shiftId]/close/route.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /syncClosedShift/)
  assert.doesNotMatch(source, /sheets-sync/)
})
