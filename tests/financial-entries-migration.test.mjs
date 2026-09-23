import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migrationPath = new URL('../supabase/migrations/202609150001_financial_entries.sql', import.meta.url)
const rmbMigrationPath = new URL('../supabase/migrations/202609150002_explicit_rmb_unit_prices.sql', import.meta.url)

test('financial entries migration defines the requested accounting columns', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(sql, /create table if not exists financial_entries/i)
  assert.match(sql, /alter table financial_entries enable row level security/i)
  assert.match(sql, /alter table financial_entries alter column acc_code drop default/i)
  for (const column of ['pay_date date', 'acc_code text', 'description text', 'currency text', 'remarks text']) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(sql, /\bamount numeric\(10,2\)/i)
})

test('financial entries are sourced from completed fulfilled sales and grouped by local date and currency', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(sql, /status\s*=\s*'COMPLETED'/i)
  assert.match(sql, /fulfillment_status\s*=\s*'COMPLETED'/i)
  assert.match(sql, /type\s*<>\s*'WASTE'/i)
  assert.match(sql, /AT TIME ZONE 'Asia\/Macau'/i)
  assert.match(sql, /group by[\s\S]*pay_date[\s\S]*currency/i)
  assert.match(sql, /MPAY[\s\S]*MOP/i)
  assert.match(sql, /WECHAT_PAY[\s\S]*RMB/i)
})

test('financial entries preserve the established RMB correction and refresh on transaction changes', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.match(sql, /unit_price\s*-\s*2/i)
  assert.match(sql, /received by/i)
  assert.match(sql, /create or replace function refresh_financial_entries/i)
  assert.match(sql, /create trigger financial_entries_transactions_refresh/i)
  assert.match(sql, /create trigger financial_entries_items_refresh/i)
})

test('RMB unit prices are snapshotted and used by refreshed financial entries', () => {
  const sql = fs.readFileSync(rmbMigrationPath, 'utf8')
  assert.match(sql, /add column if not exists rmb_unit_price/i)
  assert.match(sql, /set rmb_unit_price\s*=\s*round\(i\.unit_price\s*-\s*2/i)
  assert.match(sql, /rmb_unit_price\s*=\s*round\(unit_price\s*-\s*2/i)
  assert.match(sql, /coalesce\(i\.rmb_unit_price,\s*i\.unit_price\s*-\s*2\)/i)
  assert.match(sql, /insert into transaction_items[\s\S]*rmb_unit_price/i)
})

test('income account codes are generated uniquely in stable report order', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')
  assert.doesNotMatch(sql, /acc_code text not null default '1\.1'/i)
  assert.match(sql, /'1\.'\s*\|\|\s*row_number\(\)\s+over\s*\(\s*order by pay_date, currency\s*\)/i)
})
