/**
 * Badge – liten piller-etikett, t.ex. "Nyckelhål", "Säsong", "Ny".
 *
 * Filen innehåller också UI-kittets delade tonsystem (`Tone`, `toneVars`, `toneColor` …).
 * Toner översätts till CSS-variablerna `--tone`, `--tone-soft` och `--tone-ink` så att
 * komponenterna kan använda `bg-(--tone-soft)` m.fl. och automatiskt fungera i mörkt läge.
 */
import type { CSSProperties, ReactNode } from 'react'
import { cx, renderIcon, type IconLike } from './Button'

// ---------------------------------------------------------------------------
// Tonsystem
// ---------------------------------------------------------------------------

/** Naturfärgerna i designsystemet. */
export type AccentTone = 'gran' | 'lingon' | 'hjortron' | 'blabar' | 'mossa' | 'vinbar' | 'fjall' | 'sol'
/** Semantiska alias: protein = lingon, kolhydrater = hjortron, fett = blåbär … */
export type SemanticTone = 'protein' | 'carbs' | 'fat' | 'fiber' | 'alcohol' | 'water' | 'good' | 'warn' | 'bad'
/** Alla toner. `neutral` = gråskala av ytor och text. */
export type Tone = AccentTone | SemanticTone | 'neutral'

const TONE_BASE: Record<Exclude<Tone, 'neutral'>, AccentTone> = {
  gran: 'gran',
  lingon: 'lingon',
  hjortron: 'hjortron',
  blabar: 'blabar',
  mossa: 'mossa',
  vinbar: 'vinbar',
  fjall: 'fjall',
  sol: 'sol',
  protein: 'lingon',
  carbs: 'hjortron',
  fat: 'blabar',
  fiber: 'mossa',
  alcohol: 'vinbar',
  water: 'fjall',
  good: 'mossa',
  warn: 'hjortron',
  bad: 'lingon',
}

/** Tonens huvudfärg som CSS-värde, t.ex. `var(--lg-lingon)`. För ytor, staplar och ikoner. */
export function toneColor(tone: Tone): string {
  return tone === 'neutral' ? 'var(--lg-ink-3)' : `var(--lg-${TONE_BASE[tone]})`
}

/** Tonens mjuka bakgrund, t.ex. `var(--lg-lingon-soft)`. */
export function toneSoftColor(tone: Tone): string {
  return tone === 'neutral' ? 'var(--lg-surface-2)' : `var(--lg-${TONE_BASE[tone]}-soft)`
}

/**
 * Tonen som textfärg: minst 4,5:1 mot alla ytor och tonens -soft i båda temana
 * (`--lg-*-text` i index.css). Använd för tal och ord i tonfärg, t.ex. i `Stat`.
 */
export function toneTextColor(tone: Tone): string {
  return tone === 'neutral' ? 'var(--lg-ink-3)' : `var(--lg-${TONE_BASE[tone]}-text)`
}

/**
 * Textfärg med god kontrast mot tonens mjuka bakgrund: textvarianten blandad med bläck.
 * I ljust läge blir den mörkare, i mörkt läge ljusare. Minst 6:1 mot -soft och alla ytor.
 */
export function toneInkColor(tone: Tone): string {
  return tone === 'neutral' ? 'var(--lg-ink-2)' : `color-mix(in oklab, ${toneTextColor(tone)} 72%, var(--lg-ink))`
}

/** CSS-variabler för en ton: `--tone`, `--tone-soft`, `--tone-text`, `--tone-ink`. Sprid in i `style`. */
export function toneVars(tone: Tone, style?: CSSProperties): CSSProperties {
  return {
    '--tone': toneColor(tone),
    '--tone-soft': toneSoftColor(tone),
    '--tone-text': toneTextColor(tone),
    '--tone-ink': toneInkColor(tone),
    ...style,
  } as CSSProperties
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeVariant = 'soft' | 'solid' | 'outline'

export interface BadgeProps {
  tone?: Tone
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  /** Ikon före texten. */
  icon?: IconLike
  /** Liten färgprick före texten (t.ex. status). */
  dot?: boolean
  className?: string
  title?: string
  children?: ReactNode
}

const VARIANTS: Record<BadgeVariant, string> = {
  soft: 'bg-(--tone-soft) text-(--tone-ink)',
  // Textvarianten som bakgrund: ljus text klarar 4,5:1 även för hjortron och sol i ljust läge.
  solid: 'bg-(--tone-text) text-bg',
  outline: 'bg-transparent text-(--tone-ink) ring-1 ring-inset ring-(--tone)/35',
}

/**
 * Liten etikett.
 *
 * ```tsx
 * <Badge tone="mossa" icon={Leaf}>Säsong</Badge>
 * <Badge tone="protein" variant="solid">P</Badge>
 * ```
 */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'sm', icon, dot, className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      style={toneVars(tone)}
      className={cx(
        // shrink-0 + max-w-full: behåller sin storlek bredvid andra element men radbryts när den ensam är
        // bredare än raden (stor text, WCAG 1.4.4/1.4.10). min-h-* – enradig höjd som förut.
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-full text-center font-semibold leading-none tabular-nums',
        size === 'sm' ? 'min-h-5 px-2 py-0.5 text-[0.6875rem]' : 'min-h-6 px-2.5 py-0.5 text-xs',
        VARIANTS[variant],
        className,
      )}
    >
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full', variant === 'solid' ? 'bg-bg' : 'bg-(--tone)')} />}
      {renderIcon(icon, size === 'sm' ? 'size-3' : 'size-3.5', 2.4)}
      {/* Egen radhöjd (leading-none på pillret klipper annars prickarna över Ö/Ä och ringen på Å). */}
      {children !== undefined && <span className="min-w-0 break-words leading-[1.3]">{children}</span>}
    </span>
  )
}
