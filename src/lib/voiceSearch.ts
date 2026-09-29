/**
 * Röstsökning i sökfältet – bara med taligenkänning på enheten.
 *
 * Web Speech API:s `SpeechRecognition` skickar som standard ljudet till en taltjänst på nätet
 * (i Chrome Googles servrar). Det får aldrig hända i Lagom. Därför används bara igenkänning på
 * enheten enligt Web Speech API-specen (W3C Audio CG, https://webaudio.github.io/web-speech-api/)
 * och MDN (SpeechRecognition.available/install/processLocally, kontrollerat 2026-09-29):
 *
 * - `SpeechRecognition.available({ langs, processLocally: true })` → Promise med
 *   'available' (språkpaketet finns på enheten), 'downloadable' (kan hämtas), 'downloading'
 *   (hämtas just nu) eller 'unavailable'.
 * - `SpeechRecognition.install({ langs, processLocally: true })` → Promise<boolean> – hämtar
 *   språkpaketet (webbläsaren gör det en gång). Anropas bara efter ett tydligt val.
 * - `recognition.processLocally = true` – igenkänningen MÅSTE ske på enheten. Går det inte får
 *   `start()` ett fel ('service-not-allowed' i specen, 'language-not-supported' enligt MDN) i
 *   stället för att falla tillbaka på en server.
 *
 * Regler:
 * - Bara den oprefixade `SpeechRecognition` (Chrome 139+). `webkitSpeechRecognition` (Safari och
 *   äldre Chrome) saknar igenkänning på enheten och används aldrig.
 * - Saknas `available()` eller egenskapen `processLocally` finns ingen röstsökning – aldrig reserv
 *   till server-igenkänning.
 * - Safari/WebKit (alla webbläsare på iPhone och iPad) och apparna (ingen godkänd native-plugin)
 *   får ingen röstsökning.
 * - Mikrofonen frågas först när man trycker på knappen (`start()`); inget spelas in i förväg,
 *   och varken ljud eller text sparas – texten hamnar bara i sökfältet.
 */
import { isInApp } from '../config/platform'
import { logError } from './errorLog'

/** Språket för röstsökningen. */
export const VOICE_LANG = 'sv-SE'

/** Svar från `SpeechRecognition.available()` (AvailabilityStatus i specen). */
export type VoiceAvailability = 'available' | 'downloadable' | 'downloading' | 'unavailable'

/** SpeechRecognitionOptions i specen (`quality` utelämnas – standard 'command' räcker för sökord). */
export interface LocalRecognitionOptions {
  langs: string[]
  processLocally: boolean
}

/** Det Lagom läser ur en SpeechRecognitionEvent (`results[i][0].transcript`). */
export interface RecognitionResultEvent {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>>
}

/** Det Lagom läser ur en SpeechRecognitionErrorEvent. */
export interface RecognitionErrorEvent {
  readonly error: string
}

/** Den del av en SpeechRecognition-instans som Lagom använder. */
export interface LocalRecognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  processLocally: boolean
  onstart: (() => void) | null
  onresult: ((event: RecognitionResultEvent) => void) | null
  onnomatch: (() => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

/** Konstruktorn `SpeechRecognition` med de statiska metoderna för igenkänning på enheten. */
export interface LocalRecognitionCtor {
  new (): LocalRecognition
  readonly prototype: object
  available(options: LocalRecognitionOptions): Promise<string>
  install?(options: LocalRecognitionOptions): Promise<boolean>
}

/** Omgivningen som avgör om röstsökning får finnas (injicerbar i testerna). */
export interface VoiceEnv {
  /** Där `SpeechRecognition` letas upp (window). */
  scope: unknown
  userAgent: string
  /** Lagom körs som app från en butik (Capacitor, TWA eller butiksbygge). */
  inApp: boolean
}

function currentEnv(): VoiceEnv {
  return {
    scope: typeof window === 'undefined' ? undefined : window,
    userAgent: typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? ''),
    inApp: isInApp(),
  }
}

/**
 * Safari eller en annan WebKit-webbläsare där taligenkänningen går via Apples taltjänst: Safari
 * på Mac och alla webbläsare på iPhone/iPad (även Chrome, Firefox och Edge för iOS).
 */
export function isWebKitOnlyBrowser(userAgent: string): boolean {
  if (/iPhone|iPad|iPod|CriOS|FxiOS|EdgiOS/.test(userAgent)) return true
  return /Version\/[\d.]+.*Safari\//.test(userAgent) && !/Chrome|Chromium|Edg|OPR|Firefox|SamsungBrowser/.test(userAgent)
}

/** Alternativen till available() och install() – ett nytt objekt varje gång. */
export function localOptions(): LocalRecognitionOptions {
  return { langs: [VOICE_LANG], processLocally: true }
}

/**
 * Konstruktorn för igenkänning på enheten – eller null när röstsökning inte får finnas här:
 * i apparna, i Safari/WebKit, utan oprefixad `SpeechRecognition`, utan `available()` eller utan
 * egenskapen `processLocally` (då skulle `processLocally = true` bara bli en vanlig egenskap som
 * webbläsaren struntar i, och ljudet kunde gå till en server).
 */
export function localRecognitionCtor(env: VoiceEnv = currentEnv()): LocalRecognitionCtor | null {
  try {
    if (env.inApp || isWebKitOnlyBrowser(env.userAgent)) return null
    const scope = env.scope as { SpeechRecognition?: unknown } | null | undefined
    const ctor = scope?.SpeechRecognition
    if (typeof ctor !== 'function') return null
    const candidate = ctor as LocalRecognitionCtor
    if (typeof candidate.available !== 'function') return null
    const proto: unknown = candidate.prototype
    if (typeof proto !== 'object' || proto === null || !('processLocally' in proto)) return null
    return candidate
  } catch {
    return null
  }
}

const STATUSES: ReadonlySet<string> = new Set<VoiceAvailability>(['available', 'downloadable', 'downloading', 'unavailable'])

/**
 * Finns svensk igenkänning på enheten? Kastar aldrig – ett fel eller ett okänt svar räknas som
 * 'unavailable'. 'downloadable' utan `install()` går inte att hämta och räknas också så.
 */
export async function checkVoiceAvailability(ctor: LocalRecognitionCtor): Promise<VoiceAvailability> {
  try {
    const status = await ctor.available(localOptions())
    if (!STATUSES.has(status)) return 'unavailable'
    if (status === 'downloadable' && typeof ctor.install !== 'function') return 'unavailable'
    return status as VoiceAvailability
  } catch (error) {
    logError(error, 'Röstsökning: kontroll av taligenkänning på enheten')
    return 'unavailable'
  }
}

/**
 * Hämta svensk taligenkänning till enheten (webbläsaren laddar ned språkpaketet en gång).
 * Anropas bara efter att användaren uttryckligen valt det. Ger true när paketet finns.
 */
export async function installSwedishVoice(ctor: LocalRecognitionCtor): Promise<boolean> {
  if (typeof ctor.install !== 'function') return false
  try {
    return (await ctor.install(localOptions())) === true
  } catch (error) {
    logError(error, 'Röstsökning: hämtning av svensk taligenkänning')
    return false
  }
}

/**
 * En ny igenkänning som bara får köras på enheten: `processLocally = true`, svenska,
 * delresultat (texten fylls i medan man pratar) och en fras i taget. Ger null om
 * `processLocally` inte går att sätta – då startas ingenting.
 */
export function createLocalRecognition(ctor: LocalRecognitionCtor): LocalRecognition | null {
  try {
    const recognition = new ctor()
    const proto: unknown = Object.getPrototypeOf(recognition)
    if (typeof proto !== 'object' || proto === null || !('processLocally' in proto)) return null
    recognition.processLocally = true
    if (recognition.processLocally !== true) return null
    recognition.lang = VOICE_LANG
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1
    return recognition
  } catch (error) {
    logError(error, 'Röstsökning: kunde inte skapa taligenkänningen')
    return null
  }
}

/** Städar den tolkade texten: ett mellanslag mellan orden och inget avslutande skiljetecken. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?…,;:]+$/u, '')
    .trim()
}

/** Hela den tolkade texten hittills (delresultat och slutliga resultat i ordning). */
export function transcriptFrom(results: RecognitionResultEvent['results']): string {
  let text = ''
  for (let i = 0; i < results.length; i++) text += results[i]?.[0]?.transcript ?? ''
  return cleanTranscript(text)
}

/** Vänligt meddelande för ett fel från igenkänningen – null när inget behöver sägas (avbrutet). */
export function voiceErrorMessage(code: string): string | null {
  switch (code) {
    case 'aborted':
      return null
    case 'no-speech':
      return 'Lagom hörde inget den här gången. Tryck på mikrofonen och prova igen – eller skriv i stället.'
    case 'audio-capture':
      return 'Lagom hittade ingen mikrofon. Kontrollera att den är ansluten och prova igen.'
    case 'not-allowed':
      return 'Lagom fick inte använda mikrofonen. Vill du söka med rösten kan du tillåta mikrofonen för Lagom i webbläsarens inställningar.'
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'Svensk taligenkänning på enheten gick inte att starta just nu. Skriv gärna i stället – inget ljud har skickats någonstans.'
    case 'network':
      return 'Röstsökningen kunde inte slutföras. Lagom använder bara taligenkänning på enheten, så prova igen eller skriv i stället.'
    default:
      return 'Röstsökningen fungerade inte just nu. Prova igen eller skriv i stället.'
  }
}
