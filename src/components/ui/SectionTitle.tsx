/**
 * SectionTitle – rubrik för en sektion på en sida, med valfri åtgärdslänk till höger
 * ("Visa alla", "Ändra" …).
 *
 * `variant="eyebrow"` (standard) = liten rubrik i versaler, `variant="display"` = Fraunces.
 */
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cx } from './Button'

export interface SectionTitleProps {
  children: ReactNode
  variant?: 'eyebrow' | 'display'
  /** Rubriknivå (standard h2). */
  as?: 'h2' | 'h3' | 'h4'
  id?: string
  /** Text under rubriken. */
  description?: ReactNode
  /** Etikett för åtgärdslänken, t.ex. "Visa alla". */
  actionLabel?: string
  /** Länkmål för åtgärden. */
  actionTo?: To
  /** Klickhanterare för åtgärden (om inget länkmål). */
  onAction?: () => void
  /** Helt eget innehåll till höger (ersätter actionLabel). */
  action?: ReactNode
  className?: string
}

const ACTION_CLASS =
  'relative -mr-1 inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[0.8125rem] font-semibold text-gran transition-colors hover:text-gran-strong after:absolute after:-inset-2'

/**
 * ```tsx
 * <SectionTitle actionLabel="Visa alla" actionTo="/recept">Mina recept</SectionTitle>
 * <SectionTitle variant="display" description="Senaste 7 dagarna">Veckan</SectionTitle>
 * ```
 */
export function SectionTitle({
  children,
  variant = 'eyebrow',
  as: Tag = 'h2',
  id,
  description,
  actionLabel,
  actionTo,
  onAction,
  action,
  className,
}: SectionTitleProps) {
  let right: ReactNode = action
  if (right === undefined && actionLabel !== undefined) {
    const inner = (
      <>
        {actionLabel}
        <ChevronRight aria-hidden className="size-3.5" strokeWidth={2.6} />
      </>
    )
    right =
      actionTo !== undefined ? (
        <Link to={actionTo} className={ACTION_CLASS}>
          {inner}
        </Link>
      ) : (
        <button type="button" onClick={onAction} className={ACTION_CLASS}>
          {inner}
        </button>
      )
  }

  return (
    <div
      className={cx(
        'flex justify-between gap-3',
        variant === 'eyebrow' ? 'mb-2.5 items-center px-1' : 'mb-3 items-end',
        className,
      )}
    >
      <div className="min-w-0">
        <Tag
          id={id}
          className={
            variant === 'eyebrow'
              ? 'eyebrow'
              : 'font-display text-[1.3125rem] font-semibold leading-tight tracking-tight text-ink'
          }
        >
          {children}
        </Tag>
        {description !== undefined && <p className="mt-0.5 text-[0.8125rem] text-ink-3">{description}</p>}
      </div>
      {right !== undefined && <div className="shrink-0">{right}</div>}
    </div>
  )
}
