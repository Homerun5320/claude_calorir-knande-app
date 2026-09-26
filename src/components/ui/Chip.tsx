/**
 * Chip – filterchip (växlingsbar, `selected`) eller åtgärdschip (bara `onClick`).
 * Används t.ex. för snabbfilter i sök ("Mina", "Säsong", "Nyckelhål") och förslag.
 */
import type { ComponentProps, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx, renderIcon, type IconLike } from './Button'
import { toneVars, type Tone } from './Badge'

type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'

export interface ChipProps extends Omit<ComponentProps<'button'>, MotionConflicts | 'children'> {
  /** Filterchip: aktuellt läge (sätter aria-pressed). Utelämna för en åtgärdschip. */
  selected?: boolean
  icon?: IconLike
  /** Antal träffar e.d. efter etiketten. */
  count?: number
  /** Accentfärg när chipen är vald (standard gran). */
  tone?: Tone
  size?: 'sm' | 'md'
  children?: ReactNode
}

/**
 * ```tsx
 * <Chip selected={onlyMine} onClick={() => setOnlyMine(!onlyMine)} icon={User}>Mina</Chip>
 * <Chip tone="mossa" icon={Leaf} count={12} selected>Säsong</Chip>
 * ```
 */
export function Chip({ selected, icon, count, tone = 'gran', size = 'md', className, children, type = 'button', style, ...rest }: ChipProps) {
  const reduce = useReducedMotion()
  const isOn = selected === true
  return (
    <motion.button
      type={type}
      aria-pressed={selected}
      {...rest}
      whileTap={rest.disabled || reduce ? undefined : { scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      style={toneVars(tone, style)}
      className={cx(
        'relative inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap rounded-full font-semibold',
        'transition-[background-color,color,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-45',
        // Osynlig utökning av tryckytan till minst 44 px höjd.
        'after:absolute after:inset-x-0 after:-inset-y-1.5',
        size === 'sm' ? 'h-8 px-3 text-[0.8125rem]' : 'h-9 px-3.5 text-sm',
        isOn
          ? 'bg-(--tone-soft) text-(--tone-ink) ring-1 ring-inset ring-(--tone)/40'
          : 'bg-surface text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {renderIcon(icon, cx(size === 'sm' ? 'size-3.5' : 'size-4', isOn ? 'text-(--tone)' : 'text-ink-3'), 2.3)}
      {children}
      {count !== undefined && (
        <span
          className={cx(
            'min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] font-bold leading-none tabular-nums',
            isOn ? 'bg-(--tone) text-bg' : 'bg-surface-2 text-ink-3',
          )}
        >
          {count}
        </span>
      )}
    </motion.button>
  )
}
