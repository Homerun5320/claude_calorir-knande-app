/**
 * Systemfälten, tangentbordet, startskärmen, Androids bakåtknapp och länkarna (src/native/system.ts)
 * med mockade Capacitor-tillägg: stilen följer appens tema, startskärmen döljs, tangentbordets
 * inställningar på iPhone, bakåtknappens ordning (modal → bakåt → minimera) och länkar med ny flik
 * till appens egna sidor.
 */
import { waitFor } from '@testing-library/react'
import { registerModalEntry } from '../components/ui/modalHistory'
import {
  appLinkTarget,
  closeTopModal,
  currentRoute,
  handleBackButton,
  initSystem,
  KEYBOARD_OPEN_CLASS,
  resetSystemForTests,
  siteBase,
  SYSTEM_LOG,
} from './system'

type Listener = (payload: unknown) => void

const mocks = vi.hoisted(() => {
  const state = {
    platform: 'ios' as 'ios' | 'android' | 'web',
    apiBase: 'https://lagom.example',
    appListeners: new Map<string, Listener>(),
    keyboardListeners: new Map<string, Listener>(),
    removed: [] as string[],
  }
  const listenerOn = (map: Map<string, Listener>) => (event: string, listener: Listener) => {
    map.set(event, listener)
    return Promise.resolve({
      remove: async () => {
        map.delete(event)
        state.removed.push(event)
      },
    })
  }
  return {
    state,
    systemBarsSetStyle: vi.fn(async (_options: unknown) => {}),
    statusBarSetStyle: vi.fn(async (_options: unknown) => {}),
    setOverlaysWebView: vi.fn(async (_options: unknown) => {}),
    keyboardSetStyle: vi.fn(async (_options: unknown) => {}),
    setResizeMode: vi.fn(async (_options: unknown) => {}),
    setAccessoryBarVisible: vi.fn(async (_options: unknown) => {}),
    keyboardAddListener: vi.fn(listenerOn(state.keyboardListeners)),
    splashHide: vi.fn(async () => {}),
    appAddListener: vi.fn(listenerOn(state.appListeners)),
    minimizeApp: vi.fn(async () => {}),
    logError: vi.fn(),
  }
})

// Tilläggens riktiga enum-värden behålls – bara anropen till telefonen byts ut.
vi.mock('@capacitor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/core')>()),
  SystemBars: { setStyle: mocks.systemBarsSetStyle },
}))
vi.mock('@capacitor/status-bar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/status-bar')>()),
  StatusBar: { setStyle: mocks.statusBarSetStyle, setOverlaysWebView: mocks.setOverlaysWebView },
}))
vi.mock('@capacitor/keyboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/keyboard')>()),
  Keyboard: {
    setStyle: mocks.keyboardSetStyle,
    setResizeMode: mocks.setResizeMode,
    setAccessoryBarVisible: mocks.setAccessoryBarVisible,
    addListener: mocks.keyboardAddListener,
  },
}))
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: mocks.splashHide } }))
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.appAddListener, minimizeApp: mocks.minimizeApp } }))
vi.mock('./index', () => ({ nativePlatform: () => mocks.state.platform }))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
vi.mock('../config/commerce', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/commerce')>()),
  get API_BASE() {
    return mocks.state.apiBase
  },
}))

const root = document.documentElement

/** Vänta tills MutationObserver och de köade anropen till tilläggen har körts. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

function setRoute(hash: string) {
  window.history.replaceState(null, '', hash)
}

function backButton(canGoBack: boolean) {
  const listener = mocks.state.appListeners.get('backButton')
  if (!listener) throw new Error('ingen lyssnare för bakåtknappen')
  listener({ canGoBack })
}

beforeEach(() => {
  mocks.state.platform = 'ios'
  mocks.state.apiBase = 'https://lagom.example'
  root.classList.remove('dark')
  setRoute('#/')
})

afterEach(() => {
  resetSystemForTests()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  mocks.state.appListeners.clear()
  mocks.state.keyboardListeners.clear()
  mocks.state.removed = []
  root.classList.remove('dark', KEYBOARD_OPEN_CLASS)
  document.body.innerHTML = ''
})

describe('start', () => {
  it('gör ingenting på webben', async () => {
    mocks.state.platform = 'web'
    await initSystem()
    expect(document.documentElement.classList.contains('native-app')).toBe(false)
    expect(mocks.systemBarsSetStyle).not.toHaveBeenCalled()
    expect(mocks.splashHide).not.toHaveBeenCalled()
    expect(mocks.keyboardAddListener).not.toHaveBeenCalled()
    expect(mocks.appAddListener).not.toHaveBeenCalled()
  })

  it('iPhone: ljus stil, overlay, tangentbordet och startskärmen – ingen bakåtknapp', async () => {
    await initSystem()
    expect(mocks.systemBarsSetStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.statusBarSetStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.keyboardSetStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.setOverlaysWebView).toHaveBeenCalledWith({ overlay: true })
    expect(mocks.setResizeMode).toHaveBeenCalledWith({ mode: 'native' })
    expect(mocks.setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: true })
    expect(mocks.splashHide).toHaveBeenCalledTimes(1)
    expect(mocks.appAddListener).not.toHaveBeenCalled()
    expect(mocks.logError).not.toHaveBeenCalled()
    // Ingen meny med "Spara bild" vid ett långt tryck på en bild (src/index.css).
    expect(document.documentElement.classList.contains('native-app')).toBe(true)
    resetSystemForTests()
    expect(document.documentElement.classList.contains('native-app')).toBe(false)
  })

  it('statusfältet får rätt stil innan startskärmen döljs', async () => {
    root.classList.add('dark')
    await initSystem()
    const styled = mocks.systemBarsSetStyle.mock.invocationCallOrder[0]
    const hidden = mocks.splashHide.mock.invocationCallOrder[0]
    expect(mocks.systemBarsSetStyle).toHaveBeenCalledWith({ style: 'DARK' })
    expect(styled).toBeLessThan(hidden)
  })

  it('Android: bakåtknappen, inga inställningar som bara finns på iPhone', async () => {
    mocks.state.platform = 'android'
    await initSystem()
    expect(mocks.systemBarsSetStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.statusBarSetStyle).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.keyboardSetStyle).not.toHaveBeenCalled()
    expect(mocks.setOverlaysWebView).not.toHaveBeenCalled()
    expect(mocks.setResizeMode).not.toHaveBeenCalled()
    expect(mocks.setAccessoryBarVisible).not.toHaveBeenCalled()
    expect(mocks.state.appListeners.has('backButton')).toBe(true)
    expect(mocks.splashHide).toHaveBeenCalledTimes(1)
  })

  it('startar bara en gång', async () => {
    mocks.state.platform = 'android'
    await Promise.all([initSystem(), initSystem()])
    await initSystem()
    expect(mocks.splashHide).toHaveBeenCalledTimes(1)
    expect(mocks.appAddListener).toHaveBeenCalledTimes(1)
    expect(mocks.keyboardAddListener).toHaveBeenCalledTimes(2)
  })

  it('ett fel i ett tillägg loggas – resten startar ändå och inget kastas', async () => {
    mocks.statusBarSetStyle.mockRejectedValueOnce(new Error('StatusBar saknas'))
    mocks.setAccessoryBarVisible.mockImplementationOnce(() => {
      throw new Error('kastar direkt')
    })
    mocks.state.platform = 'ios'
    await expect(initSystem()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'StatusBar saknas' }), SYSTEM_LOG.bars)
    expect(mocks.logError).toHaveBeenCalledWith(expect.objectContaining({ message: 'kastar direkt' }), SYSTEM_LOG.keyboard)
    expect(mocks.systemBarsSetStyle).toHaveBeenCalled()
    expect(mocks.splashHide).toHaveBeenCalledTimes(1)
    expect(mocks.keyboardAddListener).toHaveBeenCalledTimes(2)
  })

  it('en startskärm som inte går att dölja loggas', async () => {
    mocks.splashHide.mockRejectedValueOnce(new Error('ingen startskärm'))
    await initSystem()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), SYSTEM_LOG.splash)
  })
})

describe('temat', () => {
  it('statusfältet och tangentbordet följer appens tema', async () => {
    await initSystem()
    vi.clearAllMocks()

    root.classList.add('dark')
    await settle()
    expect(mocks.systemBarsSetStyle).toHaveBeenLastCalledWith({ style: 'DARK' })
    expect(mocks.statusBarSetStyle).toHaveBeenLastCalledWith({ style: 'DARK' })
    expect(mocks.keyboardSetStyle).toHaveBeenLastCalledWith({ style: 'DARK' })

    root.classList.remove('dark')
    await settle()
    expect(mocks.systemBarsSetStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' })
    expect(mocks.systemBarsSetStyle).toHaveBeenCalledTimes(2)
  })

  it('andra klasser på <html> anropar inte telefonen', async () => {
    await initSystem()
    vi.clearAllMocks()
    root.classList.add('has-bottom-nav')
    await settle()
    root.classList.remove('has-bottom-nav')
    await settle()
    expect(mocks.systemBarsSetStyle).not.toHaveBeenCalled()
    expect(mocks.statusBarSetStyle).not.toHaveBeenCalled()
  })

  it('slutar följa temat när modulen stoppas', async () => {
    await initSystem()
    resetSystemForTests()
    vi.clearAllMocks()
    root.classList.add('dark')
    await settle()
    expect(mocks.systemBarsSetStyle).not.toHaveBeenCalled()
  })
})

describe('tangentbordet', () => {
  it('klassen keyboard-open följer tangentbordet', async () => {
    await initSystem()
    mocks.state.keyboardListeners.get('keyboardWillShow')?.({ keyboardHeight: 300 })
    expect(root.classList.contains(KEYBOARD_OPEN_CLASS)).toBe(true)
    mocks.state.keyboardListeners.get('keyboardWillHide')?.(undefined)
    expect(root.classList.contains(KEYBOARD_OPEN_CLASS)).toBe(false)
  })

  it('lyssnarna tas bort när modulen stoppas', async () => {
    await initSystem()
    mocks.state.keyboardListeners.get('keyboardWillShow')?.({ keyboardHeight: 300 })
    resetSystemForTests()
    await settle()
    expect(mocks.state.removed).toEqual(expect.arrayContaining(['keyboardWillShow', 'keyboardWillHide']))
    expect(root.classList.contains(KEYBOARD_OPEN_CLASS)).toBe(false)
  })
})

describe('bakåtknappen (Android)', () => {
  beforeEach(async () => {
    mocks.state.platform = 'android'
    await initSystem()
  })

  it('minimerar appen på startsidan – även när det finns historik', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    backButton(true)
    expect(mocks.minimizeApp).toHaveBeenCalledTimes(1)
    expect(back).not.toHaveBeenCalled()
  })

  it('går bakåt från en undersida', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    setRoute('#/dagbok/2026-09-28')
    backButton(true)
    expect(back).toHaveBeenCalledTimes(1)
    expect(mocks.minimizeApp).not.toHaveBeenCalled()
  })

  it('en undersida utan historik bakom sig leder till startsidan', () => {
    setRoute('#/installningar?del=data')
    backButton(false)
    expect(window.location.hash).toBe('#/')
    expect(mocks.minimizeApp).not.toHaveBeenCalled()
  })

  it('välkomstflödet utan historik minimerar appen', () => {
    setRoute('#/valkommen')
    backButton(false)
    expect(mocks.minimizeApp).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/valkommen')
  })

  it('stänger ett öppet ark först (samma väg som webbläsarens bakåtknapp)', async () => {
    const onBack = vi.fn()
    const release = registerModalEntry(onBack)
    await waitFor(() => expect(window.history.state).toMatchObject({ __lagomModal: expect.any(Array) }))
    backButton(true)
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1))
    expect(mocks.minimizeApp).not.toHaveBeenCalled()
    release()
  })

  it('en dialog utan egen historikpost får Escape', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    document.body.innerHTML = '<div role="alertdialog" aria-modal="true"><button>Avbryt</button></div>'
    const keys: string[] = []
    const onKey = (e: KeyboardEvent) => {
      keys.push(e.key)
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    backButton(true)
    document.removeEventListener('keydown', onKey)
    expect(keys).toEqual(['Escape'])
    expect(back).not.toHaveBeenCalled()
    expect(mocks.minimizeApp).not.toHaveBeenCalled()
  })

  it('utan modal gör closeTopModal ingenting', () => {
    expect(closeTopModal()).toBe(false)
  })

  it('ett fel vid minimeringen loggas', async () => {
    mocks.minimizeApp.mockRejectedValueOnce(new Error('går inte'))
    handleBackButton(false)
    await settle()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), SYSTEM_LOG.back)
  })

  it('lyssnaren tas bort när modulen stoppas', async () => {
    resetSystemForTests()
    await settle()
    expect(mocks.state.removed).toContain('backButton')
  })
})

describe('länkar', () => {
  /** Klicka på en länk och ge tillbaka om appen tog hand om klicket (preventDefault). */
  function click(html: string, init: MouseEventInit = {}): boolean {
    document.body.innerHTML = html
    const link = document.body.querySelector('a')
    if (!link) throw new Error('ingen länk')
    let handled = false
    // Registreras efter appens lyssnare: ser utfallet och stoppar jsdoms egen navigering.
    const after = (e: Event) => {
      handled = e.defaultPrevented
      e.preventDefault()
    }
    document.addEventListener('click', after)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }))
    document.removeEventListener('click', after)
    return handled
  }

  let opened: string[]

  beforeEach(async () => {
    opened = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      opened.push(this.href)
    })
    await initSystem()
  })

  it('externa länkar och mailto lämnas till Capacitor', () => {
    expect(click('<a href="https://www.1177.se" target="_blank" rel="noopener noreferrer">1177</a>')).toBe(false)
    expect(click('<a href="mailto:hej@lagom.example">Mejla</a>')).toBe(false)
    expect(click('<a href="#/dagbok">Dagbok</a>')).toBe(false)
    expect(opened).toEqual([])
    expect(window.location.hash).toBe('#/')
  })

  it('villkoren med ny flik öppnas på webbplatsen – arket i appen ligger kvar', () => {
    expect(click('<a href="#/villkor" target="_blank" rel="noopener noreferrer"><span>Fullständiga köpvillkor</span></a>')).toBe(true)
    expect(opened).toEqual(['https://lagom.example/villkor/'])
    expect(window.location.hash).toBe('#/')
  })

  it('utan webbplats öppnas sidan i appen', () => {
    mocks.state.apiBase = ''
    expect(click('<a href="#/villkor" target="_blank">Villkor</a>')).toBe(true)
    expect(opened).toEqual([])
    expect(window.location.hash).toBe('#/villkor')
  })

  it('en fil i appen öppnas på webbplatsen', () => {
    expect(click('<a href="./licenses.txt" target="_blank">Licenser</a>')).toBe(true)
    expect(opened).toEqual(['https://lagom.example/licenses.txt'])
  })

  it('ett klick som appen redan har hanterat rörs inte', () => {
    document.body.innerHTML = '<a href="#/villkor" target="_blank">Villkor</a>'
    const link = document.body.querySelector('a')
    link?.addEventListener('click', (e) => e.preventDefault())
    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    expect(opened).toEqual([])
  })

  it('slutar hantera länkar när modulen stoppas', () => {
    resetSystemForTests()
    expect(click('<a href="#/villkor" target="_blank">Villkor</a>')).toBe(false)
    expect(opened).toEqual([])
  })
})

describe('hjälpfunktioner', () => {
  it('currentRoute läser hash-routerns väg', () => {
    expect(currentRoute('')).toBe('/')
    expect(currentRoute('#/')).toBe('/')
    expect(currentRoute('#/dagbok/2026-09-28?maltid=lunch')).toBe('/dagbok/2026-09-28')
    expect(currentRoute('#/installningar/')).toBe('/installningar')
  })

  it('siteBase godtar bara en https-adress', () => {
    expect(siteBase('https://lagom.example/')).toBe('https://lagom.example')
    expect(siteBase('')).toBeNull()
    expect(siteBase('http://lagom.example')).toBeNull()
    expect(siteBase('/api')).toBeNull()
  })

  it('appLinkTarget skiljer appens egna sidor från andra webbplatser', () => {
    const here = `${window.location.origin}/`
    expect(appLinkTarget(new URL('https://www.livsmedelsverket.se'), 'https://lagom.example')).toBeNull()
    expect(appLinkTarget(new URL('mailto:hej@lagom.example'), 'https://lagom.example')).toBeNull()
    expect(appLinkTarget(new URL('#/integritet', here), 'https://lagom.example')).toEqual({ open: 'https://lagom.example/integritet/' })
    expect(appLinkTarget(new URL('#/recept', here), 'https://lagom.example')).toEqual({ navigate: '#/recept' })
    expect(appLinkTarget(new URL('/licenses.txt', here), null)).toEqual({ stay: true })
  })
})
