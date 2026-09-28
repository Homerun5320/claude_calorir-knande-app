/**
 * Lagom Moln, fas 1 – en krypterad säkerhetskopia i molnet.
 *
 * Kopian är samma fil som "Exportera (JSON)" (`createBackup`), krypterad på enheten och sparad som
 * en enda post med det logiska namnet 'backup'. Den laddas upp:
 * - en gång per dygn,
 * - när appen göms (visibilitychange → hidden), högst var tionde minut,
 * - när användaren trycker på "Säkerhetskopiera nu".
 *
 * Skydd mot att en kopia i molnet skrivs över av misstag:
 * - Ingenting laddas upp innan alla butiker har lästs in från enheten, när ändringar bara sparas
 *   i minnet, när exempeldata visas eller innan en egen profil finns.
 * - Varje uppladdning anger vilken revision den bygger på (`baseRev`). Har en annan enhet laddat
 *   upp under tiden blir det en konflikt – inget skrivs över förrän användaren väljer (t.ex. en ny
 *   telefon som ännu inte har återställt kopian).
 * - Automatiska uppladdningar hoppar över oförändrat innehåll och en dagbok som plötsligt har
 *   krympt till mindre än hälften (t.ex. efter "Radera all data").
 */
import { createBackup, parseBackup, summarizeBackup, type BackupFile, type ImportSummary } from '../backup'
import { base64UrlEncode } from '../license'
import { isDemoData } from '../demoFlag'
import { useBodyStore } from '../../stores/bodyStore'
import { useCloudStore } from '../../stores/cloudStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { usePlanStore } from '../../stores/planStore'
import { useProfileStore } from '../../stores/profileStore'
import { isMemoryOnlyStorage } from '../../stores/storage'
import { CLOUD_CONSENT_VERSION } from './consent'
import { CloudError } from './http'
import { loadUnlockedVault } from './keyStore'
import { del, rpc, select } from './postgrest'
import { forgetCloudOnDevice } from './supabaseAuth'
import { decryptItem, encryptItem, itemId, type UnlockedVault } from './vaultCrypto'

/** Det logiska namnet på säkerhetskopian (servern ser bara en HMAC av det). */
export const BACKUP_ITEM = 'backup'

/** Automatisk kopia när den senaste är minst så här gammal. */
export const DAILY_MS = 24 * 60 * 60 * 1000
/** Minsta tid mellan automatiska försök när appen göms. */
export const HIDDEN_MIN_INTERVAL_MS = 10 * 60 * 1000
/** Hur ofta den dagliga kontrollen körs medan appen är öppen. */
const DAILY_CHECK_MS = 60 * 60 * 1000
/** Första dagliga kontrollen efter start (butikerna hinner läsas in). */
const FIRST_CHECK_MS = 30_000

export interface SyncPushResult {
  applied: Array<{ id: string; rev: number; seq: number }>
  conflicts: Array<{ id: string; rev: number }>
}

interface SyncItemRow {
  item_id: string
  rev: number
  seq: number
  payload: string | null
  deleted: boolean
  size: number
  updated_at: string
}

export type SkipReason =
  /** Automatisk kopia är avstängd. */
  | 'avstangt'
  /** Ingen inloggning. */
  | 'utloggad'
  /** Samtyckestexten har ändrats (eller samtycke saknas på enheten) – inget laddas upp förrän den har godkänts. */
  | 'samtycke'
  /** Valvet är inte upplåst på den här enheten. */
  | 'last'
  /** Butikerna har inte lästs in från enheten ännu. */
  | 'inte-inlast'
  /** Ändringar sparas bara i minnet (blockerad lagring, data från nyare version …). */
  | 'minneslage'
  /** Exempeldata visas – den är skrivskyddad och laddas aldrig upp. */
  | 'exempeldata'
  /** Ingen egen profil ännu. */
  | 'ingen-profil'
  /** Inget har ändrats sedan senaste uppladdningen. */
  | 'oforandrad'
  /** Dagboken har krympt kraftigt – användaren får välja själv. */
  | 'krympt'

export type UploadResult =
  | { status: 'klar'; rev: number; at: number }
  | { status: 'hoppade-over'; reason: SkipReason }
  /** En annan enhet har laddat upp en nyare kopia. */
  | { status: 'konflikt'; remoteRev: number }

/** Svensk förklaring till varför en kopia inte laddades upp. */
export const SKIP_MESSAGES: Record<SkipReason, string> = {
  avstangt: 'Automatisk kopia är avstängd.',
  utloggad: 'Du är inte inloggad i Lagom Moln.',
  samtycke: 'Samtyckestexten för Lagom Moln har ändrats. Godkänn den under Inställningar → Lagom Moln, så fortsätter kopiorna.',
  last: 'Lås upp Lagom Moln på den här enheten först.',
  'inte-inlast': 'Lagom läser fortfarande in din data. Försök igen om en stund.',
  minneslage: 'Lagom kan inte spara på enheten just nu, så ingen kopia laddas upp. Spara en säkerhetskopia till en fil i stället.',
  exempeldata: 'Exempeldata laddas aldrig upp. Skapa din egen profil först.',
  'ingen-profil': 'Skapa din profil först – sedan finns det något att säkerhetskopiera.',
  oforandrad: 'Kopian i molnet är redan uppdaterad.',
  krympt: 'Dagboken är mycket mindre än i förra kopian, så den laddades inte upp automatiskt. Tryck på Säkerhetskopiera nu om det stämmer.',
}

/**
 * Butikerna som ingår i säkerhetskopian (`createBackup`). Håll listan i takt med `createBackup` och
 * `STORES` i src/stores/hydration.ts – får kopian en ny butik (t.ex. veckoplaneringen) ska den in
 * här också, annars kan en halvt inläst butik laddas upp tom.
 */
const PERSISTED_STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore, usePlanStore]

/** true när alla butiker med användarens data har lästs in från enheten (samma regel som `useHydrated`). */
export function storesHydrated(): boolean {
  return PERSISTED_STORES.every((s) => s.persist.hasHydrated())
}

/** Varför ingen kopia får laddas upp från enheten just nu, eller null om det går bra. */
export function localUploadBlocker(): SkipReason | null {
  if (!storesHydrated()) return 'inte-inlast'
  if (isMemoryOnlyStorage()) return 'minneslage'
  if (isDemoData()) return 'exempeldata'
  if (useProfileStore.getState().profile === null) return 'ingen-profil'
  return null
}

/** Ska en automatisk kopia göras nu? */
export function autoUploadDue(
  reason: 'daglig' | 'dold',
  now: number,
  s: { lastUploadAt: number | null; lastAttemptAt: number | null },
): boolean {
  const sinceAttempt = s.lastAttemptAt === null ? Number.POSITIVE_INFINITY : now - s.lastAttemptAt
  if (sinceAttempt < HIDDEN_MIN_INTERVAL_MS) return false
  if (reason === 'dold') return true
  return s.lastUploadAt === null || now - s.lastUploadAt >= DAILY_MS
}

function countEntries(b: BackupFile): number {
  return Object.values(b.data.diary.entries ?? {}).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0)
}

async function contentHash(b: BackupFile): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(b.data)))
  return base64UrlEncode(new Uint8Array(digest))
}

interface Unlocked {
  userId: string
  unlocked: UnlockedVault
  id: string
}

async function requireUnlocked(): Promise<Unlocked | SkipReason> {
  const session = useCloudStore.getState().session
  if (!session) return 'utloggad'
  const unlocked = await loadUnlockedVault(session.userId)
  if (!unlocked) return 'last'
  return { userId: session.userId, unlocked, id: await itemId(unlocked, BACKUP_ITEM) }
}

async function fetchItem(id: string, withPayload: boolean): Promise<SyncItemRow | null> {
  const cols = withPayload ? 'item_id,rev,seq,payload,deleted,size,updated_at' : 'item_id,rev,seq,deleted,size,updated_at'
  const rows = await select<SyncItemRow>('sync_items', `select=${cols}&item_id=eq.${encodeURIComponent(id)}&limit=1`)
  return rows[0] ?? null
}

let running: Promise<unknown> = Promise.resolve()

/** Kör uppladdningar i tur och ordning (automatisk och manuell samtidigt ger annars konflikt med sig själv). */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = running.then(fn, fn)
  running = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * Ladda upp en krypterad säkerhetskopia.
 * - `auto`: automatisk kopia – hoppar över oförändrat innehåll, kraftigt krympt dagbok och avstängd automatik.
 * - `force`: skriv över kopian i molnet även om en annan enhet har laddat upp en nyare (användarens val).
 *
 * Kastar CloudError vid nätverks- och serverfel.
 */
export function uploadBackup(opts: { auto?: boolean; force?: boolean } = {}): Promise<UploadResult> {
  return serial(() => doUpload(opts))
}

async function doUpload({ auto = false, force = false }: { auto?: boolean; force?: boolean }): Promise<UploadResult> {
  const store = useCloudStore.getState()
  if (auto && !store.enabled) return { status: 'hoppade-over', reason: 'avstangt' }
  const blocker = localUploadBlocker()
  if (blocker) return { status: 'hoppade-over', reason: blocker }
  // Hälsouppgifter laddas bara upp med ett samtycke till den gällande texten (art. 9.2 a GDPR).
  if (store.session && store.consentVersion !== CLOUD_CONSENT_VERSION) return { status: 'hoppade-over', reason: 'samtycke' }
  const ctx = await requireUnlocked()
  if (typeof ctx === 'string') return { status: 'hoppade-over', reason: ctx }

  const backup = createBackup()
  const hash = await contentHash(backup)
  const entries = countEntries(backup)
  if (auto) {
    if (hash === store.lastUploadHash) return { status: 'hoppade-over', reason: 'oforandrad' }
    const before = store.lastUploadEntries
    if (before !== null && before >= 10 && entries < before / 2) return { status: 'hoppade-over', reason: 'krympt' }
  }

  let baseRev = store.backupRev
  if (force) baseRev = (await fetchItem(ctx.id, false))?.rev ?? 0
  const payload = await encryptItem(ctx.unlocked, ctx.userId, ctx.id, backup)
  const result = await rpc<SyncPushResult>('sync_push', { p_items: [{ id: ctx.id, baseRev, payload }] })

  const applied = result?.applied?.find((a) => a.id === ctx.id)
  if (applied) {
    const now = Date.now()
    useCloudStore.getState().patch({
      backupRev: applied.rev,
      lastSeq: Math.max(useCloudStore.getState().lastSeq, applied.seq),
      lastUploadAt: now,
      lastUploadHash: hash,
      lastUploadEntries: entries,
      lastError: null,
    })
    return { status: 'klar', rev: applied.rev, at: now }
  }
  const conflict = result?.conflicts?.find((c) => c.id === ctx.id)
  if (conflict) {
    // Samma innehåll som i molnet (t.ex. en annan flik på samma enhet hann först): ingen konflikt.
    const same = await remoteHasSameContent(ctx, hash)
    if (same !== null) {
      useCloudStore.getState().patch({ backupRev: same.rev, lastUploadAt: Date.now(), lastUploadHash: hash, lastUploadEntries: entries, lastError: null })
      return { status: 'klar', rev: same.rev, at: Date.now() }
    }
    return { status: 'konflikt', remoteRev: conflict.rev }
  }
  throw new CloudError('server', { detail: 'sync_push gav inget svar för posten' })
}

async function remoteHasSameContent(ctx: Unlocked, hash: string): Promise<{ rev: number } | null> {
  try {
    const row = await fetchItem(ctx.id, true)
    if (!row || row.deleted || !row.payload) return null
    const remote = await decryptItem<BackupFile>(ctx.unlocked, ctx.userId, ctx.id, row.payload)
    return (await contentHash(remote)) === hash ? { rev: row.rev } : null
  } catch {
    return null
  }
}

/** Kopian i molnet, redo att förhandsvisas och återställas. */
export interface CloudCopy {
  backup: BackupFile
  summary: ImportSummary
  rev: number
  /** När kopian laddades upp (ISO-tid från servern). */
  updatedAt: string
  /** Storlek i byte (krypterad). */
  size: number
}

/**
 * Hämta och dekryptera kopian i molnet. null om det inte finns någon. Kastar CloudError vid
 * nätverksfel, VaultError om kopian inte går att dekryptera och BackupError om innehållet inte
 * går att använda.
 */
export async function downloadBackup(): Promise<CloudCopy | null> {
  const ctx = await requireUnlocked()
  if (typeof ctx === 'string') throw new CloudError('utloggad')
  const row = await fetchItem(ctx.id, true)
  if (!row || row.deleted || !row.payload) return null
  const value = await decryptItem<unknown>(ctx.unlocked, ctx.userId, ctx.id, row.payload)
  const backup = parseBackup(JSON.stringify(value))
  return { backup, summary: summarizeBackup(backup), rev: row.rev, updatedAt: row.updated_at, size: row.size }
}

/** Uppgifter om kopian i molnet (utan innehållet), eller null om det inte finns någon. */
export async function fetchRemoteInfo(): Promise<{ rev: number; updatedAt: string; size: number } | null> {
  const ctx = await requireUnlocked()
  if (typeof ctx === 'string') return null
  const row = await fetchItem(ctx.id, false)
  if (!row || row.deleted) return null
  return { rev: row.rev, updatedAt: row.updated_at, size: row.size }
}

/** Efter en återställning: den här enheten bygger nu vidare på molnkopians revision. */
export function markRestored(copy: Pick<CloudCopy, 'rev'>): void {
  useCloudStore.getState().patch({ backupRev: copy.rev, lastUploadHash: null, lastError: null })
}

/**
 * Radera kopian i molnet (valvet och kontot finns kvar) och stäng av automatisk kopia. Körs i tur
 * och ordning med uppladdningarna – en uppladdning som redan har startat får annars skapa kopian
 * igen efter raderingen.
 */
export function deleteCloudData(): Promise<void> {
  return serial(async () => {
    const session = useCloudStore.getState().session
    if (!session) throw new CloudError('utloggad')
    await del('sync_items', `user_id=eq.${encodeURIComponent(session.userId)}`)
    useCloudStore.getState().patch({ enabled: false, backupRev: 0, lastUploadAt: null, lastUploadHash: null, lastUploadEntries: null, lastError: null })
  })
}

/**
 * Radera kontot och all krypterad data i molnet (delete_my_account). Därefter glöms session,
 * nyckel och molnläge på enheten direkt – åtkomsttoken skulle annars gälla upp till en timme.
 * Väntar in en pågående uppladdning, så att den inte skriver till det glömda molnläget efteråt.
 */
export function deleteAccount(): Promise<void> {
  return serial(async () => {
    await rpc<null>('delete_my_account')
    await forgetCloudOnDevice()
  })
}

/**
 * Starta automatiska kopior (en gång per dygn och när appen göms). Anropas en gång från appen när
 * Lagom Moln är påslaget. Returnerar en funktion som stänger av dem.
 */
export function startCloudAutoBackup(): () => void {
  const tick = (reason: 'daglig' | 'dold') => {
    const s = useCloudStore.getState()
    if (!s.enabled || !s.session) return
    const now = Date.now()
    if (!autoUploadDue(reason, now, s)) return
    s.patch({ lastAttemptAt: now })
    void uploadBackup({ auto: true }).then(
      (r) => {
        if (r.status === 'hoppade-over' && (r.reason === 'krympt' || r.reason === 'samtycke')) useCloudStore.getState().patch({ lastError: SKIP_MESSAGES[r.reason] })
        else if (r.status === 'konflikt') useCloudStore.getState().patch({ lastError: 'En annan enhet har laddat upp en nyare kopia. Välj vilken som ska gälla under Inställningar → Lagom Moln.' })
      },
      (e: unknown) => {
        useCloudStore.getState().patch({ lastError: e instanceof Error ? e.message : 'Den automatiska kopian misslyckades.' })
      },
    )
  }
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') tick('dold')
  }
  document.addEventListener('visibilitychange', onVisibility)
  const first = window.setTimeout(() => tick('daglig'), FIRST_CHECK_MS)
  const interval = window.setInterval(() => tick('daglig'), DAILY_CHECK_MS)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.clearTimeout(first)
    window.clearInterval(interval)
  }
}
