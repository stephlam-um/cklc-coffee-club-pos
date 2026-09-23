import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoPosApi } from '../src/lib/demo-pos-api.mjs'

test('demo POS supports a complete staff reward redemption without Supabase', async () => {
  const api = createDemoPosApi()
  const bootstrap = await api.getBootstrap()
  assert.equal(bootstrap.staff[0].name, 'Demo Staff')
  assert.ok(bootstrap.products.some(product => /xxl/i.test(`${product.name} ${product.category}`)))

  const login = await api.login(bootstrap.staff[0].id, '1234')
  const shift = await api.openShift(login.staff.id)
  assert.equal((await api.getStaffRewards()).availableCups, 1)

  const transaction = {
    transactionId: 'demo-reward-1', shiftId: shift.shiftId, staffId: login.staff.id,
    type: 'STAFF_REWARD', total: 0, paymentMethod: '', wasteReason: '',
    items: [{ productId: 'demo-latte', name: 'Latte', temperature: 'ICED', quantity: 1, unitPrice: 0, rmbUnitPrice: null, lineTotal: 0 }],
  }
  assert.deepEqual(await api.createTransaction(transaction), { transactionId: 'demo-reward-1', duplicate: false })
  assert.deepEqual(await api.createTransaction(transaction), { transactionId: 'demo-reward-1', duplicate: true })
  assert.equal((await api.getStaffRewards()).availableCups, 0)

  const dashboard = await api.getTodayOrders()
  assert.equal(dashboard.orders.length, 1)
  assert.equal(dashboard.orders[0].type, 'STAFF_REWARD')
  assert.equal(dashboard.orders[0].total, 0)
  assert.equal(dashboard.orders[0].fulfillmentStatus, 'PENDING')
})

test('demo POS enforces reward balance and XXL exclusion', async () => {
  const api = createDemoPosApi()
  const base = {
    shiftId: 'demo-shift', staffId: 'demo-staff', type: 'STAFF_REWARD', total: 0,
    paymentMethod: '', wasteReason: '',
  }
  await assert.rejects(api.createTransaction({
    ...base, transactionId: 'xxl',
    items: [{ productId: 'demo-xxl', name: 'XXL Latte', quantity: 1, unitPrice: 0, lineTotal: 0 }],
  }), /XXL/)

  const regular = id => ({
    ...base, transactionId: id,
    items: [{ productId: 'demo-latte', name: 'Latte', quantity: 1, unitPrice: 0, lineTotal: 0 }],
  })
  await api.createTransaction(regular('first'))
  await assert.rejects(api.createTransaction(regular('second')), /INSUFFICIENT_REWARDS/)
})
