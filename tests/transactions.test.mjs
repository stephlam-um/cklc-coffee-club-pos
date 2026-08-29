import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTransactionPayload,
  clearPendingTransaction,
  createCheckoutDraft,
  loadPendingTransaction,
  restoreCheckoutDraft,
  savePendingTransaction,
} from '../src/lib/transactions.mjs'

const latte = { id: 'latte', name: 'Latte', category: 'Coffee', price: 18, staffPrice: 9, active: true, sortOrder: 1 }
const cart = [{ product: latte, temperature: 'HOT', quantity: 2 }]

test('normal sale payload contains normal-priced line items and payment method', () => {
  const payload = buildTransactionPayload({ id: 'tx-1', shiftId: 'shift-1', staffId: 's1', mode: 'NORMAL_SALE', cart, paymentMethod: 'MPAY' })
  assert.equal(payload.type, 'NORMAL_SALE')
  assert.equal(payload.total, 36)
  assert.equal(payload.paymentMethod, 'MPAY')
  assert.deepEqual(payload.items, [{ productId: 'latte', name: 'Latte', temperature: 'HOT', quantity: 2, unitPrice: 18, lineTotal: 36 }])
})

test('staff payload uses staff price only', () => {
  const payload = buildTransactionPayload({ id: 'tx-2', shiftId: 'shift-1', staffId: 's1', mode: 'STAFF', cart, paymentMethod: 'WECHAT_PAY' })
  assert.equal(payload.total, 18)
  assert.equal(payload.items[0].unitPrice, 9)
})

test('waste payload has zero total and no payment method', () => {
  const payload = buildTransactionPayload({ id: 'tx-3', shiftId: 'shift-1', staffId: 's1', mode: 'WASTE', cart, wasteReason: 'SPILLED' })
  assert.equal(payload.total, 0)
  assert.equal(payload.paymentMethod, '')
  assert.equal(payload.wasteReason, 'SPILLED')
})

test('checkout draft keeps one transaction ID for retries', () => {
  const draft = createCheckoutDraft({ shiftId: 'shift-1', staffId: 's1', mode: 'NORMAL_SALE', cart, paymentMethod: 'MPAY' })
  assert.match(draft.id, /^tx-/)
  assert.equal(draft.transaction.transactionId, draft.id)
  assert.equal(draft.retry().transactionId, draft.id)
})

test('pending checkout survives reload and stays isolated by staff and shift', () => {
  const storage = new Map()
  storage.setItem = (key, value) => storage.set(key, value)
  storage.getItem = key => storage.get(key) ?? null
  storage.removeItem = key => storage.delete(key)
  const transaction = buildTransactionPayload({ id: 'tx-pending', shiftId: 'shift-1', staffId: 's1', mode: 'NORMAL_SALE', cart, paymentMethod: 'MPAY' })

  savePendingTransaction(storage, transaction)

  assert.deepEqual(loadPendingTransaction(storage, { staffId: 's1', shiftId: 'shift-1' }), transaction)
  assert.equal(loadPendingTransaction(storage, { staffId: 's2', shiftId: 'shift-1' }), null)
  clearPendingTransaction(storage, transaction)
  assert.equal(loadPendingTransaction(storage, { staffId: 's1', shiftId: 'shift-1' }), null)
})

test('restoreCheckoutDraft rebuilds the cart from a pending transaction', () => {
  const transaction = buildTransactionPayload({ id: 'tx-pending', shiftId: 'shift-1', staffId: 's1', mode: 'NORMAL_SALE', cart, paymentMethod: 'MPAY' })
  const restored = restoreCheckoutDraft([latte], transaction)

  assert.equal(restored.mode, 'NORMAL_SALE')
  assert.equal(restored.wasteReason, 'MADE_WRONG')
  assert.deepEqual(restored.cart, cart)
})
