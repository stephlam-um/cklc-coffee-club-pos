import { createContext, useContext, useEffect, useState } from 'react'
import { translate } from '@/lib/language.mjs'

const LanguageContext = createContext({ language: 'en', t: value => value })

export function useLanguage() {
  return useContext(LanguageContext)
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('en')
  useEffect(() => {
    try {
      if (localStorage.getItem('pos-language') === 'zh-Hant') setLanguage('zh-Hant')
    } catch {}
  }, [])
  useEffect(() => { document.documentElement.lang = language }, [language])
  function toggle() {
    const next = language === 'en' ? 'zh-Hant' : 'en'
    setLanguage(next)
    try { localStorage.setItem('pos-language', next) } catch {}
  }
  return <LanguageContext.Provider value={{ language, t: value => translate(language, value), toggle }}>{children}</LanguageContext.Provider>
}

export function LanguageToggle({ className = '' }) {
  const { language, toggle } = useLanguage()
  return <button type="button" className={`language-toggle ${className}`} onClick={toggle} aria-label={language === 'en' ? 'Switch to Traditional Chinese' : 'Switch to English'} lang={language === 'en' ? 'zh-Hant' : 'en'}>{language === 'en' ? '中文' : 'English'}</button>
}
