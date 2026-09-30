import type { DiaryEntry, QuickEntry } from '../../types'
import {
  alcoholStatus,
  alcoholSummary,
  caffeineCurve,
  caffeineInBody,
  caffeineIntakes,
  caffeineLevel,
  caffeineLimitMg,
  entryMinutes,
  minutesToTime,
  sleepTip,
  timeToMinutes,
  waterPresets,
} from './drinksLogic'

function quick(id: string, date: string, nutrients: QuickEntry['nutrients'], time?: string): DiaryEntry {
  return { id, kind: 'quick', name: id, date, meal: 'fika', nutrients, time, createdAt: new Date(2026, 8, 26, 12, 0).getTime() }
}

describe('klockslag', () => {
  it('tolkar och formaterar', () => {
    expect(timeToMinutes('07:30')).toBe(450)
    expect(timeToMinutes('7:05')).toBe(425)
    expect(timeToMinutes('24:00')).toBeNaN()
    expect(timeToMinutes(undefined)).toBeNaN()
    expect(minutesToTime(450)).toBe('07:30')
    expect(minutesToTime(1440 + 60)).toBe('01:00')
  })

  it('använder registreringstiden när klockslag saknas', () => {
    expect(entryMinutes({ time: undefined, createdAt: new Date(2026, 8, 26, 14, 15).getTime() })).toBe(14 * 60 + 15)
    expect(entryMinutes({ time: '08:00', createdAt: 0 })).toBe(480)
  })
})

describe('koffein', () => {
  const entries = [
    quick('eftermiddag', '2026-09-26', { caffeine: 100 }, '15:00'),
    quick('morgon', '2026-09-26', { caffeine: 90 }, '07:00'),
    quick('okänt', '2026-09-26', { kcal: 100 }, '10:00'),
  ]

  it('listar intag sorterat på tid och hoppar över okänt koffein', () => {
    const intakes = caffeineIntakes(entries)
    expect(intakes.map((i) => i.name)).toEqual(['morgon', 'eftermiddag'])
  })

  it('halveras på ungefär 5 timmar', () => {
    const intakes = caffeineIntakes(entries)
    expect(caffeineInBody(intakes, 7 * 60)).toBeCloseTo(90)
    expect(caffeineInBody(intakes, 12 * 60)).toBeCloseTo(45)
    expect(caffeineInBody(intakes, 6 * 60)).toBe(0)
    // 22:00: 90 × 0,5^(15/5) + 100 × 0,5^(7/5)
    expect(caffeineInBody(intakes, 22 * 60)).toBeCloseTo(90 / 8 + 100 * Math.pow(0.5, 1.4))
  })

  it('kurvan har ett språng vid varje intag', () => {
    const curve = caffeineCurve(caffeineIntakes(entries), 6 * 60, 24 * 60, 60)
    const before = curve.find((p) => p.minute === 15 * 60 - 0.01)
    const at = curve.find((p) => p.minute === 15 * 60)
    expect(before && at && at.mg - before.mg).toBeCloseTo(100)
    expect(curve[0].minute).toBe(360)
    expect(curve[curve.length - 1].minute).toBe(1440)
  })

  it('nivåer mot riktmärket', () => {
    expect(caffeineLevel(0, 400)).toBe('inget')
    expect(caffeineLevel(200, 400)).toBe('lagom')
    expect(caffeineLevel(320, 400)).toBe('nara')
    expect(caffeineLevel(401, 400)).toBe('over')
    expect(caffeineLevel(250, 0)).toBe('lagom')
  })

  it('ger ungdomar under 18 år en gräns på 3 mg per kg kroppsvikt', () => {
    expect(caffeineLimitMg(400, 35, 70)).toBe(400)
    expect(caffeineLimitMg(200, 30, 70)).toBe(200)
    expect(caffeineLimitMg(400, undefined, 70)).toBe(400)
    expect(caffeineLimitMg(400, 15, 55)).toBe(165)
    expect(caffeineLimitMg(400, 17, 150)).toBe(400)
    expect(caffeineLimitMg(400, 14, undefined)).toBe(150)
    expect(caffeineLimitMg(0, 40, 70)).toBe(400)
  })

  it('sömntips beror på dagens sista kopp', () => {
    expect(sleepTip([])).toMatch(/halveringstid/)
    expect(sleepTip([{ id: 'a', name: 'a', minute: 19 * 60, mg: 80 }])).toMatch(/läggdags/)
    expect(sleepTip([{ id: 'a', name: 'a', minute: 9 * 60, mg: 80 }])).toMatch(/god tid/)
  })
})

describe('alkohol', () => {
  it('summerar standardglas per dag och vecka', () => {
    const byDate = {
      '2026-09-25': [quick('vin', '2026-09-25', { alcohol: 24 })],
      '2026-09-26': [quick('öl', '2026-09-26', { alcohol: 13.2 }), quick('öl2', '2026-09-26', { alcohol: 13.2 })],
    }
    const s = alcoholSummary(byDate, ['2026-09-24', '2026-09-25', '2026-09-26'])
    expect(s.total).toBeCloseTo(4.2)
    expect(s.maxDay).toBeCloseTo(2.2)
    expect(s.daysWithAlcohol).toBe(2)
    expect(s.days[0].drinks).toBe(0)
    expect(alcoholStatus(s)).toBe('under')
  })

  it('status mot Socialstyrelsens gränser', () => {
    expect(alcoholStatus({ total: 0, maxDay: 0 })).toBe('inget')
    expect(alcoholStatus({ total: 9.96, maxDay: 3 })).toBe('over') // visas som 10
    expect(alcoholStatus({ total: 9.9, maxDay: 3 })).toBe('under')
    expect(alcoholStatus({ total: 9, maxDay: 3 })).toBe('under')
    expect(alcoholStatus({ total: 5, maxDay: 4 })).toBe('over')
  })
})

describe('vatten', () => {
  it('snabbval följer glasstorleken', () => {
    expect(waterPresets(200)[0].ml).toBe(200)
    expect(waterPresets(0)[0].ml).toBe(250)
    expect(waterPresets(250)[1].ml).toBe(500)
  })
})
