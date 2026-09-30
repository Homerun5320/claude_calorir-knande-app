/**
 * Fördröjd sparning för fält som annars skulle skriva till en butik vid varje tangenttryck.
 *
 * Varje `set()` i dagboken skriver om hela dagboken (0,25–0,7 s på en telefon efter några år, se
 * docs/LAGRING.md §3), så stegfältet och anteckningen sparar först efter en kort paus:
 *
 * - `schedule(value)` minns det senaste osparade värdet och sparar det `SAVE_DELAY_MS` efter den
 *   senaste ändringen. Flera ändringar i rad (tangenttryck, tryck på −/+) blir en enda sparning.
 * - Det väntande värdet sparas direkt med `flush()` (anropas när fältet lämnas), när komponenten
 *   försvinner, när nyckeln byts (t.ex. en annan dag – värdet sparas då på den gamla nyckeln), när
 *   sidan lämnas (`beforeunload`, se nedan), när den stängs (`pagehide`) och när den göms
 *   (`visibilitychange` → hidden, vilket även täcker att apparna går till bakgrunden i WKWebView
 *   och Android WebView).
 * - `beforeunload`: vid omladdning eller en annan adress i samma flik skickar Chromium `pagehide`
 *   och `visibilitychange` först när sidan redan håller på att tas bort – en IndexedDB-transaktion
 *   som startas då sparas aldrig. I `beforeunload` hinner den. Lyssnaren finns bara medan ett
 *   värde väntar (så att sidan annars kan sparas i bakåt-framåt-cachen i Firefox och Safari) och
 *   anropar aldrig `preventDefault()` – ingen "Lämna sidan?"-dialog.
 * - Inget sparas när värdet är detsamma som det sparade (`read(key)` läses precis före sparningen).
 * - `save` och `read` läses alltid från den senaste renderingen, och kroken tål React 19:s
 *   StrictMode (effekterna körs två gånger vid monteringen utan att något sparas i onödan).
 *
 * ```tsx
 * const saver = useDeferredSave({
 *   key: date,
 *   read: (d) => useDiaryStore.getState().days[d]?.steps,
 *   save: (steps, d) => useDiaryStore.getState().setDayMeta(d, { steps }),
 * })
 * <NumberField value={draft} onChange={(v) => { setDraft(v); saver.schedule(v) }} onBlur={saver.flush} />
 * ```
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { logError } from '../lib/errorLog'

/** Hur länge vi väntar efter den senaste ändringen innan värdet sparas. */
export const SAVE_DELAY_MS = 600

export interface DeferredSaveOptions<T> {
  /**
   * Vad värdet hör till, t.ex. dagens datum. Byts nyckeln sparas ett väntande värde direkt – på
   * nyckeln det skrevs för.
   */
  key: string
  /** Det sparade värdet för en nyckel. Läses precis före varje sparning. */
  read: (key: string) => T
  /** Spara värdet. Anropas bara när det skiljer sig från `read(key)`. */
  save: (value: T, key: string) => void
  /** Är två värden lika? Standard `Object.is`. */
  equals?: (a: T, b: T) => boolean
  /** Väntetid i millisekunder efter den senaste ändringen (standard `SAVE_DELAY_MS`). */
  delay?: number
}

export interface DeferredSave<T> {
  /**
   * Spara `value` efter en paus. Ersätter ett tidigare osparat värde. Ger false när värdet redan
   * är sparat – då väntar inget längre.
   */
  schedule: (value: T) => boolean
  /** Spara ett väntande värde direkt, t.ex. när fältet lämnas. Gör inget annars. */
  flush: () => void
  /** true medan ett värde väntar på att sparas (t.ex. för "Sparar …"). */
  pending: boolean
}

interface Pending<T> {
  key: string
  value: T
}

export function useDeferredSave<T>(options: DeferredSaveOptions<T>): DeferredSave<T> {
  const { key } = options
  // Senaste inställningarna – så att en timer eller en händelse aldrig använder en gammal `save`.
  // useLayoutEffect: uppdaterad innan webbläsaren hinner skicka nästa händelse.
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  })

  const pendingRef = useRef<Pending<T> | null>(null)
  const timerRef = useRef<number | undefined>(undefined)
  const [pending, setPending] = useState(false)

  // Stabila funktioner som bara läser refs (skapas en gång per komponent).
  const [controls] = useState(() => {
    const clearTimer = () => {
      if (timerRef.current === undefined) return
      window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }

    // Sparar när sidan lämnas – utan preventDefault(), så ingen dialog visas.
    const onBeforeUnload = () => flush()
    let listening = false
    /** Det väntande värdet, `pending` och `beforeunload`-lyssnaren (bara medan något väntar). */
    const setWaiting = (next: Pending<T> | null) => {
      pendingRef.current = next
      setPending(next !== null)
      if (listening === (next !== null)) return
      listening = next !== null
      if (listening) window.addEventListener('beforeunload', onBeforeUnload)
      else window.removeEventListener('beforeunload', onBeforeUnload)
    }

    const flush = () => {
      clearTimer()
      const next = pendingRef.current
      if (next === null) return
      setWaiting(null)
      const { read, save, equals = Object.is } = optionsRef.current
      try {
        if (!equals(next.value, read(next.key))) save(next.value, next.key)
      } catch (error) {
        logError(error, 'Fördröjd sparning')
      }
    }

    const schedule = (value: T): boolean => {
      const { key: current, read, equals = Object.is, delay = SAVE_DELAY_MS } = optionsRef.current
      // Ett värde för en annan nyckel (dagen har just bytts) sparas först, på sin egen nyckel.
      if (pendingRef.current !== null && pendingRef.current.key !== current) flush()
      clearTimer()
      if (equals(value, read(current))) {
        setWaiting(null)
        return false
      }
      setWaiting({ key: current, value })
      timerRef.current = window.setTimeout(flush, delay)
      return true
    }

    return { flush, schedule }
  })

  // Nyckeln byttes (t.ex. en annan dag): spara det som väntar på den gamla nyckeln direkt.
  useEffect(() => {
    const waiting = pendingRef.current
    if (waiting !== null && waiting.key !== key) controls.flush()
  }, [key, controls])

  // Sidan stängs eller göms (även appen till bakgrunden), och när komponenten försvinner – då tas
  // även `beforeunload`-lyssnaren bort (flush lämnar inget väntande värde efter sig).
  useEffect(() => {
    const onPageHide = () => controls.flush()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') controls.flush()
    }
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      controls.flush()
    }
  }, [controls])

  return useMemo(() => ({ schedule: controls.schedule, flush: controls.flush, pending }), [controls, pending])
}
