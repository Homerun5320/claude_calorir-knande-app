/**
 * Om Lagom (/om) – vad Lagom är och vad den gör annorlunda, hur den räknar, källor och licenser,
 * integritet, felsökning och en medicinsk ansvarsfriskrivning. Nås även före välkomstflödet.
 *
 * Priser och betaltjänsten nämns bara där de får visas: kronpriser och Stripe bara när Lagom säljs
 * på webben (`sellsOnWeb()`) – i butiksapparna kommer priset från App Store eller Google Play.
 */
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  BadgeCheck,
  CircleSlash,
  Copy,
  ExternalLink,
  Flame,
  HeartHandshake,
  Leaf,
  Mail,
  Ruler,
  ShieldCheck,
  Soup,
  Stethoscope,
  Trash2,
  TrendingUp,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { Button, Card, ExternalLink as TextLink, ListGroup, ListRow, PageHeader, Sheet, Spinner, cx, toast, toneVars, type Tone } from '../../components/ui'
import { LogoMark, Wordmark } from '../../components/layout/Logo'
import { useProfileStore } from '../../stores/profileStore'
import { SupportSheet } from './SupportSheet'
import { SUPPORT_EMAIL, TRIAL_DAYS } from '../../config/commerce'
import { allowsLicenseKeyEntry, isNativeApp, sellsOnWeb, storagePlace } from '../../config/platform'
import { copyText, priceSummaryText } from '../premium/premiumLogic'
import { clearErrorLog, formatErrorReport, readErrorLog } from '../../lib/errorLog'
import { KCAL_PER_KG, MAX_DAILY_DEFICIT, MIN_KCAL, OLDER_ADULT_AGE } from '../../lib/energy'
import { formatNumber, plural } from '../../lib/format'
import { ACTIVITY_LEVELS } from '../../types'

/** Appens version från bygget (sätts i vite.config.ts), '0.0.0-dev' när den saknas. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'
/** Byggets id (t.ex. commit), 'lokal' när den saknas. */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'lokal'

/** Felrapporten i ett mejl får vara högst så här lång (mailto-länkar har en längdgräns). */
export const ERROR_MAIL_MAX_CHARS = 1500

interface Choice {
  icon: LucideIcon
  tone: Tone
  title: string
  text: string
}

/** Lagoms val – formulerade som vad Lagom gör, inte som brister hos andra appar. */
export const CHOICES: readonly Choice[] = [
  {
    icon: BadgeCheck,
    tone: 'mossa',
    title: 'Granskade svenska livsmedel',
    text: 'De flesta med värden direkt från Livsmedelsverket – övriga är samlingsvärden för vanliga märken, värden från förpackningar eller beräknade recept. Varje livsmedel visar sin källa, och användarbidrag från Open Food Facts märks tydligt.',
  },
  {
    icon: CircleSlash,
    tone: 'lingon',
    // Årslicensen är i butikerna en förbetald prenumeration som inte förnyas – "ingen prenumeration" vore fel där.
    title: 'Prova först – ingen automatisk förnyelse',
    text: `${TRIAL_DAYS} dagar gratis, sedan ${priceSummaryText()} – utan automatisk förnyelse. Ingen reklam och inga dolda avgifter; streckkodsläsaren och alla näringsämnen ingår.`,
  },
  {
    icon: WifiOff,
    tone: 'fjall',
    title: 'Allt sparas lokalt och fungerar offline',
    text: 'Säkerhetskopiera till en fil när du vill och exportera dagboken till Excel.',
  },
  {
    icon: Ruler,
    tone: 'hjortron',
    title: 'Svenska mått och livsmedel',
    text: 'Knäckebröd, falukorv och ärtsoppa – i dl, msk, tsk och krm. ”2 dl havregryn” räknas om till rätt vikt med livsmedlets densitet.',
  },
  {
    icon: TrendingUp,
    tone: 'blabar',
    title: 'Mål som följer dig',
    text: 'Adaptiva mål: Lagom kan räkna fram din faktiska förbrukning ur vikttrenden och det du ätit.',
  },
  {
    icon: Flame,
    tone: 'lingon',
    title: 'Försiktiga träningskalorier',
    text: 'Nettokalorier (MET minus vila) från 2024 Adult Compendium of Physical Activities, och du väljer själv hur stor del som räknas.',
  },
  {
    icon: Soup,
    tone: 'hjortron',
    title: 'Recept på tillagad vikt',
    text: 'Väg grytan när den är klar, så blir varje portion rätt.',
  },
  {
    icon: CircleSlash,
    tone: 'neutral',
    title: 'Okänt är inte ingenting',
    text: 'Saknade värden visas som ”–”, aldrig som 0, och Lagom visar hur fullständiga näringsvärdena är.',
  },
  {
    icon: HeartHandshake,
    tone: 'vinbar',
    title: 'En varm ton utan skuld',
    text: 'Ett medvetet läge utan siffror, kalorigolv, ingen viktnedgång vid graviditet, amning eller under 18 år – och vägar till stöd.',
  },
  {
    icon: ShieldCheck,
    tone: 'gran',
    title: 'Inga konton och ingen spårning',
    text: 'Din dagbok stannar på din enhet, och du kan exportera eller radera allt när som helst.',
  },
  {
    icon: Leaf,
    tone: 'mossa',
    title: 'Helheten, inte bara kalorier',
    text: 'Tallriksmodellen, Livsmedelsverkets kostråd, NNR 2023 och ungefärlig klimatpåverkan per måltid.',
  },
]

interface Source {
  name: string
  use: string
  /** Fullständig källhänvisning. */
  reference?: string
  license?: string
  licenseHref?: string
  href: string
}

export const SOURCES: readonly Source[] = [
  {
    name: 'Livsmedelsverkets livsmedelsdatabas',
    use: 'Namn och näringsvärden per 100 g. Hela databasen (2 606 livsmedel) ingår och fungerar offline. Värdena har bearbetats av Lagom (kategorier, portioner, avrundning och ifyllda värden).',
    license: 'CC BY 4.0',
    licenseHref: 'https://creativecommons.org/licenses/by/4.0/deed.sv',
    href: 'https://soknaringsinnehall.livsmedelsverket.se/',
  },
  {
    name: 'Nordiska näringsrekommendationer 2023 (NNR 2023)',
    use: 'Referensvärden för energi, makron, vitaminer och mineraler',
    reference: 'Nordiska ministerrådet. Nordic Nutrition Recommendations 2023. Köpenhamn 2023. Nord 2023:003.',
    href: 'https://www.norden.org/en/publication/nordic-nutrition-recommendations-2023',
  },
  { name: 'Livsmedelsverkets kostråd', use: 'Råd om frukt, grönt, fisk, kött, fullkorn och rörelse', href: 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/' },
  { name: 'Tallriksmodellen', use: 'Hur en balanserad måltid kan fördelas', href: 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/tallriksmodellen/' },
  {
    name: 'Open Food Facts',
    use: 'Streckkoder och förpackade produkter',
    license: 'Data ODbL, bilder CC BY-SA 3.0',
    licenseHref: 'https://world.openfoodfacts.org/terms-of-use',
    href: 'https://se.openfoodfacts.org/',
  },
  {
    name: 'Öppna listan – ett utdrag från RISE klimatdatabas för livsmedel v 2.1 (2022)',
    use: 'Ungefärliga klimatschabloner (kg CO₂e per kg)',
    href: 'https://www.ri.se/sites/default/files/2022-12/RISE%20%C3%96ppna%20listan%202.1%202022.pdf',
  },
  {
    name: '2024 Adult Compendium of Physical Activities',
    use: 'MET-värden för träning och aktiviteter',
    reference: 'Herrmann SD m.fl. 2024 Adult Compendium of Physical Activities. J Sport Health Sci. 2024. DOI 10.1016/j.jshs.2023.10.010.',
    href: 'https://pacompendium.com/adult-compendium/',
  },
]

/** Licensfilerna som följer med appen (relativt appens adress). */
export const OPEN_SOURCE_LICENSES: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Alla paket', href: './licenses.txt' },
  { label: 'Inter (OFL)', href: './licenses/Inter-OFL.txt' },
  { label: 'Fraunces (OFL)', href: './licenses/Fraunces-OFL.txt' },
  { label: 'Workbox (MIT)', href: './licenses/workbox-MIT.txt' },
]

export const INDEPENDENT_NOTE =
  'Lagom är en fristående app och är inte kopplad till eller godkänd av Livsmedelsverket, 1177, Frisk & Fri eller andra källor som nämns.'

const LINK = 'font-semibold text-gran underline underline-offset-2'

function SourceRow({ source }: { source: Source }) {
  return (
    <div className="px-3 py-1.5">
      <TextLink
        href={source.href}
        showIcon={false}
        className="-mx-1 flex min-h-11 items-center gap-3 rounded-xl px-1 text-[0.9375rem] font-medium leading-snug text-ink transition-colors hover:text-gran"
      >
        <span className="min-w-0 flex-1">{source.name}</span>
        <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-3" />
      </TextLink>
      <p className="text-[0.8125rem] leading-snug text-ink-3">{source.use}</p>
      {source.reference && <p className="mt-1 text-[0.75rem] leading-snug text-ink-3">{source.reference}</p>}
      {source.license && source.licenseHref && (
        <TextLink
          href={source.licenseHref}
          showIcon={false}
          className="inline-flex min-h-11 items-center gap-1.5 text-[0.8125rem] font-semibold text-gran underline-offset-2 hover:underline"
        >
          Licens: {source.license}
        </TextLink>
      )}
    </div>
  )
}

const LICENSE_LINK = 'inline-flex min-h-11 items-center text-[0.8125rem] font-semibold text-gran underline-offset-2 hover:underline'

/**
 * Licenstexten i ett ark inne i appen. I den inbyggda appen går en länk med ny flik ut ur webbvyn
 * (till Safari), där appens egna filer inte finns – därför läses filen och visas här i stället.
 */
function LicenseTextSheet({ license, onClose }: { license: { label: string; href: string } | null; onClose: () => void }) {
  const [text, setText] = useState<{ href: string; body: string | null } | null>(null)
  useEffect(() => {
    if (!license) return
    let alive = true
    fetch(license.href)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => alive && setText({ href: license.href, body }))
      .catch(() => alive && setText({ href: license.href, body: null }))
    return () => {
      alive = false
    }
  }, [license])
  const current = license && text?.href === license.href ? text : null
  return (
    <Sheet open={license !== null} onClose={onClose} title={license ? `Licens: ${license.label}` : 'Licens'}>
      {!current ? (
        <p role="status" className="flex items-center gap-2 text-[0.9375rem] text-ink-2">
          <Spinner className="size-4" /> Hämtar licenstexten …
        </p>
      ) : current.body === null ? (
        <p role="alert" className="text-[0.9375rem] text-ink-2">
          Licenstexten kunde inte visas. Kontakta oss om du behöver den.
        </p>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-[0.8125rem] leading-relaxed text-ink-2">{current.body}</pre>
      )}
    </Sheet>
  )
}

function OpenSourceRow() {
  const [open, setOpen] = useState<{ label: string; href: string } | null>(null)
  const native = isNativeApp()
  return (
    <div className="px-3 py-1.5">
      <h3 className="flex min-h-11 items-center text-[0.9375rem] font-medium leading-snug text-ink">Licenser för öppen källkod</h3>
      <p className="text-[0.8125rem] leading-snug text-ink-3">Lagom bygger på öppen källkod och typsnitten Inter och Fraunces. Här finns licenserna.</p>
      <ul className="mt-1 flex flex-wrap gap-x-4">
        {OPEN_SOURCE_LICENSES.map((l) => (
          <li key={l.href}>
            {native ? (
              <button type="button" className={LICENSE_LINK} onClick={() => setOpen(l)}>
                {l.label}
              </button>
            ) : (
              <TextLink href={l.href} showIcon={false} className={LICENSE_LINK}>
                {l.label}
              </TextLink>
            )}
          </li>
        ))}
      </ul>
      {native && <LicenseTextSheet license={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** mailto-länk till supporten med felrapporten (förkortad) i brödtexten. */
export function errorReportMailto(report: string, email: string = SUPPORT_EMAIL): string {
  const body = report.length > ERROR_MAIL_MAX_CHARS ? `${report.slice(0, ERROR_MAIL_MAX_CHARS - 1)}…` : report
  return `mailto:${email}?subject=${encodeURIComponent('Felrapport Lagom')}&body=${encodeURIComponent(body)}`
}

const ROW = 'flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2 active:bg-surface-3'

function TroubleshootingGroup() {
  const [count, setCount] = useState(() => readErrorLog().length)

  const copy = async () => {
    const ok = await copyText(formatErrorReport())
    if (ok) toast('Felrapporten är kopierad', { tone: 'success' })
    else toast('Felrapporten gick inte att kopiera. Använd Mejla supporten i stället.', { tone: 'error' })
  }

  const clear = () => {
    clearErrorLog()
    setCount(0)
    toast('Felloggen är rensad')
  }

  return (
    <ListGroup
      title="Felsökning"
      footer={
        count === 0
          ? 'Inga fel har loggats på den här enheten.'
          : `${plural(count, 'fel', 'fel')} har loggats på den här enheten. Rapporten innehåller appversion, plattform och felmeddelanden – inga livsmedel eller värden – och skickas bara om du själv väljer det.`
      }
    >
      <ListRow leading={Copy} title="Kopiera felrapport" subtitle="Klistra in den i ett mejl till supporten" onClick={() => void copy()} />
      <div className="flex">
        <a href={errorReportMailto(formatErrorReport())} className={ROW}>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-2">
            <Mail className="size-5" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block line-clamp-2 break-words text-[0.9375rem] font-medium leading-snug text-ink">Mejla supporten</span>
            <span className="mt-0.5 block line-clamp-2 break-words text-[0.8125rem] leading-snug text-ink-3">Öppnar ett mejl med felrapporten</span>
          </span>
        </a>
      </div>
      {count > 0 && <ListRow leading={Trash2} title="Rensa felloggen" onClick={clear} />}
    </ListGroup>
  )
}

/** Hur Lagom räknar – samma regler som i src/lib/energy.ts. */
function MethodCard() {
  const pals = Object.values(ACTIVITY_LEVELS).map((a) => a.pal)
  const rules = [
    `Basalomsättningen (grundomsättningen) räknas med Mifflin–St Jeor och multipliceras med din aktivitetsnivå (PAL ${formatNumber(Math.min(...pals), 2)}–${formatNumber(Math.max(...pals), 2)}).`,
    `${formatNumber(KCAL_PER_KG)} kcal motsvarar ungefär 1 kg kroppsvikt.`,
    `Dagsmålet går aldrig under ${formatNumber(MIN_KCAL.kvinna)} kcal (kvinnor) respektive ${formatNumber(MIN_KCAL.man)} kcal (män). Takten är högst 1 % av vikten per vecka och underskottet högst ${formatNumber(MAX_DAILY_DEFICIT)} kcal per dag.`,
    'Ingen viktnedgång vid graviditet, amning eller under 18 år.',
    'Träning räknas med MET-värden från 2024 Adult Compendium of Physical Activities.',
    // 22–27 från 70 år är inte WHO:s gränser utan det som brukar gälla för äldre i Sverige.
    `BMI-gränser för vuxna enligt WHO. Från ${OLDER_ADULT_AGE} år räknar Lagom 22–27 som normalt – lite marginal skyddar mot undernäring.`,
    'Näringsrekommendationer enligt NNR 2023.',
  ]
  return (
    <Card eyebrow="Metod" title="Så räknar Lagom">
      <ul className="-mt-1 flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] leading-relaxed text-ink-2 marker:text-gran">
        {rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="mt-3 font-semibold text-ink">Uppskattningar – inte medicinska råd.</p>
    </Card>
  )
}

function PrivacyCard({ onboarded }: { onboarded: boolean }) {
  // Den inbyggda appen har sina filer med sig – där anropas servern bara av receptimporten och, där
  // licensnycklar går att aktivera, av spärrlistan.
  const server = isNativeApp()
    ? `vår server hos Netlify när du hämtar ett recept från en webbadress${allowsLicenseKeyEntry() ? ' och när licensnyckeln kontrolleras' : ''}`
    : 'vårt webbhotell Netlify när appen laddas'
  return (
    <Card eyebrow="Integritet" title="Din data är din">
      <p className="text-[0.9375rem] leading-relaxed text-ink-2">
        Din dagbok lämnar inte enheten – allt sparas {storagePlace()}. För att appen ska fungera kontaktas {server} (din IP-adress loggas en kort tid), Open
        Food Facts när du söker, skannar eller visar produktbilder, Livsmedelsverket om du hämtar databasen och betaltjänsten vid köp. Ingen reklam och ingen
        spårning.
      </p>
      {allowsLicenseKeyEntry() && (
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
          Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver
          hjälp.
        </p>
      )}
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">Du kan exportera eller radera allt under Inställningar → Data.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button to="/integritet" variant="soft" size="sm">
          Läs integritetspolicyn
        </Button>
        <Button to="/villkor" variant="secondary" size="sm">
          Läs villkoren
        </Button>
        {onboarded && (
          <Button to="/installningar/data" variant="secondary" size="sm">
            Data och säkerhetskopia
          </Button>
        )}
      </div>
    </Card>
  )
}

export default function AboutPage() {
  const reduce = useReducedMotion()
  const [support, setSupport] = useState(false)
  const onboarded = useProfileStore((s) => s.settings.onboardingDone)

  return (
    <div className="px-4 pb-10">
      <PageHeader back title="Om Lagom" compactTitle="Om Lagom" />

      <div className="flex flex-col gap-6">
        <Card tone="gran" padding="lg">
          <div className="flex items-center gap-3">
            <LogoMark size={52} />
            <Wordmark className="text-[2rem]" />
          </div>
          <p className="mt-4 font-display text-[1.375rem] font-medium leading-snug tracking-tight text-ink">
            Kaloriräknaren som gör det lätt att äta lagom – varken för mycket eller för lite.
          </p>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-2">
            Lagom är en svensk kalori- och näringsdagbok byggd på svenska livsmedel, svenska mått och de nordiska näringsrekommendationerna. Den
            fungerar utan uppkoppling och all data stannar på din enhet. Prova gratis i {TRIAL_DAYS} dagar – sedan {priceSummaryText()}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!onboarded && <Button to="/valkommen">Kom igång</Button>}
            <Button to="/premium" variant={onboarded ? 'soft' : 'secondary'}>
              {sellsOnWeb() ? 'Priser och köpvillkor' : 'Lagom Premium'}
            </Button>
          </div>
        </Card>

        <section aria-labelledby="annorlunda">
          <h2 id="annorlunda" className="font-display text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
            Det här gör Lagom annorlunda
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CHOICES.map((s, i) => (
              <motion.li
                key={s.title}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.05 + Math.min(i, 8) * 0.04, type: 'spring', stiffness: 300, damping: 32 }}
                // Udda antal kort: det sista spänner över båda kolumnerna i stället för att stå ensamt.
                className={cx('card flex gap-3.5 p-4', i === CHOICES.length - 1 && CHOICES.length % 2 === 1 && 'sm:col-span-2')}
              >
                <span style={toneVars(s.tone)} aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)">
                  <s.icon className="size-5" strokeWidth={2.1} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{s.title}</h3>
                  <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">{s.text}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <ListGroup
          title="Källor och licenser"
          footer={
            <>
              Klimatvärdena är ungefärliga schabloner per livsmedelsgrupp och ska ses som en fingervisning. {INDEPENDENT_NOTE}
            </>
          }
        >
          {SOURCES.map((s) => (
            <SourceRow key={s.name} source={s} />
          ))}
          <OpenSourceRow />
        </ListGroup>

        <PrivacyCard onboarded={onboarded} />

        <MethodCard />

        <Card tone="blabar">
          <div className="flex items-start gap-3">
            <Stethoscope aria-hidden className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" />
            <div className="min-w-0">
              <h2 className="break-words font-display text-[1.1875rem] font-semibold tracking-tight text-ink">Inte en medicinteknisk produkt</h2>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">
                Lagom ger allmän information om mat och näring och ersätter inte råd från vården. Mål och beräkningar är uppskattningar. Har du en sjukdom,
                är gravid eller ammar, eller funderar på att ändra din vikt – rådgör gärna med vården. Kontakta{' '}
                <TextLink href="https://www.1177.se" className={LINK}>
                  1177 Vårdguiden
                </TextLink>{' '}
                vid frågor om hälsa.
              </p>
              <Button variant="soft" size="sm" iconLeft={HeartHandshake} className="mt-4" onClick={() => setSupport(true)}>
                Stöd & hjälp
              </Button>
            </div>
          </div>
        </Card>

        <TroubleshootingGroup />

        <footer className="flex flex-col items-center gap-1 pt-2 text-center text-[0.8125rem] text-ink-3">
          <span>
            Version {APP_VERSION} · bygge {BUILD_ID}
          </span>
          <span>Gjord med omsorg för svenska matvanor. Lagom är bäst.</span>
        </footer>
      </div>

      <SupportSheet open={support} onClose={() => setSupport(false)} />
    </div>
  )
}
