import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VOICE_LANG,
  VOICE_SEARCH_BUILD,
  checkVoiceAvailability,
  cleanTranscript,
  createLocalRecognition,
  installSwedishVoice,
  isWebKitOnlyBrowser,
  localRecognitionCtor,
  transcriptFrom,
  voiceErrorMessage,
  type LocalRecognitionCtor,
  type VoiceEnv,
} from './voiceSearch'

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const EDGE = `${CHROME} Edg/140.0.0.0`
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0'
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const SAFARI_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1'

interface MockOptions {
  status?: string | Error
  install?: boolean | Error | 'saknas'
  /** 'accessor' = som i specen, 'saknas' = ingen processLocally, 'ignoreras' = går inte att sätta. */
  processLocally?: 'accessor' | 'saknas' | 'ignoreras'
  available?: 'saknas'
}

function mockCtor({ status = 'available', install = true, processLocally = 'accessor', available }: MockOptions = {}) {
  class Recognition {
    lang = ''
    continuous = true
    interimResults = false
    maxAlternatives = 3
    onstart = null
    onresult = null
    onnomatch = null
    onerror = null
    onend = null
    start = vi.fn()
    stop = vi.fn()
    abort = vi.fn()
  }
  const statics = Recognition as unknown as Record<string, unknown>
  if (available !== 'saknas') statics.available = vi.fn(() => (status instanceof Error ? Promise.reject(status) : Promise.resolve(status)))
  if (install !== 'saknas') statics.install = vi.fn(() => (install instanceof Error ? Promise.reject(install) : Promise.resolve(install)))
  if (processLocally === 'accessor') {
    Object.defineProperty(Recognition.prototype, 'processLocally', {
      configurable: true,
      get(this: { _local?: boolean }) {
        return this._local ?? false
      },
      set(this: { _local?: boolean }, value: boolean) {
        this._local = Boolean(value)
      },
    })
  } else if (processLocally === 'ignoreras') {
    Object.defineProperty(Recognition.prototype, 'processLocally', { configurable: true, get: () => false, set: () => {} })
  }
  return Recognition as unknown as LocalRecognitionCtor & { available: ReturnType<typeof vi.fn>; install: ReturnType<typeof vi.fn> }
}

function env(scope: unknown, userAgent = CHROME, inApp = false): VoiceEnv {
  return { scope, userAgent, inApp }
}

describe('isWebKitOnlyBrowser', () => {
  it('känner igen Safari och alla webbläsare på iPhone', () => {
    expect(isWebKitOnlyBrowser(SAFARI_MAC)).toBe(true)
    expect(isWebKitOnlyBrowser(SAFARI_IOS)).toBe(true)
    expect(isWebKitOnlyBrowser(CHROME_IOS)).toBe(true)
  })

  it('släpper igenom Chrome, Edge och Firefox på dator och Android', () => {
    expect(isWebKitOnlyBrowser(CHROME)).toBe(false)
    expect(isWebKitOnlyBrowser(CHROME_ANDROID)).toBe(false)
    expect(isWebKitOnlyBrowser(EDGE)).toBe(false)
    expect(isWebKitOnlyBrowser(FIREFOX)).toBe(false)
  })
})

describe('localRecognitionCtor', () => {
  it('ger konstruktorn när igenkänning på enheten finns', () => {
    const ctor = mockCtor()
    expect(localRecognitionCtor(env({ SpeechRecognition: ctor }))).toBe(ctor)
    expect(localRecognitionCtor(env({ SpeechRecognition: ctor }, CHROME_ANDROID))).toBe(ctor)
  })

  it('använder aldrig webkitSpeechRecognition (skickar ljudet till en taltjänst)', () => {
    expect(localRecognitionCtor(env({ webkitSpeechRecognition: mockCtor() }))).toBeNull()
    expect(localRecognitionCtor(env({}))).toBeNull()
    expect(localRecognitionCtor(env(undefined))).toBeNull()
  })

  it('kräver available() och processLocally', () => {
    expect(localRecognitionCtor(env({ SpeechRecognition: mockCtor({ processLocally: 'saknas' }) }))).toBeNull()
    expect(localRecognitionCtor(env({ SpeechRecognition: mockCtor({ available: 'saknas' }) }))).toBeNull()
  })

  it('ingen röstsökning i Safari, på iPhone eller i apparna', () => {
    const ctor = mockCtor()
    expect(localRecognitionCtor(env({ SpeechRecognition: ctor }, SAFARI_MAC))).toBeNull()
    expect(localRecognitionCtor(env({ SpeechRecognition: ctor }, CHROME_IOS))).toBeNull()
    expect(localRecognitionCtor(env({ SpeechRecognition: ctor }, CHROME, true))).toBeNull()
  })

  it('kastar aldrig', () => {
    const scope = Object.defineProperty({}, 'SpeechRecognition', {
      get() {
        throw new Error('trasig')
      },
    })
    expect(localRecognitionCtor(env(scope))).toBeNull()
  })
})

describe('butiksbyggena (VOICE_SEARCH_BUILD)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('webbygget har röstsökningen', () => {
    expect(VOICE_SEARCH_BUILD).toBe(true)
  })

  it.each(['appstore', 'play'])('%s: ingen röstsökning, inte ens med igenkänning på enheten', async (distribution) => {
    vi.stubEnv('VITE_DISTRIBUTION', distribution)
    vi.resetModules()
    const fresh = await import('./voiceSearch')
    expect(fresh.VOICE_SEARCH_BUILD).toBe(false)
    // Även om appen skulle köras i en vanlig webbläsare (inApp false) med SpeechRecognition.
    expect(fresh.localRecognitionCtor(env({ SpeechRecognition: mockCtor() }))).toBeNull()
  })
})

describe('checkVoiceAvailability', () => {
  it('frågar efter svenska på enheten', async () => {
    const ctor = mockCtor({ status: 'available' })
    await expect(checkVoiceAvailability(ctor)).resolves.toBe('available')
    expect(ctor.available).toHaveBeenCalledWith({ langs: [VOICE_LANG], processLocally: true })
    expect(VOICE_LANG).toBe('sv-SE')
  })

  it('skickar vidare downloadable och downloading', async () => {
    await expect(checkVoiceAvailability(mockCtor({ status: 'downloadable' }))).resolves.toBe('downloadable')
    await expect(checkVoiceAvailability(mockCtor({ status: 'downloading' }))).resolves.toBe('downloading')
  })

  it('räknar fel, okända svar och downloadable utan install() som unavailable', async () => {
    await expect(checkVoiceAvailability(mockCtor({ status: 'unavailable' }))).resolves.toBe('unavailable')
    await expect(checkVoiceAvailability(mockCtor({ status: 'kanske' }))).resolves.toBe('unavailable')
    await expect(checkVoiceAvailability(mockCtor({ status: new Error('NotAllowedError') }))).resolves.toBe('unavailable')
    await expect(checkVoiceAvailability(mockCtor({ status: 'downloadable', install: 'saknas' }))).resolves.toBe('unavailable')
  })
})

describe('installSwedishVoice', () => {
  it('hämtar svenska med samma alternativ som kontrollen', async () => {
    const ctor = mockCtor({ install: true })
    await expect(installSwedishVoice(ctor)).resolves.toBe(true)
    expect(ctor.install).toHaveBeenCalledWith({ langs: ['sv-SE'], processLocally: true })
  })

  it('ger false när hämtningen misslyckas', async () => {
    await expect(installSwedishVoice(mockCtor({ install: false }))).resolves.toBe(false)
    await expect(installSwedishVoice(mockCtor({ install: new Error('nät') }))).resolves.toBe(false)
    await expect(installSwedishVoice(mockCtor({ install: 'saknas' }))).resolves.toBe(false)
  })
})

describe('createLocalRecognition', () => {
  it('kräver igenkänning på enheten och ställer in svenska med delresultat', () => {
    const rec = createLocalRecognition(mockCtor())
    expect(rec).not.toBeNull()
    expect(rec?.processLocally).toBe(true)
    expect(rec?.lang).toBe('sv-SE')
    expect(rec?.interimResults).toBe(true)
    expect(rec?.continuous).toBe(false)
    expect(rec?.maxAlternatives).toBe(1)
    expect(rec?.start).not.toHaveBeenCalled()
  })

  it('ger null när processLocally saknas eller inte går att sätta', () => {
    expect(createLocalRecognition(mockCtor({ processLocally: 'saknas' }))).toBeNull()
    expect(createLocalRecognition(mockCtor({ processLocally: 'ignoreras' }))).toBeNull()
  })
})

describe('transcriptFrom', () => {
  it('slår ihop resultaten och städar texten', () => {
    expect(transcriptFrom([[{ transcript: 'Två ägg' }], [{ transcript: ' och en smörgås.' }]])).toBe('Två ägg och en smörgås')
    expect(transcriptFrom([])).toBe('')
    expect(cleanTranscript('  havregrynsgröt!  ')).toBe('havregrynsgröt')
    expect(cleanTranscript('1,5 dl mjölk')).toBe('1,5 dl mjölk')
  })
})

describe('voiceErrorMessage', () => {
  it('säger inget när lyssnandet avbröts', () => {
    expect(voiceErrorMessage('aborted')).toBeNull()
  })

  it('ger vänliga meddelanden', () => {
    expect(voiceErrorMessage('not-allowed')).toMatch(/tillåta mikrofonen/)
    expect(voiceErrorMessage('no-speech')).toMatch(/hörde inget/)
    expect(voiceErrorMessage('language-not-supported')).toMatch(/inget ljud har skickats/)
    expect(voiceErrorMessage('något-nytt')).toMatch(/Prova igen/)
  })
})
