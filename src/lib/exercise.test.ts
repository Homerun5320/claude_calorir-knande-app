import { describe, expect, it } from 'vitest'
import {
  activityEquivalents,
  exerciseKcal,
  metForSpeed,
  metIntensity,
  minutesForKcal,
  moderateEquivalentMinutes,
  paceMinPerKm,
  searchActivities,
  speedKmh,
  STEP_BASELINE,
  stepsKcalAboveBaseline,
  stepsToKcal,
  stepsToKm,
  strideLengthM,
} from './exercise'
import { ACTIVITIES, ACTIVITY_GROUP_ORDER, activitiesByGroup, getActivity, POPULAR_ACTIVITY_IDS } from '../data/activities'
import { TIPS, TIP_CATEGORIES, tipForDate, tipsForPeriod } from '../data/tips'
import { addDays } from './dates'

describe('exerciseKcal – netto utöver vila', () => {
  it('(MET − 1) × vikt × timmar', () => {
    // Rask promenad 4,8 MET, 70 kg, 30 min: 3,8 × 70 × 0,5 = 133 kcal
    expect(exerciseKcal(4.8, 70, 30)).toBeCloseTo(133, 6)
    // Löpning 10 km/h (9,3 MET), 80 kg, 60 min: 8,3 × 80 = 664 kcal
    expect(exerciseKcal(9.3, 80, 60)).toBeCloseTo(664, 6)
    // Yoga 2,3 MET, 60 kg, 45 min: 1,3 × 60 × 0,75 = 58,5 kcal
    expect(exerciseKcal(2.3, 60, 45)).toBeCloseTo(58.5, 6)
  })

  it('räknar inte vilan två gånger och blir aldrig negativ', () => {
    expect(exerciseKcal(1, 70, 60)).toBe(0)
    expect(exerciseKcal(0.8, 70, 60)).toBe(0)
    expect(exerciseKcal(5, 70, 0)).toBe(0)
    expect(exerciseKcal(5, 70, -10)).toBe(0)
    expect(exerciseKcal(Number.NaN, 70, 30)).toBe(0)
  })

  it('kan använda personlig vilometabolism (korrigerad MET)', () => {
    // BMR 1 440 kcal/dygn = 60 kcal/h. 5 MET i 60 min: 4 × 60 = 240 kcal
    expect(exerciseKcal(5, 80, 60, 1440)).toBeCloseTo(240, 6)
    // Ogiltig BMR faller tillbaka på vikten.
    expect(exerciseKcal(5, 80, 60, 0)).toBeCloseTo(320, 6)
  })

  it('minutesForKcal är inversen', () => {
    const minutes = minutesForKcal(200, 4.8, 70)
    expect(exerciseKcal(4.8, 70, minutes)).toBeCloseTo(200, 6)
    expect(minutes).toBeCloseTo(45.1, 1) // "En kanelbulle ≈ 45 min rask promenad"
    expect(minutesForKcal(0, 4.8, 70)).toBe(0)
    expect(minutesForKcal(100, 1, 70)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('intensitet och veckomål', () => {
  it('klassar enligt WHO/FYSS', () => {
    expect(metIntensity(2.3)).toBe('lätt')
    expect(metIntensity(3)).toBe('måttlig')
    expect(metIntensity(5.9)).toBe('måttlig')
    expect(metIntensity(6)).toBe('hög')
  })

  it('räknar hög intensitet dubbelt och lätt inte alls', () => {
    const minutes = moderateEquivalentMinutes([
      { activityId: 'promenad-rask', minutes: 30 }, // måttlig → 30
      { activityId: 'lopning-10', minutes: 20 }, // hög → 40
      { activityId: 'yoga', minutes: 60 }, // lätt → 0
      { activityId: 'custom', minutes: 15, met: 7 }, // hög via eget MET → 30
      { activityId: 'okand', minutes: 99 }, // okänd → 0
    ])
    expect(minutes).toBe(100)
  })
})

describe('steg', () => {
  it('steglängd och sträcka', () => {
    expect(strideLengthM(170)).toBeCloseTo(0.704, 3)
    expect(strideLengthM()).toBe(0.7)
    expect(strideLengthM(40)).toBe(0.7)
    expect(stepsToKm(10_000, 170)).toBeCloseTo(7.04, 2)
    expect(stepsToKm(-5)).toBe(0)
  })

  it('ungefär 0,0004 kcal per steg och kg netto', () => {
    const kcal = stepsToKcal(10_000, 70, 170)
    expect(kcal).toBeGreaterThan(260)
    expect(kcal).toBeLessThan(290)
    expect(kcal / 10_000 / 70).toBeCloseTo(0.0004, 4)
    expect(stepsToKcal(10_000, 0)).toBe(0)
  })

  it('räknar bara steg över PAL-nivåns baslinje', () => {
    expect(stepsKcalAboveBaseline(4000, 70, 'stillasittande')).toBe(0)
    expect(stepsKcalAboveBaseline(STEP_BASELINE.latt + 5000, 70, 'latt', 170)).toBeCloseTo(stepsToKcal(5000, 70, 170), 6)
  })
})

describe('MET från fart', () => {
  it('träffar kompendiets värden och interpolerar däremellan', () => {
    expect(metForSpeed('lopning', 12.1)).toBe(11.8)
    expect(metForSpeed('gang', 5)).toBe(3.8)
    expect(metForSpeed('cykling', 20.8)).toBe(8)
    const between = metForSpeed('lopning', 10.35) // mellan 9,3 (9,9 km/h) och 10,5 (10,8 km/h)
    expect(between).toBeGreaterThan(9.3)
    expect(between).toBeLessThan(10.5)
  })

  it('avgränsar till tabellens ändpunkter och är monotont', () => {
    expect(metForSpeed('lopning', 3)).toBe(6.5)
    expect(metForSpeed('lopning', 40)).toBe(23)
    expect(metForSpeed('gang', Number.NaN)).toBe(2.3)
    for (const kind of ['gang', 'lopning', 'cykling'] as const) {
      let prev = 0
      for (let v = 1; v <= 40; v += 0.5) {
        const met = metForSpeed(kind, v)
        expect(met).toBeGreaterThanOrEqual(prev)
        prev = met
      }
    }
  })

  it('fart och tempo från sträcka och tid', () => {
    expect(speedKmh(10, 50)).toBe(12)
    expect(speedKmh(0, 50)).toBe(0)
    expect(paceMinPerKm(10, 50)).toBe('5:00')
    expect(paceMinPerKm(5, 27.5)).toBe('5:30')
    expect(paceMinPerKm(0, 30)).toBeNull()
  })
})

describe('aktivitetslistan', () => {
  it('har unika id:n, giltiga grupper och rimliga MET-värden', () => {
    expect(ACTIVITIES.length).toBeGreaterThanOrEqual(100)
    expect(new Set(ACTIVITIES.map((a) => a.id)).size).toBe(ACTIVITIES.length)
    for (const a of ACTIVITIES) {
      expect(ACTIVITY_GROUP_ORDER).toContain(a.group)
      expect(a.met).toBeGreaterThanOrEqual(1.5)
      expect(a.met).toBeLessThanOrEqual(20)
      expect(a.code).toMatch(/^\d{5}$/)
    }
    for (const id of POPULAR_ACTIVITY_IDS) expect(getActivity(id)).toBeDefined()
  })

  it('löpning per tempo 8–16 km/h enligt kompendiet', () => {
    expect(getActivity('lopning-8')?.met).toBe(8.5)
    expect(getActivity('lopning-10')?.met).toBe(9.3)
    expect(getActivity('lopning-10')?.name).toBe('Löpning 10 km/h (6:00 min/km)')
    expect(getActivity('lopning-12')?.name).toContain('5:00 min/km')
    expect(getActivity('lopning-16')?.met).toBe(14.8)
  })

  it('grupperas i visningsordning', () => {
    const groups = activitiesByGroup()
    expect(groups.map((g) => g.group)).toEqual([...ACTIVITY_GROUP_ORDER])
    expect(groups.reduce((s, g) => s + g.activities.length, 0)).toBe(ACTIVITIES.length)
  })
})

describe('searchActivities', () => {
  const ids = (q: string) => searchActivities(q).map((a) => a.id)

  it('hittar på namn, synonymer, sammansättningar och utan å/ä/ö', () => {
    expect(ids('innebandy')[0]).toBe('innebandy')
    expect(ids('pingis')).toContain('bordtennis')
    expect(ids('springa')).toContain('lopning-10')
    expect(ids('skidor')).toEqual(expect.arrayContaining(['langd-klassiskt', 'utfor']))
    expect(ids('langd')).toContain('langd-skate')
    expect(ids('Längdskidor skate')[0]).toBe('langd-skate')
    expect(ids('svamp')).toContain('bar-svamp')
    expect(ids('snö')).toEqual(expect.arrayContaining(['snoskottning', 'snoskor']))
  })

  it('exakt namn först, alla ord måste matcha', () => {
    expect(ids('Padel')[0]).toBe('padel')
    expect(ids('promenad hund')).toEqual(['promenad-hund'])
    expect(ids('xyzzy')).toEqual([])
  })

  it('tom sökning ger listan och limit respekteras', () => {
    expect(searchActivities('').length).toBe(Math.min(50, ACTIVITIES.length))
    expect(searchActivities('  ', 5).length).toBe(5)
    expect(searchActivities('promenad', 2).length).toBe(2)
  })
})

describe('activityEquivalents – neutrala jämförelser', () => {
  it('ger avrundade minuter och svenska etiketter', () => {
    const eq = activityEquivalents(200, 70)
    expect(eq.map((e) => e.activity.id)).toEqual(['promenad-rask', 'cykel-pendling', 'crawl-lugn'])
    expect(eq[0].minutes).toBe(45)
    expect(eq[0].label).toBe('45 min rask promenad')
    for (const e of eq) expect(e.minutes % 5).toBe(0)
  })

  it('hoppar över ogiltiga värden', () => {
    expect(activityEquivalents(0, 70)).toEqual([])
    expect(activityEquivalents(200, 0)).toEqual([])
    expect(activityEquivalents(200, 70, ['finns-inte', 'promenad'])).toHaveLength(1)
    expect(activityEquivalents(600, 70, ['promenad'])[0].label).toBe('3 h 5 min promenad')
  })
})

describe('dagens tips', () => {
  it('har ett sjuttiotal tips med unika id:n och giltiga kategorier', () => {
    expect(TIPS.length).toBeGreaterThanOrEqual(70)
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length)
    for (const t of TIPS) {
      expect(Object.keys(TIP_CATEGORIES)).toContain(t.category)
      expect(t.title.length).toBeGreaterThan(3)
      expect(t.text.length).toBeGreaterThan(30)
      expect(`${t.title} ${t.text}`).not.toMatch(/bränn|synd|fusk|skam/i)
    }
  })

  it('är deterministiskt per datum', () => {
    expect(tipForDate('2026-09-26').id).toBe(tipForDate('2026-09-26').id)
    const ids = new Set<string>()
    for (let i = 0; i < 30; i++) ids.add(tipForDate(addDays('2026-09-01', i)).id)
    expect(ids.size).toBeGreaterThan(20)
  })

  it('upprepar inte vanliga tips två dagar i rad', () => {
    for (let i = 0; i < 365; i++) {
      const a = tipForDate(addDays('2026-01-01', i))
      const b = tipForDate(addDays('2026-01-01', i + 1))
      expect(a.id).not.toBe(b.id)
    }
  })

  it('visar D-vitamin under mörkertiden men inte på sommaren', () => {
    const idsIn = (start: string, days: number) => {
      const out: string[] = []
      for (let i = 0; i < days; i++) out.push(tipForDate(addDays(start, i)).id)
      return out
    }
    const winter = idsIn('2026-12-01', 90)
    expect(winter.some((id) => id.startsWith('d-vitamin'))).toBe(true)
    const summer = idsIn('2026-06-01', 90)
    expect(summer.some((id) => id.startsWith('d-vitamin'))).toBe(false)
    expect(tipsForPeriod('vinter', 1).some((t) => t.id === 'd-vitamin-morkertid')).toBe(true)
    expect(tipsForPeriod('sommar', 7).some((t) => t.id === 'd-vitamin-morkertid')).toBe(false)
  })

  it('en uttrycklig årstid styr urvalet', () => {
    const tips = Array.from({ length: 60 }, (_, i) => tipForDate(addDays('2026-12-01', i), 'sommar'))
    expect(tips.some((t) => t.seasons?.includes('sommar'))).toBe(true)
    expect(tips.some((t) => t.id === 'vintermotion' || t.id === 'kal')).toBe(false)
  })
})
