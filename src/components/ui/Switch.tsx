/**
 * Switch – av/på-reglage (role="switch"). Med `label` blir hela raden klickbar.
 * Fungerar kontrollerat (`checked` + `onChange`) eller okontrollerat (`defaultChecked`).
 */
import { useId, useState, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from './Button'

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  /** Synlig etikett. Utan etikett krävs `aria-label`. */
  label?: ReactNode
  /** Förklarande text under etiketten. */
  description?: ReactNode
  'aria-label'?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  id?: string
  name?: string
  className?: string
}

const SIZES = {
  // `hit` förstorar tryckytan till minst 44 × 44 px utan att ändra reglagets storlek.
  sm: { track: 'h-6 w-10', knob: 'size-5', travel: 16, hit: 'after:-inset-x-1 after:-inset-y-2.5' },
  md: { track: 'h-[1.875rem] w-[3.25rem]', knob: 'size-[1.625rem]', travel: 22, hit: 'after:-inset-x-1 after:-inset-y-[7px]' },
} as const

/**
 * ```tsx
 * <Switch label="Visa klimatpåverkan" description="Uppskattad CO₂e per måltid" checked={on} onChange={setOn} />
 * ```
 */
export function Switch({
  checked: checkedProp,
  defaultChecked = false,
  onChange,
  label,
  description,
  'aria-label': ariaLabel,
  disabled,
  size = 'md',
  id: idProp,
  name,
  className,
}: SwitchProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const descId = `${id}-desc`
  const reduce = useReducedMotion()
  const [internal, setInternal] = useState(defaultChecked)
  const checked = checkedProp ?? internal
  const s = SIZES[size]

  const toggle = () => {
    if (disabled) return
    const next = !checked
    if (checkedProp === undefined) setInternal(next)
    onChange?.(next)
  }

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      name={name}
      value={checked ? 'on' : 'off'}
      aria-checked={checked}
      aria-label={label === undefined ? ariaLabel : undefined}
      aria-labelledby={label !== undefined ? labelId : undefined}
      aria-describedby={description !== undefined ? descId : undefined}
      disabled={disabled}
      onClick={toggle}
      className={cx(
        'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-45',
        "after:absolute after:content-['']",
        s.track,
        s.hit,
        // Av: tydlig kant och mörk knopp – minst 3:1 mot kortet och mellan knopp och spår (WCAG 1.4.11).
        checked ? 'bg-gran' : 'bg-surface-3 ring-2 ring-inset ring-ink-3 hover:bg-[color-mix(in_oklab,var(--lg-surface-3)_85%,var(--lg-ink-3))]',
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        // Mindre knopp när reglaget är av (som Material 3) så att kanten runt spåret syns.
        animate={{ x: checked ? s.travel : 0, scale: checked ? 1 : 0.76 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 38 }}
        className={cx(
          'block rounded-full shadow-[0_1px_3px_0_var(--lg-shadow-b)] transition-colors duration-200',
          s.knob,
          checked ? 'bg-on-gran' : 'bg-ink-3',
        )}
      />
    </button>
  )

  if (label === undefined) return <span className={className}>{control}</span>

  return (
    <div className={cx('flex min-h-11 items-center justify-between gap-4', disabled && 'opacity-60', className)}>
      <label htmlFor={id} className={cx('min-w-0 flex-1 py-1', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <span id={labelId} className="block text-[0.9375rem] font-medium leading-snug text-ink">
          {label}
        </span>
        {description !== undefined && (
          <span id={descId} className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">
            {description}
          </span>
        )}
      </label>
      {control}
    </div>
  )
}
