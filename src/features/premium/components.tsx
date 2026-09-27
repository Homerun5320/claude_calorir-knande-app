/**
 * Byggstenar för Lagom Premium: status, planer, köpark med samtycke, aktivering av licensnyckel,
 * visning av nyckeln och köpvillkoren. Används av köpsidan, tacksidan och Inställningar → Licens.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  BadgeCheck,
  Check,
  ChefHat,
  CircleCheck,
  ChartNoAxesColumn,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Leaf,
  Mail,
  MegaphoneOff,
  ScanBarcode,
  ShieldCheck,
  Trash,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, ProgressBar, Sheet, TextField, confirmDialog, cx, toast, toneVars, type Tone } from '../../components/ui'
import { LogoMark } from '../../components/layout/Logo'
import { COMMERCE_MODE, SELLER_NAME, SUPPORT_EMAIL, TRIAL_DAYS, type Plan } from '../../config/commerce'
import { formatNumber } from '../../lib/format'
import type { AccessStatus } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import { activateLicense, copyText, formatPrice, licenseMailto, perMonthText, statusSummary, type ActivationResult } from './premiumLogic'

/** Etiketten på det framlyfta alternativet. Ärlig: livstid blir billigare än årslicens efter två år. */
export const FEATURED_LABEL = 'Bäst värde'

// ---------------------------------------------------------------------------
// Testläge
// ---------------------------------------------------------------------------

export function TestModeBanner({ className }: { className?: string }) {
  if (COMMERCE_MODE !== 'test') return null
  return (
    <div role="note" className={cx('flex items-start gap-3 rounded-2xl bg-hjortron-soft px-4 py-3 text-[0.875rem] leading-relaxed text-ink', className)}>
      <FlaskConical className="mt-0.5 size-5 shrink-0 text-hjortron" aria-hidden />
      <p>
        <strong className="font-semibold">Testläge: betalningar är avstängda.</strong> Köpknappen ger en testlicens direkt, utan betalning. Testlicenser
        gäller inte i den skarpa appen.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

export function StatusHero({ status, actions }: { status: AccessStatus; actions?: ReactNode }) {
  const s = statusSummary(status)
  const headingId = useId()
  const test = status.kind === 'licensierad' && status.test
  const trialDay = status.kind === 'prov' ? Math.min(TRIAL_DAYS, Math.max(1, TRIAL_DAYS - Math.ceil((status.endsAt - Date.now()) / DAY_MS) + 1)) : 0
  return (
    <Card as="section" aria-labelledby={headingId} tone={s.tone} padding="lg">
      <div className="flex items-start gap-4">
        <LogoMark size={48} className="shrink-0" />
        <div className="min-w-0">
          <p className="eyebrow flex flex-wrap items-center gap-2">
            {s.label}
            {test && <Badge tone="hjortron">Testlicens</Badge>}
          </p>
          <h2 id={headingId} className="mt-1 font-display text-[1.5rem] leading-tight font-semibold tracking-tight text-balance text-ink sm:text-[1.75rem]">
            {s.title}
          </h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{s.text}</p>
        </div>
      </div>
      {status.kind === 'prov' && (
        <ProgressBar
          className="mt-5"
          value={trialDay}
          max={TRIAL_DAYS}
          size="sm"
          label={<span className="text-[0.8125rem] text-ink-2">Dag {trialDay} av {TRIAL_DAYS}</span>}
          valueText={`Dag ${trialDay} av ${TRIAL_DAYS} i provperioden`}
          animate={false}
        />
      )}
      {actions && <div className="mt-5 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Vad som ingår
// ---------------------------------------------------------------------------

const FEATURES: ReadonlyArray<{ icon: LucideIcon; tone: Tone; title: string; text: string }> = [
  { icon: Wheat, tone: 'hjortron', title: 'Svenska livsmedel och mått', text: 'Livsmedelsverkets värden, dl, msk och krm.' },
  { icon: ScanBarcode, tone: 'gran', title: 'Streckkodsläsare', text: 'Skanna förpackningar – ingår alltid.' },
  { icon: Leaf, tone: 'mossa', title: 'Alla näringsämnen', text: 'Vitaminer, mineraler, fibrer och NNR 2023.' },
  { icon: ChefHat, tone: 'lingon', title: 'Recept och klassiker', text: 'Egna recept räknade på tillagad vikt.' },
  { icon: ChartNoAxesColumn, tone: 'blabar', title: 'Insikter och adaptiva mål', text: 'Kostråd, Tallriksmodellen och klimat.' },
  { icon: Download, tone: 'fjall', title: 'Export och säkerhetskopia', text: 'JSON och Excel (CSV) – din data är din.' },
  { icon: MegaphoneOff, tone: 'vinbar', title: 'Ingen reklam', text: 'Inga konton, ingen spårning, inga dolda avgifter.' },
  { icon: ShieldCheck, tone: 'gran', title: 'Data på din enhet', text: 'Dagboken lämnar aldrig telefonen.' },
]

export function FeatureList() {
  return (
    <ul className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2">
      {FEATURES.map((f) => (
        <li key={f.title} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card">
          <span style={toneVars(f.tone)} aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--tone-soft) text-(--tone)">
            <f.icon className="size-5" strokeWidth={2.1} />
          </span>
          <span className="min-w-0">
            <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">{f.title}</span>
            <span className="block text-[0.8125rem] leading-snug text-ink-3">{f.text}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Planer
// ---------------------------------------------------------------------------

export function PlanCard({ plan, onChoose, cta }: { plan: Plan; onChoose: (plan: Plan) => void; cta?: string }) {
  const headingId = useId()
  const perMonth = perMonthText(plan)
  return (
    <article
      aria-labelledby={headingId}
      className={cx('card relative flex flex-col p-5 sm:p-6', plan.featured && 'ring-2 ring-gran ring-inset')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={headingId} className="font-display text-[1.3125rem] font-semibold leading-tight tracking-tight text-ink">
            {plan.name}
          </h3>
          <p className="mt-1 text-[0.8125rem] leading-snug text-ink-3">{plan.period}</p>
        </div>
        {plan.featured && (
          <Badge tone="gran" variant="solid" size="md">
            {FEATURED_LABEL}
          </Badge>
        )}
      </div>
      <p className="mt-5 flex items-baseline gap-1.5 text-ink">
        <span className="display-num text-[3rem] leading-none font-semibold">{formatNumber(plan.priceKr)}</span>
        <span className="text-[1.0625rem] font-semibold">kr</span>
      </p>
      <p className="mt-1.5 text-[0.8125rem] text-ink-3">inkl. moms{perMonth ? ` · ungefär ${perMonth}` : ' · betala en gång'}</p>
      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-ink-2">
            <Check className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={2.6} aria-hidden />
            {perk}
          </li>
        ))}
      </ul>
      <Button className="mt-6" fullWidth variant={plan.featured ? 'primary' : 'secondary'} onClick={() => onChoose(plan)} aria-describedby={headingId}>
        {cta ?? `Välj ${plan.name.toLocaleLowerCase('sv-SE')}`}
      </Button>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Köpvillkor
// ---------------------------------------------------------------------------

const TERMS: ReadonlyArray<{ title: string; text: string }> = [
  { title: 'Säljare', text: `${SELLER_NAME}. Frågor om köp, kvitton och licenser: ${SUPPORT_EMAIL}.` },
  {
    title: 'Vad du köper',
    text: 'En personlig licens till Lagom med alla funktioner – inga tillägg och ingen reklam. Årslicensen gäller i 365 dagar från köpet, livstidslicensen har ingen tidsgräns.',
  },
  {
    title: 'Pris och betalning',
    text: 'Priserna är i svenska kronor inklusive 25 % moms. Betalningen sköts av Stripe – Lagom ser eller sparar aldrig dina kortuppgifter. Kvitto skickas till den e-post du anger vid betalningen.',
  },
  {
    title: 'Ingen automatisk förnyelse',
    text: 'Årslicensen förnyas inte och inget dras automatiskt. När året är slut väljer du själv om du vill köpa en ny – din data finns kvar oavsett.',
  },
  {
    title: 'Leverans och ångerrätt',
    text: 'Licensen levereras direkt efter betalningen. Vid köp på distans har du normalt 14 dagars ångerrätt, men för digitalt innehåll som levereras direkt upphör den när leveransen har påbörjats – om du har samtyckt till det, vilket du gör i rutan före köpet (2 kap. 11 § lagen om distansavtal). Din rätt att reklamera fel enligt konsumentköplagen påverkas inte.',
  },
  {
    title: 'Licensen',
    text: 'Licensen är personlig och får användas på dina egna enheter. Den är en nyckel som du klistrar in på varje enhet – inget konto behövs. Spara nyckeln säkert. Tappar du bort den hjälper vi dig om du mejlar oss ditt kvitto.',
  },
  {
    title: 'Provperiod',
    text: `De första ${TRIAL_DAYS} dagarna är gratis och kräver inget kort. Efter provperioden kan du fortfarande se, exportera och radera all din data – bara ny loggning kräver en licens.`,
  },
  {
    title: 'Integritet',
    text: 'Din dagbok stannar på din enhet och skickas aldrig till oss. Vid köp hanterar Stripe betalningen och din e-postadress för kvittot. Licensnyckeln innehåller inga personuppgifter – bara licenstyp, datum och ett köp-id.',
  },
]

export function TermsContent({ headingLevel = 3 }: { headingLevel?: 3 | 4 }) {
  const H = headingLevel === 3 ? 'h3' : 'h4'
  return (
    <div className="flex flex-col gap-4">
      {TERMS.map((t) => (
        <div key={t.title}>
          <H className="text-[0.9375rem] font-semibold text-ink">{t.title}</H>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">{t.text}</p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Köpark (sammanfattning, samtycke och köpknapp)
// ---------------------------------------------------------------------------

/** Momsen i ett pris inklusive 25 % moms, i kronor med ören. */
export function vatOf(priceKr: number): number {
  return Math.round(priceKr * 20) / 100
}

export const CONSENT_TEXT =
  'Jag vill att licensen levereras direkt och samtycker till att min ångerrätt på 14 dagar därmed upphör när leveransen har påbörjats.'
export const CONSENT_ERROR = 'Kryssa i rutan för att fortsätta – annars kan licensen inte levereras direkt.'

export function CheckoutSheet({
  plan,
  open,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  plan: Plan | null
  open: boolean
  onClose: () => void
  /** Anropas först när samtycket är givet. */
  onConfirm: (plan: Plan) => void
  busy: boolean
  error: string | null
}) {
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const checkboxRef = useRef<HTMLInputElement>(null)
  const checkboxId = useId()
  const errorId = useId()
  const test = COMMERCE_MODE === 'test'

  const buy = () => {
    if (!plan || busy) return
    if (!consent) {
      setConsentError(true)
      checkboxRef.current?.focus()
      return
    }
    onConfirm(plan)
  }

  const reset = () => {
    setConsent(false)
    setConsentError(false)
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose()
      }}
      onExitComplete={reset}
      title={plan ? `Köp ${plan.name.toLocaleLowerCase('sv-SE')}` : 'Köp'}
      description={plan ? `Lagom · ${plan.period}` : undefined}
      footer={
        plan && (
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="rounded-xl bg-lingon-soft px-3 py-2 text-[0.875rem] leading-snug text-ink">
                {error}
              </p>
            )}
            <Button fullWidth size="lg" onClick={buy} loading={busy} iconLeft={test ? FlaskConical : undefined}>
              {test ? 'Köp (testläge – ingen betalning)' : `Gå till betalning · ${formatPrice(plan.priceKr)}`}
            </Button>
            <p className="text-center text-[0.75rem] leading-snug text-ink-3">
              {test ? 'Ingen betalning görs i testläget.' : 'Du betalar säkert hos Stripe och kommer sedan tillbaka hit.'}
            </p>
          </div>
        )
      }
    >
      {plan && (
        <div className="flex flex-col gap-4">
          {test && <TestModeBanner />}
          <dl className="rounded-2xl bg-surface-2 p-4 text-[0.9375rem]">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold text-ink">{plan.name}</dt>
              <dd className="font-display text-[1.25rem] font-semibold tabular-nums text-ink">{formatPrice(plan.priceKr)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 text-[0.8125rem] text-ink-3">
              <dt>varav moms 25 %</dt>
              <dd className="tabular-nums">{formatNumber(vatOf(plan.priceKr), 2)}&nbsp;kr</dd>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-[0.8125rem] text-ink-2">
              <dt>Giltighet</dt>
              <dd className="text-right">{plan.durationDays ? `${formatNumber(plan.durationDays)} dagar · förnyas inte automatiskt` : 'Ingen tidsgräns · engångsköp'}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3 text-[0.8125rem] text-ink-2">
              <dt>Säljare</dt>
              <dd className="text-right">{SELLER_NAME}</dd>
            </div>
          </dl>

          <div>
            <label
              htmlFor={checkboxId}
              className={cx(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl p-3.5 ring-1 ring-inset transition-colors',
                consentError && !consent ? 'bg-lingon-soft ring-lingon/40' : 'bg-surface ring-line hover:bg-surface-2',
              )}
            >
              <input
                ref={checkboxRef}
                id={checkboxId}
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked)
                  if (e.target.checked) setConsentError(false)
                }}
                aria-invalid={consentError && !consent ? true : undefined}
                aria-describedby={consentError && !consent ? errorId : undefined}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-gran"
              />
              <span className="text-[0.875rem] leading-relaxed text-ink">{CONSENT_TEXT}</span>
            </label>
            {consentError && !consent && (
              <p id={errorId} role="alert" className="mt-2 px-1 text-[0.8125rem] leading-snug text-bad">
                {CONSENT_ERROR}
              </p>
            )}
          </div>

          <details className="group rounded-2xl bg-surface-2 px-4 py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[0.9375rem] font-semibold text-ink">
              Läs köpvillkoren
              <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="pb-4 pt-1">
              <TermsContent headingLevel={3} />
            </div>
          </details>
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Licensnyckeln
// ---------------------------------------------------------------------------

/** Nyckeln i en ruta med kopiera och mejla-till-mig. */
export function LicenseKeyBox({ licenseKey, intro }: { licenseKey: string; intro?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const ok = await copyText(licenseKey)
    if (ok) {
      setCopied(true)
      toast('Licensnyckeln är kopierad', { tone: 'success' })
      window.setTimeout(() => setCopied(false), 2500)
    } else {
      toast('Det gick inte att kopiera. Markera nyckeln och kopiera den själv.', { tone: 'error' })
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {intro && <div className="text-[0.875rem] leading-relaxed text-ink-2">{intro}</div>}
      <p
        className="rounded-2xl bg-surface-2 p-3.5 font-mono text-[0.8125rem] leading-relaxed break-all text-ink select-all"
        aria-label="Licensnyckel"
        data-testid="licensnyckel"
      >
        {licenseKey}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="soft" iconLeft={copied ? Check : Copy} onClick={copy}>
          {copied ? 'Kopierad' : 'Kopiera nyckeln'}
        </Button>
        <a
          href={licenseMailto(licenseKey)}
          className="relative inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[0.8125rem] font-semibold text-ink-2 transition-colors after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-surface-2 hover:text-ink"
        >
          <Mail aria-hidden className="size-4" />
          Mejla till mig själv
        </a>
      </div>
    </div>
  )
}

export const SAVE_KEY_ADVICE =
  'Spara nyckeln på ett säkert ställe, t.ex. i din lösenordshanterare eller i ett mejl till dig själv. Med den aktiverar du Lagom på en ny enhet.'

/** "Visa min licensnyckel" och "Ta bort licens från den här enheten". */
export function LicenseManage() {
  const licenseKey = useLicenseStore((s) => s.licenseKey)
  const [shown, setShown] = useState(false)
  if (!licenseKey) return null

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Ta bort licensen från enheten?',
      message:
        'Din data påverkas inte. Spara nyckeln först om du vill kunna aktivera igen – utan licens kan du bara logga nytt så länge provperioden pågår.',
      confirmLabel: 'Ta bort licensen',
      tone: 'danger',
      icon: Trash,
    })
    if (!ok) return
    useLicenseStore.getState().clearLicense()
    toast('Licensen är borttagen från den här enheten')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" iconLeft={shown ? EyeOff : Eye} onClick={() => setShown((v) => !v)} aria-expanded={shown}>
          {shown ? 'Dölj licensnyckeln' : 'Visa min licensnyckel'}
        </Button>
        <Button variant="ghost" size="sm" iconLeft={Trash} onClick={remove}>
          Ta bort licens från den här enheten
        </Button>
      </div>
      {shown && <LicenseKeyBox licenseKey={licenseKey} intro={SAVE_KEY_ADVICE} />}
    </div>
  )
}

/** Klistra in en licensnyckel och aktivera den på enheten. */
export function LicenseActivation({ onActivated, submitLabel = 'Aktivera licensen' }: { onActivated?: (result: Extract<ActivationResult, { ok: true }>) => void; submitLabel?: string }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const result = await activateLicense(value)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setValue('')
    toast(`${result.payload.plan === 'livstid' ? 'Livstidslicensen' : 'Årslicensen'} är aktiverad – tack!`, { tone: 'success' })
    onActivated?.(result)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <TextField
        multiline
        minRows={3}
        label="Licensnyckel"
        hint="Klistra in hela nyckeln – den börjar med LAGOM1."
        value={value}
        onValueChange={(v) => {
          setValue(v)
          if (error) setError(null)
        }}
        error={error ?? undefined}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="[&_textarea]:font-mono [&_textarea]:text-[0.8125rem]"
      />
      <div>
        <Button type="submit" iconLeft={KeyRound} loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Liten rad med säljare, support och moms – längst ned på köpsidan. */
export function SellerFooter() {
  return (
    <footer className="flex flex-col items-center gap-1 px-2 pt-2 text-center text-[0.8125rem] leading-relaxed text-ink-3">
      <span className="inline-flex items-center gap-1.5">
        <BadgeCheck aria-hidden className="size-4" />
        Säljare: {SELLER_NAME} · Alla priser inkl. 25 % moms
      </span>
      <span>
        Frågor om köp:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-gran underline-offset-2 hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </span>
    </footer>
  )
}

/** Kvittot i appen: tack, nyckeln och vägen vidare. Används efter köp och på tacksidan. */
export function PurchaseSuccess({ licenseKey, planName, next }: { licenseKey: string; planName?: string; next: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: false })
  }, [])
  return (
    <Card as="section" tone="mossa" padding="lg" aria-labelledby={headingId}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-surface text-good shadow-card">
          <CircleCheck className="size-6" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p className="eyebrow">{planName ?? 'Licens'} · aktiverad</p>
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="font-display text-[1.5rem] leading-tight font-semibold tracking-tight text-ink outline-none">
            Tack! Lagom är ditt.
          </h2>
        </div>
      </div>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">Licensen är aktiverad på den här enheten. Allt i Lagom är öppet – logga på som vanligt.</p>
      <div className="mt-4 rounded-2xl bg-surface p-4 shadow-card">
        <p className="mb-2 font-semibold text-ink">Spara din licensnyckel</p>
        <LicenseKeyBox licenseKey={licenseKey} intro={SAVE_KEY_ADVICE} />
      </div>
      <div className="mt-5">{next}</div>
    </Card>
  )
}
