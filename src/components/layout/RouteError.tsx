/**
 * Felsida för React Router (`errorElement`). Visas i stället för routerns engelska stackspårning
 * om något går sönder vid rendering eller om en sida inte kan laddas.
 *
 * - Lugn svensk text, inga tekniska detaljer i klartext (de finns bakom "Visa detaljer").
 * - "Ladda om", "Till Idag" och "Spara en säkerhetskopia" – datan ligger kvar på enheten.
 * - En sida som inte kunde hämtas efter en uppdatering (gammal flik, nya filnamn) laddas om
 *   automatiskt en gång.
 * - Felet sparas i den lokala felloggen (utan livsmedel och värden), så att användaren kan skicka
 *   en felrapport från Om Lagom → Felsökning.
 */
import { useEffect, useState } from 'react'
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom'
import { Download, House, RotateCw, Settings } from 'lucide-react'
import { Button } from '../ui/Button'
import { LogoMark } from './Logo'
import { saveBackup } from '../../lib/backup'
import { hasProtectedData } from '../../stores/storage'
import { markBackupNow } from '../../features/settings/backupStatus'
import { logError } from '../../lib/errorLog'
import { isChunkLoadError, reloadOnce } from './chunkReload'

export { isChunkLoadError } from './chunkReload'

function errorText(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`
  if (error instanceof Error) return `${error.name}: ${error.message}`
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function RouteError({ inShell = false }: { inShell?: boolean }) {
  const error = useRouteError()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const chunk = isChunkLoadError(error)
  const [saveFailed, setSaveFailed] = useState(false)
  // Inuti appens ram finns redan ett <main>.
  const Root = inShell ? 'section' : 'main'

  useEffect(() => {
    // Routerns felsvar (t.ex. 404) har inget Error-objekt – spara en kort beskrivning i stället.
    logError(error instanceof Error ? error : new Error(errorText(error)), 'route')
    if (chunk) reloadOnce()
    if (import.meta.env.DEV) console.error(error)
  }, [error, chunk])

  const save = () => {
    setSaveFailed(false)
    // Anropas direkt i klicket – delningsdialogen på telefoner kräver det.
    void saveBackup().then((outcome) => {
      if ((outcome === 'saved' || outcome === 'shared') && !hasProtectedData()) markBackupNow()
      else if (outcome === 'failed') setSaveFailed(true)
    })
  }

  return (
    <Root
      className={inShell ? 'px-4 pt-safe' : 'grain flex min-h-dvh items-center justify-center bg-bg px-4 pt-safe pb-safe'}
      aria-labelledby="route-error-title"
    >
      <div className="card mx-auto my-10 w-full max-w-md p-6 text-center">
        <div className="mx-auto mb-4 w-fit">
          <LogoMark size={44} />
        </div>
        <h1 id="route-error-title" className="font-display text-2xl font-semibold tracking-tight text-ink">
          {chunk ? 'Lagom har uppdaterats' : 'Något gick snett'}
        </h1>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          {chunk
            ? 'Den här sidan behöver laddas om för att hämta den nya versionen.'
            : 'Sidan kunde inte visas just nu. Din data ligger kvar på enheten – ladda om eller gå tillbaka till Idag.'}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button iconLeft={RotateCw} onClick={() => window.location.reload()} fullWidth>
            Ladda om
          </Button>
          {pathname !== '/' && (
            <Button variant="secondary" iconLeft={House} onClick={() => navigate('/')} fullWidth>
              Till Idag
            </Button>
          )}
          {!chunk && (
            <>
              <Button variant="ghost" iconLeft={Download} onClick={save} fullWidth>
                Spara en säkerhetskopia
              </Button>
              {saveFailed && (
                <p role="alert" className="text-[0.875rem] leading-relaxed text-ink-2">
                  Säkerhetskopian kunde inte sparas. Försök igen, eller spara den från Inställningar för data.
                </p>
              )}
              <Button variant="ghost" iconLeft={Settings} to="/installningar/data" fullWidth>
                Inställningar för data
              </Button>
            </>
          )}
        </div>
        {!chunk && (
          <details className="mt-5 text-left">
            <summary className="cursor-pointer rounded-lg text-[0.8125rem] font-medium text-ink-3">Visa detaljer</summary>
            <p className="mt-2 break-words rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink-2">{errorText(error)}</p>
          </details>
        )}
      </div>
    </Root>
  )
}
