import { describe, expect, it } from 'vitest'
import {
  cityById,
  seasonLabel,
  seasonalProduce,
  seasonalProduceFor,
  skyPhase,
  sunAltitude,
  sunTimes,
  swedishSeason,
  SWEDISH_CITIES,
} from './season'

/** Minuter mellan en beräknad tid och en förväntad UTC-tid. */
function minutesOff(actual: Date | null, isoUtc: string): number {
  if (!actual) return Number.POSITIVE_INFINITY
  return Math.abs(actual.getTime() - new Date(isoUtc).getTime()) / 60_000
}

const city = (id: string) => {
  const c = cityById(id)
  if (!c) throw new Error(id)
  return c
}

describe('årstider', () => {
  it('följer den kalenderbaserade indelningen', () => {
    expect(swedishSeason('2026-01-15')).toBe('vinter')
    expect(swedishSeason('2026-02-28')).toBe('vinter')
    expect(swedishSeason('2026-03-01')).toBe('var')
    expect(swedishSeason('2026-05-31')).toBe('var')
    expect(swedishSeason('2026-06-01')).toBe('sommar')
    expect(swedishSeason('2026-08-31')).toBe('sommar')
    expect(swedishSeason('2026-09-26')).toBe('host')
    expect(swedishSeason('2026-11-30')).toBe('host')
    expect(swedishSeason('2026-12-01')).toBe('vinter')
    expect(swedishSeason(new Date(2026, 6, 1))).toBe('sommar')
  })

  it('har svenska etiketter', () => {
    expect(seasonLabel('var')).toBe('Vår')
    expect(seasonLabel('host')).toBe('Höst')
  })
})

describe('solens upp- och nedgång (NOAA)', () => {
  it('Stockholm vid sommar- och vintersolståndet', () => {
    const { lat, lon } = city('stockholm')
    const summer = sunTimes('2026-06-21', lat, lon)
    // 03.31 och 22.08 svensk sommartid
    expect(minutesOff(summer.sunrise, '2026-06-21T01:31:00Z')).toBeLessThan(3)
    expect(minutesOff(summer.sunset, '2026-06-21T20:08:00Z')).toBeLessThan(3)
    expect(summer.daylightHours).toBeGreaterThan(18.4)
    expect(summer.daylightHours).toBeLessThan(18.8)
    expect(summer.polar).toBeNull()

    const winter = sunTimes('2026-12-21', lat, lon)
    // 08.43 och 14.48 svensk normaltid
    expect(minutesOff(winter.sunrise, '2026-12-21T07:43:00Z')).toBeLessThan(3)
    expect(minutesOff(winter.sunset, '2026-12-21T13:48:00Z')).toBeLessThan(3)
    expect(winter.daylightHours).toBeGreaterThan(5.9)
    expect(winter.daylightHours).toBeLessThan(6.3)
  })

  it('Malmö vid vintersolståndet och standardorten Stockholm', () => {
    const { lat, lon } = city('malmo')
    const t = sunTimes('2026-12-21', lat, lon)
    expect(minutesOff(t.sunrise, '2026-12-21T07:35:00Z')).toBeLessThan(3)
    expect(minutesOff(t.sunset, '2026-12-21T14:37:00Z')).toBeLessThan(3)
    // Utan plats används Stockholm.
    expect(minutesOff(sunTimes('2026-12-21').sunrise, '2026-12-21T07:43:00Z')).toBeLessThan(3)
  })

  it('dagjämning ger ungefär tolv timmar överallt', () => {
    for (const c of SWEDISH_CITIES) {
      const t = sunTimes('2026-03-20', c.lat, c.lon)
      expect(t.daylightHours).toBeGreaterThan(11.9)
      expect(t.daylightHours).toBeLessThan(12.5)
    }
  })

  it('midnattssol och polarnatt i Kiruna', () => {
    const { lat, lon } = city('kiruna')
    const june = sunTimes('2026-06-21', lat, lon)
    expect(june.polar).toBe('midnattssol')
    expect(june.sunrise).toBeNull()
    expect(june.sunset).toBeNull()
    expect(june.daylightHours).toBe(24)

    const december = sunTimes('2026-12-15', lat, lon)
    expect(december.polar).toBe('polarnatt')
    expect(december.daylightHours).toBe(0)

    // Utanför perioderna går solen upp och ner.
    expect(sunTimes('2026-08-15', lat, lon).polar).toBeNull()
    expect(sunTimes('2026-12-05', lat, lon).polar).toBeNull()
  })

  it('ingen polarnatt eller midnattssol i södra Sverige', () => {
    for (const date of ['2026-06-21', '2026-12-21']) {
      expect(sunTimes(date, city('stockholm').lat, city('stockholm').lon).polar).toBeNull()
      expect(sunTimes(date, city('umea').lat, city('umea').lon).polar).toBeNull()
    }
  })

  it('soluppgång före sann middag före solnedgång', () => {
    const t = sunTimes('2026-09-26')
    expect(t.sunrise!.getTime()).toBeLessThan(t.solarNoon.getTime())
    expect(t.solarNoon.getTime()).toBeLessThan(t.sunset!.getTime())
  })
})

describe('himlens fas', () => {
  it('följer dygnet i Stockholm en septemberdag', () => {
    expect(skyPhase(new Date('2026-09-26T01:00:00+02:00'))).toBe('natt')
    expect(skyPhase(new Date('2026-09-26T07:00:00+02:00'))).toBe('gryning')
    expect(skyPhase(new Date('2026-09-26T12:00:00+02:00'))).toBe('dag')
    expect(skyPhase(new Date('2026-09-26T19:00:00+02:00'))).toBe('skymning')
    expect(skyPhase(new Date('2026-09-26T22:00:00+02:00'))).toBe('natt')
  })

  it('polarnattens middag är skymningsljus och midnattssolen ger aldrig natt', () => {
    const { lat, lon } = city('kiruna')
    expect(skyPhase(new Date('2026-12-15T11:00:00+01:00'), lat, lon)).toBe('gryning')
    expect(skyPhase(new Date('2026-12-15T13:00:00+01:00'), lat, lon)).toBe('skymning')
    for (let h = 0; h < 24; h++) {
      const time = new Date(`2026-06-21T${String(h).padStart(2, '0')}:00:00+02:00`)
      expect(skyPhase(time, lat, lon)).not.toBe('natt')
    }
  })

  it('solhöjden är rimlig', () => {
    // Stockholm, sann middag vid sommarsolståndet: 90 − 59,33 + 23,44 ≈ 54°
    expect(sunAltitude(new Date('2026-06-21T10:50:00Z'))).toBeCloseTo(54.1, 0)
    expect(sunAltitude(new Date('2026-12-21T10:46:00Z'))).toBeCloseTo(7.2, 0)
  })
})

describe('säsongens råvaror', () => {
  it('september har svamp, äpplen, lingon, rotfrukter och kål', () => {
    const names = seasonalProduce(9).map((p) => p.name)
    for (const n of ['Kantareller', 'Äpplen', 'Plommon', 'Lingon', 'Blåbär', 'Morötter', 'Vitkål', 'Hummer']) {
      expect(names).toContain(n)
    }
  })

  it('juni har färskpotatis och jordgubbar men inte lingon', () => {
    const names = seasonalProduce(6).map((p) => p.name)
    expect(names).toContain('Färskpotatis')
    expect(names).toContain('Jordgubbar')
    expect(names).not.toContain('Lingon')
  })

  it('alla månader har innehåll, sorterat efter typ och utan dubbletter', () => {
    const order = ['grönsak', 'frukt', 'bär', 'svamp', 'fisk']
    for (let m = 1; m <= 12; m++) {
      const list = seasonalProduce(m)
      expect(list.length).toBeGreaterThan(8)
      expect(new Set(list.map((p) => p.name)).size).toBe(list.length)
      const kinds = list.map((p) => order.indexOf(p.kind))
      expect([...kinds].sort((a, b) => a - b)).toEqual(kinds)
    }
  })

  it('räknar om månader utanför 1–12 och returnerar kopior', () => {
    expect(seasonalProduce(13)).toEqual(seasonalProduce(1))
    expect(seasonalProduce(0)).toEqual(seasonalProduce(12))
    const a = seasonalProduce(9)
    a[0].name = 'Ändrad'
    expect(seasonalProduce(9)[0].name).not.toBe('Ändrad')
    expect(seasonalProduceFor('2026-09-26')).toEqual(seasonalProduce(9))
  })
})
