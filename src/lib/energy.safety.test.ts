/**
 * Säkerhetsmatris (egenskapstester) för dagsmålet – samma funktioner som Idag (ringen), Dagbok
 * (budgeten), Mål och makron och sammanfattningen i introduktionen använder:
 * `computeEnergy` + `computeTargets` (via `useTargets`) och `kcalOverrideFloor`.
 *
 * Reglerna räknas här om oberoende av lib/energy och kontrolleras över tusentals kombinationer av
 * kön, födelseår (även 31 december), längd, vikt, trendvikt, mål, takt, målvikt, livsstadium,
 * aktivitetsnivå, egna mål (även trasiga värden från en säkerhetskopia) och adaptiv förbrukning:
 *
 * 1. Aldrig under 1 200 kcal (kvinna) / 1 500 kcal (man).
 * 2. Inget underskott vid graviditet, amning eller möjligen under 18 år – och då räknas från
 *    formeln (adaptiv förbrukning används inte).
 * 3. Inget underskott vid BMI under 18,5 (22 från 70 år) – bedömt mot både senaste vägningen och
 *    trendvikten – eller när vikten är vid/under målvikten. En lägre adaptiv förbrukning får inte
 *    sänka målet under formeln vid lågt BMI.
 * 4. Högst 1 % av kroppsvikten per vecka och högst 1 000 kcal underskott per dag.
 * 5. Egna mål (även från en säkerhetskopia) och adaptiv förbrukning bryter aldrig mot 1–4.
 * 6. Makromålen överstiger aldrig energimålet (högst avrundningen till hela gram) – utom när egna
 *    makromål (eller eget fett plus proteinrekommendationen) själva gör det, eller kolhydraterna
 *    är egna. Då visar Mål och makron en notis.
 * 7. Koffein högst 400 mg, 200 mg vid graviditet/amning och 3 mg/kg under 18 år.
 * 8. Alla mål är ändliga tal (aldrig NaN).
 */
import { describe, expect, it } from 'vitest'
import type { ActivityLevel, ExerciseEntry, GoalType, LifeStage, Profile, Sex, Targets } from '../types'
import { ACTIVITY_LEVELS } from '../types'
import { caffeineMaxMg, computeEnergy, computeTargets, kcalOverrideFloor, type EnergyOptions } from './energy'
import { dailyBudget, exerciseAddBack } from './diary'
import { STANDARD_DRINK_G, standardDrinks } from './nutrients'

// ---------------------------------------------------------------------------
// Oberoende referens för reglerna
// ---------------------------------------------------------------------------

const FLOOR: Record<Sex, number> = { kvinna: 1200, man: 1500 }
/** Dagsmålet avrundas till jämna 10 kcal – högst 5 kcal åt något håll. */
const ROUND = 5

interface Case {
  profile: Profile
  weightKg: number
  overrides: Partial<Targets>
  adaptiveTdee?: number
  trendKg?: number
  today: string
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function reference(c: Case) {
  const p = c.profile
  const year = Number(c.today.slice(0, 4))
  const ageOld = year - p.birthYear
  const young = c.today.endsWith('-12-31') ? ageOld : ageOld - 1
  const w = c.weightKg
  const h = p.heightCm
  const bmr = 10 * w + 6.25 * h - 5 * ageOld + (p.sex === 'man' ? 5 : -161)
  const formulaTdee = bmr * ACTIVITY_LEVELS[p.activityLevel].pal
  const life = p.lifeStage === 'gravid' ? 300 : p.lifeStage === 'ammar' ? 500 : 0
  const special = p.lifeStage === 'gravid' || p.lifeStage === 'ammar' || young < 18
  const trend = finite(c.trendKg) && c.trendKg > 0 ? c.trendKg : w
  const bmiOf = (kg: number) => kg / (h / 100) ** 2
  const minBmi = ageOld >= 70 ? 22 : 18.5
  const lowBmi = bmiOf(Math.min(w, trend)) < minBmi
  const target = finite(p.targetWeightKg) && p.targetWeightKg > 0 ? p.targetWeightKg : undefined
  // Målvikten bedöms mot trendvikten (samma som Idag och Vikt), inom 0,1 kg.
  const atOrBelowTarget = target !== undefined && trend <= target + 0.1
  const aboveTarget = target !== undefined && trend >= target - 0.1
  const adaptive = finite(c.adaptiveTdee) && c.adaptiveTdee > 0 ? c.adaptiveTdee : undefined
  const adaptiveUsed = !special && adaptive !== undefined && !(lowBmi && adaptive < formulaTdee)
  const maintenance = (adaptiveUsed ? (adaptive as number) : formulaTdee) + life
  const cap = Math.min(1000, (0.01 * w * 7700) / 7)
  return { ageOld, young, formulaTdee, life, special, lowBmi, atOrBelowTarget, aboveTarget, adaptiveUsed, maintenance, cap }
}

// ---------------------------------------------------------------------------
// Fall
// ---------------------------------------------------------------------------

/** Deterministisk slump (mulberry32) så att matrisen är densamma varje körning. */
function prng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEXES: Sex[] = ['kvinna', 'man']
const TODAYS = ['2026-09-27', '2026-12-31', '2026-01-01', '2026-12-30']
/** Ålder enligt årtalet: 13–19 runt 18-årsgränsen, vuxna, 69/70/71 runt BMI-gränsen och äldre. */
const AGES = [13, 15, 16, 17, 18, 19, 25, 35, 50, 64, 65, 69, 70, 71, 85, 100]
const HEIGHTS = [140, 150, 158, 165, 170, 178, 185, 195, 210]
const BMIS = [15, 17, 18.3, 18.45, 18.5, 18.55, 19, 21, 21.9, 22, 22.1, 24, 27, 32, 40, 50]
const GOALS: GoalType[] = ['ga_ner', 'behalla', 'ga_upp']
const RATES = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 3, -0.5, Number.NaN, Number.POSITIVE_INFINITY]
const TARGET_DELTAS: Array<number | undefined> = [undefined, -10, -3, -0.2, -0.05, 0, 0.05, 0.3, 3, 10]
const LIFE: LifeStage[] = ['ingen', 'gravid', 'ammar']
const ACTIVITIES = Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]
const KCAL_OVERRIDES: Array<number | undefined> = [undefined, undefined, 1, 800, 1199, 1200, 1400, 1500, 1800, 2200, 3000, 5000, Number.NaN, -500]
const ADAPTIVE: Array<number | undefined> = [undefined, undefined, 1000, 1400, 1800, 2400, 3200, 4500, Number.NaN, 0]
const TREND_DELTAS: Array<number | undefined> = [undefined, undefined, -2, -0.5, 0.5, 2, 4]

function randomCase(r: () => number): Case {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]
  const today = pick(TODAYS)
  const sex = pick(SEXES)
  const heightCm = pick(HEIGHTS)
  const bmiValue = pick(BMIS)
  const weightKg = Math.round(bmiValue * (heightCm / 100) ** 2 * 10) / 10
  const td = pick(TARGET_DELTAS)
  const tr = pick(TREND_DELTAS)
  const overrides: Partial<Targets> = {}
  const kcal = pick(KCAL_OVERRIDES)
  if (kcal !== undefined) overrides.kcal = kcal
  if (r() < 0.35) overrides.proteinG = pick([20, 60, 120, 200, 400])
  if (r() < 0.3) overrides.fatG = pick([20, 50, 90, 150])
  if (r() < 0.15) overrides.carbsG = pick([0, 100, 250, 500])
  if (r() < 0.2) overrides.caffeineMaxMg = pick([50, 150, 300, 400, 600, 2000, Number.NaN])
  if (r() < 0.1) overrides.fiberG = pick([10, 40, Number.NaN])
  if (r() < 0.1) overrides.waterMl = pick([500, 3000, Number.NaN])
  const lifeStage = sex === 'kvinna' ? pick(LIFE) : 'ingen'
  const macroPreset = pick(['nnr', 'hogprotein', 'lagkolhydrat', 'lchf', 'idrott', 'anpassad'] as const)
  return {
    today,
    weightKg,
    trendKg: tr === undefined ? undefined : Math.max(20, weightKg + tr),
    adaptiveTdee: pick(ADAPTIVE),
    overrides,
    profile: {
      sex,
      birthYear: Number(today.slice(0, 4)) - pick(AGES),
      heightCm,
      startWeightKg: weightKg,
      activityLevel: pick(ACTIVITIES),
      goal: pick(GOALS),
      weeklyRateKg: pick(RATES),
      targetWeightKg: td === undefined ? undefined : Math.max(20, Math.round((weightKg + td) * 10) / 10),
      lifeStage,
      diet: 'allatare',
      macroPreset,
      customMacroPct: macroPreset === 'anpassad' ? pick([{ protein: 20, carbs: 50, fat: 30 }, { protein: 40, carbs: 5, fat: 55 }]) : undefined,
      createdAt: 0,
    },
  }
}

function run(c: Case) {
  const opts: EnergyOptions = { today: c.today, adaptiveTdee: c.adaptiveTdee, trendKg: c.trendKg }
  const energy = computeEnergy(c.profile, c.weightKg, opts)
  const targets = computeTargets(c.profile, c.weightKg, c.overrides, opts)
  const floor = kcalOverrideFloor(c.profile, energy, c.today)
  return { energy, targets, floor }
}

/** Alla regelbrott för ett fall (tom lista = inga). */
function violations(c: Case): string[] {
  const ref = reference(c)
  const { energy, targets, floor } = run(c)
  const out: string[] = []
  const t = targets
  const fail = (rule: string, detail: string) => out.push(`${rule}: ${detail}`)

  for (const [k, v] of Object.entries(t)) if (!finite(v) || v < 0) fail('ändligt', `${k} = ${v}`)
  if (!finite(energy.kcal)) fail('ändligt', `energy.kcal = ${energy.kcal}`)
  if (!(t.kcal >= FLOOR[c.profile.sex])) fail('golv', `${t.kcal} < ${FLOOR[c.profile.sex]}`)
  if (ref.special) {
    if (!(t.kcal >= ref.formulaTdee + ref.life - ROUND)) fail('graviditet/amning/under 18', `${t.kcal} < formelns ${Math.round(ref.formulaTdee + ref.life)}`)
    if (energy.tdeeSource !== 'formel') fail('graviditet/amning/under 18', 'adaptiv förbrukning användes')
  }
  if (ref.lowBmi && !(t.kcal >= ref.formulaTdee + ref.life - ROUND)) fail('lågt BMI', `${t.kcal} < formelns ${Math.round(ref.formulaTdee + ref.life)}`)
  if ((ref.lowBmi || ref.atOrBelowTarget) && !(t.kcal >= ref.maintenance - ROUND)) fail('lågt BMI/målvikt', `${t.kcal} < underhåll ${Math.round(ref.maintenance)}`)
  if (!(t.kcal >= ref.maintenance - ref.cap - ROUND)) fail('takt/underskott', `${t.kcal} < ${Math.round(ref.maintenance - ref.cap)} (underhåll ${Math.round(ref.maintenance)}, tak ${Math.round(ref.cap)})`)
  if (energy.tdeeSource !== (ref.adaptiveUsed ? 'adaptiv' : 'formel')) fail('adaptiv', `tdeeSource ${energy.tdeeSource}, väntat ${ref.adaptiveUsed ? 'adaptiv' : 'formel'}`)
  if (Math.abs(energy.maintenanceKcal - ref.maintenance) > ROUND) fail('underhåll', `${energy.maintenanceKcal} ≠ ${Math.round(ref.maintenance)}`)
  if (!(energy.adjustment >= -ref.cap - 1)) fail('takt', `justering ${energy.adjustment} < −${Math.round(ref.cap)}`)
  // Viktuppgång: aldrig ett underskott, och högst 0,5 kg i veckan.
  if (c.profile.goal === 'ga_upp' && !(energy.adjustment >= 0 && energy.adjustment <= 550)) fail('uppgång', `justering ${energy.adjustment}`)
  if (c.profile.goal === 'behalla' && energy.adjustment !== 0) fail('behålla', `justering ${energy.adjustment}`)
  // Egna energimål: golvet som visas i Mål och makron är samma som används.
  if (!(floor.kcal >= FLOOR[c.profile.sex])) fail('golv för eget mål', `${floor.kcal}`)
  const ownKcal = finite(c.overrides.kcal) && c.overrides.kcal >= 0
  if (ownKcal && t.kcal !== Math.max(c.overrides.kcal as number, floor.kcal)) fail('eget mål', `${t.kcal} ≠ max(${c.overrides.kcal}, ${floor.kcal})`)
  if (!ownKcal && t.kcal !== energy.kcal) fail('beräknat mål', `${t.kcal} ≠ ${energy.kcal}`)
  if (!(energy.kcal >= floor.kcal)) fail('beräknat mål under golvet för eget mål', `${energy.kcal} < ${floor.kcal}`)

  // Makron
  // Egna makromål går före. Är fettet eget minskas proteinet, men aldrig under NNR:s
  // rekommendation (0,83 g/kg, 1,2 g/kg från 65 år). Bara om det som inte får minskas redan tar
  // mer än energimålet får summan bli högre (Mål och makron visar då en notis). Egna kolhydrater
  // lämnas som de är – då visar Mål och makron en notis om summan inte stämmer.
  const o = c.overrides
  const ownFat = finite(o.fatG) && o.fatG >= 0
  const proteinMin = Math.min(Math.round((ref.ageOld >= 65 ? 1.2 : 0.83) * c.weightKg), Math.floor(t.kcal / 4))
  const fixed = (finite(o.proteinG) && o.proteinG >= 0 ? o.proteinG * 4 : ownFat ? proteinMin * 4 : 0) + (ownFat ? (o.fatG as number) * 9 : 0)
  const macroKcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9
  // Avrundning till hela gram kolhydrater: högst 0,5 g × 4 kcal.
  if (!finite(o.carbsG) && fixed <= t.kcal && macroKcal > t.kcal + 2) fail('makron', `${Math.round(macroKcal)} kcal > ${t.kcal}`)
  if (!finite(o.proteinG) && !(t.proteinG >= proteinMin)) fail('protein', `${t.proteinG} g < NNR ${proteinMin} g`)

  // Koffein
  const cafMax = c.profile.lifeStage === 'gravid' || c.profile.lifeStage === 'ammar' ? 200 : 400
  if (!(t.caffeineMaxMg <= cafMax)) fail('koffein', `${t.caffeineMaxMg} > ${cafMax}`)
  if (ref.young < 18 && !(t.caffeineMaxMg <= Math.round(3 * c.weightKg))) fail('koffein under 18', `${t.caffeineMaxMg} > 3 mg/kg`)
  return out
}

function describeCase(c: Case) {
  const p = c.profile
  return JSON.stringify({
    today: c.today,
    sex: p.sex,
    birthYear: p.birthYear,
    h: p.heightCm,
    w: c.weightKg,
    trend: c.trendKg,
    goal: p.goal,
    rate: p.weeklyRateKg,
    target: p.targetWeightKg,
    life: p.lifeStage,
    act: p.activityLevel,
    preset: p.macroPreset,
    adaptive: c.adaptiveTdee,
    overrides: c.overrides,
  })
}

function collect(cases: Iterable<Case>, max = 12) {
  const found: string[] = []
  let n = 0
  for (const c of cases) {
    n++
    const v = violations(c)
    if (v.length && found.length < max) found.push(`${v.join(' | ')}\n    ${describeCase(c)}`)
  }
  return { n, found }
}

// ---------------------------------------------------------------------------
// Tester
// ---------------------------------------------------------------------------

describe('säkerhetsmatris för dagsmålet', () => {
  it('slumpade kombinationer (40 000 fall) bryter aldrig mot reglerna', () => {
    const r = prng(20260927)
    const all = Array.from({ length: 40000 }, () => randomCase(r))
    const { n, found } = collect(all)
    expect(n).toBe(40000)
    expect(found).toEqual([])
    // Matrisen prövar verkligen varje regel (inte bara lätta fall).
    const hits = { special: 0, lowBmi: 0, målvikt: 0, adaptiv: 0, adaptivSpärrad: 0, egetHöjt: 0, underskottstak: 0, golv: 0 }
    for (const c of all) {
      const ref = reference(c)
      const { energy, targets, floor } = run(c)
      if (ref.special) hits.special++
      if (ref.lowBmi) hits.lowBmi++
      if (ref.atOrBelowTarget) hits.målvikt++
      if (energy.tdeeSource === 'adaptiv') hits.adaptiv++
      if (energy.adaptiveBlocked) hits.adaptivSpärrad++
      if (Number.isFinite(c.overrides.kcal) && targets.kcal > (c.overrides.kcal as number)) hits.egetHöjt++
      if (floor.reason === 'underskott') hits.underskottstak++
      if (energy.atFloor) hits.golv++
    }
    for (const [rule, count] of Object.entries(hits)) expect({ rule, enough: count > 300 }).toEqual({ rule, enough: true })
  })

  it('fullständig korsning av livsstadium, ålder runt 18, 31 december, mål, takt och eget energimål', () => {
    const cases = (function* () {
      for (const today of ['2026-09-27', '2026-12-31'])
        for (const lifeStage of LIFE)
          for (const age of [16, 17, 18, 19])
            for (const goal of GOALS)
              for (const weeklyRateKg of [0.5, 1, 3, -1, Number.NaN])
                for (const kcal of [undefined, 1, 1200, 1500, 2000])
                  for (const adaptiveTdee of [undefined, 1000, 3000]) {
                    const profile: Profile = {
                      sex: 'kvinna',
                      birthYear: 2026 - age,
                      heightCm: 165,
                      startWeightKg: 60,
                      activityLevel: 'latt',
                      goal,
                      weeklyRateKg,
                      lifeStage,
                      diet: 'allatare',
                      macroPreset: 'nnr',
                      createdAt: 0,
                    }
                    yield { today, profile, weightKg: 60, overrides: kcal === undefined ? {} : { kcal }, adaptiveTdee }
                  }
    })()
    const { found } = collect(cases)
    expect(found).toEqual([])
  })

  it('BMI-gränserna 18,5 och 22 (från 70 år) med trend, senaste vägning, adaptiv förbrukning och eget mål', () => {
    const cases = (function* () {
      for (const sex of SEXES)
        for (const age of [40, 69, 70, 71])
          for (const bmiValue of [17, 18.4, 18.6, 21.5, 22.5])
            for (const trendDelta of [undefined, -1.5, 1.5])
              for (const goal of GOALS)
                for (const adaptiveTdee of [undefined, 1000, 1500, 3500])
                  for (const kcal of [undefined, 1200, 1500, 1700]) {
                    const heightCm = 170
                    const weightKg = Math.round(bmiValue * 1.7 * 1.7 * 10) / 10
                    const profile: Profile = {
                      sex,
                      birthYear: 2026 - age,
                      heightCm,
                      startWeightKg: weightKg,
                      activityLevel: 'stillasittande',
                      goal,
                      weeklyRateKg: 0.5,
                      lifeStage: 'ingen',
                      diet: 'allatare',
                      macroPreset: 'nnr',
                      createdAt: 0,
                    }
                    yield { today: '2026-09-27', profile, weightKg, trendKg: trendDelta === undefined ? undefined : weightKg + trendDelta, overrides: kcal === undefined ? {} : { kcal }, adaptiveTdee }
                  }
    })()
    const { found } = collect(cases)
    expect(found).toEqual([])
  })

  it('målvikten: vid, under, strax över och långt över – för alla mål och med eget mål', () => {
    const cases = (function* () {
      for (const goal of GOALS)
        for (const delta of [-5, -0.2, -0.1, 0, 0.05, 0.1, 0.2, 5])
          for (const trendDelta of [undefined, -1, 1])
            for (const kcal of [undefined, 1200, 1600, 2600]) {
              const profile: Profile = {
                sex: 'man',
                birthYear: 1980,
                heightCm: 180,
                startWeightKg: 85,
                activityLevel: 'aktiv',
                goal,
                weeklyRateKg: 0.75,
                targetWeightKg: 85 + delta,
                lifeStage: 'ingen',
                diet: 'allatare',
                macroPreset: 'hogprotein',
                createdAt: 0,
              }
              yield { today: '2026-09-27', profile, weightKg: 85, trendKg: trendDelta === undefined ? undefined : 85 + trendDelta, overrides: kcal === undefined ? {} : { kcal } }
            }
    })()
    const { found } = collect(cases)
    expect(found).toEqual([])
  })
})

describe('gränsvärden och trasiga profiler', () => {
  it('ytterligheterna som säkerhetskopian och introduktionen släpper igenom (50–272 cm, 20–400 kg, 13–120 år)', () => {
    const cases = (function* () {
      for (const sex of SEXES)
        for (const heightCm of [50, 120, 272])
          for (const weightKg of [20, 35, 150, 400])
            for (const age of [13, 18, 70, 120])
              for (const goal of GOALS)
                for (const lifeStage of sex === 'kvinna' ? LIFE : (['ingen'] as LifeStage[]))
                  for (const kcal of [undefined, 1, 6000]) {
                    const profile: Profile = {
                      sex,
                      birthYear: 2026 - age,
                      heightCm,
                      startWeightKg: weightKg,
                      activityLevel: 'mycket_aktiv',
                      goal,
                      weeklyRateKg: 1,
                      targetWeightKg: 60,
                      lifeStage,
                      diet: 'allatare',
                      macroPreset: 'lchf',
                      createdAt: 0,
                    }
                    yield { today: '2026-09-27', profile, weightKg, overrides: kcal === undefined ? {} : { kcal }, adaptiveTdee: 1000 }
                  }
    })()
    const { found } = collect(cases)
    expect(found).toEqual([])
  })

  it('ogiltiga värden i profilen eller vikten ger aldrig NaN och aldrig under golvet', () => {
    const profile: Profile = {
      sex: 'kvinna',
      birthYear: 1990,
      heightCm: 165,
      startWeightKg: 62,
      activityLevel: 'latt',
      goal: 'ga_ner',
      weeklyRateKg: 0.5,
      lifeStage: 'ingen',
      diet: 'allatare',
      macroPreset: 'nnr',
      createdAt: 0,
    }
    const broken: Array<[Partial<Profile>, number]> = [
      [{}, Number.NaN],
      [{}, 0],
      [{}, -70],
      [{ birthYear: Number.NaN }, 62],
      [{ heightCm: Number.NaN }, 62],
      [{ activityLevel: 'okänd' as ActivityLevel }, 62],
      [{ macroPreset: 'anpassad', customMacroPct: { protein: Number.NaN, carbs: 50, fat: 30 } }, 62],
      [{ macroPreset: 'okänd' as Profile['macroPreset'] }, 62],
      [{ weeklyRateKg: Number.NaN, targetWeightKg: Number.NaN }, 62],
    ]
    for (const [patch, kg] of broken) {
      const p = { ...profile, ...patch }
      const e = computeEnergy(p, kg, { today: '2026-09-27', trendKg: Number.NaN, adaptiveTdee: Number.NaN })
      const t = computeTargets(p, kg, { kcal: Number.NaN }, { today: '2026-09-27' })
      for (const v of [e.kcal, e.overrideFloor.kcal, ...Object.values(t)]) expect(Number.isFinite(v)).toBe(true)
      expect(t.kcal).toBeGreaterThanOrEqual(1200)
      expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeLessThanOrEqual(t.kcal + 2)
    }
    // Ett okänt födelseår räknas inte som vuxen: ingen viktnedgång.
    expect(computeEnergy({ ...profile, birthYear: Number.NaN }, 62, { today: '2026-09-27' }).adjustment).toBe(0)
    // En ogiltig vikt ersätts med startvikten.
    expect(computeEnergy(profile, Number.NaN, { today: '2026-09-27' }).kcal).toBe(computeEnergy(profile, 62, { today: '2026-09-27' }).kcal)
  })
})

describe('konkreta fall som tidigare bröt mot reglerna', () => {
  const adult: Profile = {
    sex: 'kvinna',
    birthYear: 1990,
    heightCm: 168,
    startWeightKg: 76,
    activityLevel: 'latt',
    goal: 'ga_ner',
    weeklyRateKg: 0.5,
    lifeStage: 'ingen',
    diet: 'allatare',
    macroPreset: 'nnr',
    createdAt: 0,
  }
  const TODAY = '2026-09-27'

  it('negativ takt för viktuppgång ger aldrig ett underskott – inte heller under graviditet', () => {
    const e = computeEnergy({ ...adult, goal: 'ga_upp', weeklyRateKg: -1, lifeStage: 'gravid' }, 76, { today: TODAY })
    expect(e.adjustment).toBe(0)
    expect(e.kcal).toBe(e.maintenanceKcal)
  })

  it('en ogiltig takt (NaN) ger aldrig NaN som dagsmål', () => {
    const e = computeEnergy({ ...adult, weeklyRateKg: Number.NaN }, 76, { today: TODAY })
    expect(Number.isFinite(e.kcal)).toBe(true)
    expect(e.kcal).toBeGreaterThanOrEqual(1200)
    expect(computeTargets({ ...adult, weeklyRateKg: Number.NaN }, 76, {}, { today: TODAY }).kcal).toBe(e.kcal)
  })

  it('senaste vägningen under BMI 18,5 pausar underskottet även om trendvikten släpar efter', () => {
    // 168 cm: BMI 18,5 ≈ 52,2 kg. Senaste vägningen 51,5 kg, trenden 53 kg.
    const e = computeEnergy(adult, 51.5, { today: TODAY, trendKg: 53 })
    expect(e.goalPause).toBe('lowBmi')
    expect(e.adjustment).toBe(0)
  })

  it('vid lågt BMI sänker en lägre adaptiv förbrukning aldrig målet under formeln', () => {
    const p = { ...adult, goal: 'behalla' as const }
    const formula = computeEnergy(p, 50, { today: TODAY })
    const e = computeEnergy(p, 50, { today: TODAY, adaptiveTdee: 1200 })
    expect(e.tdeeSource).toBe('formel')
    expect(e.kcal).toBe(formula.kcal)
    expect(e.notes.join(' ')).toMatch(/formeln/)
    // En högre uppmätt förbrukning används som vanligt.
    expect(computeEnergy(p, 50, { today: TODAY, adaptiveTdee: 2400 }).tdeeSource).toBe('adaptiv')
  })

  it('ett eget energimål ger aldrig ett underskott vid lågt BMI eller nådd målvikt', () => {
    const low = computeTargets(adult, 50, { kcal: 1200 }, { today: TODAY })
    expect(low.kcal).toBe(computeEnergy({ ...adult, goal: 'behalla' }, 50, { today: TODAY }).kcal)
    expect(kcalOverrideFloor(adult, computeEnergy(adult, 50, { today: TODAY }), TODAY).reason).toBe('lagtBmi')
    const reached = { ...adult, targetWeightKg: 70 }
    const t = computeTargets(reached, 69, { kcal: 1300 }, { today: TODAY })
    expect(t.kcal).toBe(computeEnergy({ ...reached, goal: 'behalla' }, 69, { today: TODAY }).kcal)
    expect(kcalOverrideFloor(reached, computeEnergy(reached, 69, { today: TODAY }), TODAY).reason).toBe('malvikt')
  })

  it('ett eget energimål ger aldrig mer än 1 % av vikten per vecka eller 1 000 kcal underskott per dag', () => {
    // 76 kg, underhåll ≈ 2 280 kcal: högst 836 kcal underskott → lägst 1 440 kcal.
    const e = computeEnergy(adult, 76, { today: TODAY })
    const t = computeTargets(adult, 76, { kcal: 1200 }, { today: TODAY })
    expect(t.kcal).toBe(Math.round((e.maintenanceKcal - 836) / 10) * 10)
    expect(kcalOverrideFloor(adult, e, TODAY).reason).toBe('underskott')
    // En stor man: underskottet stannar vid 1 000 kcal.
    const man: Profile = { ...adult, sex: 'man', heightCm: 190, startWeightKg: 130, activityLevel: 'aktiv' }
    const em = computeEnergy(man, 130, { today: TODAY })
    expect(computeTargets(man, 130, { kcal: 1500 }, { today: TODAY }).kcal).toBe(em.maintenanceKcal - 1000)
    // Ett rimligt eget mål lämnas som det är.
    expect(computeTargets(adult, 76, { kcal: 1800 }, { today: TODAY }).kcal).toBe(1800)
  })

  it('egna koffeinmål över riktmärket (t.ex. från en säkerhetskopia) används aldrig', () => {
    expect(computeTargets(adult, 76, { caffeineMaxMg: 2000 }, { today: TODAY }).caffeineMaxMg).toBe(400)
    expect(computeTargets({ ...adult, lifeStage: 'gravid' }, 76, { caffeineMaxMg: 400 }, { today: TODAY }).caffeineMaxMg).toBe(200)
    expect(computeTargets({ ...adult, lifeStage: 'ammar' }, 76, { caffeineMaxMg: 150 }, { today: TODAY }).caffeineMaxMg).toBe(150)
    expect(computeTargets({ ...adult, birthYear: 2010 }, 50, { caffeineMaxMg: 400 }, { today: TODAY }).caffeineMaxMg).toBe(150)
    expect(computeTargets(adult, 76, { caffeineMaxMg: Number.NaN }, { today: TODAY }).caffeineMaxMg).toBe(400)
  })

  it('trasiga egna mål (NaN) ersätts med de beräknade', () => {
    const plain = computeTargets(adult, 76, {}, { today: TODAY })
    const broken = computeTargets(adult, 76, { kcal: Number.NaN, proteinG: Number.NaN, fatG: Number.NaN, fiberG: Number.NaN, waterMl: Number.NaN, saltMaxG: Number.NaN }, { today: TODAY })
    expect(broken).toEqual(plain)
  })

  it('proteingolvet tar aldrig mer än hela energimålet', () => {
    // 250 kg, 80 år: proteingolvet 1,2 g/kg = 300 g (1 200 kcal) – LCHF och lågt eget mål.
    const heavy: Profile = { ...adult, birthYear: 1946, heightCm: 150, startWeightKg: 250, activityLevel: 'stillasittande', goal: 'behalla', macroPreset: 'lchf' }
    const t = computeTargets(heavy, 250, { kcal: 1200 }, { today: TODAY })
    expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeLessThanOrEqual(t.kcal + 2)
  })
})

describe('träning räknas aldrig två gånger', () => {
  it('adaptiv förbrukning utan eget energimål: ingen träning läggs till budgeten', () => {
    expect(exerciseAddBack(100, 'adaptiv', false)).toEqual({ pct: 0, includedInTarget: true })
    const run30: ExerciseEntry = { id: 'x', date: '2026-09-27', activityId: 'lopning', name: 'Löpning', minutes: 30, kcal: 300, createdAt: 0 }
    expect(dailyBudget(2000, [run30], exerciseAddBack(100, 'adaptiv', false).pct)).toBe(2000)
    expect(dailyBudget(2000, [run30], exerciseAddBack(50, 'formel', false).pct)).toBe(2150)
  })
  it('formeln: träningen läggs till enligt inställningen', () => {
    expect(exerciseAddBack(50, 'formel', false)).toEqual({ pct: 50, includedInTarget: false })
  })
})

describe('alkohol', () => {
  it('ett standardglas är 12 g alkohol', () => {
    expect(STANDARD_DRINK_G).toBe(12)
    expect(standardDrinks({ alcohol: 24 })).toBe(2)
    expect(standardDrinks({})).toBe(0)
  })
})

describe('koffeinriktmärket', () => {
  it('400 mg, 200 mg vid graviditet/amning och högst 3 mg/kg under 18 år', () => {
    expect(caffeineMaxMg('ingen', 30, 70)).toBe(400)
    expect(caffeineMaxMg('gravid', 30, 70)).toBe(200)
    expect(caffeineMaxMg('ammar', 30, 70)).toBe(200)
    expect(caffeineMaxMg('ingen', 16, 40)).toBe(120)
    expect(caffeineMaxMg('ingen', 17, Number.NaN)).toBe(150)
  })
})
