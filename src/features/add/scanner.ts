/**
 * Kamera och streckkodsläsning.
 *
 * - Webbläsarens inbyggda `BarcodeDetector` används när den finns och klarar EAN (Chrome på
 *   Android, Safari 17+ m.fl.) – snabbt och batterisnålt.
 * - Annars laddas ZXing (`@zxing/browser`) in först när den behövs, så att huvudpaketet hålls litet.
 * - Lagom styr själv kameraströmmen (samma väg för båda motorerna) så att ficklampan fungerar och
 *   kameran alltid släpps när sidan lämnas.
 */

/** Streckkodsformat för livsmedel. */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

export type CameraErrorKind = 'denied' | 'nocamera' | 'unsupported' | 'insecure' | 'busy' | 'error'

export const CAMERA_ERROR_TEXT: Record<CameraErrorKind, { title: string; text: string }> = {
  denied: {
    title: 'Kameran är inte tillåten',
    text: 'Tillåt kameran för Lagom i webbläsarens inställningar och försök igen – eller skriv in siffrorna under streckkoden.',
  },
  nocamera: {
    title: 'Ingen kamera hittades',
    text: 'Den här enheten verkar sakna en kamera. Skriv in siffrorna under streckkoden i stället.',
  },
  unsupported: {
    title: 'Kameran stöds inte här',
    text: 'Webbläsaren kan inte använda kameran. Skriv in siffrorna under streckkoden i stället.',
  },
  insecure: {
    title: 'Kameran kräver en säker anslutning',
    text: 'Öppna Lagom via https för att kunna skanna. Tills dess går det bra att skriva in streckkoden.',
  },
  busy: {
    title: 'Kameran används redan',
    text: 'En annan app eller flik använder kameran. Stäng den och försök igen.',
  },
  error: {
    title: 'Kameran gick inte att starta',
    text: 'Något gick snett när kameran skulle startas. Försök igen – eller skriv in streckkoden.',
  },
}

/** Översätt ett fel från getUserMedia till en användarvänlig kategori. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const name = typeof err === 'object' && err !== null ? String((err as { name?: unknown }).name ?? '') : ''
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return 'denied'
  if (name === 'SecurityError') return typeof window !== 'undefined' && window.isSecureContext === false ? 'insecure' : 'denied'
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'nocamera'
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy'
  if (name === 'NotSupportedError' || name === 'TypeError') return 'unsupported'
  return 'error'
}

/** Kan webbläsaren alls använda kameran? */
export function cameraAvailability(): 'ok' | 'insecure' | 'unsupported' {
  if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure'
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported'
  return 'ok'
}

/** Starta bakre kameran. */
export async function openCamera(): Promise<MediaStream> {
  const avail = cameraAvailability()
  if (avail !== 'ok') throw Object.assign(new Error(avail), { name: avail === 'insecure' ? 'SecurityError' : 'NotSupportedError' })
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    })
  } catch (err) {
    // Vissa enheter klarar inte önskemålen om upplösning – försök med vilken kamera som helst.
    if ((err as { name?: string })?.name === 'OverconstrainedError') {
      return navigator.mediaDevices.getUserMedia({ audio: false, video: true })
    }
    throw err
  }
}

/** Stäng av alla spår – släpper kameran (lampan på enheten slocknar). */
export function stopStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* redan stoppad */
    }
  }
}

function videoTrack(stream: MediaStream | null | undefined): MediaStreamTrack | undefined {
  return stream?.getVideoTracks()[0]
}

/** Har kameran en ficklampa som går att styra? */
export function torchSupported(stream: MediaStream | null | undefined): boolean {
  const track = videoTrack(stream)
  if (!track || typeof track.getCapabilities !== 'function') return false
  try {
    return Boolean((track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean }).torch)
  } catch {
    return false
  }
}

/** Tänd eller släck ficklampan. Returnerar true om det lyckades. */
export async function setTorch(stream: MediaStream | null | undefined, on: boolean): Promise<boolean> {
  const track = videoTrack(stream)
  if (!track) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Avläsning
// ---------------------------------------------------------------------------

interface DetectedBarcodeLike {
  rawValue: string
  format?: string
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcodeLike[]>
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

function nativeDetector(): BarcodeDetectorCtor | undefined {
  return (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
}

/** Formaten som webbläsarens BarcodeDetector klarar av bland livsmedelsformaten (tom lista = ingen). */
export async function nativeFormats(): Promise<string[]> {
  const Ctor = nativeDetector()
  if (!Ctor) return []
  try {
    const supported = (await Ctor.getSupportedFormats?.()) ?? [...SCAN_FORMATS]
    return SCAN_FORMATS.filter((f) => supported.includes(f))
  } catch {
    return []
  }
}

export interface BarcodeScanner {
  engine: 'native' | 'zxing'
  stop: () => void
}

const SCAN_INTERVAL_MS = 120

/**
 * Läs streckkoder kontinuerligt från en video med en redan startad kameraström.
 * `onCode` anropas med råtexten för varje avläsning (kan upprepas – använd `createScanGate`).
 */
export async function startBarcodeScanner(video: HTMLVideoElement, stream: MediaStream, onCode: (code: string) => void): Promise<BarcodeScanner> {
  const formats = await nativeFormats()
  const Ctor = nativeDetector()
  if (Ctor && formats.includes('ean_13')) {
    const detector = new Ctor({ formats })
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (stopped) return
      if (video.readyState >= 2 && video.videoWidth > 0) {
        try {
          const codes = await detector.detect(video)
          if (!stopped) {
            const hit = codes.find((c) => c.rawValue)
            if (hit) onCode(hit.rawValue)
          }
        } catch {
          /* bildrutan gick inte att läsa – nästa försök */
        }
      }
      if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS)
    }
    void tick()
    return {
      engine: 'native',
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
      },
    }
  }

  // Reserv: ZXing laddas bara in här (egen chunk).
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')])
  const hints = new Map<number, unknown>()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E])
  const reader = new BrowserMultiFormatReader(hints as Map<never, unknown>, {
    delayBetweenScanAttempts: SCAN_INTERVAL_MS,
    delayBetweenScanSuccess: 500,
  })
  let stopped = false
  const controls = await reader.decodeFromStream(stream, video, (result) => {
    if (!stopped && result) onCode(result.getText())
  })
  return {
    engine: 'zxing',
    stop: () => {
      stopped = true
      try {
        controls.stop()
      } catch {
        /* redan stoppad */
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Avstudsning
// ---------------------------------------------------------------------------

export interface ScanGate {
  /** true om koden ska hanteras nu (inte låst och inte samma kod alldeles nyss). */
  accept: (code: string, now?: number) => boolean
  /** Lås medan en produkt visas. */
  lock: () => void
  /** Lås upp – samma kod ignoreras ytterligare en stund (den ligger troligen kvar i bild). */
  unlock: (now?: number) => void
  reset: () => void
  readonly locked: boolean
}

/** Filtrerar bort upprepade avläsningar av samma streckkod. */
export function createScanGate(cooldownMs = 2500): ScanGate {
  let locked = false
  let lastCode = ''
  let lastAt = -Infinity
  return {
    accept(code, now = Date.now()) {
      if (locked || !code) return false
      if (code === lastCode && now - lastAt < cooldownMs) return false
      lastCode = code
      lastAt = now
      return true
    },
    lock() {
      locked = true
    },
    unlock(now = Date.now()) {
      locked = false
      lastAt = now
    },
    reset() {
      locked = false
      lastCode = ''
      lastAt = -Infinity
    },
    get locked() {
      return locked
    },
  }
}

/** Kort vibration vid lyckad avläsning (om enheten stöder det). */
export function vibrate(pattern: number | number[] = 40): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
  } catch {
    /* ignoreras */
  }
}

/** Tillåt bara siffror i manuell inmatning ("7310 8650 0063 7" → "7310865000637"). */
export function cleanManualCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, 14)
}
