/**
 * Dagsmålen utanför React: hela beräkningen bakom `useTargets` (src/hooks/useTargets.ts) som en ren
 * funktion. Kroken väljer tillståndet ur butikerna och memoiserar; hemskärmswidgeten
 * (`widgetTargets` i src/lib/widgetSummary.ts) anropar den direkt – så att widgeten och Idag alltid
 * räknar samma mål.
 */
import type { DayMeta, DiaryEntry, ISODate, Profile, Settings, Targets, WeightEntry } from '../types'
import { exerciseAddBack, totals, type ExerciseAddBack } from './diary'
import {
  CAFFEINE_ADULT_MAX_MG,
  MIN_KCAL,
  adaptiveBlockReasonFor,
  adaptiveIntake,
  computeEnergy,
  computeTargets,
  estimateAdaptiveTdee,
  weightTrend,
  type AdaptiveEstimate,
  type EnergyBreakdown,
} from './energy'
import { resolveWeeklyBudget, targetsForDate, type WeeklyPlan } from './weeklyBudget'

export interface TargetsInfo {
  /**
   * Målen för `date` (andra argumentet till `useTargets`) – med veckobudgetens förskjutning för
   * den veckodagen. Utan `date`: basmålen (samma som `baseTargets`).
   */
  targets: Targets
  /**
   * Dagsmålen utan veckobudget – veckans snittdag. Mål och makron, sammanfattningar ("… per dag")
   * och referensvärden utgår från dem.
   */
  baseTargets: Targets
  /**
   * Målen för ett visst datum: basmålen plus veckobudgetens förskjutning för veckodagen (aldrig
   * under golvet). Samma funktion så länge målen inte ändras – går att skicka till memoiserade
   * komponenter. Utan veckobudget returneras `baseTargets`.
   */
  targetsFor: (date: ISODate) => Targets
  /** Veckobudgeten när den är påslagen och får användas, annars null. */
  weeklyPlan: WeeklyPlan | null
  /**
   * Varför veckobudgeten inte används (graviditet, amning, under 18 år) – oavsett om den är
   * påslagen – annars null.
   */
  weeklyBlocked: string | null
  energy: EnergyBreakdown | null
  adaptive: AdaptiveEstimate | null
  /** Vikten som målen baseras på (senaste vägningen till och med `today`). */
  weightKg: number | null
  /**
   * Trendvikten idag (samma utjämning som under Vikt). Viktmålet – BMI-gränsen och målvikten –
   * bedöms mot den, så att Idag, Vikt och målen visar samma status. BMI-gränsen bedöms dessutom
   * mot senaste vägningen (den lägsta av de två avgör, se `computeEnergy`).
   */
  trendKg: number | null
  /**
   * Varför adaptiv förbrukning inte används just nu, eller null: graviditet, amning, under 18 år –
   * eller lågt BMI när den uppmätta förbrukningen är lägre än formelns (se `computeEnergy`).
   * Då räknas målen från formeln även om inställningen är på.
   */
  adaptiveBlocked: string | null
  /** Hur mycket av träningen som läggs till dagens budget (0 % när den redan ingår i målet). */
  exerciseAddBack: ExerciseAddBack
}

/** Det som målen bygger på – butikernas tillstånd som vanliga data. */
export interface TargetsInput {
  profile: Profile | null
  settings: Pick<Settings, 'targetOverrides' | 'adaptiveTargets' | 'exerciseAddBackPct' | 'weeklyBudget'>
  /** Vägningarna (bodyStore) – i vilken ordning som helst; framtida och trasiga räknas inte. */
  weights: readonly WeightEntry[]
  /** Dagbokens poster – läses bara för adaptiv förbrukning. */
  entries: Readonly<Record<ISODate, readonly DiaryEntry[] | undefined>>
  /** Dagarnas markeringar ("dagen är klar") – läses bara för adaptiv förbrukning. */
  days: Readonly<Record<ISODate, DayMeta | undefined>>
}

const FALLBACK: Targets = {
  kcal: 2000,
  proteinG: 90,
  carbsG: 250,
  fatG: 70,
  fiberG: 30,
  waterMl: 1800,
  saltMaxG: 6,
  satFatMaxG: 22,
  addedSugarMaxG: 50,
  caffeineMaxMg: 400,
}

const NO_OVERRIDES: Partial<Targets> = {}

const usable = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/**
 * Mål utan profil (före introduktionen). Egna mål gäller, men aldrig under det högre
 * säkerhetsgolvet (könet är okänt) och aldrig över vuxnas koffeinriktmärke.
 */
function fallbackTargets(overrides: Partial<Targets>): Targets {
  const out: Targets = { ...FALLBACK }
  for (const key of Object.keys(FALLBACK) as (keyof Targets)[]) {
    const v = overrides[key]
    if (usable(v)) out[key] = v
  }
  out.kcal = Math.max(out.kcal, MIN_KCAL.man)
  out.caffeineMaxMg = Math.min(out.caffeineMaxMg, CAFFEINE_ADULT_MAX_MG)
  return out
}

/**
 * Vägningarna till och med `today`, sorterade på datum. En vägning med ett senare datum (t.ex. från
 * en säkerhetskopia) eller en osorterad lista får aldrig styra dagens mål.
 */
function weightsUntil(weights: readonly WeightEntry[], today: ISODate): WeightEntry[] {
  return weights.filter((w) => w.date <= today && Number.isFinite(w.kg) && w.kg > 0).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Används adaptiv förbrukning? Bara med en profil, när den är påslagen och profilen tillåter den
 * (inte vid graviditet, amning eller under 18 år). Bara då behövs hela dagboken – kroken
 * prenumererar annars inte på den.
 */
export function usesAdaptiveTargets(profile: Profile | null, adaptiveTargets: boolean, today: ISODate): boolean {
  return profile !== null && adaptiveTargets === true && adaptiveBlockReasonFor(profile, today) === null
}

/**
 * Dagsmålen räknade utifrån `today` (vikt, ålder, adaptiv förbrukning), med användarens egna mål,
 * veckobudgeten och träningens andel. `targets` är basmålen – kroken byter dem mot ett visst
 * datums mål med `targetsFor`.
 */
export function computeTargetsInfo(input: TargetsInput, today: ISODate): TargetsInfo {
  const { profile, settings } = input
  // Saknas egna mål helt (äldre data) gäller inga.
  const targetOverrides = settings.targetOverrides ?? NO_OVERRIDES
  if (!profile) {
    const targets = fallbackTargets(targetOverrides)
    return {
      targets,
      baseTargets: targets,
      // Utan profil är åldern okänd – ingen veckobudget.
      targetsFor: () => targets,
      weeklyPlan: null,
      weeklyBlocked: null,
      energy: null,
      adaptive: null,
      weightKg: null,
      trendKg: null,
      adaptiveBlocked: null,
      exerciseAddBack: exerciseAddBack(settings.exerciseAddBackPct, undefined, usable(targetOverrides.kcal)),
    }
  }
  // Graviditet, amning och under 18 år: formeln gäller även om adaptiva mål är påslagna.
  const profileBlocked = adaptiveBlockReasonFor(profile, today)
  const useAdaptive = usesAdaptiveTargets(profile, settings.adaptiveTargets, today)
  const weights = weightsUntil(input.weights, today)
  const weightKg = weights.at(-1)?.kg ?? profile.startWeightKg
  const trend = weights.length > 0 ? weightTrend(weights, 0.1, today) : []
  const trendKg = trend.length > 0 ? trend[trend.length - 1].trend : null
  let adaptive: AdaptiveEstimate | null = null
  if (useAdaptive) {
    const intake: Record<ISODate, number> = {}
    for (const [d, list] of Object.entries(input.entries)) if (list) intake[d] = totals(list).kcal ?? 0
    const days = input.days
    adaptive = estimateAdaptiveTdee(adaptiveIntake(intake, (d) => days[d]?.complete === true, today), weights, today)
  }
  const opts = { today, adaptiveTdee: adaptive?.tdee, trendKg: trendKg ?? undefined }
  const energy = computeEnergy(profile, weightKg, opts)
  const targets = computeTargets(profile, weightKg, targetOverrides, opts)
  // Träningen följer inställningen bara när användarens eget energimål faktiskt används. Ett
  // ogiltigt eget mål (t.ex. NaN från en säkerhetskopia) eller ett som har höjts till golvet
  // (som bygger på den adaptiva förbrukningen) räknas inte – annars kunde träningen räknas två gånger.
  const ownKcal = usable(targetOverrides.kcal) && targets.kcal === targetOverrides.kcal
  // Veckobudgeten läggs ovanpå basmålet (egna mål och adaptiv förbrukning ingår redan), före
  // träningstillägget, och följer golvet varje dag (se lib/weeklyBudget).
  const weekly = resolveWeeklyBudget({ profile, energy, baseKcal: targets.kcal, setting: settings.weeklyBudget, today })
  const plan = weekly.plan
  return {
    targets,
    baseTargets: targets,
    targetsFor: plan ? (d: ISODate) => targetsForDate(targets, plan, d, targetOverrides) : () => targets,
    weeklyPlan: plan,
    weeklyBlocked: weekly.blocked,
    energy,
    adaptive,
    weightKg,
    trendKg,
    // Vid lågt BMI kan också en lägre uppmätt förbrukning vara spärrad – samma besked överallt.
    adaptiveBlocked: profileBlocked ?? energy.adaptiveBlocked,
    exerciseAddBack: exerciseAddBack(settings.exerciseAddBackPct, energy.tdeeSource, ownKcal),
  }
}
