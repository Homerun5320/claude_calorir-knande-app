import { describe, expect, it } from 'vitest'
import {
  allSaintsDay,
  easterSunday,
  fatTuesday,
  fathersDay,
  firstAdvent,
  foodDayCountdown,
  foodDayFor,
  foodDaysForYear,
  foodDaysInMonth,
  lastWeekdayOfMonth,
  lobsterPremiere,
  midsummerEve,
  mothersDay,
  nextFoodDay,
  nthWeekdayOfMonth,
  princessCakeWeek,
  surstrommingPremiere,
  upcomingFoodDays,
  vasaloppet,
  weekdayOnOrAfter,
  worldEggDay,
  WEEKDAY,
} from './swedishCalendar'
import { isoWeek, weekdayIndex } from './dates'

describe('påsk och rörliga helgdagar', () => {
  it('påskdagen enligt gregoriansk algoritm', () => {
    expect(easterSunday(2024)).toBe('2024-03-31')
    expect(easterSunday(2025)).toBe('2025-04-20')
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
    expect(easterSunday(2028)).toBe('2028-04-16')
    expect(easterSunday(2038)).toBe('2038-04-25') // senast möjliga
    expect(easterSunday(2285)).toBe('2285-03-22') // tidigast möjliga
    expect(easterSunday(2000)).toBe('2000-04-23')
  })

  it('påskdagen är alltid en söndag mellan 22 mars och 25 april', () => {
    for (let y = 1900; y <= 2100; y++) {
      const d = easterSunday(y)
      expect(weekdayIndex(d)).toBe(WEEKDAY.sondag)
      expect(d >= `${y}-03-22` && d <= `${y}-04-25`).toBe(true)
    }
  })

  it('fettisdagen är tisdagen 47 dagar före påskdagen', () => {
    expect(fatTuesday(2024)).toBe('2024-02-13')
    expect(fatTuesday(2025)).toBe('2025-03-04')
    expect(fatTuesday(2026)).toBe('2026-02-17')
    expect(fatTuesday(2027)).toBe('2027-02-09')
    for (let y = 2000; y <= 2050; y++) expect(weekdayIndex(fatTuesday(y))).toBe(WEEKDAY.tisdag)
  })

  it('midsommarafton är fredagen 19–25 juni', () => {
    expect(midsummerEve(2024)).toBe('2024-06-21')
    expect(midsummerEve(2025)).toBe('2025-06-20')
    expect(midsummerEve(2026)).toBe('2026-06-19')
    expect(midsummerEve(2027)).toBe('2027-06-25')
    expect(isoWeek(midsummerEve(2026))).toBe(25)
    expect(isoWeek(midsummerEve(2004))).toBe(26)
    for (let y = 2000; y <= 2050; y++) {
      const d = midsummerEve(y)
      expect(weekdayIndex(d)).toBe(WEEKDAY.fredag)
      expect(Number(d.slice(8))).toBeGreaterThanOrEqual(19)
      expect(Number(d.slice(8))).toBeLessThanOrEqual(25)
      expect(isoWeek(d)).toBeGreaterThanOrEqual(25)
      expect(isoWeek(d)).toBeLessThanOrEqual(26)
    }
  })

  it('alla helgons dag, första advent, mors och fars dag', () => {
    expect(allSaintsDay(2025)).toBe('2025-11-01')
    expect(allSaintsDay(2026)).toBe('2026-10-31')
    expect(firstAdvent(2025)).toBe('2025-11-30')
    expect(firstAdvent(2026)).toBe('2026-11-29')
    expect(mothersDay(2025)).toBe('2025-05-25')
    expect(mothersDay(2026)).toBe('2026-05-31')
    expect(fathersDay(2025)).toBe('2025-11-09')
    expect(fathersDay(2026)).toBe('2026-11-08')
  })

  it('surströmming, hummer, Vasaloppet och Äggets dag', () => {
    expect(surstrommingPremiere(2025)).toBe('2025-08-21')
    expect(surstrommingPremiere(2026)).toBe('2026-08-20')
    expect(lobsterPremiere(2025)).toBe('2025-09-22')
    expect(lobsterPremiere(2026)).toBe('2026-09-21')
    expect(vasaloppet(2026)).toBe('2026-03-01')
    expect(worldEggDay(2025)).toBe('2025-10-10')
    expect(worldEggDay(2026)).toBe('2026-10-09')
  })

  it('Prinsesstårtans vecka är sista hela veckan i september', () => {
    expect(princessCakeWeek(2021)).toEqual({ start: '2021-09-20', end: '2021-09-26' })
    expect(princessCakeWeek(2026)).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    for (const y of [2024, 2025, 2026]) expect(isoWeek(princessCakeWeek(y).start)).toBe(39)
    expect(isoWeek(princessCakeWeek(2021).start)).toBe(38)
  })

  it('veckodagshjälpare', () => {
    expect(weekdayOnOrAfter('2026-09-26', WEEKDAY.lordag)).toBe('2026-09-26')
    expect(weekdayOnOrAfter('2026-09-26', WEEKDAY.mandag)).toBe('2026-09-28')
    expect(nthWeekdayOfMonth(2026, 8, WEEKDAY.torsdag, 1)).toBe('2026-08-06')
    expect(lastWeekdayOfMonth(2026, 2, WEEKDAY.lordag)).toBe('2026-02-28')
    expect(lastWeekdayOfMonth(2024, 2, WEEKDAY.torsdag)).toBe('2024-02-29')
  })
})

describe('matkalendern', () => {
  const year = foodDaysForYear(2026)

  it('innehåller de fasta matdagarna på rätt datum', () => {
    const byKey = Object.fromEntries(year.map((d) => [d.key, d.date]))
    expect(byKey['vaffeldagen']).toBe('2026-03-25')
    expect(byKey['valborg']).toBe('2026-04-30')
    expect(byKey['chokladbollens-dag']).toBe('2026-05-11')
    expect(byKey['nationaldagen']).toBe('2026-06-06')
    expect(byKey['kanelbullens-dag']).toBe('2026-10-04')
    expect(byKey['gustav-adolfsdagen']).toBe('2026-11-06')
    expect(byKey['kladdkakans-dag']).toBe('2026-11-07')
    expect(byKey['martensafton']).toBe('2026-11-10')
    expect(byKey['pepparkakans-dag']).toBe('2026-12-09')
    expect(byKey['lucia']).toBe('2026-12-13')
    expect(byKey['julafton']).toBe('2026-12-24')
    expect(byKey['nyarsafton']).toBe('2026-12-31')
    expect(byKey['paskafton']).toBe('2026-04-04')
    expect(byKey['langfredagen']).toBe('2026-04-03')
    expect(byKey['skartorsdagen']).toBe('2026-04-02')
  })

  it('har emoji som stämmer med dagen', () => {
    const emoji = (key: string) => year.find((d) => d.key === key)?.emoji
    expect(emoji('prinsesstartans-vecka')).toBe('🍰')
    expect(emoji('vasaloppet')).toBe('🎿')
    expect(emoji('knackebrodets-dag')).toBe('🫓')
    expect(emoji('chokladbollens-dag')).toBe('🥥')
    expect(emoji('lingonsasong')).toBe('🌲')
    expect(emoji('hummerpremiar')).toBe('🦞')
    // Inga abstrakta symboler som kan läsas som status eller varning.
    for (const d of year) expect(d.emoji).not.toMatch(/[🔴🟠🟡🟢🔵🟣⚫⚪❗❓⚠]/u)
  })

  it('är sorterad, har unika id:n och fullständigt innehåll', () => {
    const ids = new Set(year.map((d) => d.id))
    expect(ids.size).toBe(year.length)
    for (let i = 1; i < year.length; i++) expect(year[i - 1].date <= year[i].date).toBe(true)
    for (const d of year) {
      expect(d.date.startsWith('2026-')).toBe(true)
      expect(d.name.length).toBeGreaterThan(2)
      expect(d.emoji.length).toBeGreaterThan(0)
      expect(d.description.length).toBeGreaterThan(60)
      expect(d.foods.length).toBeGreaterThan(0)
      expect(d.weekly).toBeUndefined()
      // Ingen skuld: inga "bränn", "synd", "fusk" eller "förbjud" i tipsen.
      expect(d.tip ?? '').not.toMatch(/bränn|synd|fusk|förbjud|skäm/i)
    }
  })

  it('returnerar kopior som inte påverkar cachen', () => {
    const a = foodDaysForYear(2026)
    a[0].foods.push('test')
    a.pop()
    const b = foodDaysForYear(2026)
    expect(b.length).toBe(year.length)
    expect(b[0].foods).not.toContain('test')
  })

  it('foodDayFor hittar dagens händelser och veckotraditioner', () => {
    expect(foodDayFor('2026-10-04').map((d) => d.key)).toEqual(['kanelbullens-dag'])
    // Torsdag = ärtsoppa, fredag = fredagsmys, lördag = lördagsgodis
    expect(foodDayFor('2026-10-01').map((d) => d.key)).toEqual(['artsoppa-torsdag'])
    expect(foodDayFor('2026-10-02').map((d) => d.key)).toEqual(['fredagsmys'])
    expect(foodDayFor('2026-10-03').map((d) => d.key)).toEqual(['lordagsgodis'])
    expect(foodDayFor('2026-10-05')).toEqual([])
    const weekly = foodDayFor('2026-10-01')[0]
    expect(weekly.weekly).toBe(true)
    expect(weekly.id).toBe('artsoppa-torsdag@2026-10-01')
  })

  it('veckotraditionen utelämnas på högtider', () => {
    // Julafton 2026 är en torsdag, långfredagen en fredag.
    expect(foodDayFor('2026-12-24').map((d) => d.key)).toEqual(['julafton'])
    expect(foodDayFor('2026-04-03').map((d) => d.key)).toEqual(['langfredagen'])
    // Skärtorsdagen är en tradition, inte en högtid – båda visas, traditionen först.
    expect(foodDayFor('2026-04-02').map((d) => d.key)).toEqual(['skartorsdagen', 'artsoppa-torsdag'])
  })

  it('perioder syns varje dag de pågår', () => {
    // 2026-09-26 är en lördag mitt i Prinsesstårtans vecka.
    const keys = foodDayFor('2026-09-26').map((d) => d.key)
    expect(keys).toContain('prinsesstartans-vecka')
    expect(keys).toContain('lordagsgodis')
    expect(foodDayFor('2026-09-28').map((d) => d.key)).not.toContain('prinsesstartans-vecka')
  })

  it('upcomingFoodDays räknar in pågående perioder och går över årsskiftet', () => {
    const next = upcomingFoodDays('2026-09-26', 4)
    expect(next.map((d) => d.key)).toEqual(['prinsesstartans-vecka', 'matsvinnsdagen', 'kaffets-dag', 'kanelbullens-dag'])
    expect(next.every((d) => !d.weekly)).toBe(true)
    const newYear = upcomingFoodDays('2026-12-30', 3)
    expect(newYear.map((d) => d.date)).toEqual(['2026-12-31', '2027-01-01', '2027-01-06'])
    expect(upcomingFoodDays('2026-01-01', 0)).toEqual([])
  })

  it('foodDaysInMonth och nextFoodDay', () => {
    const december = foodDaysInMonth(2026, 12).map((d) => d.key)
    expect(december).toEqual(['pepparkakans-dag', 'lucia', 'julafton', 'nyarsafton'])
    expect(nextFoodDay('fettisdagen', '2026-09-26')?.date).toBe('2027-02-09')
    expect(nextFoodDay('kanelbullens-dag', '2026-09-26')?.date).toBe('2026-10-04')
    expect(nextFoodDay('finns-inte', '2026-09-26')).toBeUndefined()
  })

  it('nedräkning på svenska', () => {
    expect(foodDayCountdown({ date: '2026-10-04' }, '2026-10-04')).toBe('Idag')
    expect(foodDayCountdown({ date: '2026-10-04' }, '2026-10-03')).toBe('Imorgon')
    expect(foodDayCountdown({ date: '2026-10-04' }, '2026-09-26')).toBe('Om 8 dagar')
    expect(foodDayCountdown({ date: '2026-11-10' }, '2026-09-26')).toBe('Om 6 veckor')
    expect(foodDayCountdown({ date: '2026-12-24' }, '2026-09-26')).toBe('Om 3 månader')
    expect(foodDayCountdown({ date: '2026-09-21', endDate: '2026-09-27' }, '2026-09-26')).toBe('Pågår')
    expect(foodDayCountdown({ date: '2026-09-01' }, '2026-09-26')).toBe('Har varit')
  })
})
