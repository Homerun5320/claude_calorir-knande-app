/**
 * SegmentedControl – pillerformad väljare med animerad markering (t.ex. "Dag · Vecka · Månad").
 *
 * Semantik som en radiogrupp: piltangenter flyttar och väljer, Home/End går till ändarna,
 * endast det valda alternativet ligger i tabbordningen (roving tabindex).
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx, renderIcon, type IconLike } from './Button'

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
  icon?: IconLike
  disabled?: boolean
  /** Tillgänglig etikett om `label` bara är en ikon. */
  'aria-label'?: string
}

export interface SegmentedControlProps<T extends string | number> {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentOption<T>>
  /** Tillgänglig etikett för gruppen (krävs om ingen synlig rubrik finns). */
  'aria-label'?: string
  'aria-labelledby'?: string
  size?: 'sm' | 'md'
  /** neutral = vit markering på tonad yta, gran = grön markering. */
  tone?: 'neutral' | 'gran'
  /** Fyll bredden – alternativen delar lika. */
  fullWidth?: boolean
  className?: string
}

/**
 * ```tsx
 * <SegmentedControl aria-label="Period" value={range} onChange={setRange}
 *   options={[{ value: 'vecka', label: 'Vecka' }, { value: 'manad', label: 'Månad' }]} />
 * ```
 */
export function SegmentedControl<T extends string | number>({
  value,
  onChange,
  options,
  size = 'md',
  tone = 'neutral',
  fullWidth,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  const layoutId = `seg-${useId()}`
  const reduce = useReducedMotion()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((o) => o.value === value)

  const move = (from: number, dir: 1 | -1 | 'first' | 'last') => {
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0)
    if (enabled.length === 0) return
    let target: number
    if (dir === 'first') target = enabled[0]
    else if (dir === 'last') target = enabled[enabled.length - 1]
    else {
      const pos = enabled.indexOf(from)
      const base = pos === -1 ? (dir === 1 ? -1 : 0) : pos
      target = enabled[(base + dir + enabled.length) % enabled.length]
    }
    onChange(options[target].value)
    refs.current[target]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, 1 | -1 | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
      Home: 'first',
      End: 'last',
    }
    const dir = keys[e.key]
    if (dir === undefined) return
    e.preventDefault()
    move(index, dir)
  }

  return (
    <div
      role="radiogroup"
      {...aria}
      className={cx(
        'relative isolate inline-flex rounded-full bg-surface-2 p-1',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        // Om inget är valt ska första alternativet vara nåbart med Tab.
        const focusable = selected || (selectedIndex === -1 && i === 0)
        return (
          <button
            key={String(opt.value)}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt['aria-label']}
            disabled={opt.disabled}
            tabIndex={focusable ? 0 : -1}
            onClick={() => !selected && onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors duration-200',
              'focus-visible:outline-offset-0 disabled:opacity-40',
              size === 'sm' ? 'h-8 px-3 text-[0.8125rem]' : 'h-10 px-4 text-sm',
              fullWidth && 'flex-1',
              selected ? (tone === 'gran' ? 'text-on-gran' : 'text-ink') : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {selected && (
              <motion.span
                layoutId={layoutId}
                aria-hidden
                className={cx(
                  'absolute inset-0 -z-10 rounded-full',
                  tone === 'gran' ? 'bg-gran shadow-card' : 'bg-surface shadow-card dark:bg-surface-3',
                )}
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            {renderIcon(opt.icon, size === 'sm' ? 'size-3.5' : 'size-4', 2.2)}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
