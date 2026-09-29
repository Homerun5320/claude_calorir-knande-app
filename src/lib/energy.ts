/**
 * Energibehov, mål och makrofördelning.
 *
 * - BMR: Mifflin–St Jeor (bäst validerad för vuxna utan kroppssammansättningsdata).
 * - Total förbrukning: BMR × PAL (vardagsaktivitet). Träning loggas separat.
 * - 1 kg kroppsvikt ≈ 7 700 kcal.
 * - Säkerhetsgolv: aldrig under 1 200 kcal (kvinnor) / 1 500 kcal (män), max underskott 1 000 kcal/dag
 *   och max viktnedgång 1 % av kroppsvikten per vecka. Ingen viktnedgång vid graviditet, amning,
 *   för användare under 18 år eller när vikten redan är under hälsosamt BMI (18,5; 22 från 70 år).
 *   BMI-gränsen bedöms mot den lägsta av trendvikten och senaste vägningen.
 * - När målvikten är nådd räknas dagsmålet för att behålla vikten.
 * - Adaptiv förbrukning används inte vid graviditet, amning eller under 18 år – där ändras vikten
 *   av naturliga skäl och skulle annars sänka målet. Vid lågt BMI får en lägre uppmätt förbrukning
 *   aldrig sänka målet under formeln.
 * - Ett eget energimål bryter aldrig mot reglerna ovan (se `kcalOverrideFloor`), och ett eget
 *   koffeinmål går aldrig över riktmärket.
 * - Makromålen överstiger aldrig energimålet (utom när egna makromål själva gör det).
 * - Veckobudgeten (lib/weeklyBudget) flyttar energi mellan veckodagarna men följer golvet ovan
 *   (`kcalOverrideFloor`) VARJE dag, och används inte alls vid graviditet, amning eller under
 *   18 år (`weeklyBudgetBlockReason`).
 * - Säkerhetsmatrisen i `energy.safety.test.ts` prövar reglerna över tusentals kombinationer.
 */
import type { GoalType, LifeStage, MacroPreset, Profile, Sex, Targets, WeightEntry, ISODate } from '../types'
import { ACTIVITY_LEVELS } from '../types'
import { ageFromBirthYear, addDays, diffDays, fromISODate, todayISO } from './dates'

export const KCAL_PER_KG = 7700
export const MIN_KCAL: Record<Sex, number> = { kvinna: 1200, man: 1500 }
export const MAX_DAILY_DEFICIT = 1000

// ---------------------------------------------------------------------------
// Ålder, BMI och säkerhetsregler
// ---------------------------------------------------------------------------

/** Från den här åldern gäller en högre nedre BMI-gräns (Socialstyrelsen, 1177). */
export const OLDER_ADULT_AGE = 70
/** Lägsta BMI som räknas som hälsosamt för vuxna (WHO). */
export const HEALTHY_BMI_MIN = 18.5
/** Lägsta BMI som räknas som hälsosamt från 70 år – lägre är ett tecken på risk för undernäring. */
export const OLDER_HEALTHY_BMI_MIN = 22
/** Målvikten räknas som nådd inom så här många kg (samma marginal på Idag, Vikt och i målen). */
export const GOAL_REACHED_MARGIN_KG = 0.1

/**
 * Lägsta möjliga ålder för ett födelseår. Vi vet bara året, så den som är född i december kan
 * fortfarande vara ett år yngre än årsskillnaden. Används för 18-årsgränsen (ingen viktnedgång,
 * ingen adaptiv förbrukning) så att ingen släpps igenom ett år för tidigt. Den 31 december har
 * alla som är födda det året hunnit fylla år.
 */
export function youngestAge(birthYear: number, today: ISODate = todayISO()): number {
  const d = fromISODate(today)
  const yearDiff = ageFromBirthYear(birthYear, today)
  return d.getMonth() === 11 && d.getDate() === 31 ? yearDiff : yearDiff - 1
}

/**
 * Lägsta BMI som räknas som hälsosamt: 18,5 för vuxna och 22 från 70 år. För 70-årsgränsen
 * räknas åldern enligt födelseåret (den äldsta möjliga) – det är den försiktiga riktningen.
 */
export function minHealthyBmi(age: number | undefined): number {
  return age !== undefined && age >= OLDER_ADULT_AGE ? OLDER_HEALTHY_BMI_MIN : HEALTHY_BMI_MIN
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}

/**
 * Varför adaptiv förbrukning inte används, eller null om den får användas. Under graviditet,
 * amning och uppväxt ändras vikten av naturliga skäl – en viktökning skulle läsas som ett
 * överskott och sänka målet. Då används formeln (med livsstadietillägg) i stället.
 * `age` ska vara den yngsta möjliga åldern (`youngestAge`).
 */
export function adaptiveBlockReason(lifeStage: LifeStage | undefined, age: number | undefined): string | null {
  if (lifeStage === 'gravid') return 'Under graviditeten ändras vikten av naturliga skäl – därför används formeln i stället för den uppmätta förbrukningen.'
  if (lifeStage === 'ammar') return 'Under amningen förändras kroppen av naturliga skäl – därför används formeln (med tillägg för amning) i stället för den uppmätta förbrukningen.'
  if (age !== undefined && !(age >= 18)) return 'Under uppväxten ändras vikten av naturliga skäl – därför används formeln i stället för den uppmätta förbrukningen.'
  return null
}

/** `adaptiveBlockReason` för en profil (åldern räknas försiktigt, se `youngestAge`). */
export function adaptiveBlockReasonFor(profile: Pick<Profile, 'lifeStage' | 'birthYear'>, today: ISODate = todayISO()): string | null {
  return adaptiveBlockReason(profile.lifeStage, youngestAge(profile.birthYear, today))
}

/**
 * Varför veckobudgeten (lib/weeklyBudget) inte används, eller null om den får användas. Under
 * graviditet, amning och uppväxt behöver kroppen jämn energi varje dag – då är dagsmålet detsamma
 * alla dagar, även om veckobudgeten är påslagen. `age` ska vara den yngsta möjliga åldern
 * (`youngestAge`); en okänd ålder räknas inte som vuxen.
 */
export function weeklyBudgetBlockReason(lifeStage: LifeStage | undefined, age: number | undefined): string | null {
  if (lifeStage === 'gravid')
    return 'Under graviditeten mår kropp och barn bäst av jämn energi varje dag, så veckobudgeten används inte just nu. Dagsmålet är detsamma alla dagar – fredagsmyset får plats ändå.'
  if (lifeStage === 'ammar')
    return 'När du ammar behöver kroppen jämn energi varje dag, så veckobudgeten används inte just nu. Dagsmålet är detsamma alla dagar – fredagsmyset får plats ändå.'
  if (!(age !== undefined && age >= 18))
    return 'Under 18 år behöver kroppen jämn energi varje dag för att växa, så veckobudgeten används inte. Dagsmålet är detsamma alla dagar – fredagsmyset får plats ändå.'
  return null
}

/** `weeklyBudgetBlockReason` för en profil (åldern räknas försiktigt, se `youngestAge`). */
export function weeklyBudgetBlockReasonFor(profile: Pick<Profile, 'lifeStage' | 'birthYear'>, today: ISODate = todayISO()): string | null {
  return weeklyBudgetBlockReason(profile.lifeStage, youngestAge(profile.birthYear, today))
}

/**
 * Varför målet att gå ner eller upp i vikt inte används just nu:
 * - 'gravid', 'ammar', 'under18': viktnedgång rekommenderas inte.
 * - 'lowBmi': vikten ligger redan under hälsosamt BMI för längden (och åldern).
 * - 'reached': målvikten är nådd.
 * Då räknas dagsmålet för att behålla vikten.
 */
export type GoalPause = 'gravid' | 'ammar' | 'under18' | 'lowBmi' | 'reached'

export interface GoalCheck {
  goal: GoalType | undefined
  lifeStage: LifeStage | undefined
  /** Yngsta möjliga ålder (18-årsgränsen), se `youngestAge`. */
  youngestAge: number | undefined
  /** Ålder enligt födelseåret (70-årsgränsen för BMI). */
  age: number | undefined
  heightCm: number | undefined
  /** Vikten som målet bedöms mot – helst trendvikten, så att en enskild vägning inte avgör. */
  weightKg: number
  /**
   * Senaste vägningen (om den skiljer sig från `weightKg`). BMI-gränsen bedöms mot den lägsta av
   * de två: trendvikten släpar efter när vikten går ner, och ett underskott ska aldrig fortsätta
   * under ett hälsosamt BMI. Målvikten bedöms bara mot `weightKg` (trenden).
   */
  latestKg?: number
  targetWeightKg: number | undefined
}

const positive = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0

/** Om (och varför) målet att gå ner eller upp i vikt ska pausas. null = målet gäller. */
export function goalPause(c: GoalCheck): GoalPause | null {
  const target = positive(c.targetWeightKg) ? c.targetWeightKg : undefined
  if (c.goal === 'ga_ner') {
    if (c.lifeStage === 'gravid' || c.lifeStage === 'ammar') return c.lifeStage
    // Okänd ålder (t.ex. ett trasigt födelseår) räknas inte som vuxen.
    if (c.youngestAge !== undefined && !(c.youngestAge >= 18)) return 'under18'
    const bmiKg = Math.min(...[c.weightKg, c.latestKg].filter(positive))
    if (positive(c.heightCm) && Number.isFinite(bmiKg) && bmi(bmiKg, c.heightCm) < minHealthyBmi(c.age)) return 'lowBmi'
    if (target !== undefined && c.weightKg <= target + GOAL_REACHED_MARGIN_KG) return 'reached'
  } else if (c.goal === 'ga_upp') {
    if (target !== undefined && c.weightKg >= target - GOAL_REACHED_MARGIN_KG) return 'reached'
  }
  return null
}

/** Förklaring på svenska när målet är pausat (samma text i målen, på Idag och under Vikt). */
export function goalPauseNote(pause: GoalPause, age?: number): string {
  switch (pause) {
    case 'gravid':
    case 'ammar':
      return 'Under graviditet och amning rekommenderas inte viktnedgång. Målet är satt till att behålla vikten.'
    case 'under18':
      return 'Under 18 år rekommenderas inte kaloriunderskott. Målet är satt till att behålla vikten.'
    case 'lowBmi':
      return `Din vikt ligger nu under det som räknas som hälsosamt ${age !== undefined && age >= OLDER_ADULT_AGE ? 'för din längd och ålder' : 'för din längd'}, så Lagom rekommenderar inte att gå ner mer. Dagsmålet räknas därför för att behålla vikten.`
    case 'reached':
      return 'Du har nått din målvikt. Dagsmålet räknas nu för att behålla vikten – byt gärna mål eller sätt en ny målvikt i profilen när det känns rätt.'
  }
}

// ---------------------------------------------------------------------------
// Energibehov
// ---------------------------------------------------------------------------

export function bmrMifflin(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return sex === 'man' ? base + 5 : base - 161
}

/** Avrunda energi till jämna 10 kcal (som dagsmålet). */
export function roundKcal10(kcal: number): number {
  return Math.round(kcal / 10) * 10
}

/**
 * Största tillåtna underskott per dag: motsvarande 1 % av kroppsvikten per vecka, och aldrig mer
 * än 1 000 kcal. Gäller både Lagoms beräknade mål och egna energimål.
 */
export function maxDailyDeficit(weightKg: number): number {
  return Math.min(MAX_DAILY_DEFICIT, (weightKg * 0.01 * KCAL_PER_KG) / 7)
}

export type KcalFloorReason = 'golv' | 'gravid' | 'ammar' | 'ung' | 'lagtBmi' | 'malvikt' | 'underskott'

export interface KcalFloor {
  /** Lägsta tillåtna egna energimål i kcal. */
  kcal: number
  reason: KcalFloorReason
}

/** Varför ett eget energimål inte får vara lägre (texten efter "Lägst … – "). */
export function kcalFloorReasonText(reason: KcalFloorReason): string {
  switch (reason) {
    case 'gravid':
      return 'under graviditeten rekommenderas ingen viktnedgång, så målet följer din förbrukning.'
    case 'ammar':
      return 'när du ammar rekommenderas ingen viktnedgång, så målet följer din förbrukning.'
    case 'ung':
      return 'under 18 år rekommenderas inget kaloriunderskott, så målet följer din förbrukning.'
    case 'lagtBmi':
      return 'din vikt ligger under det som räknas som hälsosamt, så målet följer din förbrukning.'
    case 'malvikt':
      return 'din vikt är vid eller under din målvikt, så målet följer din förbrukning.'
    case 'underskott':
      return 'så att du går ner högst 1 % av din vikt i veckan. Snabbare än så rekommenderas inte.'
    case 'golv':
      return 'så att kroppen får tillräckligt med näring.'
  }
}

const PAUSE_FLOOR_REASON: Record<GoalPause, KcalFloorReason> = { gravid: 'gravid', ammar: 'ammar', under18: 'ung', lowBmi: 'lagtBmi', reached: 'malvikt' }

/** Förklaring när en lägre adaptiv förbrukning inte används vid lågt BMI. */
export const LOW_BMI_ADAPTIVE_NOTE =
  'Din vikt ligger under det som räknas som hälsosamt, så Lagom låter inte en lägre uppmätt förbrukning sänka dagsmålet – formeln används i stället.'

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
  /**
   * Energin för att behålla vikten (förbrukning + livsstadietillägg), avrundad som dagsmålet.
   * Golvet för egna energimål vid graviditet, amning, under 18 år, lågt BMI och nådd målvikt.
   */
  maintenanceKcal: number
  /** true om säkerhetsgolvet eller underskottstaket begränsade målet. */
  limited: boolean
  /** true om säkerhetsgolvet (1 200/1 500 kcal) höjde målet. */
  atFloor: boolean
  /** Målet som faktiskt används – 'behalla' när viktmålet är pausat. */
  goal: GoalType
  /** Varför viktmålet är pausat, eller null. */
  goalPause: GoalPause | null
  /**
   * Varför en adaptiv förbrukning inte användes, eller null: graviditet, amning, under 18 år –
   * eller lågt BMI när den uppmätta förbrukningen är lägre än formelns.
   */
  adaptiveBlocked: string | null
  /**
   * Lägsta tillåtna egna energimål (se `kcalOverrideFloor`). Samma regler som dagsmålet: golvet
   * 1 200/1 500 kcal, inget underskott när viktnedgång inte rekommenderas och annars högst
   * 1 % av vikten per vecka (högst 1 000 kcal per dag).
   */
  overrideFloor: KcalFloor
  /** Förklaringar på svenska (visas i UI). */
  notes: string[]
}

export interface EnergyOptions {
  today?: ISODate
  /**
   * Uppmätt (adaptiv) förbrukning. Ignoreras vid graviditet, amning och under 18 år, och vid
   * lågt BMI när den är lägre än formelns.
   */
  adaptiveTdee?: number
  /**
   * Trendvikten som viktmålet bedöms mot (BMI och målvikt). Utan den används `weightKg`.
   * Idag och Vikt använder samma trend, så att alla vyer visar samma status. BMI-gränsen bedöms
   * dessutom mot `weightKg` (senaste vägningen) – den lägsta av de två avgör.
   */
  trendKg?: number
}

export function computeEnergy(profile: Profile, weightKg: number, opts: EnergyOptions = {}): EnergyBreakdown {
  const today = opts.today ?? todayISO()
  const age = ageFromBirthYear(profile.birthYear, today)
  const young = youngestAge(profile.birthYear, today)
  // En ogiltig vikt (t.ex. från en trasig säkerhetskopia) får aldrig ge NaN som dagsmål.
  const kg = positive(weightKg) ? weightKg : positive(profile.startWeightKg) ? profile.startWeightKg : weightKg
  const bmr = bmrMifflin(profile.sex, kg, profile.heightCm, age)
  const pal = ACTIVITY_LEVELS[profile.activityLevel]?.pal ?? ACTIVITY_LEVELS.stillasittande.pal
  const formulaTdee = bmr * pal
  const notes: string[] = []
  let limited = false

  const lifeStageKcal = profile.lifeStage === 'gravid' ? 300 : profile.lifeStage === 'ammar' ? 500 : 0

  // Viktmålet: säkerheten (graviditet, amning, ålder, BMI) först, sedan målvikten.
  const checkKg = positive(opts.trendKg) ? opts.trendKg : kg
  const check: GoalCheck = {
    goal: profile.goal,
    lifeStage: profile.lifeStage,
    youngestAge: young,
    age,
    heightCm: profile.heightCm,
    weightKg: checkKg,
    latestKg: kg,
    targetWeightKg: profile.targetWeightKg,
  }
  // Varför en viktnedgång – oavsett valt mål – inte rekommenderas just nu. Styr golvet för egna mål.
  const lossPause = goalPause({ ...check, goal: 'ga_ner' })
  const pause = profile.goal === 'ga_ner' ? lossPause : goalPause(check)
  const goal: GoalType = pause ? 'behalla' : profile.goal

  // Adaptiv förbrukning: aldrig vid graviditet, amning och uppväxt (vikten ändras av naturliga
  // skäl), och vid lågt BMI får en lägre uppmätt förbrukning (t.ex. från ofullständig loggning)
  // aldrig sänka målet under formeln.
  const adaptive = positive(opts.adaptiveTdee) ? opts.adaptiveTdee : undefined
  const adaptiveBlocked =
    adaptive === undefined ? null : (adaptiveBlockReason(profile.lifeStage, young) ?? (lossPause === 'lowBmi' && adaptive < formulaTdee ? LOW_BMI_ADAPTIVE_NOTE : null))
  const useAdaptive = adaptive !== undefined && adaptiveBlocked === null
  const tdee = useAdaptive ? adaptive : formulaTdee
  if (adaptiveBlocked) notes.push(adaptiveBlocked)
  if (pause) notes.push(goalPauseNote(pause, age))

  // Önskad takt: negativa eller ogiltiga värden ger ingen förändring (aldrig ett underskott).
  const wanted = typeof profile.weeklyRateKg === 'number' && profile.weeklyRateKg > 0 ? profile.weeklyRateKg : 0
  const cap = maxDailyDeficit(kg)
  let adjustment = 0
  if (goal === 'ga_ner') {
    const maxRate = kg * 0.01
    const rate = Math.min(wanted, maxRate)
    if (rate < wanted) {
      limited = true
      notes.push('Takten är begränsad till högst 1 % av kroppsvikten per vecka.')
    }
    adjustment = -Math.min((rate * KCAL_PER_KG) / 7, cap)
    if ((rate * KCAL_PER_KG) / 7 > MAX_DAILY_DEFICIT) {
      limited = true
      notes.push('Underskottet är begränsat till 1 000 kcal per dag.')
    }
  } else if (goal === 'ga_upp') {
    adjustment = (Math.min(wanted, 0.5) * KCAL_PER_KG) / 7
  }

  const maintenance = tdee + lifeStageKcal
  let kcal = maintenance + adjustment
  let atFloor = false
  const floor = MIN_KCAL[profile.sex] ?? MIN_KCAL.man
  if (!(kcal >= floor)) {
    kcal = floor
    limited = true
    atFloor = true
    notes.push(`Målet är satt till lägsta rekommenderade nivå (${floor} kcal) för att du ska få i dig tillräckligt med näring.`)
  }

  // Golvet för egna energimål: samma regler som dagsmålet.
  const floorKcal = lossPause ? roundKcal10(maintenance) : roundKcal10(maintenance - cap)
  const overrideFloor: KcalFloor =
    floorKcal > floor ? { kcal: floorKcal, reason: lossPause ? PAUSE_FLOOR_REASON[lossPause] : 'underskott' } : { kcal: floor, reason: 'golv' }

  return {
    bmr: Math.round(bmr),
    pal,
    tdee: Math.round(tdee),
    tdeeSource: useAdaptive ? 'adaptiv' : 'formel',
    lifeStageKcal,
    adjustment: Math.round(adjustment),
    kcal: roundKcal10(kcal),
    maintenanceKcal: roundKcal10(maintenance),
    limited,
    atFloor,
    goal,
    goalPause: pause,
    adaptiveBlocked,
    overrideFloor,
    notes,
  }
}

// ---------------------------------------------------------------------------
// Golv för egna energimål
// ---------------------------------------------------------------------------

/**
 * Lägsta egna energimål – ett eget mål (även ett från en säkerhetskopia) bryter aldrig mot
 * säkerhetsreglerna:
 * - aldrig under säkerhetsgolvet (1 200/1 500 kcal);
 * - aldrig under förbrukningen vid graviditet, amning, under 18 år (yngsta möjliga ålder), BMI under
 *   18,5 (22 från 70 år) eller när vikten är vid/under målvikten;
 * - annars högst 1 % av kroppsvikten per vecka och högst 1 000 kcal underskott per dag.
 * Med en hel `EnergyBreakdown` (från `computeEnergy`) används dess `overrideFloor`. Med bara
 * förbrukningen kan vikten inte bedömas – då gäller golvet och reglerna för graviditet, amning och ålder.
 */
export function kcalOverrideFloor(
  profile: Pick<Profile, 'sex' | 'lifeStage' | 'birthYear'>,
  energy: Pick<EnergyBreakdown, 'tdee' | 'lifeStageKcal'> & Partial<Pick<EnergyBreakdown, 'maintenanceKcal' | 'overrideFloor'>>,
  today: ISODate = todayISO(),
): KcalFloor {
  if (energy.overrideFloor) return energy.overrideFloor
  const base = MIN_KCAL[profile.sex]
  const reason: KcalFloorReason | null =
    profile.lifeStage === 'gravid' ? 'gravid' : profile.lifeStage === 'ammar' ? 'ammar' : !(youngestAge(profile.birthYear, today) >= 18) ? 'ung' : null
  if (reason === null) return { kcal: base, reason: 'golv' }
  const maintenance = energy.maintenanceKcal ?? roundKcal10(energy.tdee + energy.lifeStageKcal)
  return maintenance > base ? { kcal: maintenance, reason } : { kcal: base, reason: 'golv' }
}

// ---------------------------------------------------------------------------
// Makron och övriga mål
// ---------------------------------------------------------------------------

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
  const c = profile.customMacroPct
  const pct = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100
  if (profile.macroPreset === 'anpassad' && c && pct(c.protein) && pct(c.carbs) && pct(c.fat)) return c
  // Okänd förinställning eller trasig egen fördelning: NNR.
  const p = MACRO_PRESETS[profile.macroPreset as Exclude<MacroPreset, 'anpassad'>] ?? MACRO_PRESETS.nnr
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

/** EFSA (2015): högst 400 mg koffein per dag för friska vuxna. */
export const CAFFEINE_ADULT_MAX_MG = 400
/** EFSA (2015) och Livsmedelsverket: högst 200 mg per dag vid graviditet och amning. */
export const CAFFEINE_PREGNANT_MAX_MG = 200
/** EFSA (2015): för barn och ungdomar under 18 år högst ca 3 mg koffein per kg kroppsvikt och dag. */
export const YOUTH_CAFFEINE_MG_PER_KG = 3
/** Vikt som används för ungdomars koffeingräns om vikten är okänd (kg). */
export const YOUTH_FALLBACK_WEIGHT_KG = 50

/**
 * Koffeinriktmärke per dag: 400 mg för vuxna, 200 mg vid graviditet och amning. Under 18 år
 * (yngsta möjliga ålder) högst 3 mg per kg kroppsvikt – aldrig mer än vuxenmålet.
 */
export function caffeineMaxMg(lifeStage: LifeStage | undefined, youngAge: number | undefined, weightKg: number | undefined): number {
  const adult = lifeStage === 'gravid' || lifeStage === 'ammar' ? CAFFEINE_PREGNANT_MAX_MG : CAFFEINE_ADULT_MAX_MG
  if (youngAge === undefined || youngAge >= 18) return adult
  const kg = weightKg !== undefined && Number.isFinite(weightKg) && weightKg > 0 ? weightKg : YOUTH_FALLBACK_WEIGHT_KG
  return Math.min(adult, Math.round(YOUTH_CAFFEINE_MG_PER_KG * kg))
}

/** Ett användbart eget mål: ett ändligt tal som inte är negativt (inte NaN/null från en trasig säkerhetskopia). */
function isSet(v: number | null | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0
}

/**
 * Dagsmålen. Egna mål (`overrides`) går före de beräknade, med dessa undantag:
 * - Ett eget energimål går aldrig under golvet (`kcalOverrideFloor`) – t.ex. ett gammalt värde
 *   från en säkerhetskopia, från tiden före en graviditet eller från när vikten var högre.
 * - Ett eget koffeinmål går aldrig över riktmärket (400 mg, 200 mg vid graviditet och amning,
 *   3 mg/kg under 18 år) – ett lägre eget mål gäller som vanligt.
 * - Makrona går aldrig över energimålet: proteinet högst hela energin, sedan fettet och sist
 *   kolhydraterna som får det som blir kvar: max(0, (kcal − protein·4 − fett·9) / 4). Räcker inte
 *   energin minskas det beräknade fettet – eller, när fettet är eget, det beräknade proteinet ned
 *   till NNR:s rekommendation. Bara egna makromål (eller eget fett plus proteinrekommendationen)
 *   som själva tar mer än energimålet kan ge en summa över, liksom egna kolhydrater – det visas
 *   som en notis i Mål och makron.
 * - Ogiltiga egna värden (NaN, negativa) ignoreras.
 */
export function computeTargets(profile: Profile, weightKg: number, overrides: Partial<Targets> = {}, opts: EnergyOptions = {}): Targets {
  const today = opts.today ?? todayISO()
  const kg = positive(weightKg) ? weightKg : profile.startWeightKg
  const energy = computeEnergy(profile, kg, { ...opts, today })
  const floor = kcalOverrideFloor(profile, energy, today)
  const o = overrides
  const kcal = isSet(o.kcal) ? Math.max(o.kcal, floor.kcal) : energy.kcal
  const pct = macroPercents(profile)
  const age = ageFromBirthYear(profile.birthYear, today)

  // Protein: andelen, men minst NNR:s rekommendation per kg – aldrig mer än hela energimålet.
  const proteinMin = positive(kg) ? proteinMinG(kg, age) : 0
  let proteinG = isSet(o.proteinG) ? o.proteinG : Math.min(Math.round(Math.max((kcal * pct.protein) / 100 / 4, proteinMin)), Math.floor(kcal / 4))
  let fatG = isSet(o.fatG) ? o.fatG : Math.round((kcal * pct.fat) / 100 / 9)
  let carbsG: number
  if (isSet(o.carbsG)) {
    carbsG = o.carbsG
  } else {
    // Kolhydraterna tar det som blir kvar av energin efter protein och fett (räknat på de
    // avrundade grammen, så summan avviker högst ett halvt gram kolhydrater).
    const rest = kcal - proteinG * 4 - fatG * 9
    if (rest >= 0) {
      carbsG = Math.round(rest / 4)
    } else {
      // Räcker inte energin (t.ex. proteingolvet vid LCHF, lågt energimål och hög vikt) tas resten
      // från fettet – om det inte är ett eget mål. Är fettet eget minskas det beräknade proteinet,
      // men aldrig under NNR:s rekommendation. Makrona får aldrig överstiga energimålet.
      carbsG = 0
      if (!isSet(o.fatG)) fatG = Math.max(0, Math.floor((kcal - proteinG * 4) / 9))
      else if (!isSet(o.proteinG)) proteinG = Math.min(proteinG, Math.max(Math.round(proteinMin), Math.floor((kcal - fatG * 9) / 4)))
    }
  }

  const caffeineRule = caffeineMaxMg(profile.lifeStage, youngestAge(profile.birthYear, today), kg)
  return {
    kcal,
    proteinG,
    carbsG,
    fatG,
    fiberG: isSet(o.fiberG) ? o.fiberG : FIBER_TARGET[profile.sex],
    waterMl: isSet(o.waterMl) ? o.waterMl : waterTargetMl(profile.sex, profile.lifeStage),
    saltMaxG: isSet(o.saltMaxG) ? o.saltMaxG : 6,
    satFatMaxG: isSet(o.satFatMaxG) ? o.satFatMaxG : Math.round((kcal * 0.1) / 9),
    addedSugarMaxG: isSet(o.addedSugarMaxG) ? o.addedSugarMaxG : Math.round((kcal * 0.1) / 4),
    caffeineMaxMg: isSet(o.caffeineMaxMg) ? Math.min(o.caffeineMaxMg, caffeineRule) : caffeineRule,
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
