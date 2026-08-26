import { buildOrderStatusPayload } from './dashboard.mjs'

const routes = {
  getBootstrap: ['GET', '/api/bootstrap'],
  login: ['POST', '/api/login'],
  openShift: ['POST', '/api/shifts/open'],
  createTransaction: ['POST', '/api/transactions'],
  closeShift: ['POST', null],
  getTodayOrders: ['GET', '/api/orders/today'],
  updateOrderStatus: ['PATCH', null],
}

async function request(action, data = {}) {
  const [method, configuredPath] = routes[action] || []
  const path = configuredPath || (action === 'closeShift' ? `/api/shifts/${encodeURIComponent(data.shiftId)}/close` : `/api/orders/${encodeURIComponent(data.transactionId)}/status`)
  const response = await fetch(path, {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(data),
  })
  if (!response.ok) throw new Error(`POS API returned HTTP ${response.status}`)
  const body = await response.json()
  if (!body.ok) {
    const error = new Error(body.error || 'POS API request failed')
    error.code = body.code
    throw error
  }
  return body.data
}

export const posApi = {
  getBootstrap: () => request('getBootstrap'),
  login: (staffId, pin) => request('login', { staffId, pin }),
  openShift: (staffId) => request('openShift', { staffId }),
  createTransaction: (transaction) => request('createTransaction', { transaction }),
  closeShift: (payload) => request('closeShift', payload),
  getTodayOrders: () => request('getTodayOrders'),
  updateOrderStatus: (transactionId, fulfillmentStatus, staffId) => request('updateOrderStatus', buildOrderStatusPayload(transactionId, fulfillmentStatus, staffId)),
}
