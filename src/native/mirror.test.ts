import { Directory, Encoding } from '@capacitor/filesystem'
import { createBackup, parseBackup, summarizeBackup, wipeAllData } from '../lib/backup'
import { clearDemoFlag, setDemoFlag } from '../lib/demoFlag'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { useFoodStore } from '../stores/foodStore'
import { useLicenseStore } from '../stores/licenseStore'
import { usePlanStore } from '../stores/planStore'
import { useProfileStore } from '../stores/profileStore'
import {
  backupHasData,
  deleteMirror,
  flushMirror,
  MIRROR_DEBOUNCE_MS,
  MIRROR_FILE,
  MIRROR_TMP_FILE,
  mirrorContents,
  readMirror,
  resetMirrorForTests,
  startMirror,
  writeMirrorNow,
  type MirrorInfo,
} from './mirror'

type FsOptions = { path: string; directory?: string; data?: string; encoding?: string; recursive?: boolean }
type RenameOptions = { from: string; to: string; directory?: string; toDirectory?: string }

const mocks = vi.hoisted(() => {
  const files = new Map<string, string>()
  const key = (directory: string | undefined, path: string) => `${directory ?? ''}/${path}`
  const notFound = (method: string, path: string) =>
    Object.assign(new Error(`'${method}' failed because file at '${path}' does not exist.`), { code: 'OS-PLUG-FILE-0008' })
  const listeners = new Set<(state: { isActive: boolean }) => void>()
  return {
    files,
    key,
    listeners,
    memoryOnly: false,
    platform: 'android' as 'ios' | 'android' | 'web',
    writeFile: vi.fn(async (o: FsOptions) => {
      files.set(key(o.directory, o.path), o.data ?? '')
      return { uri: `file:///${key(o.directory, o.path)}` }
    }),
    readFile: vi.fn(async (o: FsOptions) => {
      const data = files.get(key(o.directory, o.path))
      if (data === undefined) throw notFound('readFile', o.path)
      return { data }
    }),
    deleteFile: vi.fn(async (o: FsOptions) => {
      if (!files.delete(key(o.directory, o.path))) throw notFound('deleteFile', o.path)
    }),
    rename: vi.fn(async (o: RenameOptions) => {
      const data = files.get(key(o.directory, o.from))
      if (data === undefined) throw notFound('rename', o.from)
      files.delete(key(o.directory, o.from))
      files.set(key(o.toDirectory ?? o.directory, o.to), data)
    }),
    addListener: vi.fn(async (_event: string, listener: (state: { isActive: boolean }) => void) => {
      listeners.add(listener)
      return { remove: async () => void listeners.delete(listener) }
    }),
    confirmDialog: vi.fn(
      async (_options: { title: unknown; message?: unknown; confirmLabel?: string; cancelLabel?: string; dismissible?: boolean }) => false,
    ),
    logError: vi.fn(),
  }
})

vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/filesystem')>()),
  Filesystem: { writeFile: mocks.writeFile, readFile: mocks.readFile, deleteFile: mocks.deleteFile, rename: mocks.rename },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.addListener } }))
vi.mock('../components/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/ui')>()),
  confirmDialog: mocks.confirmDialog,
}))
vi.mock('../lib/errorLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorLog')>()),
  logError: mocks.logError,
}))
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  nativePlatform: () => mocks.platform,
}))
vi.mock('../stores/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../stores/storage')>()
  return { ...original, isMemoryOnlyStorage: () => mocks.memoryOnly || original.isMemoryOnlyStorage() }
})

const MAIN = mocks.key(Directory.Data, MIRROR_FILE)
const TMP = mocks.key(Directory.Data, MIRROR_TMP_FILE)
const SAVED_AT = '2026-09-20T10:00:00.000Z'

/** Den riktiga timern (testerna fejkar setTimeout för 30-sekundersväntan). */
const realSetTimeout = globalThis.setTimeout
/** Låt alla väntande löften (filkön, microtasks) bli klara. */
const idle = () => new Promise<void>((resolve) => realSetTimeout(resolve, 0))
const background = async () => {
  mocks.listeners.forEach((l) => l({ isActive: false }))
  await flushMirror()
}
const mirrored = () => {
  const text = mocks.files.get(MAIN)
  return text === undefined ? null : parseBackup(text)
}
const writesTo = (path: string) => mocks.writeFile.mock.calls.filter(([o]) => o.path === path).length

/** En spegling med en vägning (och appen tom igen), som om iOS hade rensat webbvyns lagring. */
function seedMirror(path = MAIN, exportedAt = SAVED_AT, kg = 72.5): void {
  useBodyStore.getState().logWeight('2026-09-20', kg)
  const backup = { ...createBackup(), exportedAt }
  wipeAllData()
  mocks.files.set(path, JSON.stringify(backup))
}

beforeAll(async () => {
  // Butikerna läses in från (falsk) IndexedDB när de importeras.
  const stores = [useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore, usePlanStore]
  await vi.waitFor(() => expect(stores.every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(async () => {
  resetMirrorForTests()
  await idle()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  wipeAllData()
  clearDemoFlag()
  mocks.files.clear()
  mocks.listeners.clear()
  mocks.memoryOnly = false
  mocks.platform = 'android'
  for (const fn of [mocks.writeFile, mocks.readFile, mocks.deleteFile, mocks.rename, mocks.addListener, mocks.confirmDialog, mocks.logError]) fn.mockClear()
  mocks.confirmDialog.mockImplementation(async () => false)
})

afterEach(() => {
  resetMirrorForTests()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('spegling av ändringar', () => {
  it('skrivs 30 sekunder efter första ändringen, via en tillfällig fil', async () => {
    await expect(startMirror()).resolves.toBe('started')
    expect(mocks.writeFile).not.toHaveBeenCalled()

    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS - 1)
    expect(mirrored()).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await idle()

    expect(mirrored()?.data.body.weights).toMatchObject([{ date: '2026-09-28', kg: 71.2 }])
    expect(mocks.files.has(TMP)).toBe(false)
    expect(mocks.writeFile).toHaveBeenCalledWith({ path: MIRROR_TMP_FILE, data: expect.any(String), directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
    expect(mocks.rename).toHaveBeenCalledWith({ from: MIRROR_TMP_FILE, to: MIRROR_FILE, directory: Directory.Data, toDirectory: Directory.Data })
  })

  it('samma format som säkerhetskopian', async () => {
    await startMirror()
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await background()
    const backup = mirrored()
    expect(backup).not.toBeNull()
    const { exportedAt: _a, repairs: _r, ...mirror } = backup!
    const { exportedAt: _b, ...fresh } = createBackup()
    expect(mirror).toEqual(JSON.parse(JSON.stringify(fresh)))
  })

  it('flera ändringar i rad blir en enda skrivning', async () => {
    await startMirror()
    useBodyStore.getState().logWeight('2026-09-26', 71.8)
    await vi.advanceTimersByTimeAsync(10_000)
    useBodyStore.getState().logWeight('2026-09-27', 71.5)
    await vi.advanceTimersByTimeAsync(10_000)
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await vi.advanceTimersByTimeAsync(10_000)
    await idle()
    expect(writesTo(MIRROR_TMP_FILE)).toBe(1)
    expect(mirrored()?.data.body.weights).toHaveLength(3)
  })

  it('skrivs direkt när appen går till bakgrunden', async () => {
    await startMirror()
    expect(mocks.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function))
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await background()
    expect(mirrored()?.data.body.weights).toHaveLength(1)
    // Timern är borta – ingen extra skrivning efteråt.
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    expect(writesTo(MIRROR_TMP_FILE)).toBe(1)
  })

  it('inget skrivs när inget har ändrats', async () => {
    await startMirror()
    await background()
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS * 2)
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('speglar en gång efter starten när det redan finns data', async () => {
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await startMirror()
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    await idle()
    expect(mirrored()?.data.body.weights).toHaveLength(1)
  })

  it('går namnbytet inte skrivs filen direkt och den tillfälliga tas bort', async () => {
    mocks.rename.mockRejectedValueOnce(new Error('file exists'))
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await expect(writeMirrorNow()).resolves.toBe(true)
    expect(mirrored()?.data.body.weights).toHaveLength(1)
    expect(mocks.files.has(TMP)).toBe(false)
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('ett skrivfel loggas och ändringen skrivs vid nästa tillfälle', async () => {
    await startMirror()
    mocks.writeFile.mockRejectedValueOnce(new Error('disken är full'))
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await background()
    expect(mirrored()).toBeNull()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:mirror')
    await background()
    expect(mirrored()?.data.body.weights).toHaveLength(1)
  })

  it('exempeldata speglas aldrig – den senaste riktiga kopian ligger kvar', async () => {
    seedMirror()
    setDemoFlag()
    await expect(startMirror()).resolves.toBe('started')
    expect(mocks.confirmDialog).not.toHaveBeenCalled()
    useBodyStore.getState().logWeight('2026-09-28', 99)
    await background()
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(mirrored()?.data.body.weights).toMatchObject([{ kg: 72.5 }])
  })

  it('inget skrivs när datan bara finns i minnet (t.ex. en läsning som inte blivit klar)', async () => {
    await startMirror()
    mocks.memoryOnly = true
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await background()
    await expect(writeMirrorNow()).resolves.toBe(false)
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})

describe('radering', () => {
  it('"Radera all data" tar bort speglingen direkt', async () => {
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    await startMirror()
    await background()
    expect(mocks.files.has(MAIN)).toBe(true)

    wipeAllData()
    await idle()
    expect(mocks.files.size).toBe(0)
    // Och den kommer inte tillbaka.
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    await background()
    expect(mocks.files.size).toBe(0)
  })

  it('deleteMirror tar bort båda filerna även när speglingen inte är igång', async () => {
    mocks.files.set(MAIN, '{}')
    mocks.files.set(TMP, '{}')
    await deleteMirror()
    expect(mocks.files.size).toBe(0)
    // Finns filerna inte är det inget fel.
    await deleteMirror()
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})

describe('återställning vid start', () => {
  it('erbjuds när appen är tom och speglingen finns – och återställer allt', async () => {
    seedMirror()
    const confirmRestore = vi.fn(async (_info: MirrorInfo) => true)
    const onRestored = vi.fn()
    await expect(startMirror({ confirmRestore, onRestored })).resolves.toBe('restored')

    const info = confirmRestore.mock.calls[0][0]
    expect(info.dateLabel).toBe('20 september 2026')
    expect(info.summary).toMatchObject({ weights: 1 })
    expect(onRestored).toHaveBeenCalledWith(info)
    expect(useBodyStore.getState().weights).toMatchObject([{ date: '2026-09-20', kg: 72.5 }])
  })

  it('standardfrågan: "Vi hittade din data från …" – bara knapparna svarar, och "Börja om" bekräftas', async () => {
    seedMirror()
    await expect(startMirror()).resolves.toBe('declined')
    expect(mocks.confirmDialog).toHaveBeenCalledTimes(2)
    const options = mocks.confirmDialog.mock.calls[0][0]
    expect(options.title).toBe('Vi hittade din data från 20 september 2026')
    expect(options.message).toContain('1 vägning')
    // Inte stängbar: ett tryck utanför rutan, Escape eller bakåtknappen räknas aldrig som "Börja om".
    expect(options).toMatchObject({ confirmLabel: 'Återställ', cancelLabel: 'Börja om', dismissible: false })
    expect(mocks.confirmDialog.mock.calls[1][0]).toMatchObject({ title: 'Börja om utan din tidigare data?', confirmLabel: 'Återställ', dismissible: false })
  })

  it('ångrar man sig i bekräftelsen återställs kopian', async () => {
    seedMirror()
    mocks.confirmDialog.mockImplementationOnce(async () => false).mockImplementationOnce(async () => true)
    await expect(startMirror({ onRestored: () => {} })).resolves.toBe('restored')
    expect(useBodyStore.getState().weights).toMatchObject([{ kg: 72.5 }])
  })

  it('stängs appen medan frågan visas skrivs kopian inte över (frågan kommer igen vid nästa start)', async () => {
    seedMirror()
    mocks.confirmDialog.mockImplementation(() => new Promise<boolean>(() => {}))
    void startMirror()
    await idle()
    useBodyStore.getState().logWeight('2026-09-28', 80)
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    await idle()
    expect(writesTo(MIRROR_TMP_FILE) + writesTo(MIRROR_FILE)).toBe(0)
    expect(mirrored()?.data.body.weights).toMatchObject([{ kg: 72.5 }])
  })

  it('efter återställningen lämnas välkomstsidan', async () => {
    seedMirror()
    window.location.hash = '#/valkommen'
    await expect(startMirror({ confirmRestore: async () => true })).resolves.toBe('restored')
    expect(window.location.hash).toBe('#/')
  })

  it('Börja om: inget återställs, och kopian ersätts först när något nytt läggs in', async () => {
    seedMirror()
    await expect(startMirror({ confirmRestore: async () => false })).resolves.toBe('declined')
    expect(useBodyStore.getState().weights).toEqual([])
    await vi.advanceTimersByTimeAsync(MIRROR_DEBOUNCE_MS)
    await background()
    expect(mirrored()?.data.body.weights).toMatchObject([{ kg: 72.5 }])

    useBodyStore.getState().logWeight('2026-09-28', 80)
    await background()
    expect(mirrored()?.data.body.weights).toMatchObject([{ kg: 80 }])
  })

  it('frågar inte när appen redan har data', async () => {
    seedMirror()
    useBodyStore.getState().logWeight('2026-09-28', 71.2)
    const confirmRestore = vi.fn(async () => true)
    await expect(startMirror({ confirmRestore })).resolves.toBe('started')
    expect(confirmRestore).not.toHaveBeenCalled()
    expect(mocks.readFile).not.toHaveBeenCalled()
  })

  it('frågar inte när det inte finns någon spegling (ny användare)', async () => {
    const confirmRestore = vi.fn(async () => true)
    await expect(startMirror({ confirmRestore })).resolves.toBe('started')
    expect(confirmRestore).not.toHaveBeenCalled()
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('en skadad spegling ger ingen fråga och loggas', async () => {
    mocks.files.set(MAIN, '{"format":"lagom-backup","vers')
    const confirmRestore = vi.fn(async () => true)
    await expect(startMirror({ confirmRestore })).resolves.toBe('started')
    expect(confirmRestore).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:mirror')
  })

  it('startMirror körs bara en gång', async () => {
    await expect(startMirror()).resolves.toBe('started')
    await expect(startMirror()).resolves.toBe('already-started')
    expect(mocks.addListener).toHaveBeenCalledTimes(1)
  })
})

describe('readMirror efter en avbruten skrivning', () => {
  it('använder den nyaste hela filen', async () => {
    seedMirror(MAIN, '2026-09-20T10:00:00.000Z', 72.5)
    seedMirror(TMP, '2026-09-21T10:00:00.000Z', 72.1)
    const info = await readMirror()
    expect(info?.dateLabel).toBe('21 september 2026')
    expect(info?.backup.data.body.weights).toMatchObject([{ kg: 72.1 }])
  })

  it('en halvskriven tillfällig fil hoppas över utan fel', async () => {
    seedMirror(MAIN)
    mocks.files.set(TMP, '{"format":"lagom-backup","version":1,"exp')
    const info = await readMirror()
    expect(info?.backup.data.body.weights).toMatchObject([{ kg: 72.5 }])
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('en spegling utan egen data räknas inte', async () => {
    mocks.files.set(MAIN, JSON.stringify(createBackup()))
    await expect(readMirror()).resolves.toBeNull()
  })
})

describe('iPhone: Library/NoCloud', () => {
  const IOS_MAIN = mocks.key(Directory.LibraryNoCloud, MIRROR_FILE)

  it('skrivs utanför iCloud- och datorsäkerhetskopian, och en äldre kopia i Documents tas bort', async () => {
    mocks.platform = 'ios'
    seedMirror(MAIN) // de första testbyggena skrev till Documents (Directory.Data)
    useBodyStore.getState().logWeight('2026-09-28', 80)
    await expect(writeMirrorNow()).resolves.toBe(true)
    expect(mocks.rename).toHaveBeenCalledWith({ from: MIRROR_TMP_FILE, to: MIRROR_FILE, directory: Directory.LibraryNoCloud, toDirectory: Directory.LibraryNoCloud })
    expect(parseBackup(mocks.files.get(IOS_MAIN) ?? '').data.body.weights).toMatchObject([{ kg: 80 }])
    expect(mocks.files.has(MAIN)).toBe(false)
  })

  it('en kopia i den gamla mappen hittas ändå vid start, och radering tar bort båda', async () => {
    mocks.platform = 'ios'
    seedMirror(MAIN)
    const info = await readMirror()
    expect(info?.backup.data.body.weights).toMatchObject([{ kg: 72.5 }])
    mocks.files.set(IOS_MAIN, mocks.files.get(MAIN) ?? '')
    await deleteMirror()
    expect(mocks.files.size).toBe(0)
  })
})

describe('hjälpfunktioner', () => {
  it('backupHasData: bara det användaren själv har lagt in räknas', () => {
    expect(backupHasData(createBackup().data)).toBe(false)
    useProfileStore.getState().updateSettings({ onboardingDone: true })
    useDiaryStore.getState().setWater('2026-09-28', 0)
    expect(backupHasData(createBackup().data)).toBe(false)
    useDiaryStore.getState().setWater('2026-09-28', 250)
    expect(backupHasData(createBackup().data)).toBe(true)
  })

  it('mirrorContents beskriver innehållet', () => {
    const summary = { ...summarizeBackup(createBackup()), days: 12, weights: 1, recipes: 2, customFoods: 1 }
    expect(mirrorContents(summary)).toBe('12 dagar i dagboken, 1 vägning, 2 recept och 1 eget livsmedel')
    expect(mirrorContents({ ...summary, days: 1, weights: 0, recipes: 0, customFoods: 0 })).toBe('1 dag i dagboken')
    expect(mirrorContents({ ...summary, days: 0, weights: 0, recipes: 0, customFoods: 0 })).toBe('')
  })
})
