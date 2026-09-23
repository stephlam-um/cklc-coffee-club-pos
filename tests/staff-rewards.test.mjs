import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTransactionPayload } from '../src/lib/transactions.mjs'
import { validateTransactionInput } from '../src/lib/server/validation.mjs'

const product = { id: 'latte', name: 'Latte', category: 'Coffee', price: 20, staffPrice: 10 }
const draft = (p = product) => ({ id: 'reward-1', shiftId: 'shift-1', staffId: 'staff-1', mode: 'STAFF_REWARD', cart: [{ product: p, quantity: 1, temperature: 'ICED' }] })

test('free drink builds a zero-price ticket without a payment and passes server validation', () => {
  const tx = buildTransactionPayload(draft())
  assert.equal(tx.total, 0)
  assert.equal(tx.paymentMethod, '')
  assert.equal(tx.items[0].unitPrice, 0)
  assert.equal(tx.items[0].rmbUnitPrice, null)
  assert.equal(validateTransactionInput(tx).type, 'STAFF_REWARD')
})

test('XXL in either the product name or series cannot be redeemed', () => {
  for (const p of [{ ...product, name: 'XXL Latte' }, { ...product, category: 'xxl Series' }]) {
    assert.throws(() => buildTransactionPayload(draft(p)), /XXL/)
  }
})

test('server rejects a charged reward or a reward disguised as a payment', () => {
  const tx = { transactionId: 'r', shiftId: 's', staffId: 'u', type: 'STAFF_REWARD', total: 0, items: [{ productId: 'latte', name: 'Latte', quantity: 1, unitPrice: 0, rmbUnitPrice: null }] }
  assert.doesNotThrow(() => validateTransactionInput(tx))
  assert.throws(() => validateTransactionInput({ ...tx, paymentMethod: 'MPAY' }), /Reward/)
  assert.throws(() => validateTransactionInput({ ...tx, items: [{ ...tx.items[0], unitPrice: 2 }] }), /Reward/)
})
