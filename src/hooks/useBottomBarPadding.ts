/**
 * useBottomBarPadding – håller tangentbordsfokus ovanför en klibbig eller fast list längst ned
 * (WCAG 2.4.11 Fokus ej skymt).
 *
 * Listerna i välkomstflödet ("Fortsätt"), korgen i Lägg till och "Spara profilen" i Inställningar
 * ligger ovanpå innehållet. Utan scroll-padding scrollar webbläsaren ett fokuserat fält bara in
 * till skärmkanten – rakt under listan. Hooken ger ett ref-återanrop att sätta på listan; så länge
 * listan finns mäter den hur mycket av nederkanten listan täcker (höjden plus avståndet till
 * kanten, t.ex. `bottom-[calc(6rem+var(--sa-bottom))]`, inklusive eventuell felrad) och sätter
 * `scroll-padding-bottom` som inline-stil på `<html>`. Inline-stilen vinner över klassen i
 * index.css (`html.has-bottom-nav`, bara under 1024 px och bara i flödet med bottennavigering),
 * och det tidigare värdet återställs när sista listan försvinner.
 *
 * Mätningen följer listan: ResizeObserver när höjden ändras (felrad som visas och döljs) och
 * `resize` när brytpunkten, skärmläget eller hemindikatorn ändrar avståndet till kanten.
 *
 * ```tsx
 * const barRef = useBottomBarPadding()
 * <div ref={barRef} className="sticky bottom-0 …">…</div>
 * ```
 *
 * `useTopBarPadding` är motsvarigheten för en klibbig list under sidrubriken (t.ex. sökfältet i
 * Lägg till): den sätter `scroll-padding-top` till listans avstånd från överkanten plus höjden.
 *
 * Fungerar också på ett element som kommer och går (AnimatePresence) – ref-återanropet anropas
 * med elementet när det visas och med `null` när det tas bort. Gör inget utan DOM (tester utan
 * layout mäter 0 och lämnar `<html>` orört).
 */
import { useCallback, useRef } from 'react'

type Edge = 'top' | 'bottom'

/** Luft intill listan: fokusramen (2 px + 2 px avstånd) ska inte heller nudda den. */
const GAP_PX = 8

const PROPERTY = { top: 'scrollPaddingTop', bottom: 'scrollPaddingBottom' } as const

/** En mätt lista. Flera listor kan finnas samtidigt – den som täcker mest gäller. */
interface Bar {
  px: number
}

const bars: Record<Edge, Set<Bar>> = { top: new Set(), bottom: new Set() }
/** `<html>`:s egna inline-värde innan första listan satte sitt (null = ingen lista aktiv). */
const savedInline: Record<Edge, string | null> = { top: null, bottom: null }

/** Skriv det största värdet till `<html>`, eller återställ det ursprungliga när inga listor finns. */
function apply(edge: Edge): void {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  const property = PROPERTY[edge]
  let max = 0
  for (const bar of bars[edge]) max = Math.max(max, bar.px)
  if (max <= 0) {
    const saved = savedInline[edge]
    if (saved !== null) {
      style[property] = saved
      savedInline[edge] = null
    }
    return
  }
  if (savedInline[edge] === null) savedInline[edge] = style[property]
  style[property] = `${max}px`
}

/** Hur många pixlar av kanten som listan täcker (0 när den inte syns). */
export function measureBar(el: HTMLElement, edge: Edge): number {
  const height = el.getBoundingClientRect().height
  if (!(height > 0)) return 0
  const style = getComputedStyle(el)
  // Fast och klibbig lista: avståndet till kanten räknas med (safe area ingår redan i värdet).
  const offset = style.position === 'fixed' || style.position === 'sticky' ? Number.parseFloat(style[edge]) : 0
  return Math.ceil(height + (Number.isFinite(offset) ? Math.max(0, offset) : 0) + GAP_PX)
}

function track(el: HTMLElement, edge: Edge): () => void {
  const bar: Bar = { px: 0 }
  const update = () => {
    bar.px = measureBar(el, edge)
    apply(edge)
  }
  bars[edge].add(bar)
  update()
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null
  observer?.observe(el)
  window.addEventListener('resize', update)
  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', update)
    bars[edge].delete(bar)
    apply(edge)
  }
}

function useBarPadding(edge: Edge): (el: HTMLElement | null) => void {
  const stop = useRef<(() => void) | null>(null)
  return useCallback(
    (el: HTMLElement | null) => {
      stop.current?.()
      stop.current = null
      if (el) stop.current = track(el, edge)
    },
    [edge],
  )
}

/** Ref-återanrop för en list längst ned. Se filhuvudet. */
export function useBottomBarPadding(): (el: HTMLElement | null) => void {
  return useBarPadding('bottom')
}

/** Ref-återanrop för en klibbig list under sidrubriken (`scroll-padding-top`). Se filhuvudet. */
export function useTopBarPadding(): (el: HTMLElement | null) => void {
  return useBarPadding('top')
}
