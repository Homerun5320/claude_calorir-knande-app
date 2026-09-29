/**
 * Persistens för Zustand-butiker i IndexedDB (via idb-keyval).
 * All data stannar lokalt på enheten – inget konto, ingen server.
 *
 * Lagringen är tålig men aldrig tyst:
 * - Saknas IndexedDB eller går den inte att öppna (privat läge, blockerad lagring) sparas data i
 *   minnet för sessionen, så att appen aldrig fastnar i laddningsläget. Även ett synkront kast
 *   (t.ex. när `indexedDB.open` spärras av webbläsarens inställningar) ger minnesläge direkt.
 * - En långsam läsning (stor dagbok på en äldre telefon) stänger INTE av lagringen. Appen visas
 *   efter en stund, men nyckeln skrivs aldrig över i IndexedDB förrän den sparade datan har
 *   lästs in – när läsningen till slut blir klar läses butiken in på nytt (`onLateRead`).
 * - Data från en NYARE version av Lagom (högre `version` än `PERSIST_VERSIONS`) läses inte in
 *   och skrivs aldrig över – butiken startar tom och ändringar sparas bara i minnet tills appen
 *   har uppdaterats (`hasNewerData()`).
 * - En långsam skrivning får fortsätta i bakgrunden. Bara en skrivning som faktiskt misslyckas
 *   räknas som ett fel, och det försvinner så fort en senare skrivning lyckas.
 * - Efter varje lyckad skrivning meddelas andra flikar (BroadcastChannel, bara nyckelns namn –
 *   aldrig data), så att de kan läsa in butiken på nytt i stället för att skriva över den
 *   (`onRemoteWrite`). En stämpel i localStorage visar om en butik har ändrats sedan fliken läste
 *   den (`canRehydrate`).
 * - Allt detta syns för användaren via `isMemoryOnlyStorage()` / `subscribeStorageStatus()`.
 */
import { del, get, set } from 'idb-keyval'
import { createJSONStorage, type StateStorage } from 'zustand/middleware'

/** Nycklar för alla persisterade butiker (används av export/import och radering). */
export const STORE_KEYS = {
  profile: 'lagom-profile',
  diary: 'lagom-diary',
  food: 'lagom-food',
  body: 'lagom-body',
  fasting: 'lagom-fasting',
  license: 'lagom-license',
  /** Veckoplaneringen och inköpslistan (planStore.ts). */
  plan: 'lagom-plan',
  /** Påminnelserna i apparna (reminderStore.ts). */
  reminders: 'lagom-reminders',
} as const

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS]

/**
 * Aktuell version av det sparade formatet per butik (persist-mellanvarans `version`).
 *
 * Höj versionen här – och lägg till en migrering i butikens `migrate` – när formatet ändras. Data
 * med en högre version än den som står här kommer från en nyare version av appen: den läses inte
 * in och skrivs aldrig över (se `idbStateStorage.getItem`).
 */
export const PERSIST_VERSIONS: Readonly<Record<StoreKey, number>> & Readonly<Record<string, number | undefined>> = {
  [STORE_KEYS.profile]: 1,
  [STORE_KEYS.diary]: 1,
  [STORE_KEYS.food]: 1,
  [STORE_KEYS.body]: 1,
  [STORE_KEYS.fasting]: 1,
  [STORE_KEYS.license]: 1,
  [STORE_KEYS.plan]: 1,
  [STORE_KEYS.reminders]: 1,
}

/** Hur länge en läsning får ta innan appen visas utan den (läsningen fortsätter i bakgrunden). */
export const READ_TIMEOUT_MS = 8000
/** Hur länge persist-mellanvaran väntar på en skrivning (skrivningen fortsätter i bakgrunden). */
const WRITE_WAIT_MS = 8000
/** Namnet på kanalen mellan flikar. */
const CHANNEL_NAME = 'lagom-store'

const memory = new Map<string, string>()
/** IndexedDB saknas eller gick inte att öppna/läsa – allt sparas bara i minnet. */
let idbBroken = false
/** Nycklar vars sparade data ännu inte har lästs in – får inte skrivas över i IndexedDB. */
const unread = new Set<string>()
/** Nycklar vars läsning tog längre tid än `READ_TIMEOUT_MS`. */
const slowReads = new Set<string>()
/** Nycklar där senaste skrivningen misslyckades (t.ex. fullt lagringsutrymme). */
const failedWrites = new Set<string>()
/** Nycklar med data från en nyare version av Lagom – läses inte in och skrivs aldrig över. */
const newerData = new Set<string>()

const statusListeners = new Set<() => void>()
const lateReadListeners = new Set<(name: string) => void>()
const remoteWriteListeners = new Set<(name: string) => void>()

function notify() {
  statusListeners.forEach((l) => l())
}

// ---------------------------------------------------------------------------
// Signal mellan flikar
// ---------------------------------------------------------------------------

function openChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null
    const ch = new BroadcastChannel(CHANNEL_NAME)
    ch.onmessage = (e: MessageEvent) => {
      const name = (e.data as { name?: unknown } | null)?.name
      // Bara nyckelns namn skickas – aldrig någon data.
      if (typeof name !== 'string' || name.length === 0 || name.length > 100) return
      remoteWriteListeners.forEach((l) => l(name))
    }
    return ch
  } catch {
    // Kanalen kan saknas eller vara spärrad (t.ex. i vissa inbäddade vyer) – då ingen signal.
    return null
  }
}

const channel = openChannel()

function announceWrite(name: string) {
  try {
    channel?.postMessage({ name })
  } catch {
    /* kanalen stängd – andra flikar läser in vid nästa fokus i stället */
  }
}

/**
 * Stämpel i localStorage efter varje lyckad sparning (bara en slumpad tidsstämpel – aldrig data).
 * Med den vet en flik om en butik har sparats någon annanstans sedan den själv läste eller skrev
 * den – även om kanalens meddelande aldrig kom fram (t.ex. när fliken låg frusen i bakgrunden) –
 * och slipper läsa in hela dagboken på nytt varje gång appen visas igen.
 */
const STAMP_PREFIX = 'lagom-sparad:'
/** Stämpeln som den här fliken senast läste in eller skrev, per nyckel. */
const seenStamps = new Map<string, string | null>()

/** Nyckelns stämpel, null om ingen finns, undefined om localStorage inte går att läsa. */
function readStamp(name: string): string | null | undefined {
  try {
    return localStorage.getItem(STAMP_PREFIX + name)
  } catch {
    return undefined
  }
}

function writeStamp(name: string): void {
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  try {
    localStorage.setItem(STAMP_PREFIX + name, stamp)
    seenStamps.set(name, stamp)
  } catch {
    // Utan stämpel läses butiken in på nytt som förut (se `canRehydrate`).
    seenStamps.delete(name)
  }
}

// ---------------------------------------------------------------------------
// IndexedDB med tidsgränser och minnesreserv
// ---------------------------------------------------------------------------

const TIMEOUT = Symbol('timeout')

/** Vänta högst `ms` på ett löfte. Löftet självt fortsätter även efter tidsgränsen. */
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve(TIMEOUT), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * Kör ett IndexedDB-anrop och gör ett synkront kast till ett avvisat löfte. `idb-keyval` öppnar
 * databasen synkront (`indexedDB.open`), och det kastar direkt när webbläsaren spärrar lagringen
 * – då ska appen gå över till minnesläge i stället för att krascha eller hänga.
 */
function attempt<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return fn()
  } catch (e) {
    return Promise.reject(e)
  }
}

function markBroken(e: unknown) {
  if (idbBroken) return
  if (import.meta.env.DEV) console.warn('Lagom: IndexedDB otillgänglig – sparar i minnet för den här sessionen.', e)
  idbBroken = true
  notify()
}

function idbAvailable(): boolean {
  if (idbBroken) return false
  try {
    // Själva uppslaget kan kasta (t.ex. SecurityError när webbplatsdata är avstängd).
    return typeof indexedDB !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Versionen i ett sparat värde (`{"state":…,"version":1}`). Snabbvägen läser bara slutet av
 * strängen – så att en stor dagbok inte behöver tolkas två gånger vid start – och annars tolkas
 * hela värdet. Returnerar undefined om versionen inte går att läsa.
 */
export function storedVersion(raw: string): number | undefined {
  const tail = /,"version":(-?\d+(?:\.\d+)?)\}\s*$/.exec(raw.slice(-48))
  if (tail) return Number(tail[1])
  try {
    const parsed: unknown = JSON.parse(raw)
    const v = typeof parsed === 'object' && parsed !== null ? (parsed as { version?: unknown }).version : undefined
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** true om det sparade värdet kommer från en nyare version av appen än den här. */
function isFromNewerVersion(name: string, raw: string): boolean {
  const known = PERSIST_VERSIONS[name]
  if (known === undefined) return false
  const v = storedVersion(raw)
  return v !== undefined && v > known
}

const idbStateStorage: StateStorage = {
  getItem: async (name) => {
    if (!idbAvailable()) return memory.get(name) ?? null
    // Markeras synkront, innan något hinner skriva – se `setItem`.
    unread.add(name)
    // Stämpeln läses FÖRE datan: sparar en annan flik under läsningen blir stämpeln ny, och då
    // läses butiken hellre in en gång för mycket än en gång för lite.
    const stamp = readStamp(name)
    // Även ett synkront kast (indexedDB.open spärrad) fångas nedan och ger minnesläge direkt.
    const read = attempt(() => get<string>(name))
    try {
      const v = await within(read, READ_TIMEOUT_MS)
      if (v === TIMEOUT) {
        slowReads.add(name)
        notify()
        read.then(
          () => {
            // Datan finns kvar och går att läsa – låt butiken läsa in den på nytt. `unread`
            // tas bort först när den nya läsningen lyckas, så inget skrivs över under tiden.
            slowReads.delete(name)
            notify()
            lateReadListeners.forEach((l) => l(name))
          },
          (e) => markBroken(e),
        )
        return memory.get(name) ?? null
      }
      if (typeof v === 'string' && isFromNewerVersion(name, v)) {
        // Data från en nyare version av Lagom: läs inte in den (formatet kan ha ändrats) och
        // skriv aldrig över den. Nyckeln ligger kvar i `unread`, så `setItem` sparar bara i minnet.
        if (!newerData.has(name)) {
          if (import.meta.env.DEV) console.warn(`Lagom: ${name} kommer från en nyare version av appen – sparar bara i minnet.`)
          newerData.add(name)
          slowReads.delete(name)
          notify()
        }
        return memory.get(name) ?? null
      }
      unread.delete(name)
      if (stamp === undefined) seenStamps.delete(name)
      else seenStamps.set(name, stamp)
      if (newerData.delete(name)) notify()
      if (slowReads.delete(name)) notify()
      return v ?? memory.get(name) ?? null
    } catch (e) {
      markBroken(e)
      return memory.get(name) ?? null
    }
  },
  setItem: async (name, value) => {
    memory.set(name, value)
    // Skriv aldrig över sparad data som ännu inte har lästs in (då skulle historiken försvinna),
    // och aldrig över data från en nyare version av appen.
    if (!idbAvailable() || unread.has(name) || newerData.has(name)) return
    const write = attempt(() => set(name, value)).then(
      () => {
        if (failedWrites.delete(name)) notify()
        writeStamp(name)
        announceWrite(name)
      },
      (e: unknown) => {
        if (import.meta.env.DEV) console.warn(`Lagom: kunde inte spara ${name}.`, e)
        if (!failedWrites.has(name)) {
          failedWrites.add(name)
          notify()
        }
      },
    )
    await within(write, WRITE_WAIT_MS)
  },
  removeItem: async (name) => {
    memory.delete(name)
    // Data från en nyare version av appen raderas aldrig härifrån.
    if (!idbAvailable() || newerData.has(name)) return
    try {
      await within(
        attempt(() => del(name)),
        WRITE_WAIT_MS,
      )
    } catch (e) {
      markBroken(e)
    }
  },
}

export const idbStorage = createJSONStorage(() => idbStateStorage)

/**
 * true om ändringar just nu inte sparas på enheten: IndexedDB saknas eller är blockerad, en
 * skrivning har misslyckats, sparad data har ännu inte kunnat läsas in eller sparad data kommer
 * från en nyare version av appen.
 */
export function isMemoryOnlyStorage(): boolean {
  return !idbAvailable() || failedWrites.size > 0 || slowReads.size > 0 || newerData.size > 0
}

/**
 * true om någon butik har sparad data från en nyare version av Lagom. Den datan läses inte in och
 * skrivs aldrig över – visa "Din data är från en nyare version av Lagom – uppdatera appen."
 */
export function hasNewerData(): boolean {
  return newerData.size > 0
}

/**
 * true om butiken bör och kan läsas in på nytt från IndexedDB (efter `onRemoteWrite` eller när
 * fliken blir synlig igen):
 * - någon annan har sparat den sedan den här fliken läste eller skrev den (stämpeln i
 *   localStorage har ändrats – går den inte att läsa räknas det som ändrat),
 * - den sparade datan har redan lästs in och ingen läsning pågår,
 * - den kommer inte från en nyare version av appen, och
 * - senaste sparningen lyckades. Misslyckades den (t.ex. full lagring) finns de senaste
 *   ändringarna bara i minnet – en ny inläsning skulle ersätta dem med den äldre datan.
 *
 * En onödig inläsning läser och tolkar hela butiken (en stor dagbok) och ritar om appen – och
 * en ändring som görs medan den pågår går förlorad. Därför bara när något faktiskt har ändrats.
 */
export function canRehydrate(name: string): boolean {
  // I minnesläge finns inget annat att läsa in.
  if (!idbAvailable() || unread.has(name) || newerData.has(name) || failedWrites.has(name)) return false
  const stamp = readStamp(name)
  return stamp === undefined || !seenStamps.has(name) || seenStamps.get(name) !== stamp
}

/**
 * Släpp skyddet för data från en nyare version, så att nästa sparning skriver över den. Används
 * BARA när användaren uttryckligen raderar all data ("Radera all data") – då ska även den datan
 * bort. Anropa före rensningen av butikerna. `keep` behålls skyddade (t.ex. licensen, så att
 * provperiodens start inte försvinner).
 */
export function releaseNewerData(keep: readonly string[] = []): void {
  let changed = false
  for (const name of newerData) {
    if (keep.includes(name)) continue
    newerData.delete(name)
    unread.delete(name)
    changed = true
  }
  if (changed) notify()
}

/** Prenumerera på ändringar av `isMemoryOnlyStorage()` och `hasNewerData()`. Returnerar avprenumeration. */
export function subscribeStorageStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}

/** Anropas när en läsning som tog för lång tid till slut blev klar (butiken bör läsas in igen). */
export function onLateRead(listener: (name: string) => void): () => void {
  lateReadListeners.add(listener)
  return () => lateReadListeners.delete(listener)
}

/**
 * Anropas när en annan flik (eller ett annat fönster) har sparat en butik. Bara nyckelns namn
 * skickas – läs in butiken på nytt (`persist.rehydrate()`) så att den här fliken inte skriver
 * över den nyare datan med sin gamla. Returnerar avprenumeration.
 */
export function onRemoteWrite(listener: (name: string) => void): () => void {
  remoteWriteListeners.add(listener)
  return () => remoteWriteListeners.delete(listener)
}

/** Endast för tester: återställ modulens tillstånd. */
export function resetStorageStateForTests(): void {
  memory.clear()
  unread.clear()
  slowReads.clear()
  failedWrites.clear()
  newerData.clear()
  seenStamps.clear()
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STAMP_PREFIX)) localStorage.removeItem(key)
  } catch {
    /* ingen localStorage */
  }
  idbBroken = false
  notify()
}
