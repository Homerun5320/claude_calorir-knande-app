/**
 * Ren logik för profilen: utkast, validering, säkerhetsregler och takt.
 * Delas av välkomstflödet (/valkommen) och Inställningar → Profil så att reglerna är desamma.
 *
 * Säkerhet (se även lib/energy):
 * - Ingen viktnedgång vid graviditet, amning, under 18 år eller när BMI redan är under 18,5.
 * - Takten begränsas till högst 1 % av kroppsvikten per vecka (viktuppgång högst 0,5 kg/vecka).
 * - Målvikten får inte motsvara ett BMI under 18,5.
 */
import type { ActivityLevel, DietType, GoalType, ISODate, LifeStage, MacroPreset, Profile, Sex } from '../../types'
import { ACTIVITY_LEVELS } from '../../types'
import { MONTHS, ageFromBirthYear, diffDays, fromISODate, todayISO } from '../../lib/dates'
import { KCAL_PER_KG, projectGoalDate } from '../../lib/energy'
import { formatNumber } from '../../lib/format'

// ---------------------------------------------------------------------------
// Gränser
// ---------------------------------------------------------------------------

export const MIN_AGE = 13
export const MAX_AGE = 110
export const HEIGHT_RANGE = { min: 120, max: 230 } as const
export const WEIGHT_RANGE = { min: 30, max: 300 } as const
/** Lägsta BMI som räknas som hälsosamt (WHO). */
export const HEALTHY_BMI_MIN = 18.5
/** Valbara takter i kg per vecka. */
export const RATE_OPTIONS = [0.25, 0.5, 0.75] as const
/** Högsta takt vid viktuppgång (samma som lib/energy). */
export const GAIN_MAX_RATE = 0.5

// ---------------------------------------------------------------------------
// Val i flödet
// ---------------------------------------------------------------------------

/** Svar på frågan "Vad vill du med Lagom?". */
export type GoalChoice = GoalType | 'balans' | 'medvetet'

export const GOAL_CHOICES: ReadonlyArray<{ value: GoalChoice; label: string; description: string }> = [
  { value: 'ga_ner', label: 'Gå ner i vikt', description: 'I en lugn och hållbar takt' },
  { value: 'behalla', label: 'Behålla min vikt', description: 'Och må bra i vardagen' },
  { value: 'ga_upp', label: 'Gå upp i vikt', description: 'Bygga muskler eller återhämta mig' },
  { value: 'balans', label: 'Äta mer balanserat', description: 'Mer grönt, fibrer och jämn energi' },
  {
    value: 'medvetet',
    label: 'Jag vill inte räkna kalorier',
    description: 'Visa hellre tallriken – Lagom döljer siffrorna och fokuserar på Tallriksmodellen och mående',
  },
]

export function goalFromChoice(choice: GoalChoice | null): GoalType | null {
  if (choice === null) return null
  return choice === 'balans' || choice === 'medvetet' ? 'behalla' : choice
}

export const DIET_OPTIONS: ReadonlyArray<{ value: DietType; label: string; description: string; emoji: string }> = [
  { value: 'allatare', label: 'Allätare', description: 'Jag äter det mesta', emoji: '🍽️' },
  { value: 'flexitarian', label: 'Flexitarian', description: 'Mest vegetariskt, ibland kött eller fisk', emoji: '🥗' },
  { value: 'pescetarian', label: 'Pescetarian', description: 'Vegetariskt plus fisk och skaldjur', emoji: '🐟' },
  { value: 'vegetarian', label: 'Vegetarian', description: 'Inget kött eller fisk, men mejeri och ägg', emoji: '🧀' },
  { value: 'vegan', label: 'Vegan', description: 'Helt växtbaserat', emoji: '🌱' },
]

export const SEX_OPTIONS: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: 'kvinna', label: 'Kvinna' },
  { value: 'man', label: 'Man' },
]

export const LIFE_STAGE_OPTIONS: ReadonlyArray<{ value: LifeStage; label: string }> = [
  { value: 'ingen', label: 'Inget av dessa' },
  { value: 'gravid', label: 'Gravid' },
  { value: 'ammar', label: 'Ammar' },
]

// ---------------------------------------------------------------------------
// Utkast
// ---------------------------------------------------------------------------

export interface ProfileDraft {
  name: string
  goalChoice: GoalChoice | null
  sex: Sex | null
  birthYear: number | undefined
  heightCm: number | undefined
  weightKg: number | undefined
  lifeStage: LifeStage
  activityLevel: ActivityLevel | null
  weeklyRateKg: number
  targetWeightKg: number | undefined
  diet: DietType
  macroPreset: MacroPreset
}

export function emptyDraft(): ProfileDraft {
  return {
    name: '',
    goalChoice: null,
    sex: null,
    birthYear: undefined,
    heightCm: undefined,
    weightKg: undefined,
    lifeStage: 'ingen',
    activityLevel: null,
    weeklyRateKg: 0.5,
    targetWeightKg: undefined,
    diet: 'allatare',
    macroPreset: 'nnr',
  }
}

/** Utkast från en befintlig profil (för Inställningar → Profil). */
export function draftFromProfile(profile: Profile, currentWeightKg: number): ProfileDraft {
  return {
    name: profile.name ?? '',
    goalChoice: profile.goal,
    sex: profile.sex,
    birthYear: profile.birthYear,
    heightCm: profile.heightCm,
    weightKg: currentWeightKg,
    lifeStage: profile.sex === 'man' ? 'ingen' : profile.lifeStage,
    activityLevel: profile.activityLevel,
    weeklyRateKg: profile.weeklyRateKg,
    targetWeightKg: profile.targetWeightKg,
    diet: profile.diet,
    macroPreset: profile.macroPreset,
  }
}

const ACTIVITY_KEYS = Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]

/** Gör ett sparat (eventuellt ofullständigt) utkast användbart igen. */
export function reviveDraft(raw: unknown): ProfileDraft {
  const base = emptyDraft()
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
  return {
    name: typeof r.name === 'string' ? r.name : '',
    goalChoice: GOAL_CHOICES.some((g) => g.value === r.goalChoice) ? (r.goalChoice as GoalChoice) : null,
    sex: r.sex === 'kvinna' || r.sex === 'man' ? r.sex : null,
    birthYear: num(r.birthYear),
    heightCm: num(r.heightCm),
    weightKg: num(r.weightKg),
    lifeStage: pick(r.lifeStage, ['ingen', 'gravid', 'ammar'] as const, 'ingen'),
    activityLevel: ACTIVITY_KEYS.includes(r.activityLevel as ActivityLevel) ? (r.activityLevel as ActivityLevel) : null,
    weeklyRateKg: num(r.weeklyRateKg) ?? base.weeklyRateKg,
    targetWeightKg: num(r.targetWeightKg),
    diet: pick(r.diet, DIET_OPTIONS.map((d) => d.value), base.diet),
    macroPreset: pick(r.macroPreset, ['nnr', 'hogprotein', 'lagkolhydrat', 'lchf', 'idrott', 'anpassad'] as const, base.macroPreset),
  }
}

// ---------------------------------------------------------------------------
// Validering
// ---------------------------------------------------------------------------

export type ProfileField = 'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'targetWeightKg'
export type FieldErrors = Partial<Record<ProfileField, string>>

function currentYear(today: ISODate): number {
  return fromISODate(today).getFullYear()
}

export function validateBirthYear(birthYear: number | undefined, today: ISODate = todayISO()): string | undefined {
  const year = currentYear(today)
  if (birthYear === undefined) return 'Fyll i ditt födelseår.'
  if (!Number.isInteger(birthYear) || birthYear > year || birthYear < year - MAX_AGE) {
    return `Skriv födelseåret med fyra siffror, t.ex. ${year - 35}.`
  }
  if (ageFromBirthYear(birthYear, today) < MIN_AGE) {
    return `Lagom är gjord för dig som är ${MIN_AGE} år eller äldre. Prata gärna med en vuxen eller skolsköterskan om mat och hälsa.`
  }
  return undefined
}

export function validateHeight(heightCm: number | undefined): string | undefined {
  if (heightCm === undefined) return 'Fyll i din längd.'
  if (heightCm < HEIGHT_RANGE.min || heightCm > HEIGHT_RANGE.max) return `Ange en längd mellan ${HEIGHT_RANGE.min} och ${HEIGHT_RANGE.max} cm.`
  return undefined
}

export function validateWeight(weightKg: number | undefined): string | undefined {
  if (weightKg === undefined) return 'Fyll i din vikt.'
  if (weightKg < WEIGHT_RANGE.min || weightKg > WEIGHT_RANGE.max) return `Ange en vikt mellan ${WEIGHT_RANGE.min} och ${WEIGHT_RANGE.max} kg.`
  return undefined
}

/** Fel i "Om dig" (kön, födelseår, längd, vikt). Tomt objekt = allt ok. */
export function validateAbout(draft: ProfileDraft, today: ISODate = todayISO()): FieldErrors {
  const errors: FieldErrors = {}
  if (draft.sex === null) errors.sex = 'Välj det alternativ som stämmer bäst.'
  const by = validateBirthYear(draft.birthYear, today)
  if (by) errors.birthYear = by
  const h = validateHeight(draft.heightCm)
  if (h) errors.heightCm = h
  const w = validateWeight(draft.weightKg)
  if (w) errors.weightKg = w
  return errors
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some(Boolean)
}

/** Ålder, eller undefined om födelseåret saknas. */
export function draftAge(draft: Pick<ProfileDraft, 'birthYear'>, today: ISODate = todayISO()): number | undefined {
  return draft.birthYear === undefined ? undefined : ageFromBirthYear(draft.birthYear, today)
}

export function isMinor(draft: Pick<ProfileDraft, 'birthYear'>, today: ISODate = todayISO()): boolean {
  const age = draftAge(draft, today)
  return age !== undefined && age >= MIN_AGE && age < 18
}

export function bmiOf(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

/** Lägsta hälsosamma vikt (BMI 18,5) för en längd, avrundad uppåt till en decimal. */
export function minHealthyWeight(heightCm: number): number {
  const m = heightCm / 100
  return Math.ceil(HEALTHY_BMI_MIN * m * m * 10) / 10
}

/**
 * Varför viktnedgång inte erbjuds, eller null om den är ok. Texten är vänlig och förklarande.
 */
export function lossBlockReason(draft: ProfileDraft, today: ISODate = todayISO()): string | null {
  if (draft.sex === 'kvinna' && draft.lifeStage === 'gravid') {
    return 'Under graviditeten behöver du och barnet energi och näring, så viktnedgång rekommenderas inte. Lagom hjälper dig att äta lagom och näringsrikt i stället.'
  }
  if (draft.sex === 'kvinna' && draft.lifeStage === 'ammar') {
    return 'När du ammar behöver kroppen extra energi, så Lagom sätter inget mål om viktnedgång. Fokus ligger på näring och att äta så att du orkar.'
  }
  const age = draftAge(draft, today)
  if (age !== undefined && age < 18) {
    return 'Du som är under 18 år växer fortfarande, och då rekommenderas inte kaloriunderskott. Lagom hjälper dig att äta varierat och lagom i stället.'
  }
  if (draft.weightKg !== undefined && draft.heightCm !== undefined && bmiOf(draft.weightKg, draft.heightCm) < HEALTHY_BMI_MIN) {
    return 'Din vikt ligger redan i den lägre delen av vad som räknas som hälsosamt, så Lagom sätter inget mål om viktnedgång.'
  }
  return null
}

/** Målet som faktiskt används (viktnedgång byts mot "behålla" när den inte är lämplig). */
export function effectiveGoal(draft: ProfileDraft, today: ISODate = todayISO()): GoalType {
  const goal = goalFromChoice(draft.goalChoice) ?? 'behalla'
  if (goal === 'ga_ner' && lossBlockReason(draft, today) !== null) return 'behalla'
  return goal
}

// ---------------------------------------------------------------------------
// Takt och målvikt
// ---------------------------------------------------------------------------

/** Högsta tillåtna takt i kg/vecka. */
export function maxRateFor(weightKg: number | undefined, goal: GoalType): number {
  if (goal === 'ga_upp') return GAIN_MAX_RATE
  if (goal === 'behalla') return 0
  return weightKg === undefined ? RATE_OPTIONS[RATE_OPTIONS.length - 1] : Math.round(weightKg * 0.01 * 100) / 100
}

export interface RateOption {
  value: number
  /** Ungefärligt över-/underskott per dag i kcal. */
  kcalPerDay: number
  disabled: boolean
  label: string
  description: string
}

const RATE_TEXT: Record<number, { label: string; loss: string; gain: string }> = {
  0.25: { label: 'Lugnt', loss: 'Knappt märkbart i vardagen – lättast att hålla i längden', gain: 'Mest muskler, minst fett' },
  0.5: { label: 'Lagom', loss: 'Ett tydligt men hållbart underskott', gain: 'Snabbare, passar om du tränar mycket' },
  0.75: { label: 'Snabbare', loss: 'Kräver mer – kan kännas i orken och humöret', gain: '' },
}

/** Valbara takter för ett mål (viktuppgång högst 0,5 kg/vecka, nedgång högst 1 % av vikten). */
export function rateOptions(weightKg: number | undefined, goal: GoalType): RateOption[] {
  if (goal === 'behalla') return []
  const max = maxRateFor(weightKg, goal)
  return RATE_OPTIONS.filter((r) => goal === 'ga_ner' || r <= GAIN_MAX_RATE).map((value) => ({
    value,
    kcalPerDay: Math.round((value * KCAL_PER_KG) / 7 / 5) * 5,
    disabled: value > max + 1e-9,
    label: RATE_TEXT[value].label,
    description: goal === 'ga_ner' ? RATE_TEXT[value].loss : RATE_TEXT[value].gain,
  }))
}

/** Närmaste tillåtna takt (för när vikten eller målet ändras). */
export function clampRate(rate: number, weightKg: number | undefined, goal: GoalType): number {
  const options = rateOptions(weightKg, goal).filter((o) => !o.disabled)
  if (options.length === 0) return RATE_OPTIONS[0]
  if (options.some((o) => Math.abs(o.value - rate) < 1e-9)) return rate
  // Högsta tillåtna som inte överstiger önskad takt, annars den lägsta.
  const below = options.filter((o) => o.value <= rate)
  return (below.length ? below[below.length - 1] : options[0]).value
}

/** Fel för målvikten (valfri), eller undefined. */
export function validateTarget(draft: ProfileDraft, today: ISODate = todayISO()): string | undefined {
  const t = draft.targetWeightKg
  if (t === undefined) return undefined
  const goal = effectiveGoal(draft, today)
  if (t < WEIGHT_RANGE.min || t > WEIGHT_RANGE.max) return `Ange en vikt mellan ${WEIGHT_RANGE.min} och ${WEIGHT_RANGE.max} kg.`
  if (draft.weightKg === undefined) return undefined
  if (goal === 'ga_ner') {
    if (t >= draft.weightKg) return 'Målvikten behöver vara lägre än din vikt idag.'
    if (draft.heightCm !== undefined && t < minHealthyWeight(draft.heightCm)) {
      return `Den vikten motsvarar ett BMI under ${formatNumber(HEALTHY_BMI_MIN, 1)}. Välj gärna minst ${formatNumber(minHealthyWeight(draft.heightCm), 1)} kg – lägre räknas inte som hälsosamt för din längd.`
    }
  }
  if (goal === 'ga_upp' && t <= draft.weightKg) return 'Målvikten behöver vara högre än din vikt idag.'
  return undefined
}

/** Ungefärligt datum då målvikten nås med vald takt, eller null. */
export function projectedGoalDate(draft: ProfileDraft, today: ISODate = todayISO()): ISODate | null {
  const goal = effectiveGoal(draft, today)
  if (goal === 'behalla' || draft.weightKg === undefined || draft.targetWeightKg === undefined) return null
  if (validateTarget(draft, today)) return null
  const rate = clampRate(draft.weeklyRateKg, draft.weightKg, goal)
  return projectGoalDate(draft.weightKg, goal === 'ga_ner' ? -rate : rate, draft.targetWeightKg, today)
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------

/** true när utkastet innehåller allt som krävs för en profil. */
export function isDraftComplete(draft: ProfileDraft, today: ISODate = todayISO()): boolean {
  return draft.goalChoice !== null && draft.activityLevel !== null && !hasErrors(validateAbout(draft, today)) && !validateTarget(draft, today)
}

/**
 * Bygg en profil av ett komplett utkast. Kastar om något obligatoriskt saknas.
 * `base` behåller fält som inte redigeras här (t.ex. createdAt och egna makron).
 */
export function buildProfile(draft: ProfileDraft, opts: { today?: ISODate; now?: number; base?: Profile | null } = {}): Profile {
  const today = opts.today ?? todayISO()
  if (!isDraftComplete(draft, today) || draft.sex === null || draft.activityLevel === null) {
    throw new Error('Profilen är inte komplett.')
  }
  const goal = effectiveGoal(draft, today)
  const weightKg = draft.weightKg as number
  const name = draft.name.trim()
  const profile: Profile = {
    ...opts.base,
    name: name === '' ? undefined : name.slice(0, 40),
    sex: draft.sex,
    birthYear: draft.birthYear as number,
    heightCm: Math.round(draft.heightCm as number),
    startWeightKg: opts.base?.startWeightKg ?? Math.round(weightKg * 10) / 10,
    activityLevel: draft.activityLevel,
    goal,
    weeklyRateKg: goal === 'behalla' ? (opts.base?.weeklyRateKg ?? 0.5) : clampRate(draft.weeklyRateKg, weightKg, goal),
    targetWeightKg: goal === 'behalla' ? undefined : draft.targetWeightKg,
    lifeStage: draft.sex === 'man' ? 'ingen' : draft.lifeStage,
    diet: draft.diet,
    macroPreset: draft.macroPreset,
    createdAt: opts.base?.createdAt ?? opts.now ?? Date.now(),
  }
  if (profile.name === undefined) delete profile.name
  if (profile.targetWeightKg === undefined) delete profile.targetWeightKg
  return profile
}

// ---------------------------------------------------------------------------
// Steg i välkomstflödet
// ---------------------------------------------------------------------------

export type OnboardingStep = 'valkommen' | 'mal' | 'om-dig' | 'aktivitet' | 'takt' | 'kost' | 'sammanfattning'

/** Stegen för ett utkast. Takt-steget hoppas över när målet är att behålla vikten. */
export function stepsFor(draft: ProfileDraft, today: ISODate = todayISO()): OnboardingStep[] {
  const steps: OnboardingStep[] = ['valkommen', 'mal', 'om-dig', 'aktivitet']
  // Innan målet är valt räknas takt-steget med, så att antalet steg bara kan minska.
  if (draft.goalChoice === null || (draft.goalChoice !== 'medvetet' && effectiveGoal(draft, today) !== 'behalla')) steps.push('takt')
  steps.push('kost', 'sammanfattning')
  return steps
}

export function canContinue(step: OnboardingStep, draft: ProfileDraft, today: ISODate = todayISO()): boolean {
  switch (step) {
    case 'valkommen':
    case 'kost':
      return true
    case 'mal':
      return draft.goalChoice !== null
    case 'om-dig':
      return !hasErrors(validateAbout(draft, today))
    case 'aktivitet':
      return draft.activityLevel !== null
    case 'takt':
      return validateTarget(draft, today) === undefined
    case 'sammanfattning':
      return isDraftComplete(draft, today)
  }
}

// ---------------------------------------------------------------------------
// Texter
// ---------------------------------------------------------------------------

/** "om ca 16 veckor – runt 14 januari 2027" för ett prognosdatum. */
export function describeProjection(date: ISODate, today: ISODate = todayISO()): string {
  const days = Math.max(0, diffDays(today, date))
  const d = fromISODate(date)
  const when = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  if (days < 14) return `om ungefär ${days === 1 ? 'en dag' : `${days} dagar`} – runt ${when}`
  const weeks = Math.round(days / 7)
  if (weeks <= 12) return `om ca ${weeks} veckor – runt ${when}`
  const months = Math.round(days / 30.44)
  return `om ca ${months} månader – runt ${when}`
}
