// @vitest-environment node
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  STRIPE_API_VERSION,
  StripeError,
  computeStripeSignature,
  encodeForm,
  stripeRequest,
  timingSafeEqual,
  verifyStripeSignature,
  type FetchLike,
} from '../lib/stripe.ts'

describe('formulärkodning för Stripe', () => {
  it('plattar ut objekt och listor med hakparenteser och hoppar över tomma värden', () => {
    const form = encodeForm({
      mode: 'payment',
      line_items: [{ price: 'price_1', quantity: 1 }],
      metadata: { plan: 'ar', tom: undefined },
      expand: ['line_items', 'payment_intent'],
      automatic_tax: undefined,
      consent: null,
      flag: true,
    })
    expect([...form.entries()]).toEqual([
      ['mode', 'payment'],
      ['line_items[0][price]', 'price_1'],
      ['line_items[0][quantity]', '1'],
      ['metadata[plan]', 'ar'],
      ['expand[0]', 'line_items'],
      ['expand[1]', 'payment_intent'],
      ['flag', 'true'],
    ])
  })

  it('mallvariabeln {CHECKOUT_SESSION_ID} överlever kodningen', () => {
    const form = encodeForm({ success_url: 'https://x.se/#/tack?session_id={CHECKOUT_SESSION_ID}' })
    expect(new URLSearchParams(form.toString()).get('success_url')).toBe('https://x.se/#/tack?session_id={CHECKOUT_SESSION_ID}')
  })
})

describe('stripeRequest', () => {
  it('skickar nyckel, låst API-version och formulär; GET-parametrar i adressen', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    const fetch: FetchLike = async (url, init) => {
      seen.push({ url, init })
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 })
    }
    await stripeRequest({ method: 'POST', path: '/checkout/sessions', params: { mode: 'payment' }, secretKey: 'sk_test_1', fetch })
    await stripeRequest({ method: 'GET', path: '/checkout/sessions/cs_1', params: { expand: ['line_items'] }, secretKey: 'sk_test_1', fetch })
    const [post, get] = seen
    expect(post.url).toBe('https://api.stripe.com/v1/checkout/sessions')
    expect(post.init?.body).toBe('mode=payment')
    expect(post.init?.headers).toMatchObject({
      Authorization: 'Bearer sk_test_1',
      'Stripe-Version': STRIPE_API_VERSION,
      'Content-Type': 'application/x-www-form-urlencoded',
    })
    expect(get.url).toBe('https://api.stripe.com/v1/checkout/sessions/cs_1?expand%5B0%5D=line_items')
    expect(get.init?.body).toBeUndefined()
  })

  it('Stripes felsvar och nätverksfel blir StripeError med status', async () => {
    const notFound: FetchLike = async () =>
      new Response(JSON.stringify({ error: { message: 'No such checkout.session', type: 'invalid_request_error', code: 'resource_missing' } }), {
        status: 404,
      })
    await expect(stripeRequest({ method: 'GET', path: '/x', secretKey: 's', fetch: notFound })).rejects.toMatchObject({
      name: 'StripeError',
      status: 404,
      code: 'resource_missing',
    })
    const offline: FetchLike = async () => {
      throw new TypeError('fetch failed')
    }
    const err = await stripeRequest({ method: 'GET', path: '/x', secretKey: 's', fetch: offline }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StripeError)
    expect((err as StripeError).status).toBe(0)
    const html: FetchLike = async () => new Response('<html>', { status: 502 })
    await expect(stripeRequest({ method: 'GET', path: '/x', secretKey: 's', fetch: html })).rejects.toMatchObject({ status: 502 })
  })
})

describe('webhook-signaturer', () => {
  const secret = 'whsec_test_hemlighet'
  const body = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_test_1' } } })
  const t = 1_790_000_000
  // Oberoende beräkning med Nodes crypto – samma som Stripes dokumentation.
  const reference = createHmac('sha256', secret).update(`${t}.${body}`, 'utf8').digest('hex')

  it('beräknar samma HMAC-SHA256 som Stripe', async () => {
    expect(await computeStripeSignature(body, secret, t)).toBe(reference)
    expect(await computeStripeSignature(new TextEncoder().encode(body), secret, t)).toBe(reference)
  })

  it('godkänner rätt signatur, även bland flera v1 och med v0', async () => {
    const header = `t=${t},v0=${'0'.repeat(64)},v1=${'a'.repeat(64)},v1=${reference}`
    expect(await verifyStripeSignature(body, header, secret, { nowSec: t + 10 })).toEqual({ ok: true, timestamp: t })
  })

  it('underkänner fel hemlighet, ändrad kropp, saknad header och trasigt format', async () => {
    const header = `t=${t},v1=${reference}`
    expect(await verifyStripeSignature(body, header, 'whsec_annan', { nowSec: t })).toEqual({ ok: false, reason: 'fel-signatur' })
    expect(await verifyStripeSignature(body.replace('cs_test_1', 'cs_test_2'), header, secret, { nowSec: t })).toEqual({
      ok: false,
      reason: 'fel-signatur',
    })
    expect(await verifyStripeSignature(body, null, secret)).toEqual({ ok: false, reason: 'saknas' })
    expect(await verifyStripeSignature(body, 'hej', secret)).toEqual({ ok: false, reason: 'format' })
    expect(await verifyStripeSignature(body, `v1=${reference}`, secret)).toEqual({ ok: false, reason: 'format' })
    expect(await verifyStripeSignature(body, `t=${t},v1=kort`, secret)).toEqual({ ok: false, reason: 'format' })
  })

  it('underkänner för gamla tidsstämplar (skydd mot uppspelning)', async () => {
    const header = `t=${t},v1=${reference}`
    expect(await verifyStripeSignature(body, header, secret, { nowSec: t + 301 })).toEqual({ ok: false, reason: 'for-gammal' })
    expect((await verifyStripeSignature(body, header, secret, { nowSec: t + 299 })).ok).toBe(true)
  })

  it('jämförelse i konstant tid', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
  })
})
