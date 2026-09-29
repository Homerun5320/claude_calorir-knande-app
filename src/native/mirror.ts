/**
 * Lokal spegling av all data i de inbyggda apparna – ett skydd mot att systemet rensar webbvyns
 * lagring (IndexedDB), vilket iOS kan göra när telefonen får ont om utrymme. Laddas bara via
 * `loadNative('mirror')` (src/native/index.ts) och startas med `startMirror()` från
 * `startNative()` – aldrig på webben.
 *
 * - En automatisk säkerhetskopia (samma format som `createBackup`) skrivs till appens egen mapp
 *   (`mirrorDirectory()`: Library/NoCloud på iPhone, appens filmapp på Android). Medan appen är
 *   öppen skrivs den högst en gång per `MIRROR_MIN_INTERVAL_MS` (fem minuter): den första ändringen
 *   efter en skrivning speglas 30 sekunder senare, men tidigast fem minuter efter förra skrivningen
 *   – alltså högst fem minuter efter ändringen. Direkt när appen går till bakgrunden skrivs den
 *   alltid, och en ändring som kommer efter det (t.ex. stegfältet som sparas på visibilitychange)
 *   skrivs direkt tills appen är aktiv igen. (En skrivning kostar på Android 0,45–0,7 s av
 *   huvudtråden efter tre år – stringify och bryggan, docs/LAGRING.md §5 – och ska inte göras var
 *   30:e sekund medan man loggar.)
 * - Android: en egen aktivitet ovanpå appen – streckkodsläsaren, kameran för "Ta en bild" och
 *   Health Connects behörighetsfråga – stoppar appens aktivitet och räknas som att appen går till
 *   bakgrunden. Den som loggar genom att skanna får därför en skrivning per skanning när något har
 *   ändrats (JavaScript kan inte skilja det från hemknappen). På iPhone visas skannern i appen.
 * - Filen skrivs först till en tillfällig fil som sedan byter namn, så att ett avbrott mitt i en
 *   skrivning aldrig förstör den senaste hela kopian. Vid läsning används den nyaste hela filen.
 * - Är dagboken tom vid start men speglingen finns frågar appen om den ska återställas ("Vi hittade
 *   din data från …"). Frågan går bara att besvara med knapparna, och "Börja om" bekräftas en gång
 *   till – ett tryck utanför rutan eller på bakåtknappen får aldrig kosta dagboken. Stängs appen
 *   under frågan skrivs inget över, och frågan kommer igen vid nästa start.
 * - Speglingen skrivs aldrig från ett ofullständigt läge: inte förrän alla butiker har lästs in,
 *   inte när lagringen bara finns i minnet (t.ex. en läsning som inte blivit klar), inte med data
 *   från en nyare version och aldrig med exempeldata. Då ligger den senaste riktiga kopian kvar.
 * - Blir all data tom (t.ex. "Radera all data") tas speglingen bort direkt. Anropa ändå
 *   `deleteMirror()` vid radering – den tar bort filen även när speglingen inte är igång.
 *
 * Integritet: filen ligger bara på enheten, i appens egen mapp som andra appar inte kommer åt. På
 * iPhone ligger den i Library/NoCloud, som inte följer med i iCloud- eller datorsäkerhetskopian (den
 * ska bara skydda mot att lagringen rensas på samma telefon – och inte bli en andra kopia av
 * dagboken, med vikter från Apple Hälsa, i säkerhetskopian). På Android följer den inte med i
 * Googles molnkopia (data_extraction_rules.xml).
 */
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { ArchiveRestore } from 'lucide-react'
import { confirmDialog, toast } from '../components/ui'
import { backupDateLabel, restoreBackupSafely } from '../features/settings/backupImport'
import { createBackup, parseBackup, summarizeBackup, type BackupFile, type ImportSummary } from '../lib/backup'
import { clearDemoFlag, isDemoData } from '../lib/demoFlag'
import { logError } from '../lib/errorLog'
import { plural } from '../lib/format'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { useFoodStore } from '../stores/foodStore'
import { useLicenseStore } from '../stores/licenseStore'
import { usePlanStore } from '../stores/planStore'
import { useProfileStore } from '../stores/profileStore'
import { useReminderStore } from '../stores/reminderStore'
import { hasNewerData, isMemoryOnlyStorage, READ_TIMEOUT_MS } from '../stores/storage'
import { nativePlatform } from './index'

/** Speglingen i appens datamapp. */
export const MIRROR_FILE = 'lagom-spegling.json'
/** Den tillfälliga filen under en skrivning (byter namn till `MIRROR_FILE` när den är klar). */
export const MIRROR_TMP_FILE = 'lagom-spegling.tmp'

/**
 * Speglingens mapp: på iPhone Library/NoCloud (ingår inte i iCloud- eller datorsäkerhetskopian),
 * på Android appens filmapp (som Googles molnkopia inte tar med).
 */
export function mirrorDirectory(): Directory {
  return nativePlatform() === 'ios' ? Directory.LibraryNoCloud : Directory.Data
}

/**
 * iPhone: där speglingen låg i de första testbyggena (Documents, som ingår i telefonens
 * säkerhetskopia). Läses som reserv och tas bort när en ny kopia har skrivits.
 */
const LEGACY_IOS_DIRECTORY = Directory.Data

/** Mappar där en spegling kan ligga – den nuvarande först. */
function mirrorDirectories(): Directory[] {
  return nativePlatform() === 'ios' ? [Directory.LibraryNoCloud, LEGACY_IOS_DIRECTORY] : [Directory.Data]
}
/**
 * Väntan efter den första osparade ändringen, så att ändringar i rad blir en skrivning. Gäller när
 * förra skrivningen var mer än `MIRROR_MIN_INTERVAL_MS` sedan (och första gången efter starten).
 */
export const MIRROR_DEBOUNCE_MS = 30_000
/**
 * Medan appen är öppen skrivs speglingen högst en gång per fem minuter. När appen går till
 * bakgrunden skrivs den alltid direkt (`flushMirror`).
 */
export const MIRROR_MIN_INTERVAL_MS = 5 * 60_000
/** Längsta väntan på att butikerna ska läsas in innan speglingen startar ändå. */
const HYDRATION_WAIT_MS = READ_TIMEOUT_MS + 2000

/** Butikerna i säkerhetskopian (samma som `createBackup`). */
const PERSISTED = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore, usePlanStore, useReminderStore] as const

const LOG_CONTEXT = 'native:mirror'

// ---------------------------------------------------------------------------
// Tillstånd
// ---------------------------------------------------------------------------

let started = false
/** Ändringar som ännu inte är speglade. */
let dirty = false
/** Fanns det data senast vi tittade? Blir den tom (radering) tas speglingen bort. */
let hadData = false
let timer: ReturnType<typeof setTimeout> | null = null
/**
 * När den senaste skrivningen började (`performance.now()`, som inte hoppar när klockan ställs om).
 * Även ett försök som misslyckades räknas – strängen var redan byggd. null före den första.
 */
let lastWriteAt: number | null = null
/**
 * false från appStateChange med isActive false till nästa med true. En ändring som kommer då (t.ex.
 * stegfältet som sparas på visibilitychange, efter `flushMirror`) skrivs direkt – appen kan stängas
 * när som helst och ska inte vänta på intervallet.
 */
let appActive = true
let changeQueued = false
let unsubscribers: (() => void)[] = []
let appListener: PluginListenerHandle | null = null
/** Alla filoperationer körs en i taget, i tur och ordning. */
let queue: Promise<unknown> = Promise.resolve()
/** En skrivning som väntar i kön och ännu inte har börjat. */
let queuedWrite: Promise<boolean> | null = null

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op)
  queue = run.catch(() => undefined)
  return run
}

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

/** Monoton klocka för intervallet (ms). */
const now = (): number => performance.now()

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------

const allHydrated = () => PERSISTED.every((s) => s.persist.hasHydrated())

/** Vänta tills alla butiker har lästs in. true om de hann, false efter `timeoutMs`. */
function waitForHydration(timeoutMs: number): Promise<boolean> {
  if (allHydrated()) return Promise.resolve(true)
  return new Promise((resolve) => {
    let unsubs: (() => void)[] = []
    const done = (value: boolean) => {
      clearTimeout(limit)
      unsubs.forEach((u) => u())
      unsubs = []
      resolve(value)
    }
    const limit = setTimeout(() => done(allHydrated()), timeoutMs)
    unsubs = PERSISTED.map((s) => s.persist.onFinishHydration(() => {
      if (allHydrated()) done(true)
    }))
    if (allHydrated()) done(true)
  })
}

/**
 * Får speglingen skrivas (eller jämföras med) just nu? Bara när datan i minnet är hela den sparade
 * datan och inte exempeldata.
 */
function canMirror(): boolean {
  return allHydrated() && !isMemoryOnlyStorage() && !hasNewerData() && !isDemoData()
}

const hasItems = (lists: Record<string, readonly unknown[]> | undefined) => Object.values(lists ?? {}).some((l) => Array.isArray(l) && l.length > 0)
const hasKeys = (rec: Record<string, unknown> | undefined) => Object.keys(rec ?? {}).length > 0

/**
 * Innehåller säkerhetskopian något som användaren själv har lagt in? (Inställningar, licens och
 * cachade livsmedel räknas inte – de finns även i en helt ny app.)
 */
export function backupHasData(data: BackupFile['data']): boolean {
  const { profile, diary, food, body, fasting, plan } = data
  return (
    (profile?.profile ?? null) !== null ||
    hasItems(diary?.entries) ||
    hasItems(diary?.exercise) ||
    Object.values(diary?.water ?? {}).some((ml) => typeof ml === 'number' && ml > 0) ||
    (body?.weights?.length ?? 0) > 0 ||
    (body?.measurements?.length ?? 0) > 0 ||
    hasKeys(food?.customFoods) ||
    hasKeys(food?.recipes) ||
    (food?.templates?.length ?? 0) > 0 ||
    (fasting?.active ?? null) !== null ||
    (fasting?.history?.length ?? 0) > 0 ||
    hasItems(plan?.items)
  )
}

const localHasData = () => backupHasData(createBackup().data)

/** Capacitor Filesystem: filen finns inte (OS-PLUG-FILE-0008 på båda plattformarna). */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === 'OS-PLUG-FILE-0008' || (typeof message === 'string' && /does not exist|not found|no such file/i.test(message))
}

// ---------------------------------------------------------------------------
// Läsa, skriva och ta bort
// ---------------------------------------------------------------------------

export interface MirrorInfo {
  /** Säkerhetskopian, kontrollerad med `parseBackup`. */
  backup: BackupFile
  summary: ImportSummary
  /** När speglingen skrevs, t.ex. "20 september 2026" (eller "okänt datum"). */
  dateLabel: string
}

async function readCandidate(path: string, directory: Directory = mirrorDirectory()): Promise<BackupFile | null> {
  let text: string
  try {
    const result = await Filesystem.readFile({ path, directory, encoding: Encoding.UTF8 })
    text = typeof result.data === 'string' ? result.data : await result.data.text()
  } catch (error) {
    if (!isNotFound(error)) logError(error, LOG_CONTEXT)
    return null
  }
  try {
    return parseBackup(text)
  } catch (error) {
    // En halvskriven tillfällig fil (appen stängdes mitt i en skrivning) är väntad – inget fel.
    if (path === MIRROR_FILE) logError(error, LOG_CONTEXT)
    return null
  }
}

const exportedTime = (b: BackupFile) => {
  const t = Date.parse(b.exportedAt)
  return Number.isFinite(t) ? t : 0
}

/**
 * Läs speglingen. null om den saknas, inte går att läsa eller inte innehåller någon egen data.
 * Finns både den vanliga och en tillfällig fil (en skrivning avbröts) används den nyaste hela.
 */
export function readMirror(): Promise<MirrorInfo | null> {
  return enqueue(async () => {
    const candidates: (BackupFile | null)[] = []
    for (const directory of mirrorDirectories()) candidates.push(await readCandidate(MIRROR_FILE, directory), await readCandidate(MIRROR_TMP_FILE, directory))
    const found = candidates.filter((b): b is BackupFile => b !== null && backupHasData(b.data))
    if (found.length === 0) return null
    const backup = found.reduce((newest, b) => (exportedTime(b) > exportedTime(newest) ? b : newest))
    return { backup, summary: summarizeBackup(backup), dateLabel: backupDateLabel(backup.exportedAt) }
  })
}

async function writeText(path: string, data: string): Promise<void> {
  await Filesystem.writeFile({ path, data, directory: mirrorDirectory(), encoding: Encoding.UTF8, recursive: true })
}

/** Ta bort filerna i mapparna (tysta om de inte finns). */
async function deleteIn(directories: readonly Directory[]): Promise<void> {
  for (const directory of directories) {
    for (const path of [MIRROR_FILE, MIRROR_TMP_FILE]) {
      try {
        await Filesystem.deleteFile({ path, directory })
      } catch (error) {
        if (!isNotFound(error)) logError(error, LOG_CONTEXT)
      }
    }
  }
}

/** Den gamla mappen på iPhone har städats (en gång per start räcker). */
let legacyCleared = false

/**
 * Skriv speglingen nu (i kö efter andra filoperationer). Skriver bara när datan är hel och
 * innehåller något eget (se `canMirror`). true om filen skrevs. Kastar aldrig.
 */
export function writeMirrorNow(): Promise<boolean> {
  clearTimer()
  // En skrivning som står i kön men inte har börjat tar med allt som har ändrats fram till dess.
  if (queuedWrite) return queuedWrite
  const run = enqueue(async () => {
    queuedWrite = null
    if (!canMirror()) return false
    let text: string
    try {
      const backup = createBackup()
      if (!backupHasData(backup.data)) return false
      text = JSON.stringify(backup)
    } catch (error) {
      logError(error, LOG_CONTEXT)
      return false
    }
    // Allt som har ändrats hittills är med: en väntande timer behövs inte längre, och nästa ändring
    // räknar sitt intervall från den här skrivningen. Ändringar som görs medan filen skrivs gör
    // speglingen osparad igen (se `handleChange`).
    clearTimer()
    dirty = false
    lastWriteAt = now()
    const directory = mirrorDirectory()
    try {
      await writeText(MIRROR_TMP_FILE, text)
      try {
        await Filesystem.rename({ from: MIRROR_TMP_FILE, to: MIRROR_FILE, directory, toDirectory: directory })
      } catch {
        // Namnbytet gick inte (t.ex. om målet inte fick skrivas över): skriv filen direkt. Den
        // tillfälliga filen tas bort först när den vanliga är hel.
        await writeText(MIRROR_FILE, text)
        await Filesystem.deleteFile({ path: MIRROR_TMP_FILE, directory }).catch(() => {})
      }
      // iPhone: den nya kopian är hel – ta bort en äldre kopia i den gamla mappen (Documents).
      if (!legacyCleared && directory !== LEGACY_IOS_DIRECTORY) {
        legacyCleared = true
        await deleteIn([LEGACY_IOS_DIRECTORY])
      }
      return true
    } catch (error) {
      // Ändringen ligger kvar som osparad och skrivs vid nästa ändring eller när appen går till
      // bakgrunden.
      dirty = true
      logError(error, LOG_CONTEXT)
      return false
    }
  })
  queuedWrite = run
  return run
}

/**
 * Hur länge nästa skrivning ska vänta: `MIRROR_DEBOUNCE_MS`, men tidigast `MIRROR_MIN_INTERVAL_MS`
 * efter förra skrivningen – aldrig mer än `MIRROR_MIN_INTERVAL_MS`.
 */
function nextDelay(): number {
  if (lastWriteAt === null) return MIRROR_DEBOUNCE_MS
  const untilInterval = lastWriteAt + MIRROR_MIN_INTERVAL_MS - now()
  return Math.min(MIRROR_MIN_INTERVAL_MS, Math.max(MIRROR_DEBOUNCE_MS, untilInterval))
}

/**
 * Spegla om en stund: den första osparade ändringen bestämmer tiden (se `nextDelay`), senare
 * ändringar flyttar den inte. Medan appen inte är aktiv skrivs ändringen direkt. Speglingen förblir
 * osparad tills en skrivning lyckas.
 */
export function scheduleMirror(): void {
  dirty = true
  if (!appActive) {
    // Appen är på väg till bakgrunden: skriv nu (en skrivning som står i kön tar med allt).
    void writeMirrorNow()
    return
  }
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    // Finns inget osparat (en annan skrivning har redan tagit med allt) behövs ingen skrivning.
    if (dirty) void writeMirrorNow()
  }, nextDelay())
}

/** Skriv osparade ändringar direkt (t.ex. när appen går till bakgrunden). Kastar aldrig. */
export async function flushMirror(): Promise<void> {
  // En ändring som gjordes alldeles nyss ska också med.
  processChange()
  clearTimer()
  if (dirty) await writeMirrorNow()
  else await queue
}

/**
 * Ta bort speglingen (båda filerna). Anropas vid "Radera all data" – även när speglingen inte är
 * igång. Kastar aldrig.
 */
export function deleteMirror(): Promise<void> {
  clearTimer()
  dirty = false
  hadData = false
  // Det som läggs in efter raderingen speglas som efter en ny start.
  lastWriteAt = null
  return enqueue(() => deleteIn(mirrorDirectories()))
}

// ---------------------------------------------------------------------------
// Ändringar i butikerna
// ---------------------------------------------------------------------------

function handleChange(): void {
  if (!canMirror()) return
  let has: boolean
  try {
    has = localHasData()
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return
  }
  if (!has) {
    // All egen data är borta (radering eller "Ersätt allt" med en tom kopia): speglingen ska inte
    // kunna ta tillbaka den.
    clearTimer()
    dirty = false
    if (hadData) void deleteMirror()
    return
  }
  hadData = true
  scheduleMirror()
}

/** En radering eller återställning ändrar flera butiker i rad – titta en gång när de är klara. */
function onStoreChange(): void {
  if (changeQueued) return
  changeQueued = true
  queueMicrotask(processChange)
}

/** Hantera en väntande ändring (från microtasken, eller direkt från `flushMirror`). */
function processChange(): void {
  if (!changeQueued) return
  changeQueued = false
  handleChange()
}

// ---------------------------------------------------------------------------
// Återställning vid start
// ---------------------------------------------------------------------------

function joinSv(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} och ${parts[parts.length - 1]}`
}

/** "12 dagar i dagboken och 3 vägningar" – det som finns i speglingen. */
export function mirrorContents(summary: ImportSummary): string {
  return joinSv(
    [
      summary.days > 0 ? `${plural(summary.days, 'dag', 'dagar')} i dagboken` : '',
      summary.weights > 0 ? plural(summary.weights, 'vägning', 'vägningar') : '',
      summary.recipes > 0 ? plural(summary.recipes, 'recept', 'recept') : '',
      summary.customFoods > 0 ? plural(summary.customFoods, 'eget livsmedel', 'egna livsmedel') : '',
    ].filter(Boolean),
  )
}

/**
 * Standardfrågan: "Vi hittade din data från 20 september 2026". Går bara att besvara med knapparna
 * (inte med ett tryck utanför rutan, Escape eller bakåtknappen), och "Börja om" bekräftas en gång
 * till – annars kunde ett oavsiktligt tryck göra att kopian skrivs över och dagboken försvinner.
 */
async function askRestore(info: MirrorInfo): Promise<boolean> {
  const contents = mirrorContents(info.summary)
  const restore = await confirmDialog({
    title: `Vi hittade din data från ${info.dateLabel}`,
    message: `${contents ? `Kopian på telefonen innehåller ${contents}. ` : ''}Vill du fortsätta där du slutade? Väljer du att börja om ersätts kopian när du lägger in något nytt.`,
    confirmLabel: 'Återställ',
    cancelLabel: 'Börja om',
    icon: ArchiveRestore,
    dismissible: false,
  })
  if (restore) return true
  return confirmDialog({
    title: 'Börja om utan din tidigare data?',
    message: `Kopian från ${info.dateLabel} ersätts när du lägger in något nytt och går då inte att få tillbaka. Vill du hellre återställa den?`,
    confirmLabel: 'Återställ',
    cancelLabel: 'Börja om',
    icon: ArchiveRestore,
    dismissible: false,
  })
}

/** Standard efter en återställning: lämna välkomstflödet (appen använder en hash-router). */
function leaveWelcome(): void {
  try {
    if (window.location.hash.startsWith('#/valkommen')) window.location.replace('#/')
  } catch {
    /* ingen navigering – välkomstsidan ligger kvar */
  }
}

/**
 * Återställ all data från speglingen. Är appen tom ersätts allt (appen blir en exakt kopia); har
 * något hunnit läggas in (t.ex. vikter från Apple Hälsa) slås kopian ihop med det. Rullar tillbaka
 * om något går fel. true om det gick; notisen visas här.
 */
export function restoreFromMirror(info: MirrorInfo): boolean {
  try {
    restoreBackupSafely(info.backup, localHasData() ? 'merge' : 'replace')
    const profile = useProfileStore.getState()
    profile.updateSettings({ onboardingDone: profile.profile !== null })
    clearDemoFlag()
    toast('Välkommen tillbaka! Din data är återställd.', { tone: 'success' })
    return true
  } catch (error) {
    logError(error, LOG_CONTEXT)
    toast('Återställningen misslyckades. Ingen data har ändrats.', { tone: 'error' })
    return false
  }
}

export interface StartMirrorOptions {
  /** Frågan om återställning. Standard: en bekräftelsedialog ("Vi hittade din data från …"). */
  confirmRestore?: (info: MirrorInfo) => Promise<boolean>
  /** Efter en lyckad återställning. Standard: gå från välkomstsidan till startsidan. */
  onRestored?: (info: MirrorInfo) => void
  /** Längsta väntan på att butikerna läses in (ms). */
  hydrationTimeoutMs?: number
}

/**
 * - 'started'  – speglingen är igång (ingen återställning behövdes)
 * - 'restored' – appen var tom, speglingen fanns och användaren valde att återställa
 * - 'declined' – appen var tom, speglingen fanns men användaren valde att börja om
 * - 'already-started' – `startMirror` hade redan körts
 */
export type MirrorStartResult = 'started' | 'restored' | 'declined' | 'already-started'

/**
 * Starta speglingen – en gång, från `startNative()`. Väntar tills butikerna har lästs in, erbjuder
 * återställning om appen är tom men speglingen finns, och speglar sedan varje ändring. Kastar
 * aldrig.
 */
export async function startMirror(options: StartMirrorOptions = {}): Promise<MirrorStartResult> {
  if (started) return 'already-started'
  started = true
  let result: MirrorStartResult = 'started'
  try {
    await waitForHydration(options.hydrationTimeoutMs ?? HYDRATION_WAIT_MS)
    if (canMirror() && !localHasData()) {
      const info = await readMirror()
      // Något kan ha lagts in medan filen lästes – fråga bara om appen fortfarande är tom.
      if (info && canMirror() && !localHasData()) {
        const ok = await (options.confirmRestore ?? askRestore)(info)
        if (!ok) result = 'declined'
        else if (restoreFromMirror(info)) {
          result = 'restored'
          try {
            ;(options.onRestored ?? leaveWelcome)(info)
          } catch (error) {
            logError(error, LOG_CONTEXT)
          }
        }
      }
    }
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }

  if (!started) return result // stoppad under tiden (bara i tester)
  // Lyssna först nu: inläsningen och återställningen ovan ska inte räknas som ändringar.
  try {
    hadData = canMirror() && localHasData()
  } catch {
    hadData = false
  }
  unsubscribers = PERSISTED.map((s) => s.subscribe(onStoreChange))
  // Spegla en gång efter starten (efter `MIRROR_DEBOUNCE_MS`), så att kopian alltid motsvarar det
  // som finns nu.
  if (hadData) scheduleMirror()
  try {
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
      appActive = isActive
      if (!isActive) void flushMirror()
    })
    if (started) appListener = handle
    else void handle.remove()
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
  return result
}

/** Stoppa speglingen (osparade ändringar skrivs inte). För tester. */
export function stopMirror(): void {
  started = false
  clearTimer()
  unsubscribers.forEach((u) => u())
  unsubscribers = []
  void appListener?.remove()
  appListener = null
  dirty = false
  hadData = false
  changeQueued = false
  lastWriteAt = null
  appActive = true
}

/** Endast för tester: stoppa och glöm allt, även filkön. */
export function resetMirrorForTests(): void {
  stopMirror()
  queue = Promise.resolve()
  queuedWrite = null
  legacyCleared = false
}
