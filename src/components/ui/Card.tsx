/**
 * Card – Lagoms grundyta. Mjukt rundad (1,5 rem) med lätt skugga.
 *
 * - `title`/`eyebrow`/`action` ger ett enhetligt korthuvud.
 * - `tone` tonar kortet med en naturfärg (t.ex. `tone="fjall"` för vatten).
 * - `to` gör kortet till en länk, `onClick` till en knapp (hela kortet klickbart).
 *   Lägg då inga andra knappar/länkar i kortet – använd `action` på ett icke-klickbart kort.
 */
import { useId, type CSSProperties, type HTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { cx } from './Button'
import { toneVars, type Tone } from './Badge'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'
export type CardVariant = 'raised' | 'flat' | 'outline'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title' | 'onClick'> {
  /** Rubrik i kortets huvud (Fraunces). */
  title?: ReactNode
  /** Liten etikett i versaler ovanför rubriken. */
  eyebrow?: ReactNode
  /** Högerställt innehåll i huvudet, t.ex. en länk eller ikonknapp. */
  action?: ReactNode
  /** Rubriknivå för `title` (standard h2). */
  titleAs?: 'h2' | 'h3' | 'h4'
  padding?: CardPadding
  /** raised = vit yta med skugga (standard), flat = tonad yta utan skugga, outline = kantlinje. */
  variant?: CardVariant
  /** Tona kortet med en mjuk accentfärg. */
  tone?: Tone
  /** Hover-/tryckeffekt. Sätts automatiskt när `to` eller `onClick` anges. */
  interactive?: boolean
  /** Elementtyp för icke-klickbara kort. Standard: section om title finns, annars div. */
  as?: 'div' | 'section' | 'article' | 'li'
  /** Gör hela kortet till en länk. */
  to?: To
  /** Gör hela kortet till en knapp. */
  onClick?: MouseEventHandler<HTMLElement>
  children?: ReactNode
}

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
}

const VARIANT: Record<CardVariant, string> = {
  raised: 'card',
  flat: 'rounded-card bg-surface-2',
  outline: 'rounded-card bg-transparent ring-1 ring-inset ring-line',
}

/** Bakgrund för tonade kort: mjuk ton + ett svagt ljus i övre högra hörnet. */
const TONED_BACKGROUND: CSSProperties = {
  background:
    'radial-gradient(130% 90% at 100% 0%, color-mix(in oklab, var(--tone) 13%, transparent) 0%, transparent 58%), var(--tone-soft)',
}

/**
 * ```tsx
 * <Card eyebrow="Idag" title="Vatten" tone="fjall" action={<Button size="sm" variant="ghost">Visa</Button>}>…</Card>
 * <Card to="/recept/123" padding="sm">…</Card>
 * ```
 */
export function Card({
  title,
  eyebrow,
  action,
  titleAs: TitleTag = 'h2',
  padding = 'md',
  variant = 'raised',
  tone,
  interactive,
  as,
  to,
  onClick,
  className,
  style,
  children,
  ...rest
}: CardProps) {
  const titleId = useId()
  const clickable = to !== undefined || onClick !== undefined
  const isInteractive = interactive ?? clickable
  const hasHeader = title !== undefined || eyebrow !== undefined || action !== undefined

  const classes = cx(
    'relative block text-left text-ink',
    tone ? 'rounded-card ring-1 ring-inset ring-(--tone)/12' : VARIANT[variant],
    PADDING[padding],
    isInteractive &&
      'cursor-pointer transition-[transform,box-shadow,background-color] duration-200 ease-spring hover:shadow-float active:scale-[0.985]',
    clickable && 'w-full',
    className,
  )
  const mergedStyle: CSSProperties | undefined = tone ? toneVars(tone, { ...TONED_BACKGROUND, ...style }) : style

  // I länkar och knappar får rubriker inte vara h-element – använd span med samma stil.
  // Huvudet byggs av span-element så att det är giltigt även inuti en <button>.
  const header = hasHeader ? (
    <span className="mb-3 flex items-start justify-between gap-3">
      <span className="block min-w-0">
        {eyebrow !== undefined && <span className={cx('eyebrow mb-1 block', tone && 'text-(--tone-ink)')}>{eyebrow}</span>}
        {title !== undefined &&
          (clickable ? (
            <span id={titleId} className="block font-display text-[1.1875rem] font-semibold leading-snug tracking-tight">
              {title}
            </span>
          ) : (
            <TitleTag id={titleId} className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight">
              {title}
            </TitleTag>
          ))}
      </span>
      {action !== undefined && <span className="-my-1 flex shrink-0 items-center gap-1">{action}</span>}
    </span>
  ) : null

  if (to !== undefined) {
    return (
      <Link to={to} {...(rest as HTMLAttributes<HTMLAnchorElement>)} onClick={onClick} className={classes} style={mergedStyle}>
        {header}
        {children}
      </Link>
    )
  }

  if (onClick !== undefined) {
    return (
      <button type="button" {...(rest as HTMLAttributes<HTMLButtonElement>)} onClick={onClick} className={classes} style={mergedStyle}>
        {header}
        {children}
      </button>
    )
  }

  const Tag = as ?? (title !== undefined ? 'section' : 'div')
  return (
    <Tag
      {...rest}
      aria-labelledby={Tag === 'section' && title !== undefined ? (rest['aria-labelledby'] ?? titleId) : rest['aria-labelledby']}
      className={classes}
      style={mergedStyle}
    >
      {header}
      {children}
    </Tag>
  )
}
