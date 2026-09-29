/**
 * Byggstenar för Lagom Premium: status, planer, köpark med samtycke, aktivering av licensnyckel,
 * visning av nyckeln och köpvillkoren. Används av köpsidan, tacksidan och Inställningar → Licens.
 *
 * Stripe, kronpriser och webbens köpvillkor visas bara när `sellsOnWeb()`. I butiksapparna visas
 * i stället `StorePurchasePanel` (köp i appen, priset från butiken) och butiksvarianten av
 * villkoren; när webbförsäljningen är avstängd visas länkar till appbutikerna (`StoreLinksPanel`).
 *
 * Webbköpens delar (planerna med kronpriser, köparket, säljarraden, testläget, länkarna till
 * appbutikerna och "Tappat nyckeln?") ritar ingenting i butiksbyggena och tas bort ur deras paket
 * (`WEB_PURCHASES`), liksom aktiveringen av licensnycklar i App Store-bygget (`KEY_ENTRY`).
 * Därför är de tunna omslag runt komponenter med hooks.
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeCheck,
  Check,
  ChefHat,
  CircleCheck,
  ChartNoAxesColumn,
  Copy,
  Download,
  ExternalLink as ExternalLinkIcon,
  Eye,
  EyeOff,
  FlaskConical,
  KeyRound,
  Leaf,
  LockOpen,
  Mail,
  MegaphoneOff,
  ScanBarcode,
  ShieldCheck,
  Smartphone,
  Trash,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, ExternalLink, ProgressBar, Sheet, Spinner, TextField, confirmDialog, cx, toast, toneVars, type Tone } from '../../components/ui'
import { LogoMark } from '../../components/layout/Logo'
import {
  APPSTORE_URL,
  COMMERCE_MODE,
  LIFETIME_PROMISE,
  PLAY_URL,
  SELLER_ADDRESS,
  SELLER_NAME,
  SELLER_ORGNR,
  SELLER_PHONE,
  SUPPORT_EMAIL,
  TERMS_URL,
  TRIAL_DAYS,
  type Plan,
  type PlanId,
} from '../../config/commerce'
import { IS_STORE_BUILD, KEY_ENTRY_BUILD, WEB_PURCHASES_BUILD, isInApp, sellsOnWeb, trialViaStore } from '../../config/platform'
import { formatNumber } from '../../lib/format'
import { getStorePurchases, type StoreProduct, type StoreProductId } from '../../lib/storePurchases'
import { haptic } from '../../native'
import type { AccessStatus } from '../../hooks/useAccess'
import { useLicenseStore } from '../../stores/licenseStore'
import {
  PurchaseError,
  RECOVER_ERRORS,
  activateLicense,
  buyInStore,
  copyText,
  formatKronor,
  formatPrice,
  licenseMailto,
  looksLikeEmail,
  perMonthText,
  recoverLicense,
  rememberStorePrices,
  statusSummary,
  storeAccountName,
  storeName,
  type ActivationResult,
} from './premiumLogic'
import { RestorePurchasesButton } from './RestorePurchasesButton'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/** Webbköpen finns i bygget (bara webbygget) – en konstant i samma modul, se WEB_PURCHASES_BUILD. */
const WEB_PURCHASES: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ === 'web' : WEB_PURCHASES_BUILD

/** Licensnycklar kan aktiveras i bygget (webben och Google Play, inte App Store) – se KEY_ENTRY_BUILD. */
const KEY_ENTRY: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'appstore' : KEY_ENTRY_BUILD

/**
 * Etiketten på det framlyfta alternativet. Ärlig: med 349 kr/år och 699 kr för livstid blir
 * livstidslicensen billigare från det tredje året.
 */
export const FEATURED_LABEL = 'Bäst värde'

// ---------------------------------------------------------------------------
// Testläge
// ---------------------------------------------------------------------------

export function TestModeBanner({ className }: { className?: string }) {
  // Butiksappar verifierar alltid som i skarpt läge, och utan webbköp finns ingen köpknapp att testa.
  if (!WEB_PURCHASES || COMMERCE_MODE !== 'test' || IS_STORE_BUILD || !sellsOnWeb()) return null
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
  { icon: ScanBarcode, tone: 'gran', title: 'Streckkodsläsare', text: 'Skanna förpackningar – ingår i licensen, inget tillägg.' },
  { icon: Leaf, tone: 'mossa', title: 'Alla näringsämnen', text: 'Vitaminer, mineraler, fibrer och NNR 2023.' },
  { icon: ChefHat, tone: 'lingon', title: 'Recept och klassiker', text: 'Egna recept räknade på tillagad vikt.' },
  { icon: ChartNoAxesColumn, tone: 'blabar', title: 'Insikter och adaptiva mål', text: 'Kostråd, Tallriksmodellen och klimat.' },
  { icon: Download, tone: 'fjall', title: 'Export och säkerhetskopia', text: 'JSON och Excel (CSV) – din data är din.' },
  { icon: MegaphoneOff, tone: 'vinbar', title: 'Ingen reklam', text: 'Inga konton, ingen spårning, inga dolda avgifter.' },
  { icon: ShieldCheck, tone: 'gran', title: 'Data på din enhet', text: 'Dagboken sparas bara på din enhet.' },
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

type PlanCardProps = { plan: Plan; onChoose: (plan: Plan) => void; cta?: string }

/** En plan med kronpris (webbköp). Ritar ingenting i butiksbyggena. */
export function PlanCard(props: PlanCardProps) {
  return WEB_PURCHASES ? <WebPlanCard {...props} /> : null
}

function WebPlanCard({ plan, onChoose, cta }: PlanCardProps) {
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
// Säljare och köpvillkor
// ---------------------------------------------------------------------------

/**
 * Säljarens uppgifter på en rad (distansavtalslagen): "Namn, org.nr …, adress, tel. …, e-post".
 * Tomma delar hoppas över, så att inga tomma etiketter visas innan uppgifterna finns.
 */
export function sellerLine(opts: { email?: boolean } = {}): string {
  return [
    SELLER_NAME,
    SELLER_ORGNR && `org.nr ${SELLER_ORGNR}`,
    SELLER_ADDRESS,
    SELLER_PHONE && `tel. ${SELLER_PHONE}`,
    (opts.email ?? true) && SUPPORT_EMAIL,
  ]
    .filter(Boolean)
    .join(', ')
}

interface TermItem {
  title: string
  text: string
}

/**
 * Vad livstidslicensen innebär – samma löfte som i de fullständiga villkoren och på kvittot
 * (LIFETIME_PROMISE), på webben och i butiksapparna.
 */
const LIFETIME_TERMS = `${LIFETIME_PROMISE} Du kan alltid exportera din data.`

const PRIVACY_BASE = 'Din dagbok stannar på din enhet och skickas aldrig till oss.'

/** Köpvillkoren på webben (köp med Stripe och licensnyckel). */
function webTerms(): TermItem[] {
  return [
    { title: 'Säljare', text: `${sellerLine()}. Mejla oss om du har frågor om köp, kvitton eller licenser.` },
    {
      title: 'Vad du köper',
      text: 'En personlig licens till Lagom med alla funktioner – inga tillägg och ingen reklam. Årslicensen gäller i 365 dagar från köpet.',
    },
    { title: 'Livstidslicensen', text: LIFETIME_TERMS },
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
      text: 'Licensen levereras direkt efter betalningen. Vid köp på distans har du normalt 14 dagars ångerrätt, men för digitalt innehåll som levereras direkt upphör den när leveransen har påbörjats – om du har samtyckt till det, vilket du gör i rutan före köpet (2 kap. 11 § lagen om distansavtal). Din rätt att reklamera fel enligt konsumentlagstiftningen påverkas inte.',
    },
    {
      title: 'Licensen',
      text: 'Licensen är personlig och får användas på dina egna enheter. Den är en nyckel som du klistrar in på varje enhet – inget konto behövs. Spara nyckeln säkert. Tappar du bort den hjälper vi dig om du mejlar oss ditt kvitto. Om köpet återbetalas slutar licensen att gälla – din data finns kvar och går att exportera.',
    },
    {
      title: 'Provperiod',
      text: `De första ${TRIAL_DAYS} dagarna är gratis och kräver inget kort. Efter provperioden kan du fortfarande se, exportera och radera all din data – bara ny loggning kräver en licens.`,
    },
    {
      title: 'Funktion och kompatibilitet',
      text: 'Lagom fungerar i moderna webbläsare och offline. Din data sparas i den webbläsare och på den enhet där du använder appen, och licensnyckeln klistras in på varje enhet.',
    },
    {
      title: 'Integritet',
      text: `${PRIVACY_BASE} Vid köp hanterar Stripe betalningen och din e-postadress för kvittot. Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.`,
    },
    {
      title: 'Tvister',
      text: 'Vid en tvist kan du vända dig till Allmänna reklamationsnämnden (ARN), www.arn.se. Svensk lag gäller.',
    },
  ]
}

/**
 * Köpvillkoren i butiksapparna (köp i appen). I en app nämns bara den egna butiken – Apple
 * godkänner inte att en annan plattform nämns i iPhone-appen (riktlinje 2.3.10). På webben med
 * webbförsäljningen avstängd nämns båda.
 */
function storeTerms(): TermItem[] {
  const inApp = isInApp()
  const store = inApp ? storeName() : 'App Store eller Google Play'
  const refund = !inApp ? 'reportaproblem.apple.com respektive Google Play' : store === 'App Store' ? 'på reportaproblem.apple.com' : 'i Google Play'
  const account = inApp ? storeAccountName() : 'Apple- eller Google-konto'
  return [
    { title: 'Säljare', text: `${sellerLine()}.` },
    {
      title: 'Köp och betalning',
      text: `Köpet görs via ${store}, som sköter betalning, moms, kvitto och eventuell återbetalning (${refund}).`,
    },
    {
      title: 'Vad du köper',
      text: 'En personlig licens till Lagom med alla funktioner – inga tillägg och ingen reklam. Årslicensen gäller i ett år från köpet och förnyas inte automatiskt.',
    },
    { title: 'Livstidslicensen', text: LIFETIME_TERMS },
    {
      title: 'Dina enheter',
      text: `Licensen gäller på dina enheter med samma ${account} – tryck på Återställ köp på en ny enhet.`,
    },
    {
      title: 'Provperiod',
      text: trialViaStore()
        ? `De första ${TRIAL_DAYS} dagarna är gratis. Provperioden startas med ett gratis köp i App Store och gäller en gång per Apple-konto. Sedan spärras bara ny loggning – du kan fortfarande se, exportera och radera all din data.`
        : `De första ${TRIAL_DAYS} dagarna är gratis. Sedan spärras bara ny loggning – du kan fortfarande se, exportera och radera all din data.`,
    },
    { title: 'Integritet', text: `${PRIVACY_BASE} Betalningen sköts av butiken – vi får aldrig dina kortuppgifter.` },
    { title: 'Reklamation', text: 'Din rätt att reklamera fel enligt konsumentlagstiftningen påverkas inte.' },
  ]
}

const TEXT_LINK = 'inline-flex min-h-11 items-center gap-1.5 self-start text-[0.9375rem] font-semibold text-gran underline-offset-2 hover:underline'

/**
 * Köpvillkoren i korthet. `inSheet`: visas i köparket – länken till de fullständiga villkoren
 * öppnas då i en ny flik, så att arket och samtycket finns kvar.
 */
export function TermsContent({ headingLevel = 3, inSheet = false }: { headingLevel?: 3 | 4; inSheet?: boolean }) {
  const H = headingLevel === 3 ? 'h3' : 'h4'
  const web = WEB_PURCHASES && sellsOnWeb()
  // Konstanten står med i villkoren, så att webbens villkor (Stripe) tas bort ur butiksbyggena.
  const terms = WEB_PURCHASES && web ? webTerms() : storeTerms()
  return (
    <div className="flex flex-col gap-4">
      {terms.map((t) => (
        <div key={t.title}>
          <H className="text-[0.9375rem] font-semibold text-ink">{t.title}</H>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">{t.text}</p>
        </div>
      ))}
      <div className="flex flex-col">
        {inSheet ? (
          <ExternalLink href="#/villkor" showIcon={false} className={TEXT_LINK}>
            Fullständiga köpvillkor
            <ExternalLinkIcon aria-hidden className="size-4" />
          </ExternalLink>
        ) : (
          <Link to="/villkor" className={TEXT_LINK}>
            Fullständiga köpvillkor
          </Link>
        )}
        {!inSheet && (
          <Link to="/integritet" className={TEXT_LINK}>
            Integritetspolicy
          </Link>
        )}
        {WEB_PURCHASES && web && TERMS_URL && (
          <ExternalLink href={TERMS_URL} showIcon={false} className={TEXT_LINK}>
            Hela köpvillkoren på webbplatsen
            <ExternalLinkIcon aria-hidden className="size-4" />
          </ExternalLink>
        )}
      </div>
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

function SellerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3 text-[0.8125rem] text-ink-2">
      <dt>{label}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  )
}

interface CheckoutSheetProps {
  plan: Plan | null
  open: boolean
  onClose: () => void
  /** Anropas först när samtycket är givet. */
  onConfirm: (plan: Plan) => void
  busy: boolean
  error: string | null
}

/** Köparket för webbköp (Stripe). Ritar ingenting i butiksbyggena. */
export function CheckoutSheet(props: CheckoutSheetProps) {
  return WEB_PURCHASES ? <WebCheckoutSheet {...props} /> : null
}

function WebCheckoutSheet({ plan, open, onClose, onConfirm, busy, error }: CheckoutSheetProps) {
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
            {(test || sellsOnWeb()) && (
              <p className="text-center text-[0.75rem] leading-snug text-ink-3">
                {test ? 'Ingen betalning görs i testläget.' : 'Du betalar säkert hos Stripe och kommer sedan tillbaka hit.'}
              </p>
            )}
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
              <dd className="tabular-nums">{formatKronor(vatOf(plan.priceKr))}</dd>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-line pt-3 text-[0.8125rem] text-ink-2">
              <dt>Giltighet</dt>
              <dd className="text-right">{plan.durationDays ? `${formatNumber(plan.durationDays)} dagar · förnyas inte automatiskt` : 'Ingen tidsgräns · engångsköp'}</dd>
            </div>
            <SellerRow label="Säljare" value={SELLER_NAME} />
            {SELLER_ORGNR && <SellerRow label="Org.nr" value={SELLER_ORGNR} />}
            {SELLER_ADDRESS && <SellerRow label="Adress" value={SELLER_ADDRESS} />}
            {SELLER_PHONE && <SellerRow label="Telefon" value={SELLER_PHONE} />}
            <SellerRow label="E-post" value={SUPPORT_EMAIL} />
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
              <TermsContent headingLevel={3} inSheet />
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

type LicenseActivationProps = { onActivated?: (result: Extract<ActivationResult, { ok: true }>) => void; submitLabel?: string }

/**
 * Klistra in en licensnyckel och aktivera den på enheten. Ritar ingenting i App Store-bygget, där
 * licensnycklar inte kan aktiveras (`allowsLicenseKeyEntry()`).
 */
export function LicenseActivation(props: LicenseActivationProps) {
  return KEY_ENTRY ? <KeyActivationForm {...props} /> : null
}

function KeyActivationForm({ onActivated, submitLabel = 'Aktivera licensen' }: LicenseActivationProps) {
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

/** Liten rad med säljare, support och moms – längst ned på köpsidan (bara när Lagom säljs på webben). */
export function SellerFooter() {
  if (!WEB_PURCHASES) return null
  return (
    <footer className="flex flex-col items-center gap-1 px-2 pt-2 text-center text-[0.8125rem] leading-relaxed text-ink-3">
      <span className="inline-flex items-start gap-1.5">
        <BadgeCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Säljare: {sellerLine({ email: false })}</span>
      </span>
      <span>Alla priser inkl. 25 % moms</span>
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

// ---------------------------------------------------------------------------
// Köp i appen (App Store, Google Play)
// ---------------------------------------------------------------------------

/** Planerna utan kronor – i butiksapparna visar butiken priset. */
const STORE_PLAN_TEXT: Record<'ar' | 'livstid', { name: string; text: string }> = {
  ar: { name: 'Årslicens', text: 'Ett år · förnyas inte automatiskt' },
  livstid: { name: 'Livstidslicens', text: 'Engångsköp · för alltid på dina enheter' },
}

function isPlanProduct(p: StoreProduct): p is StoreProduct & { id: 'ar' | 'livstid' } {
  return p.id === 'ar' || p.id === 'livstid'
}

/**
 * Köp i butiksapparna: köpet görs i App Store eller Google Play (src/native/purchases.ts) och
 * priset visas av butiken. Inga kronpriser, ingen Stripe. Svarar butiken inte (eller körs
 * butiksbygget i en vanlig webbläsare) är köpknappen avstängd – "Återställ köp" finns alltid.
 * `note` visas under planerna, t.ex. att årslicensen i Google Play förnyas när den har gått ut.
 */
export function StorePurchasePanel({ headingId, planIds, note }: { headingId?: string; planIds?: readonly PlanId[]; note?: string }) {
  const autoId = useId()
  const hid = headingId ?? autoId
  const store = getStorePurchases()
  const available = store.available()
  const [products, setProducts] = useState<StoreProduct[] | null>(null)
  const [busy, setBusy] = useState<StoreProductId | null>(null)

  useEffect(() => {
    if (!available) return
    let alive = true
    store
      .getProducts()
      .then((list) => {
        // Samma priser i texterna före provperioden (priceSummaryText).
        rememberStorePrices(list)
        if (alive) setProducts(list.filter(isPlanProduct))
      })
      .catch(() => alive && setProducts([]))
    return () => {
      alive = false
    }
  }, [available, store])

  const buy = async (id: StoreProductId) => {
    if (busy) return
    setBusy(id)
    const result = await buyInStore(id)
    setBusy(null)
    if (result === 'purchased') {
      haptic('success')
      toast('Tack! Lagom är upplåst.', { tone: 'success' })
    }
    else if (result === 'pending') toast('Köpet väntar på godkännande i butiken. Lagom låses upp när det är klart.')
    else if (result === 'failed') toast('Köpet kunde inte genomföras. Försök igen om en stund.', { tone: 'error' })
  }

  // Bara det som är värt att erbjuda (t.ex. inte årslicensen till den som redan har en färsk).
  const offered = (id: 'ar' | 'livstid') => !planIds || planIds.includes(id)
  const planList = products && products.length > 0 ? products.filter(isPlanProduct).filter((p) => offered(p.id)) : null

  return (
    <Card as="section" aria-labelledby={hid} padding="lg">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gran-soft text-gran">
          <LockOpen className="size-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 id={hid} className="font-display text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">
            Lås upp Lagom
          </h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">Köpet görs i {storeName()}.</p>
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">Priset visas av butiken.</p>
        </div>
      </div>

      {planList ? (
        <ul className="mt-5 flex flex-col gap-3">
          {planList.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{p.title || STORE_PLAN_TEXT[p.id].name}</p>
                <p className="text-[0.8125rem] leading-snug text-ink-3">
                  {STORE_PLAN_TEXT[p.id].text}
                  {p.displayPrice ? ` · ${p.displayPrice}` : ''}
                </p>
              </div>
              <Button onClick={() => void buy(p.id)} loading={busy === p.id} disabled={busy !== null && busy !== p.id}>
                Köp {(p.title || STORE_PLAN_TEXT[p.id].name).toLocaleLowerCase('sv-SE')}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="mt-5 flex flex-col gap-2">
            {(['ar', 'livstid'] as const).filter(offered).map((id) => (
              <li key={id} className="flex items-start gap-2.5 text-[0.9375rem] leading-snug text-ink-2">
                <Check className="mt-0.5 size-4 shrink-0 text-good" strokeWidth={2.6} aria-hidden />
                <span>
                  <span className="font-semibold text-ink">{STORE_PLAN_TEXT[id].name}</span> · {STORE_PLAN_TEXT[id].text}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5">
            {available && products === null ? (
              <Button fullWidth disabled>
                <Spinner />
                Hämtar priser från butiken …
              </Button>
            ) : (
              // Butiken svarar inte (eller köp i appen går inte att nå här) – lova aldrig något framtida.
              <Button fullWidth disabled>
                Köp är inte tillgängliga just nu
              </Button>
            )}
            {!(available && products === null) && <p className="mt-2 text-[0.8125rem] leading-snug text-ink-3">Försök igen om en stund.</p>}
          </div>
        </>
      )}

      {note && <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-2">{note}</p>}

      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-[0.875rem] leading-relaxed text-ink-2">Har du redan köpt Lagom, t.ex. på en annan telefon med samma konto?</p>
        <div>
          <RestorePurchasesButton />
        </div>
      </div>
    </Card>
  )
}

/**
 * Webben när webbförsäljningen är avstängd (`VITE_WEB_SALES=off`): Lagom köps i appbutikerna.
 * En länk som saknas visas inte. Licensnycklar från tidigare webbköp fungerar som vanligt. Bara
 * på webben – ritar ingenting i butiksbyggena.
 */
export function StoreLinksPanel(props: { headingId?: string }) {
  return WEB_PURCHASES ? <WebStoreLinksPanel {...props} /> : null
}

function WebStoreLinksPanel({ headingId }: { headingId?: string }) {
  const autoId = useId()
  const hid = headingId ?? autoId
  const links = [
    { href: APPSTORE_URL, label: 'Lagom i App Store' },
    { href: PLAY_URL, label: 'Lagom i Google Play' },
  ].filter((l) => l.href)
  return (
    <Card as="section" aria-labelledby={hid} padding="lg">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gran-soft text-gran">
          <Smartphone className="size-5" strokeWidth={2.1} />
        </span>
        <div className="min-w-0">
          <h2 id={hid} className="font-display text-[1.375rem] font-semibold leading-tight tracking-tight text-ink">
            Lagom köps i appbutikerna
          </h2>
          <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            Ladda ned Lagom och köp licensen i appen – priset visas av butiken. Ett köp i appen gäller i appen, inte i den här webbläsaren.
          </p>
        </div>
      </div>
      {links.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {links.map((l) => (
            <ExternalLink
              key={l.href}
              href={l.href}
              showIcon={false}
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-gran px-5 text-[0.9375rem] font-semibold text-on-gran shadow-card transition-colors hover:bg-gran-strong"
            >
              {l.label}
              <ExternalLinkIcon aria-hidden className="size-4" />
            </ExternalLink>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-3">Länkarna till appbutikerna kommer snart.</p>
      )}
      <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-2">Har du redan en licensnyckel från ett webbköp? Den fungerar som vanligt – aktivera den längre ned.</p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// "Tappat nyckeln?"
// ---------------------------------------------------------------------------

/**
 * Hämta licensnyckeln från ett webbköp igen med e-post och kvittonummer. Visas bara där
 * webbköpen har gjorts (`offersLicenseRecovery()`), aldrig i butiksapparna – där ritar den
 * ingenting och följer inte med i paketet.
 */
export function LicenseRecovery() {
  return WEB_PURCHASES ? <WebLicenseRecovery /> : null
}

function WebLicenseRecovery() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [receipt, setReceipt] = useState('')
  const [errors, setErrors] = useState<{ email?: string; receipt?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)
  const savedKey = useLicenseStore((s) => s.licenseKey)
  const panelId = useId()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const next: typeof errors = {}
    if (!looksLikeEmail(email)) next.email = RECOVER_ERRORS.email
    if (!receipt.trim()) next.receipt = RECOVER_ERRORS.receipt
    setErrors(next)
    if (next.email || next.receipt) return
    setBusy(true)
    try {
      setKey(await recoverLicense(email, receipt))
    } catch (err) {
      setErrors({ form: err instanceof PurchaseError ? err.message : RECOVER_ERRORS.server })
    } finally {
      setBusy(false)
    }
  }

  const activate = async () => {
    if (!key || activating) return
    setActivating(true)
    setActivationError(null)
    const result = await activateLicense(key)
    setActivating(false)
    if (!result.ok) {
      setActivationError(result.message)
      return
    }
    toast(`${result.payload.plan === 'livstid' ? 'Livstidslicensen' : 'Årslicensen'} är aktiverad – tack!`, { tone: 'success' })
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl text-[0.9375rem] font-semibold text-gran underline-offset-2 hover:underline"
      >
        <KeyRound aria-hidden className="size-4" />
        Tappat nyckeln?
      </button>
      {open && (
        <div id={panelId} className="flex flex-col gap-3">
          {key ? (
            <>
              <LicenseKeyBox licenseKey={key} intro="Här är din licensnyckel. Spara den på ett säkert ställe, t.ex. i din lösenordshanterare." />
              {savedKey === key ? (
                <p className="text-[0.875rem] leading-relaxed text-ink-2">Nyckeln är aktiverad på den här enheten.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {activationError && (
                    <p role="alert" className="rounded-xl bg-lingon-soft px-3 py-2 text-[0.875rem] leading-snug text-ink">
                      {activationError}
                    </p>
                  )}
                  <div>
                    <Button iconLeft={KeyRound} loading={activating} onClick={() => void activate()}>
                      Aktivera på den här enheten
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <form onSubmit={submit} noValidate className="flex flex-col gap-3">
              <p className="text-[0.875rem] leading-relaxed text-ink-2">
                Skriv e-postadressen du använde vid köpet och kvittonumret (eller ordernumret) från kvittot från Stripe, så hämtar vi din licensnyckel igen.
              </p>
              <TextField
                label="E-post"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onValueChange={(v) => {
                  setEmail(v)
                  if (errors.email || errors.form) setErrors((x) => ({ ...x, email: undefined, form: undefined }))
                }}
                error={errors.email}
              />
              <TextField
                label="Kvittonummer eller ordernummer"
                hint="Står på kvittot från Stripe, t.ex. 1234-5678."
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={receipt}
                onValueChange={(v) => {
                  setReceipt(v)
                  if (errors.receipt || errors.form) setErrors((x) => ({ ...x, receipt: undefined, form: undefined }))
                }}
                error={errors.receipt}
              />
              {errors.form && (
                <p role="alert" className="rounded-xl bg-lingon-soft px-3 py-2 text-[0.875rem] leading-snug text-ink">
                  {errors.form}
                </p>
              )}
              <div>
                <Button type="submit" variant="secondary" iconLeft={Mail} loading={busy}>
                  Hämta min licensnyckel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
