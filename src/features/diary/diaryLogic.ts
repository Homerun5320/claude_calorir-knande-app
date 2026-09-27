/**
 * Dagboken – rena hjälpfunktioner (utan React) för datum, måltider, summeringar och delning.
 *
 * Allt här är testbart i isolation (se diaryLogic.test.ts).
 */
import type { DiaryEntry, ExerciseEntry, FoodEntry, ISODate, MealConfig, MealId, MealTemplate, Nutrients } from '../../types'
import type { NewDiaryEntry } from '../../stores/diaryStore'
import { MEAL_IDS } from '../../types'
import { addDays, diffDays, formatDayLong, formatDayShort, relativeDayLabel } from '../../lib/dates'
import { entryNutrients, totals } from '../../lib/diary'
import { formatEnergy, formatNumber, formatDuration } from '../../lib/format'
import { mealForTime, MEAL_EMOJI } from '../../lib/meals'
import { describeAmount } from '../../components/domain/FoodRow'
import { summarizeRing, mindfulLabel, type RingStatus } from '../../components/signature/CalorieRing'

// ---------------------------------------------------------------------------
// Datum och adresser
// ---------------------------------------------------------------------------

/** Hur långt fram man kan planera i dagboken. */
export const MAX_FUTURE_DAYS = 14

/** 'YYYY-MM-DD' och ett giltigt kalenderdatum – definierad i lib/dates. */
export { isValidISODate } from '../../lib/dates'

export type DayKind = 'past' | 'today' | 'future'

/** Har dagen varit, är det idag eller är den planerad? */
export function dayKind(date: ISODate, today: ISODate): DayKind {
  if (date === today) return 'today'
  return date < today ? 'past' : 'future'
}

/** Adressen till dagboken för en dag – idag blir den korta '/dagbok'. */
export function diaryPath(date: ISODate, today: ISODate): string {
  return date === today ? '/dagbok' : `/dagbok/${date}`
}

/** Länk till "Lägg till mat" för en viss måltid och dag. */
export function addFoodHref(meal: MealId, date: ISODate): string {
  return `/lagg-till?maltid=${encodeURIComponent(meal)}&datum=${encodeURIComponent(date)}`
}

/** "idag", "igår", "imorgon" eller "tisdag 23 september" – med liten bokstav för löptext. */
export function dayPhrase(date: ISODate, today: ISODate): string {
  const diff = diffDays(today, date)
  if (diff === 0) return 'idag'
  if (diff === -1) return 'igår'
  if (diff === 1) return 'imorgon'
  return `${formatDayLong(date, today).toLocaleLowerCase('sv-SE')}`
}

/** Rubrik för en dag: "Idag, fredag 26 september" eller "Tisdag 23 september". */
export function dayTitle(date: ISODate, today: ISODate): string {
  const rel = relativeDayLabel(date, today)
  const long = formatDayLong(date, today)
  return rel === long ? long : `${rel}, ${long.toLocaleLowerCase('sv-SE')}`
}

// ---------------------------------------------------------------------------
// Måltider
// ---------------------------------------------------------------------------

/**
 * Måltiderna som visas för en dag: aktiverade i inställningarnas ordning, plus avstängda
 * måltider som ändå har poster (så att inget registrerat göms).
 */
export function visibleMeals(meals: readonly MealConfig[], byMeal: Partial<Record<MealId, readonly DiaryEntry[]>>): MealConfig[] {
  const out = meals.filter((m) => m.enabled || (byMeal[m.id]?.length ?? 0) > 0)
  // Poster i en måltid som saknas i inställningarna (äldre data) – visa dem sist.
  for (const id of MEAL_IDS) {
    if (!out.some((m) => m.id === id) && !meals.some((m) => m.id === id) && (byMeal[id]?.length ?? 0) > 0) {
      out.push({ id, name: DEFAULT_MEAL_NAMES[id], enabled: false })
    }
  }
  return out
}

const DEFAULT_MEAL_NAMES: Record<MealId, string> = {
  frukost: 'Frukost',
  lunch: 'Lunch',
  fika: 'Fika',
  middag: 'Middag',
  kvallsmat: 'Kvällsmat',
  mellanmal: 'Mellanmål',
}

/** Måltidens namn enligt inställningarna (med svenska standardnamn som reserv). */
export function mealLabel(meals: readonly MealConfig[], id: MealId): string {
  return meals.find((m) => m.id === id)?.name ?? DEFAULT_MEAL_NAMES[id] ?? id
}

/** Förvald måltid för "Lägg till": efter klockslaget idag, annars första aktiverade måltiden. */
export function defaultMealForDay(meals: MealConfig[], date: ISODate, today: ISODate, now: Date = new Date()): MealId {
  if (date === today) return mealForTime(meals, now)
  return meals.find((m) => m.enabled)?.id ?? 'frukost'
}

// ---------------------------------------------------------------------------
// Energi och balans
// ---------------------------------------------------------------------------

export interface DayBalance {
  eaten: number
  budget: number
  remaining: number
  over: number
  ratio: number
  status: RingStatus
}

/** Ätit, budget, kvar och över för en dag (samma logik som dagsringen). */
export function dayBalance(eatenKcal: number | undefined, budgetKcal: number): DayBalance {
  const s = summarizeRing(eatenKcal ?? 0, budgetKcal, 0)
  return { eaten: s.eaten, budget: s.total, remaining: s.remaining, over: s.over, ratio: s.ratio, status: s.status }
}

/** Vänlig mening under dagens siffror – aldrig dömande. */
export function balanceNote(status: RingStatus, kind: DayKind): string {
  if (kind === 'future') {
    if (status === 'tom') return 'Inget planerat ännu – lägg gärna in något i förväg.'
    if (status === 'over') return 'Planen är lite över budgeten – helt okej, det jämnar ut sig över veckan.'
    return 'Bra planerat – det gör dagen lite enklare.'
  }
  switch (status) {
    case 'tom':
      return kind === 'today' ? 'Dagen har precis börjat.' : 'Inget registrerat den här dagen.'
    case 'lagom':
      return 'Precis lagom – snyggt!'
    case 'over':
      return kind === 'today'
        ? 'Över målet idag – helt okej, det jämnar ut sig över veckan.'
        : 'Lite över målet – helt okej, det jämnar ut sig över veckan.'
    default:
      return kind === 'today' ? 'Något gott och lagom räcker fint.' : 'En dag i god balans.'
  }
}

/** Mindful-läge: ord i stället för siffror. */
export function mindfulDayLabel(ratio: number): { title: string; hint: string } {
  return mindfulLabel(ratio)
}

// ---------------------------------------------------------------------------
// Poster
// ---------------------------------------------------------------------------

/** Posten utan id och tidsstämpel – redo att läggas till igen (kopiera). */
export function withoutIdentity(entry: DiaryEntry): NewDiaryEntry {
  const { id: _id, createdAt: _createdAt, ...rest } = entry
  return rest as NewDiaryEntry
}

/** Id:n som finns i `after` men inte i `before` – de nyss tillagda (för ångra). */
export function newEntryIds(before: readonly DiaryEntry[] | undefined, after: readonly DiaryEntry[] | undefined): string[] {
  const known = new Set((before ?? []).map((e) => e.id))
  return (after ?? []).filter((e) => !known.has(e.id)).map((e) => e.id)
}

/** Namn på en post (livsmedel eller snabbregistrering). */
export function entryName(entry: DiaryEntry): string {
  return entry.kind === 'food' ? entry.food.name : entry.name
}

/**
 * Kort namn utan beskrivning efter kommatecken: "Lax, ugnsbakad" → "Lax". Decimalkomman i
 * "Mjölk mellan 1,5 % fett" lämnas orörd (bara komma följt av mellanslag räknas).
 */
export function shortFoodName(name: string): string {
  return name.split(/,\s/)[0].trim() || name
}

/** Läsbar mängd: "2 dl (76 g)", "1 st (medel) (60 g)" eller "Snabbregistrering". */
export function entryAmountText(entry: DiaryEntry): string {
  return entry.kind === 'food' ? describeAmount(entry.food, entry.amount, entry.unit) : 'Snabbregistrering'
}

/** Energi för en post, `undefined` om okänd. */
export function entryKcalOrUndefined(entry: DiaryEntry): number | undefined {
  const k = entryNutrients(entry).kcal
  return k !== undefined && Number.isFinite(k) ? k : undefined
}

export type QuickEditKey = 'kcal' | 'protein' | 'carbs' | 'fat'
export const QUICK_EDIT_KEYS: readonly QuickEditKey[] = ['kcal', 'protein', 'carbs', 'fat']

/**
 * Nya näringsvärden för en snabbregistrering. Ett tomt fält (`undefined`) betyder okänt och
 * tar bort värdet – det blir aldrig 0. Övriga näringsämnen behålls.
 */
export function quickNutrientsPatch(existing: Nutrients, edits: Partial<Record<QuickEditKey, number | undefined>>): Nutrients {
  const out: Nutrients = { ...existing }
  for (const key of QUICK_EDIT_KEYS) {
    if (!(key in edits)) continue
    const v = edits[key]
    if (v === undefined || !Number.isFinite(v) || v < 0) delete out[key]
    else out[key] = v
  }
  return out
}

/** 'HH:mm' eller undefined. Tom sträng och ogiltiga tider blir undefined. */
export function normalizeTime(value: string | undefined): string | undefined {
  if (!value) return undefined
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!m) return undefined
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return undefined
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

/** Trimmad anteckning eller undefined. */
export function normalizeNote(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

// ---------------------------------------------------------------------------
// Sparade måltider
// ---------------------------------------------------------------------------

/** Livsmedelsposterna som en sparad måltid (snabbregistreringar kan inte sparas). */
export function templateItems(entries: readonly DiaryEntry[]): MealTemplate['items'] {
  return entries
    .filter((e): e is FoodEntry => e.kind === 'food' && Number.isFinite(e.grams) && e.grams > 0)
    .map((e) => ({ food: e.food, amount: e.amount, unit: e.unit, grams: e.grams }))
}

/** Förslag på namn: "Havregrynsgröt och kaffe", "Lax, potatis och sallad" eller måltidens namn. */
export function suggestTemplateName(mealName: string, entries: readonly DiaryEntry[]): string {
  const names: string[] = []
  for (const e of entries) {
    if (e.kind !== 'food') continue
    const short = shortFoodName(e.food.name)
    if (short && !names.some((n) => n.toLocaleLowerCase('sv-SE') === short.toLocaleLowerCase('sv-SE'))) names.push(short)
  }
  if (names.length === 0) return mealName
  const pick = names.slice(0, 3).map((n, i) => (i === 0 ? n : n.charAt(0).toLocaleLowerCase('sv-SE') + n.slice(1)))
  const text = pick.length === 1 ? pick[0] : `${pick.slice(0, -1).join(', ')} och ${pick[pick.length - 1]}`
  return text.length > 60 ? `${mealName} – ${pick[0]}` : text
}

// ---------------------------------------------------------------------------
// Måltidssummor
// ---------------------------------------------------------------------------

export interface MealMacroDot {
  key: 'protein' | 'carbs' | 'fat'
  short: string
  label: string
  grams: number
}

/** Kända makron för en måltid, för små färgprickar i måltidens rubrik. */
export function mealMacroDots(n: Nutrients): MealMacroDot[] {
  const defs = [
    { key: 'protein', short: 'P', label: 'Protein' },
    { key: 'carbs', short: 'K', label: 'Kolhydrater' },
    { key: 'fat', short: 'F', label: 'Fett' },
  ] as const
  return defs.filter((d) => n[d.key] !== undefined && Number.isFinite(n[d.key])).map((d) => ({ ...d, grams: n[d.key] ?? 0 }))
}

/** Uppläst sammanfattning av en måltid, t.ex. "Frukost: 420 kcal, 3 poster". */
export function mealAriaSummary(name: string, entries: readonly DiaryEntry[], unit: 'kcal' | 'kJ', mindful: boolean): string {
  if (entries.length === 0) return `${name}: inget registrerat`
  const count = `${formatNumber(entries.length)} ${entries.length === 1 ? 'post' : 'poster'}`
  if (mindful) return `${name}: ${count}`
  return `${name}: ${formatEnergy(totals(entries).kcal, unit)}, ${count}`
}

// ---------------------------------------------------------------------------
// Mående
// ---------------------------------------------------------------------------

/** Samma skalor som kvällsreflektionen på Idag (1–5) – definierade i `lib/dayMeta`. */
export { DAY_SCALES, type ScaleDef, type ScaleKey } from '../../lib/dayMeta'

// ---------------------------------------------------------------------------
// Dela dagen
// ---------------------------------------------------------------------------

export interface DaySummaryInput {
  date: ISODate
  today: ISODate
  meals: readonly MealConfig[]
  entries: readonly DiaryEntry[]
  exercise?: readonly ExerciseEntry[]
  waterMl?: number
  /** Dagens budget i kcal (mål + ev. träning). */
  budgetKcal?: number
  unit?: 'kcal' | 'kJ'
  /** Medvetet läge: inga energisiffror eller makron. */
  mindful?: boolean
  complete?: boolean
}

/**
 * Dagens sammanfattning som vanlig text – för att dela med Web Share eller kopiera.
 *
 * ```
 * Min dag i Lagom – Idag, fredag 26 september
 * Ätit 1 850 kcal av 2 100 kcal – 250 kcal kvar
 * Protein 95 g · Kolhydrater 210 g · Fett 60 g
 *
 * 🥣 Frukost – 420 kcal
 * • Havregrynsgröt, 3 dl (…) – 210 kcal
 * ```
 */
export function daySummaryText(input: DaySummaryInput): string {
  const { date, today, meals, entries, exercise = [], waterMl = 0, budgetKcal, unit = 'kcal', mindful = false, complete = false } = input
  const e = (kcal: number | undefined) => formatEnergy(kcal, unit)
  const kind = dayKind(date, today)
  const lines: string[] = []

  lines.push(`${kind === 'future' ? 'Min plan i Lagom' : 'Min dag i Lagom'} – ${dayTitle(date, today)}`)

  const sum = totals(entries)
  if (entries.length === 0) {
    lines.push(kind === 'future' ? 'Inget planerat ännu.' : 'Inget registrerat.')
  } else if (!mindful) {
    const verb = kind === 'future' ? 'Planerat' : 'Ätit'
    if (budgetKcal !== undefined && budgetKcal > 0) {
      const b = dayBalance(sum.kcal, budgetKcal)
      const tail =
        b.status === 'lagom' ? 'precis lagom' : b.over > 0 ? `${e(b.over)} över – helt okej` : `${e(b.remaining)} kvar`
      lines.push(`${verb} ${e(sum.kcal ?? 0)} av ${e(b.budget)} – ${tail}`)
    } else {
      lines.push(`${verb} ${e(sum.kcal ?? 0)}`)
    }
    const macros = (
      [
        ['Protein', sum.protein],
        ['Kolhydrater', sum.carbs],
        ['Fett', sum.fat],
      ] as const
    )
      .filter(([, v]) => v !== undefined)
      .map(([label, v]) => `${label} ${formatNumber(v)} g`)
    if (macros.length) lines.push(macros.join(' · '))
  }

  const byMeal = new Map<MealId, DiaryEntry[]>()
  for (const entry of entries) byMeal.set(entry.meal, [...(byMeal.get(entry.meal) ?? []), entry])
  const order = visibleMeals(meals as MealConfig[], Object.fromEntries(byMeal) as Partial<Record<MealId, DiaryEntry[]>>)
  for (const meal of order) {
    const list = byMeal.get(meal.id)
    if (!list?.length) continue
    lines.push('')
    const head = `${MEAL_EMOJI[meal.id] ?? '🍽️'} ${meal.name}`
    lines.push(mindful ? head : `${head} – ${e(totals(list).kcal)}`)
    for (const entry of list) {
      const amount = entry.kind === 'food' ? `, ${describeAmount(entry.food, entry.amount, entry.unit)}` : ''
      const kcal = mindful ? '' : ` – ${e(entryKcalOrUndefined(entry))}`
      lines.push(`• ${entryName(entry)}${amount}${kcal}`)
    }
  }

  const extras: string[] = []
  if (exercise.length > 0) {
    const parts = exercise.map((x) => {
      const base = `${x.name} ${formatDuration(x.minutes)}`
      return mindful ? base : `${base} (${e(x.kcal)})`
    })
    extras.push(`Träning: ${parts.join(', ')}`)
  }
  if (waterMl > 0) extras.push(`Vatten: ${formatNumber(waterMl / 1000, 2)} l`)
  if (complete) extras.push('Dagen är markerad som klar ✓')
  if (extras.length) {
    lines.push('')
    lines.push(...extras)
  }
  return lines.join('\n')
}

/** Titel till delningsdialogen. */
export function shareTitle(date: ISODate, today: ISODate): string {
  return `Lagom – ${formatDayShort(date)}${date === today ? ' (idag)' : ''}`
}

// ---------------------------------------------------------------------------
// Kopiera/flytta – mål
// ---------------------------------------------------------------------------

/** "lunch imorgon", "frukost idag", "middag tisdag 23 september". */
export function targetPhrase(meals: readonly MealConfig[], meal: MealId, date: ISODate, today: ISODate): string {
  return `${mealLabel(meals, meal).toLocaleLowerCase('sv-SE')} ${dayPhrase(date, today)}`
}

/** Snabbval av datum för kopiera/flytta (utan källdagen om `exclude` anges). */
export function quickTargetDates(today: ISODate, exclude?: ISODate): Array<{ date: ISODate; label: string }> {
  const list = [
    { date: addDays(today, -1), label: 'Igår' },
    { date: today, label: 'Idag' },
    { date: addDays(today, 1), label: 'Imorgon' },
  ]
  return list.filter((d) => d.date !== exclude)
}
