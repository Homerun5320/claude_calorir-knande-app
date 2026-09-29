/**
 * Streckkodsläsaren i de inbyggda apparna (@capacitor/barcode-scanner) med ett mockat tillägg:
 * förfrågan (alla format, ML Kit, svenska texter), livsmedelskoderna (EAN-13/8, UPC-A/E, GS1),
 * felläsningar och fel sorts kod, avbrutet, nekad kamera med vänlig text, fel, ML Kit → ZXing,
 * tillägget saknas, ett anrop i taget och haptiken.
 */
import {
  classifyScanError,
  expandUpcE,
  foodCodeFromScan,
  gtinFromGs1,
  INVALID_SCAN_TEXT,
  resetBarcodeForTests,
  scanBarcode,
  scanFoodBarcode,
  SCAN_INSTRUCTIONS,
} from './barcode'

const mocks = vi.hoisted(() => ({
  scanBarcode: vi.fn(),
  impact: vi.fn(),
  logError: vi.fn(),
}))

// Tilläggets riktiga konstanter (formatnumren), men en mockad läsare.
vi.mock('@capacitor/barcode-scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor/barcode-scanner')>()),
  CapacitorBarcodeScanner: { scanBarcode: mocks.scanBarcode },
}))
vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: mocks.impact }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' } }))
vi.mock('../lib/errorLog', () => ({ logError: mocks.logError }))
// I appen: texterna hänvisar till telefonens Inställningar.
vi.mock('../config/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../config/platform')>()),
  isInApp: () => true,
  isNativeApp: () => true,
  cameraSettingsHint: () => 'Tillåt kameran för Lagom i telefonens Inställningar.',
}))

/** Formatnumren som tillägget svarar med (html5-qrcode-ordningen, lika på iPhone och Android). */
const FORMAT = { QR_CODE: 0, CODE_128: 5, DATA_MATRIX: 6, EAN_13: 9, EAN_8: 10, UPC_A: 14, UPC_E: 15, UNKNOWN: 17 } as const

function pluginError(message: string, code?: string): Error {
  return Object.assign(new Error(message), code ? { code } : {})
}

const CANCELLED = () => pluginError('Couldn’t scan because the process was cancelled.', 'OS-PLUG-BARC-0006')
const DENIED = () => pluginError('Couldn’t scan because camera access wasn’t provided. Check your camera permissions and try again.', 'OS-PLUG-BARC-0007')
const GENERAL = () => pluginError('Error while trying to scan code.', 'OS-PLUG-BARC-0004')
const MLKIT = () => pluginError('There was an error scanning the barcode with ML Kit.', 'OS-PLUG-BARC-0010')
const ZXING = () => pluginError('There was an error scanning the barcode with ZXing.', 'OS-PLUG-BARC-0009')

function scanned(ScanResult: string, format: number) {
  return { ScanResult, format }
}

beforeEach(() => {
  mocks.impact.mockResolvedValue(undefined)
})

afterEach(() => {
  mocks.scanBarcode.mockReset()
  mocks.impact.mockReset()
  mocks.logError.mockReset()
  resetBarcodeForTests()
})

describe('förfrågan till tillägget', () => {
  it('läser alla format med ML Kit, bakre kameran och svenska texter', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await scanFoodBarcode()
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(1)
    expect(mocks.scanBarcode).toHaveBeenCalledWith({
      hint: 17, // ALL – tillägget kan bara begränsas till ett format; livsmedelskoderna väljs ut här
      scanInstructions: SCAN_INSTRUCTIONS,
      scanButton: false,
      cameraDirection: 1, // BACK
      scanOrientation: 1, // PORTRAIT – appen är bara i stående läge
      cancelButtonAccessibilityLabel: 'Avbryt',
      torchButtonOnAccessibilityLabel: 'Släck ficklampan',
      torchButtonOffAccessibilityLabel: 'Tänd ficklampan',
      // ZXing: ML Kit skickar driftdata till Google och används inte (se barcode.ts).
      android: { scanningLibrary: 'zxing' },
    })
  })

  it('egen instruktionstext', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await scanFoodBarcode({ instructions: 'Skanna nästa vara' })
    expect(mocks.scanBarcode.mock.calls[0][0]).toMatchObject({ scanInstructions: 'Skanna nästa vara' })
  })
})

describe('livsmedelskoder', () => {
  it('EAN-13 ger koden och en lätt haptisk knäpp', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'scanned', code: '7310865000637', format: 'ean_13' })
    expect(mocks.impact).toHaveBeenCalledWith({ style: 'LIGHT' })
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('EAN-8 och UPC-A (12 siffror från ML Kit, 13 från Apple Vision)', () => {
    expect(foodCodeFromScan('73100805', FORMAT.EAN_8)).toEqual({ code: '73100805', format: 'ean_8' })
    expect(foodCodeFromScan('042100005264', FORMAT.UPC_A)).toEqual({ code: '042100005264', format: 'upc_a' })
    // Vision skiljer inte på UPC-A och EAN-13: samma kod kan komma under båda namnen.
    expect(foodCodeFromScan('0042100005264', FORMAT.UPC_A)).toEqual({ code: '0042100005264', format: 'upc_a' })
    expect(foodCodeFromScan('042100005264', FORMAT.EAN_13)).toEqual({ code: '042100005264', format: 'ean_13' })
  })

  it('UPC-E utökas till UPC-A', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('04252614', FORMAT.UPC_E))
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'scanned', code: '042100005264', format: 'upc_e' })
    expect(foodCodeFromScan('01234565', FORMAT.UPC_E)).toEqual({ code: '012345000065', format: 'upc_e' })
    // Redan utökad (12 siffror) godtas som den är.
    expect(foodCodeFromScan('012345000065', FORMAT.UPC_E)).toEqual({ code: '012345000065', format: 'upc_e' })
  })

  it('blanksteg och bindestreck tas bort', () => {
    expect(foodCodeFromScan(' 7310865-000637 ', FORMAT.EAN_13)).toEqual({ code: '7310865000637', format: 'ean_13' })
  })

  it('fel kontrollsiffra är en felläsning – ingen haptik', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000638', FORMAT.EAN_13))
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'invalid', ...INVALID_SCAN_TEXT.misread })
    expect(mocks.impact).not.toHaveBeenCalled()
    expect(foodCodeFromScan('04252615', FORMAT.UPC_E)).toBeNull()
    expect(foodCodeFromScan('7310865', FORMAT.EAN_13)).toBeNull()
    expect(foodCodeFromScan('ABC', FORMAT.EAN_8)).toBeNull()
  })

  it('en QR-kod med en vanlig webbadress går inte att söka på', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('https://www.lagomappen.se/', FORMAT.QR_CODE))
    const outcome = await scanFoodBarcode()
    expect(outcome).toEqual({ status: 'invalid', ...INVALID_SCAN_TEXT.notFood })
    expect(outcome.status === 'invalid' && outcome.text).toMatch(/förpackningen/)
    expect(mocks.impact).not.toHaveBeenCalled()
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('andra streckkoder (t.ex. Code 128) går inte att söka på, även med siffror', () => {
    expect(foodCodeFromScan('7310865000637', FORMAT.CODE_128)).toBeNull()
    expect(foodCodeFromScan('0107310865000637', FORMAT.CODE_128)).toBeNull()
  })

  it('GS1 Digital Link i en QR-kod ger produktens EAN', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('https://id.gs1.org/01/07310865000637/10/ABC123?17=271231', FORMAT.QR_CODE))
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'scanned', code: '7310865000637', format: 'gs1' })
    expect(mocks.impact).toHaveBeenCalledTimes(1)
  })

  it('GS1 DataMatrix: elementsträng med eller utan prefix, FNC1 och parenteser', () => {
    const gs = String.fromCharCode(29)
    expect(foodCodeFromScan(`]d2${gs}010731086500063710ABC${gs}17271231`, FORMAT.DATA_MATRIX)).toEqual({ code: '7310865000637', format: 'gs1' })
    expect(foodCodeFromScan('0107310865000637', FORMAT.DATA_MATRIX)).toEqual({ code: '7310865000637', format: 'gs1' })
    expect(foodCodeFromScan('(01)07310865000637(10)ABC', FORMAT.QR_CODE)).toEqual({ code: '7310865000637', format: 'gs1' })
  })

  it('okänt format: GS1 eller bara siffror med rätt kontrollsiffra', () => {
    expect(foodCodeFromScan('7310865000637', FORMAT.UNKNOWN)).toEqual({ code: '7310865000637', format: 'ean_13' })
    expect(foodCodeFromScan('73100805', FORMAT.UNKNOWN)).toEqual({ code: '73100805', format: 'ean_8' })
    expect(foodCodeFromScan('042100005264', FORMAT.UNKNOWN)).toEqual({ code: '042100005264', format: 'upc_a' })
    expect(foodCodeFromScan('https://id.gs1.org/01/07310865000637', FORMAT.UNKNOWN)).toEqual({ code: '7310865000637', format: 'gs1' })
    expect(foodCodeFromScan('7310865000638', FORMAT.UNKNOWN)).toBeNull()
    expect(foodCodeFromScan('hej', FORMAT.UNKNOWN)).toBeNull()
  })

  it('en tom avläsning räknas som avbruten', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('', FORMAT.UNKNOWN))
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'cancelled' })
  })
})

describe('UPC-E och GS1', () => {
  it('expandUpcE: alla fyra mönstren, utan kontrollsiffra och utan talsystem', () => {
    expect(expandUpcE('04252614')).toBe('042100005264') // sista siffran 0–2
    expect(expandUpcE('01234565')).toBe('012345000065') // 5–9
    expect(expandUpcE('0123453')).toMatch(/^01230000045\d$/) // 3
    expect(expandUpcE('0123454')).toMatch(/^01234000005\d$/) // 4
    expect(expandUpcE('0425261')).toBe('042100005264')
    expect(expandUpcE('425261')).toBe('042100005264')
    // Utökningen får rätt kontrollsiffra enligt EAN/UPC.
    for (const code of ['0123453', '0123454', '1123456']) {
      const upcA = expandUpcE(code)
      expect(upcA).toHaveLength(12)
      expect(foodCodeFromScan(upcA ?? '', FORMAT.UPC_A)).not.toBeNull()
    }
  })

  it('expandUpcE: fel talsystem, längd eller kontrollsiffra ger null', () => {
    expect(expandUpcE('24252614')).toBeNull()
    expect(expandUpcE('04252615')).toBeNull()
    expect(expandUpcE('12345')).toBeNull()
    expect(expandUpcE('0425a614')).toBeNull()
  })

  it('gtinFromGs1: GTIN-14 med nollor först blir EAN-13 eller EAN-8', () => {
    expect(gtinFromGs1('https://example.com/01/07310865000637')).toBe('7310865000637')
    expect(gtinFromGs1('https://example.com/gtin/7310865000637?x=1')).toBe('7310865000637')
    expect(gtinFromGs1('0100000073100805')).toBe('73100805')
    // UPC-A i en GTIN-14 → 13 siffror med en nolla först (barcodeVariants känner igen båda).
    expect(gtinFromGs1('0100042100005264')).toBe('0042100005264')
    // Fel kontrollsiffra, fel längd eller ingen GTIN.
    expect(gtinFromGs1('https://example.com/01/07310865000638')).toBeNull()
    expect(gtinFromGs1('https://example.com/01/123456789')).toBeNull()
    expect(gtinFromGs1('https://example.com/nyheter/2026/01/')).toBeNull()
    expect(gtinFromGs1('10ABC')).toBeNull()
  })
})

describe('avbrutet, nekad kamera och fel', () => {
  it('Avbryt i läsaren ger cancelled och loggas inte', async () => {
    mocks.scanBarcode.mockRejectedValue(CANCELLED())
    await expect(scanFoodBarcode()).resolves.toEqual({ status: 'cancelled' })
    expect(mocks.logError).not.toHaveBeenCalled()
    expect(mocks.impact).not.toHaveBeenCalled()
  })

  it('nekad kamera ger en vänlig text som hänvisar till telefonens Inställningar', async () => {
    mocks.scanBarcode.mockRejectedValue(DENIED())
    const outcome = await scanFoodBarcode()
    expect(outcome).toMatchObject({ status: 'denied', reason: 'denied', title: 'Kameran är inte tillåten' })
    expect(outcome.status === 'denied' && outcome.text).toContain('Tillåt kameran för Lagom i telefonens Inställningar.')
    expect(outcome.status === 'denied' && outcome.text).toMatch(/skriv in siffrorna/)
    expect(mocks.logError).not.toHaveBeenCalled()
  })

  it('ett fel i läsaren loggas och ger en text om att försöka igen', async () => {
    mocks.scanBarcode.mockRejectedValue(GENERAL())
    const outcome = await scanFoodBarcode()
    expect(outcome).toMatchObject({ status: 'error', reason: 'error', title: 'Kameran gick inte att starta' })
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:streckkod')
  })

  it('tillägget saknas i appen: unavailable (ScanPage tar webbens kamera), loggas', async () => {
    mocks.scanBarcode.mockRejectedValue(pluginError('"CapacitorBarcodeScanner" plugin is not implemented on ios', 'UNIMPLEMENTED'))
    await expect(scanFoodBarcode()).resolves.toMatchObject({ status: 'unavailable', reason: 'unsupported' })
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:streckkod')
  })

  it('classifyScanError: koderna och texten som reserv', () => {
    expect(classifyScanError(CANCELLED())).toBe('cancelled')
    expect(classifyScanError(DENIED())).toBe('denied')
    expect(classifyScanError(MLKIT())).toBe('mlkit')
    expect(classifyScanError(ZXING())).toBe('error')
    expect(classifyScanError(pluginError('x', 'UNAVAILABLE'))).toBe('unavailable')
    expect(classifyScanError(new Error('Scan was cancelled'))).toBe('cancelled')
    expect(classifyScanError(new Error('Camera access denied'))).toBe('denied')
    expect(classifyScanError(new Error('"X.scanBarcode()" is not implemented on android'))).toBe('unavailable')
    expect(classifyScanError('trasigt')).toBe('error')
    expect(classifyScanError(null)).toBe('error')
  })
})

describe('Android: ML Kit → ZXing (bara om ML Kit väljs)', () => {
  const mlkit = { androidLibrary: 'mlkit' as const } as Parameters<typeof scanFoodBarcode>[0]

  it('standard är ZXing – ett fel där ger inget nytt försök', async () => {
    mocks.scanBarcode.mockRejectedValueOnce(MLKIT())
    await expect(scanFoodBarcode()).resolves.toMatchObject({ status: 'error' })
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(1)
    expect(mocks.scanBarcode.mock.calls[0][0]).toMatchObject({ android: { scanningLibrary: 'zxing' } })
  })

  it('fel i ML Kit: nytt försök med ZXing, som sedan används resten av sessionen', async () => {
    mocks.scanBarcode.mockRejectedValueOnce(MLKIT()).mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await expect(scanFoodBarcode(mlkit)).resolves.toMatchObject({ status: 'scanned', code: '7310865000637' })
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(2)
    expect(mocks.scanBarcode.mock.calls[0][0]).toMatchObject({ android: { scanningLibrary: 'mlkit' } })
    expect(mocks.scanBarcode.mock.calls[1][0]).toMatchObject({ android: { scanningLibrary: 'zxing' } })
    expect(mocks.logError).toHaveBeenCalledTimes(1)

    await scanFoodBarcode(mlkit)
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(3)
    expect(mocks.scanBarcode.mock.calls[2][0]).toMatchObject({ android: { scanningLibrary: 'zxing' } })
  })

  it('fel även i ZXing ger error', async () => {
    mocks.scanBarcode.mockRejectedValueOnce(MLKIT()).mockRejectedValueOnce(ZXING())
    await expect(scanFoodBarcode(mlkit)).resolves.toMatchObject({ status: 'error' })
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(2)
  })

  it('avbryter man i ZXing-försöket är det bara avbrutet', async () => {
    mocks.scanBarcode.mockRejectedValueOnce(MLKIT()).mockRejectedValueOnce(CANCELLED())
    await expect(scanFoodBarcode(mlkit)).resolves.toEqual({ status: 'cancelled' })
  })
})

describe('ett anrop i taget och haptik', () => {
  it('ett andra anrop medan läsaren är öppen får samma svar – ingen andra läsare', async () => {
    let resolve!: (value: unknown) => void
    mocks.scanBarcode.mockReturnValue(new Promise((res) => (resolve = res)))
    const first = scanFoodBarcode()
    const second = scanBarcode()
    resolve(scanned('7310865000637', FORMAT.EAN_13))
    await expect(first).resolves.toMatchObject({ status: 'scanned' })
    await expect(second).resolves.toBe('7310865000637')
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(1)
    expect(mocks.impact).toHaveBeenCalledTimes(1)

    // Efteråt öppnas en ny läsare.
    mocks.scanBarcode.mockResolvedValue(scanned('73100805', FORMAT.EAN_8))
    await expect(scanBarcode()).resolves.toBe('73100805')
    expect(mocks.scanBarcode).toHaveBeenCalledTimes(2)
  })

  it('haptic: false ger ingen knäpp', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await scanFoodBarcode({ haptic: false })
    expect(mocks.impact).not.toHaveBeenCalled()
  })

  it('ett fel i haptiken stoppar inte träffen', async () => {
    mocks.impact.mockRejectedValue(new Error('Haptics not available'))
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    await expect(scanFoodBarcode()).resolves.toMatchObject({ status: 'scanned' })
    await vi.waitFor(() => expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'native:streckkod'))
  })
})

describe('scanBarcode(): kod eller null', () => {
  it('ger koden', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('7310865000637', FORMAT.EAN_13))
    const onProblem = vi.fn()
    await expect(scanBarcode({ onProblem })).resolves.toBe('7310865000637')
    expect(onProblem).not.toHaveBeenCalled()
  })

  it('avbrutet: null utan text', async () => {
    mocks.scanBarcode.mockRejectedValue(CANCELLED())
    const onProblem = vi.fn()
    await expect(scanBarcode({ onProblem })).resolves.toBeNull()
    expect(onProblem).not.toHaveBeenCalled()
  })

  it('nekad kamera: null och en vänlig text med cameraSettingsHint()', async () => {
    mocks.scanBarcode.mockRejectedValue(DENIED())
    const onProblem = vi.fn()
    await expect(scanBarcode({ onProblem })).resolves.toBeNull()
    expect(onProblem).toHaveBeenCalledWith(expect.objectContaining({ status: 'denied', text: expect.stringContaining('telefonens Inställningar') }))
  })

  it('fel sorts kod: null och en text om streckkoden på förpackningen', async () => {
    mocks.scanBarcode.mockResolvedValue(scanned('WIFI:S:Hemma;;', FORMAT.QR_CODE))
    const onProblem = vi.fn()
    await expect(scanBarcode({ onProblem })).resolves.toBeNull()
    expect(onProblem).toHaveBeenCalledWith({ status: 'invalid', ...INVALID_SCAN_TEXT.notFood })
  })

  it('kastar aldrig – inte heller om onProblem gör det', async () => {
    mocks.scanBarcode.mockRejectedValue(GENERAL())
    const onProblem = vi.fn(() => {
      throw new Error('trasig notis')
    })
    await expect(scanBarcode({ onProblem })).resolves.toBeNull()
    await expect(scanBarcode()).resolves.toBeNull()
  })
})
