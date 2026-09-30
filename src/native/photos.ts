/**
 * Framstegsbilder i de inbyggda apparna – filer i appens egen mapp. Laddas bara via
 * `loadNative('photos')` (src/native/index.ts) från src/lib/progressPhotos.ts – aldrig på webben.
 *
 * - Mappen `framsteg/` ligger i `photoDirectory()`: Library/NoCloud på iPhone (följer inte med i
 *   iCloud- eller datorsäkerhetskopian) och appens filmapp på Android (undantagen från Googles
 *   molnkopia i data_extraction_rules.xml, och FileProvider delar aldrig ut den).
 * - Varje bild är två JPEG-filer: `<id>.jpg` (högst 1 600 px) och `<id>-liten.jpg` (miniatyren).
 *   Metadata (id, datum, bredd, höjd) står i indexfilen `framsteg/index.json`, som skrivs till en
 *   tillfällig fil och sedan byter namn – ett avbrott mitt i en skrivning förstör aldrig indexet.
 *   Skulle både indexet och den tillfälliga filen ändå vara trasiga byggs indexet om ur filerna i
 *   mappen (datum från filens ändringstid), så att bilderna inte försvinner ur vyn.
 * - Alla filoperationer körs en i taget, i tur och ordning.
 * - Android: kamerans tillfälliga originalbilder tas bort (`clearCameraCaptures`) – även vid varje
 *   start av appen (native/init.ts), så att ett original aldrig blir kvar om appen stängdes mitt i.
 * - Funktionerna kastar aldrig: fel loggas med `logError` och ger null/false.
 *
 * Integritet: bilderna lämnar aldrig telefonen genom Lagom – ingen delning, ingen säkerhetskopia,
 * inget moln. "Radera alla bilder" och "Radera all data" tar bort hela mappen.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { logError } from '../lib/errorLog'
import { toISODate } from '../lib/dates'
import { cleanPhotoList, isPhotoId, isProgressPhotoMeta, readImageSize, type PhotoSize, type ProgressPhotoMeta } from '../lib/progressPhotos'
import { nativePlatform } from './index'

/** Mappen med bilderna. */
export const PHOTO_DIR = 'framsteg'
/** Indexfilen med bildernas metadata. */
export const INDEX_FILE = `${PHOTO_DIR}/index.json`
/** Den tillfälliga indexfilen under en skrivning. */
export const INDEX_TMP_FILE = `${PHOTO_DIR}/index.tmp`

const LOG_CONTEXT = 'native:bilder'
const JPEG = 'image/jpeg'

/** Bildernas mapp: Library/NoCloud på iPhone, appens filmapp på Android. */
export function photoDirectory(): Directory {
  return nativePlatform() === 'ios' ? Directory.LibraryNoCloud : Directory.Data
}

/** Sökvägen till en bild (id:t är redan kontrollerat med `isPhotoId`). */
export function photoPath(id: string, size: PhotoSize): string {
  return `${PHOTO_DIR}/${id}${size === 'thumb' ? '-liten' : ''}.jpg`
}

// ---------------------------------------------------------------------------
// Hjälpfunktioner
// ---------------------------------------------------------------------------

/** Alla filoperationer körs en i taget, i tur och ordning. */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op)
  queue = run.catch(() => undefined)
  return run
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return code === 'OS-PLUG-FILE-0008' || (typeof message === 'string' && /does not exist|not found|no such file/i.test(message))
}

/** Blob → base64 (Filesystem skriver binära filer från base64). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  // I bitar – String.fromCharCode tål inte hur många argument som helst.
  const CHUNK = 0x2000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** base64 (eventuellt med data:-prefix) → Blob. */
export function base64ToBlob(data: string, type: string = JPEG): Blob {
  const comma = data.startsWith('data:') ? data.indexOf(',') : -1
  const binary = atob(comma >= 0 ? data.slice(comma + 1) : data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

/** Läs en indexfil: listan, null om filen inte finns. Kastar om filen är trasig. */
async function readIndexFile(path: string): Promise<ProgressPhotoMeta[] | null> {
  let text: string
  try {
    const result = await Filesystem.readFile({ path, directory: photoDirectory(), encoding: Encoding.UTF8 })
    text = typeof result.data === 'string' ? result.data : await result.data.text()
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
  const parsed: unknown = JSON.parse(text)
  const photos = typeof parsed === 'object' && parsed !== null ? (parsed as { photos?: unknown }).photos : undefined
  if (!Array.isArray(photos)) throw new Error('Indexet för framstegsbilder har fel format')
  return cleanPhotoList(photos)
}

/** Stående 3:4 när en bilds storlek inte går att läsa vid ombyggnaden av indexet. */
const FALLBACK_SIZE = { width: 1200, height: 1600 }
const PHOTO_FILE = /^([a-z0-9_-]{1,64})\.jpg$/i

/**
 * Bygg om indexet ur filerna i mappen: varje `<id>.jpg` (inte miniatyrerna) blir en post med datum
 * från filens ändringstid och storleken ur JPEG-huvudet. Tom lista om mappen inte finns.
 */
async function rebuildIndex(): Promise<ProgressPhotoMeta[]> {
  const directory = photoDirectory()
  let files: Array<{ name: string; mtime?: number; ctime?: number }>
  try {
    files = (await Filesystem.readdir({ path: PHOTO_DIR, directory })).files
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
  const photos: ProgressPhotoMeta[] = []
  for (const file of files) {
    const id = PHOTO_FILE.exec(file.name)?.[1]
    if (!id || id.endsWith('-liten') || !isPhotoId(id)) continue
    const stamp = [file.mtime, file.ctime].find((t): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0) ?? Date.now()
    let size = FALLBACK_SIZE
    try {
      const result = await Filesystem.readFile({ path: photoPath(id, 'full'), directory })
      const blob = typeof result.data === 'string' ? base64ToBlob(result.data) : result.data
      size = (await readImageSize(blob)) ?? FALLBACK_SIZE
    } catch {
      /* storleken är inte viktig – bilden visas ändå */
    }
    photos.push({ id, date: toISODate(new Date(stamp)), width: size.width, height: size.height, createdAt: stamp })
  }
  return cleanPhotoList(photos)
}

/**
 * Indexet. Är det trasigt (appen stängdes mitt i en direktskrivning) används den tillfälliga filen,
 * som då är hel. Är båda trasiga byggs indexet om ur filerna i mappen och skrivs på nytt – då
 * försvinner inga bilder ur vyn och nya kan sparas. Kastar bara om inte ens mappen går att läsa.
 */
async function readIndex(): Promise<ProgressPhotoMeta[]> {
  try {
    return (await readIndexFile(INDEX_FILE)) ?? []
  } catch (error) {
    const fallback = await readIndexFile(INDEX_TMP_FILE).catch(() => null)
    if (fallback) return fallback
    logError(error, LOG_CONTEXT)
    const rebuilt = await rebuildIndex()
    await writeIndex(rebuilt)
    return rebuilt
  }
}

async function writeIndex(photos: readonly ProgressPhotoMeta[]): Promise<void> {
  const directory = photoDirectory()
  const data = JSON.stringify({ version: 1, photos })
  await Filesystem.writeFile({ path: INDEX_TMP_FILE, data, directory, encoding: Encoding.UTF8, recursive: true })
  try {
    await Filesystem.rename({ from: INDEX_TMP_FILE, to: INDEX_FILE, directory, toDirectory: directory })
  } catch {
    // Namnbytet gick inte (t.ex. om målet inte fick skrivas över): skriv indexet direkt.
    await Filesystem.writeFile({ path: INDEX_FILE, data, directory, encoding: Encoding.UTF8, recursive: true })
    await Filesystem.deleteFile({ path: INDEX_TMP_FILE, directory }).catch(() => {})
  }
}

/** Ta bort en fil (tyst om den inte finns). */
async function removeFile(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: photoDirectory() })
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
}

// ---------------------------------------------------------------------------
// Gränssnittet (NativePhotoStorage i src/lib/progressPhotos.ts)
// ---------------------------------------------------------------------------

/** Alla bilder i indexet, nyaste först – null om indexet inte gick att läsa. */
export function listPhotos(): Promise<ProgressPhotoMeta[] | null> {
  return enqueue(async () => {
    try {
      return await readIndex()
    } catch (error) {
      logError(error, LOG_CONTEXT)
      return null
    }
  })
}

/** Bilden eller miniatyren som Blob, eller null om den saknas. */
export function readPhoto(id: string, size: PhotoSize): Promise<Blob | null> {
  if (!isPhotoId(id)) return Promise.resolve(null)
  return enqueue(async () => {
    try {
      const result = await Filesystem.readFile({ path: photoPath(id, size), directory: photoDirectory() })
      return typeof result.data === 'string' ? base64ToBlob(result.data) : result.data
    } catch (error) {
      if (!isNotFound(error)) logError(error, LOG_CONTEXT)
      return null
    }
  })
}

/** Spara en bild: först filerna, sedan indexet. Går något fel tas filerna bort igen. */
export function savePhoto(meta: ProgressPhotoMeta, full: Blob, thumb: Blob): Promise<boolean> {
  if (!isProgressPhotoMeta(meta)) return Promise.resolve(false)
  return enqueue(async () => {
    const directory = photoDirectory()
    try {
      const index = await readIndex()
      const [fullData, thumbData] = await Promise.all([blobToBase64(full), blobToBase64(thumb)])
      await Filesystem.writeFile({ path: photoPath(meta.id, 'full'), data: fullData, directory, recursive: true })
      await Filesystem.writeFile({ path: photoPath(meta.id, 'thumb'), data: thumbData, directory, recursive: true })
      await writeIndex(cleanPhotoList([meta, ...index.filter((p) => p.id !== meta.id)]))
      return true
    } catch (error) {
      logError(error, LOG_CONTEXT)
      await removeFile(photoPath(meta.id, 'full')).catch(() => {})
      await removeFile(photoPath(meta.id, 'thumb')).catch(() => {})
      return false
    }
  })
}

/** Radera en bild: först ur indexet, sedan filerna. true om den är borta. */
export function deletePhoto(id: string): Promise<boolean> {
  if (!isPhotoId(id)) return Promise.resolve(false)
  return enqueue(async () => {
    try {
      const index = await readIndex()
      if (index.some((p) => p.id === id)) await writeIndex(index.filter((p) => p.id !== id))
      await removeFile(photoPath(id, 'full'))
      await removeFile(photoPath(id, 'thumb'))
      return true
    } catch (error) {
      logError(error, LOG_CONTEXT)
      return false
    }
  })
}

/**
 * Radera hela mappen med bilderna (och kamerans tillfälliga filer på Android). true om den är
 * borta (eller aldrig fanns).
 */
export function deleteAllPhotos(): Promise<boolean> {
  void clearCameraCaptures()
  return enqueue(async () => {
    try {
      await Filesystem.rmdir({ path: PHOTO_DIR, directory: photoDirectory(), recursive: true })
      return true
    } catch (error) {
      if (isNotFound(error)) return true
      logError(error, LOG_CONTEXT)
      return false
    }
  })
}

/**
 * Android: när en bild tas med kameran ("Ta en bild", `<input capture>`) låter Capacitor kameraappen
 * skriva originalet – i full storlek och med EXIF/GPS – till en tillfällig fil i appens externa
 * filmapp (`Pictures/JPEG_<datum>_<tid>_<nummer>.jpg`, BridgeWebChromeClient) och tar aldrig bort
 * den. Här tas sådana filer bort när bilden har skalats ned, när sidan öppnas, vid radering och vid
 * varje start av appen (native/init.ts) – även när framstegsbilderna är avstängda. En tom `.nomedia`
 * i mappen gör att galleriappar inte visar en originalbild under den korta tid den finns.
 */
export const CAMERA_DIR = 'Pictures'
const CAMERA_FILE = /^JPEG_\d{8}_\d{6}_\d+\.jpg$/
const NO_MEDIA = '.nomedia'

/** Ta bort kamerans tillfälliga originalbilder (bara Android – no-op på iPhone). Kastar aldrig. */
export function clearCameraCaptures(): Promise<void> {
  if (nativePlatform() !== 'android') return Promise.resolve()
  return enqueue(async () => {
    try {
      const { files } = await Filesystem.readdir({ path: CAMERA_DIR, directory: Directory.External })
      for (const file of files) {
        if (!CAMERA_FILE.test(file.name)) continue
        await Filesystem.deleteFile({ path: `${CAMERA_DIR}/${file.name}`, directory: Directory.External }).catch((error: unknown) => {
          if (!isNotFound(error)) logError(error, LOG_CONTEXT)
        })
      }
      if (!files.some((f) => f.name === NO_MEDIA)) {
        await Filesystem.writeFile({ path: `${CAMERA_DIR}/${NO_MEDIA}`, data: '', directory: Directory.External, encoding: Encoding.UTF8 }).catch(
          (error: unknown) => logError(error, LOG_CONTEXT),
        )
      }
    } catch (error) {
      if (!isNotFound(error)) logError(error, LOG_CONTEXT)
    }
  })
}

/** Endast för tester: töm kön. */
export function resetPhotosForTests(): void {
  queue = Promise.resolve()
}
