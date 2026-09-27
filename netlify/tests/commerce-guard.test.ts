// @vitest-environment node
/**
 * Byggkontrollen (scripts/commerce-guard.ts, körs av vite.config.ts): ett skarpt bygge får aldrig
 * tyst bli testläge med gratis testlicenser, och inga hemligheter får hamna i appen.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { checkCommerceBuild, isP256PublicKey } from '../../scripts/commerce-guard.ts'
import { licenseKeyPair } from './fakeStripe.ts'

let keys: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
})

const complete = () => ({
  VITE_COMMERCE_MODE: 'live',
  VITE_LICENSE_PUBLIC_KEY: keys.pub,
  VITE_SELLER_NAME: 'Lagom AB',
  VITE_SUPPORT_EMAIL: 'hej@lagom.example',
})

describe('byggkontrollen för betalningen', () => {
  it('testläge och ett komplett skarpt bygge godkänns', () => {
    expect(checkCommerceBuild({})).toEqual({ errors: [], warnings: [] })
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' }).errors).toEqual([])
    expect(checkCommerceBuild(complete())).toEqual({ errors: [], warnings: [] })
  })

  it('skarpt läge utan publik nyckel stoppas (skulle annars bli testläge med gratis licenser)', () => {
    for (const key of [undefined, '', '   ']) {
      const { errors } = checkCommerceBuild({ ...complete(), VITE_LICENSE_PUBLIC_KEY: key })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('VITE_LICENSE_PUBLIC_KEY saknas')
    }
  })

  it('en trasig eller fel nyckel stoppas', () => {
    expect(isP256PublicKey(keys.pub)).toBe(true)
    expect(isP256PublicKey(keys.pub.slice(0, 40))).toBe(false)
    expect(isP256PublicKey('inte en nyckel')).toBe(false)
    const truncated = checkCommerceBuild({ ...complete(), VITE_LICENSE_PUBLIC_KEY: keys.pub.slice(0, -8) })
    expect(truncated.errors.join(' ')).toContain('ingen publik ECDSA P-256-nyckel')
  })

  it('felstavat "live" stoppas i stället för att tyst bli testläge', () => {
    for (const mode of ['Live', ' live', 'LIVE ']) {
      expect(checkCommerceBuild({ ...complete(), VITE_COMMERCE_MODE: mode }).errors.join(' ')).toContain('Skriv exakt live')
    }
  })

  it('hemligheter i VITE_-variabler stoppas i alla lägen', () => {
    const cases: Record<string, string>[] = [
      { VITE_LICENSE_PRIVATE_KEY: keys.priv },
      // Den privata nyckeln inklistrad som publik nyckel.
      { VITE_LICENSE_PUBLIC_KEY: keys.priv },
      { VITE_STRIPE_KEY: 'sk_live_123abc' },
      { VITE_STRIPE_KEY: 'rk_test_123abc' },
      { VITE_WEBHOOK: 'whsec_abc' },
      { VITE_STRIPE_SECRET_KEY: 'något' },
    ]
    for (const env of cases) {
      for (const mode of ['test', 'live']) {
        const { errors } = checkCommerceBuild({ ...complete(), VITE_COMMERCE_MODE: mode, ...env })
        expect(errors.some((e) => e.includes('ser ut att innehålla en hemlighet'))).toBe(true)
        // Hemligheten själv skrivs aldrig ut i byggloggen.
        expect(errors.join(' ')).not.toContain(Object.values(env)[0])
      }
    }
    // Serverns variabler (utan VITE_) byggs inte in och är därför okej.
    expect(checkCommerceBuild({ ...complete(), LICENSE_PRIVATE_KEY: keys.priv, STRIPE_SECRET_KEY: 'sk_live_x' }).errors).toEqual([])
  })

  it('varnar (utan att stoppa) när säljarens namn eller supportadressen saknas i skarpt läge', () => {
    const res = checkCommerceBuild({ VITE_COMMERCE_MODE: 'live', VITE_LICENSE_PUBLIC_KEY: keys.pub })
    expect(res.errors).toEqual([])
    expect(res.warnings.join(' ')).toContain('VITE_SELLER_NAME')
    expect(res.warnings.join(' ')).toContain('VITE_SUPPORT_EMAIL')
  })
})
