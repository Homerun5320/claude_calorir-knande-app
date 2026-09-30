/**
 * Påminnelser (lokala notiser) med ett mockat `@capacitor/local-notifications`: vilka notiser som
 * byggs och deras texter, schemaläggningen (bara med behörighet, bara det som ändrats),
 * behörighetsfrågan, starten med bron till inställningssidan och tryck på en notis. Här finns
 * också testerna för butiken med valen (src/stores/reminderStore.ts) och för haptiken
 * (src/native/haptics.ts).
 */
import { waitFor } from '@testing-library/react'
import { set } from 'idb-keyval'
import { LAST_BACKUP_KEY } from '../features/settings/backupStatus'
import { clearDemoFlag, setDemoFlag } from '../lib/demoFlag'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import {
  activeReminderCount,
  defaultReminderSettings,
  REMINDER_STORE_KEY,
  sanitizeReminderSettings,
  useReminderBridge,
  useReminderStore,
  waterHours,
  type ReminderSettings,
} from '../stores/reminderStore'
import type { DiaryEntry, MealConfig } from '../types'
import { hapticsAllowed, resetHapticsForTests, success, tap } from './haptics'
import {
  BACKUP_ID,
  buildReminderNotifications,
  checkPermission,
  currentReminderInput,
  currentTimeZone,
  FASTING_ID,
  FOCUS_ID,
  isReminderId,
  matchesPending,
  nextBackupReminder,
  openReminder,
  REMINDER_CHANNEL_ID,
  REMINDER_ID_MAX,
  REMINDER_ID_MIN,
  requestPermission,
  resetRemindersForTests,
  startReminders,
  syncReminders,
  type ReminderInput,
} from './reminders'

type Notification = { id: number; title: string; body: string; channelId?: string; schedule?: { at?: Date; on?: Record<string, number> }; extra?: unknown }
type Listener = (payload: unknown) => void

const mocks = vi.hoisted(() => {
  const state = {
    platform: 'ios' as 'ios' | 'android' | 'web',
    native: true,
    permission: 'granted' as string,
    requestResult: 'granted' as string,
    pending: new Map<number, unknown>(),
    listeners: new Map<string, Listener>(),
  }
  const addListener = (event: string, listener: Listener) => {
    state.listeners.set(event, listener)
    return Promise.resolve({ remove: async () => void state.listeners.delete(event) })
  }
  return {
    state,
    checkPermissions: vi.fn(async () => ({ display: state.permission })),
    requestPermissions: vi.fn(async () => {
      state.permission = state.requestResult
      return { display: state.requestResult }
    }),
    getPending: vi.fn(async () => ({ notifications: [...state.pending.keys()].map((id) => ({ id, title: '', body: '' })) })),
    schedule: vi.fn(async (options: { notifications: Array<{ id: number }> }) => {
      for (const n of options.notifications) state.pending.set(n.id, n)
      return { notifications: options.notifications.map((n) => ({ id: n.id })) }
    }),
    cancel: vi.fn(async (options: { notifications: Array<{ id: number }> }) => {
      for (const n of options.notifications) state.pending.delete(n.id)
    }),
    createChannel: vi.fn(async (_channel: unknown) => {}),
    addListener: vi.fn(addListener),
    appAddListener: vi.fn(addListener),
    impact: vi.fn(async (_options: unknown) => {}),
    notification: vi.fn(async (_options: unknown) => {}),
    logError: vi.fn(),
  }
})

// Tilläggets riktiga Weekday behålls – bara anropen till telefonen byts ut.
vi.mock('@capacitor/local-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/local-notifications')>()),
  LocalNotifications: {
    checkPermissions: mocks.checkPermissions,
    requestPermissions: mocks.requestPermissions,
    getPending: mocks.getPending,
    schedule: mocks.schedule,
    cancel: mocks.cancel,
    createChannel: mocks.createChannel,
    addListener: mocks.addListener,
  },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.appAddListener } }))
vi.mock('@capacitor/haptics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/haptics')>()),
  Haptics: { impact: mocks.impact, notification: mocks.notification },
}))
vi.mock('./index', () => ({
  isNative: () => mocks.state.native,
  nativePlatform: () => (mocks.state.native ? mocks.state.platform : 'web'),
}))
vi.mock('../lib/errorLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorLog')>()),
  logError: mocks.logError,
}))

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Måndag 28 september 2026 kl. 10:00 (lokal tid). */
const MONDAY = new Date(2026, 8, 28, 10, 0)

const allMeals = (patch: Partial<Record<string, boolean>> = {}): MealConfig[] => DEFAULT_SETTINGS.meals.map((m) => ({ ...m, enabled: patch[m.id] ?? m.enabled }))

function settings(patch: Partial<ReminderSettings> = {}): ReminderSettings {
  return { ...defaultReminderSettings(), ...patch }
}

function input(patch: Partial<ReminderInput> = {}): ReminderInput {
  return {
    settings: settings(),
    meals: allMeals(),
    mindful: false,
    fast: null,
    lastBackup: null,
    hasData: true,
    focusTitle: null,
    ...patch,
  }
}

/** Alla påminnelser påslagna (utom dolda måltider, som kvällsmat som standard). */
function everything(): ReminderSettings {
  const s = defaultReminderSettings()
  for (const id of Object.keys(s.meals) as Array<keyof ReminderSettings['meals']>) s.meals[id] = { ...s.meals[id], enabled: true }
  return { ...s, water: { enabled: true, from: 9, to: 20, every: 2 }, fasting: true, backup: true, focus: true }
}

const scheduledNotifications = () => mocks.schedule.mock.calls.flatMap((c) => c[0].notifications as Notification[])

beforeAll(async () => {
  await waitFor(() => expect([useReminderStore, useProfileStore, useFastingStore, useDiaryStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  mocks.state.platform = 'ios'
  mocks.state.native = true
  mocks.state.permission = 'granted'
  mocks.state.requestResult = 'granted'
  mocks.state.pending.clear()
  mocks.state.listeners.clear()
})

afterEach(() => {
  resetRemindersForTests()
  resetHapticsForTests()
  vi.clearAllMocks()
  useReminderStore.getState().clearReminders()
  useFastingStore.setState({ active: null, history: [] })
  useProfileStore.setState({ profile: null, settings: DEFAULT_SETTINGS })
  useDiaryStore.setState({ entries: {} })
  localStorage.removeItem(LAST_BACKUP_KEY)
  clearDemoFlag()
  window.location.hash = ''
  Reflect.deleteProperty(window, 'matchMedia')
})

// ---------------------------------------------------------------------------
// Vilka notiser som byggs
// ---------------------------------------------------------------------------

describe('buildReminderNotifications', () => {
  it('ger inga notiser när allt är avstängt (standard)', () => {
    expect(buildReminderNotifications(input(), MONDAY)).toEqual([])
  })

  it('måltider: dagligen på vald tid, bara för måltider som visas i dagboken', () => {
    const s = settings()
    s.meals.lunch = { enabled: true, time: '12:15' }
    s.meals.kvallsmat = { enabled: true, time: '20:30' } // dold i dagboken som standard
    const meals = allMeals().map((m) => (m.id === 'lunch' ? { ...m, name: 'Luncharbete' } : m))
    const list = buildReminderNotifications(input({ settings: s, meals }), MONDAY)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 7101,
      title: 'Luncharbete',
      body: 'Logga när det passar dig – en ungefärlig uppskattning räcker gott.',
      schedule: { on: { hour: 12, minute: 15 }, allowWhileIdle: true },
      isExactNotification: false,
      extra: { path: '/lagg-till?maltid=lunch' },
    })
    expect(list[0]).not.toHaveProperty('channelId')
  })

  it('vatten: med jämna mellanrum inom tidsfönstret', () => {
    const list = buildReminderNotifications(input({ settings: settings({ water: { enabled: true, from: 9, to: 20, every: 2 } }) }), MONDAY)
    expect(list.map((n) => n.schedule?.on?.hour)).toEqual([9, 11, 13, 15, 17, 19])
    expect(list.map((n) => n.id)).toEqual([7120, 7121, 7122, 7123, 7124, 7125])
    expect(list.every((n) => n.title === 'Vatten' && n.schedule?.on?.minute === 0 && (n.extra as { path: string }).path === '/dryck')).toBe(true)
    // Texterna varierar lite.
    expect(new Set(list.map((n) => n.body)).size).toBeGreaterThan(1)
  })

  it('fastan: en gång när målet nås – bara om det ligger framåt i tiden', () => {
    const fast = { start: MONDAY.getTime() - 10 * HOUR, targetHours: 16 }
    const [n] = buildReminderNotifications(input({ settings: settings({ fasting: true }), fast }), MONDAY)
    expect(n).toMatchObject({ id: FASTING_ID, title: 'Fastemålet är nått', extra: { path: '/fasta' } })
    expect(n.schedule?.at).toEqual(new Date(MONDAY.getTime() + 6 * HOUR))
    expect(n.body).toBe('Du har nått ditt mål på 16\u00a0timmar. Avsluta fastan i Lagom när du äter nästa gång.')

    // Målet redan nått, eller ingen pågående fasta: ingen notis (den skulle annars visas direkt).
    expect(buildReminderNotifications(input({ settings: settings({ fasting: true }), fast: { ...fast, targetHours: 10 } }), MONDAY)).toEqual([])
    expect(buildReminderNotifications(input({ settings: settings({ fasting: true }) }), MONDAY)).toEqual([])
  })

  it('medvetet läge: inga siffror i fastans text', () => {
    const fast = { start: MONDAY.getTime() - HOUR, targetHours: 16.5 }
    const [n] = buildReminderNotifications(input({ settings: settings({ fasting: true }), fast, mindful: true }), MONDAY)
    expect(n.body).toBe('Du har nått ditt fastemål. Avsluta fastan i Lagom när du äter nästa gång.')
    expect(n.body).not.toMatch(/\d/)
  })

  it('säkerhetskopian: nästa söndag kl. 19 – bara om det finns egen data', () => {
    const [n] = buildReminderNotifications(input({ settings: settings({ backup: true }) }), MONDAY)
    expect(n).toMatchObject({ id: BACKUP_ID, title: 'Dags för en säkerhetskopia?', extra: { path: '/installningar/data' } })
    expect(n.schedule?.at).toEqual(new Date(2026, 9, 4, 19, 0))
    expect(buildReminderNotifications(input({ settings: settings({ backup: true }), hasData: false }), MONDAY)).toEqual([])
  })

  it('veckans fokus: måndag kl. 8, med fokuset om ett är valt', () => {
    const [withFocus] = buildReminderNotifications(input({ settings: settings({ focus: true }), focusTitle: 'Mer grönt' }), MONDAY)
    expect(withFocus).toMatchObject({ id: FOCUS_ID, title: 'Ny vecka', schedule: { on: { weekday: 2, hour: 8, minute: 0 } }, extra: { path: '/' } })
    expect(withFocus.body).toContain('Veckans fokus: Mer grönt.')
    const [without] = buildReminderNotifications(input({ settings: settings({ focus: true }) }), MONDAY)
    expect(without.body).toMatch(/Vill du välja ett litet fokus/)
    expect(without.extra).toEqual({ path: '/installningar/mal' })
  })

  it('Androids kanal sätts bara när den finns', () => {
    const list = buildReminderNotifications(input({ settings: everything() }), MONDAY, { channelId: REMINDER_CHANNEL_ID })
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((n) => n.channelId === REMINDER_CHANNEL_ID)).toBe(true)
  })

  it('unika id:n inom intervallet, inga exakta alarm och inga kalorier – i något läge', () => {
    const fast = { start: MONDAY.getTime(), targetHours: 16 }
    for (const mindful of [false, true]) {
      const list = buildReminderNotifications(input({ settings: everything(), mindful, fast, focusTitle: 'Rörelse 150 minuter' }), MONDAY)
      // 5 synliga måltider + 6 vatten + fasta + säkerhetskopia + fokus
      expect(list).toHaveLength(14)
      expect(new Set(list.map((n) => n.id)).size).toBe(list.length)
      expect(list.every((n) => isReminderId(n.id) && n.id >= REMINDER_ID_MIN && n.id <= REMINDER_ID_MAX)).toBe(true)
      expect(list.every((n) => n.isExactNotification === false && n.schedule?.allowWhileIdle === true)).toBe(true)
      for (const n of list) expect(`${n.title} ${n.body}`).not.toMatch(/kalori|kcal|\bkj\b|energi|vikt|gram|\bkg\b/i)
    }
  })

  it('iPhone tillåter högst 64 väntande notiser – även med vatten varje timme', () => {
    const s = everything()
    s.water = { enabled: true, from: 6, to: 22, every: 1 }
    const list = buildReminderNotifications(input({ settings: s, fast: { start: MONDAY.getTime(), targetHours: 16 } }), MONDAY)
    expect(list.length).toBeLessThanOrEqual(64)
  })
})

describe('nextBackupReminder', () => {
  it('söndag kl. 19 – samma söndag om tiden inte har passerat', () => {
    expect(nextBackupReminder(MONDAY, null)).toEqual(new Date(2026, 9, 4, 19, 0))
    expect(nextBackupReminder(new Date(2026, 9, 4, 18, 0), null)).toEqual(new Date(2026, 9, 4, 19, 0))
    expect(nextBackupReminder(new Date(2026, 9, 4, 19, 0, 30), null)).toEqual(new Date(2026, 9, 11, 19, 0))
  })

  it('hoppar över söndagen om en kopia har sparats de senaste sex dagarna', () => {
    const friday = new Date(2026, 9, 2, 10, 0)
    expect(nextBackupReminder(friday, new Date(2026, 8, 30, 12, 0).getTime())).toEqual(new Date(2026, 9, 11, 19, 0))
    expect(nextBackupReminder(friday, new Date(2026, 8, 28, 8, 0).getTime())).toEqual(new Date(2026, 9, 4, 19, 0))
    // En kopia "i framtiden" (fel klocka) räknas som nu.
    expect(nextBackupReminder(friday, friday.getTime() + 30 * DAY)).toEqual(new Date(2026, 9, 11, 19, 0))
  })
})

describe('currentReminderInput', () => {
  it('läser valen, måltiderna, fastan, fokuset och senaste säkerhetskopian', () => {
    useReminderStore.getState().setFlag('backup', true)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, mindfulMode: true, weeklyFocus: { id: 'fisk', since: '2026-09-28' } } })
    useFastingStore.setState({ active: { start: 1000, targetHours: 16, protocol: '16:8' } })
    localStorage.setItem(LAST_BACKUP_KEY, '1759000000000')
    useDiaryStore.setState({ entries: { '2026-09-28': [{ id: 'e1' } as DiaryEntry] } })
    const got = currentReminderInput()
    expect(got.settings.backup).toBe(true)
    expect(got.mindful).toBe(true)
    expect(got.fast).toEqual({ start: 1000, targetHours: 16 })
    expect(got.lastBackup).toBe(1759000000000)
    expect(got.hasData).toBe(true)
    expect(got.focusTitle).toBe('Fisk två gånger')
  })

  it('exempeldata räknas aldrig som något att säkerhetskopiera', () => {
    useDiaryStore.setState({ entries: { '2026-09-28': [{ id: 'e1' } as DiaryEntry] } })
    setDemoFlag()
    expect(currentReminderInput().hasData).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Behörighet
// ---------------------------------------------------------------------------

describe('behörighet', () => {
  it('checkPermission frågar aldrig användaren', async () => {
    mocks.state.permission = 'prompt'
    await expect(checkPermission()).resolves.toBe('prompt')
    mocks.state.permission = 'prompt-with-rationale'
    await expect(checkPermission()).resolves.toBe('prompt')
    mocks.state.permission = 'denied'
    await expect(checkPermission()).resolves.toBe('denied')
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
  })

  it('requestPermission visar systemets fråga bara när det går att fråga', async () => {
    mocks.state.permission = 'prompt'
    await expect(requestPermission()).resolves.toBe('granted')
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(1)

    mocks.state.permission = 'prompt-with-rationale'
    mocks.state.requestResult = 'denied'
    await expect(requestPermission()).resolves.toBe('denied')
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(2)

    // Redan nej (eller ja): ingen ny fråga.
    await expect(requestPermission()).resolves.toBe('denied')
    mocks.state.permission = 'granted'
    await expect(requestPermission()).resolves.toBe('granted')
    expect(mocks.requestPermissions).toHaveBeenCalledTimes(2)
  })

  it('ett fel från tillägget blir unavailable och loggas', async () => {
    mocks.checkPermissions.mockRejectedValueOnce(new Error('plugin not implemented'))
    await expect(checkPermission()).resolves.toBe('unavailable')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:paminnelser')
  })
})

// ---------------------------------------------------------------------------
// Schemaläggning
// ---------------------------------------------------------------------------

describe('syncReminders', () => {
  const now = () => MONDAY

  it('schemalägger ingenting utan behörighet – och frågar inte heller', async () => {
    mocks.state.permission = 'prompt'
    useReminderStore.getState().setMeal('lunch', { enabled: true })
    await syncReminders(now)
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
  })

  it('schemalägger valen och gör ingenting när inget har ändrats', async () => {
    useReminderStore.getState().setMeal('lunch', { enabled: true })
    useReminderStore.getState().setFlag('focus', true)
    await syncReminders(now)
    expect(scheduledNotifications().map((n) => n.id)).toEqual([7101, FOCUS_ID])

    mocks.schedule.mockClear()
    await syncReminders(now)
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.cancel).not.toHaveBeenCalled()
  })

  it('tar bort det som stängts av och schemalägger bara det som ändrats', async () => {
    const store = useReminderStore.getState()
    store.setMeal('lunch', { enabled: true })
    store.setWater({ enabled: true, from: 9, to: 14, every: 2 })
    await syncReminders(now)
    expect([...mocks.state.pending.keys()].sort()).toEqual([7101, 7120, 7121, 7122])

    mocks.schedule.mockClear()
    useReminderStore.getState().setWater({ enabled: false })
    useReminderStore.getState().setMeal('lunch', { time: '12:30' })
    await syncReminders(now)
    expect(mocks.cancel).toHaveBeenCalledWith({ notifications: [{ id: 7120 }, { id: 7121 }, { id: 7122 }] })
    expect(scheduledNotifications()).toEqual([expect.objectContaining({ id: 7101, schedule: expect.objectContaining({ on: { hour: 12, minute: 30 } }) })])
    expect([...mocks.state.pending.keys()]).toEqual([7101])
  })

  it('schemalägger på nytt om en notis inte längre väntar (t.ex. efter en omstart)', async () => {
    useReminderStore.getState().setFlag('focus', true)
    await syncReminders(now)
    mocks.state.pending.clear()
    mocks.schedule.mockClear()
    await syncReminders(now)
    expect(scheduledNotifications().map((n) => n.id)).toEqual([FOCUS_ID])
  })

  it('efter en omstart av appen jämförs med det som väntar i telefonen – en synlig påminnelse ligger kvar', async () => {
    // Som iPhone-delen av tillägget: det väntande har rubrik, text, schema och extra.
    mocks.getPending.mockImplementation(async () => ({ notifications: [...mocks.state.pending.values()] as Notification[] }))
    useReminderStore.getState().setMeal('lunch', { enabled: true })
    useReminderStore.getState().setFlag('focus', true)
    await syncReminders(now)
    expect(mocks.schedule).toHaveBeenCalledTimes(1)
    // Kallstart: minnet är tomt, men det som väntar stämmer – inget schemaläggs om.
    resetRemindersForTests()
    mocks.schedule.mockClear()
    await syncReminders(now)
    expect(mocks.schedule).not.toHaveBeenCalled()

    // Efter en resa: det som väntar schemalades i en annan tidszon – allt schemaläggs om.
    for (const [id, n] of mocks.state.pending) {
      const pending = n as Notification
      mocks.state.pending.set(id, { ...pending, extra: { ...(pending.extra as object), tz: 'America/New_York' } })
    }
    resetRemindersForTests()
    await syncReminders(now)
    expect(scheduledNotifications().map((n) => n.id)).toEqual([7101, FOCUS_ID])
    expect(scheduledNotifications().every((n) => (n.extra as { tz?: string }).tz === currentTimeZone())).toBe(true)
    mocks.getPending.mockReset()
    mocks.getPending.mockImplementation(async () => ({ notifications: [...mocks.state.pending.keys()].map((id) => ({ id, title: '', body: '' })) }))
  })

  it('matchesPending: rubrik, text, sida, tidszon och schema måste stämma', () => {
    const [lunch] = buildReminderNotifications(input({ settings: settings({ meals: { ...defaultReminderSettings().meals, lunch: { enabled: true, time: '12:00' } } }) }), MONDAY, {
      timeZone: 'Europe/Stockholm',
    })
    const pending = { id: lunch.id, title: lunch.title, body: lunch.body, schedule: { on: { hour: 12, minute: 0 } }, extra: { path: (lunch.extra as { path: string }).path, tz: 'Europe/Stockholm' } }
    expect(matchesPending(lunch, pending)).toBe(true)
    expect(matchesPending(lunch, { ...pending, schedule: { on: { hour: 12, minute: 30 } } })).toBe(false)
    expect(matchesPending(lunch, { ...pending, extra: { ...pending.extra, tz: 'Asia/Tokyo' } })).toBe(false)
    expect(matchesPending(lunch, { ...pending, title: 'Annat' })).toBe(false)
    expect(matchesPending(lunch, undefined)).toBe(false)
    const [backup] = buildReminderNotifications(input({ settings: settings({ backup: true }) }), MONDAY, { timeZone: 'Europe/Stockholm' })
    const at = backup.schedule?.at as Date
    const backupPending = { id: backup.id, title: backup.title, body: backup.body, schedule: { at: at.toISOString() }, extra: backup.extra }
    expect(matchesPending(backup, backupPending as never)).toBe(true)
    expect(matchesPending(backup, { ...backupPending, schedule: { at: new Date(at.getTime() + DAY).toISOString() } } as never)).toBe(false)
  })

  it('tar bort alla påminnelser när notiser inte längre är tillåtna – men rör inga andra notiser', async () => {
    useReminderStore.getState().setMeal('lunch', { enabled: true })
    await syncReminders(now)
    mocks.state.pending.set(42, { id: 42 })
    mocks.state.permission = 'denied'
    await syncReminders(now)
    expect(mocks.cancel).toHaveBeenLastCalledWith({ notifications: [{ id: 7101 }] })
    expect([...mocks.state.pending.keys()]).toEqual([42])
  })

  it('ett fel loggas, kastas inte, och nästa gång schemaläggs allt igen', async () => {
    useReminderStore.getState().setFlag('focus', true)
    mocks.schedule.mockRejectedValueOnce(new Error('Notifications not allowed'))
    await expect(syncReminders(now)).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:paminnelser')
    await syncReminders(now)
    expect(mocks.state.pending.has(FOCUS_ID)).toBe(true)
  })

  it('går väntande notiser inte att läsa städas hela intervallet utom det som ska finnas', async () => {
    useReminderStore.getState().setFlag('focus', true)
    mocks.getPending.mockRejectedValueOnce(new Error('trasig'))
    await syncReminders(now)
    const cancelled = mocks.cancel.mock.calls[0][0].notifications.map((n: { id: number }) => n.id)
    expect(cancelled).toHaveLength(REMINDER_ID_MAX - REMINDER_ID_MIN) // alla utom fokuset
    expect(cancelled).not.toContain(FOCUS_ID)
    expect(mocks.state.pending.has(FOCUS_ID)).toBe(true)
  })

  it('en ändring under en pågående schemaläggning körs direkt efteråt', async () => {
    useReminderStore.getState().setFlag('focus', true)
    const first = syncReminders(now)
    useReminderStore.getState().setFlag('backup', true)
    useDiaryStore.setState({ entries: { '2026-09-28': [{ id: 'e1' } as DiaryEntry] } })
    const second = syncReminders(now)
    expect(second).toBe(first)
    await second
    expect(mocks.state.pending.has(FOCUS_ID)).toBe(true)
    expect(mocks.state.pending.has(BACKUP_ID)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Start, bron och tryck på en notis
// ---------------------------------------------------------------------------

describe('startReminders', () => {
  it('lämnar bron till inställningssidan och startar bara en gång', async () => {
    await startReminders()
    await startReminders()
    const bridge = useReminderBridge.getState().bridge
    expect(bridge?.platform).toBe('ios')
    expect(mocks.addListener).toHaveBeenCalledTimes(1)
    expect(mocks.appAddListener).toHaveBeenCalledTimes(1)
    expect(mocks.createChannel).not.toHaveBeenCalled()
    mocks.state.permission = 'denied'
    await expect(bridge?.checkPermission()).resolves.toBe('denied')
  })

  it('frågar aldrig om behörighet vid starten, även med påslagna påminnelser', async () => {
    mocks.state.permission = 'prompt'
    useReminderStore.getState().setFlag('focus', true)
    await startReminders()
    await new Promise((r) => setTimeout(r, 50))
    expect(mocks.requestPermissions).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
  })

  it('schemalägger om när valen eller fastan ändras', async () => {
    await startReminders()
    useReminderStore.getState().setFlag('fasting', true)
    useFastingStore.getState().startFast(16, '16:8')
    await waitFor(() => expect(mocks.state.pending.has(FASTING_ID)).toBe(true))
    useFastingStore.getState().endFast()
    await waitFor(() => expect(mocks.state.pending.has(FASTING_ID)).toBe(false))
  })

  it('när appen öppnas igen läses behörigheten och säkerhetskopian på nytt', async () => {
    mocks.state.permission = 'denied'
    useReminderStore.getState().setFlag('focus', true)
    await startReminders()
    await new Promise((r) => setTimeout(r, 50))
    expect(mocks.state.pending.size).toBe(0)
    // Användaren slår på notiser i telefonens inställningar och går tillbaka till appen.
    mocks.state.permission = 'granted'
    mocks.state.listeners.get('appStateChange')?.({ isActive: true })
    await waitFor(() => expect(mocks.state.pending.has(FOCUS_ID)).toBe(true))
  })

  it('Android: en egen kanal, "Påminnelser", som notiserna läggs i', async () => {
    mocks.state.platform = 'android'
    useReminderStore.getState().setFlag('focus', true)
    await startReminders()
    expect(mocks.createChannel).toHaveBeenCalledWith(expect.objectContaining({ id: REMINDER_CHANNEL_ID, name: 'Påminnelser', importance: 3, visibility: 0 }))
    expect(useReminderBridge.getState().bridge?.platform).toBe('android')
    await waitFor(() => expect(mocks.state.pending.has(FOCUS_ID)).toBe(true))
    expect(scheduledNotifications()[0].channelId).toBe(REMINDER_CHANNEL_ID)
  })

  it('Android: går kanalen inte att skapa används standardkanalen', async () => {
    mocks.state.platform = 'android'
    mocks.createChannel.mockRejectedValueOnce(new Error('kanal'))
    useReminderStore.getState().setFlag('focus', true)
    await startReminders()
    await waitFor(() => expect(mocks.state.pending.has(FOCUS_ID)).toBe(true))
    expect(scheduledNotifications()[0]).not.toHaveProperty('channelId')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:paminnelser')
  })

  it('ett tryck på notisen öppnar rätt sida – bara för egna notiser med säkra sökvägar', async () => {
    await startReminders()
    const tapped = mocks.state.listeners.get('localNotificationActionPerformed')
    expect(tapped).toBeTypeOf('function')
    tapped?.({ actionId: 'tap', notification: { id: FASTING_ID, title: '', body: '', extra: { path: '/fasta' } } })
    expect(window.location.hash).toBe('#/fasta')
    tapped?.({ actionId: 'tap', notification: { id: 7101, title: '', body: '', extra: { path: 'https://example.com' } } })
    tapped?.({ actionId: 'tap', notification: { id: 1, title: '', body: '', extra: { path: '/mer' } } })
    tapped?.({ actionId: 'tap', notification: { id: 7101, title: '', body: '', extra: null } })
    expect(window.location.hash).toBe('#/fasta')
    openReminder({ actionId: 'tap', notification: { id: 7101, title: '', body: '', extra: { path: '/lagg-till?maltid=lunch' } } })
    expect(window.location.hash).toBe('#/lagg-till?maltid=lunch')
  })
})

// ---------------------------------------------------------------------------
// Butiken med valen (src/stores/reminderStore.ts)
// ---------------------------------------------------------------------------

describe('useReminderStore', () => {
  it('allt är avstängt från början', () => {
    const s = useReminderStore.getState()
    expect(activeReminderCount(s, allMeals())).toBe(0)
    expect(Object.values(s.meals).every((m) => !m.enabled)).toBe(true)
    expect([s.water.enabled, s.fasting, s.backup, s.focus]).toEqual([false, false, false, false])
  })

  it('räknar bara måltider som visas i dagboken', () => {
    const s = settings()
    s.meals.lunch = { enabled: true, time: '12:00' }
    s.meals.kvallsmat = { enabled: true, time: '20:30' }
    expect(activeReminderCount({ ...s, focus: true }, allMeals())).toBe(2)
    expect(activeReminderCount(s, allMeals({ kvallsmat: true }))).toBe(2)
  })

  it('sparar bara giltiga klockslag och ett rimligt vattenfönster', () => {
    const store = useReminderStore.getState()
    store.setMeal('frukost', { enabled: true, time: '7:5' })
    expect(useReminderStore.getState().meals.frukost).toEqual({ enabled: true, time: '07:30' })
    store.setMeal('frukost', { time: '06:45' })
    expect(useReminderStore.getState().meals.frukost.time).toBe('06:45')

    store.setWater({ enabled: true, from: 12, to: 14 })
    store.setWater({ from: 99 })
    expect(useReminderStore.getState().water).toEqual({ enabled: true, from: 12, to: 14, every: 2 })
    store.setWater({ to: 10 }) // inte en tillåten sluttid – oförändrat
    expect(useReminderStore.getState().water.to).toBe(14)
    expect(waterHours(useReminderStore.getState().water)).toEqual([12, 14])
  })

  it('sanitizeReminderSettings: skadade värden blir avstängda, aldrig ett fel', () => {
    expect(sanitizeReminderSettings(null)).toBeNull()
    expect(sanitizeReminderSettings('ja')).toBeNull()
    expect(sanitizeReminderSettings({})).toEqual(defaultReminderSettings())
    const got = sanitizeReminderSettings({
      meals: { lunch: { enabled: true, time: '25:00' }, okand: { enabled: true }, middag: 'på' },
      water: { enabled: 'ja', from: 12, to: 12, every: 7 },
      fasting: 1,
      backup: true,
    })
    expect(got?.meals.lunch).toEqual({ enabled: true, time: '12:00' })
    expect(got?.meals.middag).toEqual({ enabled: false, time: '18:00' })
    expect(got).not.toHaveProperty('meals.okand')
    expect(got?.water).toEqual({ enabled: false, from: 12, to: 20, every: 2 })
    expect([got?.fasting, got?.backup, got?.focus]).toEqual([false, true, false])
  })

  it('kontrollerar det sparade när butiken läses in', async () => {
    await set(REMINDER_STORE_KEY, JSON.stringify({ state: { meals: { lunch: { enabled: true, time: 'nu' } }, water: null, focus: true }, version: 1 }))
    await useReminderStore.persist.rehydrate()
    const s = useReminderStore.getState()
    expect(s.meals.lunch).toEqual({ enabled: true, time: '12:00' })
    expect(s.water.enabled).toBe(false)
    expect(s.focus).toBe(true)
    expect(useReminderStore.persist.getOptions().partialize?.(s)).toEqual(sanitizeReminderSettings(s))
  })

  it('replaceSettings och clearReminders', () => {
    const store = useReminderStore.getState()
    store.replaceSettings(everything())
    expect(activeReminderCount(useReminderStore.getState(), allMeals())).toBe(9)
    store.clearReminders()
    expect(activeReminderCount(useReminderStore.getState(), allMeals())).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Haptik (src/native/haptics.ts)
// ---------------------------------------------------------------------------

describe('haptik', () => {
  const reduceMotion = (on: boolean) => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({ matches: on && query === '(prefers-reduced-motion: reduce)', media: query }),
    })
  }

  it('tap och success i appen', () => {
    tap()
    success()
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.notification).toHaveBeenCalledWith({ type: 'SUCCESS' })
  })

  it('ingenting på webben', () => {
    mocks.state.native = false
    expect(hapticsAllowed()).toBe(false)
    tap()
    success()
    expect(mocks.impact).not.toHaveBeenCalled()
    expect(mocks.notification).not.toHaveBeenCalled()
  })

  it('respekterar "Minska rörelse"', () => {
    reduceMotion(true)
    expect(hapticsAllowed()).toBe(false)
    tap()
    success()
    expect(mocks.impact).not.toHaveBeenCalled()
    reduceMotion(false)
    tap()
    expect(mocks.impact).toHaveBeenCalledTimes(1)
  })

  it('fel loggas en gång och kastas aldrig', async () => {
    mocks.impact.mockRejectedValue(new Error('Vibrator saknas'))
    expect(() => {
      tap()
      tap()
    }).not.toThrow()
    await waitFor(() => expect(mocks.logError).toHaveBeenCalledTimes(1))
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:haptik')
    mocks.impact.mockReset()
  })
})
