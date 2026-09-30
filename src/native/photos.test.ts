/**
 * Framstegsbilder i apparna: filer i appens egen mapp (mockat filsystem) – rätt mapp per
 * plattform, index som skrivs säkert, radering, skydd mot konstiga id och att inget kastar.
 */
import { Directory, Encoding } from '@capacitor/filesystem'
import type { NativePhotoStorage, ProgressPhotoMeta } from '../lib/progressPhotos'
import * as photos from './photos'
import {
  base64ToBlob,
  blobToBase64,
  CAMERA_DIR,
  clearCameraCaptures,
  deleteAllPhotos,
  deletePhoto,
  INDEX_FILE,
  INDEX_TMP_FILE,
  listPhotos,
  photoDirectory,
  readPhoto,
  resetPhotosForTests,
  savePhoto,
} from './photos'

type FsOptions = { path: string; directory?: string; data?: string; encoding?: string; recursive?: boolean }
type RenameOptions = { from: string; to: string; directory?: string; toDirectory?: string }

const mocks = vi.hoisted(() => {
  const files = new Map<string, string>()
  const key = (directory: string | undefined, path: string) => `${directory ?? ''}/${path}`
  const notFound = (method: string, path: string) =>
    Object.assign(new Error(`'${method}' failed because file at '${path}' does not exist.`), { code: 'OS-PLUG-FILE-0008' })
  return {
    files,
    key,
    platform: 'android' as 'ios' | 'android' | 'web',
    failWrite: null as RegExp | null,
    writeFile: vi.fn(async (o: FsOptions) => {
      if (mocks.failWrite?.test(o.path)) throw new Error('Disken är full')
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
    readdir: vi.fn(async (o: FsOptions) => {
      const prefix = key(o.directory, `${o.path}/`)
      const names = [...files.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length))
      if (names.length === 0) throw notFound('readdir', o.path)
      return { files: names.map((name) => ({ name, type: 'file' })) }
    }),
    rmdir: vi.fn(async (o: FsOptions) => {
      const prefix = key(o.directory, `${o.path}/`)
      const matching = [...files.keys()].filter((k) => k.startsWith(prefix))
      if (matching.length === 0) throw notFound('rmdir', o.path)
      matching.forEach((k) => files.delete(k))
    }),
    logError: vi.fn(),
  }
})

vi.mock('@capacitor/filesystem', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/filesystem')>()),
  Filesystem: {
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    deleteFile: mocks.deleteFile,
    rename: mocks.rename,
    readdir: mocks.readdir,
    rmdir: mocks.rmdir,
  },
}))
vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  nativePlatform: () => mocks.platform,
}))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))

const meta = (id: string, date: string, createdAt = 0): ProgressPhotoMeta => ({ id, date, width: 1200, height: 1600, createdAt })
const jpeg = (...values: number[]) => new Blob([new Uint8Array(values)], { type: 'image/jpeg' })
const bytes = async (blob: Blob | null) => (blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null)
const fileAt = (directory: Directory, path: string) => mocks.files.get(mocks.key(directory, path))

beforeEach(() => {
  mocks.files.clear()
  mocks.platform = 'android'
  mocks.failWrite = null
  mocks.logError.mockReset()
  mocks.writeFile.mockClear()
  resetPhotosForTests()
})

it('uppfyller gränssnittet som src/lib/progressPhotos.ts använder', () => {
  const storage: NativePhotoStorage = photos
  expect(typeof storage.listPhotos).toBe('function')
})

it('lägger bilderna i Library/NoCloud på iPhone och i appens filmapp på Android', () => {
  mocks.platform = 'ios'
  expect(photoDirectory()).toBe(Directory.LibraryNoCloud)
  mocks.platform = 'android'
  expect(photoDirectory()).toBe(Directory.Data)
})

describe.each(['ios', 'android'] as const)('%s', (platform) => {
  beforeEach(() => {
    mocks.platform = platform
  })

  it('sparar två JPEG-filer och ett index, listar och läser dem', async () => {
    const dir = platform === 'ios' ? Directory.LibraryNoCloud : Directory.Data
    expect(await listPhotos()).toEqual([])
    expect(await savePhoto(meta('bild_a', '2026-08-01'), jpeg(1, 2, 3), jpeg(4))).toBe(true)
    expect(await savePhoto(meta('bild_b', '2026-09-01'), jpeg(5, 6), jpeg(7))).toBe(true)

    // Binära filer skrivs som base64 (utan teckenkodning) i mappen framsteg/.
    expect(fileAt(dir, 'framsteg/bild_a.jpg')).toBe(btoa(String.fromCharCode(1, 2, 3)))
    expect(fileAt(dir, 'framsteg/bild_a-liten.jpg')).toBe(btoa(String.fromCharCode(4)))
    const photoWrite = mocks.writeFile.mock.calls.find(([o]) => o.path === 'framsteg/bild_a.jpg')?.[0]
    expect(photoWrite?.encoding).toBeUndefined()
    expect(photoWrite?.directory).toBe(dir)

    // Indexet skrivs via en tillfällig fil som byter namn.
    expect(fileAt(dir, INDEX_TMP_FILE)).toBeUndefined()
    const index = JSON.parse(fileAt(dir, INDEX_FILE) ?? '{}') as { photos: ProgressPhotoMeta[] }
    expect(index.photos.map((p) => p.id)).toEqual(['bild_b', 'bild_a'])
    expect(mocks.writeFile.mock.calls.find(([o]) => o.path === INDEX_TMP_FILE)?.[0].encoding).toBe(Encoding.UTF8)

    expect((await listPhotos())?.map((p) => p.id)).toEqual(['bild_b', 'bild_a'])
    expect(await bytes(await readPhoto('bild_a', 'full'))).toEqual([1, 2, 3])
    expect(await bytes(await readPhoto('bild_a', 'thumb'))).toEqual([4])
    expect((await readPhoto('bild_b', 'full'))?.type).toBe('image/jpeg')
  })

  it('raderar en bild (index och filer) och alla bilder (hela mappen)', async () => {
    const dir = photoDirectory()
    await savePhoto(meta('bild_a', '2026-08-01'), jpeg(1), jpeg(2))
    await savePhoto(meta('bild_b', '2026-09-01'), jpeg(3), jpeg(4))

    expect(await deletePhoto('bild_a')).toBe(true)
    expect((await listPhotos())?.map((p) => p.id)).toEqual(['bild_b'])
    expect(fileAt(dir, 'framsteg/bild_a.jpg')).toBeUndefined()
    expect(fileAt(dir, 'framsteg/bild_a-liten.jpg')).toBeUndefined()
    expect(await readPhoto('bild_a', 'full')).toBeNull()
    // En bild som redan är borta är inget fel.
    expect(await deletePhoto('bild_a')).toBe(true)

    expect(await deleteAllPhotos()).toBe(true)
    expect(mocks.rmdir).toHaveBeenLastCalledWith({ path: 'framsteg', directory: dir, recursive: true })
    expect([...mocks.files.keys()]).toEqual([])
    expect(await listPhotos()).toEqual([])
    // Mappen finns inte längre – ändå klart.
    expect(await deleteAllPhotos()).toBe(true)
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})

it('godtar bara id som går att använda som filnamn', async () => {
  expect(await savePhoto(meta('../../Documents/x', '2026-08-01'), jpeg(1), jpeg(2))).toBe(false)
  expect(await readPhoto('../index', 'full')).toBeNull()
  expect(await readPhoto('a/b', 'thumb')).toBeNull()
  expect(await deletePhoto('..')).toBe(false)
  expect(mocks.writeFile).not.toHaveBeenCalled()
})

it('ett misslyckat sparande städar bort filerna och ändrar inte indexet', async () => {
  const dir = photoDirectory()
  await savePhoto(meta('bild_a', '2026-08-01'), jpeg(1), jpeg(2))
  mocks.failWrite = /index/
  expect(await savePhoto(meta('bild_b', '2026-09-01'), jpeg(3), jpeg(4))).toBe(false)
  expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:bilder')
  expect(fileAt(dir, 'framsteg/bild_b.jpg')).toBeUndefined()
  expect(fileAt(dir, 'framsteg/bild_b-liten.jpg')).toBeUndefined()
  mocks.failWrite = null
  expect((await listPhotos())?.map((p) => p.id)).toEqual(['bild_a'])
})

it('ett trasigt index läses från den tillfälliga filen, annars byggs det om ur filerna', async () => {
  const dir = photoDirectory()
  // Ett JPEG-huvud (SOF0) med höjd 1600 och bredd 1200.
  const header = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x06, 0x40, 0x04, 0xb0, 0x03]
  await savePhoto(meta('bild_a', '2026-08-01'), jpeg(...header), jpeg(2))
  const good = fileAt(dir, INDEX_FILE) ?? ''
  mocks.files.set(mocks.key(dir, INDEX_FILE), '{"photos": [')
  mocks.files.set(mocks.key(dir, INDEX_TMP_FILE), good)
  expect((await listPhotos())?.map((p) => p.id)).toEqual(['bild_a'])

  // Båda trasiga: bilden finns kvar i vyn (datum från filens ändringstid) och indexet skrivs på nytt.
  mocks.files.set(mocks.key(dir, INDEX_TMP_FILE), 'trasig')
  const listed = await listPhotos()
  expect(listed).toEqual([expect.objectContaining({ id: 'bild_a', width: 1200, height: 1600 })])
  expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:bilder')
  expect((JSON.parse(fileAt(dir, INDEX_FILE) ?? '{}') as { photos: ProgressPhotoMeta[] }).photos.map((p) => p.id)).toEqual(['bild_a'])
  // Nya bilder går att spara igen.
  expect(await savePhoto(meta('bild_b', '2026-09-01'), jpeg(3), jpeg(4))).toBe(true)
  expect((await listPhotos())?.map((p) => p.id).sort()).toEqual(['bild_a', 'bild_b'])
})

it('hoppar över trasiga poster i indexet', async () => {
  const dir = photoDirectory()
  mocks.files.set(mocks.key(dir, INDEX_FILE), JSON.stringify({ version: 1, photos: [meta('bild_a', '2026-08-01'), { id: '../x' }, 'text'] }))
  expect((await listPhotos())?.map((p) => p.id)).toEqual(['bild_a'])
})

it('base64 fram och tillbaka, även stora filer och med data:-prefix', async () => {
  const big = new Uint8Array(100_000).map((_, i) => i % 256)
  const encoded = await blobToBase64(new Blob([big]))
  expect(await bytes(base64ToBlob(encoded))).toEqual(Array.from(big))
  expect(await bytes(base64ToBlob(`data:image/jpeg;base64,${btoa('\x01\x02')}`))).toEqual([1, 2])
})

describe('kamerans tillfälliga originalbilder', () => {
  const camera = (name: string) => mocks.key(Directory.External, `${CAMERA_DIR}/${name}`)

  it('tas bort på Android – bara kamerans egna filer', async () => {
    mocks.platform = 'android'
    mocks.files.set(camera('JPEG_20260929_101500_123456789.jpg'), 'original')
    mocks.files.set(camera('JPEG_20260929_101501_987.jpg'), '')
    mocks.files.set(camera('semester.jpg'), 'annat')
    await clearCameraCaptures()
    // Kvar: bara det som inte är kamerans – och en .nomedia så att galleriappar inte visar mappen.
    expect([...mocks.files.keys()].sort()).toEqual([camera('.nomedia'), camera('semester.jpg')])
    mocks.writeFile.mockClear()
    await clearCameraCaptures()
    expect(mocks.writeFile).not.toHaveBeenCalled()
    // Ingen mapp alls är inget fel.
    mocks.files.clear()
    await clearCameraCaptures()
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('tas bort vid "Radera alla bilder"', async () => {
    mocks.platform = 'android'
    await savePhoto(meta('bild_a', '2026-08-01'), jpeg(1), jpeg(2))
    mocks.files.set(camera('JPEG_20260929_101500_1.jpg'), 'original')
    expect(await deleteAllPhotos()).toBe(true)
    expect([...mocks.files.keys()]).toEqual([camera('.nomedia')])
  })

  it('gör inget på iPhone', async () => {
    mocks.platform = 'ios'
    mocks.readdir.mockClear()
    await clearCameraCaptures()
    expect(mocks.readdir).not.toHaveBeenCalled()
  })
})
