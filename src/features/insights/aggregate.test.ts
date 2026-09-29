import { referenceIntakes } from '../../lib/nnr'
import {
  plateMealsText,
  buildDayStats,
  climateDays,
  consistency,
  countLoggedDays,
  lowIntakeAverage,
  coverageSummary,
  coverageText,
  macroKcal,
  macroVerdicts,
  mainMealPlate,
  mealDistribution,
  mindfulAverageLabel,
  periodEntries,
  rankNutrients,
  rollingAverage,
  summarizeClimate,
  summarizeDays,
  topEmitters,
  reliableReferences,
  topSources,
  uncertainNutrients,
  weightWindow,
  withPersonalProtein,
} from './aggregate'
import { byDate, exerciseEntry, foodEntry, makeFood, quickEntry, weightEntry } from './testUtils'

const GROT = makeFood('Havregrynsgröt', { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3, fiber: 1.7, iron: 0.8 }, 'spannmal')
const LAX = makeFood('Lax', { kcal: 210, protein: 22, fat: 13, carbs: 0, vitD: 10 }, 'fisk')
const BROCCOLI = makeFood('Broccoli', { kcal: 35, protein: 3, carbs: 4, fat: 0.4, fiber: 3, iron: 0.7 }, 'gronsaker')
const POTATIS = makeFood('Potatis', { kcal: 80, protein: 2, carbs: 17, fat: 0.1, fiber: 1.5 }, 'potatis')
const NOTFARS = makeFood('Nötfärs', { kcal: 250, protein: 18, fat: 20 }, 'rott_kott')

describe('dagssummor', () => {
  const entries = byDate([
    foodEntry('2026-09-21', 'frukost', GROT, 400), // 280 kcal
    foodEntry('2026-09-21', 'middag', LAX, 200), // 420 kcal
    foodEntry('2026-09-23', 'lunch', POTATIS, 1000), // 800 kcal
  ])
  const exercise = byDate([exerciseEntry('2026-09-23', 400)])
  const dates = ['2026-09-21', '2026-09-22', '2026-09-23']

  it('räknar bara loggade dagar och lägger till träning i budgeten', () => {
    const days = buildDayStats(dates, entries, exercise, 2000, 50)
    expect(days.map((d) => d.logged)).toEqual([true, false, true])
    expect(days[0].kcal).toBeCloseTo(700)
    expect(days[1].kcal).toBeUndefined()
    expect(days[2].budget).toBe(2200)
    expect(days[2].exerciseKcal).toBe(400)

    const s = summarizeDays(days)
    expect(s.loggedDays).toBe(2)
    expect(s.elapsedDays).toBe(3)
    expect(s.avgKcal).toBeCloseTo(750) // oregistrerade dagen drar inte ned snittet
    expect(s.avgBudget).toBeCloseTo(2100)
    expect(s.nearBudgetDays).toBe(0)
  })

  it('med veckobudget räknas varje dags budget mot den dagens mål', () => {
    const days = buildDayStats(dates, entries, exercise, (d) => (d === '2026-09-23' ? 2300 : 1850), 50)
    expect(days.map((d) => d.budget)).toEqual([1850, 1850, 2500])
  })

  it('hjälpfunktioner för perioden', () => {
    expect(countLoggedDays(entries, dates)).toBe(2)
    expect(periodEntries(entries, dates)).toHaveLength(3)
  })

  it('delar upp dagens energi på makron så att summan blir dagens energi', () => {
    const days = buildDayStats(dates, entries, exercise, 2000, 0)
    const m = macroKcal(days[0])
    expect(m.protein + m.carbs + m.fat + m.alcohol).toBeCloseTo(days[0].kcal ?? 0)
    expect(m.fat).toBeGreaterThan(0)
    expect(macroKcal(days[1])).toEqual({ protein: 0, carbs: 0, fat: 0, alcohol: 0 })
  })

  it('glidande medelvärde kräver minst två loggade dagar i fönstret', () => {
    const days = buildDayStats(dates, entries, exercise, 2000, 0)
    const r = rollingAverage(days, 7, 2)
    expect(r).toHaveLength(1)
    expect(r[0].date).toBe('2026-09-23')
    expect(r[0].value).toBeCloseTo(750)
  })
})

describe('energifördelning och etiketter', () => {
  it('bedömer E% mot NNR:s intervall', () => {
    // 100 g protein (400 kcal), 80 g fett (720 kcal), 200 g kolhydrater (800 kcal)
    const v = macroVerdicts({ protein: 100, fat: 80, carbs: 200 })
    const byKey = Object.fromEntries(v.map((x) => [x.key, x]))
    expect(byKey.protein.pct).toBeCloseTo(20.8, 0)
    expect(byKey.protein.status).toBe('over')
    expect(byKey.fat.status).toBe('inom')
    expect(byKey.carbs.status).toBe('under')
    expect(byKey.carbs.text).toMatch(/Fullkorn/)
  })

  it('ger tom lista utan energi', () => {
    expect(macroVerdicts({})).toEqual([])
  })

  it('kvalitativa etiketter för medvetet läge', () => {
    expect(mindfulAverageLabel(1).title).toBe('Lagom')
    expect(mindfulAverageLabel(1.4).hint).toMatch(/okej/)
    expect(mindfulAverageLabel(undefined).title).toBe('Inget att visa än')
  })

  it('beskriver loggningen vänligt', () => {
    expect(consistency(5, 7).title).toBe('Du har loggat 5 av 7 dagar')
    expect(consistency(1, 1).title).toBe('Du har loggat 1 av 1 dag')
    expect(consistency(7, 7).text).toMatch(/imponerande/)
    expect(consistency(1, 7).text).not.toMatch(/borde|måste/)
    expect(consistency(0, 0).ratio).toBe(0)
  })
})

describe('näringsämnen', () => {
  const refs = referenceIntakes({ sex: 'kvinna', age: 35, lifeStage: 'ingen', weightKg: 65 })

  it('rangordnar mot rekommenderat intag och hoppar över osäkra värden', () => {
    const averages = { protein: 80, fiber: 12, iron: 6, vitC: 150, vitD: 2, salt: 9 }
    const coverage = { protein: 1, fiber: 1, iron: 1, vitC: 1, vitD: 0.2, salt: 1 }
    const { strongest, weakest } = rankNutrients(averages, coverage, refs)
    expect(strongest.map((x) => x.key)).toContain('vitC')
    expect(strongest.map((x) => x.key)).toContain('protein')
    expect(weakest[0].key).toBe('iron') // lägst andel av RI
    expect(weakest.map((x) => x.key)).toContain('fiber')
    expect([...strongest, ...weakest].map((x) => x.key)).not.toContain('vitD') // låg täckning
    expect([...strongest, ...weakest].map((x) => x.key)).not.toContain('salt') // maxgräns
  })

  it('hittar de bästa källorna och räknar okända värden separat', () => {
    const entries = [
      foodEntry('2026-09-21', 'frukost', GROT, 300),
      foodEntry('2026-09-22', 'frukost', GROT, 300),
      foodEntry('2026-09-21', 'middag', BROCCOLI, 200),
      foodEntry('2026-09-21', 'middag', LAX, 150), // saknar järn
      quickEntry('2026-09-22', 'fika', 'Kanelbulle', { kcal: 300, iron: 1 }),
    ]
    const r = topSources(entries, 'iron', 3)
    expect(r.unknownEntries).toBe(1)
    expect(r.items[0].name).toBe('Havregrynsgröt')
    expect(r.items[0].count).toBe(2)
    expect(r.items[0].amount).toBeCloseTo(4.8)
    expect(r.total).toBeCloseTo(4.8 + 1.4 + 1)
    expect(r.items.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(r.items.map((x) => x.id)).toContain('snabb:kanelbulle')
  })

  it('mäter protein mot det egna proteinmålet, samma som energikortet', () => {
    const averages = { protein: 71.6 }
    const coverage = { protein: 1 }
    // Mot NNR (0,83 g/kg × 65 kg ≈ 54 g) ser 71,6 g ut som 130 % …
    expect(rankNutrients(averages, coverage, refs).strongest.map((x) => x.key)).toContain('protein')
    // … men mot målet 86 g är det 83 % – samma bild som "mål 86 g" i energikortet.
    const personal = withPersonalProtein(refs, 86)
    const { strongest, weakest } = rankNutrients(averages, coverage, personal)
    expect(strongest.map((x) => x.key)).not.toContain('protein')
    expect(weakest.find((x) => x.key === 'protein')?.percent).toBeCloseTo(83.3, 0)
    expect(withPersonalProtein(refs, undefined)).toBe(refs)
    expect(refs.protein?.ri).not.toBe(86) // originalet ändras inte
  })

  it('tar bort omdömen som bygger på för lite data i tabellen', () => {
    const averages = { fiber: 12, wholegrain: 40, vitC: 150, salt: 4, iron: 12 }
    // Fullkorn och salt är kända för under hälften av maten, C-vitamin likaså men över RI.
    const coverage = { fiber: 0.95, wholegrain: 0.3, vitC: 0.3, salt: 0.4, iron: 0.7 }
    const reliable = reliableReferences(averages, coverage, refs)
    expect(reliable.fiber).toBe(refs.fiber) // lågt men säkert
    expect(reliable.iron).toBe(refs.iron) // täckning över 50 %
    expect(reliable.wholegrain).toBeUndefined() // "Lågt" vore osäkert
    expect(reliable.salt).toBeUndefined() // "under maxgränsen" vore osäkert
    expect(reliable.vitC).toBe(refs.vitC) // redan över RI – stämmer även med okända värden
    expect(uncertainNutrients(refs, reliable, averages).sort()).toEqual(['salt', 'wholegrain'])
    // Över maxgränsen stämmer också med låg täckning.
    expect(reliableReferences({ salt: 9 }, { salt: 0.3 }, refs).salt).toBe(refs.salt)
  })

  it('sammanfattar datatäckningen', () => {
    const s = coverageSummary({ protein: 1, fiber: 0.6 }, ['protein', 'fiber', 'vitD'])
    expect(s.complete).toBe(1)
    expect(s.partial).toEqual(['fiber'])
    expect(s.missing).toEqual(['vitD'])
    expect(coverageText(s)).toMatch(/aldrig som noll/)
    expect(coverageText(coverageSummary({ protein: 1 }, ['protein']))).toMatch(/alla 1 ämnen/)
  })
})

describe('måltider och tallrik', () => {
  it('fördelar energin per måltid i dagboksordning', () => {
    const entries = [
      foodEntry('2026-09-21', 'middag', LAX, 200), // 420
      foodEntry('2026-09-21', 'frukost', GROT, 400), // 280
      quickEntry('2026-09-22', 'fika', 'Bulle', { kcal: 300 }),
    ]
    const d = mealDistribution(entries, 2)
    expect(d.map((x) => x.meal)).toEqual(['frukost', 'fika', 'middag'])
    expect(d.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(d.find((x) => x.meal === 'middag')?.perDay).toBeCloseTo(210)
  })

  it('väger ihop huvudmåltidernas tallrik och räknar lagom-måltider', () => {
    const entries = byDate([
      // Lagom: 50 % grönt, 30 % potatis, 20 % fisk
      foodEntry('2026-09-21', 'middag', BROCCOLI, 250),
      foodEntry('2026-09-21', 'middag', POTATIS, 150),
      foodEntry('2026-09-21', 'middag', LAX, 100),
      // Inte lagom: bara kött
      foodEntry('2026-09-22', 'lunch', NOTFARS, 150),
      // Frukost räknas inte
      foodEntry('2026-09-22', 'frukost', GROT, 300),
    ])
    const s = mainMealPlate(entries, ['2026-09-21', '2026-09-22'], 'vanlig')
    expect(s.meals).toBe(2)
    expect(s.lagomMeals).toBe(1)
    expect(s.plate.hasPlate).toBe(true)
    expect(s.plate.fractions.protein).toBeGreaterThan(0.2)
  })
})

describe('klimat', () => {
  it('summerar per dag, räknar snabbposter som okända och hittar de största utsläppen', () => {
    const entries = byDate([
      foodEntry('2026-09-21', 'middag', NOTFARS, 150),
      foodEntry('2026-09-21', 'middag', POTATIS, 200),
      quickEntry('2026-09-22', 'lunch', 'Lunch ute', { kcal: 700 }),
    ])
    const days = climateDays(['2026-09-21', '2026-09-22', '2026-09-23'], entries)
    expect(days[0].kg).toBeGreaterThan(1)
    expect(days[1].kg).toBe(0)
    expect(days[2].logged).toBe(false)
    const s = summarizeClimate(days)
    expect(s.loggedDays).toBe(2)
    expect(s.unknownEntries).toBe(1)
    expect(s.avgKg).toBeCloseTo(s.totalKg / 2)

    const top = topEmitters(Object.values(entries).flat(), 5)
    expect(top[0].name).toBe('Nötfärs')
    expect(top[0].share).toBeGreaterThan(0.8)
  })
})

describe('vikt', () => {
  it('visar trenden inom fönstret och förändringen när det finns minst två vägningar', () => {
    const weights = [weightEntry('2026-09-01', 70), weightEntry('2026-09-10', 69.5), weightEntry('2026-09-20', 69)]
    const w = weightWindow(weights, '2026-09-05', '2026-09-26')
    expect(w.measured).toBe(2)
    expect(w.points[0].date).toBe('2026-09-05')
    expect(w.change).toBeLessThan(0)
    expect(weightWindow([], '2026-09-01', '2026-09-26').points).toEqual([])
    expect(weightWindow(weights, '2026-09-19', '2026-09-26').change).toBeUndefined()
  })
})

describe('lowIntakeAverage', () => {
  const day = (date: string, kcal: number | undefined) => ({ date, logged: kcal !== undefined, entryCount: kcal === undefined ? 0 : 1, totals: {}, kcal, budget: 2000, exerciseKcal: 0 })
  const days = [day('2026-09-21', 900), day('2026-09-22', 1000), day('2026-09-23', 1100), day('2026-09-24', 600), day('2026-09-25', undefined)]
  const complete = new Set(['2026-09-21', '2026-09-22', '2026-09-23'])

  it('ger snittet när minst tre klara dagar ligger under golvet', () => {
    expect(lowIntakeAverage(days, (d) => complete.has(d), 1200)).toBe(1000)
  })

  it('räknar bara klara dagar – ofullständigt loggade dagar ger ingen notis', () => {
    expect(lowIntakeAverage(days, () => false, 1200)).toBeUndefined()
    expect(lowIntakeAverage(days, (d) => d === '2026-09-24' || d === '2026-09-21', 1200)).toBeUndefined()
  })

  it('säger inget när snittet ligger över golvet', () => {
    expect(lowIntakeAverage(days, (d) => complete.has(d), 900)).toBeUndefined()
  })
})

describe('plateMealsText', () => {
  it('böjer substantiv och particip rätt', () => {
    expect(plateMealsText(1, 0)).toBe('1 huvudmåltid bedömd – små byten gör tallriken mer lagom.')
    expect(plateMealsText(3, 0)).toBe('3 huvudmåltider bedömda – små byten gör tallriken mer lagom.')
    expect(plateMealsText(1, 1)).toBe('1 av 1 huvudmåltid var lagom fördelad – fint!')
    expect(plateMealsText(5, 2)).toBe('2 av 5 huvudmåltider var lagom fördelade.')
  })
})
