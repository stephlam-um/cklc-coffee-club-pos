import { useState } from 'react'
import { dashboardStats, normalizeDashboardOrder, sortDashboardOrders } from '@/lib/dashboard.mjs'
import { formatMop } from '@/lib/presentation.mjs'

const PAYMENT_LABELS = { MPAY: 'MPay', WECHAT_PAY: 'WeChat Pay' }
const WASTE_LABELS = { MADE_WRONG: 'Made Wrong', CALIBRATION: 'Calibration', SPILLED: 'Spilled', OTHER: 'Other' }

function formatOrderTime(timestamp) {
  if (!timestamp) return 'Unknown time'
  return new Intl.DateTimeFormat('en-MO', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}

function formatSyncTime(timestamp) {
  if (!timestamp) return 'Not synced yet'
  return `Synced ${new Intl.DateTimeFormat('en-MO', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))}`
}

function StatCard({ label, value, detail, tone = '' }) {
  return <div className={`dashboard-stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
}

export default function TodayDashboard({ data, loading, error, staff, onRefresh, onUpdateStatus }) {
  const [updatingId, setUpdatingId] = useState('')
  const [statusError, setStatusError] = useState('')
  const orders = sortDashboardOrders((data?.orders || []).filter(order => order.type !== 'WASTE').map(normalizeDashboardOrder))
  const stats = data?.stats || dashboardStats(data?.orders || [])
  const pendingOrders = orders.filter(order => order.fulfillmentStatus === 'PENDING')
  const completedOrders = orders.filter(order => order.fulfillmentStatus === 'COMPLETED')

  async function changeStatus(order) {
    const nextStatus = order.fulfillmentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    setUpdatingId(order.transactionId)
    setStatusError('')
    try {
      await onUpdateStatus(order.transactionId, nextStatus)
    } catch (caught) {
      setStatusError(caught.message || 'Could not update this order. Try again.')
    } finally {
      setUpdatingId('')
    }
  }

  function renderOrder(order) {
    const completed = order.fulfillmentStatus === 'COMPLETED'
    return (
      <article className={`dashboard-order ${completed ? 'is-completed' : 'is-pending'}`} key={order.transactionId}>
        <div className="dashboard-order-topline">
          <div><span className="order-status"><span aria-hidden="true" />{completed ? 'Completed' : 'Pending'}</span><span className="order-time">{formatOrderTime(order.timestamp)}</span></div>
          <strong className="order-total">{formatMop(order.total)}</strong>
        </div>
        <div className="dashboard-order-body">
          <div className="dashboard-order-items">
            {order.items.map(item => <div key={`${order.transactionId}-${item.productId}`}><span>{item.quantity} × {item.name}</span><small>{formatMop(item.lineTotal)}</small></div>)}
          </div>
          <div className="dashboard-order-meta"><span>{PAYMENT_LABELS[order.paymentMethod] || 'No payment'}</span><span>By {order.staffName}</span><span>#{order.transactionId.slice(-6)}</span></div>
        </div>
        <button className="order-status-button" type="button" disabled={updatingId === order.transactionId} onClick={() => changeStatus(order)}>
          {updatingId === order.transactionId ? 'Saving…' : completed ? 'Mark as Pending' : 'Mark as Completed'}
        </button>
      </article>
    )
  }

  return (
    <main className="dashboard-shell" id="main-content">
      <div className="dashboard-heading">
        <div><p className="eyebrow">Operations Board</p><h1>Today’s Orders</h1><p>Keep the counter moving. Mark each paid order when it is made or handed over.</p></div>
        <div className="dashboard-actions"><span className="sync-time" aria-live="polite">{formatSyncTime(data?.syncedAt)}</span><button className="button primary compact" type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Syncing…' : 'Sync Today'}</button></div>
      </div>

      {error && <div className="banner error" role="alert"><strong>Couldn’t Sync Orders</strong><span>{error}</span></div>}
      {statusError && <div className="banner error" role="alert"><strong>Couldn’t Update Order</strong><span>{statusError}</span></div>}

      <section className="dashboard-stats" aria-label="Today’s totals">
        <StatCard label="Orders" value={stats.orderCount} detail={`${stats.pendingCount} still pending`} tone="orange" />
        <StatCard label="Revenue" value={formatMop(stats.revenue)} detail="Paid orders today" />
        <StatCard label="Completed" value={stats.completedCount} detail={`${stats.orderCount ? Math.round((stats.completedCount / stats.orderCount) * 100) : 0}% of orders`} tone="mint" />
        <StatCard label="Waste" value={stats.wasteCount} detail="Logged entries today" tone="coffee" />
      </section>

      <section className="payment-strip" aria-label="Payment totals">
        <span><b>MPay</b>{formatMop(stats.mpayTotal)}</span><span><b>WeChat Pay</b>{formatMop(stats.wechatTotal)}</span><span><b>Staff</b>{staff.name}</span>
      </section>

      {loading && !data ? <div className="dashboard-empty" aria-live="polite"><strong>Syncing today’s orders…</strong><span>Reading the counter log from Google Sheets.</span></div> : (
        <div className="order-queues">
          <section aria-labelledby="pending-orders-title"><div className="queue-heading"><div><p className="eyebrow">Needs Attention</p><h2 id="pending-orders-title">Pending Orders <span>{pendingOrders.length}</span></h2></div><span className="queue-marker pending-marker" aria-hidden="true" /></div>{pendingOrders.length ? <div className="dashboard-order-list">{pendingOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>Nothing waiting.</strong><span>New paid orders will appear here.</span></div>}</section>
          <section aria-labelledby="completed-orders-title"><div className="queue-heading"><div><p className="eyebrow">Already Handed Over</p><h2 id="completed-orders-title">Completed <span>{completedOrders.length}</span></h2></div><span className="queue-marker completed-marker" aria-hidden="true" /></div>{completedOrders.length ? <div className="dashboard-order-list">{completedOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>No completed orders yet.</strong><span>Mark an order when it leaves the counter.</span></div>}</section>
        </div>
      )}

      <p className="dashboard-footnote">Waste logged today: {stats.wasteCount} {stats.wasteCount === 1 ? 'entry' : 'entries'} · {formatMop(stats.wasteTotal)} · {Object.values(WASTE_LABELS).join(' / ')}</p>
    </main>
  )
}
