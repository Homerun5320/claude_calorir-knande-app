/**
 * ListRow – rad i en lista: ledande ikon/emoji, rubrik, underrubrik och värde/pil till höger.
 *
 * - `onClick` → knapp, `to` → länk (hela raden klickbar, pil visas automatiskt).
 * - `action` renderas utanför den klickbara ytan – där kan en egen knapp/Switch ligga
 *   utan att knappar hamnar i knappar.
 * - `ListGroup` samlar rader i ett kort med tunna avdelare.
 */
import type { MouseEventHandler, ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cx, renderIcon, type IconLike } from './Button'
import { toneVars, type Tone } from './Badge'

export interface ListRowProps {
  /** Ikon, emoji (sträng) eller eget element (t.ex. en avatar/bild). */
  leading?: IconLike
  /** Ton för den ledande cirkeln (standard neutral). */
  leadingTone?: Tone
  title: ReactNode
  subtitle?: ReactNode
  /** Högerställt värde, t.ex. "245 kcal". */
  value?: ReactNode
  /** Liten text under värdet, t.ex. "150 g". */
  valueSub?: ReactNode
  /** Eget innehåll till höger (inuti den klickbara ytan – ska inte vara interaktivt). */
  trailing?: ReactNode
  /** Interaktivt innehåll till höger, utanför den klickbara ytan (knapp, Switch …). */
  action?: ReactNode
  /** Visa pil. Standard: true för länkar, false annars. */
  chevron?: boolean
  onClick?: MouseEventHandler<HTMLElement>
  to?: To
  disabled?: boolean
  /** Kompakt höjd. */
  dense?: boolean
  /** Tillgänglig etikett för den klickbara ytan (om rubriken inte räcker). */
  'aria-label'?: string
  className?: string
}

function Leading({ leading, tone }: { leading: IconLike; tone?: Tone }) {
  // Emoji/text visas stort i en mjuk cirkel; ikoner tonas; egna element lämnas orörda.
  if (typeof leading === 'string' || typeof leading === 'number') {
    return (
      <span
        aria-hidden
        style={tone ? toneVars(tone) : undefined}
        className={cx('grid size-11 shrink-0 place-items-center rounded-2xl text-[1.375rem] leading-none', tone ? 'bg-(--tone-soft)' : 'bg-surface-2')}
      >
        {leading}
      </span>
    )
  }
  const node = renderIcon(leading, 'size-5', 2)
  const isIcon = node !== leading
  if (!isIcon) return <span className="shrink-0">{node}</span>
  return (
    <span
      aria-hidden
      style={tone ? toneVars(tone) : undefined}
      className={cx(
        'grid size-11 shrink-0 place-items-center rounded-2xl',
        tone ? 'bg-(--tone-soft) text-(--tone)' : 'bg-surface-2 text-ink-2',
      )}
    >
      {node}
    </span>
  )
}

/**
 * ```tsx
 * <ListRow leading="🥣" title="Havregrynsgröt" subtitle="2 dl · Frukost" value="245 kcal" onClick={edit} />
 * <ListRow leading={Scale} leadingTone="fjall" title="Vikt" to="/vikt" value="72,4 kg" />
 * <ListRow leading={Bell} title="Påminnelser" action={<Switch aria-label="Påminnelser" checked={on} onChange={setOn} />} />
 * ```
 */
export function ListRow({
  leading,
  leadingTone,
  title,
  subtitle,
  value,
  valueSub,
  trailing,
  action,
  chevron,
  onClick,
  to,
  disabled,
  dense,
  'aria-label': ariaLabel,
  className,
}: ListRowProps) {
  const clickable = (onClick !== undefined || to !== undefined) && !disabled
  const showChevron = chevron ?? to !== undefined

  const content = (
    <>
      {leading !== undefined && leading !== null && <Leading leading={leading} tone={leadingTone} />}
      <span className="min-w-0 flex-1">
        {/* Högst två rader: långa titlar och stor text ska inte klippas till en rad (WCAG 1.4.4). */}
        <span className="line-clamp-2 break-words text-[0.9375rem] font-medium leading-snug text-ink">{title}</span>
        {subtitle !== undefined && <span className="mt-0.5 line-clamp-2 break-words text-[0.8125rem] leading-snug text-ink-3">{subtitle}</span>}
      </span>
      {(value !== undefined || valueSub !== undefined) && (
        <span className="flex shrink-0 flex-col items-end text-right">
          {value !== undefined && <span className="text-[0.9375rem] font-semibold tabular-nums text-ink">{value}</span>}
          {valueSub !== undefined && <span className="text-xs tabular-nums text-ink-3">{valueSub}</span>}
        </span>
      )}
      {trailing}
      {showChevron && <ChevronRight aria-hidden className="-mr-1 size-[1.125rem] shrink-0 text-ink-3" strokeWidth={2.2} />}
    </>
  )

  const inner = cx(
    'flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left',
    dense ? 'min-h-12 py-2' : 'min-h-[3.75rem] py-2.5',
    clickable && 'transition-colors duration-150 hover:bg-surface-2 active:bg-surface-3',
    disabled && 'opacity-50',
  )

  let main: ReactNode
  if (to !== undefined && !disabled) {
    main = (
      <Link to={to} onClick={onClick} aria-label={ariaLabel} className={inner}>
        {content}
      </Link>
    )
  } else if (onClick !== undefined) {
    main = (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} className={inner}>
        {content}
      </button>
    )
  } else {
    main = <div className={inner}>{content}</div>
  }

  if (action === undefined) return <div className={cx('flex', className)}>{main}</div>
  return (
    <div className={cx('flex items-center gap-1 pr-3', className)}>
      {main}
      <div className="flex shrink-0 items-center">{action}</div>
    </div>
  )
}

export interface ListGroupProps {
  /** Rubrik ovanför gruppen (eyebrow-stil). */
  title?: ReactNode
  /** Text under gruppen. */
  footer?: ReactNode
  children: ReactNode
  /** Rendera utan kortbakgrund. */
  plain?: boolean
  className?: string
}

/** Samlar ListRow-rader i ett kort med tunna avdelare (inställningar, "Mer"-sidan …). */
export function ListGroup({ title, footer, children, plain, className }: ListGroupProps) {
  return (
    <section className={className}>
      {title !== undefined && <h2 className="eyebrow mb-2 px-4">{title}</h2>}
      <div
        className={cx(
          'flex flex-col p-1.5 [&>*+*]:relative [&>*+*]:before:absolute [&>*+*]:before:inset-x-3 [&>*+*]:before:top-0 [&>*+*]:before:h-px [&>*+*]:before:bg-line/70',
          plain ? '' : 'card',
        )}
      >
        {children}
      </div>
      {footer !== undefined && <p className="mt-2 px-4 text-[0.8125rem] leading-relaxed text-ink-3">{footer}</p>}
    </section>
  )
}
