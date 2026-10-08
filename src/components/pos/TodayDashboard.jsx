import { useState } from 'react'
import { dashboardStats, normalizeDashboardOrder, sortDashboardOrders } from '@/lib/dashboard.mjs'
import { formatMop, formatRmb, formatTemperature, orderRmbTotal } from '@/lib/presentation.mjs'
import { getRmbUnitPrice } from '@/lib/domain.mjs'

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

export default function TodayDashboard({ data, pendingData, loading, error, staff, onRefresh, onUpdateStatus, onDeletePendingOrder }) {
  const [updatingId, setUpdatingId] = useState('')
  const [statusError, setStatusError] = useState('')
  const orders = sortDashboardOrders((data?.orders || []).filter(order => order.type !== 'WASTE').map(normalizeDashboardOrder))
  const wasteOrders = sortDashboardOrders((data?.orders || []).filter(order => order.type === 'WASTE').map(normalizeDashboardOrder))
  const stats = data?.stats || dashboardStats(data?.orders || [])
  const wechatRmbTotal = orders.filter(order => order.paymentMethod === 'WECHAT_PAY').reduce((cents, order) => cents + Math.round(orderRmbTotal(order) * 100), 0) / 100
  const pendingOrders = orders.filter(order => order.fulfillmentStatus === 'PENDING')
  const completedOrders = orders.filter(order => order.fulfillmentStatus === 'COMPLETED')
  const allPendingOrders = sortDashboardOrders((pendingData?.orders || []).map(normalizeDashboardOrder)).filter(order => order.fulfillmentStatus === 'PENDING')

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

  async function requestDeletion(order) {
    setUpdatingId(order.transactionId)
    setStatusError('')
    try {
      await onDeletePendingOrder(order)
    } catch (caught) {
      setStatusError(caught.message || 'Could not delete this order. Refresh and try again.')
    } finally {
      setUpdatingId('')
    }
  }

  function renderDeleteButton(order) {
    return <button className="order-status-button danger" type="button" disabled={updatingId === order.transactionId} onClick={() => requestDeletion(order)}>{updatingId === order.transactionId ? 'Deleting…' : 'Delete permanently'}</button>
  }

  function renderItems(order) {
    const wechat = order.paymentMethod === 'WECHAT_PAY'
    return order.items.map((item, index) => <div key={`${order.transactionId}-${index}`}>
      <div className="order-item-copy"><span className="order-item-quantity" aria-label={`${item.quantity} cups`}>{item.quantity}</span><div><strong className="order-item-name">{item.name}</strong><div className="order-item-options">{item.temperature && <span className={`temperature-tag ${item.temperature === 'HOT' ? 'is-hot' : 'is-iced'}`}>{formatTemperature(item.temperature)}</span>}{item.cupType === 'PERSONAL_CUP' && <span>Personal cup</span>}</div></div></div>
      <small className="order-line-amount">{order.type === 'STAFF_REWARD' ? 'Free' : wechat ? formatRmb((item.rmbUnitPrice ?? getRmbUnitPrice(item.unitPrice)) * item.quantity) : formatMop(item.lineTotal)}</small>
    </div>)
  }

  function renderTotal(order) {
    return <strong className="order-total">{order.type === 'STAFF_REWARD' ? 'Free' : order.paymentMethod === 'WECHAT_PAY' ? formatRmb(orderRmbTotal(order)) : formatMop(order.total)}</strong>
  }

  function renderOrder(order) {
    const completed = order.fulfillmentStatus === 'COMPLETED'
    return (
      <article className={`dashboard-order ${completed ? 'is-completed' : 'is-pending'}`} key={order.transactionId}>
        <div className="dashboard-order-topline">
          <div><span className="order-time">{formatOrderTime(order.timestamp)}</span><span className="order-id">#{order.transactionId.slice(-6)}</span></div>
          {renderTotal(order)}
        </div>
        <div className="dashboard-order-body">
          <div className="dashboard-order-items">
            {renderItems(order)}
          </div>
          <div className="dashboard-order-meta"><span>{order.type === 'STAFF_REWARD' ? 'Staff reward' : PAYMENT_LABELS[order.paymentMethod] || 'No payment'}</span><span>{order.staffName}</span></div>
        </div>
        <button className="order-status-button" type="button" disabled={updatingId === order.transactionId} onClick={() => changeStatus(order)}>
          {updatingId === order.transactionId ? 'Saving…' : completed ? 'Reopen order' : 'Complete order'}
        </button>
      </article>
    )
  }

  function renderDeletionReview(order) {
    return <article className="dashboard-order is-pending" key={`review-${order.transactionId}`}>
      <div className="dashboard-order-topline"><div><span className="order-status"><span aria-hidden="true" />Pending</span><span className="order-time">{formatOrderTime(order.timestamp)}</span></div>{renderTotal(order)}</div>
      <div className="dashboard-order-body"><div className="dashboard-order-items">{renderItems(order)}</div><div className="dashboard-order-meta"><span>{PAYMENT_LABELS[order.paymentMethod] || 'No payment'}</span><span>By {order.staffName}</span><span>#{order.transactionId.slice(-6)}</span></div></div>
      {renderDeleteButton(order)}
    </article>
  }

  return (
    <main className="dashboard-shell" id="main-content">
      <div className="dashboard-heading">
        <h1>Today’s Orders</h1>
        <div className="dashboard-actions"><span className="sync-time" aria-live="polite">{formatSyncTime(data?.syncedAt)}</span><button className="button secondary compact" type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Syncing…' : 'Refresh'}</button></div>
      </div>

      {error && <div className="banner error" role="alert"><strong>Couldn’t Sync Orders</strong><span>{error}</span></div>}
      {statusError && <div className="banner error" role="alert"><strong>Couldn’t Update Record</strong><span>{statusError}</span></div>}

      <section className="daily-payment-summary" aria-label="Today’s payment totals">
        <span aria-label="MPay total">{formatMop(stats.mpayTotal)}</span>
        <span aria-label="WeChat Pay total">{formatRmb(wechatRmbTotal)}</span>
      </section>


      {loading && !data ? <div className="dashboard-empty" aria-live="polite"><strong>Loading orders…</strong></div> : (
        <div className="order-queues">
          <section className="pending-queue" aria-labelledby="pending-orders-title"><div className="queue-heading"><h2 id="pending-orders-title">Pending <span>{pendingOrders.length}</span></h2></div>{pendingOrders.length ? <div className="dashboard-order-list">{pendingOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>No pending orders</strong></div>}</section>
          <section className="completed-queue" aria-labelledby="completed-orders-title"><div className="queue-heading"><h2 id="completed-orders-title">Completed <span>{completedOrders.length}</span></h2></div>{completedOrders.length ? <div className="dashboard-order-list">{completedOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>No completed orders</strong></div>}</section>
        </div>
      )}

      {wasteOrders.length > 0 && <details className="waste-log">
        <summary>Waste <span>{wasteOrders.length}</span></summary>
        {wasteOrders.length ? <div className="dashboard-order-list">{wasteOrders.map(order => (
          <article className="dashboard-order is-waste" key={order.transactionId}>
            <div className="dashboard-order-topline"><div><span className="order-status"><span aria-hidden="true" />{WASTE_LABELS[order.wasteReason] || order.wasteReason || 'Waste'}</span><span className="order-time">{formatOrderTime(order.timestamp)}</span></div></div>
            <div className="dashboard-order-body">
              <div className="dashboard-order-items">{order.items.map((item, index) => <div key={`${order.transactionId}-${index}`}><span>{item.quantity} × {item.name}{item.temperature && <em> · {formatTemperature(item.temperature)}</em>}</span></div>)}</div>
              <div className="dashboard-order-meta"><span>By {order.staffName}</span><span>#{order.transactionId.slice(-6)}</span></div>
            </div>
            {staff.role === 'MANAGER' && renderDeleteButton(order)}
          </article>
        ))}</div> : <div className="dashboard-empty compact-empty"><strong>No waste recorded today.</strong><span>New waste entries will appear here.</span></div>}
      </details>}

      {staff.role === 'MANAGER' && <section className="order-queues deletion-review" aria-labelledby="all-pending-orders-title"><div className="queue-heading"><div><p className="eyebrow">Manager Review</p><h2 id="all-pending-orders-title">All Pending Orders <span>{allPendingOrders.length}</span></h2></div><span className="queue-marker pending-marker" aria-hidden="true" /></div><p>Includes previous days. Deleting an order permanently erases its transaction and items.</p>{allPendingOrders.length ? <div className="dashboard-order-list">{allPendingOrders.map(renderDeletionReview)}</div> : <div className="dashboard-empty compact-empty"><strong>No pending orders to review.</strong><span>All paid orders have been completed or deleted.</span></div>}</section>}

    </main>
  )
}
