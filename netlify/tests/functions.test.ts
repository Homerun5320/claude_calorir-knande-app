// @vitest-environment node
/**
 * Röktest av själva funktionsfilerna: de ska gå att ladda i Node (utan webbläsar-API:er och utan
 * Vites import.meta.env) och läsa sina inställningar från process.env.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createCheckout from '../functions/create-checkout.mts'
import stripeWebhook from '../functions/stripe-webhook.mts'
import verifyPurchase from '../functions/verify-purchase.mts'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('STRIPE_SECRET_KEY', '')
  vi.stubEnv('LICENSE_PRIVATE_KEY', '')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', '')
  vi.stubEnv('APP_URL', 'https://lagom.example')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const req = (path: string, init: RequestInit = {}) => new Request(`https://lagom.example/api/${path}`, init)

describe('Netlify-funktionerna', () => {
  it('exporterar en hanterare var', () => {
    for (const fn of [createCheckout, verifyPurchase, stripeWebhook]) expect(typeof fn).toBe('function')
  })

  it('svarar på preflight från appen', async () => {
    const res = await createCheckout(req('create-checkout', { method: 'OPTIONS', headers: { Origin: 'https://lagom.example' } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lagom.example')
  })

  it('utan inställningar: 503 med svenskt meddelande, aldrig en krasch', async () => {
    const body = JSON.stringify({ plan: 'ar' })
    const a = await createCheckout(req('create-checkout', { method: 'POST', body }), { ip: '127.0.0.1', site: { url: 'https://lagom.example' } })
    expect(a.status).toBe(503)
    expect(await a.json()).toMatchObject({ code: 'ej-konfigurerad' })
    const b = await verifyPurchase(req('verify-purchase', { method: 'POST', body: JSON.stringify({ sessionId: 'cs_test_abcdefghij' }) }))
    expect(b.status).toBe(503)
    const c = await stripeWebhook(req('stripe-webhook', { method: 'POST', body: '{}' }))
    expect(c.status).toBe(503)
  })
})
