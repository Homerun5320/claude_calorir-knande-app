// @vitest-environment node
/**
 * GET /api/license-revocations: spärrlistan räknas fram ur Stripes återbetalningar och tvister
 * (låtsas-Stripe) och signeras så att appen godkänner den.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { verifyRevocationList } from '../../src/lib/license.ts'
import { extractRevocationToken } from '../../src/features/premium/revocations.ts'
import { LICENSE_METADATA_KEY, REVOKED_METADATA_KEY } from '../lib/fulfillment.ts'
import type { HandlerDeps } from '../lib/handlers.ts'
import { RateLimiter } from '../lib/http.ts'
import { issueLicense, licensePayloadFor } from '../lib/licensing.ts'
import { REVOCATION_WINDOW_DAYS, collectRevokedIds, handleLicenseRevocations, resetRevocationMemory } from '../lib/revocations.ts'
import { readConfig } from '../lib/config.ts'
import { CREATED, NOW, SECRET, charge, fakeStripe, intent, licenseKeyPair, paidSession, recordingLogger, type FakeStripe } from './fakeStripe.ts'

const APP = 'https://lagom.example'
let keys: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
})

beforeEach(() => {
  resetRevocationMemory()
})

const S1 = 'cs_test_Aterbetald0000001'
const S3 = 'cs_test_Bestriden00000003'
const S7 = 'cs_test_Gammal0000000007'
const S9 = 'cs_test_ArNyligen0000009'
const NOW_SEC = Math.floor(NOW / 1000)
const OLD = NOW_SEC - (REVOCATION_WINDOW_DAYS + 1) * 86_400

/** Ett Lagom-köp med betalning pi_<n> och debitering ch_<n>. */
function addPurchase(
  stripe: FakeStripe,
  n: number,
  opts: { sessionId?: string; chargeOverrides?: Parameters<typeof charge>[1]; metadata?: Record<string, string>; created?: number } = {},
) {
  const pi = `pi_${n}`
  const ch = `ch_${n}`
  stripe.intents.set(pi, intent(pi, { latest_charge: ch, created: opts.created, metadata: { app: 'lagom', plan: 'livstid', ...opts.metadata } }))
  stripe.charges.set(ch, charge(ch, { payment_intent: pi, ...opts.chargeOverrides }))
  if (opts.sessionId) stripe.sessions.set(opts.sessionId, paidSession({ id: opts.sessionId, payment_intent: pi }))
}

async function scenario() {
  const stripe = fakeStripe()
  const log = recordingLogger()
  // 1: helt återbetalt, licensen sparad på betalningen → köp-id ur licensen.
  addPurchase(stripe, 1, { sessionId: S1, chargeOverrides: { refunded: true, amount_refunded: 69900 } })
  stripe.intents.get('pi_1')!.metadata[LICENSE_METADATA_KEY] = await issueLicense(licensePayloadFor(S1, 'livstid', CREATED), keys.priv)
  stripe.refunds.push({ id: 're_1', object: 'refund', amount: 69900, status: 'succeeded', charge: 'ch_1', payment_intent: 'pi_1', created: CREATED })
  // 2: delvis återbetalt (prisavdrag) → inte med.
  addPurchase(stripe, 2, { sessionId: 'cs_test_Delvis0000000002', chargeOverrides: { amount_refunded: 10000 } })
  stripe.refunds.push({ id: 're_2', object: 'refund', amount: 10000, status: 'succeeded', charge: 'ch_2', payment_intent: 'pi_2', created: CREATED })
  // 3: förlorad tvist, ingen licens sparad → köp-id:t slås upp hos Stripe.
  addPurchase(stripe, 3, { sessionId: S3, chargeOverrides: { disputed: true } })
  stripe.disputes.push({ id: 'dp_3', object: 'dispute', status: 'lost', charge: 'ch_3', payment_intent: 'pi_3', created: CREATED })
  // 4: vunnen tvist → inte med.
  addPurchase(stripe, 4, { sessionId: 'cs_test_Vunnen0000000004', chargeOverrides: { disputed: true } })
  stripe.disputes.push({ id: 'dp_4', object: 'dispute', status: 'won', charge: 'ch_4', payment_intent: 'pi_4', created: CREATED })
  // 5: någon annan produkt på samma Stripe-konto → inte med.
  addPurchase(stripe, 5, { sessionId: 'cs_test_Annat00000000005', chargeOverrides: { refunded: true, amount_refunded: 69900 }, metadata: { app: 'annat' } })
  stripe.refunds.push({ id: 're_5', object: 'refund', amount: 69900, status: 'succeeded', charge: 'ch_5', payment_intent: 'pi_5', created: CREATED })
  // 6: supportens undantag (lagom_revoked = 0) → inte med.
  addPurchase(stripe, 6, { sessionId: 'cs_test_Undantag000000006', chargeOverrides: { refunded: true, amount_refunded: 69900 }, metadata: { [REVOKED_METADATA_KEY]: '0' } })
  stripe.refunds.push({ id: 're_6', object: 'refund', amount: 69900, status: 'succeeded', charge: 'ch_6', payment_intent: 'pi_6', created: CREATED })
  // 7: livstidsköp som återbetalades för länge sedan (över 400 dagar) → med: en livstidslicens gäller
  // för alltid, så spärren måste också göra det.
  addPurchase(stripe, 7, { sessionId: S7, created: OLD - 30 * 86_400, chargeOverrides: { refunded: true, amount_refunded: 69900 } })
  stripe.refunds.push({ id: 're_7', object: 'refund', amount: 69900, status: 'succeeded', charge: 'ch_7', payment_intent: 'pi_7', created: OLD })
  // 8: årslicens från ett köp för över 400 dagar sedan → inte med (licensen har ändå gått ut).
  addPurchase(stripe, 8, {
    sessionId: 'cs_test_ArGammal000000008',
    created: OLD,
    metadata: { plan: 'ar' },
    chargeOverrides: { amount: 34900, refunded: true, amount_refunded: 34900 },
  })
  stripe.refunds.push({ id: 're_8', object: 'refund', amount: 34900, status: 'succeeded', charge: 'ch_8', payment_intent: 'pi_8', created: OLD + 86_400 })
  // 9: årslicens från ett nyligen gjort köp → med.
  addPurchase(stripe, 9, {
    sessionId: S9,
    created: NOW_SEC - 30 * 86_400,
    metadata: { plan: 'ar' },
    chargeOverrides: { amount: 34900, refunded: true, amount_refunded: 34900 },
  })
  stripe.refunds.push({ id: 're_9', object: 'refund', amount: 34900, status: 'succeeded', charge: 'ch_9', payment_intent: 'pi_9', created: NOW_SEC - 86_400 })
  const deps: HandlerDeps = {
    env: { STRIPE_SECRET_KEY: SECRET, LICENSE_PRIVATE_KEY: keys.priv, APP_URL: APP, LICENSE_REVOKED_IDS: 'lic_manuell01' },
    fetch: stripe.fetch,
    now: () => NOW,
    log,
    rateLimiter: new RateLimiter(1000, 60_000),
  }
  return { stripe, log, deps }
}

const get = (headers: Record<string, string> = {}, method = 'GET') => new Request(`${APP}/api/license-revocations`, { method, headers })

describe('spärrlistan', () => {
  it('innehåller helt återbetalda och bestridda Lagom-köp (köp-id) plus manuella id:n – inget annat', async () => {
    const { stripe, deps, log } = await scenario()
    const cfg = readConfig(deps.env)
    const { ids, truncated } = await collectRevokedIds({ cfg, fetch: stripe.fetch, now: NOW, log })
    expect(ids).toEqual([S1, S3, S7, S9, 'lic_manuell01'].sort())
    expect(truncated).toBe(false)
    // Alla återbetalningar och tvister hämtas, utan datumfilter – annars skulle ett återbetalt
    // livstidsköp falla ur listan efter en tid och nyckeln börja gälla igen.
    for (const path of ['/v1/refunds', '/v1/disputes']) {
      const call = stripe.calls.find((c) => c.url.pathname === path)
      expect(call).toBeDefined()
      expect([...call!.url.searchParams.keys()].some((k) => k.startsWith('created'))).toBe(false)
    }
  })

  it('ett återbetalt livstidsköp står kvar för alltid; årslicenser bara från köp de senaste 400 dagarna', async () => {
    const { stripe, deps, log } = await scenario()
    const cfg = readConfig(deps.env)
    // Tio år senare: livstidsköpen finns kvar, årslicensen från köp 9 har fallit bort.
    const later = NOW + 10 * 365 * 86_400_000
    const { ids } = await collectRevokedIds({ cfg, fetch: stripe.fetch, now: later, log })
    expect(ids).toEqual([S1, S3, S7, 'lic_manuell01'].sort())
    // Utan känt köpdatum räknas en årslicens som giltig – hellre med i listan än en som börjar gälla igen.
    stripe.intents.get('pi_9')!.created = undefined
    expect((await collectRevokedIds({ cfg, fetch: stripe.fetch, now: later, log })).ids).toContain(S9)
  })

  it('GET ger en signerad lista som appen godkänner, och den får cachas en timme', async () => {
    const { deps } = await scenario()
    const res = await handleLicenseRevocations(get({ Origin: APP }), deps)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    expect(res.headers.get('Netlify-CDN-Cache-Control')).toContain('max-age=3600')
    expect(res.headers.get('Vary')).toBe('Origin')
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    const text = await res.text()
    // Samma tolkning som appen gör (src/features/premium/revocations.ts).
    const token = extractRevocationToken(text)
    expect(token).toMatch(/^LAGOMREV1\./)
    const list = await verifyRevocationList(token!, { publicKey: keys.pub })
    expect(list).toEqual({ v: 1, issuedAt: NOW_SEC, ids: [S1, S3, S7, S9, 'lic_manuell01'].sort() })
    // Inga personuppgifter i svaret.
    expect(text).not.toMatch(/@|exempel\.se/)
  })

  it('listan minns i tio minuter – Stripe frågas inte vid varje anrop', async () => {
    const { deps, stripe } = await scenario()
    await handleLicenseRevocations(get(), deps)
    const calls = stripe.calls.length
    expect((await handleLicenseRevocations(get(), deps)).status).toBe(200)
    expect(stripe.calls.length).toBe(calls)
    deps.now = () => NOW + 11 * 60_000
    await handleLicenseRevocations(get(), deps)
    expect(stripe.calls.length).toBeGreaterThan(calls)
  })

  it('Stripe nere → 502 som inte cachas (appen behåller sin sparade lista)', async () => {
    const { deps, stripe } = await scenario()
    stripe.failNext.push('network')
    const res = await handleLicenseRevocations(get(), deps)
    expect(res.status).toBe(502)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect((await res.json()) as unknown).toMatchObject({ code: 'betaltjanst-fel' })
  })

  it('bara GET, bara appens ursprung, och nycklarna krävs', async () => {
    const { deps } = await scenario()
    expect((await handleLicenseRevocations(get({}, 'POST'), deps)).status).toBe(405)
    expect((await handleLicenseRevocations(get({ Origin: 'https://ond.example' }), deps)).status).toBe(403)
    expect((await handleLicenseRevocations(get({ Origin: 'capacitor://localhost' }), deps)).status).toBe(200)
    const noKey = { ...deps, env: { ...deps.env, LICENSE_PRIVATE_KEY: '' } }
    expect((await handleLicenseRevocations(get(), noKey)).status).toBe(503)
  })

  it('en tom lista är också signerad', async () => {
    const stripe = fakeStripe()
    const deps: HandlerDeps = {
      env: { STRIPE_SECRET_KEY: SECRET, LICENSE_PRIVATE_KEY: keys.priv, APP_URL: APP },
      fetch: stripe.fetch,
      now: () => NOW,
      log: recordingLogger(),
      rateLimiter: new RateLimiter(1000, 60_000),
    }
    const body = (await (await handleLicenseRevocations(get(), deps)).json()) as { token: string }
    expect(await verifyRevocationList(body.token, { publicKey: keys.pub })).toMatchObject({ ids: [] })
  })
})
