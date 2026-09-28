/**
 * Tips på Idag för Safari på iPhone/iPad: lägg Lagom på hemskärmen.
 *
 * Safari rensar data för webbplatser man inte besökt på sju dagar (ITP). En hemskärmsapp är
 * bättre skyddad – men den har EGEN lagring, så dagboken följer inte med automatiskt. Därför
 * börjar stegen med en säkerhetskopia som sedan läses in i hemskärmsappen.
 *
 * Visas bara i Safari i webbläsaren (inte som hemskärmsapp och inte i butiksapparna) och tills
 * användaren stänger tipset.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Smartphone, X } from 'lucide-react'
import { IconButton } from '../../components/ui'
import { isAppleWebKit, isInApp, isStandalone } from '../../config/platform'

export const INSTALL_HINT_DISMISSED_KEY = 'lagom-install-hint-dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_HINT_DISMISSED_KEY) !== null
  } catch {
    // Blockerad lagring: visa tipset (det kan stängas för sessionen).
    return false
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(INSTALL_HINT_DISMISSED_KEY, String(Date.now()))
  } catch {
    /* lagring blockerad – tipset är stängt tills sidan laddas om */
  }
}

/** true när tipset är relevant: Safari på iPhone/iPad, i webbläsaren. */
export function shouldShowInstallHint(): boolean {
  return isAppleWebKit() && !isStandalone() && !isInApp()
}

export default function InstallHintCard() {
  const [dismissed, setDismissed] = useState(readDismissed)
  if (dismissed || !shouldShowInstallHint()) return null

  const dismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <section aria-labelledby="installera-rubrik" className="card relative p-5">
      <IconButton icon={X} aria-label="Stäng tipset" onClick={dismiss} className="absolute right-2 top-2" noTooltip />
      <div className="flex items-start gap-3 pr-10">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-fjall-soft text-fjall">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="installera-rubrik" className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">
            Lägg Lagom på hemskärmen
          </h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            Safari kan rensa data för webbplatser du inte besökt på en vecka. Som app på hemskärmen är din dagbok bättre skyddad.
          </p>
        </div>
      </div>
      <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:font-semibold marker:text-ink">
        <li>
          Spara en säkerhetskopia (
          <Link to="/installningar/data" className="font-semibold text-gran underline underline-offset-2">
            Inställningar → Data
          </Link>
          ).
        </li>
        <li>Tryck på Dela → Lägg till på hemskärmen.</li>
        <li>Öppna Lagom från hemskärmen och läs in kopian – hemskärmsappen har egen lagring.</li>
      </ol>
    </section>
  )
}
