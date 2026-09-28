/**
 * Säkerhetskopiering, export och import av all användardata (GDPR: dataportabilitet och radering).
 * All data ligger lokalt i IndexedDB – det här är användarens enda "moln".
 */
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { migrateFoodRefs, useFoodStore } from '../stores/foodStore'
import { useProfileStore, DEFAULT_SETTINGS } from '../stores/profileStore'
import { useLicenseStore } from '../stores/licenseStore'
import { usePlanStore } from '../stores/planStore'
import { releaseNewerData, STORE_KEYS } from '../stores/storage'
import { COMMERCE_MODE } from '../config/commerce'
import { allowsLicenseKeyEntry, isInApp, isIosDevice, isNativeApp } from '../config/platform'
import { isAbort } from '../features/diary/share'
import { decodeLicense } from './license'
import type { DiaryEntry, ISODate, MealConfig } from '../types'
import { entryNutrients } from './diary'
import { NUTRIENTS, type NutrientKey } from './nutrients'
import { todayISO } from './dates'
import { mealName } from './meals'
import { isRawUnit, unitLabel } from './units'
import { describeRepairs, sanitizeBackupData, skippedCount, type BackupRepairs } from './backupValidation'
import { MAX_EXTRAS_PER_WEEK, MAX_ITEMS_PER_DAY, type PlanData, type WeekShopping } from './planning'

export const BACKUP_FORMAT = 'lagom-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  app: string
  data: {
    profile: Pick<ReturnType<typeof useProfileStore.getState>, 'profile' | 'settings'>
    diary: Pick<ReturnType<typeof useDiaryStore.getState>, 'entries' | 'water' | 'exercise' | 'days'>
    food: Pick<ReturnType<typeof useFoodStore.getState>, 'customFoods' | 'recipes' | 'cachedFoods' | 'favorites' | 'usage' | 'templates'>
    body: Pick<ReturnType<typeof useBodyStore.getState>, 'weights' | 'measurements'>
    fasting: Pick<ReturnType<typeof useFastingStore.getState>, 'active' | 'history'>
    /**
     * Licens och provperiod (saknas i äldre säkerhetskopior). Vid återställning gäller alltid den
     * tidigaste provstarten och en giltig licens på enheten behålls.
     */
    license?: BackupLicense
    /** Veckoplaneringen och inköpslistan (saknas i äldre säkerhetskopior). */
    plan?: PlanData
  }
  /**
   * Vad som rättades eller hoppades över när filen lästes in (sätts av `parseBackup`, sparas
   * inte i filen).
   */
  repairs?: BackupRepairs
}

export interface BackupLicense {
  /**
   * Licensnyckel från ett webbköp. Alltid null i kopior från App Store-bygget – där gäller bara
   * köp i appen, som återställs via Apple-ID ("Återställ köp").
   */
  licenseKey: string | null
  /** När provperioden började (epoch-ms). */
  trialStartedAt: number | null
}

/**
 * Hela appens data som en säkerhetskopia. I App Store-bygget (och den inbyggda iPhone-appen) tas
 * ingen licensnyckel med – där kan nycklar inte användas.
 */
export function createBackup(): BackupFile {
  const p = useProfileStore.getState()
  const d = useDiaryStore.getState()
  const f = useFoodStore.getState()
  const b = useBodyStore.getState()
  const fa = useFastingStore.getState()
  const li = useLicenseStore.getState()
  const pl = usePlanStore.getState()
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Lagom',
    data: {
      profile: { profile: p.profile, settings: p.settings },
      diary: { entries: d.entries, water: d.water, exercise: d.exercise, days: d.days },
      food: {
        customFoods: f.customFoods,
        recipes: f.recipes,
        cachedFoods: f.cachedFoods,
        favorites: f.favorites,
        usage: f.usage,
        templates: f.templates,
      },
      body: { weights: b.weights, measurements: b.measurements },
      fasting: { active: fa.active, history: fa.history },
      license: { licenseKey: allowsLicenseKeyEntry() ? li.licenseKey : null, trialStartedAt: li.trialStartedAt },
      plan: { items: pl.items, shopping: pl.shopping },
    },
  }
}

export class BackupError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Validera och tolka en säkerhetskopia. Kastar BackupError med svensk text om filen inte går att
 * använda alls (inte JSON, inte från Lagom, från en nyare version eller utan sina avsnitt).
 *
 * Innehållet kontrolleras post för post (`sanitizeBackupData`): skadade poster hoppas över och
 * småfel rättas, så att en återställning – även "Ersätt allt" – aldrig kan få appen att krascha.
 * Vad som hoppades över står i `repairs` och i `summarizeBackup`.
 */
export function parseBackup(text: string, now: number = Date.now()): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('Filen är inte en giltig JSON-fil.')
  }
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError('Filen är ingen säkerhetskopia från Lagom.')
  if (typeof raw.version !== 'number' || !Number.isFinite(raw.version) || raw.version > BACKUP_VERSION) {
    throw new BackupError('Säkerhetskopian är från en nyare version av Lagom. Uppdatera appen och försök igen.')
  }
  const data = raw.data
  if (!isObj(data) || !isObj(data.diary) || !isObj(data.profile) || !isObj(data.food) || !isObj(data.body)) {
    throw new BackupError('Säkerhetskopian är ofullständig eller skadad.')
  }
  const { data: clean, repairs } = sanitizeBackupData(data, now)
  return {
    format: BACKUP_FORMAT,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    app: typeof raw.app === 'string' ? raw.app : 'Lagom',
    data: clean,
    repairs,
  }
}

export interface ImportSummary {
  days: number
  entries: number
  weights: number
  customFoods: number
  recipes: number
  /** Antal skadade poster som hoppas över vid importen (0 för en hel säkerhetskopia). */
  skipped: number
  /** Antal poster med småfel som rättades, t.ex. ett saknat id eller en okänd måltid. */
  repaired: number
  /** Vad som hoppas över, t.ex. ["2 dagboksposter", "1 vägning"]. Tom för en hel säkerhetskopia. */
  skippedDetails: string[]
  /** Antal kroppsmått (visas bara vid import från andra appar). */
  measurements?: number
}

export function summarizeBackup(b: BackupFile): ImportSummary {
  const entries = Object.values(b.data.diary.entries ?? {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0)
  return {
    days: Object.keys(b.data.diary.entries ?? {}).length,
    entries,
    weights: Array.isArray(b.data.body.weights) ? b.data.body.weights.length : 0,
    customFoods: Object.keys(b.data.food.customFoods ?? {}).length,
    recipes: Object.keys(b.data.food.recipes ?? {}).length,
    skipped: b.repairs ? skippedCount(b.repairs) : 0,
    repaired: b.repairs?.repaired ?? 0,
    skippedDetails: b.repairs ? describeRepairs(b.repairs) : [],
  }
}

/**
 * Återställ från säkerhetskopia.
 * - 'replace': ersätter all befintlig data.
 * - 'merge': slår ihop – poster med samma id skrivs inte dubbelt; importerad profil används bara om ingen finns.
 */
export function restoreBackup(b: BackupFile, mode: 'replace' | 'merge'): void {
  const { profile, diary, food, body, fasting, plan } = b.data
  // Licens och provperiod: samma regler för båda lägena (förläng aldrig en provperiod).
  restoreLicense(b.data.license)
  if (mode === 'replace') {
    useProfileStore.setState({ profile: profile.profile ?? null, settings: { ...DEFAULT_SETTINGS, ...profile.settings } })
    useDiaryStore.setState({ entries: diary.entries ?? {}, water: diary.water ?? {}, exercise: diary.exercise ?? {}, days: diary.days ?? {} })
    // Gamla livsmedels-id:n i en äldre säkerhetskopia skrivs om till ersättarna (alias).
    useFoodStore.setState(
      migrateFoodRefs({
        customFoods: food.customFoods ?? {},
        recipes: food.recipes ?? {},
        cachedFoods: food.cachedFoods ?? {},
        favorites: food.favorites ?? [],
        usage: food.usage ?? {},
        templates: food.templates ?? [],
      }),
    )
    useBodyStore.setState({ weights: body.weights ?? [], measurements: body.measurements ?? [] })
    useFastingStore.setState({ active: fasting?.active ?? null, history: fasting?.history ?? [] })
    usePlanStore.setState({ items: plan?.items ?? {}, shopping: plan?.shopping ?? {} })
    return
  }

  // Sammanfoga
  const p = useProfileStore.getState()
  if (!p.profile && profile.profile) {
    useProfileStore.setState({ profile: profile.profile, settings: { ...DEFAULT_SETTINGS, ...profile.settings, onboardingDone: true } })
  }

  const d = useDiaryStore.getState()
  const mergeById = <T extends { id: string }>(a: T[] = [], bb: T[] = []) => {
    const ids = new Set(a.map((x) => x.id))
    return [...a, ...bb.filter((x) => !ids.has(x.id))]
  }
  const entries: Record<ISODate, DiaryEntry[]> = { ...d.entries }
  for (const [date, list] of Object.entries(diary.entries ?? {})) entries[date] = mergeById(entries[date], list)
  const exercise = { ...d.exercise }
  for (const [date, list] of Object.entries(diary.exercise ?? {})) exercise[date] = mergeById(exercise[date], list)
  const water = { ...d.water }
  for (const [date, ml] of Object.entries(diary.water ?? {})) water[date] = Math.max(water[date] ?? 0, ml)
  const days = { ...diary.days, ...d.days }
  useDiaryStore.setState({ entries, exercise, water, days })

  const f = useFoodStore.getState()
  useFoodStore.setState(
    migrateFoodRefs({
      customFoods: { ...food.customFoods, ...f.customFoods },
      recipes: { ...food.recipes, ...f.recipes },
      cachedFoods: { ...food.cachedFoods, ...f.cachedFoods },
      favorites: [...new Set([...f.favorites, ...(food.favorites ?? [])])],
      usage: { ...food.usage, ...f.usage },
      templates: mergeById(f.templates, food.templates),
    }),
  )

  const bo = useBodyStore.getState()
  const weightDates = new Set(bo.weights.map((w) => w.date))
  useBodyStore.setState({
    weights: [...bo.weights, ...(body.weights ?? []).filter((w) => !weightDates.has(w.date))].sort((x, y) => x.date.localeCompare(y.date)),
    measurements: mergeById(bo.measurements, body.measurements).sort((x, y) => x.date.localeCompare(y.date)),
  })

  const fa = useFastingStore.getState()
  useFastingStore.setState({ history: mergeById(fa.history, fasting?.history) })

  // Veckoplaneringen: rader per datum som dagboken; inköpslistans bockar slås ihop och egna rader
  // läggs till (inom samma gränser som i appen).
  if (plan) {
    const pl = usePlanStore.getState()
    const items = { ...pl.items }
    for (const [date, list] of Object.entries(plan.items)) items[date] = mergeById(items[date], list).slice(0, MAX_ITEMS_PER_DAY)
    const shopping: Record<ISODate, WeekShopping> = { ...pl.shopping }
    for (const [week, incoming] of Object.entries(plan.shopping)) {
      const local = shopping[week]
      shopping[week] = {
        checked: [...new Set([...(local?.checked ?? []), ...incoming.checked])],
        extras: mergeById(local?.extras, incoming.extras).slice(0, MAX_EXTRAS_PER_WEEK),
      }
    }
    usePlanStore.setState({ items, shopping })
  }
}

/**
 * Hur bra en licensnyckel ser ut utan att verifiera signaturen (det görs när appen använder den):
 * -1 = saknas eller oläsbar, 0 = utgången eller testlicens i skarpt läge, annars utgångstiden
 * (Infinity för livstid).
 */
export function licenseRank(key: string | null | undefined, now: number = Date.now()): number {
  if (!key) return -1
  const payload = decodeLicense(key)
  if (!payload) return -1
  if (payload.test && COMMERCE_MODE !== 'test') return 0
  if (payload.exp === undefined) return Number.POSITIVE_INFINITY
  return payload.exp * 1000 > now ? payload.exp * 1000 : 0
}

/**
 * Slå ihop licens och provperiod från en säkerhetskopia med enhetens:
 * - Den TIDIGASTE provstarten gäller – en återställning kan aldrig förlänga provperioden.
 * - En giltig licens på enheten behålls. Kopians licens används bara om enheten saknar en giltig.
 * - Där licensnycklar inte kan användas (`acceptKey` false: App Store-bygget och den inbyggda
 *   iPhone-appen) läses ingen nyckel in från kopian – enhetens egen behålls. Bara provstarten slås
 *   ihop. Den som köpt på webben får i stället en erbjudandekod via supporten.
 */
export function mergeLicense(
  local: BackupLicense,
  incoming: BackupLicense | undefined,
  now: number = Date.now(),
  acceptKey: boolean = allowsLicenseKeyEntry(),
): BackupLicense {
  if (!incoming) return local
  const starts = [local.trialStartedAt, incoming.trialStartedAt].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  // En provstart i framtiden (fel klocka eller ändrad fil) räknas som nu.
  const trialStartedAt = starts.length > 0 ? Math.min(now, ...starts) : null
  if (!acceptKey) return { licenseKey: local.licenseKey, trialStartedAt }
  const localRank = licenseRank(local.licenseKey, now)
  const incomingRank = licenseRank(incoming.licenseKey, now)
  const licenseKey = localRank > 0 || incomingRank <= localRank ? local.licenseKey : incoming.licenseKey
  return { licenseKey, trialStartedAt }
}

function restoreLicense(incoming: BackupLicense | undefined): void {
  if (!incoming) return
  const li = useLicenseStore.getState()
  // I App Store-bygget ignoreras kopians licensnyckel (se `mergeLicense`).
  const merged = mergeLicense({ licenseKey: li.licenseKey, trialStartedAt: li.trialStartedAt }, incoming, Date.now(), allowsLicenseKeyEntry())
  const patch: Partial<ReturnType<typeof useLicenseStore.getState>> = {}
  if (merged.trialStartedAt !== li.trialStartedAt) patch.trialStartedAt = merged.trialStartedAt
  if (merged.licenseKey !== li.licenseKey) {
    patch.licenseKey = merged.licenseKey
    patch.activatedAt = merged.licenseKey ? Date.now() : null
  }
  if (Object.keys(patch).length > 0) useLicenseStore.setState(patch)
}

/**
 * Radera ALL data på enheten.
 *
 * Provperiodens start finns alltid kvar – annars skulle radering starta om provperioden.
 * Licensen behålls också, om inte användaren uttryckligen väljer att ta bort den
 * (`removeLicense`).
 */
export function wipeAllData(opts: { removeLicense?: boolean } = {}): void {
  // Sparad data från en nyare version av Lagom skyddas annars mot att skrivas över – men här har
  // användaren bett om att allt ska raderas. Licensbutiken förblir skyddad: den här versionen har
  // inte kunnat läsa provperiodens start, och en överskrivning skulle starta om provperioden.
  releaseNewerData([STORE_KEYS.license])
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useBodyStore.getState().clearBody()
  useFastingStore.getState().clearFasting()
  usePlanStore.getState().clearPlan()
  useProfileStore.getState().resetProfile()
  if (opts.removeLicense) useLicenseStore.getState().clearLicense()
}

const CSV_NUTRIENTS: NutrientKey[] = ['kcal', 'protein', 'carbs', 'sugars', 'fiber', 'fat', 'satFat', 'salt', 'alcohol']

function csvCell(v: string | number | undefined): string {
  if (v === undefined) return ''
  if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',')
  // Skydd mot formelinjektion: text som börjar med = + - @ (eller tabb/CR) tolkas annars som en
  // formel av Excel/Numbers. Namn från Open Food Facts och snabbregistreringar är fritext.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Dagboken som CSV (semikolonseparerad, decimalkomma – öppnas direkt i svenska Excel/Numbers).
 * Måltiderna skrivs med användarens egna namn (standard: inställningarna i profilen).
 */
export function diaryToCsv(entries: Record<ISODate, DiaryEntry[]>, meals: MealConfig[] = useProfileStore.getState().settings.meals): string {
  const header = ['Datum', 'Måltid', 'Tid', 'Livsmedel', 'Varumärke', 'Mängd', 'Enhet', 'Gram', ...CSV_NUTRIENTS.map((k) => `${NUTRIENTS[k].name} (${NUTRIENTS[k].unit})`)]
  const rows = [header.join(';')]
  const dates = Object.keys(entries).sort()
  for (const date of dates) {
    for (const e of entries[date]) {
      const n = entryNutrients(e)
      const meal = mealName(meals, e.meal)
      const base =
        e.kind === 'food'
          ? [date, meal, e.time ?? '', e.food.name, e.food.brand ?? '', e.amount, isRawUnit(e.unit) ? unitLabel(e.food, e.unit) : e.unit.replace('portion:', ''), e.grams]
          : [date, meal, e.time ?? '', e.name, '', 1, 'snabbregistrering', undefined]
      rows.push([...base, ...CSV_NUTRIENTS.map((k) => n[k])].map((v) => csvCell(v as string | number | undefined)).join(';'))
    }
  }
  return '\ufeff' + rows.join('\r\n')
}

/** Starta nedladdning av en fil i webbläsaren (`<a download>`). */
export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function backupFilename(): string {
  return `lagom-sakerhetskopia-${todayISO()}.json`
}

/**
 * Hur det gick att spara en fil:
 * - 'saved'     – filen laddades ned
 * - 'shared'    – delningsdialogen användes (t.ex. "Spara i Filer" på iPhone)
 * - 'cancelled' – användaren stängde delningsdialogen utan att välja något
 * - 'failed'    – filen gick inte att skapa eller spara
 */
export type SaveOutcome = 'saved' | 'shared' | 'cancelled' | 'failed'

/** Toasten efter en delning – "Spara i Filer" heter så bara på iPhone och iPad. */
export function sharedFileToast(): string {
  return isIosDevice() ? 'Delad – välj Spara i Filer för att behålla den' : 'Delad – spara filen där du hittar den igen, t.ex. i Filer eller Google Drive'
}

/** Pekskärm som huvudsaklig pekare (telefon, surfplatta) – där fungerar nedladdning sämre än delning. */
function hasCoarsePointer(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

/** Kan filen delas med delningsdialogen? (canShare kan kasta för okända filtyper.) */
function canShareFile(file: File): boolean {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
    return navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Spara en fil så att den faktiskt hamnar hos användaren:
 * - I appen och på telefoner (pekskärm) används delningsdialogen när den klarar filer – där
 *   laddas en nedladdad fil annars lätt ned "ingenstans". Avbryter användaren dialogen blir
 *   utfallet 'cancelled'; misslyckas delningen av annat skäl laddas filen ned i stället.
 * - Annars laddas filen ned som vanligt (`<a download>`).
 * - I den inbyggda appen (Capacitor) gör en nedladdning med `<a download>` ingenting i webbvyn.
 *   Där blir utfallet 'failed' om delningen inte går – aldrig 'saved' – så att påminnelsen om
 *   säkerhetskopia inte tystnar för en fil som aldrig sparades. (När Capacitor installeras kan
 *   Filesystem- och Share-tilläggen användas här.)
 *
 * OBS: delningen måste starta i samma klick som användaren gjorde. Anropa därför `saveFile`
 * direkt från klickhanteraren, utan `await` före anropet.
 */
export async function saveFile(filename: string, content: string, mime = 'application/json'): Promise<SaveOutcome> {
  try {
    const file = new File([content], filename, { type: mime })
    if ((isInApp() || hasCoarsePointer()) && canShareFile(file)) {
      try {
        await navigator.share({ files: [file], title: filename })
        return 'shared'
      } catch (err) {
        if (isAbort(err)) return 'cancelled'
        // Annat fel (t.ex. NotAllowedError): ladda ned i stället nedan.
      }
    }
    if (isNativeApp()) return 'failed'
    downloadFile(filename, content, mime)
    return 'saved'
  } catch {
    return 'failed'
  }
}

/**
 * Spara en säkerhetskopia av all data (nedladdning eller delningsdialogen, se `saveFile`).
 * Ersätter `downloadBackup` i nya anrop – den ger ett riktigt utfall, så att "senaste
 * säkerhetskopian" bara uppdateras när filen verkligen har sparats eller delats.
 */
export async function saveBackup(): Promise<SaveOutcome> {
  let content: string
  try {
    content = JSON.stringify(createBackup(), null, 1)
  } catch {
    return 'failed'
  }
  return saveFile(backupFilename(), content)
}

/**
 * Ladda ned en säkerhetskopia av all data direkt (t.ex. från felsidan eller varningen om att
 * data inte sparas). Returnerar false om det inte gick.
 */
export function downloadBackup(): boolean {
  try {
    downloadFile(backupFilename(), JSON.stringify(createBackup(), null, 1))
    return true
  } catch {
    return false
  }
}

/** Be webbläsaren att inte rensa lagringen automatiskt (skyddar mot dataförlust). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}

/**
 * Vid start: be tyst om beständig lagring om den inte redan är beviljad (skydd mot automatisk
 * rensning, bl.a. Safaris rensning av webbplatser man inte besökt på sju dagar). Frågar inte i
 * Firefox, som visar en dialog för det – där sköts det från Inställningar → Data i stället.
 * Returnerar true om lagringen är beständig.
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persisted !== 'function') return false
    if (await navigator.storage.persisted()) return true
    if (/\bFirefox\//.test(navigator.userAgent ?? '')) return false
    return await requestPersistentStorage()
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.()
    return e ? { usage: e.usage ?? 0, quota: e.quota ?? 0 } : null
  } catch {
    return null
  }
}
