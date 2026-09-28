import { Directory, Encoding } from '@capacitor/filesystem'
import { clearExportCache, EXPORT_DIR, isShareCancel, safeFilename, saveFile, shareText } from './files'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(async (options: { path: string }) => ({ uri: `file:///var/mobile/Library/Caches/${options.path}` })),
  rmdir: vi.fn(async (_options: unknown) => {}),
  share: vi.fn(async (_options: unknown) => ({ activityType: 'com.apple.UIKit.activity.SaveToFiles' })),
  logError: vi.fn(),
}))

// Tilläggets riktiga Directory/Encoding behålls – bara anropen till telefonen byts ut.
vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/filesystem')>()),
  Filesystem: { writeFile: mocks.writeFile, rmdir: mocks.rmdir },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }))
vi.mock('../lib/errorLog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/errorLog')>()),
  logError: mocks.logError,
}))

/** Felet som Capacitor Share avvisar med när bladet stängs (samma text på iOS och Android). */
const cancelled = () => Object.assign(new Error('Share canceled'), { code: 'UNIMPLEMENTED' })

afterEach(() => {
  mocks.writeFile.mockClear()
  mocks.rmdir.mockReset()
  mocks.rmdir.mockImplementation(async () => {})
  mocks.share.mockReset()
  mocks.share.mockImplementation(async () => ({ activityType: 'com.apple.UIKit.activity.SaveToFiles' }))
  mocks.logError.mockReset()
})

describe('saveFile (export via delningsbladet)', () => {
  it('skriver säkerhetskopian till cachen och öppnar delningsbladet', async () => {
    const json = '{"format":"lagom-backup","version":1}'
    await expect(saveFile('lagom-sakerhetskopia-2026-09-28.json', json)).resolves.toBe('shared')

    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: `${EXPORT_DIR}/lagom-sakerhetskopia-2026-09-28.json`,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    expect(mocks.share).toHaveBeenCalledWith({
      title: 'lagom-sakerhetskopia-2026-09-28.json',
      files: ['file:///var/mobile/Library/Caches/delning/lagom-sakerhetskopia-2026-09-28.json'],
      dialogTitle: 'Spara eller dela',
    })
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('tar bort tidigare exporter innan en ny skrivs', async () => {
    await saveFile('lagom-dagbok-2026-09-28.csv', 'a;b', 'text/csv')
    expect(mocks.rmdir).toHaveBeenCalledWith({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true })
    expect(mocks.rmdir.mock.invocationCallOrder[0]).toBeLessThan(mocks.writeFile.mock.invocationCallOrder[0])
  })

  it('en misslyckad rensning stoppar inte exporten', async () => {
    mocks.rmdir.mockRejectedValueOnce(new Error("'rmdir' failed because file does not exist."))
    await expect(saveFile('lagom-dagbok.csv', 'a;b', 'text/csv')).resolves.toBe('shared')
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('CSV:en skrivs oförändrad, med BOM, och kan få en egen ämnesrad', async () => {
    const csv = '﻿Datum;Måltid\r\n2026-09-28;Frukost'
    await saveFile('lagom-dagbok-2026-09-28.csv', csv, 'text/csv', { title: 'Min dagbok' })
    expect(mocks.writeFile.mock.calls[0][0]).toMatchObject({ data: csv, encoding: Encoding.UTF8 })
    expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ title: 'Min dagbok' }))
  })

  it('ett stängt delningsblad är cancelled och loggas inte', async () => {
    mocks.share.mockRejectedValueOnce(cancelled())
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('cancelled')
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('går filen inte att skriva blir det failed, utan delningsblad', async () => {
    mocks.writeFile.mockRejectedValueOnce(new Error('disken är full'))
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('failed')
    expect(mocks.share).not.toHaveBeenCalled()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:files')
  })

  it('ett annat fel vid delningen blir failed och loggas', async () => {
    mocks.share.mockRejectedValueOnce(new Error('only file urls are supported'))
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('failed')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:files')
  })

  it('ett dubbeltryck öppnar inte två delningsblad', async () => {
    let finish: (value: { activityType: string }) => void = () => {}
    mocks.share.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
    const first = saveFile('lagom.json', '{}')
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('cancelled')
    await vi.waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1))
    finish({ activityType: '' })
    await expect(first).resolves.toBe('shared')
    // När bladet är stängt går det att dela igen.
    await expect(saveFile('lagom.json', '{}')).resolves.toBe('shared')
    expect(mocks.share).toHaveBeenCalledTimes(2)
  })
})

describe('shareText', () => {
  it('delar texten med delningsbladet', async () => {
    await expect(shareText('Måndag 28 september', 'Frukost: gröt')).resolves.toBe('shared')
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Måndag 28 september', text: 'Frukost: gröt', dialogTitle: 'Dela' })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('stängt blad är cancelled, andra fel failed (anroparen kan då kopiera i stället)', async () => {
    mocks.share.mockRejectedValueOnce(cancelled())
    await expect(shareText('Titel', 'Text')).resolves.toBe('cancelled')
    expect(mocks.logError).not.toHaveBeenCalled()
    mocks.share.mockRejectedValueOnce(new Error('Must provide a URL or Message or files'))
    await expect(shareText('Titel', 'Text')).resolves.toBe('failed')
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:files')
  })
})

describe('clearExportCache', () => {
  it('rensar exportmappen och kastar aldrig', async () => {
    await expect(clearExportCache()).resolves.toBeUndefined()
    expect(mocks.rmdir).toHaveBeenCalledWith({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true })
    mocks.rmdir.mockRejectedValueOnce(new Error('finns inte'))
    await expect(clearExportCache()).resolves.toBeUndefined()
  })
})

describe('safeFilename', () => {
  it('behåller vanliga namn', () => {
    expect(safeFilename('lagom-sakerhetskopia-2026-09-28.json', 'application/json')).toBe('lagom-sakerhetskopia-2026-09-28.json')
    expect(safeFilename('Lagom-Dagbok.CSV', 'text/csv; charset=utf-8')).toBe('Lagom-Dagbok.CSV')
    expect(safeFilename('Mjölk & äpplen.txt')).toBe('Mjölk & äpplen.txt')
  })

  it('tar bort mappar, styrtecken och otillåtna tecken', () => {
    expect(safeFilename('../../Library/WebKit/data.json')).toBe('data.json')
    expect(safeFilename('a\\b\\c.csv')).toBe('c.csv')
    expect(safeFilename('...dold')).toBe('dold')
    expect(safeFilename('rad\nbrytning<>:"|?*.json')).toBe('radbrytning.json')
  })

  it('lägger till filändelse efter filtyp och ersätter tomma namn', () => {
    expect(safeFilename('dagbok', 'text/csv')).toBe('dagbok.csv')
    expect(safeFilename('kopia', 'application/json')).toBe('kopia.json')
    expect(safeFilename('', 'application/json')).toBe('lagom-export.json')
    expect(safeFilename('../', undefined)).toBe('lagom-export')
    expect(safeFilename('okänd', 'application/octet-stream')).toBe('okänd')
  })

  it('kortar långa namn men behåller filändelsen', () => {
    const name = safeFilename(`${'x'.repeat(300)}.json`)
    expect(name.length).toBe(120)
    expect(name.endsWith('.json')).toBe(true)
  })
})

describe('isShareCancel', () => {
  it('känner igen ett stängt eller redan öppet delningsblad', () => {
    expect(isShareCancel(cancelled())).toBe(true)
    expect(isShareCancel({ message: "Can't share while sharing is in progress" })).toBe(true)
    expect(isShareCancel(new DOMException('Avbrutet', 'AbortError'))).toBe(true)
  })

  it('annat är riktiga fel', () => {
    expect(isShareCancel(new Error('Unsupported url'))).toBe(false)
    expect(isShareCancel('Share canceled')).toBe(false)
    expect(isShareCancel(null)).toBe(false)
  })
})
