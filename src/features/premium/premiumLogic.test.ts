/**
 * Köplogiken: statustexter, när provperioden visas, vilka planer som erbjuds, aktivering av
 * licensnycklar och anropen till betalservern (med fejkad fetch).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLANS } from '../../config/commerce'
import { accessStatus, currentAccess, resetLicenseChecks } from '../../hooks/useAccess'
import { createTestLicense } from '../../lib/license'
import { useLicenseStore } from '../../stores/licenseStore'
import {
  PURCHASE_ERRORS,
  PurchaseError,
  activateLicense,
  buyInTestMode,
  createCheckout,
  formatKronor,
  plansToOffer,
  priceSummary,
  sessionIdFrom,
  statusSummary,
  trialBannerLevel,
  verifyPurchase,
} from './premiumLogic'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 27, 10)

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  useLicenseStore.getState().resetLicenseState()
  resetLicenseChecks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('statustexter', () => {
  it('provperiod, utgången och licens med ärliga, lugna texter', () => {
    const prov = accessStatus({ trialStartedAt: NOW - 3 * DAY, license: null, now: NOW })
    expect(statusSummary(prov).title).toBe('11 dagar kvar av provperioden')
    expect(statusSummary(prov).text).toMatch(/Inget dras automatiskt/)

    const one = accessStatus({ trialStartedAt: NOW - 13.5 * DAY, license: null, now: NOW })
    expect(statusSummary(one).title).toBe('1 dag kvar av provperioden')

    const slut = accessStatus({ trialStartedAt: NOW - 20 * DAY, license: null, now: NOW })
    expect(statusSummary(slut).title).toBe('Provperioden är slut – din data finns kvar')
    expect(statusSummary(slut).text).toMatch(/se, exportera och radera/)

    const livstid = accessStatus({ trialStartedAt: NOW - 90 * DAY, license: { ok: true, payload: { v: 1, id: 'a', plan: 'livstid', iat: 1 } }, now: NOW })
    expect(statusSummary(livstid)).toMatchObject({ label: 'Livstidslicens', title: 'Lagom är ditt – för alltid' })

    const exp = Math.floor((NOW + 100 * DAY) / 1000)
    const ar = accessStatus({ trialStartedAt: null, license: { ok: true, payload: { v: 1, id: 'b', plan: 'ar', iat: 1, exp } }, now: NOW })
    expect(statusSummary(ar).title).toMatch(/^Giltig till \d+ [a-zåäö]+ 2027$/)
    expect(statusSummary(ar).text).toMatch(/100 dagar kvar\. Licensen förnyas inte automatiskt/)
  })

  it('en licens som går ut medan appen är öppen räknas som utgången', () => {
    const exp = Math.floor((NOW - 1000) / 1000)
    const s = accessStatus({ trialStartedAt: NOW - 400 * DAY, license: { ok: true, payload: { v: 1, id: 'c', plan: 'ar', iat: 1, exp } }, now: NOW })
    expect(s).toMatchObject({ kind: 'utgangen', licenseExpired: true })
    expect(statusSummary(s).title).toBe('Årslicensen har gått ut – din data finns kvar')
  })

  it('provperioden syns diskret, tydligare de sista tre dagarna och som kort efteråt', () => {
    expect(trialBannerLevel(accessStatus({ trialStartedAt: NOW, license: null, now: NOW }))).toBe('chip')
    expect(trialBannerLevel(accessStatus({ trialStartedAt: NOW - 11 * DAY, license: null, now: NOW }))).toBe('soon')
    expect(trialBannerLevel(accessStatus({ trialStartedAt: NOW - 15 * DAY, license: null, now: NOW }))).toBe('expired')
    expect(trialBannerLevel(accessStatus({ trialStartedAt: null, license: null, now: NOW }))).toBe('none')
    expect(trialBannerLevel({ kind: 'licensierad', plan: PLANS[1], payload: { v: 1, id: 'x', plan: 'livstid', iat: 1 }, test: false })).toBe('none')
  })

  it('erbjuder inga planer vid livstid och bara livstid vid en färsk årslicens', () => {
    const payload = { v: 1 as const, id: 'x', plan: 'ar' as const, iat: 1 }
    expect(plansToOffer({ kind: 'prov', daysLeft: 3, endsAt: NOW }, PLANS)).toHaveLength(2)
    expect(plansToOffer({ kind: 'licensierad', plan: PLANS[1], payload: { ...payload, plan: 'livstid' }, test: false }, PLANS)).toEqual([])
    expect(plansToOffer({ kind: 'licensierad', plan: PLANS[0], payload, expiresAt: NOW + 200 * DAY, daysLeft: 200, test: false }, PLANS).map((p) => p.id)).toEqual(['livstid'])
    expect(plansToOffer({ kind: 'licensierad', plan: PLANS[0], payload, expiresAt: NOW + 10 * DAY, daysLeft: 10, test: false }, PLANS)).toHaveLength(2)
  })

  it('priser inklusive moms i klartext', () => {
    expect(priceSummary()).toBe('299 kr/år eller 599 kr för alltid')
    expect(formatKronor(119.8)).toBe('119,80 kr')
  })
})

describe('aktivering', () => {
  it('sparar en giltig nyckel och uppdaterar tillgången direkt', async () => {
    const key = createTestLicense('livstid', undefined)
    const res = await activateLicense(`  ${key}\n`)
    expect(res.ok).toBe(true)
    expect(useLicenseStore.getState().licenseKey).toBe(key)
    expect(currentAccess().status.kind).toBe('licensierad')
  })

  it('visar ett begripligt fel för skräp och tomt fält', async () => {
    expect(await activateLicense('')).toEqual({ ok: false, message: 'Klistra in din licensnyckel först.' })
    const res = await activateLicense('inte en nyckel')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.message).toMatch(/börjar med LAGOM1/)
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })

  it('testköp ger en testlicens med rätt giltighet', async () => {
    const res = await buyInTestMode(PLANS[0], NOW)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.payload).toMatchObject({ plan: 'ar', test: true })
      expect(res.payload.exp).toBe(Math.floor(NOW / 1000) + 365 * 86_400)
    }
  })
})

describe('betalservern', () => {
  it('create-checkout skickar planen och returnerar Stripes adress', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' }))
    await expect(createCheckout('livstid')).resolves.toBe('https://checkout.stripe.com/c/pay/cs_test_1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/create-checkout')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ plan: 'livstid', consent: true })
  })

  it('create-checkout: serverfel, konstiga svar och nätverksfel ger svenska meddelanden', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 500))
    await expect(createCheckout('ar')).rejects.toMatchObject({ code: 'server', message: PURCHASE_ERRORS.server })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ url: 'javascript:alert(1)' }))
    await expect(createCheckout('ar')).rejects.toMatchObject({ code: 'invalid' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(createCheckout('ar')).rejects.toBeInstanceOf(PurchaseError)
  })

  it('offline: inget anrop görs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await expect(createCheckout('ar')).rejects.toMatchObject({ code: 'offline', message: PURCHASE_ERRORS.offline })
    expect(fetchMock).not.toHaveBeenCalled()
    onLine.mockRestore()
  })

  it('verify-purchase: nyckel, pågående betalning och okänt köp', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ licenseKey: 'LAGOM1.a.b' }))
    await expect(verifyPurchase('cs_test_1')).resolves.toEqual({ kind: 'ok', licenseKey: 'LAGOM1.a.b' })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ sessionId: 'cs_test_1' })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ status: 'pending' }, 202))
    await expect(verifyPurchase('cs_test_1')).resolves.toEqual({ kind: 'pending' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ code: 'hittades-inte' }, 404))
    await expect(verifyPurchase('cs_test_1')).rejects.toMatchObject({ code: 'not-found' })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({}, 502))
    await expect(verifyPurchase('cs_test_1')).rejects.toMatchObject({ code: 'server', message: PURCHASE_ERRORS.server })
    // Serverns egna svenska meddelande visas när det finns.
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ code: 'avbruten', error: 'Köpet avbröts eller hann gå ut. Inga pengar har dragits.' }, 410))
    await expect(verifyPurchase('cs_test_1')).rejects.toMatchObject({ code: 'not-found', message: 'Köpet avbröts eller hann gå ut. Inga pengar har dragits.' })
  })

  it('session-id läses ur hash-adressen och som reserv ur sökdelen', () => {
    expect(sessionIdFrom(new URLSearchParams('session_id=cs_1'), '')).toBe('cs_1')
    expect(sessionIdFrom(new URLSearchParams(''), '?session_id=cs_2')).toBe('cs_2')
    expect(sessionIdFrom(new URLSearchParams(''), '')).toBeNull()
  })
})
