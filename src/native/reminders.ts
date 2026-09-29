/**
 * Påminnelser i de inbyggda apparna – lokala notiser med `@capacitor/local-notifications`. Laddas
 * bara från `startNative()` (src/native/init.ts) och aldrig på webben.
 *
 * Valen ligger i `useReminderStore` (src/stores/reminderStore.ts) och är avstängda från början.
 * `startReminders()` lämnar en bro till inställningssidan (`setReminderBridge`), lyssnar på valen,
 * fastetimern, måltiderna och medvetet läge och schemalägger om när något ändras – och när appen
 * öppnas eller går till bakgrunden (då kan t.ex. en ny säkerhetskopia ha sparats).
 *
 * - Måltider och vatten: dagliga, upprepade notiser (`schedule.on`) på valda klockslag – de
 *   fortsätter även om appen inte öppnas.
 * - Fastan: en gång, när fastetimerns mål nås (bara om det ligger i framtiden).
 * - Säkerhetskopian: söndag kl. 19:00, bara om det finns data och ingen kopia har sparats de
 *   senaste sex dagarna. Bara nästa tillfälle schemaläggs – öppnas inte appen finns inget nytt att
 *   säkerhetskopiera, och då kommer ingen ny påminnelse.
 * - Veckans fokus: måndag kl. 08:00.
 *
 * Regler:
 * - Behörigheten frågas bara när användaren själv slår på en påminnelse (`requestPermission`).
 *   `schedule()` frågar annars själv (tillägget 8.3+), så inget schemaläggs utan behörighet.
 * - Inga exakta alarm (`isExactNotification: false`): SCHEDULE_EXACT_ALARM är borttagen i
 *   AndroidManifest.xml, och en påminnelse får gärna komma någon minut sent.
 * - Texterna är varma och nämner aldrig kalorier eller vikt – i medvetet läge inte heller några
 *   siffror alls.
 * - På Android läggs notiserna i en egen kanal, "Påminnelser", som visas i telefonens inställningar
 *   och döljer innehållet på en låst skärm.
 * - En notis schemaläggs bara om när den har ändrats – jämfört med det som faktiskt väntar i
 *   telefonen (`getPending`), inte med minnet, så att en synlig påminnelse inte försvinner när appen
 *   startas (på Android tar en ny schemaläggning med samma id bort den visade notisen). Tidszonen
 *   följer med i `extra.tz`: efter en resa schemaläggs allt om efter den nya lokala tiden.
 * - Allt kastar aldrig: fel loggas med `logError(…, 'native:paminnelser')`.
 */
import { App } from '@capacitor/app'
import type { PermissionState, PluginListenerHandle } from '@capacitor/core'
import { LocalNotifications, Weekday, type ActionPerformed, type LocalNotificationSchema, type PendingLocalNotificationSchema } from '@capacitor/local-notifications'
import { readLastBackup } from '../features/settings/backupStatus'
import { isDemoData } from '../lib/demoFlag'
import { logError } from '../lib/errorLog'
import { focusGoal } from '../lib/focusGoals'
import { formatNumber } from '../lib/format'
import { mealName } from '../lib/meals'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { useProfileStore } from '../stores/profileStore'
import {
  parseTime,
  reminderSettingsOf,
  setReminderBridge,
  useReminderStore,
  waterHours,
  type ReminderBridge,
  type ReminderPermission,
  type ReminderSettings,
} from '../stores/reminderStore'
import { MEAL_IDS, type MealConfig } from '../types'
import { nativePlatform } from './index'

const LOG_CONTEXT = 'native:paminnelser'

/** Androids notiskanal för påminnelserna. */
export const REMINDER_CHANNEL_ID = 'paminnelser'

/** Påminnelsernas id:n (Lagom har inga andra notiser, men håll dem inom ett eget intervall). */
export const REMINDER_ID_MIN = 7100
export const REMINDER_ID_MAX = 7199
const MEAL_ID_BASE = 7100 // + måltidens plats i MEAL_IDS (0–5)
const WATER_ID_BASE = 7120 // + tillfälle (högst `MAX_WATER_SLOTS`)
const MAX_WATER_SLOTS = 20
export const FASTING_ID = 7150
export const BACKUP_ID = 7160
export const FOCUS_ID = 7170

/** Säkerhetskopian: söndag (`Date.getDay()` 0) kl. 19:00. */
const BACKUP_WEEKDAY = 0
const BACKUP_HOUR = 19
/** En kopia som sparats de senaste sex dagarna räcker – då hoppas söndagens påminnelse över. */
export const BACKUP_FRESH_MS = 6 * 86_400_000
/** Veckans fokus: måndag kl. 08:00. */
const FOCUS_HOUR = 8
/** En engångsnotis schemaläggs bara om den ligger minst så här långt fram (annars visas den direkt). */
const MIN_LEAD_MS = 60_000

/** Sökvägar som en notis får öppna (skydd mot ett skadat `extra`). */
const SAFE_PATH = /^\/[a-z0-9/-]*(\?[a-z0-9=&-]*)?$/

export const isReminderId = (id: number): boolean => Number.isInteger(id) && id >= REMINDER_ID_MIN && id <= REMINDER_ID_MAX

// ---------------------------------------------------------------------------
// Vilka notiser som ska finnas (ren funktion)
// ---------------------------------------------------------------------------

export interface ReminderInput {
  settings: ReminderSettings
  /** Måltiderna i dagboken (namn och om de visas). */
  meals: readonly MealConfig[]
  /** Medvetet läge: inga siffror i texterna. */
  mindful: boolean
  /** Pågående fasta (fastetimern), annars null. */
  fast: { start: number; targetHours: number } | null
  /** Senaste säkerhetskopian på enheten (epoch-ms), annars null. */
  lastBackup: number | null
  /** Finns det egen data att säkerhetskopiera? (Aldrig för exempeldata.) */
  hasData: boolean
  /** Veckans fokus (rubriken, t.ex. "Mer grönt"), annars null. */
  focusTitle: string | null
}

export interface BuildOptions {
  /** Androids kanal – bara när den har skapats (annars visas notisen inte alls). */
  channelId?: string
  /** Tidszonen just nu (`currentTimeZone()`) – sparas i `extra.tz`, så att en ny tidszon märks. */
  timeZone?: string
}

/** Telefonens tidszon, t.ex. "Europe/Stockholm" (reserv: förskjutningen mot UTC i minuter). */
export function currentTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone) return zone
  } catch {
    /* faller tillbaka nedan */
  }
  return `UTC${-new Date().getTimezoneOffset()}`
}

const WATER_BODIES = [
  'Ett glas vatten när det passar?',
  'Dags för lite vatten? Logga glaset med ett tryck.',
  'En liten vattenpaus kanske – kroppen tackar.',
] as const

/** Nästa söndag kl. 19:00 då ingen säkerhetskopia har sparats de senaste sex dagarna. */
export function nextBackupReminder(now: Date, lastBackup: number | null): Date {
  const at = new Date(now)
  at.setHours(BACKUP_HOUR, 0, 0, 0)
  at.setDate(at.getDate() + ((7 + BACKUP_WEEKDAY - at.getDay()) % 7))
  if (at.getTime() < now.getTime() + MIN_LEAD_MS) at.setDate(at.getDate() + 7)
  // En kopia "i framtiden" (fel klocka) räknas som nu.
  const last = lastBackup === null ? null : Math.min(lastBackup, now.getTime())
  if (last !== null && at.getTime() - last < BACKUP_FRESH_MS) at.setDate(at.getDate() + 7)
  return at
}

/**
 * Notiserna som ska vara schemalagda just nu. Ren funktion – samma indata ger samma lista, så att
 * `syncReminders` kan hoppa över det som inte har ändrats.
 */
export function buildReminderNotifications(input: ReminderInput, now: Date, options: BuildOptions = {}): LocalNotificationSchema[] {
  const { settings } = input
  const out: LocalNotificationSchema[] = []
  const add = (id: number, title: string, body: string, path: string, schedule: NonNullable<LocalNotificationSchema['schedule']>) => {
    out.push({
      id,
      title,
      body,
      schedule: { ...schedule, allowWhileIdle: true },
      isExactNotification: false,
      extra: options.timeZone ? { path, tz: options.timeZone } : { path },
      ...(options.channelId ? { channelId: options.channelId } : {}),
    })
  }

  // Måltider – bara de som visas i dagboken.
  MEAL_IDS.forEach((id, index) => {
    const reminder = settings.meals[id]
    const meal = input.meals.find((m) => m.id === id)
    if (!reminder?.enabled || !meal?.enabled) return
    const time = parseTime(reminder.time)
    if (!time) return
    add(MEAL_ID_BASE + index, mealName([...input.meals], id), 'Logga när det passar dig – en ungefärlig uppskattning räcker gott.', `/lagg-till?maltid=${id}`, {
      on: { hour: time.hour, minute: time.minute },
    })
  })

  // Vatten – dagtid med jämna mellanrum.
  if (settings.water.enabled) {
    waterHours(settings.water)
      .slice(0, MAX_WATER_SLOTS)
      .forEach((hour, slot) => {
        add(WATER_ID_BASE + slot, 'Vatten', WATER_BODIES[slot % WATER_BODIES.length], '/dryck', { on: { hour, minute: 0 } })
      })
  }

  // Fastan – när målet nås, om det ligger framåt i tiden.
  if (settings.fasting && input.fast) {
    const end = input.fast.start + input.fast.targetHours * 3_600_000
    if (Number.isFinite(end) && end >= now.getTime() + MIN_LEAD_MS) {
      const hours = input.fast.targetHours
      const body = input.mindful
        ? 'Du har nått ditt fastemål. Avsluta fastan i Lagom när du äter nästa gång.'
        : `Du har nått ditt mål på ${formatNumber(hours, 1)}\u00a0${hours === 1 ? 'timme' : 'timmar'}. Avsluta fastan i Lagom när du äter nästa gång.`
      add(FASTING_ID, 'Fastemålet är nått', body, '/fasta', { at: new Date(end) })
    }
  }

  // Säkerhetskopian – söndag kväll om ingen har sparats på en vecka.
  if (settings.backup && input.hasData) {
    add(
      BACKUP_ID,
      'Dags för en säkerhetskopia?',
      'Det tar bara en stund och skyddar din dagbok om något händer med telefonen.',
      '/installningar/data',
      { at: nextBackupReminder(now, input.lastBackup) },
    )
  }

  // Veckans fokus – måndag morgon.
  if (settings.focus) {
    const [body, path] = input.focusTitle
      ? [`Veckans fokus: ${input.focusTitle}. Ett litet steg i taget räcker gott.`, '/']
      : ['Vill du välja ett litet fokus för veckan? Helt frivilligt – du hittar det under Mål.', '/installningar/mal']
    add(FOCUS_ID, 'Ny vecka', body, path, { on: { weekday: Weekday.Monday, hour: FOCUS_HOUR, minute: 0 } })
  }

  return out
}

// ---------------------------------------------------------------------------
// Behörighet
// ---------------------------------------------------------------------------

function toPermission(state: PermissionState | undefined): ReminderPermission {
  if (state === 'granted') return 'granted'
  if (state === 'denied') return 'denied'
  // 'prompt' och 'prompt-with-rationale' (Android efter ett första nej): går att fråga igen.
  return 'prompt'
}

/** Behörigheten just nu. Frågar aldrig användaren. */
export async function checkPermission(): Promise<ReminderPermission> {
  try {
    return toPermission((await LocalNotifications.checkPermissions()).display)
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return 'unavailable'
  }
}

/**
 * Fråga om lov att visa notiser – bara när användaren slår på en påminnelse. Har användaren redan
 * svarat nej visar systemet ingen ruta (iPhone, och Android efter två nej); då blir svaret
 * 'denied' och inställningssidan förklarar var notiserna slås på.
 */
export async function requestPermission(): Promise<ReminderPermission> {
  const current = await checkPermission()
  if (current !== 'prompt') return current
  let result: ReminderPermission
  try {
    result = toPermission((await LocalNotifications.requestPermissions()).display)
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return 'unavailable'
  }
  requestSync(0)
  return result
}

// ---------------------------------------------------------------------------
// Schemaläggning
// ---------------------------------------------------------------------------

/**
 * Signaturen för det som schemalagts per id under den här körningen – en reserv när det väntande
 * inte går att jämföra (t.ex. Androids format för en engångstid).
 */
const scheduled = new Map<number, string>()

const recordOf = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {})

/** Tidpunkten i ett väntande `schedule.at` (Date, ISO-text eller epoch-ms), annars NaN. */
function pendingTime(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime()
  return Number.NaN
}

/**
 * Väntar notisen redan i telefonen med samma innehåll: rubrik, text, sida, tidszon och schema
 * (klockslag och veckodag, eller tidpunkten för en engångsnotis)?
 */
export function matchesPending(n: LocalNotificationSchema, pending: PendingLocalNotificationSchema | undefined): boolean {
  if (!pending || pending.title !== n.title || pending.body !== n.body) return false
  const want = recordOf(n.extra)
  const have = recordOf(pending.extra)
  if (want.path !== have.path || want.tz !== have.tz) return false
  const on = n.schedule?.on
  if (on) {
    const pendingOn = recordOf(pending.schedule?.on)
    return (['weekday', 'hour', 'minute'] as const).every((k) => (on[k] ?? null) === (pendingOn[k] ?? null))
  }
  const at = n.schedule?.at
  if (at) return Math.abs(pendingTime(pending.schedule?.at) - at.getTime()) < 1000
  return false
}
let channelId: string | undefined
let running: Promise<void> | null = null
let rerun = false

/** Butikerna som påminnelserna läser – ingen schemaläggning innan de har lästs in. */
function storesReady(): boolean {
  return [useReminderStore, useProfileStore, useFastingStore, useDiaryStore].every((s) => s.persist.hasHydrated())
}

/** Indata ur butikerna just nu. */
export function currentReminderInput(): ReminderInput {
  const { settings } = useProfileStore.getState()
  const active = useFastingStore.getState().active
  const hasEntries = Object.values(useDiaryStore.getState().entries).some((list) => Array.isArray(list) && list.length > 0)
  return {
    settings: reminderSettingsOf(useReminderStore.getState()),
    meals: settings.meals,
    mindful: settings.mindfulMode,
    fast: active ? { start: active.start, targetHours: active.targetHours } : null,
    lastBackup: readLastBackup(),
    hasData: hasEntries && !isDemoData(),
    focusTitle: focusGoal(settings.weeklyFocus?.id)?.title ?? null,
  }
}

export type SyncOutcome = 'waiting' | 'unchanged' | 'updated' | 'failed'

/** Alla id:n i intervallet – används för att städa om listan över väntande notiser inte går att läsa. */
function allReminderIds(): number[] {
  const ids: number[] = []
  for (let id = REMINDER_ID_MIN; id <= REMINDER_ID_MAX; id++) ids.push(id)
  return ids
}

async function syncOnce(now: Date): Promise<SyncOutcome> {
  if (!storesReady()) return 'waiting'
  try {
    const permission = await checkPermission()
    // Utan behörighet schemaläggs inget – `schedule()` skulle annars själv fråga om lov.
    const wanted = permission === 'granted' ? buildReminderNotifications(currentReminderInput(), now, { channelId, timeZone: currentTimeZone() }) : []
    const wantedIds = new Set(wanted.map((n) => n.id))

    let pendingIds: Set<number>
    let pendingById: Map<number, PendingLocalNotificationSchema> | null = null
    try {
      const pending = await LocalNotifications.getPending()
      const own = pending.notifications.filter((n) => isReminderId(n.id))
      pendingIds = new Set(own.map((n) => n.id))
      pendingById = new Map(own.map((n) => [n.id, n]))
    } catch (error) {
      logError(error, LOG_CONTEXT)
      // Okänt vad som väntar: ta bort allt som inte ska finnas och lita på det som schemalagts.
      pendingIds = new Set([...allReminderIds().filter((id) => !wantedIds.has(id)), ...scheduled.keys()])
    }

    const stale = [...pendingIds].filter((id) => !wantedIds.has(id))
    // En notis med samma id ersätts (på Android försvinner då också en visad notis) – därför bara
    // de som är nya, ändrade eller inte längre väntar. Jämförs med det som väntar i telefonen (även
    // efter en omstart av appen), och i andra hand med det som schemalagts under den här körningen.
    const changed = wanted.filter(
      (n) => !pendingIds.has(n.id) || (!matchesPending(n, pendingById?.get(n.id)) && scheduled.get(n.id) !== JSON.stringify(n)),
    )
    for (const id of scheduled.keys()) if (!wantedIds.has(id)) scheduled.delete(id)
    if (stale.length === 0 && changed.length === 0) return 'unchanged'

    if (stale.length > 0) await LocalNotifications.cancel({ notifications: stale.map((id) => ({ id })) })
    if (changed.length > 0) {
      for (const n of changed) scheduled.delete(n.id)
      await LocalNotifications.schedule({ notifications: changed })
      for (const n of changed) scheduled.set(n.id, JSON.stringify(n))
    }
    return 'updated'
  } catch (error) {
    // Schemalägg allt på nytt nästa gång.
    scheduled.clear()
    logError(error, LOG_CONTEXT)
    return 'failed'
  }
}

/**
 * Schemalägg påminnelserna efter valen just nu. Körs en i taget – kommer en ändring medan en
 * schemaläggning pågår körs den en gång till efteråt. Kastar aldrig.
 */
export function syncReminders(now?: () => Date): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    try {
      do {
        rerun = false
        await syncOnce(now ? now() : new Date())
      } while (rerun)
    } finally {
      running = null
    }
  })()
  return running
}

let timer: ReturnType<typeof setTimeout> | null = null
/** Väntan efter en ändring, så att flera ändringar i rad blir en schemaläggning. */
export const SYNC_DEBOUNCE_MS = 400

/** Schemalägg om efter en liten stund (flera anrop i rad blir ett). */
export function requestSync(delayMs: number = SYNC_DEBOUNCE_MS): void {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void syncReminders()
  }, delayMs)
}

// ---------------------------------------------------------------------------
// Tryck på en notis
// ---------------------------------------------------------------------------

/** Öppna sidan som notisen hör till (appen använder hash-routern). */
export function openReminder(action: ActionPerformed): void {
  try {
    const n = action.notification
    if (!n || !isReminderId(n.id)) return
    const path = (n.extra as { path?: unknown } | null | undefined)?.path
    if (typeof path !== 'string' || !SAFE_PATH.test(path)) return
    if (window.location.hash !== `#${path}`) window.location.hash = path
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

let started = false
let handles: PluginListenerHandle[] = []
let unsubscribers: Array<() => void> = []

const bridge: ReminderBridge = {
  get platform() {
    return nativePlatform() === 'android' ? 'android' : 'ios'
  },
  checkPermission,
  requestPermission,
  sync: () => syncReminders(),
}

function settingsChanged(a: ReminderSettings, b: ReminderSettings): boolean {
  return a.meals !== b.meals || a.water !== b.water || a.fasting !== b.fasting || a.backup !== b.backup || a.focus !== b.focus
}

async function listen(add: () => Promise<PluginListenerHandle>): Promise<void> {
  try {
    const handle = await add()
    if (started) handles.push(handle)
    else void handle.remove()
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

/**
 * Starta påminnelserna – en gång, från `startNative()`. Lämnar bron till inställningssidan,
 * lyssnar på ändringar och schemalägger. Frågar aldrig om behörighet själv. Kastar aldrig.
 */
export async function startReminders(): Promise<void> {
  if (started) return
  started = true
  setReminderBridge(bridge)

  // Tryck på en notis – registreras först, så att trycket som startade appen inte missas.
  await listen(() => LocalNotifications.addListener('localNotificationActionPerformed', openReminder))
  // Öppnas appen igen, eller går den till bakgrunden (t.ex. efter en säkerhetskopia), kan något
  // ha ändrats: en ny kopia, behörigheten i telefonens inställningar eller en avslutad fasta.
  // På väg till bakgrunden direkt – systemet kan pausa appen strax efteråt.
  await listen(() => App.addListener('appStateChange', ({ isActive }) => requestSync(isActive ? SYNC_DEBOUNCE_MS : 0)))

  if (nativePlatform() === 'android') {
    try {
      await LocalNotifications.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: 'Påminnelser',
        description: 'Måltider, vatten, fastan, säkerhetskopian och veckans fokus – bara de du själv har slagit på.',
        importance: 3,
        // Privat: på en låst skärm visas bara att Lagom har en notis, inte texten.
        visibility: 0,
        vibration: true,
      })
      channelId = REMINDER_CHANNEL_ID
    } catch (error) {
      // Utan egen kanal används tilläggets standardkanal.
      logError(error, LOG_CONTEXT)
    }
  }

  if (!started) return // stoppad under tiden (bara i tester)
  unsubscribers = [
    useReminderStore.subscribe((s, prev) => {
      if (settingsChanged(s, prev)) requestSync()
    }),
    useProfileStore.subscribe((s, prev) => {
      const a = s.settings
      const b = prev.settings
      if (a.meals !== b.meals || a.mindfulMode !== b.mindfulMode || a.weeklyFocus?.id !== b.weeklyFocus?.id) requestSync()
    }),
    useFastingStore.subscribe((s, prev) => {
      if (s.active !== prev.active) requestSync()
    }),
    ...[useReminderStore, useProfileStore, useFastingStore, useDiaryStore].map((s) => s.persist.onFinishHydration(() => requestSync())),
  ]
  requestSync(0)
}

/** Stoppa lyssnarna (schemalagda notiser ligger kvar). För tester. */
export function stopReminders(): void {
  started = false
  if (timer !== null) clearTimeout(timer)
  timer = null
  unsubscribers.forEach((u) => u())
  unsubscribers = []
  handles.forEach((h) => void h.remove())
  handles = []
  setReminderBridge(null)
}

/** Endast för tester: glöm allt. */
export function resetRemindersForTests(): void {
  stopReminders()
  scheduled.clear()
  channelId = undefined
  running = null
  rerun = false
}
