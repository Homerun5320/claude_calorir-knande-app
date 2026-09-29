/**
 * Streckkodsläsaren i de inbyggda apparna (`@capacitor/barcode-scanner`). Laddas bara via
 * `loadNative('barcode')` (src/native/index.ts) – aldrig på webben, där ScanPage läser med kameran
 * i webbvyn som förut (BarcodeDetector eller ZXing, src/features/add/scanner.ts).
 *
 * - Android: ZXing, inbyggt i tillägget – läser på telefonen och skickar ingenting någonstans.
 *   Tillägget har också Google ML Kit (`com.google.mlkit:barcode-scanning`, inbyggd modell), som
 *   läser något bättre i svagt ljus, men ML Kit skickar enligt Googles egen redovisning driftdata
 *   till Google (enhet, app, identifierare, prestanda och felkoder). Det kräver samtycke och en
 *   uppdaterad integritetspolicy och Data safety (CLAUDE.md: inga analysverktyg), så ML Kit
 *   används inte (`ANDROID_SCANNING_LIBRARY`). Väljer ägaren ML Kit ändå görs ett nytt försök
 *   med ZXing om ML Kit får fel (OS-PLUG-BARC-0010), och ZXing används sedan resten av sessionen.
 * - iPhone: Apple Vision.
 * - Läsaren visas i helskärm ovanpå webbvyn (egen sökram, ficklampa och Avbryt) och ger en kod
 *   per anrop. Tillägget kan bara begränsas till ett enda format, så alla format läses och här
 *   släpps bara livsmedelskoder igenom: EAN-13, EAN-8, UPC-A och UPC-E (utökas till UPC-A), med
 *   kontrollsiffran kontrollerad – samma formatnamn som `SCAN_FORMATS` på webben. GS1-koder i QR
 *   (Digital Link, "https://…/01/<GTIN>") och DataMatrix ("01<GTIN>…") ger också produktens
 *   GTIN, eftersom 2D-koder börjar dyka upp på förpackningar.
 * - Kamerabehörigheten frågas av tillägget första gången (systemdialogen; på iPhone med texten
 *   NSCameraUsageDescription i Info.plist). Nekad kamera ger 'denied' med samma vänliga text som
 *   på webben (`cameraErrorTexts()` → `cameraSettingsHint()`: "Tillåt kameran för Lagom i
 *   telefonens Inställningar."). Obs: direkt efter ett nej visar tillägget också en egen dialog
 *   ("Camera Access Not Enabled" med knapparna Settings och OK). På iPhone översätts den med
 *   sv.lproj/Localizable.strings i appen (tillägget använder NSLocalizedString); på Android är
 *   texten inbyggd i tillägget och går inte att översätta.
 * - Vid träff ges en lätt haptisk knäpp (`Haptics.impact`, Light), om inte `haptic: false`.
 * - Funktionerna kastar aldrig. Avbrutet och nekat loggas inte (användarens val); andra fel loggas
 *   med `logError(…, 'native:streckkod')` – utan den lästa koden.
 */
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
  type CapacitorBarcodeScannerOptions,
  type CapacitorBarcodeScannerScanResult,
} from '@capacitor/barcode-scanner'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { cameraErrorTexts } from '../features/add/scanner'
import { logError } from '../lib/errorLog'
import { isValidEan, normalizeBarcode } from '../lib/openFoodFacts'

const LOG_CONTEXT = 'native:streckkod'

/** Texten i läsarens helskärmsvy – samma som under webbens sökram. */
export const SCAN_INSTRUCTIONS = 'Håll streckkoden inom ramen'

/** Tilläggets felkoder (samma på iPhone och Android). */
const ERROR_CANCELLED = 'OS-PLUG-BARC-0006'
const ERROR_DENIED = 'OS-PLUG-BARC-0007'
const ERROR_MLKIT = 'OS-PLUG-BARC-0010'

/** Formatet på en läst livsmedelskod – samma namn som `SCAN_FORMATS` (features/add/scanner.ts), plus GS1 i 2D-koder. */
export type FoodBarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'gs1'

const FORMAT = CapacitorBarcodeScannerTypeHint
/** "Okänt format" i svaret har samma nummer som ALL i förfrågan (17) på båda plattformarna. */
const FORMAT_UNKNOWN: number = FORMAT.ALL

/** Streckkoderna på livsmedel. Numren är tilläggets (html5-qrcode-ordningen) och lika på båda plattformarna. */
const LINEAR_FORMATS: ReadonlyMap<number, Exclude<FoodBarcodeFormat, 'gs1'>> = new Map([
  [FORMAT.EAN_13, 'ean_13'],
  [FORMAT.EAN_8, 'ean_8'],
  [FORMAT.UPC_A, 'upc_a'],
  [FORMAT.UPC_E, 'upc_e'],
])

/** 2D-koder som kan bära en GTIN enligt GS1. */
const GS1_2D_FORMATS: ReadonlySet<number> = new Set([FORMAT.QR_CODE, FORMAT.DATA_MATRIX])

export interface ScanOptions {
  /** Lätt haptisk knäpp när en livsmedelskod har lästs. Standard: true. */
  haptic?: boolean
  /** Texten i läsarens vy. Standard: `SCAN_INSTRUCTIONS`. */
  instructions?: string
  /** Läsaren på Android. Standard: `ANDROID_SCANNING_LIBRARY` (ZXing). */
  androidLibrary?: CapacitorBarcodeScannerAndroidScanningLibrary
}

/** Utfallet av en skanning. Problemen har en färdig svensk rubrik och text. */
export type NativeScanOutcome =
  /** En livsmedelskod med rätt kontrollsiffra (UPC-E utökad till UPC-A, GS1 förkortad till EAN). */
  | { status: 'scanned'; code: string; format: FoodBarcodeFormat }
  /** Användaren stängde läsaren (Avbryt eller bakåt). */
  | { status: 'cancelled' }
  /** En kod lästes, men den går inte att söka på (t.ex. en QR-kod med en webbadress) eller blev felläst. */
  | { status: 'invalid'; title: string; text: string }
  /** Kameran är inte tillåten – `reason` passar `CAMERA_ERROR_TEXT` i ScanPage. */
  | { status: 'denied'; reason: 'denied'; title: string; text: string }
  /** Läsaren gick inte att starta eller fick fel. */
  | { status: 'error'; reason: 'error'; title: string; text: string }
  /** Tillägget saknas i appen – använd webbens kamera i stället. */
  | { status: 'unavailable'; reason: 'unsupported'; title: string; text: string }

/** Ett utfall som användaren behöver få veta något om. */
export type NativeScanProblem = Extract<NativeScanOutcome, { title: string }>

/** Texterna när en kod lästes men inte går att använda. */
export const INVALID_SCAN_TEXT = {
  notFood: {
    title: 'Ingen streckkod för livsmedel',
    text: 'Koden går inte att söka på. Skanna streckkoden på förpackningen – den med siffror under.',
  },
  misread: {
    title: 'Streckkoden gick inte att läsa',
    text: 'Försök igen och håll telefonen stilla – eller skriv in siffrorna under streckkoden.',
  },
} as const

// ---------------------------------------------------------------------------
// Koderna
// ---------------------------------------------------------------------------

/** Kontrollsiffran för en EAN/UPC-kod utan kontrollsiffra (vikterna 3,1,3 … från höger). */
function checkDigit(base: string): string {
  let sum = 0
  for (let i = base.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += Number(base[i]) * w
  return String((10 - (sum % 10)) % 10)
}

/**
 * UPC-E (8 siffror; 7 utan kontrollsiffra; 6 utan talsystem och kontrollsiffra) → UPC-A med
 * 12 siffror, som Open Food Facts och `barcodeVariants` känner igen. null om koden inte är en
 * giltig UPC-E (fel talsystem eller kontrollsiffra).
 */
export function expandUpcE(code: string): string | null {
  const c = normalizeBarcode(code)
  if (!/^\d+$/.test(c)) return null
  let system: string
  let body: string
  let check: string | undefined
  if (c.length === 8) {
    system = c[0]
    body = c.slice(1, 7)
    check = c[7]
  } else if (c.length === 7) {
    system = c[0]
    body = c.slice(1)
  } else if (c.length === 6) {
    system = '0'
    body = c
  } else {
    return null
  }
  if (system !== '0' && system !== '1') return null
  const [d1, d2, d3, d4, d5, d6] = body
  let middle: string
  if (d6 === '0' || d6 === '1' || d6 === '2') middle = `${d1}${d2}${d6}0000${d3}${d4}${d5}`
  else if (d6 === '3') middle = `${d1}${d2}${d3}00000${d4}${d5}`
  else if (d6 === '4') middle = `${d1}${d2}${d3}${d4}00000${d5}`
  else middle = `${d1}${d2}${d3}${d4}${d5}0000${d6}`
  const base = system + middle
  const digit = checkDigit(base)
  if (check !== undefined && check !== digit) return null
  return base + digit
}

/** EAN-8, UPC-A eller EAN-13 med rätt kontrollsiffra. */
function isRetailCode(code: string): boolean {
  return (code.length === 8 || code.length === 12 || code.length === 13) && isValidEan(code)
}

/** FNC1 i GS1-data (gruppseparatorn, ASCII 29). */
const GS1_SEPARATOR = String.fromCharCode(29)

/** GTIN-14 → den kod som står på konsumentförpackningen (EAN-8/EAN-13), när det går. */
function shortenGtin(gtin: string): string {
  if (gtin.length !== 14) return gtin
  if (gtin.startsWith('000000')) return gtin.slice(6)
  if (gtin.startsWith('0')) return gtin.slice(1)
  return gtin
}

/**
 * Produktens GTIN ur en GS1-kod: Digital Link i en QR-kod ("https://id.gs1.org/01/07310865000637")
 * eller en elementsträng i DataMatrix ("]d2" / FNC1, "01" eller "(01)" följt av 14 siffror).
 * Ger EAN-8/EAN-13 när GTIN:en börjar med nollor, annars GTIN-14. null om ingen giltig GTIN finns.
 */
export function gtinFromGs1(text: string): string | null {
  const s = text.trim()
  const link = /^https?:\/\/[^\s?#]*?\/(?:01|gtin)\/(\d{14}|\d{13}|\d{12}|\d{8})(?=[/?#]|$)/i.exec(s)
  // Elementsträngen: bort med symbologins prefix ("]d2", "]Q3") och ett inledande FNC1 (GS).
  let data = s.replace(/^\][A-Za-z]\d/, '')
  if (data.startsWith(GS1_SEPARATOR)) data = data.slice(1)
  const element = link ? null : /^(?:\(01\)|01)(\d{14})/.exec(data)
  const gtin = link?.[1] ?? element?.[1]
  if (!gtin) return null
  const code = shortenGtin(gtin)
  return isValidEan(code) ? code : null
}

/**
 * Tolka det tillägget läste: en livsmedelskod och dess format, eller null. Kontrollsiffran
 * kontrolleras alltid. Apple Vision skiljer inte på EAN-13 och UPC-A (13 siffror med en nolla
 * först) – båda godtas under båda namnen.
 */
export function foodCodeFromScan(text: string, format: number): { code: string; format: FoodBarcodeFormat } | null {
  const raw = text.trim()
  if (raw === '') return null
  const linear = LINEAR_FORMATS.get(format)
  if (linear) {
    const digits = normalizeBarcode(raw)
    if (linear === 'upc_e' && digits.length <= 8) {
      const upcA = expandUpcE(digits)
      return upcA ? { code: upcA, format: 'upc_e' } : null
    }
    return isRetailCode(digits) ? { code: digits, format: linear } : null
  }
  if (GS1_2D_FORMATS.has(format) || format === FORMAT_UNKNOWN) {
    const gtin = gtinFromGs1(raw)
    if (gtin) return { code: gtin, format: 'gs1' }
  }
  if (format === FORMAT_UNKNOWN) {
    // Okänt format (t.ex. en symbologi som Vision inte mappar): bara siffror med rätt kontrollsiffra.
    const digits = normalizeBarcode(raw)
    if (isRetailCode(digits)) return { code: digits, format: digits.length === 8 ? 'ean_8' : digits.length === 12 ? 'upc_a' : 'ean_13' }
  }
  return null
}

// ---------------------------------------------------------------------------
// Fel
// ---------------------------------------------------------------------------

export type ScanErrorKind = 'cancelled' | 'denied' | 'mlkit' | 'unavailable' | 'error'

/**
 * Tolka ett fel från tillägget. Felkoderna är tilläggets (OS-PLUG-BARC-00xx) och Capacitors
 * (UNIMPLEMENTED/UNAVAILABLE när tillägget saknas i appen); texten används som reserv.
 */
export function classifyScanError(error: unknown): ScanErrorKind {
  if (typeof error !== 'object' || error === null) return 'error'
  const { code, message } = error as { code?: unknown; message?: unknown }
  if (code === ERROR_CANCELLED) return 'cancelled'
  if (code === ERROR_DENIED) return 'denied'
  if (code === ERROR_MLKIT) return 'mlkit'
  if (code === 'UNIMPLEMENTED' || code === 'UNAVAILABLE') return 'unavailable'
  const text = typeof message === 'string' ? message : ''
  if (/cancel/i.test(text)) return 'cancelled'
  if (/camera access|permission/i.test(text)) return 'denied'
  if (/not implemented/i.test(text)) return 'unavailable'
  return 'error'
}

function problem<R extends 'denied' | 'error' | 'unsupported'>(reason: R): { reason: R; title: string; text: string } {
  const { title, text } = cameraErrorTexts()[reason]
  return { reason, title, text }
}

// ---------------------------------------------------------------------------
// Skanning
// ---------------------------------------------------------------------------

/**
 * Läsaren på Android: ZXing. Byt till `MLKIT` bara efter ägarens beslut och med uppdaterad
 * integritetspolicy, Data safety och samtycke – se kommentaren överst. Ignoreras på iPhone.
 */
export const ANDROID_SCANNING_LIBRARY: CapacitorBarcodeScannerAndroidScanningLibrary = CapacitorBarcodeScannerAndroidScanningLibrary.ZXING

/** Om ML Kit har fått fel används ZXing resten av sessionen (bara Android; ignoreras på iPhone). */
let preferZxing = false
/** Pågående skanning – ett nytt anrop under tiden får samma svar i stället för en andra läsare. */
let inFlight: Promise<NativeScanOutcome> | null = null

function pluginOptions(options: ScanOptions, library: CapacitorBarcodeScannerAndroidScanningLibrary): CapacitorBarcodeScannerOptions {
  return {
    hint: CapacitorBarcodeScannerTypeHint.ALL,
    scanInstructions: options.instructions ?? SCAN_INSTRUCTIONS,
    scanButton: false,
    cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
    // Appen visas bara i stående läge (Info.plist och AndroidManifest).
    scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
    cancelButtonAccessibilityLabel: 'Avbryt',
    torchButtonOnAccessibilityLabel: 'Släck ficklampan',
    torchButtonOffAccessibilityLabel: 'Tänd ficklampan',
    android: { scanningLibrary: library },
  }
}

async function scanWithFallback(options: ScanOptions): Promise<CapacitorBarcodeScannerScanResult> {
  const { MLKIT, ZXING } = CapacitorBarcodeScannerAndroidScanningLibrary
  const library = preferZxing ? ZXING : (options.androidLibrary ?? ANDROID_SCANNING_LIBRARY)
  try {
    return await CapacitorBarcodeScanner.scanBarcode(pluginOptions(options, library))
  } catch (error) {
    if (library !== MLKIT || classifyScanError(error) !== 'mlkit') throw error
    logError(error, LOG_CONTEXT)
    preferZxing = true
    return await CapacitorBarcodeScanner.scanBarcode(pluginOptions(options, ZXING))
  }
}

/** Lätt haptisk knäpp vid träff. Kastar aldrig. */
export async function hapticHit(): Promise<void> {
  try {
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

function outcomeForError(error: unknown): NativeScanOutcome {
  switch (classifyScanError(error)) {
    case 'cancelled':
      return { status: 'cancelled' }
    case 'denied':
      return { status: 'denied', ...problem('denied') }
    case 'unavailable':
      logError(error, LOG_CONTEXT)
      return { status: 'unavailable', ...problem('unsupported') }
    default:
      logError(error, LOG_CONTEXT)
      return { status: 'error', ...problem('error') }
  }
}

async function runScan(options: ScanOptions): Promise<NativeScanOutcome> {
  let result: CapacitorBarcodeScannerScanResult
  try {
    result = await scanWithFallback(options)
  } catch (error) {
    return outcomeForError(error)
  }
  const text = typeof result?.ScanResult === 'string' ? result.ScanResult : ''
  if (text.trim() === '') return { status: 'cancelled' }
  const format = Number(result.format)
  const found = foodCodeFromScan(text, format)
  if (!found) {
    // En streckkod för livsmedel med fel kontrollsiffra är en felläsning; allt annat är fel sorts kod.
    const misread = LINEAR_FORMATS.has(format)
    return { status: 'invalid', ...(misread ? INVALID_SCAN_TEXT.misread : INVALID_SCAN_TEXT.notFood) }
  }
  if (options.haptic !== false) void hapticHit()
  return { status: 'scanned', code: found.code, format: found.format }
}

/**
 * Öppna läsaren och vänta på en streckkod. Kamerabehörigheten frågas första gången. Kastar
 * aldrig. Anropas den medan läsaren redan är öppen fås samma svar (ingen andra läsare öppnas).
 */
export function scanFoodBarcode(options: ScanOptions = {}): Promise<NativeScanOutcome> {
  inFlight ??= runScan(options)
    .catch((error: unknown): NativeScanOutcome => {
      // Bara en säkerhetsspärr – runScan fångar själv tilläggets fel.
      logError(error, LOG_CONTEXT)
      return { status: 'error', ...problem('error') }
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

export interface ScanBarcodeOptions extends ScanOptions {
  /**
   * Anropas när skanningen inte gav någon kod av ett skäl användaren behöver få veta (nekad
   * kamera, fel, fel sorts kod) – med en färdig svensk text, t.ex. för en notis. Inte när
   * användaren själv avbröt.
   */
  onProblem?: (problem: NativeScanProblem) => void
}

/**
 * Skanna en livsmedelskod: koden, eller null om skanningen avbröts eller inte gav någon
 * användbar kod (då anropas `onProblem` med en vänlig text – vid nekad kamera med
 * `cameraSettingsHint()`). Kastar aldrig. Behövs utfallet i detalj: `scanFoodBarcode()`.
 */
export async function scanBarcode(options: ScanBarcodeOptions = {}): Promise<string | null> {
  const outcome = await scanFoodBarcode(options)
  if (outcome.status === 'scanned') return outcome.code
  if (outcome.status !== 'cancelled') {
    try {
      options.onProblem?.(outcome)
    } catch (error) {
      logError(error, LOG_CONTEXT)
    }
  }
  return null
}

/** Endast för tester: glöm ZXing-reserven och en pågående skanning. */
export function resetBarcodeForTests(): void {
  preferZxing = false
  inFlight = null
}
