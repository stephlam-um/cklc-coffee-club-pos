import test from 'node:test'
import assert from 'node:assert/strict'
import * as domain from '../src/lib/domain.mjs'
import * as presentation from '../src/lib/presentation.mjs'
import { normalizeDashboardOrder } from '../src/lib/dashboard.mjs'

test('checkout RMB reduces every paid unit, including staff and personal-cup prices', () => {
  const cart = [{ product: { price: 18.75, staffPrice: 9 }, quantity: 2, cupType: 'PERSONAL_CUP' }]
  const eventDate = new Date('2026-09-24T12:00:00+08:00')
  assert.equal(domain.calculateCartRmbTotal(cart, 'NORMAL_SALE', eventDate), 27.5)
  assert.equal(domain.calculateCartRmbTotal(cart, 'STAFF', eventDate), 14)
  assert.equal(domain.calculateCartRmbTotal(cart, 'STAFF_REWARD', eventDate), 0)
  assert.equal(domain.calculateCartRmbTotal(cart, 'WASTE', eventDate), 0)
  assert.equal(domain.calculateCartRmbTotal([], 'NORMAL_SALE'), 0)
})

test('dashboard uses saved RMB prices and falls back per unit for older orders', () => {
  const order = normalizeDashboardOrder({ type: 'STAFF', items: [
    { unitPrice: 9, rmbUnitPrice: 7, quantity: 2 },
    { unitPrice: 18.75, quantity: 3 },
  ] })
  assert.equal(order.items[0].rmbUnitPrice, 7)
  assert.equal(presentation.orderRmbTotal(order), 64.25)
  assert.equal(presentation.orderRmbTotal(normalizeDashboardOrder(order)), 64.25)
  assert.equal(presentation.orderRmbTotal({ type: 'STAFF_REWARD', items: [{ unitPrice: 0, quantity: 2 }] }), 0)
  assert.equal(presentation.orderRmbTotal({ type: 'WASTE', items: [{ unitPrice: 0, quantity: 2 }] }), 0)
})

test('WeChat payment labels show RMB while MPay continues to show MOP', () => {
  assert.equal(presentation.paymentActionLabel(32, 'WeChat Pay'), 'Pay RMB\u00a032.00 with WeChat Pay')
  assert.equal(presentation.paymentActionLabel(36, 'MPay'), 'Pay MOP\u00a036.00 with MPay')
})
