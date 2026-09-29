/**
 * Spärren efter provperioden – lugn och tydlig, aldrig ett lås på användarens egen data.
 *
 * - `<AccessSync />` (i AppShell): håller statusen färsk – verifierar en sparad licens och startar
 *   provperioden för profiler som saknar start.
 * - `<AccessBlockedDialog />` (i AppShell): dialogen som `requireAccess()` öppnar.
 * - `<AccessGate>`: omsluter sidor som bara skapar nytt (Lägg till, Skanna, Nytt livsmedel, Nytt
 *   recept). När provperioden är slut visas en förklarande sida i stället.
 *
 * Med exempeldata visas i stället för köpspärren en vänlig förklaring: exemplet är skrivskyddat,
 * och man skapar sin egen profil för att börja logga (provperioden startar då).
 *
 * I iPhone-appen startas provperioden med ett gratis köp i App Store ('prov14'). Innan den har
 * startats (statusen 'ejstartad') förklarar spärren det och har knappen "Starta 14 dagar gratis".
 */
import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, KeyRound, Leaf, Sparkles, Sprout, UserRound } from 'lucide-react'
import { Button, Dialog, PageHeader, confirmDialog } from '../../components/ui'
import { TRIAL_DAYS } from '../../config/commerce'
import { allowsLicenseKeyEntry, isInApp, sellsOnWeb, trialViaStore } from '../../config/platform'
import { useAccess, type AccessStatus } from '../../hooks/useAccess'
import { BLOCKED_ACTION_TEXT, useAccessGateStore, type BlockedAction } from './requireAccess'
import { priceSummary, priceSummaryText } from './premiumLogic'
import { RestorePurchasesButton } from './RestorePurchasesButton'
import { StartTrialButton } from './StartTrialButton'

/** Håller tillgången uppdaterad (licensverifiering, provstart). Renderar inget. */
export function AccessSync() {
  useAccess()
  return null
}

export function blockedTitle(status: AccessStatus): string {
  if (status.kind === 'ejstartad') return 'Starta din provperiod'
  if (status.kind === 'utgangen' && status.revoked) return 'Licensen har återkallats'
  return status.kind === 'utgangen' && status.licenseExpired ? 'Årslicensen har gått ut' : 'Provperioden är slut'
}

export function blockedText(action?: BlockedAction, status?: AccessStatus): string {
  const what = action ? BLOCKED_ACTION_TEXT[action] : 'logga nytt'
  if (status?.kind === 'ejstartad') {
    return `För att ${what} startar du först provperioden – ${TRIAL_DAYS} dagar gratis med ett gratis köp i App Store – eller köper en licens. Allt du redan har lagt in finns kvar.`
  }
  return `För att ${what} behöver du en licens. Allt du redan har loggat finns kvar – du kan se, exportera och radera din data precis som vanligt.`
}

/** Priserna under spärrtexten – kronor bara när Lagom säljs på webben. */
export function blockedPriceLine(): string {
  if (sellsOnWeb()) return `${priceSummary()} · inkl. moms · ingen automatisk förnyelse`
  const text = priceSummaryText()
  return `${text.charAt(0).toLocaleUpperCase('sv-SE')}${text.slice(1)} · ingen automatisk förnyelse`
}

/**
 * Knapparna: (starta provperioden,) priser, export och aktivering. `onNavigate` stänger t.ex.
 * dialogen först.
 */
function BlockedActions({ onNavigate, status }: { onNavigate?: () => void; status: AccessStatus }) {
  const navigate = useNavigate()
  const go = (to: string) => {
    onNavigate?.()
    navigate(to)
  }
  const startTrial = status.kind === 'ejstartad'
  return (
    <div className="flex flex-col gap-2">
      {startTrial && (
        <StartTrialButton
          fullWidth
          onDone={(result) => {
            if (result === 'started' || result === 'licensed') onNavigate?.()
          }}
        />
      )}
      <Button fullWidth variant={startTrial ? 'secondary' : 'primary'} iconLeft={Sprout} onClick={() => go('/premium')}>
        Se priser
      </Button>
      <Button fullWidth variant="secondary" iconLeft={Download} onClick={() => go('/installningar/data')}>
        Exportera min data
      </Button>
      {allowsLicenseKeyEntry() && (
        <Button fullWidth variant="ghost" size="sm" iconLeft={KeyRound} onClick={() => go('/installningar/licens')}>
          Jag har redan en licensnyckel
        </Button>
      )}
      {isInApp() && <RestorePurchasesButton variant="ghost" size="sm" fullWidth />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exempeldata
// ---------------------------------------------------------------------------

export const DEMO_TITLE = 'Det här är exempeldata'

/** Förklaringen när man försöker logga i exemplet. */
export function demoText(status: AccessStatus): string {
  if (status.kind !== 'ny') return 'Det här är exempeldata. Skapa din egen profil för att börja logga.'
  return trialViaStore()
    ? `Det här är exempeldata. Skapa din egen profil för att börja logga – sedan startar du provperioden på ${TRIAL_DAYS} dagar gratis.`
    : `Det här är exempeldata. Skapa din egen profil för att börja logga – provperioden på ${TRIAL_DAYS} dagar startar då.`
}

export const DEMO_WIPE_NOTE = 'Exempeldatan tas bort när du börjar. Du kan titta på den hur mycket du vill innan dess.'

/**
 * "Skapa min egen profil": rensar exempeldatan (samma funktion som markeringen för exempeldata
 * använder) och går till välkomstflödet.
 */
export function StartOwnProfileButton({
  onNavigate,
  fullWidth = true,
  confirm = false,
}: {
  onNavigate?: () => void
  fullWidth?: boolean
  /** Fråga först (när texten runt knappen inte redan säger att exempeldatan tas bort). */
  confirm?: boolean
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const start = async () => {
    if (busy) return
    if (
      confirm &&
      !(await confirmDialog({
        title: 'Börja med din egen profil?',
        message: 'Exempeldatan tas bort och du svarar på några snabba frågor om dig – det tar under en minut.',
        confirmLabel: 'Börja',
        icon: UserRound,
      }))
    ) {
      return
    }
    setBusy(true)
    // Laddas först när den behövs – raderingen drar in säkerhetskopians kod.
    const { wipeAndReset } = await import('../settings/wipe')
    void wipeAndReset()
    onNavigate?.()
    navigate('/valkommen', { replace: true })
  }
  return (
    <Button fullWidth={fullWidth} iconLeft={UserRound} loading={busy} onClick={() => void start()}>
      Skapa min egen profil
    </Button>
  )
}

function DemoActions({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <StartOwnProfileButton onNavigate={onClose} />
      {onClose && (
        <Button fullWidth variant="secondary" onClick={onClose}>
          Fortsätt titta
        </Button>
      )}
    </div>
  )
}

/** Dialogen som visas när man försöker logga nytt efter provperioden (eller i exemplet). */
export function AccessBlockedDialog() {
  const blocked = useAccessGateStore((s) => s.blocked)
  const close = useAccessGateStore((s) => s.close)
  const { status } = useAccess()
  // Behåll innehållet medan dialogen stängs (annars byter texten under animationen).
  const [shown, setShown] = useState(blocked)
  if (blocked !== null && blocked !== shown) setShown(blocked)
  const current = blocked ?? shown
  const demo = Boolean(current?.demo)
  return (
    <Dialog
      open={blocked !== null}
      onClose={close}
      title={demo ? DEMO_TITLE : blockedTitle(status)}
      description={demo ? demoText(status) : blockedText(current?.action, status)}
      icon={demo ? Sparkles : Leaf}
      tone={demo ? 'hjortron' : 'sol'}
      showClose
      footer={
        demo ? (
          <>
            <p className="mb-4 text-[0.8125rem] leading-snug text-ink-3">{DEMO_WIPE_NOTE}</p>
            <DemoActions onClose={close} />
          </>
        ) : (
          <>
            <p className="mb-4 text-[0.8125rem] leading-snug text-ink-3">{blockedPriceLine()}</p>
            <BlockedActions onNavigate={close} status={status} />
          </>
        )
      }
    />
  )
}

/** Sidan som visas i stället för en loggningssida när provperioden är slut. */
export function AccessBlockedPage({ action, status }: { action?: BlockedAction; status: AccessStatus }) {
  return (
    <div className="px-4 pb-10">
      <PageHeader back title={blockedTitle(status)} />
      <div className="card mx-auto flex max-w-md flex-col items-center p-6 text-center">
        <span aria-hidden className="mb-4 grid size-16 place-items-center rounded-full bg-sol-soft text-ink ring-8 ring-sol-soft/40">
          <Leaf className="size-7" strokeWidth={2} />
        </span>
        <p className="font-display text-[1.25rem] font-semibold leading-snug tracking-tight text-ink">Din data är trygg</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{blockedText(action, status)}</p>
        <p className="mt-3 text-[0.8125rem] leading-snug text-ink-3">{blockedPriceLine()}</p>
        <div className="mt-6 w-full">
          <BlockedActions status={status} />
        </div>
      </div>
    </div>
  )
}

/** Sidan som visas i stället för en loggningssida medan exempeldata visas. */
export function DemoBlockedPage({ status }: { status: AccessStatus }) {
  return (
    <div className="px-4 pb-10">
      <PageHeader back title={DEMO_TITLE} />
      <div className="card mx-auto flex max-w-md flex-col items-center p-6 text-center">
        <span aria-hidden className="mb-4 grid size-16 place-items-center rounded-full bg-hjortron-soft text-ink ring-8 ring-hjortron-soft/40">
          <Sparkles className="size-7" strokeWidth={2} />
        </span>
        <p className="font-display text-[1.25rem] font-semibold leading-snug tracking-tight text-ink">Titta så mycket du vill</p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{demoText(status)}</p>
        <p className="mt-3 text-[0.8125rem] leading-snug text-ink-3">{DEMO_WIPE_NOTE}</p>
        <div className="mt-6 w-full">
          <DemoActions />
        </div>
      </div>
    </div>
  )
}

/**
 * Visar sidan bara om ny loggning är tillåten – annars en lugn förklaring.
 *
 * `browseTabs`: flikar (`?flik=…`) som visar användarens egen data, t.ex. Mina livsmedel och
 * sparade måltider. De är alltid öppna så att datan går att se, ändra och ta bort även efter
 * provperioden – själva loggningen därifrån stoppas ändå av `requireAccess`.
 */
export function AccessGate({ children, action, browseTabs }: { children: ReactNode; action?: BlockedAction; browseTabs?: readonly string[] }) {
  const { canLog, status, demo } = useAccess()
  const [params] = useSearchParams()
  const browsing = browseTabs?.includes(params.get('flik') ?? '') ?? false
  if (!canLog && !browsing) return demo ? <DemoBlockedPage status={status} /> : <AccessBlockedPage action={action} status={status} />
  return <>{children}</>
}
