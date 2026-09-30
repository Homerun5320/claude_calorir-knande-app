/**
 * Dagbokens lagring i IndexedDB – "en nyckel per månad", version A i docs/LAGRING.md §7.
 *
 * Läser båda formaten (allt ligger som JSON-strängar i idb-keyvals databas `keyval-store`):
 * - **Version 1** (i dag): hela dagboken under `lagom-diary`,
 *   `{"state":{"entries":…,"water":…,"exercise":…,"days":…},"version":1}`.
 * - **Version 2** (månader): `lagom-diary` är ett litet index,
 *   `{"state":{"format":"manader","stateVersion":1,"token":"…"},"version":2}`, och varje månad ligger
 *   under `lagom-diary:ÅÅÅÅ-MM` som `{"entries":…,"water":…,"exercise":…,"days":…}` med bara månadens
 *   datum. Nycklar som inte börjar med "ÅÅÅÅ-MM-" hamnar i `lagom-diary:ovrigt` – inget tappas.
 *   `version` 2 är lagringsformatets version (äldre versioner av Lagom ser då data från en nyare
 *   version och sparar bara i minnet), `stateVersion` är butikens version (`PERSIST_VERSIONS`) och
 *   `token` en slumpad märkning som är ny för varje skrivning (se skrivaren). Indexet känns igen på
 *   `state.format`, inte på versionen. Månaderna hittas med ett nyckelintervall, inte med en lista i
 *   indexet, så att en gammal flik aldrig kan tappa bort en månad. `lagom-diary-v1` är den gamla
 *   strängen, sparad vid bytet ('-' sorteras före ':' och ligger utanför intervallet).
 *
 * Det som den här versionen inte känner till skyddas som data från en nyare version – det läses
 * inte in, skrivs aldrig över och tas inte bort: en nyckel i månadsintervallet som inte är en månad,
 * fält i en månad utöver de fyra, fält i dagboken (version 1) utöver de fyra, `version` över 2 eller
 * `stateVersion` över butikens. Extra fält i indexet går bra. Allt nytt i intervallet eller i
 * dagbokens tillstånd kräver alltså version 3 i indexet (eller en högre butiksversion).
 *
 * I den här versionen är månadsskrivaren avstängd (`DIARY_MONTHS_WRITE_BUILD = false`): varje
 * skrivning sparar version 1 – byte för byte samma sträng som `createJSONStorage` gav – och tar
 * bort eventuella månadsnycklar i samma transaktion. Då kan en senare version som skriver månader
 * rullas tillbaka hit utan att någon ser en tom dagbok, och den versionen behöver bara slå på
 * skrivaren. Skrivaren finns redan här och är testad (diaryMonthStorage.test.ts).
 *
 * Skydden är desamma som för alla andra butiker och ligger i storage.ts (`guardedRead`,
 * `guardedWrite`, `guardedRemove`): inget skrivs över oläst data, data från en nyare version eller
 * data som inte går att tolka, långsamma läsningar, minnesläge, stämpel och signal till andra flikar.
 */
import { createStore, promisifyRequest, type UseStore } from 'idb-keyval'
import type { PersistStorage, StorageValue } from 'zustand/middleware'
import type { DayMeta, DiaryEntry, ExerciseEntry, ISODate } from '../types'
import { logError } from '../lib/errorLog'
import {
  changedElsewhere,
  guardedRead,
  guardedRemove,
  guardedWrite,
  PERSIST_VERSIONS,
  protectNewerData,
  registerStorageReset,
  STORE_KEYS,
  storedVersion,
  type ReadResult,
} from './storage'

/**
 * Byggkonstant: skriver den här versionen dagboken i månadsformatet (version 2)? Av i version A –
 * den läser båda formaten men skriver version 1. Slås på i en senare version (version B).
 */
export const DIARY_MONTHS_WRITE_BUILD: boolean = false

/** Lagringsformatets version i månadsindexet (`"version":2` i `lagom-diary`). */
export const DIARY_INDEX_VERSION = 2
/** `state.format` i månadsindexet. */
export const DIARY_INDEX_FORMAT = 'manader'
/** Månaden för nycklar som inte är ett datum ("ÅÅÅÅ-MM-…"). */
export const DIARY_OTHER_MONTH = 'ovrigt'
/** Den gamla strängen (version 1), sparad när dagboken byter till månader. */
export const DIARY_V1_COPY_KEY = `${STORE_KEYS.diary}-v1`

/** Det som sparas av dagboken (`partialize` i diaryStore.ts, i den här ordningen). */
export interface DiaryData {
  entries: Record<ISODate, DiaryEntry[]>
  water: Record<ISODate, number>
  exercise: Record<ISODate, ExerciseEntry[]>
  days: Record<ISODate, DayMeta>
}

const MAPS = ['entries', 'water', 'exercise', 'days'] as const
type MapKey = (typeof MAPS)[number]
const MAP_KEYS: ReadonlySet<string> = new Set(MAPS)

/** Butikens version (följer med i indexet som `stateVersion`). */
const STATE_VERSION = PERSIST_VERSIONS[STORE_KEYS.diary]
/** Sammanhanget i felloggen. */
const LOG_CONTEXT = 'dagbokens lagring'
const MONTH_DATE = /^\d{4}-\d{2}-/
/** En månadsnyckels slut ("2026-09"), utöver `DIARY_OTHER_MONTH`. */
const MONTH_NAME = /^\d{4}-\d{2}$/
/** Så börjar en dagbok i version 1 (`createJSONStorage` och `writeV1` skriver `entries` först). */
const V1_PREFIX = '{"state":{"entries":'

const monthKey = (name: string, month: string) => `${name}:${month}`
const v1CopyKey = (name: string) => `${name}-v1`
/** Alla månadsnycklar för `name` – skapas först vid anropet (IDBKeyRange saknas utan IndexedDB). */
const monthRange = (name: string) => IDBKeyRange.bound(`${name}:`, `${name}:\uFFFF`)

/** Månaden (nyckelns slut) för ett datum: "2026-09-29" → "2026-09", annat → "ovrigt". */
export function diaryMonthOf(date: string): string {
  return MONTH_DATE.test(date) ? date.slice(0, 7) : DIARY_OTHER_MONTH
}

/** Bara felets namn (t.ex. "QuotaExceededError") – meddelandet kan citera dagbokens innehåll. */
function errorName(e: unknown): string {
  const n = typeof e === 'object' && e !== null ? (e as { name?: unknown }).name : undefined
  return typeof n === 'string' && /^[A-Za-z]{1,40}$/.test(n) ? n : 'okänt fel'
}

// ---------------------------------------------------------------------------
// IndexedDB (samma databas och objektlager som idb-keyvals standard)
// ---------------------------------------------------------------------------

let idb: UseStore | null = null
/** Egen anslutning till idb-keyvals standarddatabas, så att flera nycklar ryms i en transaktion. */
const diaryIdb = (): UseStore => (idb ??= createStore('keyval-store', 'keyval'))

/**
 * Kör `fn` i en skrivtransaktion. Kastar `fn` avbryts transaktionen, så att inget halvgjort sparas.
 * Kastar aldrig synkront (t.ex. när `indexedDB.open` är spärrad) – felet kommer som ett avvisat löfte.
 */
function transact(fn: (os: IDBObjectStore) => void): Promise<void> {
  try {
    return diaryIdb()('readwrite', (os) => {
      const done = promisifyRequest(os.transaction)
      try {
        fn(os)
      } catch (e) {
        done.catch(() => {})
        try {
          os.transaction.abort()
        } catch {
          /* redan avbruten */
        }
        throw e
      }
      return done
    })
  } catch (e) {
    return Promise.reject(e)
  }
}

/**
 * En skrivtransaktion som först läser huvudnyckeln: `fn` körs när den är läst, i samma transaktion –
 * ingen annan skrivning kan komma emellan, så skrivningen kan bero på vad som faktiskt ligger där.
 * Kastar `fn` avbryts transaktionen och löftet avvisas med det felet.
 */
function transactOnMain(name: string, fn: (os: IDBObjectStore, main: unknown) => void): Promise<void> {
  let thrown: { error: unknown } | null = null
  return transact((os) => {
    const req = os.get(name)
    req.onsuccess = () => {
      try {
        fn(os, req.result)
      } catch (e) {
        thrown = { error: e }
        try {
          os.transaction.abort()
        } catch {
          /* redan avbruten */
        }
      }
    }
  }).catch((e: unknown) => {
    throw thrown ? thrown.error : e
  })
}

/** Det som ligger sparat: huvudnyckeln och alla månader (nyckel, värde) i nyckelordning. */
export interface DiarySnapshot {
  main: unknown
  months: Array<[string, unknown]>
}

/**
 * Läs huvudnyckeln och alla månader i EN läsetransaktion – en ögonblicksbild som ingen samtidig
 * skrivning kan dela på. Används av `getItem` (och av testerna och mätningen, utan sidoeffekter).
 */
export function readDiarySnapshot(name: string = STORE_KEYS.diary): Promise<DiarySnapshot> {
  return diaryIdb()('readonly', (os) => {
    const range = monthRange(name)
    return Promise.all([promisifyRequest(os.get(name)), promisifyRequest(os.getAllKeys(range)), promisifyRequest(os.getAll(range))]).then(
      ([main, keys, values]): DiarySnapshot => ({ main, months: keys.map((k, i): [string, unknown] => [String(k), values[i]]) }),
    )
  })
}

// ---------------------------------------------------------------------------
// Huvudnyckeln: version 1, indexet eller något annat
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Vad huvudnyckeln `lagom-diary` innehåller. */
type Main =
  | { kind: 'none' }
  | { kind: 'v1'; value: unknown }
  | { kind: 'index'; stateVersion: number }
  | { kind: 'newer' }
  | { kind: 'unreadable'; message: string }

/**
 * Tolka huvudnyckeln. Indexet känns igen på sin form (`state.format`), inte på versionen – så krockar
 * det aldrig med butikens version, som kan höjas som för alla butiker:
 * - Indexet: `version` över 2 eller `stateVersion` över butikens → nyare version; `version` under 2
 *   eller fält som saknas → går inte att tolka. Extra fält (t.ex. `token`) går bra.
 * - Allt annat är version 1: `version` över butikens → nyare version, och likaså fält i `state`
 *   utöver de fyra – de har aldrig funnits, så en nyare version har lagt till dem (här skulle de
 *   annars försvinna vid nästa skrivning).
 * Felmeddelandena är fasta: tolkningsfelet kan citera dagbokens innehåll och loggas aldrig.
 */
function inspectMain(main: unknown): Main {
  if (main === undefined) return { kind: 'none' }
  if (typeof main !== 'string') return { kind: 'unreadable', message: 'Dagbokens sparade värde har fel typ' }
  let parsed: unknown
  try {
    parsed = JSON.parse(main)
  } catch {
    return { kind: 'unreadable', message: 'Dagbokens sparade värde går inte att tolka' }
  }
  const root = isRecord(parsed) ? parsed : undefined
  const state = root && isRecord(root.state) ? root.state : undefined
  const version = root?.version
  if (state?.format === DIARY_INDEX_FORMAT) {
    if (typeof version === 'number' && version > DIARY_INDEX_VERSION) return { kind: 'newer' }
    const stateVersion = state.stateVersion
    if (version !== DIARY_INDEX_VERSION || typeof stateVersion !== 'number' || !Number.isFinite(stateVersion)) {
      return { kind: 'unreadable', message: 'Dagbokens index går inte att tolka' }
    }
    if (stateVersion > STATE_VERSION) return { kind: 'newer' }
    return { kind: 'index', stateVersion }
  }
  if (typeof version === 'number' && version > STATE_VERSION) return { kind: 'newer' }
  if (state && Object.keys(state).some((k) => !MAP_KEYS.has(k))) return { kind: 'newer' }
  return { kind: 'v1', value: parsed ?? undefined }
}

/**
 * Huvudnyckeln som skrivaren ser den i sin transaktion. En dagbok i version 1 (flera MB) tolkas
 * inte – dess version står sist (`storedVersion`); allt annat är litet (indexet) och tolkas helt.
 */
function mainKindForWrite(main: unknown): Main['kind'] {
  if (typeof main === 'string' && main.startsWith(V1_PREFIX)) {
    const v = storedVersion(main)
    return v !== undefined && v > STATE_VERSION ? 'newer' : 'v1'
  }
  return inspectMain(main).kind
}

// ---------------------------------------------------------------------------
// Månaderna: dela upp och sätta ihop
// ---------------------------------------------------------------------------

type Pairs = Record<MapKey, Array<[string, unknown]>>
const emptyPairs = (): Pairs => ({ entries: [], water: [], exercise: [], days: [] })

/** Dagboken av par (datum, värde) – `Object.fromEntries`, så att ingen nyckel tappas. */
function fromPairs(p: Pairs): DiaryData {
  return {
    entries: Object.fromEntries(p.entries) as DiaryData['entries'],
    water: Object.fromEntries(p.water) as DiaryData['water'],
    exercise: Object.fromEntries(p.exercise) as DiaryData['exercise'],
    days: Object.fromEntries(p.days) as DiaryData['days'],
  }
}

/**
 * Dela upp dagboken i månader: månad → JSON-sträng. Med `only` bara de månaderna (månader utan
 * data saknas i svaret – de ska tas bort).
 */
function splitDiary(data: DiaryData, only?: ReadonlySet<string>): Map<string, string> {
  const buckets = new Map<string, Pairs>()
  for (const k of MAPS) {
    const map = data[k] as Record<string, unknown>
    for (const date of Object.keys(map)) {
      const v = map[date]
      // Fält utan värde försvinner ändå i JSON.
      if (v === undefined) continue
      const month = diaryMonthOf(date)
      if (only && !only.has(month)) continue
      let bucket = buckets.get(month)
      if (!bucket) buckets.set(month, (bucket = emptyPairs()))
      bucket[k].push([date, v])
    }
  }
  const out = new Map<string, string>()
  for (const [month, bucket] of buckets) out.set(month, JSON.stringify(fromPairs(bucket)))
  return out
}

/**
 * En sparad månad, `'newer'` om den har fält som den här versionen inte känner till, eller null om
 * den inte går att tolka.
 */
function parseMonth(raw: unknown): DiaryData | 'newer' | null {
  if (typeof raw !== 'string') return null
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(v)) return null
  const out: Partial<Record<MapKey, unknown>> = {}
  for (const k of MAPS) {
    const map = v[k] ?? {}
    if (!isRecord(map)) return null
    out[k] = map
  }
  if (Object.keys(v).some((k) => !MAP_KEYS.has(k))) return 'newer'
  return out as DiaryData
}

/** Sätt ihop månaderna till hela dagboken. */
function assemble(months: readonly DiaryData[]): DiaryData {
  const pairs = emptyPairs()
  for (const m of months) {
    for (const k of MAPS) {
      const map = m[k] as Record<string, unknown>
      for (const date of Object.keys(map)) pairs[k].push([date, map[date]])
    }
  }
  return fromPairs(pairs)
}

/** Nycklar med ett värde (JSON tar bort de andra). */
function definedKeys(map: Record<string, unknown>): string[] {
  return Object.keys(map).filter((k) => map[k] !== undefined)
}

function sameMap(a: Record<string, unknown>, b: Record<string, unknown>, key: (v: unknown) => string): boolean {
  const keys = definedKeys(a)
  if (keys.length !== definedKeys(b).length) return false
  return keys.every((d) => Object.hasOwn(b, d) && b[d] !== undefined && key(a[d]) === key(b[d]))
}

/** Postlistans id:n i ordning (annat än en lista jämförs som JSON). */
function idsOf(v: unknown): string {
  if (!Array.isArray(v)) return JSON.stringify(v) ?? ''
  return JSON.stringify(v.map((e: unknown) => (isRecord(e) ? e.id : e)))
}
const asJson = (v: unknown): string => JSON.stringify(v) ?? ''

/** Samma innehåll: samma poster (id:n per datum), vatten, träning och dagsuppgifter per datum. */
function sameDiary(a: DiaryData, b: DiaryData): boolean {
  return (
    sameMap(a.entries, b.entries, idsOf) &&
    sameMap(a.exercise, b.exercise, idsOf) &&
    sameMap(a.water, b.water, asJson) &&
    sameMap(a.days, b.days, asJson)
  )
}

/** Tolka tillbaka månadssträngarna och jämför med dagboken i minnet (före bytet till månader). */
function verifySplit(data: DiaryData, texts: ReadonlyMap<string, string>): boolean {
  try {
    const months: DiaryData[] = []
    for (const text of texts.values()) {
      const m = parseMonth(text)
      if (!m || m === 'newer') return false
      months.push(m)
    }
    return sameDiary(data, assemble(months))
  } catch {
    return false
  }
}

function isEmptyMap(map: object | undefined): boolean {
  if (!map) return true
  for (const k in map) if (Object.hasOwn(map, k)) return false
  return true
}

const isEmptyDiary = (s: Partial<DiaryData>): boolean => MAPS.every((k) => isEmptyMap(s[k]))

/** Datan i butikens värde (fält som saknas blir tomma). */
function dataOf(state: Partial<DiaryData> | undefined): DiaryData {
  return { entries: state?.entries ?? {}, water: state?.water ?? {}, exercise: state?.exercise ?? {}, days: state?.days ?? {} }
}

/** Lägg till månaderna där `next` skiljer sig från `prev` (per referens – zustand byter bara ut det som ändras). */
function addDirtyMonths(next: DiaryData, prev: DiaryData, into: Set<string>): void {
  for (const k of MAPS) {
    const a = next[k] as Record<string, unknown>
    const b = prev[k] as Record<string, unknown>
    if (a === b) continue
    for (const date of Object.keys(a)) if (a[date] !== b[date] || !Object.hasOwn(b, date)) into.add(diaryMonthOf(date))
    for (const date of Object.keys(b)) if (!Object.hasOwn(a, date)) into.add(diaryMonthOf(date))
  }
}

let tokens = 0
/** En märkning som är ny för varje index som skrivs: tid, räknare och slump – ingen data. */
function newToken(): string {
  tokens++
  return `${Date.now().toString(36)}-${tokens.toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const indexText = (stateVersion: number) =>
  JSON.stringify({ state: { format: DIARY_INDEX_FORMAT, stateVersion, token: newToken() }, version: DIARY_INDEX_VERSION })

// ---------------------------------------------------------------------------
// Skrivarens tillstånd
// ---------------------------------------------------------------------------

/** Skrivs dagboken i månader? Byggkonstanten, eller `setDiaryMonthWriteForTests`. */
let monthWrite = DIARY_MONTHS_WRITE_BUILD
/**
 * Månaderna går inte att skriva den här sessionen – kontrollen av uppdelningen stämde inte, eller en
 * skrivning av alla månader misslyckades (t.ex. fullt lagringsutrymme vid bytet, som behöver plats
 * för månaderna och kopian). Resten av sessionen skrivs version 1, som redan fungerade.
 */
let monthsFailed = false
/**
 * Dagboken som IndexedDB kommer att innehålla när alla påbörjade skrivningar har lyckats (den
 * senast påbörjade skrivningen, eller den senast inlästa månadsdagboken). Ändrade månader räknas
 * mot den.
 */
let base: DiaryData | null = null
/**
 * Indexet (hela strängen, med sin `token`) som `lagom-diary` innehåller när alla påbörjade
 * skrivningar har lyckats. null = okänt: nästa skrivning skriver alla månader.
 *
 * En skrivning av bara de ändrade månaderna kontrollerar i sin egen transaktion att huvudnyckeln
 * fortfarande är just det indexet. Annars har någon annan skrivit sedan dess – en annan flik (med
 * version 1 eller månader), en äldre version, eller så misslyckades en tidigare skrivning – och då
 * skrivs alla månader i samma transaktion: aldrig en blandning av två flikars månader, och aldrig
 * en månad ovanpå en dagbok i version 1. Stämpeln i localStorage (`changedElsewhere`) är bara en
 * ledtråd som gör att alla månader skrivs direkt.
 */
let expectedIndex: string | null = null
/** "Indexet saknas" loggas en gång per session. */
let loggedMissingIndex = false
/** Endast för tester: ändrar månadssträngarna före kontrollen (ett fel i uppdelningen). */
let splitHook: ((month: string, text: string) => string) | null = null

/** Vad den senaste skrivningen gjorde (för testerna och mätningen). */
export interface DiaryWriteInfo {
  /**
   * 'v1' = en sträng, 'full' = alla månader (bl.a. bytet från version 1), 'months' = ändrade
   * månader, 'empty' = tom dagbok. En skrivning av ändrade månader blir 'full' (eller 'v1') om
   * huvudnyckeln i transaktionen inte var det väntade indexet.
   */
  mode: 'v1' | 'full' | 'months' | 'empty'
  /** Antal månader som skrevs. */
  written: number
  /** Antal tomma månader som togs bort (vid 'v1', 'full' och 'empty' tas hela intervallet bort). */
  deleted: number
  /** Antal tecken som skrevs (månader och index, eller hela strängen). */
  chars: number
}
let lastWrite: DiaryWriteInfo | null = null

/** Vad den senaste skrivningen till IndexedDB gjorde (null före den första). */
export function lastDiaryWrite(): DiaryWriteInfo | null {
  return lastWrite
}

/** true om dagboken skrivs i månader just nu. */
export function isDiaryMonthWriteOn(): boolean {
  return monthWrite && !monthsFailed
}

/**
 * Endast för tester och mätningen: slå på eller av månadsskrivaren (byggkonstanten gäller annars).
 * `resetStorageStateForTests()` återställer byggkonstanten.
 */
export function setDiaryMonthWriteForTests(on: boolean): void {
  monthWrite = on
}

/** Endast för tester: ändra månadssträngarna före kontrollen, för att prova reserven till version 1. */
export function setDiaryMonthSplitHookForTests(hook: ((month: string, text: string) => string) | null): void {
  splitHook = hook
}

/** Läget på disken: en inläst månadsdagbok och dess index, eller okänt (null). */
function resetWriter(read: DiaryData | null, index: string | null): void {
  base = read
  expectedIndex = read === null ? null : index
}

registerStorageReset(() => {
  monthWrite = DIARY_MONTHS_WRITE_BUILD
  monthsFailed = false
  splitHook = null
  loggedMissingIndex = false
  lastWrite = null
  resetWriter(null, null)
})

// ---------------------------------------------------------------------------
// Läsning
// ---------------------------------------------------------------------------

type Value = StorageValue<DiaryData>

/** "Går inte att tolka": ett fast meddelande loggas (aldrig det sparade värdet). */
function unreadable(message: string): ReadResult<Value> {
  logError(new Error(`${message} – sparar bara i minnet`), LOG_CONTEXT)
  return { status: 'unreadable' }
}

/** En nyckel i månadsintervallet som inte är en månad kommer från en nyare version. */
function hasUnknownMonthKey(name: string, months: DiarySnapshot['months']): boolean {
  return months.some(([key]) => {
    const month = key.slice(name.length + 1)
    return !MONTH_NAME.test(month) && month !== DIARY_OTHER_MONTH
  })
}

/** Sätt ihop månaderna, eller "nyare"/"går inte att tolka" om någon månad inte kan läsas in. */
function readMonths(months: DiarySnapshot['months'], stateVersion: number, index: string | null): ReadResult<Value> {
  const parsed: DiaryData[] = []
  let broken = false
  for (const [, raw] of months) {
    const m = parseMonth(raw)
    if (m === 'newer') return { status: 'newer' }
    if (m) parsed.push(m)
    else broken = true
  }
  if (broken) return unreadable('En månad i dagboken går inte att tolka')
  const state = assemble(parsed)
  // Utan index (null) skrivs alla månader och indexet nästa gång.
  return { status: 'ok', value: { state, version: stateVersion }, onAccept: () => resetWriter(state, index) }
}

/** Tolka det som ligger sparat (se formaten överst i filen). */
function interpret(name: string, { main, months }: DiarySnapshot): ReadResult<Value> {
  // Något i månadsintervallet som den här versionen inte känner till – även bredvid version 1, där
  // nästa skrivning annars skulle ta bort det.
  if (hasUnknownMonthKey(name, months)) return { status: 'newer' }
  const info = inspectMain(main)
  switch (info.kind) {
    case 'v1':
      // Eventuella månadsnycklar (rester) används inte och tas bort vid nästa skrivning.
      return { status: 'ok', value: info.value as Value | undefined, onAccept: () => resetWriter(null, null) }
    case 'index':
      return readMonths(months, info.stateVersion, main as string)
    case 'newer':
      return { status: 'newer' }
    case 'unreadable':
      return unreadable(info.message)
    case 'none':
      if (months.length === 0) return { status: 'ok', value: undefined, onAccept: () => resetWriter(null, null) }
      // Månader utan index: läs in dem ändå – ingen data får försvinna.
      if (!loggedMissingIndex) {
        loggedMissingIndex = true
        logError(new Error('Dagbokens index saknas – månaderna läses in ändå'), LOG_CONTEXT)
      }
      return readMonths(months, STATE_VERSION, null)
  }
}

// ---------------------------------------------------------------------------
// Skrivning
// ---------------------------------------------------------------------------

/** Strängen i version 1 – samma som `createJSONStorage` gav (fälten i butikens ordning). */
function v1Text(value: Value): string {
  const s: Partial<DiaryData> = value.state ?? {}
  return JSON.stringify({ state: { entries: s.entries, water: s.water, exercise: s.exercise, days: s.days }, version: value.version })
}

/**
 * Version 1: hela dagboken som en sträng – samma som `createJSONStorage` – och bort med alla
 * månadsnycklar i samma transaktion (tillbakarullning från månadsformatet). Den gamla kopian
 * (`lagom-diary-v1`) tas bara bort när dagboken är helt tom ("Radera all data").
 */
function writeV1(name: string, value: Value): Promise<void> {
  const text = v1Text(value)
  const empty = isEmptyDiary(value.state ?? {})
  // IndexedDB innehåller nu version 1: en senare månadsskrivning börjar med alla månader.
  resetWriter(null, null)
  lastWrite = { mode: 'v1', written: 0, deleted: 0, chars: text.length }
  return transact((os) => {
    os.put(text, name)
    os.delete(monthRange(name))
    if (empty) os.delete(v1CopyKey(name))
  })
}

/**
 * Alla månader, uppdelade och kontrollerade i minnet: varje månadssträng tolkas tillbaka och jämförs
 * med dagboken. Stämmer det inte loggas felet och null returneras – då skrivs version 1 resten av
 * sessionen.
 */
function verifiedSplit(data: DiaryData): Map<string, string> | null {
  let texts = splitDiary(data)
  if (splitHook) {
    const hook = splitHook
    texts = new Map([...texts].map(([m, t]): [string, string] => [m, hook(m, t)]))
  }
  if (verifySplit(data, texts)) return texts
  monthsFailed = true
  logError(new Error('Månadsuppdelningen av dagboken stämmer inte – sparar i det gamla formatet'), LOG_CONTEXT)
  return null
}

const fullInfo = (texts: ReadonlyMap<string, string>, index: string): DiaryWriteInfo => ({
  mode: 'full',
  written: texts.size,
  deleted: 0,
  chars: [...texts.values()].reduce((sum, t) => sum + t.length, index.length),
})

/**
 * Alla månader och indexet i transaktionen – och en dagbok i version 1 som ligger i huvudnyckeln
 * sparas kvar som `lagom-diary-v1` (bytet, eller en annan flik som har skrivit version 1).
 */
function putAllMonths(os: IDBObjectStore, name: string, main: unknown, texts: ReadonlyMap<string, string>, index: string): void {
  if (mainKindForWrite(main) === 'v1') os.put(main, v1CopyKey(name))
  os.delete(monthRange(name))
  for (const [month, text] of texts) os.put(text, monthKey(name, month))
  os.put(index, name)
}

/** Vad en skrivning gjorde i sin transaktion ('newer' = avbröts, data från en nyare version). */
type Outcome = DiaryWriteInfo['mode'] | 'newer'

/**
 * Månadsformatet (version 2). Den första skrivningen efter version 1 (eller när läget på disken är
 * okänt) skriver alla månader och kontrollerar först uppdelningen i minnet; därefter skrivs bara de
 * ändrade månaderna – om huvudnyckeln i transaktionen är det väntade indexet (`expectedIndex`),
 * annars alla. Allt i en transaktion med indexet – antingen sparas allt eller inget.
 */
function writeMonths(name: string, value: Value): Promise<void> {
  const data = dataOf(value.state)
  const index = indexText(value.version ?? STATE_VERSION)

  if (isEmptyDiary(data)) {
    return issue(name, data, index, { mode: 'empty', written: 0, deleted: 0, chars: index.length }, (os) => {
      os.delete(monthRange(name))
      os.delete(v1CopyKey(name))
      os.put(index, name)
      return 'empty'
    })
  }

  const prev = base
  // Alla månader när läget på disken är okänt (efter version 1, en tom läsning eller en misslyckad
  // skrivning) och när stämpeln säger att en annan flik har sparat.
  if (prev === null || expectedIndex === null || changedElsewhere(name)) {
    const texts = verifiedSplit(data)
    if (!texts) return writeV1(name, value)
    return issue(name, data, index, fullInfo(texts, index), (os, main) => {
      putAllMonths(os, name, main, texts, index)
      return 'full'
    })
  }

  const months = new Set<string>()
  addDirtyMonths(data, prev, months)
  const texts = splitDiary(data, months)
  const removed = [...months].filter((m) => !texts.has(m))
  const chars = [...texts.values()].reduce((sum, t) => sum + t.length, index.length)
  const info: DiaryWriteInfo = { mode: 'months', written: texts.size, deleted: removed.length, chars }
  return issue(name, data, index, info, (os, main, expected) => {
    if (expected) {
      for (const month of removed) os.delete(monthKey(name, month))
      for (const [month, text] of texts) os.put(text, monthKey(name, month))
      os.put(index, name)
      return 'months'
    }
    // Någon annan har skrivit sedan dess (se `expectedIndex`): alla månader i samma transaktion.
    const all = monthsFailed ? null : verifiedSplit(data)
    if (!all) {
      const text = v1Text(value)
      os.put(text, name)
      os.delete(monthRange(name))
      Object.assign(info, { mode: 'v1', written: 0, deleted: 0, chars: text.length })
      return 'v1'
    }
    Object.assign(info, fullInfo(all, index))
    putAllMonths(os, name, main, all, index)
    return 'full'
  })
}

/**
 * Starta en skrivning i månadsformatet. `write` körs i transaktionen när huvudnyckeln är läst
 * (`expected` = den är indexet som den här fliken väntar sig) och returnerar vad den gjorde.
 * Data från en nyare version (en annan flik med en nyare version av Lagom har sparat under tiden)
 * skrivs aldrig över: transaktionen avbryts och nyckeln skyddas (`protectNewerData`) – utom när
 * "Radera all data" har släppt skyddet.
 */
function issue(
  name: string,
  data: DiaryData,
  index: string,
  info: DiaryWriteInfo,
  write: (os: IDBObjectStore, main: unknown, expected: boolean) => Outcome,
): Promise<void> {
  const before = expectedIndex
  base = data
  expectedIndex = index
  lastWrite = info
  let outcome: Outcome | null = null
  return transactOnMain(name, (os, main) => {
    const expected = before !== null && main === before
    if (!expected && mainKindForWrite(main) === 'newer' && protectNewerData(name)) {
      outcome = 'newer'
      throw new Error('Dagboken har sparats av en nyare version av Lagom – skrivs inte över')
    }
    outcome = write(os, main, expected)
  }).then(
    () => {
      // Blev det version 1 (kontrollen i transaktionen stämde inte) ligger inget index på disken.
      if (outcome === 'v1' && expectedIndex === index) resetWriter(null, null)
    },
    (e: unknown) => {
      // Misslyckades den senast påbörjade skrivningen är läget på disken okänt: nästa skrivning
      // skriver alla månader. En senare skrivning som redan har påbörjats ser själv i sin
      // transaktion att indexet inte är det väntade.
      if (expectedIndex === index) expectedIndex = null
      // Gick det inte att skriva alla månader (t.ex. fullt lagringsutrymme) skrivs version 1 resten
      // av sessionen – annars skulle varje ändring försöka med hela bytet igen och misslyckas.
      const mode = outcome ?? info.mode
      if ((mode === 'full' || mode === 'empty') && !monthsFailed) {
        monthsFailed = true
        logError(new Error(`Dagbokens månader kunde inte sparas (${errorName(e)}) – sparar i det gamla formatet resten av sessionen`), LOG_CONTEXT)
      }
      throw e
    },
  )
}

function writeDiary(name: string, value: Value): Promise<void> {
  return isDiaryMonthWriteOn() ? writeMonths(name, value) : writeV1(name, value)
}

// ---------------------------------------------------------------------------
// Lagringen för persist-mellanvaran
// ---------------------------------------------------------------------------

/**
 * Dagbokens `PersistStorage` (i stället för `createJSONStorage`). Får hela tillståndet som objekt:
 * när dagboken inte får skrivas (oläst, nyare version, minnesläge) sparas bara en referens i minnet.
 */
export const diaryStorage: PersistStorage<DiaryData> = {
  getItem: (name) =>
    guardedRead<Value>(name, async () => {
      // Fel i IndexedDB (läsningen) ger minnesläge för allt, som för alla butiker. Ett oväntat fel
      // när datan tolkas gäller bara dagboken: den skrivs då inte över.
      const snapshot = await readDiarySnapshot(name)
      try {
        return interpret(name, snapshot)
      } catch (e) {
        // Bara felets namn – meddelandet kan citera dagbokens innehåll.
        return unreadable(`Dagboken gick inte att tolka (${errorName(e)})`)
      }
    }),
  setItem: (name, value) => guardedWrite<Value>(name, value, () => writeDiary(name, value)),
  removeItem: (name) =>
    guardedRemove(name, () => {
      resetWriter(null, null)
      return transact((os) => {
        os.delete(name)
        os.delete(monthRange(name))
        os.delete(v1CopyKey(name))
      })
    }),
}
