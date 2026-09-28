/**
 * Lokal spegling av all data i de inbyggda apparna – ett skydd mot att systemet rensar webbvyns
 * lagring (IndexedDB), vilket iOS kan göra när telefonen får ont om utrymme. Laddas bara via
 * `loadNative('mirror')` (src/native/index.ts) och startas med `startMirror()` från
 * `startNative()` – aldrig på webben.
 *
 * - En automatisk säkerhetskopia (samma format som `createBackup`) skrivs till appens egen
 *   datamapp (`Directory.Data`: Documents på iPhone, appens filmapp på Android) högst 30 sekunder
 *   efter en ändring och direkt när appen går till bakgrunden.
 * - Filen skrivs först till en tillfällig fil som sedan byter namn, så att ett avbrott mitt i en
 *   skrivning aldrig förstör den senaste hela kopian. Vid läsning används den nyaste hela filen.
 * - Är dagboken tom vid start men speglingen finns frågar appen om den ska återställas ("Vi hittade
 *   din data från …").
 * - Speglingen skrivs aldrig från ett ofullständigt läge: inte förrän alla butiker har lästs in,
 *   inte när lagringen bara finns i minnet (t.ex. en läsning som inte blivit klar), inte med data
 *   från en nyare version och aldrig med exempeldata. Då ligger den senaste riktiga kopian kvar.
 * - Blir all data tom (t.ex. "Radera all data") tas speglingen bort direkt. Anropa ändå
 *   `deleteMirror()` vid radering – den tar bort filen även när speglingen inte är igång.
 *
 * Integritet: filen ligger bara på enheten, i appens egen mapp som andra appar inte kommer åt. På
 * Android följer den inte med i Googles molnkopia (data_extraction_rules.xml), på iPhone ingår den
 * i telefonens egen säkerhetskopia precis som webbvyns data.
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
import { hasNewerData, isMemoryOnlyStorage, READ_TIMEOUT_MS } from '../stores/storage'

/** Speglingen i appens datamapp. */
export const MIRROR_FILE = 'lagom-spegling.json'
/** Den tillfälliga filen under en skrivning (byter namn till `MIRROR_FILE` när den är klar). */
export const MIRROR_TMP_FILE = 'lagom-spegling.tmp'
export const MIRROR_DIRECTORY = Directory.Data
/** Speglingen skrivs högst så här lång tid efter den första osparade ändringen. */
export const MIRROR_DEBOUNCE_MS = 30_000
/** Längsta väntan på att butikerna ska läsas in innan speglingen startar ändå. */
const HYDRATION_WAIT_MS = READ_TIMEOUT_MS + 2000

/** Butikerna i säkerhetskopian (samma som `createBackup`). */
const PERSISTED = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore, usePlanStore] as const

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

async function readCandidate(path: string): Promise<BackupFile | null> {
  let text: string
  try {
    const result = await Filesystem.readFile({ path, directory: MIRROR_DIRECTORY, encoding: Encoding.UTF8 })
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
    const found = [await readCandidate(MIRROR_FILE), await readCandidate(MIRROR_TMP_FILE)].filter(
      (b): b is BackupFile => b !== null && backupHasData(b.data),
    )
    if (found.length === 0) return null
    const backup = found.reduce((newest, b) => (exportedTime(b) > exportedTime(newest) ? b : newest))
    return { backup, summary: summarizeBackup(backup), dateLabel: backupDateLabel(backup.exportedAt) }
  })
}

async function writeText(path: string, data: string): Promise<void> {
  await Filesystem.writeFile({ path, data, directory: MIRROR_DIRECTORY, encoding: Encoding.UTF8, recursive: true })
}

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
    // Ändringar som görs medan filen skrivs gör speglingen osparad igen (se `handleChange`).
    dirty = false
    try {
      await writeText(MIRROR_TMP_FILE, text)
      try {
        await Filesystem.rename({ from: MIRROR_TMP_FILE, to: MIRROR_FILE, directory: MIRROR_DIRECTORY, toDirectory: MIRROR_DIRECTORY })
      } catch {
        // Namnbytet gick inte (t.ex. om målet inte fick skrivas över): skriv filen direkt. Den
        // tillfälliga filen tas bort först när den vanliga är hel.
        await writeText(MIRROR_FILE, text)
        await Filesystem.deleteFile({ path: MIRROR_TMP_FILE, directory: MIRROR_DIRECTORY }).catch(() => {})
      }
      return true
    } catch (error) {
      dirty = true
      logError(error, LOG_CONTEXT)
      return false
    }
  })
  queuedWrite = run
  return run
}

/** Spegla om en stund (högst `MIRROR_DEBOUNCE_MS` efter den första osparade ändringen). */
export function scheduleMirror(delayMs: number = MIRROR_DEBOUNCE_MS): void {
  dirty = true
  if (timer !== null) return
  timer = setTimeout(() => {
    timer = null
    void writeMirrorNow()
  }, delayMs)
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
  return enqueue(async () => {
    for (const path of [MIRROR_FILE, MIRROR_TMP_FILE]) {
      try {
        await Filesystem.deleteFile({ path, directory: MIRROR_DIRECTORY })
      } catch (error) {
        if (!isNotFound(error)) logError(error, LOG_CONTEXT)
      }
    }
  })
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

/** Standardfrågan: "Vi hittade din data från 20 september 2026". */
function askRestore(info: MirrorInfo): Promise<boolean> {
  const contents = mirrorContents(info.summary)
  return confirmDialog({
    title: `Vi hittade din data från ${info.dateLabel}`,
    message: `${contents ? `Kopian på telefonen innehåller ${contents}. ` : ''}Vill du fortsätta där du slutade? Väljer du att börja om ersätts kopian när du lägger in något nytt.`,
    confirmLabel: 'Återställ',
    cancelLabel: 'Börja om',
    icon: ArchiveRestore,
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
  // Spegla en gång efter starten, så att kopian alltid motsvarar det som finns nu.
  if (hadData) scheduleMirror()
  try {
    const handle = await App.addListener('appStateChange', ({ isActive }) => {
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
}

/** Endast för tester: stoppa och glöm allt, även filkön. */
export function resetMirrorForTests(): void {
  stopMirror()
  queue = Promise.resolve()
  queuedWrite = null
}
