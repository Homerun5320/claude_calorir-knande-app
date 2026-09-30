/**
 * Inkopplingen av native-modulerna i appens delade kod – med mockade moduler i stället för
 * Capacitor: starten (init.ts), säkerhetskopian och exporten (`saveFile`), delning av text
 * (`shareOrCopy`) och "Radera all data" (`clearNativeCopies`). Modulerna själva testas i sina
 * egna testfiler.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: true,
  platform: 'ios' as 'ios' | 'android',
  modules: {} as Record<string, unknown>,
  loaded: [] as string[],
  logError: vi.fn(),
  setNativeStorePurchases: vi.fn(),
}))

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  isNative: () => mocks.native,
  nativePlatform: () => (mocks.native ? mocks.platform : 'web'),
  loadNative: async (name: string) => {
    mocks.loaded.push(name)
    return mocks.native ? (mocks.modules[name] ?? null) : null
  },
}))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
vi.mock('../lib/storePurchases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storePurchases')>()),
  setNativeStorePurchases: mocks.setNativeStorePurchases,
}))

import { startNative } from './init'
import { saveFile } from '../lib/backup'
import { shareOrCopy } from '../features/diary/share'
import { clearNativeCopies } from '../features/settings/wipe'

beforeEach(() => {
  mocks.native = true
  mocks.platform = 'ios'
  mocks.modules = {}
  mocks.loaded = []
})

afterEach(() => {
  mocks.logError.mockReset()
  mocks.setNativeStorePurchases.mockReset()
})

describe('startNative', () => {
  it('startar systemet först, sedan köpen – och väntar inte på speglingen', async () => {
    const order: string[] = []
    mocks.modules = {
      system: { initSystem: vi.fn(async () => void order.push('system')) },
      purchases: { registerNativePurchases: vi.fn(() => void order.push('köp')) },
      reminders: { startReminders: vi.fn(async () => void order.push('påminnelser')) },
      health: { startHealth: vi.fn(async () => void order.push('hälsa')) },
      // Speglingen kan vänta på att användaren svarar på frågan om återställning.
      mirror: { startMirror: vi.fn(() => new Promise(() => {})) },
    }
    await startNative()
    expect(order.slice(0, 2)).toEqual(['system', 'köp'])
    expect(order).toEqual(expect.arrayContaining(['påminnelser', 'hälsa']))
    expect(mocks.loaded).toEqual(expect.arrayContaining(['system', 'purchases', 'mirror', 'reminders', 'health']))
    expect(mocks.setNativeStorePurchases).not.toHaveBeenCalled()
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('Android: tar bort kamerans tillfälliga originalbilder vid varje start – inte på iPhone', async () => {
    const clearCameraCaptures = vi.fn(async () => {})
    mocks.modules = { photos: { clearCameraCaptures } }
    await startNative()
    expect(mocks.loaded).not.toContain('photos')
    mocks.platform = 'android'
    await startNative()
    await vi.waitFor(() => expect(clearCameraCaptures).toHaveBeenCalledTimes(1))
  })

  it('ett fel i en del stoppar inte de andra, och saknade köp säger till direkt', async () => {
    const startReminders = vi.fn(async () => {})
    mocks.modules = {
      system: {
        initSystem: vi.fn(async () => {
          throw new Error('trasigt')
        }),
      },
      reminders: { startReminders },
      health: {
        startHealth: vi.fn(async () => {
          throw new Error('hälsa')
        }),
      },
      mirror: { startMirror: vi.fn(async () => 'started') },
    }
    await expect(startNative()).resolves.toBeUndefined()
    expect(startReminders).toHaveBeenCalledTimes(1)
    // Köpmodulen gick inte att ladda: appen väntar inte 15 s på den.
    expect(mocks.setNativeStorePurchases).toHaveBeenCalledWith(null)
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:system')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:halsa')
  })
})

describe('saveFile i apparna', () => {
  it('skriver filen och öppnar delningsbladet via src/native/files.ts', async () => {
    const files = { saveFile: vi.fn(async () => 'shared') }
    mocks.modules = { files }
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('shared')
    expect(files.saveFile).toHaveBeenCalledWith('lagom.json', '{}', 'application/json')
    await saveFile('lagom.csv', 'a;b', 'text/csv')
    expect(files.saveFile).toHaveBeenLastCalledWith('lagom.csv', 'a;b', 'text/csv')
  })

  it('går modulen inte att ladda blir det failed – aldrig saved', async () => {
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('failed')
  })
})

describe('shareOrCopy i apparna', () => {
  it('delar med telefonens delningsblad', async () => {
    const files = { shareText: vi.fn(async () => 'shared') }
    mocks.modules = { files }
    await expect(shareOrCopy('Titel', 'Text')).resolves.toBe('shared')
    expect(files.shareText).toHaveBeenCalledWith('Titel', 'Text')
    files.shareText.mockResolvedValueOnce('cancelled')
    await expect(shareOrCopy('Titel', 'Text')).resolves.toBe('cancelled')
  })

  it('en egen miljö (inköpslistans Kopiera) öppnar aldrig delningsbladet', async () => {
    const files = { shareText: vi.fn(async () => 'shared') }
    mocks.modules = { files }
    const writeText = vi.fn(async () => {})
    await expect(shareOrCopy('Titel', 'Text', { clipboard: { writeText } })).resolves.toBe('copied')
    expect(files.shareText).not.toHaveBeenCalled()
  })

  it('misslyckas delningsbladet prövas urklipp', async () => {
    const files = { shareText: vi.fn(async () => 'failed') }
    mocks.modules = { files }
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    try {
      await expect(shareOrCopy('Titel', 'Text')).resolves.toBe('copied')
      expect(writeText).toHaveBeenCalledWith('Text')
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})

describe('Radera all data i apparna', () => {
  it('tar bort den automatiska kopian, exportfilerna och hälsokopplingen', async () => {
    const mirror = { deleteMirror: vi.fn(async () => {}) }
    const files = { clearExportCache: vi.fn(async () => {}) }
    const health = { resetHealth: vi.fn() }
    mocks.modules = { mirror, files, health }
    await clearNativeCopies()
    expect(mirror.deleteMirror).toHaveBeenCalledTimes(1)
    expect(files.clearExportCache).toHaveBeenCalledTimes(1)
    expect(health.resetHealth).toHaveBeenCalledTimes(1)
  })

  it('raderas bara exempeldata ("Skapa min egen profil") ligger den tidigare kopian kvar', async () => {
    const mirror = { deleteMirror: vi.fn(async () => {}) }
    const files = { clearExportCache: vi.fn(async () => {}) }
    const health = { resetHealth: vi.fn() }
    mocks.modules = { mirror, files, health }
    await clearNativeCopies({ keepMirror: true })
    expect(mirror.deleteMirror).not.toHaveBeenCalled()
    expect(mocks.loaded).not.toContain('mirror')
    expect(files.clearExportCache).toHaveBeenCalledTimes(1)
  })

  it('gör ingenting på webben', async () => {
    mocks.native = false
    await clearNativeCopies()
    expect(mocks.loaded).toEqual([])
  })
})
