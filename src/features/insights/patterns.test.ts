import { addDays } from '../../lib/dates'
import type { DayMeta } from '../../types'
import { buildDayStats, type DayStat } from './aggregate'
import {
  alcoholByWeek,
  formatClock,
  mealTiming,
  median,
  moodInsights,
  parseClock,
  pearson,
  weekdayInsight,
  weekdayPattern,
  type WeekdayAverage,
} from './patterns'
import { byDate, foodEntry, makeFood, quickEntry } from './testUtils'

/** Konstruerat veckodagsmönster: `avg` per veckodag (mån–sön), två dagar var. */
function pattern(avgs: Array<number | undefined>, count = 2): WeekdayAverage[] {
  return avgs.map((avg, weekday) => ({ weekday, avg, count: avg === undefined ? 0 : count }))
}

function day(date: string, kcal: number, extra: Partial<DayStat['totals']> = {}): DayStat {
  return { date, logged: true, entryCount: 1, totals: { kcal, ...extra }, kcal, budget: 2000, exerciseKcal: 0 }
}

describe('veckodagar', () => {
  it('räknar snitt per veckodag med måndag först', () => {
    const days = [day('2026-09-21', 1800), day('2026-09-28', 2200), day('2026-09-25', 2500)]
    const p = weekdayPattern(days)
    expect(p[0].avg).toBe(2000)
    expect(p[0].count).toBe(2)
    expect(p[4].avg).toBe(2500)
    expect(p[1].avg).toBeUndefined()
  })

  it('säger fredagsmys bara när fredagen faktiskt sticker ut', () => {
    expect(weekdayInsight(pattern([1900, 1950, 2000, 1900, 2600, 2100, 2000]))?.text).toMatch(/Fredagsmys/)
    // Fredagen är högst men bara marginellt – inget fredagsmys.
    expect(weekdayInsight(pattern([2000, 2000, 2000, 2000, 2050, 2000, 2000]))?.text).not.toMatch(/Fredagsmys/)
    // Fredagen är högst men bara en fredag loggad.
    const oneFriday = pattern([1900, 1950, 2000, 1900, 2600, 2100, 2000])
    oneFriday[4].count = 1
    expect(weekdayInsight(oneFriday)?.text ?? '').not.toMatch(/Fredagsmys/)
  })

  it('känner igen helger, jämna veckor och kräver tillräckligt underlag', () => {
    expect(weekdayInsight(pattern([1900, 1900, 1900, 1900, 1950, 2300, 2350]))?.emoji).toBe('🍽️')
    expect(weekdayInsight(pattern([2000, 2050, 1980, 2020, 2010, 2040, 2030]))?.text).toMatch(/Jämnt/)
    expect(weekdayInsight(pattern([2000, 2000, 2000, undefined, undefined, undefined, 2000]))).toBeNull()
    expect(weekdayInsight(pattern([2000, 2000, 2000, 2000, 2000, 2000, 2000], 1))).toBeNull()
  })
})

describe('måltidstider', () => {
  it('tolkar och formaterar klockslag', () => {
    expect(parseClock('07:30')).toBe(450)
    expect(parseClock('7:05')).toBe(425)
    expect(parseClock('25:00')).toBeUndefined()
    expect(parseClock(undefined)).toBeUndefined()
    expect(formatClock(450)).toBe('07:30')
    expect(formatClock(1439.6)).toBe('00:00')
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBeUndefined()
  })

  it('sammanfattar dygnsrytmen från poster med klockslag', () => {
    const f = makeFood('Mat', { kcal: 100 })
    const entries = [
      foodEntry('2026-09-21', 'frukost', f, 100, '07:00'),
      foodEntry('2026-09-21', 'middag', f, 100, '18:30'),
      foodEntry('2026-09-22', 'frukost', f, 100, '08:00'),
      foodEntry('2026-09-22', 'middag', f, 100, '19:30'),
      foodEntry('2026-09-22', 'lunch', f, 100),
    ]
    const t = mealTiming(entries)
    expect(t.timedEntries).toBe(4)
    expect(t.byHour[7]).toBe(1)
    expect(t.byHour[19]).toBe(1)
    expect(t.byMeal.map((m) => m.meal)).toEqual(['frukost', 'middag'])
    expect(t.byMeal[0].median).toBe(450)
    expect(t.firstMedian).toBe(450)
    expect(t.lastMedian).toBe(1140)
    expect(t.windowDays).toBe(2)
  })
})

describe('mående mot intag', () => {
  it('räknar Pearsons r', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeUndefined()
    expect(pearson([1, 2], [1, 2])).toBeUndefined()
  })

  it('hittar ett tydligt samband först när det finns minst sju dagar', () => {
    const days: DayStat[] = []
    const meta: Record<string, DayMeta> = {}
    for (let i = 0; i < 10; i++) {
      const date = addDays('2026-09-01', i)
      const protein = 40 + i * 10
      days.push(day(date, 2000, { protein, fiber: 25 }))
      meta[date] = { hunger: i < 5 ? 4 : 2 }
    }
    const a = moodInsights(days, meta)
    expect(a.ratedDays).toBe(10)
    expect(a.insights).toHaveLength(1)
    expect(a.insights[0].metric).toBe('hunger')
    expect(a.insights[0].variable).toBe('protein')
    expect(a.insights[0].text).toMatch(/mer protein har du skattat hungern lägre/)

    const few = moodInsights(days.slice(0, 6), meta)
    expect(few.insights).toHaveLength(0)
  })
})

describe('alkohol', () => {
  it('räknar standardglas per kalendervecka', () => {
    const vin = makeFood('Rött vin', { kcal: 80, alcohol: 10 }, 'alkohol')
    const entries = byDate([
      foodEntry('2026-09-18', 'middag', vin, 240), // 24 g = 2 glas (vecka 38)
      foodEntry('2026-09-25', 'middag', vin, 120), // 1 glas (vecka 39)
      quickEntry('2026-09-26', 'fika', 'Bulle', { kcal: 300 }),
    ])
    const dates = buildDayStats(['2026-09-18', '2026-09-25', '2026-09-26'], entries, {}, 2000, 0).map((d) => d.date)
    const w = alcoholByWeek(dates, entries)
    expect(w).toHaveLength(2)
    expect(w[0].week).toBe(38)
    expect(w[0].drinks).toBeCloseTo(2)
    expect(w[1].drinks).toBeCloseTo(1)
    expect(w[1].loggedDays).toBe(2)
  })
})
