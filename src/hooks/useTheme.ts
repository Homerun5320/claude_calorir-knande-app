import { useEffect } from 'react'
import { useProfileStore } from '../stores/profileStore'

/** Applicerar valt tema (ljust/mörkt/system) på <html>. */
export function useTheme() {
  const theme = useProfileStore((s) => s.settings.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'morkt' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0B1210' : '#F6F3EC'))
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}
