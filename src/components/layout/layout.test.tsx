/**
 * Tester för appens ram: navigeringens markering, sidtitlar, felsidan, toast-notiser,
 * uppdateringsfrågan, lagringsvarningen och safe areas.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionGlobalConfig } from 'motion/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SaveOutcome } from '../../lib/backup'
import { AppShell, navMatch, routeTitle } from './AppShell'
import { isChunkLoadError, RouteError } from './RouteError'
import UpdatePrompt, { UPDATE_CHECK_INTERVAL_MS } from './UpdatePrompt'
import { toast, toastDuration, ToastViewport, useToastStore } from '../ui/toast'
import { clearErrorLog, readErrorLog } from '../../lib/errorLog'
import { clearLastBackup, readLastBackup } from '../../features/settings/backupStatus'
import { guardedRead, READ_TIMEOUT_MS, resetStorageStateForTests } from '../../stores/storage'

MotionGlobalConfig.skipAnimations = true

/** Service workerns registrering (virtual:pwa-register/react) – styrs av testerna. */
const pwa = vi.hoisted(() => ({
  needRefresh: false,
  updateServiceWorker: vi.fn(async (_reload?: boolean) => {}),
  options: undefined as
    | undefined
    | { onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void; onRegisterError?: (error: unknown) => void },
}))
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: typeof pwa.options) => {
    pwa.options = options
    return {
      needRefresh: [pwa.needRefresh, () => {}],
      offlineReady: [false, () => {}],
      updateServiceWorker: pwa.updateServiceWorker,
    }
  },
}))

/** Lagringens status i AppShell – styrs av testerna. */
const storageStatus = vi.hoisted(() => ({ memoryOnly: false, newerData: false, unreadable: false, slowRead: false }))
vi.mock('../../hooks/useStorageStatus', () => ({
  useMemoryOnlyStorage: () => storageStatus.memoryOnly,
  useHasNewerData: () => storageStatus.newerData,
  useHasUnreadableData: () => storageStatus.unreadable,
  useHasSlowReads: () => storageStatus.slowRead,
}))

/** Säkerhetskopian och beständig lagring (grupp C) – spioneras på, resten är som vanligt. */
const backup = vi.hoisted(() => ({
  saveBackup: vi.fn<() => Promise<SaveOutcome>>(async () => 'saved'),
  ensurePersistentStorage: vi.fn<() => Promise<boolean>>(async () => true),
}))
vi.mock('../../lib/backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/backup')>()),
  saveBackup: backup.saveBackup,
  ensurePersistentStorage: backup.ensurePersistentStorage,
}))

/**
 * Webb eller App Store-bygge – läses via getters, så att ett test kan byta. Allt annat i
 * plattformsmodulen är som vanligt.
 */
const build = vi.hoisted(() => ({ appstore: false }))
vi.mock('../../config/platform', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../config/platform')>()
  return {
    ...original,
    get IS_STORE_BUILD() {
      return build.appstore || original.IS_STORE_BUILD
    },
    get DISTRIBUTION() {
      return build.appstore ? 'appstore' : original.DISTRIBUTION
    },
    // `isInApp` i originalmodulen läser sin egen konstant – följ App Store-bygget här också.
    isInApp: () => build.appstore || original.isInApp(),
  }
})

/**
 * Node-moduler importeras dynamiskt och löst typat: appens tsconfig saknar (med avsikt) Node-typer.
 */
type Loose = any
const nodeModule = (name: string): Promise<Loose> => import(/* @vite-ignore */ name)

describe('navigering', () => {
  const mer = { to: '/mer', sections: ['/vikt', '/recept', '/installningar'] }

  it('markerar Mer även på sidor man når därifrån', () => {
    expect(navMatch(mer, '/mer')).toBe('page')
    expect(navMatch(mer, '/vikt')).toBe('section')
    expect(navMatch(mer, '/recept/abc/redigera')).toBe('section')
    expect(navMatch(mer, '/installningar/data')).toBe('section')
    expect(navMatch(mer, '/dagbok')).toBeNull()
    // "/vikten" är inte en undersida till "/vikt".
    expect(navMatch(mer, '/vikten')).toBeNull()
  })

  it('låter sidomenyns genvägar ta över markeringen', () => {
    expect(navMatch(mer, '/vikt', ['/vikt'])).toBeNull()
    expect(navMatch(mer, '/installningar', ['/vikt'])).toBe('section')
  })

  it('Idag matchar bara exakt', () => {
    expect(navMatch({ to: '/', end: true }, '/')).toBe('page')
    expect(navMatch({ to: '/', end: true }, '/dagbok')).toBeNull()
  })

  it('ger varje sida en egen titel', () => {
    expect(routeTitle('/')).toBe('Idag – Lagom')
    expect(routeTitle('/dagbok/2026-09-20')).toBe('Dagbok – Lagom')
    expect(routeTitle('/vikt')).toBe('Vikt & mått – Lagom')
    expect(routeTitle('/recept/nytt')).toBe('Nytt recept – Lagom')
    expect(routeTitle('/livsmedel/lagom:x/redigera')).toBe('Redigera livsmedel – Lagom')
    expect(routeTitle('/recept/importera')).toBe('Importera recept – Lagom')
    expect(routeTitle('/planering')).toBe('Veckoplanering – Lagom')
    expect(routeTitle('/rapport')).toBe('Rapport – Lagom')
    expect(routeTitle('/integritet')).toBe('Integritetspolicy – Lagom')
    expect(routeTitle('/villkor')).toBe('Köp- och användarvillkor – Lagom')
    expect(routeTitle('/vikt/bilder')).toBe('Framstegsbilder – Lagom')
    expect(routeTitle('/mer/milstolpar')).toBe('Milstolpar – Lagom')
    expect(routeTitle('/mer')).toBe('Mer – Lagom')
    expect(routeTitle('/dela')).toBe('Öppna delat – Lagom')
    expect(routeTitle('/okand')).toBe('Lagom – kaloriräknaren')
  })
})

describe('felsidan', () => {
  function Boom(): never {
    throw new TypeError('e is not iterable')
  }

  it('visar en lugn svensk felsida i stället för en stackspårning', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }])
    render(<RouterProvider router={router} />)
    expect(screen.getByRole('heading', { name: 'Något gick snett' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara en säkerhetskopia' })).toBeInTheDocument()
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('sparar felet i den lokala felloggen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearErrorLog()
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }])
    render(<RouterProvider router={router} />)
    expect(readErrorLog().map((e) => e.message)).toContain('route: TypeError: e is not iterable')
    clearErrorLog()
    vi.restoreAllMocks()
  })

  it('sparar säkerhetskopian med saveBackup och visar fel bara när det misslyckas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }])
    render(<RouterProvider router={router} />)
    const save = screen.getByRole('button', { name: 'Spara en säkerhetskopia' })

    backup.saveBackup.mockResolvedValueOnce('cancelled')
    fireEvent.click(save)
    await waitFor(() => expect(backup.saveBackup).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    backup.saveBackup.mockResolvedValueOnce('failed')
    fireEvent.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent('Säkerhetskopian kunde inte sparas')
    backup.saveBackup.mockClear()
    clearErrorLog()
    vi.restoreAllMocks()
  })

  it('känner igen koddelar som inte gick att hämta efter en uppdatering', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Vikt-abc.js'))).toBe(true)
    expect(isChunkLoadError(new TypeError('e is not iterable'))).toBe(false)
  })
})

describe('toast', () => {
  afterEach(() => {
    vi.useRealTimers()
    act(() => useToastStore.setState({ toasts: [] }))
  })

  it('visar Ångra längre och pausar medan pekaren är över notisen', async () => {
    vi.useFakeTimers()
    expect(toastDuration({ action: { label: 'Ångra', onClick: () => {} } })).toBe(8000)
    render(<ToastViewport />)
    const onUndo = vi.fn()
    act(() => {
      toast('Borttaget', { action: { label: 'Ångra', onClick: onUndo } })
    })
    const undo = screen.getByRole('button', { name: 'Ångra' })
    // Renderas i en portal direkt i <body>, så att den går att nå när ett ark är öppet.
    expect(undo.closest('[data-toast-viewport]')?.parentElement).toBe(document.body)

    act(() => vi.advanceTimersByTime(4000))
    const card = undo.parentElement!
    act(() => {
      card.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    })
    // React lyssnar på pointerover/pointerout för onPointerEnter/Leave.
    act(() => vi.advanceTimersByTime(20_000))
    expect(screen.getByRole('button', { name: 'Ångra' })).toBeInTheDocument()

    vi.useRealTimers()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Ångra' }))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('läser upp fel direkt (role=alert)', () => {
    render(<ToastViewport />)
    act(() => {
      toast('Importen misslyckades', { tone: 'error' })
    })
    expect(screen.getByRole('alert')).toHaveTextContent('Importen misslyckades')
  })
})

describe('uppdateringsfrågan (UpdatePrompt)', () => {
  afterEach(() => {
    pwa.needRefresh = false
    pwa.options = undefined
    pwa.updateServiceWorker.mockClear()
    vi.useRealTimers()
    vi.restoreAllMocks()
    act(() => useToastStore.setState({ toasts: [] }))
  })

  it('visar en notis med Uppdatera när en ny version väntar', async () => {
    pwa.needRefresh = true
    render(
      <>
        <UpdatePrompt />
        <ToastViewport />
      </>,
    )
    expect(await screen.findByText('En ny version av Lagom finns')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Uppdatera' }))
    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('visar ingenting när ingen ny version finns', () => {
    const { container } = render(
      <>
        <UpdatePrompt />
        <ToastViewport />
      </>,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('En ny version av Lagom finns')).not.toBeInTheDocument()
  })

  it('letar efter en ny version varje timme och när appen blir synlig – bara uppkopplad', () => {
    vi.useFakeTimers()
    const { unmount } = render(<UpdatePrompt />)
    const update = vi.fn(async () => {})
    const registration = { installing: null, update } as unknown as ServiceWorkerRegistration
    act(() => pwa.options?.onRegisteredSW?.('./sw.js', registration))

    act(() => vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS))
    expect(update).toHaveBeenCalledTimes(1)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(2)

    // Utan uppkoppling frågar vi inte servern.
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    act(() => vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(2)
    online.mockRestore()

    // När komponenten försvinner slutar kontrollerna.
    unmount()
    act(() => vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS * 3))
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('sparar ett oväntat registreringsfel i felloggen', () => {
    clearErrorLog()
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    render(<UpdatePrompt />)
    act(() => pwa.options?.onRegisterError?.(new Error('nätverket')))
    expect(readErrorLog().map((e) => e.message)).toEqual(['service worker: Error: nätverket'])
    clearErrorLog()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('en blockerad service worker (privat läge, strikta inställningar) loggas inte', () => {
    clearErrorLog()
    render(<UpdatePrompt />)
    // Utan navigator.serviceWorker (jsdom, eller blockerad i webbläsaren).
    act(() => pwa.options?.onRegisterError?.(new TypeError("Cannot read properties of undefined (reading 'register')")))
    Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    act(() => pwa.options?.onRegisterError?.(new DOMException('The operation is insecure.', 'SecurityError')))
    expect(readErrorLog()).toEqual([])
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })
})

describe('AppShell – lagring', () => {
  const originalMatchMedia = window.matchMedia
  const originalScrollTo = window.scrollTo
  beforeAll(() => {
    // AppShell scrollar till toppen vid sidbyte – jsdom saknar scrollTo.
    window.scrollTo = (() => {}) as typeof window.scrollTo
    // useTheme i AppShell lyssnar på systemets tema.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }))
  })
  afterAll(() => {
    window.matchMedia = originalMatchMedia
    window.scrollTo = originalScrollTo
  })
  beforeEach(() => {
    storageStatus.memoryOnly = false
    storageStatus.newerData = false
    storageStatus.unreadable = false
    storageStatus.slowRead = false
    clearLastBackup()
    resetStorageStateForTests()
    backup.saveBackup.mockClear()
    backup.ensurePersistentStorage.mockClear()
  })
  afterEach(() => {
    act(() => useToastStore.setState({ toasts: [] }))
  })

  function renderShell() {
    const router = createMemoryRouter([{ path: '/', element: <AppShell />, children: [{ index: true, element: <h1>Idag</h1> }] }])
    return render(<RouterProvider router={router} />)
  }

  it('ber om beständig lagring en gång när appen startar', async () => {
    const { rerender } = renderShell()
    await waitFor(() => expect(backup.ensurePersistentStorage).toHaveBeenCalledTimes(1))
    rerender(<></>)
    expect(backup.ensurePersistentStorage).toHaveBeenCalledTimes(1)
  })

  it('visar ingen varning när allt sparas', () => {
    renderShell()
    expect(screen.queryByText(/sparas inte på enheten/)).not.toBeInTheDocument()
    expect(screen.queryByText(/nyare version av Lagom/)).not.toBeInTheDocument()
  })

  it('sparar en säkerhetskopia från varningen och visar fel bara när det misslyckas', async () => {
    storageStatus.memoryOnly = true
    renderShell()
    expect(screen.getByText('Din data sparas inte på enheten just nu')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Spara säkerhetskopia' })

    backup.saveBackup.mockResolvedValueOnce('shared')
    fireEvent.click(save)
    await waitFor(() => expect(backup.saveBackup).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/kunde inte sparas/)).not.toBeInTheDocument()

    backup.saveBackup.mockResolvedValueOnce('failed')
    fireEvent.click(save)
    expect(await screen.findByText('Säkerhetskopian kunde inte sparas. Försök igen.')).toBeInTheDocument()
  })

  it('säger till när datan kommer från en nyare version – utan att erbjuda en tom säkerhetskopia', () => {
    storageStatus.memoryOnly = true
    storageStatus.newerData = true
    renderShell()
    expect(
      screen.getByText('Din data är från en nyare version av Lagom – uppdatera appen innan du fortsätter. Inget skrivs över.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spara säkerhetskopia' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mer om data' })).toHaveAttribute('href', '/installningar/data')
  })

  it('säger till när den sparade dagboken inte gick att läsa – inte att webbläsaren spärrar', () => {
    storageStatus.memoryOnly = true
    storageStatus.unreadable = true
    renderShell()
    expect(screen.getByText('Den sparade dagboken gick inte att läsa')).toBeInTheDocument()
    expect(screen.getByText(/Den lämnas orörd och skrivs inte över/)).toBeInTheDocument()
    expect(screen.queryByText(/Webbläsaren låter inte Lagom spara/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara säkerhetskopia' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Felrapport' })).toHaveAttribute('href', '/om')
  })

  it('förklarar blockerad lagring med webbläsarens ord på webben', () => {
    storageStatus.memoryOnly = true
    renderShell()
    expect(screen.getByText(/Webbläsaren låter inte Lagom spara/)).toHaveTextContent(/privat läge/)
  })

  it('talar om appen – aldrig webbläsaren, privat läge eller en annan butik – när lagringen är blockerad i apparna', () => {
    build.appstore = true
    try {
      storageStatus.memoryOnly = true
      renderShell()
      const banner = screen.getByRole('status')
      expect(banner).toHaveTextContent('Din data sparas inte på enheten just nu')
      expect(banner).toHaveTextContent(/Lagom kan inte spara på enheten just nu/)
      expect(banner.textContent).not.toMatch(/webbläsar|privat läge|Android|Google|Play|fliken/i)
      expect(screen.getByRole('button', { name: 'Spara säkerhetskopia' })).toBeInTheDocument()
    } finally {
      build.appstore = false
    }
  })

  it('en långsam läsning: lugn text utan att skylla på webbläsaren, och ingen kopia som ser hel ut', () => {
    storageStatus.memoryOnly = true
    storageStatus.slowRead = true
    renderShell()
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Din sparade data läses in långsamt')
    expect(banner).toHaveTextContent(/Inget är raderat/)
    expect(banner).toHaveTextContent(/ladda om sidan/)
    expect(banner.textContent).not.toMatch(/Webbläsaren låter|privat läge|lagringen är full/)
    expect(screen.getByRole('button', { name: 'Ladda om' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Spara säkerhetskopia' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mer om data' })).toHaveAttribute('href', '/installningar/data')
  })

  it('en långsam läsning i apparna: starta om appen – utan "Ladda om" och utan annan butik eller webbläsare', () => {
    build.appstore = true
    try {
      storageStatus.memoryOnly = true
      storageStatus.slowRead = true
      renderShell()
      const banner = screen.getByRole('status')
      expect(banner).toHaveTextContent(/starta om appen/)
      expect(banner.textContent).not.toMatch(/webbläsar|privat läge|Android|Google|Play|ladda om/i)
      expect(screen.queryByRole('button', { name: 'Ladda om' })).not.toBeInTheDocument()
    } finally {
      build.appstore = false
    }
  })

  it('en kopia stämplas som gjord – men inte medan sparad data är oläst (trasig eller långsam)', async () => {
    // Knappen visas för en trasig dagbok (hooken); själva skyddet kommer från den riktiga lagringen.
    storageStatus.memoryOnly = true
    storageStatus.unreadable = true
    renderShell()
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'Spara säkerhetskopia' }))

    // Dagboken går inte att tolka: kopian saknar den, så påminnelsen tystnar inte.
    await guardedRead('lagom-diary', () => Promise.resolve({ status: 'unreadable' as const }))
    backup.saveBackup.mockResolvedValueOnce('saved')
    save()
    await waitFor(() => expect(backup.saveBackup).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(readLastBackup()).toBeNull()

    // Dagboken läses fortfarande in efter tidsgränsen (äldre telefon, stor dagbok): samma skydd.
    resetStorageStateForTests()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const slow = guardedRead('lagom-diary', () => new Promise(() => {}))
      await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 10)
      await slow
    } finally {
      vi.useRealTimers()
    }
    backup.saveBackup.mockResolvedValueOnce('saved')
    save()
    await waitFor(() => expect(backup.saveBackup).toHaveBeenCalledTimes(2))
    await act(async () => {})
    expect(readLastBackup()).toBeNull()

    // Inget oläst: kopian är hel och stämplas.
    resetStorageStateForTests()
    backup.saveBackup.mockResolvedValueOnce('saved')
    save()
    await waitFor(() => expect(readLastBackup()).not.toBeNull())
  })

  it('sidomenyn är inget eget landmärke (ingen omärkt <aside>) – navigeringen inuti är det', () => {
    renderShell()
    expect(screen.queryAllByRole('complementary')).toHaveLength(0)
    expect(screen.getAllByRole('navigation', { name: 'Huvudmeny' })).toHaveLength(2)
  })

  it('ber om en uppdatering i App Store i App Store-bygget – utan "Ladda om"', () => {
    build.appstore = true
    try {
      storageStatus.newerData = true
      renderShell()
      expect(screen.getByText(/nyare version av Lagom/)).toBeInTheDocument()
      expect(screen.getByText('Uppdatera Lagom i App Store. Det du ändrar innan dess sparas inte.')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ladda om' })).not.toBeInTheDocument()
      // Nämner aldrig den andra butiken (App Store-riktlinje 2.3.10).
      expect(document.body.textContent).not.toMatch(/Google Play/)
    } finally {
      build.appstore = false
    }
  })

  describe('uppdateringsfrågan', () => {
    beforeEach(() => {
      pwa.options = undefined
      // jsdom saknar service worker – låtsas att webbläsaren har det.
      Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
    })
    afterEach(() => {
      delete (navigator as { serviceWorker?: unknown }).serviceWorker
      build.appstore = false
    })

    it('laddas i webbversionen när webbläsaren har service worker', async () => {
      renderShell()
      await waitFor(() => expect(pwa.options).toBeDefined())
    })

    it('laddas aldrig i butiksbygget – där kommer uppdateringarna från butiken', async () => {
      build.appstore = true
      renderShell()
      expect(await screen.findByRole('heading', { name: 'Idag' })).toBeInTheDocument()
      await new Promise((r) => setTimeout(r, 50))
      expect(pwa.options).toBeUndefined()
    })
  })

  it('döljer navigeringen vid utskrift och använder var(--sa-bottom)', () => {
    renderShell()
    const navs = screen.getAllByRole('navigation', { name: 'Huvudmeny' })
    for (const nav of navs) expect(nav.closest('.print\\:hidden')).not.toBeNull()
    const bottom = navs.find((n) => n.tagName === 'NAV' && n.style.paddingBottom)
    expect(bottom?.style.paddingBottom).toBe('max(0.75rem, var(--sa-bottom))')
  })
})

describe('safe areas', () => {
  /** Läs en fil i repot (sökväg relativt roten). */
  async function readRepoFile(path: string): Promise<string> {
    const { readFile } = await nodeModule('node:fs/promises')
    const { join } = await nodeModule('node:path')
    const { cwd } = await nodeModule('node:process')
    return readFile(join(cwd(), path), 'utf8') as Promise<string>
  }

  /** Filer i src (utom index.css) som använder env(safe-area-inset-*) direkt. */
  async function envSafeAreaFiles(): Promise<string[]> {
    const { readdir } = await nodeModule('node:fs/promises')
    const { join } = await nodeModule('node:path')
    const { cwd } = await nodeModule('node:process')
    const files = (await readdir(join(cwd(), 'src'), { recursive: true })) as string[]
    const hits: string[] = []
    for (const rel of files.map((f) => f.split('\\').join('/')).sort()) {
      if (!/\.(tsx?|css)$/.test(rel) || rel === 'index.css' || /\.test\.tsx?$/.test(rel)) continue
      if ((await readRepoFile(`src/${rel}`)).includes('env(safe-area-inset')) hits.push(`src/${rel}`)
    }
    return hits
  }

  it('index.css definierar --sa-* och pt-safe/pb-safe använder dem', async () => {
    const css = await readRepoFile('src/index.css')
    for (const side of ['top', 'bottom', 'left', 'right']) {
      expect(css).toContain(`--sa-${side}: var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px));`)
    }
    expect(css).toMatch(/\.pt-safe \{\s*padding-top: var\(--sa-top\);/)
    expect(css).toMatch(/\.pb-safe \{\s*padding-bottom: var\(--sa-bottom\);/)
  })

  it('ingen fil i src utom index.css använder env(safe-area-inset-*)', async () => {
    expect(await envSafeAreaFiles()).toEqual([])
  })
})
