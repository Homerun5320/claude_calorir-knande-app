/**
 * ChoiceCard – ett stort, tryckvänligt alternativ i en radiogrupp.
 *
 * Bygger på en riktig <input type="radio"> (visuellt dold) så att tangentbord och skärmläsare
 * fungerar som vanligt: Tab går till gruppen, piltangenter byter val. Kortet tonas när det är valt.
 * Används i välkomstflödet och i Inställningar.
 */
import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cx, renderIcon, toneVars, type IconLike, type Tone } from '../../components/ui'

export interface ChoiceCardProps {
  /** Radiogruppens namn (samma för alla alternativ i gruppen). */
  name: string
  value: string
  checked: boolean
  onSelect: () => void
  title: ReactNode
  description?: ReactNode
  /** Lucide-ikon eller emoji. */
  icon?: IconLike
  tone?: Tone
  disabled?: boolean
  /** Extra innehåll till höger om texten (t.ex. en siffra). */
  aside?: ReactNode
  /** Kompakt variant (mindre luft, ingen ikoncirkel). */
  compact?: boolean
  className?: string
}

export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  icon,
  tone = 'gran',
  disabled,
  aside,
  compact,
  className,
}: ChoiceCardProps) {
  const isEmoji = typeof icon === 'string'
  return (
    <label
      style={toneVars(tone)}
      className={cx(
        'group relative flex items-center gap-3.5 rounded-[1.25rem] bg-surface text-left shadow-card ring-1 ring-inset ring-line',
        'transition-[box-shadow,background-color,transform] duration-200 ease-spring',
        'has-[:checked]:bg-(--tone-soft) has-[:checked]:ring-2 has-[:checked]:ring-(--tone)',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gran has-[:focus-visible]:outline',
        compact ? 'min-h-14 px-4 py-3' : 'min-h-[4.5rem] p-3.5 pr-4',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:ring-(--tone)/50 active:scale-[0.99]',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect()}
        className="sr-only"
      />
      {icon !== undefined && !compact && (
        <span
          aria-hidden
          className={cx(
            'grid size-12 shrink-0 place-items-center rounded-2xl transition-colors duration-200',
            isEmoji ? 'bg-surface-2 text-[1.5rem] leading-none group-has-[:checked]:bg-surface' : 'bg-(--tone-soft) text-(--tone) group-has-[:checked]:bg-surface',
          )}
        >
          {renderIcon(icon, 'size-[1.375rem]', 2)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[1rem] font-semibold leading-snug text-ink">{title}</span>
        {description !== undefined && <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-2">{description}</span>}
      </span>
      {aside}
      <span
        aria-hidden
        className={cx(
          'grid size-6 shrink-0 place-items-center rounded-full ring-2 ring-inset ring-ink-3 transition-colors duration-200',
          'group-has-[:checked]:bg-(--tone) group-has-[:checked]:ring-(--tone)',
        )}
      >
        <Check className="size-3.5 text-on-gran opacity-0 transition-opacity group-has-[:checked]:opacity-100" strokeWidth={3} />
      </span>
    </label>
  )
}

/** En grupp av ChoiceCard med tillgänglig rubrik. */
export function ChoiceGroup({ label, labelledBy, children, className }: { label?: string; labelledBy?: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className={cx('flex flex-col gap-2.5', className)}>
      {children}
    </div>
  )
}
