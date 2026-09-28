import { initNative, isNative, loadNative, NATIVE_BUILD, nativePlatform, platform, resetNativeForTests } from './index'

const mocks = vi.hoisted(() => ({
  native: false,
  startNative: vi.fn(async () => {}),
  logError: vi.fn(),
}))

vi.mock('../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/platform')>()),
  isNativeApp: () => mocks.native,
}))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
vi.mock('./init', () => ({ startNative: mocks.startNative }))

type CapWindow = Window & { Capacitor?: { getPlatform?: () => string } }

afterEach(() => {
  mocks.native = false
  mocks.startNative.mockReset()
  mocks.startNative.mockImplementation(async () => {})
  mocks.logError.mockReset()
  delete (window as CapWindow).Capacitor
  resetNativeForTests()
})

describe('webben (standard)', () => {
  it('är inte native och laddar ingen native-kod', async () => {
    expect(NATIVE_BUILD).toBe(true) // i testerna saknas define – native-vägarna går att testa
    expect(isNative()).toBe(false)
    expect(nativePlatform()).toBe('web')
    expect(platform).toBe('web')
    expect(await loadNative('init')).toBeNull()
    await initNative()
    expect(mocks.startNative).not.toHaveBeenCalled()
  })
})

describe('inbyggd app', () => {
  beforeEach(() => {
    mocks.native = true
  })

  it('läser plattformen från Capacitor', () => {
    ;(window as CapWindow).Capacitor = { getPlatform: () => 'ios' }
    expect(isNative()).toBe(true)
    expect(nativePlatform()).toBe('ios')
    ;(window as CapWindow).Capacitor = { getPlatform: () => 'android' }
    expect(nativePlatform()).toBe('android')
  })

  it('en okänd eller trasig plattform räknas som webb', () => {
    ;(window as CapWindow).Capacitor = { getPlatform: () => 'electron' }
    expect(nativePlatform()).toBe('web')
    ;(window as CapWindow).Capacitor = {
      getPlatform: () => {
        throw new Error('trasig')
      },
    }
    expect(nativePlatform()).toBe('web')
  })

  it('loadNative ger modulen', async () => {
    const init = await loadNative('init')
    expect(init?.startNative).toBe(mocks.startNative)
  })

  it('initNative startar native-funktionerna en gång', async () => {
    await Promise.all([initNative(), initNative()])
    await initNative()
    expect(mocks.startNative).toHaveBeenCalledTimes(1)
  })

  it('ett fel vid starten loggas men kastas inte', async () => {
    mocks.startNative.mockRejectedValueOnce(new Error('tillägget saknas'))
    await expect(initNative()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:init')
  })
})

/**
 * Native-koden får bara laddas via src/native/index.ts (loadNative) – annars följer den med i
 * webbygget och service workerns cache. Se kommentaren överst i index.ts.
 */
describe('native-koden hålls borta från webbygget', () => {
  // Alla källfiler i src/ som text (nycklarna är relativa den här filen, t.ex. '../App.tsx').
  const raw = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })
  // Filer i samma mapp får nycklar som './index.ts' – gör om allt till sökvägar från src/.
  const files = Object.entries(raw).map(([key, text]) => ({ rel: key.replace(/^\.\.\//, '').replace(/^\.\//, 'native/'), text }))

  it('hittar källfilerna', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.rel === 'native/index.ts')).toBe(true)
  })

  const NATIVE_PACKAGE = /(?:from\s+|import\s*\(\s*|import\s+)['"](@capacitor\/|@capgo\/|@capacitor-mlkit\/)/

  it('bara src/native/ (utom index.ts) använder Capacitor och tilläggen', () => {
    const offenders = files.filter((f) => NATIVE_PACKAGE.test(f.text) && (!f.rel.startsWith('native/') || f.rel === 'native/index.ts'))
    expect(offenders.map((f) => f.rel)).toEqual([])
  })

  it('resten av appen importerar bara src/native/index.ts', () => {
    const deep = /['"](?:@\/|(?:\.\.?\/)+)native\/(?!index['"])[^'"]+['"]/
    const offenders = files.filter((f) => !f.rel.startsWith('native/') && deep.test(f.text))
    expect(offenders.map((f) => f.rel)).toEqual([])
  })

  it('index.ts importerar inga native-moduler statiskt', () => {
    const index = files.find((f) => f.rel === 'native/index.ts')?.text ?? ''
    expect(index).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+['"]\.\/(?!index)/m)
  })
})
