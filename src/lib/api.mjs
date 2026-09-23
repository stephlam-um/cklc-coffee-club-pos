import { buildOrderStatusPayload } from './dashboard.mjs'
import { createDemoPosApi } from './demo-pos-api.mjs'

export const isDemoMode = process.env.NEXT_PUBLIC_POS_DEMO_MODE === 'true'

const routes = {
  getBootstrap: ['GET', '/api/bootstrap'],
  getStaffRewards: ['GET', '/api/staff/rewards'],
  login: ['POST', '/api/login'],
  openShift: ['POST', '/api/shifts/open'],
  createTransaction: ['POST', '/api/transactions'],
  closeShift: ['POST', null],
  getTodayOrders: ['GET', '/api/orders/today'],
  getPendingOrders: ['GET', '/api/orders/pending'],
  updateOrderStatus: ['PATCH', null],
  deletePendingOrder: ['DELETE', null],
}

async function request(action, data = {}) {
  const [method, configuredPath] = routes[action] || []
  const path = configuredPath || (action === 'closeShift' ? `/api/shifts/${encodeURIComponent(data.shiftId)}/close` : action === 'deletePendingOrder' ? `/api/orders/${encodeURIComponent(data.transactionId)}` : `/api/orders/${encodeURIComponent(data.transactionId)}/status`)
  const response = await fetch(path, {
    method,
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: method === 'GET' ? undefined : JSON.stringify(data),
  })
  const body = await response.json().catch(() => null)
  if (!body) throw new Error(`POS API returned HTTP ${response.status}`)
  if (!response.ok || !body.ok) {
    const error = new Error(body.error || 'POS API request failed')
    error.code = body.code
    throw error
  }
  return body.data
}

const livePosApi = {
  getStaffRewards: () => request('getStaffRewards'),
  getBootstrap: () => request('getBootstrap'),
  login: (staffId, pin) => request('login', { staffId, pin }),
  openShift: (staffId) => request('openShift', { staffId }),
  createTransaction: (transaction) => request('createTransaction', { transaction }),
  closeShift: (payload) => request('closeShift', payload),
  getTodayOrders: () => request('getTodayOrders'),
  getPendingOrders: () => request('getPendingOrders'),
  updateOrderStatus: (transactionId, fulfillmentStatus, staffId) => request('updateOrderStatus', buildOrderStatusPayload(transactionId, fulfillmentStatus, staffId)),
  deletePendingOrder: (transactionId) => request('deletePendingOrder', { transactionId }),
}

export const posApi = isDemoMode ? createDemoPosApi() : livePosApi
