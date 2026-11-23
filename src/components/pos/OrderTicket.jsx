import { formatMop, formatRmb, formatTemperature, orderRmbTotal } from '@/lib/presentation.mjs'
import { calculateCartRmbTotal, getEightyPercentPrices, getRmbUnitPrice, getUnitPrice, normalizeCupType } from '@/lib/domain.mjs'

import { useLanguage } from '@/components/pos/LanguageProvider'

export default function OrderTicket({ cart, mode, total, discount, discountAvailable, checkingDiscount, onCheckDiscount, quotedItems, canDiscount, onToggleDiscount, submitting, pending = false, pendingPaymentMethod, online = true, rewardAvailable = 0, onChangeQuantity, onClear, onCheckout }) {
  const { t, language } = useLanguage()
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const paid = mode === 'NORMAL_SALE' || mode === 'STAFF'
  const rmbTotal = quotedItems ? orderRmbTotal({ type: mode, items: quotedItems }) : calculateCartRmbTotal(cart, mode, new Date(), discount)

  return (
    <aside className="order-ticket" id="order-ticket" aria-labelledby="order-title">
      <div className="ticket-header">
        <div>
          <p className="eyebrow">{t("Order Ticket")}</p>
          <h2 id="order-title">{t("Current Order")}</h2>
        </div>
        <div className="ticket-tools">
          {cart.length > 0 && <button className="ticket-clear" type="button" onClick={onClear}>{t("Clear")}</button>}
          <span className="ticket-number">{String(itemCount).padStart(2, '0')}</span>
        </div>
      </div>

      <div className="ticket-rule" aria-hidden="true"><span>{t("Items")}</span><span>{t("Qty")}</span></div>

      <div className="cart-lines">
        {cart.length ? cart.map((line, index) => {
          const cupType = normalizeCupType(line.cupType)
          const quote = quotedItems?.[index] ?? (discount ? getEightyPercentPrices(line.product.price) : null)
          const unitPrice = quote?.unitPrice ?? getUnitPrice(line.product, mode, cupType)
          return (
            <div className="cart-line" key={`${line.product.id}-${line.temperature}-${cupType}`}>
              <div className="line-copy">
                <strong>{t(line.product.name)}</strong>
                <small>{[t(formatTemperature(line.temperature)), mode === 'NORMAL_SALE' ? (cupType === 'PERSONAL_CUP' ? t("Personal Cup") : t("Dine In")) : '', mode === 'WASTE' ? line.product.category : ''].filter(Boolean).join(' · ')}</small>
                {discount && <small>{t("Regular price")} {formatMop(quote?.baseUnitPrice ?? line.product.price)}</small>}
                {paid && <div className="item-prices" aria-label={t("Unit prices")}><span>{formatMop(unitPrice)}</span><span>{formatRmb(quote?.rmbUnitPrice ?? getRmbUnitPrice(unitPrice))}</span></div>}
              </div>
              <div className="qty" aria-label={`Quantity for ${t(formatTemperature(line.temperature))} ${t(line.product.name)}`}>
                <button type="button" disabled={pending || submitting} aria-label={`Remove one ${t(formatTemperature(line.temperature))} ${t(line.product.name)}`} onClick={() => onChangeQuantity(line.product.id, line.temperature, -1, cupType)}>−</button>
                <output aria-live="polite">{line.quantity}</output>
                <button type="button" disabled={pending || submitting || (mode === 'STAFF_REWARD' && itemCount >= rewardAvailable)} aria-label={`Add one ${t(formatTemperature(line.temperature))} ${t(line.product.name)}`} onClick={() => onChangeQuantity(line.product.id, line.temperature, 1, cupType)}>+</button>
              </div>
            </div>
          )
        }) : (
          <div className="cart-empty">
            <span aria-hidden="true">+</span>
            <strong>{t("Your Ticket Is Empty")}</strong>
            <p>{t("Tap a menu item to start this order.")}</p>
          </div>
        )}
      </div>

      <div className="checkout">
        {(canDiscount || discount) && <button className={`button ${discount ? 'primary' : 'secondary'} compact`} type="button" aria-pressed={discount} disabled={pending || submitting || !cart.length || !canDiscount} onClick={onToggleDiscount}>{t("8折 · 20% off")}</button>}
        {discount && !discountAvailable && !pending && (
          <div>
            <p className="field-error" role="status">{checkingDiscount ? t("Checking discount availability…") : t("Discounted checkout is temporarily unavailable.")}</p>
            {!checkingDiscount && <button className="button secondary compact" type="button" disabled={!online} onClick={onCheckDiscount}>{t("Check again")}</button>}
          </div>
        )}
        {paid ? <div className="currency-totals" aria-label={t("Order totals")} aria-live="polite"><div><span>{t("MOP total")}</span><strong>{formatMop(total)}</strong></div><div><span>{t("RMB total")}</span><strong>{formatRmb(rmbTotal)}</strong></div></div> : <div className="total"><span>{t("Total")}</span><strong>{formatMop(total)}</strong></div>}
        {mode === 'STAFF_REWARD' ? (
          <button className="button primary full-width" type="button" disabled={!cart.length || submitting || !online || (!pending && itemCount > rewardAvailable)} onClick={() => onCheckout()}>
            {submitting ? t("Redeeming…") : pending ? t("Confirm Redemption") : language === 'zh-Hant' ? `兌換 ${itemCount} 杯免費飲品` : `Redeem ${itemCount} Free Drink${itemCount === 1 ? '' : 's'}`}
          </button>
        ) : mode === 'WASTE' ? (
          <button className="button waste-action full-width" type="button" disabled={!cart.length || submitting || !online} onClick={() => onCheckout()}>
            {submitting ? t("Recording Waste…") : language === 'zh-Hant' ? `記錄 ${itemCount} 件損耗` : `Record ${itemCount || 0} Waste Item${itemCount === 1 ? '' : 's'}`}
          </button>
        ) : pendingPaymentMethod ? (
          <button className="button primary full-width" type="button" disabled={submitting || !online} onClick={() => onCheckout(pendingPaymentMethod)}>
            {submitting ? t("Confirming…") : language === 'zh-Hant' ? `重試記錄 ${pendingPaymentMethod === 'MPAY' ? 'MPay' : '微信'} 付款` : `Retry ${pendingPaymentMethod === 'MPAY' ? 'MPay' : 'WeChat Pay'} recording`}
          </button>
        ) : (
          <div className="payments">
            <button type="button" disabled={!cart.length || submitting || !online || (discount && !discountAvailable)} onClick={() => onCheckout('MPAY')}>
              <span>{submitting ? t("Recording…") : t("Pay with MPay")}</span>
            </button>
            <button type="button" disabled={!cart.length || submitting || !online || (discount && !discountAvailable)} onClick={() => onCheckout('WECHAT_PAY')}>
              <span>{submitting ? t("Recording…") : t("Pay with WeChat")}</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
