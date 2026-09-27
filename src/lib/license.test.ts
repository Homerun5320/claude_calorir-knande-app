import { describe, expect, it } from 'vitest'
import { base64UrlDecode, base64UrlEncode, createTestLicense, decodeLicense, signLicense, verifyLicense, type LicensePayload } from './license'
import { accessStatus, canLog } from '../hooks/useAccess'

async function keyPair() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
  return { priv: b64(pkcs8), pub: b64(spki) }
}

const NOW = Date.UTC(2026, 8, 27, 12)

describe('licensnycklar', () => {
  it('base64url tur och retur', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 255, 62, 63])
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes)
  })

  it('signerad livstidslicens verifieras i skarpt läge', async () => {
    const { priv, pub } = await keyPair()
    const payload: LicensePayload = { v: 1, id: 'cs_test_123', plan: 'livstid', iat: Math.floor(NOW / 1000) }
    const key = await signLicense(payload, priv)
    expect(key.startsWith('LAGOM1.')).toBe(true)
    const res = await verifyLicense(`  ${key}\n`, { publicKey: pub, mode: 'live', now: NOW })
    expect(res).toEqual({ ok: true, payload })
  })

  it('manipulerad nyckel eller fel nyckelpar underkänns', async () => {
    const a = await keyPair()
    const b = await keyPair()
    const key = await signLicense({ v: 1, id: 'x', plan: 'ar', iat: 1, exp: 4_000_000_000 }, a.priv)
    expect((await verifyLicense(key, { publicKey: b.pub, mode: 'live', now: NOW })).ok).toBe(false)
    const [p, body, sig] = key.split('.')
    const forged = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)))
    forged.plan = 'livstid'
    delete forged.exp
    const forgedKey = `${p}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(forged)))}.${sig}`
    expect(await verifyLicense(forgedKey, { publicKey: a.pub, mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'signatur' })
  })

  it('utgången årslicens', async () => {
    const { priv, pub } = await keyPair()
    const key = await signLicense({ v: 1, id: 'y', plan: 'ar', iat: 1, exp: Math.floor(NOW / 1000) - 10 }, priv)
    expect(await verifyLicense(key, { publicKey: pub, mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'utgangen' })
  })

  it('testlicenser gäller bara i testläge', async () => {
    const key = createTestLicense('ar', 365, NOW)
    expect(decodeLicense(key)?.test).toBe(true)
    expect((await verifyLicense(key, { publicKey: '', mode: 'test', now: NOW })).ok).toBe(true)
    expect(await verifyLicense(key, { publicKey: 'x', mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'testlicens' })
  })

  it('förfalskade testlicenser och osignerade nycklar godtas aldrig i skarpt läge', async () => {
    const { pub } = await keyPair()
    const enc = (o: object) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)))
    const base = { v: 1, id: 'x', plan: 'livstid', iat: 1 }
    // Testflaggan i alla former (även "false" som text) → testlicens, aldrig giltig i skarpt läge.
    for (const test of [true, 1, 'true', 'false']) {
      const key = `LAGOM1.${enc({ ...base, test })}.test`
      expect(await verifyLicense(key, { publicKey: pub, mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'testlicens' })
    }
    // Utan testflagga krävs en giltig signatur – i båda lägena.
    for (const mode of ['live', 'test'] as const) {
      for (const sig of ['test', '', 'AAAA', base64UrlEncode(new Uint8Array(64))]) {
        const res = await verifyLicense(`LAGOM1.${enc({ ...base, test: false })}.${sig}`, { publicKey: pub, mode, now: NOW })
        expect(res.ok).toBe(false)
      }
    }
  })

  it('skräp underkänns som format', async () => {
    expect(await verifyLicense('hej', { publicKey: '', mode: 'test' })).toEqual({ ok: false, reason: 'format' })
    expect(decodeLicense('LAGOM1.@@@.x')).toBeNull()
  })
})

describe('tillgång', () => {
  const DAY = 86_400_000
  it('ny användare utan provstart', () => {
    expect(accessStatus({ trialStartedAt: null, license: null, now: NOW }).kind).toBe('ny')
  })
  it('provperiod med dagar kvar och sedan utgången', () => {
    const s = accessStatus({ trialStartedAt: NOW - 3 * DAY, license: null, now: NOW, trialDays: 14 })
    expect(s).toMatchObject({ kind: 'prov', daysLeft: 11 })
    const e = accessStatus({ trialStartedAt: NOW - 15 * DAY, license: null, now: NOW, trialDays: 14 })
    expect(e.kind).toBe('utgangen')
    expect(canLog(e)).toBe(false)
    expect(canLog(s)).toBe(true)
  })
  it('licens går före provperiod', () => {
    const s = accessStatus({
      trialStartedAt: NOW - 100 * DAY,
      license: { ok: true, payload: { v: 1, id: 'a', plan: 'livstid', iat: 1 } },
      now: NOW,
    })
    expect(s.kind).toBe('licensierad')
    expect(canLog(s)).toBe(true)
  })
  it('en provstart i framtiden (klockan ställd framåt vid start) ger aldrig mer än provperiodens dagar', () => {
    const s = accessStatus({ trialStartedAt: NOW + 365 * DAY, license: null, now: NOW, trialDays: 14 })
    expect(s).toMatchObject({ kind: 'prov', daysLeft: 14, endsAt: NOW + 14 * DAY })
  })
  it('utgången licens efter provperioden', () => {
    const s = accessStatus({ trialStartedAt: NOW - 400 * DAY, license: { ok: false, reason: 'utgangen' }, now: NOW })
    expect(s).toMatchObject({ kind: 'utgangen', licenseExpired: true })
  })
})
