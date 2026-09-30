/**
 * Röktester för Inställningar: index, varje sektion, sparande av profil, egna mål och
 * makron, måltider, utseende, import av säkerhetskopia och radering av all data.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
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

// Dataroutern behövs för useBlocker (Profil frågar innan osparade ändringar går förlorade).
function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/installningar', element: <SettingsPage /> },
      { path: '/installningar/:section', element: <SettingsPage /> },
      { path: '/om', element: <p>Om-sidan</p> },
      { path: '/valkommen', element: <p>Välkomstflödet</p> },
    ],
    { initialEntries: [path] },
  )
  const result = render(
    <>
      <RouterProvider router={router} />
      <DialogHost />
    </>,
  )
  return { ...result, router }
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

  it('har en rad för allergier och säger till när veckobudgeten är på', async () => {
    const { unmount } = renderAt('/installningar')
    const allergies = screen.getByRole('link', { name: /Allergier och överkänslighet/ })
    expect(allergies).toHaveAttribute('href', '/installningar/allergier')
    expect(within(allergies).getByText('Inga valda')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mål och makron/ }).textContent).not.toMatch(/veckobudget/)
    unmount()

    useProfileStore.setState((s) => ({
      settings: { ...s.settings, allergens: ['mjolk', 'notter'], weeklyBudget: { enabled: true, shift: [-50, -50, -50, -50, 300, -50, -50] } },
    }))
    const again = renderAt('/installningar')
    expect(within(screen.getByRole('link', { name: /Allergier och överkänslighet/ })).getByText('Mjölk och nötter')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mål och makron/ }).textContent).toMatch(/per dag i snitt · veckobudget/)
    again.unmount()

    renderAt('/installningar/allergier')
    expect(await screen.findByRole('heading', { level: 1, name: 'Allergier och överkänslighet' })).toBeInTheDocument()
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

  it('länkar till integritetspolicyn och villkoren', () => {
    renderAt('/installningar')
    expect(screen.getByRole('link', { name: /^Integritetspolicy/ })).toHaveAttribute('href', '/integritet')
    expect(screen.getByRole('link', { name: /^Köp- och användarvillkor/ })).toHaveAttribute('href', '/villkor')
    expect(screen.getByText(/Sökningar och streckkoder skickas till Open Food Facts/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritet')
  })

  it('Påminnelser och Apple Hälsa/Health Connect finns bara i apparna', async () => {
    const index = renderAt('/installningar')
    expect(screen.queryByRole('link', { name: /Påminnelser/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Apple Hälsa|Health Connect/ })).not.toBeInTheDocument()
    index.unmount()
    for (const section of ['paminnelser', 'halsa']) {
      const { unmount } = renderAt(`/installningar/${section}`)
      expect(await screen.findByRole('heading', { level: 1, name: 'Inställningar' })).toBeInTheDocument()
      unmount()
    }
  })

  it('Lagom Moln syns inte när det är avstängt (ingen VITE_SUPABASE_URL)', async () => {
    renderAt('/installningar')
    expect(screen.queryByRole('link', { name: /Lagom Moln/ })).not.toBeInTheDocument()
    renderAt('/installningar/moln')
    expect(await screen.findAllByRole('heading', { level: 1, name: 'Inställningar' })).not.toHaveLength(0)
    expect(screen.queryByRole('heading', { level: 1, name: 'Lagom Moln' })).not.toBeInTheDocument()
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

  it('Profil: frågar innan osparade ändringar går förlorade', async () => {
    const { router } = renderAt('/installningar/profil')
    fireEvent.click(screen.getByRole('radio', { name: 'Gravid' }))
    fireEvent.click(screen.getByRole('button', { name: 'Till inställningar' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Lämna utan att spara?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fortsätt redigera' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/installningar/profil')
    expect(useProfileStore.getState().profile?.lifeStage).toBe('ingen')

    fireEvent.click(screen.getByRole('button', { name: 'Till inställningar' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Lämna' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/installningar'))
    expect(useProfileStore.getState().profile?.lifeStage).toBe('ingen')
  })

  it('Profil: lämnar utan fråga när inget är ändrat eller allt är sparat', async () => {
    const { router } = renderAt('/installningar/profil')
    fireEvent.change(screen.getByRole('spinbutton', { name: /Längd/ }), { target: { value: '172' } })
    fireEvent.click(await screen.findByRole('button', { name: /Spara profilen/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Till inställningar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/installningar'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('Profil: ett för lågt eget energimål höjs vid graviditet', async () => {
    useProfileStore.setState((s) => ({ profile: { ...PROFILE, goal: 'behalla' }, settings: { ...s.settings, targetOverrides: { kcal: 1200, proteinG: 90 } } }))
    renderAt('/installningar/profil')
    fireEvent.click(screen.getByRole('radio', { name: 'Gravid' }))
    expect(await screen.findByText(/höjs när du sparar/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Spara profilen/ }))
    await waitFor(() => expect(useProfileStore.getState().profile?.lifeStage).toBe('gravid'))
    const { kcal, proteinG } = useProfileStore.getState().settings.targetOverrides
    // Förbrukning + 300 kcal – aldrig ett underskott under graviditeten.
    expect(kcal).toBeGreaterThan(2000)
    expect(proteinG).toBe(90)
    expect(lastToast()).toMatch(/Ditt eget energimål är höjt till/)
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
    // Förbrukningen ≈ 2 246 kcal och högst 1 % av 74 kg i veckan (≈ 814 kcal/dag) → golvet 1 430 kcal
    // (över säkerhetsgolvet 1 200 kcal för kvinnor).
    await waitFor(() => expect(useProfileStore.getState().settings.targetOverrides.kcal).toBe(1430))
    expect(screen.getAllByText(/Lägst 1\s430 kcal – så att du går ner högst 1 % av din vikt i veckan/).length).toBeGreaterThan(0)
    expect(lastToast()).toMatch(/Energimålet är höjt till 1\s430 kcal/)
    const protein = screen.getByRole('spinbutton', { name: /^Protein/ })
    fireEvent.change(protein, { target: { value: '130' } })
    fireEvent.blur(protein)
    await waitFor(() => expect(useProfileStore.getState().settings.targetOverrides.proteinG).toBe(130))
    fireEvent.click(screen.getByRole('button', { name: /Återställ protein/ }))
    expect(useProfileStore.getState().settings.targetOverrides).toEqual({ kcal: 1430 })
  })

  it('Mål: vid graviditet går energimålet inte att sätta under förbrukningen', async () => {
    useProfileStore.setState((s) => ({ profile: { ...PROFILE, goal: 'behalla', lifeStage: 'gravid' }, settings: { ...s.settings, targetOverrides: { kcal: 1200 } } }))
    renderAt('/installningar/mal')
    // Ett gammalt för lågt mål visas med en knapp för att höja det.
    expect(screen.getByText(/lägre än vad Lagom rekommenderar/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Höj till/ }))
    const raised = useProfileStore.getState().settings.targetOverrides.kcal ?? 0
    expect(raised).toBeGreaterThan(2000)
    expect(screen.queryByText(/lägre än vad Lagom rekommenderar/)).not.toBeInTheDocument()

    const kcal = screen.getByRole('spinbutton', { name: /Energi per dag/ })
    fireEvent.change(kcal, { target: { value: '1300' } })
    fireEvent.blur(kcal)
    await waitFor(() => expect(useProfileStore.getState().settings.targetOverrides.kcal).toBe(raised))
    expect(screen.getAllByText(/under graviditeten rekommenderas ingen viktnedgång/).length).toBeGreaterThan(0)
  })

  it('Mål: med eget protein får kolhydraterna resten av energin – platshållaren visar samma tal', () => {
    // 1 800 kcal, 120 g protein (480 kcal) och NNR:s fett 64 g (576 kcal) → (1 800 − 480 − 576) / 4 = 186 g kolhydrater.
    useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal: 1800, proteinG: 120 } } }))
    renderAt('/installningar/mal')
    expect(screen.queryByText(/Makromålen motsvarar tillsammans/)).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /^Kolhydrater/ })).toHaveAttribute('placeholder', '186')
  })

  it('Mål: säger till när egna makromål inte går ihop med energimålet', () => {
    // Egna kolhydrater: 480 + 900 + 576 = 1 956 kcal mot 1 800 kcal.
    useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal: 1800, proteinG: 120, carbsG: 225 } } }))
    renderAt('/installningar/mal')
    const note = screen.getByText(/Makromålen motsvarar tillsammans/)
    expect(note).toHaveTextContent(/mer än dagsmålet på 1\s800 kcal/)
    expect(note).toHaveTextContent(/Lämna gärna kolhydraterna tomma/)
  })

  it('Mål: ett för lågt eget energimål (t.ex. från en säkerhetskopia) används aldrig', () => {
    useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal: 900 } } }))
    renderAt('/installningar/mal')
    // Golvet följer samma regler som dagsmålet: högst 1 % av vikten i veckan (här 1 430 kcal).
    expect(screen.getByText(/lägre än vad Lagom rekommenderar för dig nu, så dagsmålet är/)).toHaveTextContent(/1\s430 kcal tills vidare/)
  })

  it('Mål: säkerhetsgolvet 1 200 kcal gäller när underskottstaket ligger lägre', () => {
    // 60 år, 155 cm, 52 kg, stillasittande: förbrukning ≈ 1 330 kcal – taket ligger under 1 200 kcal.
    useProfileStore.setState((s) => ({
      profile: { ...PROFILE, birthYear: 1966, heightCm: 155, activityLevel: 'stillasittande', targetWeightKg: 50 },
      settings: { ...s.settings, targetOverrides: { kcal: 900 } },
    }))
    useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 52, createdAt: 0 }], measurements: [] })
    renderAt('/installningar/mal')
    const note = screen.getByText(/lägre än vad Lagom rekommenderar för dig nu, så dagsmålet är/)
    expect(note).toHaveTextContent(/1\s200 kcal tills vidare/)
    expect(note).toHaveTextContent(/tillräckligt med näring/)
  })

  it('Mål: adaptiv förbrukning går inte att slå på under graviditet', () => {
    useProfileStore.setState((s) => ({ profile: { ...PROFILE, goal: 'behalla', lifeStage: 'gravid' }, settings: { ...s.settings, adaptiveTargets: true } }))
    renderAt('/installningar/mal')
    const sw = screen.getByRole('switch', { name: /Räkna förbrukningen ur min vikttrend/ })
    expect(sw).toBeDisabled()
    expect(sw).not.toBeChecked()
    expect(screen.getByText(/Under graviditeten ändras vikten av naturliga skäl/)).toBeInTheDocument()
  })

  it('Mål: nådd målvikt ger mål att behålla vikten – med samma besked som Idag och Vikt', () => {
    useBodyStore.setState({ weights: [{ id: 'w1', date: todayISO(), kg: 67.5, createdAt: 0 }], measurements: [] })
    renderAt('/installningar/mal')
    expect(screen.getByText(/Du har nått din målvikt\. Dagsmålet räknas nu för att behålla vikten/)).toBeInTheDocument()
    expect(screen.getByText('Du behåller vikten')).toBeInTheDocument()
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

  it('Måltider: ett tömt namn får tillbaka standardnamnet', () => {
    renderAt('/installningar/maltider')
    const name = screen.getByRole('textbox', { name: /Namn på måltiden Lunch/ })
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.blur(name)
    expect(name).toHaveValue('Lunch')
    expect(useProfileStore.getState().settings.meals.find((m) => m.id === 'lunch')?.name).toBe('Lunch')
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
    fireEvent.click(screen.getByRole('radio', { name: '3,3\u00a0dl' }))
    expect(useProfileStore.getState().settings.waterGlassMl).toBe(330)
  })

  it('Livsmedelsdatabas: visar den inbyggda databasen och källor', async () => {
    renderAt('/installningar/databas')
    expect(await screen.findByText(/granskade svenska livsmedel/, {}, { timeout: 5000 })).toBeInTheDocument()
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

  it('en skadad säkerhetskopia: skadade delar hoppas över, resten slås ihop och datumet är "okänt datum"', async () => {
    const before = {
      weights: useBodyStore.getState().weights,
      profile: useProfileStore.getState().profile,
    }
    const broken = {
      format: 'lagom-backup',
      version: 1,
      exportedAt: 'igår',
      data: {
        profile: { profile: null, settings: {} },
        diary: { entries: { '2026-09-01': [{ id: 'x1', kind: 'quick', meal: 'lunch', date: '2026-09-01', name: 'Soppa', nutrients: { kcal: 300 } }] } },
        food: {},
        // Fel form – vikterna som ett objekt i stället för en lista. Avsnittet läses in tomt.
        body: { weights: { date: '2026-09-01', kg: 70 } },
      },
    }
    const { container } = renderAt('/installningar/data')
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([JSON.stringify(broken)], 'trasig.json')] } })
    })
    const sheet = await screen.findByRole('dialog', { name: /Importera säkerhetskopia/ })
    expect(within(sheet).getByText('trasig.json · skapad okänt datum')).toBeInTheDocument()
    expect(within(sheet).getByText(/En del av filen är skadad och hoppas över: .*fel format/)).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: /Slå ihop med min data/ }))
    await waitFor(() => expect(lastToast()).toMatch(/ihopslagen/))
    expect(useDiaryStore.getState().entries['2026-09-01']?.map((e) => e.id)).toEqual(['x1'])
    expect(useBodyStore.getState().weights).toEqual(before.weights)
    expect(useProfileStore.getState().profile).toBe(before.profile)
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
