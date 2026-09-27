// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { missingConfig, normalizeAppUrl, readConfig } from '../lib/config.ts'

describe('inställningar från miljövariabler', () => {
  it('läser och städar värdena', () => {
    const cfg = readConfig({
      STRIPE_SECRET_KEY: ' rk_live_abc123 ',
      STRIPE_PRICE_AR: 'price_ny, price_gammal',
      STRIPE_PRICE_LIVSTID: 'price_l',
      LICENSE_PRIVATE_KEY: 'MIGH\nAgEA',
      APP_URL: 'https://lagom.example/app/?x=1#y',
      ALLOWED_ORIGINS: 'https://a.example, ftp://nej.example,https://b.example/',
      TERMS_URL: 'https://lagom.example/villkor(2026)',
      STRIPE_AUTOMATIC_TAX: 'on',
    })
    expect(cfg.stripeSecretKey).toBe('rk_live_abc123')
    expect(cfg.priceIds).toEqual({ ar: ['price_ny', 'price_gammal'], livstid: ['price_l'] })
    expect(cfg.licensePrivateKey).toBe('MIGHAgEA')
    expect(cfg.appUrl).toBe('https://lagom.example/app')
    expect(cfg.allowedOrigins).toEqual(['https://a.example', 'https://b.example'])
    expect(cfg.termsUrl).toBe('https://lagom.example/villkor%282026%29')
    expect(cfg.automaticTax).toBe(true)
    expect(missingConfig(cfg, ['stripe', 'license', 'webhook'])).toEqual(['STRIPE_WEBHOOK_SECRET'])
  })

  it('APP_URL faller tillbaka på webbplatsens adress från Netlify', () => {
    expect(readConfig({}, 'https://lagom.netlify.app').appUrl).toBe('https://lagom.netlify.app')
    expect(readConfig({ APP_URL: 'inte en adress' }, 'https://lagom.netlify.app').appUrl).toBe('https://lagom.netlify.app')
  })

  it('en publicerbar nyckel (pk_) eller tomma värden räknas som saknade', () => {
    const cfg = readConfig({ STRIPE_SECRET_KEY: 'pk_live_abc', LICENSE_PRIVATE_KEY: '', STRIPE_WEBHOOK_SECRET: 'abc' })
    expect(missingConfig(cfg, ['stripe', 'license', 'webhook'])).toEqual(['STRIPE_SECRET_KEY', 'LICENSE_PRIVATE_KEY', 'STRIPE_WEBHOOK_SECRET'])
    expect(cfg.priceIds).toEqual({ ar: [], livstid: [] })
    expect(cfg.automaticTax).toBe(false)
  })

  it('normalizeAppUrl godtar bara http(s)', () => {
    expect(normalizeAppUrl('javascript:alert(1)')).toBe('')
    expect(normalizeAppUrl('http://localhost:8888/')).toBe('http://localhost:8888')
    expect(normalizeAppUrl(undefined)).toBe('')
  })
})
