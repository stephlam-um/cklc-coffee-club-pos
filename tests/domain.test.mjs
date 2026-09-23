import test from 'node:test'
import assert from 'node:assert/strict'
import { addProduct, calculateCartTotal, changeQuantity, getRmbUnitPrice, getUnitPrice, isPersonalCupCampaignActive } from '../src/lib/domain.mjs'

const latte = { id: 'latte', name: 'Latte', category: 'Coffee', price: 18, staffPrice: 9, active: true, sortOrder: 1 }
const americano = { id: 'americano', name: 'Americano', category: 'Coffee', price: 12, staffPrice: 5, active: true, sortOrder: 2 }

test('NORMAL_SALE uses the normal product price', () => {
  assert.equal(getUnitPrice(latte, 'NORMAL_SALE'), 18)
})

test('STAFF uses the staff product price', () => {
  assert.equal(getUnitPrice(latte, 'STAFF'), 9)
})

test('RMB unit prices are exactly two below the recorded MOP price', () => {
  assert.equal(getRmbUnitPrice(18), 16)
  assert.equal(getRmbUnitPrice(9), 7)
  assert.equal(getRmbUnitPrice(18.75), 16.75)
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

test('personal-cup campaign follows Macau dates September 24 and 25', () => {
  assert.equal(isPersonalCupCampaignActive(new Date('2026-09-23T15:59:59Z')), false)
  assert.equal(isPersonalCupCampaignActive(new Date('2026-09-23T16:00:00Z')), true)
  assert.equal(isPersonalCupCampaignActive(new Date('2026-09-25T15:59:59Z')), true)
  assert.equal(isPersonalCupCampaignActive(new Date('2026-09-25T16:00:00Z')), false)
})

test('personal cup takes three dollars off each regular-sale drink during the campaign', () => {
  const during = new Date('2026-09-24T04:00:00Z')
  assert.equal(getUnitPrice(latte, 'NORMAL_SALE', 'PERSONAL_CUP', during), 15)
  assert.equal(getUnitPrice(latte, 'STAFF', 'PERSONAL_CUP', during), 9)
  assert.equal(getUnitPrice(latte, 'NORMAL_SALE', 'PERSONAL_CUP', new Date('2026-09-26T04:00:00Z')), 18)
})

test('cart keeps dine-in and personal-cup versions of the same drink separate', () => {
  const dineIn = addProduct([], latte, 'ICED', 'DINE_IN')
  const split = addProduct(dineIn, latte, 'ICED', 'PERSONAL_CUP')
  const incremented = addProduct(split, latte, 'ICED', 'PERSONAL_CUP')

  assert.deepEqual(incremented.map(line => ({ cupType: line.cupType, quantity: line.quantity })), [
    { cupType: 'DINE_IN', quantity: 1 },
    { cupType: 'PERSONAL_CUP', quantity: 2 },
  ])
  assert.equal(changeQuantity(incremented, 'latte', 'ICED', -1, 'PERSONAL_CUP')[1].quantity, 1)
})
