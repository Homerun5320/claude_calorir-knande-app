/**
 * Texter och små regler för Insikter: säsongsanpassade "Håll koll på", kostrådens framstegstext
 * och poängetiketter. Rena funktioner – testade i advice.test.ts.
 */
import type { ISODate, NutrientKey, Nutrients } from '../../types'
import { fromISODate } from '../../lib/dates'
import { formatNumber, plural } from '../../lib/format'
import { nutrientStatus, percentOfReference, type ReferenceMap, type WatchItem } from '../../lib/nnr'
import type { KostradResult, KostradStatus } from '../../lib/kostrad'

// ---------------------------------------------------------------------------
// Håll koll på
// ---------------------------------------------------------------------------

/** Mörka halvåret (oktober–mars): solen räcker inte för D-vitaminbildning i Sverige. */
export function isDarkHalfYear(date: ISODate): boolean {
  const m = fromISODate(date).getMonth() + 1
  return m >= 10 || m <= 3
}

const WINTER_PREFIX = 'Under vinterhalvåret (oktober–mars) bildar huden nästan inget D-vitamin i Sverige.'

/**
 * Lägg till en säsongsnotis om vitamin D under vinterhalvåret. Finns vitamin D redan i listan
 * lyfts den upp och får notisen först; annars läggs en uppmuntrande påminnelse till.
 */
export function withSeasonalWatch(items: readonly WatchItem[], today: ISODate, averages: Nutrients, refs: ReferenceMap): WatchItem[] {
  if (!isDarkHalfYear(today)) return [...items]
  const idx = items.findIndex((i) => i.key === 'vitD')
  let out: WatchItem[]
  if (idx >= 0) {
    out = items.map((i, k) =>
      k === idx
        ? { ...i, priority: 1 as const, reason: /vinter/i.test(i.reason) ? i.reason : `${WINTER_PREFIX} ${i.reason}` }
        : i,
    )
  } else {
    const ref = refs.vitD
    if (!ref) return [...items]
    const value = averages.vitD
    out = [
      {
        key: 'vitD',
        status: nutrientStatus(value, ref),
        percent: percentOfReference(value, ref),
        priority: 2,
        reason: `${WINTER_PREFIX} Du ligger bra till just nu – fet fisk, D-berikad mjölk och matfett hjälper dig att hålla det så.`,
      },
      ...items,
    ]
  }
  return out.sort((a, b) => a.priority - b.priority)
}

/** Ämnen man kan se "Dina bästa källor" för, i visningsordning. */
export const SOURCE_NUTRIENTS: readonly NutrientKey[] = [
  'protein',
  'fiber',
  'wholegrain',
  'iron',
  'calcium',
  'vitD',
  'folate',
  'vitB12',
  'vitC',
  'omega3',
  'iodine',
  'potassium',
  'magnesium',
  'zinc',
  'selenium',
  'salt',
  'addedSugar',
  'satFat',
]

/** Förvalt ämne för källor: första "Håll koll på"-ämnet som går att visa, annars protein. */
export function defaultSourceNutrient(watch: readonly WatchItem[]): NutrientKey {
  return watch.find((w) => SOURCE_NUTRIENTS.includes(w.key))?.key ?? 'protein'
}

// ---------------------------------------------------------------------------
// Kostråd
// ---------------------------------------------------------------------------

export const KOSTRAD_STATUS: Record<KostradStatus, { label: string; tone: 'mossa' | 'sol' | 'gran' | 'hjortron' }> = {
  bra: { label: 'Uppfyllt', tone: 'mossa' },
  nastan: { label: 'Nästan', tone: 'sol' },
  langt_kvar: { label: 'En bit kvar', tone: 'gran' },
  over: { label: 'Över rådet', tone: 'hjortron' },
}

/**
 * Framsteg i klartext, t.ex. "320 g/dag – mål 500 g/dag" eller "210 g per vecka – mål 300 g".
 * Veckoråd räknas om till per vecka så att texten fungerar för både vecka och 90 dagar.
 */
export function kostradProgressText(r: KostradResult): string {
  const decimals = r.unit === 'g/dag' && r.id === 'salt' ? 1 : 0
  const n = (v: number, d = decimals) => formatNumber(v, d)
  const limit = r.direction === 'hogst' ? 'högst' : 'mål'
  if (r.id === 'alkohol') {
    if (r.actual <= 0.05) return 'Inga standardglas'
    const perWeek = r.periodDays > 0 ? (r.actual * 7) / r.periodDays : r.actual
    return `${n(perWeek, 1)} standardglas per vecka`
  }
  if (r.unit === 'dagar') return `${n(r.actual)} av ${plural(r.target, 'dag', 'dagar')}`
  if (r.weeklyTarget !== undefined && r.periodDays > 0) {
    const perWeek = (r.actual * 7) / r.periodDays
    const unit = r.unit === 'min' ? 'min' : 'g'
    return `${n(perWeek)}\u00a0${unit} per vecka – ${limit} ${n(r.weeklyTarget)}\u00a0${unit}`
  }
  const unit = r.unit
  return `${n(r.actual)}\u00a0${unit} – ${limit} ${n(r.target)}\u00a0${unit}`
}

/** Vänlig etikett för kostrådspoängen. */
export function kostradScoreLabel(score: number): { title: string; text: string } {
  if (score >= 80) return { title: 'Riktigt fint', text: 'Du följer de flesta kostråden. Fortsätt i samma lugna takt!' }
  if (score >= 60) return { title: 'På god väg', text: 'Många råd är redan på plats. Välj gärna ett att fokusera lite extra på.' }
  if (score >= 40) return { title: 'En bit på väg', text: 'Små byten gör stor skillnad – börja med det råd som känns enklast.' }
  return { title: 'Varje steg räknas', text: 'Välj ett råd i taget. Lite mer grönt eller en fiskmiddag i veckan är en fin start.' }
}
