import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('database stores cup audit fields and rejects forged campaign discounts', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()) {
      const sql = await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
      await db.exec(sql.replace('create extension if not exists pgcrypto;', ''))
    }
    await db.exec(`insert into staff(id,name,pin_hash) values ('a','A','hash'); insert into shifts(id,staff_id) values ('s','a'); insert into products(id,name,category,price,staff_price) values ('latte','Latte','Coffee',18,9);`)
    const transaction = { id: 'cup', shift_id: 's', staff_id: 'a', type: 'NORMAL_SALE', total: 15, payment_method: 'MPAY', payload_fingerprint: 'cup' }
    const item = { product_id: 'latte', product_name: 'Latte', temperature: 'ICED', cup_type: 'PERSONAL_CUP', quantity: 1, base_unit_price: 18, discount_unit_price: 3, campaign_id: 'PERSONAL_CUP_2026', unit_price: 15, rmb_unit_price: 13, line_total: 15 }
    const result = await db.query('select create_transaction($1::jsonb,$2::jsonb) as result', [JSON.stringify(transaction), JSON.stringify([item])])
    assert.equal(result.rows[0].result.duplicate, false)
    const stored = (await db.query("select cup_type,base_unit_price,discount_unit_price,campaign_id from transaction_items where transaction_id='cup'")).rows[0]
    assert.deepEqual({ ...stored, base_unit_price: Number(stored.base_unit_price), discount_unit_price: Number(stored.discount_unit_price) }, { cup_type: 'PERSONAL_CUP', base_unit_price: 18, discount_unit_price: 3, campaign_id: 'PERSONAL_CUP_2026' })

    await assert.rejects(db.query('select create_transaction($1::jsonb,$2::jsonb)', [JSON.stringify({ ...transaction, id: 'forged', payload_fingerprint: 'forged', total: 14 }), JSON.stringify([{ ...item, discount_unit_price: 4, unit_price: 14, rmb_unit_price: 12, line_total: 14 }])]), /personal cup/i)
  } finally { await db.close() }
})
