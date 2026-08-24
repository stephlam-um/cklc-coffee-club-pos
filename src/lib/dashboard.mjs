export const FULFILLMENT_STATUS = Object.freeze(['PENDING', 'COMPLETED'])

export function buildOrderStatusPayload(transactionId, fulfillmentStatus, staffId) {
  return { transactionId, fulfillmentStatus, staffId }
}

export function normalizeDashboardOrder(row = {}) {
  const items = Array.isArray(row.items) ? row.items.map(item => ({
    productId: String(item.productId || ''),
    name: String(item.name || 'Unnamed item'),
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: Number(item.lineTotal || 0),
  })) : []

  return {
    transactionId: String(row.transactionId || ''),
    timestamp: row.timestamp || '',
    staffId: String(row.staffId || ''),
    staffName: String(row.staffName || row.staffId || 'Unknown staff'),
    type: String(row.type || 'NORMAL_SALE'),
    items,
    total: Number(row.total || 0),
    paymentMethod: String(row.paymentMethod || ''),
    wasteReason: String(row.wasteReason || ''),
    fulfillmentStatus: FULFILLMENT_STATUS.includes(row.fulfillmentStatus) ? row.fulfillmentStatus : 'PENDING',
    completedAt: row.completedAt || '',
    completedBy: String(row.completedBy || ''),
  }
}

export function sortDashboardOrders(orders = []) {
  return [...orders].sort((a, b) => {
    const statusOrder = Number(a.fulfillmentStatus === 'COMPLETED') - Number(b.fulfillmentStatus === 'COMPLETED')
    if (statusOrder !== 0) return statusOrder
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

export function dashboardStats(orders = []) {
  const normalized = orders.map(normalizeDashboardOrder)
  const fulfillmentOrders = normalized.filter(order => order.type !== 'WASTE')
  const wasteOrders = normalized.filter(order => order.type === 'WASTE')

  return {
    orderCount: fulfillmentOrders.length,
    revenue: fulfillmentOrders.reduce((sum, order) => sum + order.total, 0),
    pendingCount: fulfillmentOrders.filter(order => order.fulfillmentStatus === 'PENDING').length,
    completedCount: fulfillmentOrders.filter(order => order.fulfillmentStatus === 'COMPLETED').length,
    mpayTotal: fulfillmentOrders.filter(order => order.paymentMethod === 'MPAY').reduce((sum, order) => sum + order.total, 0),
    wechatTotal: fulfillmentOrders.filter(order => order.paymentMethod === 'WECHAT_PAY').reduce((sum, order) => sum + order.total, 0),
    wasteCount: wasteOrders.length,
    wasteTotal: wasteOrders.reduce((sum, order) => sum + order.total, 0),
  }
}
