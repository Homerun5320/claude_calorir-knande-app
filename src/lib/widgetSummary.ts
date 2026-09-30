/**
 * Hemskärmswidgeten (Android; iPhone senare, se docs/WIDGET.md) – sammanfattningen som appen
 * skickar till widgeten. En ren funktion utan React och utan butiker: `buildWidgetPayload(input,
 * now)` får vanliga data (dagboken, profilen och inställningarna, vikterna, fastan och
 * exempelmarkeringen) och ger `WidgetPayload` version 1 – kontraktet med widgeten i
 * android/ (pluginet `LagomWidget`, src/native/widget.ts skickar den).
 *
 * - All text som widgeten visar formateras här, på svenska och med src/lib/format.ts – widgeten
 *   formaterar aldrig tal själv.
 * - Dagarna: idag och de sex följande lokala datumen, var och en med sitt eget dagsmål (med
 *   veckobudgeten, `targetsFor`). Widgeten visar dagen som stämmer med telefonens datum, så att
 *   den stämmer även efter midnatt när appen inte har öppnats. Finns ingen sådan dag visas
 *   `fallbackText`.
 * - Samma siffror som dagsringen på Idag (DayRingCard): ätit och mål avrundas i visningsenheten,
 *   träningen läggs till med användarens andel (`dailyBudget`), och kvar/över kommer från
 *   `summarizeRing`. Över målet står det neutralt ("140 kcal över – helt okej") – aldrig en
 *   varning.
 * - Medvetet läge: inga energisiffror och ingen energistapel (null och −1).
 * - Exempeldata och ingen profil: inga siffror alls, bara en rad (`state` 'demo'/'noProfile').
 * - Inga namn på livsmedel, måltider eller anteckningar följer med – bara summor och antal.
 */
import { formatLiters } from '../components/domain/WaterGlasses'
import { summarizeRing } from '../components/signature/CalorieRing'
import { roundEnergy } from '../features/diary/diaryLogic'
import type { DayMeta, DiaryEntry, ExerciseEntry, ISODate, Profile, Settings, Targets, WeightEntry } from '../types'
import { addDays, todayISO } from './dates'
import { dailyBudget, entriesByMeal, totals } from './diary'
import { formatDuration, formatEnergy, formatNumber } from './format'
import { computeTargetsInfo } from './targetsInfo'

/** Kontraktets version (fältet `v`). */
export const WIDGET_PAYLOAD_VERSION = 1
/** Längsta JSON-text som widgeten tar emot (tecken). Längre text avvisas och den förra ligger kvar. */
export const WIDGET_MAX_CHARS = 32_768
/** Antal dagar i sammanfattningen: idag och de sex följande. */
export const WIDGET_DAYS = 7

/** Texterna som widgeten visar utan siffror. */
export const WIDGET_TEXT = {
  /** Ingen dag stämmer med telefonens datum (appen har inte öppnats på en vecka). */
  openApp: 'Öppna Lagom för dagens siffror',
  noProfile: 'Skapa din profil i Lagom',
  demo: 'Widgeten visar inte exempeldata',
  nothingLogged: 'Inget loggat än',
  /** Inom ±3 % av dagens budget (samma gräns som dagsringen). */
  lagom: 'Precis lagom idag',
  fasting: 'Fasta pågår',
} as const

/** 'ok' = dagens siffror, 'noProfile' = ingen profil ännu, 'demo' = appen visar exempeldata. */
export type WidgetState = 'ok' | 'noProfile' | 'demo'

export interface WidgetDay {
  /** Lokalt datum, 'YYYY-MM-DD'. */
  date: ISODate
  /** "1 240 kcal kvar", "140 kcal över – helt okej" eller "Precis lagom idag". null i medvetet läge. */
  energyText: string | null
  /** "760 av 2 000 kcal" (ätit av dagens budget med träning). null i medvetet läge. */
  energyDetail: string | null
  /** Förloppet mot dagens budget i promille, högst 1 000. −1 = ingen stapel (medvetet läge). */
  energyPermille: number
  /** "Inget loggat än", "1 måltid loggad", "3 måltider loggade". */
  mealsText: string
  /** "0,75 av 2 l". null = visa inget vatten. */
  waterText: string | null
  /** Förloppet mot dryckesmålet i promille, högst 1 000. −1 = ingen stapel. */
  waterPermille: number
}

export interface WidgetFasting {
  /** När fastan började (epoch ms) – widgeten räknar själv upp tiden. */
  startedAt: number
  /** "Fasta pågår". */
  label: string
  /** "Mål 16 h". */
  targetText: string
}

export interface WidgetPayload {
  v: typeof WIDGET_PAYLOAD_VERSION
  /** När sammanfattningen byggdes (epoch ms). */
  generatedAt: number
  state: WidgetState
  mindful: boolean
  /** Visas när ingen dag stämmer med dagens datum, eller när `state` inte är 'ok'. */
  fallbackText: string
  /** Idag först, sedan de sex följande dagarna. Tom när `state` inte är 'ok'. */
  days: WidgetDay[]
  fasting: WidgetFasting | null
}

/** Dagsmålen per datum och hur mycket av träningen som läggs till – samma som `useTargets`. */
export interface WidgetTargets {
  targetsFor: (date: ISODate) => Targets
  /** `useTargets().exerciseAddBack.pct` (0–100). */
  addBackPct: number
}

/** Allt som sammanfattningen bygger på – butikernas tillstånd som vanliga data. */
export interface WidgetInput {
  profile: Profile | null
  settings: Settings
  /** Vägningarna (bodyStore) – dagsmålen bygger på vikten. */
  weights: readonly WeightEntry[]
  diary: {
    entries: Readonly<Record<ISODate, readonly DiaryEntry[] | undefined>>
    water: Readonly<Record<ISODate, number | undefined>>
    exercise: Readonly<Record<ISODate, readonly ExerciseEntry[] | undefined>>
    /** Dagarnas markeringar – behövs för adaptiv förbrukning ("dagen är klar"). */
    days: Readonly<Record<ISODate, DayMeta | undefined>>
  }
  /** Pågående fasta (fastingStore `active`), annars null. */
  fasting: { start: number; targetHours: number } | null
  /** Appen visar exempeldata (`isDemoData()`). */
  demo: boolean
  /** Färdiga dagsmål (t.ex. i tester). Utan dem räknas de som `useTargets` gör (`widgetTargets`). */
  targets?: WidgetTargets
}

// ---------------------------------------------------------------------------
// Dagsmålen
// ---------------------------------------------------------------------------

/**
 * Dagsmålen per datum och träningens andel utanför React – samma beräkning som `useTargets`
 * (`computeTargetsInfo` i src/lib/targetsInfo.ts): vikten till och med idag, trendvikten, adaptiv
 * förbrukning när den är påslagen och får användas, egna mål, veckobudgeten och `exerciseAddBack`.
 * widgetSummary.test.ts jämför resultatet med kroken. null utan profil (widgeten visar då inga
 * siffror).
 */
export function widgetTargets(input: Pick<WidgetInput, 'profile' | 'settings' | 'weights' | 'diary'>, today: ISODate): WidgetTargets | null {
  if (!input.profile) return null
  const info = computeTargetsInfo(
    { profile: input.profile, settings: input.settings, weights: input.weights, entries: input.diary.entries, days: input.diary.days },
    today,
  )
  return { targetsFor: info.targetsFor, addBackPct: info.exerciseAddBack.pct }
}

// ---------------------------------------------------------------------------
// En dag
// ---------------------------------------------------------------------------

const permille = (ratio: number): number => (Number.isFinite(ratio) ? Math.min(1000, Math.max(0, Math.round(ratio * 1000))) : 0)

/** "Inget loggat än", "1 måltid loggad", "3 måltider loggade" – måltider med minst en post. */
export function mealsLoggedText(entries: readonly DiaryEntry[] | undefined): string {
  const count = Object.values(entriesByMeal(entries ?? [])).filter((list) => list.length > 0).length
  if (count === 0) return WIDGET_TEXT.nothingLogged
  return count === 1 ? '1 måltid loggad' : `${formatNumber(count)} måltider loggade`
}

interface DayContext {
  input: WidgetInput
  targets: WidgetTargets
  unit: 'kcal' | 'kJ'
  mindful: boolean
}

function widgetDay(date: ISODate, { input, targets, unit, mindful }: DayContext): WidgetDay {
  const entries = input.diary.entries[date]
  const target = targets.targetsFor(date)
  let energyText: string | null = null
  let energyDetail: string | null = null
  let energyPermille = -1
  if (!mindful) {
    // Som dagsringen (DayRingCard): avrunda i visningsenheten innan kvar/över räknas ut – då går
    // siffrorna jämnt upp.
    const eaten = roundEnergy(Math.max(0, totals(entries ?? []).kcal ?? 0), unit)
    const budget = roundEnergy(target.kcal, unit)
    const exerciseAdded = roundEnergy(Math.max(0, dailyBudget(target.kcal, input.diary.exercise[date], targets.addBackPct) - target.kcal), unit)
    const ring = summarizeRing(eaten, budget, exerciseAdded)
    if (ring.status === 'lagom') energyText = WIDGET_TEXT.lagom
    else if (ring.over > 0) energyText = `${formatEnergy(ring.over, unit)} över – helt okej`
    else energyText = `${formatEnergy(ring.remaining, unit)} kvar`
    energyDetail = `${formatEnergy(ring.eaten, unit, false)} av ${formatEnergy(ring.total, unit)}`
    energyPermille = permille(ring.ratio)
  }
  const waterMl = Math.max(0, input.diary.water[date] ?? 0)
  const waterTarget = target.waterMl
  const hasWaterTarget = Number.isFinite(waterTarget) && waterTarget > 0 && Number.isFinite(waterMl)
  return {
    date,
    energyText,
    energyDetail,
    energyPermille,
    mealsText: mealsLoggedText(entries),
    // "0,75 av 2 l" – som vattenkortet på Idag (formatLiters).
    waterText: hasWaterTarget ? `${formatNumber(waterMl / 1000, 2)} av ${formatLiters(waterTarget)}` : null,
    waterPermille: hasWaterTarget ? permille(waterMl / waterTarget) : -1,
  }
}

/** En pågående fasta – en trasig (t.ex. ur en gammal säkerhetskopia) visas inte, så att widgeten inte avvisar allt. */
function widgetFasting(active: WidgetInput['fasting']): WidgetFasting | null {
  if (!active || !Number.isFinite(active.start) || !(active.start > 0) || !Number.isFinite(active.targetHours) || !(active.targetHours > 0)) return null
  // Widgeten kräver ett heltal (ms).
  return { startedAt: Math.round(active.start), label: WIDGET_TEXT.fasting, targetText: `Mål ${formatDuration(active.targetHours * 60)}` }
}

// ---------------------------------------------------------------------------
// Sammanfattningen
// ---------------------------------------------------------------------------

/**
 * Sammanfattningen för widgeten vid tidpunkten `now` (lokal tid avgör datumen). Ren funktion –
 * kastar bara om indata är trasiga på ett sätt som butikerna aldrig ger.
 */
export function buildWidgetPayload(input: WidgetInput, now: Date = new Date()): WidgetPayload {
  const mindful = input.settings.mindfulMode === true
  // Fälten i kontraktets ordning – lättare att läsa i widgetens logg.
  const payload = (state: WidgetState, fallbackText: string, days: WidgetDay[] = [], fasting: WidgetFasting | null = null): WidgetPayload => ({
    v: WIDGET_PAYLOAD_VERSION,
    generatedAt: now.getTime(),
    state,
    mindful,
    fallbackText,
    days,
    fasting,
  })
  // Exempeldata visas aldrig i widgeten – den ska inte se ut som någons riktiga dagbok.
  if (input.demo) return payload('demo', WIDGET_TEXT.demo)
  if (!input.settings.onboardingDone || input.profile === null) return payload('noProfile', WIDGET_TEXT.noProfile)

  const today = todayISO(now)
  const targets = input.targets ?? widgetTargets(input, today)
  if (!targets) return payload('noProfile', WIDGET_TEXT.noProfile)
  const ctx: DayContext = { input, targets, unit: input.settings.energyUnit === 'kJ' ? 'kJ' : 'kcal', mindful }
  const days = Array.from({ length: WIDGET_DAYS }, (_, i) => widgetDay(addDays(today, i), ctx))
  return payload('ok', WIDGET_TEXT.openApp, days, widgetFasting(input.fasting))
}

/** JSON-texten som skickas till widgeten (`LagomWidget.update({ data })`). */
export function serializeWidgetPayload(payload: WidgetPayload): string {
  return JSON.stringify(payload)
}
