/**
 * Logiken bakom serverfunktionerna i netlify/functions. Allt som behövs utifrån (miljövariabler,
 * fetch, klocka, loggning) skickas in, så att funktionerna kan testas utan nätverk.
 *
 * API (se docs/BETALNING.md):
 *   POST /api/create-checkout      { plan: 'ar' | 'livstid', consent: true }  → { url }
 *                                  (400 'samtycke-saknas' utan samtycket om omedelbar leverans)
 *   POST /api/verify-purchase      { sessionId: 'cs_…' }                       → { licenseKey, plan, issuedAt, expiresAt }
 *                                  (202 { status: 'pending', pending: true } medan betalningen pågår,
 *                                  410 'aterbetald' för återbetalda och bestridda köp)
 *   POST /api/stripe-webhook       (anropas av Stripe)                         → { received: true }
 *   GET  /api/license-revocations  spärrlistan, se revocations.ts
 *   POST /api/recover-license      { email, receipt }, se recover.ts
 *   POST /api/recipe-fetch         { url }, se recipeFetch.ts
 * Fel: { code, error } där `error` är ett svenskt meddelande som kan visas direkt.
 */
import {
  DEFAULT_TERMS_VERSION,
  missingConfig,
  readConfig,
  sellerForDisplay,
  type Env,
  type Requirement,
  type SellerInfo,
  type ServerConfig,
} from './config.ts'
import {
  APP_MARKER,
  REVOKING_DISPUTES,
  SESSION_ID_RE,
  STATUS_METADATA_KEY,
  errorText,
  fulfillSession,
  isFullyRefunded,
  isLagomIntent,
  type FulfillCode,
  type Logger,
} from './fulfillment.ts'
import { RateLimiter, checkOrigin, clientIp, errorResponse, json, readBody, readJsonObject, type OriginCheck } from './http.ts'
import { CURRENCY, SERVER_PLANS, isPlanId, priceInOre, type PlanId, type ServerPlan } from './plans.ts'
import {
  StripeError,
  stripeRequest,
  verifyStripeSignature,
  type FetchLike,
  type FormValue,
  type StripeCharge,
  type StripeCheckoutSession,
  type StripeDispute,
  type StripeEvent,
  type StripePaymentIntent,
  type StripePrice,
} from './stripe.ts'

/** Den del av Netlifys kontextobjekt (Functions v2) som används. */
export interface NetlifyContext {
  ip?: string
  site?: { url?: string }
  /** Driftmiljön: 'production', 'deploy-preview', 'branch-deploy' eller 'dev'. */
  deploy?: { context?: string }
}

export interface HandlerDeps {
  env: Env
  fetch?: FetchLike
  /** Epoch-ms. */
  now?: () => number
  log?: Logger
  context?: NetlifyContext
  rateLimiter?: RateLimiter
  /** Extra begränsning per nyckel i stället för per IP (recover-license: per e-postadress). */
  keyRateLimiter?: RateLimiter
  /** Vänta (ms). Används för jämn svarstid i recover-license; testerna byter ut den. */
  sleep?: (ms: number) => Promise<void>
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

/**
 * Sista skyddsnätet runt varje funktion: ett oväntat fel ger ett lugnt 500-svar på svenska utan
 * detaljer. Felmeddelanden och stackspår hamnar bara i loggen, aldrig i svaret. För webhooken
 * betyder 500 att Stripe försöker igen senare.
 */
export async function withErrorBoundary(what: string, run: () => Promise<Response>, log: Logger = consoleLogger): Promise<Response> {
  try {
    return await run()
  } catch (e) {
    log.error(`Oväntat fel i ${what}`, { fel: errorText(e) })
    return errorResponse(500, 'internt-fel', 'Något gick fel hos oss. Försök igen om en stund.')
  }
}

export type Prepared =
  | { ok: true; cfg: ServerConfig; origin: OriginCheck; now: number; log: Logger }
  | { ok: false; response: Response }

export interface PrepareOptions {
  /** Anropsbegränsningen (per IP-adress) om testet inte skickar in en egen. */
  limiter: RateLimiter
  needs: Requirement[]
  /** Meddelandet (503) när inställningar saknas. */
  notConfigured: string
  /** Metoden som funktionen tar emot (standard POST). */
  method?: 'GET' | 'POST'
  /** Meddelandet (403) när anropet kommer från en annan webbplats. */
  forbidden?: string
  /**
   * Kräv Origin-headern (appens eller den inbyggda appens ursprung). Anrop utan Origin (curl,
   * skript) avvisas då – för funktioner som bara appen ska använda.
   */
  requireOrigin?: boolean
}

const FORBIDDEN_PAYMENT = 'Den här webbplatsen får inte använda Lagoms betalning.'

/** Metod, ursprung, anropsgräns och konfiguration – samma för alla anrop från appen. */
export function prepareRequest(req: Request, deps: HandlerDeps, opts: PrepareOptions): Prepared {
  const cfg = readConfig(deps.env, deps.context?.site?.url, deps.context?.deploy?.context)
  const log = deps.log ?? consoleLogger
  const now = (deps.now ?? Date.now)()
  const method = opts.method ?? 'POST'
  const origin = checkOrigin(req, [cfg.appUrl, ...cfg.allowedOrigins].filter(Boolean), cfg.nativeOrigins, `${method}, OPTIONS`)

  if (!origin.allowed || (opts.requireOrigin && req.headers.get('origin') === null)) {
    return { ok: false, response: errorResponse(403, 'fel-ursprung', opts.forbidden ?? FORBIDDEN_PAYMENT, origin.headers) }
  }
  if (req.method === 'OPTIONS') return { ok: false, response: new Response(null, { status: 204, headers: origin.headers }) }
  if (req.method !== method) {
    return { ok: false, response: errorResponse(405, 'fel-metod', `Använd ${method}.`, { ...origin.headers, Allow: `${method}, OPTIONS` }) }
  }
  if (!(deps.rateLimiter ?? opts.limiter).take(clientIp(req, deps.context?.ip), now)) {
    return {
      ok: false,
      response: errorResponse(429, 'for-manga', 'Många försök på kort tid. Vänta en minut och försök igen.', { ...origin.headers, 'Retry-After': '60' }),
    }
  }
  const missing = missingConfig(cfg, opts.needs)
  if (missing.length > 0) {
    log.error('Miljövariabler saknas eller är felaktiga', { saknas: missing })
    if (missing.some((name) => name.startsWith('VITE_'))) {
      log.error(
        'Skarpa köp kräver säljarens uppgifter även i serverfunktionerna – ge VITE_SELLER_*-variablerna och VITE_SUPPORT_EMAIL scope "Functions" (eller alla) i Netlify.',
      )
    }
    return { ok: false, response: errorResponse(503, 'ej-konfigurerad', opts.notConfigured, origin.headers) }
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

/** Stripes gräns för fakturans sidfot (invoice_data.footer, enligt Stripes OpenAPI-specifikation). */
export const INVOICE_FOOTER_MAX = 5000
/** Stripes gränser för egna fält på fakturan: högst 4 fält, namn ≤ 40 och värde ≤ 140 tecken. */
export const INVOICE_FIELD_NAME_MAX = 40
export const INVOICE_FIELD_VALUE_MAX = 140

/** Kort text utan radbrytningar (uppgifterna kommer från miljövariabler). */
function oneLine(value: string, max = 120): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Sidfoten på fakturan/kvittot från Stripe – bekräftelsen på varaktigt medium
 * (distansavtalslagen 2 kap. 12 §): säljaren, vad licensen är, samtycket till omedelbar leverans
 * och vart kunden vänder sig vid fel och tvister.
 */
export function invoiceFooter(seller: SellerInfo, plan: ServerPlan): string {
  const s = sellerForDisplay(seller)
  const sellerLine = [
    `Säljare: ${oneLine(s.name)}`,
    s.orgnr ? `Org.nr ${oneLine(s.orgnr, 40)}` : '',
    oneLine(s.address, 200),
    `Tel. ${oneLine(s.phone, 40)}`,
    oneLine(s.email, 120),
    s.vat ? `Momsreg.nr ${oneLine(s.vat, 40)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const licenseLine = plan.durationDays
    ? `Licensen är personlig. Årslicensen gäller ${plan.durationDays} dagar och förnyas inte.`
    : 'Licensen är personlig. Livstidslicensen är ett engångsköp som gäller för alltid.'
  const footer = [
    sellerLine,
    licenseLine,
    'Du samtyckte till omedelbar leverans och att ångerrätten därmed upphörde (2 kap. 11 § distansavtalslagen).',
    'Reklamation enligt konsumentköplagen. Tvister: Allmänna reklamationsnämnden, www.arn.se.',
  ].join('\n')
  return footer.slice(0, INVOICE_FOOTER_MAX)
}

/** Produktens beskrivning i Stripe Checkout och på kvittot. */
export function productDescription(plan: ServerPlan): string {
  return plan.durationDays
    ? `Full tillgång till Lagom i ${plan.durationDays} dagar. Förnyas inte automatiskt.`
    : 'Full tillgång till Lagom för alltid, utan årsavgift. Engångsköp – felrättningar ingår.'
}

/** Parametrar till Stripe för en ny Checkout-session. Ren funktion – testas separat. */
export function checkoutParams(input: {
  plan: ServerPlan
  priceId?: string
  returnBase: string
  consentAt?: string
  termsUrl?: string
  automaticTax?: boolean
  /** Säljarens uppgifter till fakturan (saknade uppgifter blir platshållare). */
  seller?: SellerInfo
  /** Köpvillkorens version (TERMS_VERSION). */
  termsVersion?: string
}): Record<string, FormValue> {
  const { plan, priceId, returnBase, consentAt, termsUrl } = input
  const termsVersion = input.termsVersion || DEFAULT_TERMS_VERSION
  const seller = input.seller ?? { name: '', orgnr: '', address: '', phone: '', email: '', vat: '' }
  const productName = `Lagom ${plan.name}`
  const lineItem: Record<string, FormValue> = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: priceInOre(plan),
          tax_behavior: 'inclusive',
          product_data: { name: productName, description: productDescription(plan) },
        },
      }
  const metadata: Record<string, string> = { app: APP_MARKER, plan: plan.id, villkor_version: termsVersion }
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
    // Adressen (med land) står på fakturan och visar var kunden bor – webbförsäljningen riktar sig
    // till kunder i Sverige.
    billing_address_collection: 'required',
    submit_type: 'pay',
    // Bekräftelse på varaktigt medium: Stripe skapar en faktura/ett kvitto efter betalningen och
    // mejlar det (kräver "Successful payments" under Customer emails i Stripe).
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${productName}. Digital licens som levereras direkt efter betalningen.`,
        footer: invoiceFooter(seller, plan),
        custom_fields: [
          { name: 'Licens', value: plan.name.slice(0, INVOICE_FIELD_VALUE_MAX) },
          { name: 'Villkor', value: `Köpvillkor version ${termsVersion}`.slice(0, INVOICE_FIELD_VALUE_MAX) },
        ],
        metadata: { app: APP_MARKER, plan: plan.id, villkor_version: termsVersion },
        rendering_options: input.automaticTax ? { amount_tax_display: 'include_inclusive_tax' } : undefined,
      },
    },
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
  const prep = prepareRequest(req, deps, { limiter: createLimiter, needs: ['stripe', 'seller'], notConfigured: CHECKOUT_NOT_CONFIGURED })
  if (!prep.ok) return prep.response
  const { cfg, origin, now, log } = prep
  const h = origin.headers

  // Butiksapparna säljer bara via App Store/Google Play – aldrig via Stripe.
  if (origin.native) {
    return errorResponse(403, 'ej-i-appen', 'Köp i appen görs via App Store eller Google Play. Inga pengar har dragits.', h)
  }

  const body = await readJsonObject(req, MAX_BODY_BYTES, h)
  if (!body.ok) return body.response
  const planId: unknown = body.value.plan
  if (!isPlanId(planId)) return errorResponse(400, 'ogiltig-plan', 'Välj Årslicens eller Livstidslicens.', h)
  const plan = SERVER_PLANS[planId]
  // Samtycket till omedelbar leverans (ångerrätten upphör, distansavtalslagen 2 kap. 11 § p. 11)
  // krävs för varje köp – även från andra klienter än appen. Annars skulle ångerrätten finnas
  // kvar för en licens som redan har levererats och inte kan återkallas.
  if (body.value.consent !== true) {
    return errorResponse(
      400,
      'samtycke-saknas',
      'Kryssa i att licensen levereras direkt och att ångerrätten då upphör, och försök igen. Inga pengar har dragits.',
      h,
    )
  }

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
    consentAt: new Date(now).toISOString(),
    termsUrl: cfg.termsUrl,
    automaticTax: cfg.automaticTax,
    seller: cfg.seller,
    termsVersion: cfg.termsVersion,
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
    log.info('Checkout skapad', { session: session.id, plan: plan.id, villkor: cfg.termsVersion })
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

export const VERIFY_ERRORS: Record<FulfillCode, { status: number; message: string }> = {
  'hittades-inte': { status: 404, message: 'Vi hittade inget köp med det id:t. Har du betalat? Kontakta supporten så hjälper vi dig.' },
  // 202 + pending: appen väntar en stund och frågar igen (t.ex. Klarna eller Swish som dröjer).
  'ej-betald': { status: 202, message: 'Betalningen är inte klar ännu. Vänta en liten stund och försök igen.' },
  avbruten: { status: 410, message: 'Köpet avbröts eller hann gå ut. Inga pengar har dragits.' },
  'okant-kop': { status: 422, message: 'Köpet gäller inte en Lagom-licens. Kontakta supporten om du tror att det är fel.' },
  aterbetald: { status: 410, message: 'Köpet har återbetalats och licensen gäller inte längre. Hör av dig om det är fel.' },
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

/** Svaret med licensen (samma form för verify-purchase och recover-license). */
export function licenseResponseBody(result: { licenseKey: string; payload: { plan: PlanId; iat: number; exp?: number } }): VerifyPurchaseResponse {
  return {
    licenseKey: result.licenseKey,
    plan: result.payload.plan,
    issuedAt: new Date(result.payload.iat * 1000).toISOString(),
    expiresAt: result.payload.exp !== undefined ? new Date(result.payload.exp * 1000).toISOString() : null,
  }
}

export async function handleVerifyPurchase(req: Request, deps: HandlerDeps): Promise<Response> {
  const prep = prepareRequest(req, deps, { limiter: verifyLimiter, needs: ['stripe', 'license'], notConfigured: VERIFY_ERRORS['ej-konfigurerad'].message })
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
  return json(200, licenseResponseBody(result), h)
}

// ---------------------------------------------------------------------------
// POST /api/stripe-webhook
// ---------------------------------------------------------------------------

const FULFILL_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])

/**
 * Händelser om återbetalningar och tvister. Webhooken skriver bara vad som hänt i metadata
 * `lagom_status` på betalningen, som information i Stripes dashboard. Själva spärren räknas alltid
 * fram ur Stripes återbetalningar och tvister (verify-purchase, "Tappat nyckeln?" och spärrlistan
 * läser dem direkt) – så en händelse som kommer i fel ordning kan inte spärra en vunnen tvist, och
 * webhooken rör aldrig supportens manuella beslut i `lagom_revoked`.
 */
const REVOCATION_EVENTS = new Set(['charge.refunded', 'charge.dispute.created', 'charge.dispute.funds_withdrawn', 'charge.dispute.closed'])

/** Status att skriva i `lagom_status`, eller null = ingen ändring. */
export function purchaseStatusFor(type: string, obj: Record<string, unknown>): string | null {
  if (type === 'charge.refunded') {
    // Bara full återbetalning – en delvis återbetalning (prisavdrag) behåller licensen.
    return obj.object === 'charge' && isFullyRefunded(obj as unknown as StripeCharge) ? 'aterbetald' : null
  }
  if (obj.object !== 'dispute') return null
  const status = (obj as unknown as StripeDispute).status
  if (type === 'charge.dispute.closed') {
    if (status === 'won') return 'tvist-vunnen'
    if (status === 'warning_closed') return 'forfragan-stangd'
    return status === 'lost' ? 'tvist-forlorad' : null
  }
  // Förfrågningar (warning_*) spärrar inte – bara tvister där pengarna har dragits tillbaka.
  return REVOKING_DISPUTES.has(status) ? 'bestriden' : null
}

function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') return (value as { id: string }).id
  return null
}

async function handleRevocationEvent(event: StripeEvent, cfg: ServerConfig, deps: HandlerDeps, log: Logger): Promise<Response> {
  const obj = event.data.object
  const status = purchaseStatusFor(event.type, obj)
  const intentId = idOf(obj.payment_intent)
  if (status === null || !intentId || !/^pi_[A-Za-z0-9_]+$/.test(intentId)) return json(200, { received: true, ignored: true })

  const needs = missingConfig(cfg, ['stripe'])
  if (needs.length > 0) {
    log.error('Kan inte markera återbetalningen – miljövariabler saknas', { saknas: needs })
    return errorResponse(500, 'ej-konfigurerad', 'Händelsen kunde inte hanteras just nu.')
  }
  try {
    const intent = await stripeRequest<StripePaymentIntent>({
      method: 'GET',
      path: `/payment_intents/${encodeURIComponent(intentId)}`,
      secretKey: cfg.stripeSecretKey,
      fetch: deps.fetch,
    })
    if (!isLagomIntent(intent)) return json(200, { received: true, ignored: true })
    if (intent.metadata?.[STATUS_METADATA_KEY] === status) return json(200, { received: true })
    await stripeRequest<StripePaymentIntent>({
      method: 'POST',
      path: `/payment_intents/${encodeURIComponent(intentId)}`,
      params: { metadata: { [STATUS_METADATA_KEY]: status } },
      secretKey: cfg.stripeSecretKey,
      fetch: deps.fetch,
    })
    log.info('Köpets status noterad (återbetalning eller tvist)', { event: event.id, type: event.type, betalning: intentId, status })
    return json(200, { received: true })
  } catch (e) {
    if (e instanceof StripeError && e.status === 404) return json(200, { received: true, ignored: true })
    log.error('Kunde inte markera betalningen', { event: event.id, betalning: intentId, fel: errorText(e) })
    // 500 → Stripe försöker igen senare.
    return errorResponse(500, 'betaltjanst-fel', 'Händelsen kunde inte hanteras just nu.')
  }
}

/**
 * Tar emot händelser från Stripe. Signaturen kontrolleras alltid. För betalda Lagom-köp utfärdas
 * licensen direkt och sparas på betalningen – även om kunden stängde fliken innan tacksidan
 * hann laddas. Återbetalningar och tvister noteras på betalningen (`lagom_status`, bara information).
 * Inga personuppgifter loggas.
 */
export async function handleStripeWebhook(req: Request, deps: HandlerDeps): Promise<Response> {
  const cfg = readConfig(deps.env, deps.context?.site?.url, deps.context?.deploy?.context)
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
    if (typeof event?.type !== 'string' || typeof event.data?.object !== 'object' || event.data.object === null) {
      throw new Error('saknar type/data')
    }
  } catch {
    return errorResponse(400, 'ogiltig-begaran', 'Händelsen kunde inte tolkas.')
  }

  if (REVOCATION_EVENTS.has(event.type)) return handleRevocationEvent(event, cfg, deps, log)

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
