/**
 * Spärren efter provperioden – lugn och tydlig, aldrig ett lås på användarens egen data.
 *
 * - `<AccessSync />` (i AppShell): håller statusen färsk – verifierar en sparad licens och startar
 *   provperioden för profiler som saknar start.
 * - `<AccessBlockedDialog />` (i AppShell): dialogen som `requireAccess()` öppnar.
 * - `<AccessGate>`: omsluter sidor som bara skapar nytt (Lägg till, Skanna, Nytt livsmedel, Nytt
 *   recept). När provperioden är slut visas en förklarande sida i stället.
 */
import type { ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, KeyRound, Leaf, Sprout } from 'lucide-react'
import { Button, Dialog, PageHeader } from '../../components/ui'
import { useAccess, type AccessStatus } from '../../hooks/useAccess'
import { BLOCKED_ACTION_TEXT, useAccessGateStore, type BlockedAction } from './requireAccess'
import { priceSummary } from './premiumLogic'

/** Håller tillgången uppdaterad (licensverifiering, provstart). Renderar inget. */
export function AccessSync() {
  useAccess()
  return null
}

export function blockedTitle(status: AccessStatus): string {
  return status.kind === 'utgangen' && status.licenseExpired ? 'Årslicensen har gått ut' : 'Provperioden är slut'
}

export function blockedText(action?: BlockedAction): string {
  const what = action ? BLOCKED_ACTION_TEXT[action] : 'logga nytt'
  return `För att ${what} behöver du en licens. Allt du redan har loggat finns kvar – du kan se, exportera och radera din data precis som vanligt.`
}

/** Knapparna: priser, export och aktivering. `onNavigate` stänger t.ex. dialogen först. */
function BlockedActions({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()
  const go = (to: string) => {
    onNavigate?.()
    navigate(to)
  }
  return (
    <div className="flex flex-col gap-2">
      <Button fullWidth iconLeft={Sprout} onClick={() => go('/premium')}>
        Se priser
      </Button>
      <Button fullWidth variant="secondary" iconLeft={Download} onClick={() => go('/installningar/data')}>
        Exportera min data
      </Button>
      <Button fullWidth variant="ghost" size="sm" iconLeft={KeyRound} onClick={() => go('/installningar/licens')}>
        Jag har redan en licensnyckel
      </Button>
    </div>
  )
}

/** Dialogen som visas när man försöker logga nytt efter provperioden. */
export function AccessBlockedDialog() {
  const blocked = useAccessGateStore((s) => s.blocked)
  const close = useAccessGateStore((s) => s.close)
  const { status } = useAccess()
  return (
    <Dialog
      open={blocked !== null}
      onClose={close}
      title={blockedTitle(status)}
      description={blockedText(blocked?.action)}
      icon={Leaf}
      tone="sol"
      showClose
      footer={
        <>
          <p className="mb-4 text-[0.8125rem] leading-snug text-ink-3">{priceSummary()} · inkl. moms · ingen automatisk förnyelse</p>
          <BlockedActions onNavigate={close} />
        </>
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
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{blockedText(action)}</p>
        <p className="mt-3 text-[0.8125rem] leading-snug text-ink-3">{priceSummary()} · inkl. moms · ingen automatisk förnyelse</p>
        <div className="mt-6 w-full">
          <BlockedActions />
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
  const { canLog, status } = useAccess()
  const [params] = useSearchParams()
  const browsing = browseTabs?.includes(params.get('flik') ?? '') ?? false
  if (!canLog && !browsing) return <AccessBlockedPage action={action} status={status} />
  return <>{children}</>
}
