import { useLanguage, LanguageToggle } from '@/components/pos/LanguageProvider'

export default function PosHeader({ staffName, activeView, pendingCount, onViewChange, onCloseShift }) {
  const { t, language } = useLanguage()
  return (
    <header className="topbar">
      <div className="counter-brand">
        <span className="mini-mark" aria-hidden="true">CK</span>
        <div>
          <p className="eyebrow">{t("Campus Counter")}</p>
          <strong>CKLC Coffee POS</strong>
        </div>
      </div>
      <nav className="header-view-switcher" aria-label={t("Primary")}>
        <button type="button" aria-pressed={activeView === 'POS'} onClick={() => onViewChange('POS')}>{t("Counter")}</button>
        <button type="button" aria-pressed={activeView === 'DASHBOARD'} onClick={() => onViewChange('DASHBOARD')}>{t("Bar")}{pendingCount != null ? ` (${pendingCount})` : ''}</button>
      </nav>
      <div className="shift-controls">
        <LanguageToggle />
        <div className="staff-chip"><span className="status-dot" aria-hidden="true" /><span><small>{t("On Shift")}</small>{staffName}</span></div>
        <button className="button secondary compact" type="button" onClick={onCloseShift}>{t("Close Shift")}</button>
      </div>
    </header>
  )
}
