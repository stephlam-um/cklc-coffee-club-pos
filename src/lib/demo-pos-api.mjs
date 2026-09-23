import { dashboardStats } from './dashboard.mjs'

const STAFF = { id: 'demo-staff', name: 'Demo Staff', role: 'STAFF', active: true }
const PRODUCTS = [
  { id: 'demo-latte', name: 'Latte', category: 'Coffee', price: 28, staffPrice: 18, active: true, sortOrder: 1 },
  { id: 'demo-matcha', name: 'Matcha Latte', category: 'Tea', price: 30, staffPrice: 20, active: true, sortOrder: 2 },
  { id: 'demo-xxl', name: 'XXL Latte', category: 'XXL Series', price: 38, staffPrice: 28, active: true, sortOrder: 3 },
]

function itemCount(items = []) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

export function createDemoPosApi() {
  const transactions = new Map()

  function rewardBalance() {
    const orders = [...transactions.values()]
    const earnedSales = orders
      .filter(order => order.type === 'NORMAL_SALE' && order.fulfillmentStatus === 'COMPLETED')
      .reduce((sum, order) => sum + itemCount(order.items), 6)
    const redeemed = orders
      .filter(order => order.type === 'STAFF_REWARD')
      .reduce((sum, order) => sum + itemCount(order.items), 0)
    return {
      soldCups: earnedSales,
      redeemedCups: redeemed,
      availableCups: Math.max(0, Math.floor(earnedSales / 6) - redeemed),
      cupsToNext: Math.max(redeemed + 1, Math.floor(earnedSales / 6) + 1) * 6 - earnedSales,
    }
  }

  function toOrder(transaction) {
    return {
      ...transaction,
      timestamp: transaction.timestamp || new Date().toISOString(),
      staffName: STAFF.name,
      fulfillmentStatus: transaction.fulfillmentStatus || (transaction.type === 'WASTE' ? 'COMPLETED' : 'PENDING'),
      completedAt: transaction.completedAt || '',
      completedBy: transaction.completedBy || '',
    }
  }

  return {
    async getBootstrap() { return { products: PRODUCTS.map(product => ({ ...product })), staff: [{ ...STAFF }] } },
    async login(staffId) {
      if (String(staffId) !== STAFF.id) throw new Error('Invalid demo staff')
      return { staff: { ...STAFF } }
    },
    async openShift() { return { shiftId: 'demo-shift' } },
    async getStaffRewards() { return rewardBalance() },
    async createTransaction(transaction) {
      if (transactions.has(transaction.transactionId)) return { transactionId: transaction.transactionId, duplicate: true }
      if (transaction.type === 'STAFF_REWARD') {
        const requested = itemCount(transaction.items)
        if (transaction.items.some(item => {
          const product = PRODUCTS.find(candidate => candidate.id === item.productId)
          return !product || /xxl/i.test(`${product.name} ${product.category}`)
        })) throw new Error('XXL drinks cannot be redeemed')
        if (requested > rewardBalance().availableCups) throw new Error('INSUFFICIENT_REWARDS')
      }
      transactions.set(transaction.transactionId, toOrder(transaction))
      return { transactionId: transaction.transactionId, duplicate: false }
    },
    async getTodayOrders() {
      const orders = [...transactions.values()]
      return { date: new Date().toISOString().slice(0, 10), timezone: 'Demo', orders, stats: dashboardStats(orders), syncedAt: new Date().toISOString() }
    },
    async getPendingOrders() {
      return { orders: [...transactions.values()].filter(order => order.fulfillmentStatus === 'PENDING'), syncedAt: new Date().toISOString() }
    },
    async updateOrderStatus(transactionId, fulfillmentStatus) {
      const order = transactions.get(transactionId)
      if (!order) throw new Error('Transaction not found')
      transactions.set(transactionId, { ...order, fulfillmentStatus })
      return { transactionId, fulfillmentStatus }
    },
    async deletePendingOrder(transactionId) {
      const order = transactions.get(transactionId)
      if (!order || order.fulfillmentStatus !== 'PENDING') throw new Error('Pending transaction not found')
      transactions.delete(transactionId)
      return { transactionId }
    },
    async closeShift() { return { mpayExpected: 0, wechatExpected: 0, difference: 0, sheetSyncStatus: 'DEMO' } },
  }
}
