/**
 * Röktester för "Vikt & mått": sidan renderas med riktiga butiker (fake-indexeddb) utan
 * renderingsloopar, tomt läge, loggning, medvetet läge, adaptiv förbrukning och borttagning.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BodyPage from './BodyPage'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile, WeightEntry } from '../../types'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  targetWeightKg: 68,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

function renderPage() {
  return render(
    <MemoryRouter>
      <BodyPage />
    </MemoryRouter>,
  )
}

/** Vägningar varannan dag de senaste `days` dagarna med stadig nedgång. */
function seedWeights(days = 40) {
  const today = todayISO()
  const weights: WeightEntry[] = []
  for (let i = days; i >= 0; i -= 2) {
    const date = addDays(today, -i)
    weights.push({ id: `w_${date}`, date, kg: Math.round((74 - (days - i) * 0.06) * 10) / 10, createdAt: 0 })
  }
  useBodyStore.setState({ weights, measurements: [] })
  return weights
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('BodyPage', () => {
  it('visar ett vänligt tomt läge och sparar första vägningen', async () => {
    renderPage()
    expect(await screen.findByText('Ingen vägning ännu')).toBeInTheDocument()
    expect(screen.getByText('Varför trendvikt?')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Viktkurva' })).not.toBeInTheDocument()

    const input = screen.getByRole('spinbutton', { name: 'Vikt i kilo' })
    fireEvent.change(input, { target: { value: '72,4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara vikt' }))

    await waitFor(() => expect(useBodyStore.getState().weights).toHaveLength(1))
    expect(useBodyStore.getState().weights[0]).toMatchObject({ date: todayISO(), kg: 72.4 })
    expect(useToastStore.getState().toasts[0]?.message).toMatch(/72,4 kg sparat/)
    expect(await screen.findByText('Trendvikt', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText('Ingen vägning ännu')).not.toBeInTheDocument()
  })

  it('skriver inte tyst om en felskriven vikt – visar ett fel i stället', async () => {
    renderPage()
    const input = await screen.findByRole('spinbutton', { name: 'Vikt i kilo' })
    fireEvent.change(input, { target: { value: '7,24' } })
    expect(input).toHaveAttribute('aria-valuenow', '7.24')
    expect(screen.getByText('Ange en vikt mellan 20 och 400 kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara vikt' })).toBeDisabled()
    fireEvent.change(input, { target: { value: '4000' } })
    expect(screen.getByText('Ange en vikt mellan 20 och 400 kg')).toBeInTheDocument()
    expect(useBodyStore.getState().weights).toHaveLength(0)
  })

  it('visar ingen exempelvikt i medvetet läge', async () => {
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    const input = await screen.findByRole('spinbutton', { name: 'Vikt i kilo' })
    expect(input).toHaveAttribute('placeholder', '–')
  })

  it('pausar viktnedgången varsamt när vikten är under hälsosamt BMI och kan byta mål', async () => {
    // 168 cm: BMI 18,5 ≈ 52,2 kg.
    const today = todayISO()
    useBodyStore.setState({ weights: [{ id: 'w1', date: today, kg: 50, createdAt: 0 }], measurements: [] })
    useProfileStore.setState({ profile: { ...PROFILE, startWeightKg: 55, targetWeightKg: 48 } })
    renderPage()
    const note = (await screen.findByText(/rekommenderar inte att gå ner mer/)).closest('section') as HTMLElement
    expect(within(note).getByRole('link', { name: 'Frisk & Fri' })).toHaveAttribute('href', 'https://www.friskfri.se')
    // Inget "Mot målet"/prognos när viktnedgången är pausad.
    expect(screen.queryByText('Mot målet')).not.toBeInTheDocument()
    fireEvent.click(within(note).getByRole('button', { name: 'Byt till att behålla vikten' }))
    expect(useProfileStore.getState().profile?.goal).toBe('behalla')
    act(() => useToastStore.getState().toasts.at(-1)?.action?.onClick())
    expect(useProfileStore.getState().profile?.goal).toBe('ga_ner')
  })

  it('erbjuder att byta till att behålla vikten när målvikten är nådd', async () => {
    const today = todayISO()
    useBodyStore.setState({ weights: [{ id: 'w1', date: today, kg: 67.5, createdAt: 0 }], measurements: [] })
    renderPage()
    expect(await screen.findByText(/Du har nått din målvikt 68 kg/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Byt till att behålla vikten' }))
    expect(useProfileStore.getState().profile?.goal).toBe('behalla')
  })

  it('använder inte adaptiv förbrukning under graviditet', async () => {
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'behalla', lifeStage: 'gravid' } })
    renderPage()
    expect(await screen.findByText(/Under graviditeten ändras vikten av naturliga skäl/)).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: /Låt målen följa min verkliga förbrukning/ })
    expect(toggle).toBeDisabled()
    fireEvent.click(toggle)
    expect(useProfileStore.getState().settings.adaptiveTargets).toBe(false)
  })

  it('ångrar en loggad vikt via toasten', async () => {
    renderPage()
    const input = await screen.findByRole('spinbutton', { name: 'Vikt i kilo' })
    fireEvent.change(input, { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara vikt' }))
    await waitFor(() => expect(useBodyStore.getState().weights).toHaveLength(1))
    act(() => useToastStore.getState().toasts[0].action?.onClick())
    expect(useBodyStore.getState().weights).toHaveLength(0)
  })

  it('visar trend, prognos, kurva, nyckeltal och historik', async () => {
    seedWeights()
    renderPage()
    expect(await screen.findByText(/Med nuvarande takt når du 68 kg omkring/)).toBeInTheDocument()
    expect(screen.getByText(/senaste veckan/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Viktkurva' })).toBeInTheDocument()
    expect(screen.getByText('BMI')).toBeInTheDocument()
    expect(screen.getByText('Historik')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ändra mål/ })).toHaveAttribute('href', '/installningar/profil')

    // Byt intervall i diagrammet utan fel.
    fireEvent.click(screen.getByRole('radio', { name: 'Allt' }))
    expect(screen.getByRole('radio', { name: 'Allt' })).toHaveAttribute('aria-checked', 'true')
  })

  it('döljer siffror i medvetet läge tills användaren vill se dem', async () => {
    seedWeights()
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    expect(await screen.findByText(/Medvetet läge är på/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Viktkurva' })).not.toBeInTheDocument()
    expect(screen.queryByText('BMI')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Visa siffror' }))
    expect(await screen.findByRole('heading', { name: 'Viktkurva' })).toBeInTheDocument()
  })

  it('förklarar vad som behövs för adaptiv förbrukning och sparar valet', async () => {
    renderPage()
    expect(await screen.findByText('Logga minst 14 dagar och väg dig 4 gånger')).toBeInTheDocument()
    const toggle = screen.getByRole('switch', { name: /Låt målen följa min verkliga förbrukning/ })
    fireEvent.click(toggle)
    expect(useProfileStore.getState().settings.adaptiveTargets).toBe(true)
  })

  it('visar uppmätt förbrukning när det finns tillräckligt med data', async () => {
    seedWeights(30)
    const today = todayISO()
    const entries: Record<string, ReturnType<typeof useDiaryStore.getState>['entries'][string]> = {}
    for (let i = 1; i <= 26; i++) {
      const date = addDays(today, -i)
      entries[date] = [{ id: `e_${date}`, kind: 'quick', name: 'Dagens mat', nutrients: { kcal: 1900 }, date, meal: 'lunch', createdAt: 0 }]
    }
    useDiaryStore.setState({ entries })
    renderPage()
    expect(await screen.findByText('Din uppskattade förbrukning')).toBeInTheDocument()
    expect(screen.getByText(/26 loggade dagar/)).toBeInTheDocument()
    expect(screen.getByText('Formel (Mifflin–St Jeor × aktivitet)')).toBeInTheDocument()
  })

  it('tar bort en vägning efter bekräftelse och kan ångra', async () => {
    const weights = seedWeights(4)
    const latest = weights[weights.length - 1]
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    const history = (await screen.findByText('Historik')).closest('section') as HTMLElement
    const buttons = within(history).getAllByRole('button', { name: /Ta bort vägningen/ })
    fireEvent.click(buttons[0])
    await waitFor(() => expect(useBodyStore.getState().weights).toHaveLength(weights.length - 1))
    expect(useBodyStore.getState().weights.some((w) => w.id === latest.id)).toBe(false)
    const t = useToastStore.getState().toasts.find((x) => x.message === 'Vägningen är borttagen')
    act(() => t?.action?.onClick())
    expect(useBodyStore.getState().weights.some((w) => w.date === latest.date && w.kg === latest.kg)).toBe(true)
    confirmSpy.mockRestore()
  })

  it('sparar kroppsmått från arket', async () => {
    seedWeights(4)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Mät midjan' }))
    const waist = await screen.findByRole('spinbutton', { name: /Midja/ })
    fireEvent.change(waist, { target: { value: '82,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Spara mått' }))
    await waitFor(() => expect(useBodyStore.getState().measurements).toHaveLength(1))
    expect(useBodyStore.getState().measurements[0]).toMatchObject({ date: todayISO(), waistCm: 82.5 })
    expect(await screen.findByText('Alla mätningar')).toBeInTheDocument()
  })
})
