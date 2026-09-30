/**
 * Testhjälp: en låtsas-Stripe (fetch-ersättare) och nyckelpar för licenser.
 */
import type { Logger } from '../lib/fulfillment.ts'
import type {
  FetchLike,
  StripeCharge,
  StripeCheckoutSession,
  StripeDispute,
  StripeInvoice,
  StripePaymentIntent,
  StripePrice,
  StripeRefund,
} from '../lib/stripe.ts'

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
/** Kundens e-post i testköpen (får aldrig hamna i loggen). */
export const CUSTOMER_EMAIL = 'Anna.Svensson@exempel.se'

export function price(id: string, overrides: Partial<StripePrice> = {}): StripePrice {
  return { id, object: 'price', active: true, currency: 'sek', unit_amount: 69900, type: 'one_time', tax_behavior: 'inclusive', ...overrides }
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
    amount_total: 69900,
    metadata: { app: 'lagom', plan: 'livstid' },
    url: null,
    line_items: { data: [{ quantity: 1, price: { id: 'price_livstid', unit_amount: 69900, currency: 'sek' } }] },
    payment_intent: 'pi_1',
    customer_details: { email: CUSTOMER_EMAIL },
    invoice: null,
    ...overrides,
  }
}

export function charge(id: string, overrides: Partial<StripeCharge> = {}): StripeCharge {
  return {
    id,
    object: 'charge',
    amount: 69900,
    amount_refunded: 0,
    refunded: false,
    disputed: false,
    receipt_number: '1234-5678',
    payment_intent: 'pi_1',
    ...overrides,
  }
}

export function intent(id: string, overrides: Partial<StripePaymentIntent> = {}): StripePaymentIntent {
  return { id, object: 'payment_intent', metadata: { app: 'lagom', plan: 'livstid' }, latest_charge: null, ...overrides }
}

export interface Call {
  method: string
  url: URL
  body: URLSearchParams
  headers: Record<string, string>
}

/** En återbetalning eller tvist i låtsas-Stripe, med skapelsetid (epoch-sekunder). */
export type FakeRefund = Omit<StripeRefund, 'charge' | 'payment_intent'> & { charge: string; payment_intent: string; created: number }
export type FakeDispute = Omit<StripeDispute, 'charge' | 'payment_intent'> & { charge: string; payment_intent: string; created: number }

export interface FakeStripe {
  fetch: FetchLike
  calls: Call[]
  sessions: Map<string, StripeCheckoutSession>
  prices: Map<string, StripePrice>
  intents: Map<string, StripePaymentIntent>
  charges: Map<string, StripeCharge>
  invoices: Map<string, StripeInvoice>
  refunds: FakeRefund[]
  disputes: FakeDispute[]
  /** Nästa anrop misslyckas med det här svaret (status, body) eller ett nätverksfel. */
  failNext: Array<{ status: number; body?: unknown } | 'network'>
}

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function notFound(what: string): Response {
  return res(404, { error: { message: `No such ${what}`, type: 'invalid_request_error', code: 'resource_missing' } })
}

/** Stripes listformat med limit och starting_after (nyast först = i den ordning listan har). */
function list<T extends { id: string }>(items: T[], url: URL): Response {
  const limit = Number(url.searchParams.get('limit') ?? 10)
  const after = url.searchParams.get('starting_after')
  const start = after ? items.findIndex((i) => i.id === after) + 1 : 0
  const data = items.slice(start, start + limit)
  return res(200, { object: 'list', data, has_more: start + limit < items.length })
}

export function fakeStripe(): FakeStripe {
  const state: FakeStripe = {
    fetch: async () => res(500, {}),
    calls: [],
    sessions: new Map(),
    prices: new Map([
      ['price_ar', price('price_ar', { unit_amount: 34900 })],
      ['price_livstid', price('price_livstid')],
    ]),
    intents: new Map([['pi_1', intent('pi_1', { latest_charge: 'ch_1' })]]),
    charges: new Map([['ch_1', charge('ch_1')]]),
    invoices: new Map(),
    refunds: [],
    disputes: [],
    failNext: [],
  }
  let n = 0

  const expandIntent = (id: string | StripePaymentIntent | null | undefined, withCharge: boolean) => {
    if (typeof id !== 'string') return id
    const pi = state.intents.get(id)
    if (!pi) return id
    const lc = pi.latest_charge
    return { ...pi, metadata: { ...pi.metadata }, latest_charge: withCharge && typeof lc === 'string' ? (state.charges.get(lc) ?? lc) : lc }
  }

  const expandSession = (s: StripeCheckoutSession, expand: string[], prefix: string): StripeCheckoutSession => {
    const out: StripeCheckoutSession = { ...s }
    if (!expand.includes(`${prefix}line_items`)) delete out.line_items
    const withCharge = expand.includes(`${prefix}payment_intent.latest_charge`)
    if (expand.includes(`${prefix}payment_intent`) || withCharge) out.payment_intent = expandIntent(s.payment_intent, withCharge)
    if (expand.includes(`${prefix}invoice`) && typeof s.invoice === 'string') out.invoice = state.invoices.get(s.invoice) ?? s.invoice
    return out
  }

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
    const q = url.searchParams
    const expand = [...q.entries()].filter(([k]) => k.startsWith('expand')).map(([, v]) => v)
    const since = Number(q.get('created[gte]') ?? 0)
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
    if (method === 'GET' && path === '/checkout/sessions') {
      const email = q.get('customer_details[email]')
      const pi = q.get('payment_intent')
      const status = q.get('status')
      const found = [...state.sessions.values()].filter(
        (s) =>
          (email === null || s.customer_details?.email === email) &&
          (pi === null || s.payment_intent === pi) &&
          (status === null || s.status === status),
      )
      return list(
        found.map((s) => expandSession(s, expand, 'data.')),
        url,
      )
    }
    if (method === 'GET' && (m = /^\/checkout\/sessions\/([^/]+)$/.exec(path))) {
      const s = state.sessions.get(decodeURIComponent(m[1]))
      if (!s) return notFound('checkout.session')
      return res(200, expandSession(s, expand, ''))
    }
    if (method === 'GET' && (m = /^\/prices\/([^/]+)$/.exec(path))) {
      const p = state.prices.get(decodeURIComponent(m[1]))
      return p ? res(200, p) : notFound('price')
    }
    if (method === 'GET' && (m = /^\/payment_intents\/([^/]+)$/.exec(path))) {
      const pi = expandIntent(decodeURIComponent(m[1]), expand.includes('latest_charge'))
      return typeof pi === 'object' && pi ? res(200, pi) : notFound('payment_intent')
    }
    if (method === 'POST' && (m = /^\/payment_intents\/([^/]+)$/.exec(path))) {
      const pi = state.intents.get(decodeURIComponent(m[1]))
      if (!pi) return notFound('payment_intent')
      for (const [k, v] of body) {
        const mk = /^metadata\[(.+)\]$/.exec(k)
        if (!mk) continue
        // Som hos Stripe: ett tomt värde tar bort nyckeln.
        if (v === '') delete pi.metadata[mk[1]]
        else pi.metadata[mk[1]] = v
      }
      return res(200, pi)
    }
    if (method === 'GET' && path === '/refunds') {
      const items = state.refunds
        .filter((r) => r.created >= since)
        .map((r) => ({
          ...r,
          charge: expand.includes('data.charge') ? (state.charges.get(r.charge) ?? r.charge) : r.charge,
          payment_intent: expand.includes('data.payment_intent') ? expandIntent(r.payment_intent, false) : r.payment_intent,
        }))
      return list(items, url)
    }
    if (method === 'GET' && path === '/disputes') {
      const chargeFilter = q.get('charge')
      const items = state.disputes
        .filter((d) => d.created >= since && (chargeFilter === null || d.charge === chargeFilter))
        .map((d) => ({ ...d, payment_intent: expand.includes('data.payment_intent') ? expandIntent(d.payment_intent, false) : d.payment_intent }))
      return list(items, url)
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
