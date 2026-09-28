// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isExampleEmail } from '../../scripts/commerce-guard.ts'
import {
  DEFAULT_NATIVE_ORIGINS,
  DEFAULT_TERMS_VERSION,
  isPlaceholderEmail,
  missingConfig,
  normalizeAppUrl,
  readConfig,
  readNativeOrigins,
  sellerForDisplay,
} from '../lib/config.ts'

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

describe('den inbyggda appens ursprung (ALLOWED_NATIVE_ORIGINS)', () => {
  it('standard: capacitor://localhost och https://localhost', () => {
    expect(readConfig({}).nativeOrigins).toEqual([...DEFAULT_NATIVE_ORIGINS])
    expect(readNativeOrigins('  ')).toEqual(['capacitor://localhost', 'https://localhost'])
  })

  it('kan begränsas eller stängas av', () => {
    expect(readNativeOrigins('capacitor://localhost')).toEqual(['capacitor://localhost'])
    expect(readNativeOrigins('off')).toEqual([])
    expect(readNativeOrigins('av')).toEqual([])
  })

  it('bara exakt capacitor://localhost eller https://localhost godtas', () => {
    expect(
      readNativeOrigins(
        'capacitor://localhost/, https://localhost:8443, http://localhost, ionic://localhost, capacitor://evil.example, https://lagom.example, CAPACITOR://localhost, https://localhost',
      ),
    ).toEqual(['https://localhost'])
  })
})

describe('säljarens uppgifter och villkorsversion', () => {
  const seller = {
    VITE_SELLER_NAME: ' Anna Andersson ',
    VITE_SELLER_ORGNR: '900101-1234',
    VITE_SELLER_ADDRESS: 'Storgatan 1, 123 45 Småstad',
    VITE_SELLER_PHONE: '070-123 45 67',
    VITE_SUPPORT_EMAIL: 'hej@lagom-appen.se',
  }

  it('läses ur samma VITE_-variabler som appen', () => {
    const cfg = readConfig({ ...seller, VITE_SELLER_VAT: 'SE900101123401' })
    expect(cfg.seller).toEqual({
      name: 'Anna Andersson',
      orgnr: '900101-1234',
      address: 'Storgatan 1, 123 45 Småstad',
      phone: '070-123 45 67',
      email: 'hej@lagom-appen.se',
      vat: 'SE900101123401',
    })
  })

  it('en exempeladress räknas som saknad och saknade uppgifter blir platshållare', () => {
    const cfg = readConfig({ VITE_SUPPORT_EMAIL: 'support@example.invalid' })
    expect(cfg.seller.email).toBe('')
    expect(sellerForDisplay(cfg.seller)).toMatchObject({ name: '[Företagsnamn]', orgnr: '[Org.nr]', email: '[E-post]', vat: '' })
  })

  it('platshållare från mallar räknas som saknade – samma regel som byggkontrollen', () => {
    const cfg = readConfig({
      STRIPE_SECRET_KEY: 'rk_live_abc123',
      VITE_SELLER_NAME: '[Företagsnamn]',
      VITE_SELLER_ORGNR: '900101-1234',
      VITE_SELLER_ADDRESS: '<din adress>',
      VITE_SELLER_PHONE: '070-123 45 67',
      VITE_SUPPORT_EMAIL: 'hej@<din domän>',
    })
    expect(cfg.seller).toMatchObject({ name: '', address: '', email: '', orgnr: '900101-1234' })
    expect(missingConfig(cfg, ['seller'])).toEqual(['VITE_SELLER_NAME', 'VITE_SELLER_ADDRESS', 'VITE_SUPPORT_EMAIL'])
    for (const email of [
      'support@example.invalid',
      'hej@example.se',
      'hej@example.com',
      'hej@mail.example.org',
      'hej@lagom.test',
      'hej@lagom.localhost',
      'hej@lagom-appen.se',
      'hej@exempel.se',
      '',
    ]) {
      expect(isPlaceholderEmail(email), email).toBe(email === '' || isExampleEmail(email))
    }
  })

  it('krävs bara med en skarp Stripe-nyckel', () => {
    expect(missingConfig(readConfig({ STRIPE_SECRET_KEY: 'sk_test_abc' }), ['stripe', 'seller'])).toEqual([])
    expect(missingConfig(readConfig({ STRIPE_SECRET_KEY: 'rk_live_abc' }), ['stripe', 'seller'])).toEqual([
      'VITE_SELLER_NAME',
      'VITE_SELLER_ORGNR',
      'VITE_SELLER_ADDRESS',
      'VITE_SELLER_PHONE',
      'VITE_SUPPORT_EMAIL',
    ])
    expect(missingConfig(readConfig({ STRIPE_SECRET_KEY: 'rk_live_abc', ...seller }), ['stripe', 'seller'])).toEqual([])
  })

  it('TERMS_VERSION har ett standardvärde och godtar bara korta, enkla versioner', () => {
    expect(readConfig({}).termsVersion).toBe(DEFAULT_TERMS_VERSION)
    expect(DEFAULT_TERMS_VERSION).toBe('2026-10-01')
    expect(readConfig({ TERMS_VERSION: ' 2027-01-15 ' }).termsVersion).toBe('2027-01-15')
    expect(readConfig({ TERMS_VERSION: '<script>' }).termsVersion).toBe(DEFAULT_TERMS_VERSION)
  })

  it('LICENSE_REVOKED_IDS: bara rimliga id:n, utan dubbletter', () => {
    expect(readConfig({ LICENSE_REVOKED_IDS: 'lic_abc123, cs_live_x1y2z3, lic_abc123, <x>, a' }).revokedIds).toEqual(['lic_abc123', 'cs_live_x1y2z3'])
  })
})
