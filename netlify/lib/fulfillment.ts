/**
 * Från betald Stripe-session till licensnyckel.
 *
 * Planen läses ALDRIG från klienten: den kommer från sessionens metadata (som bara servern kan
 * sätta, med den hemliga nyckeln) och kontrolleras mot det som faktiskt betalades.
 * Den utfärdade nyckeln sparas på betalningen i Stripe (metadata "lagom_license"), så att samma
 * köp alltid ger exakt samma nyckel och supporten kan hitta den i Stripes dashboard.
 *
 * Återbetalda och bestridda köp ger ingen licens (koden 'aterbetald'). Se `revocationOf`.
 */
import { decodeLicense, licenseKeyHash, type LicensePayload } from '../../src/lib/license.ts'
import { purchaseModeProblem, type ServerConfig } from './config.ts'
import { isIssuedLicenseValid, issueLicense, licenseKid, licensePayloadFor, publicKeyFromPrivate } from './licensing.ts'
import { CURRENCY, SERVER_PLANS, acceptedAmountsInOre, isPlanId, type PlanId } from './plans.ts'
import {
  StripeError,
  stripeRequest,
  type FetchLike,
  type StripeCharge,
  type StripeCheckoutSession,
  type StripeDispute,
  type StripeDisputeStatus,
  type StripeList,
  type StripePaymentIntent,
} from './stripe.ts'

/** Markering i metadata som skiljer Lagoms köp från annat som säljs på samma Stripe-konto. */
export const APP_MARKER = 'lagom'
/** Metadata-nyckeln på betalningen (PaymentIntent) där licensnyckeln sparas. */
export const LICENSE_METADATA_KEY = 'lagom_license'
/**
 * Metadata-nyckeln på betalningen för supportens manuella beslut: '1' = spärrad (t.ex. en nyckel
 * som delats öppet), '0' = gäller ändå (supportens undantag, t.ex. en återbetalning av goodwill där
 * kunden får behålla licensen). Sätts bara för hand – webhooken rör den aldrig, så att en händelse
 * i fel ordning inte kan spärra en vunnen tvist eller häva en manuell spärr.
 */
export const REVOKED_METADATA_KEY = 'lagom_revoked'
/**
 * Metadata-nyckeln där webhooken skriver vad som senast hänt med betalningen ('aterbetald',
 * 'bestriden', 'tvist-vunnen' …). Bara information i Stripes dashboard – spärren räknas alltid fram
 * ur Stripes återbetalningar och tvister (se `revocationOf`).
 */
export const STATUS_METADATA_KEY = 'lagom_status'

/** Stripes Checkout-id: cs_test_… eller cs_live_… */
export const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{8,250}$/

/**
 * Tvister där pengarna har dragits tillbaka från oss (eller återbetalats direkt, "prevented").
 * Förfrågningar (warning_*) och tvister som vi har vunnit spärrar inte licensen.
 */
export const REVOKING_DISPUTES: ReadonlySet<StripeDisputeStatus> = new Set<StripeDisputeStatus>(['needs_response', 'under_review', 'lost', 'prevented'])

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
  // Det betalade priset ska vara ett av planens pris-id:n eller exakt planens belopp i kronor –
  // dagens eller ett tidigare pris (köp före en prisändring ska fortfarande gå att hämta igen).
  const knownPrice = cfg.priceIds[plan.id].includes(price.id)
  const sameAmount = price.currency === CURRENCY && price.unit_amount !== null && acceptedAmountsInOre(plan).includes(price.unit_amount)
  if (!knownPrice && !sameAmount) {
    return { ok: false, code: 'okant-kop', detail: `pris ${price.id} (${price.unit_amount} ${price.currency}) passar inte ${plan.id}` }
  }
  return { ok: true, plan: plan.id }
}

// ---------------------------------------------------------------------------
// Återbetalda och bestridda köp
// ---------------------------------------------------------------------------

/** true när hela beloppet har betalats tillbaka. En delvis återbetalning (prisavdrag) räknas inte. */
export function isFullyRefunded(charge: Pick<StripeCharge, 'refunded' | 'amount' | 'amount_refunded'>): boolean {
  return charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount)
}

/** true om betalningen tillhör Lagom (metadata app=lagom, satt när köpet skapades). */
export function isLagomIntent(intent: Pick<StripePaymentIntent, 'metadata'> | null | undefined): boolean {
  return intent?.metadata?.app === APP_MARKER
}

export type RevocationReason = 'markerad' | 'aterbetald' | 'bestriden'

/**
 * Varför licensen för ett köp inte gäller, eller null om den gäller. Kräver att
 * `latest_charge` är expanderad på betalningen. Ordning:
 * 1. `lagom_revoked` = '0' → gäller alltid (supportens undantag), '1' → spärrad.
 * 2. Hela beloppet återbetalt → spärrad.
 * 3. Bestriden: tvisterna för debiteringen hämtas från Stripe. Spärrad om någon av dem har
 *    dragit tillbaka pengarna (se `REVOKING_DISPUTES`) – inte vid förfrågningar eller vunna tvister.
 * Kastar StripeError om tvisterna inte kunde hämtas.
 */
export async function revocationOf(
  intent: StripePaymentIntent,
  opts: { secretKey: string; fetch?: FetchLike },
): Promise<RevocationReason | null> {
  const marker = intent.metadata?.[REVOKED_METADATA_KEY]
  if (marker === '0') return null
  if (marker === '1') return 'markerad'
  const charge = typeof intent.latest_charge === 'object' && intent.latest_charge !== null ? intent.latest_charge : null
  if (!charge) return null
  if (isFullyRefunded(charge)) return 'aterbetald'
  if (charge.disputed === true) {
    const disputes = await stripeRequest<StripeList<StripeDispute>>({
      method: 'GET',
      path: '/disputes',
      params: { charge: charge.id, limit: 10 },
      secretKey: opts.secretKey,
      fetch: opts.fetch,
    })
    if ((disputes.data ?? []).some((d) => REVOKING_DISPUTES.has(d.status))) return 'bestriden'
  }
  return null
}

/**
 * Köp-id (Checkout-sessionens id) för en betalning, ur licensen som sparats på den. null om
 * ingen licens har sparats.
 */
export function sessionIdFromIntent(intent: Pick<StripePaymentIntent, 'metadata'>): string | null {
  const stored = intent.metadata?.[LICENSE_METADATA_KEY]
  const id = stored ? decodeLicense(stored)?.id : undefined
  return id && SESSION_ID_RE.test(id) ? id : null
}

// ---------------------------------------------------------------------------
// Utfärdande
// ---------------------------------------------------------------------------

export type FulfillCode = 'hittades-inte' | SessionProblem | 'aterbetald' | 'utgangen' | 'ej-konfigurerad' | 'betaltjanst-fel'

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

/** Expansionerna som `fulfillSession` behöver (rader, betalning och senaste debiteringen). */
export const SESSION_EXPAND = ['line_items', 'payment_intent', 'payment_intent.latest_charge']

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
      params: { expand: SESSION_EXPAND },
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

  // Ett testköp ger aldrig en licens i produktionen (och ett skarpt köp aldrig i en förhandsversion).
  const modeProblem = purchaseModeProblem(session.livemode, cfg)
  if (modeProblem) {
    log.error(modeProblem, { session: session.id, livemode: session.livemode })
    return { ok: false, code: 'ej-konfigurerad' }
  }

  // Manuellt spärrad (LICENSE_REVOKED_IDS): lämnas inte ut igen.
  if (cfg.revokedIds.includes(session.id)) {
    log.warn('Licensen är spärrad (LICENSE_REVOKED_IDS) – ingen licens lämnas ut', { session: session.id })
    return { ok: false, code: 'aterbetald' }
  }

  const intent = typeof session.payment_intent === 'object' && session.payment_intent !== null ? session.payment_intent : null
  const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : intent?.id

  // Återbetalt eller bestritt köp: ingen licens. Bara id:n loggas, inga personuppgifter.
  if (intent) {
    let reason: RevocationReason | null
    try {
      reason = await revocationOf(intent, { secretKey: cfg.stripeSecretKey, fetch: ctx.fetch })
    } catch (e) {
      log.error('Kunde inte kontrollera tvister för köpet', { session: session.id, betalning: intent.id, fel: errorText(e) })
      return { ok: false, code: 'betaltjanst-fel' }
    }
    if (reason) {
      log.warn('Köpet är återbetalt eller bestritt – ingen licens lämnas ut', { session: session.id, betalning: intent.id, orsak: reason })
      return { ok: false, code: 'aterbetald' }
    }
  }

  const base = licensePayloadFor(session.id, check.plan, session.created)
  if (base.exp !== undefined && base.exp * 1000 <= ctx.now) return { ok: false, code: 'utgangen' }

  let publicKey: string
  let kid: string
  try {
    publicKey = await publicKeyFromPrivate(cfg.licensePrivateKey)
    kid = await licenseKid(publicKey)
  } catch {
    log.error('LICENSE_PRIVATE_KEY är ingen giltig ECDSA P-256-nyckel (PKCS#8, base64)')
    return { ok: false, code: 'ej-konfigurerad' }
  }
  const payload = licensePayloadFor(session.id, check.plan, session.created, kid)

  const stored = intent?.metadata?.[LICENSE_METADATA_KEY]
  if (stored && cfg.revokedIds.length > 0 && cfg.revokedIds.includes(await licenseKeyHash(stored))) {
    log.warn('Licensen är spärrad (nyckelhash i LICENSE_REVOKED_IDS) – ingen licens lämnas ut', { session: session.id })
    return { ok: false, code: 'aterbetald' }
  }
  if (stored && (await isIssuedLicenseValid(stored, payload, publicKey))) {
    return { ok: true, licenseKey: stored, payload: decodeLicense(stored) ?? payload, reused: true, livemode: session.livemode }
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
