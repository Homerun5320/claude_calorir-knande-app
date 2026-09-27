/**
 * Röktester för Idag-skärmen: sidan renderas med riktiga butiker (fake-indexeddb) utan
 * renderingsloopar, välkomstläget visas första dagen och snabbåtgärderna fungerar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Food, Profile } from '../../types'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 68,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.25,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

const GROT: Food = {
  id: 'lagom:havregrynsgrot',
  name: 'Havregrynsgröt',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3, fiber: 1.7 },
  portions: [],
}

const LAX: Food = {
  id: 'lagom:lax',
  name: 'Lax, ugnsbakad',
  source: 'lagom',
  category: 'fisk',
  nutrients: { kcal: 210, protein: 22, fat: 13 },
  portions: [],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TodayPage />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useFastingStore.getState().clearFasting()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  try {
    window.localStorage.clear()
  } catch {
    /* ignoreras */
  }
})

describe('TodayPage', () => {
  it('välkomnar första dagen med en tydlig väg till första måltiden', async () => {
    renderPage()
    expect(await screen.findByText('Din första dag med Lagom')).toBeInTheDocument()
    const cta = screen.getByRole('link', { name: /Lägg till din första måltid/ })
    expect(cta.getAttribute('href')).toMatch(/\/lagg-till\?maltid=\w+&datum=\d{4}-\d{2}-\d{2}/)
    expect(screen.getByRole('link', { name: /Skanna en streckkod/ })).toHaveAttribute('href', '/skanna')
    expect(screen.getByRole('link', { name: /Utforska svenska klassiker/ })).toHaveAttribute('href', '/recept')
    // Hälsningen använder namnet.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/, Anna$/)
    // Veckan och kostråden väntar tills det finns något att visa.
    expect(screen.queryByText('Veckan')).not.toBeInTheDocument()
    expect(screen.queryByText('Kostråden i veckan')).not.toBeInTheDocument()
  })

  it('visar måltider med namn och en "+" per måltid', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    expect(await screen.findByText('Havregrynsgröt')).toBeInTheDocument()
    expect(screen.queryByText('Din första dag med Lagom')).not.toBeInTheDocument()
    const add = screen.getByRole('link', { name: 'Lägg till i frukost' })
    expect(add).toHaveAttribute('href', `/lagg-till?maltid=frukost&datum=${today}`)
    // Kvällsmat är avstängd som standard.
    expect(screen.queryByRole('link', { name: 'Lägg till i kvällsmat' })).not.toBeInTheDocument()
    expect(screen.getByText('Veckan')).toBeInTheDocument()
  })

  it('visar en avstängd måltid som ändå har poster idag – allt i ringen går att hitta', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'mellanmal' })
    const meals = DEFAULT_SETTINGS.meals.map((m) => (m.id === 'mellanmal' ? { ...m, enabled: false } : m))
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, meals } })
    renderPage()
    expect(await screen.findByText('Lax, ugnsbakad')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lägg till i mellanmål' })).toBeInTheDocument()
  })

  it('säger varsamt till när vikten går ner för fort – utan grön ton', async () => {
    const today = todayISO()
    const body = useBodyStore.getState()
    // 0,3 kg om dagen i tre veckor – långt mer än 1 % av kroppsvikten i veckan.
    for (let k = 0; k <= 21; k++) body.logWeight(addDays(today, k - 21), 78 - k * 0.3)
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner' } })
    renderPage()
    expect(await screen.findByText(/snabbare än vi rekommenderar/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Frisk & Fri' })).toHaveAttribute('href', 'https://www.friskfri.se')
  })

  it('kopierar gårdagens måltid och kan ångra', async () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: yesterday, meal: 'lunch' })
    renderPage()
    const chip = await screen.findByRole('button', { name: /Kopiera gårdagens lunch/ })
    fireEvent.click(chip)
    await waitFor(() => expect(useDiaryStore.getState().entries[today]?.length).toBe(1))
    expect(useDiaryStore.getState().entries[today]?.[0].meal).toBe('lunch')
    // Knappen försvann – fokus på lunchkortet (som nu visar maten), inte på <body>.
    await waitFor(() => expect(document.activeElement?.textContent).toMatch(/Lunch.*Lax, ugnsbakad/))

    const t = useToastStore.getState().toasts.at(-1)
    expect(t?.message).toMatch(/Gårdagens lunch är kopierad/)
    act(() => t?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    // Gårdagen är orörd.
    expect(useDiaryStore.getState().entries[yesterday]?.length).toBe(1)
  })

  it('fyller på vatten med ett tryck', async () => {
    renderPage()
    const today = todayISO()
    const card = (await screen.findByRole('heading', { name: 'Vatten' })).closest('section')!
    fireEvent.click(within(card).getAllByRole('button', { name: 'Lägg till ett glas (250 ml)' }).at(-1)!)
    expect(useDiaryStore.getState().water[today]).toBe(250)
  })

  it('döljer siffror och vikt i medvetet läge men visar kvällsreflektionen', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useBodyStore.getState().logWeight(today, 68)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    expect(await screen.findByText('Hur har dagen varit?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Väg dig/ })).not.toBeInTheDocument()
    // Ingen energisiffra i måltidskortet.
    expect(screen.queryByText(/210/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Humör: Bra' }))
    expect(useDiaryStore.getState().days[today]?.mood).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: /Markera dagen som klar/ }))
    expect(useDiaryStore.getState().days[today]?.complete).toBe(true)
    expect(await screen.findByText('Dagen är markerad som klar')).toBeInTheDocument()
    // Knappen byttes mot "Öppna igen" – fokus följer med.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Öppna igen' })))
  })

  it('ger fokus till nästa del av sidan när dagens tips döljs', async () => {
    renderPage()
    const hide = await screen.findByRole('button', { name: 'Dölj dagens tips' })
    hide.focus()
    fireEvent.click(hide)
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))
    expect(document.activeElement).not.toBe(hide)
    expect(document.activeElement?.closest('[inert], [aria-hidden="true"]')).toBeNull()
  })

  it('nådd målvikt: dagsmålet räknas för att behålla vikten – samma besked som under Vikt', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useBodyStore.getState().logWeight(today, 64.8)
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner', targetWeightKg: 65 } })
    renderPage()
    expect(await screen.findByText(/Du har nått din målvikt\. Dagsmålet räknas nu för att behålla vikten/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Byt till att behålla vikten' }))
    expect(useProfileStore.getState().profile?.goal).toBe('behalla')
  })

  it('låg vikt vid 70 år (BMI 21): varsamt besked om att behålla vikten, även i medvetet läge', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    // 168 cm och 59 kg ≈ BMI 20,9 – under 22 som gäller från 70 år.
    useBodyStore.getState().logWeight(today, 59)
    const birthYear = Number(today.slice(0, 4)) - 70
    useProfileStore.setState({ profile: { ...PROFILE, birthYear, goal: 'ga_ner' }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    expect(await screen.findByText(/under det som räknas som hälsosamt för din längd och ålder/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '1177' })).toBeInTheDocument()
    // Inga siffror i medvetet läge.
    expect(screen.queryByRole('button', { name: /Väg dig/ })).not.toBeInTheDocument()
  })

  it('räknar inte träningen två gånger med adaptiv förbrukning', async () => {
    const today = todayISO()
    useDiaryStore.getState().addExercise({ date: today, activityId: 'promenad', name: 'Promenad', minutes: 40, kcal: 160 })
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, adaptiveTargets: true } })
    // Fyra veckor med loggat intag och vägningar ger en adaptiv skattning.
    const { addEntry } = useDiaryStore.getState()
    for (let i = 1; i <= 27; i++) {
      const date = addDays(today, -i)
      addEntry({ kind: 'quick', name: 'Dag', nutrients: { kcal: 2000 }, date, meal: 'middag' })
      if (i % 3 === 0) useBodyStore.getState().logWeight(date, 68)
    }
    renderPage()
    expect(await screen.findByText('Träning idag')).toBeInTheDocument()
    expect(screen.getByText(/ingår redan i dagsmålet/)).toBeInTheDocument()
    expect(screen.queryByText(/till budgeten/)).not.toBeInTheDocument()
  })

  it('visar pågående fasta och träning som sammanhangskort', async () => {
    const today = todayISO()
    useFastingStore.getState().startFast(16, '16:8', Date.now() - 2 * 3_600_000)
    useDiaryStore.getState().addExercise({ date: today, activityId: 'promenad', name: 'Promenad', minutes: 40, kcal: 160 })
    renderPage()
    expect(await screen.findByText('Fasta · 16:8')).toBeInTheDocument()
    expect(screen.getByText('Träning idag')).toBeInTheDocument()
    expect(screen.getByText('Promenad')).toBeInTheDocument()
  })
})
