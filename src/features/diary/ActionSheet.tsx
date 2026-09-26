/**
 * Åtgärdsark – en lista med val i ett bottenark (mobilens "⋯"-meny).
 * Används för måltidens och dagens menyer i dagboken.
 */
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Sheet, cx, renderIcon, type IconLike } from '../../components/ui'

export interface SheetAction {
  id: string
  label: string
  /** Kort förklaring under etiketten. */
  description?: ReactNode
  icon: IconLike
  onSelect: () => void
  tone?: 'default' | 'danger' | 'good'
  disabled?: boolean
  /** Visa en pil (öppnar något nytt). */
  chevron?: boolean
}

export interface ActionSheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  actions: readonly SheetAction[]
  /** Extra innehåll ovanför valen. */
  children?: ReactNode
}

const TONE: Record<NonNullable<SheetAction['tone']>, { icon: string; text: string }> = {
  default: { icon: 'bg-surface-2 text-ink-2', text: 'text-ink' },
  danger: { icon: 'bg-lingon-soft text-lingon', text: 'text-lingon' },
  good: { icon: 'bg-mossa-soft text-mossa', text: 'text-ink' },
}

export function ActionSheet({ open, onClose, title, description, actions, children }: ActionSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description} width="sm">
      {children}
      <ul className="-mx-2 flex flex-col pb-1">
        {actions.map((a) => {
          const tone = TONE[a.tone ?? 'default']
          return (
            <li key={a.id}>
              <button
                type="button"
                disabled={a.disabled}
                onClick={a.onSelect}
                className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors hover:bg-surface-2 active:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
              >
                <span aria-hidden className={cx('grid size-10 shrink-0 place-items-center rounded-2xl', tone.icon)}>
                  {renderIcon(a.icon, 'size-5', 2.1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[0.9375rem] font-semibold leading-snug', tone.text)}>{a.label}</span>
                  {a.description !== undefined && <span className="mt-0.5 block text-xs leading-snug text-ink-3">{a.description}</span>}
                </span>
                {a.chevron && <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />}
              </button>
            </li>
          )
        })}
      </ul>
    </Sheet>
  )
}
