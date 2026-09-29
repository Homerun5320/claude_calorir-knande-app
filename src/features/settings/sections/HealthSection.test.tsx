/**
 * Inställningar → Apple Hälsa / Health Connect med en mockad koppling (src/native/health.ts laddas
 * aldrig här): webben visar bara att funktionen finns i apparna; i apparna väljs datatyper, kopplas,
 * synkas och kopplas från, och saknad behörighet, Health Connect som saknas, provperiod och exempeldata
 * förklaras. Aktiv energi läses inte (behörigheterna hålls till det som används).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { DialogHost, useToastStore } from '../../../components/ui'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import { HealthSection, healthRowText, healthServiceName, healthSyncText, missingText, useHealthRowSubtitle } from './HealthSection'

MotionGlobalConfig.skipAnimations = true

type Choice = 'readWeight' | 'readSteps' | 'writeEnergy' | 'writeWater' | 'writeWeight'

interface FakeSnapshot {
  enabled: boolean
  choices: Record<Choice, boolean>
  since: string | null
  lastSync: number | null
  syncing: boolean
  problem: 'saknas' | 'uppdatera' | 'fel' | 'provperiod' | 'exempel' | null
  missing: Choice[]
  today: { date: string; steps?: number } | null
  lastResult: null
}

const ALL_ON: Record<Choice, boolean> = { readWeight: true, readSteps: true, writeEnergy: true, writeWater: true, writeWeight: true }

/** En låtsaskoppling med samma API som src/native/health.ts. */
function createFakeApi(initial: Partial<FakeSnapshot> = {}) {
  let snap: FakeSnapshot = {
    enabled: false,
    choices: { ...ALL_ON },
    since: null,
    lastSync: null,
    syncing: false,
    problem: null,
    missing: [],
    today: null,
    lastResult: null,
    ...initial,
  }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<FakeSnapshot>) => {
    snap = { ...snap, ...patch }
    listeners.forEach((l) => l())
  }
  return {
    set,
    getHealthSnapshot: () => snap,
    subscribeHealth: (l: () => void) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    checkHealthAvailability: vi.fn(async (): Promise<'ja' | 'uppdatera' | 'saknas'> => 'ja'),
    connectHealth: vi.fn(async (): Promise<{ ok: true; missing: Choice[]; summary: null } | { ok: false; reason: string }> => {
      set({ enabled: true, since: '2026-09-29', lastSync: Date.now() })
      return { ok: true, missing: [], summary: null }
    }),
    setHealthChoice: vi.fn(async (choice: Choice, on: boolean): Promise<{ ok: true } | { ok: false; reason: string }> => {
      set({ choices: { ...snap.choices, [choice]: on } })
      return { ok: true }
    }),
    syncHealth: vi.fn(async () => ({ weights: 2, stepDays: 1, kcal: 0, waterMl: 0, sentWeights: 0 })),
    disconnectHealth: vi.fn(() => set({ enabled: false })),
    requestMissingHealthAccess: vi.fn(async () => ({ ok: true })),
    openHealthSettings: vi.fn(async () => true),
  }
}

const mocks = vi.hoisted(() => ({
  native: true,
  inApp: true,
  platform: 'ios' as 'ios' | 'android',
  api: null as unknown,
  loadNative: vi.fn(),
}))

vi.mock('../../../native', () => ({
  isNative: () => mocks.native,
  nativePlatform: () => (mocks.native ? mocks.platform : 'web'),
  loadNative: mocks.loadNative,
}))
vi.mock('../../../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/platform')>()),
  isInApp: () => mocks.inApp,
}))

let api: ReturnType<typeof createFakeApi>

function setup(initial: Partial<FakeSnapshot> = {}) {
  api = createFakeApi(initial)
  mocks.api = api
  return render(
    <MemoryRouter>
      <HealthSection />
      <DialogHost />
    </MemoryRouter>,
  )
}

const toasts = () => useToastStore.getState().toasts.map((t) => t.message)

beforeAll(async () => {
  await waitFor(() => expect(useProfileStore.persist.hasHydrated()).toBe(true))
})

beforeEach(() => {
  mocks.native = true
  mocks.inApp = true
  mocks.platform = 'ios'
  mocks.loadNative.mockImplementation(async (name: string) => (name === 'health' ? mocks.api : null))
  useToastStore.setState({ toasts: [] })
  useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  mocks.loadNative.mockReset()
})

describe('texter', () => {
  it('namnet följer plattformen', () => {
    expect(healthServiceName('ios')).toBe('Apple Hälsa')
    expect(healthServiceName('android')).toBe('Health Connect')
    expect(healthServiceName('web')).toBe('Apple Hälsa och Health Connect')
  })

  it('notisen efter en synk räknar – aldrig kalorier eller vikter', () => {
    expect(healthSyncText({ weights: 0, stepDays: 0, kcal: 0, waterMl: 0, sentWeights: 0 })).toBe('Synkat – allt var redan uppdaterat')
    expect(healthSyncText({ weights: 1, stepDays: 3, kcal: 420, waterMl: 0, sentWeights: 0 })).toBe(
      'Synkat: 1 ny vikt, 3 dagar med steg och det senaste från dagboken',
    )
  })

  it('saknad behörighet i klartext', () => {
    expect(missingText(['readWeight', 'readSteps', 'writeWater'])).toBe('Lagom får inte läsa vikt eller steg och inte skriva vatten.')
    expect(missingText(['writeEnergy'])).toBe('Lagom får inte skriva energi.')
  })

  it('raden i inställningslistan', () => {
    const today = '2026-09-29'
    expect(healthRowText({ enabled: false, lastSync: null }, today)).toBe('Av')
    expect(healthRowText({ enabled: true, lastSync: null }, today)).toBe('På')
    expect(healthRowText({ enabled: true, lastSync: new Date(2026, 8, 29, 9).getTime() }, today)).toBe('På · synkad idag')
  })
})

describe('på webben', () => {
  it('visar att kopplingen finns i apparna – laddar ingen native-kod', () => {
    mocks.native = false
    mocks.inApp = false
    setup()
    expect(screen.getByRole('heading', { name: 'Apple Hälsa och Health Connect finns i apparna' })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(mocks.loadNative).not.toHaveBeenCalled()
  })
})

describe('i iPhone-appen', () => {
  it('inte kopplad: förklarar, visar valen per datatyp och kopplar', async () => {
    setup()
    expect(await screen.findByText(/Helt frivilligt och avstängt från början/)).toBeInTheDocument()
    expect(screen.getByText(/ingenting skickas till oss eller någon annan/)).toBeInTheDocument()
    expect(mocks.loadNative).toHaveBeenCalledWith('health')

    // Fem val, ett per datatyp och riktning – aktiv energi läses inte.
    for (const name of ['Vikt', 'Steg', 'Energi från måltider', 'Vatten', 'Vikt från Lagom']) {
      expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true')
    }
    expect(screen.getAllByRole('switch')).toHaveLength(5)
    expect(screen.queryByRole('switch', { name: 'Aktiv energi' })).not.toBeInTheDocument()
    expect(screen.getByText(/Mat och vatten skickas dagen efter, när dagen är avslutad/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Läs mer i integritetspolicyn' })).toHaveAttribute('href', '/integritet')
    expect(screen.getByText(/profilbild uppe till höger och välj Appar → Lagom/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Öppna Health Connect' })).not.toBeInTheDocument()

    // Ett val bort före kopplingen – sparas men frågar inte om lov.
    fireEvent.click(screen.getByRole('switch', { name: 'Vikt från Lagom' }))
    await waitFor(() => expect(api.setHealthChoice).toHaveBeenCalledWith('writeWeight', false))

    fireEvent.click(screen.getByRole('button', { name: 'Koppla till Apple Hälsa' }))
    await waitFor(() => expect(api.connectHealth).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('heading', { name: 'Kopplad till Apple Hälsa' })).toBeInTheDocument()
    expect(screen.getByText(/Senast synkad idag kl\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Koppla till Apple Hälsa' })).not.toBeInTheDocument()
    expect(toasts()).toContain('Kopplat till Apple Hälsa')
  })

  it('utan något valt går det inte att koppla', async () => {
    setup({ choices: { readWeight: false, readSteps: false, writeEnergy: false, writeWater: false, writeWeight: false } })
    expect(await screen.findByRole('button', { name: 'Koppla till Apple Hälsa' })).toBeDisabled()
    expect(screen.getByText('Välj minst en sak att hämta eller skicka.')).toBeInTheDocument()
  })

  it('allt nekat: förklarar var man ändrar sig', async () => {
    setup()
    api.connectHealth.mockResolvedValueOnce({ ok: false, reason: 'nekad' })
    fireEvent.click(await screen.findByRole('button', { name: 'Koppla till Apple Hälsa' }))
    expect(await screen.findByText(/Lagom fick inte lov att läsa eller skriva något/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Koppla till Apple Hälsa' })).toBeInTheDocument()
  })

  it('kopplad: dagens steg, synka nu och koppla från', async () => {
    setup({ enabled: true, lastSync: Date.now(), today: { date: '2026-09-29', steps: 8432 } })
    expect(await screen.findByRole('heading', { name: 'Kopplad till Apple Hälsa' })).toBeInTheDocument()
    // Tusentalsavgränsaren är ett fast mellanslag, som testing-library gör om till ett vanligt.
    expect(screen.getByText('8 432')).toBeInTheDocument()
    expect(screen.getByText('Steg idag')).toBeInTheDocument()
    expect(screen.queryByText(/Aktiv energi/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Synka nu' }))
    await waitFor(() => expect(toasts()).toContain('Synkat: 2 nya vikter och 1 dag med steg'))

    fireEvent.click(screen.getByRole('button', { name: 'Koppla från' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Koppla från Apple Hälsa?' })
    expect(within(dialog).getByText(/Det som redan har hämtats finns kvar i Lagom/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Koppla från' }))
    await waitFor(() => expect(api.disconnectHealth).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: 'Koppla till Apple Hälsa' })).toBeInTheDocument()
  })

  it('medvetet läge: stegen visas, inga kalorier', async () => {
    useProfileStore.setState({ settings: { ...DEFAULT_SETTINGS, onboardingDone: true, mindfulMode: true } })
    setup({ enabled: true, today: { date: '2026-09-29', steps: 5000 } })
    expect(await screen.findByText('Steg idag')).toBeInTheDocument()
    expect(screen.queryByText(/kcal/)).not.toBeInTheDocument()
  })

  it('saknad skrivbehörighet: vägen till Hälsa-appen, ingen "Ge lov"-knapp', async () => {
    setup({ enabled: true, missing: ['writeWater'] })
    expect(await screen.findByText('Lagom får inte skriva vatten.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ge lov' })).not.toBeInTheDocument()
  })

  it('provperiod, exempeldata och fel förklaras', async () => {
    setup({ enabled: true, problem: 'provperiod' })
    expect(await screen.findByText(/Nya vikter hämtas bara under provperioden eller med en licens/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Till Licens' })).toHaveAttribute('href', '/installningar/licens')
    act(() => api.set({ problem: 'exempel' }))
    expect(await screen.findByText(/Exempeldata synkas inte/)).toBeInTheDocument()
    act(() => api.set({ problem: 'fel' }))
    expect(await screen.findByText(/Senaste synken gick inte hela vägen/)).toBeInTheDocument()
  })

  it('kopplingen gick inte att ladda', async () => {
    setup()
    mocks.loadNative.mockResolvedValueOnce(null)
    const { unmount } = render(
      <MemoryRouter>
        <HealthSection />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/Kopplingen gick inte att starta just nu/)).toBeInTheDocument()
    unmount()
  })
})

describe('i Android-appen', () => {
  beforeEach(() => {
    mocks.platform = 'android'
  })

  it('Health Connect saknas: länk till Google Play och ingen koppling', async () => {
    api = createFakeApi()
    api.checkHealthAvailability.mockResolvedValue('uppdatera')
    mocks.api = api
    render(
      <MemoryRouter>
        <HealthSection />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Health Connect behöver installeras eller uppdateras')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Health Connect i Google Play/ })
    expect(link).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('button', { name: 'Koppla till Health Connect' })).toBeDisabled()
  })

  it('saknad behörighet: "Ge lov" frågar igen, "Öppna Health Connect" öppnar inställningarna', async () => {
    setup({ enabled: true, missing: ['readSteps'] })
    expect(await screen.findByRole('heading', { name: 'Kopplad till Health Connect' })).toBeInTheDocument()
    expect(screen.getByText('Lagom får inte läsa steg.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ge lov' }))
    await waitFor(() => expect(api.requestMissingHealthAccess).toHaveBeenCalledTimes(1))
    const open = screen.getAllByRole('button', { name: 'Öppna Health Connect' })
    expect(open).toHaveLength(2)
    fireEvent.click(open[1])
    await waitFor(() => expect(api.openHealthSettings).toHaveBeenCalledTimes(1))
  })

  it('ett val påslaget medan kopplingen är på frågar om lov', async () => {
    setup({ enabled: true, choices: { ...ALL_ON, readSteps: false } })
    fireEvent.click(await screen.findByRole('switch', { name: 'Steg' }))
    await waitFor(() => expect(api.setHealthChoice).toHaveBeenCalledWith('readSteps', true))
    expect(screen.getByRole('switch', { name: 'Steg' })).toHaveAttribute('aria-checked', 'true')
  })

  it('ett fel när lov frågas visas som en notis', async () => {
    setup({ enabled: true, choices: { ...ALL_ON, readSteps: false } })
    api.setHealthChoice.mockResolvedValueOnce({ ok: false, reason: 'fel' })
    fireEvent.click(await screen.findByRole('switch', { name: 'Steg' }))
    await waitFor(() => expect(toasts()).toContain('Det gick inte att fråga om lov just nu – försök igen om en stund'))
  })
})

describe('useHealthRowSubtitle', () => {
  function Row() {
    return <p>{useHealthRowSubtitle()}</p>
  }

  it('följer kopplingen i appen', async () => {
    api = createFakeApi({ enabled: true, lastSync: null })
    mocks.api = api
    render(<Row />)
    expect(await screen.findByText('På')).toBeInTheDocument()
    act(() => api.set({ enabled: false }))
    expect(screen.getByText('Av')).toBeInTheDocument()
  })

  it('på webben: finns i apparna', () => {
    mocks.native = false
    render(<Row />)
    expect(screen.getByText('Finns i apparna för iPhone och Android')).toBeInTheDocument()
    expect(mocks.loadNative).not.toHaveBeenCalled()
  })
})
