/**
 * Framstegsbilder i gränssnittet: av som standard, slås på från "Vikt & mått", döljs i medvetet
 * läge, exempeldata visar inga bilder, requireAccess före en ny bild, lägga till (mockad canvas),
 * jämföra, radera en (med Ångra) eller alla, och objekt-URL:er som släpps.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import BodyPage from './BodyPage'
import ProgressPhotosPage, { timeBetween } from './ProgressPhotosPage'
import { useToastStore } from '../../components/ui'
import { addDays, todayISO } from '../../lib/dates'
import { clearDemoFlag, setDemoFlag } from '../../lib/demoFlag'
import { addProgressPhoto, deleteAllProgressPhotos, listProgressPhotos, type PreparedPhoto } from '../../lib/progressPhotos'
import { useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../stores/profileStore'
import { useAccessGateStore } from '../premium/requireAccess'
import type { Profile, Settings } from '../../types'

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(async (_options: unknown) => true),
}))

vi.mock('../../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../components/ui')>()),
  confirmDialog: mocks.confirm,
}))

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

function setSettings(patch: Partial<Settings>) {
  useProfileStore.setState({ profile: PROFILE, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, ...patch } })
}

function renderPage(page = <ProgressPhotosPage />) {
  return render(<MemoryRouter>{page}</MemoryRouter>)
}

const photo = (fill = 1): PreparedPhoto => ({
  full: new Blob([new Uint8Array([fill, 2, 3])], { type: 'image/jpeg' }),
  thumb: new Blob([new Uint8Array([fill])], { type: 'image/jpeg' }),
  width: 1200,
  height: 1600,
})

let urlCount = 0
const created: string[] = []
const revoked: string[] = []
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeAll(async () => {
  await waitFor(() => expect(STORES.every((s) => s.persist.hasHydrated())).toBe(true))
  URL.createObjectURL = vi.fn(() => {
    const url = `blob:test/${++urlCount}`
    created.push(url)
    return url
  })
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url)
  })
})

afterAll(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

beforeEach(async () => {
  await deleteAllProgressPhotos()
  clearDemoFlag()
  created.length = 0
  revoked.length = 0
  mocks.confirm.mockClear()
  useToastStore.setState({ toasts: [] })
  useAccessGateStore.setState({ blocked: null })
  useBodyStore.getState().clearBody()
  setSettings({})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const lastToast = () => useToastStore.getState().toasts.at(-1)

describe('kortet på Vikt & mått', () => {
  it('är av som standard, slås på med en lugn förklaring och visar inga bilder', async () => {
    renderPage(<BodyPage />)
    const card = (await screen.findByRole('heading', { name: 'Framstegsbilder' })).closest('section') as HTMLElement
    expect(within(card).getByText(/följer inte med i säkerhetskopian/)).toBeInTheDocument()
    expect(within(card).getByText(/Bilderna sparas bara i den här webbläsaren/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /1177/ })).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Frisk & Fri/ })).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: 'Slå på framstegsbilder' }))
    expect(useProfileStore.getState().settings.progressPhotos).toBe(true)
    const link = await within(card).findByRole('link', { name: /Lägg till en bild/ })
    expect(link).toHaveAttribute('href', '/vikt/bilder')
    expect(await within(card).findByText(/Inga bilder ännu/)).toBeInTheDocument()
    expect(within(card).queryByRole('img')).not.toBeInTheDocument()
  })

  it('visar antalet bilder men aldrig själva bilderna', async () => {
    await addProgressPhoto(photo(), todayISO())
    setSettings({ progressPhotos: true })
    renderPage(<BodyPage />)
    const card = (await screen.findByRole('heading', { name: 'Framstegsbilder' })).closest('section') as HTMLElement
    expect(await within(card).findByText(/^1 bild, den senaste från/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Visa och jämför/ })).toBeInTheDocument()
    expect(within(card).queryByRole('img')).not.toBeInTheDocument()
  })

  it('döljs helt i medvetet läge', async () => {
    setSettings({ progressPhotos: true, mindfulMode: true })
    renderPage(<BodyPage />)
    expect(await screen.findByText('Varför trendvikt?')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Framstegsbilder' })).not.toBeInTheDocument()
  })
})

describe('sidan med bilderna', () => {
  it('visar förklaringen när funktionen är av', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Så fungerar det' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Välj en bild/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Slå på framstegsbilder' }))
    expect(await screen.findByRole('button', { name: /Välj en bild/ })).toBeInTheDocument()
    expect(await screen.findByText('Inga bilder ännu')).toBeInTheDocument()
    expect(screen.getByText(/Säkerhetskopian under Inställningar → Data innehåller inte bilderna/)).toBeInTheDocument()
  })

  it('lägger till en bild: requireAccess, nedskalning, datum och sparande', async () => {
    setSettings({ progressPhotos: true })
    const ctx = { fillRect: vi.fn(), drawImage: vi.fn() }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as unknown as HTMLCanvasElement['getContext'])
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
      cb(new Blob([new Uint8Array([this.width % 256])], { type }))
    })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 4000, close: vi.fn() })))
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

    const { container } = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Välj en bild/ }))
    expect(click).toHaveBeenCalledTimes(1)

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toHaveAttribute('accept', 'image/*')
    const file = new File([new Uint8Array(20)], 'bild.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } })
    })

    const dialog = await screen.findByRole('dialog', { name: 'Spara bilden' })
    expect(within(dialog).getByText(/Platsuppgifter och annan information i bildfilen tas bort/)).toBeInTheDocument()
    const date = within(dialog).getByLabelText(/Datum/) as HTMLInputElement
    expect(date.value).toBe(todayISO())
    fireEvent.change(date, { target: { value: addDays(todayISO(), -3) } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Spara bilden' }))

    await waitFor(() => expect(lastToast()?.message).toBe('Bilden är sparad'))
    const saved = await listProgressPhotos()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ date: addDays(todayISO(), -3), width: 1200, height: 1600 })
    expect(await screen.findByRole('button', { name: /Visa bilden från/ })).toBeInTheDocument()
  })

  it('på pekskärmar finns både kameran och bildbiblioteket', async () => {
    setSettings({ progressPhotos: true })
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query === '(pointer: coarse)', media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    )
    const clicked: string[] = []
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      clicked.push(this.hasAttribute('capture') ? 'kamera' : 'bibliotek')
    })
    const { container } = renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Ta en bild' }))
    fireEvent.click(screen.getByRole('button', { name: 'Välj en bild' }))
    expect(clicked).toEqual(['kamera', 'bibliotek'])
    const inputs = container.querySelectorAll('input[type="file"]')
    expect(inputs).toHaveLength(2)
    inputs.forEach((input) => expect(input).toHaveAttribute('accept', 'image/*'))
  })

  it('en bild som inte går att läsa ger ett vänligt fel', async () => {
    setSettings({ progressPhotos: true })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('HEIC')
      }),
    )
    class BrokenImage {
      onerror: (() => void) | null = null
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    const { container } = renderPage()
    await screen.findByRole('button', { name: /Välj en bild/ })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([new Uint8Array(4)], 'bild.heic', { type: 'image/heic' })] } })
    })
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', message: expect.stringMatching(/gick inte att läsa/) }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exempeldata visar inga bilder och spärrar nya', async () => {
    await addProgressPhoto(photo(), todayISO())
    setDemoFlag()
    setSettings({ progressPhotos: true })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    renderPage()
    expect(await screen.findByText(/Exempeldata visar inga bilder/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Visa bilden från/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Välj en bild/ }))
    expect(click).not.toHaveBeenCalled()
    expect(useAccessGateStore.getState().blocked).toMatchObject({ demo: true })
  })

  it('jämför två bilder sida vid sida och raderar en med Ångra', async () => {
    const today = todayISO()
    const older = await addProgressPhoto(photo(1), addDays(today, -49))
    const newer = await addProgressPhoto(photo(2), today)
    setSettings({ progressPhotos: true })
    renderPage()

    const compare = (await screen.findByRole('heading', { name: 'Jämför' })).closest('section') as HTMLElement
    expect((within(compare).getByLabelText('Från') as HTMLSelectElement).value).toBe(older!.id)
    expect((within(compare).getByLabelText('Till') as HTMLSelectElement).value).toBe(newer!.id)
    expect(within(compare).getByText('7 veckor emellan')).toBeInTheDocument()
    await waitFor(() => expect(within(compare).getAllByRole('img', { name: /Framstegsbild från/ })).toHaveLength(2))

    const thumbs = screen.getAllByRole('button', { name: /Visa bilden från/ })
    expect(thumbs).toHaveLength(2)
    fireEvent.click(thumbs[0]) // den nyaste
    const viewer = await screen.findByRole('dialog')
    expect(await within(viewer).findByRole('img', { name: /Framstegsbild från/ })).toBeInTheDocument()
    // Ingen delning ut ur appen.
    expect(within(viewer).queryByRole('button', { name: /Dela/ })).not.toBeInTheDocument()
    fireEvent.click(within(viewer).getByRole('button', { name: 'Radera bilden' }))

    await waitFor(() => expect(lastToast()?.message).toBe('Bilden är raderad'))
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Radera bilden?', tone: 'danger' }))
    expect((await listProgressPhotos()).map((p) => p.id)).toEqual([older!.id])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Visa bilden från/ })).toHaveLength(1))
    expect(screen.queryByRole('heading', { name: 'Jämför' })).not.toBeInTheDocument()

    await act(async () => {
      lastToast()?.action?.onClick()
    })
    await waitFor(async () => expect((await listProgressPhotos()).map((p) => p.id)).toEqual([newer!.id, older!.id]))
    expect(await screen.findByRole('heading', { name: 'Jämför' })).toBeInTheDocument()
  })

  it('raderar alla bilder efter en bekräftelse', async () => {
    await addProgressPhoto(photo(1), addDays(todayISO(), -10))
    await addProgressPhoto(photo(2), todayISO())
    setSettings({ progressPhotos: true })
    renderPage()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Visa bilden från/ })).toHaveLength(2))
    fireEvent.click(screen.getByRole('button', { name: 'Radera alla bilder' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Alla bilder är raderade'))
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Radera alla bilder?', tone: 'danger' }))
    expect(await listProgressPhotos()).toEqual([])
    expect(await screen.findByText('Inga bilder ännu')).toBeInTheDocument()
  })

  it('vid lågt BMI erbjuds inga nya bilder – de som finns går att titta på och radera', async () => {
    await addProgressPhoto(photo(), todayISO())
    useProfileStore.setState({
      profile: { ...PROFILE, goal: 'behalla', heightCm: 175, startWeightKg: 50 },
      settings: { ...DEFAULT_SETTINGS, onboardingDone: true, progressPhotos: true },
    })
    renderPage()
    expect(await screen.findByText(/Just nu lägger Lagom inte till framstegsbilder – fokusera gärna på hur du mår/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1177/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Frisk & Fri/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Välj en bild/ })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Visa bilden från/ })).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Radera alla bilder' })).toBeInTheDocument()
  })

  it('vid lågt BMI erbjuds inte att slå på bilderna', async () => {
    useProfileStore.setState({ profile: { ...PROFILE, heightCm: 175, startWeightKg: 50 }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
    renderPage(<BodyPage />)
    const card = (await screen.findByRole('heading', { name: 'Framstegsbilder' })).closest('section') as HTMLElement
    expect(within(card).queryByRole('button', { name: 'Slå på framstegsbilder' })).not.toBeInTheDocument()
    expect(within(card).getByText(/Just nu lägger Lagom inte till framstegsbilder/)).toBeInTheDocument()
  })

  it('medvetet läge visar inga bilder men låter dig radera dem', async () => {
    await addProgressPhoto(photo(), todayISO())
    setSettings({ progressPhotos: true, mindfulMode: true })
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Bilderna vilar i medvetet läge' })).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Välj en bild/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Radera alla bilder' })).toBeInTheDocument()
  })

  it('att stänga av behåller bilderna tills man raderar dem', async () => {
    await addProgressPhoto(photo(), todayISO())
    setSettings({ progressPhotos: true })
    renderPage()
    await screen.findByRole('button', { name: /Visa bilden från/ })
    fireEvent.click(screen.getByRole('button', { name: 'Stäng av framstegsbilder' }))
    expect(useProfileStore.getState().settings.progressPhotos).toBe(false)
    expect(lastToast()?.message).toMatch(/Bilderna finns kvar tills du raderar dem/)
    expect(await screen.findByText(/Det finns 1 sparad bild i den här webbläsaren/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Visa bilden från/ })).not.toBeInTheDocument()
  })

  it('släpper objekt-URL:erna när bilderna inte längre visas', async () => {
    await addProgressPhoto(photo(1), addDays(todayISO(), -20))
    await addProgressPhoto(photo(2), todayISO())
    setSettings({ progressPhotos: true })
    const { unmount } = renderPage()
    await waitFor(() => expect(screen.getAllByRole('img', { name: /Framstegsbild från/ })).toHaveLength(2))
    await waitFor(() => expect(document.querySelectorAll('img[src^="blob:"]')).toHaveLength(4))
    expect(created.length).toBeGreaterThanOrEqual(4)
    unmount()
    expect([...revoked].sort()).toEqual([...created].sort())
  })
})

it('tiden mellan två bilder', () => {
  expect(timeBetween('2026-09-01', '2026-09-01')).toBe('Samma dag')
  expect(timeBetween('2026-09-01', '2026-09-02')).toBe('1 dag emellan')
  expect(timeBetween('2026-09-10', '2026-09-01')).toBe('9 dagar emellan')
  expect(timeBetween('2026-08-01', '2026-09-19')).toBe('7 veckor emellan')
})
