import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  base64UrlDecode,
  base64UrlEncode,
  createTestLicense,
  decodeLicense,
  keyId,
  licenseKeyHash,
  signLicense,
  signRevocationList,
  verifyLicense,
  verifyRevocationList,
  type LicensePayload,
} from './license'
import { accessStatus, canLog } from '../hooks/useAccess'

async function keyPair() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', kp.publicKey))
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
  return { priv: b64(pkcs8), pub: b64(spki) }
}

const NOW = Date.UTC(2026, 8, 27, 12)

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('licensnycklar', () => {
  it('base64url tur och retur', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 255, 62, 63])
    expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes)
  })

  it('ett köp med Stripes testkort (cs_test_…) godtas inte i skarpt läge när appen ber om det', async () => {
    const { priv, pub } = await keyPair()
    const iat = Math.floor(NOW / 1000)
    const testKey = await signLicense({ v: 1, id: 'cs_test_kort4242', plan: 'livstid', iat }, priv)
    const liveKey = await signLicense({ v: 1, id: 'cs_live_riktigt', plan: 'livstid', iat }, priv)
    const strict = { publicKey: pub, mode: 'live' as const, now: NOW, rejectTestPurchases: true }
    expect(await verifyLicense(testKey, strict)).toEqual({ ok: false, reason: 'testlicens' })
    expect((await verifyLicense(liveKey, strict)).ok).toBe(true)
    // Förhandsversioner (VITE_ACCEPT_TEST_PURCHASES=1) och testläget godtar testköpet.
    expect((await verifyLicense(testKey, { ...strict, rejectTestPurchases: false })).ok).toBe(true)
    expect((await verifyLicense(testKey, { ...strict, mode: 'test' })).ok).toBe(true)
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

describe('flera publika nycklar (nyckelbyte med kid)', () => {
  it('keyId är de första 8 base64url-tecknen av SHA-256 över SPKI-byten', async () => {
    const { pub } = await keyPair()
    const id = await keyId(pub)
    expect(id).toMatch(/^[A-Za-z0-9_-]{8}$/)
    const spki = Uint8Array.from(atob(pub), (c) => c.charCodeAt(0))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', spki))
    expect(id).toBe(base64UrlEncode(digest).slice(0, 8))
    expect(await keyId(pub)).toBe(id)
  })

  it('en licens signerad med nyckel 2 verifieras när appen har båda nycklarna', async () => {
    const k1 = await keyPair()
    const k2 = await keyPair()
    const payload: LicensePayload = { v: 1, id: 'cs_live_2', plan: 'ar', iat: Math.floor(NOW / 1000), exp: Math.floor(NOW / 1000) + 365 * 86_400, kid: await keyId(k2.pub) }
    const key = await signLicense(payload, k2.priv)
    expect(await verifyLicense(key, { publicKey: [k1.pub, k2.pub], mode: 'live', now: NOW })).toEqual({ ok: true, payload })
    // Bara den gamla nyckeln räcker inte.
    expect(await verifyLicense(key, { publicKey: [k1.pub], mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'signatur' })
  })

  it('fel kid men giltig signatur verifieras via reserven (alla nycklar provas)', async () => {
    const k1 = await keyPair()
    const k2 = await keyPair()
    const payload: LicensePayload = { v: 1, id: 'cs_live_3', plan: 'livstid', iat: 1, kid: await keyId(k2.pub) }
    // Signerad med nyckel 1 trots att kid pekar på nyckel 2.
    const key = await signLicense(payload, k1.priv)
    expect((await verifyLicense(key, { publicKey: [k2.pub, k1.pub], mode: 'live', now: NOW })).ok).toBe(true)
    // Okänt kid fungerar också.
    const unknown = await signLicense({ ...payload, kid: 'okänt12' }, k1.priv)
    expect((await verifyLicense(unknown, { publicKey: [k2.pub, k1.pub], mode: 'live', now: NOW })).ok).toBe(true)
  })

  it('en manipulerad payload avvisas med alla nycklar', async () => {
    const k1 = await keyPair()
    const k2 = await keyPair()
    const key = await signLicense({ v: 1, id: 'x', plan: 'ar', iat: 1, exp: 4_000_000_000, kid: await keyId(k2.pub) }, k2.priv)
    const [p, body, sig] = key.split('.')
    const forged = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)))
    forged.plan = 'livstid'
    delete forged.exp
    const forgedKey = `${p}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify(forged)))}.${sig}`
    expect(await verifyLicense(forgedKey, { publicKey: [k1.pub, k2.pub], mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'signatur' })
  })

  it('utan kid fungerar som förut – med en nyckel som text eller i en lista', async () => {
    const k1 = await keyPair()
    const k2 = await keyPair()
    const payload: LicensePayload = { v: 1, id: 'cs_old', plan: 'livstid', iat: 1 }
    const key = await signLicense(payload, k1.priv)
    expect(await verifyLicense(key, { publicKey: k1.pub, mode: 'live', now: NOW })).toEqual({ ok: true, payload })
    expect(await verifyLicense(key, { publicKey: [k2.pub, k1.pub], mode: 'live', now: NOW })).toEqual({ ok: true, payload })
    expect(await verifyLicense(key, { publicKey: [], mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'ingen-nyckel' })
    expect(await verifyLicense(key, { publicKey: ['  ', ''], mode: 'live', now: NOW })).toEqual({ ok: false, reason: 'ingen-nyckel' })
    // En trasig nyckel i listan stoppar inte de andra.
    expect((await verifyLicense(key, { publicKey: ['inte-en-nyckel', k1.pub], mode: 'live', now: NOW })).ok).toBe(true)
  })

  it('ett kid som inte är text gör nyckeln ogiltig', () => {
    const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, id: 'x', plan: 'ar', iat: 1, kid: 5 })))
    expect(decodeLicense(`LAGOM1.${body}.sig`)).toBeNull()
  })
})

describe('butiksbyggen verifierar alltid som skarpt läge', () => {
  it('osignerade testnycklar godtas inte ens om appen är byggd i testläge', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const fresh = await import('./license')
    const key = fresh.createTestLicense('livstid', undefined, NOW)
    expect(await fresh.verifyLicense(key, { publicKey: '', mode: 'test', now: NOW })).toEqual({ ok: false, reason: 'testlicens' })
    // Signerade licenser fungerar som vanligt.
    const { priv, pub } = await keyPair()
    const signed = await fresh.signLicense({ v: 1, id: 'cs_1', plan: 'ar', iat: 1, exp: 4_000_000_000 }, priv)
    expect((await fresh.verifyLicense(signed, { publicKey: pub, mode: 'test', now: NOW })).ok).toBe(true)
  })
})

describe('spärrlistan', () => {
  it('en signerad lista verifieras och läses', async () => {
    const { priv, pub } = await keyPair()
    const token = await signRevocationList({ v: 1, issuedAt: 1_790_000_000, ids: ['cs_live_1', 'cs_live_2'] }, priv)
    expect(token.startsWith('LAGOMREV1.')).toBe(true)
    expect(await verifyRevocationList(token, { publicKey: [pub] })).toEqual({ v: 1, issuedAt: 1_790_000_000, ids: ['cs_live_1', 'cs_live_2'] })
  })

  it('en signatur över "LAGOMREV1.<payload>" (som licenserna) godtas också', async () => {
    const { priv, pub } = await keyPair()
    const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, issuedAt: 5, ids: ['a'] })))
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(priv), (c) => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`LAGOMREV1.${body}`)))
    expect(await verifyRevocationList(`LAGOMREV1.${body}.${base64UrlEncode(sig)}`, { publicKey: pub })).toEqual({ v: 1, issuedAt: 5, ids: ['a'] })
  })

  it('manipulerade, felsignerade och trasiga listor godtas aldrig', async () => {
    const a = await keyPair()
    const b = await keyPair()
    const token = await signRevocationList({ v: 1, issuedAt: 10, ids: ['cs_1'] }, a.priv)
    // Fel nyckel.
    expect(await verifyRevocationList(token, { publicKey: b.pub })).toBeNull()
    // Utan nyckel.
    expect(await verifyRevocationList(token, { publicKey: [] })).toBeNull()
    // Någon tar bort sitt eget id ur listan.
    const [p, , sig] = token.split('.')
    const emptied = `${p}.${base64UrlEncode(new TextEncoder().encode(JSON.stringify({ v: 1, issuedAt: 10, ids: [] })))}.${sig}`
    expect(await verifyRevocationList(emptied, { publicKey: a.pub })).toBeNull()
    // En licensnyckel är ingen spärrlista (och tvärtom).
    const license = await signLicense({ v: 1, id: 'x', plan: 'ar', iat: 1 }, a.priv)
    expect(await verifyRevocationList(license, { publicKey: a.pub })).toBeNull()
    expect((await verifyLicense(token, { publicKey: a.pub, mode: 'live', now: NOW })).ok).toBe(false)
    for (const junk of ['', 'LAGOMREV1', 'LAGOMREV1.x.y', 'LAGOMREV1.@@@.sig']) {
      expect(await verifyRevocationList(junk, { publicKey: a.pub })).toBeNull()
    }
  })

  it('nyckelns hash är SHA-256 över hela den tvättade nyckeln', async () => {
    const key = createTestLicense('ar', 365, NOW)
    const expected = base64UrlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))))
    expect(await licenseKeyHash(`  "${key}"\n`)).toBe(expected)
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
