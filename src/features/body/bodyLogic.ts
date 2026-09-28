/**
 * Ren logik för sidan "Vikt & mått": trendförändringar, takt, målprognos, gruppering av
 * vägningar per månad, kroppsmått och underlaget för adaptiv energiförbrukning.
 *
 * Allt här är rena funktioner utan React – lätta att testa (se bodyLogic.test.ts).
 */
import type { DiaryEntry, GoalType, ISODate, LifeStage, MeasurementEntry, Profile, WeightEntry } from '../../types'
import { addDays, ageFromBirthYear, capitalize, diffDays, fromISODate, MONTHS, toISODate } from '../../lib/dates'
import { bmi, bmiCategory, goalPause, OLDER_ADULT_AGE, projectGoalDate, slopePerDay, weightTrend, youngestAge, type TrendPoint } from '../../lib/energy'
import { formatNumber } from '../../lib/format'
import { totals } from '../../lib/diary'
import { niceTicks } from '../../components/charts/chartUtils'

// ---------------------------------------------------------------------------
// Grundläggande hjälpare
// ---------------------------------------------------------------------------

/** Sorterad kopia, stigande på datum. */
export function sortByDate<T extends { date: ISODate }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date))
}

/** Avrunda till en decimal (vikter lagras med 0,1 kg upplösning). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Riktning för en förändring. Små förändringar (under tröskeln) räknas som stabila. */
export function directionOf(change: number, threshold = 0.05): 'up' | 'down' | 'flat' {
  if (!Number.isFinite(change) || Math.abs(change) < threshold) return 'flat'
  return change > 0 ? 'up' : 'down'
}

/**
 * "−0,4 kg", "+0,3 kg" eller "±0 kg". Använder typografiskt minustecken.
 * `unit` kan bytas, t.ex. till "cm".
 */
export function formatSignedKg(kg: number, decimals = 1, unit = 'kg'): string {
  const s = formatSigned(kg, decimals)
  return s === '–' ? s : `${s} ${unit}`
}

/** Tal med tecken utan enhet: "−0,4", "+1,3" eller "±0". */
export function formatSigned(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–'
  const rounded = Number(value.toFixed(decimals))
  if (rounded === 0) return '±0'
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), decimals)}`
}

/**
 * Vilken riktning som tonas mjukt grön. Viktnedgång tonas aldrig grön – Lagom berömmer inte att
 * gå ner i vikt (och aldrig att gå ner fort); den visas neutralt. En uppgång mot ett mål om att gå
 * upp i vikt får en mild grön ton. Vid graviditet, amning och under 18 år finns ingen önskad
 * riktning. `age` ska vara den yngsta möjliga åldern (`youngestAge`).
 */
export function goodDirection(
  goal: GoalType | undefined,
  lifeStage: LifeStage | undefined,
  age: number | undefined,
): 'up' | undefined {
  if (goal !== 'ga_upp') return undefined
  if ((lifeStage && lifeStage !== 'ingen') || (age !== undefined && age < 18)) return undefined
  return 'up'
}

// ---------------------------------------------------------------------------
// Trendvikt
// ---------------------------------------------------------------------------

/**
 * Trendserie (EWMA, α = 0,1) från första vägningen fram till senaste vägningen.
 * Med `extendTo` förlängs serien (platt) fram till det datumet, t.ex. idag.
 */
export function trendSeries(weights: readonly WeightEntry[], extendTo?: ISODate): TrendPoint[] {
  if (weights.length === 0) return []
  const sorted = sortByDate(weights)
  const last = sorted[sorted.length - 1].date
  return weightTrend(sorted, 0.1, extendTo && extendTo > last ? extendTo : undefined)
}

/** Trendvärdet ett visst datum, eller undefined om serien inte täcker datumet. */
export function trendAt(points: readonly TrendPoint[], date: ISODate): number | undefined {
  if (points.length === 0) return undefined
  const i = diffDays(points[0].date, date)
  if (i < 0 || i >= points.length) return undefined
  // Serien är daglig och sammanhängande – men var tålig om den inte skulle vara det.
  const p = points[i]
  if (p.date === date) return p.trend
  return points.find((x) => x.date === date)?.trend
}

/**
 * Förändring i trendvikt under de senaste `days` dagarna, räknat bakåt från seriens sista dag.
 * undefined om historiken är kortare än så (då finns ingen rättvis jämförelse).
 */
export function trendChange(points: readonly TrendPoint[], days: number): number | undefined {
  if (points.length < 2) return undefined
  const last = points[points.length - 1]
  const from = trendAt(points, addDays(last.date, -days))
  return from === undefined ? undefined : last.trend - from
}

export interface WeeklyRate {
  /** Trendens lutning i kg per vecka (negativ = nedåt). */
  kgPerWeek: number
  /** Antal dagar mellan första och sista vägningen i fönstret. */
  spanDays: number
  /** Antal vägningar i fönstret. */
  weighIns: number
}

/**
 * Genomsnittlig takt: lutningen (minsta kvadrat) på trendlinjen under de senaste `windowDays`
 * dagarna fram till senaste vägningen.
 *
 * Kräver minst 3 vägningar som spänner över minst 10 dagar, och att senaste vägningen är högst
 * `maxAgeDays` gammal – annars är takten för osäker för att visa eller bygga en prognos på.
 */
export function weeklyRate(
  weights: readonly WeightEntry[],
  today: ISODate,
  windowDays = 28,
  maxAgeDays = 21,
): WeeklyRate | null {
  const sorted = sortByDate(weights).filter((w) => w.date <= today)
  if (sorted.length < 3) return null
  const lastDate = sorted[sorted.length - 1].date
  if (diffDays(lastDate, today) > maxAgeDays) return null
  const start = addDays(lastDate, -(windowDays - 1))
  const inWindow = sorted.filter((w) => w.date >= start)
  const spanDays = inWindow.length ? diffDays(inWindow[0].date, lastDate) : 0
  if (inWindow.length < 3 || spanDays < 10) return null
  const pts = weightTrend(sorted, 0.1).filter((p) => p.date >= start)
  const slope = slopePerDay(pts.map((p) => ({ x: diffDays(start, p.date), y: p.trend })))
  return { kgPerWeek: slope * 7, spanDays, weighIns: inWindow.length }
}

/** Kvalitativ beskrivning av en förändring per vecka – för medvetet läge (inga siffror). */
export function trendWord(kgPerWeek: number | undefined): string {
  if (kgPerWeek === undefined || !Number.isFinite(kgPerWeek)) return 'För tidigt att säga'
  const a = Math.abs(kgPerWeek)
  if (a < 0.1) return 'Stabil'
  const dir = kgPerWeek < 0 ? 'nedåtgående' : 'uppåtgående'
  return a < 0.35 ? `Svagt ${dir}` : capitalize(dir)
}

// ---------------------------------------------------------------------------
// BMI
// ---------------------------------------------------------------------------

/**
 * Från 70 år gäller en högre nedre BMI-gräns (22 i stället för 18,5) – hos äldre är BMI under 22
 * ett tecken på risk för undernäring. Reglerna finns i lib/energy så att Idag, Vikt och målen
 * räknar likadant.
 */
export { OLDER_ADULT_AGE }
export { minHealthyBmi } from '../../lib/energy'

export interface BmiDisplay {
  /** Värdet avrundat till en decimal – samma tal som visas och klassas. */
  value: number
  /** Klassning, eller undefined när BMI inte är meningsfullt (under 18 år, graviditet). */
  category?: { label: string; tone: 'good' | 'neutral' }
}

/**
 * BMI för visning. Klassningen görs på det avrundade värdet så att siffran och etiketten
 * alltid stämmer överens (24,97 visas som "25" och klassas då inte som normalvikt).
 * Från 70 år räknas 22–27 som normalt och under 22 som lägre än rekommenderat.
 */
export function bmiDisplay(weightKg: number, heightCm: number, age: number | undefined, lifeStage: LifeStage | undefined): BmiDisplay | undefined {
  if (!(weightKg > 0) || !(heightCm > 0)) return undefined
  const value = round1(bmi(weightKg, heightCm))
  if ((age !== undefined && age < 18) || lifeStage === 'gravid') return { value }
  if (age !== undefined && age >= OLDER_ADULT_AGE) {
    if (value < 22) return { value, category: { label: 'Lägre än rekommenderat för din ålder', tone: 'neutral' } }
    if (value < 27) return { value, category: { label: 'Normalvikt för din ålder', tone: 'good' } }
  }
  const c = bmiCategory(value)
  return { value, category: { label: c.label, tone: c.tone === 'good' ? 'good' : 'neutral' } }
}

// ---------------------------------------------------------------------------
// Mål och prognos
// ---------------------------------------------------------------------------

/** Andel (0–1) av vägen från startvikt till målvikt. undefined om start och mål är samma. */
export function goalProgress(startKg: number, currentKg: number, targetKg: number): number | undefined {
  const total = targetKg - startKg
  if (!Number.isFinite(total) || Math.abs(total) < 0.05) return undefined
  return Math.min(1, Math.max(0, (currentKg - startKg) / total))
}

export type GoalStatus =
  /** Inget målviktsmål (behålla vikten eller ingen målvikt satt). */
  | { kind: 'none' }
  /**
   * Viktnedgång rekommenderas inte just nu: graviditet, amning, under 18 år eller en vikt som
   * redan ligger under det hälsosamma BMI-intervallet för längden (och åldern).
   */
  | { kind: 'paused'; reason: 'gravid' | 'ammar' | 'under18' | 'lowBmi' }
  | { kind: 'reached' }
  /** För få vägningar för en prognos. */
  | { kind: 'early' }
  /** Trenden står still eller går åt andra hållet – helt okej, ingen prognos. */
  | { kind: 'steady' }
  | { kind: 'projected'; date: ISODate; weeks: number }

export interface GoalStatusInput {
  goal: GoalType | undefined
  targetKg: number | undefined
  trendKg: number
  rate: WeeklyRate | null
  lifeStage: LifeStage | undefined
  /** Ålder enligt födelseåret (70-årsgränsen för BMI). */
  age: number | undefined
  /** Yngsta möjliga ålder (18-årsgränsen). Saknas den används `age`. */
  youngestAge?: number
  /** Längd för BMI-kontrollen (utan längd görs ingen kontroll). */
  heightCm?: number
  today: ISODate
}

/**
 * Status för målvikten: nådd, prognos, stabil eller pausad.
 *
 * Samma regler som dagsmålet (`goalPause` i lib/energy): viktnedgång pausas vid graviditet,
 * amning, under 18 år och när trendvikten ligger under `minHealthyBmi` – även utan satt målvikt,
 * eftersom underskottet annars fortsätter. Nådd målvikt räknas som "behålla" i dagsmålet.
 */
export function goalStatus({ goal, targetKg, trendKg, rate, lifeStage, age, youngestAge: young, heightCm, today }: GoalStatusInput): GoalStatus {
  const pause = goalPause({ goal, lifeStage, youngestAge: young ?? age, age, heightCm, weightKg: trendKg, targetWeightKg: targetKg })
  if (pause === 'reached') return { kind: 'reached' }
  if (pause) return { kind: 'paused', reason: pause }
  if (goal === undefined || goal === 'behalla' || targetKg === undefined || !Number.isFinite(targetKg)) return { kind: 'none' }
  if (!rate) return { kind: 'early' }
  if (Math.abs(rate.kgPerWeek) < 0.05) return { kind: 'steady' }
  const date = projectGoalDate(trendKg, rate.kgPerWeek, targetKg, today)
  if (!date) return { kind: 'steady' }
  return { kind: 'projected', date, weeks: diffDays(today, date) / 7 }
}

/** "14 december" – med år om datumet ligger ett annat år än `today`. */
export function goalDateLabel(date: ISODate, today: ISODate): string {
  const d = fromISODate(date)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === fromISODate(today).getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** Startdatum för profilen (om känt). */
export function profileStartDate(createdAt: number | undefined): ISODate | undefined {
  if (!createdAt || !Number.isFinite(createdAt) || createdAt <= 0) return undefined
  return toISODate(new Date(createdAt))
}

// ---------------------------------------------------------------------------
// Samlad översikt
// ---------------------------------------------------------------------------

export interface BodyOverview {
  /** Vägningar stigande på datum. */
  sorted: WeightEntry[]
  latest?: WeightEntry
  /** Trendserie från första vägningen till idag. */
  points: TrendPoint[]
  trendKg?: number
  /** Trendförändring senaste 7 respektive 30 dagarna. */
  change7?: number
  change30?: number
  rate: WeeklyRate | null
  age?: number
  good?: 'up' | 'down'
  status: GoalStatus
  startKg?: number
  startDate?: ISODate
  /** Andel av vägen till målvikten (0–1). */
  progress?: number
  /** Dagar sedan senaste vägningen. */
  daysSinceLast?: number
}

type OverviewProfile = Pick<Profile, 'goal' | 'targetWeightKg' | 'lifeStage' | 'birthYear' | 'startWeightKg' | 'createdAt'> &
  Partial<Pick<Profile, 'heightCm'>>

/** Allt som sidans överblick behöver, beräknat en gång. */
export function bodyOverview(weights: readonly WeightEntry[], profile: OverviewProfile | null | undefined, today: ISODate): BodyOverview {
  const sorted = sortByDate(weights)
  const latest = sorted[sorted.length - 1]
  const points = trendSeries(sorted, today)
  const trendKg = points.length ? points[points.length - 1].trend : undefined
  const age = profile ? ageFromBirthYear(profile.birthYear, today) : undefined
  const young = profile ? youngestAge(profile.birthYear, today) : undefined
  const rate = weeklyRate(sorted, today)
  const startKg = profile?.startWeightKg ?? sorted[0]?.kg
  const target = profile?.targetWeightKg
  const status =
    trendKg === undefined
      ? ({ kind: 'none' } as const)
      : goalStatus({ goal: profile?.goal, targetKg: target, trendKg, rate, lifeStage: profile?.lifeStage, age, youngestAge: young, heightCm: profile?.heightCm, today })
  return {
    sorted,
    latest,
    points,
    trendKg,
    change7: trendChange(points, 7),
    change30: trendChange(points, 30),
    rate,
    age,
    // Pausat eller nått mål har ingen "önskad" riktning, och viktnedgång tonas aldrig grönt.
    good: status.kind === 'paused' || status.kind === 'reached' ? undefined : goodDirection(profile?.goal, profile?.lifeStage, young),
    status,
    startKg,
    startDate: profileStartDate(profile?.createdAt) ?? sorted[0]?.date,
    progress:
      trendKg !== undefined && startKg !== undefined && target !== undefined && profile?.goal !== 'behalla' && status.kind !== 'paused'
        ? goalProgress(startKg, trendKg, target)
        : undefined,
    daysSinceLast: latest ? diffDays(latest.date, today) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Diagramfönster
// ---------------------------------------------------------------------------

export type WeightRange = '30' | '90' | '365' | 'allt'

export const WEIGHT_RANGES: ReadonlyArray<{ value: WeightRange; label: string; long: string; days?: number }> = [
  { value: '30', label: '30 d', long: 'senaste 30 dagarna', days: 30 },
  { value: '90', label: '90 d', long: 'senaste 90 dagarna', days: 90 },
  { value: '365', label: '1 år', long: 'senaste året', days: 365 },
  { value: 'allt', label: 'Allt', long: 'all historik' },
]

/**
 * x-axelns fönster för ett intervall: börjar tidigast vid första vägningen (inget tomt utrymme)
 * och slutar idag. Fönstret är alltid minst en vecka så att axeln blir läsbar.
 */
export function chartWindow(range: WeightRange, firstDate: ISODate, today: ISODate): [ISODate, ISODate] {
  const days = WEIGHT_RANGES.find((r) => r.value === range)?.days
  const rangeStart = days ? addDays(today, -(days - 1)) : firstDate
  let start = rangeStart > firstDate ? rangeStart : firstDate
  const minStart = addDays(today, -6)
  if (start > minStart) start = minStart
  return [start, today]
}

/** Hur långt från datan målvikten får ligga och ändå dras in i viktkurvans y-axel (kg). */
export const GOAL_DOMAIN_MARGIN = 5

export interface GoalPlacement {
  /** Ska målvikten vidga y-axeln? (Bara när den ligger nära datan – annars blir kurvan platt.) */
  includeInDomain: boolean
  /** Hamnar målvikten inom diagrammets slutliga (avrundade) y-axel och ritas alltså ut? */
  visible: boolean
}

/**
 * Var målvikten hamnar i viktkurvan. Axeln avrundas till "snygga" värden på samma sätt som i
 * `LineChart` (`niceTicks` med `tickCount` intervall), så ett mål strax utanför datan kan ändå
 * synas. `visible` avgör om texten "ligger utanför diagrammet" ska visas.
 */
export function goalChartPlacement(
  values: readonly number[],
  targetKg: number,
  tickCount = 4,
  margin = GOAL_DOMAIN_MARGIN,
): GoalPlacement {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0 || !Number.isFinite(targetKg)) return { includeInDomain: false, visible: false }
  let lo = Math.min(...finite)
  let hi = Math.max(...finite)
  const includeInDomain = targetKg >= lo - margin && targetKg <= hi + margin
  if (includeInDomain) {
    lo = Math.min(lo, targetKg)
    hi = Math.max(hi, targetKg)
  }
  const ticks = niceTicks(lo, hi, tickCount)
  const eps = 1e-9
  const visible = ticks.length > 0 && targetKg >= ticks[0] - eps && targetKg <= ticks[ticks.length - 1] + eps
  return { includeInDomain, visible }
}

// ---------------------------------------------------------------------------
// Historik per månad
// ---------------------------------------------------------------------------

export interface MonthGroup {
  /** 'YYYY-MM' */
  key: string
  /** "September" eller "September 2025" (år visas om det inte är innevarande år). */
  label: string
  /** Vägningar i månaden, nyaste först. */
  entries: WeightEntry[]
  averageKg: number
  /** Förändring från månadens första till sista vägning (om minst två). */
  changeKg?: number
}

/** Grupperar vägningar per kalendermånad, nyaste månaden först. */
export function groupWeightsByMonth(weights: readonly WeightEntry[], today: ISODate): MonthGroup[] {
  const currentYear = today.slice(0, 4)
  const map = new Map<string, WeightEntry[]>()
  for (const w of sortByDate(weights)) {
    const key = w.date.slice(0, 7)
    const list = map.get(key)
    if (list) list.push(w)
    else map.set(key, [w])
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, asc]) => {
      const [year, month] = key.split('-')
      const name = capitalize(MONTHS[Number(month) - 1] ?? key)
      return {
        key,
        label: year === currentYear ? name : `${name} ${year}`,
        entries: [...asc].reverse(),
        averageKg: asc.reduce((s, w) => s + w.kg, 0) / asc.length,
        changeKg: asc.length >= 2 ? asc[asc.length - 1].kg - asc[0].kg : undefined,
      }
    })
}

/** Skillnad mot föregående vägning (kronologiskt), per vägnings-id. */
export function weighInDiffs(weights: readonly WeightEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  const sorted = sortByDate(weights)
  for (let i = 1; i < sorted.length; i++) out.set(sorted[i].id, sorted[i].kg - sorted[i - 1].kg)
  return out
}

// ---------------------------------------------------------------------------
// Kroppsmått
// ---------------------------------------------------------------------------

export const MEASURE_KEYS = ['waistCm', 'hipCm', 'chestCm', 'armCm', 'thighCm', 'bodyFatPct'] as const
export type MeasureKey = (typeof MEASURE_KEYS)[number]

export interface MeasureMeta {
  label: string
  unit: 'cm' | '%'
  /** Hur man mäter – visas som hjälptext. */
  hint: string
  min: number
  max: number
}

export const MEASURE_META: Record<MeasureKey, MeasureMeta> = {
  waistCm: { label: 'Midja', unit: 'cm', hint: 'I höjd med naveln, efter en lugn utandning.', min: 30, max: 250 },
  hipCm: { label: 'Höft', unit: 'cm', hint: 'Runt stjärtens bredaste del.', min: 40, max: 250 },
  chestCm: { label: 'Bröst', unit: 'cm', hint: 'Runt bröstkorgens bredaste del.', min: 40, max: 250 },
  armCm: { label: 'Överarm', unit: 'cm', hint: 'Mitt på överarmen, avslappnad.', min: 10, max: 100 },
  thighCm: { label: 'Lår', unit: 'cm', hint: 'Runt lårets bredaste del.', min: 20, max: 150 },
  bodyFatPct: { label: 'Fettprocent', unit: '%', hint: 'T.ex. från en kroppsanalysvåg – jämför helst över tid.', min: 2, max: 70 },
}

/** Formaterat måttvärde, t.ex. "84,5 cm" eller "24 %". */
export function formatMeasure(key: MeasureKey, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '–'
  return `${formatNumber(value, 1)} ${MEASURE_META[key].unit}`
}

/** Mått som har minst ett registrerat värde, i fast ordning. */
export function usedMeasureKeys(list: readonly MeasurementEntry[]): MeasureKey[] {
  return MEASURE_KEYS.filter((k) => list.some((m) => m[k] !== undefined && Number.isFinite(m[k])))
}

/** Alla värden för ett mått, stigande på datum. */
export function measureSeries(list: readonly MeasurementEntry[], key: MeasureKey): Array<{ date: ISODate; value: number }> {
  const out: Array<{ date: ISODate; value: number }> = []
  for (const m of sortByDate(list)) {
    const v = m[key]
    if (v !== undefined && Number.isFinite(v)) out.push({ date: m.date, value: v })
  }
  return out
}

export interface LatestMeasure {
  value: number
  date: ISODate
  /** Förändring mot föregående mätning av samma mått. */
  change?: number
  /** Förändring mot första mätningen. */
  sinceFirst?: number
  count: number
}

/** Senaste värdet för ett mått med förändringar, eller undefined om det aldrig mätts. */
export function latestMeasure(list: readonly MeasurementEntry[], key: MeasureKey): LatestMeasure | undefined {
  const s = measureSeries(list, key)
  if (s.length === 0) return undefined
  const last = s[s.length - 1]
  return {
    value: last.value,
    date: last.date,
    change: s.length >= 2 ? last.value - s[s.length - 2].value : undefined,
    sinceFirst: s.length >= 2 ? last.value - s[0].value : undefined,
    count: s.length,
  }
}

export interface MeasurementRow {
  entry: MeasurementEntry
  /** Förändring mot närmast föregående mätning där samma mått finns. */
  changes: Partial<Record<MeasureKey, number>>
}

/** Rader för historiktabellen, nyaste först, med förändring per mått. */
export function measurementRows(list: readonly MeasurementEntry[]): MeasurementRow[] {
  const sorted = sortByDate(list)
  const lastSeen: Partial<Record<MeasureKey, number>> = {}
  const rows: MeasurementRow[] = []
  for (const entry of sorted) {
    const changes: Partial<Record<MeasureKey, number>> = {}
    for (const k of MEASURE_KEYS) {
      const v = entry[k]
      if (v === undefined || !Number.isFinite(v)) continue
      const prev = lastSeen[k]
      if (prev !== undefined) changes[k] = v - prev
      lastSeen[k] = v
    }
    rows.push({ entry, changes })
  }
  return rows.reverse()
}

/** true om minst ett mått har ett giltigt värde. */
export function hasAnyMeasure(values: Partial<Record<MeasureKey, number | undefined>>): boolean {
  return MEASURE_KEYS.some((k) => {
    const v = values[k]
    return v !== undefined && Number.isFinite(v)
  })
}

// ---------------------------------------------------------------------------
// Midjemått i förhållande till längd (WHtR)
// ---------------------------------------------------------------------------

export function waistToHeight(waistCm: number, heightCm: number): number | undefined {
  if (!(waistCm > 0) || !(heightCm > 0)) return undefined
  return waistCm / heightCm
}

/**
 * Vilket intervall midja/längd-kvoten ligger i. Etiketterna är neutrala intervall – inga
 * riskbedömningar för den enskilda personen (Lagom är ingen medicinteknisk produkt, se
 * docs/AVSETT-ANDAMAL.md). Den allmänna kopplingen till befolkningsstudier förklaras i text
 * under nyckeltalen, med hänvisning till 1177.
 */
export function whtrCategory(ratio: number): { label: string; tone: 'mossa' | 'hjortron' | 'neutral' } {
  // Samma två decimaler som visas ("0,60" hamnar i 0,5–0,6, inte "Över 0,6").
  const r = Math.round(ratio * 100) / 100
  if (r < 0.4) return { label: 'Under 0,4', tone: 'neutral' }
  if (r < 0.5) return { label: 'Under 0,5', tone: 'mossa' }
  if (r <= 0.6) return { label: '0,5–0,6', tone: 'hjortron' }
  return { label: 'Över 0,6', tone: 'hjortron' }
}

// ---------------------------------------------------------------------------
// Adaptiv energiförbrukning – underlag
// ---------------------------------------------------------------------------

/** Energiintag (kcal) per dag ur dagboken. Dagar utan poster tas inte med. */
export function intakeByDay(entries: Readonly<Record<ISODate, readonly DiaryEntry[] | undefined>>): Record<ISODate, number> {
  const out: Record<ISODate, number> = {}
  for (const [date, list] of Object.entries(entries)) {
    if (!list || list.length === 0) continue
    out[date] = totals(list).kcal ?? 0
  }
  return out
}

/**
 * Varför adaptiv förbrukning inte används (graviditet, amning, under 18 år). Regeln finns i
 * lib/energy och används av både dagsmålen (`computeEnergy`/`useTargets`) och korten.
 */
export { adaptiveBlockReason, adaptiveBlockReasonFor } from '../../lib/energy'

/** Samma krav som `estimateAdaptiveTdee` i lib/energy. */
export const ADAPTIVE_REQUIREMENTS = {
  windowDays: 28,
  minLoggedDays: 14,
  minWeighIns: 4,
  minSpanDays: 14,
  /** Dagar under detta räknas som ofullständigt loggade. */
  minDayKcal: 800,
} as const

export interface AdaptiveProgress {
  loggedDays: number
  weighIns: number
  spanDays: number
  ready: boolean
}

/**
 * Hur långt användaren har kommit mot kraven för adaptiv förbrukning (fönster: senaste 4 veckorna).
 * Speglar villkoren i `estimateAdaptiveTdee` så att UI kan visa vad som saknas.
 */
export function adaptiveProgress(
  intake: Readonly<Record<ISODate, number>>,
  weights: readonly WeightEntry[],
  today: ISODate,
): AdaptiveProgress {
  const r = ADAPTIVE_REQUIREMENTS
  const start = addDays(today, -(r.windowDays - 1))
  const end = addDays(today, -1)
  const loggedDays = Object.entries(intake).filter(([d, kcal]) => d >= start && d <= end && kcal >= r.minDayKcal).length
  const inWindow = sortByDate(weights.filter((w) => w.date >= start && w.date <= today))
  const spanDays = inWindow.length >= 2 ? diffDays(inWindow[0].date, inWindow[inWindow.length - 1].date) : 0
  return {
    loggedDays,
    weighIns: inWindow.length,
    spanDays,
    ready: loggedDays >= r.minLoggedDays && inWindow.length >= r.minWeighIns && spanDays >= r.minSpanDays,
  }
}

/** Vad som saknas, på svenska, t.ex. ["5 loggade dagar till", "2 vägningar till"]. */
export function adaptiveNeeds(p: AdaptiveProgress): string[] {
  const r = ADAPTIVE_REQUIREMENTS
  const out: string[] = []
  const days = r.minLoggedDays - p.loggedDays
  if (days > 0) out.push(`${days} ${days === 1 ? 'loggad dag' : 'loggade dagar'} till`)
  const w = r.minWeighIns - p.weighIns
  if (w > 0) out.push(`${w} ${w === 1 ? 'vägning' : 'vägningar'} till`)
  if (p.spanDays < r.minSpanDays && w <= 0) out.push('vägningar utspridda över minst två veckor')
  return out
}

/** "a, b och c" */
export function joinSv(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} och ${items[items.length - 1]}`
}

/** Svensk etikett för säkerheten i skattningen. */
export function confidenceLabel(c: 'låg' | 'medel' | 'hög'): string {
  return c === 'hög' ? 'Hög säkerhet' : c === 'medel' ? 'Medelhög säkerhet' : 'Låg säkerhet'
}

/**
 * Kvalitativ jämförelse mellan uppmätt och beräknad förbrukning (för medvetet läge och
 * som komplement till siffrorna).
 */
export function compareTdeeText(adaptive: number, formula: number): string {
  const diff = adaptive - formula
  if (Math.abs(diff) < 100) return 'Din förbrukning ligger nära det formeln räknar med.'
  return diff > 0
    ? 'Din kropp verkar göra av med lite mer energi än formeln räknar med.'
    : 'Din kropp verkar göra av med lite mindre energi än formeln räknar med – helt vanligt, formler är bara genomsnitt.'
}
