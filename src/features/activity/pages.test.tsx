/**
 * Röktester för Träning, Dryck och Fasta med riktiga butiker (fake-indexeddb):
 * rendering utan renderingsloopar, att lägga till och ta bort med Ångra, snabbval och fastetimern.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ExercisePage from './ExercisePage'
import DrinksPage from './DrinksPage'
import FastingPage from './FastingPage'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'
import { BUILTIN_FOODS } from '../../data/foods'
import { nutrientsForGrams, standardDrinks } from '../../lib/nutrients'
import { formatNumber } from '../../lib/format'
import { useLicenseStore } from '../../stores/licenseStore'
import { BLOCKED_ACTION_TEXT, useAccessGateStore } from '../premium/requireAccess'

const STORES = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore]

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.25,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/traning', element: <ExercisePage /> },
      { path: '/dryck', element: <DrinksPage /> },
      { path: '/fasta', element: <FastingPage /> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const lastToast = () => useToastStore.getState().toasts.at(-1)

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useFastingStore.getState().clearFasting()
  useBodyStore.getState().clearBody()
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  // Utan DialogHost faller confirmDialog tillbaka på window.confirm.
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('Träning', () => {
  it('visar tomt läge och lägger till en aktivitet via sök', async () => {
    renderAt('/traning')
    expect(screen.getByRole('heading', { level: 1, name: 'Träning' })).toBeInTheDocument()
    expect(screen.getByText('Ingen aktivitet ännu idag')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lägg till aktivitet' }))
    const dialog = await screen.findByRole('dialog', { name: 'Välj aktivitet' })
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Sök aktivitet' }), { target: { value: 'padel' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Padel/ }))

    const details = await screen.findByRole('dialog', { name: 'Lägg till aktivitet' })
    fireEvent.click(within(details).getByRole('button', { name: '1 h' }))
    // (6 − 1) MET × 70 kg × 1 h = 350 kcal netto
    expect(within(details).getByText(/350/)).toBeInTheDocument()
    fireEvent.click(within(details).getByRole('button', { name: 'Lägg till' }))

    const list = useDiaryStore.getState().exercise[todayISO()]
    expect(list).toHaveLength(1)
    expect(list?.[0]).toMatchObject({ activityId: 'padel', minutes: 60, kcal: 350, met: 6 })
    expect(await screen.findByRole('button', { name: /^Ändra Padel/ })).toBeInTheDocument()
  })

  it('tar bort med Ångra och läser datum från adressen', async () => {
    const date = addDays(todayISO(), -1)
    useDiaryStore.getState().addExercise({ date, activityId: 'yoga', name: 'Yoga', minutes: 45, kcal: 70 })
    renderAt(`/traning?datum=${date}`)
    expect(screen.getByRole('button', { name: /^Ändra Yoga/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Yoga' }))
    expect(useDiaryStore.getState().exercise[date] ?? []).toHaveLength(0)
    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().exercise[date]).toHaveLength(1)
  })

  it('egen kcal från klockan och avdrag för vilan', async () => {
    renderAt('/traning')
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till aktivitet' }))
    const dialog = await screen.findByRole('dialog', { name: 'Välj aktivitet' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Egen aktivitet' }))
    const details = await screen.findByRole('dialog', { name: 'Lägg till aktivitet' })
    fireEvent.change(within(details).getByRole('textbox', { name: 'Aktivitet' }), { target: { value: 'Friluftsdag' } })
    fireEvent.click(within(details).getByRole('switch', { name: 'Ange eget värde' }))
    fireEvent.change(within(details).getByRole('spinbutton', { name: 'Egen förbrukning' }), { target: { value: '400' } })
    // 30 min vila vid 70 kg = 35 kcal
    fireEvent.click(within(details).getByRole('button', { name: /Dra av vilan/ }))
    fireEvent.click(within(details).getByRole('button', { name: 'Lägg till' }))
    expect(useDiaryStore.getState().exercise[todayISO()]?.[0]).toMatchObject({ activityId: 'custom', name: 'Friluftsdag', kcal: 365 })
  })

  it('steg sparas på dagen och kan läggas till som aktivitet', async () => {
    renderAt('/traning')
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Steg idag' }), { target: { value: '12000' } })
    // Stegen sparas efter en paus – eller direkt när fältet lämnas.
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Steg idag' }))
    expect(useDiaryStore.getState().days[todayISO()]?.steps).toBe(12000)
    fireEvent.click(await screen.findByRole('button', { name: 'Lägg till som aktivitet' }))
    const entry = useDiaryStore.getState().exercise[todayISO()]?.[0]
    expect(entry).toMatchObject({ activityId: 'steg', minutes: 45 })
    expect(entry?.kcal).toBeGreaterThan(0)
  })

  it('reglaget ändrar andelen till budgeten', () => {
    renderAt('/traning')
    fireEvent.change(screen.getByRole('slider', { name: 'Andel av träningen till budgeten' }), { target: { value: '25' } })
    expect(useProfileStore.getState().settings.exerciseAddBackPct).toBe(25)
  })

  it('påminner om att vardagsrörelse kan ingå i aktivitetsnivån', async () => {
    renderAt('/traning')
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till aktivitet' }))
    const dialog = await screen.findByRole('dialog', { name: 'Välj aktivitet' })
    fireEvent.change(within(dialog).getByRole('searchbox', { name: 'Sök aktivitet' }), { target: { value: 'cykla till jobbet' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Cykla till jobbet/ }))
    const details = await screen.findByRole('dialog', { name: 'Lägg till aktivitet' })
    expect(within(details).getByText(/räknas det i din aktivitetsnivå – logga bara det som är extra/)).toBeInTheDocument()
  })

  it('medvetet läge döljer energisiffror', () => {
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    useDiaryStore.getState().addExercise({ date: todayISO(), activityId: 'promenad', name: 'Promenad', minutes: 30, kcal: 98 })
    renderAt('/traning')
    expect(screen.queryByText(/98/)).not.toBeInTheDocument()
    expect(screen.getByText('Aktiviteter')).toBeInTheDocument()
  })
})

describe('Dryck', () => {
  it('lägger till vatten med Ångra', () => {
    renderAt('/dryck')
    expect(screen.getByRole('heading', { level: 1, name: 'Dryck' })).toBeInTheDocument()
    // Samma enhet för glas och flaska (ml) – inte "250 ml" bredvid "50 cl".
    expect(screen.getByRole('button', { name: /^1 glas \(250\sml\)$/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^1 flaska \(500\sml\)$/ }))
    expect(useDiaryStore.getState().water[todayISO()]).toBe(500)
    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().water[todayISO()]).toBe(0)
  })

  it('snabbval för kaffe ger koffein och klockslag', async () => {
    renderAt('/dryck')
    fireEvent.click(await screen.findByRole('button', { name: /Lägg till Bryggkaffe/ }))
    const entries = useDiaryStore.getState().entries[todayISO()] ?? []
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'food', unit: 'portion:kopp' })
    expect(entries[0].time).toMatch(/^\d{2}:\d{2}$/)
    expect(await screen.findByText('Dagens intag')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Uppskattat koffein/ })).toBeInTheDocument()
  })

  it('snabbval för alkohol räknas i standardglas', async () => {
    renderAt('/dryck')
    fireEvent.click(await screen.findByRole('button', { name: /Lägg till Starköl/ }))
    // En burk (33 cl) starköl i standardglas (12 g alkohol) – räknat från databasens värden.
    const beer = BUILTIN_FOODS.find((f) => f.id === 'lagom:ol-starkol-lager-5')!
    const can = beer.portions.find((p) => p.id === 'burk')!
    const expected = formatNumber(standardDrinks(nutrientsForGrams(beer.nutrients, can.grams)), 1)
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0))
    expect(screen.getByRole('link', { name: /Alkoholhjälpen/ })).toHaveAttribute('href', 'https://alkoholhjalpen.se')
    // Vuxna ser riktmärket 400 mg koffein – med mellanslag mellan siffran och enheten.
    expect(screen.getByText(/mg av 400 mg/).parentElement).toHaveTextContent(/^0 mg av 400 mg$/)
  })

  it('under 18 år: lägre koffeingräns och rådet att avstå från alkohol', async () => {
    const year = Number(todayISO().slice(0, 4))
    useProfileStore.setState({ profile: { ...PROFILE, birthYear: year - 15, startWeightKg: 55 } })
    renderAt('/dryck')
    // 3 mg per kg kroppsvikt: 55 kg → 165 mg.
    expect(await screen.findByText(/mg av 165 mg/)).toBeInTheDocument()
    expect(screen.getByText(/för dig under 18 år gäller högst ca 3 mg per kg kroppsvikt/)).toBeInTheDocument()
    expect(screen.getByText(/Under 18 år är rådet att avstå från alkohol helt/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Lägg till Starköl/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Om standardglas och risknivåer')).not.toBeInTheDocument()
    // Snabbvalen för kaffe och te finns kvar.
    expect(await screen.findByRole('button', { name: /Lägg till Bryggkaffe/ })).toBeInTheDocument()
  })
})

describe('Dryck efter provperioden', () => {
  afterEach(() => {
    useLicenseStore.getState().resetLicenseState()
    useAccessGateStore.setState({ blocked: null })
  })

  it('snabbvalen för kaffe och alkohol säger "logga dryck" – inte "logga mat"', async () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 20 * 86_400_000, licenseKey: null, activatedAt: null })
    renderAt('/dryck')
    fireEvent.click(await screen.findByRole('button', { name: /Lägg till Bryggkaffe/ }))
    expect(useDiaryStore.getState().entries[todayISO()] ?? []).toHaveLength(0)
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'dryck' })
    expect(BLOCKED_ACTION_TEXT[useAccessGateStore.getState().blocked!.action!]).toBe('logga dryck')

    useAccessGateStore.setState({ blocked: null })
    fireEvent.click(await screen.findByRole('button', { name: /Lägg till Starköl/ }))
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'dryck' })
    expect(useDiaryStore.getState().entries[todayISO()] ?? []).toHaveLength(0)
  })
})

describe('Fasta', () => {
  it('startar, visar timern och avslutar tidigt efter bekräftelse', async () => {
    renderAt('/fasta')
    expect(screen.getByRole('heading', { level: 1, name: 'Fasta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '14:10' }))
    fireEvent.click(screen.getByRole('button', { name: 'Starta fastan nu' }))
    expect(useFastingStore.getState().active).toMatchObject({ targetHours: 14, protocol: '14:10' })
    expect(await screen.findByRole('progressbar', { name: 'Fastans förlopp' })).toBeInTheDocument()

    // Nyss startad: avslutas utan att sparas (ingen "0 min"-fasta i historiken).
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta fastan' }))
    await waitFor(() => expect(useFastingStore.getState().active).toBeNull())
    expect(window.confirm).toHaveBeenCalled()
    expect(useFastingStore.getState().history).toHaveLength(0)
    expect(lastToast()?.message).toBe('Fastan är avslutad utan att sparas')
    await act(async () => {
      lastToast()?.action?.onClick()
    })
    expect(useFastingStore.getState().active).toMatchObject({ targetHours: 14, protocol: '14:10' })
  })

  it('sparar en fasta som avslutas tidigt efter bekräftelse', async () => {
    useFastingStore.setState({ active: { start: Date.now() - 2 * 3_600_000, targetHours: 16, protocol: '16:8' } })
    renderAt('/fasta')
    fireEvent.click(screen.getByRole('button', { name: 'Avsluta fastan' }))
    await waitFor(() => expect(useFastingStore.getState().history).toHaveLength(1))
    expect(window.confirm).toHaveBeenCalled()
    expect(useFastingStore.getState().active).toBeNull()
  })

  it('"Jag började tidigare" sätter starttiden bakåt', async () => {
    renderAt('/fasta')
    fireEvent.click(screen.getByRole('button', { name: /Jag började tidigare/ }))
    const dialog = await screen.findByRole('dialog', { name: 'När började du?' })
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Igår' }))
    fireEvent.change(within(dialog).getByLabelText('Klockslag'), { target: { value: '20:00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Starta med den tiden' }))
    const active = useFastingStore.getState().active
    const d = new Date()
    expect(active?.start).toBe(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 20, 0).getTime())
  })

  it('historik med mål nått och borttagning med Ångra', () => {
    const end = Date.now() - 3_600_000
    useFastingStore.setState({ history: [{ id: 'f1', start: end - 16 * 3_600_000, end, targetHours: 16, protocol: '16:8' }] })
    renderAt('/fasta')
    expect(screen.getByText('Mål nått')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort fastan 16 h' }))
    expect(useFastingStore.getState().history).toHaveLength(0)
    act(() => lastToast()?.action?.onClick())
    expect(useFastingStore.getState().history).toHaveLength(1)
  })

  it('visar omtanke i stället för timern vid graviditet', () => {
    useProfileStore.setState({ profile: { ...PROFILE, lifeStage: 'gravid' } })
    renderAt('/fasta')
    expect(screen.getByText('Fasta passar inte just nu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /visa timern/ }))
    expect(screen.getByRole('button', { name: 'Starta fastan nu' })).toBeInTheDocument()
  })
})
