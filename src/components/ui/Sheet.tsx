/**
 * Sheet – bottenark på mobil, centrerad panel från 640 px.
 *
 * - Portal till document.body, bakgrund med oskärpa.
 * - Dra ned i handtaget/huvudet för att stänga (mobil), Escape stänger.
 * - Bakåtknappen (webbläsare/Android) stänger arket i stället för att lämna sidan – se
 *   `modalHistory.ts`. Navigering inifrån arket fungerar som vanligt.
 * - Fokusfälla, fokus återställs vid stängning (`returnFocus`), aria-modal + aria-labelledby.
 * - Sidans scroll låses. Höjden följer innehållet (max 92dvh) med fast sidfot.
 *
 * Filen exporterar även modal-grunderna (`useModal`, `ModalBackdrop`, `useMediaQuery`)
 * som `Dialog` återanvänder.
 */
import { useEffect, useId, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useDragControls, useIsPresent, useReducedMotion, type PanInfo } from 'motion/react'
import { X } from 'lucide-react'
import { cx } from './Button'
import { IconButton } from './IconButton'
import { hasModalEntries, registerModalEntry } from './modalHistory'

// ---------------------------------------------------------------------------
// Modal-grunder
// ---------------------------------------------------------------------------

/** Öppna modaler i ordning – endast den översta reagerar på Escape och fokusfällan. */
const modalStack: symbol[] = []

let scrollLocks = 0
let savedOverflow = ''
let savedPaddingRight = ''

/** Låser sidans scroll. Räknar lås så att nästlade modaler fungerar. */
function lockScroll() {
  if (scrollLocks++ > 0) return
  const { body, documentElement } = document
  const scrollbar = window.innerWidth - documentElement.clientWidth
  savedOverflow = body.style.overflow
  savedPaddingRight = body.style.paddingRight
  body.style.overflow = 'hidden'
  // Undvik att innehållet hoppar i sidled när rullningslisten försvinner (desktop).
  if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
}

function unlockScroll() {
  if (--scrollLocks > 0) return
  scrollLocks = 0
  document.body.style.overflow = savedOverflow
  document.body.style.paddingRight = savedPaddingRight
}

let inertLocks = 0

/**
 * Gör appen bakom modalen (#root) inert så att skärmläsare och tangentbord inte kan vandra in
 * bakom arket – även de som ignorerar aria-modal. Modaler och toast-notiser ligger i portaler
 * direkt i <body> och påverkas inte. Räknar lås så att nästlade modaler fungerar.
 */
function lockBackground() {
  if (inertLocks++ > 0) return
  document.getElementById('root')?.setAttribute('inert', '')
}

function unlockBackground() {
  if (--inertLocks > 0) return
  inertLocks = 0
  document.getElementById('root')?.removeAttribute('inert')
}

/** Element utanför modalen som ändå får ta emot fokus (t.ex. Ångra i en toast-notis). */
const FOCUS_ALLOWED_OUTSIDE = '[data-toast-viewport]'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  'summary',
].join(',')

/** Fokuserbara element i ordning (hoppar över inert/dolda grenar). */
export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.closest('[inert], [hidden], [aria-hidden="true"]'),
  )
}

/** Vart fokus ska när modalen stängs. */
export type ReturnFocus = boolean | RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined)

export interface UseModalOptions {
  /** Aktiv medan modalen är öppen (sätt false under utgångsanimationen). */
  active: boolean
  /** Anropas vid Escape och bakåtknappen. Utelämna för att inte kunna stänga med Escape. */
  onDismiss?: () => void
  /** Element som ska få fokus när modalen öppnas. Standard: själva panelen. */
  initialFocusRef?: RefObject<HTMLElement | null>
  /**
   * Bakåtknappen stänger modalen (egen historikpost, se `modalHistory.ts`). `'nested'` = bara om
   * en annan modal redan har en post (t.ex. en bekräftelse ovanpå ett ark). Standard false.
   */
  closeOnBack?: boolean | 'nested'
  /**
   * Fokus vid stängning: `true` (standard) = elementet som öppnade modalen, `false` = rör inte
   * fokus, eller ett eget element (ref eller funktion). Finns elementet inte längre används
   * öppnaren i stället.
   */
  returnFocus?: ReturnFocus
}

function resolveReturnFocus(option: ReturnFocus | undefined): HTMLElement | null | undefined {
  if (option === undefined || option === true || option === false) return undefined
  return typeof option === 'function' ? option() : option.current
}

function focusable(el: HTMLElement | null | undefined): el is HTMLElement {
  return !!el && el.isConnected && el !== document.body && !el.closest('[inert]') && !(el as HTMLButtonElement).disabled
}

/**
 * Tillgänglighetsbeteende för modaler: Escape, fokusfälla, fokusåterställning och scroll-lås.
 * `ref` ska peka på panelen (med tabIndex={-1}).
 */
export function useModal(ref: RefObject<HTMLElement | null>, { active, onDismiss, initialFocusRef, closeOnBack = false, returnFocus = true }: UseModalOptions) {
  const dismissRef = useRef(onDismiss)
  const optionsRef = useRef({ closeOnBack, returnFocus })
  useEffect(() => {
    dismissRef.current = onDismiss
    optionsRef.current = { closeOnBack, returnFocus }
  })

  useEffect(() => {
    if (!active) return
    const token = Symbol('modal')
    modalStack.push(token)
    const isTop = () => modalStack[modalStack.length - 1] === token
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null

    lockScroll()
    lockBackground()
    const target = initialFocusRef?.current ?? ref.current
    target?.focus({ preventScroll: true })

    // Bakåtknappen stänger modalen.
    const back = optionsRef.current.closeOnBack
    const releaseHistory = back === true || (back === 'nested' && hasModalEntries()) ? registerModalEntry(() => dismissRef.current?.()) : undefined

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTop() || e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (dismissRef.current) {
          e.preventDefault()
          dismissRef.current()
        }
        return
      }
      if (e.key !== 'Tab') return
      const root = ref.current
      if (!root) return
      const items = getFocusable(root)
      if (items.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (e.shiftKey && (current === first || current === root || !root.contains(current))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault()
        first.focus()
      }
    }

    // Om fokus ändå hamnar utanför (t.ex. via klick i bakgrunden) – för tillbaka det.
    const onFocusIn = (e: FocusEvent) => {
      const root = ref.current
      if (!isTop() || !root || !(e.target instanceof Node) || root.contains(e.target)) return
      if (e.target instanceof Element && e.target.closest(FOCUS_ALLOWED_OUTSIDE)) return
      ;(getFocusable(root)[0] ?? root).focus({ preventScroll: true })
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      const i = modalStack.indexOf(token)
      if (i >= 0) modalStack.splice(i, 1)
      releaseHistory?.()
      unlockScroll()
      unlockBackground()
      const option = optionsRef.current.returnFocus
      if (option === false) return
      const custom = resolveReturnFocus(option)
      const next = focusable(custom) ? custom : previouslyFocused
      if (focusable(next)) next.focus({ preventScroll: true })
    }
    // ref och initialFocusRef är stabila objekt – effekten styrs enbart av `active`.
  }, [active])
}

/** Sant när mediefrågan matchar. Faller tillbaka på false där matchMedia saknas. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}

/** Dämpad, suddig bakgrund bakom modaler (skuggtoken i ljust läge, nattskog i mörkt). */
export function ModalBackdrop({ onClick }: { onClick?: () => void }) {
  return (
    <motion.div
      aria-hidden
      data-testid="modal-backdrop"
      className="absolute inset-0 bg-(--lg-shadow-c) backdrop-blur-[6px] dark:bg-[color-mix(in_oklab,var(--lg-bg)_62%,transparent)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      onClick={onClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export interface SheetProps {
  open: boolean
  /** Anropas vid stängknapp, bakgrundsklick, Escape och neddragning. */
  onClose: () => void
  /** Rubrik (krävs för tillgänglighet – dölj visuellt med `hideTitle`). */
  title: ReactNode
  /** Kort beskrivning under rubriken. */
  description?: ReactNode
  /** Fast sidfot, t.ex. "Lägg till"-knapp. Ligger kvar när innehållet scrollar. */
  footer?: ReactNode
  children?: ReactNode
  /** Dölj rubriken visuellt (läses fortfarande upp). */
  hideTitle?: boolean
  /** Extra innehåll i huvudet, före stängknappen. */
  headerAction?: ReactNode
  /** Tillåt stängning via bakgrund, dragning och Escape (standard true). Stängknappen finns alltid. */
  dismissible?: boolean
  /** auto = höjd efter innehåll (max 92dvh). tall = alltid nästan full höjd (t.ex. söklistor). */
  size?: 'auto' | 'tall'
  /** Maxbredd som centrerad panel (≥ 640 px). */
  width?: 'sm' | 'md' | 'lg'
  /** Element som får fokus vid öppning. Standard: panelen (så att tangentbordet inte fälls upp). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Fokus vid stängning: öppnaren (standard), `false` eller ett eget element (ref/funktion). */
  returnFocus?: ReturnFocus
  /** Bakåtknappen stänger arket (standard: samma som `dismissible`). */
  closeOnBack?: boolean
  /** Anropas när stängningsanimationen är klar. */
  onExitComplete?: () => void
  className?: string
  bodyClassName?: string
}

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' } as const

/**
 * ```tsx
 * <Sheet open={open} onClose={() => setOpen(false)} title="Välj portion"
 *   footer={<Button fullWidth onClick={save}>Lägg till</Button>}>
 *   …
 * </Sheet>
 * ```
 */
export function Sheet(props: SheetProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence onExitComplete={props.onExitComplete}>{props.open && <SheetPanel key="sheet" {...props} />}</AnimatePresence>,
    document.body,
  )
}

function SheetPanel({
  onClose,
  title,
  description,
  footer,
  children,
  hideTitle,
  headerAction,
  dismissible = true,
  size = 'auto',
  width = 'md',
  initialFocusRef,
  returnFocus,
  closeOnBack = dismissible,
  className,
  bodyClassName,
}: SheetProps) {
  const isPresent = useIsPresent()
  const reduce = useReducedMotion()
  const wide = useMediaQuery('(min-width: 640px)')
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  const dragControls = useDragControls()

  useModal(panelRef, {
    active: isPresent,
    onDismiss: dismissible ? onClose : undefined,
    initialFocusRef,
    closeOnBack,
    returnFocus,
  })

  const canDrag = dismissible && !wide && !reduce
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : wide
      ? { initial: { opacity: 0, scale: 0.96, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 10 } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }

  const startDrag = (e: ReactPointerEvent) => {
    if (!canDrag) return
    // Låt knappar i huvudet fungera som vanligt.
    if ((e.target as Element).closest('button, a, input, select, textarea')) return
    dragControls.start(e)
  }

  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 650) onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <ModalBackdrop onClick={dismissible ? onClose : undefined} />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descId : undefined}
        tabIndex={-1}
        {...motionProps}
        transition={{ type: 'spring', stiffness: 400, damping: 38, mass: 0.9 }}
        drag={canDrag ? 'y' : false}
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.04, bottom: 0.85 }}
        onDragEnd={onDragEnd}
        className={cx(
          'relative flex w-full flex-col bg-surface text-ink shadow-float outline-none',
          'max-h-[92dvh] rounded-t-[2rem] ring-1 ring-line/60 sm:max-h-[85dvh] sm:rounded-[1.75rem]',
          // Fyller ut under arket om det studsar uppåt (mobil).
          'after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[40vh] after:bg-surface sm:after:hidden',
          WIDTHS[width],
          size === 'tall' && 'h-[92dvh] sm:h-[85dvh]',
          className,
        )}
      >
        <div
          onPointerDown={startDrag}
          className={cx('shrink-0 px-5 pt-2.5', canDrag && 'cursor-grab touch-none active:cursor-grabbing')}
        >
          <div aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-surface-3 sm:hidden" />
          <div className={cx('flex items-start gap-2 pb-3 pt-2 sm:pt-3', hideTitle && 'justify-end')}>
            <div className={cx('min-w-0 flex-1 pt-1', hideTitle && 'sr-only')}>
              <h2 id={titleId} className="font-display text-[1.375rem] font-semibold leading-tight tracking-tight">
                {title}
              </h2>
              {description !== undefined && (
                <p id={descId} className="mt-1 text-sm leading-relaxed text-ink-2">
                  {description}
                </p>
              )}
            </div>
            {headerAction}
            <IconButton icon={X} aria-label="Stäng" variant="secondary" size="sm" onClick={onClose} noTooltip />
          </div>
        </div>

        <div
          className={cx(
            'min-h-0 flex-auto overflow-y-auto overscroll-contain px-5',
            footer === undefined ? 'pb-[max(1.25rem,env(safe-area-inset-bottom))]' : 'pb-4',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer !== undefined && (
          <div className="shrink-0 border-t border-line/70 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>
        )}
      </motion.div>
    </div>
  )
}
