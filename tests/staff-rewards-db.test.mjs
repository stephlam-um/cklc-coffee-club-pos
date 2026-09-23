import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('database enforces earned cups, personal balances, XXL exclusion and idempotent redemption', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    const initial = await readFile(new URL('../supabase/migrations/202608260001_initial_pos.sql', import.meta.url), 'utf8')
    await db.exec(initial.replace('create extension if not exists pgcrypto;', ''))
    for (const name of (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()) {
      if (name > '202608260001_initial_pos.sql' && name < '202609220001_staff_rewards.sql') {
        await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'))
      }
    }
    // The reward migration must run on the existing schema, including legacy paid items.
    await db.exec(`insert into staff(id,name,pin_hash) values ('a','A','hash'),('b','B','hash');
      insert into shifts(id,staff_id) values ('sa','a'),('sb','b');
      insert into products(id,name,category,price,staff_price) values ('latte','Latte','Coffee',20,10),('xxl','Large Latte','XXL Series',30,20);`)
    const create = async (id, type, quantity, staff = 'a', product = 'latte', extra = {}) => db.query(
      'select create_transaction($1::jsonb,$2::jsonb) as result',
      [JSON.stringify({ id, shift_id: `s${staff}`, staff_id: staff, type, total: type === 'NORMAL_SALE' ? 20 * quantity : 0, payment_method: type === 'NORMAL_SALE' ? 'MPAY' : '', payload_fingerprint: id, ...extra }),
        JSON.stringify([{ product_id: product, product_name: 'Spoofed ordinary drink', quantity, unit_price: type === 'NORMAL_SALE' ? 20 : 0, rmb_unit_price: type === 'NORMAL_SALE' ? 18 : null, line_total: type === 'NORMAL_SALE' ? 20 * quantity : 0 }])])
    await create('legacy', 'NORMAL_SALE', 5)
    await db.exec("update transactions set fulfillment_status='COMPLETED' where id='legacy'")
    const migration = await readFile(new URL('../supabase/migrations/202609220001_staff_rewards.sql', import.meta.url), 'utf8').catch(() => '')
    assert.ok(migration, 'staff rewards migration must exist')
    await db.exec(migration)
    const balance = async (staff = 'a') => (await db.query('select get_staff_rewards($1) as result', [staff])).rows[0].result
    assert.deepEqual(await balance(), { soldCups: 5, redeemedCups: 0, availableCups: 0, cupsToNext: 1 })
    await assert.rejects(create('early', 'STAFF_REWARD', 1), /INSUFFICIENT_REWARDS/)
    await create('sixth', 'NORMAL_SALE', 1, 'a', 'xxl')
    assert.equal((await balance()).availableCups, 0, 'pending sales do not earn rewards')
    await db.exec("update transactions set fulfillment_status='COMPLETED' where id='sixth'")
    assert.equal((await balance()).availableCups, 1)
    await assert.rejects(create('xxl-reward', 'STAFF_REWARD', 1, 'a', 'xxl'), /XXL/)
    await assert.rejects(create('other-staff', 'STAFF_REWARD', 1, 'b'), /INSUFFICIENT_REWARDS/)
    await create('reward', 'STAFF_REWARD', 1)
    assert.equal((await db.query("select product_name from transaction_items where transaction_id='reward'")).rows[0].product_name, 'Latte')
    assert.equal((await balance()).availableCups, 0)
    assert.equal((await create('reward', 'STAFF_REWARD', 1)).rows[0].result.duplicate, true)
    await assert.rejects(create('overdraw', 'STAFF_REWARD', 1), /INSUFFICIENT_REWARDS/)
    await db.exec("update transactions set fulfillment_status='COMPLETED' where id='reward'; update transactions set fulfillment_status='PENDING' where id='reward'")
    assert.equal((await balance()).redeemedCups, 1, 'status toggles never refund or earn free drinks')
    await db.exec("delete from transactions where id='reward'")
    assert.equal((await balance()).availableCups, 1, 'deleted pending reward returns the entitlement')
    await db.exec("update shifts set status='CLOSED' where id='sa'; insert into shifts(id,staff_id) values ('sa2','a')")
    await create('next-shift', 'STAFF_REWARD', 1, 'a', 'latte', { shift_id: 'sa2' })
    assert.equal((await balance()).redeemedCups, 1)
    await db.exec("update transactions set fulfillment_status='PENDING' where id='sixth'")
    assert.equal((await balance()).availableCups, 0)
    assert.equal((await balance()).cupsToNext, 7, 'reversed sales must be re-earned before another reward')
    await db.exec(`insert into transactions(id,shift_id,staff_id,type,total,payment_method,waste_reason,payload_fingerprint,fulfillment_status)
      values ('discount','sa2','a','STAFF',60,'MPAY','','discount','COMPLETED'),
        ('waste','sa2','a','WASTE',0,'','SPILLED','waste','COMPLETED');
      insert into transaction_items(transaction_id,product_id,product_name,quantity,unit_price,rmb_unit_price,line_total)
      values ('discount','latte','Latte',6,10,8,60),('waste','latte','Latte',6,0,null,0);`)
    assert.equal((await balance()).soldCups, 5, 'staff-price and waste cups never earn rewards')
    await db.exec("update transactions set fulfillment_status='COMPLETED' where id='next-shift'")
    const income = await db.query('select * from get_financial_entries()')
    assert.equal(income.rows.length, 1)
    assert.equal(Number(income.rows[0].amount), 160, 'free drinks never add financial income')
    await assert.rejects(create('bad-qty', 'STAFF_REWARD', 1.5, 'a', 'latte', { shift_id: 'sa2' }), /positive whole quantities/)
  } finally { await db.close() }
})
