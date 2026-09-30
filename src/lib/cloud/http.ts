/**
 * Lagom Moln – gemensam HTTP-hjälp för Supabase (Auth och PostgREST) via fetch, utan paket.
 *
 * - `apikey`-headern bär alltid den publika nyckeln (`sb_publishable_…`).
 * - `Authorization: Bearer <access_token>` skickas bara med en inloggad användares token – den
 *   publika nyckeln är ingen JWT och skickas aldrig som Bearer.
 * - Alla fel blir `CloudError` med en svensk text som kan visas direkt.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../../config/cloud'

export type CloudErrorCode =
  /** Ingen anslutning eller tidsgränsen passerades. */
  | 'natverk'
  /** Engångskoden stämmer inte eller har gått ut. */
  | 'fel-kod'
  /** För många försök (HTTP 429). */
  | 'for-manga'
  /** Inloggningen gäller inte längre. */
  | 'utloggad'
  /** Fel hos tjänsten eller ett oväntat svar. */
  | 'server'
  /** Kontot har inget valv ännu (P0002 från sync_push). */
  | 'saknar-valv'
  /** Molnkopian är för stor (53400). */
  | 'kvot'
  /** Databasen nekade åtgärden (42501). */
  | 'nekad'
  /** Lagom Moln är inte påslaget i den här versionen. */
  | 'avstangt'

export const CLOUD_MESSAGES: Record<CloudErrorCode, string> = {
  natverk: 'Kunde inte nå Lagom Moln. Kontrollera internetanslutningen och försök igen.',
  'fel-kod': 'Koden stämmer inte eller har gått ut. Kontrollera siffrorna eller begär en ny kod.',
  'for-manga': 'För många försök just nu. Vänta en stund och försök igen.',
  utloggad: 'Du är utloggad från Lagom Moln. Logga in igen för att fortsätta.',
  server: 'Något gick fel hos Lagom Moln. Försök igen om en stund.',
  'saknar-valv': 'Lagom Moln är inte klart för ditt konto ännu. Slutför stegen och försök igen.',
  kvot: 'Kopian är större än vad Lagom Moln rymmer. Exportera en säkerhetskopia till en fil i stället.',
  nekad: 'Lagom Moln tillät inte åtgärden. Logga in igen och försök på nytt.',
  avstangt: 'Lagom Moln finns inte i den här versionen av appen.',
}

/** Fel från Lagom Moln. `message` är svensk text för användaren; `detail` är tjänstens egen text. */
export class CloudError extends Error {
  readonly code: CloudErrorCode
  /** HTTP-status, om det fanns ett svar. */
  readonly status: number | undefined
  /** Felkoden från PostgREST/Postgres (t.ex. 'P0002') eller Supabase Auth (t.ex. 'otp_expired'). */
  readonly serverCode: string | undefined
  /** Tjänstens egen (engelska) felbeskrivning – bara för felsökning, visas inte. */
  readonly detail: string | undefined
  constructor(code: CloudErrorCode, opts: { message?: string; status?: number; serverCode?: string; detail?: string } = {}) {
    super(opts.message ?? CLOUD_MESSAGES[code])
    this.name = 'CloudError'
    this.code = code
    this.status = opts.status
    this.serverCode = opts.serverCode
    this.detail = opts.detail
  }
}

let endpoint = { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY }

/** Adress och publik nyckel som används just nu. */
export function cloudEndpoint(): { url: string; key: string } {
  return endpoint
}

/** Endast för tester: peka klienten mot en fejkad adress. */
export function setCloudEndpointForTests(url: string, key: string): void {
  endpoint = { url: url.replace(/\/+$/, ''), key }
}

/** Längsta väntan på ett svar. */
const TIMEOUT_MS = 20_000

export interface CloudRequest {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Användarens åtkomsttoken (skickas som Bearer). */
  token?: string
  headers?: Record<string, string>
}

/** Skicka ett anrop till Supabase. Kastar CloudError('natverk') om inget svar kommer. */
export async function cloudFetch(path: string, req: CloudRequest): Promise<Response> {
  const { url, key } = endpoint
  if (!url || !key) throw new CloudError('avstangt')
  const headers: Record<string, string> = { apikey: key, Accept: 'application/json', ...req.headers }
  if (req.token) headers.Authorization = `Bearer ${req.token}`
  if (req.body !== undefined) headers['Content-Type'] = 'application/json'
  const controller = typeof AbortController === 'undefined' ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : undefined
  try {
    return await fetch(`${url}${path}`, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller?.signal,
      credentials: 'omit',
      cache: 'no-store',
    })
  } catch {
    throw new CloudError('natverk')
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Läs svaret som JSON, eller null om det är tomt eller inte går att tolka. */
export async function readJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text()
    return text ? (JSON.parse(text) as unknown) : null
  } catch {
    return null
  }
}

/** Plocka ut en textsträng ur ett felsvar. */
export function field(body: unknown, ...names: string[]): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  for (const n of names) {
    const v = (body as Record<string, unknown>)[n]
    if (typeof v === 'string' && v) return v
  }
  return undefined
}
