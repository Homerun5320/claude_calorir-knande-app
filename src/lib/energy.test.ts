/**
 * Säkerhetsmatris för dagsmålen: graviditet, amning, ålder (16/17/18), BMI-gränser (18,5 och 22
 * från 70 år), nådd målvikt, adaptiv förbrukning, golv för egna energimål, egna makron och koffein.
 */
import { describe, expect, it } from 'vitest'
import type { Profile } from '../types'
import {
  adaptiveBlockReason,
  adaptiveBlockReasonFor,
  caffeineMaxMg,
  computeEnergy,
  computeTargets,
  goalPause,
  goalPauseNote,
  kcalFloorReasonText,
  kcalOverrideFloor,
  minHealthyBmi,
  MIN_KCAL,
  youngestAge,
} from './energy'

const TODAY = '2026-09-27'

const base: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 170,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

const energy = (p: Partial<Profile>, kg = 70, opts: { adaptiveTdee?: number; trendKg?: number; today?: string } = {}) =>
  computeEnergy({ ...base, ...p }, kg, { today: TODAY, ...opts })

/** Vikten som ger ett visst BMI vid 170 cm. */
const kgForBmi = (v: number) => v * 1.7 * 1.7

describe('youngestAge', () => {
  it('räknar med att födelsedagen kan vara kvar i år – utom den 31 december', () => {
    expect(youngestAge(2008, TODAY)).toBe(17)
    expect(youngestAge(2008, '2026-12-31')).toBe(18)
    expect(youngestAge(2008, '2026-01-01')).toBe(17)
    expect(youngestAge(1990, TODAY)).toBe(35)
  })
})

describe('computeEnergy – viktnedgång som inte rekommenderas', () => {
  it('vanlig vuxen: underskott enligt vald takt', () => {
    const e = energy({})
    expect(e.goal).toBe('ga_ner')
    expect(e.goalPause).toBeNull()
    expect(e.adjustment).toBe(-550)
  })

  it('graviditet: behålla vikten, +300 kcal och en förklaring', () => {
    const e = energy({ lifeStage: 'gravid' })
    expect(e.goal).toBe('behalla')
    expect(e.goalPause).toBe('gravid')
    expect(e.adjustment).toBe(0)
    expect(e.lifeStageKcal).toBe(300)
    expect(e.kcal).toBe(e.maintenanceKcal)
    expect(e.notes.join(' ')).toMatch(/graviditet och amning rekommenderas inte viktnedgång/)
  })

  it('amning: behålla vikten och +500 kcal', () => {
    const e = energy({ lifeStage: 'ammar' })
    expect(e.goalPause).toBe('ammar')
    expect(e.adjustment).toBe(0)
    expect(e.lifeStageKcal).toBe(500)
  })

  it('ålder 16, 17 och 18 enligt årtalet räknas försiktigt som under 18', () => {
    expect(energy({ birthYear: 2010 }).goalPause).toBe('under18') // 16 (kanske 15)
    expect(energy({ birthYear: 2009 }).goalPause).toBe('under18') // 17 (kanske 16)
    expect(energy({ birthYear: 2008 }).goalPause).toBe('under18') // 18 enligt årtalet, kanske 17
    expect(energy({ birthYear: 2008 }).notes.join(' ')).toMatch(/Under 18 år rekommenderas inte kaloriunderskott/)
    // Den 31 december har alla födda 2008 fyllt 18.
    expect(energy({ birthYear: 2008 }, 70, { today: '2026-12-31' }).goalPause).toBeNull()
    expect(energy({ birthYear: 2007 }).goalPause).toBeNull()
  })

  it('BMI 18,4 pausar viktnedgången, BMI 18,6 gör det inte', () => {
    const low = energy({}, kgForBmi(18.4))
    expect(low.goalPause).toBe('lowBmi')
    expect(low.goal).toBe('behalla')
    expect(low.adjustment).toBe(0)
    expect(low.notes.join(' ')).toMatch(/under det som räknas som hälsosamt för din längd/)
    const ok = energy({}, kgForBmi(18.6))
    expect(ok.goalPause).toBeNull()
    expect(ok.adjustment).toBeLessThan(0)
  })

  it('från 70 år gäller BMI 22: BMI 21 pausar vid 70 men inte vid 69', () => {
    const kg = kgForBmi(21)
    const seventy = energy({ birthYear: 1956 }, kg)
    expect(seventy.goalPause).toBe('lowBmi')
    expect(seventy.notes.join(' ')).toMatch(/för din längd och ålder/)
    expect(energy({ birthYear: 1957 }, kg).goalPause).toBeNull()
    expect(minHealthyBmi(70)).toBe(22)
    expect(minHealthyBmi(69)).toBe(18.5)
  })

  it('vikt vid eller under målvikten: behålla vikten', () => {
    expect(energy({ targetWeightKg: 65 }, 65).goalPause).toBe('reached')
    expect(energy({ targetWeightKg: 65 }, 64).goalPause).toBe('reached')
    expect(energy({ targetWeightKg: 65 }, 65.05).goalPause).toBe('reached') // inom 0,1 kg
    const on = energy({ targetWeightKg: 65 }, 65.5)
    expect(on.goalPause).toBeNull()
    expect(on.adjustment).toBe(-550)
    const reached = energy({ targetWeightKg: 65 }, 64)
    expect(reached.adjustment).toBe(0)
    expect(reached.notes.join(' ')).toMatch(/Du har nått din målvikt/)
  })

  it('gå upp i vikt: behålla vikten när målvikten är nådd', () => {
    expect(energy({ goal: 'ga_upp', targetWeightKg: 70 }, 70).goalPause).toBe('reached')
    expect(energy({ goal: 'ga_upp', targetWeightKg: 70 }, 71).goal).toBe('behalla')
    const gaining = energy({ goal: 'ga_upp', targetWeightKg: 70 }, 69)
    expect(gaining.goalPause).toBeNull()
    expect(gaining.adjustment).toBeGreaterThan(0)
    // Utan målvikt fortsätter uppgången, och låg vikt pausar aldrig en uppgång.
    expect(energy({ goal: 'ga_upp' }, kgForBmi(17)).goalPause).toBeNull()
  })

  it('bedömer målet mot trendvikten när den finns (samma som Idag och Vikt)', () => {
    // Senaste vägningen är under målet men trenden inte – en enskild dag avgör inte.
    expect(energy({ targetWeightKg: 65 }, 64.8, { trendKg: 65.6 }).goalPause).toBeNull()
    expect(energy({ targetWeightKg: 65 }, 65.8, { trendKg: 64.9 }).goalPause).toBe('reached')
  })

  it('golvet höjer målet och flaggas', () => {
    const e = computeEnergy({ ...base, heightCm: 150, activityLevel: 'stillasittande', birthYear: 1950, weeklyRateKg: 0.75 }, 60, { today: TODAY })
    expect(e.kcal).toBe(MIN_KCAL.kvinna)
    expect(e.atFloor).toBe(true)
    expect(energy({}).atFloor).toBe(false)
  })
})

describe('adaptiv förbrukning', () => {
  it('används för vuxna', () => {
    const e = energy({ goal: 'behalla' }, 70, { adaptiveTdee: 2600 })
    expect(e.tdeeSource).toBe('adaptiv')
    expect(e.tdee).toBe(2600)
    expect(e.adaptiveBlocked).toBeNull()
  })

  it('ignoreras vid graviditet, amning och under 18 år – formeln används', () => {
    const formula = energy({ goal: 'behalla', lifeStage: 'gravid' }).tdee
    for (const p of [{ lifeStage: 'gravid' as const }, { lifeStage: 'ammar' as const }, { birthYear: 2008 }]) {
      const e = energy({ goal: 'behalla', ...p }, 70, { adaptiveTdee: 1500 })
      expect(e.tdeeSource).toBe('formel')
      expect(e.adaptiveBlocked).toMatch(/används formeln/)
      expect(e.notes).toContain(e.adaptiveBlocked)
    }
    expect(energy({ goal: 'behalla', lifeStage: 'gravid' }, 70, { adaptiveTdee: 1500 }).tdee).toBe(formula)
  })

  it('adaptiveBlockReason följer samma regler', () => {
    expect(adaptiveBlockReason('gravid', 30)).toMatch(/graviditeten/)
    expect(adaptiveBlockReason('ammar', 30)).toMatch(/amningen/)
    expect(adaptiveBlockReason('ingen', 17)).toMatch(/uppväxten/)
    expect(adaptiveBlockReason('ingen', 18)).toBeNull()
    expect(adaptiveBlockReasonFor({ lifeStage: 'ingen', birthYear: 2008 }, TODAY)).toMatch(/uppväxten/)
    expect(adaptiveBlockReasonFor({ lifeStage: 'ingen', birthYear: 2007 }, TODAY)).toBeNull()
  })
})

describe('goalPause', () => {
  const check = { goal: 'ga_ner' as const, lifeStage: 'ingen' as const, youngestAge: 35, age: 35, heightCm: 170, weightKg: 70, targetWeightKg: 65 }
  it('säkerheten går före nådd målvikt', () => {
    expect(goalPause({ ...check, weightKg: kgForBmi(18), targetWeightKg: 52 })).toBe('lowBmi')
    expect(goalPause({ ...check, lifeStage: 'gravid', weightKg: 60 })).toBe('gravid')
    expect(goalPause({ ...check, goal: 'behalla', weightKg: 60 })).toBeNull()
    expect(goalPause({ ...check, heightCm: undefined, weightKg: 40, targetWeightKg: undefined })).toBeNull()
  })
  it('har texter på svenska', () => {
    expect(goalPauseNote('lowBmi', 40)).toMatch(/för din längd,/)
    expect(goalPauseNote('lowBmi', 75)).toMatch(/för din längd och ålder/)
    expect(goalPauseNote('reached')).toMatch(/behålla vikten/)
  })
})

describe('computeTargets – egna energimål går aldrig under golvet', () => {
  it('kvinnor 1 200 kcal och män 1 500 kcal', () => {
    // Stillasittande och kortare: här är det säkerhetsgolvet som gäller (inte underskottstaket).
    const small: Profile = { ...base, heightCm: 160, activityLevel: 'stillasittande' }
    expect(computeTargets(small, 55, { kcal: 900 }, { today: TODAY }).kcal).toBe(1200)
    expect(kcalOverrideFloor(small, computeEnergy(small, 55, { today: TODAY }), TODAY)).toEqual({ kcal: 1200, reason: 'golv' })
    expect(computeTargets({ ...small, sex: 'man', heightCm: 170 }, 65, { kcal: 1300 }, { today: TODAY }).kcal).toBe(1500)
    expect(computeTargets(small, 55, { kcal: 1400 }, { today: TODAY }).kcal).toBe(1400)
  })

  it('högst 1 % av vikten per vecka och högst 1 000 kcal underskott per dag – även för egna mål', () => {
    // 70 kg, underhåll ≈ 2 200 kcal: högst 770 kcal underskott.
    const e = computeEnergy(base, 70, { today: TODAY })
    const floor = kcalOverrideFloor(base, e, TODAY)
    expect(floor.reason).toBe('underskott')
    expect(floor.kcal).toBe(Math.round((e.maintenanceKcal - 770) / 10) * 10)
    expect(computeTargets(base, 70, { kcal: 900 }, { today: TODAY }).kcal).toBe(floor.kcal)
    // Lagoms eget mål ligger aldrig under golvet för egna mål.
    expect(computeEnergy({ ...base, weeklyRateKg: 1 }, 70, { today: TODAY }).kcal).toBeGreaterThanOrEqual(floor.kcal)
  })

  it('viktuppgång under målvikten: ett eget energimål blir aldrig ett underskott', () => {
    const p: Profile = { ...base, goal: 'ga_upp', targetWeightKg: 75 }
    const e = computeEnergy(p, 70, { today: TODAY })
    expect(kcalOverrideFloor(p, e, TODAY)).toEqual({ kcal: e.maintenanceKcal, reason: 'malvikt' })
    expect(computeTargets(p, 70, { kcal: 1500 }, { today: TODAY }).kcal).toBe(e.maintenanceKcal)
  })

  it('förklarar varje golv på svenska', () => {
    for (const reason of ['golv', 'gravid', 'ammar', 'ung', 'lagtBmi', 'malvikt', 'underskott'] as const) {
      expect(kcalFloorReasonText(reason)).toMatch(/[a-zåäö].*\.$/)
    }
    expect(kcalFloorReasonText('underskott')).toMatch(/högst 1 % av din vikt/)
  })

  it('graviditet, amning och under 18 år: aldrig under formelns förbrukning plus tillägget', () => {
    for (const p of [{ lifeStage: 'gravid' as const }, { lifeStage: 'ammar' as const }, { birthYear: 2009 }]) {
      const profile = { ...base, ...p }
      const e = computeEnergy(profile, 70, { today: TODAY })
      const t = computeTargets(profile, 70, { kcal: 1300 }, { today: TODAY })
      expect(t.kcal).toBe(e.maintenanceKcal)
      expect(t.kcal).toBeGreaterThanOrEqual(e.tdee + e.lifeStageKcal - 5)
      expect(kcalOverrideFloor(profile, e, TODAY).kcal).toBe(t.kcal)
    }
  })

  it('golvet bygger på formeln även om en adaptiv förbrukning skickas med', () => {
    const profile = { ...base, lifeStage: 'gravid' as const }
    const formula = computeTargets(profile, 70, { kcal: 1300 }, { today: TODAY }).kcal
    expect(computeTargets(profile, 70, { kcal: 1300 }, { today: TODAY, adaptiveTdee: 1400 }).kcal).toBe(formula)
  })

  it('ignorerar ogiltiga värden från t.ex. en trasig säkerhetskopia', () => {
    const e = computeEnergy(base, 70, { today: TODAY })
    expect(computeTargets(base, 70, { kcal: Number.NaN }, { today: TODAY }).kcal).toBe(e.kcal)
  })
})

describe('computeTargets – egna makron', () => {
  const macroKcal = (t: { proteinG: number; carbsG: number; fatG: number }) => t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9

  it('eget protein: kolhydraterna får resten av energin', () => {
    const t = computeTargets(base, 70, { kcal: 1800, proteinG: 150 }, { today: TODAY })
    expect(t.proteinG).toBe(150)
    expect(t.fatG).toBe(64) // 32 E%
    expect(t.carbsG).toBe(Math.round((1800 - 150 * 4 - 64 * 9) / 4))
    expect(Math.abs(macroKcal(t) - 1800)).toBeLessThan(8)
  })

  it('eget fett: kolhydraterna får resten av energin', () => {
    const t = computeTargets(base, 70, { kcal: 2000, fatG: 100 }, { today: TODAY })
    expect(t.fatG).toBe(100)
    expect(Math.abs(macroKcal(t) - 2000)).toBeLessThan(8)
  })

  it('eget protein och fett som tar hela energin: kolhydraterna blir 0, aldrig negativa', () => {
    const t = computeTargets(base, 70, { kcal: 1500, proteinG: 200, fatG: 90 }, { today: TODAY })
    expect(t.carbsG).toBe(0)
    expect(t.proteinG).toBe(200)
    expect(t.fatG).toBe(90)
  })

  it('egna kolhydrater lämnas som de är', () => {
    const t = computeTargets(base, 70, { kcal: 1800, proteinG: 120, carbsG: 225 }, { today: TODAY })
    expect(t.carbsG).toBe(225)
    expect(t.proteinG).toBe(120)
  })

  it('utan egna makron går makrona jämnt upp med energimålet', () => {
    const t = computeTargets(base, 70, {}, { today: TODAY })
    expect(Math.abs(macroKcal(t) - t.kcal)).toBeLessThan(15)
  })
})

describe('koffein (EFSA)', () => {
  it('400 mg för vuxna, 200 mg vid graviditet och amning, 3 mg/kg under 18 år', () => {
    expect(caffeineMaxMg('ingen', 35, 70)).toBe(400)
    expect(caffeineMaxMg('gravid', 30, 70)).toBe(200)
    expect(caffeineMaxMg('ammar', 30, 70)).toBe(200)
    expect(caffeineMaxMg('ingen', 15, 55)).toBe(165)
    expect(caffeineMaxMg('ingen', 17, 150)).toBe(400)
    expect(caffeineMaxMg('gravid', 17, 80)).toBe(200)
    expect(caffeineMaxMg('ingen', 16, undefined)).toBe(150)
  })

  it('dagsmålen använder samma regel, med försiktig ålder', () => {
    expect(computeTargets(base, 70, {}, { today: TODAY }).caffeineMaxMg).toBe(400)
    expect(computeTargets({ ...base, lifeStage: 'gravid' }, 70, {}, { today: TODAY }).caffeineMaxMg).toBe(200)
    // Född 2008: 18 enligt årtalet men kanske 17 → 3 mg/kg × 55 kg.
    expect(computeTargets({ ...base, birthYear: 2008, goal: 'behalla' }, 55, {}, { today: TODAY }).caffeineMaxMg).toBe(165)
    expect(computeTargets({ ...base, birthYear: 2008 }, 55, { caffeineMaxMg: 100 }, { today: TODAY }).caffeineMaxMg).toBe(100)
  })
})
