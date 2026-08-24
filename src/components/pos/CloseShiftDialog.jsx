import { useEffect, useRef } from 'react'

export default function CloseShiftDialog({ actual, submitting, error, onChange, onCancel, onSubmit }) {
  const dialogRef = useRef(null)
  const firstFieldRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => {
    previousFocusRef.current = document.activeElement
    firstFieldRef.current?.focus()
    return () => previousFocusRef.current?.focus()
  }, [])

  function handleKeyDown(event) {
    if (event.key === 'Escape' && !submitting) onCancel()
    if (event.key !== 'Tab') return

    const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input, textarea')]
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return (
    <div className="modal-backdrop" onKeyDown={handleKeyDown}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="close-shift-title" ref={dialogRef}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">End of Day</p>
            <h2 id="close-shift-title">Close This Shift?</h2>
            <p>Enter the totals shown in each payment app. You can add a note for any difference.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Cancel closing shift" onClick={onCancel} disabled={submitting}>×</button>
        </div>

        <form onSubmit={onSubmit} className="shift-form">
          <div className="field-pair">
            <label htmlFor="mpay-actual">MPay Actual
              <span className="money-field"><span>MOP</span><input ref={firstFieldRef} id="mpay-actual" name="mpayActual" inputMode="decimal" pattern="\d+(\.\d{1,2})?" autoComplete="off" value={actual.mpay} onChange={event => onChange({ ...actual, mpay: event.target.value })} placeholder="0.00" /></span>
            </label>
            <label htmlFor="wechat-actual">WeChat Pay Actual
              <span className="money-field"><span>MOP</span><input id="wechat-actual" name="wechatActual" inputMode="decimal" pattern="\d+(\.\d{1,2})?" autoComplete="off" value={actual.wechat} onChange={event => onChange({ ...actual, wechat: event.target.value })} placeholder="0.00" /></span>
            </label>
          </div>
          <label htmlFor="shift-note">Shift Note <small>Optional</small>
            <textarea id="shift-note" name="shiftNote" autoComplete="off" value={actual.note} onChange={event => onChange({ ...actual, note: event.target.value })} placeholder="Add a note about this shift…" />
          </label>
          {error && <p className="field-error" role="alert">{error}</p>}
          <div className="row actions-row">
            <button className="button secondary" type="button" onClick={onCancel} disabled={submitting}>Keep Shift Open</button>
            <button className="button danger" type="submit" disabled={submitting}>{submitting ? 'Closing Shift…' : 'Close Shift'}</button>
          </div>
        </form>
      </section>
    </div>
  )
}
