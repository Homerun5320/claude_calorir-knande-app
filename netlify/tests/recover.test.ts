// @vitest-environment node
/**
 * POST /api/recover-license: "Hämta min licensnyckel igen" med e-post och kvittonummer.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { verifyLicense } from '../../src/lib/license.ts'
import { LICENSE_METADATA_KEY } from '../lib/fulfillment.ts'
import { handleVerifyPurchase, type HandlerDeps } from '../lib/handlers.ts'
import { RateLimiter } from '../lib/http.ts'
import { RECOVER_MIN_MS, RECOVER_NOT_FOUND, handleRecoverLicense, receiptKey } from '../lib/recover.ts'
import { CUSTOMER_EMAIL, NOW, SECRET, charge, fakeStripe, licenseKeyPair, paidSession, recordingLogger } from './fakeStripe.ts'

const APP = 'https://lagom.example'
let keys: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
})

function setup(envOverrides: Record<string, string> = {}) {
  const stripe = fakeStripe()
  const log = recordingLogger()
  const sleeps: number[] = []
  const session = paidSession({ invoice: 'in_1' })
  stripe.sessions.set(session.id, session)
  stripe.invoices.set('in_1', { id: 'in_1', object: 'invoice', number: 'ABCD1234-0001' })
  const deps: HandlerDeps = {
    env: { STRIPE_SECRET_KEY: SECRET, LICENSE_PRIVATE_KEY: keys.priv, APP_URL: APP, ...envOverrides },
    fetch: stripe.fetch,
    now: () => NOW,
    log,
    rateLimiter: new RateLimiter(1000, 60_000),
    keyRateLimiter: new RateLimiter(1000, 60_000),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
  }
  return { stripe, log, deps, sleeps, session }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${APP}/api/recover-license`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: APP, ...headers },
    body: JSON.stringify(body),
  })

async function read(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}

describe('POST /api/recover-license', () => {
  it('rätt e-post och kvittonummer → samma licensnyckel som köpet redan har gett', async () => {
    const { deps, stripe, session } = setup()
    const first = await read(
      await handleVerifyPurchase(
        new Request(`${APP}/api/verify-purchase`, { method: 'POST', headers: { Origin: APP }, body: JSON.stringify({ sessionId: session.id }) }),
        deps,
      ),
    )
    const res = await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)
    expect(res.status).toBe(200)
    const data = await read(res)
    expect(data).toMatchObject({ licenseKey: first.licenseKey, plan: 'livstid', expiresAt: null })
    expect(stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]).toBe(first.licenseKey)
    expect((await verifyLicense(String(data.licenseKey), { publicKey: keys.pub, mode: 'live', now: NOW })).ok).toBe(true)
  })

  it('utan sparad nyckel utfärdas en med samma innehåll och sparas', async () => {
    const { deps, stripe } = setup()
    const data = await read(await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps))
    expect(data.licenseKey).toMatch(/^LAGOM1\./)
    expect(stripe.intents.get('pi_1')?.metadata[LICENSE_METADATA_KEY]).toBe(data.licenseKey)
  })

  it.each([
    ['kvittonummer med # och mellanslag', '#1234 5678'],
    ['"Kvitto #…" inklistrat', 'Kvitto #1234-5678'],
    ['fakturanummer i gemener', 'abcd1234-0001'],
    ['köp-id:t från tacksidan', 'cs_test_a1B2c3D4e5F6g7H8i9J0'],
  ])('%s godtas', async (_label, receipt) => {
    const { deps } = setup()
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt }), deps)).status).toBe(200)
  })

  it('e-postadressen jämförs utan hänsyn till stora och små bokstäver', async () => {
    const { deps, stripe } = setup()
    // Med köp-id hämtas sessionen direkt.
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL.toLowerCase(), receipt: 'cs_test_a1B2c3D4e5F6g7H8i9J0' }), deps)).status).toBe(200)
    // Med kvittonummer söks även adressen med små bokstäver fram.
    const lower = paidSession({ id: 'cs_test_Gemener000000001', payment_intent: 'pi_1', customer_details: { email: 'bo@exempel.se' } })
    stripe.sessions.set(lower.id, lower)
    stripe.charges.set('ch_1', charge('ch_1', { receipt_number: '9999-0000' }))
    expect((await handleRecoverLicense(post({ email: 'BO@Exempel.SE', receipt: '9999-0000' }), deps)).status).toBe(200)
  })

  it('fel e-post och fel nummer ger exakt samma svar och samma minsta svarstid', async () => {
    const { deps, sleeps } = setup()
    const wrongEmail = await handleRecoverLicense(post({ email: 'nagon.annan@exempel.se', receipt: '1234-5678' }), deps)
    const wrongReceipt = await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-9999' }), deps)
    const wrongBoth = await handleRecoverLicense(post({ email: 'x@y.se', receipt: 'cs_test_Finnsinte00000001' }), deps)
    const wrongEmailForId = await handleRecoverLicense(post({ email: 'x@y.se', receipt: 'cs_test_a1B2c3D4e5F6g7H8i9J0' }), deps)
    const bodies = await Promise.all([wrongEmail, wrongReceipt, wrongBoth, wrongEmailForId].map((r) => r.text()))
    expect([wrongEmail, wrongReceipt, wrongBoth, wrongEmailForId].map((r) => r.status)).toEqual([404, 404, 404, 404])
    expect(new Set(bodies).size).toBe(1)
    expect(JSON.parse(bodies[0])).toEqual({ code: 'hittades-inte', error: RECOVER_NOT_FOUND })
    expect(sleeps).toEqual([RECOVER_MIN_MS, RECOVER_MIN_MS, RECOVER_MIN_MS, RECOVER_MIN_MS])
  })

  it('återbetalda köp ger ingen nyckel', async () => {
    const { deps, stripe } = setup()
    stripe.charges.set('ch_1', charge('ch_1', { refunded: true, amount_refunded: 69900 }))
    const res = await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)
    expect(res.status).toBe(410)
    expect(await read(res)).toMatchObject({ code: 'aterbetald' })
  })

  it('obetalda köp och andra produkter avslöjas inte – samma svar som "hittades inte"', async () => {
    const { deps, stripe, session } = setup()
    stripe.sessions.set(session.id, { ...session, payment_status: 'unpaid' })
    const res = await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: session.id }), deps)
    expect(res.status).toBe(404)
    expect(await read(res)).toEqual({ code: 'hittades-inte', error: RECOVER_NOT_FOUND })
  })

  it('ogiltiga uppgifter → 400 utan att fråga Stripe', async () => {
    const { deps, stripe, sleeps } = setup()
    for (const body of [{ email: 'inte-en-adress', receipt: '1234-5678' }, { email: CUSTOMER_EMAIL, receipt: '12' }, { email: CUSTOMER_EMAIL }, {}]) {
      const res = await handleRecoverLicense(post(body), deps)
      expect(res.status).toBe(400)
      expect(typeof (await read(res)).error).toBe('string')
    }
    expect(stripe.calls).toHaveLength(0)
    expect(sleeps).toHaveLength(0)
  })

  it('begränsar försöken per e-postadress (oavsett IP-adress)', async () => {
    const { deps } = setup()
    deps.keyRateLimiter = new RateLimiter(2, 60 * 60_000)
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      statuses.push((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: `0000-000${i}` }, { 'x-nf-client-connection-ip': `10.0.0.${i}` }), deps)).status)
    }
    expect(statuses).toEqual([404, 404, 429])
  })

  it('begränsar försöken per IP-adress', async () => {
    const { deps } = setup()
    deps.rateLimiter = new RateLimiter(1, 60_000)
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)).status).toBe(200)
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)).status).toBe(429)
  })

  it('Stripe nere → 502; e-postadressen hamnar aldrig i loggen', async () => {
    const { deps, stripe, log } = setup()
    stripe.failNext.push('network')
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)).status).toBe(502)
    await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }), deps)
    expect(log.text()).not.toMatch(/@|exempel\.se|anna/i)
  })

  it('andra webbplatser nekas', async () => {
    const { deps } = setup()
    expect((await handleRecoverLicense(post({ email: CUSTOMER_EMAIL, receipt: '1234-5678' }, { Origin: 'https://ond.example' }), deps)).status).toBe(403)
  })

  it('receiptKey jämför utan skiljetecken och skiftläge', () => {
    expect(receiptKey('#1234-5678')).toBe('12345678')
    expect(receiptKey('abcd1234-0001')).toBe(receiptKey('ABCD1234 0001'))
  })
})
