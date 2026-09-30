/**
 * Mikrofonknappen i sökfältet – röstsökning med taligenkänning på enheten (se `lib/voiceSearch`).
 *
 * ```tsx
 * const voice = useVoiceSearch(setQuery)
 * <TextField … suffix={voice.visible ? <VoiceSearchButton voice={voice} /> : undefined} />
 * {voice.visible && <VoiceSearchStatus voice={voice} />}
 * ```
 *
 * - Knappen visas bara när webbläsaren har svensk igenkänning på enheten ('available') eller kan
 *   hämta den ('downloadable'/'downloading'). Annars syns ingenting – aldrig reserv till en server.
 * - Mikrofonen frågas först när man trycker (då anropas `start()`).
 * - Saknas språkpaketet erbjuds det i en dialog, och `install()` anropas först när man valt
 *   "Hämta" – aldrig automatiskt. Efter hämtningen trycker man på mikrofonen igen.
 * - Medan Lagom lyssnar fylls texten i sökfältet efterhand (delresultat). Tryck igen eller Escape
 *   för att sluta; att skriva i fältet avbryter.
 * - Status och fel läses upp via en aria-live-region. Under lyssnandet är uppläsningen kort, så
 *   att skärmläsarens röst inte hamnar i mikrofonen.
 * - I butiksbyggena (App Store och Google Play) finns ingen röstsökning: `useVoiceSearch` ger då
 *   alltid `visible: false`, komponenterna ritar ingenting, och koden för taligenkänningen tas bort
 *   ur paketet (`VOICE_SEARCH` nedan, se `VOICE_SEARCH_BUILD` i lib/voiceSearch).
 */
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import { Mic, MicOff, Square } from 'lucide-react'
import { IconButton, confirmDialog, cx } from '../../components/ui'
import {
  VOICE_SEARCH_BUILD,
  checkVoiceAvailability,
  createLocalRecognition,
  installSwedishVoice,
  localRecognitionCtor,
  transcriptFrom,
  voiceErrorMessage,
  type LocalRecognition,
  type LocalRecognitionCtor,
  type VoiceAvailability,
} from '../../lib/voiceSearch'
import { logError } from '../../lib/errorLog'

/** Sätts av vite.config.ts (`define`); finns inte i testerna. */
declare const __LAGOM_DISTRIBUTION__: string | undefined

/**
 * Röstsökningen finns i bygget (bara webbygget) – en konstant i samma modul, så att Vite tar bort
 * koden ur butiksbyggena. Se VOICE_SEARCH_BUILD i src/lib/voiceSearch.ts.
 */
const VOICE_SEARCH: boolean = typeof __LAGOM_DISTRIBUTION__ === 'string' ? __LAGOM_DISTRIBUTION__ === 'web' : VOICE_SEARCH_BUILD

export type VoiceSupport = 'checking' | 'unsupported' | VoiceAvailability
/** checking = kontrollerar språkpaketet efter ett tryck; starting = väntar på mikrofonen. */
export type VoicePhase = 'idle' | 'checking' | 'starting' | 'listening' | 'stopping' | 'installing'

export interface VoiceNotice {
  text: string
  tone: 'info' | 'error'
}

export interface VoiceSearch {
  /** Knappen ska visas (igenkänning på enheten finns eller kan hämtas). */
  visible: boolean
  support: VoiceSupport
  phase: VoicePhase
  /** Senaste meddelandet (fel, hämtning klar …) när Lagom inte lyssnar. */
  notice: VoiceNotice | null
  /** Knapptrycket: börja lyssna, sluta lyssna eller erbjuda hämtning av språkpaketet. */
  toggle: () => void
  /** Sluta lyssna och behåll det som hunnit tolkas. */
  stop: () => void
  /** Avbryt direkt (t.ex. när man börjar skriva) och rensa meddelandet. */
  cancel: () => void
}

/** Texten i hämtningsdialogen – ett tydligt val innan webbläsaren laddar ned något. */
export const INSTALL_OFFER = 'Hämta svensk taligenkänning till enheten – görs en gång av webbläsaren.'

/** Säkerhetsspärr om webbläsaren aldrig skickar "end" efter stop(). */
const STOP_TIMEOUT_MS = 3000

function detach(rec: LocalRecognition): void {
  rec.onstart = null
  rec.onresult = null
  rec.onnomatch = null
  rec.onerror = null
  rec.onend = null
}

function quietAbort(rec: LocalRecognition): void {
  detach(rec)
  try {
    rec.abort()
  } catch {
    /* redan avslutad */
  }
}

/** Röstsökningens tillstånd i webbygget (se `useVoiceSearch`). */
function useLocalVoiceSearch(onTranscript: (text: string) => void): VoiceSearch {
  // Avgörs en gång per sida: finns igenkänning på enheten här alls?
  const [ctor] = useState<LocalRecognitionCtor | null>(() => localRecognitionCtor())
  const [support, setSupport] = useState<VoiceSupport>(() => (ctor ? 'checking' : 'unsupported'))
  const [phase, setPhaseState] = useState<VoicePhase>('idle')
  const [notice, setNotice] = useState<VoiceNotice | null>(null)

  const phaseRef = useRef<VoicePhase>('idle')
  const recRef = useRef<LocalRecognition | null>(null)
  const stopTimer = useRef<number | undefined>(undefined)
  /** Räknas upp vid varje nytt försök och avbrott – gamla väntande svar struntas i. */
  const attempt = useRef(0)
  const mounted = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next
    if (mounted.current) setPhaseState(next)
  }, [])

  // Kontrollera svenska på enheten när sidan öppnas. Frågar inte efter mikrofonen.
  useEffect(() => {
    mounted.current = true
    if (!ctor) return
    let alive = true
    void checkVoiceAvailability(ctor).then((status) => {
      if (alive) setSupport(status)
    })
    return () => {
      alive = false
      mounted.current = false
    }
  }, [ctor])

  // Stäng av mikrofonen när sidan lämnas.
  useEffect(
    () => () => {
      const rec = recRef.current
      recRef.current = null
      window.clearTimeout(stopTimer.current)
      if (rec) quietAbort(rec)
    },
    [],
  )

  const finish = useCallback(
    (rec: LocalRecognition) => {
      if (recRef.current !== rec) return
      recRef.current = null
      window.clearTimeout(stopTimer.current)
      detach(rec)
      setPhase('idle')
    },
    [setPhase],
  )

  const cancel = useCallback(() => {
    attempt.current++
    const rec = recRef.current
    if (rec) {
      recRef.current = null
      window.clearTimeout(stopTimer.current)
      quietAbort(rec)
    }
    if (phaseRef.current === 'installing') return
    if (phaseRef.current !== 'idle') setPhase('idle')
    setNotice(null)
  }, [setPhase])

  const stop = useCallback(() => {
    attempt.current++
    const rec = recRef.current
    if (!rec) {
      if (phaseRef.current === 'checking') setPhase('idle')
      return
    }
    setPhase('stopping')
    try {
      rec.stop()
    } catch {
      quietAbort(rec)
      finish(rec)
      return
    }
    window.clearTimeout(stopTimer.current)
    stopTimer.current = window.setTimeout(() => {
      if (recRef.current !== rec) return
      quietAbort(rec)
      finish(rec)
    }, STOP_TIMEOUT_MS)
  }, [finish, setPhase])

  const listen = useCallback(
    (c: LocalRecognitionCtor) => {
      const rec = createLocalRecognition(c)
      if (!rec) {
        setPhase('idle')
        setNotice({ tone: 'error', text: 'Röstsökning på enheten går inte att använda här just nu. Skriv gärna i stället.' })
        return
      }
      let heard = ''
      let failed = false
      rec.onstart = () => {
        if (recRef.current === rec && phaseRef.current === 'starting') setPhase('listening')
      }
      rec.onresult = (event) => {
        if (recRef.current !== rec) return
        const text = transcriptFrom(event.results)
        if (!text) return
        heard = text
        onTranscriptRef.current(text)
      }
      rec.onnomatch = () => {
        if (recRef.current !== rec) return
        failed = true
        setNotice({ tone: 'error', text: 'Lagom uppfattade inte orden. Tryck på mikrofonen och prova igen.' })
      }
      rec.onerror = (event) => {
        if (recRef.current !== rec) return
        failed = true
        const text = voiceErrorMessage(event.error)
        if (text) setNotice({ tone: 'error', text })
        // Språkpaketet kan ha tagits bort – kontrollera på nytt (knappen kan då erbjuda hämtning).
        if (event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
          void checkVoiceAvailability(c).then((status) => {
            if (mounted.current && status !== 'unavailable') setSupport(status)
          })
        }
      }
      rec.onend = () => {
        if (recRef.current !== rec) return
        if (!heard && !failed) setNotice({ tone: 'info', text: 'Lagom hörde inget den här gången. Tryck på mikrofonen och prova igen.' })
        finish(rec)
      }
      recRef.current = rec
      setPhase('starting')
      try {
        rec.start()
      } catch (error) {
        logError(error, 'Röstsökning: start')
        recRef.current = null
        detach(rec)
        setPhase('idle')
        setNotice({ tone: 'error', text: voiceErrorMessage('') ?? '' })
      }
    },
    [finish, setPhase],
  )

  const offerInstall = useCallback(
    async (c: LocalRecognitionCtor) => {
      const ok = await confirmDialog({
        title: 'Sök med rösten?',
        icon: Mic,
        message: `${INSTALL_OFFER} Sedan tolkas rösten bara här på enheten, även utan nät. Inget ljud skickas och inget sparas.`,
        confirmLabel: 'Hämta',
        cancelLabel: 'Inte nu',
      })
      if (!ok || !mounted.current) return
      setPhase('installing')
      setNotice({ tone: 'info', text: 'Hämtar svensk taligenkänning till enheten …' })
      const installed = await installSwedishVoice(c)
      const status = await checkVoiceAvailability(c)
      if (!mounted.current) return
      setPhase('idle')
      if (status === 'available') {
        setSupport('available')
        setNotice({ tone: 'info', text: 'Klart! Svensk taligenkänning finns nu på enheten. Tryck på mikrofonen och säg vad du vill söka efter.' })
      } else if (status === 'downloading') {
        setSupport('downloading')
        setNotice({ tone: 'info', text: 'Svensk taligenkänning hämtas fortfarande. Prova igen om en liten stund.' })
      } else {
        if (installed) logError(new Error(`install() gav true men available() gav ${status}`), 'Röstsökning')
        setNotice({ tone: 'error', text: 'Det gick inte att hämta svensk taligenkänning just nu. Prova gärna igen senare – det går alltid att skriva.' })
      }
    },
    [setPhase],
  )

  const toggle = useCallback(() => {
    if (!ctor) return
    const current = phaseRef.current
    if (current === 'starting' || current === 'listening') {
      stop()
      return
    }
    if (current !== 'idle') return
    const token = ++attempt.current
    setNotice(null)
    setPhase('checking')
    // Kontrollera igen vid varje tryck – språkpaketet kan ha hämtats eller tagits bort sedan sist.
    void checkVoiceAvailability(ctor).then((status) => {
      if (!mounted.current || attempt.current !== token) return
      if (status === 'available') {
        setSupport('available')
        listen(ctor)
        return
      }
      setPhase('idle')
      if (status === 'downloadable') {
        setSupport('downloadable')
        void offerInstall(ctor)
      } else if (status === 'downloading') {
        setSupport('downloading')
        setNotice({ tone: 'info', text: 'Svensk taligenkänning hämtas till enheten just nu. Prova igen om en liten stund.' })
      } else {
        setNotice({ tone: 'error', text: 'Svensk taligenkänning på enheten finns inte här just nu. Skriv gärna i stället.' })
      }
    })
  }, [ctor, listen, offerInstall, setPhase, stop])

  // Escape slutar lyssna; en dold flik stänger av mikrofonen.
  const active = phase === 'starting' || phase === 'listening'
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Har sökfältet redan använt Escape (rensat texten) ska inget mer fyllas i.
      if (e.defaultPrevented) cancel()
      else stop()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, stop, cancel])

  const visible = support === 'available' || support === 'downloadable' || support === 'downloading'
  return { visible, support, phase, notice, toggle, stop, cancel }
}

/** Ikonknappen i sökfältet (webbygget). */
function LocalVoiceSearchButton({ voice, className }: VoiceSearchProps) {
  const active = voice.phase === 'starting' || voice.phase === 'listening'
  const listening = voice.phase === 'listening'
  return (
    <span className={cx('relative -mr-1.5 inline-flex', className)}>
      {listening && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-gran/25 motion-safe:animate-ping" />}
      <IconButton
        size="sm"
        variant={active ? 'primary' : 'ghost'}
        icon={active ? <Square aria-hidden className="size-3.5 fill-current" strokeWidth={0} /> : Mic}
        aria-label={active ? 'Sluta lyssna' : 'Sök med rösten'}
        loading={voice.phase === 'checking' || voice.phase === 'installing' || voice.phase === 'stopping'}
        onClick={voice.toggle}
      />
    </span>
  )
}

/**
 * Status under sökfältet (webbygget). Live-regionen finns alltid i DOM:en (så att ändringar läses
 * upp). Medan mikrofonen är på säger den bara det korta ("Lyssnar …") – tips och exempel står
 * utanför den, så att skärmläsarens röst inte hamnar i mikrofonen.
 */
function LocalVoiceSearchStatus({ voice, className }: VoiceSearchProps) {
  const { phase, notice } = voice
  const live =
    phase === 'starting'
      ? 'Startar mikrofonen …'
      : phase === 'listening'
        ? 'Lyssnar …'
        : phase === 'idle' || phase === 'installing'
          ? (notice?.text ?? '')
          : ''
  const extra =
    phase === 'starting'
      ? 'Tillåt mikrofonen om webbläsaren frågar.'
      : phase === 'listening'
        ? 'Säg t.ex. ”havregrynsgröt” eller ”två ägg och en smörgås”. Rösten tolkas bara här på enheten.'
        : ''
  const active = phase === 'starting' || phase === 'listening'
  const error = phase === 'idle' && notice?.tone === 'error'
  return (
    <div className={cx('flex items-start gap-2 px-1 text-sm leading-snug text-ink-2', (live || extra) && 'pt-2', className)}>
      {active && <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-gran motion-safe:animate-pulse" />}
      {error && <MicOff aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={2.2} />}
      <p className="min-w-0">
        <span aria-live="polite" className={cx(active && 'font-medium text-ink')}>
          {live}
        </span>
        {extra && <span className="text-ink-3"> {extra}</span>}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Det som exporteras – i butiksbyggena utan röstsökning (se VOICE_SEARCH överst)
// ---------------------------------------------------------------------------

export interface VoiceSearchProps {
  voice: VoiceSearch
  className?: string
}

const noop = (): void => {}

/** Röstsökningen i butiksbyggena: ingen knapp, inget att göra. Samma objekt varje gång. */
const NO_VOICE_SEARCH: VoiceSearch = { visible: false, support: 'unsupported', phase: 'idle', notice: null, toggle: noop, stop: noop, cancel: noop }

function useNoVoiceSearch(): VoiceSearch {
  return NO_VOICE_SEARCH
}

function NoVoiceSearch(): null {
  return null
}

/**
 * Röstsökningens tillstånd. `onTranscript` får den tolkade texten efterhand (ska vara stabil,
 * t.ex. en state-setter – annars används den senaste ändå). I butiksbyggena alltid
 * `visible: false`.
 */
export const useVoiceSearch: (onTranscript: (text: string) => void) => VoiceSearch = VOICE_SEARCH ? useLocalVoiceSearch : useNoVoiceSearch

/** Ikonknappen i sökfältet (som `suffix` i TextField). Ritar ingenting i butiksbyggena. */
export const VoiceSearchButton: ComponentType<VoiceSearchProps> = VOICE_SEARCH ? LocalVoiceSearchButton : NoVoiceSearch

/** Status under sökfältet. Ritar ingenting i butiksbyggena. */
export const VoiceSearchStatus: ComponentType<VoiceSearchProps> = VOICE_SEARCH ? LocalVoiceSearchStatus : NoVoiceSearch
