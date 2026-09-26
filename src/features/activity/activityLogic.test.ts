import type { ExerciseEntry } from '../../types'
import {
  addBackKcal,
  effectiveMet,
  entryEmoji,
  entryNameFor,
  estimateSteps,
  filterActivities,
  isStrengthSession,
  isValidISODate,
  movementMessage,
  nearestCustomIntensity,
  netKcal,
  restingKcalDuring,
  speedKindFor,
  weekMovement,
  weekOf,
} from './activityLogic'

function ex(partial: Partial<ExerciseEntry> & Pick<ExerciseEntry, 'date' | 'activityId' | 'minutes'>): ExerciseEntry {
  return { id: `x_${Math.random()}`, name: partial.activityId, kcal: 0, createdAt: 0, ...partial }
}

describe('isValidISODate', () => {
  it('godtar riktiga datum och avvisar felaktiga', () => {
    expect(isValidISODate('2026-09-26')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('26-09-2026')).toBe(false)
    expect(isValidISODate(null)).toBe(false)
  })
})

describe('weekOf', () => {
  it('ger måndag till söndag', () => {
    const week = weekOf('2026-09-26') // lördag
    expect(week).toHaveLength(7)
    expect(week[0]).toBe('2026-09-21')
    expect(week[6]).toBe('2026-09-27')
  })
})

describe('weekMovement', () => {
  it('räknar hög intensitet dubbelt och lätt inte alls', () => {
    const exercise = {
      '2026-09-21': [ex({ date: '2026-09-21', activityId: 'promenad-rask', minutes: 30 })], // 4,8 MET → 30
      '2026-09-22': [ex({ date: '2026-09-22', activityId: 'lopning-10', minutes: 20 })], // 9,3 MET → 40
      '2026-09-23': [ex({ date: '2026-09-23', activityId: 'yoga', minutes: 60 })], // 2,3 MET → 0
      '2026-09-24': [ex({ date: '2026-09-24', activityId: 'styrka-latt', minutes: 45 })], // 3,5 MET → 45, styrka
    }
    const w = weekMovement(exercise, weekOf('2026-09-21'))
    expect(w.totalMinutes).toBe(155)
    expect(w.activeMinutes).toBe(115)
    expect(w.activeDays).toBe(4)
    expect(w.strengthSessions).toBe(1)
    expect(w.ratio).toBeCloseTo(115 / 150)
    expect(w.days[1]).toEqual({ date: '2026-09-22', minutes: 20, activeMinutes: 40 })
  })

  it('använder postens eget MET-värde för egna aktiviteter', () => {
    const w = weekMovement({ '2026-09-21': [ex({ date: '2026-09-21', activityId: 'custom', minutes: 30, met: 7 })] }, ['2026-09-21'])
    expect(w.activeMinutes).toBe(60)
  })

  it('tom vecka', () => {
    const w = weekMovement({}, weekOf('2026-09-21'))
    expect(w.totalMinutes).toBe(0)
    expect(w.activeMinutes).toBe(0)
    expect(w.days).toHaveLength(7)
  })
})

describe('isStrengthSession', () => {
  it('räknar styrka men inte lugn yoga eller stretching', () => {
    expect(isStrengthSession({ activityId: 'styrka-hard' })).toBe(true)
    expect(isStrengthSession({ activityId: 'yoga' })).toBe(false)
    expect(isStrengthSession({ activityId: 'stretching' })).toBe(false)
    expect(isStrengthSession({ activityId: 'promenad' })).toBe(false)
  })
})

describe('movementMessage', () => {
  it('är uppmuntrande i alla lägen och utan streaks', () => {
    const texts = [movementMessage(0, 0), movementMessage(0, 30), movementMessage(20, 20), movementMessage(80, 80), movementMessage(120, 120), movementMessage(200, 200)]
    for (const t of texts) {
      expect(t.length).toBeGreaterThan(10)
      expect(t.toLowerCase()).not.toMatch(/streak|misslyck|för lite|måste/)
    }
    expect(movementMessage(150, 150)).toMatch(/nådda/)
  })
})

describe('energi', () => {
  it('räknar nettokcal utöver vila', () => {
    // (4,8 − 1) × 70 kg × 0,5 h = 133
    expect(netKcal(4.8, 70, 30)).toBe(133)
    expect(netKcal(1, 70, 60)).toBe(0)
  })

  it('vilan under passet', () => {
    expect(restingKcalDuring(70, 60)).toBe(70)
    expect(restingKcalDuring(0, 60)).toBe(0)
  })

  it('andel till budgeten begränsas till 0–100 %', () => {
    expect(addBackKcal(300, 50)).toBe(150)
    expect(addBackKcal(300, 150)).toBe(300)
    expect(addBackKcal(300, -10)).toBe(0)
  })
})

describe('effectiveMet', () => {
  it('räknar om löpning utifrån fart', () => {
    const r = effectiveMet('lopning-10', 9.3, 10, 50) // 12 km/h
    expect(r.fromSpeed).toBe(true)
    expect(r.speed).toBeCloseTo(12)
    expect(r.met).toBeGreaterThan(11)
  })

  it('behåller aktivitetens värde vid orimlig fart eller utan sträcka', () => {
    expect(effectiveMet('promenad', 3.8, 20, 60)).toMatchObject({ met: 3.8, fromSpeed: false }) // 20 km/h promenad
    expect(effectiveMet('promenad', 3.8, undefined, 60)).toEqual({ met: 3.8, fromSpeed: false, speed: undefined })
    expect(effectiveMet('yoga', 2.3, 5, 60)).toMatchObject({ met: 2.3, fromSpeed: false, speed: 5 })
  })

  it('döper om löpning efter den faktiska farten', () => {
    const a = { id: 'lopning-10', name: 'Löpning 10 km/h (6:00 min/km)' }
    expect(entryNameFor(a, effectiveMet(a.id, 9.3, 8, 30), 8, 30)).toBe('Löpning 16 km/h (3:45 min/km)')
    expect(entryNameFor(a, effectiveMet(a.id, 9.3, undefined, 30), undefined, 30)).toBe(a.name)
    const walk = { id: 'promenad', name: 'Promenad, normal takt' }
    expect(entryNameFor(walk, effectiveMet(walk.id, 3.8, 5, 60), 5, 60)).toBe(walk.name)
  })

  it('känner igen fartaktiviteter', () => {
    expect(speedKindFor('lopning-12')).toBe('lopning')
    expect(speedKindFor('promenad-rask')).toBe('gang')
    expect(speedKindFor('cykel-19-22')).toBe('cykling')
    expect(speedKindFor('terranglopning')).toBeNull()
    expect(speedKindFor(undefined)).toBeNull()
  })
})

describe('estimateSteps', () => {
  it('räknar bara steg över aktivitetsnivåns baslinje som extra', () => {
    const e = estimateSteps(10000, 70, 'latt', 170)
    expect(e.baseline).toBe(7500)
    expect(e.extraSteps).toBe(2500)
    expect(e.extraMinutes).toBe(25)
    expect(e.km).toBeGreaterThan(6.5)
    expect(e.kcal).toBeGreaterThan(e.extraKcal)
    expect(e.extraKcal).toBeGreaterThan(0)
  })

  it('under baslinjen blir extra 0', () => {
    const e = estimateSteps(4000, 70, 'aktiv')
    expect(e.extraSteps).toBe(0)
    expect(e.extraKcal).toBe(0)
  })

  it('tål ogiltiga värden', () => {
    expect(estimateSteps(Number.NaN, 70, 'latt').kcal).toBe(0)
  })
})

describe('filterActivities', () => {
  it('filtrerar på grupp och sökord', () => {
    expect(filterActivities('', 'vinter').every((a) => a.group === 'vinter')).toBe(true)
    const hits = filterActivities('skidor', 'alla')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((a) => a.id.startsWith('langd'))).toBe(true)
    expect(filterActivities('pingis', 'vinter')).toHaveLength(0)
  })
})

describe('övrigt', () => {
  it('närmaste förval för egen intensitet', () => {
    expect(nearestCustomIntensity(2)).toBe('latt')
    expect(nearestCustomIntensity(5)).toBe('mattlig')
    expect(nearestCustomIntensity(9)).toBe('hog')
    expect(nearestCustomIntensity(undefined)).toBe('mattlig')
  })

  it('emoji för poster', () => {
    expect(entryEmoji({ activityId: 'steg' })).toBe('👟')
    expect(entryEmoji({ activityId: 'custom' })).toBe('⭐')
    expect(entryEmoji({ activityId: 'yoga' })).toBe('🧘')
  })
})
