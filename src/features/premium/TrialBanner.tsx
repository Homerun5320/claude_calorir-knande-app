/**
 * Provperioden i vardagen – diskret, aldrig stressande.
 *
 * - `TrialBanner` (Idag): ett litet chip under provperioden, ett tydligare kort de sista tre
 *   dagarna och ett lugnt kort när den är slut. Inget visas med licens.
 * - `PremiumHubCard` (Mer): status för Lagom Premium med länk till köpsidan.
 */
import { memo, useId } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Download, Sprout } from 'lucide-react'
import { Button, Card, cx } from '../../components/ui'
import { PLANS } from '../../config/commerce'
import { useAccess, type AccessStatus } from '../../hooks/useAccess'
import { daysText, formatLongDate, formatPrice, trialBannerLevel } from './premiumLogic'

function pricesText(): string {
  return PLANS.map((p) => `${formatPrice(p.priceKr)} ${p.durationDays ? 'för ett år' : 'för alltid'}`).join(' eller ')
}

export const TrialBanner = memo(function TrialBanner({ className }: { className?: string }) {
  const { status, checking } = useAccess()
  const headingId = useId()
  if (checking) return null
  const level = trialBannerLevel(status)
  if (level === 'none') return null

  if (level === 'chip' && status.kind === 'prov') {
    return (
      <Link
        to="/premium"
        className={cx(
          'inline-flex min-h-11 max-w-full items-center gap-2 self-start rounded-full bg-surface py-2 pr-3 pl-3.5 text-[0.8125rem] text-ink-2 shadow-card ring-1 ring-line/70 ring-inset transition-colors hover:text-ink',
          className,
        )}
      >
        <Sprout aria-hidden className="size-4 shrink-0 text-gran" />
        <span className="truncate">Provperiod: {daysText(status.daysLeft)} kvar</span>
        <span aria-hidden className="text-ink-3">
          ·
        </span>
        <span className="shrink-0 font-semibold text-gran">Se priser</span>
      </Link>
    )
  }

  if (level === 'soon' && status.kind === 'prov') {
    return (
      <Card tone="sol" padding="sm" className={className}>
        <div className="flex flex-col gap-3 px-1 py-0.5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Sprout aria-hidden className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" />
            <div className="min-w-0">
              <p className="font-semibold text-ink">{daysText(status.daysLeft)} kvar av provperioden</p>
              <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">
                All din data finns kvar efter provperioden. Vill du fortsätta logga: {pricesText()}.
              </p>
            </div>
          </div>
          <Button to="/premium" size="sm" variant="secondary" className="self-start sm:self-center">
            Se priser
          </Button>
        </div>
      </Card>
    )
  }

  // Provperioden (eller årslicensen) är slut.
  return (
    <Card tone="sol" padding="md" className={className} as="section" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">
        {status.kind === 'utgangen' && status.licenseExpired ? 'Årslicensen har gått ut' : 'Provperioden är slut'} – din data finns kvar
      </h2>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
        Du kan se, exportera och radera allt som vanligt. För att logga nytt behöver du en licens: {pricesText()}, utan automatisk förnyelse.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button to="/premium" size="sm" iconLeft={Sprout}>
          Se priser
        </Button>
        <Button to="/installningar/data" size="sm" variant="ghost" iconLeft={Download}>
          Exportera min data
        </Button>
      </div>
    </Card>
  )
})

/** Kort statusrad för Lagom Premium, t.ex. "Provperiod · 11 dagar kvar". */
export function premiumStatusLine(status: AccessStatus): string {
  switch (status.kind) {
    case 'ny':
      return 'Prova gratis i 14 dagar'
    case 'prov':
      return `Provperiod · ${daysText(status.daysLeft)} kvar`
    case 'utgangen':
      return status.licenseExpired ? 'Licensen har gått ut · din data finns kvar' : 'Provperioden är slut · din data finns kvar'
    case 'licensierad':
      return status.expiresAt === undefined
        ? `${status.plan?.name ?? 'Licens'} · aktiv${status.test ? ' (test)' : ''}`
        : `${status.plan?.name ?? 'Licens'} · till ${formatLongDate(status.expiresAt)}${status.test ? ' (test)' : ''}`
  }
}

export function PremiumHubCard() {
  const { status, checking } = useAccess()
  return (
    <Card to="/premium" tone={status.kind === 'utgangen' ? 'sol' : 'gran'} padding="sm" aria-label={`Lagom Premium. ${checking ? 'Kontrollerar licensen' : premiumStatusLine(status)}`}>
      <div className="flex items-center gap-3 px-1">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface text-gran shadow-card">
          <Sprout className="size-[1.3rem]" strokeWidth={2.1} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink">Lagom Premium</span>
          <span className="block text-[0.8125rem] leading-snug text-ink-2">{checking ? 'Kontrollerar licensen …' : premiumStatusLine(status)}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
      </div>
    </Card>
  )
}
