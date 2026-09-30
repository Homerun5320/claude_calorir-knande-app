/**
 * Hemskärmswidgetens sammanfattning (WidgetPayload v1): samma siffror som dagsringen på Idag,
 * rätt dagsmål per datum med veckobudgeten, inga energisiffror i medvetet läge, aldrig exempeldata,
 * neutral text över målet, svensk formatering och en liten JSON-text även med en stor dagbok.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { useTargets } from '../hooks/useTargets'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import type { DiaryEntry, ExerciseEntry, ISODate, MealId, Profile, Settings, Targets } from '../types'
import { addDays } from './dates'
import { formatEnergy } from './format'
import { presetShift } from './weeklyBudget'
import {
  buildWidgetPayload,
  mealsLoggedText,
  serializeWidgetPayload,
  WIDGET_DAYS,
  WIDGET_MAX_CHARS,
  WIDGET_PAYLOAD_VERSION,
  WIDGET_TEXT,
  widgetTargets,
  type WidgetInput,
  type WidgetTargets,
} from './widgetSummary'

/** Fast mellanslag (tusentalsavgränsaren i sv-SE och i "2 l"). */
const NB = ' '

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, onboardingDone: true }

/** Måndag 28 september 2026 kl. 12 (lokal tid). */
const MONDAY = new Date(2026, 8, 28, 12, 0)
const TODAY = '2026-09-28'

const TARGETS: Targets = {
  kcal: 2000,
  proteinG: 90,
  carbsG: 250,
  fatG: 70,
  fiberG: 30,
  waterMl: 2000,
  saltMaxG: 6,
  satFatMaxG: 22,
  addedSugarMaxG: 50,
  caffeineMaxMg: 400,
}
const FIXED: WidgetTargets = { targetsFor: () => TARGETS, addBackPct: 50 }

let seq = 0
function quick(date: ISODate, meal: MealId, kcal: number, name = 'Post'): DiaryEntry {
  seq += 1
  return { id: `e${seq}`, kind: 'quick', name, nutrients: { kcal }, date, meal, createdAt: seq }
}

function exercise(date: ISODate, kcal: number): ExerciseEntry {
  seq += 1
  return { id: `x${seq}`, date, activityId: 'custom', name: 'Promenad', minutes: 45, kcal, createdAt: seq }
}

function input(patch: Partial<WidgetInput> = {}, diary: Partial<WidgetInput['diary']> = {}): WidgetInput {
  return {
    profile: PROFILE,
    settings: SETTINGS,
    weights: [],
    diary: { entries: {}, water: {}, exercise: {}, days: {}, ...diary },
    fasting: null,
    demo: false,
    targets: FIXED,
    ...patch,
  }
}

describe('en vanlig dag', () => {
  it('kvar, ätit av målet, måltider och vatten – formaterat på svenska', () => {
    const payload = buildWidgetPayload(
      input({}, {
        entries: { [TODAY]: [quick(TODAY, 'frukost', 380), quick(TODAY, 'lunch', 300), quick(TODAY, 'lunch', 80)] },
        water: { [TODAY]: 750 },
      }),
      MONDAY,
    )
    expect(payload).toMatchObject({ v: WIDGET_PAYLOAD_VERSION, generatedAt: MONDAY.getTime(), state: 'ok', mindful: false, fallbackText: WIDGET_TEXT.openApp, fasting: null })
    expect(payload.days[0]).toEqual({
      date: TODAY,
      energyText: `1${NB}240 kcal kvar`,
      energyDetail: `760 av 2${NB}000 kcal`,
      energyPermille: 380,
      mealsText: '2 måltider loggade',
      waterText: `0,75 av 2${NB}l`,
      waterPermille: 375,
    })
  })

  it('idag och de sex följande lokala datumen, även över ett månadsskifte', () => {
    const payload = buildWidgetPayload(input(), MONDAY)
    expect(payload.days).toHaveLength(WIDGET_DAYS)
    expect(payload.days.map((d) => d.date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    // Strax före midnatt är det fortfarande samma dag.
    expect(buildWidgetPayload(input(), new Date(2026, 8, 28, 23, 59)).days[0].date).toBe(TODAY)
    expect(buildWidgetPayload(input(), new Date(2026, 8, 29, 0, 1)).days[0].date).toBe('2026-09-29')
  })

  it('en tom dag: hela budgeten kvar och "Inget loggat än"', () => {
    const day = buildWidgetPayload(input(), MONDAY).days[0]
    expect(day).toMatchObject({ energyText: `2${NB}000 kcal kvar`, energyDetail: `0 av 2${NB}000 kcal`, energyPermille: 0, mealsText: WIDGET_TEXT.nothingLogged })
    expect(day.waterText).toBe(`0 av 2${NB}l`)
    expect(day.waterPermille).toBe(0)
  })

  it('räknar bara måltider med minst en post', () => {
    expect(mealsLoggedText(undefined)).toBe('Inget loggat än')
    expect(mealsLoggedText([])).toBe('Inget loggat än')
    expect(mealsLoggedText([quick(TODAY, 'middag', 500), quick(TODAY, 'middag', 100)])).toBe('1 måltid loggad')
    expect(mealsLoggedText([quick(TODAY, 'frukost', 1), quick(TODAY, 'lunch', 1), quick(TODAY, 'fika', 1)])).toBe('3 måltider loggade')
  })

  it('träningen läggs till budgeten med användarens andel (som dagsringen)', () => {
    const day = buildWidgetPayload(input({}, { entries: { [TODAY]: [quick(TODAY, 'lunch', 700)] }, exercise: { [TODAY]: [exercise(TODAY, 200)] } }), MONDAY).days[0]
    // 2 000 + 50 % av 200 = 2 100.
    expect(day.energyText).toBe(`1${NB}400 kcal kvar`)
    expect(day.energyDetail).toBe(`700 av 2${NB}100 kcal`)
    expect(day.energyPermille).toBe(333)
  })

  it('vattnet: stapeln slutar vid målet, och utan mål visas inget vatten', () => {
    expect(buildWidgetPayload(input({}, { water: { [TODAY]: 2500 } }), MONDAY).days[0]).toMatchObject({ waterText: `2,5 av 2${NB}l`, waterPermille: 1000 })
    const noGoal: WidgetTargets = { targetsFor: () => ({ ...TARGETS, waterMl: 0 }), addBackPct: 50 }
    expect(buildWidgetPayload(input({ targets: noGoal }, { water: { [TODAY]: 500 } }), MONDAY).days[0]).toMatchObject({ waterText: null, waterPermille: -1 })
  })
})

describe('över målet', () => {
  it('neutral text – aldrig en varning', () => {
    const day = buildWidgetPayload(input({}, { entries: { [TODAY]: [quick(TODAY, 'middag', 2300)] } }), MONDAY).days[0]
    expect(day.energyText).toBe('300 kcal över – helt okej')
    expect(day.energyDetail).toBe(`2${NB}300 av 2${NB}000 kcal`)
    expect(day.energyPermille).toBe(1000)
    expect(JSON.stringify(day)).not.toMatch(/för mycket|varning|överskridit|!/i)
  })

  it('inom ±3 % är det precis lagom', () => {
    for (const kcal of [1960, 2000, 2050]) {
      const day = buildWidgetPayload(input({}, { entries: { [TODAY]: [quick(TODAY, 'middag', kcal)] } }), MONDAY).days[0]
      expect(day.energyText).toBe(WIDGET_TEXT.lagom)
      expect(day.energyPermille).toBe(Math.min(1000, Math.round((kcal / 2000) * 1000)))
    }
  })
})

describe('energienhet', () => {
  it('kJ: avrundat i kJ innan kvar räknas ut, så att siffrorna går jämnt upp', () => {
    const day = buildWidgetPayload(input({ settings: { ...SETTINGS, energyUnit: 'kJ' } }, { entries: { [TODAY]: [quick(TODAY, 'lunch', 760)] } }), MONDAY).days[0]
    // 760 kcal = 3 180 kJ, 2 000 kcal = 8 368 kJ, kvar 5 188 kJ.
    expect(day.energyText).toBe(`5${NB}188 kJ kvar`)
    expect(day.energyDetail).toBe(`3${NB}180 av 8${NB}368 kJ`)
    expect(JSON.stringify(day)).not.toContain('kcal')
  })
})

describe('medvetet läge', () => {
  it('inga energisiffror och ingen energistapel – måltider och vatten finns kvar', () => {
    const payload = buildWidgetPayload(
      input({ settings: { ...SETTINGS, mindfulMode: true } }, { entries: { [TODAY]: [quick(TODAY, 'lunch', 2600)] }, water: { [TODAY]: 500 } }),
      MONDAY,
    )
    expect(payload.state).toBe('ok')
    expect(payload.mindful).toBe(true)
    expect(payload.days).toHaveLength(WIDGET_DAYS)
    for (const day of payload.days) {
      expect(day.energyText).toBeNull()
      expect(day.energyDetail).toBeNull()
      expect(day.energyPermille).toBe(-1)
    }
    expect(payload.days[0]).toMatchObject({ mealsText: '1 måltid loggad', waterText: `0,5 av 2${NB}l`, waterPermille: 250 })
    expect(serializeWidgetPayload(payload)).not.toMatch(/kcal|kJ|över/)
  })
})

describe('exempeldata och ingen profil', () => {
  it('exempeldata: inga siffror alls', () => {
    const payload = buildWidgetPayload(
      input({ demo: true, fasting: { start: MONDAY.getTime() - 3_600_000, targetHours: 16 } }, { entries: { [TODAY]: [quick(TODAY, 'lunch', 500)] }, water: { [TODAY]: 500 } }),
      MONDAY,
    )
    expect(payload).toEqual({ v: 1, generatedAt: MONDAY.getTime(), state: 'demo', mindful: false, fallbackText: WIDGET_TEXT.demo, days: [], fasting: null })
  })

  it('ingen profil (eller välkomstflödet inte klart): uppmaning att skapa profilen', () => {
    const expected = { v: 1, generatedAt: MONDAY.getTime(), state: 'noProfile', mindful: false, fallbackText: WIDGET_TEXT.noProfile, days: [], fasting: null }
    expect(buildWidgetPayload(input({ profile: null, targets: undefined }), MONDAY)).toEqual(expected)
    expect(buildWidgetPayload(input({ settings: { ...SETTINGS, onboardingDone: false } }), MONDAY)).toEqual(expected)
  })

  it('exempeldata går före en saknad profil', () => {
    expect(buildWidgetPayload(input({ demo: true, profile: null }), MONDAY).state).toBe('demo')
  })
})

describe('fasta', () => {
  it('en pågående fasta: start och mål – widgeten räknar själv upp tiden', () => {
    const start = MONDAY.getTime() - 5 * 3_600_000
    expect(buildWidgetPayload(input({ fasting: { start, targetHours: 16 } }), MONDAY).fasting).toEqual({ startedAt: start, label: 'Fasta pågår', targetText: 'Mål 16 h' })
    expect(buildWidgetPayload(input({ fasting: { start, targetHours: 13.5 } }), MONDAY).fasting?.targetText).toBe('Mål 13 h 30 min')
    // Även i medvetet läge, som på Idag.
    expect(buildWidgetPayload(input({ fasting: { start, targetHours: 16 }, settings: { ...SETTINGS, mindfulMode: true } }), MONDAY).fasting).not.toBeNull()
  })

  it('en trasig fasta visas inte', () => {
    expect(buildWidgetPayload(input({ fasting: { start: Number.NaN, targetHours: 16 } }), MONDAY).fasting).toBeNull()
    expect(buildWidgetPayload(input({ fasting: { start: 1, targetHours: 0 } }), MONDAY).fasting).toBeNull()
    // Widgeten avvisar en starttid som inte är ett positivt heltal – då hellre ingen fasta.
    expect(buildWidgetPayload(input({ fasting: { start: 0, targetHours: 16 } }), MONDAY).fasting).toBeNull()
    expect(buildWidgetPayload(input({ fasting: { start: 1_790_712_000_000.4, targetHours: 16 } }), MONDAY).fasting?.startedAt).toBe(1_790_712_000_000)
  })
})

describe('storleken', () => {
  it('ett år med 20 poster om dagen ger en liten JSON-text – utan namn på livsmedel', () => {
    const entries: Record<ISODate, DiaryEntry[]> = {}
    const water: Record<ISODate, number> = {}
    const exerciseByDate: Record<ISODate, ExerciseEntry[]> = {}
    for (let i = -365; i <= 14; i++) {
      const date = addDays(TODAY, i)
      entries[date] = Array.from({ length: 20 }, (_, k) => quick(date, (['frukost', 'lunch', 'fika', 'middag', 'kvallsmat', 'mellanmal'] as const)[k % 6], 97.5, `Hemlig kladdkaka ${k}`))
      water[date] = 2750
      exerciseByDate[date] = [exercise(date, 350)]
    }
    const payload = buildWidgetPayload(
      input({ targets: undefined, fasting: { start: MONDAY.getTime(), targetHours: 16 } }, { entries, water, exercise: exerciseByDate }),
      MONDAY,
    )
    const text = serializeWidgetPayload(payload)
    expect(payload.days).toHaveLength(WIDGET_DAYS)
    expect(text.length).toBeLessThan(4096)
    expect(text.length).toBeLessThanOrEqual(WIDGET_MAX_CHARS)
    expect(text).not.toContain('Hemlig')
    expect(JSON.parse(text)).toEqual(payload)
  })
})

describe('dagsmålen – samma som useTargets', () => {
  beforeAll(async () => {
    await waitFor(() => expect([useProfileStore, useDiaryStore, useBodyStore].every((s) => s.persist.hasHydrated())).toBe(true))
  })

  beforeEach(() => {
    useDiaryStore.getState().clearDiary()
    useBodyStore.getState().clearBody()
    useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...SETTINGS } })
  })

  /** Indata från butikerna, som src/native/widget.ts läser dem. */
  function fromStores(): WidgetInput {
    const diary = useDiaryStore.getState()
    const { profile, settings } = useProfileStore.getState()
    return {
      profile,
      settings,
      weights: useBodyStore.getState().weights,
      diary: { entries: diary.entries, water: diary.water, exercise: diary.exercise, days: diary.days },
      fasting: null,
      demo: false,
    }
  }

  function expectSameAsHook(): void {
    const { result, unmount } = renderHook(() => useTargets(TODAY))
    const ours = widgetTargets(fromStores(), TODAY)
    expect(ours).not.toBeNull()
    expect(ours!.addBackPct).toBe(result.current.exerciseAddBack.pct)
    for (let i = -3; i < WIDGET_DAYS + 3; i++) {
      const date = addDays(TODAY, i)
      expect(ours!.targetsFor(date)).toEqual(result.current.targetsFor(date))
    }
    unmount()
  }

  function seedAdaptive(): void {
    const { addEntry, setDayMeta } = useDiaryStore.getState()
    for (let i = 1; i <= 27; i++) {
      const date = addDays(TODAY, -i)
      addEntry({ kind: 'quick', name: 'Dag', nutrients: { kcal: 2000 }, date, meal: 'middag' })
      setDayMeta(date, { complete: true })
      if (i % 3 === 0) useBodyStore.getState().logWeight(date, 70)
    }
  }

  const fridayShift = presetShift('fredagsmys', 300)

  it('utan veckobudget, med vikter (även en framtida)', () => {
    useBodyStore.getState().logWeight(addDays(TODAY, -10), 72)
    useBodyStore.getState().logWeight(addDays(TODAY, -2), 71.4)
    useBodyStore.getState().logWeight(addDays(TODAY, 5), 60)
    expectSameAsHook()
  })

  it('med veckobudget, eget energimål och träningsandel', () => {
    useProfileStore.setState({
      settings: { ...SETTINGS, exerciseAddBackPct: 80, targetOverrides: { kcal: 2100, fatG: 70 }, weeklyBudget: { enabled: true, shift: fridayShift, since: '2026-01-01' } },
    })
    expectSameAsHook()
  })

  it('med adaptiv förbrukning', () => {
    seedAdaptive()
    useProfileStore.setState({ settings: { ...SETTINGS, adaptiveTargets: true } })
    expectSameAsHook()
    expect(widgetTargets(fromStores(), TODAY)!.addBackPct).toBe(0)
  })

  it('vid graviditet: ingen veckobudget och ingen adaptiv förbrukning', () => {
    seedAdaptive()
    useProfileStore.setState({
      profile: { ...PROFILE, lifeStage: 'gravid' },
      settings: { ...SETTINGS, adaptiveTargets: true, weeklyBudget: { enabled: true, shift: fridayShift, since: '2026-01-01' } },
    })
    expectSameAsHook()
    const ours = widgetTargets(fromStores(), TODAY)!
    expect(ours.targetsFor('2026-10-02').kcal).toBe(ours.targetsFor(TODAY).kcal)
  })

  it('veckobudgeten: fredagens mål är högre än måndagens – varje dag får sitt eget', () => {
    useProfileStore.setState({ settings: { ...SETTINGS, weeklyBudget: { enabled: true, shift: fridayShift, since: '2026-01-01' } } })
    const { result, unmount } = renderHook(() => useTargets(TODAY))
    const monday = result.current.targetsFor(TODAY).kcal
    const friday = result.current.targetsFor('2026-10-02').kcal
    unmount()
    expect(friday).toBeGreaterThan(monday)

    const payload = buildWidgetPayload(fromStores(), MONDAY)
    expect(payload.days[0].date).toBe(TODAY)
    expect(payload.days[4].date).toBe('2026-10-02')
    expect(payload.days[0].energyText).toBe(`${formatEnergy(monday)} kvar`)
    expect(payload.days[4].energyText).toBe(`${formatEnergy(friday)} kvar`)
    expect(payload.days[4].energyDetail).toBe(`0 av ${formatEnergy(friday)}`)
  })

  it('utan profil finns inga dagsmål', () => {
    useProfileStore.setState({ profile: null })
    expect(widgetTargets(fromStores(), TODAY)).toBeNull()
  })
})
