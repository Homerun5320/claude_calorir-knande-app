// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash, createPrivateKey, createPublicKey } from 'node:crypto'
import { decodeLicense, licenseKeyHash, verifyLicense, verifyRevocationList } from '../../src/lib/license.ts'
import {
  isIssuedLicenseValid,
  issueLicense,
  licenseIdOf,
  licenseKid,
  licensePayloadFor,
  publicKeyFromPrivate,
  signRevocations,
} from '../lib/licensing.ts'
import { CREATED, NOW, licenseKeyPair } from './fakeStripe.ts'

let keys: { priv: string; pub: string }
let other: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
  other = await licenseKeyPair()
})

describe('licenser från servern', () => {
  it('innehållet bestäms helt av köpet: id, plan och tidpunkt', () => {
    expect(licensePayloadFor('cs_live_1', 'livstid', CREATED)).toEqual({ v: 1, id: 'cs_live_1', plan: 'livstid', iat: CREATED })
    expect(licensePayloadFor('cs_live_1', 'ar', CREATED)).toEqual({ v: 1, id: 'cs_live_1', plan: 'ar', iat: CREATED, exp: CREATED + 365 * 86_400 })
  })

  it('publika nyckeln kan räknas fram ur den privata', async () => {
    expect(await publicKeyFromPrivate(keys.priv)).toBe(keys.pub)
    await expect(publicKeyFromPrivate('inte-en-nyckel')).rejects.toBeTruthy()
  })

  it('utfärdade nycklar godkänns av appens verifiering i skarpt läge', async () => {
    const payload = licensePayloadFor('cs_live_abc', 'ar', CREATED)
    const key = await issueLicense(payload, keys.priv)
    expect(decodeLicense(key)).toEqual(payload)
    expect(await verifyLicense(key, { publicKey: keys.pub, mode: 'live', now: NOW })).toEqual({ ok: true, payload })
    expect((await verifyLicense(key, { publicKey: other.pub, mode: 'live', now: NOW })).ok).toBe(false)
  })

  it('en sparad nyckel återanvänds bara om den gäller exakt samma köp och nuvarande nyckelpar', async () => {
    const payload = licensePayloadFor('cs_live_abc', 'livstid', CREATED)
    const key = await issueLicense(payload, keys.priv)
    expect(await isIssuedLicenseValid(key, payload, keys.pub)).toBe(true)
    // Annat köp, annan plan eller annat nyckelpar (t.ex. efter byte från test till skarpt läge).
    expect(await isIssuedLicenseValid(key, { ...payload, id: 'cs_live_annat' }, keys.pub)).toBe(false)
    expect(await isIssuedLicenseValid(key, licensePayloadFor('cs_live_abc', 'ar', CREATED), keys.pub)).toBe(false)
    expect(await isIssuedLicenseValid(key, payload, other.pub)).toBe(false)
    expect(await isIssuedLicenseValid('skräp', payload, keys.pub)).toBe(false)
  })

  it('en utgången årslicens räknas ändå som rätt utfärdad (utgången hanteras separat)', async () => {
    const payload = licensePayloadFor('cs_live_old', 'ar', CREATED - 400 * 86_400)
    const key = await issueLicense(payload, keys.priv)
    expect(await isIssuedLicenseValid(key, payload, keys.pub)).toBe(true)
  })
})

describe('nyckel-id (kid) i licenserna', () => {
  it('kid = de första 8 base64url-tecknen av SHA-256 över den publika nyckelns SPKI-byte', async () => {
    // Oberoende beräkning med Nodes crypto: härled den publika nyckeln ur den privata.
    const spki = createPublicKey(createPrivateKey({ key: Buffer.from(keys.priv, 'base64'), format: 'der', type: 'pkcs8' })).export({
      format: 'der',
      type: 'spki',
    })
    const expected = createHash('sha256').update(spki).digest('base64url').slice(0, 8)
    expect(await licenseKid(await publicKeyFromPrivate(keys.priv))).toBe(expected)
    expect(expected).toMatch(/^[A-Za-z0-9_-]{8}$/)
    expect(await licenseKid(other.pub)).not.toBe(expected)
  })

  it('kid finns i utfärdade licenser och innehållet är fortfarande helt bestämt av köpet', async () => {
    const kid = await licenseKid(keys.pub)
    const a = licensePayloadFor('cs_live_k1', 'livstid', CREATED, kid)
    expect(a).toEqual({ v: 1, id: 'cs_live_k1', plan: 'livstid', iat: CREATED, kid })
    expect(licensePayloadFor('cs_live_k1', 'livstid', CREATED, kid)).toEqual(a)
    const key = await issueLicense(a, keys.priv)
    expect(decodeLicense(key)?.kid).toBe(kid)
    // Appen provar nyckeln med rätt kid först, även när flera publika nycklar är inbyggda.
    expect(await verifyLicense(key, { publicKey: [other.pub, keys.pub], mode: 'live', now: NOW })).toEqual({ ok: true, payload: a })
  })

  it('gamla licenser utan kid verifieras fortfarande och räknas som samma köp', async () => {
    const old = licensePayloadFor('cs_live_gammal', 'livstid', CREATED)
    expect(old.kid).toBeUndefined()
    const key = await issueLicense(old, keys.priv)
    expect(await verifyLicense(key, { publicKey: keys.pub, mode: 'live', now: NOW })).toEqual({ ok: true, payload: old })
    expect(await verifyLicense(key, { publicKey: [other.pub, keys.pub], mode: 'live', now: NOW })).toMatchObject({ ok: true })
    const withKid = licensePayloadFor('cs_live_gammal', 'livstid', CREATED, await licenseKid(keys.pub))
    expect(await isIssuedLicenseValid(key, withKid, keys.pub)).toBe(true)
  })
})

describe('spärrlistan och licens-id', () => {
  it('licenseIdOf är samma hash som appen räknar (SHA-256 base64url av hela nyckeln)', async () => {
    const key = await issueLicense(licensePayloadFor('cs_live_h1', 'ar', CREATED), keys.priv)
    const expected = createHash('sha256').update(key, 'utf8').digest('base64url')
    expect(await licenseIdOf(key)).toBe(expected)
    expect(await licenseIdOf(` ${key}\n`)).toBe(await licenseKeyHash(key))
  })

  it('signRevocations ger en lista som appen godkänner – och bara med rätt nyckel', async () => {
    const token = await signRevocations(['cs_live_a', 'cs_live_b'], 1_790_000_000, keys.priv)
    expect(token).toMatch(/^LAGOMREV1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(await verifyRevocationList(token, { publicKey: keys.pub })).toEqual({ v: 1, issuedAt: 1_790_000_000, ids: ['cs_live_a', 'cs_live_b'] })
    expect(await verifyRevocationList(token, { publicKey: other.pub })).toBeNull()
    await expect(signRevocations([], 1, 'inte-en-nyckel')).rejects.toBeTruthy()
  })
})
