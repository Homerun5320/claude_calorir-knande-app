/**
 * IconButton – rund ikonknapp. Kräver `aria-label` (visas även som tooltip via title).
 */
import type { ComponentProps, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { BUTTON_BASE, BUTTON_VARIANTS, Spinner, cx, renderIcon, type ButtonVariant, type IconLike } from './Button'

export type IconButtonSize = 'sm' | 'md' | 'lg'

type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'

export interface IconButtonProps extends Omit<ComponentProps<'button'>, MotionConflicts | 'children'> {
  /** Ikonen (lucide-komponent eller element). */
  icon: IconLike
  /** Obligatorisk tillgänglig etikett, t.ex. "Stäng". */
  'aria-label': string
  variant?: ButtonVariant
  size?: IconButtonSize
  /** Växlingsknapp (t.ex. favorit): sätter aria-pressed. */
  pressed?: boolean
  loading?: boolean
  /** Liten prick (`true`) eller räknare i hörnet. Dekorativ – beskriv antalet i aria-label. */
  badge?: ReactNode
  /** Visa inte etiketten som tooltip. */
  noTooltip?: boolean
}

const SIZES: Record<IconButtonSize, { box: string; icon: string }> = {
  // sm är 36 px men får en 44 px tryckyta via ::after.
  sm: { box: 'size-9 after:absolute after:-inset-1 after:rounded-full', icon: 'size-[1.125rem]' },
  md: { box: 'size-11', icon: 'size-5' },
  lg: { box: 'size-14', icon: 'size-6' },
}

/**
 * ```tsx
 * <IconButton icon={X} aria-label="Stäng" onClick={onClose} />
 * <IconButton icon={Heart} aria-label="Favorit" pressed={fav} variant="soft" />
 * ```
 */
export function IconButton({
  icon,
  variant = 'ghost',
  size = 'md',
  pressed,
  loading,
  badge,
  noTooltip,
  className,
  type = 'button',
  disabled,
  onClick,
  ...rest
}: IconButtonProps) {
  const reduce = useReducedMotion()
  const s = SIZES[size]
  return (
    <motion.button
      type={type}
      title={noTooltip ? undefined : rest['aria-label']}
      {...rest}
      disabled={disabled}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (loading) return
        onClick?.(e)
      }}
      whileTap={disabled || loading || reduce ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
      className={cx(
        BUTTON_BASE,
        'rounded-full',
        s.box,
        // En nedtryckt spök-knapp (t.ex. aktiv favorit) får den mjuka granstilen.
        BUTTON_VARIANTS[pressed && variant === 'ghost' ? 'soft' : variant],
        className,
      )}
    >
      {loading ? <Spinner className={s.icon} /> : renderIcon(icon, s.icon, 2.1)}
      {badge === true ? (
        <span aria-hidden className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-lingon ring-2 ring-surface" />
      ) : (
        badge !== undefined &&
        badge !== null &&
        badge !== false && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-lingon px-1 text-[0.625rem] font-bold text-bg ring-2 ring-surface tabular-nums"
          >
            {badge}
          </span>
        )
      )}
    </motion.button>
  )
}
