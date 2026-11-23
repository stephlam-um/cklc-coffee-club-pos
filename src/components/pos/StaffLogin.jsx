import { getInitials } from '@/lib/presentation.mjs'

import { useLanguage, LanguageToggle } from '@/components/pos/LanguageProvider'

export default function StaffLogin({ staff, selectedStaff, pin, error, bootstrapError, submitting, onSelect, onPinChange, onCancel, onRetry, onSubmit }) {
  const { t, language } = useLanguage()
  return (
    <main className="login-shell" id="main-content">
      <LanguageToggle className="login-language-toggle" />
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup" inert={Boolean(selectedStaff)}>
          <div className="brand-mark" aria-hidden="true"><span>CK</span></div>
          <div>
            <p className="login-brand">CKLC Coffee POS</p>
            <h1 id="login-title">{t("Select staff")}</h1>
          </div>
        </div>

        {bootstrapError && (
          <div className="bootstrap-error" role="alert">
            <div><strong>{t("Unable to load staff")}</strong><span>{bootstrapError}</span></div>
            <button className="button secondary compact" type="button" onClick={onRetry} disabled={submitting}>{t("Try Again")}</button>
          </div>
        )}

        {!bootstrapError && <div className="staff-grid" aria-label={t("Active staff")} inert={Boolean(selectedStaff)}>
          {staff.map(member => (
            <button
              className="staff-button"
              key={member.id}
              type="button"
              aria-pressed={selectedStaff?.id === member.id}
              onClick={() => onSelect(member)}
            >
              <span className="staff-avatar" aria-hidden="true">{getInitials(member.name)}</span>
              <span>{member.name}</span>
            </button>
          ))}
        </div>}

        {!bootstrapError && !staff.length && <div className="empty-state">{t("No active staff.")}</div>}

        {selectedStaff && (
          <div className="login-pin-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-staff-name">
          <form className="pin-sheet" onSubmit={onSubmit} onKeyDown={event => {
            if (event.key === 'Escape' && !submitting) onCancel()
            if (event.key !== 'Tab') return
            const fields = [...event.currentTarget.querySelectorAll('input, button:not([disabled])')]
            const first = fields[0]
            const last = fields.at(-1)
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
          }}>
            <div>
              <h2 id="pin-staff-name">{selectedStaff.name}</h2>
            </div>
            <label className="field-label" htmlFor="staff-pin">{t("4-Digit PIN")}</label>
            <input
              id="staff-pin"
              autoFocus
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              autoComplete="current-password"
              spellCheck={false}
              value={pin}
              onChange={event => onPinChange(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              aria-describedby={error ? 'login-error' : undefined}
            />
            {error && <p className="field-error" id="login-error" role="alert">{error}</p>}
            <div className="row actions-row">
              <button className="button secondary" type="button" onClick={onCancel}>{t("Back")}</button>
              <button className="button primary" type="submit" disabled={pin.length !== 4 || submitting}>
                {submitting ? t("Opening Shift…") : t("Open Shift")}
              </button>
            </div>
          </form>
          </div>
        )}
      </section>
    </main>
  )
}
