import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprintTransaction, validateTransactionInput } from '../src/lib/server/validation.mjs'

const sale = {
  transactionId: 'tx-1', shiftId: 'shift-1', staffId: 'staff-1', type: 'NORMAL_SALE',
  items: [{ productId: 'latte', name: 'Latte', temperature: 'HOT', quantity: 1, unitPrice: 18, lineTotal: 18 }],
  total: 18, paymentMethod: 'MPAY', wasteReason: '',
}

test('validateTransactionInput accepts a normal paid sale', () => {
  assert.equal(validateTransactionInput(sale).total, 18)
})

test('validateTransactionInput rejects a paid waste record', () => {
  assert.throws(() => validateTransactionInput({ ...sale, type: 'WASTE', total: 0, paymentMethod: '', wasteReason: '' }), /waste reason/i)
})

test('validateTransactionInput enforces the fixed RMB minus-two rule', () => {
  assert.throws(() => validateTransactionInput({
    ...sale,
    items: [{ ...sale.items[0], rmbUnitPrice: 18 }],
  }), /MOP price minus 2/i)
})

test('fingerprintTransaction is stable for equivalent payloads', () => {
  assert.equal(fingerprintTransaction(sale), fingerprintTransaction({ ...sale, items: [...sale.items] }))
})

test('validateTransactionInput accepts an audited three-dollar personal-cup discount', () => {
  const input = {
    ...sale,
    items: [{ ...sale.items[0], cupType: 'PERSONAL_CUP', baseUnitPrice: 18, discountUnitPrice: 3, campaignId: 'PERSONAL_CUP_2026', unitPrice: 15, rmbUnitPrice: 13, lineTotal: 15 }],
    total: 15,
  }
  assert.equal(validateTransactionInput(input, new Date('2026-09-24T04:00:00Z')).items[0].cupType, 'PERSONAL_CUP')
})

test('validateTransactionInput rejects a forged personal-cup discount', () => {
  assert.throws(() => validateTransactionInput({
    ...sale,
    items: [{ ...sale.items[0], cupType: 'PERSONAL_CUP', baseUnitPrice: 18, discountUnitPrice: 4, campaignId: 'PERSONAL_CUP_2026', unitPrice: 14, rmbUnitPrice: 12, lineTotal: 14 }],
    total: 14,
  }, new Date('2026-09-24T04:00:00Z')), /personal-cup discount/i)
})
