import type { DiaryEntry } from '../../types'
import { sunTimes } from '../../lib/season'
import {
  clockMinutes,
  dayNumberSince,
  daylightDeltaMinutes,
  daylightSpan,
  describeDaylightDelta,
  foodSearchPath,
  formatClock,
  formatDaylight,
  formatElapsed,
  formatSince,
  groupProduce,
  isVitaminDSeason,
  loggedDaysInLast,
  nextWeeklyOccurrence,
  nextWeeklyTradition,
} from './moreLogic'

describe('klockslag och dagsljus', () => {
  it('formaterar i Stockholmstid oavsett enhetens tidszon', () => {
    // 02:30 UTC en sommardag = 04:30 i Stockholm (sommartid)
    expect(formatClock(new Date(Date.UTC(2026, 5, 21, 2, 30)))).toBe('04:30')
    // 16:05 UTC en vinterdag = 17:05 i Stockholm
    expect(formatClock(new Date(Date.UTC(2026, 11, 21, 16, 5)))).toBe('17:05')
    expect(formatClock(new Date(Date.UTC(2026, 11, 21, 16, 5)), 'UTC')).toBe('16:05')
    expect(formatClock(null)).toBe('–')
    expect(clockMinutes(new Date(Date.UTC(2026, 11, 21, 16, 5)))).toBe(17 * 60 + 5)
  })

  it('dagsljusets längd i timmar och minuter', () => {
    expect(formatDaylight(11.7)).toBe('11 h 42 min')
    expect(formatDaylight(6)).toBe('6 h')
    expect(formatDaylight(0.5)).toBe('30 min')
  })

  it('dagarna blir längre på våren och kortare på hösten', () => {
    expect(daylightDeltaMinutes('2026-03-20')).toBeGreaterThan(0)
    expect(daylightDeltaMinutes('2026-09-26')).toBeLessThan(0)
    expect(describeDaylightDelta(4)).toBe('4 minuter längre än igår')
    expect(describeDaylightDelta(-1)).toBe('1 minut kortare än igår')
    expect(describeDaylightDelta(0)).toBe('Ungefär lika lång som igår')
  })

  it('placerar soluppgång före solnedgång på dygnsstapeln', () => {
    const span = daylightSpan(sunTimes('2026-09-26'))
    expect(span).not.toBeNull()
    expect(span!.start).toBeGreaterThan(0.2)
    expect(span!.end).toBeLessThan(0.85)
    expect(span!.start).toBeLessThan(span!.end)
  })

  it('D-vitaminsäsongen är oktober–mars', () => {
    expect(isVitaminDSeason('2026-10-01')).toBe(true)
    expect(isVitaminDSeason('2027-03-31')).toBe(true)
    expect(isVitaminDSeason('2026-04-01')).toBe(false)
    expect(isVitaminDSeason('2026-09-30')).toBe(false)
  })
})

describe('matkalendern', () => {
  it('hittar nästa veckotradition', () => {
    // 2026-09-28 är en måndag → ärtsoppa på torsdag om tre dagar
    const next = nextWeeklyTradition('2026-09-28')
    expect(next?.day.key).toBe('artsoppa-torsdag')
    expect(next?.inDays).toBe(3)
    // Lördag → lördagsgodis idag
    expect(nextWeeklyTradition('2026-09-26')).toMatchObject({ inDays: 0, day: { key: 'lordagsgodis' } })
    expect(nextWeeklyOccurrence('fredagsmys', '2026-09-26')?.date).toBe('2026-10-02')
  })

  it('bygger söklänkar', () => {
    expect(foodSearchPath(' kanelbulle ')).toBe('/lagg-till?q=kanelbulle')
    expect(foodSearchPath('räkor & bröd')).toBe('/lagg-till?q=r%C3%A4kor%20%26%20br%C3%B6d')
  })

  it('grupperar råvaror i fast ordning och hoppar över tomma grupper', () => {
    const groups = groupProduce([
      { name: 'kantareller', emoji: '🍄', kind: 'svamp' },
      { name: 'äpplen', emoji: '🍎', kind: 'frukt' },
      { name: 'grönkål', emoji: '🥬', kind: 'grönsak' },
    ])
    expect(groups.map((g) => g.kind)).toEqual(['grönsak', 'frukt', 'svamp'])
  })
})

describe('nyckeltal', () => {
  it('formaterar pågående fasta', () => {
    expect(formatElapsed(5 * 60_000)).toBe('5 min')
    expect(formatElapsed((12 * 60 + 5) * 60_000)).toBe('12 h 5 min')
    expect(formatElapsed(-10)).toBe('0 min')
  })

  it('räknar loggade dagar den senaste veckan', () => {
    const e = { id: 'x' } as unknown as DiaryEntry
    const entries = { '2026-09-26': [e], '2026-09-24': [e], '2026-09-20': [e], '2026-09-19': [e], '2026-09-25': [] }
    expect(loggedDaysInLast(entries, '2026-09-26', 7)).toBe(3)
  })

  it('beskriver hur länge man använt Lagom', () => {
    const ms = new Date(2026, 8, 12, 15).getTime()
    expect(formatSince(ms, '2026-09-26')).toBe('12 september')
    expect(formatSince(new Date(2025, 0, 3).getTime(), '2026-09-26')).toBe('3 januari 2025')
    expect(dayNumberSince(ms, '2026-09-12')).toBe(1)
    expect(dayNumberSince(ms, '2026-09-26')).toBe(15)
  })
})
