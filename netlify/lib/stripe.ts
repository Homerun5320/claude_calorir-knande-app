/**
 * Minimal klient för Stripes REST-API (utan npm-paket) och verifiering av webhook-signaturer.
 * https://docs.stripe.com/api
 */

export const STRIPE_API = 'https://api.stripe.com/v1'
/** Låst API-version så att svaren inte ändras när Stripe släpper nya versioner. */
export const STRIPE_API_VERSION = '2024-06-20'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class StripeError extends Error {
  /** HTTP-status från Stripe, 0 = nätverksfel/tidsgräns. */
  readonly status: number
  readonly type: string
  readonly code: string

  constructor(message: string, status: number, type = '', code = '') {
    super(message)
    this.name = 'StripeError'
    this.status = status
    this.type = type
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Typer (bara de fält som används)
// ---------------------------------------------------------------------------

export type Metadata = Record<string, string>

export interface StripePrice {
  id: string
  object: 'price'
  active: boolean
  currency: string
  unit_amount: number | null
  type: 'one_time' | 'recurring'
  tax_behavior?: 'inclusive' | 'exclusive' | 'unspecified' | null
}

export interface StripeLineItem {
  quantity: number | null
  amount_total?: number
  currency?: string
  price: Pick<StripePrice, 'id' | 'unit_amount' | 'currency'> | null
}

export interface StripePaymentIntent {
  id: string
  object: 'payment_intent'
  metadata: Metadata
}

export interface StripeCheckoutSession {
  id: string
  object: 'checkout.session'
  /** Epoch-sekunder. */
  created: number
  livemode: boolean
  mode: 'payment' | 'setup' | 'subscription'
  status: 'open' | 'complete' | 'expired' | null
  payment_status: 'paid' | 'unpaid' | 'no_payment_required'
  currency: string | null
  amount_total: number | null
  metadata: Metadata | null
  url: string | null
  line_items?: { data: StripeLineItem[] }
  payment_intent?: string | StripePaymentIntent | null
  consent?: { terms_of_service?: 'accepted' | null } | null
}

export interface StripeEvent {
  id: string
  object: 'event'
  type: string
  livemode: boolean
  data: { object: Record<string, unknown> }
}

// ---------------------------------------------------------------------------
// Formulärkodning (Stripe tar emot application/x-www-form-urlencoded med hakparenteser)
// ---------------------------------------------------------------------------

export type FormValue = string | number | boolean | null | undefined | FormValue[] | { [key: string]: FormValue }

/**
 * Platta ut ett objekt till Stripes format: { a: { b: 1 }, c: ['x'] } → a[b]=1&c[0]=x.
 * undefined och null hoppas över.
 */
export function encodeForm(params: Record<string, FormValue>): URLSearchParams {
  const out = new URLSearchParams()
  const walk = (key: string, value: FormValue) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${key}[${i}]`, v))
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v)
    } else {
      out.append(key, String(value))
    }
  }
  for (const [k, v] of Object.entries(params)) walk(k, v)
  return out
}

// ---------------------------------------------------------------------------
// Anrop
// ---------------------------------------------------------------------------

export interface StripeRequest {
  method: 'GET' | 'POST'
  /** T.ex. '/checkout/sessions'. */
  path: string
  params?: Record<string, FormValue>
  secretKey: string
  fetch?: FetchLike
  timeoutMs?: number
}

export async function stripeRequest<T>(req: StripeRequest): Promise<T> {
  const doFetch = req.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init))
  const form = req.params ? encodeForm(req.params).toString() : ''
  const url = `${STRIPE_API}${req.path}${req.method === 'GET' && form ? `?${form}` : ''}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${req.secretKey}`,
    'Stripe-Version': STRIPE_API_VERSION,
  }
  if (req.method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'

  let res: Response
  try {
    res = await doFetch(url, {
      method: req.method,
      headers,
      body: req.method === 'POST' ? form : undefined,
      signal: AbortSignal.timeout(req.timeoutMs ?? 8000),
    })
  } catch (e) {
    throw new StripeError(`Kunde inte nå Stripe: ${e instanceof Error ? e.message : String(e)}`, 0, 'network')
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new StripeError(`Oväntat svar från Stripe (HTTP ${res.status})`, res.status || 502, 'invalid_response')
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; type?: string; code?: string } } | null)?.error
    throw new StripeError(err?.message ?? `Stripe svarade med HTTP ${res.status}`, res.status, err?.type ?? '', err?.code ?? '')
  }
  return body as T
}

// ---------------------------------------------------------------------------
// Webhook-signaturer
// https://docs.stripe.com/webhooks#verify-manually
// ---------------------------------------------------------------------------

const enc = new TextEncoder()

/** Stripes standardtolerans för tidsstämpeln (5 minuter). */
export const WEBHOOK_TOLERANCE_SEC = 300

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength)
  out.set(a, 0)
  out.set(b, a.byteLength)
  return out
}

/** HMAC-SHA256 (hex) över "<tidsstämpel>.<rå kropp>" med webhook-hemligheten som nyckel. */
export async function computeStripeSignature(rawBody: Uint8Array | string, secret: string, timestamp: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const body = typeof rawBody === 'string' ? enc.encode(rawBody) : rawBody
  const signed = concat(enc.encode(`${timestamp}.`), body)
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, signed as BufferSource)))
}

/** Jämförelse i konstant tid (för lika långa strängar). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export type SignatureCheck = { ok: true; timestamp: number } | { ok: false; reason: 'saknas' | 'format' | 'for-gammal' | 'fel-signatur' }

/**
 * Verifiera headern Stripe-Signature ("t=…,v1=…,v1=…"). Kroppen måste vara exakt de byte som
 * Stripe skickade. Som i Stripes egna bibliotek underkänns bara för gamla tidsstämplar.
 */
export async function verifyStripeSignature(
  rawBody: Uint8Array | string,
  header: string | null,
  secret: string,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): Promise<SignatureCheck> {
  if (!header) return { ok: false, reason: 'saknas' }
  let timestamp = NaN
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k === 't') timestamp = /^\d+$/.test(v) ? Number(v) : NaN
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) signatures.push(v.toLowerCase())
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return { ok: false, reason: 'format' }

  const tolerance = opts.toleranceSec ?? WEBHOOK_TOLERANCE_SEC
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  if (tolerance > 0 && timestamp < now - tolerance) return { ok: false, reason: 'for-gammal' }

  const expected = await computeStripeSignature(rawBody, secret, timestamp)
  // Gå igenom alla signaturer (Stripe skickar flera när hemligheten byts) utan att avbryta tidigt.
  let match = false
  for (const s of signatures) match = timingSafeEqual(s, expected) || match
  return match ? { ok: true, timestamp } : { ok: false, reason: 'fel-signatur' }
}
