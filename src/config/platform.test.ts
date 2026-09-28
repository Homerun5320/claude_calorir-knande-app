/**
 * Plattformsflaggan: distribution från bygget, körmiljö (webbläsare, inbyggd app, Googles
 * TWA-skal) och texterna som beror på dem.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DISTRIBUTION,
  IS_STORE_BUILD,
  RUNTIME,
  allowsLicenseKeyEntry,
  cameraSettingsHint,
  detectRuntime,
  isInApp,
  offersLicenseRecovery,
  parseDistribution,
  sellsOnWeb,
  storagePlace,
} from './platform'

/** En fejkad window med bara det som detectRuntime läser. */
function fakeWindow(opts: {
  capacitor?: unknown
  referrer?: string
  search?: string
  hash?: string
  session?: Record<string, string> | 'kastar'
  digitalGoods?: boolean
  /** Visningsläget som matchMedia svarar med, t.ex. 'standalone' i en TWA. Saknas = vanlig flik. */
  displayMode?: string
}): { win: Window; session: Record<string, string> } {
  const session: Record<string, string> = opts.session === 'kastar' || !opts.session ? {} : { ...opts.session }
  const storage =
    opts.session === 'kastar'
      ? {
          getItem: () => {
            throw new DOMException('blockerad', 'SecurityError')
          },
          setItem: () => {
            throw new DOMException('blockerad', 'SecurityError')
          },
        }
      : {
          getItem: (k: string) => session[k] ?? null,
          setItem: (k: string, v: string) => {
            session[k] = v
          },
        }
  const win: Record<string, unknown> = {
    document: { referrer: opts.referrer ?? '' },
    location: { search: opts.search ?? '', hash: opts.hash ?? '' },
    sessionStorage: storage,
  }
  if (opts.capacitor !== undefined) win.Capacitor = opts.capacitor
  if (opts.digitalGoods) win.getDigitalGoodsService = () => Promise.resolve({})
  win.matchMedia = (query: string) => ({ matches: opts.displayMode !== undefined && query === `(display-mode: ${opts.displayMode})` })
  return { win: win as unknown as Window, session }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('parseDistribution', () => {
  it('saknat eller tomt värde är webben', () => {
    expect(parseDistribution(undefined)).toBe('web')
    expect(parseDistribution('')).toBe('web')
  })

  it('godtar exakt web, appstore och play', () => {
    expect(parseDistribution('web')).toBe('web')
    expect(parseDistribution('appstore')).toBe('appstore')
    expect(parseDistribution('play')).toBe('play')
  })

  it('allt annat är ogiltigt (byggkontrollen stoppar det)', () => {
    for (const v of ['App Store', 'AppStore', 'ios', 'android', ' play', 'WEB', 'google']) {
      expect(parseDistribution(v)).toBeNull()
    }
  })
})

describe('detectRuntime', () => {
  it('utan window (t.ex. i en serverfunktion) är det webben', () => {
    expect(detectRuntime(undefined)).toBe('web')
  })

  it('vanlig webbläsare', () => {
    expect(detectRuntime(fakeWindow({}).win)).toBe('web')
  })

  it('inbyggd app via Capacitor', () => {
    expect(detectRuntime(fakeWindow({ capacitor: { isNativePlatform: () => true } }).win)).toBe('native')
    // Capacitor i webbläsaren (inte inbyggt) räknas som webben.
    expect(detectRuntime(fakeWindow({ capacitor: { isNativePlatform: () => false } }).win)).toBe('web')
    expect(detectRuntime(fakeWindow({ capacitor: {} }).win)).toBe('web')
  })

  it('TWA känns igen på referrern när sidan visas som app – och minns under sessionen', () => {
    const { win, session } = fakeWindow({ referrer: 'android-app://se.lagom.app/', displayMode: 'standalone' })
    expect(detectRuntime(win)).toBe('twa')
    expect(session['lagom-twa']).toBe('1')
    // Efter navigering finns bara sessionsmarkeringen kvar.
    expect(detectRuntime(fakeWindow({ session }).win)).toBe('twa')
  })

  it('en länk från en annan app (t.ex. Gmail) i en vanlig flik är inte TWA', () => {
    const { win, session } = fakeWindow({ referrer: 'android-app://com.google.android.gm/' })
    expect(detectRuntime(win)).toBe('web')
    expect(session['lagom-twa']).toBeUndefined()
  })

  it('TWA känns igen på ?plattform=play – före eller i hash-delen', () => {
    expect(detectRuntime(fakeWindow({ search: '?plattform=play' }).win)).toBe('twa')
    expect(detectRuntime(fakeWindow({ hash: '#/?plattform=play' }).win)).toBe('twa')
    expect(detectRuntime(fakeWindow({ search: '?plattform=web' }).win)).toBe('web')
  })

  it('Digital Goods API räcker inte – metoden finns i Chrome på Android även utanför en TWA', () => {
    expect(detectRuntime(fakeWindow({ digitalGoods: true }).win)).toBe('web')
    expect(detectRuntime(fakeWindow({ digitalGoods: true, displayMode: 'standalone' }).win)).toBe('web')
    // En installerad webbapp (hemskärmen) utan Play-skalets tecken är webben.
    expect(detectRuntime(fakeWindow({ displayMode: 'standalone' }).win)).toBe('web')
  })

  it('en sessionStorage som kastar stoppar inte appen', () => {
    expect(detectRuntime(fakeWindow({ session: 'kastar' }).win)).toBe('web')
    expect(detectRuntime(fakeWindow({ session: 'kastar', search: '?plattform=play' }).win)).toBe('twa')
  })
})

describe('webbversionen (standard)', () => {
  it('säljer på webben, tillåter licensnycklar och har webbläsartexter', () => {
    expect(DISTRIBUTION).toBe('web')
    expect(IS_STORE_BUILD).toBe(false)
    expect(RUNTIME).toBe('web')
    expect(isInApp()).toBe(false)
    expect(sellsOnWeb()).toBe(true)
    expect(allowsLicenseKeyEntry()).toBe(true)
    expect(offersLicenseRecovery()).toBe(true)
    expect(storagePlace()).toBe('i den här webbläsaren')
    expect(cameraSettingsHint()).toBe('Tillåt kameran för Lagom i webbläsarens inställningar.')
  })
})

describe('butiksbyggen', () => {
  it('App Store: inga webbköp, inga licensnycklar och apptexter', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const p = await import('./platform')
    expect(p.DISTRIBUTION).toBe('appstore')
    expect(p.IS_STORE_BUILD).toBe(true)
    expect(p.isInApp()).toBe(true)
    expect(p.sellsOnWeb()).toBe(false)
    expect(p.allowsLicenseKeyEntry()).toBe(false)
    expect(p.offersLicenseRecovery()).toBe(false)
    expect(p.storagePlace()).toBe('i appen på den här enheten')
    expect(p.cameraSettingsHint()).toBe('Tillåt kameran för Lagom i telefonens Inställningar.')
  })

  it('Google Play: inga webbköp, men licensnycklar går att klistra in', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'play')
    vi.resetModules()
    const p = await import('./platform')
    expect(p.IS_STORE_BUILD).toBe(true)
    expect(p.sellsOnWeb()).toBe(false)
    expect(p.allowsLicenseKeyEntry()).toBe(true)
    expect(p.offersLicenseRecovery()).toBe(false)
  })

  it('ett ogiltigt värde blir webben i appen (bygget stoppas av byggkontrollen)', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'ios')
    vi.resetModules()
    const p = await import('./platform')
    expect(p.DISTRIBUTION).toBe('web')
  })

  it('webbförsäljningen kan stängas av – licensnycklar fungerar ändå', async () => {
    vi.stubEnv('VITE_WEB_SALES', 'off')
    vi.resetModules()
    const p = await import('./platform')
    expect(p.WEB_SALES_ENABLED).toBe(false)
    expect(p.sellsOnWeb()).toBe(false)
    expect(p.isInApp()).toBe(false)
    expect(p.allowsLicenseKeyEntry()).toBe(true)
    expect(p.offersLicenseRecovery()).toBe(true)
  })
})
