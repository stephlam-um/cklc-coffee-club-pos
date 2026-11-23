import { useState } from 'react'
import { dashboardStats, normalizeDashboardOrder, sortDashboardOrders } from '@/lib/dashboard.mjs'
import { formatMop, formatOrderDateTime, formatRmb, formatTemperature, orderRmbTotal } from '@/lib/presentation.mjs'
import { getRmbUnitPrice } from '@/lib/domain.mjs'

const PAYMENT_LABELS = { MPAY: 'MPay', WECHAT_PAY: 'WeChat Pay' }
const WASTE_LABELS = { MADE_WRONG: 'Made Wrong', CALIBRATION: 'Calibration', SPILLED: 'Spilled', OTHER: 'Other' }

function formatSyncTime(timestamp) {
  if (!timestamp) return 'Not synced yet'
  return `Synced ${new Intl.DateTimeFormat('en-MO', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))}`
}

import { useLanguage } from '@/components/pos/LanguageProvider'

export default function TodayDashboard({ data, pendingData, loading, error, staff, onRefresh, onUpdateStatus, onDeletePendingOrder }) {
  const { t, language } = useLanguage()
  const [updatingId, setUpdatingId] = useState('')
  const [statusError, setStatusError] = useState('')
  const orders = sortDashboardOrders((data?.orders || []).filter(order => order.type !== 'WASTE').map(normalizeDashboardOrder))
  const wasteOrders = sortDashboardOrders((data?.orders || []).filter(order => order.type === 'WASTE').map(normalizeDashboardOrder))
  const stats = data?.stats || dashboardStats(data?.orders || [])
  const wechatRmbTotal = orders.filter(order => order.paymentMethod === 'WECHAT_PAY').reduce((cents, order) => cents + Math.round(orderRmbTotal(order) * 100), 0) / 100
  const pendingOrders = (pendingData?.orders || orders.filter(order => order.fulfillmentStatus === 'PENDING'))
    .map(normalizeDashboardOrder).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
  const completedOrders = orders.filter(order => order.fulfillmentStatus === 'COMPLETED')
  const allPendingOrders = sortDashboardOrders((pendingData?.orders || []).map(normalizeDashboardOrder)).filter(order => order.fulfillmentStatus === 'PENDING')

  async function changeStatus(order) {
    const nextStatus = order.fulfillmentStatus === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    setUpdatingId(order.transactionId)
    setStatusError('')
    try {
      await onUpdateStatus(order.transactionId, nextStatus)
    } catch (caught) {
      setStatusError(caught.message || t("Could not update this order. Try again."))
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
      setStatusError(caught.message || t("Could not delete this order. Refresh and try again."))
    } finally {
      setUpdatingId('')
    }
  }

  function renderDeleteButton(order) {
    return <button className="order-status-button danger" type="button" disabled={updatingId === order.transactionId} onClick={() => requestDeletion(order)}>{updatingId === order.transactionId ? t("Deleting…") : t("Delete permanently")}</button>
  }

  function renderItems(order) {
    const wechat = order.paymentMethod === 'WECHAT_PAY'
    return order.items.map((item, index) => <div key={`${order.transactionId}-${index}`}>
      <div className="order-item-copy"><span className="order-item-quantity" aria-label={`${item.quantity} cups`}>{item.quantity}</span><div><strong className="order-item-name">{t(item.name)}</strong><div className="order-item-options">{item.temperature && <span className={`temperature-tag ${item.temperature === 'HOT' ? 'is-hot' : 'is-iced'}`}>{t(formatTemperature(item.temperature))}</span>}{item.cupType === 'PERSONAL_CUP' && <span>{t("Personal cup")}</span>}</div></div></div>
      <small className="order-line-amount">{order.type === 'STAFF_REWARD' ? t("Free") : wechat ? formatRmb((item.rmbUnitPrice ?? getRmbUnitPrice(item.unitPrice)) * item.quantity) : formatMop(item.lineTotal)}</small>
    </div>)
  }

  function renderTotal(order) {
    return <strong className="order-total">{order.type === 'STAFF_REWARD' ? t("Free") : order.paymentMethod === 'WECHAT_PAY' ? formatRmb(orderRmbTotal(order)) : formatMop(order.total)}</strong>
  }

  function renderOrder(order) {
    const completed = order.fulfillmentStatus === 'COMPLETED'
    return (
      <article className={`dashboard-order ${completed ? 'is-completed' : 'is-pending'}`} key={order.transactionId}>
        <div className="dashboard-order-topline">
          <div><time className="order-time" dateTime={order.timestamp}>{formatOrderDateTime(order.timestamp)}</time><span className="order-id">#{order.transactionId.slice(-6)}</span></div>
          {renderTotal(order)}
        </div>
        <div className="dashboard-order-body">
          <div className="dashboard-order-items">
            {renderItems(order)}
          </div>
          <div className="dashboard-order-meta"><span>{order.type === 'STAFF_REWARD' ? t("Staff reward") : t(PAYMENT_LABELS[order.paymentMethod]) || t("No payment")}</span><span>{order.staffName}</span>{order.needsReview && <strong>{t("Needs review")}</strong>}</div>
        </div>
        <button className="order-status-button" type="button" disabled={updatingId === order.transactionId} onClick={() => changeStatus(order)}>
          {updatingId === order.transactionId ? t("Saving…") : completed ? t("Reopen order") : t("Mark served")}
        </button>
      </article>
    )
  }

  function renderDeletionReview(order) {
    return <article className="dashboard-order is-pending" key={`review-${order.transactionId}`}>
      <div className="dashboard-order-topline"><div><span className="order-status"><span aria-hidden="true" />{order.needsReview ? t("Needs review") : t("Pending")}</span><time className="order-time" dateTime={order.timestamp}>{formatOrderDateTime(order.timestamp)}</time></div>{renderTotal(order)}</div>
      <div className="dashboard-order-body"><div className="dashboard-order-items">{renderItems(order)}</div><div className="dashboard-order-meta"><span>{t(PAYMENT_LABELS[order.paymentMethod]) || t("No payment")}</span><span>By {order.staffName}</span><span>#{order.transactionId.slice(-6)}</span></div></div>
      {renderDeleteButton(order)}
    </article>
  }

  return (
    <main className="dashboard-shell" id="main-content">
      <div className="dashboard-heading">
        <h1>{t("Today’s Orders")}</h1>
        <div className="dashboard-actions"><span className="sync-time" aria-live="polite">{language === 'zh-Hant' ? (data?.syncedAt ? `已同步 ${new Date(data.syncedAt).toLocaleTimeString('zh-MO')}` : t('Not synced yet')) : formatSyncTime(data?.syncedAt)}</span><button className="button secondary compact" type="button" onClick={onRefresh} disabled={loading}>{loading ? t("Syncing…") : t("Refresh")}</button></div>
      </div>

      {error && <div className="banner error" role="alert"><strong>{t("Couldn’t Sync Orders")}</strong><span>{error}</span></div>}
      {statusError && <div className="banner error" role="alert"><strong>{t("Couldn’t Update Record")}</strong><span>{statusError}</span></div>}

      <section className="daily-payment-summary" aria-label={t("Today’s payment totals")}>
        <span aria-label={t("MPay total")}>{formatMop(stats.mpayTotal)}</span>
        <span aria-label={t("WeChat Pay total")}>{formatRmb(wechatRmbTotal)}</span>
      </section>


      {loading && !data ? <div className="dashboard-empty" aria-live="polite"><strong>{t("Loading orders…")}</strong></div> : (
        <div className="order-queues">
          <section className="pending-queue" aria-labelledby="pending-orders-title"><div className="queue-heading"><h2 id="pending-orders-title">{t("Pending")} <span>{pendingOrders.length}</span></h2></div>{pendingOrders.length ? <div className="dashboard-order-list">{pendingOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>{t("No pending orders")}</strong></div>}</section>
          <section className="completed-queue" aria-labelledby="completed-orders-title"><div className="queue-heading"><h2 id="completed-orders-title">{t("Completed")} <span>{completedOrders.length}</span></h2></div>{completedOrders.length ? <div className="dashboard-order-list">{completedOrders.map(renderOrder)}</div> : <div className="dashboard-empty compact-empty"><strong>{t("No completed orders")}</strong></div>}</section>
        </div>
      )}

      {wasteOrders.length > 0 && <details className="waste-log">
        <summary>{t("Waste")} <span>{wasteOrders.length}</span></summary>
        {wasteOrders.length ? <div className="dashboard-order-list">{wasteOrders.map(order => (
          <article className="dashboard-order is-waste" key={order.transactionId}>
            <div className="dashboard-order-topline"><div><span className="order-status"><span aria-hidden="true" />{t(WASTE_LABELS[order.wasteReason]) || order.wasteReason || t("Waste")}</span><time className="order-time" dateTime={order.timestamp}>{formatOrderDateTime(order.timestamp)}</time></div></div>
            <div className="dashboard-order-body">
              <div className="dashboard-order-items">{order.items.map((item, index) => <div key={`${order.transactionId}-${index}`}><span>{item.quantity} × {t(item.name)}{item.temperature && <em> · {t(formatTemperature(item.temperature))}</em>}</span></div>)}</div>
              <div className="dashboard-order-meta"><span>By {order.staffName}</span><span>#{order.transactionId.slice(-6)}</span></div>
            </div>
            {staff.role === 'MANAGER' && renderDeleteButton(order)}
          </article>
        ))}</div> : <div className="dashboard-empty compact-empty"><strong>{t("No waste recorded today.")}</strong><span>{t("New waste entries will appear here.")}</span></div>}
      </details>}

      {staff.role === 'MANAGER' && <section className="order-queues deletion-review" aria-labelledby="all-pending-orders-title"><div className="queue-heading"><div><p className="eyebrow">{t("Manager Review")}</p><h2 id="all-pending-orders-title">{t("All Pending Orders")} <span>{allPendingOrders.length}</span></h2></div><span className="queue-marker pending-marker" aria-hidden="true" /></div><p>{t("Includes previous days. Deleting an order permanently erases its transaction and items.")}</p>{allPendingOrders.length ? <div className="dashboard-order-list">{allPendingOrders.map(renderDeletionReview)}</div> : <div className="dashboard-empty compact-empty"><strong>{t("No pending orders")} to review.</strong><span>{t("All paid orders have been completed or deleted.")}</span></div>}</section>}

    </main>
  )
}
