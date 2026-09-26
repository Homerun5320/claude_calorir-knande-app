/**
 * Röktest för välkomstflödet: hela vägen från Välkommen till färdig profil, validering,
 * säkerhetsregler och medvetet läge – med riktiga butiker och utan renderingsloopar.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import OnboardingPage from './OnboardingPage'
import { todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'

MotionGlobalConfig.skipAnimations = true

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

function renderFlow() {
  return render(
    <MemoryRouter initialEntries={['/valkommen']}>
      <Routes>
        <Route path="/valkommen" element={<OnboardingPage />} />
        <Route path="/" element={<p>Startsidan</p>} />
        <Route path="/om" element={<p>Om-sidan</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

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
    expect(screen.getByText('Din data stannar i din telefon')).toBeInTheDocument()

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
    expect(screen.getByRole('radio', { name: /0,75 kg per vecka/ })).toBeDisabled()
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

  it('tillbaka-knappen går ett steg bakåt och utkastet överlever', async () => {
    const { unmount } = renderFlow()
    fireEvent.click(screen.getByRole('button', { name: /Kom igång/ }))
    fireEvent.click(await screen.findByRole('radio', { name: /Behålla min vikt/ }))
    next()
    await screen.findByRole('heading', { name: 'Lite om dig' })
    fireEvent.click(screen.getByRole('button', { name: 'Föregående steg' }))
    expect(await screen.findByRole('radio', { name: /Behålla min vikt/ })).toBeChecked()
    unmount()
    renderFlow()
    expect(await screen.findByRole('radio', { name: /Behålla min vikt/ })).toBeChecked()
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
