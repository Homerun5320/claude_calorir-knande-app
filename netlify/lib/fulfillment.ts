/**
 * Från betald Stripe-session till licensnyckel.
 *
 * Planen läses ALDRIG från klienten: den kommer från sessionens metadata (som bara servern kan
 * sätta, med den hemliga nyckeln) och kontrolleras mot det som faktiskt betalades.
 * Den utfärdade nyckeln sparas på betalningen i Stripe (metadata "lagom_license"), så att samma
 * köp alltid ger exakt samma nyckel och supporten kan hitta den i Stripes dashboard.
 */
import type { LicensePayload } from '../../src/lib/license.ts'
import type { ServerConfig } from './config.ts'
import { isIssuedLicenseValid, issueLicense, licensePayloadFor, publicKeyFromPrivate } from './licensing.ts'
import { CURRENCY, SERVER_PLANS, isPlanId, priceInOre, type PlanId } from './plans.ts'
import { StripeError, stripeRequest, type FetchLike, type StripeCheckoutSession, type StripePaymentIntent } from './stripe.ts'

/** Markering i metadata som skiljer Lagoms köp från annat som säljs på samma Stripe-konto. */
export const APP_MARKER = 'lagom'
/** Metadata-nyckeln på betalningen (PaymentIntent) där licensnyckeln sparas. */
export const LICENSE_METADATA_KEY = 'lagom_license'

/** Stripes Checkout-id: cs_test_… eller cs_live_… */
export const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{8,250}$/

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

export type SessionProblem = 'okant-kop' | 'ej-betald' | 'avbruten'

export type SessionCheck = { ok: true; plan: PlanId } | { ok: false; code: SessionProblem; detail: string }

/**
 * Kontrollera att en Checkout-session är ett slutfört och betalt Lagom-köp och ta fram planen.
 * Kräver att `line_items` är expanderad.
 */
export function validatePaidSession(session: StripeCheckoutSession, cfg: Pick<ServerConfig, 'priceIds'>): SessionCheck {
  const meta = session.metadata ?? {}
  if (meta.app !== APP_MARKER || !isPlanId(meta.plan)) return { ok: false, code: 'okant-kop', detail: 'saknar Lagom-metadata' }
  if (session.mode !== 'payment') return { ok: false, code: 'okant-kop', detail: `mode=${session.mode}` }
  if (session.status === 'expired') return { ok: false, code: 'avbruten', detail: 'sessionen har gått ut' }
  if (session.status !== 'complete') return { ok: false, code: 'ej-betald', detail: `status=${session.status}` }
  if (session.payment_status !== 'paid') return { ok: false, code: 'ej-betald', detail: `payment_status=${session.payment_status}` }
  if (session.currency !== CURRENCY) return { ok: false, code: 'okant-kop', detail: `valuta=${session.currency}` }

  const plan = SERVER_PLANS[meta.plan]
  const items = session.line_items?.data ?? []
  if (items.length !== 1 || items[0].quantity !== 1 || !items[0].price) {
    return { ok: false, code: 'okant-kop', detail: `${items.length} rader` }
  }
  const price = items[0].price
  // Det betalade priset ska vara ett av planens pris-id:n eller exakt planens belopp i kronor.
  const knownPrice = cfg.priceIds[plan.id].includes(price.id)
  const sameAmount = price.currency === CURRENCY && price.unit_amount === priceInOre(plan)
  if (!knownPrice && !sameAmount) {
    return { ok: false, code: 'okant-kop', detail: `pris ${price.id} (${price.unit_amount} ${price.currency}) passar inte ${plan.id}` }
  }
  return { ok: true, plan: plan.id }
}

export type FulfillCode = 'hittades-inte' | SessionProblem | 'utgangen' | 'ej-konfigurerad' | 'betaltjanst-fel'

export type FulfillResult =
  | { ok: true; licenseKey: string; payload: LicensePayload; reused: boolean; livemode: boolean }
  | { ok: false; code: FulfillCode }

export interface FulfillContext {
  cfg: ServerConfig
  fetch?: FetchLike
  /** Epoch-ms. */
  now: number
  log: Logger
}

/**
 * Hämta sessionen från Stripe, kontrollera köpet och lämna ut licensnyckeln. Idempotent: en
 * nyckel som redan har sparats på betalningen återanvänds så länge den är giltig.
 */
export async function fulfillSession(sessionId: string, ctx: FulfillContext): Promise<FulfillResult> {
  const { cfg, log } = ctx
  let session: StripeCheckoutSession
  try {
    session = await stripeRequest<StripeCheckoutSession>({
      method: 'GET',
      path: `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      params: { expand: ['line_items', 'payment_intent'] },
      secretKey: cfg.stripeSecretKey,
      fetch: ctx.fetch,
    })
  } catch (e) {
    if (e instanceof StripeError && e.status === 404) return { ok: false, code: 'hittades-inte' }
    if (e instanceof StripeError && (e.status === 401 || e.status === 403)) {
      log.error('Stripe nekade anropet – kontrollera STRIPE_SECRET_KEY och dess behörigheter', { status: e.status, type: e.type })
      return { ok: false, code: 'ej-konfigurerad' }
    }
    log.error('Kunde inte hämta Checkout-sessionen', { session: sessionId, fel: errorText(e) })
    return { ok: false, code: 'betaltjanst-fel' }
  }

  const check = validatePaidSession(session, cfg)
  if (!check.ok) {
    if (check.code === 'okant-kop') log.warn('Köpet godkändes inte', { session: session.id, orsak: check.detail })
    return { ok: false, code: check.code }
  }

  const payload = licensePayloadFor(session.id, check.plan, session.created)
  if (payload.exp !== undefined && payload.exp * 1000 <= ctx.now) return { ok: false, code: 'utgangen' }

  let publicKey: string
  try {
    publicKey = await publicKeyFromPrivate(cfg.licensePrivateKey)
  } catch {
    log.error('LICENSE_PRIVATE_KEY är ingen giltig ECDSA P-256-nyckel (PKCS#8, base64)')
    return { ok: false, code: 'ej-konfigurerad' }
  }

  const intent = typeof session.payment_intent === 'object' && session.payment_intent !== null ? session.payment_intent : null
  const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id
  const stored = intent?.metadata?.[LICENSE_METADATA_KEY]
  if (stored && (await isIssuedLicenseValid(stored, payload, publicKey))) {
    return { ok: true, licenseKey: stored, payload, reused: true, livemode: session.livemode }
  }

  let licenseKey: string
  try {
    licenseKey = await issueLicense(payload, cfg.licensePrivateKey)
  } catch (e) {
    log.error('Licensen kunde inte signeras', { fel: errorText(e) })
    return { ok: false, code: 'ej-konfigurerad' }
  }

  if (intentId) {
    try {
      await stripeRequest<StripePaymentIntent>({
        method: 'POST',
        path: `/payment_intents/${encodeURIComponent(intentId)}`,
        params: { metadata: { [LICENSE_METADATA_KEY]: licenseKey } },
        secretKey: cfg.stripeSecretKey,
        fetch: ctx.fetch,
      })
    } catch (e) {
      // Kunden får ändå sin nyckel – nästa verifiering försöker spara igen.
      log.warn('Licensen kunde inte sparas på betalningen i Stripe', { session: session.id, fel: errorText(e) })
    }
  }
  log.info('Licens utfärdad', { session: session.id, plan: payload.plan, livemode: session.livemode })
  return { ok: true, licenseKey, payload, reused: false, livemode: session.livemode }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
