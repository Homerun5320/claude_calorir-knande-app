// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { verifyLicense } from '../../src/lib/license.ts'
import { LICENSE_METADATA_KEY, validatePaidSession } from '../lib/fulfillment.ts'
import { checkoutParams, handleCreateCheckout, handleStripeWebhook, handleVerifyPurchase, type HandlerDeps } from '../lib/handlers.ts'
import { RateLimiter } from '../lib/http.ts'
import { issueLicense, licensePayloadFor } from '../lib/licensing.ts'
import { SERVER_PLANS } from '../lib/plans.ts'
import { computeStripeSignature } from '../lib/stripe.ts'
import { CREATED, NOW, SECRET, fakeStripe, licenseKeyPair, paidSession, price, recordingLogger, type FakeStripe } from './fakeStripe.ts'

const APP = 'https://lagom.example'
const WEBHOOK_SECRET = 'whsec_testhemlighet'
let keys: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
})

function env(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    STRIPE_SECRET_KEY: SECRET,
    STRIPE_PRICE_AR: 'price_ar',
    STRIPE_PRICE_LIVSTID: 'price_livstid',
    LICENSE_PRIVATE_KEY: keys.priv,
    APP_URL: `${APP}/`,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...overrides,
  }
}

function setup(envOverrides: Record<string, string | undefined> = {}) {
  const stripe = fakeStripe()
  const log = recordingLogger()
  const deps: HandlerDeps = {
    env: env(envOverrides),
    fetch: stripe.fetch,
    now: () => NOW,
    log,
    rateLimiter: new RateLimiter(1000, 60_000),
  }
  return { stripe, log, deps }
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${APP}/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function read(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

function lastCreate(stripe: FakeStripe): URLSearchParams {
  const call = stripe.calls.filter((c) => c.method === 'POST' && c.url.pathname === '/v1/checkout/sessions').at(-1)
  if (!call) throw new Error('ingen session skapades')
  return call.body
}

// ---------------------------------------------------------------------------

describe('POST /api/create-checkout', () => {
  it('skapar en Checkout-session för rätt pris och returnerar betalningslänken', async () => {
    const { stripe, deps } = setup()
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'livstid', consent: true }), deps)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const data = await read(res)
    expect(String(data.url)).toMatch(/^https:\/\/checkout\.stripe\.com\//)

    const form = lastCreate(stripe)
    expect(form.get('mode')).toBe('payment')
    expect(form.get('locale')).toBe('sv')
    expect(form.get('line_items[0][price]')).toBe('price_livstid')
    expect(form.get('line_items[0][quantity]')).toBe('1')
    expect(form.get('success_url')).toBe(`${APP}/#/tack?session_id={CHECKOUT_SESSION_ID}`)
    expect(form.get('cancel_url')).toBe(`${APP}/#/premium`)
    expect(form.get('metadata[app]')).toBe('lagom')
    expect(form.get('metadata[plan]')).toBe('livstid')
    expect(form.get('metadata[samtycke]')).toBe('omedelbar-leverans')
    expect(form.get('metadata[samtycke_tid]')).toBe(new Date(NOW).toISOString())
    expect(form.get('customer_creation')).toBe('if_required')
    expect(form.get('payment_intent_data[description]')).toContain('ångerrätten därmed upphör')
    expect(form.get('payment_intent_data[metadata][plan]')).toBe('livstid')
    expect(form.get('custom_text[submit][message]')).toContain('Engångsköp')
    // Betalsätt (kort, Klarna, Swish) styrs från Stripes dashboard.
    expect([...form.keys()].some((k) => k.startsWith('payment_method_types'))).toBe(false)
    // Utan köpvillkor/Stripe Tax skickas inga sådana parametrar.
    expect([...form.keys()].some((k) => k.startsWith('consent_collection') || k.startsWith('automatic_tax'))).toBe(false)
  })

  it('priset kontrolleras mot appens pris innan kunden skickas till Stripe', async () => {
    const { stripe, deps, log } = setup({ STRIPE_PRICE_AR: 'price_ar_fel' })
    stripe.prices.set('price_ar_fel', price('price_ar_fel', { unit_amount: 34900 }))
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)
    expect(res.status).toBe(503)
    expect(await read(res)).toMatchObject({ code: 'ej-konfigurerad' })
    expect(log.text()).toContain('349 kr men appen visar 299 kr')
    expect(stripe.calls.some((c) => c.url.pathname === '/v1/checkout/sessions')).toBe(false)
  })

  it.each([
    ['arkiverat', { active: false }],
    ['återkommande', { type: 'recurring' as const }],
    ['i euro', { currency: 'eur' }],
    ['moms ovanpå', { tax_behavior: 'exclusive' as const }],
  ])('ett pris som är %s godtas inte', async (_label, overrides) => {
    const id = `price_${_label.replace(/\W/g, '')}`
    const { stripe, deps } = setup({ STRIPE_PRICE_LIVSTID: id })
    stripe.prices.set(id, price(id, overrides))
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'livstid' }), deps)
    expect(res.status).toBe(503)
  })

  it('ett godkänt livstidspris godkänns inte som årslicens (även när det finns i cachen)', async () => {
    const { deps, stripe } = setup({ STRIPE_PRICE_AR: 'price_livstid' })
    expect((await handleCreateCheckout(post('create-checkout', { plan: 'livstid' }), deps)).status).toBe(200)
    expect((await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)).status).toBe(503)
    expect(stripe.calls.filter((c) => c.url.pathname === '/v1/checkout/sessions')).toHaveLength(1)
  })

  it('utan pris-id skickas priset från koden (inkl. moms)', async () => {
    const { stripe, deps } = setup({ STRIPE_PRICE_AR: '', STRIPE_PRICE_LIVSTID: '' })
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)
    expect(res.status).toBe(200)
    const form = lastCreate(stripe)
    // Utan samtycke från appen påstås inget samtycke på kvittot.
    expect(form.get('payment_intent_data[description]')).toBe('Lagom Årslicens')
    expect(form.get('metadata[samtycke]')).toBeNull()
    expect(form.get('line_items[0][price_data][currency]')).toBe('sek')
    expect(form.get('line_items[0][price_data][unit_amount]')).toBe('29900')
    expect(form.get('line_items[0][price_data][tax_behavior]')).toBe('inclusive')
    expect(form.get('line_items[0][price_data][product_data][name]')).toBe('Lagom Årslicens')
    expect(form.get('line_items[0][price_data][product_data][description]')).toContain('Förnyas inte automatiskt')
  })

  it('köpvillkor och Stripe Tax kan slås på', () => {
    const params = checkoutParams({
      plan: SERVER_PLANS.ar,
      priceId: 'price_ar',
      returnBase: APP,
      termsUrl: `${APP}/#/kopvillkor`,
      automaticTax: true,
    })
    expect(params.consent_collection).toEqual({ terms_of_service: 'required' })
    expect(params.automatic_tax).toEqual({ enabled: true })
    const text = (params.custom_text as { terms_of_service_acceptance: { message: string } }).terms_of_service_acceptance.message
    expect(text).toContain(`[köpvillkoren](${APP}/#/kopvillkor)`)
    expect(text).toContain('ångerrätten upphör')
  })

  it('planen valideras – okända planer och skräp avvisas med svenska meddelanden', async () => {
    const { deps } = setup()
    for (const body of [{ plan: 'manad' }, { plan: ['ar'] }, {}, [], 'null']) {
      const res = await handleCreateCheckout(post('create-checkout', body), deps)
      expect(res.status).toBe(400)
      const data = await read(res)
      expect(typeof data.error).toBe('string')
      expect(['ogiltig-plan', 'ogiltig-begaran']).toContain(data.code)
    }
    const bad = await handleCreateCheckout(post('create-checkout', '{inte json'), deps)
    expect(await read(bad)).toEqual({ code: 'ogiltig-begaran', error: 'Förfrågan kunde inte tolkas.' })
  })

  it('stora anrop avvisas innan de läses in', async () => {
    const { deps, stripe } = setup()
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'ar', fyll: 'x'.repeat(5000) }), deps)
    expect(res.status).toBe(413)
    expect(stripe.calls).toHaveLength(0)
  })

  it('CORS: preflight för appen, andra webbplatser nekas', async () => {
    const { deps } = setup({ ALLOWED_ORIGINS: 'https://www.lagom-appen.se' })
    const pre = await handleCreateCheckout(new Request(`${APP}/api/create-checkout`, { method: 'OPTIONS', headers: { Origin: APP } }), deps)
    expect(pre.status).toBe(204)
    expect(pre.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    expect(pre.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')

    const extra = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }, { Origin: 'https://www.lagom-appen.se' }), deps)
    expect(extra.status).toBe(200)
    expect(extra.headers.get('Access-Control-Allow-Origin')).toBe('https://www.lagom-appen.se')

    const evil = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }, { Origin: 'https://ond.example' }), deps)
    expect(evil.status).toBe(403)
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull()

    const get = await handleCreateCheckout(new Request(`${APP}/api/create-checkout`, { headers: { Origin: APP } }), deps)
    expect(get.status).toBe(405)
  })

  it('kunden skickas tillbaka till den adress köpet startades från (t.ex. en förhandsversion)', async () => {
    const { stripe, deps } = setup()
    const preview = 'https://deploy-preview-7--lagom.netlify.app'
    const req = new Request(`${preview}/api/create-checkout`, {
      method: 'POST',
      headers: { Origin: preview, 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'ar' }),
    })
    expect((await handleCreateCheckout(req, deps)).status).toBe(200)
    expect(lastCreate(stripe).get('success_url')).toBe(`${preview}/#/tack?session_id={CHECKOUT_SESSION_ID}`)
  })

  it('APP_URL med sökväg (appen i en undermapp) behålls i tillbaka-länkarna', async () => {
    const { stripe, deps } = setup({ APP_URL: 'https://exempel.github.io/lagom/' })
    const req = new Request('https://lagom-api.netlify.app/api/create-checkout', {
      method: 'POST',
      headers: { Origin: 'https://exempel.github.io' },
      body: JSON.stringify({ plan: 'ar' }),
    })
    expect((await handleCreateCheckout(req, deps)).status).toBe(200)
    expect(lastCreate(stripe).get('cancel_url')).toBe('https://exempel.github.io/lagom/#/premium')
  })

  it('saknade inställningar ger ett lugnt meddelande och loggar bara namnen', async () => {
    const { deps, log } = setup({ STRIPE_SECRET_KEY: 'pk_test_fel_nyckel' })
    const res = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)
    expect(res.status).toBe(503)
    expect(String((await read(res)).error)).toContain('inga pengar har dragits')
    expect(log.text()).toContain('STRIPE_SECRET_KEY')
    expect(log.text()).not.toContain('pk_test_fel_nyckel')
  })

  it('fel hos Stripe: tillfälliga fel → 502, fel nyckel → 503', async () => {
    const { stripe, deps } = setup({ STRIPE_PRICE_AR: '' })
    stripe.failNext.push('network')
    expect((await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)).status).toBe(502)
    stripe.failNext.push({ status: 500 })
    expect((await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), deps)).status).toBe(502)
    const wrongKey = setup({ STRIPE_SECRET_KEY: 'sk_test_fel', STRIPE_PRICE_AR: '' })
    expect((await handleCreateCheckout(post('create-checkout', { plan: 'ar' }), wrongKey.deps)).status).toBe(503)
  })

  it('begränsar antalet anrop per IP-adress', async () => {
    const { deps } = setup({ STRIPE_PRICE_AR: '' })
    deps.rateLimiter = new RateLimiter(2, 60_000)
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      statuses.push((await handleCreateCheckout(post('create-checkout', { plan: 'ar' }, { 'x-nf-client-connection-ip': '10.0.0.1' }), deps)).status)
    }
    expect(statuses).toEqual([200, 200, 429])
    const other = await handleCreateCheckout(post('create-checkout', { plan: 'ar' }, { 'x-nf-client-connection-ip': '10.0.0.2' }), deps)
    expect(other.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------

describe('POST /api/verify-purchase', () => {
  it('betalt köp → signerad licens som appen godkänner; planen kommer från köpet', async () => {
    const { stripe, deps } = setup()
    const s = paidSession()
    stripe.sessions.set(s.id, s)
    // Klienten försöker smyga in en annan plan – den ignoreras.
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id, plan: 'ar' }), deps)
    expect(res.status).toBe(200)
    const data = await read(res)
    expect(data).toMatchObject({ plan: 'livstid', issuedAt: new Date(CREATED * 1000).toISOString(), expiresAt: null })
    const check = await verifyLicense(String(data.licenseKey), { publicKey: keys.pub, mode: 'live', now: NOW })
    expect(check).toEqual({ ok: true, payload: { v: 1, id: s.id, plan: 'livstid', iat: CREATED } })
    // Nyckeln sparas på betalningen i Stripe.
    expect(stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]).toBe(data.licenseKey)
  })

  it('årslicensen gäller 365 dagar från köpet', async () => {
    const { stripe, deps } = setup()
    const s = paidSession({
      id: 'cs_test_Arslicens000001',
      metadata: { app: 'lagom', plan: 'ar' },
      amount_total: 29900,
      line_items: { data: [{ quantity: 1, price: { id: 'price_ar', unit_amount: 29900, currency: 'sek' } }] },
    })
    stripe.sessions.set(s.id, s)
    const data = await read(await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps))
    expect(data.plan).toBe('ar')
    expect(data.expiresAt).toBe(new Date((CREATED + 365 * 86_400) * 1000).toISOString())
  })

  it('idempotent: samma köp ger exakt samma nyckel varje gång', async () => {
    const { stripe, deps } = setup()
    const s = paidSession()
    stripe.sessions.set(s.id, s)
    const a = await read(await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps))
    const b = await read(await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps))
    expect(b.licenseKey).toBe(a.licenseKey)
    // Andra gången behövs ingen ny signering eller skrivning till Stripe.
    expect(stripe.calls.filter((c) => c.method === 'POST' && c.url.pathname.startsWith('/v1/payment_intents'))).toHaveLength(1)
  })

  it('en sparad nyckel från ett annat nyckelpar (t.ex. testnycklar) ersätts', async () => {
    const { stripe, deps } = setup()
    const s = paidSession()
    stripe.sessions.set(s.id, s)
    const old = await licenseKeyPair()
    const stale = await issueLicense(licensePayloadFor(s.id, 'livstid', CREATED), old.priv)
    stripe.intents.get('pi_1')!.metadata[LICENSE_METADATA_KEY] = stale
    const data = await read(await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps))
    expect(data.licenseKey).not.toBe(stale)
    expect((await verifyLicense(String(data.licenseKey), { publicKey: keys.pub, mode: 'live', now: NOW })).ok).toBe(true)
    expect(stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]).toBe(data.licenseKey)
  })

  it('licensen lämnas ut även om den inte kan sparas i Stripe', async () => {
    const { stripe, deps, log } = setup()
    const s = paidSession({ payment_intent: 'pi_saknas' })
    stripe.sessions.set(s.id, s)
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps)
    expect(res.status).toBe(200)
    expect(log.entries.some((e) => e.level === 'warn' && e.message.includes('kunde inte sparas'))).toBe(true)
  })

  it.each([
    ['ej betald', { payment_status: 'unpaid' as const }, 202, 'ej-betald'],
    ['öppen', { status: 'open' as const, payment_status: 'unpaid' as const }, 202, 'ej-betald'],
    ['utgången session', { status: 'expired' as const, payment_status: 'unpaid' as const }, 410, 'avbruten'],
    ['annan produkt (ingen Lagom-metadata)', { metadata: { plan: 'livstid' } }, 422, 'okant-kop'],
    ['okänd plan', { metadata: { app: 'lagom', plan: 'guld' } }, 422, 'okant-kop'],
    ['prenumeration', { mode: 'subscription' as const }, 422, 'okant-kop'],
    ['fel valuta', { currency: 'eur' }, 422, 'okant-kop'],
    [
      'billigare pris än planen',
      { line_items: { data: [{ quantity: 1, price: { id: 'price_ar', unit_amount: 29900, currency: 'sek' } }] } },
      422,
      'okant-kop',
    ],
    [
      'flera exemplar',
      { line_items: { data: [{ quantity: 2, price: { id: 'price_livstid', unit_amount: 59900, currency: 'sek' } }] } },
      422,
      'okant-kop',
    ],
  ])('%s → nekas', async (_label, overrides, status, code) => {
    const { stripe, deps } = setup()
    const s = paidSession(overrides)
    stripe.sessions.set(s.id, s)
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps)
    expect(res.status).toBe(status)
    const data = await read(res)
    expect(data.code).toBe(code)
    expect(data.licenseKey).toBeUndefined()
    expect(typeof data.error).toBe('string')
  })

  it('pågående betalning svarar 202 med pending så att appen kan fråga igen', async () => {
    const { stripe, deps } = setup()
    const s = paidSession({ payment_status: 'unpaid' })
    stripe.sessions.set(s.id, s)
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps)
    expect(res.status).toBe(202)
    expect(await read(res)).toMatchObject({ status: 'pending', pending: true, code: 'ej-betald' })
  })

  it('köp med ett äldre pris-id eller exakt planens belopp godtas', async () => {
    const { stripe, deps } = setup({ STRIPE_PRICE_LIVSTID: 'price_ny, price_gammal' })
    const old = paidSession({
      id: 'cs_test_GammaltPris00001',
      line_items: { data: [{ quantity: 1, price: { id: 'price_gammal', unit_amount: 49900, currency: 'sek' } }] },
    })
    stripe.sessions.set(old.id, old)
    expect((await handleVerifyPurchase(post('verify-purchase', { sessionId: old.id }), deps)).status).toBe(200)
    const adhoc = paidSession({
      id: 'cs_test_PrisFranKoden0001',
      line_items: { data: [{ quantity: 1, price: { id: 'price_1Adhoc', unit_amount: 59900, currency: 'sek' } }] },
    })
    stripe.sessions.set(adhoc.id, adhoc)
    expect((await handleVerifyPurchase(post('verify-purchase', { sessionId: adhoc.id }), deps)).status).toBe(200)
  })

  it('utgången årslicens lämnas inte ut', async () => {
    const { stripe, deps } = setup()
    const s = paidSession({
      id: 'cs_test_GammalArslicens01',
      created: CREATED - 400 * 86_400,
      metadata: { app: 'lagom', plan: 'ar' },
      line_items: { data: [{ quantity: 1, price: { id: 'price_ar', unit_amount: 29900, currency: 'sek' } }] },
    })
    stripe.sessions.set(s.id, s)
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps)
    expect(res.status).toBe(410)
    expect((await read(res)).code).toBe('utgangen')
  })

  it('ogiltiga och okända köp-id', async () => {
    const { deps, stripe } = setup()
    for (const sessionId of ['', 'cs_test_', '../prices/price_ar', 'pi_123456789', 'cs_live_abc/../../x', 42]) {
      const res = await handleVerifyPurchase(post('verify-purchase', { sessionId }), deps)
      expect(res.status).toBe(400)
      expect((await read(res)).code).toBe('ogiltigt-id')
    }
    expect(stripe.calls).toHaveLength(0)
    const missing = await handleVerifyPurchase(post('verify-purchase', { sessionId: 'cs_live_Finnsinte0000001' }), deps)
    expect(missing.status).toBe(404)
  })

  it('kräver den privata nyckeln och en giltig nyckel', async () => {
    const none = setup({ LICENSE_PRIVATE_KEY: '' })
    expect((await handleVerifyPurchase(post('verify-purchase', { sessionId: paidSession().id }), none.deps)).status).toBe(503)
    const broken = setup({ LICENSE_PRIVATE_KEY: 'QUJD' })
    const s = paidSession()
    broken.stripe.sessions.set(s.id, s)
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), broken.deps)
    expect(res.status).toBe(503)
    expect(String((await read(res)).error)).toContain('Din betalning finns kvar')
  })

  it('Stripe nere → 502 med lugnt besked', async () => {
    const { stripe, deps } = setup()
    stripe.failNext.push('network')
    const res = await handleVerifyPurchase(post('verify-purchase', { sessionId: paidSession().id }), deps)
    expect(res.status).toBe(502)
    expect((await read(res)).code).toBe('betaltjanst-fel')
  })

  it('validatePaidSession kräver expanderade rader', () => {
    const s = paidSession()
    delete s.line_items
    expect(validatePaidSession(s, { priceIds: { ar: [], livstid: [] } })).toMatchObject({ ok: false, code: 'okant-kop' })
  })
})

// ---------------------------------------------------------------------------

describe('POST /api/stripe-webhook', () => {
  async function webhook(event: unknown, opts: { secret?: string; t?: number; deps: HandlerDeps; tamper?: boolean }): Promise<Response> {
    const body = JSON.stringify(event)
    const t = opts.t ?? Math.floor(NOW / 1000)
    const sig = await computeStripeSignature(body, opts.secret ?? WEBHOOK_SECRET, t)
    return handleStripeWebhook(
      new Request(`${APP}/api/stripe-webhook`, {
        method: 'POST',
        headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' },
        body: opts.tamper ? body.replace('livstid', 'ar') : body,
      }),
      opts.deps,
    )
  }

  const completed = (session = paidSession()) => ({
    id: 'evt_1',
    object: 'event',
    type: 'checkout.session.completed',
    livemode: false,
    data: { object: { ...session, line_items: undefined } },
  })

  it('giltig händelse för betalt köp → licensen utfärdas och sparas på betalningen', async () => {
    const { stripe, deps, log } = setup()
    const s = paidSession()
    stripe.sessions.set(s.id, s)
    const res = await webhook(completed(s), { deps })
    expect(res.status).toBe(200)
    expect(await read(res)).toEqual({ received: true })
    const stored = stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]
    expect(stored).toMatch(/^LAGOM1\./)
    // Tacksidan får sedan exakt samma nyckel.
    const data = await read(await handleVerifyPurchase(post('verify-purchase', { sessionId: s.id }), deps))
    expect(data.licenseKey).toBe(stored)
    // Inga personuppgifter i loggen.
    expect(log.text()).not.toMatch(/@|customer_details|email/i)
  })

  it('fel signatur, ändrad kropp eller för gammal händelse avvisas', async () => {
    const { deps, stripe } = setup()
    expect((await webhook(completed(), { deps, secret: 'whsec_fel' })).status).toBe(400)
    expect((await webhook(completed(), { deps, tamper: true })).status).toBe(400)
    expect((await webhook(completed(), { deps, t: Math.floor(NOW / 1000) - 3600 })).status).toBe(400)
    const unsigned = await handleStripeWebhook(new Request(`${APP}/api/stripe-webhook`, { method: 'POST', body: '{}' }), deps)
    expect(unsigned.status).toBe(400)
    expect(stripe.calls).toHaveLength(0)
  })

  it('andra händelser och andra produkter kvitteras utan åtgärd', async () => {
    const { deps, stripe } = setup()
    const other = { id: 'evt_2', object: 'event', type: 'invoice.paid', livemode: false, data: { object: { object: 'invoice' } } }
    expect(await read(await webhook(other, { deps }))).toEqual({ received: true, ignored: true })
    const foreign = completed(paidSession({ metadata: { produkt: 'annat' } }))
    expect(await read(await webhook(foreign, { deps }))).toEqual({ received: true, ignored: true })
    expect(stripe.calls).toHaveLength(0)
  })

  it('obetald (fördröjd betalning) väntar på async_payment_succeeded', async () => {
    const { deps, stripe } = setup()
    const s = paidSession({ payment_status: 'unpaid' })
    stripe.sessions.set(s.id, s)
    expect((await webhook(completed(s), { deps })).status).toBe(200)
    expect(stripe.calls).toHaveLength(0)
    stripe.sessions.set(s.id, { ...s, payment_status: 'paid' })
    const succeeded = { ...completed({ ...s, payment_status: 'paid' }), type: 'checkout.session.async_payment_succeeded' }
    expect((await webhook(succeeded, { deps })).status).toBe(200)
    expect(stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]).toMatch(/^LAGOM1\./)
  })

  it('tillfälliga fel ger 500 så att Stripe försöker igen', async () => {
    const { deps, stripe } = setup()
    const s = paidSession()
    stripe.sessions.set(s.id, s)
    stripe.failNext.push('network')
    expect((await webhook(completed(s), { deps })).status).toBe(500)
  })

  it('utan STRIPE_WEBHOOK_SECRET är webhooken avstängd', async () => {
    const { deps } = setup({ STRIPE_WEBHOOK_SECRET: '' })
    expect((await webhook(completed(), { deps })).status).toBe(503)
  })
})
