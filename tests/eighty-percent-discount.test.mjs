import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { buildTransactionPayload } from '../src/lib/transactions.mjs'
import { validateTransactionInput } from '../src/lib/server/validation.mjs'

test('8折 charges 80% of each currency’s regular price and rejects tampered quotes', () => {
  const ticket = buildTransactionPayload({
    id: 'test', shiftId: 'shift', staffId: 'manager', mode: 'NORMAL_SALE', discount: true,
    paymentMethod: 'WECHAT_PAY', cart: [{ product: { id: 'drink', name: 'Coffee', price: 37 }, quantity: 2 }],
  })
  assert.equal(ticket.total, 59.2)
  assert.equal(ticket.items[0].rmbUnitPrice, 28)
  assert.equal(ticket.items[0].discountUnitPrice, 7.4)
  assert.doesNotThrow(() => validateTransactionInput(ticket))
  assert.throws(() => validateTransactionInput({ ...ticket, items: [{ ...ticket.items[0], rmbUnitPrice: 27.6 }] }), /discount/)
})

test('Supabase validates catalog prices, deduplicates retries and reconciles discounted WeChat in RMB', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    const migrate = async name => {
      const sql = await readFile(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
      await db.exec(sql.replace('create extension if not exists pgcrypto;', ''))
    }
    await migrate('202608260001_initial_pos')
    await migrate('202609150001_financial_entries')
    await migrate('202609150002_explicit_rmb_unit_prices')
    await migrate('202609160001_reporting_rpc_decouple')
    await migrate('202609240001_personal_cup_campaign')
    await migrate('202611230002_eighty_percent_discount')
    await migrate('202611230003_eighty_percent_rmb_constraint')
    await db.exec(`
      insert into staff (id,name,pin_hash,role) values ('m','Manager','hash','MANAGER');
      insert into shifts (id,staff_id) values ('s','m');
      insert into products (id,name,category,price,staff_price) values ('c','Coffee','Coffee',37,27);
    `)
    const sale = { id: 'promo', shift_id: 's', staff_id: 'm', type: 'NORMAL_SALE', payment_method: 'WECHAT_PAY', total: 59.2, payload_fingerprint: 'promo' }
    const item = { product_id: 'c', product_name: 'Coffee', quantity: 2, campaign_id: 'EIGHTY_PERCENT', base_unit_price: 37, discount_unit_price: 7.4, unit_price: 29.6, rmb_unit_price: 28, line_total: 59.2 }
    const record = async line => (await db.query('select create_discounted_transaction($1::jsonb,$2::jsonb) as sale', [JSON.stringify(sale), JSON.stringify([line])])).rows[0].sale
    await assert.rejects(record({ ...item, rmb_unit_price: 27.6 }), /do not match the catalog/)
    assert.equal((await record(item)).duplicate, false)
    assert.equal((await record(item)).duplicate, true)
    await assert.rejects(db.exec("update transaction_items set campaign_id = '' where transaction_id = 'promo'"), /transaction_items_rmb_price_by_campaign/)
    await assert.rejects(db.exec("update transaction_items set rmb_unit_price = 27.60 where transaction_id = 'promo'"), /transaction_items_rmb_price_by_campaign/)
    await db.exec("update transactions set fulfillment_status = 'COMPLETED' where id = 'promo'")
    const { rows } = await db.query("select close_shift_in_payment_currencies('s','m',0,56,'') as shift")
    assert.equal(rows[0].shift.wechatExpected, 56)
    assert.equal(rows[0].shift.difference, 0)
    await db.exec(await readFile(new URL('../supabase/rollback/202611230002_eighty_percent_discount.sql', import.meta.url), 'utf8'))
    const { rows: [fallback] } = await db.query(`
      select to_regprocedure('close_shift(text,text,numeric,numeric,text)') is not null as legacy,
        to_regprocedure('create_discounted_transaction(jsonb,jsonb)') is null as discount_disabled,
        exists (select 1 from transactions where id = 'promo') as sale_preserved
    `)
    assert.deepEqual(fallback, { legacy: true, discount_disabled: true, sale_preserved: true })
  } finally {
    await db.close()
  }
})
