import { describe, expect, it } from 'vitest'
import { bmrMifflin, computeEnergy, computeTargets, estimateAdaptiveTdee, projectGoalDate, weightTrend } from './energy'
import { gramsFor, availableUnits, formatAmount } from './units'
import { addDays, isoWeek, relativeDayLabel, startOfWeek, diffDays } from './dates'
import { formatNumber, parseSwedishNumber, formatNutrient } from './format'
import { completeNutrients, sumNutrients, energyDistribution } from './nutrients'
import type { Profile, WeightEntry } from '../types'

const profile: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'stillasittande',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

describe('energi', () => {
  it('Mifflin–St Jeor', () => {
    expect(bmrMifflin('kvinna', 70, 168, 36)) .toBeCloseTo(10 * 70 + 6.25 * 168 - 5 * 36 - 161)
    expect(bmrMifflin('man', 80, 180, 30)).toBeCloseTo(800 + 1125 - 150 + 5)
  })
  it('underskott vid viktnedgång, med golv', () => {
    const e = computeEnergy(profile, 70, { today: '2026-09-26' })
    expect(e.adjustment).toBe(-550)
    expect(e.kcal).toBeGreaterThanOrEqual(1200)
    const tiny = computeEnergy({ ...profile, heightCm: 150, weeklyRateKg: 1 }, 45, { today: '2026-09-26' })
    expect(tiny.kcal).toBe(1200)
    expect(tiny.limited).toBe(true)
  })
  it('ingen viktnedgång vid graviditet', () => {
    const e = computeEnergy({ ...profile, lifeStage: 'gravid' }, 70, { today: '2026-09-26' })
    expect(e.adjustment).toBe(0)
    expect(e.lifeStageKcal).toBe(300)
    expect(e.notes.join(' ')).toMatch(/graviditet/)
  })
  it('makron summerar till energimålet', () => {
    const t = computeTargets(profile, 70, {}, { today: '2026-09-26' })
    const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9
    expect(Math.abs(kcal - t.kcal)).toBeLessThan(15)
    expect(t.fiberG).toBe(25)
    expect(t.proteinG).toBeGreaterThanOrEqual(Math.round(70 * 0.83))
  })
  it('vikttrend jämnar ut och interpolerar', () => {
    const w: WeightEntry[] = [
      { id: '1', date: '2026-09-01', kg: 80, createdAt: 0 },
      { id: '2', date: '2026-09-11', kg: 79, createdAt: 0 },
    ]
    const t = weightTrend(w)
    expect(t).toHaveLength(11)
    expect(t[0].trend).toBe(80)
    expect(t[10].trend).toBeLessThan(80)
    expect(t[10].trend).toBeGreaterThan(79)
  })
  it('adaptiv förbrukning', () => {
    const intake: Record<string, number> = {}
    const weights: WeightEntry[] = []
    for (let i = 0; i < 28; i++) {
      const d = addDays('2026-08-30', i)
      intake[d] = 2000
      if (i % 3 === 0) weights.push({ id: String(i), date: d, kg: 80 - i * (0.5 / 7), createdAt: 0 })
    }
    const est = estimateAdaptiveTdee(intake, weights, '2026-09-27')
    expect(est).not.toBeNull()
    // 0,5 kg/vecka ned ≈ 550 kcal/dag underskott → förbrukning ≈ 2 550
    expect(est!.tdee).toBeGreaterThan(2300)
    expect(est!.tdee).toBeLessThan(2700)
  })
  it('projicerar måldatum', () => {
    expect(projectGoalDate(80, -0.5, 78, '2026-09-26')).toBe('2026-10-24')
    expect(projectGoalDate(80, 0.2, 78, '2026-09-26')).toBeNull()
  })
})

describe('enheter', () => {
  const havregryn = { portions: [{ id: 'portion', label: '1 portion', grams: 40 }], density: 0.38 }
  it('räknar om svenska köksmått', () => {
    expect(gramsFor(havregryn, 2, 'dl')).toBeCloseTo(76)
    expect(gramsFor(havregryn, 1, 'msk')).toBeCloseTo(5.7)
    expect(gramsFor(havregryn, 1, 'portion:portion')).toBe(40)
    expect(gramsFor({ portions: [] }, 1, 'dl')).toBeNaN()
    expect(gramsFor({ portions: [], liquid: true }, 33, 'cl')).toBe(330)
  })
  it('listar enheter', () => {
    expect(availableUnits(havregryn)).toEqual(['portion:portion', 'g', 'dl', 'msk', 'tsk', 'krm'])
    expect(formatAmount(havregryn, 2, 'dl', true)).toBe('2 dl (76 g)')
  })
})

describe('datum', () => {
  it('ISO-veckor', () => {
    expect(isoWeek('2026-09-26')).toBe(39)
    expect(isoWeek('2027-01-01')).toBe(53)
    expect(isoWeek('2026-01-01')).toBe(1)
  })
  it('måndag först', () => {
    expect(startOfWeek('2026-09-26')).toBe('2026-09-21')
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21')
  })
  it('relativa dagar', () => {
    expect(relativeDayLabel('2026-09-26', '2026-09-26')).toBe('Idag')
    expect(relativeDayLabel('2026-09-25', '2026-09-26')).toBe('Igår')
    expect(relativeDayLabel('2026-09-22', '2026-09-26')).toBe('Tisdag 22 september')
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2) // över sommartid
  })
})

describe('format', () => {
  it('svenska tal', () => {
    expect(formatNumber(1234.56, 1).replace(/\s/g, ' ')).toBe('1 234,6')
    expect(parseSwedishNumber('1,5')).toBe(1.5)
    expect(parseSwedishNumber(' 2 ')).toBe(2)
    expect(parseSwedishNumber('½')).toBe(0.5)
    expect(parseSwedishNumber('1/4')).toBe(0.25)
    expect(parseSwedishNumber('abc')).toBeNaN()
    expect(formatNutrient('vitD', 1.234)).toBe('1,2 µg')
    expect(formatNutrient('kcal', undefined)).toBe('–')
  })
})

describe('näring', () => {
  it('okänt förblir okänt vid summering', () => {
    const s = sumNutrients([{ kcal: 100, vitD: 1 }, { kcal: 50 }])
    expect(s).toEqual({ kcal: 150, vitD: 1 })
    expect(s.iron).toBeUndefined()
  })
  it('härleder salt från natrium', () => {
    expect(completeNutrients({ sodium: 400 }).salt).toBeCloseTo(1)
  })
  it('energifördelning', () => {
    const d = energyDistribution({ protein: 25, carbs: 50, fat: 11.1 })
    expect(Math.round(d.protein + d.carbs + d.fat)).toBe(100)
  })
})
