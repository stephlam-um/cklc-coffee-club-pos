import test from 'node:test'
import assert from 'node:assert/strict'
import { addProduct, calculateCartTotal, changeQuantity, getUnitPrice } from '../src/lib/domain.mjs'

const latte = { id: 'latte', name: 'Latte', category: 'Coffee', price: 18, staffPrice: 9, active: true, sortOrder: 1 }
const americano = { id: 'americano', name: 'Americano', category: 'Coffee', price: 12, staffPrice: 5, active: true, sortOrder: 2 }

test('NORMAL_SALE uses the normal product price', () => {
  assert.equal(getUnitPrice(latte, 'NORMAL_SALE'), 18)
})

test('STAFF uses the staff product price', () => {
  assert.equal(getUnitPrice(latte, 'STAFF'), 9)
})

test('cart total supports multiple products and quantities', () => {
  const cart = [{ product: latte, quantity: 2 }, { product: americano, quantity: 1 }]
  assert.equal(calculateCartTotal(cart, 'NORMAL_SALE'), 48)
  assert.equal(calculateCartTotal(cart, 'STAFF'), 23)
})

test('cart keeps hot and iced versions of the same drink separate', () => {
  const hot = addProduct([], latte, 'HOT')
  const split = addProduct(hot, latte, 'ICED')
  const incremented = addProduct(split, latte, 'HOT')

  assert.deepEqual(incremented.map(line => ({ temperature: line.temperature, quantity: line.quantity })), [
    { temperature: 'HOT', quantity: 2 },
    { temperature: 'ICED', quantity: 1 },
  ])
  assert.equal(changeQuantity(incremented, 'latte', 'HOT', -1)[0].quantity, 1)
})
