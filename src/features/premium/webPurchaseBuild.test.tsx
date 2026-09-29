/**
 * Webbköpen finns bara i webbygget (WEB_PURCHASES_BUILD) och licensnycklar kan aktiveras på webben
 * och i Google Play-appen, aldrig i App Store-bygget (KEY_ENTRY_BUILD). I bygget är villkoren
 * konstanter som tar bort koden ur butiksappens paket (kontrolleras med riktiga byggen i
 * netlify/tests/store-bundle.test.ts). Här kontrolleras samma villkor när appen körs: delarna för
 * webbköp ritar ingenting och anropar aldrig servern i butiksbyggena.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

type Distribution = 'web' | 'appstore' | 'play'

async function fresh(distribution: Distribution) {
  vi.stubEnv('VITE_DISTRIBUTION', distribution)
  vi.resetModules()
  const [platform, logic, components] = await Promise.all([import('../../config/platform'), import('./premiumLogic'), import('./components')])
  return { platform, logic, components }
}

const PLAN = { id: 'ar', name: 'Årslicens', priceKr: 349, period: 'för ett år', durationDays: 365, perks: ['Allt i Lagom'] } as const

describe('byggkonstanterna', () => {
  it.each([
    ['web', true, true],
    ['appstore', false, false],
    ['play', false, true],
  ] as const)('%s: webbköp %s, licensnycklar %s', async (distribution, web, keys) => {
    const { platform } = await fresh(distribution)
    expect(platform.WEB_PURCHASES_BUILD).toBe(web)
    expect(platform.KEY_ENTRY_BUILD).toBe(keys)
    expect(platform.allowsLicenseKeyEntry()).toBe(keys)
    if (!web) {
      expect(platform.sellsOnWeb()).toBe(false)
      expect(platform.offersLicenseRecovery()).toBe(false)
    }
  })
})

describe.each(['appstore', 'play'] as const)('%s-bygget utan webbköp', (distribution) => {
  it('köpstart, tacksidans hämtning och "Tappat nyckeln?" anropar aldrig servern', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { logic } = await fresh(distribution)
    await expect(logic.createCheckout('ar')).rejects.toBeInstanceOf(logic.PurchaseError)
    await expect(logic.verifyPurchase('cs_test_abcdefghij')).rejects.toBeInstanceOf(logic.PurchaseError)
    await expect(logic.recoverLicense('a@b.se', '1234-5678')).rejects.toBeInstanceOf(logic.PurchaseError)
    expect(() => logic.redirectTo('https://checkout.stripe.com/c/pay/cs_test')).toThrow(logic.PurchaseError)
    expect(await logic.buyInTestMode({ ...PLAN, perks: [...PLAN.perks] })).toMatchObject({ ok: false })
    expect(logic.sessionIdFrom(new URLSearchParams('session_id=cs_test_abc'), '?session_id=cs_test_abc')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('planerna med kronpris, köparket, säljarraden, butikslänkarna och "Tappat nyckeln?" ritar ingenting', async () => {
    const { components } = await fresh(distribution)
    const plan = { ...PLAN, perks: [...PLAN.perks] }
    const { container } = render(
      <MemoryRouter>
        <components.PlanCard plan={plan} onChoose={() => {}} />
        <components.CheckoutSheet plan={plan} open onClose={() => {}} onConfirm={() => {}} busy={false} error={null} />
        <components.SellerFooter />
        <components.StoreLinksPanel />
        <components.LicenseRecovery />
        <components.TestModeBanner />
      </MemoryRouter>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument()
  })

  it('köpvillkoren är butikens – inga kronor och ingen Stripe', async () => {
    const { components } = await fresh(distribution)
    render(
      <MemoryRouter>
        <components.TermsContent />
      </MemoryRouter>,
    )
    expect(screen.getByText('Köp och betalning')).toBeInTheDocument()
    expect(screen.queryByText(/Stripe/)).not.toBeInTheDocument()
  })
})

describe('licensnycklar', () => {
  it('App Store-bygget: ingen aktivering av licensnycklar och ingen hämtning av spärrlistan', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { logic, components } = await fresh('appstore')
    const { container } = render(<components.LicenseActivation />)
    expect(container).toBeEmptyDOMElement()
    expect(await logic.activateLicense('LAGOM1.abc.def')).toEqual({ ok: false, message: logic.KEY_ENTRY_DISABLED })
    const revocations = await import('./revocations')
    expect(await revocations.refreshRevocations({ force: true })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Google Play-bygget: licensnycklar från webbköp går att aktivera', async () => {
    const { components } = await fresh('play')
    render(<components.LicenseActivation />)
    expect(screen.getByRole('button', { name: 'Aktivera licensen' })).toBeInTheDocument()
    expect(screen.getByText(/Klistra in hela nyckeln/)).toBeInTheDocument()
  })

  it('webbygget: aktivering och "Tappat nyckeln?" finns', async () => {
    const { components } = await fresh('web')
    render(
      <>
        <components.LicenseActivation />
        <components.LicenseRecovery />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Aktivera licensen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tappat nyckeln?' })).toBeInTheDocument()
  })
})
