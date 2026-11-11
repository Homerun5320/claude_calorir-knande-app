/**
 * Button – Lagoms grundknapp.
 *
 * Varianter: primary (granskog), secondary (yta), soft (tonad gran), ghost, danger (lingon), outline.
 * Storlekar sm/md/lg (md = 44 px, sm har utökad osynlig tryckyta). Texten radbryts i stället för att
 * klippas när den inte får plats (stor text, smala skärmar) – höjderna är därför `min-h-*`. Kan visa laddning och
 * fungera som länk via `to` (react-router). Ett subtilt "tryck" animeras med motion.
 *
 * Filen exporterar också små delade hjälpare för UI-kittet: `cx`, `IconLike` och `renderIcon`.
 */
import { isValidElement, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'

// ---------------------------------------------------------------------------
// Delade hjälpare
// ---------------------------------------------------------------------------

/** Slår ihop klassnamn och hoppar över falska värden. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ')
}

/** En ikon: en komponent (t.ex. från lucide-react) eller ett färdigt element/emoji. */
export type IconLike = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false' }> | ReactNode

function isComponent(icon: unknown): icon is ComponentType<{ className?: string; strokeWidth?: number }> {
  if (typeof icon === 'function') return true
  // forwardRef/memo-komponenter (t.ex. lucide-ikoner) är objekt med $$typeof men inga element.
  return typeof icon === 'object' && icon !== null && '$$typeof' in icon && !isValidElement(icon)
}

/** Renderar en `IconLike` med given klass. Element och text returneras oförändrade. */
export function renderIcon(icon: IconLike | undefined, className = 'size-5', strokeWidth?: number): ReactNode {
  if (icon === undefined || icon === null || icon === false) return null
  if (isComponent(icon)) {
    const Icon = icon
    return <Icon className={cx('shrink-0', className)} strokeWidth={strokeWidth} aria-hidden />
  }
  return icon as ReactNode
}

// ---------------------------------------------------------------------------
// Knappstilar
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** Färg/ytor per variant. Endast tokens – fungerar i både ljust och mörkt läge. */
export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gran text-on-gran shadow-card hover:bg-gran-strong',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
  soft: 'bg-gran-soft text-gran hover:bg-[color-mix(in_oklab,var(--lg-gran-soft)_82%,var(--lg-gran))]',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-lingon text-bg shadow-card hover:bg-[color-mix(in_oklab,var(--lg-lingon)_88%,var(--lg-ink))]',
  outline:
    'bg-transparent text-ink ring-1 ring-inset ring-line hover:bg-surface-2 hover:ring-[color-mix(in_oklab,var(--lg-line)_60%,var(--lg-ink-3))]',
}

// min-h-* (inte h-*): en enradig knapp har exakt samma höjd som förut, men en text som radbryts
// vid stor text (WCAG 1.4.4/1.4.10) får knappen att växa i stället för att klippas eller flöda över.
const SIZES: Record<ButtonSize, string> = {
  // sm är 36 px hög men får en osynlig tryckyta på 44 px via ::after.
  sm: 'min-h-9 gap-1.5 rounded-xl px-3.5 py-1.5 text-[0.8125rem] after:absolute after:inset-x-0 after:-inset-y-1',
  md: 'min-h-11 gap-2 rounded-2xl px-5 py-2 text-[0.9375rem]',
  lg: 'min-h-14 gap-2.5 rounded-[1.25rem] px-6 py-3 text-base',
}

const ICON_SIZES: Record<ButtonSize, string> = { sm: 'size-4', md: 'size-[1.125rem]', lg: 'size-5' }

/** Gemensam basklass för knappar och knapplänkar. */
export const BUTTON_BASE =
  'relative inline-flex max-w-full select-none items-center justify-center text-center font-semibold leading-snug tracking-[-0.005em] ' +
  'transition-[background-color,color,box-shadow,opacity] duration-200 ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 ' +
  'aria-busy:pointer-events-none'

/** Liten snurra i omgivande textfärg. */
export function Spinner({ className = 'size-[1.125rem]' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-block animate-spin rounded-full border-2 border-[color-mix(in_oklab,currentColor_22%,transparent)] border-t-current',
        className,
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/** Props som motion definierar om och som därför inte får spridas från vanliga HTML-props. */
type MotionConflicts = 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'

interface ButtonOwnProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Ikon före texten (lucide-komponent eller element). */
  iconLeft?: IconLike
  /** Ikon efter texten. */
  iconRight?: IconLike
  /** Visar en snurra, blockerar klick och sätter aria-busy. Bredden behålls. */
  loading?: boolean
  /** Fyll hela bredden. */
  fullWidth?: boolean
  className?: string
  children?: ReactNode
}

export type ButtonAsButtonProps = ButtonOwnProps &
  Omit<ComponentProps<'button'>, keyof ButtonOwnProps | MotionConflicts> & { to?: undefined }

export type ButtonAsLinkProps = ButtonOwnProps &
  Omit<ComponentProps<'a'>, keyof ButtonOwnProps | MotionConflicts | 'href'> & {
    /** Navigera med react-router i stället för att vara en knapp. */
    to: To
    replace?: boolean
    state?: unknown
    /** Inaktiverad länk (renderas med aria-disabled). */
    disabled?: boolean
  }

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps

const MotionLink = motion.create(Link)

/** Innehållet i en knapp: ikoner, text och (vid laddning) en centrerad snurra. */
function ButtonContent({ size, iconLeft, iconRight, loading, children }: Pick<ButtonOwnProps, 'iconLeft' | 'iconRight' | 'loading' | 'children'> & { size: ButtonSize }) {
  const iconClass = ICON_SIZES[size]
  return (
    <>
      <span className={cx('inline-flex min-w-0 items-center justify-center gap-[inherit] transition-opacity duration-150', loading && 'opacity-0')}>
        {renderIcon(iconLeft, iconClass, 2.2)}
        {children !== undefined && children !== null && children !== false && <span className="min-w-0 break-words">{children}</span>}
        {renderIcon(iconRight, iconClass, 2.2)}
      </span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner className={size === 'lg' ? 'size-5' : 'size-[1.125rem]'} />
        </span>
      )}
    </>
  )
}

/**
 * Knapp med Lagoms stil.
 *
 * ```tsx
 * <Button iconLeft={Plus} onClick={add}>Lägg till</Button>
 * <Button variant="soft" to="/recept">Mina recept</Button>
 * <Button variant="danger" loading={saving}>Ta bort</Button>
 * ```
 */
export function Button(props: ButtonProps) {
  const reduce = useReducedMotion()
  const tap = reduce ? undefined : { scale: 0.97 }
  const transition = { type: 'spring' as const, stiffness: 600, damping: 32 }

  if (props.to !== undefined) {
    const { variant = 'primary', size = 'md', iconLeft, iconRight, loading, fullWidth, className, children, to, disabled, onClick, ...rest } =
      props
    const inactive = disabled || loading
    return (
      <MotionLink
        to={to}
        {...rest}
        aria-disabled={disabled || undefined}
        aria-busy={loading || undefined}
        tabIndex={disabled ? -1 : rest.tabIndex}
        onClick={(e) => {
          if (inactive) {
            e.preventDefault()
            return
          }
          onClick?.(e)
        }}
        whileTap={inactive ? undefined : tap}
        transition={transition}
        className={cx(BUTTON_BASE, SIZES[size], BUTTON_VARIANTS[variant], fullWidth && 'w-full', className)}
      >
        <ButtonContent size={size} iconLeft={iconLeft} iconRight={iconRight} loading={loading}>
          {children}
        </ButtonContent>
      </MotionLink>
    )
  }

  const {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading,
    fullWidth,
    className,
    children,
    type = 'button',
    disabled,
    onClick,
    to: _to,
    ...rest
  } = props
  return (
    <motion.button
      type={type}
      {...rest}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={(e) => {
        // Under laddning ignoreras klick men knappen behåller fokus (till skillnad från disabled).
        if (loading) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      whileTap={disabled || loading ? undefined : tap}
      transition={transition}
      className={cx(BUTTON_BASE, SIZES[size], BUTTON_VARIANTS[variant], fullWidth && 'w-full', className)}
    >
      <ButtonContent size={size} iconLeft={iconLeft} iconRight={iconRight} loading={loading}>
        {children}
      </ButtonContent>
    </motion.button>
  )
}
