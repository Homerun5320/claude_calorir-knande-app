/**
 * Röktester för Insikter: alla flikar renderas med riktiga butiker utan renderingsloopar,
 * tomma lägen, medvetet läge, klimatinställningen och delning av veckorapporten.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InsightsPage from './InsightsPage'
import ReportPrintPage, { REPORT_FOOTER } from './ReportPrintPage'
import { kg } from './ClimateTab'
import { kostradMetText } from './KostradTab'
import { RISE_SOURCE } from '../../lib/climate'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'
import { makeFood } from './testUtils'

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

const GROT = makeFood('Havregrynsgröt', { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3, fiber: 1.7, iron: 0.8, wholegrain: 8 }, 'spannmal')
const LAX = makeFood('Lax', { kcal: 210, protein: 22, fat: 13, carbs: 0, vitD: 10 }, 'fisk')
const BROCCOLI = makeFood('Broccoli', { kcal: 35, protein: 3, carbs: 4, fat: 0.4, fiber: 3 }, 'gronsaker')
const POTATIS = makeFood('Potatis', { kcal: 80, protein: 2, carbs: 17, fat: 0.1, fiber: 1.5 }, 'potatis')
const NOTFARS = makeFood('Nötfärs', { kcal: 250, protein: 18, fat: 20 }, 'rott_kott')

function seed(days: number) {
  const today = todayISO()
  const { addEntries } = useDiaryStore.getState()
  for (let i = 0; i < days; i++) {
    const date = addDays(today, -i)
    addEntries([
      { kind: 'food', food: GROT, amount: 300, unit: 'g', grams: 300, date, meal: 'frukost', time: '07:30' },
      { kind: 'food', food: i % 2 ? LAX : NOTFARS, amount: 150, unit: 'g', grams: 150, date, meal: 'middag', time: '18:15' },
      { kind: 'food', food: BROCCOLI, amount: 200, unit: 'g', grams: 200, date, meal: 'middag', time: '18:15' },
      { kind: 'food', food: POTATIS, amount: 200, unit: 'g', grams: 200, date, meal: 'middag' },
      { kind: 'quick', name: 'Kanelbulle', nutrients: { kcal: 300 }, date, meal: 'fika' },
    ])
  }
}

function renderPage(path = '/insikter') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InsightsPage />
    </MemoryRouter>,
  )
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

describe('InsightsPage', () => {
  it('välkomnar med ett tomt läge innan något är loggat', async () => {
    renderPage()
    expect(await screen.findByText('Dina insikter växer fram här')).toBeInTheDocument()
  })

  it('visar översikten med loggade dagar och energifördelning', async () => {
    seed(10)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Energi per dag' })).toBeInTheDocument()
    expect(screen.getByText(/Du har loggat \d+ av \d+ dag(ar)?/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Energifördelning' })).toBeInTheDocument()
    expect(screen.getAllByText(/Baserat på \d+ loggade? dag/).length).toBeGreaterThan(0)
  })

  it('renderar alla flikar utan fel', async () => {
    seed(14)
    renderPage('/insikter?period=30')
    await screen.findByRole('heading', { name: 'Energi per dag' })

    fireEvent.click(screen.getByRole('tab', { name: /Näring/ }))
    expect(await screen.findByRole('heading', { name: 'Håll koll på' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dina bästa källor' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Kostråd/ }))
    expect(await screen.findByText('Kostrådspoäng')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Tallriken/ }))
    expect(await screen.findByRole('heading', { name: 'Din genomsnittliga tallrik' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Klimat/ }))
    expect(await screen.findByRole('heading', { name: 'Matens klimatavtryck' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Smarta byten' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /Mönster/ }))
    expect(await screen.findByRole('heading', { name: 'Kalendern' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'När du äter' })).toBeInTheDocument()
  })

  it('räknar inte med dagens ofullständiga dag i snitten – förrän dagen är klar', async () => {
    seed(3)
    renderPage('/insikter?period=30')
    expect(await screen.findByText('Du har loggat 2 av 29 dagar')).toBeInTheDocument()
    expect(screen.getByText(/Idag räknas med i snitten när du markerar dagen som klar/)).toBeInTheDocument()
    await act(async () => useDiaryStore.getState().setDayMeta(todayISO(), { complete: true }))
    expect(await screen.findByText('Du har loggat 3 av 30 dagar')).toBeInTheDocument()
    expect(screen.queryByText(/Idag räknas med i snitten/)).not.toBeInTheDocument()
  })

  it('säger något varsamt när klara dagar i snitt ligger under energigolvet – aldrig beröm', async () => {
    // Exempeldagarna är ca 1 100 kcal – under 1 200 kcal.
    seed(4)
    for (let i = 1; i <= 3; i++) useDiaryStore.getState().setDayMeta(addDays(todayISO(), -i), { complete: true })
    renderPage('/insikter?period=30')
    expect(await screen.findByText(/har du i snitt ätit mindre än 1\s200 kcal per dag/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^1177/ }).length).toBeGreaterThan(0)
  })

  it('visar 90 dagar med linjediagram', async () => {
    seed(20)
    renderPage('/insikter?period=90')
    expect(await screen.findByRole('heading', { name: 'Energi per dag' })).toBeInTheDocument()
    expect(screen.getByText('Senaste 90 dagarna', { selector: 'p' })).toBeInTheDocument()
  })

  it('döljer klimatfliken när klimat är avstängt', async () => {
    seed(3)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, showClimate: false } })
    renderPage('/insikter?flik=klimat')
    expect(await screen.findByRole('heading', { name: 'Energi per dag' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Klimat/ })).not.toBeInTheDocument()
  })

  it('visar inga energisiffror i medvetet läge', async () => {
    seed(7)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Dina dagar' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Energi per dag' })).not.toBeInTheDocument()
    expect(screen.getByText(/Snittdagen:/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/\d\s?kcal/)
  })

  it('visar ett vänligt tomt läge för en vecka utan registreringar', async () => {
    seed(1)
    renderPage('/insikter?vecka=-3')
    expect(await screen.findByText('Inget loggat den veckan')).toBeInTheDocument()
  })

  it('delar veckorapporten via urklipp när delningsdialogen saknas', async () => {
    seed(5)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPage()
    await screen.findByRole('heading', { name: 'Energi per dag' })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Dela veckorapport' })[0])
    })
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0][0]).toMatch(/Lagom – vecka \d+/)
    expect(useToastStore.getState().toasts[0]?.message).toMatch(/kopierad/)
  })

  it('räknar bara bedömda kostråd som uppfyllda och visar hur många som är osäkra', async () => {
    seed(7)
    renderPage('/insikter?flik=kostrad')
    expect(await screen.findByText('Kostrådspoäng')).toBeInTheDocument()
    // Exemplens livsmedel saknar salt, mättat fett och tillsatt socker – de råden är osäkra.
    expect(screen.getByText(/\d+ av \d+ bedömda råd uppfyllda · \d+ osäkra · baserat på/)).toBeInTheDocument()
    expect(screen.getAllByText('Osäkert').length).toBeGreaterThan(0)
  })

  it('visar tallriksmodellen utan dubbelt kolon', async () => {
    seed(3)
    renderPage('/insikter?flik=tallrik')
    expect(await screen.findByText('Tallriksmodellen: låt grönsaker och rotfrukter fylla halva tallriken.')).toBeInTheDocument()
  })

  it('visar små klimatkällor med två decimaler och RISE-källans fullständiga namn', async () => {
    const today = todayISO()
    useDiaryStore.getState().addEntries([
      { kind: 'food', food: BROCCOLI, amount: 50, unit: 'g', grams: 50, date: today, meal: 'lunch' },
      { kind: 'food', food: NOTFARS, amount: 100, unit: 'g', grams: 100, date: today, meal: 'middag' },
    ])
    useDiaryStore.getState().setDayMeta(today, { complete: true })
    renderPage('/insikter?flik=klimat')
    const list = await screen.findByRole('list', { name: 'Livsmedel med störst klimatavtryck' })
    // 50 g broccoli × 0,6 kg CO₂e/kg = 0,03 kg – inte "0 kg".
    expect(list).toHaveTextContent(/Broccoli\s0,03\s?kg/)
    expect(list.textContent).not.toMatch(/(^|[^,\d])0\s?kg/)
    expect(screen.getAllByText(new RegExp(RISE_SOURCE.replace(/[.()]/g, '\\$&'))).length).toBeGreaterThan(0)
  })

  it('länkar till rapporten att skriva ut', async () => {
    seed(3)
    renderPage()
    await screen.findByRole('heading', { name: 'Energi per dag' })
    expect(screen.getByRole('link', { name: 'Rapport att skriva ut' })).toHaveAttribute('href', '/rapport')
  })
})

describe('kg och kostrådstext', () => {
  it('avrundar klimatvärden utan "0 kg"', () => {
    expect(kg(0.03)).toBe('0,03\u00a0kg')
    expect(kg(0.001)).toBe('<0,01\u00a0kg')
    expect(kg(0.25)).toBe('0,3\u00a0kg')
    expect(kg(2.46)).toBe('2,5\u00a0kg')
    expect(kg(undefined)).toBe('–')
  })

  it('beskriver uppfyllda och osäkra råd', () => {
    expect(kostradMetText(2, 9, 3)).toBe('2 av 9 bedömda råd uppfyllda · 3 osäkra')
    expect(kostradMetText(1, 11, 1)).toBe('1 av 11 bedömda råd uppfyllda · 1 osäkert')
    expect(kostradMetText(4, 12, 0)).toBe('4 av 12 bedömda råd uppfyllda')
  })
})

describe('ReportPrintPage', () => {
  function renderReport() {
    return render(
      <MemoryRouter initialEntries={['/rapport']}>
        <ReportPrintPage />
      </MemoryRouter>,
    )
  }

  afterEach(() => vi.restoreAllMocks())

  it('renderar rapporten och skriver ut med webbläsarens dialog', async () => {
    seed(10)
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderReport()
    expect(await screen.findByRole('heading', { level: 1, name: /^Lagom – rapport / })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Energi och näring' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Livsmedelsverkets kostråd' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tallriksbalansen' })).toBeInTheDocument()
    expect(screen.getByText(REPORT_FOOTER)).toBeInTheDocument()
    // Namnet i profilen tas inte med.
    expect(document.body.textContent).not.toMatch(/Anna/)

    fireEvent.click(screen.getByRole('button', { name: 'Skriv ut eller spara som PDF' }))
    expect(print).toHaveBeenCalledTimes(1)

    // 14 dagar i stället för 7.
    fireEvent.click(screen.getByRole('radio', { name: '14 dagar' }))
    await waitFor(() => expect(screen.getAllByText('Senaste 14 dagarna').length).toBeGreaterThan(0))
  })

  it('visar inga energisiffror i medvetet läge – bara tallrik och kostråd', async () => {
    seed(7)
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    renderReport()
    expect(await screen.findByRole('heading', { name: 'Tallriksbalansen' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Livsmedelsverkets kostråd' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Energi och näring' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Vikttrend' })).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/\d\s?kcal/)
    // Inte heller ord om energin – bara tallrik och kostråd.
    expect(document.body.textContent ?? '').not.toMatch(/Snittdagen|underkant|över målet/i)
  })

  it('säger vänligt till när perioden saknar registreringar', async () => {
    renderReport()
    expect(await screen.findByText('Inget loggat under perioden.')).toBeInTheDocument()
  })
})
