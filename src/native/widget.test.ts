/**
 * Hemskärmswidgeten i Android-appen (src/native/widget.ts) med ett mockat LagomWidget-tillägg och
 * App-tillägg: sammanfattningen skickas vid start, efter en paus i ändringarna, när appen öppnas
 * igen och direkt när den går till bakgrunden – aldrig samma innehåll två gånger i rad. Bara
 * widgetens två länkar leder någonstans. iPhone och webben gör ingenting, fel loggas och kastas
 * aldrig, och "Radera all data" tömmer widgeten.
 */
import { clearDemoFlag, setDemoFlag } from '../lib/demoFlag'
import type { WidgetPayload } from '../lib/widgetSummary'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import type { Profile } from '../types'
import {
  clearWidget,
  flushWidget,
  openWidgetLink,
  pageWasReloaded,
  pushWidgetNow,
  resetWidgetForTests,
  startWidget,
  WIDGET_DEBOUNCE_MS,
  WIDGET_IOS_READY,
  widgetLinkRoute,
  widgetSupported,
} from './widget'

type Listener = (event: never) => void

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: never) => void>>()
  return {
    listeners,
    platform: 'android' as 'ios' | 'android' | 'web',
    memoryOnly: false,
    launchUrl: undefined as string | undefined,
    update: vi.fn(async (_options: { data: string }) => {}),
    clear: vi.fn(async () => {}),
    /** Namnen som registerPlugin har anropats med. */
    pluginNames: [] as string[],
    addListener: vi.fn(async (event: string, listener: (event: never) => void) => {
      const set = listeners.get(event) ?? new Set()
      set.add(listener)
      listeners.set(event, set)
      return { remove: async () => void set.delete(listener) }
    }),
    getLaunchUrl: vi.fn(async (): Promise<{ url: string } | undefined> => (mocks.launchUrl ? { url: mocks.launchUrl } : undefined)),
    logError: vi.fn(),
  }
})

vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  registerPlugin: (name: string) => {
    mocks.pluginNames.push(name)
    return { update: mocks.update, clear: mocks.clear }
  },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.addListener, getLaunchUrl: mocks.getLaunchUrl } }))
vi.mock('../lib/errorLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorLog')>()),
  logError: mocks.logError,
}))
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  isNative: () => mocks.platform !== 'web',
  nativePlatform: () => mocks.platform,
  // "Radera all data" och starten laddar den riktiga widgetmodulen – inga andra native-moduler.
  loadNative: async (name: string) => (mocks.platform !== 'web' && name === 'widget' ? await import('./widget') : null),
}))
vi.mock('../stores/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../stores/storage')>()
  return { ...original, isMemoryOnlyStorage: () => mocks.memoryOnly || original.isMemoryOnlyStorage() }
})

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

/** Den riktiga timern (testerna fejkar setTimeout och klockan). */
const realSetTimeout = globalThis.setTimeout
/** Låt alla väntande löften (kön, microtasks) bli klara. */
const idle = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0))

const emit = (event: string, payload: unknown) => mocks.listeners.get(event)?.forEach((l) => (l as Listener)(payload as never))
const appState = async (isActive: boolean) => {
  emit('appStateChange', { isActive })
  await idle()
}
const sent = (): WidgetPayload[] => mocks.update.mock.calls.map(([o]) => JSON.parse(o.data) as WidgetPayload)
const lastSent = (): WidgetPayload | undefined => sent().at(-1)

/** Måndag 28 september 2026 kl. 12. */
const NOON = new Date(2026, 8, 28, 12, 0)

function withProfile(): void {
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
}

function logLunch(kcal: number, date = '2026-09-28'): void {
  useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Lunch', nutrients: { kcal }, date, meal: 'lunch' })
}

beforeAll(async () => {
  const stores = [useProfileStore, useDiaryStore, useBodyStore, useFastingStore]
  await vi.waitFor(() => expect(stores.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(async () => {
  resetWidgetForTests()
  await idle()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOON)
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useFastingStore.getState().clearFasting()
  useProfileStore.getState().resetProfile()
  clearDemoFlag()
  mocks.listeners.clear()
  mocks.platform = 'android'
  mocks.memoryOnly = false
  mocks.launchUrl = undefined
  for (const fn of [mocks.update, mocks.clear, mocks.addListener, mocks.getLaunchUrl, mocks.logError]) fn.mockClear()
  mocks.update.mockImplementation(async () => {})
  mocks.clear.mockImplementation(async () => {})
  window.location.hash = ''
})

afterEach(() => {
  resetWidgetForTests()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('tillägget', () => {
  it('heter LagomWidget och finns bara på Android (iPhone väntar)', () => {
    expect(mocks.pluginNames).toEqual(['LagomWidget'])
    expect(WIDGET_IOS_READY).toBe(false)
    expect(widgetSupported()).toBe(true)
    mocks.platform = 'ios'
    expect(widgetSupported()).toBe(false)
    mocks.platform = 'web'
    expect(widgetSupported()).toBe(false)
  })
})

describe('sammanfattningen', () => {
  it('skickas en gång vid start', async () => {
    withProfile()
    logLunch(760)
    await startWidget()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    const payload = lastSent()!
    expect(payload).toMatchObject({ v: 1, state: 'ok', generatedAt: NOON.getTime() })
    expect(payload.days[0]).toMatchObject({ date: '2026-09-28', mealsText: '1 måltid loggad' })
    expect(mocks.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function))
    expect(mocks.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function))
  })

  it('utan profil: "Skapa din profil i Lagom"', async () => {
    await startWidget()
    expect(lastSent()).toMatchObject({ state: 'noProfile', days: [], fallbackText: 'Skapa din profil i Lagom' })
  })

  it('flera ändringar i rad blir en uppdatering efter pausen', async () => {
    withProfile()
    await startWidget()
    mocks.update.mockClear()
    logLunch(300)
    await vi.advanceTimersByTimeAsync(1000)
    logLunch(200)
    await vi.advanceTimersByTimeAsync(1000)
    useDiaryStore.getState().addWater('2026-09-28', 250)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS - 1)
    expect(mocks.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(lastSent()!.days[0]).toMatchObject({ mealsText: '1 måltid loggad', energyDetail: expect.stringMatching(/^500 av /), waterText: expect.stringMatching(/^0,25 av /) })
  })

  it('samma innehåll skickas inte två gånger i rad', async () => {
    withProfile()
    await startWidget()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    // En anteckning ändrar dagboken men inte widgeten.
    useDiaryStore.getState().setDayMeta('2026-09-28', { note: 'Skönt pass' })
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    // Inte heller en senare tidpunkt samma dag (tidsstämpeln räknas inte).
    vi.setSystemTime(new Date(2026, 8, 28, 18, 0))
    await expect(pushWidgetNow()).resolves.toBe(false)
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })

  it('exempeldata och fastan följer med när de ändras', async () => {
    withProfile()
    await startWidget()
    useFastingStore.getState().startFast(16, '16:8', NOON.getTime() - 3_600_000)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(lastSent()!.fasting).toEqual({ startedAt: NOON.getTime() - 3_600_000, label: 'Fasta pågår', targetText: 'Mål 16 h' })
    setDemoFlag()
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(lastSent()).toMatchObject({ state: 'demo', days: [], fasting: null })
  })

  it('när appen öppnas igen skickas den direkt – datumet kan ha bytts', async () => {
    withProfile()
    await startWidget()
    expect(lastSent()!.days[0].date).toBe('2026-09-28')
    // En vecka senare finns dagen inte i den gamla sammanfattningen.
    vi.setSystemTime(new Date(2026, 9, 6, 7, 30))
    await appState(false)
    await appState(true)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(lastSent()!.days[0].date).toBe('2026-10-06')
    expect(lastSent()!.generatedAt).toBe(new Date(2026, 9, 6, 7, 30).getTime())
  })

  it('en väntande ändring skickas direkt när appen går till bakgrunden – och därefter direkt', async () => {
    withProfile()
    await startWidget()
    logLunch(400)
    await appState(false)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(lastSent()!.days[0].energyDetail).toMatch(/^400 av /)
    // Timern är borta – ingen extra uppdatering efteråt.
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    expect(mocks.update).toHaveBeenCalledTimes(2)
    // I bakgrunden (t.ex. ett fält som sparas på visibilitychange) väntar vi inte på pausen.
    logLunch(100)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(3)
    await appState(true)
    logLunch(100)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(3)
    await flushWidget()
    expect(mocks.update).toHaveBeenCalledTimes(4)
  })

  it('skickas inte när lagringen bara finns i minnet – den förra ligger kvar', async () => {
    withProfile()
    mocks.memoryOnly = true
    await startWidget()
    logLunch(500)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(mocks.update).not.toHaveBeenCalled()
    mocks.memoryOnly = false
    await expect(pushWidgetNow()).resolves.toBe(true)
  })
})

describe('länkar från widgeten', () => {
  it('bara widgetens två adresser leder någonstans', () => {
    expect(widgetLinkRoute('lagom-widget://idag')).toBe('/')
    expect(widgetLinkRoute('lagom-widget://lagg-till')).toBe('/lagg-till')
    for (const url of [
      'lagom-widget://lagg-till?maltid=lunch',
      'lagom-widget://lagg-till/',
      'LAGOM-WIDGET://idag',
      'lagom-widget://installningar',
      'lagom-widget://constructor',
      'https://lagomappen.se/#/lagg-till',
      '#/lagg-till',
      '',
      undefined,
      42,
    ]) {
      expect(widgetLinkRoute(url)).toBeNull()
      expect(openWidgetLink(url)).toBe(false)
    }
    expect(window.location.hash).toBe('')
  })

  it("'appUrlOpen' medan appen körs öppnar Lägg till och Idag i hash-routern", async () => {
    await startWidget()
    window.location.hash = '#/dagbok'
    emit('appUrlOpen', { url: 'lagom-widget://lagg-till' })
    expect(window.location.hash).toBe('#/lagg-till')
    emit('appUrlOpen', { url: 'lagom-widget://idag' })
    expect(window.location.hash).toBe('#/')
    emit('appUrlOpen', { url: 'https://example.com/#/installningar' })
    expect(window.location.hash).toBe('#/')
  })

  it('länken som startade appen (getLaunchUrl)', async () => {
    mocks.launchUrl = 'lagom-widget://lagg-till'
    await startWidget()
    expect(mocks.getLaunchUrl).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/lagg-till')
  })

  it('en annan startlänk ignoreras', async () => {
    mocks.launchUrl = 'lagomappen://lagg-till'
    await startWidget()
    expect(window.location.hash).toBe('')
  })

  it('vid en kallstart kommer länken två vägar (sparad appUrlOpen och getLaunchUrl) – sidan öppnas en gång', async () => {
    mocks.launchUrl = 'lagom-widget://lagg-till'
    // Capacitor skickar en sparad 'appUrlOpen' direkt när lyssnaren registreras (BridgeActivity.load).
    mocks.addListener.mockImplementationOnce(async (event: string, listener: (event: never) => void) => {
      const set = mocks.listeners.get(event) ?? new Set()
      set.add(listener)
      mocks.listeners.set(event, set)
      listener({ url: 'lagom-widget://lagg-till' } as never)
      return { remove: async () => void set.delete(listener) }
    })
    const before = window.history.length
    await startWidget()
    expect(mocks.getLaunchUrl).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/lagg-till')
    expect(window.history.length - before).toBe(1)
  })

  it('efter en omladdning i samma aktivitet följs startlänken inte igen', async () => {
    // Capacitor ger samma startlänk så länge aktiviteten lever (Bridge.intentUri).
    mocks.launchUrl = 'lagom-widget://lagg-till'
    const navigation = vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }] as unknown as PerformanceEntryList)
    try {
      expect(pageWasReloaded()).toBe(true)
      await startWidget()
    } finally {
      navigation.mockRestore()
    }
    expect(mocks.getLaunchUrl).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
    // Ett nytt tryck på widgeten kommer som 'appUrlOpen' och öppnar sidan som vanligt.
    emit('appUrlOpen', { url: 'lagom-widget://lagg-till' })
    expect(window.location.hash).toBe('#/lagg-till')
  })

  it('pageWasReloaded: bara en omladdning räknas – en första laddning eller ett fel gör det inte', () => {
    const navigation = vi.spyOn(performance, 'getEntriesByType')
    try {
      navigation.mockReturnValue([{ type: 'navigate' }] as unknown as PerformanceEntryList)
      expect(pageWasReloaded()).toBe(false)
      navigation.mockReturnValue([])
      expect(pageWasReloaded()).toBe(false)
      navigation.mockImplementation(() => {
        throw new Error('saknas')
      })
      expect(pageWasReloaded()).toBe(false)
    } finally {
      navigation.mockRestore()
    }
  })
})

describe('iPhone och webben', () => {
  it.each(['ios', 'web'] as const)('%s: ingenting startas, skickas eller töms', async (platform) => {
    mocks.platform = platform
    mocks.launchUrl = 'lagom-widget://lagg-till'
    withProfile()
    await startWidget()
    logLunch(500)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await expect(pushWidgetNow()).resolves.toBe(false)
    await clearWidget()
    expect(mocks.addListener).not.toHaveBeenCalled()
    expect(mocks.getLaunchUrl).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')
  })
})

describe('fel', () => {
  it('ett avvisat anrop loggas och prövas igen vid nästa ändring', async () => {
    withProfile()
    mocks.update.mockRejectedValueOnce(new Error('Ogiltig data'))
    await expect(startWidget()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:widget')
    // Samma innehåll prövas igen – det kom aldrig fram.
    await expect(pushWidgetNow()).resolves.toBe(true)
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  it('trasiga lyssnare och startlänk stoppar inte widgeten', async () => {
    mocks.addListener.mockRejectedValue(new Error('saknas'))
    mocks.getLaunchUrl.mockRejectedValueOnce(new Error('saknas'))
    try {
      await expect(startWidget()).resolves.toBeUndefined()
      expect(mocks.logError).toHaveBeenCalledTimes(3)
      expect(mocks.update).toHaveBeenCalledTimes(1)
    } finally {
      mocks.addListener.mockReset()
      mocks.addListener.mockImplementation(async (event: string, listener: (event: never) => void) => {
        const set = mocks.listeners.get(event) ?? new Set()
        set.add(listener)
        mocks.listeners.set(event, set)
        return { remove: async () => void set.delete(listener) }
      })
    }
  })

  it('en misslyckad tömning loggas men kastas inte', async () => {
    mocks.clear.mockRejectedValueOnce(new Error('trasig'))
    await expect(clearWidget()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:widget')
  })
})

describe('tömning ("Radera all data")', () => {
  it('tar bort sammanfattningen, stoppar en väntande uppdatering och fyller på vid nästa ändring', async () => {
    withProfile()
    await startWidget()
    logLunch(500)
    await clearWidget()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    // Samma innehåll som före tömningen skickas igen – widgeten är ju tom nu.
    logLunch(0)
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  it('clearNativeCopies tömmer widgeten – även när bara exempeldata raderades', async () => {
    const { clearNativeCopies } = await import('../features/settings/wipe')
    await clearNativeCopies()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    await clearNativeCopies({ keepMirror: true })
    expect(mocks.clear).toHaveBeenCalledTimes(2)
    mocks.platform = 'web'
    await clearNativeCopies()
    expect(mocks.clear).toHaveBeenCalledTimes(2)
  })

  it('wipeAndReset: raderingen fyller inte widgeten igen', async () => {
    withProfile()
    logLunch(500)
    await startWidget()
    const { wipeAndReset } = await import('../features/settings/wipe')
    await wipeAndReset()
    await vi.advanceTimersByTimeAsync(WIDGET_DEBOUNCE_MS)
    await idle()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
})

describe('starten i appen', () => {
  it('startNative startar widgeten sist och väntar inte på den', async () => {
    mocks.launchUrl = 'lagom-widget://idag'
    window.location.hash = '#/dagbok'
    const { startNative } = await import('./init')
    await startNative()
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(window.location.hash).toBe('#/')
  })
})
