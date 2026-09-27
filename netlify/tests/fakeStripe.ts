/**
 * Testhjälp: en låtsas-Stripe (fetch-ersättare) och nyckelpar för licenser.
 */
import type { Logger } from '../lib/fulfillment.ts'
import type { FetchLike, StripeCheckoutSession, StripePaymentIntent, StripePrice } from '../lib/stripe.ts'

export async function licenseKeyPair(): Promise<{ priv: string; pub: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const b64 = (buf: ArrayBuffer) => Buffer.from(new Uint8Array(buf)).toString('base64')
  return {
    priv: b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey)),
    pub: b64(await crypto.subtle.exportKey('spki', kp.publicKey)),
  }
}

export const SECRET = 'sk_test_51Lagom0000000000'
export const CREATED = Math.floor(Date.UTC(2026, 8, 27, 10) / 1000)
export const NOW = Date.UTC(2026, 8, 27, 10, 5)

export function price(id: string, overrides: Partial<StripePrice> = {}): StripePrice {
  return { id, object: 'price', active: true, currency: 'sek', unit_amount: 59900, type: 'one_time', tax_behavior: 'inclusive', ...overrides }
}

export function paidSession(overrides: Partial<StripeCheckoutSession> = {}): StripeCheckoutSession {
  return {
    id: 'cs_test_a1B2c3D4e5F6g7H8i9J0',
    object: 'checkout.session',
    created: CREATED,
    livemode: false,
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    currency: 'sek',
    amount_total: 59900,
    metadata: { app: 'lagom', plan: 'livstid' },
    url: null,
    line_items: { data: [{ quantity: 1, price: { id: 'price_livstid', unit_amount: 59900, currency: 'sek' } }] },
    payment_intent: 'pi_1',
    ...overrides,
  }
}

export interface Call {
  method: string
  url: URL
  body: URLSearchParams
  headers: Record<string, string>
}

export interface FakeStripe {
  fetch: FetchLike
  calls: Call[]
  sessions: Map<string, StripeCheckoutSession>
  prices: Map<string, StripePrice>
  intents: Map<string, StripePaymentIntent>
  /** Nästa anrop misslyckas med det här svaret (status, body) eller ett nätverksfel. */
  failNext: Array<{ status: number; body?: unknown } | 'network'>
}

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export function fakeStripe(): FakeStripe {
  const state: FakeStripe = {
    fetch: async () => res(500, {}),
    calls: [],
    sessions: new Map(),
    prices: new Map([
      ['price_ar', price('price_ar', { unit_amount: 29900 })],
      ['price_livstid', price('price_livstid')],
    ]),
    intents: new Map([['pi_1', { id: 'pi_1', object: 'payment_intent', metadata: {} }]]),
    failNext: [],
  }
  let n = 0
  state.fetch = async (input, init) => {
    const url = new URL(input)
    const method = init?.method ?? 'GET'
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '')
    const headers = (init?.headers ?? {}) as Record<string, string>
    state.calls.push({ method, url, body, headers })
    const fail = state.failNext.shift()
    if (fail === 'network') throw new TypeError('fetch failed')
    if (fail) return res(fail.status, fail.body ?? { error: { message: 'fel', type: 'api_error' } })
    if (headers.Authorization !== `Bearer ${SECRET}`) return res(401, { error: { message: 'Invalid API Key', type: 'invalid_request_error' } })

    const path = url.pathname.replace(/^\/v1/, '')
    let m: RegExpExecArray | null
    if (method === 'POST' && path === '/checkout/sessions') {
      const id = `cs_test_Fake${String(++n).padStart(12, '0')}`
      const s: StripeCheckoutSession = {
        ...paidSession({ id, status: 'open', payment_status: 'unpaid', payment_intent: null }),
        metadata: { app: body.get('metadata[app]') ?? '', plan: body.get('metadata[plan]') ?? '' },
        url: `https://checkout.stripe.com/c/pay/${id}`,
      }
      state.sessions.set(id, s)
      return res(200, s)
    }
    if (method === 'GET' && (m = /^\/checkout\/sessions\/([^/]+)$/.exec(path))) {
      const s = state.sessions.get(decodeURIComponent(m[1]))
      if (!s) return res(404, { error: { message: 'No such checkout.session', type: 'invalid_request_error', code: 'resource_missing' } })
      const expand = [...url.searchParams.entries()].filter(([k]) => k.startsWith('expand')).map(([, v]) => v)
      const out: StripeCheckoutSession = { ...s }
      if (!expand.includes('line_items')) delete out.line_items
      if (expand.includes('payment_intent') && typeof s.payment_intent === 'string') {
        out.payment_intent = state.intents.get(s.payment_intent) ?? s.payment_intent
      }
      return res(200, out)
    }
    if (method === 'GET' && (m = /^\/prices\/([^/]+)$/.exec(path))) {
      const p = state.prices.get(decodeURIComponent(m[1]))
      return p ? res(200, p) : res(404, { error: { message: 'No such price', type: 'invalid_request_error', code: 'resource_missing' } })
    }
    if (method === 'POST' && (m = /^\/payment_intents\/([^/]+)$/.exec(path))) {
      const pi = state.intents.get(decodeURIComponent(m[1]))
      if (!pi) return res(404, { error: { message: 'No such payment_intent', type: 'invalid_request_error' } })
      for (const [k, v] of body) {
        const mk = /^metadata\[(.+)\]$/.exec(k)
        if (mk) pi.metadata[mk[1]] = v
      }
      return res(200, pi)
    }
    return res(404, { error: { message: `Unrecognized request URL (${method} ${path})`, type: 'invalid_request_error' } })
  }
  return state
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  data?: Record<string, unknown>
}

/** Logger som sparar allt i en lista i stället för att skriva ut. */
export function recordingLogger(): Logger & { entries: LogEntry[]; text: () => string } {
  const entries: LogEntry[] = []
  const add = (level: LogEntry['level']) => (message: string, data?: Record<string, unknown>) => {
    entries.push({ level, message, data })
  }
  return { entries, info: add('info'), warn: add('warn'), error: add('error'), text: () => JSON.stringify(entries) }
}
