/**
 * Köpsidan i testläge: status, priser inklusive moms, samtycke om ångerrätt före köp, testköp →
 * licensierad → loggning tillåten igen, aktivering av nyckel och borttagning från enheten.
 * Dessutom: säljaruppgifterna i köparket, butiksvarianten (App Store) utan kronor och Stripe,
 * webben med webbförsäljningen avstängd och "Tappat nyckeln?".
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogHost } from '../../components/ui'
import { resetLicenseChecks } from '../../hooks/useAccess'
import { createTestLicense } from '../../lib/license'
import { setDemoFlag, clearDemoFlag } from '../../lib/demoFlag'
import { useLicenseStore } from '../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import PremiumPage from './PremiumPage'
import { requireAccess } from './requireAccess'

MotionGlobalConfig.skipAnimations = true

const DAY = 86_400_000

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/premium', element: <PremiumPage /> },
      { path: '/', element: <p>Idag</p> },
      { path: '/valkommen', element: <p>Välkommen</p> },
      { path: '/installningar/data', element: <p>Data</p> },
    ],
    { initialEntries: ['/premium'] },
  )
  render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
  return router
}

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  resetLicenseChecks()
  clearDemoFlag()
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('PremiumPage', () => {
  it('visar provperioden, båda planerna inklusive moms och testläget', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 3 * DAY })
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Lagom Premium' })).toBeInTheDocument()
    expect(screen.getByText(/Testläge: betalningar är avstängda/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '11 dagar kvar av provperioden' })).toBeInTheDocument()

    const ar = screen.getByRole('article', { name: 'Årslicens' })
    expect(within(ar).getByText('349')).toBeInTheDocument()
    expect(within(ar).getByText(/inkl\. moms/)).toBeInTheDocument()
    expect(within(ar).getByText(/förnyas inte automatiskt/)).toBeInTheDocument()
    expect(within(ar).getByText('Motsvarar 29 kr i månaden')).toBeInTheDocument()
    const livstid = screen.getByRole('article', { name: 'Livstidslicens' })
    expect(within(livstid).getByText('699')).toBeInTheDocument()
    expect(within(livstid).getByText('Bäst värde')).toBeInTheDocument()
    expect(within(livstid).getByText('engångsköp · ingen prenumeration')).toBeInTheDocument()
    // Försiktiga livstidslöften: felrättningar ingår, inga löften om alla framtida uppdateringar.
    expect(within(livstid).getByText('Allt i Lagom – för alltid på dina enheter')).toBeInTheDocument()
    expect(within(livstid).getByText('Felrättningar ingår')).toBeInTheDocument()
    expect(screen.queryByText(/Alla framtida uppdateringar/)).not.toBeInTheDocument()

    // Köpvillkoren finns på sidan: säljare, moms, ingen förnyelse och ångerrätt.
    const villkor = screen.getByRole('region', { name: 'Köpvillkor och integritet' })
    expect(villkor).toHaveTextContent('Säljare')
    expect(villkor).toHaveTextContent('inklusive 25 % moms')
    expect(villkor).toHaveTextContent('Årslicensen förnyas inte')
    expect(villkor).toHaveTextContent('2 kap. 11 § lagen om distansavtal')
    expect(villkor).toHaveTextContent('Stripe')
    expect(villkor).toHaveTextContent('Livstidslicensen gäller utan tidsgräns')
    expect(villkor).toHaveTextContent('Nya funktioner kan tillkomma men utlovas inte')
    expect(villkor).toHaveTextContent('Funktion och kompatibilitet')
    expect(villkor).toHaveTextContent('Allmänna reklamationsnämnden (ARN), www.arn.se. Svensk lag gäller.')
    expect(villkor).toHaveTextContent(
      'Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.',
    )
    expect(within(villkor).getByRole('link', { name: 'Fullständiga köpvillkor' })).toHaveAttribute('href', '/villkor')
    // Platshållaren för supportadressen tills en riktig adress finns (live-bygget stoppas utan den).
    expect(villkor).toHaveTextContent('support@example.invalid')
    // Inga påståenden om att appen är gratis för alltid.
    expect(screen.queryByText(/inga prenumerationer|utan betalvägg/i)).not.toBeInTheDocument()
  })

  it('kräver samtycke om ångerrätt – sedan testköp, licens och loggning igen', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
    expect(requireAccess('mat')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Välj livstidslicens' }))
    const sheet = await screen.findByRole('dialog', { name: 'Köp livstidslicens' })
    expect(sheet).toHaveTextContent('699 kr')
    expect(sheet).toHaveTextContent('varav moms 25 %')
    expect(sheet).toHaveTextContent('139,80 kr')
    // Inga säljaruppgifter är satta: inga tomma etiketter.
    expect(within(sheet).queryByText('Org.nr')).not.toBeInTheDocument()
    expect(within(sheet).queryByText('Adress')).not.toBeInTheDocument()
    expect(within(sheet).queryByText('Telefon')).not.toBeInTheDocument()

    const buy = within(sheet).getByRole('button', { name: 'Köp (testläge – ingen betalning)' })
    fireEvent.click(buy)
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Kryssa i rutan för att fortsätta')
    const consent = within(sheet).getByRole('checkbox', { name: /ångerrätt på 14 dagar/ })
    expect(consent).toHaveFocus()
    expect(consent).toHaveAttribute('aria-invalid', 'true')
    expect(useLicenseStore.getState().licenseKey).toBeNull()

    fireEvent.click(consent)
    fireEvent.click(buy)
    expect(await screen.findByRole('heading', { name: 'Tack! Lagom är ditt.' })).toBeInTheDocument()
    const key = useLicenseStore.getState().licenseKey
    expect(key).toMatch(/^LAGOM1\./)
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent(key!)
    expect(screen.getByRole('button', { name: 'Kopiera nyckeln' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mejla till mig själv' })).toHaveAttribute('href', expect.stringMatching(/^mailto:\?subject=/))

    // Licensierad: ny loggning fungerar igen och inga fler planer erbjuds.
    expect(requireAccess('mat')).toBe(true)
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Livstidslicens' })).not.toBeInTheDocument())
  })

  it('aktiverar en inklistrad nyckel och visar fel på svenska', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    renderPage()
    const field = screen.getByRole('textbox', { name: 'Licensnyckel' })
    fireEvent.change(field, { target: { value: 'hej hopp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera licensen' }))
    expect(await screen.findByText(/Det där ser inte ut som en licensnyckel från Lagom/)).toBeInTheDocument()

    const key = createTestLicense('ar', 365)
    fireEvent.change(field, { target: { value: `"${key}"` } })
    fireEvent.click(screen.getByRole('button', { name: 'Aktivera licensen' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBe(key))
    expect(await screen.findByRole('heading', { name: /^Giltig till/ })).toBeInTheDocument()
    expect(requireAccess('vatten')).toBe(true)
  })

  it('visar nyckeln och tar bort licensen från enheten efter bekräftelse', async () => {
    const key = createTestLicense('livstid', undefined)
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: key })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Lagom är ditt – för alltid' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Visa min licensnyckel' }))
    expect(screen.getByTestId('licensnyckel')).toHaveTextContent(key)

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort licens från den här enheten' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Ta bort licensen från enheten?' })
    expect(dialog).toHaveTextContent('Din data påverkas inte')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Ta bort licensen' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBeNull())
    // Provperiodens start finns kvar – den startar inte om.
    expect(useLicenseStore.getState().trialStartedAt).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Provperioden är slut – din data finns kvar' })).toBeInTheDocument()
  })

  it('före profilen: prova gratis och skapa profil', () => {
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: false } })
    renderPage()
    expect(screen.getByRole('heading', { name: 'Prova gratis i 14 dagar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Skapa min profil' })).toHaveAttribute('href', '/valkommen')
  })
})

describe('PremiumPage med exempeldata', () => {
  it('erbjuder att börja med en egen profil i stället för att gå direkt till välkomstflödet', async () => {
    setDemoFlag()
    renderPage()
    expect(screen.getByRole('heading', { name: 'Prova gratis i 14 dagar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skapa min egen profil' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Skapa min profil' })).not.toBeInTheDocument()
    // Provperioden startar inte med exempeldata.
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()
    clearDemoFlag()
  })
})

describe('Tappat nyckeln?', () => {
  it('hämtar nyckeln med e-post och kvittonummer, visar den och aktiverar den på enheten', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY })
    const key = createTestLicense('livstid', undefined)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ key }), { status: 200 }))
    renderPage()
    const toggle = screen.getByRole('button', { name: 'Tappat nyckeln?' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Tomma fält: svenska fel, inget anrop.
    fireEvent.click(screen.getByRole('button', { name: 'Hämta min licensnyckel' }))
    expect(await screen.findByText('Skriv e-postadressen du använde vid köpet.')).toBeInTheDocument()
    expect(screen.getByText('Skriv kvittonumret eller ordernumret från kvittot.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'E-post' }), { target: { value: ' kund@example.se ' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Kvittonummer eller ordernummer/ }), { target: { value: '1234-5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta min licensnyckel' }))
    const shown = await screen.findAllByTestId('licensnyckel')
    expect(shown.some((el) => el.textContent === key)).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/recover-license')
    expect(JSON.parse(String(init?.body))).toEqual({ email: 'kund@example.se', receipt: '1234-5678' })

    fireEvent.click(screen.getByRole('button', { name: 'Aktivera på den här enheten' }))
    await waitFor(() => expect(useLicenseStore.getState().licenseKey).toBe(key))
    expect(requireAccess('mat')).toBe(true)
  })

  it('för många försök (429) och okänt köp förklaras vänligt', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'rate-limit' }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'hittades-inte' }), { status: 404 }))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Tappat nyckeln?' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'E-post' }), { target: { value: 'kund@example.se' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Kvittonummer eller ordernummer/ }), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: 'Hämta min licensnyckel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Du har försökt många gånger på kort tid')
    fireEvent.click(screen.getByRole('button', { name: 'Hämta min licensnyckel' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vi hittar inget köp med den e-postadressen'))
    expect(useLicenseStore.getState().licenseKey).toBeNull()
  })
})

/** Rendera köpsidan ur en ny modulgraf (efter vi.stubEnv), med nya butiker. */
async function renderFreshPage(before?: (store: typeof import('../../lib/storePurchases')) => void) {
  vi.resetModules()
  const [{ default: Page }, license, profile, access, ui, store] = await Promise.all([
    import('./PremiumPage'),
    import('../../stores/licenseStore'),
    import('../../stores/profileStore'),
    import('../../hooks/useAccess'),
    import('../../components/ui'),
    import('../../lib/storePurchases'),
  ])
  await waitFor(() => expect(license.useLicenseStore.persist.hasHydrated() && profile.useProfileStore.persist.hasHydrated()).toBe(true))
  access.resetLicenseChecks()
  license.useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * DAY, licenseKey: null, activatedAt: null })
  profile.useProfileStore.setState({ profile: null, settings: { ...profile.DEFAULT_SETTINGS, onboardingDone: true } })
  before?.(store)
  const router = createMemoryRouter(
    [
      { path: '/premium', element: <Page /> },
      { path: '/villkor', element: <p>Villkor</p> },
    ],
    { initialEntries: ['/premium'] },
  )
  render(
    <>
      <RouterProvider router={router} />
      <ui.DialogHost />
    </>,
  )
  return { toasts: () => ui.useToastStore.getState().toasts.map((t) => t.message), store }
}

describe('säljaruppgifter i köparket', () => {
  it('visar org.nr, adress och telefon när de är satta', async () => {
    vi.stubEnv('VITE_SELLER_NAME', 'Anna Andersson (Lagom)')
    vi.stubEnv('VITE_SELLER_ORGNR', '900101-1234')
    vi.stubEnv('VITE_SELLER_ADDRESS', 'Storgatan 1, 123 45 Småstad')
    vi.stubEnv('VITE_SELLER_PHONE', '070-123 45 67')
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'hej@lagom.example')
    await renderFreshPage()
    fireEvent.click(screen.getByRole('button', { name: 'Välj årslicens' }))
    const sheet = await screen.findByRole('dialog', { name: 'Köp årslicens' })
    expect(within(sheet).getByText('Org.nr').nextSibling).toHaveTextContent('900101-1234')
    expect(within(sheet).getByText('Adress').nextSibling).toHaveTextContent('Storgatan 1, 123 45 Småstad')
    expect(within(sheet).getByText('Telefon').nextSibling).toHaveTextContent('070-123 45 67')
    expect(within(sheet).getAllByText('Säljare')[0].nextSibling).toHaveTextContent('Anna Andersson (Lagom)')
    // Samma uppgifter i villkoren och i sidfoten.
    const villkor = screen.getByRole('region', { name: 'Köpvillkor och integritet' })
    expect(villkor).toHaveTextContent('Anna Andersson (Lagom), org.nr 900101-1234, Storgatan 1, 123 45 Småstad, tel. 070-123 45 67, hej@lagom.example.')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Säljare: Anna Andersson (Lagom), org.nr 900101-1234, Storgatan 1, 123 45 Småstad, tel. 070-123 45 67')
  })
})

describe('PremiumPage i App Store-bygget', () => {
  it('inga kronor, ingen Stripe och inga webbköp – köpet görs i App Store och kan återställas', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    const { toasts } = await renderFreshPage()

    const panel = screen.getByRole('region', { name: 'Lås upp Lagom' })
    expect(panel).toHaveTextContent('Köpet görs i App Store')
    expect(panel).toHaveTextContent('Priset visas av butiken.')
    // IAP-tillägget finns inte ännu: köpknappen är avstängd och säger varför.
    expect(within(panel).getByRole('button', { name: 'Köp i appen kommer i nästa version' })).toBeDisabled()

    const text = document.body.textContent ?? ''
    // " kr" som valuta (inte "krm" i måtten) och "kronor".
    expect(text).not.toMatch(/\skr(?![a-zåäö])/)
    expect(text).not.toMatch(/kronor/i)
    expect(text).not.toContain('Stripe')
    expect(screen.queryByRole('button', { name: /Gå till betalning/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Välj / })).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Livstidslicens' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Testläge/)).not.toBeInTheDocument()
    // Ingen inklistring av licensnycklar och ingen "Tappat nyckeln?" i App Store-bygget.
    expect(screen.queryByRole('textbox', { name: 'Licensnyckel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tappat nyckeln?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()

    // Butiksvarianten av villkoren.
    const villkor = screen.getByRole('region', { name: 'Köpvillkor och integritet' })
    // Bara den egna butiken nämns i iPhone-appen (Apples riktlinje 2.3.10).
    expect(villkor).toHaveTextContent('Köpet görs via App Store, som sköter betalning')
    expect(villkor).toHaveTextContent('samma Apple-konto')
    expect(villkor).not.toHaveTextContent('Google')
    expect(villkor).toHaveTextContent('tryck på Återställ köp på en ny enhet')
    expect(villkor).toHaveTextContent('Livstidslicensen gäller utan tidsgräns')
    expect(within(villkor).getByRole('link', { name: 'Integritetspolicy' })).toHaveAttribute('href', '/integritet')

    fireEvent.click(screen.getByRole('button', { name: 'Återställ köp' }))
    await waitFor(() => expect(toasts()).toContain('Inga köp att återställa'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('med IAP: butikens pris och ett köp i appen som låser upp Lagom', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    const bought: string[] = []
    const { store } = await renderFreshPage((store) =>
      store.setStorePurchasesForTests({
        available: () => true,
        getProducts: async () => [
          { id: 'ar', title: 'Årslicens', displayPrice: '349,00 kr' },
          { id: 'livstid', title: 'Livstidslicens', displayPrice: '699,00 kr' },
        ],
        purchase: async (id) => {
          bought.push(id)
          return 'purchased'
        },
        restore: async () => [],
        currentEntitlements: async () => (bought.includes('livstid') ? [{ product: 'livstid', purchasedAt: Date.now(), source: 'appstore' }] : []),
      }),
    )
    const { currentAccess } = await import('../../hooks/useAccess')
    const buy = await screen.findByRole('button', { name: 'Köp livstidslicens' })
    // Priset kommer från butiken.
    expect(screen.getByText(/699,00 kr/)).toBeInTheDocument()
    expect(currentAccess().canLog).toBe(false)
    fireEvent.click(buy)
    await waitFor(() => expect(currentAccess().status).toMatchObject({ kind: 'licensierad', source: 'store' }))
    expect(bought).toEqual(['livstid'])
    expect(await screen.findByRole('heading', { name: 'Lagom är ditt – för alltid' })).toBeInTheDocument()
    store.setStorePurchasesForTests(null)
  })
})

describe('webben med webbförsäljningen avstängd', () => {
  it('länkar till appbutikerna och behåller aktiveringen av licensnycklar', async () => {
    vi.stubEnv('VITE_WEB_SALES', 'off')
    vi.stubEnv('VITE_APPSTORE_URL', 'https://apps.apple.com/se/app/lagom/id123')
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    await renderFreshPage()
    const panel = screen.getByRole('region', { name: 'Lagom köps i appbutikerna' })
    expect(within(panel).getByRole('link', { name: /Lagom i App Store/ })).toHaveAttribute('href', 'https://apps.apple.com/se/app/lagom/id123')
    // Länken till Google Play saknas och visas därför inte.
    expect(within(panel).queryByRole('link', { name: /Google Play/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Välj / })).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Stripe')
    expect(screen.getByRole('textbox', { name: 'Licensnyckel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tappat nyckeln?' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
