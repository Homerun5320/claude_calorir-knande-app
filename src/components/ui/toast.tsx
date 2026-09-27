/**
 * Enkla toast-notiser. Använd `toast('Tillagt i frukost')` eller med ångra-knapp:
 *   toast('Borttaget', { action: { label: 'Ångra', onClick: () => restore() } })
 *
 * - Notiser med åtgärd visas längre (8 s) och pausas medan pekaren är över eller fokus är inuti,
 *   så att man hinner ångra även med tangentbord eller skärmläsare.
 * - Varje notis har en stängknapp (✕). Escape stänger notisen när fokus är i den.
 * - När en notis med fokus stängs (Ångra, ✕, Escape) flyttas fokus tillbaka dit det var innan –
 *   eller till ett öppet ark/sidans rubrik – så att det aldrig hamnar på <body>.
 * - Felnotiser läses upp direkt (role="alert"), övriga artigt (aria-live="polite").
 * - Renderas i en portal direkt i <body> så att de går att nå även när ett ark är öppet.
 */
import type { FocusEvent as ReactFocusEvent } from 'react'
import { create } from 'zustand'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { uid } from '../../lib/id'

export interface ToastItem {
  id: string
  message: string
  tone?: 'default' | 'success' | 'error'
  action?: { label: string; onClick: () => void }
  duration?: number
}

interface ToastState {
  toasts: ToastItem[]
  push: (t: Omit<ToastItem, 'id'>) => string
  dismiss: (id: string) => void
}

/** Visningstid i ms: längre när det finns en åtgärd (t.ex. Ångra). */
export function toastDuration(t: Pick<ToastItem, 'duration' | 'action' | 'tone'>): number {
  if (t.duration !== undefined) return t.duration
  if (t.action) return 8000
  return t.tone === 'error' ? 6000 : 3000
}

/** Pågående timers per notis – kan pausas och återupptas. */
const timers = new Map<string, { handle: number | undefined; remaining: number; startedAt: number }>()

function startTimer(id: string, ms: number) {
  const handle = window.setTimeout(() => useToastStore.getState().dismiss(id), ms)
  timers.set(id, { handle, remaining: ms, startedAt: Date.now() })
}

/** Pausa en notis (pekaren över, fokus inuti). */
export function pauseToast(id: string): void {
  const t = timers.get(id)
  if (!t || t.handle === undefined) return
  window.clearTimeout(t.handle)
  timers.set(id, { handle: undefined, remaining: Math.max(0, t.remaining - (Date.now() - t.startedAt)), startedAt: Date.now() })
}

/** Återuppta en pausad notis. Minst en liten stund kvar så att den inte försvinner direkt. */
export function resumeToast(id: string): void {
  const t = timers.get(id)
  if (!t || t.handle !== undefined) return
  startTimer(id, Math.max(t.remaining, 1500))
}

// ---------------------------------------------------------------------------
// Fokus
// ---------------------------------------------------------------------------

/** Elementet som hade fokus innan det flyttade in i en notis (dit fokus går tillbaka). */
let focusBeforeToast: HTMLElement | null = null

/** Kom ihåg var fokus kom ifrån när det går in i notisområdet. */
function rememberFocusOrigin(e: ReactFocusEvent<HTMLElement>) {
  const from = e.relatedTarget
  if (from instanceof HTMLElement && !e.currentTarget.contains(from)) focusBeforeToast = from
}

function canFocus(el: HTMLElement | null): el is HTMLElement {
  if (!el || !el.isConnected || el === document.body) return false
  if (el.closest('[inert], [hidden], [aria-hidden="true"]')) return false
  return !(el as HTMLButtonElement).disabled
}

/**
 * Flytta fokus ut ur en notis som håller på att stängas: tillbaka dit det var, annars till det
 * översta öppna arket/dialogen, annars till sidans rubrik.
 */
function moveFocusOutOfToast(card: Element) {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !card.contains(active)) return
  const modals = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]'))
  const topModal = modals[modals.length - 1] ?? null
  const origin = focusBeforeToast
  // Medan ett ark är öppet ska fokus stanna i arket (appen bakom är inert).
  const target =
    canFocus(origin) && (!topModal || topModal.contains(origin))
      ? origin
      : (topModal ?? document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main'))
  if (!target) {
    active.blur()
    return
  }
  if (target.tabIndex < 0 && !target.hasAttribute('tabindex')) target.tabIndex = -1
  target.focus({ preventScroll: true })
}

function findToastCard(id: string): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined
  return Array.from(document.querySelectorAll<HTMLElement>('[data-toast-id]')).find((el) => el.dataset.toastId === id)
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid('t_')
    const kept = get().toasts.slice(-2)
    for (const old of get().toasts) {
      if (!kept.includes(old)) {
        window.clearTimeout(timers.get(old.id)?.handle)
        timers.delete(old.id)
        const card = findToastCard(old.id)
        if (card) moveFocusOutOfToast(card)
      }
    }
    set({ toasts: [...kept, { ...t, id }] })
    startTimer(id, toastDuration(t))
    return id
  },
  dismiss: (id) => {
    window.clearTimeout(timers.get(id)?.handle)
    timers.delete(id)
    const card = findToastCard(id)
    if (card) moveFocusOutOfToast(card)
    set({ toasts: get().toasts.filter((x) => x.id !== id) })
  },
}))

export function toast(message: string, opts: Omit<ToastItem, 'id' | 'message'> = {}): string {
  return useToastStore.getState().push({ message, ...opts })
}

function ToastCard({ t }: { t: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss)
  const reduce = useReducedMotion()
  const error = t.tone === 'error'
  return (
    <motion.div
      data-toast-id={t.id}
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onPointerEnter={() => pauseToast(t.id)}
      onPointerLeave={() => resumeToast(t.id)}
      onFocus={() => pauseToast(t.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resumeToast(t.id)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        // Stäng bara notisen – inte ett öppet ark bakom den.
        e.preventDefault()
        e.stopPropagation()
        dismiss(t.id)
      }}
      className={`pointer-events-auto flex max-w-md items-center gap-1 rounded-2xl py-1.5 pl-4 pr-1.5 text-sm font-medium shadow-[var(--shadow-float)] ${
        error ? 'bg-lingon text-bg' : 'bg-inverse text-on-inverse'
      }`}
    >
      <span className="flex-1 py-1.5 pr-1">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className={`min-h-11 min-w-11 shrink-0 rounded-xl px-3 font-semibold hover:bg-on-inverse/10 focus-visible:outline-current ${
            error ? 'text-bg underline underline-offset-2' : 'text-inverse-accent'
          }`}
          onClick={() => {
            t.action?.onClick()
            dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Stäng notisen"
        className="grid size-11 shrink-0 place-items-center rounded-xl opacity-80 hover:bg-on-inverse/10 hover:opacity-100 focus-visible:outline-current"
        onClick={() => dismiss(t.id)}
      >
        <X aria-hidden className="size-4" strokeWidth={2.4} />
      </button>
    </motion.div>
  )
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  if (typeof document === 'undefined') return null
  const errors = toasts.filter((t) => t.tone === 'error')
  const others = toasts.filter((t) => t.tone !== 'error')
  return createPortal(
    <div
      data-toast-viewport=""
      onFocus={rememberFocusOrigin}
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }}
    >
      {/* Två beständiga levande regioner: fel läses upp direkt, övrigt när skärmläsaren är ledig. */}
      <div role="alert" className="flex flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {errors.map((t) => (
            <ToastCard key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
      <div aria-live="polite" className="flex flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {others.map((t) => (
            <ToastCard key={t.id} t={t} />
          ))}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  )
}
