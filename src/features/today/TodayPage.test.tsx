/**
 * Röktester för Idag-skärmen: sidan renderas med riktiga butiker (fake-indexeddb) utan
 * renderingsloopar, välkomstläget visas första dagen och snabbåtgärderna fungerar.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TodayPage from './TodayPage'
import { EveningCheckIn } from './EveningCheckIn'
import { supplementFood, supplementTemplate } from '../../data/supplements'
import { useToastStore } from '../../components/ui'
import { addDays, startOfWeek, todayISO, weekdayIndex } from '../../lib/dates'
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

  it('samlar veckan, vikt, kostråd och tips under en hopfälld rad så att Idag förblir kort', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    const summary = (await screen.findByText('Mer om din dag')).closest('summary')!
    const details = summary.closest('details')!
    // Stängd från början – och veckan ligger inuti, inte bredvid.
    expect(details).not.toHaveAttribute('open')
    expect(within(details).getByText('Veckan')).toBeInTheDocument()
    // Det dagliga ligger utanför raden.
    expect(within(details).queryByText('Havregrynsgröt')).not.toBeInTheDocument()
    expect(screen.getByText('Havregrynsgröt')).toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: /^Frisk & Fri/ })).toHaveAttribute('href', 'https://www.friskfri.se')
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
    expect(screen.getByRole('link', { name: /^1177/ })).toBeInTheDocument()
    // Inga siffror i medvetet läge.
    expect(screen.queryByRole('button', { name: /Väg dig/ })).not.toBeInTheDocument()
  })

  describe('omtanke i medvetet läge (målet "behålla vikten" – valet "Jag vill inte räkna kalorier")', () => {
    const MINDFUL = { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true }

    it('låg vikt (BMI under 18,5): varsam notis med 1177 och Frisk & Fri, utan siffror eller knappar', async () => {
      const today = todayISO()
      useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
      // 168 cm och 50 kg ≈ BMI 17,7. Målet är "behålla", så energimålets viktpaus gäller inte.
      useBodyStore.getState().logWeight(today, 50)
      useProfileStore.setState({ profile: { ...PROFILE, goal: 'behalla' }, settings: MINDFUL })
      renderPage()
      const text = await screen.findByText(/under det som räknas som hälsosamt för din längd/)
      const card = text.closest('section') as HTMLElement
      expect(within(card).getByRole('heading', { name: 'Omtanke' })).toBeInTheDocument()
      expect(within(card).getByRole('link', { name: /^1177/ })).toHaveAttribute('href', 'https://www.1177.se')
      expect(within(card).getByRole('link', { name: /^Frisk & Fri/ })).toHaveAttribute('href', 'https://www.friskfri.se')
      // Inga siffror (utom länktexten "1177") och inga vikt- eller målknappar.
      expect(card.textContent?.replace('1177', '')).not.toMatch(/\d/)
      expect(screen.queryByRole('button', { name: /Väg dig/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Byt till att behålla vikten' })).not.toBeInTheDocument()
    })

    it('vikten går ner för fort: varsam notis utan siffror (inte ens "1 %")', async () => {
      const today = todayISO()
      const body = useBodyStore.getState()
      for (let k = 0; k <= 21; k++) body.logWeight(addDays(today, k - 21), 78 - k * 0.3)
      useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
      useProfileStore.setState({ profile: { ...PROFILE, goal: 'behalla' }, settings: MINDFUL })
      renderPage()
      const text = await screen.findByText(/snabbare än vi rekommenderar/)
      const card = text.closest('section') as HTMLElement
      expect(card.textContent).not.toMatch(/%/)
      expect(card.textContent?.replace('1177', '')).not.toMatch(/\d/)
      expect(within(card).getByRole('link', { name: /^Frisk & Fri/ })).toHaveAttribute('href', 'https://www.friskfri.se')
    })

    it('normal vikt i lugn takt: inget kort alls', async () => {
      const today = todayISO()
      useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
      useBodyStore.getState().logWeight(today, 68)
      useProfileStore.setState({ profile: { ...PROFILE, goal: 'behalla' }, settings: MINDFUL })
      renderPage()
      expect(await screen.findByText('Hur har dagen varit?')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Omtanke' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^Frisk & Fri/ })).not.toBeInTheDocument()
    })

    it('målet att gå ner med pausat mål för låg vikt: pausbeskedet och en knapp för att byta mål, som förut', async () => {
      const today = todayISO()
      useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
      useBodyStore.getState().logWeight(today, 50)
      useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner' }, settings: MINDFUL })
      renderPage()
      expect(await screen.findByText(/rekommenderar inte att gå ner mer/)).toBeInTheDocument()
      // Samma sak som "låg vikt" – pausbeskedet räcker, ingen dubbel notis (en enda länk till stöd).
      expect(screen.getAllByRole('link', { name: /^Frisk & Fri/ })).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Byt till att behålla vikten' }))
      expect(useProfileStore.getState().profile?.goal).toBe('behalla')
    })
  })

  it('låg vikt med målet att behålla vikten visas även utan medvetet läge (kortet Vikt)', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useBodyStore.getState().logWeight(today, 50)
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'behalla' } })
    renderPage()
    expect(await screen.findByText(/under det som räknas som hälsosamt för din längd/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Frisk & Fri/ })).toBeInTheDocument()
  })

  it('okända makron i dagsringen är "–", inte 0 g – och en tom dag visar 0', async () => {
    const today = todayISO()
    // Snabbregistrerad energi: protein, kolhydrater och fett är okända.
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Lunch ute', nutrients: { kcal: 300 }, date: today, meal: 'lunch' })
    renderPage()
    const ring = await screen.findByRole('region', { name: 'Dagsringen' })
    const [protein, carbs, fat] = within(ring).getAllByRole('listitem')
    for (const li of [protein, carbs, fat]) {
      expect(within(li).getByText('–')).toBeInTheDocument()
      expect(li.textContent).not.toMatch(/kvar|(^|\D)0\s*\/\s*\d+\s*g/)
    }
    expect(within(ring).getByRole('img', { name: /^Protein: okänt/ })).toBeInTheDocument()
  })

  it('en tom dag visar 0 av målet i makrostaplarna', async () => {
    renderPage()
    const ring = await screen.findByRole('region', { name: 'Dagsringen' })
    expect(within(ring).getAllByRole('progressbar').length).toBeGreaterThanOrEqual(3)
    expect(within(ring).getAllByText(/g kvar$/).length).toBeGreaterThanOrEqual(3)
  })

  it('medvetet läge: makrostaplarna har inga siffror för skärmläsare', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    const ring = await screen.findByRole('region', { name: 'Dagsringen' })
    expect(ring.querySelector('[aria-valuenow], [aria-valuemax], [aria-valuetext]')).toBeNull()
    for (const bar of within(ring).getAllByRole('img')) expect(bar.getAttribute('aria-label')).not.toMatch(/\d|%/)
    expect(within(ring).getByRole('img', { name: /^Protein: / })).toBeInTheDocument()
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

describe('Veckans fokus och kosttillskott', () => {
  beforeEach(() => {
    useFoodStore.setState({ customFoods: {} })
  })

  it('visar veckans fokus med en uppmuntrande rad – och inget kort utan fokus', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'lunch' })
    const { unmount } = renderPage()
    await screen.findByText('Lax, ugnsbakad')
    expect(screen.queryByRole('heading', { name: 'Veckans fokus' })).not.toBeInTheDocument()
    unmount()

    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, weeklyFocus: { id: 'fisk', since: startOfWeek(today) } } })
    renderPage()
    const card = (await screen.findByRole('heading', { name: 'Veckans fokus' })).closest('section')!
    expect(within(card).getByText('Fisk två gånger')).toBeInTheDocument()
    expect(within(card).getByText(/^1 av 2 fiskmåltider – en bit på väg/)).toBeInTheDocument()
    expect(within(card).getByRole('progressbar')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Ändra veckans fokus' })).toHaveAttribute('href', '/installningar/mal')
  })

  it('bockar av ett kosttillskott, visar "Taget idag" och kan bocka av igen', async () => {
    const today = todayISO()
    const template = supplementTemplate('d-vitamin')!
    const food = supplementFood(template, 10, { id: 'custom:dvit' })
    useFoodStore.setState({ customFoods: { [food.id]: food } })
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    const box = await screen.findByRole('checkbox', { name: /D-vitamin 10 µg/ })
    expect(box).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box)
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /D-vitamin 10 µg/ })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByText('Taget idag')).toBeInTheDocument()
    const logged = (useDiaryStore.getState().entries[today] ?? []).filter((e) => e.kind === 'food' && e.food.id === 'custom:dvit')
    expect(logged).toHaveLength(1)
    expect(logged[0].kind === 'food' && logged[0].unit).toBe('portion:tablett')
    // Ingen varning under den övre gränsen.
    expect(screen.queryByText(/Stäm av doseringen/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /D-vitamin 10 µg/ }))
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /D-vitamin 10 µg/ })).toHaveAttribute('aria-checked', 'false'))
    expect((useDiaryStore.getState().entries[today] ?? []).some((e) => e.kind === 'food' && e.food.id === 'custom:dvit')).toBe(false)
  })

  it('säger lugnt till när tillskotten passerar den övre gränsen – utan röd färg', async () => {
    const food = supplementFood(supplementTemplate('d-vitamin')!, 125, { id: 'custom:dvit125' })
    useFoodStore.setState({ customFoods: { [food.id]: food } })
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: /D-vitamin 125 µg/ }))
    const note = await screen.findByText(/Stäm av doseringen med apoteket eller vården\./)
    expect(note).toHaveTextContent('Dagens tillskott ger mer vitamin D än den övre gränsen i NNR.')
    expect(note.className).not.toMatch(/lingon|bad|red/)
  })

  it('visar inget tillskottskort utan egna tillskott', async () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: todayISO(), meal: 'frukost' })
    renderPage()
    await screen.findByText('Havregrynsgröt')
    expect(screen.queryByRole('heading', { name: 'Kosttillskott' })).not.toBeInTheDocument()
  })

  it('summerar veckans fokus i kvällsreflektionen på söndagen', async () => {
    // Söndagen i förra veckan – kvällsreflektionen visas alltid i medvetet läge.
    const today = todayISO()
    const sunday = addDays(startOfWeek(today), -1)
    expect(weekdayIndex(sunday)).toBe(6)
    const monday = addDays(sunday, -6)
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: monday, meal: 'middag' })
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: sunday, meal: 'lunch' })
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, weeklyFocus: { id: 'fisk', since: monday } } })
    // Reflektionen syns efter kl. 18 – eller när dagen redan har reflekterats.
    useDiaryStore.getState().setDayMeta(sunday, { mood: 4 })
    render(<EveningCheckIn today={sunday} mindful={false} />)
    expect(await screen.findByText(/Fisk två gånger: 2 av 2 fiskmåltider – snyggt jobbat den här veckan!/)).toBeInTheDocument()

    // Ingen summering andra dagar.
    const { container } = render(<EveningCheckIn today={monday} mindful />)
    expect(within(container).queryByRole('note', { name: 'Veckans fokus' })).not.toBeInTheDocument()
  })
})

describe('Vikt i korthet – skärmläsartext', () => {
  it('säger "Trenden är stabil" när vikten står still', async () => {
    const today = todayISO()
    for (let k = 0; k <= 10; k++) useBodyStore.getState().logWeight(addDays(today, -k), 68)
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    expect(await screen.findByText('Trenden är stabil')).toBeInTheDocument()
    expect(screen.queryByText(/Trenden går oförändrad/)).not.toBeInTheDocument()
  })

  it('säger "Trenden går uppåt:" före förändringen', async () => {
    const today = todayISO()
    for (let k = 0; k <= 14; k++) useBodyStore.getState().logWeight(addDays(today, k - 14), 66 + k * 0.1)
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date: today, meal: 'frukost' })
    renderPage()
    expect(await screen.findByText('Trenden går uppåt:')).toBeInTheDocument()
  })
})
