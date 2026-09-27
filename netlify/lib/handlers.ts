/**
 * Logiken bakom serverfunktionerna i netlify/functions. Allt som behövs utifrån (miljövariabler,
 * fetch, klocka, loggning) skickas in, så att funktionerna kan testas utan nätverk.
 *
 * API (se docs/BETALNING.md):
 *   POST /api/create-checkout  { plan: 'ar' | 'livstid', consent?: true } → { url }
 *   POST /api/verify-purchase  { sessionId: 'cs_…' }                       → { licenseKey, plan, issuedAt, expiresAt }
 *                              (202 { status: 'pending', pending: true } medan betalningen pågår)
 *   POST /api/stripe-webhook   (anropas av Stripe)                         → { received: true }
 * Fel: { code, error } där `error` är ett svenskt meddelande som kan visas direkt.
 */
import { missingConfig, readConfig, type Env, type Requirement, type ServerConfig } from './config.ts'
import { APP_MARKER, SESSION_ID_RE, errorText, fulfillSession, type FulfillCode, type Logger } from './fulfillment.ts'
import { RateLimiter, checkOrigin, clientIp, errorResponse, json, readBody, readJsonObject, type OriginCheck } from './http.ts'
import { CURRENCY, SERVER_PLANS, isPlanId, priceInOre, type PlanId, type ServerPlan } from './plans.ts'
import {
  StripeError,
  stripeRequest,
  verifyStripeSignature,
  type FetchLike,
  type FormValue,
  type StripeCheckoutSession,
  type StripeEvent,
  type StripePrice,
} from './stripe.ts'

/** Den del av Netlifys kontextobjekt (Functions v2) som används. */
export interface NetlifyContext {
  ip?: string
  site?: { url?: string }
}

export interface HandlerDeps {
  env: Env
  fetch?: FetchLike
  /** Epoch-ms. */
  now?: () => number
  log?: Logger
  context?: NetlifyContext
  rateLimiter?: RateLimiter
}

/** Loggar utan personuppgifter – bara sessions-id, plan och tekniska detaljer. */
export const consoleLogger: Logger = {
  info: (message, data) => console.info(`[lagom] ${message}`, data ?? ''),
  warn: (message, data) => console.warn(`[lagom] ${message}`, data ?? ''),
  error: (message, data) => console.error(`[lagom] ${message}`, data ?? ''),
}

const MAX_BODY_BYTES = 2 * 1024
const MAX_WEBHOOK_BYTES = 512 * 1024

const createLimiter = new RateLimiter(10, 60_000)
const verifyLimiter = new RateLimiter(30, 60_000)

// ---------------------------------------------------------------------------
// Gemensamt
// ---------------------------------------------------------------------------

type Prepared =
  | { ok: true; cfg: ServerConfig; origin: OriginCheck; now: number; log: Logger }
  | { ok: false; response: Response }

/** Metod, ursprung, anropsgräns och konfiguration – samma för appens två anrop. */
function prepare(req: Request, deps: HandlerDeps, limiter: RateLimiter, needs: Requirement[], notConfigured: string): Prepared {
  const cfg = readConfig(deps.env, deps.context?.site?.url)
  const log = deps.log ?? consoleLogger
  const now = (deps.now ?? Date.now)()
  const origin = checkOrigin(req, [cfg.appUrl, ...cfg.allowedOrigins].filter(Boolean))

  if (!origin.allowed) {
    return { ok: false, response: errorResponse(403, 'fel-ursprung', 'Den här webbplatsen får inte använda Lagoms betalning.', origin.headers) }
  }
  if (req.method === 'OPTIONS') return { ok: false, response: new Response(null, { status: 204, headers: origin.headers }) }
  if (req.method !== 'POST') {
    return { ok: false, response: errorResponse(405, 'fel-metod', 'Använd POST.', { ...origin.headers, Allow: 'POST, OPTIONS' }) }
  }
  if (!(deps.rateLimiter ?? limiter).take(clientIp(req, deps.context?.ip), now)) {
    return {
      ok: false,
      response: errorResponse(429, 'for-manga', 'Många försök på kort tid. Vänta en minut och försök igen.', { ...origin.headers, 'Retry-After': '60' }),
    }
  }
  const missing = missingConfig(cfg, needs)
  if (missing.length > 0) {
    log.error('Miljövariabler saknas eller är felaktiga', { saknas: missing })
    return { ok: false, response: errorResponse(503, 'ej-konfigurerad', notConfigured, origin.headers) }
  }
  return { ok: true, cfg, origin, now, log }
}

// ---------------------------------------------------------------------------
// POST /api/create-checkout
// ---------------------------------------------------------------------------

const CHECKOUT_NOT_CONFIGURED = 'Betalningen är inte igång just nu. Kontakta supporten – inga pengar har dragits.'

const priceCache = new Map<string, number>()
const PRICE_CACHE_MS = 10 * 60_000

/**
 * Kontrollera att ett Stripe-pris är exakt det pris som appen visar (inkl. moms, engångsbelopp i
 * SEK). Skyddar kunden mot att debiteras något annat än det som visades. null = OK.
 */
export async function checkStripePrice(
  priceId: string,
  plan: ServerPlan,
  opts: { secretKey: string; fetch?: FetchLike; now: number },
): Promise<string | null> {
  // Nyckeln innehåller planen: ett pris som är rätt för livstid får aldrig godkännas för årslicens.
  const cacheKey = `${plan.id}:${priceId}`
  const cachedUntil = priceCache.get(cacheKey)
  if (cachedUntil !== undefined && cachedUntil > opts.now) return null
  const price = await stripeRequest<StripePrice>({
    method: 'GET',
    path: `/prices/${encodeURIComponent(priceId)}`,
    secretKey: opts.secretKey,
    fetch: opts.fetch,
  })
  let problem: string | null = null
  if (!price.active) problem = 'priset är arkiverat i Stripe'
  else if (price.type !== 'one_time') problem = 'priset måste vara ett engångspris (inte återkommande)'
  else if (price.currency !== CURRENCY) problem = `priset är i ${price.currency.toUpperCase()}, inte SEK`
  else if (price.unit_amount !== priceInOre(plan)) problem = `priset i Stripe är ${(price.unit_amount ?? 0) / 100} kr men appen visar ${plan.priceKr} kr`
  else if (price.tax_behavior === 'exclusive') problem = 'momsen måste ingå i priset (Include tax in price)'
  if (problem === null) priceCache.set(cacheKey, opts.now + PRICE_CACHE_MS)
  else priceCache.delete(cacheKey)
  return problem
}

/** Parametrar till Stripe för en ny Checkout-session. Ren funktion – testas separat. */
export function checkoutParams(input: {
  plan: ServerPlan
  priceId?: string
  returnBase: string
  consentAt?: string
  termsUrl?: string
  automaticTax?: boolean
}): Record<string, FormValue> {
  const { plan, priceId, returnBase, consentAt, termsUrl } = input
  const productName = `Lagom ${plan.name}`
  const lineItem: Record<string, FormValue> = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: priceInOre(plan),
          tax_behavior: 'inclusive',
          product_data: {
            name: productName,
            description: plan.durationDays
              ? `Full tillgång till Lagom i ${plan.durationDays} dagar. Förnyas inte automatiskt.`
              : 'Full tillgång till Lagom för alltid. Engångsköp.',
          },
        },
      }
  const metadata: Record<string, string> = { app: APP_MARKER, plan: plan.id }
  if (consentAt) {
    // Kunden kryssade i appen i att leveransen får börja direkt och att ångerrätten då upphör.
    metadata.samtycke = 'omedelbar-leverans'
    metadata.samtycke_tid = consentAt
  }
  // Beskrivningen syns i Stripes dashboard och på kvittot – bekräftelsen av samtycket
  // (distansavtalslagen 2 kap. 12 §) följer då med kvittot.
  const description =
    consentAt || termsUrl
      ? `${productName}. Digital licens som levereras direkt efter betalningen. Du har samtyckt till omedelbar leverans och till att ångerrätten därmed upphör.`
      : productName
  return {
    mode: 'payment',
    locale: 'sv',
    line_items: [lineItem],
    success_url: `${returnBase}/#/tack?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${returnBase}/#/premium`,
    metadata,
    payment_intent_data: { description, metadata: { app: APP_MARKER, plan: plan.id } },
    customer_creation: 'if_required',
    billing_address_collection: 'auto',
    submit_type: 'pay',
    custom_text: {
      submit: { message: plan.checkoutNote },
      ...(termsUrl
        ? {
            terms_of_service_acceptance: {
              message: `Jag godkänner [köpvillkoren](${termsUrl}) och att licensen levereras direkt efter betalningen. Jag förstår att ångerrätten upphör när leveransen har börjat.`,
            },
          }
        : {}),
    },
    consent_collection: termsUrl ? { terms_of_service: 'required' } : undefined,
    automatic_tax: input.automaticTax ? { enabled: true } : undefined,
  }
}

export async function handleCreateCheckout(req: Request, deps: HandlerDeps): Promise<Response> {
  const prep = prepare(req, deps, createLimiter, ['stripe'], CHECKOUT_NOT_CONFIGURED)
  if (!prep.ok) return prep.response
  const { cfg, origin, now, log } = prep
  const h = origin.headers

  const body = await readJsonObject(req, MAX_BODY_BYTES, h)
  if (!body.ok) return body.response
  const planId: unknown = body.value.plan
  if (!isPlanId(planId)) return errorResponse(400, 'ogiltig-plan', 'Välj Årslicens eller Livstidslicens.', h)
  const plan = SERVER_PLANS[planId]

  if (!origin.returnBase) {
    log.error('APP_URL saknas – vet inte vart kunden ska skickas efter betalningen')
    return errorResponse(503, 'ej-konfigurerad', CHECKOUT_NOT_CONFIGURED, h)
  }

  const priceId = cfg.priceIds[planId][0]
  if (priceId) {
    try {
      const problem = await checkStripePrice(priceId, plan, { secretKey: cfg.stripeSecretKey, fetch: deps.fetch, now })
      if (problem) {
        log.error(`${plan.priceEnv}: ${problem}`, { price: priceId })
        return errorResponse(503, 'ej-konfigurerad', CHECKOUT_NOT_CONFIGURED, h)
      }
    } catch (e) {
      return stripeFailure(e, log, h, 'Kunde inte läsa priset från Stripe')
    }
  }

  const params = checkoutParams({
    plan,
    priceId,
    returnBase: origin.returnBase,
    consentAt: body.value.consent === true ? new Date(now).toISOString() : undefined,
    termsUrl: cfg.termsUrl,
    automaticTax: cfg.automaticTax,
  })
  try {
    const session = await stripeRequest<StripeCheckoutSession>({
      method: 'POST',
      path: '/checkout/sessions',
      params,
      secretKey: cfg.stripeSecretKey,
      fetch: deps.fetch,
    })
    if (!session.url) throw new StripeError('Stripe returnerade ingen betalningslänk', 502)
    log.info('Checkout skapad', { session: session.id, plan: plan.id })
    return json(200, { url: session.url }, h)
  } catch (e) {
    return stripeFailure(e, log, h, 'Kunde inte skapa Checkout-session')
  }
}

function stripeFailure(e: unknown, log: Logger, headers: Record<string, string>, what: string): Response {
  const status = e instanceof StripeError ? e.status : 0
  log.error(what, { status, fel: errorText(e) })
  // 4xx från Stripe (utom 429) betyder nästan alltid fel inställningar, inte ett tillfälligt fel.
  if (status >= 400 && status < 500 && status !== 429) {
    return errorResponse(503, 'ej-konfigurerad', CHECKOUT_NOT_CONFIGURED, headers)
  }
  return errorResponse(502, 'betaltjanst-fel', 'Vi når inte betaltjänsten just nu. Försök igen om en stund – inga pengar har dragits.', headers)
}

// ---------------------------------------------------------------------------
// POST /api/verify-purchase
// ---------------------------------------------------------------------------

const VERIFY_ERRORS: Record<FulfillCode, { status: number; message: string }> = {
  'hittades-inte': { status: 404, message: 'Vi hittade inget köp med det id:t. Har du betalat? Kontakta supporten så hjälper vi dig.' },
  // 202 + pending: appen väntar en stund och frågar igen (t.ex. Klarna eller Swish som dröjer).
  'ej-betald': { status: 202, message: 'Betalningen är inte klar ännu. Vänta en liten stund och försök igen.' },
  avbruten: { status: 410, message: 'Köpet avbröts eller hann gå ut. Inga pengar har dragits.' },
  'okant-kop': { status: 422, message: 'Köpet gäller inte en Lagom-licens. Kontakta supporten om du tror att det är fel.' },
  utgangen: { status: 410, message: 'Licensen från det här köpet har gått ut. Du kan köpa en ny på köpsidan.' },
  'ej-konfigurerad': {
    status: 503,
    message: 'Licensen kan inte skapas just nu. Din betalning finns kvar – försök igen senare eller kontakta supporten.',
  },
  'betaltjanst-fel': { status: 502, message: 'Vi når inte betaltjänsten just nu. Försök igen om en stund – din betalning finns kvar.' },
}

export interface VerifyPurchaseResponse {
  licenseKey: string
  plan: PlanId
  /** ISO-datum och tid. */
  issuedAt: string
  /** ISO-datum och tid, null för livstidslicens. */
  expiresAt: string | null
}

export async function handleVerifyPurchase(req: Request, deps: HandlerDeps): Promise<Response> {
  const prep = prepare(req, deps, verifyLimiter, ['stripe', 'license'], VERIFY_ERRORS['ej-konfigurerad'].message)
  if (!prep.ok) return prep.response
  const { cfg, origin, now, log } = prep
  const h = origin.headers

  const body = await readJsonObject(req, MAX_BODY_BYTES, h)
  if (!body.ok) return body.response
  const sessionId = typeof body.value.sessionId === 'string' ? body.value.sessionId.trim() : ''
  if (!SESSION_ID_RE.test(sessionId)) {
    return errorResponse(400, 'ogiltigt-id', 'Köp-id:t ser inte rätt ut. Öppna länken från betalningen igen eller kontakta supporten.', h)
  }

  const result = await fulfillSession(sessionId, { cfg, fetch: deps.fetch, now, log })
  if (!result.ok) {
    const e = VERIFY_ERRORS[result.code]
    if (result.code === 'ej-betald') return json(e.status, { code: result.code, error: e.message, status: 'pending', pending: true }, h)
    return errorResponse(e.status, result.code, e.message, h)
  }
  const out: VerifyPurchaseResponse = {
    licenseKey: result.licenseKey,
    plan: result.payload.plan,
    issuedAt: new Date(result.payload.iat * 1000).toISOString(),
    expiresAt: result.payload.exp !== undefined ? new Date(result.payload.exp * 1000).toISOString() : null,
  }
  return json(200, out, h)
}

// ---------------------------------------------------------------------------
// POST /api/stripe-webhook
// ---------------------------------------------------------------------------

const FULFILL_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

/**
 * Tar emot händelser från Stripe. Signaturen kontrolleras alltid. För betalda Lagom-köp utfärdas
 * licensen direkt och sparas på betalningen – även om kunden stängde fliken innan tacksidan
 * hann laddas. Inga personuppgifter loggas.
 */
export async function handleStripeWebhook(req: Request, deps: HandlerDeps): Promise<Response> {
  const cfg = readConfig(deps.env, deps.context?.site?.url)
  const log = deps.log ?? consoleLogger
  const now = (deps.now ?? Date.now)()
  if (req.method !== 'POST') return errorResponse(405, 'fel-metod', 'Använd POST.', { Allow: 'POST' })

  const missing = missingConfig(cfg, ['webhook'])
  if (missing.length > 0) {
    log.error('Miljövariabler saknas eller är felaktiga', { saknas: missing })
    return errorResponse(503, 'ej-konfigurerad', 'Webhooken är inte konfigurerad.')
  }

  const body = await readBody(req, MAX_WEBHOOK_BYTES)
  if (!body.ok) return body.response
  const sig = await verifyStripeSignature(body.bytes, req.headers.get('stripe-signature'), cfg.webhookSecret, {
    nowSec: Math.floor(now / 1000),
  })
  if (!sig.ok) {
    log.warn('Webhook med ogiltig signatur avvisades', { orsak: sig.reason })
    return errorResponse(400, 'fel-signatur', 'Ogiltig signatur.')
  }

  let event: StripeEvent
  try {
    event = JSON.parse(new TextDecoder().decode(body.bytes)) as StripeEvent
    if (typeof event?.type !== 'string' || typeof event.data?.object !== 'object') throw new Error('saknar type/data')
  } catch {
    return errorResponse(400, 'ogiltig-begaran', 'Händelsen kunde inte tolkas.')
  }

  const obj = event.data.object as Partial<StripeCheckoutSession>
  const isLagom = obj.object === 'checkout.session' && obj.metadata?.app === APP_MARKER
  if (!isLagom) return json(200, { received: true, ignored: true })

  const summary = {
    event: event.id,
    type: event.type,
    session: obj.id,
    plan: obj.metadata?.plan,
    belopp: typeof obj.amount_total === 'number' ? obj.amount_total / 100 : undefined,
    valuta: obj.currency,
    betalning: obj.payment_status,
    livemode: event.livemode,
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    log.warn('Betalningen misslyckades (fördröjd betalningsmetod)', summary)
    return json(200, { received: true })
  }
  if (!FULFILL_EVENTS.has(event.type)) return json(200, { received: true, ignored: true })

  log.info('Köp genomfört', summary)
  if (obj.payment_status !== 'paid' || typeof obj.id !== 'string' || !SESSION_ID_RE.test(obj.id)) {
    // T.ex. en fördröjd betalningsmetod – licensen utfärdas vid async_payment_succeeded.
    return json(200, { received: true })
  }
  const needs = missingConfig(cfg, ['stripe', 'license'])
  if (needs.length > 0) {
    // 500 → Stripe försöker igen, så licensen utfärdas när inställningarna är rättade.
    log.error('Kan inte utfärda licens från webhook – miljövariabler saknas', { saknas: needs })
    return errorResponse(500, 'ej-konfigurerad', 'Licensen kunde inte utfärdas just nu.')
  }
  const result = await fulfillSession(obj.id, { cfg, fetch: deps.fetch, now, log })
  if (!result.ok && (result.code === 'betaltjanst-fel' || result.code === 'ej-konfigurerad')) {
    // 500 → Stripe försöker igen senare (upp till tre dygn).
    return errorResponse(500, result.code, 'Licensen kunde inte utfärdas just nu.')
  }
  return json(200, { received: true })
}
