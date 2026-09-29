/**
 * Spärrlistan för återbetalda webblicenser (klientsidan).
 *
 * Får någon pengarna tillbaka för ett webbköp ska licensnyckeln sluta gälla. Servern publicerar
 * därför en signerad lista över återkallade licenser (GET /api/license-revocations, se
 * `verifyRevocationList` i src/lib/license.ts för formatet). Appen:
 *
 * - hämtar listan när den är online – högst en gång per dygn, och alltid vid aktivering av en nyckel,
 * - verifierar signaturen med licensernas publika nycklar (en förfalskad lista godtas aldrig),
 * - sparar listan på enheten och ersätter den aldrig med en äldre (lägre `issuedAt`),
 * - använder den senast sparade listan när den är offline.
 *
 * En licens i listan ger statusen "återkallad": all data finns kvar och går att se, exportera och
 * radera – bara ny loggning kräver en licens, precis som efter provperioden. I testläge hoppas
 * kontrollen över.
 *
 * Licensen känns igen på köp-id:ts hash (`purchaseIdHash`, listans format v2), på köp-id:t i
 * klartext (äldre listor, v1) eller på nyckelns hash (`licenseKeyHash`).
 *
 * I App Store-bygget räknas licensnycklar aldrig (bara köp i appen) – där hämtas listan inte, och
 * hämtningen följer inte med i paketet (`KEY_ENTRY`, se KEY_ENTRY_BUILD i src/config/platform.ts).
 */
import { API_BASE, COMMERCE_MODE, LICENSE_PUBLIC_KEYS } from '../../config/commerce'
import { IS_STORE_BUILD, KEY_ENTRY_BUILD } from '../../config/platform'
import {
  REVOCATION_PREFIX,
  base64UrlEncode,
  decodeLicense,
  decodeRevocationList,
  licenseKeyHash,
  normalizeLicenseKey,
  purchaseIdHash,
  verifyRevocationList,
  type LicensePayload,
} from '../../lib/license'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/** Licensnycklar räknas i bygget (webben och Google Play, inte App Store) – en konstant i samma modul. */
const KEY_ENTRY: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ !== 'appstore' : KEY_ENTRY_BUILD

/** Nyckeln i localStorage där den senaste verifierade listan sparas. */
export const REVOCATION_STORAGE_KEY = 'lagom-sparrlista'

const DAY_MS = 86_400_000
/** Efter ett misslyckat försök (t.ex. serverfel) väntar vi en timme innan nästa. */
const RETRY_MS = 3_600_000
const REQUEST_TIMEOUT_MS = 15_000

interface CachedList {
  /** Den signerade listan som den kom från servern. */
  token: string
  issuedAt: number
  ids: string[]
  /** När listan senast hämtades (epoch-ms), även om den inte hade ändrats. */
  fetchedAt: number
}

function loadCache(now: number = Date.now()): CachedList | null {
  try {
    const raw = localStorage.getItem(REVOCATION_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<CachedList>
    if (typeof data.token !== 'string' || typeof data.fetchedAt !== 'number' || !Number.isFinite(data.fetchedAt)) return null
    // Listan läses ur den signerade texten – inte ur sparade fält som går att ändra var för sig.
    const list = decodeRevocationList(data.token)
    if (!list) return null
    // En hämtningstid i framtiden (ändrad klocka eller ändrad lagring) räknas som gammal, så att
    // listan hämtas igen vid nästa tillfälle i stället för aldrig.
    const fetchedAt = data.fetchedAt > now ? 0 : data.fetchedAt
    return { token: data.token.trim(), issuedAt: list.issuedAt, ids: list.ids, fetchedAt }
  } catch {
    return null
  }
}

function saveCache(c: CachedList): void {
  try {
    localStorage.setItem(REVOCATION_STORAGE_KEY, JSON.stringify(c))
  } catch {
    /* lagringen kan vara full eller blockerad – listan gäller ändå under sessionen */
  }
}

let cache: CachedList | null = loadCache()
let revoked = new Set(cache?.ids ?? [])
let version = 0
let lastAttempt = 0
let inFlight: Promise<boolean> | null = null
const listeners = new Set<() => void>()
/**
 * Nyckelns hash och köp-id:ts hash per nyckel (räknas ut i förväg, så att statusen kan avgöras
 * synkront).
 */
const keyHashes = new Map<string, string[]>()

function notify(): void {
  version++
  listeners.forEach((l) => l())
}

export function subscribeRevocations(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Ändras varje gång listan (eller en nyckelhash) uppdateras – för useSyncExternalStore. */
export function revocationVersion(): number {
  return version
}

/**
 * Spärrlistan används i skarpt läge med publik nyckel – och alltid i butiksbyggen, som verifierar
 * licensnycklar som i skarpt läge även om de byggts i testläge (se `verifyLicense`). Annars skulle
 * en återbetald webblicens fortsätta gälla i Play-appen. Testläget på webben hoppar över den.
 */
export function revocationChecksEnabled(): boolean {
  return (COMMERCE_MODE === 'live' || IS_STORE_BUILD) && LICENSE_PUBLIC_KEYS.length > 0
}

/**
 * Kontrollera signaturen på den sparade listan (vid start). En lista som har ändrats på enheten
 * kastas – då hämtas en ny nästa gång appen är online.
 */
export async function verifyStoredRevocations(): Promise<void> {
  const stored = cache
  if (!stored || !revocationChecksEnabled()) return
  const list = await verifyRevocationList(stored.token, { publicKey: LICENSE_PUBLIC_KEYS }).catch(() => null)
  if (list || cache !== stored) return
  cache = null
  revoked = new Set()
  try {
    localStorage.removeItem(REVOCATION_STORAGE_KEY)
  } catch {
    /* ignorera */
  }
  notify()
}

void verifyStoredRevocations()

/** När den sparade listan utfärdades, eller null om ingen lista finns. */
export function revocationIssuedAt(): number | null {
  return cache?.issuedAt ?? null
}

/** Räkna ut nyckelns och köp-id:ts hashar i förväg, så att `isLicenseRevoked` kan svara direkt. */
export async function prepareRevocationCheck(key: string): Promise<void> {
  const clean = normalizeLicenseKey(key)
  if (keyHashes.has(clean)) return
  try {
    const id = decodeLicense(clean)?.id
    keyHashes.set(clean, [await licenseKeyHash(clean), ...(id ? [await purchaseIdHash(id)] : [])])
    if (revoked.size > 0) notify()
  } catch {
    /* utan WebCrypto kontrolleras bara köp-id i klartext (äldre listor) */
  }
}

/** true om licensen finns i den sparade spärrlistan (aldrig för testlicenser eller i testläge). */
export function isLicenseRevoked(key: string, payload: LicensePayload, opts: { enabled?: boolean } = {}): boolean {
  if (!(opts.enabled ?? revocationChecksEnabled()) || payload.test || revoked.size === 0) return false
  if (revoked.has(payload.id)) return true
  const hashes = keyHashes.get(normalizeLicenseKey(key)) ?? []
  return hashes.some((h) => revoked.has(h))
}

export type ApplyResult = 'uppdaterad' | 'aldre' | 'ogiltig'

/**
 * Verifiera och spara en spärrlista. En lista som inte är signerad av oss, eller som är äldre än
 * den sparade, godtas inte.
 */
export async function applyRevocationToken(
  token: string,
  opts: { publicKeys?: readonly string[]; now?: number } = {},
): Promise<ApplyResult> {
  const list = await verifyRevocationList(token, { publicKey: opts.publicKeys ?? LICENSE_PUBLIC_KEYS })
  if (!list) return 'ogiltig'
  const now = opts.now ?? Date.now()
  if (cache && list.issuedAt < cache.issuedAt) {
    // En äldre lista (t.ex. från en cache på vägen) ersätter aldrig den nyare vi redan har.
    cache = { ...cache, fetchedAt: now }
    saveCache(cache)
    return 'aldre'
  }
  cache = { token: token.trim(), issuedAt: list.issuedAt, ids: list.ids, fetchedAt: now }
  revoked = new Set(list.ids)
  saveCache(cache)
  notify()
  return 'uppdaterad'
}

/** Plocka ut den signerade listan ur serverns svar (ren text eller JSON i några varianter). */
export function extractRevocationToken(body: string): string | null {
  const text = body.trim()
  if (text.startsWith(`${REVOCATION_PREFIX}.`)) return text
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const o = data as Record<string, unknown>
  for (const field of ['token', 'list', 'revocations']) {
    const v = o[field]
    if (typeof v === 'string' && v.startsWith(`${REVOCATION_PREFIX}.`)) return v
  }
  if (typeof o.sig === 'string') {
    if (typeof o.payload === 'string') return `${REVOCATION_PREFIX}.${o.payload}.${o.sig}`
    // { v, issuedAt, ids, sig }: payload = JSON { v, issuedAt, ids } base64url-kodat.
    if ((o.v === 1 || o.v === 2) && typeof o.issuedAt === 'number' && Array.isArray(o.ids)) {
      const body64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: o.v, issuedAt: o.issuedAt, ids: o.ids })))
      return `${REVOCATION_PREFIX}.${body64}.${o.sig}`
    }
  }
  return null
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/**
 * Hämta spärrlistan om det behövs: när appen är online, högst en gång per dygn (eller direkt med
 * `force`, t.ex. vid aktivering). Returnerar true om en ny lista sparades. Kastar aldrig.
 */
export function refreshRevocations(opts: { force?: boolean; now?: number } = {}): Promise<boolean> {
  if (!KEY_ENTRY || !revocationChecksEnabled() || isOffline()) return Promise.resolve(false)
  const now = opts.now ?? Date.now()
  if (!opts.force) {
    if (cache && now - cache.fetchedAt < DAY_MS) return Promise.resolve(false)
    if (now - lastAttempt < RETRY_MS) return Promise.resolve(false)
  }
  if (inFlight) return inFlight
  lastAttempt = now
  inFlight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(`${API_BASE}/api/license-revocations`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok) return false
      const token = extractRevocationToken(await res.text())
      if (!token) return false
      return (await applyRevocationToken(token, { now })) === 'uppdaterad'
    } catch {
      // Offline, tidsgräns eller serverfel: den sparade listan gäller tills vidare.
      return false
    } finally {
      clearTimeout(timer)
      inFlight = null
    }
  })()
  return inFlight
}

/** Endast för tester: glöm listan (även den sparade) och alla försök. */
export function resetRevocationsForTests(): void {
  cache = null
  revoked = new Set()
  lastAttempt = 0
  inFlight = null
  keyHashes.clear()
  try {
    localStorage.removeItem(REVOCATION_STORAGE_KEY)
  } catch {
    /* ignorera */
  }
  notify()
}

/** Endast för tester: läs in den sparade listan på nytt (som vid en omstart av appen). */
export function reloadRevocationsForTests(): void {
  cache = loadCache()
  revoked = new Set(cache?.ids ?? [])
  notify()
}
