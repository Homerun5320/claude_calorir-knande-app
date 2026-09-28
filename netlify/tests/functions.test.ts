// @vitest-environment node
/**
 * Röktest av själva funktionsfilerna: de ska gå att ladda i Node (utan webbläsar-API:er och utan
 * Vites import.meta.env) och läsa sina inställningar från process.env.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createCheckout from '../functions/create-checkout.mts'
import licenseRevocations from '../functions/license-revocations.mts'
import recipeFetch from '../functions/recipe-fetch.mts'
import recoverLicense from '../functions/recover-license.mts'
import stripeWebhook from '../functions/stripe-webhook.mts'
import verifyPurchase from '../functions/verify-purchase.mts'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
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
    for (const fn of [createCheckout, verifyPurchase, stripeWebhook, licenseRevocations, recoverLicense, recipeFetch]) expect(typeof fn).toBe('function')
  })

  it('svarar på preflight från appen', async () => {
    const res = await createCheckout(req('create-checkout', { method: 'OPTIONS', headers: { Origin: 'https://lagom.example' } }))
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://lagom.example')
    const get = await licenseRevocations(req('license-revocations', { method: 'OPTIONS', headers: { Origin: 'https://lagom.example' } }))
    expect(get.status).toBe(204)
    expect(get.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
  })

  it('utan inställningar: 503 med svenskt meddelande, aldrig en krasch', async () => {
    const body = JSON.stringify({ plan: 'ar', consent: true })
    const a = await createCheckout(req('create-checkout', { method: 'POST', body }), { ip: '127.0.0.1', site: { url: 'https://lagom.example' } })
    expect(a.status).toBe(503)
    expect(await a.json()).toMatchObject({ code: 'ej-konfigurerad' })
    const b = await verifyPurchase(req('verify-purchase', { method: 'POST', body: JSON.stringify({ sessionId: 'cs_test_abcdefghij' }) }))
    expect(b.status).toBe(503)
    const c = await stripeWebhook(req('stripe-webhook', { method: 'POST', body: '{}' }))
    expect(c.status).toBe(503)
    const d = await licenseRevocations(req('license-revocations'))
    expect(d.status).toBe(503)
    expect(d.headers.get('Cache-Control')).toBe('no-store')
    const e = await recoverLicense(req('recover-license', { method: 'POST', body: JSON.stringify({ email: 'a@b.se', receipt: '1234-5678' }) }))
    expect(e.status).toBe(503)
  })

  it('receptimporten behöver inga nycklar och avvisar http-adresser utan att hämta något', async () => {
    const headers = { Origin: 'https://lagom.example' }
    const res = await recipeFetch(req('recipe-fetch', { method: 'POST', headers, body: JSON.stringify({ url: 'http://example.com/recept' }) }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'ogiltig' })
    // Utan Origin (curl, skript) nekas anropet – funktionen är ingen öppen hämtare.
    const bare = await recipeFetch(req('recipe-fetch', { method: 'POST', body: JSON.stringify({ url: 'https://example.com/recept' }) }))
    expect(bare.status).toBe(403)
  })
})
