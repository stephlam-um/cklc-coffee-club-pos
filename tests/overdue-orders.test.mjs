import assert from 'node:assert/strict'
import test from 'node:test'
import { overduePendingOrders } from '../src/lib/dashboard.mjs'

test('overdue reminders exclude served, waste, snoozed and flagged tickets', () => {
  const now = '2026-11-23T08:10:00Z'
  const ticket = { transactionId: 'old', timestamp: '2026-11-23T08:00:00Z', fulfillmentStatus: 'PENDING', type: 'NORMAL_SALE' }
  assert.deepEqual(overduePendingOrders([
    ticket,
    { ...ticket, timestamp: '2026-11-23T08:00:01Z' },
    { ...ticket, fulfillmentStatus: 'COMPLETED' },
    { ...ticket, type: 'WASTE' },
    { ...ticket, reminderUntil: '2026-11-23T08:15:00Z' },
    { ...ticket, needsReview: true },
  ], now), [ticket])
})
