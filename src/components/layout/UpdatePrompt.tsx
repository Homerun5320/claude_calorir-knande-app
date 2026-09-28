/**
 * Frågar om Lagom ska uppdateras när en ny version finns (webbversionen med service worker).
 *
 * - Service workern registreras här (vite.config.ts: registerType 'prompt', injectRegister false).
 * - Letar efter en ny version varje timme och när appen blir synlig igen – bara när enheten är
 *   uppkopplad.
 * - När en ny version väntar visas en notis med "Uppdatera", som byter version och laddar om.
 *   Missar man notisen tas den nya versionen i bruk nästa gång appen startas.
 *
 * Laddas lat från AppShell och bara i webbversionen (inte i butiksapparna, där uppdateringar
 * kommer via App Store och Google Play). Renderar ingenting.
 */
import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { toast } from '../ui/toast'
import { logError } from '../../lib/errorLog'

/** Hur ofta vi frågar servern efter en ny version medan appen är öppen. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/** Leta efter en ny service worker – tyst, bara uppkopplad och inte medan en redan installeras. */
function checkForUpdate(registration: ServiceWorkerRegistration): void {
  if (registration.installing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
  registration.update().catch(() => {
    // Nätverksfel eller att servern inte svarar – vi försöker igen vid nästa tillfälle.
  })
}

export default function UpdatePrompt() {
  const stopChecks = useRef<(() => void) | null>(null)
  const prompted = useRef(false)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      stopChecks.current?.()
      const timer = window.setInterval(() => checkForUpdate(registration), UPDATE_CHECK_INTERVAL_MS)
      const onVisibility = () => {
        if (document.visibilityState === 'visible') checkForUpdate(registration)
      }
      document.addEventListener('visibilitychange', onVisibility)
      stopChecks.current = () => {
        window.clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    },
    onRegisterError(error: unknown) {
      logError(error, 'service worker')
    },
  })

  useEffect(() => () => stopChecks.current?.(), [])

  useEffect(() => {
    if (!needRefresh || prompted.current) return
    prompted.current = true
    toast('En ny version av Lagom finns', {
      action: {
        label: 'Uppdatera',
        onClick: () => {
          void updateServiceWorker(true)
        },
      },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}
