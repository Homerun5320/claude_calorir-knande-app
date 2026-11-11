import type { FastRecord } from '../../stores/fastingStore'
import {
  dayAndTime,
  defaultStartTime,
  endMessage,
  FASTING_PROTOCOLS,
  fastingWeek,
  fastProgress,
  fastSucceeded,
  formatFastDuration,
  formatHms,
  guessStartDay,
  isTooShortFast,
  lastProtocolId,
  protocolById,
  resolveStartTime,
  shortDayAndTime,
  startParts,
  validateStart,
} from './fastingLogic'
import { BANNED_FASTING_WORDS } from './fastingTestUtils'

const H = 3_600_000
const M = 60_000

function rec(id: string, start: Date, hours: number, targetHours = 16, protocol = '16:8'): FastRecord {
  return { id, start: start.getTime(), end: start.getTime() + hours * H, targetHours, protocol }
}

describe('format', () => {
  it('timer h:mm:ss', () => {
    expect(formatHms(0)).toBe('0:00:00')
    expect(formatHms(5 * H + 3 * M + 9_000)).toBe('5:03:09')
    expect(formatHms(16 * H)).toBe('16:00:00')
    expect(formatHms(-5)).toBe('0:00:00')
  })

  it('varaktighet avrundas nedåt till hela minuter', () => {
    expect(formatFastDuration(16 * H + 5 * M + 59_000)).toBe('16 h 5 min')
    expect(formatFastDuration(45 * M)).toBe('45 min')
    expect(formatFastDuration(12 * H)).toBe('12 h')
  })

  it('dag och klockslag', () => {
    const today = '2026-09-26'
    expect(dayAndTime(new Date(2026, 8, 26, 12, 0).getTime(), today)).toBe('idag 12:00')
    expect(dayAndTime(new Date(2026, 8, 25, 20, 0).getTime(), today)).toBe('igår 20:00')
    expect(dayAndTime(new Date(2026, 8, 27, 8, 5).getTime(), today)).toBe('imorgon 08:05')
    expect(shortDayAndTime(new Date(2026, 8, 25, 20, 0).getTime(), today)).toBe('Igår 20:00')
    expect(shortDayAndTime(new Date(2026, 8, 24, 5, 19).getTime(), today)).toBe('24 sep 05:19')
  })
})

describe('fastProgress', () => {
  it('räknar förfluten och återstående tid', () => {
    const start = new Date(2026, 8, 25, 20, 0).getTime()
    const p = fastProgress({ start, targetHours: 16 }, start + 10 * H)
    expect(p.elapsedMs).toBe(10 * H)
    expect(p.remainingMs).toBe(6 * H)
    expect(p.ratio).toBeCloseTo(10 / 16)
    expect(p.done).toBe(false)
    expect(p.goalAt).toBe(start + 16 * H)
    const done = fastProgress({ start, targetHours: 16 }, start + 17 * H)
    expect(done.done).toBe(true)
    expect(done.remainingMs).toBe(0)
  })

  it('starttid i framtiden ger 0', () => {
    expect(fastProgress({ start: 1000, targetHours: 12 }, 0).elapsedMs).toBe(0)
  })
})

describe('starttid', () => {
  const now = new Date(2026, 8, 26, 9, 30)

  it('tolkar klockslag för idag och igår', () => {
    expect(resolveStartTime('20:00', 'igar', now)).toBe(new Date(2026, 8, 25, 20, 0).getTime())
    expect(resolveStartTime('08:15', 'idag', now)).toBe(new Date(2026, 8, 26, 8, 15).getTime())
    expect(resolveStartTime('22:00', 'forrgar', now)).toBe(new Date(2026, 8, 24, 22, 0).getTime())
    expect(resolveStartTime('25:00', 'idag', now)).toBeNull()
    expect(resolveStartTime('', 'idag', now)).toBeNull()
  })

  it('gissar dag: framtida klockslag betyder igår', () => {
    expect(guessStartDay('20:00', now)).toBe('igar')
    expect(guessStartDay('08:00', now)).toBe('idag')
  })

  it('startParts är inversen', () => {
    expect(startParts(new Date(2026, 8, 25, 20, 0).getTime(), now)).toEqual({ day: 'igar', time: '20:00' })
    expect(startParts(new Date(2026, 8, 26, 6, 5).getTime(), now)).toEqual({ day: 'idag', time: '06:05' })
  })

  it('validerar', () => {
    expect(validateStart(null, now.getTime())).toMatch(/klockslag/)
    expect(validateStart(now.getTime() + H, now.getTime())).toMatch(/framtiden/)
    expect(validateStart(now.getTime() - 80 * H, now.getTime())).toMatch(/72/)
    expect(validateStart(now.getTime() - 10 * H, now.getTime())).toBeNull()
  })

  it('förvald tid avrundas nedåt till kvart', () => {
    expect(defaultStartTime(new Date(2026, 8, 26, 20, 14))).toBe('20:00')
    expect(defaultStartTime(new Date(2026, 8, 26, 7, 59))).toBe('07:45')
  })
})

describe('historik', () => {
  it('mål nått med en minuts tolerans', () => {
    const start = new Date(2026, 8, 25, 20, 0)
    expect(fastSucceeded(rec('a', start, 16))).toBe(true)
    expect(fastSucceeded(rec('b', start, 16 - 0.5 / 60))).toBe(true)
    expect(fastSucceeded(rec('c', start, 15))).toBe(false)
  })

  it('veckosummering räknar fastor till dagen de avslutades', () => {
    const history = [
      rec('a', new Date(2026, 8, 21, 20, 0), 16), // slutar tis 22/9, klar
      rec('b', new Date(2026, 8, 23, 20, 0), 10), // slutar tors 24/9, påbörjad
      rec('c', new Date(2026, 8, 13, 20, 0), 16), // förra veckan
    ]
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']
    const w = fastingWeek(history, week)
    expect(w.count).toBe(2)
    expect(w.totalMs).toBe(26 * H)
    expect(w.averageMs).toBe(13 * H)
    expect(w.days.map((d) => d.ended)).toEqual([false, true, false, true, false, false, false])
    // Ingen poängtavla: varken nådda mål eller längsta fastan räknas.
    expect(Object.keys(w).sort()).toEqual(['averageMs', 'count', 'days', 'totalMs'])
  })

  it('räknar inte fastor som avslutats direkt (av misstag) i veckan', () => {
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27']
    const start = new Date(2026, 8, 23, 2, 30)
    const oops: FastRecord = { id: 'x', start: start.getTime(), end: start.getTime() + M, targetHours: 16, protocol: '16:8' }
    const w = fastingWeek([oops, rec('b', new Date(2026, 8, 23, 20, 0), 10)], week)
    expect(w.count).toBe(1)
    expect(w.averageMs).toBe(10 * H)
    expect(isTooShortFast(0)).toBe(true)
    expect(isTooShortFast(29 * M)).toBe(true)
    expect(isTooShortFast(30 * M)).toBe(false)
  })

  it('tom vecka', () => {
    const w = fastingWeek([], ['2026-09-21'])
    expect(w.count).toBe(0)
    expect(w.averageMs).toBe(0)
  })

  it('sakligt besked när målet nåddes – inget beröm eller firande', () => {
    const start = new Date(2026, 8, 25, 20, 0)
    expect(endMessage(rec('a', start, 16))).toBe('Fastan är sparad (16 h).')
    expect(endMessage(rec('a', start, 18))).not.toMatch(/Snyggt|Bra jobbat|Grattis|Fantastiskt|Bra!/i)
  })

  it('vänliga texter och senaste protokoll', () => {
    const start = new Date(2026, 8, 25, 20, 0)
    expect(endMessage(rec('b', start, 5))).toBe('Fastan är sparad (5 h). Det är helt okej att lyssna på kroppen.')
    expect(lastProtocolId([])).toBe('16:8')
    expect(lastProtocolId([rec('a', start, 14, 14, '14:10')])).toBe('14:10')
    expect(protocolById('18:6')?.fastHours).toBe(18)
    expect(protocolById('okänt')).toBeUndefined()
  })
})

describe('upplägg med längre förklaring', () => {
  it('har en förklaring för varje upplägg, utöver den korta beskrivningen', () => {
    expect(FASTING_PROTOCOLS.map((p) => p.id)).toEqual(['12:12', '14:10', '16:8', '18:6', '20:4'])
    for (const p of FASTING_PROTOCOLS) {
      expect(p.details.length, p.id).toBeGreaterThan(80)
      expect(p.details, p.id).not.toBe(p.description)
      // 2–4 meningar.
      const sentences = p.details.split(/(?<=[.!?])\s+/)
      expect(sentences.length, p.id).toBeGreaterThanOrEqual(2)
      expect(sentences.length, p.id).toBeLessThanOrEqual(4)
    }
  })

  it('timmarna i förklaringen är protokollets och exemplets klockslag går ihop', () => {
    for (const p of FASTING_PROTOCOLS) {
      expect(p.fastHours + p.eatHours, p.id).toBe(24)
      expect(p.details, p.id).toContain(`${p.fastHours} timmar utan mat`)
      expect(p.details, p.id).toContain(`${p.eatHours} timmar då du äter`)
      const eat = /mellan (\d{2}) och (\d{2})/.exec(p.details)
      const fast = /fastar du från (\d{2}) till (\d{2})/.exec(p.details)
      expect(eat, p.id).not.toBeNull()
      expect(fast, p.id).not.toBeNull()
      const [eatFrom, eatTo] = [Number(eat?.[1]), Number(eat?.[2])]
      const [fastFrom, fastTo] = [Number(fast?.[1]), Number(fast?.[2])]
      // Ätfönstret är lika långt som protokollet säger och fastan tar vid där det slutar.
      expect(eatTo - eatFrom, p.id).toBe(p.eatHours)
      expect(fastFrom, p.id).toBe(eatTo)
      expect(fastTo, p.id).toBe(eatFrom)
      expect((fastTo - fastFrom + 24) % 24, p.id).toBe(p.fastHours)
      // Samma exempel som i den korta beskrivningen ("ät 12–20").
      expect(p.description, p.id).toContain(`${String(eatFrom).padStart(2, '0')}–${String(eatTo).padStart(2, '0')}`)
    }
  })

  it('inga löften om hälsa eller viktnedgång, inget beröm och inga energisiffror', () => {
    for (const p of FASTING_PROTOCOLS) {
      for (const text of [p.title, p.description, p.details]) {
        expect(text, p.id).not.toMatch(BANNED_FASTING_WORDS)
        expect(text, p.id).not.toMatch(/kcal|kalori/i)
      }
      // Varsam ton: varje förklaring slutar i en lugn tanke, inte i ett krav.
      expect(p.details, p.id).not.toMatch(/måste|ska nå|nå målet/i)
      // Inget som gör upplägget till en trappa att gå uppför: ett kortare ätfönster är inte bättre (och ett längre inte sämre).
      for (const text of [p.title, p.description, p.details]) {
        expect(text, p.id).not.toMatch(/börja gärna med|för den vane|krävande|nästa nivå|trappa|jobba dig|avancerad/i)
      }
    }
  })
})
