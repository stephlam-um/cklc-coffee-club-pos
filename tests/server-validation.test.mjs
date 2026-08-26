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

test('fingerprintTransaction is stable for equivalent payloads', () => {
  assert.equal(fingerprintTransaction(sale), fingerprintTransaction({ ...sale, items: [...sale.items] }))
})
