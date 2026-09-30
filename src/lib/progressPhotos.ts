/**
 * Framstegsbilder – bilder som bara sparas på den egna enheten.
 *
 * Funktionen är avstängd som standard (`settings.progressPhotos`), döljs alltid i medvetet läge och
 * visas aldrig på Idag. Bilderna följer inte med i säkerhetskopian, i den automatiska kopian i
 * apparna eller till molnet, och de delas aldrig ut ur appen.
 *
 * Lagringen:
 * - Webben: en EGEN IndexedDB-databas (`lagom-bilder`, tabellen `bilder`) via idb-keyval – skild
 *   från dagbokens butiker, så att bilderna aldrig hamnar i `STORE_KEYS`, säkerhetskopian eller
 *   Lagom Moln. Varje bild har tre poster: `meta:<id>` (id, datum, bredd, höjd), `full:<id>` och
 *   `thumb:<id>` (JPEG-bytes som `{ type, data: ArrayBuffer }` – ArrayBuffer i stället för Blob
 *   fungerar i alla webbvyer och i testerna).
 * - Apparna: `src/native/photos.ts` (filer i appens egen mapp, på iPhone utanför telefonens
 *   säkerhetskopia) – laddas med `loadNative('photos')`. Går modulen inte att ladda används webbens
 *   väg, så att en bild aldrig går förlorad.
 *
 * Bilderna skalas ned till högst 1 600 px på längsta sidan och sparas som JPEG (kvalitet 0,85) via
 * canvas. Omkodningen tar också bort all EXIF-information, till exempel GPS-position.
 *
 * Alla funktioner här kastar aldrig: fel loggas med `logError` och ger null/false/[].
 */
import { clear, createStore, delMany, get, getMany, keys, setMany, type UseStore } from 'idb-keyval'
import { loadNative } from '../native'
import type { ISODate } from '../types'
import { isValidISODate } from './dates'
import { logError } from './errorLog'
import { uid } from './id'

/** IndexedDB-databasen för bilderna på webben (egen databas, utanför `STORE_KEYS`). */
export const PHOTO_DB_NAME = 'lagom-bilder'
/** Tabellen i databasen. */
export const PHOTO_STORE_NAME = 'bilder'

/** Längsta sidan på en sparad bild. */
export const MAX_PHOTO_SIDE = 1600
/** Längsta sidan på miniatyren i rutnätet. */
export const THUMB_SIDE = 480
/** JPEG-kvalitet vid sparandet. */
export const JPEG_QUALITY = 0.85
/** Större filer än så här läses inte (avkodningen skulle kunna ta slut på minnet). */
export const MAX_INPUT_BYTES = 50 * 1024 * 1024

const LOG_CONTEXT = 'bilder'
const JPEG = 'image/jpeg'

/** En sparad bild utan själva bilddatan. */
export interface ProgressPhotoMeta {
  id: string
  /** Dagen bilden gäller (lokal 'YYYY-MM-DD'). */
  date: ISODate
  width: number
  height: number
  /** När bilden sparades (ms sedan 1970) – ordnar bilder från samma dag. */
  createdAt: number
}

/** Den stora bilden eller miniatyren. */
export type PhotoSize = 'full' | 'thumb'

/** En nedskalad bild som är redo att sparas. */
export interface PreparedPhoto {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

/**
 * Lagringen i apparna – `src/native/photos.ts` uppfyller det här gränssnittet. Funktionerna kastar
 * inte: fel ger null/false och loggas i modulen.
 */
export interface NativePhotoStorage {
  listPhotos(): Promise<ProgressPhotoMeta[] | null>
  readPhoto(id: string, size: PhotoSize): Promise<Blob | null>
  savePhoto(meta: ProgressPhotoMeta, full: Blob, thumb: Blob): Promise<boolean>
  deletePhoto(id: string): Promise<boolean>
  deleteAllPhotos(): Promise<boolean>
  /** Android: ta bort kamerans tillfälliga originalbilder (no-op på iPhone). */
  clearCameraCaptures(): Promise<void>
}

// ---------------------------------------------------------------------------
// Gemensamma hjälpare (används även av src/native/photos.ts)
// ---------------------------------------------------------------------------

/** Id:n som går att använda som filnamn (inga mappar, inga punkter). */
const ID_PATTERN = /^[a-z0-9_-]{1,64}$/i

export function isPhotoId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

const isSide = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 20_000

/** Kontroll av metadata som lästs från lagringen. */
export function isProgressPhotoMeta(value: unknown): value is ProgressPhotoMeta {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Partial<ProgressPhotoMeta>
  return (
    isPhotoId(m.id) &&
    typeof m.date === 'string' &&
    isValidISODate(m.date) &&
    isSide(m.width) &&
    isSide(m.height) &&
    typeof m.createdAt === 'number' &&
    Number.isFinite(m.createdAt)
  )
}

/** Nyaste först: efter datum, sedan efter när bilden sparades. */
export function sortPhotos(photos: readonly ProgressPhotoMeta[]): ProgressPhotoMeta[] {
  return [...photos].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
}

/** Bara giltiga poster, en per id, nyaste först. */
export function cleanPhotoList(values: readonly unknown[]): ProgressPhotoMeta[] {
  const seen = new Set<string>()
  const out: ProgressPhotoMeta[] = []
  for (const v of values) {
    if (!isProgressPhotoMeta(v) || seen.has(v.id)) continue
    seen.add(v.id)
    out.push({ id: v.id, date: v.date, width: v.width, height: v.height, createdAt: v.createdAt })
  }
  return sortPhotos(out)
}

// ---------------------------------------------------------------------------
// Apparna
// ---------------------------------------------------------------------------

/**
 * Modulen `photos` i apparna (registrerad i `MODULES` i src/native/index.ts), eller null på webben.
 * Går den inte att ladda ger `loadNative` null (och loggar felet) och webbens väg används.
 */
async function nativeStorage(): Promise<NativePhotoStorage | null> {
  try {
    return await loadNative('photos')
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return null
  }
}

// ---------------------------------------------------------------------------
// Webben: IndexedDB
// ---------------------------------------------------------------------------

let store: UseStore | null = null
/** Har databasen öppnats (och därmed skapats) under den här körningen? */
let opened = false

function photoStore(): UseStore {
  store ??= createStore(PHOTO_DB_NAME, PHOTO_STORE_NAME)
  opened = true
  return store
}

/**
 * Finns databasen redan? Används för att inte skapa en tom databas bara för att titta eller radera.
 * Går det inte att avgöra (äldre webbläsare) svarar vi ja.
 */
async function photoDbExists(): Promise<boolean> {
  if (opened) return true
  if (typeof indexedDB === 'undefined') return false
  if (typeof indexedDB.databases !== 'function') return true
  try {
    const dbs = await indexedDB.databases()
    return dbs.some((db) => db.name === PHOTO_DB_NAME)
  } catch {
    return true
  }
}

const metaKey = (id: string) => `meta:${id}`
const dataKey = (id: string, size: PhotoSize) => `${size}:${id}`

interface StoredImage {
  type: string
  data: ArrayBuffer
}

function isStoredImage(v: unknown): v is StoredImage {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Partial<StoredImage>
  // ArrayBuffer kan komma från ett annat "realm" (t.ex. i testerna) – kontrollera formen, inte klassen.
  return typeof s.type === 'string' && typeof s.data === 'object' && s.data !== null && typeof (s.data as ArrayBuffer).byteLength === 'number'
}

async function toStored(blob: Blob): Promise<StoredImage> {
  return { type: blob.type || JPEG, data: await blob.arrayBuffer() }
}

async function webList(): Promise<ProgressPhotoMeta[]> {
  if (!(await photoDbExists())) return []
  const s = photoStore()
  const all = await keys<string>(s)
  const metaKeys = all.filter((k) => typeof k === 'string' && k.startsWith('meta:'))
  if (metaKeys.length === 0) return []
  return cleanPhotoList(await getMany(metaKeys, s))
}

async function webRead(id: string, size: PhotoSize): Promise<Blob | null> {
  if (!(await photoDbExists())) return null
  const value: unknown = await get(dataKey(id, size), photoStore())
  if (!isStoredImage(value)) return null
  return new Blob([value.data], { type: value.type })
}

async function webSave(meta: ProgressPhotoMeta, full: Blob, thumb: Blob): Promise<void> {
  const [fullData, thumbData] = await Promise.all([toStored(full), toStored(thumb)])
  // En enda transaktion: antingen finns hela bilden eller ingenting.
  await setMany(
    [
      [dataKey(meta.id, 'full'), fullData],
      [dataKey(meta.id, 'thumb'), thumbData],
      [metaKey(meta.id), meta],
    ],
    photoStore(),
  )
}

async function webDelete(id: string): Promise<void> {
  if (!(await photoDbExists())) return
  await delMany([metaKey(id), dataKey(id, 'full'), dataKey(id, 'thumb')], photoStore())
}

async function webDeleteAll(): Promise<void> {
  if (!(await photoDbExists())) return
  await clear(photoStore())
}

// ---------------------------------------------------------------------------
// Det publika gränssnittet
// ---------------------------------------------------------------------------

/** Alla sparade bilder (bara metadata), nyaste först. Tom lista om något går fel. */
export async function listProgressPhotos(): Promise<ProgressPhotoMeta[]> {
  try {
    const native = await nativeStorage()
    if (native) {
      const list = await native.listPhotos()
      return list ? cleanPhotoList(list) : []
    }
    return await webList()
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return []
  }
}

/** Själva bilden (eller miniatyren), eller null om den saknas. */
export async function loadProgressPhoto(id: string, size: PhotoSize = 'full'): Promise<Blob | null> {
  if (!isPhotoId(id)) return null
  try {
    const native = await nativeStorage()
    if (native) return await native.readPhoto(id, size)
    return await webRead(id, size)
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return null
  }
}

/**
 * Spara en bild med given metadata (också för "Ångra" efter en radering). true om den sparades.
 * Anroparen kontrollerar `requireAccess('bild')` först.
 */
export async function storeProgressPhoto(meta: ProgressPhotoMeta, full: Blob, thumb: Blob): Promise<boolean> {
  if (!isProgressPhotoMeta(meta)) return false
  try {
    const native = await nativeStorage()
    if (native) return await native.savePhoto(meta, full, thumb)
    await webSave(meta, full, thumb)
    return true
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return false
  }
}

/** Spara en nedskalad bild för `date`. Ger den nya bildens metadata, eller null om det inte gick. */
export async function addProgressPhoto(photo: PreparedPhoto, date: ISODate): Promise<ProgressPhotoMeta | null> {
  const meta: ProgressPhotoMeta = { id: uid('bild_'), date, width: photo.width, height: photo.height, createdAt: Date.now() }
  return (await storeProgressPhoto(meta, photo.full, photo.thumb)) ? meta : null
}

/** Radera en bild. true om den är borta (även om den redan saknades). */
export async function deleteProgressPhoto(id: string): Promise<boolean> {
  if (!isPhotoId(id)) return false
  try {
    const native = await nativeStorage()
    if (native) return await native.deletePhoto(id)
    await webDelete(id)
    return true
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return false
  }
}

/**
 * Radera alla framstegsbilder – både filerna i apparna och databasen i webbvyn. Anropas av
 * "Radera alla bilder" och av "Radera all data" (features/settings/wipe.ts). true om allt är borta.
 */
export async function deleteAllProgressPhotos(): Promise<boolean> {
  let ok = true
  try {
    const native = await nativeStorage()
    if (native && !(await native.deleteAllPhotos())) ok = false
  } catch (error) {
    logError(error, LOG_CONTEXT)
    ok = false
  }
  try {
    await webDeleteAll()
  } catch (error) {
    logError(error, LOG_CONTEXT)
    ok = false
  }
  return ok
}

/**
 * Ta bort originalbilder som kameran har lämnat kvar i apparna (Android skriver en tillfällig fil
 * i full storlek, med EXIF, när en bild tas med "Ta en bild"). Anropas när den valda bilden har
 * skalats ned och när sidan öppnas. No-op på webben. Kastar aldrig.
 */
export async function clearCameraCaptures(): Promise<void> {
  try {
    const native = await nativeStorage()
    await native?.clearCameraCaptures()
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

// ---------------------------------------------------------------------------
// Nedskalning
// ---------------------------------------------------------------------------

/** Storleken efter nedskalning så att längsta sidan blir högst `max` (aldrig uppskalning). */
export function scaledSize(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!(longest > 0)) return { width: 0, height: 0 }
  const scale = Math.min(1, max / longest)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

type Drawable = CanvasImageSource & { width: number; height: number }

/** Så mycket av filens början som läses för att hitta bildens storlek (JPEG:s SOF ligger efter EXIF). */
const HEADER_BYTES = 512 * 1024
/** JPEG-markörer med bildens storlek (SOF0–SOF15 utom DHT, JPG och DAC). */
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])

/**
 * Bildens lagrade storlek ur filhuvudet (JPEG eller PNG) – utan att avkoda bilden. Orienteringen
 * (EXIF) räknas inte in. null för andra format eller om huvudet inte går att tolka.
 */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer())
  } catch {
    return null
  }
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1]
  const u32 = (i: number) => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]
  // PNG: signaturen och sedan IHDR med bredd och höjd.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const width = u32(16)
    const height = u32(20)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    // Utfyllnad (flera 0xFF i rad) och markörer utan längd.
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null
    if (SOF_MARKERS.has(marker)) {
      if (i + 8 >= bytes.length) return null
      const height = u16(i + 5)
      const width = u16(i + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    const length = u16(i + 2)
    if (length < 2) return null
    i += 2 + length
  }
  return null
}

/**
 * Avkoda bilden med rätt orientering (EXIF). createImageBitmap med `imageOrientation: 'from-image'`
 * i första hand; annars ett <img>, som webbläsarna också vrider rätt.
 *
 * Stora bilder (längsta sidan över 2 × `MAX_PHOTO_SIDE`, t.ex. 48 MP ≈ 195 MB okomprimerat) avkodas
 * direkt till ungefär rätt storlek med `resizeWidth` – annars kan webbvyn få slut på minne. Bara
 * bredden anges, så att proportionerna alltid behålls oavsett om webbläsaren vrider bilden före
 * eller efter storleksändringen; den slutliga nedskalningen görs sedan på canvas.
 */
async function decode(file: Blob): Promise<{ source: Drawable; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const size = await readImageSize(file)
    const longest = size ? Math.max(size.width, size.height) : 0
    if (size && longest > MAX_PHOTO_SIDE * 2) {
      try {
        const resizeWidth = Math.max(1, Math.round((MAX_PHOTO_SIDE * size.width) / longest))
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth, resizeQuality: 'high' })
        return { source: bitmap, release: () => bitmap.close() }
      } catch {
        /* storleksändringen stöds inte – avkoda som vanligt nedan */
      }
    }
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, release: () => bitmap.close() }
    } catch {
      /* äldre webbläsare eller okänt alternativ – prova med <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Bilden gick inte att läsa'))
      img.src = url
    })
    const source = Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight })
    return { source, release: () => img.removeAttribute('src') }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Rita `source` på en ny canvas med längsta sidan högst `max`. */
function drawScaled(source: Drawable, max: number): HTMLCanvasElement | null {
  const { width, height } = scaledSize(source.width, source.height, max)
  if (width === 0) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // JPEG saknar genomskinlighet – vit bakgrund i stället för svart bakom t.ex. en PNG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), JPEG, JPEG_QUALITY))
}

/** Frigör canvasens minne direkt (Safari har en låg gräns för canvasminne). */
function releaseCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

/**
 * Skala ned en vald eller tagen bild: högst `MAX_PHOTO_SIDE` px på längsta sidan, JPEG med kvalitet
 * `JPEG_QUALITY`, plus en miniatyr. Omkodningen tar bort EXIF (till exempel GPS-position). Ger null
 * om filen inte är en bild som går att läsa (felet loggas inte – det är väntat, t.ex. HEIC på en
 * dator).
 */
export async function prepareProgressPhoto(file: Blob): Promise<PreparedPhoto | null> {
  if (file.size === 0 || file.size > MAX_INPUT_BYTES) return null
  if (file.type && !file.type.startsWith('image/')) return null
  let decoded: { source: Drawable; release: () => void } | null = null
  let full: HTMLCanvasElement | null = null
  let small: HTMLCanvasElement | null = null
  try {
    try {
      decoded = await decode(file)
    } catch {
      return null
    }
    full = drawScaled(decoded.source, MAX_PHOTO_SIDE)
    // Den avkodade originalbilden behövs inte längre – släpp den innan miniatyren ritas.
    decoded.release()
    decoded = null
    if (!full) return null
    small = drawScaled(full, THUMB_SIDE)
    if (!small) return null
    const [fullBlob, thumbBlob] = await Promise.all([toJpeg(full), toJpeg(small)])
    if (!fullBlob || !thumbBlob) return null
    return { full: fullBlob, thumb: thumbBlob, width: full.width, height: full.height }
  } catch (error) {
    logError(error, LOG_CONTEXT)
    return null
  } finally {
    decoded?.release()
    releaseCanvas(full)
    releaseCanvas(small)
  }
}

/** Endast för tester: glöm den öppna databasen. */
export function resetProgressPhotosForTests(): void {
  store = null
  opened = false
}
