import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOrderStatusPayload, dashboardStats, normalizeDashboardOrder } from '../src/lib/dashboard.mjs'

const latteOrder = {
  transactionId: 'tx-1',
  timestamp: '2026-08-19T09:15:00.000Z',
  staffName: 'Cyw',
  type: 'NORMAL_SALE',
  items: [{ productId: 'latte', name: 'Latte', temperature: 'HOT', quantity: 2, unitPrice: 18, lineTotal: 36 }],
  total: 36,
  paymentMethod: 'MPAY',
  fulfillmentStatus: 'PENDING',
}

test('normalizeDashboardOrder defaults missing fulfillment status to pending', () => {
  const order = normalizeDashboardOrder({ ...latteOrder, fulfillmentStatus: undefined })
  assert.equal(order.fulfillmentStatus, 'PENDING')
  assert.equal(order.items[0].temperature, 'HOT')
  assert.equal(order.items[0].lineTotal, 36)
})

test('dashboardStats separates waste from fulfillment orders', () => {
  const orders = [
    normalizeDashboardOrder(latteOrder),
    normalizeDashboardOrder({
      transactionId: 'tx-2',
      timestamp: '2026-08-19T10:15:00.000Z',
      staffName: 'Laura',
      type: 'STAFF',
      items: [{ productId: 'americano', name: 'Americano', quantity: 1, unitPrice: 5, lineTotal: 5 }],
      total: 5,
      paymentMethod: 'WECHAT_PAY',
      fulfillmentStatus: 'COMPLETED',
    }),
    normalizeDashboardOrder({
      transactionId: 'tx-3',
      timestamp: '2026-08-19T11:15:00.000Z',
      staffName: 'Leaders',
      type: 'WASTE',
      items: [{ productId: 'latte', name: 'Latte', quantity: 1, unitPrice: 0, lineTotal: 0 }],
      total: 0,
      paymentMethod: '',
      wasteReason: 'SPILLED',
      fulfillmentStatus: 'PENDING',
    }),
  ]

  assert.deepEqual(dashboardStats(orders), {
    orderCount: 2,
    revenue: 41,
    pendingCount: 1,
    completedCount: 1,
    mpayTotal: 36,
    wechatTotal: 5,
    wasteCount: 1,
    wasteTotal: 0,
  })
})

test('buildOrderStatusPayload includes the authenticated staff actor', () => {
  assert.deepEqual(buildOrderStatusPayload('tx-1', 'COMPLETED', 'staff-001'), {
    transactionId: 'tx-1',
    fulfillmentStatus: 'COMPLETED',
    staffId: 'staff-001',
  })
})
