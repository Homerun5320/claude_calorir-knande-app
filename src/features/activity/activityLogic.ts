/**
 * Ren logik för träningssidan: veckans rörelse, energiberäkning med fart, steg och sök.
 *
 * All energi är *netto* (utöver vila) – se förklaringen i `src/lib/exercise.ts`.
 */
import type { ActivityLevel, ExerciseEntry, ISODate } from '../../types'
import { ACTIVITIES, ACTIVITY_GROUPS, ACTIVITY_GROUP_ORDER, getActivity, type Activity, type ActivityGroup } from '../../data/activities'
import {
  exerciseKcal,
  metForSpeed,
  metIntensity,
  moderateEquivalentMinutes,
  paceMinPerKm,
  searchActivities,
  speedKmh,
  STEP_BASELINE,
  stepsKcalAboveBaseline,
  stepsToKcal,
  stepsToKm,
  WEEKLY_ACTIVE_MINUTES_GOAL,
  type Intensity,
  type SpeedActivity,
} from '../../lib/exercise'
import { addDays, dateRange, startOfWeek } from '../../lib/dates'
import { formatNumber } from '../../lib/format'

/** Stabil tom lista (för Zustand-selektorer). */
export const EMPTY_EXERCISE: readonly ExerciseEntry[] = []

/** Vikt som används när ingen vikt är loggad och profil saknas. */
export const FALLBACK_WEIGHT_KG = 70

/** Id för en egen aktivitet och för steg som lagts till som aktivitet. */
export const CUSTOM_ACTIVITY_ID = 'custom'
export const STEPS_ACTIVITY_ID = 'steg'

/** Minst så här många muskelstärkande pass per vecka (Folkhälsomyndigheten). */
export const WEEKLY_STRENGTH_GOAL = 2

/** 'YYYY-MM-DD' och ett giltigt kalenderdatum – definierad i lib/dates. */
export { isValidISODate } from '../../lib/dates'

/** Veckans sju dagar (måndag–söndag) för veckan som innehåller datumet. */
export function weekOf(date: ISODate): ISODate[] {
  const start = startOfWeek(date)
  return dateRange(start, addDays(start, 6))
}

// ---------------------------------------------------------------------------
// Intensitet
// ---------------------------------------------------------------------------

/** "Lätt", "Måttlig", "Hög". */
export function intensityLabel(i: Intensity): string {
  return i.charAt(0).toUpperCase() + i.slice(1)
}

/** Intensitet för en post: postens MET, annars aktivitetens. */
export function entryIntensity(entry: Pick<ExerciseEntry, 'met' | 'activityId'>): Intensity | null {
  const met = entry.met ?? getActivity(entry.activityId)?.met
  return met === undefined ? null : metIntensity(met)
}

/** Förval för egna aktiviteter. */
export const CUSTOM_INTENSITIES = [
  { value: 'latt', label: 'Lätt', met: 2.5, description: 'Kan prata och sjunga' },
  { value: 'mattlig', label: 'Måttlig', met: 4.5, description: 'Lite andfådd men kan prata' },
  { value: 'hog', label: 'Hög', met: 7, description: 'Svårt att prata i hela meningar' },
] as const
export type CustomIntensity = (typeof CUSTOM_INTENSITIES)[number]['value']

/** Närmaste förval för ett MET-värde (för att visa rätt val när en egen post redigeras). */
export function nearestCustomIntensity(met: number | undefined): CustomIntensity {
  if (met === undefined || !Number.isFinite(met)) return 'mattlig'
  let best: (typeof CUSTOM_INTENSITIES)[number] = CUSTOM_INTENSITIES[1]
  for (const c of CUSTOM_INTENSITIES) if (Math.abs(c.met - met) < Math.abs(best.met - met)) best = c
  return best.value
}

// ---------------------------------------------------------------------------
// Energi
// ---------------------------------------------------------------------------

/** Nettoförbrukning i hela kcal. */
export function netKcal(met: number, weightKg: number, minutes: number): number {
  return Math.round(exerciseKcal(met, weightKg, minutes))
}

/** Energi för vilan under passet (1 MET) – det klockor ofta räknar in i sin totalsiffra. */
export function restingKcalDuring(weightKg: number, minutes: number): number {
  if (!(weightKg > 0) || !(minutes > 0)) return 0
  return Math.round((weightKg * minutes) / 60)
}

/** Andel av träningen som läggs till dagens budget. */
export function addBackKcal(totalKcal: number, pct: number): number {
  return (Math.max(0, totalKcal) * Math.max(0, Math.min(100, pct))) / 100
}

const SPEED_KIND: Record<string, SpeedActivity> = {
  'promenad-flanera': 'gang',
  'promenad-lugn': 'gang',
  promenad: 'gang',
  'promenad-rask': 'gang',
  'promenad-mycket-rask': 'gang',
  'ga-till-jobbet': 'gang',
  joggning: 'lopning',
  'cykel-lugn': 'cykling',
  'cykel-pendling': 'cykling',
  'cykel-16-19': 'cykling',
  'cykel-19-22': 'cykling',
  'cykel-22-26': 'cykling',
  'cykel-26-30': 'cykling',
}

/** Rimliga farter (km/h) där kompendiets fartstabeller går att använda. */
const SPEED_RANGE: Record<SpeedActivity, [number, number]> = {
  gang: [2, 9],
  lopning: [5, 25],
  cykling: [6, 45],
}

/** Aktiviteter där energin kan räknas fram ur fart (gång, löpning och cykling på plan mark). */
export function speedKindFor(activityId: string | undefined): SpeedActivity | null {
  if (!activityId) return null
  if (/^lopning-\d+$/.test(activityId)) return 'lopning'
  return SPEED_KIND[activityId] ?? null
}

export interface EffectiveMet {
  met: number
  /** true när MET räknats fram ur angiven sträcka och tid. */
  fromSpeed: boolean
  /** Fart i km/h om sträcka och tid finns, annars undefined. */
  speed?: number
}

/**
 * MET-värde för ett pass. För gång, löpning och cykling räknas värdet om ur den faktiska farten
 * när sträcka och tid är angivna (och farten är rimlig), annars används aktivitetens värde.
 */
export function effectiveMet(activityId: string | undefined, baseMet: number, distanceKm: number | undefined, minutes: number | undefined): EffectiveMet {
  const speed = distanceKm && minutes ? speedKmh(distanceKm, minutes) : 0
  const kind = speedKindFor(activityId)
  if (kind && speed > 0) {
    const [lo, hi] = SPEED_RANGE[kind]
    if (speed >= lo && speed <= hi) return { met: metForSpeed(kind, speed), fromSpeed: true, speed }
  }
  return { met: baseMet, fromSpeed: false, speed: speed > 0 ? speed : undefined }
}

/**
 * Namn att spara för ett pass. Löpning i en bestämd fart ("Löpning 10 km/h") byter namn efter den
 * faktiska farten när sträcka och tid är angivna, så att namnet inte motsäger beräkningen.
 */
export function entryNameFor(activity: Pick<Activity, 'id' | 'name'>, eff: EffectiveMet, distanceKm: number | undefined, minutes: number | undefined): string {
  if (!eff.fromSpeed || !eff.speed || !/^lopning-\d+$/.test(activity.id)) return activity.name
  const pace = paceMinPerKm(distanceKm ?? 0, minutes ?? 0)
  const kmh = formatNumber(eff.speed, 1)
  return pace ? `Löpning ${kmh} km/h (${pace} min/km)` : `Löpning ${kmh} km/h`
}

/** Visa sträckfältet för aktiviteter där en sträcka är meningsfull. */
export function showsDistance(activity: Activity | undefined): boolean {
  if (!activity) return true
  if (activity.speedKmh !== undefined || speedKindFor(activity.id)) return true
  return activity.group === 'kondition' || activity.group === 'vinter' || activity.group === 'friluftsliv' || activity.group === 'vatten'
}

// ---------------------------------------------------------------------------
// Veckans rörelse
// ---------------------------------------------------------------------------

export interface DayMovement {
  date: ISODate
  /** Alla loggade minuter. */
  minutes: number
  /** Minuter omräknade till måttlig intensitet (hög räknas dubbelt, lätt räknas inte). */
  activeMinutes: number
}

export interface WeekMovement {
  days: DayMovement[]
  totalMinutes: number
  activeMinutes: number
  /** Antal pass med muskelstärkande träning (styrka ≥ 3 MET). */
  strengthSessions: number
  /** Dagar med minst en aktivitet. */
  activeDays: number
  /** Andel av veckomålet 0–1+ (aktiva minuter / 150). */
  ratio: number
}

/** Räknas passet som muskelstärkande? (Styrka, cirkelträning, klättring … men inte stretching och lugn yoga.) */
export function isStrengthSession(entry: Pick<ExerciseEntry, 'activityId' | 'met'>): boolean {
  const activity = getActivity(entry.activityId)
  if (!activity || activity.group !== 'styrka') return false
  return (entry.met ?? activity.met) >= 3
}

/** Summerar rörelsen för de angivna dagarna. */
export function weekMovement(
  exercise: Record<ISODate, readonly ExerciseEntry[] | undefined>,
  dates: readonly ISODate[],
  goal = WEEKLY_ACTIVE_MINUTES_GOAL,
): WeekMovement {
  let totalMinutes = 0
  let activeMinutes = 0
  let strengthSessions = 0
  let activeDays = 0
  const days = dates.map((date) => {
    const list = exercise[date] ?? EMPTY_EXERCISE
    const minutes = list.reduce((s, x) => s + (Number.isFinite(x.minutes) && x.minutes > 0 ? x.minutes : 0), 0)
    const active = moderateEquivalentMinutes(list)
    totalMinutes += minutes
    activeMinutes += active
    strengthSessions += list.filter(isStrengthSession).length
    if (list.length > 0) activeDays++
    return { date, minutes, activeMinutes: active }
  })
  return { days, totalMinutes, activeMinutes, strengthSessions, activeDays, ratio: goal > 0 ? activeMinutes / goal : 0 }
}

/** Vänlig, streak-fri uppmuntran utifrån veckans aktiva minuter. */
export function movementMessage(activeMinutes: number, totalMinutes: number, goal = WEEKLY_ACTIVE_MINUTES_GOAL): string {
  if (totalMinutes <= 0) return 'En ny vecka att röra på sig i – en promenad i lunchen räcker långt.'
  if (activeMinutes <= 0) return 'Skönt med lugn rörelse! Något som gör dig lite andfådd räknas mot veckans minuter.'
  const ratio = activeMinutes / goal
  if (ratio >= 1) return 'Veckans rekommenderade minuter är nådda – kroppen tackar dig. Allt extra är en bonus.'
  if (ratio >= 0.66) return 'Du är nästan där! Ett par promenader till så är veckans minuter nådda.'
  if (ratio >= 0.33) return 'Fin rörelse hittills – varje pass bygger på hälsan, oavsett längd.'
  return 'Bra start på veckan! Även korta stunder av rörelse räknas.'
}

// ---------------------------------------------------------------------------
// Steg
// ---------------------------------------------------------------------------

/** Ungefärlig stegtakt vid promenad – ca 100 steg per minut motsvarar måttlig intensitet. */
export const STEPS_PER_MINUTE = 100

/** MET som sparas för steg som läggs till som aktivitet (gång i ca 100 steg/min ≈ 3 MET). */
export const STEPS_MET = 3

export interface StepsEstimate {
  km: number
  /** Nettoenergi för alla steg. */
  kcal: number
  /** Steg som redan ingår i aktivitetsnivån (PAL). */
  baseline: number
  /** Steg utöver baslinjen. */
  extraSteps: number
  /** Nettoenergi för stegen utöver baslinjen – det som kan läggas till som aktivitet. */
  extraKcal: number
  /** Ungefärliga minuter för stegen utöver baslinjen. */
  extraMinutes: number
  extraKm: number
}

export function estimateSteps(steps: number, weightKg: number, level: ActivityLevel, heightCm?: number): StepsEstimate {
  const s = Number.isFinite(steps) && steps > 0 ? Math.round(steps) : 0
  const baseline = STEP_BASELINE[level]
  const extraSteps = Math.max(0, s - baseline)
  return {
    km: stepsToKm(s, heightCm),
    kcal: Math.round(stepsToKcal(s, weightKg, heightCm)),
    baseline,
    extraSteps,
    extraKcal: Math.round(stepsKcalAboveBaseline(s, weightKg, level, heightCm)),
    extraMinutes: Math.round(extraSteps / STEPS_PER_MINUTE),
    extraKm: stepsToKm(extraSteps, heightCm),
  }
}

// ---------------------------------------------------------------------------
// Sök och grupper
// ---------------------------------------------------------------------------

export type GroupFilter = ActivityGroup | 'alla'

export const GROUP_FILTERS: ReadonlyArray<{ value: GroupFilter; label: string; emoji: string }> = [
  { value: 'alla', label: 'Alla', emoji: '✨' },
  ...ACTIVITY_GROUP_ORDER.map((g) => ({ value: g, label: shortGroupLabel(g), emoji: ACTIVITY_GROUPS[g].emoji })),
]

/** Kortare etiketter för chippen ("Styrka" i stället för "Styrka & rörlighet"). */
function shortGroupLabel(g: ActivityGroup): string {
  if (g === 'styrka') return 'Styrka'
  if (g === 'bollsport') return 'Bollsport'
  return ACTIVITY_GROUPS[g].label
}

/** Aktiviteter som matchar sökning och grupp. Tom sökning ger gruppens aktiviteter i listordning. */
export function filterActivities(query: string, group: GroupFilter, limit = 80): Activity[] {
  const q = query.trim()
  if (q) {
    const hits = searchActivities(q, 200)
    return (group === 'alla' ? hits : hits.filter((a) => a.group === group)).slice(0, limit)
  }
  return group === 'alla' ? ACTIVITIES.slice() : ACTIVITIES.filter((a) => a.group === group)
}

/** Emoji för en post (egna och steg saknas i aktivitetslistan). */
export function entryEmoji(entry: Pick<ExerciseEntry, 'activityId'>): string {
  if (entry.activityId === STEPS_ACTIVITY_ID) return '👟'
  return getActivity(entry.activityId)?.emoji ?? '⭐'
}
