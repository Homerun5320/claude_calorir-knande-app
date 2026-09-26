/**
 * Enkla toast-notiser. Använd `toast('Tillagt i frukost')` eller med ångra-knapp:
 *   toast('Borttaget', { action: { label: 'Ångra', onClick: () => restore() } })
 */
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
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

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = uid('t_')
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] })
    window.setTimeout(() => get().dismiss(id), t.duration ?? (t.action ? 5000 : 2600))
    return id
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}))

export function toast(message: string, opts: Omit<ToastItem, 'id' | 'message'> = {}): string {
  return useToastStore.getState().push({ message, ...opts })
}

export function ToastViewport() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(6.25rem + env(safe-area-inset-bottom))' }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-[var(--shadow-float)] ${
              t.tone === 'error' ? 'bg-lingon text-white' : 'bg-ink text-bg'
            }`}
          >
            <span className="flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="rounded-lg px-2 py-1 font-semibold text-sol hover:bg-white/10"
                onClick={() => {
                  t.action?.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
