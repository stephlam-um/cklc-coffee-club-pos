import { describe, expect, it } from 'vitest'
import { calculateCartTotal, getUnitPrice, type CartLine, type Product } from './domain'

const latte: Product = { id: 'latte', name: 'Latte', category: 'Coffee', price: 18, staffPrice: 9, active: true, sortOrder: 1 }
const americano: Product = { id: 'americano', name: 'Americano', category: 'Coffee', price: 12, staffPrice: 5, active: true, sortOrder: 2 }

describe('pricing', () => {
  it('uses normal price for NORMAL_SALE', () => {
    expect(getUnitPrice(latte, 'NORMAL_SALE')).toBe(18)
  })

  it('uses staff price for STAFF', () => {
    expect(getUnitPrice(latte, 'STAFF')).toBe(9)
  })

  it('totals multiple cart lines using the transaction mode', () => {
    const cart: CartLine[] = [
      { product: latte, quantity: 2 },
      { product: americano, quantity: 1 },
    ]
    expect(calculateCartTotal(cart, 'NORMAL_SALE')).toBe(48)
    expect(calculateCartTotal(cart, 'STAFF')).toBe(23)
  })
})
