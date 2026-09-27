/**
 * Röktest för välkomstflödet: hela vägen från Välkommen till färdig profil, validering,
 * säkerhetsregler och medvetet läge – med riktiga butiker och utan renderingsloopar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import OnboardingPage from './OnboardingPage'
import { DialogHost } from '../../components/ui'
import { createBackup } from '../../lib/backup'
import { todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'

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

beforeEach(() => {
  sessionStorage.clear()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
})

describe('OnboardingPage', () => {
  it('går igenom hela flödet och sparar profil, vikt och inställningar', async () => {
    renderFlow()
    expect(screen.getByRole('heading', { name: /kaloriräknaren som gör det lätt att äta lagom/ })).toBeInTheDocument()
    expect(screen.getByText('Svenska livsmedel och mått')).toBeInTheDocument()
    expect(screen.getByText('Gratis, utan reklam')).toBeInTheDocument()
    expect(screen.getByText('Din data stannar på din enhet')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    await screen.findByRole('heading', { name: 'Vad vill du med Lagom?' })
    expect(screen.getByRole('progressbar', { name: 'Förlopp' })).toHaveAttribute('aria-valuetext', 'Steg 1 av 6')

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

    fireEvent.click(screen.getByRole('button', { name: /Börja använda Lagom/ }))
    expect(await screen.findByText('Startsidan')).toBeInTheDocument()

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
