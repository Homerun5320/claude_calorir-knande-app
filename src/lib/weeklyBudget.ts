/**
 * Veckobudget – samma energi över veckan, bara fördelad så som livet ser ut (t.ex. fredagsmys).
 *
 * Inställningen `settings.weeklyBudget` är en förskjutning i kcal per veckodag (måndag = 0 …
 * söndag = 6) vars summa är 0. Dagens mål = basmålet (dagsmålet från `computeTargets` – med egna
 * mål och adaptiv förbrukning) + dagens förskjutning. Träningen läggs till efteråt (`dailyBudget`).
 *
 * Säkerhet (samma regler som dagsmålet, se lib/energy):
 * - Golvet för egna energimål (`kcalOverrideFloor`: 1 200/1 500 kcal, högst 1 % av vikten i
 *   veckan och inget underskott vid lågt BMI eller nådd målvikt) gäller VARJE enskild dag.
 *   Gränssnittet tillåter ingen fördelning där någon dag hamnar under golvet (`presetShift`,
 *   `adjustDay`, `maxPresetExtra`), och beräkningen (`weeklyPlan`) höjer ändå varje dag till golvet
 *   – t.ex. när vikten eller målet har ändrats sedan fördelningen sparades. Då kan veckans summa
 *   bli något högre än med ett jämnt dagsmål, aldrig lägre.
 * - Vid graviditet, amning och under 18 år (yngsta möjliga ålder) används ingen veckobudget alls
 *   (`weeklyBudgetBlockReason` i lib/energy) – dagsmålet är då detsamma alla dagar.
 *
 * Makron: energin flyttas mellan dagarna. Protein och fibrer behålls per dag – kroppen behöver dem
 * varje dag, och proteinet bygger på vikten (NNR). Fett och kolhydrater skalas med energin i samma
 * proportion, så att makrona fortsätter att gå jämnt upp med dagens energi. Egna mål för fett eller
 * kolhydrater ändras aldrig: är det ena eget tar det andra hela förskjutningen, och är båda egna
 * ändras bara energin. Taken som räknas i energiprocent (mättat fett och tillsatt socker, 10 E%)
 * följer dagens energi om de inte är egna. Ett beräknat protein tar aldrig mer än hela dagens energi
 * (samma regel som `computeTargets`).
 *
 * Från och till: veckobudgetens fördelning gäller från dagen den slogs på (`since`). Dagar innan dess
 * har det jämna dagsmålet, så att en dag som redan har varit inte får en fördelning i efterhand.
 */
import type { ISODate, Profile, Targets, WeeklyBudgetSettings } from '../types'
import { WEEKDAYS, isValidISODate, weekdayIndex } from './dates'
import { kcalOverrideFloor, weeklyBudgetBlockReasonFor, type EnergyBreakdown } from './energy'
import { formatEnergy } from './format'

/** Antal dagar i veckan (måndag = 0 … söndag = 6). */
export const WEEK_DAYS = 7
/** Största förskjutning en enskild dag (samma gräns som kontrollen av säkerhetskopior). */
export const MAX_DAY_SHIFT = 1500
/** Steg i gränssnittet (kcal). */
export const SHIFT_STEP = 50
/** Utjämningen på de andra dagarna när en dag ändras ("Egen") görs i jämna tiotal kcal. */
export const EVEN_OUT_STEP = 10
/** Förval: så mycket extra per dag när ett förval väljs första gången. */
export const DEFAULT_EXTRA = 300

export type WeeklyPresetId = 'fredagsmys' | 'helg' | 'egen'
export type FixedPresetId = Exclude<WeeklyPresetId, 'egen'>

export interface WeeklyPreset {
  id: WeeklyPresetId
  label: string
  description: string
  /** Dagarna med extra (index, måndag = 0). Tom för "Egen". */
  days: readonly number[]
  /** Vart det sparade går, för raden på Idag ("sparat till fredagsmyset"). */
  towards: string
}

export const WEEKLY_PRESETS: Record<WeeklyPresetId, WeeklyPreset> = {
  fredagsmys: {
    id: 'fredagsmys',
    label: 'Fredagsmys',
    description: 'Lite extra på fredag och lördag, fördelat på veckans övriga dagar.',
    days: [4, 5],
    towards: 'fredagsmyset',
  },
  helg: {
    id: 'helg',
    label: 'Helg',
    description: 'Lite extra på lördag och söndag, fördelat på måndag till fredag.',
    days: [5, 6],
    towards: 'helgen',
  },
  egen: {
    id: 'egen',
    label: 'Egen',
    description: 'Välj själv per dag i steg om 50 kcal – ändringen jämnas ut över de andra dagarna, i jämna tiotal.',
    days: [],
    towards: 'dagarna med extra',
  },
}

export const WEEKLY_PRESET_IDS: readonly WeeklyPresetId[] = ['fredagsmys', 'helg', 'egen']

/** Ingen förskjutning – samma dagsmål alla dagar. */
export const ZERO_SHIFT: readonly number[] = Object.freeze([0, 0, 0, 0, 0, 0, 0])

const INDEXES: readonly number[] = [0, 1, 2, 3, 4, 5, 6]

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Ett användbart eget mål (samma regel som `computeTargets`). */
const isSet = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** Summan av förskjutningen (0 för en giltig veckobudget). */
export function shiftSum(shift: readonly number[]): number {
  return shift.reduce((s, v) => s + v, 0)
}

/**
 * Lägsta tillåtna förskjutning en dag: golvet minus basmålet – aldrig positiv och aldrig under
 * −1 500 kcal. Är basmålet redan vid golvet finns inget utrymme att ta av (0).
 */
export function minShiftFor(baseKcal: number, floorKcal: number): number {
  if (!finite(baseKcal) || !finite(floorKcal)) return 0
  return clamp(Math.ceil(floorKcal - baseKcal), -MAX_DAY_SHIFT, 0) + 0
}

/** Nedre gräns för en dags förskjutning: `minShift` inom [−1 500, 0]. */
function lowerBound(minShift: number): number {
  // `+ 0` gör −0 till 0.
  return finite(minShift) ? clamp(Math.ceil(minShift), -MAX_DAY_SHIFT, 0) + 0 : 0
}

/**
 * Fördela `rest` kcal (heltal) på de dagar som `eligible` pekar ut, så jämnt som möjligt och inom
 * [lo, MAX_DAY_SHIFT]. Resten efter jämn delning läggs en kcal i taget från måndag och framåt.
 * Med `unit` > 1 delas det i jämna steg om `unit` kcal (t.ex. −10, −20 i stället för −9, −8), och
 * dagarna som ligger närmast att ta emot turas om först – så att veckan blir jämn och lätt att läsa.
 * Ändrar `v` och returnerar det som inte fick plats (0 när allt fick plats).
 */
function distribute(v: number[], rest: number, lo: number, eligible: (i: number) => boolean, unit = 1): number {
  let left = rest
  for (let guard = 0; left !== 0 && guard < 128; guard++) {
    const dir = Math.sign(left)
    const open = INDEXES.filter((i) => eligible(i) && (dir > 0 ? v[i] < MAX_DAY_SHIFT : v[i] > lo))
    if (open.length === 0) break
    // Ta först från de dagar som har mest kvar (eller ge till de som har minst) – stabilt i veckoordning.
    if (unit > 1) open.sort((a, b) => (dir > 0 ? v[a] - v[b] : v[b] - v[a]))
    const share = Math.max(unit, Math.floor(Math.abs(left) / open.length / unit) * unit)
    for (const i of open) {
      if (left === 0) break
      const room = dir > 0 ? MAX_DAY_SHIFT - v[i] : v[i] - lo
      const step = Math.min(share, room, Math.abs(left))
      v[i] += dir * step
      left -= dir * step
    }
  }
  return left
}

/**
 * En giltig förskjutning av vad som helst (t.ex. ett trasigt värde): sju heltal inom
 * [max(−1 500, minShift), 1 500] vars summa alltid är 0. Värden som saknas eller inte är tal blir 0.
 * En dag under `minShift` höjs dit, och det som då blir över tas från de andra dagarna – jämnt,
 * så långt det finns utrymme. (Det finns alltid utrymme: gränsen är ≤ 0 ≤ 1 500.)
 */
export function normalizeShift(raw: unknown, minShift = -MAX_DAY_SHIFT): number[] {
  const lo = lowerBound(minShift)
  const list = Array.isArray(raw) ? (raw as unknown[]) : []
  const v = INDEXES.map((i) => {
    const x = list[i]
    return finite(x) ? clamp(Math.round(x), lo, MAX_DAY_SHIFT) : 0
  })
  distribute(v, -shiftSum(v), lo, () => true)
  return v
}

/** true om förskjutningen är giltig och ingen dag går under `minShift`. */
export function isShiftAllowed(shift: readonly number[], minShift = -MAX_DAY_SHIFT): boolean {
  const lo = lowerBound(minShift)
  return (
    shift.length === WEEK_DAYS &&
    shift.every((v) => finite(v) && Number.isInteger(v) && v >= lo && v <= MAX_DAY_SHIFT) &&
    shiftSum(shift) === 0
  )
}

/**
 * Hur mycket extra per dag ett förval högst får ge utan att någon annan dag hamnar under golvet
 * (avrundat nedåt till steget 50 kcal): de övriga dagarna delar på det som flyttas.
 */
export function maxPresetExtra(id: FixedPresetId, minShift = -MAX_DAY_SHIFT): number {
  const n = WEEKLY_PRESETS[id].days.length
  const others = WEEK_DAYS - n
  const byFloor = (-lowerBound(minShift) * others) / n
  return Math.max(0, Math.min(MAX_DAY_SHIFT, Math.floor(byFloor / SHIFT_STEP) * SHIFT_STEP))
}

/**
 * Förskjutningen för ett förval: `extraPerDay` på förvalets dagar, fördelat lika på de övriga
 * dagarna (summa 0). Extra begränsas så att ingen dag hamnar under `minShift`.
 */
export function presetShift(id: FixedPresetId, extraPerDay: number, minShift = -MAX_DAY_SHIFT): number[] {
  const days = WEEKLY_PRESETS[id].days
  const extra = clamp(finite(extraPerDay) ? Math.round(extraPerDay) : 0, 0, Math.min(MAX_DAY_SHIFT, maxPresetExtra(id, minShift) || 0))
  const v = INDEXES.map((i) => (days.includes(i) ? extra : 0))
  const left = distribute(v, -extra * days.length, lowerBound(minShift), (i) => !days.includes(i))
  // Får allt inte plats (kan inte hända när extra ≤ maxPresetExtra) blir det i stället en jämn vecka.
  return left === 0 ? v : [...ZERO_SHIFT]
}

/** Vilket förval en sparad förskjutning motsvarar (och hur mycket extra per dag), annars "Egen". */
export function detectPreset(shift: readonly number[] | undefined): { id: WeeklyPresetId; extra: number } {
  const v = normalizeShift(shift)
  for (const id of ['fredagsmys', 'helg'] as const) {
    const extra = v[WEEKLY_PRESETS[id].days[0]]
    if (extra > 0 && presetShift(id, extra).every((x, i) => x === v[i])) return { id, extra }
  }
  return { id: 'egen', extra: 0 }
}

/**
 * Ändra en dag med `delta` kcal (gränssnittets steg för "Egen") och jämna ut ändringen över de
 * andra dagarna så att summan fortsatt är 0. Utjämningen görs i första hand på de vanliga dagarna
 * (de utan extra), så att en redan vald extradag ligger kvar. Ingen dag hamnar under `minShift`;
 * räcker utrymmet inte blir ändringen mindre (eller ingen alls).
 */
export function adjustDay(shift: readonly number[] | undefined, index: number, delta: number, minShift = -MAX_DAY_SHIFT): number[] {
  const lo = lowerBound(minShift)
  const v = normalizeShift(shift, lo)
  if (!Number.isInteger(index) || index < 0 || index >= WEEK_DAYS || !finite(delta)) return v
  const before = [...v]
  const target = clamp(v[index] + Math.round(delta), lo, MAX_DAY_SHIFT)
  const change = target - v[index]
  if (change === 0) return v
  v[index] = target
  let left = distribute(v, -change, lo, (j) => j !== index && before[j] <= 0, EVEN_OUT_STEP)
  left = distribute(v, left, lo, (j) => j !== index, EVEN_OUT_STEP)
  // Det som inte fick plats hos de andra dagarna tas tillbaka från dagen själv.
  v[index] += left
  return v
}

/** true om `adjustDay` faktiskt ändrar dagen (för att stänga av −/+-knapparna). */
export function canAdjustDay(shift: readonly number[] | undefined, index: number, delta: number, minShift = -MAX_DAY_SHIFT): boolean {
  const lo = lowerBound(minShift)
  return adjustDay(shift, index, delta, lo)[index] !== normalizeShift(shift, lo)[index]
}

// ---------------------------------------------------------------------------
// Veckans plan och dagens mål
// ---------------------------------------------------------------------------

export interface WeeklyPlan {
  /** Förvalet som den sparade förskjutningen motsvarar. */
  preset: WeeklyPresetId
  /** Den sparade förskjutningen (normaliserad: sju heltal, summa 0). */
  shift: readonly number[]
  /** Förskjutningen som faktiskt används per veckodag – aldrig så att en dag går under golvet. */
  applied: readonly number[]
  /** Dagsmålet (kcal, utan träning) per veckodag, måndag = 0. */
  dayKcal: readonly number[]
  /** Basmålet – dagsmålet utan veckobudget (veckans snittdag när ingen dag når golvet). */
  baseKcal: number
  /** Golvet (kcal) som ingen dag går under, se `kcalOverrideFloor`. */
  floorKcal: number
  /** Lägsta tillåtna förskjutning en dag (golvet − basmålet, ≤ 0). */
  minShift: number
  /** true om någon dag har höjts till golvet – då blir veckans summa något högre. */
  clamped: boolean
  /** Veckans budget: summan av dagsmålen (utan träning). */
  weekKcal: number
  /** Veckans snittmål per dag (`weekKcal / 7`, avrundat) – högre än basmålet när någon dag har höjts till golvet. */
  averageKcal: number
  /** Dagen veckobudgeten slogs på – dagar före den har basmålet. Saknas = gäller alla dagar. */
  since?: ISODate
}

/**
 * Veckans plan: dagsmålet per veckodag. Varje dag klämms till golvet (`floorKcal`) – en sparad
 * fördelning som inte längre ryms (t.ex. när vikten har gått ned eller målvikten är nådd) sänker
 * aldrig någon dag under golvet. Veckans summa kan då bli något högre än `7 × basmålet`.
 * Ligger basmålet (i teorin) redan under golvet sänks ingen dag under basmålet.
 */
export function weeklyPlan(baseKcal: number, floorKcal: number, rawShift: unknown, since?: ISODate): WeeklyPlan {
  const shift = normalizeShift(rawShift)
  const base = finite(baseKcal) ? baseKcal : 0
  const floor = finite(floorKcal) ? floorKcal : base
  const lowest = Math.min(base, floor)
  const dayKcal = shift.map((s) => Math.max(base + s, lowest))
  const applied = dayKcal.map((k) => k - base)
  const weekKcal = dayKcal.reduce((s, k) => s + k, 0)
  const plan: WeeklyPlan = {
    preset: detectPreset(shift).id,
    shift,
    applied,
    dayKcal,
    baseKcal: base,
    floorKcal: floor,
    minShift: minShiftFor(base, floor),
    clamped: applied.some((a, i) => a !== shift[i]),
    weekKcal,
    averageKcal: Math.round(weekKcal / WEEK_DAYS),
  }
  if (since !== undefined && isValidISODate(since)) plan.since = since
  return plan
}

/** Veckans snittmål (kcal per dag): planens snitt, eller basmålet utan veckobudget. */
export function averageKcalFor(baseKcal: number, plan: Pick<WeeklyPlan, 'averageKcal'> | null): number {
  return plan ? plan.averageKcal : baseKcal
}

export interface WeeklyBudgetInput {
  profile: Pick<Profile, 'sex' | 'lifeStage' | 'birthYear'> | null
  /** `computeEnergy` för profilen (null utan profil). */
  energy: EnergyBreakdown | null
  /** Dagsmålet utan veckobudget (efter egna mål, golv och adaptiv förbrukning). */
  baseKcal: number
  setting: WeeklyBudgetSettings | undefined
  today: ISODate
}

export interface WeeklyBudgetResolution {
  /** Planen när veckobudgeten är på och får användas, annars null. */
  plan: WeeklyPlan | null
  /**
   * Varför veckobudgeten inte används (graviditet, amning, under 18 år) – oavsett om den är
   * påslagen – annars null. Utan profil: null (då finns ingen veckobudget).
   */
  blocked: string | null
}

/**
 * Ska veckobudgeten användas, och med vilket golv? Samma funktion används av `useTargets` och av
 * säkerhetsmatrisen i `energy.safety.test.ts`. Utan profil används ingen veckobudget (åldern är okänd).
 */
export function resolveWeeklyBudget({ profile, energy, baseKcal, setting, today }: WeeklyBudgetInput): WeeklyBudgetResolution {
  if (!profile) return { plan: null, blocked: null }
  const blocked = weeklyBudgetBlockReasonFor(profile, today)
  if (blocked || !energy || !setting?.enabled || !finite(baseKcal)) return { plan: null, blocked }
  const floor = kcalOverrideFloor(profile, energy, today)
  return { plan: weeklyPlan(baseKcal, floor.kcal, setting.shift, setting.since), blocked: null }
}

/** true om veckobudgeten gäller datumet (inte före dagen den slogs på). */
function planApplies(plan: WeeklyPlan | null, date: ISODate): plan is WeeklyPlan {
  return plan !== null && (plan.since === undefined || date >= plan.since)
}

/** Dagsmålets energi (kcal, utan träning) för ett datum: basmålet eller planens dag. */
export function kcalForDate(baseKcal: number, plan: WeeklyPlan | null, date: ISODate): number {
  return planApplies(plan, date) ? plan.dayKcal[weekdayIndex(date)] : baseKcal
}

/** Den förskjutning som används ett datum (0 utan plan, och före dagen den slogs på). */
export function shiftForDate(plan: WeeklyPlan | null, date: ISODate): number {
  return planApplies(plan, date) ? plan.applied[weekdayIndex(date)] : 0
}

/**
 * Målen för en dag med `dayKcal` kcal i stället för basmålets energi. Protein och fibrer behålls,
 * fett och kolhydrater skalas med energin (se filens kommentar) och 10 E%-taken följer dagens
 * energi om de inte är egna. Egna mål (`overrides`) för protein, fett, kolhydrater och taken ändras
 * aldrig. Makrona går aldrig över dagens energi när de inte gjorde det i basmålet (högst
 * avrundningen till hela gram, ≤ 2 kcal) – utom när egna mål själva tar mer än dagens energi.
 */
export function scaleTargetsToKcal(base: Targets, dayKcal: number, overrides: Partial<Targets> = {}): Targets {
  if (!finite(dayKcal) || dayKcal === base.kcal) return base
  const kcal = Math.max(0, dayKcal)
  const delta = kcal - base.kcal
  const out: Targets = { ...base, kcal }
  if (!isSet(overrides.proteinG)) out.proteinG = Math.min(base.proteinG, Math.floor(kcal / 4))
  const ownFat = isSet(overrides.fatG)
  const ownCarbs = isSet(overrides.carbsG)
  // Rymdes makrona i basmålet ska de rymmas i dagens mål också.
  const fits = base.proteinG * 4 + base.fatG * 9 + base.carbsG * 4 <= base.kcal + 2
  if (!ownFat && !ownCarbs) {
    const flexBase = base.fatG * 9 + base.carbsG * 4
    if (flexBase > 0) {
      let flex = Math.max(0, flexBase + delta)
      if (fits) flex = Math.max(0, Math.min(flex, kcal - out.proteinG * 4))
      const factor = flex / flexBase
      out.fatG = Math.max(0, Math.min(Math.round(base.fatG * factor), Math.floor(flex / 9)))
      out.carbsG = Math.max(0, Math.round((flex - out.fatG * 9) / 4))
    }
  } else if (ownFat !== ownCarbs) {
    // Det egna målet står kvar – det andra makrot tar hela förskjutningen.
    const perGram = ownFat ? 4 : 9
    const other = ownFat ? base.carbsG : base.fatG
    const room = Math.max(0, kcal - out.proteinG * 4 - (ownFat ? base.fatG * 9 : base.carbsG * 4))
    let energy = Math.max(0, other * perGram + delta)
    if (fits) energy = Math.min(energy, room)
    const grams = Math.max(0, fits ? Math.min(Math.round(energy / perGram), Math.floor(room / perGram)) : Math.round(energy / perGram))
    if (ownFat) out.carbsG = grams
    else out.fatG = grams
  }
  if (!isSet(overrides.satFatMaxG)) out.satFatMaxG = Math.round((kcal * 0.1) / 9)
  if (!isSet(overrides.addedSugarMaxG)) out.addedSugarMaxG = Math.round((kcal * 0.1) / 4)
  return out
}

/** Målen för ett datum: basmålen med veckobudgetens dag (samma objekt som `base` när inget ändras). */
export function targetsForDate(base: Targets, plan: WeeklyPlan | null, date: ISODate, overrides: Partial<Targets> = {}): Targets {
  if (!plan) return base
  return scaleTargetsToKcal(base, kcalForDate(base.kcal, plan, date), overrides)
}

// ---------------------------------------------------------------------------
// Texter
// ---------------------------------------------------------------------------

/** "fredag och lördag", "lör, sön och mån" – dagarna med extra i planen, i veckoordning. */
export function extraDaysText(plan: Pick<WeeklyPlan, 'applied'>): string {
  const names = INDEXES.filter((i) => plan.applied[i] > 0).map((i) => WEEKDAYS[i])
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} och ${names[names.length - 1]}`
}

/**
 * Den diskreta raden om veckobudgeten för ett datum, eller null när dagen är som vanligt.
 * - `context: 'idag'` → "Fredagsmys: +300 kcal idag"; `'dag'` (dagboken) → "… i dagens budget".
 * - En lättare dag beskrivs neutralt: "Veckobudget: 120 kcal mindre idag – sparat till fredagsmyset".
 * - Medvetet läge: inga siffror – bara en vänlig rad för dagarna med extra.
 */
export function weeklyDayNote(
  plan: WeeklyPlan | null,
  date: ISODate,
  opts: { unit?: 'kcal' | 'kJ'; mindful?: boolean; context?: 'idag' | 'dag' } = {},
): string | null {
  if (!plan) return null
  const s = shiftForDate(plan, date)
  if (s === 0) return null
  const { unit = 'kcal', mindful = false, context = 'idag' } = opts
  const preset = WEEKLY_PRESETS[plan.preset]
  const label = plan.preset === 'egen' ? 'Veckobudget' : preset.label
  const when = context === 'idag' ? 'idag' : 'i dagens budget'
  if (mindful) return s > 0 && context === 'idag' ? `${label} idag – lite extra utrymme i dagsmålet.` : null
  if (s > 0) return `${label}: +${formatEnergy(s, unit)} ${when}`
  return `Veckobudget: ${formatEnergy(-s, unit)} mindre ${when} – sparat till ${preset.towards}`
}

/** Veckans budget i neutral ton, t.ex. "Veckobudget 14 700 kcal – med extra på fredag och lördag." */
export function weeklyBudgetSummary(plan: WeeklyPlan | null, unit: 'kcal' | 'kJ' = 'kcal'): string | null {
  if (!plan) return null
  const days = extraDaysText(plan)
  return `Veckobudget ${formatEnergy(plan.weekKcal, unit)}${days ? ` – med extra på ${days}` : ''}.`
}
