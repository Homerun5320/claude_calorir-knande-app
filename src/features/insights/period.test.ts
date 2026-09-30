import { formatDateRange, makePeriod, makeRollingPeriod, parsePeriodKind, parseWeekOffset, previousPeriod, REPORT_DAYS, withCountedDays } from './period'

const TODAY = '2026-09-26' // lördag, vecka 39

describe('period', () => {
  it('tolkar periodtyp och veckoförskjutning försiktigt', () => {
    expect(parsePeriodKind('30')).toBe('30')
    expect(parsePeriodKind('90')).toBe('90')
    expect(parsePeriodKind('vecka')).toBe('vecka')
    expect(parsePeriodKind('365')).toBe('vecka')
    expect(parsePeriodKind(null)).toBe('vecka')
    expect(parseWeekOffset('-2')).toBe(-2)
    expect(parseWeekOffset('3')).toBe(0) // inga framtida veckor
    expect(parseWeekOffset('abc')).toBe(0)
    expect(parseWeekOffset(null)).toBe(0)
    expect(parseWeekOffset('-99999')).toBe(-260)
  })

  it('bygger innevarande ISO-vecka måndag–söndag med förflutna dagar', () => {
    const p = makePeriod('vecka', 0, TODAY)
    expect(p.start).toBe('2026-09-21')
    expect(p.end).toBe('2026-09-27')
    expect(p.dates).toHaveLength(7)
    expect(p.elapsed).toHaveLength(6)
    expect(p.title).toBe('Vecka 39')
    expect(p.label).toBe('Den här veckan')
    expect(p.range).toBe('21–27 sep')
    expect(p.isCurrent).toBe(true)
  })

  it('bläddrar till tidigare veckor', () => {
    const p = makePeriod('vecka', -1, TODAY)
    expect(p.start).toBe('2026-09-14')
    expect(p.label).toBe('Förra veckan')
    expect(p.elapsed).toHaveLength(7)
    expect(p.isCurrent).toBe(false)
    expect(makePeriod('vecka', -2, TODAY).label).toBe('Vecka 37')
  })

  it('bygger 30 och 90 dagar som slutar idag', () => {
    const p30 = makePeriod('30', 0, TODAY)
    expect(p30.dates).toHaveLength(30)
    expect(p30.end).toBe(TODAY)
    expect(p30.start).toBe('2026-08-28')
    expect(p30.range).toBe('28 aug – 26 sep')
    expect(p30.phrase).toBe('de senaste 30 dagarna')
    expect(makePeriod('90', 0, TODAY).dates).toHaveLength(90)
  })

  it('formaterar datumintervall över års- och månadsgränser', () => {
    expect(formatDateRange('2025-12-29', '2026-01-04', TODAY)).toBe('29 dec 2025 – 4 jan 2026')
    expect(formatDateRange('2025-03-03', '2025-03-09', TODAY)).toBe('3–9 mars 2025')
    expect(formatDateRange('2026-09-29', '2026-10-05', TODAY)).toBe('29 sep – 5 okt')
  })

  it('jämför innevarande vecka med lika många dagar förra veckan', () => {
    const prev = previousPeriod(makePeriod('vecka', 0, TODAY), TODAY)
    expect(prev.start).toBe('2026-09-14')
    expect(prev.elapsed).toHaveLength(6)
    const prev30 = previousPeriod(makePeriod('30', 0, TODAY), TODAY)
    expect(prev30.end).toBe('2026-08-27')
    expect(prev30.dates).toHaveLength(30)
  })
})

describe('adressparametrar', () => {
  it('läser och skriver flik och period', async () => {
    const { readParams, writeParams, parseTab } = await import('./nav')
    expect(parseTab('klimat', false)).toBe('oversikt')
    expect(parseTab('klimat', true)).toBe('klimat')
    expect(parseTab('okand', true)).toBe('oversikt')
    const p = readParams(new URLSearchParams('flik=naring&period=vecka&vecka=-2'), true)
    expect(p).toEqual({ tab: 'naring', kind: 'vecka', offset: -2 })
    expect(readParams(new URLSearchParams('period=30&vecka=-2'), true).offset).toBe(0)
    const w = writeParams(new URLSearchParams('flik=naring&vecka=-2'), { kind: '90' })
    expect(w.toString()).toBe('flik=naring&period=90')
    expect(writeParams(w, { tab: 'oversikt', kind: 'vecka', offset: -1 }).toString()).toBe('vecka=-1')
  })
})

describe('withCountedDays – idag räknas först när dagen är klar', () => {
  const week = makePeriod('vecka', 0, TODAY) // måndag 21 – lördag 26 september
  const logged = new Set(['2026-09-22', '2026-09-26'])
  const has = (d: string) => logged.has(d)

  it('tar bort dagens ofullständiga dag när andra dagar har registreringar', () => {
    const p = withCountedDays(week, TODAY, false, has)
    expect(p.elapsed).not.toContain(TODAY)
    expect(p.elapsed).toHaveLength(5)
    expect(p.todayExcluded).toBe(true)
    // Datumen för diagrammet är orörda.
    expect(p.dates).toEqual(week.dates)
    // Jämförelsen med förra veckan gäller lika många dagar.
    expect(previousPeriod(p, TODAY).elapsed).toHaveLength(5)
  })

  it('räknar med idag när dagen är markerad som klar', () => {
    expect(withCountedDays(week, TODAY, true, has)).toBe(week)
  })

  it('räknar med idag när den är den enda dagen med registreringar', () => {
    expect(withCountedDays(week, TODAY, false, (d) => d === TODAY)).toBe(week)
  })

  it('rör inte perioder som inte innehåller idag', () => {
    const last = makePeriod('vecka', -1, TODAY)
    expect(withCountedDays(last, TODAY, false, () => true)).toBe(last)
  })

  it('gäller även 30 dagar', () => {
    const p = withCountedDays(makePeriod('30', 0, TODAY), TODAY, false, has)
    expect(p.elapsed).toHaveLength(29)
    expect(p.elapsed.at(-1)).toBe('2026-09-25')
  })

  it('bygger rapportens rullande perioder (7, 14 och 30 dagar)', () => {
    expect(REPORT_DAYS).toEqual([7, 14, 30])
    const p = makeRollingPeriod(7, TODAY)
    expect(p).toMatchObject({ kind: 'dagar', start: '2026-09-20', end: TODAY, title: 'Senaste 7 dagarna', range: '20–26 sep', isCurrent: true })
    expect(p.dates).toHaveLength(7)
    expect(p.elapsed).toEqual(p.dates)
    expect(makeRollingPeriod(14, TODAY).phrase).toBe('de senaste 14 dagarna')
    const prev = previousPeriod(makeRollingPeriod(14, TODAY), TODAY)
    expect(prev.dates).toHaveLength(14)
    expect(prev.end).toBe('2026-09-12')
    // Orimliga värden ger en giltig period.
    expect(makeRollingPeriod(0, TODAY).dates).toHaveLength(1)
    expect(makeRollingPeriod(Number.NaN, TODAY).dates).toHaveLength(7)
  })
})
