/**
 * Export och delning i de inbyggda apparna (Capacitor). Laddas bara via `loadNative('files')`
 * (src/native/index.ts) – aldrig på webben.
 *
 * I webbvyn gör en nedladdning med `<a download>` ingenting, och Web Share med filer fungerar
 * inte pålitligt. Här skrivs filen i stället till appens cachemapp och öppnas i systemets
 * delningsblad: på iPhone finns "Spara i Filer", på Android t.ex. Filer, Drive eller mejl.
 *
 * - Filerna läggs i `Directory.Cache/delning/`. Androids FileProvider delar bara ut appens cache-
 *   och filmapp (android/app/src/main/res/xml/file_paths.xml), och cachen får systemet rensa.
 * - Tidigare exporter tas bort före varje ny, så att gamla kopior av dagboken inte blir liggande
 *   (`clearExportCache` rensar också, t.ex. vid "Radera all data").
 * - Funktionerna kastar aldrig. Utfallen är desamma som webbens (`SaveOutcome` i lib/backup.ts och
 *   `ShareOutcome` i features/diary/share.ts), så att anroparen kan visa samma notiser. En stängd
 *   delningsdialog är 'cancelled' och loggas inte; andra fel loggas med `logError`.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { ShareOutcome } from '../features/diary/share'
import type { SaveOutcome } from '../lib/backup'
import { logError } from '../lib/errorLog'

/** Undermappen i appens cache där exporterna läggs före delning. */
export const EXPORT_DIR = 'delning'

/** Filändelse per filtyp – läggs till om filnamnet saknar en (delningsbladet väljer app efter den). */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'application/json': '.json',
  'text/csv': '.csv',
  'text/plain': '.txt',
}

const FALLBACK_NAME = 'lagom-export'
const MAX_NAME_LENGTH = 120
const FORBIDDEN_CHARS = '<>:"|?*'

/**
 * Ett filnamn som går att skriva i exportmappen: bara själva namnet (inga mappar eller `..`), utan
 * tecken som filsystemen inte tål och med rätt filändelse för `mime`.
 */
export function safeFilename(filename: string, mime?: string): string {
  const base = filename.split(/[\\/]/).pop() ?? ''
  // Bort med styrtecken och tecken som vissa filsystem inte tål (t.ex. ett USB-minne eller en dator).
  const kept = Array.from(base).filter((c) => {
    const code = c.codePointAt(0) ?? 0
    return code >= 0x20 && code !== 0x7f && !FORBIDDEN_CHARS.includes(c)
  })
  let name = kept.join('').trim().replace(/^\.+/, '')
  if (name.length === 0) name = FALLBACK_NAME
  const ext = mime ? EXTENSIONS[mime.split(';')[0].trim().toLowerCase()] : undefined
  if (ext && !name.toLowerCase().endsWith(ext)) name += ext
  if (name.length > MAX_NAME_LENGTH) {
    const dot = name.lastIndexOf('.')
    const suffix = dot > 0 && name.length - dot <= 10 ? name.slice(dot) : ''
    name = name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix
  }
  return name
}

/**
 * true om delningen avbröts av användaren (eller redan pågick): Capacitor Share avvisar med
 * "Share canceled" på båda plattformarna och "Can't share while sharing is in progress" vid ett
 * dubbeltryck.
 */
export function isShareCancel(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'AbortError') return true
  return typeof message === 'string' && /cancel|in progress/i.test(message)
}

/** Ta bort tidigare exporter ur cachen. Kastar aldrig (mappen finns ofta inte). */
export async function clearExportCache(): Promise<void> {
  try {
    await Filesystem.rmdir({ path: EXPORT_DIR, directory: Directory.Cache, recursive: true })
  } catch {
    /* mappen fanns inte – inget att rensa */
  }
}

/** Ett delningsblad åt gången – ett dubbeltryck ska inte ge två blad eller ett felmeddelande. */
let sharing = false

export interface SaveFileOptions {
  /** Ämnesrad när filen delas med mejl (standard: filnamnet). */
  title?: string
}

/**
 * Spara en fil via delningsbladet ("Spara i Filer" på iPhone, dela på Android). Samma signatur och
 * utfall som `saveFile` i src/lib/backup.ts, men blir aldrig 'saved' – filen hamnar där
 * användaren väljer i bladet:
 * - 'shared'    – bladet användes
 * - 'cancelled' – bladet stängdes utan val (eller var redan öppet)
 * - 'failed'    – filen gick inte att skriva eller dela (felet loggas)
 */
export async function saveFile(filename: string, content: string, mime = 'application/json', options: SaveFileOptions = {}): Promise<SaveOutcome> {
  if (sharing) return 'cancelled'
  sharing = true
  try {
    const name = safeFilename(filename, mime)
    await clearExportCache()
    let uri: string
    try {
      const written = await Filesystem.writeFile({
        path: `${EXPORT_DIR}/${name}`,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      })
      uri = written.uri
    } catch (error) {
      logError(error, 'native:files')
      return 'failed'
    }
    try {
      await Share.share({ title: options.title ?? name, files: [uri], dialogTitle: 'Spara eller dela' })
      return 'shared'
    } catch (error) {
      if (isShareCancel(error)) return 'cancelled'
      logError(error, 'native:files')
      return 'failed'
    }
  } finally {
    sharing = false
  }
}

/**
 * Dela text (dagens sammanfattning, inköpslistan …) med delningsbladet. Utfallen som i
 * `shareOrCopy` (features/diary/share.ts) utom 'copied': blir det 'failed' kan anroparen prova
 * urklipp i stället.
 */
export async function shareText(title: string, text: string): Promise<Exclude<ShareOutcome, 'copied'>> {
  if (sharing) return 'cancelled'
  sharing = true
  try {
    await Share.share({ title, text, dialogTitle: 'Dela' })
    return 'shared'
  } catch (error) {
    if (isShareCancel(error)) return 'cancelled'
    logError(error, 'native:files')
    return 'failed'
  } finally {
    sharing = false
  }
}
