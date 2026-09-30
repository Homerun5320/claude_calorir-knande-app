/**
 * Spärrlistan i butiksbyggen: de verifierar licensnycklar som i skarpt läge även om de byggts i
 * testläge – då måste också spärrlistan gälla, annars fortsätter en återbetald webblicens att
 * fungera i Play-appen. Webbens testläge hoppar fortfarande över den.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function freshRevocations(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
  vi.resetModules()
  return import('./revocations')
}

describe('spärrlistan och byggläget', () => {
  it('Google Play-bygget i testläge kontrollerar spärrlistan', async () => {
    const r = await freshRevocations({ VITE_DISTRIBUTION: 'play', VITE_COMMERCE_MODE: 'test', VITE_LICENSE_PUBLIC_KEY: 'publik-nyckel' })
    expect(r.revocationChecksEnabled()).toBe(true)
  })

  it('webbens testläge hoppar över den', async () => {
    const r = await freshRevocations({ VITE_DISTRIBUTION: 'web', VITE_COMMERCE_MODE: 'test', VITE_LICENSE_PUBLIC_KEY: 'publik-nyckel' })
    expect(r.revocationChecksEnabled()).toBe(false)
  })

  it('utan publik nyckel går listan inte att verifiera – då används den inte', async () => {
    const r = await freshRevocations({ VITE_DISTRIBUTION: 'play', VITE_COMMERCE_MODE: 'test' })
    expect(r.revocationChecksEnabled()).toBe(false)
  })
})
