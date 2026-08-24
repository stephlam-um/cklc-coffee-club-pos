export default function PosHeader({ staffName, activeView, onViewChange, onCloseShift }) {
  return (
    <header className="topbar">
      <div className="counter-brand">
        <span className="mini-mark" aria-hidden="true">CK</span>
        <div>
          <p className="eyebrow">Campus Counter</p>
          <strong>CKLC Coffee POS</strong>
        </div>
      </div>
      <nav className="header-view-switcher" aria-label="Primary">
        <button type="button" aria-pressed={activeView === 'POS'} onClick={() => onViewChange('POS')}>POS</button>
        <button type="button" aria-pressed={activeView === 'DASHBOARD'} onClick={() => onViewChange('DASHBOARD')}>Today’s Orders</button>
      </nav>
      <div className="shift-controls">
        <div className="staff-chip"><span className="status-dot" aria-hidden="true" /><span><small>On Shift</small>{staffName}</span></div>
        <button className="button secondary compact" type="button" onClick={onCloseShift}>Close Shift</button>
      </div>
    </header>
  )
}
