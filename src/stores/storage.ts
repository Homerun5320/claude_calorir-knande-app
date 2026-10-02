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
 * - Sparad data som inte går att tolka (t.ex. en trasig månad i dagboken) skrivs aldrig över –
 *   nyckeln sparas bara i minnet under sessionen (`hasUnreadableData()`).
 * - Allt detta syns för användaren via `isMemoryOnlyStorage()` / `subscribeStorageStatus()`;
 *   `hasProtectedData()` säger om sparad data inte har lästs in (nyare version, går inte att tolka
 *   eller läsningen tar lång tid, `hasSlowReads()`) – då saknas den i en säkerhetskopia.
 *
 * Skydden ligger i `guardedRead`/`guardedWrite`/`guardedRemove` och används både av den vanliga
 * lagringen här (en JSON-sträng per butik) och av dagbokens egen lagring (diaryMonthStorage.ts,
 * en nyckel per månad – docs/LAGRING.md §7).
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
 * in och skrivs aldrig över (se `guardedRead`). Dagboken sparas i version 1 (en nyckel) eller i
 * månadsformatet (diaryMonthStorage.ts): där är `version` lagringsformatets (`DIARY_INDEX_VERSION`)
 * och butikens version här följer med i indexet som `stateVersion`. Indexet känns igen på sin form,
 * inte på versionen – dagbokens version här kan höjas som för alla andra butiker.
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

/**
 * Senaste värdet per nyckel när det inte (ännu) finns i IndexedDB: IndexedDB fungerar inte, nyckeln
 * är oläst eller har data från en nyare version, eller skrivningen pågår eller misslyckades. Den
 * vanliga lagringen sparar strängen, dagbokens lagring objektet (en referens – ingen kopia). Kopian
 * släpps när en skrivning har lyckats och värdet fortfarande är det senaste (docs/LAGRING.md §9).
 */
const memory = new Map<string, unknown>()
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
/**
 * Nycklar vars skydd "Radera all data" har släppt (`releaseNewerData`) – då får även data från en
 * nyare version som en skrivning hittar skrivas över (`protectNewerData`). Gäller tills nyckeln har
 * lästs in igen.
 */
const released = new Set<string>()
/**
 * Nycklar med sparad data som inte går att tolka (t.ex. en trasig månad i dagboken). Den läses inte
 * in och skrivs aldrig över under sessionen – ändringar sparas bara i minnet.
 */
const unreadable = new Set<string>()

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

/**
 * true om nyckeln kan ha sparats någon annanstans (en annan flik eller ett annat fönster) sedan den
 * här fliken läste eller skrev den: stämpeln har ändrats, eller fliken vet inte vilken stämpel den
 * såg. Är den true skriver dagbokens lagring hela dagboken i stället för bara de ändrade månaderna.
 * false när localStorage inte går att läsa – då går det inte att avgöra. Stämpeln är bara en
 * ledtråd: dagbokens lagring kontrollerar själv i sin transaktion vad som ligger sparat.
 */
export function changedElsewhere(name: string): boolean {
  const stamp = readStamp(name)
  if (stamp === undefined) return false
  return !seenStamps.has(name) || seenStamps.get(name) !== stamp
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

/**
 * true om det sparade värdet kommer från en nyare version av appen än den här (versionen i värdet
 * är högre än `PERSIST_VERSIONS`). Dagbokens egen lagring (diaryMonthStorage.ts) har samma regel
 * för version 1 och känner själv igen månadsindexet.
 */
function isFromNewerVersion(name: string, raw: string): boolean {
  const known = PERSIST_VERSIONS[name]
  if (known === undefined) return false
  const v = storedVersion(raw)
  return v !== undefined && v > known
}

// ---------------------------------------------------------------------------
// Skydden kring läsning och skrivning (delas av alla lagringar)
// ---------------------------------------------------------------------------

/**
 * Resultatet av en läsning från IndexedDB, tolkat av lagringen:
 * - `ok`: värdet (undefined = inget sparat). `onAccept` anropas bara om läsningen används – inte
 *   om den kom för sent eller skydden stoppade den.
 * - `newer`: data från en nyare version av Lagom – läses inte in och skrivs aldrig över.
 * - `unreadable`: sparad data som inte går att tolka – läses inte in och skrivs aldrig över under
 *   sessionen (lagringen loggar själv felet).
 */
export type ReadResult<T> = { status: 'ok'; value: T | undefined; onAccept?: () => void } | { status: 'newer' } | { status: 'unreadable' }

/** Minnets värde för nyckeln (se `memory`), null om inget finns. */
function memoryValue<T>(name: string): T | null {
  return (memory.get(name) as T | undefined) ?? null
}

/**
 * Läs en nyckel med alla skydd. `read` gör själva läsningen (helst i en enda transaktion) och
 * tolkar värdet:
 * - Nyckeln markeras som oläst synkront, innan något hinner skriva, och är det tills hela läsningen
 *   har lyckats – inget skrivs över oläst data.
 * - Stämpeln läses FÖRE datan (se `canRehydrate`).
 * - Tar läsningen längre tid än `READ_TIMEOUT_MS` visas appen utan den (`slowReads`); när den till
 *   slut blir klar anropas `onLateRead` så att butiken läses in igen.
 * - Data från en nyare version eller som inte går att tolka läses inte in och skrivs aldrig över.
 * - Ett fel (även ett synkront kast när IndexedDB är spärrad) ger minnesläge direkt.
 * I alla dessa fall returneras minnets värde (null om inget finns – då behåller zustand butikens
 * nuvarande tillstånd).
 */
export async function guardedRead<T>(name: string, read: () => Promise<ReadResult<T>>): Promise<T | null> {
  if (!idbAvailable()) return memoryValue<T>(name)
  // Markeras synkront, innan något hinner skriva – se `guardedWrite`.
  unread.add(name)
  // Stämpeln läses FÖRE datan: sparar en annan flik under läsningen blir stämpeln ny, och då
  // läses butiken hellre in en gång för mycket än en gång för lite.
  const stamp = readStamp(name)
  // Även ett synkront kast (indexedDB.open spärrad) fångas nedan och ger minnesläge direkt.
  const pending = attempt(read)
  try {
    const result = await within(pending, READ_TIMEOUT_MS)
    if (result === TIMEOUT) {
      slowReads.add(name)
      notify()
      pending.then(
        () => {
          // Datan finns kvar och går att läsa – låt butiken läsa in den på nytt. `unread`
          // tas bort först när den nya läsningen lyckas, så inget skrivs över under tiden.
          slowReads.delete(name)
          notify()
          lateReadListeners.forEach((l) => l(name))
        },
        (e) => {
          // Läsningen misslyckades till slut: det är inte längre en långsam läsning utan en
          // lagring som inte går att använda (minnesläge) – visa inte "läses in långsamt" för alltid.
          const wasSlow = slowReads.delete(name)
          markBroken(e)
          if (wasSlow) notify()
        },
      )
      return memoryValue<T>(name)
    }
    if (result.status === 'newer') {
      // Data från en nyare version av Lagom: läs inte in den (formatet kan ha ändrats) och
      // skriv aldrig över den. Nyckeln ligger kvar i `unread`, så skrivningar sparas bara i minnet.
      if (!newerData.has(name)) {
        if (import.meta.env.DEV) console.warn(`Lagom: ${name} kommer från en nyare version av appen – sparar bara i minnet.`)
        newerData.add(name)
        slowReads.delete(name)
        notify()
      }
      return memoryValue<T>(name)
    }
    if (result.status === 'unreadable') {
      // Sparad data som inte går att tolka: skriv aldrig över den (nyckeln ligger kvar i `unread`).
      if (!unreadable.has(name)) {
        unreadable.add(name)
        slowReads.delete(name)
        notify()
      }
      return memoryValue<T>(name)
    }
    unread.delete(name)
    released.delete(name)
    if (stamp === undefined) seenStamps.delete(name)
    else seenStamps.set(name, stamp)
    if (newerData.delete(name)) notify()
    if (unreadable.delete(name)) notify()
    if (slowReads.delete(name)) notify()
    result.onAccept?.()
    return result.value ?? memoryValue<T>(name)
  } catch (e) {
    markBroken(e)
    return memoryValue<T>(name)
  }
}

/** true om nyckeln får skrivas i IndexedDB just nu. */
function mayWrite(name: string): boolean {
  // Skriv aldrig över sparad data som ännu inte har lästs in (då skulle historiken försvinna),
  // aldrig över data från en nyare version av appen och aldrig över data som inte gick att tolka.
  return idbAvailable() && !unread.has(name) && !newerData.has(name) && !unreadable.has(name)
}

/**
 * Skriv en nyckel med alla skydd. `value` sparas alltid i minnet (en referens – ingen kopia), och
 * `write` anropas bara när nyckeln får skrivas i IndexedDB (synkront, så att skrivningarna läggs i
 * samma ordning som anropen). En lyckad skrivning tar bort felet, släpper minnets kopia om den
 * fortfarande är den senaste, sätter stämpeln och meddelar andra flikar. En misslyckad syns i
 * `isMemoryOnlyStorage()` tills en senare skrivning lyckas. Väntar högst `WRITE_WAIT_MS` – en
 * långsam skrivning får fortsätta i bakgrunden.
 */
export async function guardedWrite<T>(name: string, value: T, write: () => Promise<void>): Promise<void> {
  memory.set(name, value)
  if (!mayWrite(name)) return
  const done = attempt(write).then(
    () => {
      if (failedWrites.delete(name)) notify()
      // Minnets kopia behövs bara när IndexedDB inte kan användas (eller skrivningen misslyckas).
      if (memory.get(name) === value) memory.delete(name)
      writeStamp(name)
      announceWrite(name)
    },
    (e: unknown) => {
      if (import.meta.env.DEV) console.warn(`Lagom: kunde inte spara ${name}.`, e)
      // Skrivningen hittade data från en nyare version (`protectNewerData`): den visas som sådan.
      if (newerData.has(name)) return
      if (!failedWrites.has(name)) {
        failedWrites.add(name)
        notify()
      }
    },
  )
  await within(done, WRITE_WAIT_MS)
}

/**
 * Ta bort en nyckel med skydden: data från en nyare version eller som inte gick att tolka raderas
 * aldrig härifrån (bara "Radera all data" släpper skyddet, se `releaseNewerData`).
 */
export async function guardedRemove(name: string, remove: () => Promise<void>): Promise<void> {
  memory.delete(name)
  if (!idbAvailable() || newerData.has(name) || unreadable.has(name)) return
  try {
    await within(attempt(remove), WRITE_WAIT_MS)
  } catch (e) {
    markBroken(e)
  }
}

/** Den vanliga lagringen: hela butiken som en JSON-sträng under butikens nyckel. */
const idbStateStorage: StateStorage = {
  getItem: (name) =>
    guardedRead<string>(name, async () => {
      const v = await get<string>(name)
      return typeof v === 'string' && isFromNewerVersion(name, v) ? { status: 'newer' } : { status: 'ok', value: v }
    }),
  setItem: (name, value) => guardedWrite(name, value, () => set(name, value)),
  removeItem: (name) => guardedRemove(name, () => del(name)),
}

export const idbStorage = createJSONStorage(() => idbStateStorage)

/**
 * true om ändringar just nu inte sparas på enheten: IndexedDB saknas eller är blockerad, en
 * skrivning har misslyckats, sparad data har ännu inte kunnat läsas in (`hasSlowReads()`), sparad
 * data kommer från en nyare version av appen eller sparad data går inte att tolka.
 */
export function isMemoryOnlyStorage(): boolean {
  return !idbAvailable() || failedWrites.size > 0 || slowReads.size > 0 || newerData.size > 0 || unreadable.size > 0
}

/**
 * true om någon butik har sparad data från en nyare version av Lagom. Den datan läses inte in och
 * skrivs aldrig över – visa "Din data är från en nyare version av Lagom – uppdatera appen."
 */
export function hasNewerData(): boolean {
  return newerData.size > 0
}

/**
 * true om någon butik har sparad data som inte går att tolka (t.ex. en trasig månad i dagboken).
 * Den läses inte in och skrivs aldrig över under sessionen. Det är inte webbläsarens fel – visa en
 * egen text i stället för "Webbläsaren låter inte Lagom spara".
 */
export function hasUnreadableData(): boolean {
  return unreadable.size > 0
}

/**
 * true om någon butik har sparad data vars läsning tar lång tid (mer än `READ_TIMEOUT_MS` – en
 * stor dagbok på en äldre telefon eller en hängande webbvy). Appen visas då med tomma standardvärden,
 * men inget är raderat: datan läses in när läsningen blir klar (`onLateRead`) och nyckeln skrivs
 * aldrig över under tiden. Det är inte lagringens fel – visa "läses in långsamt" i stället för
 * "Webbläsaren låter inte Lagom spara" (lib/storageTexts.ts). Blir false när läsningen är klar, och
 * för en nyckel som visar sig vara från en nyare version eller inte går att tolka (då gäller
 * `hasNewerData()`/`hasUnreadableData()`).
 */
export function hasSlowReads(): boolean {
  return slowReads.size > 0
}

/**
 * true om sparad data inte har lästs in och skyddas: den kommer från en nyare version, går inte att
 * tolka eller läses fortfarande in (`hasSlowReads()`). En säkerhetskopia som görs då innehåller bara
 * det som gjorts under sessionen – då ska påminnelsen om säkerhetskopia inte tystna
 * (`markBackupNow`), annars ser en nästan tom fil ut som en fullgod kopia.
 */
export function hasProtectedData(): boolean {
  return newerData.size > 0 || unreadable.size > 0 || slowReads.size > 0
}

/**
 * För lagringar som bygger på den här modulen (dagbokens lagring): en skrivning har hittat data från
 * en nyare version av Lagom i IndexedDB – en annan flik med en nyare version har sparat under tiden.
 * Nyckeln skyddas då som vid en läsning (läses inte in, skrivs aldrig över, `hasNewerData()`), och
 * skrivningen ska avbrytas. Returnerar false om "Radera all data" har släppt skyddet för nyckeln
 * (`releaseNewerData`) – då får datan skrivas över.
 */
export function protectNewerData(name: string): boolean {
  if (released.has(name)) return false
  unread.add(name)
  if (!newerData.has(name)) {
    newerData.add(name)
    slowReads.delete(name)
    notify()
  }
  return true
}

/**
 * true om butiken bör och kan läsas in på nytt från IndexedDB (efter `onRemoteWrite` eller när
 * fliken blir synlig igen):
 * - någon annan har sparat den sedan den här fliken läste eller skrev den (stämpeln i
 *   localStorage har ändrats – går den inte att läsa räknas det som ändrat),
 * - den sparade datan har redan lästs in och ingen läsning pågår,
 * - den kommer inte från en nyare version av appen och går att tolka, och
 * - senaste sparningen lyckades. Misslyckades den (t.ex. full lagring) finns de senaste
 *   ändringarna bara i minnet – en ny inläsning skulle ersätta dem med den äldre datan.
 *
 * En onödig inläsning läser och tolkar hela butiken (en stor dagbok) och ritar om appen – och
 * en ändring som görs medan den pågår går förlorad. Därför bara när något faktiskt har ändrats.
 */
export function canRehydrate(name: string): boolean {
  // I minnesläge finns inget annat att läsa in.
  if (!idbAvailable() || unread.has(name) || newerData.has(name) || unreadable.has(name) || failedWrites.has(name)) return false
  const stamp = readStamp(name)
  return stamp === undefined || !seenStamps.has(name) || seenStamps.get(name) !== stamp
}

/**
 * Släpp skyddet för data från en nyare version – och för sparad data som inte gick att tolka – så
 * att nästa sparning skriver över den. Används BARA när användaren uttryckligen raderar all data
 * ("Radera all data") – då ska även den datan bort. Anropa före rensningen av butikerna. `keep`
 * behålls skyddade (t.ex. licensen, så att provperiodens start inte försvinner). Till nästa läsning
 * får dagbokens skrivare då också skriva över data från en nyare version som den hittar i sin
 * transaktion (`protectNewerData`).
 */
export function releaseNewerData(keep: readonly string[] = []): void {
  let changed = false
  for (const protectedKeys of [newerData, unreadable]) {
    for (const name of protectedKeys) {
      if (keep.includes(name)) continue
      protectedKeys.delete(name)
      unread.delete(name)
      released.add(name)
      changed = true
    }
  }
  if (changed) notify()
}

/**
 * Prenumerera på ändringar av `isMemoryOnlyStorage()`, `hasNewerData()`, `hasUnreadableData()`,
 * `hasSlowReads()` och `hasProtectedData()`. Returnerar avprenumeration.
 */
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

const resetListeners = new Set<() => void>()

/**
 * För lagringar som bygger på den här modulen (dagbokens lagring): anropas av
 * `resetStorageStateForTests`, så att deras eget tillstånd också återställs.
 */
export function registerStorageReset(listener: () => void): void {
  resetListeners.add(listener)
}

/** Endast för tester: återställ modulens tillstånd (och dagbokslagringens, se `registerStorageReset`). */
export function resetStorageStateForTests(): void {
  memory.clear()
  unread.clear()
  slowReads.clear()
  failedWrites.clear()
  newerData.clear()
  unreadable.clear()
  released.clear()
  seenStamps.clear()
  resetListeners.forEach((l) => l())
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STAMP_PREFIX)) localStorage.removeItem(key)
  } catch {
    /* ingen localStorage */
  }
  idbBroken = false
  notify()
}
