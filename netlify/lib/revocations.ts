/**
 * GET /api/license-revocations – spärrlistan för återbetalda och bestridda webbköp.
 *
 * Ingen databas: Stripe är källan. Listan räknas fram ur Stripes återbetalningar och tvister och
 * signeras med licensernas privata nyckel (ECDSA P-256, samma som licenserna):
 *
 *   { "token": "LAGOMREV1.<base64url(JSON { v: 1, issuedAt, ids })>.<base64url(signatur)>", "issuedAt": … }
 *
 * `ids` är köp-id:n, alltså licensens `id` (Checkout-sessionens id, cs_…). Samma köp ger alltid
 * samma id, även om nyckeln skulle signeras om, så appen känner igen alla nycklar för köpet.
 * Listan innehåller inga namn och inga e-postadresser. Till det kommer id:n (eller nyckelhashar,
 * se `licenseIdOf`) från LICENSE_REVOKED_IDS för licenser som spärras manuellt.
 *
 * Regler (samma som när en licens lämnas ut, se `revocationOf` i fulfillment.ts):
 * - hela beloppet återbetalt → spärrad (en delvis återbetalning, t.ex. prisavdrag, spärrar inte),
 * - tvist där pengarna har dragits tillbaka (needs_response, under_review, lost, prevented)
 *   → spärrad; förfrågningar och vunna tvister spärrar inte,
 * - `lagom_revoked` = '0' på betalningen → aldrig spärrad (supportens undantag).
 *
 * Tidsgräns: en livstidslicens gäller för alltid, så ett återbetalt livstidsköp måste stå kvar i
 * listan för alltid – annars skulle nyckeln börja gälla igen när köpet föll ur listan. Därför
 * hämtas alla återbetalningar och tvister (utan datumfilter). Bara årslicenser från köp som är
 * äldre än 400 dagar lämnas bort: de har ändå gått ut (365 dagar).
 *
 * Svaret får cachas i en timme (webbläsare och Netlifys CDN). Funktionen minns dessutom listan i
 * tio minuter, så att Stripe inte frågas vid varje anrop.
 */
import { errorText, isFullyRefunded, isLagomIntent, REVOKED_METADATA_KEY, REVOKING_DISPUTES, SESSION_ID_RE, sessionIdFromIntent } from './fulfillment.ts'
import type { Logger } from './fulfillment.ts'
import { prepareRequest, type HandlerDeps } from './handlers.ts'
import { RateLimiter, errorResponse, json } from './http.ts'
import type { ServerConfig } from './config.ts'
import { signRevocations } from './licensing.ts'
import {
  StripeError,
  stripeListAll,
  stripeRequest,
  type FetchLike,
  type StripeCheckoutSession,
  type StripeDispute,
  type StripeList,
  type StripePaymentIntent,
  type StripeRefund,
} from './stripe.ts'

/**
 * Årslicenser från köp som är äldre än så här lämnas bort ur listan – de har ändå gått ut (365
 * dagar, plus marginal). Livstidslicenser har ingen tidsgräns.
 */
export const REVOCATION_WINDOW_DAYS = 400
/** Hur länge funktionen minns en uträknad lista. */
export const REVOCATION_MEMORY_MS = 10 * 60_000
/** Cachetid för svaret (webbläsare och CDN). */
export const REVOCATION_CACHE_SEC = 3600

const revocationLimiter = new RateLimiter(60, 60_000)

export interface RevocationContext {
  cfg: ServerConfig
  fetch?: FetchLike
  /** Epoch-ms. */
  now: number
  log: Logger
}

function expanded<T extends object>(value: string | T | null | undefined): T | null {
  return typeof value === 'object' && value !== null ? value : null
}

/** Kör `fn` för varje värde, högst `limit` åt gången. */
async function mapLimited<T, R>(values: readonly T[], limit: number, fn: (value: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let next = 0
  const worker = async () => {
    while (next < values.length) {
      const i = next++
      out[i] = await fn(values[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker))
  return out
}

/** Köp-id för en betalning: ur den sparade licensen, annars genom att fråga Stripe efter sessionen. */
async function sessionIdFor(intent: StripePaymentIntent, ctx: RevocationContext): Promise<string | null> {
  const fromLicense = sessionIdFromIntent(intent)
  if (fromLicense) return fromLicense
  const res = await stripeRequest<StripeList<StripeCheckoutSession>>({
    method: 'GET',
    path: '/checkout/sessions',
    params: { payment_intent: intent.id, limit: 1 },
    secretKey: ctx.cfg.stripeSecretKey,
    fetch: ctx.fetch,
  })
  const session = (res.data ?? [])[0]
  return session && SESSION_ID_RE.test(session.id) ? session.id : null
}

/**
 * true för en årslicens från ett köp som gjordes före `cutoffSec`: den har redan gått ut och behöver
 * inte spärras. Betalningen skapas samtidigt som eller strax efter Checkout-sessionen (som licensens
 * datum räknas från), så köpet är minst så gammalt. Saknas planen eller datumet räknas licensen som
 * giltig – hellre en rad för mycket i listan än en återbetald licens som börjar gälla igen.
 */
function isExpiredAnnual(intent: StripePaymentIntent, cutoffSec: number): boolean {
  return intent.metadata?.plan === 'ar' && typeof intent.created === 'number' && intent.created < cutoffSec
}

/**
 * Köp-id:n för återbetalda och bestridda Lagom-köp (livstidslicenser utan tidsgräns, årslicenser
 * från köp de senaste 400 dagarna), plus LICENSE_REVOKED_IDS. Sorterade och utan dubbletter.
 * Kastar StripeError om Stripe inte svarar.
 */
export async function collectRevokedIds(ctx: RevocationContext): Promise<{ ids: string[]; truncated: boolean }> {
  const { cfg } = ctx
  const annualCutoff = Math.floor(ctx.now / 1000) - REVOCATION_WINDOW_DAYS * 86_400
  // Inget datumfilter: ett återbetalt livstidsköp ska stå kvar i listan hur gammalt det än är.
  const [refunds, disputes] = await Promise.all([
    stripeListAll<StripeRefund>({
      path: '/refunds',
      params: { expand: ['data.charge', 'data.payment_intent'] },
      secretKey: cfg.stripeSecretKey,
      fetch: ctx.fetch,
    }),
    stripeListAll<StripeDispute>({
      path: '/disputes',
      params: { expand: ['data.payment_intent'] },
      secretKey: cfg.stripeSecretKey,
      fetch: ctx.fetch,
    }),
  ])

  const intents = new Map<string, StripePaymentIntent>()
  for (const refund of refunds.items) {
    const charge = expanded(refund.charge)
    const intent = expanded(refund.payment_intent)
    // Debiteringens nuvarande läge avgör: flera delåterbetalningar som tillsammans blir hela
    // beloppet spärrar, en misslyckad återbetalning gör det inte.
    if (charge && intent && isFullyRefunded(charge)) intents.set(intent.id, intent)
  }
  for (const dispute of disputes.items) {
    const intent = expanded(dispute.payment_intent)
    if (intent && REVOKING_DISPUTES.has(dispute.status)) intents.set(intent.id, intent)
  }

  const lagom = [...intents.values()].filter(
    (pi) => isLagomIntent(pi) && pi.metadata?.[REVOKED_METADATA_KEY] !== '0' && !isExpiredAnnual(pi, annualCutoff),
  )
  const sessionIds = await mapLimited(lagom, 5, (pi) => sessionIdFor(pi, ctx))
  const ids = new Set<string>(cfg.revokedIds)
  for (const id of sessionIds) if (id) ids.add(id)
  const truncated = refunds.truncated || disputes.truncated
  if (truncated) ctx.log.warn('Spärrlistan: fler än 2 000 återbetalningar eller tvister – de äldsta kom inte med')
  return { ids: [...ids].sort(), truncated }
}

interface MemoryEntry {
  key: string
  token: string
  issuedAt: number
  until: number
}

let memory: MemoryEntry | null = null

/** Endast för tester: glöm den uträknade listan. */
export function resetRevocationMemory(): void {
  memory = null
}

/** Nyckeln för minnet: listan beror på Stripe-kontot, nyckelparet och de manuella id:na. */
function memoryKey(cfg: ServerConfig): string {
  return `${cfg.stripeSecretKey}|${cfg.licensePrivateKey}|${cfg.revokedIds.join(',')}`
}

const NOT_CONFIGURED = 'Spärrlistan är inte tillgänglig just nu. Din licens fungerar som vanligt.'

export async function handleLicenseRevocations(req: Request, deps: HandlerDeps): Promise<Response> {
  const prep = prepareRequest(req, deps, {
    limiter: revocationLimiter,
    needs: ['stripe', 'license'],
    notConfigured: NOT_CONFIGURED,
    method: 'GET',
    forbidden: 'Den här webbplatsen får inte hämta Lagoms spärrlista.',
  })
  if (!prep.ok) return prep.response
  const { cfg, origin, now, log } = prep
  const h = origin.headers

  const key = memoryKey(cfg)
  let entry = memory && memory.key === key && memory.until > now ? memory : null
  if (!entry) {
    let ids: string[]
    try {
      ids = (await collectRevokedIds({ cfg, fetch: deps.fetch, now, log })).ids
    } catch (e) {
      const status = e instanceof StripeError ? e.status : 0
      log.error('Spärrlistan kunde inte hämtas från Stripe', { status, fel: errorText(e) })
      if (status === 401 || status === 403) {
        log.error('Kontrollera att STRIPE_SECRET_KEY får läsa Refunds, Disputes, Charges, Payment Intents och Checkout Sessions')
      }
      return errorResponse(502, 'betaltjanst-fel', 'Spärrlistan kunde inte hämtas just nu. Försök igen senare.', h)
    }
    const issuedAt = Math.floor(now / 1000)
    let token: string
    try {
      token = await signRevocations(ids, issuedAt, cfg.licensePrivateKey)
    } catch {
      log.error('LICENSE_PRIVATE_KEY är ingen giltig ECDSA P-256-nyckel (PKCS#8, base64)')
      return errorResponse(503, 'ej-konfigurerad', NOT_CONFIGURED, h)
    }
    entry = { key, token, issuedAt, until: now + REVOCATION_MEMORY_MS }
    memory = entry
    log.info('Spärrlistan uppdaterad', { antal: ids.length })
  }

  return json(
    200,
    { token: entry.token, issuedAt: entry.issuedAt },
    {
      ...h,
      // Listan är signerad och likadan för alla – den får cachas en timme.
      'Cache-Control': `public, max-age=${REVOCATION_CACHE_SEC}`,
      'Netlify-CDN-Cache-Control': `public, durable, max-age=${REVOCATION_CACHE_SEC}, stale-while-revalidate=600`,
      // CORS-svaret beror på Origin – CDN:en får inte ge en webbplats ett svar som gällde en annan.
      Vary: 'Origin',
      'Netlify-Vary': 'header=Origin',
    },
  )
}
