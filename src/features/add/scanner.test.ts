import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyCameraError, cleanManualCode, createScanGate, setTorch, stopStream, torchSupported } from './scanner'

describe('createScanGate', () => {
  it('släpper igenom en ny kod men inte samma kod direkt igen', () => {
    const gate = createScanGate(2000)
    expect(gate.accept('7310865000637', 0)).toBe(true)
    expect(gate.accept('7310865000637', 500)).toBe(false)
    expect(gate.accept('7310865000637', 2500)).toBe(true)
  })

  it('släpper igenom en annan kod direkt', () => {
    const gate = createScanGate(2000)
    gate.accept('11111111', 0)
    expect(gate.accept('22222222', 10)).toBe(true)
  })

  it('är låst medan en produkt visas, och samma kod vilar en stund efter upplåsning', () => {
    const gate = createScanGate(2000)
    gate.accept('7310865000637', 0)
    gate.lock()
    expect(gate.locked).toBe(true)
    expect(gate.accept('22222222', 100)).toBe(false)
    gate.unlock(10_000)
    expect(gate.accept('7310865000637', 11_000)).toBe(false)
    expect(gate.accept('7310865000637', 12_500)).toBe(true)
  })

  it('kan nollställas (t.ex. vid manuell inmatning)', () => {
    const gate = createScanGate(2000)
    gate.accept('7310865000637', 0)
    gate.lock()
    gate.reset()
    expect(gate.accept('7310865000637', 1)).toBe(true)
  })
})

describe('classifyCameraError', () => {
  it('översätter getUserMedia-fel', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('nocamera')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('busy')
    expect(classifyCameraError({ name: 'NotSupportedError' })).toBe('unsupported')
    expect(classifyCameraError(new Error('okänt'))).toBe('error')
  })
})

describe('kamerans spår', () => {
  function fakeStream(caps: Record<string, unknown> = {}) {
    const track = {
      stop: vi.fn(),
      getCapabilities: () => caps,
      applyConstraints: vi.fn(async () => undefined),
    }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
    return { stream, track }
  }

  it('stoppar alla spår så att kameran släpps', () => {
    const { stream, track } = fakeStream()
    stopStream(stream)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(() => stopStream(null)).not.toThrow()
  })

  it('känner av och styr ficklampan', async () => {
    expect(torchSupported(fakeStream().stream)).toBe(false)
    const { stream, track } = fakeStream({ torch: true })
    expect(torchSupported(stream)).toBe(true)
    expect(await setTorch(stream, true)).toBe(true)
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  })
})

describe('cleanManualCode', () => {
  it('behåller bara siffror, högst 14', () => {
    expect(cleanManualCode('7310 8650-0063 7')).toBe('7310865000637')
    expect(cleanManualCode('1234567890123456')).toBe('12345678901234')
  })
})

describe('kamerafel per plattform', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('i webbläsaren hänvisar texterna till webbläsarens inställningar', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'web')
    vi.resetModules()
    const { CAMERA_ERROR_TEXT } = await import('./scanner')
    expect(CAMERA_ERROR_TEXT.denied.text).toBe(
      'Tillåt kameran för Lagom i webbläsarens inställningar. Försök sedan igen – eller skriv in siffrorna under streckkoden.',
    )
    expect(CAMERA_ERROR_TEXT.unsupported.text).toMatch(/^Webbläsaren kan inte använda kameran/)
    expect(CAMERA_ERROR_TEXT.insecure.title).toBe('Kameran kräver en säker anslutning')
  })

  it('i App Store-bygget hänvisar texterna till telefonens Inställningar och nämner aldrig webbläsaren', async () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'appstore')
    vi.resetModules()
    const { CAMERA_ERROR_TEXT, classifyCameraError, cameraAvailability } = await import('./scanner')
    expect(CAMERA_ERROR_TEXT.denied.text).toMatch(/^Tillåt kameran för Lagom i telefonens Inställningar\./)
    for (const t of Object.values(CAMERA_ERROR_TEXT)) {
      expect(`${t.title} ${t.text}`).not.toMatch(/webbläsar|https|flik/i)
    }
    // "Säker anslutning" visas aldrig i appen.
    expect(CAMERA_ERROR_TEXT.insecure).toEqual(CAMERA_ERROR_TEXT.unsupported)
    const secure = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    try {
      expect(classifyCameraError({ name: 'SecurityError' })).toBe('denied')
      expect(cameraAvailability()).not.toBe('insecure')
    } finally {
      if (secure) Object.defineProperty(window, 'isSecureContext', secure)
      else delete (window as { isSecureContext?: boolean }).isSecureContext
    }
  })
})

// ---------------------------------------------------------------------------
// ZXing-reserven
// ---------------------------------------------------------------------------

const zxing = vi.hoisted(() => ({
  options: undefined as { delayBetweenScanAttempts?: number } | undefined,
  stop: vi.fn(),
  fail: false,
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: class {
    constructor(_hints: unknown, options: { delayBetweenScanAttempts?: number }) {
      zxing.options = options
    }
    async decodeFromStream() {
      if (zxing.fail) throw new Error('ingen kamera')
      // ZXing brusar i konsolen för varje bildruta utan streckkod.
      console.warn('MultiFormatReader: non-ReaderException NotFoundException')
      return { stop: zxing.stop }
    }
  },
}))
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3, UPC_E: 4 },
  DecodeHintType: { POSSIBLE_FORMATS: 1 },
}))

describe('ZXing-reserven', () => {
  const stream = {} as MediaStream
  const video = {} as HTMLVideoElement

  afterEach(() => {
    zxing.fail = false
    zxing.stop.mockReset()
    vi.restoreAllMocks()
  })

  it('läser var 250:e ms, filtrerar bort brusvarningarna och återställer console.warn vid stop()', async () => {
    const original = console.warn
    const spy = vi.fn()
    console.warn = spy
    try {
      const { startBarcodeScanner, ZXING_INTERVAL_MS } = await import('./scanner')
      expect(ZXING_INTERVAL_MS).toBe(250)
      const scanner = await startBarcodeScanner(video, stream, () => {})
      expect(scanner.engine).toBe('zxing')
      expect(zxing.options?.delayBetweenScanAttempts).toBe(250)
      // Bruset nådde aldrig konsolen, men andra varningar gör det.
      expect(spy).not.toHaveBeenCalled()
      console.warn('Något annat')
      expect(spy).toHaveBeenCalledWith('Något annat')
      expect(console.warn).not.toBe(spy)
      scanner.stop()
      expect(console.warn).toBe(spy)
      expect(zxing.stop).toHaveBeenCalledOnce()
    } finally {
      console.warn = original
    }
  })

  it('återställer console.warn även när stop() kastar eller starten misslyckas', async () => {
    const original = console.warn
    const spy = vi.fn()
    console.warn = spy
    try {
      const { startBarcodeScanner } = await import('./scanner')
      zxing.stop.mockImplementation(() => {
        throw new Error('redan stoppad')
      })
      const scanner = await startBarcodeScanner(video, stream, () => {})
      scanner.stop()
      expect(console.warn).toBe(spy)
      // Ett andra stop() gör ingenting.
      scanner.stop()
      expect(console.warn).toBe(spy)

      zxing.fail = true
      await expect(startBarcodeScanner(video, stream, () => {})).rejects.toThrow('ingen kamera')
      expect(console.warn).toBe(spy)
    } finally {
      console.warn = original
    }
  })
})
