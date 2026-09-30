/**
 * Röktester för Dagboken med riktiga butiker (fake-indexeddb): rendering utan renderingsloopar,
 * adressen styr dagen, poster kan ändras och tas bort med Ångra, tom dag kan kopiera gårdagen
 * och medvetet läge döljer energisiffror.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import DiaryPage from './DiaryPage'
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
  portions: [{ id: 'portion', label: '1 portion', grams: 300 }],
}

const LAX: Food = {
  id: 'lagom:lax',
  name: 'Lax, ugnsbakad',
  source: 'lagom',
  category: 'fisk',
  nutrients: { kcal: 210, protein: 22, fat: 13 },
  portions: [],
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/dagbok', element: <DiaryPage /> },
      { path: '/dagbok/:date', element: <DiaryPage /> },
      { path: '/lagg-till', element: <div>Lägg till-sidan</div> },
      { path: '/traning', element: <div>Träningssidan</div> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const lastToast = () => useToastStore.getState().toasts.at(-1)

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  // Utan DialogHost faller confirmDialog tillbaka på window.confirm.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DiaryPage', () => {
  it('visar en tom dag med väg till första måltiden och kan kopiera gårdagen', async () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: yesterday, meal: 'middag' })
    renderAt('/dagbok')

    expect(await screen.findByRole('heading', { name: 'Inget loggat ännu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Lägg till mat' }).getAttribute('href')).toMatch(new RegExp(`/lagg-till\\?maltid=\\w+&datum=${today}`))
    // Varje aktiverad måltid har en "+" till rätt dag.
    expect(screen.getByRole('link', { name: 'Lägg till i frukost' })).toHaveAttribute('href', `/lagg-till?maltid=frukost&datum=${today}`)
    expect(screen.queryByRole('link', { name: 'Lägg till i kvällsmat' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kopiera gårdagen' }))
    await waitFor(() => expect(useDiaryStore.getState().entries[today]?.length).toBe(1))
    expect(await screen.findByText('Lax, ugnsbakad')).toBeInTheDocument()
    // Kortet med knappen försvann – fokus hamnar på den kopierade posten, inte på <body>.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Ändra Lax, ugnsbakad/ })))

    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    expect(useDiaryStore.getState().entries[yesterday]?.length).toBe(1)
  })

  it('visar klockslaget först i postens undertext', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 1, unit: 'portion:portion', grams: 300, date: today, meal: 'frukost', time: '07:10' })
    renderAt('/dagbok')

    const row = await screen.findByRole('button', { name: /Ändra Havregrynsgröt/ })
    expect(row).toHaveAccessibleName(/^Ändra Havregrynsgröt, 07:10 · 1 portion/)
    expect(within(row).getByText(/^07:10 · 1 portion/)).toBeInTheDocument()
  })

  it('visar måltider med energi och låter en post ändras och tas bort med ångra', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: GROT, amount: 1, unit: 'portion:portion', grams: 300, date: today, meal: 'frukost' })
    renderAt('/dagbok')

    const frukost = (await screen.findByRole('heading', { name: /^Frukost/ })).closest('section')!
    expect(within(frukost).getAllByText('210').length).toBeGreaterThan(0)

    fireEvent.click(within(frukost).getByRole('button', { name: /Ändra Havregrynsgröt/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Havregrynsgröt' })

    // Byt måltid och spara.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lunch' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Spara' }))
    await waitFor(() => expect(useDiaryStore.getState().entries[today]?.[0].meal).toBe('lunch'))

    // Öppna igen och ta bort.
    const lunch = (await screen.findByRole('heading', { name: /^Lunch/ })).closest('section')!
    fireEvent.click(within(lunch).getByRole('button', { name: /Ändra Havregrynsgröt/ }))
    const again = await screen.findByRole('dialog', { name: 'Havregrynsgröt' })
    fireEvent.click(within(again).getByRole('button', { name: 'Ta bort' }))
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    expect(lastToast()?.message).toBe('Havregrynsgröt är borttagen')

    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]?.length).toBe(1)
  })

  it('tömmer en måltid via menyn och kan ångra', async () => {
    const today = todayISO()
    const store = useDiaryStore.getState()
    store.addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'middag' })
    store.addEntry({ kind: 'quick', name: 'Sallad', nutrients: { kcal: 80 }, date: today, meal: 'middag' })
    renderAt('/dagbok')

    fireEvent.click(await screen.findByRole('button', { name: 'Fler val för middag' }))
    const menu = await screen.findByRole('dialog', { name: 'Middag' })
    fireEvent.click(within(menu).getByRole('button', { name: /Töm måltid/ }))
    await waitFor(() => expect(useDiaryStore.getState().entries[today]).toBeUndefined())
    expect(lastToast()?.message).toBe('Middag är tömd')
    // "Fler val" försvann med posterna – fokus hamnar på måltidens "Lägg till i …", inte på <body>.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Lägg till i middag' })))
    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]?.map((e) => e.meal)).toEqual(['middag', 'middag'])
  })

  it('ger fokus till grannposten när en post tas bort och till "Lägg till i …" när måltiden töms', async () => {
    const today = todayISO()
    const store = useDiaryStore.getState()
    store.addEntry({ kind: 'food', food: GROT, amount: 1, unit: 'portion:portion', grams: 300, date: today, meal: 'frukost' })
    store.addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'frukost' })
    renderAt('/dagbok')

    const row = await screen.findByRole('button', { name: /Ändra Havregrynsgröt/ })
    row.focus()
    fireEvent.click(row)
    const sheet = await screen.findByRole('dialog', { name: 'Havregrynsgröt' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /Ändra Lax, ugnsbakad/ })))

    // Sista posten i måltiden: fokus till måltidens "+".
    fireEvent.click(screen.getByRole('button', { name: /Ändra Lax, ugnsbakad/ }))
    const again = await screen.findByRole('dialog', { name: 'Lax, ugnsbakad' })
    fireEvent.click(within(again).getByRole('button', { name: 'Ta bort' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Lägg till i frukost' })))
  })

  it('behåller märkesnamn i "Flytta …" men skriver vanliga livsmedel som i löptext', async () => {
    const today = todayISO()
    const bar: Food = { ...GROT, id: 'off:1', name: 'Proteinbar Testmärke', brand: 'Testmärke', source: 'openfoodfacts' }
    useDiaryStore.getState().addEntry({ kind: 'food', food: bar, amount: 60, unit: 'g', grams: 60, date: today, meal: 'fika' })
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'middag' })
    renderAt('/dagbok')

    fireEvent.click(await screen.findByRole('button', { name: /Ändra Proteinbar/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Proteinbar Testmärke' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Flytta till annan dag' }))
    expect(await screen.findByRole('dialog', { name: 'Flytta Proteinbar Testmärke' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stäng' }))

    fireEvent.click(await screen.findByRole('button', { name: /Ändra Lax/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Lax, ugnsbakad' })).getByRole('button', { name: 'Flytta till annan dag' }))
    expect(await screen.findByRole('dialog', { name: 'Flytta lax' })).toBeInTheDocument()
  })

  it('byter dag med pilarna och håller adressen i synk', async () => {
    const today = todayISO()
    const yesterday = addDays(today, -1)
    const router = renderAt('/dagbok')
    fireEvent.click(await screen.findByRole('button', { name: /^Föregående dag/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`/dagbok/${yesterday}`))
    expect(await screen.findByRole('heading', { name: 'Den här dagen är tom' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Nästa dag/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dagbok'))
  })

  it('skickar ogiltiga datum till idag', async () => {
    const router = renderAt('/dagbok/2026-02-30')
    await waitFor(() => expect(router.state.location.pathname).toBe('/dagbok'))
  })

  it('märker framtida dagar som planerade', async () => {
    const tomorrow = addDays(todayISO(), 1)
    renderAt(`/dagbok/${tomorrow}`)
    expect(await screen.findByRole('heading', { name: 'Planera dagen' })).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Dagens summering' })
    expect(within(summary).getAllByText('Planerat').length).toBeGreaterThanOrEqual(2)
    // Träning loggas när dagen är här – ingen "Logga" som i tysthet skulle lägga passet på idag.
    expect(screen.queryByRole('link', { name: 'Logga' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Träning' })).not.toBeInTheDocument()
  })

  it('visar "Logga" för träning på dagar som varit', async () => {
    const yesterday = addDays(todayISO(), -1)
    renderAt(`/dagbok/${yesterday}`)
    expect(await screen.findByRole('link', { name: 'Logga' })).toHaveAttribute('href', `/traning?datum=${yesterday}`)
  })

  it('har rubriker i rätt nivåer: Måltider (h2) och måltiderna under (h3)', async () => {
    renderAt('/dagbok')
    expect(await screen.findByRole('heading', { level: 2, name: 'Måltider' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Frukost' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Måltider' })).toBeInTheDocument()
  })

  it('flyttar fokus till nästa pass, och sedan till "Logga", när träning tas bort', async () => {
    const yesterday = addDays(todayISO(), -1)
    const store = useDiaryStore.getState()
    store.addExercise({ date: yesterday, activityId: 'promenad', name: 'Promenad', minutes: 30, kcal: 120 })
    store.addExercise({ date: yesterday, activityId: 'cykling', name: 'Cykling', minutes: 20, kcal: 150 })
    renderAt(`/dagbok/${yesterday}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Ta bort Promenad' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ta bort Cykling' })))
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Cykling' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Logga' })))
    expect(useDiaryStore.getState().exercise[yesterday] ?? []).toHaveLength(0)
  })

  it('behåller fokus när "Markera dagen som klar" byts mot "Öppna igen" och tillbaka', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'lunch' })
    renderAt('/dagbok')
    const mark = await screen.findByRole('button', { name: 'Markera dagen som klar' })
    mark.focus()
    fireEvent.click(mark)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Öppna igen' })))
    fireEvent.click(screen.getByRole('button', { name: 'Öppna igen' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Markera dagen som klar' })))
  })

  it('markerar dagen som klar via dagens meny', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'lunch' })
    renderAt('/dagbok')
    fireEvent.click(await screen.findByRole('button', { name: 'Fler val för dagen' }))
    const menu = await screen.findByRole('dialog', { name: 'Idag' })
    fireEvent.click(within(menu).getByRole('button', { name: /Markera dagen som klar/ }))
    expect(useDiaryStore.getState().days[today]?.complete).toBe(true)
    expect((await screen.findAllByText('Dagen markerad som klar')).length).toBeGreaterThan(0)
  })

  it('döljer energisiffror i medvetet läge men visar portioner', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntry({ kind: 'food', food: LAX, amount: 150, unit: 'g', grams: 150, date: today, meal: 'lunch' })
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderAt('/dagbok')
    expect(await screen.findByText('Lax, ugnsbakad')).toBeInTheDocument()
    expect(screen.getAllByText('150 g').length).toBeGreaterThan(0)
    expect(screen.queryByText(/315/)).not.toBeInTheDocument()
    expect(screen.queryByText('kcal')).not.toBeInTheDocument()
  })

  it('sparar anteckningen automatiskt och mående med ett tryck', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const today = todayISO()
      renderAt('/dagbok')
      const note = await screen.findByLabelText('Anteckning')
      fireEvent.change(note, { target: { value: 'Pigg efter promenaden' } })
      await act(async () => {
        vi.advanceTimersByTime(800)
      })
      expect(useDiaryStore.getState().days[today]?.note).toBe('Pigg efter promenaden')

      fireEvent.click(screen.getByRole('button', { name: 'Humör: Bra' }))
      expect(useDiaryStore.getState().days[today]?.mood).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })
  it('träningen följer samma regel som Idag: ett eget mål som höjts till golvet räknar inte träningen två gånger', async () => {
    const today = todayISO()
    // Fyra veckor med 2 000 kcal per dag och stabil vikt ⇒ adaptiv förbrukning ≈ 2 000 kcal.
    for (let i = 1; i <= 27; i++) {
      const date = addDays(today, -i)
      useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Dag', nutrients: { kcal: 2000 }, date, meal: 'middag' })
      if (i % 3 === 0) useBodyStore.getState().logWeight(date, 70)
    }
    useDiaryStore.getState().addExercise({ date: today, activityId: 'custom', name: 'Promenad', minutes: 60, kcal: 300 })
    // Ett för lågt eget mål (t.ex. från en säkerhetskopia) höjs till golvet, som bygger på den adaptiva förbrukningen.
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, adaptiveTargets: true, targetOverrides: { kcal: 1000 } } })
    try {
      renderAt('/dagbok')
      expect(await screen.findByText(/ingår din vanliga träning redan i dagsmålet/)).toBeInTheDocument()
      expect(screen.queryByText(/av träningen .* räknas in i dagens budget/)).not.toBeInTheDocument()
    } finally {
      useBodyStore.getState().clearBody()
    }
  })
})
