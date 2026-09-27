// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLicense, verifyLicense } from '../../src/lib/license.ts'
import { isIssuedLicenseValid, issueLicense, licensePayloadFor, publicKeyFromPrivate } from '../lib/licensing.ts'
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
