import { getInitials, possessiveName } from '@/lib/presentation.mjs'

export default function StaffLogin({ staff, selectedStaff, pin, error, bootstrapError, submitting, onSelect, onPinChange, onCancel, onRetry, onSubmit }) {
  return (
    <main className="login-shell" id="main-content">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>CK</span></div>
          <div>
            <p className="eyebrow">CKLC Coffee · Campus Counter</p>
            <h1 id="login-title">Who’s Working?</h1>
            <p className="lede">Choose your name to open today’s counter shift.</p>
          </div>
        </div>

        <div className="shift-ready"><span className="status-dot" aria-hidden="true" />Ready to Open a Shift</div>

        {bootstrapError && (
          <div className="bootstrap-error" role="alert">
            <div><strong>Couldn’t Load the Counter</strong><span>{bootstrapError}</span></div>
            <button className="button secondary compact" type="button" onClick={onRetry} disabled={submitting}>Try Again</button>
          </div>
        )}

        {!bootstrapError && <div className="staff-grid" aria-label="Active staff">
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
              <small>Start Shift</small>
            </button>
          ))}
        </div>}

        {!bootstrapError && !staff.length && <div className="empty-state">No active staff found. Add staff in the Google Sheet, then refresh this page.</div>}

        {selectedStaff && (
          <form className="pin-sheet" onSubmit={onSubmit}>
            <div>
              <p className="eyebrow">Secure Sign-In</p>
              <h2>Enter {possessiveName(selectedStaff.name)} PIN</h2>
            </div>
            <label className="field-label" htmlFor="staff-pin">4-Digit PIN</label>
            <input
              id="staff-pin"
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
              <button className="button secondary" type="button" onClick={onCancel}>Choose Another Person</button>
              <button className="button primary" type="submit" disabled={pin.length !== 4 || submitting}>
                {submitting ? 'Opening Shift…' : 'Open Shift'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
