/**
 * Näringstabell grupperad som på en svensk näringsdeklaration: energi (kcal och kJ), makro,
 * kolhydrater, fett, övrigt (salt, alkohol, koffein), vitaminer och mineraler.
 *
 * - Okända värden visas som "–" (okänt är inte noll) och täckningsgraden visas överst.
 * - Med `coverage` visas värden som bara är kända för en del av maten som "minst 48,7 g".
 * - Med `references` visas en stapel med procent av referensintaget (RI) eller maxgränsen,
 *   färgad efter status (samma regler och etiketter som `lib/nnr.ts`).
 * - Grupperna går att fälla ut/ihop. Per portion eller per 100 g hanteras av föräldern.
 * - Grupprubrikerna får nivån efter föregående rubrik (h3 i ett kort med h2-rubrik).
 */
import { useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { Nutrients } from '../../types'
import { NUTRIENT_KEYS, NUTRIENTS, type NutrientKey } from '../../lib/nutrients'
import { formatEnergy, formatNumber, formatNutrient } from '../../lib/format'
import { LOW_THRESHOLD, STATUS_LABELS, type NutrientStatus, type StatusTone } from '../../lib/nnr'
import { headingTag, useHeadingLevel, type HeadingLevel } from '../ui/headingLevel'
import { useEnergyUnit } from './EnergyValue'

/** Referensvärde per dag. `ri` = rekommenderat/adekvat intag, `ul` = övre gräns, `max` = rekommenderad högsta nivå. */
export interface NutrientReference {
  ri?: number
  ul?: number
  max?: number
}

export type NutrientTableGroupId = 'energi' | 'makro' | 'kolhydrat' | 'fett' | 'ovrigt' | 'vitamin' | 'mineral'

export const NUTRIENT_GROUP_LABELS: Record<NutrientTableGroupId, string> = {
  energi: 'Energi',
  makro: 'Makronäringsämnen',
  kolhydrat: 'Kolhydrater',
  fett: 'Fett',
  ovrigt: 'Salt, alkohol och koffein',
  vitamin: 'Vitaminer',
  mineral: 'Mineraler',
}

const DEFAULT_GROUPS: readonly NutrientTableGroupId[] = ['energi', 'makro', 'kolhydrat', 'fett', 'ovrigt', 'vitamin', 'mineral']
const DEFAULT_EXPANDED: readonly NutrientTableGroupId[] = ['energi', 'makro', 'kolhydrat', 'fett', 'ovrigt']

/** Undergrupper som i en näringsdeklaration visas som "varav …" under sin makro. */
const SUB_OF: Partial<Record<NutrientKey, string>> = {
  sugars: 'varav',
  addedSugar: 'varav',
  satFat: 'varav',
  monoFat: 'varav',
  polyFat: 'varav',
  omega3: 'varav',
}

const TONE_VAR: Record<StatusTone, string> = {
  mossa: 'var(--lg-mossa)',
  sol: 'var(--lg-sol)',
  hjortron: 'var(--lg-hjortron)',
  lingon: 'var(--lg-lingon)',
  'ink-3': 'var(--lg-ink-3)',
}

/**
 * Status mot ett referensvärde – samma regler som `nutrientStatus` i `lib/nnr.ts`,
 * men för den enklare referenstypen { ri, ul, max }.
 */
export function referenceStatus(value: number | undefined, ref: NutrientReference | undefined): NutrientStatus {
  if (value === undefined || !Number.isFinite(value) || !ref) return 'okant'
  if (ref.ul !== undefined && value > ref.ul) return 'over_ul'
  if (ref.max !== undefined && value > ref.max) return 'over_max'
  if (ref.ri !== undefined && ref.ri > 0) {
    const ratio = value / ref.ri
    if (ratio < LOW_THRESHOLD) return 'lagt'
    if (ratio < 1) return 'nara'
    return 'uppnatt'
  }
  return 'uppnatt'
}

/** Procent av RI (eller av max om RI saknas). `undefined` om det inte går att räkna. */
export function referencePercent(value: number | undefined, ref: NutrientReference | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || !ref) return undefined
  const base = ref.ri !== undefined && ref.ri > 0 ? ref.ri : ref.max
  if (base === undefined || base <= 0) return undefined
  return (value / base) * 100
}

function groupOf(key: NutrientKey): NutrientTableGroupId {
  const g = NUTRIENTS[key].group
  if (key === 'fiber') return 'kolhydrat'
  return g
}

export interface NutrientTableProps {
  nutrients: Nutrients
  references?: Partial<Record<NutrientKey, NutrientReference>>
  /** Begränsa vilka ämnen som visas. Standard: alla. */
  keys?: readonly NutrientKey[]
  /** Vilka grupper som visas och i vilken ordning. */
  groups?: readonly NutrientTableGroupId[]
  /** Utfällda grupper från början. Standard: allt utom vitaminer och mineraler. */
  defaultExpanded?: readonly NutrientTableGroupId[]
  /** Grupper går att fälla ihop. Standard true. */
  collapsible?: boolean
  /** Visa "Näringsdata för 18 av 36 ämnen". Standard true. */
  showCompleteness?: boolean
  /** Dölj rader med okänt värde (täckningsgraden räknas ändå). */
  hideUnknown?: boolean
  /**
   * Liten etikett överst till höger, t.ex. "Per 100 g" eller "Per portion (150 g)". Visas som
   * den skrivs (inga versaler – "g" ska inte bli "G").
   */
  caption?: ReactNode
  /**
   * Andel (0–1) av maten där värdet är känt, per ämne – t.ex. från ett snitt över flera dagar.
   * Under 100 % visas värdet som "minst 48,7 g" (det verkliga värdet är troligen högre);
   * 0 % visas som okänt.
   */
  coverage?: Partial<Record<NutrientKey, number>>
  /** Rubriknivå för grupperna. Standard: efter föregående rubrik (h3 under ett korts h2). */
  headingLevel?: HeadingLevel
  /**
   * Visa status (Lågt/Nästan/Bra/Över) och statusfärger. Standard true – passar dagens eller
   * veckans intag. Sätt false för ett enskilt livsmedel: då visas bara "% av RI" som på en
   * förpackning, eftersom ett livsmedel inte ska täcka hela dagsbehovet.
   */
  showStatus?: boolean
  className?: string
}

export function NutrientTable({
  nutrients,
  references,
  keys = NUTRIENT_KEYS,
  groups = DEFAULT_GROUPS,
  defaultExpanded = DEFAULT_EXPANDED,
  collapsible = true,
  showCompleteness = true,
  hideUnknown = false,
  caption,
  coverage,
  headingLevel,
  showStatus = true,
  className = '',
}: NutrientTableProps) {
  const reduced = useReducedMotion() ?? false
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const Heading = headingTag(useHeadingLevel(rootRef, headingLevel))
  const energyUnit = useEnergyUnit()
  // Känt för bara en del av maten → "minst …". Ingen täckning alls → okänt.
  const partial = (k: NutrientKey) => coverage?.[k] !== undefined && (coverage[k] as number) < PARTIAL_BELOW
  const valueOf = (k: NutrientKey): number | undefined => (coverage?.[k] !== undefined && (coverage[k] as number) <= 0 ? undefined : nutrients[k])
  const [expanded, setExpanded] = useState<ReadonlySet<NutrientTableGroupId>>(() => new Set(defaultExpanded))

  const grouped = useMemo(() => {
    const allowed = new Set(keys)
    return groups
      .map((g) => ({ id: g, keys: NUTRIENT_KEYS.filter((k) => allowed.has(k) && groupOf(k) === g) }))
      .filter((g) => g.keys.length > 0)
  }, [keys, groups])

  const shownKeys = grouped.flatMap((g) => g.keys)
  const known = shownKeys.filter((k) => isKnown(valueOf(k))).length
  const anyPartial = shownKeys.some((k) => isKnown(valueOf(k)) && partial(k))
  const hasRefs = !!references && Object.keys(references).length > 0

  const toggle = (g: NutrientTableGroupId) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })

  return (
    <div ref={rootRef} className={className}>
      {(showCompleteness || caption !== undefined) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          {showCompleteness && shownKeys.length > 0 ? (
            <div className="min-w-0 flex-1">
              <div className="text-xs text-ink-2">
                Näringsdata för <span className="font-semibold text-ink tabular-nums">{known}</span> av{' '}
                <span className="tabular-nums">{shownKeys.length}</span> ämnen
              </div>
              <div className="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                <div className="h-full rounded-full bg-gran" style={{ width: `${(known / shownKeys.length) * 100}%` }} />
              </div>
            </div>
          ) : (
            <span />
          )}
          {caption !== undefined && <span className="shrink-0 text-xs font-semibold text-ink-3">{caption}</span>}
        </div>
      )}

      <div className="divide-y divide-line">
        {grouped.map((g) => {
          if (g.id === 'energi') {
            const kcal = valueOf('kcal')
            const other = energyUnit === 'kcal' ? 'kJ' : 'kcal'
            return (
              <div key={g.id} className="flex items-baseline justify-between gap-3 py-3">
                <span className="text-sm font-semibold text-ink">Energi</span>
                {/* "387 kcal (1 620 kJ)" – med riktiga mellanslag, så att det läses rätt. */}
                <span className="text-right">
                  {isKnown(kcal) && partial('kcal') && <span className="text-xs text-ink-3">minst </span>}
                  <span className="font-display text-xl font-semibold text-ink tabular-nums">{formatEnergy(kcal, energyUnit, false)}</span>
                  {isKnown(kcal) && (
                    <>
                      <span className="text-xs font-medium text-ink-3">{`\u00a0${energyUnit}`}</span>{' '}
                      <span className="text-xs text-ink-3 tabular-nums">({formatEnergy(kcal, other)})</span>
                    </>
                  )}
                </span>
              </div>
            )
          }
          const open = !collapsible || expanded.has(g.id)
          const panelId = `${baseId}-${g.id}`
          const rows = hideUnknown ? g.keys.filter((k) => isKnown(valueOf(k))) : g.keys
          const knownInGroup = g.keys.filter((k) => isKnown(valueOf(k))).length
          const heading = NUTRIENT_GROUP_LABELS[g.id]
          return (
            <section key={g.id} aria-label={heading}>
              {collapsible ? (
                <Heading>
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => toggle(g.id)}
                    className="flex min-h-11 w-full items-center gap-2 py-2 text-left"
                  >
                    <span className="flex-1 text-sm font-semibold text-ink">{heading}</span>
                    {/* aria-label på ett element utan roll läses inte upp – siffrorna döljs och en osynlig text ersätter dem. */}
                    <span className="text-xs text-ink-3 tabular-nums" aria-hidden="true">
                      {knownInGroup}/{g.keys.length}
                    </span>
                    <span className="sr-only">
                      {knownInGroup} av {g.keys.length} kända
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-ink-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                      aria-hidden="true"
                    />
                  </button>
                </Heading>
              ) : (
                <Heading className="pb-1 pt-3 text-sm font-semibold text-ink">{heading}</Heading>
              )}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    id={panelId}
                    key="panel"
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    {rows.length === 0 ? (
                      <p className="pb-3 text-xs text-ink-3">Inga kända värden i den här gruppen.</p>
                    ) : (
                      <dl className="pb-2">
                        {rows.map((k) => (
                          <NutrientRow
                            key={k}
                            nutrientKey={k}
                            value={valueOf(k)}
                            atLeast={partial(k)}
                            reference={hasRefs ? references?.[k] : undefined}
                            showStatus={showStatus}
                          />
                        ))}
                      </dl>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          )
        })}
      </div>
      {anyPartial && (
        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          ”Minst” betyder att värdet saknas för en del av maten – det verkliga värdet är troligen något högre.
        </p>
      )}
    </div>
  )
}

/** Täckning under så här mycket räknas som ofullständig ("minst …"). */
const PARTIAL_BELOW = 0.995

function isKnown(v: number | undefined): v is number {
  return v !== undefined && Number.isFinite(v)
}

function NutrientRow({
  nutrientKey,
  value,
  atLeast,
  reference,
  showStatus,
}: {
  nutrientKey: NutrientKey
  value: number | undefined
  /** Värdet är en nedre gräns (känt för bara en del av maten). */
  atLeast: boolean
  reference?: NutrientReference
  showStatus: boolean
}) {
  const meta = NUTRIENTS[nutrientKey]
  const sub = SUB_OF[nutrientKey]
  const knownValue = isKnown(value)
  const pct = referencePercent(value, reference)
  const status = referenceStatus(value, reference)
  const statusMeta = STATUS_LABELS[status]
  const basis = reference?.ri !== undefined && reference.ri > 0 ? 'av RI' : 'av max'
  const barColor = showStatus ? TONE_VAR[statusMeta.tone] : 'var(--lg-gran)'
  const lowerBound = knownValue && atLeast
  // En grupp i listan: <div><dt/><dd/><dd/></div> (dt och dd måste vara direkta barn).
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5 ${sub ? 'pl-3' : ''}`}>
      <dt className="min-w-0 text-sm text-ink-2" title={meta.info}>
        {sub && <span className="text-ink-3">{sub} </span>}
        {sub ? meta.name.charAt(0).toLowerCase() + meta.name.slice(1) : meta.name}
      </dt>
      <dd
        className={`text-right text-sm tabular-nums ${knownValue ? 'font-semibold text-ink' : 'text-ink-3'}`}
        title={lowerBound ? 'Värdet saknas för en del av maten – det verkliga värdet är troligen högre.' : undefined}
      >
        {knownValue ? (
          <>
            {lowerBound && <span className="font-normal text-ink-3">minst </span>}
            {formatNutrient(nutrientKey, value)}
          </>
        ) : (
          <>
            {/* Ett saknat värde är okänt, inte 0: sträcket är bara för ögat, skärmläsare får ordet. */}
            <span aria-hidden="true">–</span>
            <span className="sr-only">okänt</span>
          </>
        )}
      </dd>
      {reference && knownValue && pct !== undefined && (
        <dd className="col-span-2 mt-1 flex items-center gap-2">
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
          </span>
          <span className="w-[4.75rem] shrink-0 text-right text-[11px] text-ink-3 tabular-nums">
            {lowerBound ? '≥ ' : ''}
            {formatNumber(pct)} % {basis}
          </span>
          {showStatus && (
            <span className="inline-flex w-[4.25rem] shrink-0 items-center gap-1 text-[11px] text-ink-2" title={statusMeta.description}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[statusMeta.tone] }} aria-hidden="true" />
              {statusMeta.short}
            </span>
          )}
        </dd>
      )}
    </div>
  )
}
