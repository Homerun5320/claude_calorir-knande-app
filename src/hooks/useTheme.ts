import { useEffect } from 'react'
import { useProfileStore } from '../stores/profileStore'

/**
 * Applicerar valt tema (ljust/mörkt/system) på <html>.
 * I systemläge följs i första hand ett explicit `data-theme` på <html> (sätts av vissa värdmiljöer,
 * t.ex. inbäddade förhandsvisningar), annars `prefers-color-scheme`.
 */
export function useTheme() {
  const theme = useProfileStore((s) => s.settings.theme)
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const host = root.getAttribute('data-theme')
      const systemDark = host === 'dark' ? true : host === 'light' ? false : mq.matches
      const dark = theme === 'morkt' || (theme === 'system' && systemDark)
      root.classList.toggle('dark', dark)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B1210' : '#F6F3EC'))
    }
    apply()
    mq.addEventListener('change', apply)
    const observer = new MutationObserver(apply)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', apply)
      observer.disconnect()
    }
  }, [theme])
}
