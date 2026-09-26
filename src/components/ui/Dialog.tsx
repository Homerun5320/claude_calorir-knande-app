/**
 * Dialog – centrerad modal, samt bekräftelsedialoger.
 *
 * - `<Dialog>`: generell modal (samma tillgänglighet som Sheet: fokusfälla, Escape, aria-modal).
 * - `<ConfirmDialog>`: kontrollerad ja/nej-dialog.
 * - `confirmDialog({...})`: imperativ variant som returnerar ett löfte:
 *
 *   ```ts
 *   const ok = await confirmDialog({ title: 'Ta bort receptet?', message: 'Det går inte att ångra.', tone: 'danger' })
 *   ```
 *
 *   Kräver att `<DialogHost />` renderas en gång i appen (t.ex. i AppShell).
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { create } from 'zustand'
import { Button, cx, renderIcon, type IconLike } from './Button'
import { toneVars, type Tone } from './Badge'
import { IconButton } from './IconButton'
import { ModalBackdrop, useModal } from './Sheet'

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean
  /** Anropas vid Escape, bakgrundsklick och stängknapp. */
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Knapprad längst ned. */
  footer?: ReactNode
  /** Ikon i en tonad cirkel ovanför rubriken. */
  icon?: IconLike
  /** Ton för ikoncirkeln (standard gran). */
  tone?: Tone
  /** Centrerad text (standard när ikon finns) eller vänsterställd. */
  align?: 'center' | 'start'
  /** Visa en stängknapp uppe till höger. */
  showClose?: boolean
  /** Tillåt stängning via bakgrund och Escape (standard true). */
  dismissible?: boolean
  /** Maxbredd. */
  size?: 'sm' | 'md'
  /** alertdialog för bekräftelser som kräver svar. */
  role?: 'dialog' | 'alertdialog'
  initialFocusRef?: RefObject<HTMLElement | null>
  onExitComplete?: () => void
  className?: string
}

/**
 * ```tsx
 * <Dialog open={open} onClose={close} title="Ny vana" icon={Sparkles}
 *   footer={<Button fullWidth onClick={close}>Klart</Button>}>…</Dialog>
 * ```
 */
export function Dialog(props: DialogProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence onExitComplete={props.onExitComplete}>{props.open && <DialogPanel key="dialog" {...props} />}</AnimatePresence>,
    document.body,
  )
}

function DialogPanel({
  onClose,
  title,
  description,
  children,
  footer,
  icon,
  tone = 'gran',
  align,
  showClose,
  dismissible = true,
  size = 'sm',
  role = 'dialog',
  initialFocusRef,
  className,
}: DialogProps) {
  const isPresent = useIsPresent()
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()
  useModal(panelRef, { active: isPresent, onDismiss: dismissible ? onClose : undefined, initialFocusRef })

  const centered = (align ?? (icon !== undefined ? 'center' : 'start')) === 'center'
  const motionProps = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, scale: 0.94, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.97, y: 6 } }

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <ModalBackdrop onClick={dismissible ? onClose : undefined} />
      <motion.div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description !== undefined ? descId : undefined}
        tabIndex={-1}
        {...motionProps}
        transition={{ type: 'spring', stiffness: 460, damping: 34 }}
        style={toneVars(tone)}
        className={cx(
          'relative max-h-[88dvh] w-full overflow-y-auto overscroll-contain rounded-[1.75rem] bg-surface p-6 text-ink shadow-float outline-none ring-1 ring-line/60',
          size === 'sm' ? 'max-w-sm' : 'max-w-lg',
          centered && 'text-center',
          className,
        )}
      >
        {showClose && (
          <IconButton icon={X} aria-label="Stäng" size="sm" variant="secondary" onClick={onClose} noTooltip className="absolute right-3 top-3" />
        )}
        {icon !== undefined && (
          <div
            aria-hidden
            className={cx(
              'mb-4 grid size-14 place-items-center rounded-full bg-(--tone-soft) text-(--tone) ring-8 ring-(--tone-soft)/40',
              centered && 'mx-auto',
            )}
          >
            {renderIcon(icon, 'size-6', 2.2)}
          </div>
        )}
        <h2 id={titleId} className={cx('font-display text-[1.375rem] font-semibold leading-tight tracking-tight', showClose && !centered && 'pr-10')}>
          {title}
        </h2>
        {description !== undefined && (
          <div id={descId} className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
            {description}
          </div>
        )}
        {children !== undefined && <div className="mt-4 text-left">{children}</div>}
        {footer !== undefined && <div className="mt-6">{footer}</div>}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConfirmDialog
// ---------------------------------------------------------------------------

export interface ConfirmOptions {
  title: ReactNode
  /** Förklarande text under rubriken. */
  message?: ReactNode
  /** Text på bekräftelseknappen. Standard: "Ta bort" (danger) eller "Bekräfta". */
  confirmLabel?: string
  /** Text på avbryt-knappen. Standard: "Avbryt". */
  cancelLabel?: string
  /** danger = lingonröd knapp och fokus på Avbryt från start. */
  tone?: 'default' | 'danger'
  /** Valfri ikon ovanför rubriken. */
  icon?: IconLike
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Visar laddning på bekräftelseknappen (t.ex. medan något raderas). */
  loading?: boolean
  onExitComplete?: () => void
}

/**
 * ```tsx
 * <ConfirmDialog open={asking} title="Rensa dagen?" message="Alla poster för idag tas bort."
 *   tone="danger" confirmLabel="Rensa" onConfirm={clear} onCancel={() => setAsking(false)} />
 * ```
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Avbryt',
  tone = 'default',
  icon,
  loading,
  onConfirm,
  onCancel,
  onExitComplete,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const danger = tone === 'danger'
  const confirmText = confirmLabel ?? (danger ? 'Ta bort' : 'Bekräfta')
  // Korta etiketter står sida vid sida, längre staplas (bekräfta överst).
  const sideBySide = confirmText.length <= 14 && cancelLabel.length <= 14

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      role="alertdialog"
      title={title}
      description={message}
      icon={icon}
      tone={danger ? 'lingon' : 'gran'}
      align="center"
      dismissible={!loading}
      // Vid destruktiva val får "Avbryt" fokus först – ett oavsiktligt Enter gör ingen skada.
      initialFocusRef={danger ? cancelRef : confirmRef}
      onExitComplete={onExitComplete}
      footer={
        <div className={sideBySide ? 'grid grid-cols-2 gap-2' : 'flex flex-col-reverse gap-2'}>
          <Button ref={cancelRef} variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={danger ? 'danger' : 'primary'} fullWidth onClick={onConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      }
    />
  )
}

// ---------------------------------------------------------------------------
// Imperativ bekräftelse: confirmDialog() + <DialogHost />
// ---------------------------------------------------------------------------

interface PendingConfirm {
  id: number
  options: ConfirmOptions
  resolve: (ok: boolean) => void
}

interface DialogHostState {
  /** Dialogen som visas (eller är på väg ut). */
  current: PendingConfirm | null
  /** false medan den aktuella dialogen animeras ut. */
  open: boolean
  /** Väntande dialoger – visas en i taget. */
  queue: PendingConfirm[]
}

/** Intern butik för `confirmDialog`. Exporteras för tester och felsökning. */
export const useDialogStore = create<DialogHostState>(() => ({ current: null, open: false, queue: [] }))

let nextConfirmId = 1
let mountedHosts = 0

/**
 * Visa en bekräftelsedialog och vänta på svaret. `true` = bekräftat, `false` = avbrutet.
 * Flera anrop köas. Om ingen `<DialogHost />` är monterad används webbläsarens `confirm()`.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (mountedHosts === 0) {
    const text = [options.title, options.message].filter((x): x is string => typeof x === 'string').join('\n\n')
    if (import.meta.env.DEV) console.warn('confirmDialog: <DialogHost /> är inte monterad – använder window.confirm.')
    return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(text) : false)
  }
  return new Promise<boolean>((resolve) => {
    const item: PendingConfirm = { id: nextConfirmId++, options, resolve }
    const s = useDialogStore.getState()
    if (s.current === null) useDialogStore.setState({ current: item, open: true })
    else useDialogStore.setState({ queue: [...s.queue, item] })
  })
}

/** Besvara den aktuella dialogen och starta utgångsanimationen. */
function settleCurrent(ok: boolean) {
  const { current, open } = useDialogStore.getState()
  if (!current || !open) return
  useDialogStore.setState({ open: false })
  current.resolve(ok)
  // Reserv om onExitComplete av någon anledning uteblir.
  window.setTimeout(() => advanceFrom(current.id), 500)
}

/** Visa nästa dialog i kön när den föregående har animerats ut. */
function advanceFrom(id: number) {
  const s = useDialogStore.getState()
  if (s.current?.id !== id || s.open) return
  const [next, ...rest] = s.queue
  useDialogStore.setState({ current: next ?? null, open: next !== undefined, queue: rest })
}

const NO_OPTIONS: ConfirmOptions = { title: '' }

/**
 * Renderar dialoger som öppnats med `confirmDialog()`. Rendera exakt en gång, t.ex. i AppShell
 * bredvid `<ToastViewport />`.
 */
export function DialogHost() {
  const current = useDialogStore((s) => s.current)
  const open = useDialogStore((s) => s.open)

  useEffect(() => {
    mountedHosts++
    return () => {
      mountedHosts--
    }
  }, [])

  const options = current?.options ?? NO_OPTIONS
  return (
    <ConfirmDialog
      {...options}
      open={open && current !== null}
      onConfirm={() => settleCurrent(true)}
      onCancel={() => settleCurrent(false)}
      onExitComplete={() => {
        if (current) advanceFrom(current.id)
      }}
    />
  )
}
