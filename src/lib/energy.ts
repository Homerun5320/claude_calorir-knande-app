/**
 * Energibehov, mål och makrofördelning.
 *
 * - BMR: Mifflin–St Jeor (bäst validerad för vuxna utan kroppssammansättningsdata).
 * - Total förbrukning: BMR × PAL (vardagsaktivitet). Träning loggas separat.
 * - 1 kg kroppsvikt ≈ 7 700 kcal.
 * - Säkerhetsgolv: aldrig under 1 200 kcal (kvinnor) / 1 500 kcal (män), max underskott 1 000 kcal/dag
 *   och max viktnedgång 1 % av kroppsvikten per vecka. Ingen viktnedgång vid graviditet, amning
 *   eller för användare under 18 år.
 */
import type { MacroPreset, Profile, Sex, Targets, WeightEntry, ISODate } from '../types'
import { ACTIVITY_LEVELS } from '../types'
import { ageFromBirthYear, addDays, diffDays, todayISO } from './dates'

export const KCAL_PER_KG = 7700
export const MIN_KCAL: Record<Sex, number> = { kvinna: 1200, man: 1500 }
export const MAX_DAILY_DEFICIT = 1000

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'man' ? base + 5 : base - 161
}

export interface EnergyBreakdown {
  bmr: number
  pal: number
  /** Beräknad (eller adaptiv) total förbrukning utan loggad träning. */
  tdee: number
  /** Källa för tdee. */
  tdeeSource: 'formel' | 'adaptiv'
  /** Livsstadietillägg (graviditet/amning). */
  lifeStageKcal: number
  /** Planerat över-/underskott per dag (negativt = underskott). */
  adjustment: number
  /** Dagligt energimål. */
  kcal: number
  /** true om säkerhetsgolvet eller underskottstaket begränsade målet. */
  limited: boolean
  /** Förklaringar på svenska (visas i UI). */
  notes: string[]
}

export function computeEnergy(
  profile: Profile,
  weightKg: number,
  opts: { today?: ISODate; adaptiveTdee?: number } = {},
): EnergyBreakdown {
  const age = ageFromBirthYear(profile.birthYear, opts.today ?? todayISO())
  const bmr = bmrMifflin(profile.sex, weightKg, profile.heightCm, age)
  const pal = ACTIVITY_LEVELS[profile.activityLevel].pal
  const formulaTdee = bmr * pal
  const tdee = opts.adaptiveTdee && opts.adaptiveTdee > 0 ? opts.adaptiveTdee : formulaTdee
  const notes: string[] = []
  let limited = false

  const lifeStageKcal = profile.lifeStage === 'gravid' ? 300 : profile.lifeStage === 'ammar' ? 500 : 0
  const noLoss = profile.lifeStage !== 'ingen' || age < 18

  let adjustment = 0
  if (profile.goal === 'ga_ner') {
    if (noLoss) {
      notes.push(
        age < 18
          ? 'Under 18 år rekommenderas inte kaloriunderskott. Målet är satt till att behålla vikten.'
          : 'Under graviditet och amning rekommenderas inte viktnedgång. Målet är satt till att behålla vikten.',
      )
    } else {
      const maxRate = weightKg * 0.01
      const rate = Math.min(profile.weeklyRateKg, maxRate)
      if (rate < profile.weeklyRateKg) {
        limited = true
        notes.push('Takten är begränsad till högst 1 % av kroppsvikten per vecka.')
      }
      adjustment = -Math.min((rate * KCAL_PER_KG) / 7, MAX_DAILY_DEFICIT)
      if ((rate * KCAL_PER_KG) / 7 > MAX_DAILY_DEFICIT) {
        limited = true
        notes.push('Underskottet är begränsat till 1 000 kcal per dag.')
      }
    }
  } else if (profile.goal === 'ga_upp') {
    adjustment = (Math.min(profile.weeklyRateKg, 0.5) * KCAL_PER_KG) / 7
  }

  let kcal = tdee + lifeStageKcal + adjustment
  const floor = MIN_KCAL[profile.sex]
  if (kcal < floor) {
    kcal = floor
    limited = true
    notes.push(`Målet är satt till lägsta rekommenderade nivå (${floor} kcal) för att du ska få i dig tillräckligt med näring.`)
  }

  return {
    bmr: Math.round(bmr),
    pal,
    tdee: Math.round(tdee),
    tdeeSource: opts.adaptiveTdee ? 'adaptiv' : 'formel',
    lifeStageKcal,
    adjustment: Math.round(adjustment),
    kcal: Math.round(kcal / 10) * 10,
    limited,
    notes,
  }
}

/** Makrofördelning i energiprocent. */
export const MACRO_PRESETS: Record<Exclude<MacroPreset, 'anpassad'>, { label: string; description: string; protein: number; carbs: number; fat: number }> = {
  nnr: {
    label: 'Balanserad (NNR)',
    description: 'Följer Nordiska näringsrekommendationerna 2023: protein 10–20 E%, kolhydrater 45–60 E%, fett 25–40 E%.',
    protein: 18,
    carbs: 50,
    fat: 32,
  },
  hogprotein: {
    label: 'Högprotein',
    description: 'Mer protein för mättnad och för att bevara muskler vid viktnedgång.',
    protein: 30,
    carbs: 40,
    fat: 30,
  },
  lagkolhydrat: {
    label: 'Måttlig lågkolhydrat',
    description: 'Mindre kolhydrater, mer fett och protein.',
    protein: 25,
    carbs: 30,
    fat: 45,
  },
  lchf: {
    label: 'LCHF',
    description: 'Strikt lågkolhydratkost. Välj gärna omättade fetter som rapsolja, nötter och fisk.',
    protein: 20,
    carbs: 8,
    fat: 72,
  },
  idrott: {
    label: 'Idrott & uthållighet',
    description: 'Mer kolhydrater för träning, t.ex. inför Vasaloppet eller Vätternrundan.',
    protein: 20,
    carbs: 55,
    fat: 25,
  },
}

export function macroPercents(profile: Pick<Profile, 'macroPreset' | 'customMacroPct'>): { protein: number; carbs: number; fat: number } {
  if (profile.macroPreset === 'anpassad' && profile.customMacroPct) return profile.customMacroPct
  const p = MACRO_PRESETS[profile.macroPreset === 'anpassad' ? 'nnr' : profile.macroPreset]
  return { protein: p.protein, carbs: p.carbs, fat: p.fat }
}

/** Fiberrekommendation (NNR 2023): minst 25 g/dag för kvinnor och 35 g/dag för män. */
export const FIBER_TARGET: Record<Sex, number> = { kvinna: 25, man: 35 }

/** Proteinrekommendation (NNR 2023): 0,83 g/kg för vuxna, 1,2 g/kg från 65 år. */
export function proteinMinG(weightKg: number, age: number): number {
  return weightKg * (age >= 65 ? 1.2 : 0.83)
}

/** Dryck per dag (ml), utifrån EFSA:s rekommendation om totalt vattenintag (varav ca 80 % från dryck). */
export function waterTargetMl(sex: Sex, lifeStage: Profile['lifeStage']): number {
  const base = sex === 'man' ? 2000 : 1600
  return base + (lifeStage === 'gravid' ? 300 : lifeStage === 'ammar' ? 600 : 0)
}

export function computeTargets(
  profile: Profile,
  weightKg: number,
  overrides: Partial<Targets> = {},
  opts: { today?: ISODate; adaptiveTdee?: number } = {},
): Targets {
  const energy = computeEnergy(profile, weightKg, opts)
  const kcal = overrides.kcal ?? energy.kcal
  const pct = macroPercents(profile)
  const age = ageFromBirthYear(profile.birthYear, opts.today ?? todayISO())
  const proteinG = Math.max((kcal * pct.protein) / 100 / 4, proteinMinG(weightKg, age))
  const fatG = (kcal * pct.fat) / 100 / 9
  const carbsG = Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4)
  return {
    kcal,
    proteinG: overrides.proteinG ?? Math.round(proteinG),
    carbsG: overrides.carbsG ?? Math.round(carbsG),
    fatG: overrides.fatG ?? Math.round(fatG),
    fiberG: overrides.fiberG ?? FIBER_TARGET[profile.sex],
    waterMl: overrides.waterMl ?? waterTargetMl(profile.sex, profile.lifeStage),
    saltMaxG: overrides.saltMaxG ?? 6,
    satFatMaxG: overrides.satFatMaxG ?? Math.round((kcal * 0.1) / 9),
    addedSugarMaxG: overrides.addedSugarMaxG ?? Math.round((kcal * 0.1) / 4),
    caffeineMaxMg: overrides.caffeineMaxMg ?? (profile.lifeStage === 'ingen' ? 400 : 200),
  }
}

// ---------------------------------------------------------------------------
// Vikttrend och adaptiv energiförbrukning
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: ISODate
  /** Uppmätt vikt den dagen (om någon). */
  kg?: number
  /** Utjämnad trendvikt. */
  trend: number
}

/**
 * Exponentiellt glidande medelvärde per dag (Hacker's Diet-metoden, α = 0,1).
 * Dagar utan vägning interpoleras linjärt mellan mätningar så att trenden blir jämn.
 */
export function weightTrend(weights: readonly WeightEntry[], alpha = 0.1, until?: ISODate): TrendPoint[] {
  if (weights.length === 0) return []
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date))
  const first = sorted[0].date
  const last = until && until > sorted[sorted.length - 1].date ? until : sorted[sorted.length - 1].date
  const out: TrendPoint[] = []
  let trend = sorted[0].kg
  let idx = 0
  const days = diffDays(first, last)
  for (let i = 0; i <= days; i++) {
    const date = addDays(first, i)
    while (idx < sorted.length - 1 && sorted[idx + 1].date <= date) idx++
    const cur = sorted[idx]
    const next = sorted[idx + 1]
    let value: number
    let measured: number | undefined
    if (cur.date === date) {
      value = cur.kg
      measured = cur.kg
    } else if (next) {
      const span = diffDays(cur.date, next.date)
      const t = diffDays(cur.date, date) / span
      value = cur.kg + (next.kg - cur.kg) * t
    } else {
      value = trend // efter sista mätningen – håll trenden
    }
    trend = i === 0 ? value : trend + alpha * (value - trend)
    out.push({ date, kg: measured, trend })
  }
  return out
}

/** Linjär regression (minsta kvadrat) – lutning i kg/dag. */
export function slopePerDay(points: ReadonlyArray<{ x: number; y: number }>): number {
  const n = points.length
  if (n < 2) return 0
  const mx = points.reduce((s, p) => s + p.x, 0) / n
  const my = points.reduce((s, p) => s + p.y, 0) / n
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

export interface AdaptiveEstimate {
  tdee: number
  confidence: 'låg' | 'medel' | 'hög'
  loggedDays: number
  weighIns: number
  avgIntake: number
  /** Trendförändring i kg/vecka under perioden. */
  weeklyChangeKg: number
}

/**
 * Adaptiv energiförbrukning: genomsnittligt intag − (viktförändring × 7 700) / dagar.
 * Kräver minst 14 loggade dagar och minst 4 vägningar som spänner över 14 dagar
 * inom fönstret. Dagar med orimligt lågt intag (< 800 kcal) räknas som ofullständigt loggade.
 */
export function estimateAdaptiveTdee(
  intakeByDay: Record<ISODate, number>,
  weights: readonly WeightEntry[],
  today: ISODate = todayISO(),
  windowDays = 28,
): AdaptiveEstimate | null {
  const start = addDays(today, -(windowDays - 1))
  const end = addDays(today, -1) // dagens intag är ofta ofullständigt
  const logged = Object.entries(intakeByDay).filter(([d, kcal]) => d >= start && d <= end && kcal >= 800)
  const inWindow = weights.filter((w) => w.date >= start && w.date <= today)
  if (logged.length < 14 || inWindow.length < 4) return null
  const sortedW = [...inWindow].sort((a, b) => a.date.localeCompare(b.date))
  if (diffDays(sortedW[0].date, sortedW[sortedW.length - 1].date) < 14) return null

  const trend = weightTrend(weights, 0.1, today).filter((p) => p.date >= start)
  const slope = slopePerDay(trend.map((p) => ({ x: diffDays(start, p.date), y: p.trend })))
  const avgIntake = logged.reduce((s, [, k]) => s + k, 0) / logged.length
  const tdee = avgIntake - slope * KCAL_PER_KG
  const confidence = logged.length >= 24 && inWindow.length >= 12 ? 'hög' : logged.length >= 18 && inWindow.length >= 7 ? 'medel' : 'låg'
  return {
    tdee: Math.round(Math.min(6000, Math.max(1000, tdee))),
    confidence,
    loggedDays: logged.length,
    weighIns: inWindow.length,
    avgIntake: Math.round(avgIntake),
    weeklyChangeKg: slope * 7,
  }
}

/**
 * Välj vilka dagars intag den adaptiva skattningen ska bygga på. Har användaren markerat
 * minst 14 dagar i fönstret som klara (med rimligt intag) används bara de – då vet vi att
 * loggningen är komplett och skattningen blir säkrare. Annars används alla loggade dagar.
 */
export function adaptiveIntake(
  intakeByDay: Readonly<Record<ISODate, number>>,
  isComplete: (date: ISODate) => boolean,
  today: ISODate = todayISO(),
  windowDays = 28,
): Record<ISODate, number> {
  const start = addDays(today, -(windowDays - 1))
  const end = addDays(today, -1)
  const complete: Record<ISODate, number> = {}
  let n = 0
  for (const [d, kcal] of Object.entries(intakeByDay)) {
    if (!isComplete(d)) continue
    complete[d] = kcal
    if (d >= start && d <= end && kcal >= 800) n++
  }
  return n >= 14 ? complete : { ...intakeByDay }
}

/** Uppskattat datum då målvikten nås med nuvarande trend, eller null om trenden går åt fel håll. */
export function projectGoalDate(currentTrendKg: number, weeklyChangeKg: number, targetKg: number, today: ISODate = todayISO()): ISODate | null {
  const remaining = targetKg - currentTrendKg
  if (Math.abs(remaining) < 0.1) return today
  if (weeklyChangeKg === 0 || Math.sign(remaining) !== Math.sign(weeklyChangeKg)) return null
  const weeks = remaining / weeklyChangeKg
  if (weeks > 520) return null
  return addDays(today, Math.round(weeks * 7))
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

/**
 * BMI-klassning enligt WHO (vuxna). Tonen är aldrig 'bad' (rött) – Lagom visar inga
 * larmande färger kring kroppen; typen behåller 'bad' för bakåtkompatibilitet.
 */
export function bmiCategory(v: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (v < 18.5) return { label: 'Undervikt', tone: 'warn' }
  if (v < 25) return { label: 'Normalvikt', tone: 'good' }
  if (v < 30) return { label: 'Övervikt', tone: 'warn' }
  return { label: 'Fetma', tone: 'warn' }
}
