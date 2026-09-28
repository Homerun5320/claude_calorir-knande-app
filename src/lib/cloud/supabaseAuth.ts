/**
 * Lagom Moln – inloggning med engångskod via e-post (Supabase Auth), direkt med fetch.
 *
 * - `requestCode(email)` skickar en kod (POST /auth/v1/otp). Kontot skapas vid första inloggningen.
 * - `verifyCode(email, code)` byter koden mot en session (POST /auth/v1/verify).
 * - `getAccessToken()` ger en giltig åtkomsttoken och förnyar den 60 s före utgång
 *   (POST /auth/v1/token?grant_type=refresh_token). Förnyelsen serialiseras med
 *   `navigator.locks` ('lagom-auth') mellan flikar, med ett löfte i minnet som reserv – så att
 *   samtidiga anrop bara förnyar en gång (Supabase spärrar hela sessionen om samma
 *   förnyelsetoken återanvänds för sent).
 * - `signOut()` loggar ut på servern (POST /auth/v1/logout) och glömmer allt lokalt.
 *
 * Sessionen sparas i `useCloudStore` (IndexedDB, 'lagom-cloud').
 */
import { get } from 'idb-keyval'
import { CLOUD_STORE_KEY, useCloudStore, type Session } from '../../stores/cloudStore'
import { CloudError, cloudFetch, field, readJson } from './http'
import { clearUnlockedVault } from './keyStore'

export type { Session }

/** Förnya åtkomsttoken så här långt före utgång. */
const REFRESH_MARGIN_MS = 60_000

/** Enkel kontroll av e-postadressen innan den skickas. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

/** Normalisera engångskoden: bara siffror (tål mellanslag och bindestreck). */
export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, '')
}

function authError(res: Response, body: unknown, context: 'kod' | 'verifiera' | 'forny' | 'annat'): CloudError {
  const serverCode = field(body, 'error_code', 'error')
  const detail = field(body, 'msg', 'message', 'error_description')
  const opts = { status: res.status, serverCode, detail }
  if (res.status === 429 || serverCode === 'over_email_send_rate_limit' || serverCode === 'over_request_rate_limit') {
    return new CloudError('for-manga', opts)
  }
  if (res.status >= 500) return new CloudError('server', opts)
  if (context === 'verifiera' && (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422)) {
    return new CloudError('fel-kod', opts)
  }
  if (context === 'forny' || res.status === 401 || res.status === 403) return new CloudError('utloggad', opts)
  if (context === 'kod' && serverCode === 'email_address_invalid') {
    return new CloudError('server', { ...opts, message: 'E-postadressen godtogs inte. Kontrollera den och försök igen.' })
  }
  return new CloudError('server', opts)
}

/** Tolka ett tokensvar från Supabase Auth till en session. */
function toSession(body: unknown, fallbackEmail: string, now: number): Session {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const user = (typeof b.user === 'object' && b.user !== null ? b.user : {}) as Record<string, unknown>
  const expiresIn = typeof b.expires_in === 'number' && b.expires_in > 0 ? b.expires_in : 3600
  if (typeof b.access_token !== 'string' || typeof b.refresh_token !== 'string' || typeof user.id !== 'string') {
    throw new CloudError('server', { detail: 'Ofullständigt tokensvar' })
  }
  return {
    accessToken: b.access_token,
    refreshToken: b.refresh_token,
    // Räknas från enhetens klocka (expires_in), så att en felställd klocka inte ger fel utgång.
    expiresAt: now + expiresIn * 1000,
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : fallbackEmail,
  }
}

/** Skicka en engångskod till e-postadressen. Kontot skapas om det inte finns. */
export async function requestCode(email: string): Promise<void> {
  const res = await cloudFetch('/auth/v1/otp', { method: 'POST', body: { email: email.trim(), create_user: true } })
  if (!res.ok) throw authError(res, await readJson(res), 'kod')
}

/** Logga in med koden från e-posten. Sessionen sparas på enheten. */
export async function verifyCode(email: string, code: string): Promise<Session> {
  const res = await cloudFetch('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: email.trim(), token: normalizeCode(code) } })
  const body = await readJson(res)
  if (!res.ok) throw authError(res, body, 'verifiera')
  const session = toSession(body, email.trim(), Date.now())
  useCloudStore.getState().setSession(session)
  return session
}

/** Nuvarande session på enheten, eller null. */
export function currentSession(): Session | null {
  return useCloudStore.getState().session
}

// ---------------------------------------------------------------------------
// Förnyelse
// ---------------------------------------------------------------------------

let memoryChain: Promise<unknown> = Promise.resolve()

function lockManager(): LockManager | undefined {
  try {
    return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined
  } catch {
    return undefined
  }
}

/** Kör `fn` ensam: mellan flikar med navigator.locks, annars i tur och ordning i den här fliken. */
function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = lockManager()
  if (locks?.request) return locks.request('lagom-auth', fn) as Promise<T>
  const run = memoryChain.then(fn, fn)
  memoryChain = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

/**
 * En annan flik kan just ha förnyat sessionen. Läs den sparade sessionen och använd den om den
 * är nyare än den här flikens (bara när flikarna faktiskt delar lås).
 */
async function adoptNewerPersistedSession(cur: Session): Promise<Session> {
  if (!lockManager()) return cur
  try {
    const raw: unknown = await get(CLOUD_STORE_KEY)
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as { state?: { session?: Session | null } }) : null
    const stored = parsed?.state?.session
    if (stored && stored.userId === cur.userId && typeof stored.expiresAt === 'number' && stored.expiresAt > cur.expiresAt) {
      useCloudStore.getState().setSession(stored)
      return stored
    }
  } catch {
    /* ingen sparad session att läsa */
  }
  return cur
}

async function refresh(cur: Session): Promise<Session> {
  const res = await cloudFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cur.refreshToken } })
  const body = await readJson(res)
  if (!res.ok) {
    const err = authError(res, body, 'forny')
    // En förnyelsetoken som inte längre gäller betyder utloggad. Nätverks- och serverfel gör det inte.
    if (err.code === 'utloggad') useCloudStore.getState().setSession(null)
    throw err
  }
  const next = toSession(body, cur.email, Date.now())
  useCloudStore.getState().setSession(next)
  return next
}

/**
 * En giltig åtkomsttoken. Förnyar 60 s före utgång (eller direkt med `forceRefresh`, t.ex. efter
 * ett 401-svar). Kastar CloudError('utloggad') om ingen giltig inloggning finns.
 */
export async function getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  const first = currentSession()
  if (!first) throw new CloudError('utloggad')
  const fresh = (s: Session) => s.expiresAt - REFRESH_MARGIN_MS > Date.now()
  if (!opts.forceRefresh && fresh(first)) return first.accessToken
  const staleToken = first.accessToken
  return withAuthLock(async () => {
    let cur = currentSession()
    if (!cur || cur.userId !== first.userId) throw new CloudError('utloggad')
    cur = await adoptNewerPersistedSession(cur)
    // Någon annan hann förnya medan vi väntade på låset.
    if (fresh(cur) && (!opts.forceRefresh || cur.accessToken !== staleToken)) return cur.accessToken
    return (await refresh(cur)).accessToken
  })
}

/** Användaren bakom sessionen (GET /auth/v1/user). */
export async function getUser(): Promise<{ id: string; email: string }> {
  const token = await getAccessToken()
  const res = await cloudFetch('/auth/v1/user', { method: 'GET', token })
  const body = await readJson(res)
  if (!res.ok) {
    const err = authError(res, body, 'annat')
    if (err.code === 'utloggad') useCloudStore.getState().setSession(null)
    throw err
  }
  const id = field(body, 'id')
  if (!id) throw new CloudError('server', { detail: 'Svar utan användar-id' })
  return { id, email: field(body, 'email') ?? '' }
}

/** Glöm inloggning, nyckel och molnläge på den här enheten (ingen kontakt med servern). */
export async function forgetCloudOnDevice(): Promise<void> {
  useCloudStore.getState().reset()
  await clearUnlockedVault()
}

/**
 * Logga ut: säg till servern att sessionen ska upphöra (bara på den här enheten) och glöm allt
 * lokalt – även om servern inte går att nå.
 */
export async function signOut(): Promise<void> {
  const s = currentSession()
  if (s) {
    try {
      await cloudFetch('/auth/v1/logout?scope=local', { method: 'POST', token: s.accessToken })
    } catch {
      /* utloggningen lokalt räcker – åtkomsttoken slutar ändå gälla inom en timme */
    }
  }
  await forgetCloudOnDevice()
}
