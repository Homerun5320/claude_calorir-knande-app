/**
 * Apple Hälsa (HealthKit) och Health Connect i de inbyggda apparna – en frivillig koppling som är
 * avstängd från början. Laddas bara via `loadNative('health')` (src/native/index.ts) och startas
 * med `startHealth()` från `startNative()` – aldrig på webben.
 *
 * Användaren väljer per datatyp (Inställningar → Apple Hälsa / Health Connect):
 * - Hämta vikt: nya vägningar (t.ex. från en smart våg) hamnar i viktkurvan (`useBodyStore`). En per
 *   dag – dagens första mätning, som Lagoms "väg dig på morgonen". En vikt som användaren själv har
 *   loggat i Lagom skrivs aldrig över, och en hämtad vikt som användaren har tagit bort hämtas inte
 *   igen (loggen `weights` nedan). Kräver tillgång till loggning (provperiod/licens), som i appen.
 * - Hämta steg: dagens steg fylls i dagboken (`DayMeta.steps`, samma fält som Träning → Steg). Stegen
 *   räknas inte in i dagsmålet av sig själva – aktivitetsnivån räknar redan med vardagens steg, och
 *   steg utöver den lägger användaren själv till som aktivitet (StepsCard). Steg som användaren har
 *   skrivit in eller tagit bort lämnas i fred.
 * - Aktiv energi läses inte: den skulle bara kunna visas som en siffra (aktivitetsnivån och de
 *   loggade passen räknar redan med rörelsen), och behörigheterna hålls till det som används.
 * - Skicka energi och vatten: avslutade dagar – i går och dagarna före (men inte före kopplingen) –
 *   skickas som tillskott, bara det som har tillkommit sedan förra gången (loggen `sent`). Dagen som
 *   pågår skickas inte: tillägget kan inte ändra eller ta bort något i Hälsa, och under dagen ändras
 *   och tas måltider ofta bort – så skickas det som faktiskt blev dagens summa.
 * - Skicka vikt: vikter som loggas i Lagom (inte de som hämtats därifrån), senaste veckan.
 *
 * Tillägget (@capgo/capacitor-health 8.11) kan inte ändra eller ta bort något i Hälsa, och på Android
 * skickas ingen egen märkning med. Därför skickas bara avslutade dagar och bara tillskott: tas något
 * bort i Lagom efteråt ligger det kvar i Hälsa (inställningarna säger det), och läggs något till
 * igen skickas bara det som går över det redan skickade. Egna mätningar känns igen på källan (appens id) och hämtas aldrig tillbaka.
 *
 * Synken körs när appen startar och kommer tillbaka (hämtning högst var femte minut), när appen går
 * till bakgrunden och en stund efter en ändring i dagboken eller vikten (bara skickandet). Aldrig med
 * exempeldata, före den egna profilen, eller innan all sparad data har lästs in.
 *
 * Datatyperna måste stämma med android/app/src/main/AndroidManifest.xml (READ_WEIGHT, WRITE_WEIGHT,
 * READ_STEPS, WRITE_NUTRITION, WRITE_HYDRATION) och texterna i
 * ios/App/App/Info.plist. Ändras de: uppdatera båda, Play Consoles hälsodeklaration och
 * integritetspolicyn.
 *
 * Integritet: allt läses och skrivs på telefonen – inget skickas till Lagoms server eller någon
 * annan. Valen och en liten logg (id:n för hämtade vikter, de senaste dagarnas skickade summor och
 * ifyllda steg) ligger i localStorage (`lagom-health`) på den här telefonen. De följer inte med i
 * säkerhetskopian, och `resetHealth()` tar bort dem (anropas vid "Radera all data").
 */
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { Health, type AggregatedSample, type AuthorizationStatus, type HealthDataType, type HealthSample } from '@capgo/capacitor-health'
import { currentAccess } from '../hooks/useAccess'
import { addDays, fromISODate, isValidISODate, todayISO, toISODate } from '../lib/dates'
import { totals } from '../lib/diary'
import { logError } from '../lib/errorLog'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useLicenseStore } from '../stores/licenseStore'
import { useProfileStore } from '../stores/profileStore'
import { hasNewerData, isMemoryOnlyStorage, READ_TIMEOUT_MS } from '../stores/storage'
import type { DayMeta, ISODate, WeightEntry } from '../types'
import { nativePlatform } from './index'

// ---------------------------------------------------------------------------
// Konstanter
// ---------------------------------------------------------------------------

/** Valen och loggen i localStorage – bara på den här telefonen, inte i säkerhetskopian. */
export const HEALTH_STORAGE_KEY = 'lagom-health'

export const HEALTH_LOG_CONTEXT = 'native:halsa'

/** Vad användaren kan slå på, en rad per datatyp och riktning. */
export const HEALTH_CHOICES = ['readWeight', 'readSteps', 'writeEnergy', 'writeWater', 'writeWeight'] as const
export type HealthChoice = (typeof HEALTH_CHOICES)[number]

/**
 * Valen → tilläggets datatyper. Måste stämma med behörigheterna i AndroidManifest.xml:
 * weight ↔ READ_WEIGHT/WRITE_WEIGHT, steps ↔ READ_STEPS, dietaryEnergyConsumed ↔ WRITE_NUTRITION,
 * dietaryWater ↔ WRITE_HYDRATION.
 */
export const HEALTH_CHOICE_TYPES: Readonly<Record<HealthChoice, { access: 'read' | 'write'; type: HealthDataType }>> = {
  readWeight: { access: 'read', type: 'weight' },
  readSteps: { access: 'read', type: 'steps' },
  writeEnergy: { access: 'write', type: 'dietaryEnergyConsumed' },
  writeWater: { access: 'write', type: 'dietaryWater' },
  writeWeight: { access: 'write', type: 'weight' },
}

/** Förvalt när användaren först öppnar inställningen – inget händer förrän kopplingen slås på. */
const DEFAULT_CHOICES: Readonly<Record<HealthChoice, boolean>> = {
  readWeight: true,
  readSteps: true,
  writeEnergy: true,
  writeWater: true,
  writeWeight: true,
}

/** Första hämtningen av vikter går så här långt tillbaka (Health Connect ger högst 30 dagar före behörigheten). */
export const WEIGHT_FIRST_IMPORT_DAYS = 90
/** Senare hämtningar börjar så här många dagar före den förra – vågar synkar ibland sent. */
export const WEIGHT_OVERLAP_DAYS = 3
/** Så många mätningar läses högst per gång (nyaste först). */
export const WEIGHT_SAMPLE_LIMIT = 1000
/** Stegen fylls i för så här många dagar bakåt (inklusive i dag). */
export const STEP_DAYS = 7
/** Skickas: avslutade dagar – i går och högst så här många dagar bakåt (inte dagen som pågår). */
export const SEND_DAYS = 3
/** Vikter som loggas i Lagom skickas för den senaste veckan. */
export const WEIGHT_SEND_DAYS = 7
/** När appen kommer tillbaka hämtas nytt högst så här ofta (skickandet sker ändå). */
export const RESUME_IMPORT_MS = 5 * 60_000
/** Skicka så här länge efter den senaste ändringen i dagboken eller vikten. */
export const SEND_DEBOUNCE_MS = 20_000
/** Rimliga vikter (samma gränser som "Logga vikt"). */
const MIN_KG = 20
const MAX_KG = 400
/** Fler steg än så här på en dag är ett mätfel (och fältet under Träning tar högst 100 000). */
const MAX_STEPS = 100_000
/** Minsta tillskott som skickas. */
const MIN_KCAL = 1
const MIN_WATER_ML = 10
/** Så länge loggen sparar hämtade vikter, ifyllda steg och skickade summor/vikter. */
const KEEP_WEIGHTS_DAYS = 400
const KEEP_STEPS_DAYS = 30
const KEEP_SENT_DAYS = 7
const KEEP_SENT_WEIGHTS_DAYS = 30

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
/** Längsta väntan på att butikerna ska läsas in innan en synk ger upp (försöker igen nästa gång). */
const HYDRATION_WAIT_MS = READ_TIMEOUT_MS + 2000

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/** En hämtad vikt: WeightEntry-id i Lagom och mätningens tid i Hälsa. */
interface ImportedWeight {
  id: string
  at: string
}

/** Det som har skickats för en dag (summor, inte tillskott). */
interface SentDay {
  kcal?: number
  waterMl?: number
}

interface Ledger {
  weights: Record<ISODate, ImportedWeight>
  steps: Record<ISODate, number>
  sent: Record<ISODate, SentDay>
  sentWeights: Record<ISODate, string>
}

interface Stored {
  v: 1
  enabled: boolean
  choices: Record<HealthChoice, boolean>
  /** Dagen kopplingen slogs på – inget skickas för tidigare dagar. */
  since: ISODate | null
  lastSync: number | null
  lastImport: number | null
  ledger: Ledger
}

/** Finns Hälsa på telefonen? 'uppdatera' = Health Connect behöver installeras eller uppdateras. */
export type HealthAvailability = 'ja' | 'uppdatera' | 'saknas'

/**
 * Något som inställningarna förklarar: 'saknas'/'uppdatera' (se ovan), 'fel' (något gick inte –
 * loggat), 'provperiod' (vikter hämtas inte utan tillgång till loggning), 'exempel' (exempeldata
 * eller ingen egen profil ännu – inget synkas).
 */
export type HealthProblem = 'saknas' | 'uppdatera' | 'fel' | 'provperiod' | 'exempel'

export interface HealthToday {
  date: ISODate
  steps?: number
}

export interface HealthSyncSummary {
  /** Dagar i viktkurvan som fick en ny eller uppdaterad vikt. */
  weights: number
  /** Dagar där stegen fylldes i eller uppdaterades. */
  stepDays: number
  /** Skickat till Hälsa: energi (kcal), vatten (ml) och antal vikter. */
  kcal: number
  waterMl: number
  sentWeights: number
}

export interface HealthSnapshot {
  enabled: boolean
  choices: Readonly<Record<HealthChoice, boolean>>
  since: ISODate | null
  lastSync: number | null
  syncing: boolean
  problem: HealthProblem | null
  /** Valda datatyper som saknar behörighet (senaste kontrollen). På iPhone syns bara skrivningarna. */
  missing: readonly HealthChoice[]
  today: HealthToday | null
  lastResult: HealthSyncSummary | null
}

export type HealthConnectResult =
  | { ok: true; missing: readonly HealthChoice[]; summary: HealthSyncSummary | null }
  | { ok: false; reason: 'inget-valt' | 'nekad' | 'fel' | Exclude<HealthAvailability, 'ja'> }

export type HealthChoiceResult = { ok: true } | { ok: false; reason: 'nekad' | 'fel' }

export interface HealthSyncOptions {
  /** Hämta vikt och steg (standard). false = bara skicka. */
  read?: boolean
  /** Logga inte fel (t.ex. när appen går till bakgrunden och telefonen låses). */
  quiet?: boolean
}

// ---------------------------------------------------------------------------
// Sparat tillstånd
// ---------------------------------------------------------------------------

const emptyLedger = (): Ledger => ({ weights: {}, steps: {}, sent: {}, sentWeights: {} })

function defaults(): Stored {
  return { v: 1, enabled: false, choices: { ...DEFAULT_CHOICES }, since: null, lastSync: null, lastImport: null, ledger: emptyLedger() }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const finiteOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const nonNegative = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)

/** Behåll bara poster med giltigt datum och ett värde som `pick` godkänner. */
function sanitizeDays<T>(raw: unknown, pick: (v: unknown) => T | undefined): Record<ISODate, T> {
  const out: Record<ISODate, T> = {}
  if (!isRecord(raw)) return out
  for (const [date, value] of Object.entries(raw)) {
    if (!isValidISODate(date)) continue
    const picked = pick(value)
    if (picked !== undefined) out[date] = picked
  }
  return out
}

/** Tolka det sparade – ett skadat eller okänt värde blir standardvalen i stället för ett fel. */
export function sanitizeHealthState(raw: unknown): Stored {
  const base = defaults()
  if (!isRecord(raw) || raw.v !== 1) return base
  const choices = { ...base.choices }
  if (isRecord(raw.choices)) {
    for (const c of HEALTH_CHOICES) if (typeof raw.choices[c] === 'boolean') choices[c] = raw.choices[c]
  }
  const ledger = isRecord(raw.ledger) ? raw.ledger : {}
  return {
    v: 1,
    enabled: raw.enabled === true,
    choices,
    since: typeof raw.since === 'string' && isValidISODate(raw.since) ? raw.since : null,
    lastSync: finiteOrNull(raw.lastSync),
    lastImport: finiteOrNull(raw.lastImport),
    ledger: {
      weights: sanitizeDays(ledger.weights, (v) =>
        isRecord(v) && typeof v.id === 'string' && typeof v.at === 'string' ? { id: v.id, at: v.at } : undefined,
      ),
      steps: sanitizeDays(ledger.steps, nonNegative),
      sent: sanitizeDays(ledger.sent, (v) => (isRecord(v) ? { kcal: nonNegative(v.kcal), waterMl: nonNegative(v.waterMl) } : undefined)),
      sentWeights: sanitizeDays(ledger.sentWeights, (v) => (typeof v === 'string' ? v : undefined)),
    },
  }
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(HEALTH_STORAGE_KEY)
    return raw ? sanitizeHealthState(JSON.parse(raw)) : defaults()
  } catch {
    return defaults()
  }
}

function persist(): void {
  try {
    localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Lagringen kan vara full eller blockerad – valen gäller ändå tills appen stängs.
  }
}

/** Glöm det som ligger utanför fönstren (loggen ska vara liten och inte innehålla gammal data). */
function prune(ledger: Ledger, today: ISODate): Ledger {
  const keep = <T>(rec: Record<ISODate, T>, days: number): Record<ISODate, T> => {
    const from = addDays(today, -days)
    return Object.fromEntries(Object.entries(rec).filter(([d]) => d >= from))
  }
  return {
    weights: keep(ledger.weights, KEEP_WEIGHTS_DAYS),
    steps: keep(ledger.steps, KEEP_STEPS_DAYS),
    sent: keep(ledger.sent, KEEP_SENT_DAYS),
    sentWeights: keep(ledger.sentWeights, KEEP_SENT_WEIGHTS_DAYS),
  }
}

// ---------------------------------------------------------------------------
// Tillstånd och prenumeration (inställningarna använder `useSyncExternalStore`)
// ---------------------------------------------------------------------------

interface Runtime {
  syncing: boolean
  problem: HealthProblem | null
  missing: readonly HealthChoice[]
  today: HealthToday | null
  lastResult: HealthSyncSummary | null
}

const initialRuntime = (): Runtime => ({ syncing: false, problem: null, missing: [], today: null, lastResult: null })

let state: Stored = load()
let runtime: Runtime = initialRuntime()
let snapshot: HealthSnapshot = buildSnapshot()
const listeners = new Set<() => void>()

function buildSnapshot(): HealthSnapshot {
  return {
    enabled: state.enabled,
    choices: state.choices,
    since: state.since,
    lastSync: state.lastSync,
    ...runtime,
  }
}

function emit(): void {
  snapshot = buildSnapshot()
  for (const listener of listeners) listener()
}

function update(patch: Partial<Stored>): void {
  state = { ...state, ...patch }
  persist()
  emit()
}

function setRuntime(patch: Partial<Runtime>): void {
  runtime = { ...runtime, ...patch }
  emit()
}

/** Aktuellt läge (samma objekt tills något ändras). */
export function getHealthSnapshot(): HealthSnapshot {
  return snapshot
}

export function subscribeHealth(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const selected = (choices: Readonly<Record<HealthChoice, boolean>>): HealthChoice[] => HEALTH_CHOICES.filter((c) => choices[c])

// ---------------------------------------------------------------------------
// Rena hjälpfunktioner (testas direkt)
// ---------------------------------------------------------------------------

/** Tilläggets datatyper för valen, uppdelade på läsa och skriva. */
export function healthTypesFor(choices: readonly HealthChoice[]): { read: HealthDataType[]; write: HealthDataType[] } {
  const read = new Set<HealthDataType>()
  const write = new Set<HealthDataType>()
  for (const c of choices) {
    const { access, type } = HEALTH_CHOICE_TYPES[c]
    if (access === 'read') read.add(type)
    else write.add(type)
  }
  return { read: [...read], write: [...write] }
}

/**
 * Vilka val har behörighet? På iPhone visar HealthKit aldrig om läsning nekats (för integritetens
 * skull) – där betyder "read authorized" bara att frågan har ställts, och en nekad läsning ger tomt.
 */
export function splitGranted(choices: readonly HealthChoice[], status: AuthorizationStatus): { granted: HealthChoice[]; missing: HealthChoice[] } {
  const readOk = new Set<string>(status.readAuthorized ?? [])
  const writeOk = new Set<string>(status.writeAuthorized ?? [])
  const granted: HealthChoice[] = []
  const missing: HealthChoice[] = []
  for (const c of choices) {
    const { access, type } = HEALTH_CHOICE_TYPES[c]
    if ((access === 'read' ? readOk : writeOk).has(type)) granted.push(c)
    else missing.push(c)
  }
  return { granted, missing }
}

const round1 = (n: number) => Math.round(n * 10) / 10

export interface DailyWeight {
  kg: number
  /** Mätningens tid (som tillägget gav den) – känner igen samma mätning nästa gång. */
  at: string
}

/**
 * En vikt per dag ur Hälsas mätningar: dagens första (morgonvikten), avrundad till en decimal.
 * Mätningar som Lagom själv har skickat (källan `ownId`), orimliga värden och framtida dagar hoppas över.
 */
export function dailyWeights(samples: readonly HealthSample[], opts: { ownId: string | null; today: ISODate }): Map<ISODate, DailyWeight> {
  const out = new Map<ISODate, DailyWeight & { t: number }>()
  for (const s of samples) {
    if (s.dataType !== undefined && s.dataType !== 'weight') continue
    if (s.unit !== undefined && s.unit !== 'kilogram') continue
    if (opts.ownId && s.sourceId === opts.ownId) continue
    const kg = s.value
    if (typeof kg !== 'number' || !Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) continue
    const t = Date.parse(s.startDate)
    if (!Number.isFinite(t)) continue
    const date = toISODate(new Date(t))
    if (date > opts.today) continue
    const prev = out.get(date)
    if (!prev || t < prev.t) out.set(date, { kg: round1(kg), at: s.startDate, t })
  }
  return new Map([...out].map(([date, { kg, at }]) => [date, { kg, at }]))
}

export type WeightAction = { date: ISODate; kg: number; at: string } | { date: ISODate; at: string; noteOnly: true }

/**
 * Vilka dagar i viktkurvan ska få den hämtade vikten?
 * - Dagen saknar vikt → hämta, utom när just den mätningen redan har hämtats och sedan tagits bort.
 * - Dagen har en vikt som Lagom själv hämtat → uppdatera om mätningen är en annan (t.ex. en tidigare
 *   mätning som synkats sent). Samma värde → bara loggen uppdateras (`noteOnly`).
 * - Dagen har en vikt som användaren själv har loggat → rör den aldrig.
 */
export function planWeightImport(
  daily: ReadonlyMap<ISODate, DailyWeight>,
  weights: readonly WeightEntry[],
  imported: Readonly<Record<ISODate, ImportedWeight>>,
): WeightAction[] {
  const byDate = new Map(weights.map((w) => [w.date, w]))
  const actions: WeightAction[] = []
  for (const [date, m] of daily) {
    const existing = byDate.get(date)
    const rec = imported[date]
    if (existing) {
      if (!rec || existing.id !== rec.id || rec.at === m.at) continue
      if (Math.abs(existing.kg - m.kg) < 0.05) actions.push({ date, at: m.at, noteOnly: true })
      else actions.push({ date, kg: m.kg, at: m.at })
    } else if (!rec || rec.at !== m.at) {
      actions.push({ date, kg: m.kg, at: m.at })
    }
  }
  return actions
}

/** Summerade steg per lokal dag ur Hälsas dygnshinkar (hinkens mitt avgör dagen, även vid sommartid). */
export function stepsByDate(samples: readonly AggregatedSample[]): Map<ISODate, number> {
  const out = new Map<ISODate, number>()
  for (const s of samples) {
    const start = Date.parse(s.startDate)
    const end = Date.parse(s.endDate)
    const value = s.values?.sum ?? s.value
    if (!Number.isFinite(start) || !Number.isFinite(end) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue
    const date = toISODate(new Date((start + end) / 2))
    out.set(date, (out.get(date) ?? 0) + Math.round(value))
  }
  return out
}

/**
 * Dagar där stegen från Hälsa ska fyllas i: fältet är tomt och har aldrig fyllts i av kopplingen,
 * eller innehåller fortfarande det kopplingen skrev förra gången. Ett eget eller borttaget värde
 * lämnas i fred.
 */
export function planSteps(
  perDay: ReadonlyMap<ISODate, number>,
  days: Readonly<Record<ISODate, DayMeta | undefined>>,
  owned: Readonly<Record<ISODate, number>>,
): Array<{ date: ISODate; steps: number }> {
  const out: Array<{ date: ISODate; steps: number }> = []
  for (const [date, steps] of perDay) {
    if (steps <= 0 || steps > MAX_STEPS) continue
    const current = days[date]?.steps
    const mine = owned[date]
    if (current === undefined ? mine !== undefined : current !== mine) continue
    if (current === steps) continue
    out.push({ date, steps })
  }
  return out
}

/** Tillskottet att skicka för en dag: bara det som har tillkommit sedan förra gången. */
export function intakeDelta(current: { kcal: number; waterMl: number }, sent: SentDay | undefined): { kcal: number; waterMl: number } {
  const kcal = current.kcal - (sent?.kcal ?? 0)
  const waterMl = current.waterMl - (sent?.waterMl ?? 0)
  return { kcal: kcal >= MIN_KCAL ? kcal : 0, waterMl: waterMl >= MIN_WATER_ML ? waterMl : 0 }
}

/**
 * Tiden för ett tillskott (en minut lång – Health Connect kräver att starten ligger före slutet):
 * nu för i dag, strax före midnatt för en tidigare dag, så att det hamnar på rätt dag i Hälsa.
 */
export function sampleInterval(date: ISODate, now: Date): { startDate: string; endDate: string } {
  const dayStart = fromISODate(date).getTime()
  // 23.59 lokal tid räknas med kalendern – ett dygn kan vara 23 eller 25 timmar (sommartid).
  const lastMinute = fromISODate(date)
  lastMinute.setHours(23, 59, 0, 0)
  const end = date >= todayISO(now) ? now.getTime() : lastMinute.getTime()
  let start = Math.max(dayStart, end - MINUTE_MS)
  if (start >= end) start = end - 1
  return { startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString() }
}

/** När vikten mättes: när den loggades om det var samma dag, annars mitt på dagen. */
export function weightTime(entry: Pick<WeightEntry, 'date' | 'createdAt'>): string {
  const created = new Date(entry.createdAt)
  if (Number.isFinite(entry.createdAt) && toISODate(created) === entry.date) return created.toISOString()
  const noon = fromISODate(entry.date)
  noon.setHours(12, 0, 0, 0)
  return noon.toISOString()
}

/** Lokal midnatt för en dag, som ISO-tid för tillägget. */
const dayStartISO = (date: ISODate) => fromISODate(date).toISOString()

// ---------------------------------------------------------------------------
// Tillgänglighet och behörigheter
// ---------------------------------------------------------------------------

/** Anteckningen på hämtade vikter (syns i vikthistoriken). */
function importNote(): string {
  return nativePlatform() === 'android' ? 'Från Health Connect' : 'Från Apple Hälsa'
}

export async function checkHealthAvailability(): Promise<HealthAvailability> {
  try {
    const result = await Health.isAvailable()
    if (result.available) return 'ja'
    // Android: "Health Connect needs an update." även när appen inte är installerad (Android 9–13).
    return /update/i.test(result.reason ?? '') ? 'uppdatera' : 'saknas'
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
    return 'saknas'
  }
}

async function requestAccess(choices: readonly HealthChoice[]): Promise<{ granted: HealthChoice[]; missing: HealthChoice[] }> {
  const status = await Health.requestAuthorization(healthTypesFor(choices))
  return splitGranted(choices, status)
}

let ownIdPromise: Promise<string | null> | null = null

/** Appens id (Bundle ID / paketnamn) – källan på det Lagom själv skickar till Hälsa. */
function ownAppId(): Promise<string | null> {
  ownIdPromise ??= App.getInfo()
    .then((info) => (typeof info.id === 'string' && info.id ? info.id : null))
    .catch(() => null)
  return ownIdPromise
}

// ---------------------------------------------------------------------------
// Kopplingen (inställningarna)
// ---------------------------------------------------------------------------

/**
 * Slå på kopplingen med de valda datatyperna: frågar om behörighet (systemets eget ark), sätter
 * `since` till i dag och synkar. Kastar aldrig.
 */
export async function connectHealth(): Promise<HealthConnectResult> {
  const chosen = selected(state.choices)
  if (chosen.length === 0) return { ok: false, reason: 'inget-valt' }
  const availability = await checkHealthAvailability()
  if (availability !== 'ja') {
    setRuntime({ problem: availability })
    return { ok: false, reason: availability }
  }
  let access: { granted: HealthChoice[]; missing: HealthChoice[] }
  try {
    access = await requestAccess(chosen)
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
    return { ok: false, reason: 'fel' }
  }
  setRuntime({ missing: access.missing, problem: null })
  if (access.granted.length === 0) return { ok: false, reason: 'nekad' }
  update({ enabled: true, since: todayISO() })
  const summary = await syncHealth()
  return { ok: true, missing: access.missing, summary }
}

/**
 * Slå på eller av en datatyp. Påslagen medan kopplingen är på → frågar om behörighet för just den
 * och synkar. Avslagen → används inte längre (behörigheten tar användaren bort i Hälsa/Health Connect).
 */
export async function setHealthChoice(choice: HealthChoice, on: boolean): Promise<HealthChoiceResult> {
  update({ choices: { ...state.choices, [choice]: on } })
  if (!on) {
    setRuntime({ missing: runtime.missing.filter((c) => c !== choice) })
    return { ok: true }
  }
  if (!state.enabled) return { ok: true }
  try {
    const { granted } = await requestAccess([choice])
    const ok = granted.includes(choice)
    const others = runtime.missing.filter((c) => c !== choice)
    setRuntime({ missing: ok ? others : [...others, choice] })
    if (!ok) return { ok: false, reason: 'nekad' }
    void syncHealth()
    return { ok: true }
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
    return { ok: false, reason: 'fel' }
  }
}

/** Fråga igen om behörighet för de valda datatyper som saknar den. */
export async function requestMissingHealthAccess(): Promise<HealthChoiceResult> {
  const wanted = runtime.missing.filter((c) => state.choices[c])
  if (wanted.length === 0) return { ok: true }
  try {
    const { missing } = await requestAccess(wanted)
    setRuntime({ missing })
    void syncHealth()
    return missing.length === 0 ? { ok: true } : { ok: false, reason: 'nekad' }
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
    return { ok: false, reason: 'fel' }
  }
}

/**
 * Stäng av kopplingen. Det som redan hämtats finns kvar i Lagom och det som skickats finns kvar i
 * Hälsa; loggen sparas så att inget hämtas eller skickas dubbelt om kopplingen slås på igen.
 */
export function disconnectHealth(): void {
  clearSendTimer()
  update({ enabled: false })
  setRuntime({ problem: null, missing: [], today: null, lastResult: null })
}

/** "Radera all data": stäng av kopplingen och ta bort valen och loggen från telefonen. */
export function resetHealth(): void {
  generation++
  clearSendTimer()
  try {
    localStorage.removeItem(HEALTH_STORAGE_KEY)
  } catch {
    /* blockerad lagring – inget att ta bort */
  }
  state = defaults()
  runtime = initialRuntime()
  emit()
}

/**
 * Öppna Health Connects inställningar (Android) – där ger eller tar man tillbaka Lagoms behörigheter.
 * false på iPhone, där appen inte kan öppna Hälsas behörigheter (inställningarna förklarar vägen).
 */
export async function openHealthSettings(): Promise<boolean> {
  if (nativePlatform() !== 'android') return false
  try {
    await Health.openHealthConnectSettings()
    return true
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
    return false
  }
}

// ---------------------------------------------------------------------------
// Synk
// ---------------------------------------------------------------------------

const STORES = [useProfileStore, useDiaryStore, useBodyStore, useLicenseStore] as const
const allHydrated = () => STORES.every((s) => s.persist.hasHydrated())

/** Vänta tills butikerna har lästs in. Aldrig synk mot ett ofullständigt läge (då skulle t.ex. en tom dagbok jämföras). */
function storesReady(timeoutMs: number): Promise<boolean> {
  const ok = () => allHydrated() && !isMemoryOnlyStorage() && !hasNewerData()
  if (allHydrated()) return Promise.resolve(ok())
  return new Promise((resolve) => {
    let unsubs: Array<() => void> = []
    const done = () => {
      clearTimeout(limit)
      unsubs.forEach((u) => u())
      unsubs = []
      resolve(ok())
    }
    const limit = setTimeout(done, timeoutMs)
    unsubs = STORES.map((s) => s.persist.onFinishHydration(() => {
      if (allHydrated()) done()
    }))
    if (allHydrated()) done()
  })
}

const emptySummary = (): HealthSyncSummary => ({ weights: 0, stepDays: 0, kcal: 0, waterMl: 0, sentWeights: 0 })

/** Ökas av `resetHealth()` – en synk som pågår då slutar direkt och skriver ingenting mer. */
let generation = 0

interface SyncContext {
  gen: number
  now: Date
  today: ISODate
  granted: ReadonlySet<HealthChoice>
  summary: HealthSyncSummary
}

/** "Radera all data" under synken: skriv ingenting mer, inte ens loggen. */
const wiped = (ctx: SyncContext) => ctx.gen !== generation
/** Raderat eller frånkopplat: börja inget nytt (det som redan har skickats förs ändå in i loggen). */
const stopped = (ctx: SyncContext) => wiped(ctx) || !state.enabled

async function importWeights(ctx: SyncContext): Promise<void> {
  const { now, today, summary } = ctx
  const firstFrom = now.getTime() - WEIGHT_FIRST_IMPORT_DAYS * DAY_MS
  const from = state.lastImport === null ? firstFrom : Math.max(firstFrom, state.lastImport - WEIGHT_OVERLAP_DAYS * DAY_MS)
  const { samples } = await Health.readSamples({
    dataType: 'weight',
    startDate: dayStartISO(toISODate(new Date(from))),
    endDate: now.toISOString(),
    limit: WEIGHT_SAMPLE_LIMIT,
    ascending: false,
  })
  const ownId = await ownAppId()
  if (stopped(ctx)) return
  const daily = dailyWeights(samples ?? [], { ownId, today })
  const actions = planWeightImport(daily, useBodyStore.getState().weights, state.ledger.weights)
  if (actions.length === 0) return
  const imported = { ...state.ledger.weights }
  const note = importNote()
  for (const action of actions) {
    if ('noteOnly' in action) {
      const rec = imported[action.date]
      if (rec) imported[action.date] = { id: rec.id, at: action.at }
      continue
    }
    const entry = useBodyStore.getState().logWeight(action.date, action.kg, note)
    imported[action.date] = { id: entry.id, at: action.at }
    summary.weights++
  }
  update({ ledger: { ...state.ledger, weights: imported } })
}

async function importSteps(ctx: SyncContext): Promise<number | undefined> {
  const { now, today, summary } = ctx
  const { samples } = await Health.queryAggregated({
    dataType: 'steps',
    startDate: dayStartISO(addDays(today, -(STEP_DAYS - 1))),
    endDate: now.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  })
  if (stopped(ctx)) return undefined
  const perDay = stepsByDate(samples ?? [])
  const changes = planSteps(perDay, useDiaryStore.getState().days, state.ledger.steps)
  if (changes.length > 0) {
    const owned = { ...state.ledger.steps }
    for (const { date, steps } of changes) {
      useDiaryStore.getState().setDayMeta(date, { steps })
      owned[date] = steps
    }
    summary.stepDays += changes.length
    update({ ledger: { ...state.ledger, steps: owned } })
  }
  return perDay.get(today)
}

async function sendIntake(ctx: SyncContext): Promise<void> {
  const { now, today, granted, summary } = ctx
  const since = state.since
  if (!since) return
  const { entries, water } = useDiaryStore.getState()
  // Bara avslutade dagar (i går och bakåt) – dagen som pågår kan fortfarande ändras.
  for (let i = SEND_DAYS; i >= 1; i--) {
    const date = addDays(today, -i)
    if (date < since) continue
    const current = { kcal: Math.round(totals(entries[date] ?? []).kcal ?? 0), waterMl: Math.round(water[date] ?? 0) }
    const delta = intakeDelta(current, state.ledger.sent[date])
    const when = sampleInterval(date, now)
    if (granted.has('writeEnergy') && delta.kcal > 0) {
      if (stopped(ctx)) return
      await Health.saveSample({ dataType: 'dietaryEnergyConsumed', value: delta.kcal, unit: 'kilocalorie', ...when })
      if (wiped(ctx)) return
      // Loggen sparas direkt efter varje lyckad skrivning, så att ett avbrott aldrig ger dubbletter.
      markSent(date, { kcal: current.kcal })
      summary.kcal += delta.kcal
    }
    if (granted.has('writeWater') && delta.waterMl > 0) {
      if (stopped(ctx)) return
      await Health.saveSample({ dataType: 'dietaryWater', value: delta.waterMl / 1000, unit: 'liter', ...when })
      if (wiped(ctx)) return
      markSent(date, { waterMl: current.waterMl })
      summary.waterMl += delta.waterMl
    }
  }
}

function markSent(date: ISODate, patch: SentDay): void {
  const sent = { ...state.ledger.sent, [date]: { ...state.ledger.sent[date], ...patch } }
  update({ ledger: { ...state.ledger, sent } })
}

async function sendWeights(ctx: SyncContext): Promise<void> {
  const { today, summary } = ctx
  const since = state.since
  if (!since) return
  const from = addDays(today, -(WEIGHT_SEND_DAYS - 1))
  const importedIds = new Set(Object.values(state.ledger.weights).map((r) => r.id))
  const recent = useBodyStore.getState().weights.filter((w) => w.date >= since && w.date >= from && w.date <= today)
  for (const w of recent) {
    if (importedIds.has(w.id) || state.ledger.sentWeights[w.date] === w.id) continue
    if (!Number.isFinite(w.kg) || w.kg < MIN_KG || w.kg > MAX_KG) continue
    if (stopped(ctx)) return
    const at = weightTime(w)
    await Health.saveSample({ dataType: 'weight', value: w.kg, unit: 'kilogram', startDate: at, endDate: at })
    if (wiped(ctx)) return
    update({ ledger: { ...state.ledger, sentWeights: { ...state.ledger.sentWeights, [w.date]: w.id } } })
    summary.sentWeights++
  }
}

async function runSync(opts: HealthSyncOptions): Promise<HealthSyncSummary | null> {
  const read = opts.read !== false
  const gen = generation
  const current = () => gen === generation && state.enabled
  setRuntime({ syncing: true })
  try {
    if (!(await storesReady(HYDRATION_WAIT_MS))) return null
    if (!current()) return null
    const access = currentAccess()
    // Exempeldata synkas aldrig åt något håll, och inget händer före den egna profilen.
    if (access.demo || !useProfileStore.getState().settings.onboardingDone) {
      setRuntime({ problem: 'exempel' })
      return null
    }
    const chosen = selected(state.choices)
    const summary = emptySummary()
    if (chosen.length === 0) {
      setRuntime({ problem: null, missing: [], lastResult: summary })
      return summary
    }

    let status: AuthorizationStatus
    try {
      status = await Health.checkAuthorization(healthTypesFor(chosen))
    } catch (error) {
      const availability = await checkHealthAvailability()
      if (!current()) return null
      if (availability === 'ja' && !opts.quiet) logError(error, HEALTH_LOG_CONTEXT)
      setRuntime({ problem: availability === 'ja' ? 'fel' : availability })
      return null
    }
    if (!current()) return null
    const { granted, missing } = splitGranted(chosen, status)
    const now = new Date()
    const ctx: SyncContext = { gen, now, today: todayISO(now), granted: new Set(granted), summary }
    const errors: unknown[] = []
    const attempt = async <T>(fn: (ctx: SyncContext) => Promise<T>): Promise<T | undefined> => {
      if (stopped(ctx)) return undefined
      try {
        return await fn(ctx)
      } catch (error) {
        errors.push(error)
        return undefined
      }
    }

    let trialEnded = false
    if (read) {
      if (ctx.granted.has('readWeight')) {
        if (access.canLog) await attempt(importWeights)
        else trialEnded = true
      }
      const shown: HealthToday = { date: ctx.today }
      if (ctx.granted.has('readSteps')) shown.steps = await attempt(importSteps)
      if (!stopped(ctx)) setRuntime({ today: shown.steps === undefined ? null : shown })
      if (errors.length === 0 && !wiped(ctx)) state = { ...state, lastImport: now.getTime() }
    }
    if (ctx.granted.has('writeEnergy') || ctx.granted.has('writeWater')) await attempt(sendIntake)
    if (ctx.granted.has('writeWeight')) await attempt(sendWeights)

    if (wiped(ctx)) return null
    if (errors.length > 0 && !opts.quiet) logError(errors[0], HEALTH_LOG_CONTEXT)
    update({ ledger: prune(state.ledger, ctx.today), ...(errors.length === 0 ? { lastSync: now.getTime() } : {}) })
    // Frånkopplad under tiden: loggen är uppdaterad, men inget ska visas som om kopplingen vore på.
    if (!state.enabled) return summary
    setRuntime({
      problem: errors.length > 0 && !opts.quiet ? 'fel' : trialEnded ? 'provperiod' : null,
      missing,
      lastResult: summary,
    })
    return summary
  } catch (error) {
    // Ska inte hända (varje del fångar sina fel) – men synken får aldrig kasta.
    if (!opts.quiet) logError(error, HEALTH_LOG_CONTEXT)
    if (current()) setRuntime({ problem: 'fel' })
    return null
  } finally {
    setRuntime({ syncing: false })
  }
}

let running: Promise<HealthSyncSummary | null> | null = null
let queued: { opts: HealthSyncOptions; promise: Promise<HealthSyncSummary | null>; resolve: (v: HealthSyncSummary | null) => void } | null = null

function mergeOptions(a: HealthSyncOptions, b: HealthSyncOptions): HealthSyncOptions {
  return { read: a.read !== false || b.read !== false, quiet: Boolean(a.quiet && b.quiet) }
}

/**
 * Synka nu. En synk i taget: kommer en ny begäran under tiden körs en till efteråt (med begärans
 * val sammanslagna), så att en ändring mitt i en synk inte missas. Kastar aldrig; null när inget
 * kunde synkas (avstängt, exempeldata, butikerna inte inlästa, Hälsa inte tillgänglig).
 */
export function syncHealth(opts: HealthSyncOptions = {}): Promise<HealthSyncSummary | null> {
  if (!state.enabled) return Promise.resolve(null)
  if (!running) {
    running = runSync(opts).finally(() => {
      running = null
      const next = queued
      queued = null
      if (next) void syncHealth(next.opts).then(next.resolve)
    })
    return running
  }
  if (queued) {
    queued.opts = mergeOptions(queued.opts, opts)
    return queued.promise
  }
  let resolve!: (v: HealthSyncSummary | null) => void
  const promise = new Promise<HealthSyncSummary | null>((r) => {
    resolve = r
  })
  queued = { opts, promise, resolve }
  return promise
}

// ---------------------------------------------------------------------------
// Start (startNative)
// ---------------------------------------------------------------------------

let sendTimer: ReturnType<typeof setTimeout> | null = null
let cleanups: Array<() => void> = []
let startedHealth = false

function clearSendTimer(): void {
  if (sendTimer !== null) clearTimeout(sendTimer)
  sendTimer = null
}

const wantsToSend = () => state.enabled && (state.choices.writeEnergy || state.choices.writeWater || state.choices.writeWeight)

/** Skicka en stund efter den senaste ändringen (många ändringar i rad blir en skrivning). */
function scheduleSend(): void {
  if (!wantsToSend()) return
  clearSendTimer()
  sendTimer = setTimeout(() => {
    sendTimer = null
    void syncHealth({ read: false })
  }, SEND_DEBOUNCE_MS)
}

/**
 * Startar kopplingen när appen startar (anropas från `startNative()`): synkar om den är påslagen,
 * synkar när appen kommer tillbaka och skickar när den går till bakgrunden, och skickar en stund
 * efter ändringar i dagboken och vikten. Idempotent; kastar aldrig.
 */
export async function startHealth(): Promise<void> {
  if (startedHealth) return
  startedHealth = true
  try {
    const handle: PluginListenerHandle = await App.addListener('appStateChange', ({ isActive }) => {
      if (!state.enabled) return
      if (isActive) {
        void syncHealth({ read: Date.now() - (state.lastImport ?? 0) >= RESUME_IMPORT_MS })
      } else if (wantsToSend()) {
        clearSendTimer()
        // Telefonen kan låsas direkt – då är Hälsa låst och det skickas nästa gång i stället.
        void syncHealth({ read: false, quiet: true })
      }
    })
    cleanups.push(() => void handle.remove())
  } catch (error) {
    logError(error, HEALTH_LOG_CONTEXT)
  }
  cleanups.push(
    useDiaryStore.subscribe((s, prev) => {
      if (s.entries !== prev.entries || s.water !== prev.water) scheduleSend()
    }),
    useBodyStore.subscribe((s, prev) => {
      if (s.weights !== prev.weights) scheduleSend()
    }),
  )
  if (state.enabled) void syncHealth()
}

/** Endast för tester: glöm allt i minnet och läs valen från localStorage igen. */
export function resetHealthForTests(): void {
  clearSendTimer()
  cleanups.forEach((c) => c())
  cleanups = []
  startedHealth = false
  running = null
  queued = null
  ownIdPromise = null
  listeners.clear()
  state = load()
  runtime = initialRuntime()
  snapshot = buildSnapshot()
}
