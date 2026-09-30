/**
 * Röktest för välkomstflödet: hela vägen från Välkommen till färdig profil, validering,
 * säkerhetsregler och medvetet läge – med riktiga butiker och utan renderingsloopar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import OnboardingPage, { stepText } from './OnboardingPage'
import { TargetsSummary } from './TargetsSummary'
import { trialNote } from './OnboardingSteps'
import { DialogHost } from '../../components/ui'
import { createBackup } from '../../lib/backup'
import { todayISO } from '../../lib/dates'
import { computeEnergy, computeTargets } from '../../lib/energy'
import { priceSummary } from '../premium/premiumLogic'
import type { Profile } from '../../types'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useLicenseStore } from '../../stores/licenseStore'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

/** `/tidigare` står före välkomstflödet i historiken, som en sida man kom ifrån. */
function renderFlow(path = '/valkommen') {
  const router = createMemoryRouter(
    [
      { path: '/valkommen', element: <OnboardingPage /> },
      { path: '/', element: <p>Startsidan</p> },
      { path: '/om', element: <p>Om-sidan</p> },
      { path: '/tidigare', element: <p>Tidigare sida</p> },
    ],
    { initialEntries: ['/tidigare', path], initialIndex: 1 },
  )
  const result = render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
  return { ...result, router }
}

/** Som webbläsarens (eller Androids) bakåtknapp. */
const browserBack = (router: ReturnType<typeof renderFlow>['router']) =>
  act(async () => {
    await router.navigate(-1)
  })

const next = () => fireEvent.click(screen.getByRole('button', { name: /Fortsätt/ }))

async function fillAboutYou({ year = '1990', weight = '72,5', sex = 'Kvinna' } = {}) {
  await screen.findByRole('heading', { name: 'Lite om dig' })
  fireEvent.click(screen.getByRole('radio', { name: sex }))
  fireEvent.change(screen.getByRole('spinbutton', { name: /Födelseår/ }), { target: { value: year } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /Längd/ }), { target: { value: '168' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /Vikt idag/ }), { target: { value: weight } })
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  sessionStorage.clear()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
  useLicenseStore.getState().resetLicenseState()
})

describe('OnboardingPage', () => {
  it('går igenom hela flödet och sparar profil, vikt och inställningar', async () => {
    renderFlow()
    expect(screen.getByRole('heading', { name: /kaloriräknaren som gör det lätt att äta lagom/ })).toBeInTheDocument()
    expect(screen.getByText('Svenska livsmedel och mått')).toBeInTheDocument()
    // Affärsmodellen: provperiod utan kort, sedan ett tydligt pris utan automatisk förnyelse.
    expect(screen.getByText('Prova gratis i 14 dagar – inget kort behövs')).toBeInTheDocument()
    // Webbpriserna (349 kr/år eller 699 kr för alltid) och vad som gäller efter provperioden.
    expect(priceSummary()).toBe('349\u00a0kr/år eller 699\u00a0kr för alltid')
    expect(
      screen.getByText(
        // Testing Library jämför med vanliga mellanslag (fast mellanslag i priset blir vanligt).
        `Sedan väljer du ${priceSummary()} – ingen reklam och ingen automatisk förnyelse. Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.`.replace(/\s+/g, ' '),
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Gratis, utan reklam|ingen betalvägg|inga prenumerationer/i)).not.toBeInTheDocument()
    expect(screen.getByText('Din data stannar på din enhet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    await screen.findByRole('heading', { name: 'Vad vill du med Lagom?' })
    // Totalantalet visas först när målet och uppgifterna om dig är kända (det kan bli ett steg färre).
    expect(screen.getByRole('progressbar', { name: 'Förlopp' })).toHaveAttribute('aria-valuetext', 'Steg 1')

    // Utan val går det inte vidare
    next()
    expect(await screen.findByRole('alert')).toHaveTextContent('Välj ett alternativ')
    fireEvent.click(screen.getByRole('radio', { name: /Gå ner i vikt/ }))
    next()

    await fillAboutYou()
    next()

    await screen.findByRole('heading', { name: 'Hur ser en vanlig dag ut?' })
    fireEvent.click(screen.getByRole('radio', { name: /Lätt aktiv/ }))
    next()

    await screen.findByRole('heading', { name: 'I vilken takt?' })
    // 72,5 kg → 0,75 kg/vecka är mer än 1 % och går inte att välja
    expect(screen.getByRole('radio', { name: /0,75\skg per vecka/ })).toBeDisabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Målvikt/ }), { target: { value: '68' } })
    expect(await screen.findByText(/om ca/)).toBeInTheDocument()
    next()

    await screen.findByRole('heading', { name: 'Hur äter du?' })
    fireEvent.click(screen.getByRole('radio', { name: /Flexitarian/ }))
    next()

    await screen.findByRole('heading', { name: 'Välkommen till Lagom!' })
    expect(screen.getByText('Basalomsättning')).toBeInTheDocument()
    expect(screen.getByText('Ändra när som helst i Inställningar.')).toBeInTheDocument()
    // Sammanfattningen berättar om provperioden – som inte har startat ännu.
    expect(screen.getByText(/Din provperiod på 14 dagar startar nu – allt är öppet och inget kort behövs/)).toBeInTheDocument()
    expect(screen.getByText(/Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp\./)).toBeInTheDocument()
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()
    // Var datan sparas, ansvarsfriskrivningen och vägar till stöd.
    expect(screen.getByText(/Allt du fyllt i sparas bara i den här webbläsaren\./)).toBeInTheDocument()
    expect(screen.getByText(/ersätter inte råd från vården/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1177 Vårdguiden/ })).toHaveAttribute('href', 'https://www.1177.se')
    expect(screen.getByRole('link', { name: /Frisk & Fri/ })).toHaveAttribute('href', 'https://www.friskfri.se')
    // Påminnelsen står en gång – inte också under målet.
    expect(screen.queryByText(/Målen är uppskattningar/)).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Kolhydrater' })).toBeInTheDocument()

    const before = Date.now()
    fireEvent.click(screen.getByRole('button', { name: /Börja använda Lagom/ }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
    // Provperioden startar när profilen är klar.
    expect(useLicenseStore.getState().trialStartedAt).toBeGreaterThanOrEqual(before)

    const { profile, settings } = useProfileStore.getState()
    expect(profile).toMatchObject({ sex: 'kvinna', birthYear: 1990, heightCm: 168, startWeightKg: 72.5, goal: 'ga_ner', weeklyRateKg: 0.5, targetWeightKg: 68, diet: 'flexitarian', activityLevel: 'latt' })
    expect(settings.onboardingDone).toBe(true)
    expect(settings.mindfulMode).toBe(false)
    expect(useBodyStore.getState().weights).toMatchObject([{ date: todayISO(), kg: 72.5 }])
  })

  it('visar fel i Om dig och hoppar över takt vid graviditet', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Gå ner i vikt/ }))
    next()
    await screen.findByRole('heading', { name: 'Lite om dig' })
    next()
    expect(await screen.findByText('Fyll i ditt födelseår.')).toBeInTheDocument()
    expect(screen.getByText('Fyll i din längd.')).toBeInTheDocument()

    await fillAboutYou()
    fireEvent.click(screen.getByRole('radio', { name: 'Gravid' }))
    expect(screen.getByText(/viktnedgång rekommenderas inte/)).toBeInTheDocument()
    next()
    fireEvent.click(await screen.findByRole('radio', { name: /Stillasittande/ }))
    next()
    // Takt-steget hoppas över
    expect(await screen.findByRole('heading', { name: 'Hur äter du?' })).toBeInTheDocument()
  })

  it('födelseåret får ett felmeddelande som säger vad som är fel', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
    next()
    await fillAboutYou({ year: '2030' })
    next()
    expect(await screen.findByText('Födelseåret kan inte ligga i framtiden.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Födelseår/ }), { target: { value: '1850' } })
    expect(await screen.findByText(/^Ange ett födelseår mellan \d{4} och \d{4}\.$/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Födelseår/ }), { target: { value: '2020' } })
    expect(await screen.findByText(/Lagom är gjord för vuxna, 18 år och äldre/)).toBeInTheDocument()
  })

  it('medvetet läge: inga siffror i fokus och mindfulMode sparas', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Jag vill inte räkna kalorier/ }))
    next()
    await fillAboutYou({ sex: 'Man', weight: '80' })
    next()
    fireEvent.click(await screen.findByRole('radio', { name: /Aktiv/ }))
    next()
    await screen.findByRole('heading', { name: 'Hur äter du?' })
    expect(screen.queryByText('Makrofördelning')).not.toBeInTheDocument()
    next()
    await screen.findByText('Visa siffrorna ändå')
    fireEvent.click(screen.getByRole('button', { name: /Börja använda Lagom/ }))
    await screen.findByText('Startsidan')
    expect(useProfileStore.getState().settings.mindfulMode).toBe(true)
    expect(useProfileStore.getState().profile?.goal).toBe('behalla')
  })

  it('tillbaka-knappen går ett steg bakåt och utkastet överlever en omladdning', async () => {
    const { unmount, router } = renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
    next()
    await screen.findByRole('heading', { name: 'Lite om dig' })
    fireEvent.click(screen.getByRole('button', { name: 'Föregående steg' }))
    expect(await screen.findByRole('radio', { name: /Behålla min vikt/ })).toBeChecked()
    expect(router.state.location.search).toBe('?steg=mal')
    unmount()
    // Omladdning: adressen bär steget, sessionStorage bär utkastet.
    renderFlow('/valkommen?steg=mal')
    expect(await screen.findByRole('radio', { name: /Behålla min vikt/ })).toBeChecked()
  })

  it('exempeldata startar ingen provperiod', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Utforska med exempeldata/ }))
    expect(await screen.findByText('Startsidan', {}, { timeout: 5000 })).toBeInTheDocument()
    expect(useLicenseStore.getState().trialStartedAt).toBeNull()
    // Städa undan exempeldatan till nästa test.
    useDiaryStore.getState().clearDiary()
    useFoodStore.getState().clearFoods()
    useFastingStore.getState().clearFasting()
    localStorage.clear()
  })

  it('webbläsarens bakåt går ett steg tillbaka i stället för att lämna flödet', async () => {
    const { router } = renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Gå ner i vikt/ }))
    next()
    await fillAboutYou()
    next()
    await screen.findByRole('heading', { name: 'Hur ser en vanlig dag ut?' })
    expect(router.state.location.search).toBe('?steg=aktivitet')

    await browserBack(router)
    expect(await screen.findByRole('heading', { name: 'Lite om dig' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /Födelseår/ })).toHaveValue('1990')
    await browserBack(router)
    expect(await screen.findByRole('heading', { name: 'Vad vill du med Lagom?' })).toBeInTheDocument()
    await browserBack(router)
    expect(await screen.findByRole('heading', { name: /kaloriräknaren som gör det lätt att äta lagom/ })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/valkommen')
  })

  it('när flödet är klart ligger stegen inte kvar bakom startsidan', async () => {
    const { router } = renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
    next()
    await fillAboutYou()
    next()
    fireEvent.click(await screen.findByRole('radio', { name: /Lätt aktiv/ }))
    next()
    await screen.findByRole('heading', { name: 'Hur äter du?' })
    next()
    fireEvent.click(await screen.findByRole('button', { name: /Börja använda Lagom/ }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
    await browserBack(router)
    expect(await screen.findByText('Tidigare sida')).toBeInTheDocument()
  })

  it('hoppar inte förbi steg som saknar svar (direktlänk utan utkast)', async () => {
    const { router } = renderFlow('/valkommen?steg=sammanfattning')
    expect(await screen.findByRole('heading', { name: 'Vad vill du med Lagom?' })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?steg=mal'))
  })

  it('felet för kön är kopplat till gruppen och får fokus först', async () => {
    renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
    next()
    await screen.findByRole('heading', { name: 'Lite om dig' })
    next()
    const group = screen.getByRole('radiogroup', { name: 'Kön' })
    await waitFor(() => expect(group).toHaveAttribute('aria-invalid', 'true'))
    expect(group).toHaveAccessibleDescription('Välj det alternativ som stämmer bäst.')
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Kvinna' })).toHaveFocus())
  })

  it('återställer en säkerhetskopia direkt från välkomststeget', async () => {
    useProfileStore.setState({
      profile: { sex: 'man', birthYear: 1980, heightCm: 180, startWeightKg: 80, activityLevel: 'latt', goal: 'behalla', weeklyRateKg: 0.5, lifeStage: 'ingen', diet: 'allatare', macroPreset: 'nnr', createdAt: 5 },
      settings: { ...DEFAULT_SETTINGS, onboardingDone: true, energyUnit: 'kJ' },
    })
    useBodyStore.setState({ weights: [{ id: 'w1', date: '2026-09-01', kg: 81, createdAt: 0 }], measurements: [] })
    const backup = createBackup()
    useBodyStore.getState().clearBody()
    useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })

    const { container } = renderFlow()
    expect(screen.getByRole('button', { name: /Återställ säkerhetskopia/ })).toBeInTheDocument()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(backup)], 'lagom.json')] } })
    })
    const sheet = await screen.findByRole('dialog', { name: 'Återställ säkerhetskopia' })
    expect(within(sheet).getByText('1 vägning')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Återställ min data/ }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
    const { profile, settings } = useProfileStore.getState()
    expect(profile?.createdAt).toBe(5)
    expect(settings.onboardingDone).toBe(true)
    expect(settings.energyUnit).toBe('kJ')
    expect(useBodyStore.getState().weights).toMatchObject([{ date: '2026-09-01', kg: 81 }])
  })

  it('skickar vidare till startsidan om välkomstflödet redan är klart', async () => {
    useProfileStore.setState({
      profile: { sex: 'man', birthYear: 1980, heightCm: 180, startWeightKg: 80, activityLevel: 'latt', goal: 'behalla', weeklyRateKg: 0.5, lifeStage: 'ingen', diet: 'allatare', macroPreset: 'nnr', createdAt: 0 },
      settings: { ...DEFAULT_SETTINGS, onboardingDone: true },
    })
    renderFlow()
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()
  })
})

describe('TargetsSummary', () => {
  it('påminner under målet om att målen är uppskattningar och länkar till 1177', () => {
    const profile: Profile = {
      sex: 'kvinna',
      birthYear: 1990,
      heightCm: 168,
      startWeightKg: 70,
      activityLevel: 'latt',
      goal: 'ga_ner',
      weeklyRateKg: 0.5,
      lifeStage: 'ingen',
      diet: 'allatare',
      macroPreset: 'nnr',
      createdAt: 0,
    }
    render(<TargetsSummary energy={computeEnergy(profile, 70)} targets={computeTargets(profile, 70)} />)
    expect(
      screen.getByText(/Målen är uppskattningar\. Rådgör med vården om du har en sjukdom, är gravid eller ammar, eller funderar på att ändra din vikt\./),
    ).toHaveClass('text-ink-3')
    expect(screen.getByRole('link', { name: /1177\.se/ })).toHaveAttribute('href', 'https://www.1177.se')
    // Kort etikett under 360 px, men rutan heter alltid Kolhydrater för skärmläsare.
    const carbs = screen.getByRole('group', { name: 'Kolhydrater' })
    expect(within(carbs).getByText('Kolhydr.')).toHaveClass('min-[360px]:hidden')
    expect(within(carbs).getByText('Kolhydrater')).toHaveClass('hidden', 'min-[360px]:inline')
    expect(screen.getByText(/^ca /)).toBeInTheDocument()
  })
})

describe('trialNote', () => {
  it('säger vad som gäller efter provperioden och vad som faktiskt har gått ut', () => {
    const after = 'Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.'
    expect(trialNote({ kind: 'ny' })).toContain(after)
    expect(trialNote({ kind: 'prov', daysLeft: 3, endsAt: 0 })).toContain(after)
    expect(trialNote({ kind: 'utgangen', endedAt: 0, licenseExpired: false })).toMatch(/^Provperioden är slut\. Du kan se, exportera och radera din data/)
    expect(trialNote({ kind: 'utgangen', endedAt: 0, licenseExpired: true })).toMatch(/^Årslicensen har gått ut\./)
    expect(trialNote({ kind: 'utgangen', endedAt: 0, licenseExpired: false, revoked: true })).toMatch(/^Licensen gäller inte längre\./)
  })
})

describe('OnboardingPage i App Store-bygget', () => {
  it('visar inga kronor och ingen Stripe – och förklarar flytten från en annan enhet utan att nämna webben', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const { default: FreshPage } = await import('./OnboardingPage')
    const router = createMemoryRouter([{ path: '/valkommen', element: <FreshPage /> }], { initialEntries: ['/valkommen'] })
    const { container } = render(<RouterProvider router={router} />)
    expect(await screen.findByRole('heading', { name: 'Har du använt Lagom på en annan enhet?' })).toBeInTheDocument()
    expect(container).not.toHaveTextContent(/\d\s?kr\b/)
    expect(container).not.toHaveTextContent(/Stripe/)
    expect(screen.getByText(/årslicens eller livstidslicens som köp i appen/)).toBeInTheDocument()
    const steps = screen.getAllByRole('listitem').filter((li) => li.closest('section[aria-labelledby="flytta-fran-webben"]'))
    expect(steps.map((li) => li.textContent)).toEqual([
      'Öppna Lagom på den andra enheten och välj Inställningar → Data och säkerhetskopia → Spara säkerhetskopia.',
      'Spara filen i Filer eller skicka den till dig själv.',
      'Välj Återställ från säkerhetskopia här.',
    ])
    expect(screen.getByRole('button', { name: /Återställ från säkerhetskopia/ })).toBeInTheDocument()
    // Bara ett sätt att återställa – den lilla knappen längst ned visas inte i appen.
    expect(screen.queryByRole('button', { name: /^Återställ säkerhetskopia$/ })).not.toBeInTheDocument()
    expect(container).not.toHaveTextContent(/webben|webbläsar/i)
  })
})

describe('stegräknaren', () => {
  it('visar totalantalet först när det är känt (från aktivitetssteget)', () => {
    const steps = ['valkommen', 'mal', 'om-dig', 'aktivitet', 'takt', 'kost', 'sammanfattning'] as const
    expect(stepText(steps, 1)).toBe('Steg 1')
    expect(stepText(steps, 2)).toBe('Steg 2')
    expect(stepText(steps, 3)).toBe('Steg 3 av 6')
    // Utan taktsteg (t.ex. graviditet): fem steg.
    expect(stepText(['valkommen', 'mal', 'om-dig', 'aktivitet', 'kost', 'sammanfattning'], 4)).toBe('Steg 4 av 5')
  })
})
