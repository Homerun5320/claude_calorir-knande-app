/**
 * POST /api/recover-license – "Hämta min licensnyckel igen" för webbköp.
 *
 * Kropp: { email, receipt } där `receipt` är kvittonumret från Stripes kvittomejl (t.ex.
 * "1234-5678") eller köp-id:t (cs_live_…). Fakturanumret godtas inte: Stripes fakturanummer är
 * löpande (PREFIX-0001, -0002 …) och prefixet står på varje kvitto, så det går att gissa.
 * Svaret är samma licens som köpet redan har gett (sparad på betalningen i Stripe) – eller, om
 * ingen sparats, en nyckel med exakt samma innehåll: { licenseKey, plan, issuedAt, expiresAt }.
 *
 * Skydd mot att någon provar sig fram:
 * - fel e-post och fel nummer ger samma svar (404 'hittades-inte') och samma svarstid
 *   (`RECOVER_MIN_MS`), så att det inte går att ta reda på vilka e-postadresser som har köpt,
 * - högst 5 försök per IP-adress och 10 minuter, och högst 10 försök per e-postadress och timme
 *   (per funktionsinstans), och dessutom Netlifys gräns per IP-adress över alla instanser (`config`
 *   i netlify/functions/recover-license.mts, se docs/BETALNING.md),
 * - återbetalda och bestridda köp ger ingen licens (410 'aterbetald').
 * E-postadressen loggas aldrig.
 */
import type { ServerConfig } from './config.ts'
import { APP_MARKER, SESSION_ID_RE, errorText, fulfillSession, isLagomIntent, type FulfillCode } from './fulfillment.ts'
import { VERIFY_ERRORS, licenseResponseBody, prepareRequest, type HandlerDeps } from './handlers.ts'
import { RateLimiter, errorResponse, json, readJsonObject } from './http.ts'
import { StripeError, stripeRequest, type FetchLike, type StripeCheckoutSession, type StripeList } from './stripe.ts'

/** Svar som inte ger en licens tar minst så här lång tid (ms). */
export const RECOVER_MIN_MS = 1500

const ipLimiter = new RateLimiter(5, 10 * 60_000)
const emailLimiter = new RateLimiter(10, 60 * 60_000)

const MAX_BODY_BYTES = 2 * 1024

export const RECOVER_NOT_FOUND =
  'Vi hittar inget köp med den e-postadressen och det numret. Kontrollera att det är samma e-post som vid köpet och numret från kvittot – eller kontakta supporten, så hjälper vi dig.'

const NOT_CONFIGURED = 'Det går inte att hämta licensen just nu. Försök igen senare eller kontakta supporten.'

/** Koder som inte får avslöja om köpet finns – de ger samma svar som "hittades inte". */
const HIDDEN_CODES: ReadonlySet<FulfillCode> = new Set<FulfillCode>(['hittades-inte', 'okant-kop', 'avbruten', 'ej-betald'])

/** Enkel kontroll av e-postadressen (högst 254 tecken). */
export function isEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/** Kvittonummer jämförs utan mellanslag, bindestreck och skiftläge. */
export function receiptKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Ta bort "#", "Kvitto" o.d. och mellanslag runt numret. */
function cleanReceipt(value: string): string {
  return value
    .trim()
    .replace(/^(kvitto(nummer)?|receipt|#|:|\s)+/i, '')
    .trim()
}

function sessionEmail(session: StripeCheckoutSession): string {
  return (session.customer_details?.email ?? '').trim().toLowerCase()
}

/**
 * Numret på köpet som kunden kan ha: kvittonumret. (Köp-id:t hämtas direkt, se `findPurchase`.)
 * Fakturanumret räknas inte – det är löpande och går att gissa.
 */
function receiptNumbersOf(session: StripeCheckoutSession): string[] {
  const intent = typeof session.payment_intent === 'object' && session.payment_intent !== null ? session.payment_intent : null
  const charge = intent && typeof intent.latest_charge === 'object' && intent.latest_charge !== null ? intent.latest_charge : null
  return charge?.receipt_number ? [charge.receipt_number] : []
}

function isLagomSession(session: StripeCheckoutSession): boolean {
  return session.metadata?.app === APP_MARKER || isLagomIntent(typeof session.payment_intent === 'object' ? session.payment_intent : null)
}

/**
 * Leta upp köpet. Med ett köp-id hämtas sessionen direkt; annars söks kundens sessioner fram på
 * e-postadressen (som den skrevs och med små bokstäver) och numret jämförs med kvittonumret.
 */
export async function findPurchase(
  email: string,
  receipt: string,
  opts: { cfg: ServerConfig; fetch?: FetchLike },
): Promise<StripeCheckoutSession | null> {
  const wantedEmail = email.trim().toLowerCase()
  if (SESSION_ID_RE.test(receipt)) {
    try {
      const session = await stripeRequest<StripeCheckoutSession>({
        method: 'GET',
        path: `/checkout/sessions/${encodeURIComponent(receipt)}`,
        secretKey: opts.cfg.stripeSecretKey,
        fetch: opts.fetch,
      })
      return isLagomSession(session) && sessionEmail(session) === wantedEmail ? session : null
    } catch (e) {
      if (e instanceof StripeError && e.status === 404) return null
      throw e
    }
  }

  const wanted = receiptKey(receipt)
  if (wanted.length < 4) return null
  const variants = [...new Set([email.trim(), wantedEmail])]
  for (const variant of variants) {
    const list = await stripeRequest<StripeList<StripeCheckoutSession>>({
      method: 'GET',
      path: '/checkout/sessions',
      params: {
        customer_details: { email: variant },
        status: 'complete',
        limit: 100,
        expand: ['data.payment_intent.latest_charge'],
      },
      secretKey: opts.cfg.stripeSecretKey,
      fetch: opts.fetch,
    })
    const match = (list.data ?? []).find(
      (s) => isLagomSession(s) && sessionEmail(s) === wantedEmail && receiptNumbersOf(s).some((n) => receiptKey(n) === wanted),
    )
    if (match) return match
  }
  return null
}

export async function handleRecoverLicense(req: Request, deps: HandlerDeps): Promise<Response> {
  const prep = prepareRequest(req, deps, {
    limiter: ipLimiter,
    needs: ['stripe', 'license'],
    notConfigured: NOT_CONFIGURED,
    forbidden: 'Den här webbplatsen får inte hämta licenser från Lagom.',
  })
  if (!prep.ok) return prep.response
  const { cfg, origin, now: startedAt, log } = prep
  const h = origin.headers
  const clock = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  /** Svar utan licens: vänta tills minsta svarstiden har gått. */
  const evenly = async (res: Response): Promise<Response> => {
    const left = RECOVER_MIN_MS - (clock() - startedAt)
    if (left > 0) await sleep(left)
    return res
  }

  const body = await readJsonObject(req, MAX_BODY_BYTES, h)
  if (!body.ok) return body.response
  const email = typeof body.value.email === 'string' ? body.value.email.trim() : ''
  const receipt = typeof body.value.receipt === 'string' ? cleanReceipt(body.value.receipt) : ''
  if (!isEmail(email)) return errorResponse(400, 'ogiltig-epost', 'Skriv e-postadressen du använde vid köpet.', h)
  if (receipt.length < 4 || receipt.length > 255) {
    return errorResponse(400, 'ogiltigt-kvitto', 'Skriv kvittonumret från kvittot, eller köp-id:t (cs_…).', h)
  }
  if (!(deps.keyRateLimiter ?? emailLimiter).take(email.toLowerCase(), startedAt)) {
    return errorResponse(429, 'for-manga', 'Många försök på kort tid. Vänta en stund och försök igen.', { ...h, 'Retry-After': '600' })
  }

  let session: StripeCheckoutSession | null
  try {
    session = await findPurchase(email, receipt, { cfg, fetch: deps.fetch })
  } catch (e) {
    const status = e instanceof StripeError ? e.status : 0
    log.error('Kunde inte söka efter köpet i Stripe', { status, fel: errorText(e) })
    return evenly(errorResponse(502, 'betaltjanst-fel', 'Vi når inte betaltjänsten just nu. Försök igen om en stund.', h))
  }
  if (!session) return evenly(errorResponse(404, 'hittades-inte', RECOVER_NOT_FOUND, h))

  const result = await fulfillSession(session.id, { cfg, fetch: deps.fetch, now: startedAt, log })
  if (!result.ok) {
    if (HIDDEN_CODES.has(result.code)) return evenly(errorResponse(404, 'hittades-inte', RECOVER_NOT_FOUND, h))
    const e = VERIFY_ERRORS[result.code]
    return evenly(errorResponse(e.status, result.code, e.message, h))
  }
  log.info('Licensen hämtades igen', { session: session.id, plan: result.payload.plan })
  return json(200, licenseResponseBody(result), h)
}
