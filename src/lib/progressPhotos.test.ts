/**
 * Framstegsbilder: lagringen på webben (egen IndexedDB-databas, fake-indexeddb), vägen via
 * native-modulen i apparna (mockad), nedskalningen (mockad canvas och createImageBitmap) och att
 * inget kastar.
 */
import { IDBFactory } from 'fake-indexeddb'
import { createStore, keys, set } from 'idb-keyval'
import {
  addProgressPhoto,
  cleanPhotoList,
  clearCameraCaptures,
  deleteAllProgressPhotos,
  deleteProgressPhoto,
  isProgressPhotoMeta,
  JPEG_QUALITY,
  listProgressPhotos,
  loadProgressPhoto,
  MAX_INPUT_BYTES,
  PHOTO_DB_NAME,
  PHOTO_STORE_NAME,
  prepareProgressPhoto,
  readImageSize,
  resetProgressPhotosForTests,
  scaledSize,
  sortPhotos,
  storeProgressPhoto,
  type NativePhotoStorage,
  type PreparedPhoto,
  type ProgressPhotoMeta,
} from './progressPhotos'

const mocks = vi.hoisted(() => ({
  native: null as unknown,
  loadError: null as Error | null,
  logError: vi.fn(),
}))

vi.mock('../native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../native')>()),
  loadNative: vi.fn(async (name: string) => {
    if (mocks.loadError) throw mocks.loadError
    return name === 'photos' ? mocks.native : null
  }),
}))
vi.mock('./errorLog', () => ({ logError: mocks.logError }))

const bytes = async (blob: Blob | null) => (blob ? Array.from(new Uint8Array(await blob.arrayBuffer())) : null)

function prepared(fill = 1): PreparedPhoto {
  return {
    full: new Blob([new Uint8Array([fill, fill, fill, 9])], { type: 'image/jpeg' }),
    thumb: new Blob([new Uint8Array([fill, 7])], { type: 'image/jpeg' }),
    width: 1200,
    height: 1600,
  }
}

const meta = (id: string, date: string, createdAt = 0): ProgressPhotoMeta => ({ id, date, width: 1200, height: 1600, createdAt })

beforeEach(() => {
  // En ny, tom IndexedDB för varje test.
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetProgressPhotosForTests()
  mocks.native = null
  mocks.loadError = null
  mocks.logError.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('webben: egen IndexedDB-databas', () => {
  it('skapar ingen databas bara för att titta eller radera', async () => {
    expect(await listProgressPhotos()).toEqual([])
    expect(await loadProgressPhoto('bild_abc')).toBeNull()
    expect(await deleteAllProgressPhotos()).toBe(true)
    const dbs = await indexedDB.databases()
    expect(dbs.map((d) => d.name)).not.toContain(PHOTO_DB_NAME)
  })

  it('sparar, listar, läser och raderar bilder', async () => {
    const a = await addProgressPhoto(prepared(1), '2026-08-01')
    const b = await addProgressPhoto(prepared(2), '2026-09-15')
    expect(a).toMatchObject({ date: '2026-08-01', width: 1200, height: 1600 })
    expect(a?.id).toMatch(/^bild_[a-z0-9]+$/)

    const list = await listProgressPhotos()
    expect(list.map((p) => p.id)).toEqual([b?.id, a?.id]) // nyaste först

    expect(await bytes(await loadProgressPhoto(a!.id, 'full'))).toEqual([1, 1, 1, 9])
    expect(await bytes(await loadProgressPhoto(a!.id, 'thumb'))).toEqual([1, 7])
    expect((await loadProgressPhoto(b!.id))?.type).toBe('image/jpeg')

    expect(await deleteProgressPhoto(a!.id)).toBe(true)
    expect((await listProgressPhotos()).map((p) => p.id)).toEqual([b?.id])
    expect(await loadProgressPhoto(a!.id)).toBeNull()
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('bilderna ligger i en egen databas, skild från dagboken', async () => {
    const saved = await addProgressPhoto(prepared(), '2026-09-01')
    const own = createStore(PHOTO_DB_NAME, PHOTO_STORE_NAME)
    const stored = await keys<string>(own)
    expect(stored.sort()).toEqual([`full:${saved!.id}`, `meta:${saved!.id}`, `thumb:${saved!.id}`])
    // Inget i idb-keyvals standarddatabas (där dagbokens butiker ligger).
    expect(await keys()).toEqual([])
  })

  it('"Radera alla" tömmer databasen', async () => {
    await addProgressPhoto(prepared(1), '2026-08-01')
    await addProgressPhoto(prepared(2), '2026-08-02')
    expect(await deleteAllProgressPhotos()).toBe(true)
    expect(await listProgressPhotos()).toEqual([])
    expect(await keys(createStore(PHOTO_DB_NAME, PHOTO_STORE_NAME))).toEqual([])
  })

  it('en raderad bild kan läggas tillbaka med samma metadata (Ångra)', async () => {
    const saved = await addProgressPhoto(prepared(3), '2026-07-07')
    const full = await loadProgressPhoto(saved!.id, 'full')
    const thumb = await loadProgressPhoto(saved!.id, 'thumb')
    await deleteProgressPhoto(saved!.id)
    expect(await storeProgressPhoto(saved!, full!, thumb!)).toBe(true)
    expect(await listProgressPhotos()).toEqual([saved])
    expect(await bytes(await loadProgressPhoto(saved!.id))).toEqual([3, 3, 3, 9])
  })

  it('hoppar över trasiga poster och ogiltiga id', async () => {
    const saved = await addProgressPhoto(prepared(), '2026-09-01')
    const own = createStore(PHOTO_DB_NAME, PHOTO_STORE_NAME)
    await set('meta:trasig', { id: 'trasig', date: 'igår', width: 1, height: 1, createdAt: 0 }, own)
    await set('meta:../x', { nonsense: true }, own)
    await set('full:utan-data', 'text', own)
    expect((await listProgressPhotos()).map((p) => p.id)).toEqual([saved!.id])
    expect(await loadProgressPhoto('utan-data')).toBeNull()
    expect(await loadProgressPhoto('../../hemligt')).toBeNull()
    expect(await deleteProgressPhoto('../x')).toBe(false)
    expect(await storeProgressPhoto(meta('../x', '2026-01-01'), prepared().full, prepared().thumb)).toBe(false)
  })
})

describe('apparna: native-modulen', () => {
  function fakeNative(overrides: Partial<NativePhotoStorage> = {}): NativePhotoStorage {
    return {
      listPhotos: vi.fn(async () => [meta('bild_a', '2026-08-01'), meta('bild_b', '2026-09-01'), { trasig: true } as unknown as ProgressPhotoMeta]),
      readPhoto: vi.fn(async () => new Blob([new Uint8Array([5])], { type: 'image/jpeg' })),
      savePhoto: vi.fn(async () => true),
      deletePhoto: vi.fn(async () => true),
      deleteAllPhotos: vi.fn(async () => true),
      clearCameraCaptures: vi.fn(async () => {}),
      ...overrides,
    }
  }

  it('använder filerna i appen i stället för IndexedDB', async () => {
    const native = fakeNative()
    mocks.native = native
    expect((await listProgressPhotos()).map((p) => p.id)).toEqual(['bild_b', 'bild_a'])
    expect(await bytes(await loadProgressPhoto('bild_a', 'thumb'))).toEqual([5])
    expect(native.readPhoto).toHaveBeenCalledWith('bild_a', 'thumb')

    const saved = await addProgressPhoto(prepared(), '2026-09-29')
    expect(saved).not.toBeNull()
    expect(native.savePhoto).toHaveBeenCalledWith(saved, expect.any(Blob), expect.any(Blob))
    expect(await deleteProgressPhoto('bild_a')).toBe(true)
    expect(native.deletePhoto).toHaveBeenCalledWith('bild_a')

    // Inget hamnade i webbvyns IndexedDB.
    expect((await indexedDB.databases()).map((d) => d.name)).not.toContain(PHOTO_DB_NAME)
  })

  it('städar kamerans tillfälliga filer via modulen (no-op på webben)', async () => {
    await expect(clearCameraCaptures()).resolves.toBeUndefined()
    const native = fakeNative()
    mocks.native = native
    await clearCameraCaptures()
    expect(native.clearCameraCaptures).toHaveBeenCalledTimes(1)
    mocks.native = fakeNative({
      clearCameraCaptures: vi.fn(async () => {
        throw new Error('trasigt')
      }),
    })
    await expect(clearCameraCaptures()).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'bilder')
  })

  it('"Radera alla" tar bort både filerna och en eventuell databas i webbvyn', async () => {
    // En bild som sparats i webbvyn (t.ex. när modulen inte gick att ladda).
    await addProgressPhoto(prepared(), '2026-09-01')
    const native = fakeNative()
    mocks.native = native
    expect(await deleteAllProgressPhotos()).toBe(true)
    expect(native.deleteAllPhotos).toHaveBeenCalledTimes(1)
    mocks.native = null
    expect(await listProgressPhotos()).toEqual([])
  })

  it('ett misslyckat sparande ger null, och fel i modulen kastas aldrig vidare', async () => {
    mocks.native = fakeNative({
      savePhoto: vi.fn(async () => false),
      listPhotos: vi.fn(async () => {
        throw new Error('trasigt tillägg')
      }),
      readPhoto: vi.fn(async () => {
        throw new Error('trasigt tillägg')
      }),
      deleteAllPhotos: vi.fn(async () => false),
    })
    expect(await addProgressPhoto(prepared(), '2026-09-29')).toBeNull()
    expect(await listProgressPhotos()).toEqual([])
    expect(await loadProgressPhoto('bild_a')).toBeNull()
    expect(await deleteAllProgressPhotos()).toBe(false)
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'bilder')
  })

  it('går modulen inte att ladda används webbens väg', async () => {
    mocks.loadError = new Error('modulen saknas')
    const saved = await addProgressPhoto(prepared(), '2026-09-29')
    expect(saved).not.toBeNull()
    mocks.loadError = null
    expect((await listProgressPhotos()).map((p) => p.id)).toEqual([saved!.id])
  })
})

describe('hjälpfunktioner', () => {
  it('sorterar nyaste först och ordnar samma dag efter när bilden sparades', () => {
    const list = sortPhotos([meta('a', '2026-01-01', 1), meta('b', '2026-03-01', 1), meta('c', '2026-03-01', 5)])
    expect(list.map((p) => p.id)).toEqual(['c', 'b', 'a'])
  })

  it('rensar dubbletter och ogiltig metadata', () => {
    expect(isProgressPhotoMeta(meta('bild_1', '2026-02-30'))).toBe(false)
    expect(isProgressPhotoMeta({ ...meta('bild_1', '2026-02-01'), width: 0 })).toBe(false)
    expect(isProgressPhotoMeta(meta('bild 1', '2026-02-01'))).toBe(false)
    const cleaned = cleanPhotoList([meta('x', '2026-02-01'), meta('x', '2026-02-02'), null, 'text', { ...meta('y', '2026-02-03'), extra: 1 }])
    expect(cleaned).toEqual([meta('y', '2026-02-03'), meta('x', '2026-02-01')])
  })

  it('skalar ned till längsta sidan och aldrig upp', () => {
    expect(scaledSize(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
    expect(scaledSize(3024, 4032, 1600)).toEqual({ width: 1200, height: 1600 })
    expect(scaledSize(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(scaledSize(0, 0, 1600)).toEqual({ width: 0, height: 0 })
  })
})

describe('nedskalning (mockad canvas)', () => {
  const ctx = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '', imageSmoothingEnabled: false, imageSmoothingQuality: 'low' }
  const toBlobCalls: { width: number; height: number; type?: string; quality?: unknown }[] = []
  const canvases: HTMLCanvasElement[] = []

  beforeEach(() => {
    toBlobCalls.length = 0
    canvases.length = 0
    ctx.drawImage.mockReset()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this)
      return ctx as unknown as CanvasRenderingContext2D
    } as unknown as HTMLCanvasElement['getContext'])
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: unknown) {
      toBlobCalls.push({ width: this.width, height: this.height, type, quality })
      cb(new Blob([`${this.width}x${this.height}`], { type }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ger en JPEG på högst 1 600 px och en miniatyr, med orienteringen från bilden', async () => {
    const close = vi.fn()
    const createImageBitmap = vi.fn(async () => ({ width: 4032, height: 3024, close }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    const file = new File([new Uint8Array(10)], 'IMG_0001.HEIC.jpg', { type: 'image/jpeg' })

    const photo = await prepareProgressPhoto(file)
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
    expect(photo).toMatchObject({ width: 1600, height: 1200 })
    expect(toBlobCalls).toEqual([
      { width: 1600, height: 1200, type: 'image/jpeg', quality: JPEG_QUALITY },
      { width: 480, height: 360, type: 'image/jpeg', quality: JPEG_QUALITY },
    ])
    expect(await photo!.full.text()).toBe('1600x1200')
    expect(await photo!.thumb.text()).toBe('480x360')
    // Originalet och canvasminnet släpps.
    expect(close).toHaveBeenCalled()
    expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true)
    // Miniatyren ritas från den nedskalade bilden, inte från originalet.
    expect(ctx.drawImage.mock.calls[1][0]).toBe(canvases[0])
  })

  it('avkodar stora bilder (t.ex. 48 MP) direkt i mindre storlek – så att minnet räcker', async () => {
    const close = vi.fn()
    const createImageBitmap = vi.fn(async () => ({ width: 1600, height: 1200, close }))
    vi.stubGlobal('createImageBitmap', createImageBitmap)
    // Ett JPEG-huvud: SOI, en APP1 (EXIF) och SOF0 med höjd 6048 och bredd 8064.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x45, 0x78, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x17, 0xa0, 0x1f, 0x80, 0x03])
    const file = new File([jpeg], 'IMG_48MP.jpg', { type: 'image/jpeg' })
    expect(await readImageSize(file)).toEqual({ width: 8064, height: 6048 })
    const photo = await prepareProgressPhoto(file)
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image', resizeWidth: 1600, resizeQuality: 'high' })
    expect(photo).toMatchObject({ width: 1600, height: 1200 })
    expect(close).toHaveBeenCalled()
    // Stående lagrad bild: bredden blir den korta sidan, proportionerna behålls.
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    png.set([0, 0, 0x0b, 0xd0, 0, 0, 0x0f, 0xc0], 16) // 3024 × 4032
    expect(await readImageSize(new Blob([png]))).toEqual({ width: 3024, height: 4032 })
    createImageBitmap.mockClear()
    await prepareProgressPhoto(new File([png], 'stor.png', { type: 'image/png' }))
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: 'from-image', resizeWidth: 1200, resizeQuality: 'high' })
    // Små bilder och okända format avkodas som vanligt (ingen uppskalning).
    expect(await readImageSize(new Blob([new Uint8Array(10)]))).toBeNull()
  })

  it('läser med <img> när createImageBitmap saknas eller inte klarar orienteringen', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new TypeError('imageOrientation stöds inte')
      }),
    )
    const revoke = vi.fn()
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
    class FakeImage {
      naturalWidth = 1000
      naturalHeight = 2000
      width = 0
      height = 0
      decoding = ''
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      removeAttribute = vi.fn()
      set src(_url: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', FakeImage)

    const photo = await prepareProgressPhoto(new Blob([new Uint8Array(4)], { type: 'image/png' }))
    expect(photo).toMatchObject({ width: 800, height: 1600 })
    expect(revoke).toHaveBeenCalledWith('blob:test/1')
  })

  it('ger null för filer som inte är bilder, för stora filer och bilder som inte går att läsa', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('kan inte avkoda')
      }),
    )
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test/2')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    class BrokenImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)

    expect(await prepareProgressPhoto(new Blob(['text'], { type: 'text/plain' }))).toBeNull()
    expect(await prepareProgressPhoto(new Blob([], { type: 'image/jpeg' }))).toBeNull()
    const huge = { size: MAX_INPUT_BYTES + 1, type: 'image/jpeg' } as Blob
    expect(await prepareProgressPhoto(huge)).toBeNull()
    expect(await prepareProgressPhoto(new Blob([new Uint8Array(3)], { type: 'image/heic' }))).toBeNull()
    expect(toBlobCalls).toEqual([])
    // Väntade fel (t.ex. HEIC på en dator) loggas inte.
    expect(mocks.logError).not.toHaveBeenCalled()
  })
})
