import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMop, formatTemperature, getInitials, parseShiftAmount, paymentActionLabel, possessiveName } from '../src/lib/presentation.mjs'

test('formatMop presents POS totals as Macau patacas with two decimals', () => {
  assert.equal(formatMop(75), 'MOP\u00a075.00')
  assert.equal(formatMop(12.5), 'MOP\u00a012.50')
})

test('paymentActionLabel names the amount and payment method', () => {
  assert.equal(paymentActionLabel(75, 'MPay'), 'Pay MOP\u00a075.00 with MPay')
  assert.equal(paymentActionLabel(75, 'WeChat Pay'), 'Pay MOP\u00a075.00 with WeChat Pay')
})

test('formatTemperature gives drink choices a readable label', () => {
  assert.equal(formatTemperature('HOT'), 'Hot')
  assert.equal(formatTemperature('ICED'), 'Iced')
  assert.equal(formatTemperature(''), '')
})

test('getInitials creates a compact staff-card label', () => {
  assert.equal(getInitials('Cyw Lau'), 'CL')
  assert.equal(getInitials('Laura'), 'L')
  assert.equal(getInitials('  '), '?')
})

test('possessiveName keeps staff names ending in s readable', () => {
  assert.equal(possessiveName('Leaders'), 'Leaders’')
  assert.equal(possessiveName('Laura'), 'Laura’s')
})

test('parseShiftAmount accepts non-negative decimal totals', () => {
  assert.equal(parseShiftAmount(''), 0)
  assert.equal(parseShiftAmount('12.50'), 12.5)
  assert.equal(parseShiftAmount('0'), 0)
})

test('parseShiftAmount rejects malformed and negative totals', () => {
  assert.throws(() => parseShiftAmount('abc'), /valid amount/)
  assert.throws(() => parseShiftAmount('-1'), /zero or more/)
  assert.throws(() => parseShiftAmount('9'.repeat(400)), /valid amount/)
})
