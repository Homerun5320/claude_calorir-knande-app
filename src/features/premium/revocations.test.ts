/**
 * Spärrlistan för återbetalda webblicenser: signaturen kontrolleras, listan sparas på enheten och
 * ersätts aldrig av en äldre, hämtas högst en gång per dygn (och vid aktivering), gäller offline
 * och ger statusen "återkallad" – utan att någon data låses.
 *
 * Skarpt läge med en riktig nyckel: config/commerce byts ut mot en variant med ett nyckelpar som
 * skapas när testet startar.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const keys = vi.hoisted(() => ({ pub: '', priv: '', otherPriv: '' }))

vi.mock('../../config/commerce', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../config/commerce')>()
  const b64 = (u: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(u)))
  const make = async () => (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const kp = await make()
  const other = await make()
  keys.pub = b64(await crypto.subtle.exportKey('spki', kp.publicKey))
  keys.priv = b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey))
  keys.otherPriv = b64(await crypto.subtle.exportKey('pkcs8', other.privateKey))
  return { ...original, COMMERCE_MODE: 'live', LICENSE_PUBLIC_KEYS: [keys.pub], LICENSE_PUBLIC_KEY: keys.pub, API_BASE: 'https://lagom.example' }
})

import { currentAccess, resetLicenseChecks, useAccess } from '../../hooks/useAccess'
import { createTestLicense, licenseKeyHash, signLicense, signRevocationList, type LicensePayload } from '../../lib/license'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { activateLicense, statusSummary } from './premiumLogic'
import {
  REVOCATION_STORAGE_KEY,
  applyRevocationToken,
  extractRevocationToken,
  isLicenseRevoked,
  prepareRevocationCheck,
  refreshRevocations,
  reloadRevocationsForTests,
  resetRevocationsForTests,
  revocationChecksEnabled,
  revocationIssuedAt,
  verifyStoredRevocations,
} from './revocations'

const DAY = 86_400_000
const PAYLOAD: LicensePayload = { v: 1, id: 'cs_live_aterbetald', plan: 'livstid', iat: 1_780_000_000 }

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status })
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetRevocationsForTests()
  resetLicenseChecks()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('signatur och sparad lista', () => {
  it('skarpt läge med nyckel: kontrollen är på', () => {
    expect(revocationChecksEnabled()).toBe(true)
  })

  it('en signerad lista sparas på enheten och spärrar licensen', async () => {
    const token = await signRevocationList({ v: 1, issuedAt: 100, ids: [PAYLOAD.id] }, keys.priv)
    expect(await applyRevocationToken(token)).toBe('uppdaterad')
    expect(revocationIssuedAt()).toBe(100)
    expect(JSON.parse(localStorage.getItem(REVOCATION_STORAGE_KEY) ?? '{}')).toMatchObject({ token, issuedAt: 100, ids: [PAYLOAD.id] })
    expect(isLicenseRevoked('LAGOM1.x.y', PAYLOAD)).toBe(true)
    expect(isLicenseRevoked('LAGOM1.x.y', { ...PAYLOAD, id: 'cs_live_annan' })).toBe(false)
  })

  it('en lista som inte är signerad av oss godtas inte', async () => {
    const forged = await signRevocationList({ v: 1, issuedAt: 999, ids: [] }, keys.otherPriv)
    expect(await applyRevocationToken(forged)).toBe('ogiltig')
    expect(revocationIssuedAt()).toBeNull()
  })

  it('en äldre lista ersätter aldrig en nyare', async () => {
    const newer = await signRevocationList({ v: 1, issuedAt: 200, ids: [PAYLOAD.id] }, keys.priv)
    const older = await signRevocationList({ v: 1, issuedAt: 150, ids: [] }, keys.priv)
    expect(await applyRevocationToken(newer)).toBe('uppdaterad')
    expect(await applyRevocationToken(older)).toBe('aldre')
    expect(revocationIssuedAt()).toBe(200)
    expect(isLicenseRevoked('LAGOM1.x.y', PAYLOAD)).toBe(true)
  })

  it('licensen kan också spärras med nyckelns hash', async () => {
    const key = await signLicense({ ...PAYLOAD, id: 'cs_live_hash' }, keys.priv)
    const token = await signRevocationList({ v: 1, issuedAt: 1, ids: [await licenseKeyHash(key)] }, keys.priv)
    await applyRevocationToken(token)
    await prepareRevocationCheck(key)
    expect(isLicenseRevoked(key, { ...PAYLOAD, id: 'cs_live_hash' })).toBe(true)
  })

  it('testlicenser och testläge hoppar över spärrlistan', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 1, ids: [PAYLOAD.id] }, keys.priv))
    expect(isLicenseRevoked('k', { ...PAYLOAD, test: true })).toBe(false)
    expect(isLicenseRevoked('k', PAYLOAD, { enabled: false })).toBe(false)
  })

  it('serverns svar kan vara ren text eller JSON', async () => {
    const token = await signRevocationList({ v: 1, issuedAt: 7, ids: ['a'] }, keys.priv)
    const [, payload, sig] = token.split('.')
    expect(extractRevocationToken(token)).toBe(token)
    expect(extractRevocationToken(JSON.stringify({ token }))).toBe(token)
    expect(extractRevocationToken(JSON.stringify({ payload, sig }))).toBe(token)
    expect(extractRevocationToken(JSON.stringify({ v: 1, issuedAt: 7, ids: ['a'], sig }))).toBe(token)
    expect(extractRevocationToken('<html>')).toBeNull()
    expect(extractRevocationToken(JSON.stringify({ error: 'x' }))).toBeNull()
  })
})

describe('hämtning', () => {
  it('hämtar listan när appen är online, högst en gång per dygn', async () => {
    const token = await signRevocationList({ v: 1, issuedAt: 300, ids: [PAYLOAD.id] }, keys.priv)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => textResponse(JSON.stringify({ token })))
    const now = Date.now()
    expect(await refreshRevocations({ now })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://lagom.example/api/license-revocations')
    // Samma dygn: ingen ny hämtning.
    expect(await refreshRevocations({ now: now + 3_600_000 })).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Nästa dygn: hämtas igen (oförändrad lista ger inget nytt).
    await refreshRevocations({ now: now + DAY + 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Vid aktivering: alltid.
    await refreshRevocations({ force: true, now: now + DAY + 2 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('offline: ingen hämtning, den sparade listan gäller (även efter en omstart)', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 400, ids: [PAYLOAD.id] }, keys.priv))
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await refreshRevocations({ force: true })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    reloadRevocationsForTests()
    expect(isLicenseRevoked('k', PAYLOAD)).toBe(true)
    onLine.mockRestore()
  })

  it('serverfel och förfalskade svar ändrar inget', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 500, ids: [PAYLOAD.id] }, keys.priv))
    const forged = await signRevocationList({ v: 1, issuedAt: 600, ids: [] }, keys.otherPriv)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(textResponse('fel', 500)).mockResolvedValueOnce(textResponse(forged))
    expect(await refreshRevocations({ force: true })).toBe(false)
    expect(await refreshRevocations({ force: true })).toBe(false)
    expect(revocationIssuedAt()).toBe(500)
    expect(isLicenseRevoked('k', PAYLOAD)).toBe(true)
  })
})

describe('den sparade listan går inte att ändra på enheten', () => {
  function stored(): { token: string; issuedAt: number; ids: string[]; fetchedAt: number } {
    return JSON.parse(localStorage.getItem(REVOCATION_STORAGE_KEY) as string)
  }

  it('listan läses ur den signerade texten – ändrade id:n i lagringen spelar ingen roll', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 1000, ids: [PAYLOAD.id] }, keys.priv))
    localStorage.setItem(REVOCATION_STORAGE_KEY, JSON.stringify({ ...stored(), ids: [] }))
    reloadRevocationsForTests()
    expect(isLicenseRevoked('k', PAYLOAD)).toBe(true)
  })

  it('en hämtningstid i framtiden hindrar inte nästa hämtning', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 1100, ids: [PAYLOAD.id] }, keys.priv))
    localStorage.setItem(REVOCATION_STORAGE_KEY, JSON.stringify({ ...stored(), fetchedAt: Date.now() + 365 * DAY }))
    reloadRevocationsForTests()
    const token = await signRevocationList({ v: 1, issuedAt: 1200, ids: [PAYLOAD.id] }, keys.priv)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(token))
    expect(await refreshRevocations()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('en ändrad signerad text kastas vid start – och hämtas sedan på nytt', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 1300, ids: [PAYLOAD.id] }, keys.priv))
    // Någon byter ut listan mot en utan sitt eget köp (men kan inte signera den).
    const [prefix, , sig] = stored().token.split('.')
    const body = btoa(JSON.stringify({ v: 1, issuedAt: 1300, ids: [] })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    localStorage.setItem(REVOCATION_STORAGE_KEY, JSON.stringify({ ...stored(), token: `${prefix}.${body}.${sig}` }))
    reloadRevocationsForTests()
    await verifyStoredRevocations()
    expect(revocationIssuedAt()).toBeNull()
    expect(localStorage.getItem(REVOCATION_STORAGE_KEY)).toBeNull()
    // Utan sparad lista hämtas en ny direkt när appen är online.
    const token = await signRevocationList({ v: 1, issuedAt: 1400, ids: [PAYLOAD.id] }, keys.priv)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(token))
    expect(await refreshRevocations()).toBe(true)
    expect(isLicenseRevoked('k', PAYLOAD)).toBe(true)
  })

  it('en äkta sparad lista behålls vid kontrollen', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 1500, ids: [PAYLOAD.id] }, keys.priv))
    reloadRevocationsForTests()
    await verifyStoredRevocations()
    expect(revocationIssuedAt()).toBe(1500)
    expect(isLicenseRevoked('k', PAYLOAD)).toBe(true)
  })
})

describe('status och aktivering', () => {
  it('en återbetald licens går inte att aktivera', async () => {
    const key = await signLicense(PAYLOAD, keys.priv)
    const token = await signRevocationList({ v: 1, issuedAt: 700, ids: [PAYLOAD.id] }, keys.priv)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(textResponse(token))
    const res = await activateLicense(key)
    expect(res).toEqual({ ok: false, message: 'Licensen har återkallats (köpet återbetalades). Kontakta support om det är fel.' })
    expect(fetchMock).toHaveBeenCalledWith('https://lagom.example/api/license-revocations', expect.anything())
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })

  it('en giltig licens aktiveras även när spärrlistan inte går att hämta', async () => {
    const key = await signLicense({ ...PAYLOAD, id: 'cs_live_ok' }, keys.priv)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    expect((await activateLicense(key)).ok).toBe(true)
    expect(currentAccess().status).toMatchObject({ kind: 'licensierad' })
  })

  it('en sparad licens som återkallas: statusen blir återkallad, bara ny loggning spärras', async () => {
    const key = await signLicense(PAYLOAD, keys.priv)
    useLicenseStore.setState({ trialStartedAt: Date.now() - 400 * DAY, licenseKey: key })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    const { result } = renderHook(() => useAccess())
    await waitFor(() => expect(result.current.status).toMatchObject({ kind: 'licensierad' }))

    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 800, ids: [PAYLOAD.id] }, keys.priv))
    await waitFor(() => expect(result.current.status).toMatchObject({ kind: 'utgangen', revoked: true }))
    expect(result.current.canLog).toBe(false)
    expect(statusSummary(result.current.status).text).toContain('Kontakta support om det är fel')
    // Licensnyckeln finns kvar på enheten (inget tas bort) – bara loggningen spärras.
    expect(useLicenseStore.getState().licenseKey).toBe(key)
  })

  it('testlicenser påverkas inte av spärrlistan', async () => {
    await applyRevocationToken(await signRevocationList({ v: 1, issuedAt: 900, ids: ['test_x'] }, keys.priv))
    expect(isLicenseRevoked(createTestLicense('ar', 365), { v: 1, id: 'test_x', plan: 'ar', iat: 1, test: true })).toBe(false)
  })
})
