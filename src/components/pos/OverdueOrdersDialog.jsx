import { useEffect, useRef, useState } from 'react'
import { formatOrderDateTime, formatTemperature } from '@/lib/presentation.mjs'

import { useLanguage } from '@/components/pos/LanguageProvider'

export default function OverdueOrdersDialog({ orders, syncedAt, onResolve }) {
  const { t, language } = useLanguage()
  const dialog = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])

  async function resolve(order, decision) {
    setSaving(true)
    setError('')
    try {
      await onResolve(order.transactionId, decision)
    } catch (caught) {
      setError(caught.message || t("Could not update the order. Try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} className="modal overdue-dialog" aria-labelledby="overdue-title" onCancel={event => event.preventDefault()}>
      <div className="modal-heading">
        <div>
          <h2 id="overdue-title">{t("Review overdue orders")}</h2>
          <p>{language === 'zh-Hant' ? `有 ${orders.length} 張逾時訂單，請先處理再繼續銷售。` : `${orders.length} pending ${orders.length === 1 ? 'ticket needs' : 'tickets need'} a decision before the next sale.`}</p>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {orders.map(order => (
        <section className="overdue-ticket" key={order.transactionId}>
          <strong>#{order.transactionId.slice(-6)} · {Math.floor((Date.parse(syncedAt) - Date.parse(order.timestamp)) / 60000)} {language === 'zh-Hant' ? '分鐘待出餐' : 'min pending'}</strong>
          <div className="order-time"><time dateTime={order.timestamp}>{formatOrderDateTime(order.timestamp)}</time> ({language === 'zh-Hant' ? '澳門時間' : 'Macau time'})</div>
          <ul>{order.items.map((item, index) => (
            <li key={index}>{item.quantity} × {t(formatTemperature(item.temperature))} {t(item.name)}</li>
          ))}</ul>
          <div className="overdue-actions">
            <button className="button primary compact" type="button" disabled={saving} onClick={() => resolve(order, 'SERVED')}>{t("Mark served")}</button>
            <button className="button secondary compact" type="button" disabled={saving} onClick={() => resolve(order, 'PREPARING')}>{t("Still preparing")}</button>
            <button className="button secondary compact" type="button" disabled={saving} onClick={() => resolve(order, 'REVIEW')}>{t("Needs review")}</button>
          </div>
        </section>
      ))}
    </dialog>
  )
}
