/**
 * Röktester för Mer, Om Lagom och Matkalendern: renderas utan renderingsloopar, visar levande
 * nyckeltal, respekterar medvetet läge och länkar rätt. Om Lagom: källor och licenser, integritet,
 * metod, felsökning och inga kronpriser eller Stripe i butiksapparna. Dessutom Inställningar →
 * Livsmedelsdatabas (licenser och antal).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import MorePage from './MorePage'
import AboutPage, { ERROR_MAIL_MAX_CHARS, errorReportMailto } from './AboutPage'
import FoodCalendarPage from './FoodCalendarPage'
import { todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { LAST_BACKUP_KEY } from '../settings/backupStatus'
import { AppearanceSection } from '../settings/sections/AppearanceSection'
import { useToastStore } from '../../components/ui'
import { logError } from '../../lib/errorLog'
import { priceSummary } from '../premium/premiumLogic'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 2 * 86_400_000,
}

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

beforeEach(() => {
  localStorage.clear()
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useFastingStore.getState().clearFasting()
  useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 72.4, createdAt: 0 }], measurements: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('MorePage', () => {
  it('visar alla kort med levande nyckeltal', () => {
    useDiaryStore.getState().addWater(todayISO(), 750)
    useFastingStore.getState().startFast(16, '16:8', Date.now() - (2 * 60 + 5) * 60_000)
    inRouter(<MorePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mer' })).toBeInTheDocument()
    expect(screen.getByText('Anna, dag 3 med Lagom')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Mer i Lagom' })
    for (const [name, href] of [
      ['Vikt & mått', '/vikt'],
      ['Recept', '/recept'],
      ['Träning', '/traning'],
      ['Dryck', '/dryck'],
      ['Fasta', '/fasta'],
      ['Matkalender', '/matkalender'],
      ['Insikter', '/insikter'],
      ['Inställningar', '/installningar'],
      ['Om Lagom', '/om'],
    ] as const) {
      expect(within(nav).getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', href)
    }
    expect(within(nav).getByText(/72,4 kg · idag/)).toBeInTheDocument()
    expect(within(nav).getByText(/0,75 l vatten idag/)).toBeInTheDocument()
    expect(within(nav).getByText('Pågår · 2 h 5 min')).toBeInTheDocument()
  })

  it('döljer vikten i medvetet läge', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    inRouter(<MorePage />)
    expect(screen.queryByText(/72,4 kg/)).not.toBeInTheDocument()
    expect(screen.getByText('Senast vägd idag')).toBeInTheDocument()
  })

  it('påminner om säkerhetskopia när det finns data men ingen kopia', () => {
    const { unmount } = inRouter(<MorePage />)
    expect(screen.getByRole('link', { name: /Gör din första säkerhetskopia/ })).toHaveAttribute('href', '/installningar/data')
    unmount()
    localStorage.setItem(LAST_BACKUP_KEY, String(Date.now()))
    inRouter(<MorePage />)
    expect(screen.queryByText(/säkerhetskopia/)).not.toBeInTheDocument()
  })

  it('går jämnt ut i två och tre kolumner: Stöd & hjälp blir ett brett kort', () => {
    inRouter(<MorePage />)
    const nav = screen.getByRole('navigation', { name: 'Mer i Lagom' })
    const cards = within(nav).getAllByRole('listitem')
    expect(cards).toHaveLength(11)
    // Tio kort fyller fem rader à två (mobil) eller tre rader à tre plus ett (sm) – det elfte
    // spänner över hela raden respektive två kolumner i stället för att stå ensamt.
    expect(cards.at(-1)).toHaveTextContent('Stöd & hjälp')
    expect(cards.at(-1)).toHaveClass('col-span-full', 'sm:col-span-2')
    expect(cards.filter((li) => li.className.includes('col-span'))).toHaveLength(1)
  })

  it('länkar till veckoplaneringen', () => {
    inRouter(<MorePage />)
    expect(screen.getByRole('link', { name: /Veckoplanering/ })).toHaveAttribute('href', '/planering')
  })

  it('talar om enhet och webbläsare – inte telefon', () => {
    const { container } = inRouter(<MorePage />)
    expect(container).not.toHaveTextContent(/telefon/i)
    expect(screen.getByText(/din data stannar på din enhet/)).toBeInTheDocument()
    expect(screen.getByText(/Din data finns bara i den här webbläsaren/)).toBeInTheDocument()
  })

  it('öppnar Stöd & hjälp', async () => {
    inRouter(<MorePage />)
    fireEvent.click(screen.getByRole('button', { name: /Stöd & hjälp/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Stöd & hjälp' })
    expect(within(dialog).getByRole('link', { name: /alkoholhjalpen\.se/ })).toHaveAttribute('href', 'https://alkoholhjalpen.se')
    expect(within(dialog).getByRole('link', { name: 'Ring 1177' })).toHaveAttribute('href', 'tel:1177')
  })
})

describe('AboutPage', () => {
  it('beskriver vad Lagom gör annorlunda och listar källor', () => {
    inRouter(<AboutPage />)
    expect(screen.getByRole('heading', { name: 'Det här gör Lagom annorlunda' })).toBeInTheDocument()
    // Lagoms val – inte brister hos andra appar.
    expect(screen.getByRole('heading', { name: 'Allt sparas lokalt och fungerar offline' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Okänt är inte ingenting' })).toBeInTheDocument()
    expect(screen.queryByText(/Krascher, synkfel och förlorad data|Användarinmatade databaser/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Livsmedelsverkets livsmedelsdatabas/ })).toHaveAttribute('href', 'https://soknaringsinnehall.livsmedelsverket.se/')
    expect(screen.getByRole('link', { name: /^Open Food Facts/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /2024 Adult Compendium/ })).toBeInTheDocument()
    expect(screen.getByText('Inte en medicinteknisk produkt')).toBeInTheDocument()
    expect(screen.getByText(/Version \d+\.\d+\.\d+/)).toBeInTheDocument()
    expect(screen.getByText(/Version .+ · bygge .+/)).toBeInTheDocument()
  })

  it('använder svenska ord och säger enhet i stället för telefon', () => {
    const { container } = inRouter(<AboutPage />)
    expect(screen.getByRole('heading', { name: 'Granskade svenska livsmedel' })).toBeInTheDocument()
    // Samma nyansering av källan som i Inställningar → Livsmedelsdatabas.
    expect(screen.getByText(/^De flesta med värden direkt från Livsmedelsverket – övriga är samlingsvärden för vanliga märken/)).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/crowdsourc|kurerad|telefon|\(GDPR\)/i)
  })

  it('anger licenser och fullständiga källhänvisningar', () => {
    inRouter(<AboutPage />)
    // Livsmedelsverket: CC BY 4.0 och att värdena har bearbetats.
    expect(screen.getByRole('link', { name: /Licens: CC BY 4\.0/ })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/deed.sv')
    expect(screen.getByText(/Värdena har bearbetats av Lagom \(kategorier, portioner, avrundning och ifyllda värden\)\./)).toBeInTheDocument()
    // Open Food Facts: data och bilder har olika licenser.
    expect(screen.getByRole('link', { name: /Licens: Data ODbL, bilder CC BY-SA 3\.0/ })).toHaveAttribute('href', 'https://world.openfoodfacts.org/terms-of-use')
    // RISE med fullständigt namn och länk till PDF:en.
    expect(screen.getByRole('link', { name: /Öppna listan – ett utdrag från RISE klimatdatabas för livsmedel v 2\.1 \(2022\)/ })).toHaveAttribute(
      'href',
      'https://www.ri.se/sites/default/files/2022-12/RISE%20%C3%96ppna%20listan%202.1%202022.pdf',
    )
    expect(screen.getByText(/Herrmann SD m\.fl\..*DOI 10\.1016\/j\.jshs\.2023\.10\.010/)).toBeInTheDocument()
    expect(screen.getByText(/Nordiska ministerrådet\..*Nord 2023:003/)).toBeInTheDocument()
    expect(
      screen.getByText(/Lagom är en fristående app och är inte kopplad till eller godkänd av Livsmedelsverket, 1177, Frisk & Fri eller andra källor som nämns\./),
    ).toBeInTheDocument()
  })

  it('länkar till licenserna för öppen källkod och typsnitten', () => {
    inRouter(<AboutPage />)
    expect(screen.getByRole('heading', { name: 'Licenser för öppen källkod' })).toBeInTheDocument()
    for (const [name, href] of [
      ['Alla paket', './licenses.txt'],
      ['Inter (OFL)', './licenses/Inter-OFL.txt'],
      ['Fraunces (OFL)', './licenses/Fraunces-OFL.txt'],
      ['Workbox (MIT)', './licenses/workbox-MIT.txt'],
    ] as const) {
      expect(screen.getByRole('link', { name: new RegExp(name.replace(/[()]/g, '\\$&')) })).toHaveAttribute('href', href)
    }
  })

  it('berättar rättvisande vad som lämnar enheten och länkar till policyn och villkoren', () => {
    inRouter(<AboutPage />)
    const card = screen.getByRole('region', { name: 'Din data är din' })
    expect(card).toHaveTextContent(
      'Din dagbok lämnar inte enheten – allt sparas i den här webbläsaren. För att appen ska fungera kontaktas vårt webbhotell Netlify när appen laddas (din IP-adress loggas en kort tid), Open Food Facts när du söker, skannar eller visar produktbilder, Livsmedelsverket om du hämtar databasen och betaltjänsten vid köp. Ingen reklam och ingen spårning.',
    )
    expect(card).toHaveTextContent(
      'Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.',
    )
    expect(within(card).getByRole('link', { name: 'Läs integritetspolicyn' })).toHaveAttribute('href', '/integritet')
    expect(within(card).getByRole('link', { name: 'Läs villkoren' })).toHaveAttribute('href', '/villkor')
  })

  it('visar webbpriserna på webben', () => {
    inRouter(<AboutPage />)
    expect(screen.getByText(new RegExp(`sedan ${priceSummary().replace(/\s/g, '\\s')}\\.`))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Priser och köpvillkor' })).toHaveAttribute('href', '/premium')
  })

  it('förklarar hur Lagom räknar – före ansvarsfriskrivningen', () => {
    inRouter(<AboutPage />)
    const method = screen.getByRole('region', { name: 'Så räknar Lagom' })
    for (const text of [
      /Mifflin–St Jeor.*PAL 1,4–1,9/,
      /7\s700\skcal motsvarar ungefär 1\skg kroppsvikt/,
      /aldrig under 1\s200\skcal \(kvinnor\) respektive 1\s500\skcal \(män\).*högst 1\s% av vikten per vecka och underskottet högst 1\s000\skcal per dag/,
      /Ingen viktnedgång vid graviditet, amning eller under 18 år/,
      /2024 Adult Compendium of Physical Activities/,
      /BMI-gränser för vuxna enligt WHO\. Från 70\sår räknar Lagom 22–27 som normalt/,
      /NNR 2023/,
      /Uppskattningar – inte medicinska råd\./,
    ]) {
      expect(method).toHaveTextContent(text)
    }
    const disclaimer = screen.getByRole('heading', { name: 'Inte en medicinteknisk produkt' })
    expect(method.compareDocumentPosition(disclaimer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('felsökning: tom logg, kopiera rapporten och mejla supporten', async () => {
    const { unmount } = inRouter(<AboutPage />)
    expect(screen.getByText('Inga fel har loggats på den här enheten.')).toBeInTheDocument()
    unmount()

    logError(new Error('Något gick fel'), 'test')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    inRouter(<AboutPage />)
    const group = screen.getByRole('heading', { name: 'Felsökning' }).closest('section') as HTMLElement
    expect(group).toHaveTextContent(/1 fel har loggats på den här enheten/)
    fireEvent.click(within(group).getByRole('button', { name: /Kopiera felrapport/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toContain('Något gick fel')
    await waitFor(() => expect(useToastStore.getState().toasts.map((t) => t.message)).toContain('Felrapporten är kopierad'))

    const mail = within(group).getByRole('link', { name: /Mejla supporten/ })
    expect(mail.getAttribute('href')).toMatch(/^mailto:[^?]+\?subject=Felrapport%20Lagom&body=/)
    expect(decodeURIComponent(mail.getAttribute('href') ?? '')).toContain('Något gick fel')

    fireEvent.click(within(group).getByRole('button', { name: /Rensa felloggen/ }))
    expect(await within(group).findByText('Inga fel har loggats på den här enheten.')).toBeInTheDocument()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('kortar felrapporten i mejlet till högst 1 500 tecken', () => {
    const href = errorReportMailto('x'.repeat(5000), 'hej@example.se')
    const body = decodeURIComponent(href.split('&body=')[1])
    expect(href.startsWith('mailto:hej@example.se?subject=Felrapport%20Lagom&body=')).toBe(true)
    expect(body.length).toBeLessThanOrEqual(ERROR_MAIL_MAX_CHARS)
    expect(ERROR_MAIL_MAX_CHARS).toBe(1500)
  })

  it('erbjuder att komma igång före välkomstflödet', () => {
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
    inRouter(<AboutPage />)
    expect(screen.getByRole('link', { name: 'Kom igång' })).toHaveAttribute('href', '/valkommen')
  })

  it('i App Store-bygget: inga kronor, ingen Stripe och inga licensnycklar', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const { default: FreshAbout } = await import('./AboutPage')
    const { container } = inRouter(<FreshAbout />)
    expect(container).not.toHaveTextContent(/\d\s?kr\b/)
    expect(container).not.toHaveTextContent(/Stripe/)
    expect(container).not.toHaveTextContent(/Licensnyckeln/)
    expect(container).toHaveTextContent('Prova gratis i 14 dagar – sedan årslicens eller livstidslicens som köp i appen.')
    expect(container).toHaveTextContent('allt sparas i appen på den här enheten')
    expect(screen.getByRole('link', { name: 'Lagom Premium' })).toHaveAttribute('href', '/premium')
  })
})

describe('Inställningar → Utseende och visning', () => {
  it('medvetet läge säger var siffrorna göms och var de finns kvar', () => {
    inRouter(<AppearanceSection />)
    expect(screen.getByRole('switch', { name: 'Dölj siffrorna' })).toBeInTheDocument()
    expect(screen.getByText(/Kalorier och vikt göms i översikten, dagboken och insikterna\./)).toBeInTheDocument()
    expect(screen.getByText(/Siffrorna finns kvar under Inställningar – i Mål och makron och i Profil – om du behöver dem\./)).toBeInTheDocument()
  })
})

describe('Inställningar → Livsmedelsdatabas', () => {
  it('visar licenserna, antalet granskade livsmedel och hämtdatum med gemen veckodag', async () => {
    // Egen modulgraf: katalogen i lib/foodRepo läses in en gång per modulgraf.
    vi.resetModules()
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          meta: { source: 'Livsmedelsverkets livsmedelsdatabas', version: '2026-09-27', license: 'CC BY 4.0' },
          foods: [{ id: 'lmv:99999', name: 'Testgröt', source: 'livsmedelsverket', category: 'ovrigt', nutrients: { kcal: 60 }, portions: [] }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const [{ DatabaseSection }, { BUILTIN_FOODS }] = await Promise.all([import('../settings/sections/DatabaseSection'), import('../../data/foods')])
    inRouter(<DatabaseSection />)
    const curated = BUILTIN_FOODS.filter((f) => f.source === 'lagom')
    const fromLmv = curated.filter((f) => f.lmvNumber !== undefined)
    const count = await screen.findByText(/granskade svenska livsmedel/, {}, { timeout: 5000 })
    const item = count.closest('li') as HTMLElement
    expect(item).toHaveTextContent(
      new RegExp(
        `${curated.length.toLocaleString('sv-SE').replace(/\s/g, '\\s')} granskade svenska livsmedel med svenska portioner och mått – ${fromLmv.length.toLocaleString('sv-SE').replace(/\s/g, '\\s')} med värden direkt från Livsmedelsverket, övriga samlingsvärden för vanliga märken, värden från förpackningar eller beräknade recept\\. Källan visas på varje livsmedel\\.`,
      ),
    )
    expect(fromLmv.length).toBeGreaterThan(0)
    expect(fromLmv.length).toBeLessThan(curated.length)
    expect(await screen.findByText(/hämtad söndag 27 september/)).toBeInTheDocument()
    // Licensen för Livsmedelsverkets databas visas och länkar till licenstexten.
    const licenses = screen.getAllByRole('link', { name: /^CC BY 4\.0/ })
    expect(licenses.length).toBeGreaterThan(0)
    for (const l of licenses) expect(l).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/deed.sv')
    expect(screen.getByText(/Livsmedelsverkets livsmedelsdatabas \(CC BY 4\.0\)\. Värdena har bearbetats av Lagom/)).toBeInTheDocument()
    expect(screen.getByText(/data ODbL, bilder CC BY-SA/)).toBeInTheDocument()
  })
})

describe('FoodCalendarPage', () => {
  it('visar kommande matdagar, säsong och dagsljus', async () => {
    inRouter(<FoodCalendarPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Svensk matkalender' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kommande matdagar' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Säsong i / })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dagsljus i Stockholm' })).toBeInTheDocument()
    expect(screen.getByText('Solen är uppe')).toBeInTheDocument()
    // Säsongens råvaror länkar till sök
    const produceLinks = screen.getAllByRole('link', { name: /^Sök efter / })
    expect(produceLinks.length).toBeGreaterThan(0)
    expect(produceLinks[0].getAttribute('href')).toMatch(/^\/lagg-till\?q=/)

    // Öppna första kommande matdagen
    const upcoming = within(screen.getByRole('heading', { name: 'Kommande matdagar' }).closest('section') as HTMLElement).getAllByRole('button')
    fireEvent.click(upcoming[0])
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getAllByRole('link').some((a) => a.getAttribute('href')?.startsWith('/lagg-till?q='))).toBe(true)
  })

  it('visar veckans traditioner', () => {
    inRouter(<FoodCalendarPage />)
    // Beroende på veckodag kan traditionen även visas som nästa matdag överst – därför getAll.
    expect(screen.getAllByRole('button', { name: /Ärtsoppa och pannkakor/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /Fredagsmys/ }).length).toBeGreaterThan(0)
  })
})
