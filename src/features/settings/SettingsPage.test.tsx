/**
 * Röktester för Inställningar: index, varje sektion, sparande av profil, egna mål och
 * makron, måltider, utseende, import av säkerhetskopia och radering av all data.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import SettingsPage from './SettingsPage'
import { DialogHost, useToastStore } from '../../components/ui'
import { createBackup } from '../../lib/backup'
import { todayISO } from '../../lib/dates'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_MEALS, DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import type { Profile } from '../../types'

MotionGlobalConfig.skipAnimations = true

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
  createdAt: new Date(2026, 8, 1).getTime(),
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/installningar" element={<SettingsPage />} />
        <Route path="/installningar/:section" element={<SettingsPage />} />
        <Route path="/om" element={<p>Om-sidan</p>} />
        <Route path="/valkommen" element={<p>Välkomstflödet</p>} />
      </Routes>
      <DialogHost />
    </MemoryRouter>,
  )
}

const lastToast = () => useToastStore.getState().toasts.at(-1)?.message

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  localStorage.clear()
  useDiaryStore.getState().clearDiary()
  useFoodStore.getState().clearFoods()
  useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 74, createdAt: 0 }], measurements: [] })
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

describe('SettingsPage – index', () => {
  it('visar grupperna och en sammanfattning av profilen', () => {
    renderAt('/installningar')
    expect(screen.getByRole('heading', { level: 1, name: 'Inställningar' })).toBeInTheDocument()
    expect(screen.getByText('Hej, Anna')).toBeInTheDocument()
    expect(screen.getByText(/Kvinna · \d+ år · 168 cm · lätt aktiv/)).toBeInTheDocument()
    for (const name of ['Profil', 'Mål och makron', 'Måltider', 'Utseende och visning', 'Träning och vatten', 'Data och säkerhetskopia', 'Livsmedelsdatabas', 'Om Lagom']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: /Mål och makron/ })).toHaveAttribute('href', '/installningar/mal')
  })

  it('öppnar Stöd & hjälp med länkar till 1177 och Frisk & Fri', async () => {
    renderAt('/installningar')
    fireEvent.click(screen.getByRole('button', { name: /Stöd & hjälp/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: /1177\.se/ })).toHaveAttribute('href', 'https://www.1177.se')
    expect(within(dialog).getByRole('link', { name: /friskfri\.se/ })).toHaveAttribute('href', 'https://www.friskfri.se')
  })

  it('skickar /installningar/om till Om-sidan och okända sektioner till listan', async () => {
    const { unmount } = renderAt('/installningar/om')
    expect(await screen.findByText('Om-sidan')).toBeInTheDocument()
    unmount()
    renderAt('/installningar/finns-inte')
    expect(await screen.findByRole('heading', { level: 1, name: 'Inställningar' })).toBeInTheDocument()
  })
})

describe('SettingsPage – sektioner', () => {
  it('Profil: räknar om och sparar', async () => {
    renderAt('/installningar/profil')
    expect(screen.getByRole('heading', { level: 1, name: 'Profil' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Spara profilen/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Längd/ }), { target: { value: '172' } })
    expect(screen.getByText('Förhandsvisning')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Spara profilen/ }))
    await waitFor(() => expect(useProfileStore.getState().profile?.heightCm).toBe(172))
    expect(useProfileStore.getState().profile?.createdAt).toBe(PROFILE.createdAt)
    expect(lastToast()).toBe('Profilen är sparad')
  })

  it('Profil: ogiltiga värden sparas inte', async () => {
    renderAt('/installningar/profil')
    fireEvent.change(screen.getByRole('spinbutton', { name: /Längd/ }), { target: { value: '50' } })
    fireEvent.click(await screen.findByRole('button', { name: /Spara profilen/ }))
    expect(await screen.findByText(/Ange en längd mellan/)).toBeInTheDocument()
    expect(useProfileStore.getState().profile?.heightCm).toBe(168)
  })

  it('Mål: egen makrofördelning summerar alltid till 100 %', async () => {
    renderAt('/installningar/mal')
    expect(screen.getByText('Så räknas ditt dagsmål')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Egen fördelning/ }))
    const protein = await screen.findByRole('slider', { name: 'Protein' })
    fireEvent.change(protein, { target: { value: '30' } })
    const pct = useProfileStore.getState().profile?.customMacroPct
    expect(useProfileStore.getState().profile?.macroPreset).toBe('anpassad')
    expect(pct?.protein).toBe(30)
    expect((pct?.protein ?? 0) + (pct?.carbs ?? 0) + (pct?.fat ?? 0)).toBe(100)
  })

  it('Mål: egna mål kan sättas och återställas, med kalorigolv', async () => {
    renderAt('/installningar/mal')
    const kcal = screen.getByRole('spinbutton', { name: /Energi per dag/ })
    fireEvent.change(kcal, { target: { value: '900' } })
    fireEvent.blur(kcal)
    // Golvet för kvinnor är 1 200 kcal
    await waitFor(() => expect(useProfileStore.getState().settings.targetOverrides.kcal).toBe(1200))
    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    fireEvent.change(protein, { target: { value: '130' } })
    fireEvent.blur(protein)
    await waitFor(() => expect(useProfileStore.getState().settings.targetOverrides.proteinG).toBe(130))
    fireEvent.click(screen.getByRole('button', { name: /Återställ protein/ }))
    expect(useProfileStore.getState().settings.targetOverrides).toEqual({ kcal: 1200 })
  })

  it('Mål: adaptiv förbrukning visar hur mycket underlag som saknas', async () => {
    renderAt('/installningar/mal')
    fireEvent.click(screen.getByRole('switch', { name: /Räkna förbrukningen ur min vikttrend/ }))
    expect(useProfileStore.getState().settings.adaptiveTargets).toBe(true)
    expect(await screen.findByText(/Samlar underlag/)).toBeInTheDocument()
  })

  it('Måltider: den sista påslagna måltiden går inte att stänga av', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, meals: DEFAULT_MEALS.map((m) => ({ ...m, enabled: m.id === 'middag' })) } }))
    renderAt('/installningar/maltider')
    expect(screen.getByRole('switch', { name: 'Visa Middag i dagboken' })).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Visa Lunch i dagboken' }))
    expect(useProfileStore.getState().settings.meals.find((m) => m.id === 'lunch')?.enabled).toBe(true)
    const name = screen.getByRole('textbox', { name: /Namn på måltiden Fika/ })
    fireEvent.change(name, { target: { value: 'Eftermiddagsfika' } })
    fireEvent.blur(name)
    expect(useProfileStore.getState().settings.meals.find((m) => m.id === 'fika')?.name).toBe('Eftermiddagsfika')
    fireEvent.click(screen.getByRole('button', { name: /Återställ standard/ }))
    expect(useProfileStore.getState().settings.meals).toEqual(DEFAULT_MEALS)
  })

  it('Utseende: tema, energienhet och medvetet läge', () => {
    renderAt('/installningar/utseende')
    fireEvent.click(screen.getByRole('radio', { name: /Mörkt/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Kilojoule (kJ)' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Dölj siffrorna' }))
    const s = useProfileStore.getState().settings
    expect(s.theme).toBe('morkt')
    expect(s.energyUnit).toBe('kJ')
    expect(s.mindfulMode).toBe(true)
  })

  it('Träning och vatten: glasstorlek', () => {
    renderAt('/installningar/traning')
    expect(screen.getByText(/Loggar du ett pass på 300 kcal får du 150 kcal extra/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '3,3 dl' }))
    expect(useProfileStore.getState().settings.waterGlassMl).toBe(330)
  })

  it('Livsmedelsdatabas: visar den inbyggda databasen och källor', async () => {
    renderAt('/installningar/databas')
    expect(await screen.findByText(/kurerade svenska livsmedel/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Hämta från Livsmedelsverket/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open Food Facts/ })).toHaveAttribute('href', 'https://se.openfoodfacts.org/')
  })
})

describe('SettingsPage – data', () => {
  it('importerar en säkerhetskopia genom att slå ihop', async () => {
    useBodyStore.setState({ weights: [{ id: 'w-old', date: '2026-01-01', kg: 80, createdAt: 0 }], measurements: [] })
    const backup = createBackup()
    useBodyStore.setState({ weights: [], measurements: [] })

    const { container } = renderAt('/installningar/data')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([JSON.stringify(backup)], 'lagom.json', { type: 'application/json' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })
    const sheet = await screen.findByRole('dialog', { name: /Importera säkerhetskopia/ })
    expect(within(sheet).getByText('1 vägning')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Slå ihop med min data/ }))
    await waitFor(() => expect(useBodyStore.getState().weights).toHaveLength(1))
    expect(lastToast()).toMatch(/ihopslagen/)
  })

  it('visar ett vänligt fel för fel sorts fil', async () => {
    const { container } = renderAt('/installningar/data')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(['{"hej":1}'], 'x.json')] } })
    })
    await waitFor(() => expect(lastToast()).toBe('Filen är ingen säkerhetskopia från Lagom.'))
  })

  it('raderar all data först efter två bekräftelser', async () => {
    renderAt('/installningar/data')
    fireEvent.click(screen.getByRole('button', { name: 'Radera all data' }))
    const first = await screen.findByRole('alertdialog', { name: 'Radera all data?' })
    fireEvent.click(within(first).getByRole('button', { name: 'Fortsätt' }))
    const second = await screen.findByRole('alertdialog', { name: 'Sista steget' })
    const confirm = within(second).getByRole('button', { name: 'Radera allt' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(second).getByRole('textbox', { name: /Skriv RADERA/ }), { target: { value: 'radera' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(await screen.findByText('Välkomstflödet')).toBeInTheDocument()
    expect(useProfileStore.getState().profile).toBeNull()
    expect(useProfileStore.getState().settings.onboardingDone).toBe(false)
    expect(useBodyStore.getState().weights).toEqual([])
  })
})
