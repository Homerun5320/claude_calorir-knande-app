/**
 * HTTP-hjälp för serverfunktionerna: JSON-svar med svenska felmeddelanden, CORS, begränsad
 * kroppsstorlek och en enkel begränsning av antalet anrop per IP-adress.
 */

export interface ApiError {
  /** Maskinläsbar kod, t.ex. 'ej-betald'. */
  code: string
  /** Meddelande på svenska som appen kan visa som det är. */
  error: string
}

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  // Licensnycklar och betalningslänkar får aldrig cachas.
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } })
}

export function errorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  const body: ApiError = { code, error: message }
  return json(status, body, headers)
}

// ---------------------------------------------------------------------------
// Ursprung och CORS
// ---------------------------------------------------------------------------

export interface OriginCheck {
  /** false = anropet kommer från en webbsida som inte får använda funktionen. */
  allowed: boolean
  /** Headers som ska med i svaret (tomt när anropet saknar Origin). */
  headers: Record<string, string>
  /**
   * Adressen dit kunden skickas tillbaka efter betalningen: APP_URL (eller en adress i
   * ALLOWED_ORIGINS) om anropet kom därifrån, annars funktionens eget ursprung (t.ex. en
   * förhandsversion på Netlify), annars APP_URL. För den inbyggda appen alltid APP_URL – aldrig
   * capacitor:// eller https://localhost.
   */
  returnBase: string
  /** true när anropet kommer från den inbyggda appen (ALLOWED_NATIVE_ORIGINS). */
  native: boolean
}

/**
 * Kontrollera Origin-headern. Samma ursprung som funktionen godtas alltid, liksom APP_URL,
 * ALLOWED_ORIGINS och – med exakt strängjämförelse – den inbyggda appens ursprung
 * (`nativeOrigins`, t.ex. capacitor://localhost). Anrop utan Origin (curl, server till server)
 * godtas men får inga CORS-headers. `methods` är de metoder som funktionen tar emot.
 */
export function checkOrigin(req: Request, appUrls: string[], nativeOrigins: readonly string[] = [], methods = 'POST, OPTIONS'): OriginCheck {
  const origin = req.headers.get('origin')
  const selfOrigin = safeOrigin(req.url)
  const fallback = appUrls[0] || selfOrigin || ''
  if (origin === null) return { allowed: true, headers: {}, returnBase: fallback, native: false }

  const corsHeaders = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  // Den inbyggda appen: bara exakt de konfigurerade strängarna, ingen tolkning som adress.
  if (nativeOrigins.some((n) => n === origin)) {
    return { allowed: true, headers: corsHeaders, returnBase: appUrls[0] ?? '', native: true }
  }

  const match = appUrls.find((u) => safeOrigin(u) === origin)
  const allowed = Boolean(match) || (selfOrigin !== '' && origin === selfOrigin)
  if (!allowed) return { allowed: false, headers: { Vary: 'Origin' }, returnBase: fallback, native: false }
  return { allowed: true, headers: corsHeaders, returnBase: match ?? origin, native: false }
}

function safeOrigin(url: string): string {
  try {
    const o = new URL(url).origin
    return o === 'null' ? '' : o
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Kropp
// ---------------------------------------------------------------------------

export type BodyResult = { ok: true; bytes: Uint8Array } | { ok: false; response: Response }

/** Läs kroppen men avbryt så fort den blir större än `maxBytes` (skydd mot jättestora anrop). */
export async function readBody(req: Request, maxBytes: number, headers: Record<string, string> = {}): Promise<BodyResult> {
  const tooLarge = (): BodyResult => ({
    ok: false,
    response: errorResponse(413, 'for-stor', 'Förfrågan är för stor.', headers),
  })
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge()
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel().catch(() => {})
        return tooLarge()
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, response: errorResponse(400, 'ogiltig-begaran', 'Förfrågan kunde inte läsas.', headers) }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    bytes.set(c, offset)
    offset += c.byteLength
  }
  return { ok: true, bytes }
}

export type JsonResult = { ok: true; value: Record<string, unknown> } | { ok: false; response: Response }

/** Läs ett JSON-objekt (högst `maxBytes`). */
export async function readJsonObject(req: Request, maxBytes: number, headers: Record<string, string> = {}): Promise<JsonResult> {
  const body = await readBody(req, maxBytes, headers)
  if (!body.ok) return body
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(body.bytes))
    if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value: value as Record<string, unknown> }
  } catch {
    // faller igenom
  }
  return { ok: false, response: errorResponse(400, 'ogiltig-begaran', 'Förfrågan kunde inte tolkas.', headers) }
}

// ---------------------------------------------------------------------------
// Begränsning av antal anrop
// ---------------------------------------------------------------------------

/**
 * Enkel begränsning per IP-adress och fönster. Den lever i funktionsinstansens minne och är därför
 * ett extra skydd mot enkel överbelastning, inte en exakt gräns (Netlify kan köra flera instanser).
 * Den hårda gränsen är Netlifys rate limiting, som räknas i Netlifys nätverk innan funktionen
 * anropas (`config.rateLimit` i netlify/functions/*.mts, se docs/BETALNING.md).
 */
export class RateLimiter {
  readonly limit: number
  readonly windowMs: number
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  /** true om anropet får göras. */
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k)
      if (this.hits.size > 5000) this.hits.clear()
    }
    const cur = this.hits.get(key)
    if (!cur || cur.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    cur.count++
    return cur.count <= this.limit
  }
}

/** Klientens IP-adress enligt Netlify (eller okänd). */
export function clientIp(req: Request, contextIp?: string): string {
  return (
    contextIp ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'okänd'
  )
}
