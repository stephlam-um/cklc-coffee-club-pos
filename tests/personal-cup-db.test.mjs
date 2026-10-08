import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { buildTransactionPayload } from '../src/lib/transactions.mjs'
import { validateTransactionInput } from '../src/lib/server/validation.mjs'

test('database stores cup audit fields, rejects forged discounts, and accepts waste', async () => {
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

    const waste = validateTransactionInput(buildTransactionPayload({
      id: 'waste', shiftId: 's', staffId: 'a', mode: 'WASTE', wasteReason: 'SPILLED',
      cart: [{ product: { id: 'latte', name: 'Latte', price: 18, staffPrice: 9 }, temperature: 'ICED', quantity: 1 }],
    }))
    await db.query('select create_transaction($1::jsonb,$2::jsonb)', [
      JSON.stringify({ id: waste.transactionId, shift_id: waste.shiftId, staff_id: waste.staffId, type: waste.type, total: waste.total, payment_method: waste.paymentMethod, waste_reason: waste.wasteReason, payload_fingerprint: 'waste' }),
      JSON.stringify(waste.items.map(line => ({ product_id: line.productId, product_name: line.name, temperature: line.temperature, cup_type: line.cupType, quantity: line.quantity, base_unit_price: line.baseUnitPrice, discount_unit_price: line.discountUnitPrice, campaign_id: line.campaignId, unit_price: line.unitPrice, rmb_unit_price: line.rmbUnitPrice, line_total: line.lineTotal }))),
    ])
    assert.equal((await db.query("select rmb_unit_price from transaction_items where transaction_id='waste'")).rows[0].rmb_unit_price, null)
  } finally { await db.close() }
})
