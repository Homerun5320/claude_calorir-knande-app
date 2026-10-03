/**
 * Röktester för veckoplaneringen (/planering): veckan, planering av recept och livsmedel,
 * loggning i dagboken (med spärren efter provperioden), kopiera och tömma vecka, medvetet läge
 * och inköpslistan med bockar, egna rader och kopiering.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import PlanningPage from './PlanningPage'
import { ShoppingListView } from './ShoppingListView'
import { useToastStore } from '../../components/ui/toast'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFoodStore } from '../../stores/foodStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { usePlanStore } from '../../stores/planStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useAccessGateStore } from '../premium/requireAccess'
import { loadBuiltinCatalog } from '../../lib/foodRepo'
import { addDays, todayISO } from '../../lib/dates'
import { weekStartOf, weekTitle, type NewPlanItem } from '../../lib/planning'
import type { Food, FoodEntry, Profile, Recipe } from '../../types'

MotionGlobalConfig.skipAnimations = true

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: Date.now() - 3 * 86_400_000,
}

const lök: Food = {
  id: 'custom:lok',
  name: 'Gul lök',
  source: 'custom',
  category: 'gronsaker',
  nutrients: { kcal: 40, protein: 1 },
  portions: [{ id: 'st', label: '1 st (medel)', grams: 100 }],
}

const färs: Food = {
  id: 'custom:fars',
  name: 'Blandfärs',
  source: 'custom',
  category: 'rott_kott',
  nutrients: { kcal: 250, protein: 20 },
  portions: [],
  rawWeight: { factor: 0.8, kind: 'ra' },
}

const banan: Food = {
  id: 'custom:banan',
  name: 'Banan',
  source: 'custom',
  category: 'frukt',
  nutrients: { kcal: 90, protein: 1.1 },
  portions: [{ id: 'st', label: '1 st (medel)', grams: 120 }],
}

const gryta: Recipe = {
  id: 'r_gryta',
  name: 'Veckans gryta',
  emoji: '🍲',
  servings: 4,
  ingredients: [
    { id: 'i1', food: färs, amount: 500, unit: 'g-ra', grams: 400 },
    { id: 'i2', food: lök, amount: 2, unit: 'portion:st', grams: 200 },
  ],
  createdAt: 1,
  updatedAt: 1,
}

const today = todayISO()
const monday = weekStartOf(today)

function renderAt(path = '/planering') {
  const router = createMemoryRouter(
    [
      { path: '/planering', element: <PlanningPage /> },
      { path: '/recept/:id', element: <div>Receptsidan</div> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

function plan(draft: NewPlanItem) {
  const item = usePlanStore.getState().addItem(draft)
  if (!item) throw new Error('kunde inte planera')
  return item
}

const recipeDraft = (date: string, patch: Partial<Extract<NewPlanItem, { kind: 'recipe' }>> = {}): NewPlanItem => ({
  kind: 'recipe',
  date,
  meal: 'middag',
  recipeId: gryta.id,
  name: gryta.name,
  servings: 4,
  eat: 1,
  ...patch,
})

const lastToast = () => useToastStore.getState().toasts.at(-1)

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön – katalogen blir Lagoms egna livsmedel och klassiker.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  await loadBuiltinCatalog()
  await waitFor(() => expect(usePlanStore.persist.hasHydrated()).toBe(true))
})

beforeEach(() => {
  usePlanStore.getState().clearPlan()
  useDiaryStore.setState({ entries: {} })
  useFoodStore.setState({ customFoods: { [lök.id]: lök, [färs.id]: färs, [banan.id]: banan }, recipes: { [gryta.id]: gryta }, cachedFoods: {}, favorites: [], usage: {}, templates: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  useLicenseStore.setState({ trialStartedAt: Date.now(), licenseKey: null, activatedAt: null })
  useAccessGateStore.setState({ blocked: null })
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
})

describe('PlanningPage – veckan', () => {
  it('visar veckans sju dagar, måndag först, och tomläget', () => {
    renderAt()
    expect(screen.getByRole('heading', { level: 1, name: 'Veckoplanering' })).toBeInTheDocument()
    expect(screen.getAllByText(weekTitle(monday)).length).toBeGreaterThan(0)
    const days = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
    expect(days.filter((d) => /^(Måndag|Tisdag|Onsdag|Torsdag|Fredag|Lördag|Söndag)/.test(d))).toHaveLength(7)
    expect(days[days.findIndex((d) => d.startsWith('Måndag'))]).toMatch(/^Måndag \d+ \p{L}+/u)
    expect(screen.getByText('Inget planerat den här veckan')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Töm veckan' })).toBeDisabled()
  })

  it('bläddrar mellan veckor och sparar veckan i adressen', async () => {
    const { router } = renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Nästa vecka' }))
    await waitFor(() => expect(router.state.location.search).toBe(`?vecka=${addDays(monday, 7)}`))
    expect(screen.getAllByText(weekTitle(addDays(monday, 7))).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Till denna vecka' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('visar planerad energi och protein mot dagsmålet i lugn ton', () => {
    plan(recipeDraft(monday, { eat: 1 }))
    renderAt()
    const day = screen.getByRole('region', { name: /^Måndag/ })
    expect(within(day).getByText('Veckans gryta')).toBeInTheDocument()
    expect(within(day).getByText(/4 portioner, du äter 1$/)).toBeInTheDocument()
    // (400 g × 250 + 200 g × 40) / 100 / 4 = 270 kcal per portion.
    expect(within(day).getAllByText(/270/).length).toBeGreaterThan(0)
    expect(within(day).getByText(/Protein 21 av \d+ g/)).toBeInTheDocument()
    expect(within(day).getByText(/Plats för ca .* till/)).toBeInTheDocument()
    expect(day.textContent).not.toMatch(/för mycket|varning/i)
  })

  it('ger varje dag sitt eget mål med veckobudgeten', () => {
    // +300 kcal på fredagen och 50 kcal mindre de andra sex dagarna (summa 0).
    const shift = [-50, -50, -50, -50, 300, -50, -50]
    useProfileStore.setState((s) => ({ settings: { ...s.settings, adaptiveTargets: false, weeklyBudget: { enabled: true, shift } } }))
    plan(recipeDraft(monday))
    plan(recipeDraft(addDays(monday, 4)))
    renderAt()
    /** Dagens mål i kcal ur förloppsindikatorns text ("270 kcal planerat av 1 850 kcal"). */
    const targetOf = (name: RegExp) => {
      const text = within(screen.getByRole('region', { name })).getByRole('progressbar').getAttribute('aria-valuetext') ?? ''
      const match = /planerat av ([\d\s ]+)/.exec(text)
      return Number(match?.[1].replace(/\D/g, ''))
    }
    const mon = targetOf(/^Måndag/)
    const fri = targetOf(/^Fredag/)
    expect(mon).toBeGreaterThan(0)
    expect(fri - mon).toBe(350)
  })

  it('döljer siffrorna i medvetet läge', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, mindfulMode: true } }))
    plan(recipeDraft(monday))
    renderAt()
    const day = screen.getByRole('region', { name: /^Måndag/ })
    expect(within(day).queryByText(/kcal/)).not.toBeInTheDocument()
    expect(within(day).getByText('1 planerad rad')).toBeInTheDocument()
  })
})

describe('PlanningPage – planera', () => {
  it('planerar ett eget recept med portioner att laga och att äta', async () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Planera måndag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Planera måndag' })
    fireEvent.click(within(sheet).getByRole('button', { name: /Veckans gryta/ }))
    expect(within(sheet).getByText('Receptet ger 4 portioner')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Minska portioner att laga' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Öka portioner du äter' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Planera till middag' }))
    const [item] = usePlanStore.getState().items[monday]
    expect(item).toMatchObject({ kind: 'recipe', recipeId: 'r_gryta', meal: 'middag', servings: 3, eat: 1.5 })
    expect(item.kind === 'recipe' && item.perServing?.kcal).toBeCloseTo(270, 5)
    expect(lastToast()?.message).toBe('Veckans gryta planerad till middag måndag')
    act(() => lastToast()?.action?.onClick())
    expect(usePlanStore.getState().items[monday]).toBeUndefined()
  })

  it('planerar bak med många bitar: hela satsen ryms och steget är en halv sats', async () => {
    const pepparkakor: Recipe = { ...gryta, id: 'r_pepparkakor', name: 'Mormors pepparkakor', emoji: '🍪', servings: 120 }
    useFoodStore.setState((s) => ({ recipes: { ...s.recipes, [pepparkakor.id]: pepparkakor } }))
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Planera måndag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Planera måndag' })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Mormors pepparkakor/ }))
    const minus = within(sheet).getByRole('button', { name: 'Minska portioner att laga' })
    fireEvent.click(minus)
    fireEvent.click(minus)
    expect(within(sheet).getByText('Rester – inget att handla')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Öka portioner att laga' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Öka portioner att laga' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Planera till middag' }))
    expect(usePlanStore.getState().items[monday]).toEqual([expect.objectContaining({ recipeId: 'r_pepparkakor', servings: 120, eat: 1 })])
  })

  it('planerar ett livsmedel med mängd och vald måltid', async () => {
    useFoodStore.setState({ usage: { [banan.id]: { count: 2, lastUsed: Date.now(), lastAmount: 1, lastUnit: 'portion:st', meals: { fika: 2 } } } })
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Planera måndag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Planera måndag' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Livsmedel' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Fika/ }))
    fireEvent.click(await within(sheet).findByRole('button', { name: 'Välj Banan' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Planera till fika' }))
    expect(usePlanStore.getState().items[monday]).toEqual([
      expect.objectContaining({ kind: 'food', meal: 'fika', amount: 1, unit: 'portion:st', grams: 120, food: expect.objectContaining({ id: banan.id }) }),
    ])
  })

  it('planerar en sparad måltid med ett tryck', async () => {
    useFoodStore.setState({
      templates: [{ id: 'tpl_1', name: 'Min frukost', meal: 'frukost', items: [{ food: banan, amount: 1, unit: 'portion:st', grams: 120 }], createdAt: 1 }],
    })
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Planera måndag' }))
    const sheet = await screen.findByRole('dialog', { name: 'Planera måndag' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Måltider' }))
    fireEvent.click(within(sheet).getByRole('button', { name: /Min frukost/ }))
    expect(usePlanStore.getState().items[monday]).toEqual([expect.objectContaining({ kind: 'meal', name: 'Min frukost', templateId: 'tpl_1', meal: 'middag' })])
  })

  it('spärrar planering efter provperioden – utan att öppna arket', () => {
    useLicenseStore.setState({ trialStartedAt: Date.now() - 90 * 86_400_000 })
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Planera måndag' }))
    expect(useAccessGateStore.getState().blocked).not.toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Planera måndag' })).not.toBeInTheDocument()
  })

  it('ändrar portioner och tar bort en planerad rad med ångra', async () => {
    const item = plan(recipeDraft(monday))
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: /^Veckans gryta, .*Ändra$/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Veckans gryta' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Öka portioner du äter' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Spara' }))
    expect(usePlanStore.getState().items[monday][0]).toMatchObject({ id: item.id, eat: 1.5 })

    fireEvent.click(screen.getByRole('button', { name: /^Veckans gryta, .*Ändra$/ }))
    const again = await screen.findByRole('dialog', { name: 'Veckans gryta' })
    fireEvent.click(within(again).getByRole('button', { name: 'Ta bort från planen' }))
    expect(usePlanStore.getState().items[monday]).toBeUndefined()
    act(() => lastToast()?.action?.onClick())
    expect(usePlanStore.getState().items[monday]).toHaveLength(1)
  })
})

describe('PlanningPage – logga', () => {
  it('loggar en planerad rad i dagboken för dagen och visar "Loggad" tills det ångras', async () => {
    plan(recipeDraft(today, { eat: 2 }))
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Logga Veckans gryta' }))
    const [entry] = useDiaryStore.getState().entries[today] as FoodEntry[]
    expect(entry).toMatchObject({ kind: 'food', meal: 'middag', amount: 2, unit: 'portion:portion' })
    expect(entry.food.id).toBe('recipe:r_gryta')
    expect(entry.grams).toBeCloseTo(300, 5)
    expect(await screen.findByText('Loggad')).toBeInTheDocument()
    expect(lastToast()?.message).toBe('Loggat i Middag')
    act(() => lastToast()?.action?.onClick())
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    expect(await screen.findByRole('button', { name: 'Logga Veckans gryta' })).toBeInTheDocument()
  })

  it('loggar inte efter provperioden', () => {
    plan(recipeDraft(today))
    useLicenseStore.setState({ trialStartedAt: Date.now() - 90 * 86_400_000 })
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Logga Veckans gryta' }))
    expect(useDiaryStore.getState().entries[today]).toBeUndefined()
    expect(useAccessGateStore.getState().blocked).toEqual({ action: 'mat' })
  })

  it('visar ingen loggknapp för kommande veckor', () => {
    const next = addDays(monday, 7)
    plan(recipeDraft(next))
    renderAt(`/planering?vecka=${next}`)
    expect(screen.getByText('Veckans gryta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Logga/ })).not.toBeInTheDocument()
  })
})

describe('PlanningPage – kopiera och töm', () => {
  it('kopierar förra veckan och kan ångra', async () => {
    plan(recipeDraft(addDays(monday, -7)))
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera förra veckan' }))
    await waitFor(() => expect(usePlanStore.getState().items[monday]).toHaveLength(1))
    expect(lastToast()?.message).toBe('Förra veckans plan är kopierad')
    act(() => lastToast()?.action?.onClick())
    expect(usePlanStore.getState().items[monday]).toBeUndefined()
  })

  it('ångrar en kopierad vecka med flera rader med en enda skrivning (varje set() skriver om hela planen)', async () => {
    const prev = addDays(monday, -7)
    plan(recipeDraft(prev))
    plan(recipeDraft(prev, { meal: 'lunch' }))
    plan(recipeDraft(addDays(prev, 2)))
    plan(recipeDraft(addDays(prev, 5)))
    const own = plan(recipeDraft(addDays(monday, 3)))
    const inWeek = () =>
      Object.entries(usePlanStore.getState().items)
        .filter(([date]) => date >= monday && date <= addDays(monday, 6))
        .reduce((n, [, list]) => n + list.length, 0)
    // Veckan har redan en rad, så kopieringen frågas först.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera förra veckan' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Förra veckans plan är kopierad'))
    expect(inWeek()).toBe(5)

    let writes = 0
    const unsubscribe = usePlanStore.subscribe(() => {
      writes++
    })
    try {
      act(() => lastToast()?.action?.onClick())
      expect(writes).toBe(1)
    } finally {
      unsubscribe()
    }
    // Bara de kopierade raderna försvann – den egna raden och förra veckan finns kvar.
    expect(inWeek()).toBe(1)
    expect(usePlanStore.getState().items[own.date]).toEqual([own])
    expect(Object.keys(usePlanStore.getState().items)).toHaveLength(4)
  })

  it('frågar innan förra veckan läggs till i en vecka som redan har rader', async () => {
    plan(recipeDraft(addDays(monday, -7)))
    plan(recipeDraft(monday))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera förra veckan' }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(usePlanStore.getState().items[monday]).toHaveLength(1)
  })

  it('säger till när förra veckan är tom', () => {
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Kopiera förra veckan' }))
    expect(lastToast()?.message).toBe('Förra veckan är tom – det finns inget att kopiera.')
  })

  it('tömmer veckan efter bekräftelse och kan ångra', async () => {
    plan(recipeDraft(monday))
    plan(recipeDraft(addDays(monday, 6)))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: 'Töm veckan' }))
    await waitFor(() => expect(usePlanStore.getState().items).toEqual({}))
    act(() => lastToast()?.action?.onClick())
    expect(Object.keys(usePlanStore.getState().items)).toHaveLength(2)
  })
})

describe('PlanningPage – laddning läses upp', () => {
  it('inköpslistan som väntar på recepten är en statusregion med osynlig text (aria-label på en div hörs inte)', () => {
    render(
      <MemoryRouter>
        <ShoppingListView weekStart={monday} today={today} list={{ groups: [], count: 0, missingRecipes: [] }} loading planned={1} onPlan={() => {}} />
      </MemoryRouter>,
    )
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Hämtar recepten')
    expect(status.querySelector('.sr-only')).toHaveTextContent('Hämtar recepten …')
    expect(status).not.toHaveAttribute('aria-label')
    // Själva skelettet är dolt för skärmläsare.
    for (const bone of Array.from(status.querySelectorAll('[data-skeleton]'))) expect(bone).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('PlanningPage – inköpslista', () => {
  it('sammanställer veckans ingredienser per avdelning i rå vikt och svenska mått', () => {
    plan(recipeDraft(monday, { servings: 4 }))
    plan(recipeDraft(addDays(monday, 2), { servings: 2 }))
    plan(recipeDraft(addDays(monday, 3), { servings: 0 }))
    renderAt('/planering?flik=inkop')
    expect(screen.getByRole('tab', { name: /Inköpslista/, selected: true })).toBeInTheDocument()
    const grönt = screen.getByRole('region', { name: 'Frukt och grönt' })
    expect(within(grönt).getByRole('checkbox', { name: /Gul lök/ })).toBeInTheDocument()
    expect(within(grönt).getByText('3 st (medel, 300 g)')).toBeInTheDocument()
    const kött = screen.getByRole('region', { name: 'Kött, fisk och vego' })
    expect(within(kött).getByText('750 g rå')).toBeInTheDocument()
    expect(within(kött).getByText('Till Veckans gryta')).toBeInTheDocument()
    expect(screen.getByText('2 varor kvar')).toBeInTheDocument()
  })

  it('den obockade rutan har en ram med minst 3:1 (border-ink-3, inte border-line) – både på listan och på egna varor', () => {
    plan(recipeDraft(monday))
    usePlanStore.getState().addExtra(monday, 'Diskmedel')
    renderAt('/planering?flik=inkop')
    for (const name of [/Gul lök/, 'Diskmedel']) {
      const box = screen.getByRole('checkbox', { name })
      // Den riktiga kryssrutan är osynlig (sr-only); rutan efter den är det man ser.
      const visible = box.nextElementSibling as HTMLElement
      expect(visible).toHaveAttribute('aria-hidden', 'true')
      expect(visible).toHaveClass('border-2', 'border-ink-3')
      expect(visible).not.toHaveClass('border-line')
      fireEvent.click(box)
      expect(screen.getByRole('checkbox', { name })).toBeChecked()
      expect((screen.getByRole('checkbox', { name }).nextElementSibling as HTMLElement)).toHaveClass('border-gran', 'bg-gran')
    }
  })

  it('bockar av, lägger till egna varor och kopierar listan som text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    plan(recipeDraft(monday))
    renderAt('/planering?flik=inkop')
    fireEvent.click(screen.getByRole('checkbox', { name: /Gul lök/ }))
    expect(usePlanStore.getState().shopping[monday]?.checked).toEqual(['food:custom:lok'])
    expect(screen.getByText('1 vara kvar')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Lägg till egen vara' }), { target: { value: 'Diskmedel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lägg till' }))
    expect(within(screen.getByRole('region', { name: 'Egna varor' })).getByRole('checkbox', { name: 'Diskmedel' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Kopiera listan' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain(`Inköpslista ${weekTitle(monday).toLowerCase()}`)
    expect(text).toContain('• Blandfärs – 500 g rå')
    expect(text).toContain('Egna varor\n• Diskmedel')
    expect(text).not.toContain('Gul lök')
    await waitFor(() => expect(lastToast()?.message).toBe('Inköpslistan är kopierad – klistra in den där du vill.'))

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort bockarna' }))
    expect(usePlanStore.getState().shopping[monday]?.checked).toEqual([])
    act(() => lastToast()?.action?.onClick())
    expect(usePlanStore.getState().shopping[monday]?.checked).toEqual(['food:custom:lok'])
  })

  it('visar tomläget och räknar upp recept som inte finns längre', () => {
    plan(recipeDraft(monday, { recipeId: 'r_borta', name: 'Mormors soppa' }))
    renderAt('/planering?flik=inkop')
    expect(screen.getByText('Inköpslistan är tom')).toBeInTheDocument()
    expect(screen.getByText(/Receptet Mormors soppa finns inte längre/)).toBeInTheDocument()
  })
})
