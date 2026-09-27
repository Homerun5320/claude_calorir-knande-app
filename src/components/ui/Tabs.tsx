/**
 * Tabs – flikar för sektioner på en sida (understruken eller piller).
 * Horisontellt scrollbar på små skärmar; aktiv flik scrollas in i bild.
 * Fokusramen ritas innanför fliken så att den inte klipps av den scrollbara raden, och
 * pillerflikarna har 44 px tryckyta.
 *
 * Koppla ihop med innehållet via `id` + `tabPanelProps(id, value)`:
 *
 * ```tsx
 * <Tabs id="insikter" value={tab} onChange={setTab} tabs={[{ value: 'energi', label: 'Energi' }, …]} />
 * <div {...tabPanelProps('insikter', tab)}>…</div>
 * ```
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx, renderIcon, type IconLike } from './Button'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  icon?: IconLike
  /** Liten räknare efter etiketten. */
  count?: number
  disabled?: boolean
}

export interface TabsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  tabs: ReadonlyArray<TabItem<T>>
  /** Bas för element-id:n (flik: `${id}-tab-${value}`, panel: `${id}-panel-${value}`). */
  id?: string
  variant?: 'underline' | 'pill'
  /**
   * aria-controls på flikarna. `'auto'` (standard): pekar på `${id}-panel-${value}` när en panel
   * med det id:t finns i dokumentet (oftast bara den aktiva – aria-controls får inte peka på
   * något som saknas). `'none'`: aldrig. Funktion: eget panel-id per flik.
   */
  controls?: 'auto' | 'none' | ((value: T) => string | undefined)
  'aria-label'?: string
  'aria-labelledby'?: string
  className?: string
}

/** Id för en flik. */
export function tabId(base: string, value: string): string {
  return `${base}-tab-${value}`
}

/** Id för en flikpanel. */
export function tabPanelId(base: string, value: string): string {
  return `${base}-panel-${value}`
}

/** Props för panelen som hör till en flik. */
export function tabPanelProps(base: string, value: string) {
  return {
    id: tabPanelId(base, value),
    role: 'tabpanel' as const,
    'aria-labelledby': tabId(base, value),
    tabIndex: 0,
  }
}

export function Tabs<T extends string>({ value, onChange, tabs, id, variant = 'underline', controls = 'auto', className, ...aria }: TabsProps<T>) {
  const autoId = useId()
  const base = id ?? `tabs-${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const reduce = useReducedMotion()
  const listRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = tabs.findIndex((t) => t.value === value)

  // Vilka paneler som faktiskt finns (för aria-controls i läget 'auto'). Kollas efter varje
  // rendering – panelen ligger oftast efter flikraden och byts när fliken byts.
  const [present, setPresent] = useState('')
  useLayoutEffect(() => {
    if (controls !== 'auto') return
    const found = tabs
      .map((t) => tabPanelId(base, t.value))
      .filter((pid) => document.getElementById(pid) !== null)
      .join(' ')
    if (found !== present) setPresent(found)
  })
  const controlsFor = (v: T): string | undefined => {
    if (controls === 'none') return undefined
    if (typeof controls === 'function') return controls(v)
    const pid = tabPanelId(base, v)
    return present.split(' ').includes(pid) ? pid : undefined
  }

  // Håll aktiv flik synlig i den scrollbara raden (endast horisontellt – sidan rullas inte).
  useEffect(() => {
    const list = listRef.current
    const el = refs.current[activeIndex]
    if (!list || !el || typeof list.scrollTo !== 'function') return
    const pad = 16
    let left: number | undefined
    if (el.offsetLeft < list.scrollLeft + pad) left = el.offsetLeft - pad
    else if (el.offsetLeft + el.offsetWidth > list.scrollLeft + list.clientWidth - pad)
      left = el.offsetLeft + el.offsetWidth - list.clientWidth + pad
    if (left !== undefined) list.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' })
  }, [activeIndex, reduce])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabled = tabs.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0)
    const pos = enabled.indexOf(index)
    let target: number | undefined
    if (e.key === 'ArrowRight') target = enabled[(pos + 1) % enabled.length]
    else if (e.key === 'ArrowLeft') target = enabled[(pos - 1 + enabled.length) % enabled.length]
    else if (e.key === 'Home') target = enabled[0]
    else if (e.key === 'End') target = enabled[enabled.length - 1]
    if (target === undefined) return
    e.preventDefault()
    onChange(tabs[target].value)
    refs.current[target]?.focus()
  }

  const pill = variant === 'pill'
  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation="horizontal"
      {...aria}
      className={cx(
        'no-scrollbar relative flex overflow-x-auto overscroll-x-contain',
        pill ? 'gap-1.5 py-1' : 'gap-2 border-b border-line',
        className,
      )}
    >
      {tabs.map((t, i) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            id={tabId(base, t.value)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={controlsFor(t.value)}
            tabIndex={selected || (activeIndex === -1 && i === 0) ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              'relative isolate inline-flex shrink-0 select-none items-center gap-1.5 whitespace-nowrap font-semibold transition-colors duration-200 disabled:opacity-40',
              // Fokusramen ritas innanför fliken – en ram utanför klipps av den scrollbara raden.
              // På det valda (gröna) pillret: en ljus ring med grönt på båda sidor.
              pill
                ? cx(
                    // 36 px synligt piller, 44 px tryckyta (radens py-1 ger plats åt den).
                    "h-9 rounded-full px-4 text-sm after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                    selected
                      ? 'text-on-gran focus-visible:outline-offset-[-4px] focus-visible:outline-on-gran'
                      : 'text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-offset-[-2px]',
                  )
                : cx('h-11 rounded-xl px-2 text-[0.9375rem] focus-visible:outline-offset-[-2px]', selected ? 'text-ink' : 'text-ink-3 hover:text-ink-2'),
            )}
          >
            {selected && (
              <motion.span
                layoutId={`${base}-indicator`}
                aria-hidden
                className={
                  pill ? 'absolute inset-0 -z-10 rounded-full bg-gran' : 'absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-gran'
                }
                transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            {renderIcon(t.icon, 'size-4', 2.2)}
            {t.label}
            {t.count !== undefined && (
              <span
                className={cx(
                  'min-w-5 rounded-full px-1.5 py-0.5 text-center text-[0.6875rem] leading-none tabular-nums',
                  selected ? (pill ? 'bg-on-gran/20 text-on-gran' : 'bg-gran-soft text-gran') : 'bg-surface-2 text-ink-3',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
