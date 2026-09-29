/**
 * Påminnelser – lokala notiser i de inbyggda apparna: vilka som är påslagna och när.
 *
 * - Allt är avstängt från början och helt frivilligt. Behörigheten för notiser frågas först när
 *   användaren själv slår på en påminnelse (Inställningar → Påminnelser).
 * - Butiken sparar bara valen. Schemaläggningen sköts av src/native/reminders.ts, som bara laddas
 *   i apparna: den lyssnar på butiken och lämnar en `ReminderBridge` här när appen startar, så att
 *   inställningssidan kan fråga om behörigheten utan att importera native-koden.
 * - På webben schemaläggs inget. Valen följer ändå med i säkerhetskopian, så att de finns kvar när
 *   man flyttar till en ny telefon (där frågar appen om lov för notiser på nytt).
 * - Påminnelserna nämner aldrig kalorier eller vikt – texterna finns i src/native/reminders.ts.
 *
 * Sparas som övriga butiker i IndexedDB (`idbStorage`). Vid varje inläsning kontrolleras datan
 * (`sanitizeReminderSettings`), så att ett skadat värde blir standardvalet i stället för ett fel.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MEAL_IDS, type MealConfig, type MealId } from '../types'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

/**
 * Nyckeln i IndexedDB. Ska stå som `STORE_KEYS.reminders` i storage.ts (med en version i
 * `PERSIST_VERSIONS`), så att säkerhetskopian, raderingen och skyddet mot data från nyare
 * versioner omfattar påminnelserna.
 */
export const REMINDER_STORE_KEY = STORE_KEYS.reminders
/**
 * Det sparade formatets version (`PERSIST_VERSIONS` i storage.ts) – höj den där och lägg till en
 * migrering i `migrate` när formatet ändras.
 */
export const REMINDER_PERSIST_VERSION: number = PERSIST_VERSIONS[REMINDER_STORE_KEY]

// ---------------------------------------------------------------------------
// Inställningarna
// ---------------------------------------------------------------------------

export interface MealReminder {
  enabled: boolean
  /** Klockslag 'HH:mm' (lokal tid). */
  time: string
}

export interface WaterReminder {
  enabled: boolean
  /** Första påminnelsen, hel timme (`WATER_FROM_HOURS`). */
  from: number
  /** Senast, hel timme (`WATER_TO_HOURS`). */
  to: number
  /** Timmar mellan påminnelserna (`WATER_EVERY_HOURS`). */
  every: number
}

export interface ReminderSettings {
  /** En påminnelse per måltid, med egen tid. Visas bara för måltider som är på i dagboken. */
  meals: Record<MealId, MealReminder>
  /** Vatten då och då under dagen. */
  water: WaterReminder
  /** När fastetimern når målet. */
  fasting: boolean
  /** Söndag kväll, om ingen säkerhetskopia har sparats på en vecka. */
  backup: boolean
  /** Måndag morgon: veckans fokus. */
  focus: boolean
}

/** Påminnelserna som bara är av eller på. */
export type ReminderFlag = 'fasting' | 'backup' | 'focus'

/** Förvalda tider – ungefär mitt i måltidens tidsfönster (`MEAL_HOURS` i lib/meals.ts). */
export const DEFAULT_MEAL_TIMES: Readonly<Record<MealId, string>> = {
  frukost: '07:30',
  lunch: '12:00',
  fika: '15:00',
  middag: '18:00',
  kvallsmat: '20:30',
  mellanmal: '10:00',
}

/** Valbara timmar för den första och den sista vattenpåminnelsen. */
export const WATER_FROM_HOURS: readonly number[] = [6, 7, 8, 9, 10, 11, 12]
export const WATER_TO_HOURS: readonly number[] = [14, 15, 16, 17, 18, 19, 20, 21, 22]
/** Valbara intervall (timmar). */
export const WATER_EVERY_HOURS: readonly number[] = [1, 2, 3]

const DEFAULT_WATER: WaterReminder = { enabled: false, from: 9, to: 20, every: 2 }

function defaultMeals(): Record<MealId, MealReminder> {
  const meals = {} as Record<MealId, MealReminder>
  for (const id of MEAL_IDS) meals[id] = { enabled: false, time: DEFAULT_MEAL_TIMES[id] }
  return meals
}

/** Allt avstängt – så börjar alla, och så blir det efter "Radera all data". */
export function defaultReminderSettings(): ReminderSettings {
  return { meals: defaultMeals(), water: { ...DEFAULT_WATER }, fasting: false, backup: false, focus: false }
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/** true för ett klockslag 'HH:mm' (00:00–23:59). */
export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value)
}

/** 'HH:mm' → timme och minut, eller null. */
export function parseTime(value: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(value)
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null
}

/** Timmarna då vattenpåminnelserna kommer, t.ex. [9, 11, 13, 15, 17, 19] för 9–20 varannan timme. */
export function waterHours(water: Pick<WaterReminder, 'from' | 'to' | 'every'>): number[] {
  const hours: number[] = []
  for (let h = water.from; h <= water.to; h += water.every) hours.push(h)
  return hours
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const pick = (v: unknown, allowed: readonly number[], fallback: number) => (typeof v === 'number' && allowed.includes(v) ? v : fallback)

/**
 * Kontrollerade inställningar ur sparad data eller en säkerhetskopia: okända fält ignoreras och
 * ett ogiltigt värde blir standardvalet (avstängt). null om värdet inte är ett objekt alls.
 */
export function sanitizeReminderSettings(raw: unknown): ReminderSettings | null {
  if (!isObj(raw)) return null
  const out = defaultReminderSettings()
  const meals = isObj(raw.meals) ? raw.meals : {}
  for (const id of MEAL_IDS) {
    const m = meals[id]
    if (!isObj(m)) continue
    out.meals[id] = { enabled: m.enabled === true, time: isValidTime(m.time) ? m.time : DEFAULT_MEAL_TIMES[id] }
  }
  if (isObj(raw.water)) {
    const w = raw.water
    const from = pick(w.from, WATER_FROM_HOURS, DEFAULT_WATER.from)
    const to = pick(w.to, WATER_TO_HOURS, DEFAULT_WATER.to)
    out.water = { enabled: w.enabled === true, from, to: to > from ? to : DEFAULT_WATER.to, every: pick(w.every, WATER_EVERY_HOURS, DEFAULT_WATER.every) }
  }
  out.fasting = raw.fasting === true
  out.backup = raw.backup === true
  out.focus = raw.focus === true
  return out
}

/** Bara inställningarna (det som sparas och följer med i säkerhetskopian). */
export function reminderSettingsOf(s: ReminderSettings): ReminderSettings {
  return { meals: s.meals, water: s.water, fasting: s.fasting, backup: s.backup, focus: s.focus }
}

/**
 * Antal påslagna påminnelser. Måltidspåminnelser räknas bara för måltider som är på i dagboken
 * (dolda måltider får inga påminnelser).
 */
export function activeReminderCount(s: ReminderSettings, meals: readonly MealConfig[]): number {
  const visible = meals.filter((m) => m.enabled && s.meals[m.id]?.enabled).length
  return visible + (s.water.enabled ? 1 : 0) + (s.fasting ? 1 : 0) + (s.backup ? 1 : 0) + (s.focus ? 1 : 0)
}

// ---------------------------------------------------------------------------
// Butiken
// ---------------------------------------------------------------------------

export interface ReminderState extends ReminderSettings {
  setMeal: (id: MealId, patch: Partial<MealReminder>) => void
  setWater: (patch: Partial<WaterReminder>) => void
  setFlag: (flag: ReminderFlag, on: boolean) => void
  /** Ersätt alla val (återställning från säkerhetskopia). */
  replaceSettings: (settings: ReminderSettings) => void
  /** Stäng av allt (används av "Radera all data"). */
  clearReminders: () => void
}

export const useReminderStore = create<ReminderState>()(
  persist(
    (set, get) => ({
      ...defaultReminderSettings(),
      setMeal: (id, patch) => {
        const cur = get().meals[id] ?? { enabled: false, time: DEFAULT_MEAL_TIMES[id] }
        const time = patch.time !== undefined && isValidTime(patch.time) ? patch.time : cur.time
        const enabled = patch.enabled ?? cur.enabled
        if (time === cur.time && enabled === cur.enabled) return
        set({ meals: { ...get().meals, [id]: { enabled, time } } })
      },
      setWater: (patch) => {
        const cur = get().water
        const from = pick(patch.from, WATER_FROM_HOURS, cur.from)
        let to = pick(patch.to, WATER_TO_HOURS, cur.to)
        if (to <= from) to = WATER_TO_HOURS.find((h) => h > from) ?? cur.to
        const every = pick(patch.every, WATER_EVERY_HOURS, cur.every)
        set({ water: { enabled: patch.enabled ?? cur.enabled, from, to, every } })
      },
      setFlag: (flag, on) => set({ [flag]: on } as Partial<ReminderSettings>),
      replaceSettings: (settings) => set(sanitizeReminderSettings(settings) ?? defaultReminderSettings()),
      clearReminders: () => set(defaultReminderSettings()),
    }),
    {
      name: REMINDER_STORE_KEY,
      storage: idbStorage,
      version: REMINDER_PERSIST_VERSION,
      partialize: (s) => reminderSettingsOf(s),
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as ReminderState,
      // Kontrollera det sparade vid varje inläsning – ett skadat värde blir avstängt, aldrig ett fel.
      merge: (persisted, current) => ({ ...current, ...sanitizeReminderSettings(persisted) }),
    },
  ),
)

// ---------------------------------------------------------------------------
// Bron till de inbyggda apparna
// ---------------------------------------------------------------------------

/**
 * Behörigheten för notiser: 'prompt' = inte frågat än (eller kan fråga igen), 'unavailable' =
 * gick inte att läsa (tillägget svarar inte).
 */
export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unavailable'

/**
 * Det inställningssidan behöver från src/native/reminders.ts. Lämnas med `setReminderBridge()`
 * när appen startar (startNative) – finns alltså bara i de inbyggda apparna.
 */
export interface ReminderBridge {
  platform: 'ios' | 'android'
  /** Behörigheten just nu – frågar inte användaren. */
  checkPermission: () => Promise<ReminderPermission>
  /** Fråga om lov att visa notiser (bara när användaren själv slår på en påminnelse). */
  requestPermission: () => Promise<ReminderPermission>
  /** Schemalägg om direkt (sker annars automatiskt när valen ändras). Kastar aldrig. */
  sync: () => Promise<void>
}

/** Bron hålls utanför den sparade butiken – den ska aldrig sparas eller följa med i en kopia. */
export const useReminderBridge = create<{ bridge: ReminderBridge | null }>()(() => ({ bridge: null }))

export function setReminderBridge(bridge: ReminderBridge | null): void {
  useReminderBridge.setState({ bridge })
}
