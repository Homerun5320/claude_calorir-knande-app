import { addDays } from '../../lib/dates'
import type { DiaryEntry, MeasurementEntry, WeightEntry } from '../../types'
import {
  adaptiveNeeds,
  adaptiveProgress,
  bodyOverview,
  chartWindow,
  compareTdeeText,
  directionOf,
  formatSigned,
  formatSignedKg,
  goalDateLabel,
  goalProgress,
  goalStatus,
  goodDirection,
  groupWeightsByMonth,
  hasAnyMeasure,
  intakeByDay,
  joinSv,
  latestMeasure,
  measurementRows,
  measureSeries,
  profileStartDate,
  trendAt,
  trendChange,
  trendSeries,
  trendWord,
  usedMeasureKeys,
  waistToHeight,
  weeklyRate,
  weighInDiffs,
  whtrCategory,
} from './bodyLogic'

const w = (date: string, kg: number, id = `w_${date}`): WeightEntry => ({ id, date, kg, createdAt: 0 })

/** En vägning per dag, linjär förändring `perDay` kg från `startKg`. */
function linearWeights(start: string, days: number, startKg: number, perDay: number, every = 1): WeightEntry[] {
  const out: WeightEntry[] = []
  for (let i = 0; i < days; i += every) out.push(w(addDays(start, i), startKg + perDay * i))
  return out
}

describe('formatSignedKg', () => {
  it('använder typografiskt minus, decimalkomma och ±0', () => {
    expect(formatSignedKg(-0.42)).toBe('−0,4 kg')
    expect(formatSignedKg(1.25)).toBe('+1,3 kg')
    expect(formatSignedKg(0.01)).toBe('±0 kg')
    expect(formatSignedKg(-0.04)).toBe('±0 kg')
    expect(formatSignedKg(-1.5, 1, 'cm')).toBe('−1,5 cm')
    expect(formatSignedKg(Number.NaN)).toBe('–')
    expect(formatSigned(-0.354, 2)).toBe('−0,35')
    expect(formatSigned(0.001, 2)).toBe('±0')
  })
})

describe('directionOf och trendWord', () => {
  it('räknar små förändringar som stabila', () => {
    expect(directionOf(0.03)).toBe('flat')
    expect(directionOf(-0.3)).toBe('down')
    expect(directionOf(0.2)).toBe('up')
  })
  it('ger kvalitativa ord utan siffror', () => {
    expect(trendWord(undefined)).toBe('För tidigt att säga')
    expect(trendWord(0.05)).toBe('Stabil')
    expect(trendWord(-0.2)).toBe('Svagt nedåtgående')
    expect(trendWord(0.6)).toBe('Uppåtgående')
  })
})

describe('goodDirection', () => {
  it('följer målet men saknar önskad riktning vid graviditet och under 18', () => {
    expect(goodDirection('ga_ner', 'ingen', 30)).toBe('down')
    expect(goodDirection('ga_upp', 'ingen', 30)).toBe('up')
    expect(goodDirection('behalla', 'ingen', 30)).toBeUndefined()
    expect(goodDirection('ga_ner', 'gravid', 30)).toBeUndefined()
    expect(goodDirection('ga_ner', 'ingen', 16)).toBeUndefined()
  })
})

describe('trendserie och förändring över N dagar', () => {
  it('förlänger serien till idag och slår upp värden per datum', () => {
    const pts = trendSeries([w('2026-09-01', 80), w('2026-09-03', 79)], '2026-09-10')
    expect(pts[0].date).toBe('2026-09-01')
    expect(pts[pts.length - 1].date).toBe('2026-09-10')
    expect(pts).toHaveLength(10)
    expect(trendAt(pts, '2026-09-01')).toBe(80)
    expect(trendAt(pts, '2026-08-31')).toBeUndefined()
    expect(trendAt(pts, '2026-09-11')).toBeUndefined()
  })

  it('ger undefined när historiken är kortare än perioden', () => {
    const pts = trendSeries(linearWeights('2026-09-01', 5, 80, -0.1))
    expect(trendChange(pts, 7)).toBeUndefined()
    expect(trendChange(pts, 3)).toBeLessThan(0)
  })

  it('mäter trendens förändring – nedåt vid stadig viktnedgång', () => {
    const pts = trendSeries(linearWeights('2026-06-01', 90, 85, -0.05))
    const week = trendChange(pts, 7)!
    const month = trendChange(pts, 30)!
    // Efter insvängning följer trenden lutningen: ca −0,35 kg/vecka och −1,5 kg/30 dagar.
    expect(week).toBeCloseTo(-0.35, 1)
    expect(month).toBeCloseTo(-1.5, 1)
  })

  it('en enstaka tung dag slår bara igenom med en tiondel', () => {
    const base = linearWeights('2026-09-01', 20, 75, 0)
    const spiked = [...base.slice(0, -1), w(base[base.length - 1].date, 77)]
    const pts = trendSeries(spiked)
    expect(pts[pts.length - 1].trend).toBeCloseTo(75.2, 5)
  })
})

describe('weeklyRate', () => {
  it('skattar takten i kg per vecka', () => {
    const weights = linearWeights('2026-06-01', 100, 85, -0.05, 2)
    const rate = weeklyRate(weights, '2026-09-08')!
    expect(rate).not.toBeNull()
    expect(rate.kgPerWeek).toBeCloseTo(-0.35, 1)
    expect(rate.weighIns).toBeGreaterThanOrEqual(3)
  })

  it('kräver minst tre vägningar över minst tio dagar', () => {
    expect(weeklyRate([w('2026-09-01', 80), w('2026-09-20', 79)], '2026-09-20')).toBeNull()
    expect(weeklyRate(linearWeights('2026-09-10', 5, 80, -0.1), '2026-09-15')).toBeNull()
  })

  it('bygger ingen prognos på gamla vägningar', () => {
    const weights = linearWeights('2026-05-01', 40, 85, -0.05)
    expect(weeklyRate(weights, '2026-09-26')).toBeNull()
  })
})

describe('goalProgress', () => {
  it('räknar andel av vägen i båda riktningar och begränsar till 0–1', () => {
    expect(goalProgress(80, 76, 72)).toBeCloseTo(0.5)
    expect(goalProgress(60, 63, 66)).toBeCloseTo(0.5)
    expect(goalProgress(80, 82, 72)).toBe(0)
    expect(goalProgress(80, 70, 72)).toBe(1)
    expect(goalProgress(70, 70, 70)).toBeUndefined()
  })
})

describe('goalStatus', () => {
  const base = {
    goal: 'ga_ner' as const,
    targetKg: 68,
    trendKg: 72,
    lifeStage: 'ingen' as const,
    age: 35,
    today: '2026-09-26',
  }

  it('ger ett prognosdatum när trenden går mot målet', () => {
    const s = goalStatus({ ...base, rate: { kgPerWeek: -0.5, spanDays: 28, weighIns: 12 } })
    expect(s).toEqual({ kind: 'projected', date: '2026-11-21', weeks: 8 })
  })

  it('är lugn när trenden står still eller går åt andra hållet', () => {
    expect(goalStatus({ ...base, rate: { kgPerWeek: 0.2, spanDays: 28, weighIns: 12 } }).kind).toBe('steady')
    expect(goalStatus({ ...base, rate: { kgPerWeek: -0.01, spanDays: 28, weighIns: 12 } }).kind).toBe('steady')
    expect(goalStatus({ ...base, rate: null }).kind).toBe('early')
  })

  it('känner igen nådd målvikt', () => {
    expect(goalStatus({ ...base, trendKg: 68.05, rate: null }).kind).toBe('reached')
    expect(goalStatus({ ...base, goal: 'ga_upp', targetKg: 60, trendKg: 61, rate: null }).kind).toBe('reached')
  })

  it('pausar viktnedgång vid graviditet, amning och under 18 år', () => {
    expect(goalStatus({ ...base, lifeStage: 'gravid', rate: null })).toEqual({ kind: 'paused', reason: 'gravid' })
    expect(goalStatus({ ...base, lifeStage: 'ammar', rate: null })).toEqual({ kind: 'paused', reason: 'ammar' })
    expect(goalStatus({ ...base, age: 16, rate: null })).toEqual({ kind: 'paused', reason: 'under18' })
  })

  it('saknar målstatus när målet är att behålla vikten', () => {
    expect(goalStatus({ ...base, goal: 'behalla', rate: null }).kind).toBe('none')
    expect(goalStatus({ ...base, targetKg: undefined, rate: null }).kind).toBe('none')
  })
})

describe('datumhjälp', () => {
  it('visar år bara om det skiljer sig', () => {
    expect(goalDateLabel('2026-12-14', '2026-09-26')).toBe('14 december')
    expect(goalDateLabel('2027-03-02', '2026-09-26')).toBe('2 mars 2027')
  })

  it('tolkar profilens skapandetid', () => {
    expect(profileStartDate(0)).toBeUndefined()
    expect(profileStartDate(undefined)).toBeUndefined()
    expect(profileStartDate(new Date(2026, 2, 12, 10).getTime())).toBe('2026-03-12')
  })
})

describe('chartWindow', () => {
  it('börjar vid första vägningen om den är senare än intervallets start', () => {
    expect(chartWindow('90', '2026-09-01', '2026-09-26')).toEqual(['2026-09-01', '2026-09-26'])
    expect(chartWindow('30', '2025-01-01', '2026-09-26')).toEqual(['2026-08-28', '2026-09-26'])
    expect(chartWindow('allt', '2025-01-01', '2026-09-26')).toEqual(['2025-01-01', '2026-09-26'])
  })

  it('visar alltid minst en vecka', () => {
    expect(chartWindow('30', '2026-09-26', '2026-09-26')).toEqual(['2026-09-20', '2026-09-26'])
  })
})

describe('groupWeightsByMonth', () => {
  const weights = [
    w('2026-08-30', 74),
    w('2026-09-02', 73.6),
    w('2025-12-24', 76),
    w('2026-09-20', 72.8),
    w('2026-09-10', 73.2),
  ]

  it('grupperar per månad, nyaste först, med år för tidigare år', () => {
    const groups = groupWeightsByMonth(weights, '2026-09-26')
    expect(groups.map((g) => g.label)).toEqual(['September', 'Augusti', 'December 2025'])
    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-08', '2025-12'])
  })

  it('sorterar vägningar nyaste först och räknar snitt och förändring', () => {
    const [sep, aug] = groupWeightsByMonth(weights, '2026-09-26')
    expect(sep.entries.map((e) => e.date)).toEqual(['2026-09-20', '2026-09-10', '2026-09-02'])
    expect(sep.averageKg).toBeCloseTo((73.6 + 73.2 + 72.8) / 3)
    expect(sep.changeKg).toBeCloseTo(-0.8)
    expect(aug.changeKg).toBeUndefined()
  })

  it('ger en tom lista utan vägningar', () => {
    expect(groupWeightsByMonth([], '2026-09-26')).toEqual([])
  })

  it('räknar skillnad mot föregående vägning', () => {
    const diffs = weighInDiffs(weights)
    expect(diffs.get('w_2025-12-24')).toBeUndefined()
    expect(diffs.get('w_2026-08-30')).toBeCloseTo(-2)
    expect(diffs.get('w_2026-09-10')).toBeCloseTo(-0.4)
  })
})

describe('kroppsmått', () => {
  const m = (date: string, v: Partial<MeasurementEntry>): MeasurementEntry => ({ id: `m_${date}`, date, createdAt: 0, ...v })
  const list = [
    m('2026-09-01', { waistCm: 90, hipCm: 104 }),
    m('2026-08-01', { waistCm: 92, bodyFatPct: 28 }),
    m('2026-09-20', { waistCm: 88.5 }),
  ]

  it('listar använda mått i fast ordning', () => {
    expect(usedMeasureKeys(list)).toEqual(['waistCm', 'hipCm', 'bodyFatPct'])
    expect(usedMeasureKeys([])).toEqual([])
  })

  it('ger serie och senaste värde med förändringar', () => {
    expect(measureSeries(list, 'waistCm').map((p) => p.value)).toEqual([92, 90, 88.5])
    const waist = latestMeasure(list, 'waistCm')!
    expect(waist.value).toBe(88.5)
    expect(waist.change).toBeCloseTo(-1.5)
    expect(waist.sinceFirst).toBeCloseTo(-3.5)
    expect(latestMeasure(list, 'hipCm')?.change).toBeUndefined()
    expect(latestMeasure(list, 'armCm')).toBeUndefined()
  })

  it('räknar förändring mot senaste mätning av samma mått, nyaste raden först', () => {
    const rows = measurementRows(list)
    expect(rows.map((r) => r.entry.date)).toEqual(['2026-09-20', '2026-09-01', '2026-08-01'])
    expect(rows[0].changes.waistCm).toBeCloseTo(-1.5)
    expect(rows[1].changes.waistCm).toBeCloseTo(-2)
    expect(rows[1].changes.hipCm).toBeUndefined()
    expect(rows[2].changes).toEqual({})
  })

  it('kräver minst ett ifyllt mått', () => {
    expect(hasAnyMeasure({})).toBe(false)
    expect(hasAnyMeasure({ waistCm: undefined, armCm: Number.NaN })).toBe(false)
    expect(hasAnyMeasure({ armCm: 31 })).toBe(true)
  })

  it('räknar midja/längd och tolkar kvoten ödmjukt', () => {
    expect(waistToHeight(84, 168)).toBeCloseTo(0.5)
    expect(waistToHeight(84, 0)).toBeUndefined()
    expect(whtrCategory(0.45).label).toBe('Lägre risk')
    expect(whtrCategory(0.55).label).toBe('Något förhöjd risk')
    expect(whtrCategory(0.65).tone).toBe('hjortron')
  })
})

describe('adaptiv förbrukning – underlag', () => {
  const quick = (date: string, kcal: number): DiaryEntry => ({
    id: `e_${date}`,
    kind: 'quick',
    name: 'Mat',
    nutrients: { kcal },
    date,
    meal: 'lunch',
    createdAt: 0,
  })

  it('summerar intag per dag och hoppar över tomma dagar', () => {
    const intake = intakeByDay({
      '2026-09-01': [quick('2026-09-01', 600), quick('2026-09-01', 1400)],
      '2026-09-02': [],
    })
    expect(intake).toEqual({ '2026-09-01': 2000 })
  })

  it('visar vad som saknas för en skattning', () => {
    const today = '2026-09-26'
    const intake: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) intake[addDays(today, -i)] = 2000
    intake[addDays(today, -10)] = 500 // ofullständigt loggad – räknas inte
    const p = adaptiveProgress(intake, [w(addDays(today, -3), 80), w(today, 79.8)], today)
    expect(p).toEqual({ loggedDays: 9, weighIns: 2, spanDays: 3, ready: false })
    expect(adaptiveNeeds(p)).toEqual(['5 loggade dagar till', '2 vägningar till'])
  })

  it('är redo när alla krav är uppfyllda', () => {
    const today = '2026-09-26'
    const intake: Record<string, number> = {}
    for (let i = 1; i <= 20; i++) intake[addDays(today, -i)] = 2100
    const weights = [0, 5, 10, 15, 20].map((d) => w(addDays(today, -d), 80))
    const p = adaptiveProgress(intake, weights, today)
    expect(p.ready).toBe(true)
    expect(adaptiveNeeds(p)).toEqual([])
  })

  it('påminner om spridning när antalet vägningar räcker', () => {
    expect(adaptiveNeeds({ loggedDays: 20, weighIns: 5, spanDays: 6, ready: false })).toEqual([
      'vägningar utspridda över minst två veckor',
    ])
  })

  it('räknar upp på svenska', () => {
    expect(joinSv([])).toBe('')
    expect(joinSv(['a'])).toBe('a')
    expect(joinSv(['a', 'b', 'c'])).toBe('a, b och c')
  })

  it('jämför förbrukning med formeln utan att döma', () => {
    expect(compareTdeeText(2300, 2250)).toMatch(/nära/)
    expect(compareTdeeText(2500, 2200)).toMatch(/mer energi/)
    expect(compareTdeeText(1900, 2200)).toMatch(/mindre energi/)
  })
})

describe('bodyOverview', () => {
  const profile = {
    goal: 'ga_ner' as const,
    targetWeightKg: 80,
    lifeStage: 'ingen' as const,
    birthYear: 1990,
    startWeightKg: 86,
    createdAt: new Date(2026, 5, 1, 12).getTime(),
  }

  it('samlar trend, takt, prognos och framsteg', () => {
    const weights = linearWeights('2026-06-01', 100, 86, -0.05, 2)
    const o = bodyOverview(weights, profile, '2026-09-09')
    expect(o.latest?.date).toBe('2026-09-07')
    expect(o.points[o.points.length - 1].date).toBe('2026-09-09')
    expect(o.trendKg).toBeLessThan(82)
    expect(o.change7).toBeLessThan(0)
    expect(o.rate?.kgPerWeek).toBeLessThan(0)
    expect(o.status.kind).toBe('projected')
    expect(o.progress).toBeGreaterThan(0.5)
    expect(o.progress).toBeLessThan(1)
    expect(o.startDate).toBe('2026-06-01')
    expect(o.daysSinceLast).toBe(2)
    expect(o.good).toBe('down')
  })

  it('klarar sig utan vägningar och utan profil', () => {
    const o = bodyOverview([], null, '2026-09-26')
    expect(o.latest).toBeUndefined()
    expect(o.trendKg).toBeUndefined()
    expect(o.status).toEqual({ kind: 'none' })
    expect(o.progress).toBeUndefined()
  })
})
