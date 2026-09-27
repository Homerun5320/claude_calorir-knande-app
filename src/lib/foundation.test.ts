import { describe, expect, it } from 'vitest'
import { adaptiveIntake, bmrMifflin, computeEnergy, computeTargets, estimateAdaptiveTdee, projectGoalDate, weightTrend } from './energy'
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
  it('makromålen överstiger aldrig energimålet när proteingolvet slår till', () => {
    // 76 år, 110 kg, LCHF, 1 360 kcal: proteingolvet 1,2 g/kg = 132 g tar mer än kolhydraternas andel.
    const senior: Profile = { ...profile, birthYear: 1950, startWeightKg: 110, macroPreset: 'lchf' }
    const t = computeTargets(senior, 110, { kcal: 1360 }, { today: '2026-09-26' })
    expect(t.proteinG).toBe(132)
    expect(t.carbsG).toBe(0)
    const kcal = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9
    expect(kcal).toBeLessThanOrEqual(1360 + 5)
    expect(kcal).toBeGreaterThan(1360 - 10)
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
  it('upprepar aldrig gramvikten och böjer portionsord', () => {
    const food = (label: string, grams: number) => ({ portions: [{ id: 'p', label, grams }] })
    // Vikten står redan i etiketten.
    expect(formatAmount(food('1 portion (8 st, ca 160 g)', 160), 1, 'portion:p', true)).toBe('1 portion (8 st, ca 160 g)')
    expect(formatAmount(food('1 smörgås (ca 62 g)', 62), 1, 'portion:p', true)).toBe('1 smörgås (ca 62 g)')
    expect(formatAmount(food('1 skiva (osthyvel)', 10), 1, 'portion:p', true)).toBe('1 skiva (osthyvel, 10 g)')
    // Parenteser slås ihop i stället för "(2 dl) (206 g)".
    expect(formatAmount(food('1 glas (2 dl)', 206), 1, 'portion:p', true)).toBe('1 glas (2 dl, 206 g)')
    expect(formatAmount(food('1 portion (på 1 dl gryn)', 240), 1, 'portion:p', true)).toBe('1 portion (på 1 dl gryn, 240 g)')
    expect(formatAmount(food('1 kopp (1,5 dl)', 150), 1, 'portion:p', true)).toBe('1 kopp (1,5 dl, 150 g)')
    // Etiketter utan antal får inget "1 " framför.
    expect(formatAmount(food('på 1 smörgås (5 g)', 5), 1, 'portion:p', true)).toBe('på 1 smörgås (5 g)')
    expect(formatAmount(food('½ paprika', 60), 1, 'portion:p', true)).toBe('½ paprika (60 g)')
    // Flera portioner: plural, måtten per portion ersätts av totalvikten.
    expect(formatAmount(food('1 smörgås (ca 62 g)', 62), 2, 'portion:p', true)).toBe('2 smörgåsar (124 g)')
    expect(formatAmount(food('1 kopp (1,5 dl)', 150), 2, 'portion:p', true)).toBe('2 koppar (300 g)')
    expect(formatAmount(food('1 portion (okokt, 0,75 dl)', 75), 2, 'portion:p', true)).toBe('2 portioner (okokt, 150 g)')
    expect(formatAmount(food('1 liten portion (300 g)', 300), 2, 'portion:p', true)).toBe('2 små portioner (600 g)')
    expect(formatAmount(food('1 hamburgerbiff (ca 90 g)', 90), 2, 'portion:p', true)).toBe('2 hamburgerbiffar (180 g)')
    expect(formatAmount(food('1 skiva', 12), 0.5, 'portion:p', true)).toBe('½ skiva (6 g)')
    expect(formatAmount(food('1 skiva', 12), 1.5, 'portion:p', true)).toBe('1½ skivor (18 g)')
    // Okänt portionsord eller etikett utan antal: tydligt "×".
    expect(formatAmount(food('1 xyzord', 10), 3, 'portion:p', true)).toBe('3 × xyzord (30 g)')
    expect(formatAmount(food('på 1 smörgås (5 g)', 5), 2, 'portion:p', true)).toBe('2 × på 1 smörgås (10 g)')
    // Utan gram.
    expect(formatAmount(food('1 skiva', 12), 3, 'portion:p')).toBe('3 skivor')
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
    // Blandade tal får inte bli 11/2 = 5,5.
    expect(parseSwedishNumber('1 1/2')).toBe(1.5)
    expect(parseSwedishNumber('2 1/4')).toBe(2.25)
    expect(parseSwedishNumber('2 3/4')).toBe(2.75)
    expect(parseSwedishNumber('1 ½')).toBe(1.5)
    expect(parseSwedishNumber('1½')).toBe(1.5)
    expect(parseSwedishNumber('1/2')).toBe(0.5)
    // Mellanslag som tusentalsavgränsare (vanligt, fast och smalt fast mellanslag).
    expect(parseSwedishNumber('1 000')).toBe(1000)
    expect(parseSwedishNumber('1 234,5')).toBe(1234.5)
    expect(parseSwedishNumber('1\u00a0234')).toBe(1234)
    expect(parseSwedishNumber('1\u202f234')).toBe(1234)
    // Negativa tal, även med typografiskt minus.
    expect(parseSwedishNumber('-2,5')).toBe(-2.5)
    expect(parseSwedishNumber('−1')).toBe(-1)
    // Ofullständigt eller tvetydigt.
    expect(parseSwedishNumber('1 1')).toBeNaN()
    expect(parseSwedishNumber('1 1/')).toBeNaN()
    expect(parseSwedishNumber('1/0')).toBeNaN()
    expect(parseSwedishNumber('-')).toBeNaN()
    expect(parseSwedishNumber('.')).toBeNaN()
    expect(parseSwedishNumber('1.')).toBe(1)
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

describe('adaptiveIntake', () => {
  const today = '2026-09-27'
  const intake: Record<string, number> = {}
  for (let i = 1; i <= 20; i++) intake[addDays(today, -i)] = 2000 + i

  it('använder alla dagar när för få är markerade som klara', () => {
    const out = adaptiveIntake(intake, (d) => d === addDays(today, -1), today)
    expect(Object.keys(out)).toHaveLength(20)
  })

  it('använder bara klara dagar när de räcker (≥ 14)', () => {
    const complete = new Set(Array.from({ length: 15 }, (_, i) => addDays(today, -(i + 1))))
    const out = adaptiveIntake(intake, (d) => complete.has(d), today)
    expect(Object.keys(out).sort()).toEqual([...complete].sort())
  })

  it('räknar inte klara dagar med orimligt lågt intag', () => {
    const low = { ...intake }
    const complete = new Set(Array.from({ length: 14 }, (_, i) => addDays(today, -(i + 1))))
    low[addDays(today, -1)] = 300
    const out = adaptiveIntake(low, (d) => complete.has(d), today)
    expect(Object.keys(out)).toHaveLength(20)
  })
})
