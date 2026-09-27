/**
 * Om Lagom (/om) – vad Lagom är, hur appen löser problemen med andra kaloriappar, källor och
 * licenser, integritet och en medicinsk ansvarsfriskrivning. Nås även före välkomstflödet.
 */
import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  BadgeCheck,
  CircleSlash,
  ExternalLink,
  Flame,
  HeartHandshake,
  Leaf,
  Ruler,
  ShieldCheck,
  Soup,
  Stethoscope,
  TrendingUp,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button, Card, ListGroup, PageHeader, cx, toneVars, type Tone } from '../../components/ui'
import { LogoMark, Wordmark } from '../../components/layout/Logo'
import { useProfileStore } from '../../stores/profileStore'
import { SupportSheet } from './SupportSheet'
import { TRIAL_DAYS } from '../../config/commerce'
import { priceSummary } from '../premium/premiumLogic'

/** Appens version (samma som package.json). */
export const APP_VERSION = '1.0.0'

interface Solution {
  icon: LucideIcon
  tone: Tone
  problem: string
  solution: string
}

export const SOLUTIONS: readonly Solution[] = [
  {
    icon: BadgeCheck,
    tone: 'mossa',
    problem: 'Användarinmatade databaser med dubbletter och fel',
    solution: 'Granskade svenska livsmedel med värden från Livsmedelsverket. Varje livsmedel visar sin källa, och användarbidrag från Open Food Facts märks tydligt.',
  },
  {
    icon: CircleSlash,
    tone: 'lingon',
    problem: 'Låsta funktioner, reklam och prenumerationer som förnyas',
    solution:
      `${TRIAL_DAYS} dagar gratis, sedan ett tydligt engångsköp eller en årslicens utan automatisk förnyelse. Ingen reklam, inga dolda avgifter – streckkodsläsaren och alla näringsämnen ingår.`,
  },
  {
    icon: WifiOff,
    tone: 'fjall',
    problem: 'Krascher, synkfel och förlorad data',
    solution: 'Allt sparas lokalt och fungerar offline. Säkerhetskopiera till en fil när du vill och exportera dagboken till Excel.',
  },
  {
    icon: Ruler,
    tone: 'hjortron',
    problem: 'Utländska mått och livsmedel',
    solution: 'Knäckebröd, falukorv och ärtsoppa – i dl, msk, tsk och krm. ”2\u00a0dl havregryn” räknas om till rätt vikt med livsmedlets densitet.',
  },
  {
    icon: TrendingUp,
    tone: 'blabar',
    problem: 'Statiska kalorimål som inte stämmer',
    solution: 'Adaptiva mål: Lagom kan räkna fram din faktiska förbrukning ur vikttrenden och det du ätit.',
  },
  {
    icon: Flame,
    tone: 'lingon',
    problem: 'Överskattade träningskalorier',
    solution: 'Nettokalorier (MET minus vila) från 2024 Compendium of Physical Activities, och du väljer själv hur stor del som räknas.',
  },
  {
    icon: Soup,
    tone: 'hjortron',
    problem: 'Recept blir fel efter tillagning',
    solution: 'Recept räknas på tillagad vikt – väg grytan när den är klar, så blir varje portion rätt.',
  },
  {
    icon: CircleSlash,
    tone: 'neutral',
    problem: 'Okända värden visas som 0',
    solution: 'Okänt är inte ingenting. Saknade värden visas som ”–” och Lagom visar hur fullständiga näringsdatan är.',
  },
  {
    icon: HeartHandshake,
    tone: 'vinbar',
    problem: 'Dömande ton som kan skada',
    solution: 'Varm ton utan skuld, ett medvetet läge utan siffror, kalorigolv, ingen viktnedgång vid graviditet, amning eller under 18 år – och vägar till stöd.',
  },
  {
    icon: ShieldCheck,
    tone: 'gran',
    problem: 'Integritet och spårning',
    solution: 'Inget konto och ingen spårning. Din dagbok stannar på din enhet (GDPR) och du kan exportera eller radera allt när som helst.',
  },
  {
    icon: Leaf,
    tone: 'mossa',
    problem: 'Bara kalorier – inget om helheten',
    solution: 'Tallriksmodellen, Livsmedelsverkets kostråd, NNR 2023 och ungefärlig klimatpåverkan per måltid.',
  },
]

interface Source {
  name: string
  use: string
  license?: string
  href: string
}

export const SOURCES: readonly Source[] = [
  {
    name: 'Livsmedelsverkets livsmedelsdatabas',
    use: 'Namn och näringsvärden per 100\u00a0g. Hela databasen (2\u00a0606 livsmedel) ingår och fungerar offline.',
    license: 'Öppna data',
    href: 'https://soknaringsinnehall.livsmedelsverket.se/',
  },
  { name: 'Nordiska näringsrekommendationer 2023 (NNR 2023)', use: 'Referensvärden för energi, makron, vitaminer och mineraler', href: 'https://www.norden.org/en/publication/nordic-nutrition-recommendations-2023' },
  { name: 'Livsmedelsverkets kostråd', use: 'Råd om frukt, grönt, fisk, kött, fullkorn och rörelse', href: 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/' },
  { name: 'Tallriksmodellen', use: 'Hur en balanserad måltid kan fördelas', href: 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/tallriksmodellen/' },
  { name: 'Open Food Facts', use: 'Streckkoder och förpackade produkter', license: 'ODbL', href: 'https://se.openfoodfacts.org/' },
  { name: 'RISE Klimatdatabas för livsmedel', use: 'Ungefärliga klimatschabloner (kg\u00a0CO₂e per kg)', href: 'https://www.ri.se/sv' },
  { name: '2024 Adult Compendium of Physical Activities', use: 'MET-värden för träning och aktiviteter', href: 'https://pacompendium.com/adult-compendium/' },
]

function ExternalRow({ source }: { source: Source }) {
  return (
    <a
      href={source.href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-[3.75rem] items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.9375rem] font-medium leading-snug text-ink">
          {source.name}
          {source.license && <Badge>{source.license}</Badge>}
        </span>
        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">{source.use}</span>
      </span>
      <ExternalLink aria-hidden className="size-4 shrink-0 text-ink-3" />
      <span className="sr-only">(öppnas i ny flik)</span>
    </a>
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
            fungerar utan uppkoppling och all data stannar på din enhet. Prova gratis i {TRIAL_DAYS} dagar – sedan {priceSummary()}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!onboarded && <Button to="/valkommen">Kom igång</Button>}
            <Button to="/premium" variant={onboarded ? 'soft' : 'secondary'}>
              Priser och köpvillkor
            </Button>
          </div>
        </Card>

        <section aria-labelledby="losningar">
          <h2 id="losningar" className="font-display text-[1.5rem] font-semibold leading-tight tracking-tight text-ink">
            Så löser Lagom problemen med andra kaloriappar
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SOLUTIONS.map((s, i) => (
              <motion.li
                key={s.problem}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduce ? 0 : 0.05 + Math.min(i, 8) * 0.04, type: 'spring', stiffness: 300, damping: 32 }}
                // Udda antal kort: det sista spänner över båda kolumnerna i stället för att stå ensamt.
                className={cx('card flex gap-3.5 p-4', i === SOLUTIONS.length - 1 && SOLUTIONS.length % 2 === 1 && 'sm:col-span-2')}
              >
                <span style={toneVars(s.tone)} aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)">
                  <s.icon className="size-5" strokeWidth={2.1} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.8125rem] font-semibold leading-snug text-ink-3">
                    <span className="sr-only">Problem: </span>
                    {s.problem}
                  </h3>
                  <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink">{s.solution}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </section>

        <ListGroup title="Källor och licenser" footer="Klimatvärdena är ungefärliga schabloner per livsmedelsgrupp och ska ses som en fingervisning.">
          {SOURCES.map((s) => (
            <ExternalRow key={s.name} source={s} />
          ))}
        </ListGroup>

        <Card eyebrow="Integritet" title="Din data är din">
          <p className="text-[0.9375rem] leading-relaxed text-ink-2">
            Lagom har inga konton, ingen reklam och ingen spårning. Allt du loggar sparas lokalt i den här webbläsaren. Det enda som lämnar enheten är det
            du själv söker eller skannar hos Open Food Facts (sökordet eller streckkoden), om du väljer att hämta Livsmedelsverkets databas – och när du
            köper en licens: då sköter Stripe betalningen. Licensnyckeln innehåller inga personuppgifter. Du kan exportera eller radera allt under
            Inställningar → Data.
          </p>
          {onboarded && (
            <Button to="/installningar/data" variant="secondary" size="sm" className="mt-4">
              Data och säkerhetskopia
            </Button>
          )}
        </Card>

        <Card tone="blabar">
          <div className="flex items-start gap-3">
            <Stethoscope aria-hidden className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" />
            <div>
              <h2 className="font-display text-[1.1875rem] font-semibold tracking-tight text-ink">Inte en medicinteknisk produkt</h2>
              <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">
                Lagom ger allmän information om mat och näring och ersätter inte råd från vården. Mål och beräkningar är uppskattningar. Har du en sjukdom,
                är gravid eller ammar, eller funderar på att ändra din vikt – rådgör gärna med vården. Kontakta{' '}
                <a href="https://www.1177.se" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
                  1177 Vårdguiden
                </a>{' '}
                vid frågor om hälsa.
              </p>
              <Button variant="soft" size="sm" iconLeft={HeartHandshake} className="mt-4" onClick={() => setSupport(true)}>
                Stöd & hjälp
              </Button>
            </div>
          </div>
        </Card>

        <footer className="flex flex-col items-center gap-1 pt-2 text-center text-[0.8125rem] text-ink-3">
          <span>Version {APP_VERSION}</span>
          <span>Gjord med omsorg för svenska matvanor. Lagom är bäst.</span>
        </footer>
      </div>

      <SupportSheet open={support} onClose={() => setSupport(false)} />
    </div>
  )
}
