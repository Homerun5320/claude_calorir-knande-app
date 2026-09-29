/**
 * Apple Hälsa / Health Connect (@capgo/capacitor-health) med ett mockat tillägg: val och behörigheter
 * per datatyp, vikter till viktkurvan utan dubbletter, steg utan att skriva över egna värden, aktiv
 * energi bara för visning, energi och vatten som tillskott (aldrig dubbelt, aldrig före kopplingen),
 * vikter från Lagom till Hälsa, exempeldata och provperiod, fel, och start/synk vid ändringar.
 */
import type { AggregatedSample, AuthorizationOptions, AuthorizationStatus, HealthSample, QueryAggregatedOptions } from '@capgo/capacitor-health'
import { addDays, fromISODate, todayISO, toISODate } from '../lib/dates'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useLicenseStore } from '../stores/licenseStore'
import { useProfileStore } from '../stores/profileStore'
import type { DayMeta, WeightEntry } from '../types'
import {
  connectHealth,
  dailyWeights,
  disconnectHealth,
  getHealthSnapshot,
  HEALTH_CHOICES,
  HEALTH_STORAGE_KEY,
  healthTypesFor,
  intakeDelta,
  openHealthSettings,
  planSteps,
  planWeightImport,
  requestMissingHealthAccess,
  resetHealth,
  resetHealthForTests,
  RESUME_IMPORT_MS,
  sampleInterval,
  sanitizeHealthState,
  SEND_DEBOUNCE_MS,
  setHealthChoice,
  splitGranted,
  startHealth,
  stepsByDate,
  subscribeHealth,
  syncHealth,
  weightTime,
  type HealthChoice,
} from './health'

const OWN_ID = 'se.lagomappen.lagom'

const mocks = vi.hoisted(() => {
  const grant = (o: { read?: string[]; write?: string[] }) => ({
    readAuthorized: o.read ?? [],
    readDenied: [] as string[],
    writeAuthorized: o.write ?? [],
    writeDenied: [] as string[],
  })
  return {
    grant,
    platform: 'ios' as 'ios' | 'android',
    access: { canLog: true, demo: false },
    weightSamples: [] as unknown[],
    stepBuckets: [] as unknown[],
    activeBuckets: [] as unknown[],
    appListeners: new Set<(s: { isActive: boolean }) => void>(),
    logError: vi.fn(),
    plugin: {
      isAvailable: vi.fn(),
      requestAuthorization: vi.fn(),
      checkAuthorization: vi.fn(),
      readSamples: vi.fn(),
      queryAggregated: vi.fn(),
      saveSample: vi.fn(),
      openHealthConnectSettings: vi.fn(),
    },
    app: {
      getInfo: vi.fn(async () => ({ id: 'se.lagomappen.lagom', name: 'Lagom', build: '1', version: '1.0.0' })),
      addListener: vi.fn(async (_event: string, listener: (s: { isActive: boolean }) => void) => {
        mocks.appListeners.add(listener)
        return { remove: async () => void mocks.appListeners.delete(listener) }
      }),
    },
  }
})

vi.mock('@capgo/capacitor-health', () => ({ Health: mocks.plugin }))
vi.mock('@capacitor/app', () => ({ App: mocks.app }))
vi.mock('../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/platform')>()),
  isNativeApp: () => true,
}))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
vi.mock('../hooks/useAccess', () => ({ currentAccess: () => ({ ...mocks.access, checking: false, status: { kind: 'prov' } }) }))

/** Tisdag 29 september 2026 kl. 14.00 lokal tid. */
const NOW = new Date(2026, 8, 29, 14, 0, 0)
const TODAY = todayISO(NOW)
const YESTERDAY = addDays(TODAY, -1)

/** En tid lokal tid en viss dag, som tillägget ger den (ISO/UTC). */
const at = (date: string, hours: number, minutes = 0) => {
  const d = fromISODate(date)
  d.setHours(hours, minutes, 0, 0)
  return d.toISOString()
}

function weightSample(date: string, hours: number, kg: number, sourceId = 'com.withings.wiScaleNG'): HealthSample {
  const t = at(date, hours)
  return { dataType: 'weight', value: kg, unit: 'kilogram', startDate: t, endDate: t, sourceId, sourceName: 'Våg' }
}

/** En dygnshink som tilläggen ger den (lokal midnatt till midnatt). */
function bucket(date: string, value: number): AggregatedSample {
  return { startDate: at(date, 0), endDate: at(addDays(date, 1), 0), value, values: { sum: value }, unit: 'count' }
}

function seed(patch: Record<string, unknown>): void {
  localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify({ ...sanitizeHealthState(null), ...patch }))
  resetHealthForTests()
}

const connected = (patch: Record<string, unknown> = {}) => seed({ enabled: true, since: YESTERDAY, ...patch })

function stored(): ReturnType<typeof sanitizeHealthState> {
  return sanitizeHealthState(JSON.parse(localStorage.getItem(HEALTH_STORAGE_KEY) ?? 'null'))
}

const saved = (dataType: string) => mocks.plugin.saveSample.mock.calls.map(([o]) => o).filter((o: { dataType: string }) => o.dataType === dataType)

function addFood(date: string, kcal: number) {
  return useDiaryStore.getState().addEntry({ date, meal: 'lunch', kind: 'quick', name: 'Lunch', nutrients: { kcal } })
}

beforeAll(async () => {
  const stores = [useProfileStore, useDiaryStore, useBodyStore, useLicenseStore]
  await vi.waitFor(() => expect(stores.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOW })
  ;(window as unknown as { Capacitor?: unknown }).Capacitor = { getPlatform: () => mocks.platform }
  mocks.platform = 'ios'
  mocks.access = { canLog: true, demo: false }
  mocks.weightSamples = []
  mocks.stepBuckets = []
  mocks.activeBuckets = []
  mocks.appListeners.clear()
  mocks.plugin.isAvailable.mockResolvedValue({ available: true, platform: 'ios' })
  mocks.plugin.requestAuthorization.mockImplementation(async (o: AuthorizationOptions) => mocks.grant(o))
  mocks.plugin.checkAuthorization.mockImplementation(async (o: AuthorizationOptions) => mocks.grant(o))
  mocks.plugin.readSamples.mockImplementation(async () => ({ samples: mocks.weightSamples }))
  mocks.plugin.queryAggregated.mockImplementation(async (o: QueryAggregatedOptions) => ({
    samples: o.dataType === 'steps' ? mocks.stepBuckets : o.dataType === 'calories' ? mocks.activeBuckets : [],
  }))
  mocks.plugin.saveSample.mockResolvedValue(undefined)
  mocks.plugin.openHealthConnectSettings.mockResolvedValue(undefined)
  localStorage.clear()
  useBodyStore.setState({ weights: [], measurements: [] })
  useDiaryStore.setState({ entries: {}, water: {}, exercise: {}, days: {} })
  useProfileStore.setState({ settings: { ...useProfileStore.getState().settings, onboardingDone: true } })
  resetHealthForTests()
})

afterEach(() => {
  resetHealthForTests()
  vi.useRealTimers()
  for (const fn of Object.values(mocks.plugin)) fn.mockReset()
  mocks.app.addListener.mockClear()
  mocks.app.getInfo.mockClear()
  mocks.logError.mockReset()
  delete (window as unknown as { Capacitor?: unknown }).Capacitor
  localStorage.clear()
})

// ---------------------------------------------------------------------------
// Rena hjälpfunktioner
// ---------------------------------------------------------------------------

describe('datatyper och behörigheter', () => {
  it('valen blir tilläggets datatyper – exakt de som finns i Android-manifestet', () => {
    const all: HealthChoice[] = ['readWeight', 'readSteps', 'writeEnergy', 'writeWater', 'writeWeight']
    expect(healthTypesFor(all)).toEqual({ read: ['weight', 'steps'], write: ['dietaryEnergyConsumed', 'dietaryWater', 'weight'] })
    // Aktiv energi läses inte längre (behörigheterna hålls till det som används).
    expect(HEALTH_CHOICES).not.toContain('readActiveEnergy')
    expect(healthTypesFor(['writeWater'])).toEqual({ read: [], write: ['dietaryWater'] })
  })

  it('delar upp valen i beviljade och saknade', () => {
    const status: AuthorizationStatus = { readAuthorized: ['steps'], readDenied: ['weight'], writeAuthorized: ['weight'], writeDenied: ['dietaryWater'] }
    expect(splitGranted(['readWeight', 'readSteps', 'writeWeight', 'writeWater'], status)).toEqual({
      granted: ['readSteps', 'writeWeight'],
      missing: ['readWeight', 'writeWater'],
    })
  })
})

describe('vikter från Hälsa', () => {
  it('en vikt per dag – dagens första mätning, avrundad; Lagoms egna, orimliga och framtida hoppas över', () => {
    const daily = dailyWeights(
      [
        weightSample(TODAY, 21, 71.2),
        weightSample(TODAY, 7, 70.46),
        weightSample(YESTERDAY, 7, 70.9, OWN_ID),
        weightSample(YESTERDAY, 8, 450),
        weightSample(addDays(TODAY, -2), 6, 71.04),
        weightSample(addDays(TODAY, 1), 7, 70),
        { ...weightSample(addDays(TODAY, -3), 7, 150), unit: 'percent' },
      ],
      { ownId: OWN_ID, today: TODAY },
    )
    expect([...daily]).toEqual([
      [TODAY, { kg: 70.5, at: at(TODAY, 7) }],
      [addDays(TODAY, -2), { kg: 71, at: at(addDays(TODAY, -2), 6) }],
    ])
  })

  it('fyller tomma dagar, uppdaterar bara sina egna och rör aldrig det användaren loggat', () => {
    const w = (date: string, id: string, kg: number): WeightEntry => ({ id, date, kg, createdAt: 0 })
    const d = (n: number) => addDays(TODAY, -n)
    const daily = new Map([
      [d(0), { kg: 70, at: 'ny' }],
      [d(1), { kg: 71, at: 'x' }],
      [d(2), { kg: 72, at: 'ny' }],
      [d(3), { kg: 73, at: 'ny' }],
      [d(4), { kg: 74, at: 'samma' }],
      [d(5), { kg: 75, at: 'ny' }],
    ])
    const weights = [w(d(1), 'egen', 80), w(d(2), 'hamtad', 71), w(d(3), 'hamtad3', 73.02)]
    const imported = {
      [d(2)]: { id: 'hamtad', at: 'gammal' },
      [d(3)]: { id: 'hamtad3', at: 'gammal' },
      [d(4)]: { id: 'borttagen', at: 'samma' },
      [d(5)]: { id: 'borttagen5', at: 'gammal' },
    }
    expect(planWeightImport(daily, weights, imported)).toEqual([
      { date: d(0), kg: 70, at: 'ny' }, // tom dag
      { date: d(2), kg: 72, at: 'ny' }, // Lagoms egen hämtning, ny mätning
      { date: d(3), at: 'ny', noteOnly: true }, // samma värde – bara loggen
      { date: d(5), kg: 75, at: 'ny' }, // borttagen, men en ny mätning har kommit
    ])
    // d(1): användarens egen vikt. d(4): hämtad och borttagen av användaren – samma mätning igen.
  })
})

describe('steg', () => {
  it('summerar per lokal dag (hinkens mitt avgör dagen)', () => {
    const perDay = stepsByDate([bucket(YESTERDAY, 9000.4), bucket(TODAY, 4000), { ...bucket(TODAY, 0), value: Number.NaN, values: {} }])
    expect([...perDay]).toEqual([
      [YESTERDAY, 9000],
      [TODAY, 4000],
    ])
  })

  it('fyller tomma dagar och sina egna – aldrig egna eller borttagna värden', () => {
    const d = (n: number) => addDays(TODAY, -n)
    const perDay = new Map([
      [d(0), 5000],
      [d(1), 8000],
      [d(2), 9000],
      [d(3), 7000],
      [d(4), 6000],
      [d(5), 200_000],
    ])
    const days: Record<string, DayMeta> = { [d(1)]: { steps: 4000 }, [d(2)]: { steps: 1234 }, [d(4)]: { mood: 3 } }
    const owned = { [d(1)]: 4000, [d(3)]: 6500, [d(4)]: 5000 }
    expect(planSteps(perDay, days, owned)).toEqual([
      { date: d(0), steps: 5000 }, // tomt
      { date: d(1), steps: 8000 }, // kopplingens eget värde uppdateras
    ])
    // d(2): eget värde. d(3), d(4): borttagna av användaren. d(5): orimligt.
  })
})

describe('tillskott och tider', () => {
  it('skickar bara det som har tillkommit, aldrig negativt eller småsmulor', () => {
    expect(intakeDelta({ kcal: 800, waterMl: 750 }, undefined)).toEqual({ kcal: 800, waterMl: 750 })
    expect(intakeDelta({ kcal: 1000, waterMl: 755 }, { kcal: 800, waterMl: 750 })).toEqual({ kcal: 200, waterMl: 0 })
    expect(intakeDelta({ kcal: 600, waterMl: 500 }, { kcal: 800, waterMl: 750 })).toEqual({ kcal: 0, waterMl: 0 })
  })

  it('i dag: minuten fram till nu; en tidigare dag: sista minuten före midnatt', () => {
    expect(sampleInterval(TODAY, NOW)).toEqual({ startDate: at(TODAY, 13, 59), endDate: at(TODAY, 14) })
    expect(sampleInterval(YESTERDAY, NOW)).toEqual({ startDate: at(YESTERDAY, 23, 58), endDate: at(YESTERDAY, 23, 59) })
    // Precis efter midnatt hamnar tillskottet ändå på rätt dag.
    const justAfter = new Date(2026, 8, 29, 0, 0, 20)
    expect(sampleInterval(TODAY, justAfter).startDate).toBe(fromISODate(TODAY).toISOString())
  })

  it('sommartid: dygnet med 23 timmar slutar ändå på rätt dag', () => {
    // Node läser om tidszonen när TZ ändras.
    vi.stubEnv('TZ', 'Europe/Stockholm')
    try {
      // 29 mars 2026: klockan ställs fram, dygnet har 23 timmar.
      const { startDate, endDate } = sampleInterval('2026-03-29', new Date(2026, 2, 30, 12))
      expect(endDate).toBe('2026-03-29T21:59:00.000Z') // 23.59 svensk sommartid
      expect(startDate).toBe('2026-03-29T21:58:00.000Z')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('vikten skickas med tiden den loggades – eller mitt på dagen om den loggades i efterhand', () => {
    expect(weightTime({ date: TODAY, createdAt: new Date(2026, 8, 29, 7, 30).getTime() })).toBe(at(TODAY, 7, 30))
    expect(weightTime({ date: addDays(TODAY, -3), createdAt: NOW.getTime() })).toBe(at(addDays(TODAY, -3), 12))
  })
})

describe('sparat läge', () => {
  it('ett skadat värde blir standardvalen; ogiltiga datum och värden rensas bort', () => {
    expect(sanitizeHealthState('trasigt')).toMatchObject({ enabled: false, since: null })
    const s = sanitizeHealthState({
      v: 1,
      enabled: true,
      choices: { readWeight: false, writeWater: 'ja' },
      since: '2026-02-30',
      lastSync: 5,
      ledger: { weights: { [TODAY]: { id: 'w1', at: 'x' }, fel: { id: 'w2', at: 'y' } }, steps: { [TODAY]: -1, [YESTERDAY]: 300 }, sent: { [TODAY]: { kcal: 10, waterMl: 'x' } } },
    })
    expect(s.enabled).toBe(true)
    expect(s.choices.readWeight).toBe(false)
    expect(s.choices.writeWater).toBe(true)
    expect(s.since).toBeNull()
    expect(s.lastSync).toBe(5)
    expect(s.ledger.weights).toEqual({ [TODAY]: { id: 'w1', at: 'x' } })
    expect(s.ledger.steps).toEqual({ [YESTERDAY]: 300 })
    expect(s.ledger.sent).toEqual({ [TODAY]: { kcal: 10, waterMl: undefined } })
  })
})

// ---------------------------------------------------------------------------
// Kopplingen
// ---------------------------------------------------------------------------

describe('koppla', () => {
  it('är avstängd från början och gör ingenting', async () => {
    expect(getHealthSnapshot()).toMatchObject({ enabled: false, since: null })
    await expect(syncHealth()).resolves.toBeNull()
    expect(mocks.plugin.checkAuthorization).not.toHaveBeenCalled()
  })

  it('frågar om de valda datatyperna, slås på från i dag och synkar direkt', async () => {
    mocks.weightSamples = [weightSample(YESTERDAY, 7, 72.3), weightSample(TODAY, 6, 72.1)]
    mocks.stepBuckets = [bucket(YESTERDAY, 9500), bucket(TODAY, 3200)]
    addFood(TODAY, 650)
    addFood(YESTERDAY, 2100)
    useDiaryStore.getState().addWater(TODAY, 500)

    const result = await connectHealth()

    expect(mocks.plugin.requestAuthorization).toHaveBeenCalledWith({
      read: ['weight', 'steps'],
      write: ['dietaryEnergyConsumed', 'dietaryWater', 'weight'],
    })
    expect(result).toEqual({ ok: true, missing: [], summary: { weights: 2, stepDays: 2, kcal: 0, waterMl: 0, sentWeights: 0 } })
    expect(getHealthSnapshot()).toMatchObject({ enabled: true, since: TODAY, syncing: false, problem: null, today: { date: TODAY, steps: 3200 } })
    expect(stored()).toMatchObject({ enabled: true, since: TODAY })

    // Vikterna i viktkurvan, märkta med källan.
    expect(useBodyStore.getState().weights.map((w) => [w.date, w.kg, w.note])).toEqual([
      [YESTERDAY, 72.3, 'Från Apple Hälsa'],
      [TODAY, 72.1, 'Från Apple Hälsa'],
    ])
    // Stegen i dagboken – de blir ingen träning.
    expect(useDiaryStore.getState().days[TODAY]).toEqual({ steps: 3200 })
    expect(useDiaryStore.getState().exercise).toEqual({})
    // Inget skickas på kopplingsdagen: dagen pågår (skickas i morgon), och i går var före
    // kopplingen. Hämtade vikter skickas inte tillbaka.
    expect(saved('dietaryEnergyConsumed')).toEqual([])
    expect(saved('dietaryWater')).toEqual([])
    expect(saved('weight')).toEqual([])
    expect(mocks.plugin.queryAggregated).not.toHaveBeenCalledWith(expect.objectContaining({ dataType: 'calories' }))
    // Första hämtningen: 90 dagar bakåt, nyaste först.
    expect(mocks.plugin.readSamples).toHaveBeenCalledWith(
      expect.objectContaining({ dataType: 'weight', startDate: fromISODate(addDays(TODAY, -90)).toISOString(), endDate: NOW.toISOString(), ascending: false }),
    )
  })

  it('bara de valda datatyperna frågas om', async () => {
    seed({ choices: { readWeight: false, readSteps: true, writeEnergy: false, writeWater: true, writeWeight: false } })
    await connectHealth()
    expect(mocks.plugin.requestAuthorization).toHaveBeenCalledWith({ read: ['steps'], write: ['dietaryWater'] })
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
  })

  it('inget valt → frågar inte', async () => {
    seed({ choices: { readWeight: false, readSteps: false, writeEnergy: false, writeWater: false, writeWeight: false } })
    await expect(connectHealth()).resolves.toEqual({ ok: false, reason: 'inget-valt' })
    expect(mocks.plugin.requestAuthorization).not.toHaveBeenCalled()
  })

  it('Health Connect saknas eller behöver uppdateras → frågar inte och förklarar', async () => {
    mocks.platform = 'android'
    mocks.plugin.isAvailable.mockResolvedValue({ available: false, platform: 'android', reason: 'Health Connect needs an update.' })
    await expect(connectHealth()).resolves.toEqual({ ok: false, reason: 'uppdatera' })
    expect(getHealthSnapshot()).toMatchObject({ enabled: false, problem: 'uppdatera' })
    mocks.plugin.isAvailable.mockResolvedValue({ available: false, platform: 'android', reason: 'Health Connect is unavailable on this device.' })
    await expect(connectHealth()).resolves.toEqual({ ok: false, reason: 'saknas' })
    expect(mocks.plugin.requestAuthorization).not.toHaveBeenCalled()
  })

  it('allt nekat → kopplingen förblir av', async () => {
    mocks.plugin.requestAuthorization.mockResolvedValue({ readAuthorized: [], readDenied: ['weight'], writeAuthorized: [], writeDenied: ['weight'] })
    await expect(connectHealth()).resolves.toEqual({ ok: false, reason: 'nekad' })
    expect(getHealthSnapshot().enabled).toBe(false)
  })

  it('ett fel vid frågan loggas och kopplingen förblir av', async () => {
    mocks.plugin.requestAuthorization.mockRejectedValue(new Error('Authorization request was not granted.'))
    await expect(connectHealth()).resolves.toEqual({ ok: false, reason: 'fel' })
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:halsa')
    expect(getHealthSnapshot().enabled).toBe(false)
  })

  it('delvis beviljat → kopplad, det saknade visas och hoppas över', async () => {
    mocks.plugin.requestAuthorization.mockImplementation(async (o: AuthorizationOptions) => ({
      ...mocks.grant(o),
      readAuthorized: ['steps'],
      readDenied: ['weight'],
    }))
    mocks.plugin.checkAuthorization.mockImplementation(async (o: AuthorizationOptions) => ({ ...mocks.grant(o), readAuthorized: ['steps'] }))
    const result = await connectHealth()
    expect(result).toMatchObject({ ok: true, missing: ['readWeight'] })
    expect(getHealthSnapshot().missing).toEqual(['readWeight'])
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
  })
})

describe('val per datatyp', () => {
  it('påslaget medan kopplingen är på frågar om just den datatypen', async () => {
    connected({ choices: { ...sanitizeHealthState(null).choices, writeWeight: false } })
    await expect(setHealthChoice('writeWeight', true)).resolves.toEqual({ ok: true })
    expect(mocks.plugin.requestAuthorization).toHaveBeenCalledWith({ read: [], write: ['weight'] })
    expect(stored().choices.writeWeight).toBe(true)
  })

  it('nekat → sparas som valt men visas som saknat; "Ge lov" frågar igen', async () => {
    connected({ choices: { ...sanitizeHealthState(null).choices, readSteps: false } })
    mocks.plugin.requestAuthorization.mockResolvedValueOnce({ readAuthorized: [], readDenied: ['steps'], writeAuthorized: [], writeDenied: [] })
    await expect(setHealthChoice('readSteps', true)).resolves.toEqual({ ok: false, reason: 'nekad' })
    expect(getHealthSnapshot().missing).toEqual(['readSteps'])
    await expect(requestMissingHealthAccess()).resolves.toEqual({ ok: true })
    expect(mocks.plugin.requestAuthorization).toHaveBeenLastCalledWith({ read: ['steps'], write: [] })
    expect(getHealthSnapshot().missing).toEqual([])
  })

  it('avslaget eller före kopplingen → ingen fråga', async () => {
    await setHealthChoice('readWeight', true)
    connected()
    await setHealthChoice('readSteps', false)
    expect(mocks.plugin.requestAuthorization).not.toHaveBeenCalled()
    expect(stored().choices.readSteps).toBe(false)
  })
})

describe('koppla från och radera', () => {
  it('koppla från stoppar synken men behåller loggen (inga dubbletter om den slås på igen)', async () => {
    connected({ ledger: { weights: { [TODAY]: { id: 'w1', at: 'x' } }, steps: {}, sent: {}, sentWeights: {} } })
    disconnectHealth()
    expect(getHealthSnapshot().enabled).toBe(false)
    expect(stored().ledger.weights[TODAY]).toEqual({ id: 'w1', at: 'x' })
    await expect(syncHealth()).resolves.toBeNull()
    expect(mocks.plugin.checkAuthorization).not.toHaveBeenCalled()
  })

  it('"Radera all data" tar bort valen och loggen från telefonen', () => {
    connected()
    const listener = vi.fn()
    subscribeHealth(listener)
    resetHealth()
    expect(localStorage.getItem(HEALTH_STORAGE_KEY)).toBeNull()
    expect(getHealthSnapshot()).toMatchObject({ enabled: false, since: null })
    expect(listener).toHaveBeenCalled()
  })
})

describe('Health Connects inställningar', () => {
  it('öppnas på Android – finns inte på iPhone', async () => {
    await expect(openHealthSettings()).resolves.toBe(false)
    mocks.platform = 'android'
    await expect(openHealthSettings()).resolves.toBe(true)
    expect(mocks.plugin.openHealthConnectSettings).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Synken
// ---------------------------------------------------------------------------

describe('vikt', () => {
  it('Health Connect-vikter märks med källan', async () => {
    mocks.platform = 'android'
    mocks.weightSamples = [weightSample(TODAY, 7, 68.4)]
    connected()
    await syncHealth()
    expect(useBodyStore.getState().weights[0]).toMatchObject({ date: TODAY, kg: 68.4, note: 'Från Health Connect' })
  })

  it('ingen dubblett: samma mätning hämtas en gång, egen vikt samma dag vinner, borttagen kommer inte tillbaka', async () => {
    useBodyStore.getState().logWeight(YESTERDAY, 75)
    mocks.weightSamples = [weightSample(TODAY, 7, 74.2), weightSample(YESTERDAY, 7, 74.6)]
    connected()
    await syncHealth()
    await syncHealth()
    expect(useBodyStore.getState().weights.map((w) => [w.date, w.kg])).toEqual([
      [YESTERDAY, 75],
      [TODAY, 74.2],
    ])
    const imported = useBodyStore.getState().weights.find((w) => w.date === TODAY)
    useBodyStore.getState().removeWeight(imported?.id ?? '')
    await syncHealth()
    expect(useBodyStore.getState().weights.map((w) => w.date)).toEqual([YESTERDAY])
  })

  it('en senare hämtning börjar tre dagar före den förra', async () => {
    connected({ lastImport: NOW.getTime() - 86_400_000 })
    await syncHealth()
    expect(mocks.plugin.readSamples).toHaveBeenCalledWith(expect.objectContaining({ startDate: fromISODate(addDays(TODAY, -4)).toISOString() }))
  })

  it('vikter som loggas i Lagom skickas en gång – inte hämtade, inte före kopplingen', async () => {
    mocks.weightSamples = [weightSample(TODAY, 6, 70.2)]
    connected({ since: YESTERDAY })
    const created = new Date(2026, 8, 28, 7, 15).getTime()
    useBodyStore.setState({
      weights: [
        { id: 'fore', date: addDays(TODAY, -2), kg: 71, createdAt: created },
        { id: 'egen', date: YESTERDAY, kg: 70.8, createdAt: created },
      ],
    })
    await syncHealth()
    await syncHealth()
    expect(saved('weight')).toEqual([{ dataType: 'weight', value: 70.8, unit: 'kilogram', startDate: at(YESTERDAY, 7, 15), endDate: at(YESTERDAY, 7, 15) }])
    // Ändrad vikt samma dag (nytt id) skickas igen.
    useBodyStore.getState().logWeight(YESTERDAY, 70.6)
    await syncHealth()
    expect(saved('weight').map((o: { value: number }) => o.value)).toEqual([70.8, 70.6])
    // Det Lagom själv skickat hämtas aldrig tillbaka (källan är appen).
    mocks.weightSamples = [weightSample(YESTERDAY, 7, 70.6, OWN_ID)]
    useBodyStore.getState().removeWeight(useBodyStore.getState().weights.find((w) => w.date === YESTERDAY)?.id ?? '')
    await syncHealth()
    expect(useBodyStore.getState().weights.map((w) => w.date)).toEqual([addDays(TODAY, -2), TODAY])
  })
})

describe('steg', () => {
  it('stegen fylls i och följer med under dagen – ett eget värde lämnas i fred', async () => {
    connected()
    mocks.stepBuckets = [bucket(TODAY, 2000)]
    await syncHealth()
    expect(useDiaryStore.getState().days[TODAY]?.steps).toBe(2000)
    mocks.stepBuckets = [bucket(TODAY, 6500)]
    await syncHealth()
    expect(useDiaryStore.getState().days[TODAY]?.steps).toBe(6500)
    useDiaryStore.getState().setDayMeta(TODAY, { steps: 7000 })
    mocks.stepBuckets = [bucket(TODAY, 8000)]
    await syncHealth()
    expect(useDiaryStore.getState().days[TODAY]?.steps).toBe(7000)
    expect(getHealthSnapshot().today).toMatchObject({ steps: 8000 })
    expect(mocks.plugin.queryAggregated).toHaveBeenCalledWith(
      expect.objectContaining({ dataType: 'steps', startDate: fromISODate(addDays(TODAY, -6)).toISOString(), bucket: 'day', aggregation: 'sum' }),
    )
  })

  it('aktiv energi läses aldrig – inte heller med ett gammalt sparat val', async () => {
    seed({ enabled: true, since: TODAY, choices: { readWeight: false, readSteps: false, readActiveEnergy: true, writeEnergy: false, writeWater: false, writeWeight: false } })
    mocks.activeBuckets = [{ ...bucket(TODAY, 420.4), unit: 'kilocalorie' }]
    const before = useDiaryStore.getState()
    await syncHealth()
    expect(getHealthSnapshot().choices).not.toHaveProperty('readActiveEnergy')
    expect(mocks.plugin.queryAggregated).not.toHaveBeenCalled()
    expect(getHealthSnapshot().today).toBeNull()
    expect(useDiaryStore.getState().days).toBe(before.days)
  })
})

describe('energi och vatten till Hälsa', () => {
  it('skickar avslutade dagar som tillskott – aldrig dagen som pågår, aldrig dubbelt, aldrig negativt', async () => {
    const twoDaysAgo = addDays(TODAY, -2)
    connected({ since: twoDaysAgo })
    addFood(TODAY, 999) // dagen pågår – skickas i morgon
    const lunch = addFood(YESTERDAY, 600)
    addFood(YESTERDAY, 1200)
    addFood(twoDaysAgo, 1800)
    addFood(addDays(TODAY, -3), 777) // före kopplingen
    await syncHealth({ read: false })
    expect(saved('dietaryEnergyConsumed').map((o: { value: number; endDate: string }) => [o.value, o.endDate])).toEqual([
      [1800, at(twoDaysAgo, 23, 59)],
      [1800, at(YESTERDAY, 23, 59)],
    ])

    addFood(YESTERDAY, 200) // något som glömdes i går
    await syncHealth({ read: false })
    await syncHealth({ read: false })
    expect(saved('dietaryEnergyConsumed').map((o: { value: number }) => o.value)).toEqual([1800, 1800, 200])

    // Borttaget i Lagom → inget skickas (tillägget kan inte ta bort i Hälsa).
    useDiaryStore.getState().removeEntry(YESTERDAY, lunch.id)
    addFood(YESTERDAY, 500) // 1 900 < 2 000 som redan skickats
    await syncHealth({ read: false })
    addFood(YESTERDAY, 300) // 2 200 → 200 över
    await syncHealth({ read: false })
    expect(saved('dietaryEnergyConsumed').map((o: { value: number }) => o.value)).toEqual([1800, 1800, 200, 200])
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
  })

  it('vatten skickas i liter; avstängt val skickas inte', async () => {
    seed({ enabled: true, since: YESTERDAY, choices: { ...sanitizeHealthState(null).choices, writeEnergy: false } })
    addFood(YESTERDAY, 400)
    useDiaryStore.getState().addWater(YESTERDAY, 250)
    await syncHealth({ read: false })
    useDiaryStore.getState().addWater(YESTERDAY, 5) // för lite för att skicka
    await syncHealth({ read: false })
    useDiaryStore.getState().addWater(YESTERDAY, 245)
    await syncHealth({ read: false })
    expect(saved('dietaryWater').map((o: { value: number }) => o.value)).toEqual([0.25, 0.25])
    expect(saved('dietaryEnergyConsumed')).toEqual([])
  })

  it('en skrivning som misslyckas skickas nästa gång (loggen uppdateras bara efter lyckad skrivning)', async () => {
    connected({ since: YESTERDAY })
    addFood(YESTERDAY, 300)
    mocks.plugin.saveSample.mockRejectedValueOnce(new Error('Protected health data is inaccessible'))
    await syncHealth({ read: false, quiet: true })
    expect(mocks.logError).not.toHaveBeenCalled()
    await syncHealth({ read: false })
    expect(saved('dietaryEnergyConsumed').map((o: { value: number }) => o.value)).toEqual([300, 300])
    expect(stored().ledger.sent[YESTERDAY]).toMatchObject({ kcal: 300 })
  })
})

describe('när synken inte ska köras', () => {
  it('exempeldata synkas aldrig åt något håll', async () => {
    mocks.access = { canLog: false, demo: true }
    mocks.weightSamples = [weightSample(TODAY, 7, 70)]
    connected()
    addFood(TODAY, 500)
    await expect(syncHealth()).resolves.toBeNull()
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
    expect(mocks.plugin.saveSample).not.toHaveBeenCalled()
    expect(getHealthSnapshot().problem).toBe('exempel')
  })

  it('före den egna profilen synkas inget', async () => {
    useProfileStore.setState({ settings: { ...useProfileStore.getState().settings, onboardingDone: false } })
    connected()
    await expect(syncHealth()).resolves.toBeNull()
    expect(mocks.plugin.checkAuthorization).not.toHaveBeenCalled()
  })

  it('provperioden slut: vikter hämtas inte, men steg och skickandet fungerar', async () => {
    mocks.access = { canLog: false, demo: false }
    mocks.weightSamples = [weightSample(TODAY, 7, 70)]
    mocks.stepBuckets = [bucket(TODAY, 4000)]
    connected({ since: YESTERDAY })
    addFood(YESTERDAY, 500)
    await syncHealth()
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
    expect(useBodyStore.getState().weights).toEqual([])
    expect(useDiaryStore.getState().days[TODAY]?.steps).toBe(4000)
    expect(saved('dietaryEnergyConsumed')).toHaveLength(1)
    expect(getHealthSnapshot().problem).toBe('provperiod')
  })

  it('saknad behörighet: den delen hoppas över, resten körs', async () => {
    mocks.platform = 'android'
    mocks.plugin.checkAuthorization.mockImplementation(async (o: AuthorizationOptions) => ({
      ...mocks.grant(o),
      writeAuthorized: ['dietaryWater', 'weight'],
      writeDenied: ['dietaryEnergyConsumed'],
    }))
    connected({ since: YESTERDAY })
    addFood(YESTERDAY, 500)
    useDiaryStore.getState().addWater(YESTERDAY, 300)
    await syncHealth()
    expect(saved('dietaryEnergyConsumed')).toEqual([])
    expect(saved('dietaryWater')).toHaveLength(1)
    expect(getHealthSnapshot().missing).toEqual(['writeEnergy'])
  })

  it('ett läsfel loggas och visas, men resten körs och synktiden flyttas inte fram', async () => {
    connected({ since: YESTERDAY, lastSync: 123 })
    mocks.plugin.readSamples.mockRejectedValue(new Error('Rate limited request quota has been exceeded'))
    mocks.stepBuckets = [bucket(TODAY, 1000)]
    addFood(YESTERDAY, 250)
    const summary = await syncHealth()
    expect(summary).toMatchObject({ stepDays: 1, kcal: 250 })
    expect(mocks.logError).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:halsa')
    expect(getHealthSnapshot()).toMatchObject({ problem: 'fel', lastSync: 123 })
  })

  it('Health Connect borttagen efter kopplingen → förklaras, loggas inte', async () => {
    mocks.platform = 'android'
    connected()
    mocks.plugin.checkAuthorization.mockRejectedValue(new Error('Health Connect needs an update.'))
    mocks.plugin.isAvailable.mockResolvedValue({ available: false, reason: 'Health Connect needs an update.' })
    await expect(syncHealth()).resolves.toBeNull()
    expect(getHealthSnapshot().problem).toBe('uppdatera')
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})

describe('en synk i taget', () => {
  it('en begäran under en pågående synk körs en gång efteråt', async () => {
    connected({ since: YESTERDAY })
    let release!: () => void
    mocks.plugin.checkAuthorization.mockImplementationOnce(
      (o: AuthorizationOptions) =>
        new Promise((resolve) => {
          release = () => resolve(mocks.grant(o))
        }),
    )
    const first = syncHealth({ read: false })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    addFood(YESTERDAY, 400)
    const second = syncHealth({ read: false })
    const third = syncHealth({ read: false })
    expect(third).toBe(second)
    release()
    await first
    await second
    expect(mocks.plugin.checkAuthorization).toHaveBeenCalledTimes(2)
    expect(saved('dietaryEnergyConsumed').map((o: { value: number }) => o.value)).toEqual([400])
  })
})

describe('avbrott mitt i en synk', () => {
  /** Håller kvar nästa energiskrivning tills `release()` anropas. */
  function holdNextSave() {
    let release!: () => void
    mocks.plugin.saveSample.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    return { release: () => release() }
  }

  it('"Radera all data" under synken: inget mer skrivs, inte heller loggen', async () => {
    connected({ since: YESTERDAY })
    addFood(YESTERDAY, 500)
    useDiaryStore.getState().addWater(YESTERDAY, 250)
    const hold = holdNextSave()
    const sync = syncHealth({ read: false })
    await vi.waitFor(() => expect(mocks.plugin.saveSample).toHaveBeenCalledTimes(1))
    resetHealth()
    hold.release()
    await expect(sync).resolves.toBeNull()
    expect(mocks.plugin.saveSample).toHaveBeenCalledTimes(1) // vattnet skickades aldrig
    expect(localStorage.getItem(HEALTH_STORAGE_KEY)).toBeNull()
    expect(getHealthSnapshot()).toMatchObject({ enabled: false, problem: null, lastResult: null })
  })

  it('frånkopplad under synken: det som redan skickats förs in i loggen, inget nytt börjar', async () => {
    connected({ since: YESTERDAY })
    addFood(YESTERDAY, 500)
    useDiaryStore.getState().addWater(YESTERDAY, 250)
    const hold = holdNextSave()
    const sync = syncHealth({ read: false })
    await vi.waitFor(() => expect(mocks.plugin.saveSample).toHaveBeenCalledTimes(1))
    disconnectHealth()
    hold.release()
    await sync
    expect(mocks.plugin.saveSample).toHaveBeenCalledTimes(1)
    expect(stored()).toMatchObject({ enabled: false, ledger: { sent: { [YESTERDAY]: { kcal: 500 } } } })
    expect(getHealthSnapshot()).toMatchObject({ enabled: false, missing: [], lastResult: null })
  })
})

describe('startHealth', () => {
  it('synkar vid start, skickar en stund efter ändringar och när appen går till bakgrunden', async () => {
    connected({ since: YESTERDAY, lastImport: NOW.getTime() })
    await startHealth()
    await vi.waitFor(() => expect(mocks.plugin.checkAuthorization).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(getHealthSnapshot().syncing).toBe(false))
    expect(mocks.app.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function))

    // En ändring i dagboken skickas efter en stund – inte direkt, och utan ny hämtning.
    mocks.plugin.readSamples.mockClear()
    addFood(YESTERDAY, 300) // i efterhand, för i går (dagen som pågår skickas inte)
    await vi.advanceTimersByTimeAsync(SEND_DEBOUNCE_MS - 1000)
    expect(saved('dietaryEnergyConsumed')).toEqual([])
    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(saved('dietaryEnergyConsumed')).toHaveLength(1))
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()

    // Till bakgrunden: skickas direkt, tyst.
    addFood(YESTERDAY, 100)
    mocks.appListeners.forEach((l) => l({ isActive: false }))
    await vi.waitFor(() => expect(saved('dietaryEnergyConsumed')).toHaveLength(2))
    await vi.waitFor(() => expect(getHealthSnapshot().syncing).toBe(false))

    // Tillbaka efter en kort stund: skickar men hämtar inte; efter fem minuter hämtas det igen.
    mocks.appListeners.forEach((l) => l({ isActive: true }))
    await vi.waitFor(() => expect(mocks.plugin.checkAuthorization).toHaveBeenCalledTimes(4))
    await vi.waitFor(() => expect(getHealthSnapshot().syncing).toBe(false))
    expect(mocks.plugin.readSamples).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + RESUME_IMPORT_MS)
    mocks.appListeners.forEach((l) => l({ isActive: true }))
    await vi.waitFor(() => expect(mocks.plugin.readSamples).toHaveBeenCalledTimes(1))
  })

  it('avstängd: startar lyssnarna men synkar inte', async () => {
    await startHealth()
    await startHealth()
    expect(mocks.app.addListener).toHaveBeenCalledTimes(1)
    addFood(TODAY, 300)
    await vi.advanceTimersByTimeAsync(SEND_DEBOUNCE_MS)
    mocks.appListeners.forEach((l) => l({ isActive: true }))
    expect(mocks.plugin.checkAuthorization).not.toHaveBeenCalled()
  })

  it('ett fel när lyssnaren läggs till loggas – kastar aldrig', async () => {
    mocks.app.addListener.mockRejectedValueOnce(new Error('App-tillägget saknas'))
    await expect(startHealth()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:halsa')
  })
})

describe('loggen hålls liten', () => {
  it('gamla dagar rensas bort vid synk', async () => {
    const old = toISODate(new Date(2025, 0, 1))
    connected({
      since: TODAY,
      ledger: { weights: { [old]: { id: 'a', at: 'x' } }, steps: { [old]: 1 }, sent: { [old]: { kcal: 1 }, [TODAY]: { kcal: 1 } }, sentWeights: { [old]: 'b' } },
    })
    await syncHealth()
    const ledger = stored().ledger
    expect(ledger.weights).toEqual({})
    expect(ledger.steps).toEqual({})
    expect(ledger.sentWeights).toEqual({})
    expect(Object.keys(ledger.sent)).toEqual([TODAY])
  })
})
