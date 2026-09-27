/**
 * Tester för Idag-skärmens rena hjälpfunktioner.
 */
import type { DiaryEntry, ExerciseEntry, Food, FoodCategory, MealId, Nutrients, WeightEntry } from '../../types'
import type { KostradId, KostradResult, KostradStatus } from '../../lib/kostrad'
import {
  alcoholDrinks,
  caffeineLevel,
  contextCards,
  copyableCount,
  entryName,
  fastProgress,
  formatHeaderDate,
  greetingFor,
  headerFoodDay,
  isDiaryEmpty,
  kostradProgressText,
  kostradStatusLabel,
  kostradWeekDates,
  lowIntakeAverage,
  mainMealEntries,
  mealNamesText,
  newEntryIds,
  pickKostradHighlights,
  ringNote,
  showEveningCheckIn,
  summarizeMeal,
  weekAverage,
  weekChartSummary,
  weekSeries,
  weightCaution,
  weightGoodDirection,
  weightSnapshot,
} from './todayLogic'

// ---------------------------------------------------------------------------
// Fabriker
// ---------------------------------------------------------------------------

let seq = 0

function food(name: string, per100: Nutrients, category: FoodCategory = 'ovrigt'): Food {
  return { id: `lagom:${name.toLowerCase()}`, name, source: 'lagom', category, nutrients: per100, portions: [] }
}

function foodEntry(date: string, meal: MealId, f: Food, grams: number): DiaryEntry {
  seq++
  return { kind: 'food', id: `e${seq}`, date, meal, createdAt: seq, food: f, amount: grams, unit: 'g', grams }
}

function quick(date: string, meal: MealId, name: string, nutrients: Nutrients): DiaryEntry {
  seq++
  return { kind: 'quick', id: `q${seq}`, date, meal, createdAt: seq, name, nutrients }
}

function exercise(date: string, kcal: number, minutes = 30): ExerciseEntry {
  seq++
  return { id: `x${seq}`, date, activityId: 'promenad', name: 'Promenad', minutes, kcal, createdAt: seq }
}

function weight(date: string, kg: number): WeightEntry {
  seq++
  return { id: `w${seq}`, date, kg, createdAt: seq }
}

function kostrad(id: KostradId, status: KostradStatus, extra: Partial<KostradResult> = {}): KostradResult {
  return {
    id,
    title: id,
    advice: '',
    unit: 'g/dag',
    target: 100,
    actual: status === 'bra' ? 100 : status === 'nastan' ? 80 : 20,
    direction: 'minst',
    score: status === 'bra' ? 1 : status === 'nastan' ? 0.8 : 0.2,
    status,
    tip: '',
    emoji: '🥦',
    periodDays: 3,
    source: 'Livsmedelsverket 2025',
    ...extra,
  }
}

const GROT = food('Havregrynsgröt', { kcal: 70, protein: 2.5 }, 'spannmal')
const MJOLK = food('Mjölk', { kcal: 40 }, 'mejeri')
const LAX = food('Lax', { kcal: 200 }, 'fisk')
const POTATIS = food('Potatis', { kcal: 80 }, 'potatis')
const VIN = food('Rödvin', { kcal: 70, alcohol: 10 }, 'alkohol')

// ---------------------------------------------------------------------------
// Huvudet
// ---------------------------------------------------------------------------

describe('huvudet', () => {
  it('hälsar med och utan namn', () => {
    const morning = new Date(2026, 8, 26, 8, 0)
    expect(greetingFor(morning)).toBe('God morgon')
    expect(greetingFor(morning, '  Anna ')).toBe('God morgon, Anna')
    expect(greetingFor(new Date(2026, 8, 26, 20, 0), '')).toBe('God kväll')
  })

  it('formaterar datum med veckonummer', () => {
    expect(formatHeaderDate('2026-09-26')).toBe('Lördag 26 september · v. 39')
    expect(formatHeaderDate('2026-01-01')).toBe('Torsdag 1 januari · v. 1')
  })

  it('visar pågående, dagens och kommande matdagar', () => {
    // Prinsesstårtans vecka är sista hela veckan i september (21–27 sep 2026).
    expect(headerFoodDay('2026-09-21')).toMatchObject({ when: 'idag', text: 'Prinsesstårtans vecka börjar idag' })
    expect(headerFoodDay('2026-09-26')).toMatchObject({ when: 'pagar', text: 'Prinsesstårtans vecka pågår' })
    // Kanelbullens dag 4 oktober – visas som kommande inom tio dagar.
    const soon = headerFoodDay('2026-09-30')
    expect(soon?.when).toBe('snart')
    expect(soon?.text).toBe('Kanelbullens dag om 4 dagar')
    expect(soon?.day.emoji).toBe('🥐')
    expect(headerFoodDay('2026-10-04')).toMatchObject({ when: 'idag', text: 'Kanelbullens dag idag' })
  })

  it('faller tillbaka på veckotraditionen och annars inget', () => {
    // Mitten av januari: inga matdagar inom tio dagar.
    expect(headerFoodDay('2026-01-16')).toMatchObject({ when: 'vecka', text: 'Fredagsmys idag' })
    expect(headerFoodDay('2026-01-19')).toBeNull()
    // Längre horisont hittar nästa matdag.
    expect(headerFoodDay('2026-01-19', 30)?.when).toBe('snart')
  })
})

// ---------------------------------------------------------------------------
// Måltider
// ---------------------------------------------------------------------------

describe('måltider', () => {
  const d = '2026-09-26'

  it('sammanfattar energi och unika namn', () => {
    const entries = [
      foodEntry(d, 'frukost', GROT, 300),
      foodEntry(d, 'frukost', MJOLK, 200),
      foodEntry(d, 'frukost', MJOLK, 100),
      quick(d, 'frukost', 'Kaffe', { kcal: 5 }),
      quick(d, 'frukost', 'Lingonsylt', { kcal: 40 }),
    ]
    const s = summarizeMeal(entries)
    expect(s.kcal).toBeCloseTo(210 + 80 + 40 + 5 + 40)
    expect(s.count).toBe(5)
    expect(s.names).toEqual(['Havregrynsgröt', 'Mjölk', 'Kaffe'])
    expect(s.more).toBe(1)
    expect(mealNamesText(s)).toBe('Havregrynsgröt, Mjölk, Kaffe och 1 till')
  })

  it('tomma måltider och namnlistor', () => {
    expect(summarizeMeal(undefined)).toEqual({ kcal: 0, count: 0, names: [], more: 0 })
    expect(mealNamesText({ names: [], more: 0 })).toBe('')
    expect(mealNamesText({ names: ['Gröt'], more: 0 })).toBe('Gröt')
    expect(mealNamesText({ names: ['Gröt', 'Mjölk', 'Sylt'], more: 0 })).toBe('Gröt, Mjölk och Sylt')
    expect(entryName(quick(d, 'fika', 'Kanelbulle', {}))).toBe('Kanelbulle')
  })

  it('räknar vad som kan kopieras från igår och hittar nya poster', () => {
    const y = [foodEntry('2026-09-25', 'frukost', GROT, 300), foodEntry('2026-09-25', 'lunch', LAX, 150)]
    expect(copyableCount(y, 'frukost')).toBe(1)
    expect(copyableCount(y, 'middag')).toBe(0)
    expect(copyableCount(undefined, 'frukost')).toBe(0)

    const before = [foodEntry(d, 'lunch', LAX, 100)]
    const added = foodEntry(d, 'frukost', GROT, 300)
    expect(newEntryIds(before, [...before, added])).toEqual([added.id])
    expect(newEntryIds(undefined, [added])).toEqual([added.id])
    expect(newEntryIds(before, undefined)).toEqual([])
  })

  it('känner igen en helt tom dagbok', () => {
    expect(isDiaryEmpty({})).toBe(true)
    expect(isDiaryEmpty({ '2026-09-25': [] })).toBe(true)
    expect(isDiaryEmpty({ '2026-09-25': [quick('2026-09-25', 'fika', 'Bulle', { kcal: 250 })] })).toBe(false)
  })

  it('väljer lunch och middag till dagens tallrik', () => {
    const entries = [foodEntry(d, 'frukost', GROT, 300), foodEntry(d, 'lunch', LAX, 150), foodEntry(d, 'middag', POTATIS, 200)]
    expect(mainMealEntries(entries).map((e) => e.meal)).toEqual(['lunch', 'middag'])
  })
})

// ---------------------------------------------------------------------------
// Veckan
// ---------------------------------------------------------------------------

describe('veckan', () => {
  const dates = ['2026-09-24', '2026-09-25', '2026-09-26']
  const entries = {
    '2026-09-24': [quick('2026-09-24', 'lunch', 'Lunch', { kcal: 1800 })],
    '2026-09-26': [quick('2026-09-26', 'frukost', 'Frukost', { kcal: 400 })],
  }
  const ex = { '2026-09-24': [exercise('2026-09-24', 300)] }

  it('räknar intag och budget (med återlagd träning) per dag', () => {
    const s = weekSeries(dates, entries, ex, 2000, 50)
    expect(s).toEqual([
      { date: '2026-09-24', kcal: 1800, budget: 2150 },
      { date: '2026-09-25', kcal: undefined, budget: 2000 },
      { date: '2026-09-26', kcal: 400, budget: 2000 },
    ])
  })

  it('räknar snittet utan dagens ofullständiga siffra', () => {
    const s = weekSeries(dates, entries, ex, 2000, 50)
    expect(weekAverage(s, '2026-09-26')).toBe(1800)
    // Markerad som klar – då räknas idag med.
    expect(weekAverage(s, '2026-09-26', true)).toBe(1100)
    // Bara idag registrerad – då används idag.
    expect(weekAverage(weekSeries(dates, { '2026-09-26': entries['2026-09-26'] }, {}, 2000, 0), '2026-09-26')).toBe(400)
    expect(weekAverage(weekSeries(dates, {}, {}, 2000, 0), '2026-09-26')).toBeUndefined()
  })

  it('läser upp samma snitt som visas under diagrammet', () => {
    const s = weekSeries(dates, entries, ex, 2000, 50)
    const text = weekChartSummary(s, '2026-09-26', false, 2000).replace(/\u00a0/g, ' ')
    expect(text).toContain('2 av 3 dagar har registreringar')
    // Idag (400 kcal, inte klar) räknas inte – samma snitt som weekAverage.
    expect(text).toContain('Snitt 1 800 kcal per dag, utom idag som inte är klar än.')
    expect(text).toContain('Högst 1 800 kcal (24 sep)')
    expect(text).toContain('Mål 2 000 kcal.')
    const complete = weekChartSummary(s, '2026-09-26', true, 2000).replace(/\u00a0/g, ' ')
    expect(complete).toContain('Snitt 1 100 kcal per dag.')
    expect(weekChartSummary(weekSeries(dates, {}, {}, 2000, 0), '2026-09-26', false, 2000)).toMatch(/inget registrerat/)
    expect(weekChartSummary(s, '2026-09-26', false, 2000, 'kJ')).toContain('kJ')
  })
})

// ---------------------------------------------------------------------------
// Kostråd
// ---------------------------------------------------------------------------

describe('kostråd i veckan', () => {
  it('tar ett uppfyllt råd, sedan nära och sist långt kvar – i fast ordning', () => {
    const results = [
      kostrad('frukt_gront', 'langt_kvar'),
      kostrad('fisk', 'nastan', { unit: 'g', weeklyTarget: 300 }),
      kostrad('fullkorn', 'langt_kvar'),
      kostrad('baljvaxter', 'langt_kvar', { unit: 'dagar' }),
      kostrad('mejeri', 'bra'),
      kostrad('notter', 'bra'),
      kostrad('salt', 'over', { direction: 'hogst' }),
      kostrad('alkohol', 'over', { direction: 'hogst' }),
    ]
    const picked = pickKostradHighlights(results, 3).map((r) => r.id)
    // Ett firat råd (notter före mejeri i ordningen), fisk som är nära, och grönt som är viktigast av resten.
    expect(picked).toEqual(['frukt_gront', 'fisk', 'notter'])
  })

  it('hoppar över osäkra resultat och "högst"-råd', () => {
    const results = [
      kostrad('fullkorn', 'nastan', { coverage: 0.3 }),
      kostrad('salt', 'bra', { direction: 'hogst' }),
      kostrad('fisk', 'langt_kvar'),
    ]
    expect(pickKostradHighlights(results).map((r) => r.id)).toEqual(['fisk'])
    expect(pickKostradHighlights([])).toEqual([])
  })

  it('beskriver framsteg i läsbar form', () => {
    expect(kostradProgressText(kostrad('frukt_gront', 'nastan', { actual: 320.4, target: 500 }))).toBe('320 av 500 g/dag')
    expect(kostradProgressText(kostrad('fisk', 'nastan', { unit: 'g', actual: 150, target: 128.6, weeklyTarget: 300 }))).toBe(
      '150 av 300 g i veckan',
    )
    expect(kostradProgressText(kostrad('baljvaxter', 'nastan', { unit: 'dagar', actual: 2, target: 4 }))).toBe('2 av 4 dagar')
    expect(kostradProgressText(kostrad('baljvaxter', 'langt_kvar', { unit: 'dagar', actual: 0, target: 1 }))).toBe('0 av 1 dag')
    expect(kostradProgressText(kostrad('baljvaxter', 'bra', { unit: 'dagar', actual: 1, target: 1 }))).toBe('1 av 1 dag')
    expect(kostradProgressText(kostrad('rorelse', 'nastan', { unit: 'min', actual: 45, target: 64, weeklyTarget: 150 }))).toBe(
      '45 av 150 min i veckan',
    )
  })

  it('säger "I fas" – inte "I mål" – när ett veckoråd ligger i takt men veckomålet inte är nått', () => {
    // Sex dagar in i veckan: målet är omskalat till 257 g, 283 g räcker – men inte till 300 g.
    const onPace = kostrad('fisk', 'bra', { unit: 'g', actual: 283, target: 257.1, weeklyTarget: 300 })
    expect(kostradStatusLabel(onPace)).toBe('I fas')
    expect(kostradStatusLabel({ ...onPace, actual: 320 })).toBe('I mål')
    expect(kostradStatusLabel(kostrad('rorelse', 'bra', { unit: 'min', actual: 90, target: 64, weeklyTarget: 150 }))).toBe('I fas')
    expect(kostradStatusLabel(kostrad('frukt_gront', 'bra', { actual: 520, target: 500 }))).toBe('I mål')
    expect(kostradStatusLabel(kostrad('fisk', 'nastan', { unit: 'g', actual: 200, target: 257.1, weeklyTarget: 300 }))).toBe('Nästan')
  })
})

describe('veckans kostråd – vilka dagar räknas', () => {
  // 2026-09-24 är en torsdag – veckan började måndag 2026-09-21.
  const today = '2026-09-24'
  const earlier = { '2026-09-22': [quick('2026-09-22', 'lunch', 'Lunch', { kcal: 600 })] }
  const todays = { [today]: [quick(today, 'frukost', 'Frukost', { kcal: 300 })] }

  it('räknar inte dagens halvfärdiga registrering', () => {
    const week = kostradWeekDates(today, { ...earlier, ...todays }, {}, false)
    expect(week).toEqual({ dates: ['2026-09-21', '2026-09-22', '2026-09-23'], todayExcluded: true })
  })

  it('räknar in idag när dagen är klar eller är veckans enda dag med data', () => {
    expect(kostradWeekDates(today, { ...earlier, ...todays }, {}, true).dates).toContain(today)
    expect(kostradWeekDates(today, todays, {}, false)).toEqual({
      dates: ['2026-09-21', '2026-09-22', '2026-09-23', today],
      todayExcluded: false,
    })
    // Måndag: veckan består bara av idag.
    expect(kostradWeekDates('2026-09-21', todays, {}, false)).toEqual({ dates: ['2026-09-21'], todayExcluded: false })
    // Träning tidigare i veckan räknas också som data.
    expect(kostradWeekDates(today, todays, { '2026-09-21': [exercise('2026-09-21', 200)] }, false).todayExcluded).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Sammanhangskort
// ---------------------------------------------------------------------------

describe('sammanhangskort', () => {
  it('visar bara relevanta kort i fast ordning', () => {
    expect(contextCards({ fasting: false, exerciseCount: 0, caffeineMg: undefined, alcoholDrinksWeek: 0 })).toEqual([])
    expect(contextCards({ fasting: true, exerciseCount: 2, caffeineMg: 180, alcoholDrinksWeek: 1.5 })).toEqual([
      'fasta',
      'traning',
      'koffein',
      'alkohol',
    ])
    expect(contextCards({ fasting: false, exerciseCount: 0, caffeineMg: 0, alcoholDrinksWeek: 0.01 })).toEqual([])
    expect(contextCards({ fasting: false, exerciseCount: 1, caffeineMg: 90, alcoholDrinksWeek: 0 })).toEqual(['traning', 'koffein'])
  })

  it('räknar standardglas för veckan', () => {
    const entries = {
      '2026-09-21': [foodEntry('2026-09-21', 'middag', VIN, 150)], // 15 g alkohol
      '2026-09-26': [foodEntry('2026-09-26', 'middag', VIN, 90)], // 9 g alkohol
      '2026-09-14': [foodEntry('2026-09-14', 'middag', VIN, 500)], // förra veckan
    }
    expect(alcoholDrinks(entries, ['2026-09-21', '2026-09-22', '2026-09-26'])).toBeCloseTo(24 / 12)
    expect(alcoholDrinks(entries, ['2026-09-22'])).toBe(0)
  })

  it('graderar koffein mot riktmärket', () => {
    expect(caffeineLevel(100, 400)).toBe('lagom')
    expect(caffeineLevel(300, 400)).toBe('nara')
    expect(caffeineLevel(401, 400)).toBe('over')
    expect(caffeineLevel(250, 0)).toBe('lagom')
  })

  it('räknar fastans förlopp', () => {
    const start = new Date(2026, 8, 26, 20, 0).getTime()
    const p = fastProgress({ start, targetHours: 16 }, start + 12 * 3_600_000)
    expect(p.elapsedMin).toBe(720)
    expect(p.remainingMin).toBe(240)
    expect(p.ratio).toBeCloseTo(0.75)
    expect(p.done).toBe(false)
    expect(fastProgress({ start, targetHours: 16 }, start + 17 * 3_600_000)).toMatchObject({ done: true, remainingMin: 0 })
    // Klockan före start (t.ex. ändrad tid) ger inte negativa värden.
    expect(fastProgress({ start, targetHours: 16 }, start - 1000).elapsedMin).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Vikt
// ---------------------------------------------------------------------------

describe('vikt', () => {
  it('ger senaste vägning och trendriktning', () => {
    expect(weightSnapshot([], '2026-09-26')).toBeNull()

    const one = weightSnapshot([weight('2026-09-20', 80)], '2026-09-26')
    expect(one).toMatchObject({ trendKg: 80, direction: 'flat' })
    expect(one?.weekChangeKg).toBeUndefined()

    const falling = weightSnapshot(
      [weight('2026-09-01', 82), weight('2026-09-10', 81), weight('2026-09-18', 80), weight('2026-09-25', 79.2)],
      '2026-09-26',
    )
    expect(falling?.latest.kg).toBe(79.2)
    expect(falling?.direction).toBe('down')
    expect(falling!.weekChangeKg!).toBeLessThan(0)

    const stable = weightSnapshot([weight('2026-09-01', 70), weight('2026-09-25', 70)], '2026-09-26')
    expect(stable?.direction).toBe('flat')
  })

  it('uppmuntrar aldrig viktnedgång vid graviditet, amning eller under 18 år', () => {
    expect(weightGoodDirection('ga_ner', 'ingen', 35)).toBe('down')
    expect(weightGoodDirection('ga_upp', 'ingen', 35)).toBe('up')
    expect(weightGoodDirection('behalla', 'ingen', 35)).toBeUndefined()
    expect(weightGoodDirection('ga_ner', 'gravid', 30)).toBeUndefined()
    expect(weightGoodDirection('ga_ner', 'ammar', 30)).toBeUndefined()
    expect(weightGoodDirection('ga_ner', 'ingen', 16)).toBeUndefined()
    expect(weightGoodDirection(undefined, undefined, undefined)).toBeUndefined()
  })

  it('säger något varsamt vid för snabb nedgång eller låg vikt', () => {
    const adult = { heightCm: 170, age: 35, lifeStage: 'ingen' as const }
    // 0,5 kg/vecka vid 80 kg (0,6 %) är lugnt.
    expect(weightCaution({ trendKg: 80, weekChangeKg: -0.5, direction: 'down' }, adult)).toBeNull()
    // 1,2 kg/vecka vid 80 kg (1,5 %) är för snabbt.
    expect(weightCaution({ trendKg: 80, weekChangeKg: -1.2, direction: 'down' }, adult)).toBe('snabb')
    // Upp eller stabilt är aldrig "för snabbt ned".
    expect(weightCaution({ trendKg: 80, weekChangeKg: 1.2, direction: 'up' }, adult)).toBeNull()
    // BMI 17,3 (50 kg, 170 cm) – under 18,5.
    expect(weightCaution({ trendKg: 50, weekChangeKg: 0, direction: 'flat' }, adult)).toBe('lag')
    // Från 70 år gäller 22 som nedre gräns: BMI 20,8 (60 kg, 170 cm).
    expect(weightCaution({ trendKg: 60, direction: 'flat' }, { ...adult, age: 74 })).toBe('lag')
    expect(weightCaution({ trendKg: 60, direction: 'flat' }, adult)).toBeNull()
    // BMI-gränsen gäller inte under 18 år eller vid graviditet – men för snabb nedgång gör det.
    expect(weightCaution({ trendKg: 50, direction: 'flat' }, { ...adult, age: 16 })).toBeNull()
    expect(weightCaution({ trendKg: 50, direction: 'flat' }, { ...adult, lifeStage: 'gravid' })).toBeNull()
    expect(weightCaution({ trendKg: 70, weekChangeKg: -1, direction: 'down' }, { ...adult, lifeStage: 'ammar' })).toBe('snabb')
    // Utan längd: bara takten bedöms.
    expect(weightCaution({ trendKg: 45, direction: 'flat' }, {})).toBeNull()
  })

  it('märker ett lågt intag bara på dagar som är markerade som klara', () => {
    const today = '2026-09-26'
    const days = ['2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
    const entriesByDate = Object.fromEntries(days.map((d) => [d, [quick(d, 'lunch', 'Mat', { kcal: 900 })]]))
    const allComplete = Object.fromEntries(days.map((d) => [d, { complete: true }]))
    expect(lowIntakeAverage(today, entriesByDate, allComplete, 1200)).toBe(900)
    // Över golvet – inget att säga.
    expect(lowIntakeAverage(today, entriesByDate, allComplete, 800)).toBeUndefined()
    // Ofullständigt loggade dagar räknas inte – två klara dagar räcker inte som underlag.
    expect(lowIntakeAverage(today, entriesByDate, { '2026-09-22': { complete: true }, '2026-09-23': { complete: true } }, 1200)).toBeUndefined()
    expect(lowIntakeAverage(today, entriesByDate, {}, 1200)).toBeUndefined()
    // Dagar äldre än en vecka räknas inte.
    const old = { '2026-09-10': [quick('2026-09-10', 'lunch', 'Mat', { kcal: 500 })] }
    expect(lowIntakeAverage(today, { ...old }, { '2026-09-10': { complete: true } }, 1200)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Kväll och ring
// ---------------------------------------------------------------------------

describe('kvällsreflektion och ringen', () => {
  it('visas efter 18, i medvetet läge eller när dagen redan reflekterats', () => {
    const afternoon = new Date(2026, 8, 26, 15, 0)
    const evening = new Date(2026, 8, 26, 18, 0)
    expect(showEveningCheckIn(afternoon, false, {})).toBe(false)
    expect(showEveningCheckIn(evening, false, {})).toBe(true)
    expect(showEveningCheckIn(afternoon, true, {})).toBe(true)
    expect(showEveningCheckIn(afternoon, false, { mood: 4 })).toBe(true)
    expect(showEveningCheckIn(afternoon, false, { complete: true })).toBe(true)
  })

  it('har vänliga rader utan larm', () => {
    expect(ringNote('over')).toContain('helt okej')
    expect(ringNote('lagom')).toContain('lagom')
    expect(ringNote('kvar')).toBeNull()
    expect(ringNote('tom')).not.toBeNull()
  })
})
