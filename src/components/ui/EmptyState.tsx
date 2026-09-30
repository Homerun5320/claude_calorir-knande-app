/**
 * EmptyState – vänligt tomt läge med en liten nordisk illustration.
 *
 * Illustrationer (inline-SVG i designsystemets färger, fungerar i ljust och mörkt läge):
 *   plate  – tom tallrik med en lingonkvist (tom dagbok/måltid)
 *   forest – granar, en björk och midnattssol (inget att visa ännu)
 *   search – förstoringsglas med lingon (inga sökträffar)
 *   chart  – staplar under en uppgående sol (för lite data för insikter)
 */
import { useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from './Button'
import { headingTag, useHeadingLevel } from './headingLevel'

export type EmptyIllustration = 'plate' | 'forest' | 'search' | 'chart'

export interface EmptyStateProps {
  title: ReactNode
  /** Förklarande text. */
  text?: ReactNode
  /** Knapp eller länk, t.ex. <Button>Lägg till frukost</Button>. */
  action?: ReactNode
  /** Inbyggd illustration eller eget innehåll. `null` = ingen. */
  illustration?: EmptyIllustration | ReactNode
  /** Mindre variant för kort och listor. */
  compact?: boolean
  /**
   * Rubriknivå. Standard: automatiskt efter föregående rubrik – h2 direkt under sidans h1,
   * h3 i ett kort eller ark med h2-rubrik.
   */
  titleAs?: 'h2' | 'h3' | 'h4'
  className?: string
}

/** Liten fyruddig stjärna/gnista. */
function Sparkle({ x, y, s = 1, className }: { x: number; y: number; s?: number; className?: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -5 C0.6 -1.2 1.2 -0.6 5 0 C1.2 0.6 0.6 1.2 0 5 C-0.6 1.2 -1.2 0.6 -5 0 C-1.2 -0.6 -0.6 -1.2 0 -5Z"
      className={className}
    />
  )
}

/** Lingonkvist: stjälk, blad och tre bär med glans. */
function LingonSprig({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-14 6 C-6 -2 4 -6 16 -6" fill="none" strokeWidth={1.6} strokeLinecap="round" className="stroke-mossa" />
      <ellipse cx={-6} cy={-3} rx={5.5} ry={2.6} transform="rotate(-38 -6 -3)" className="fill-mossa" />
      <ellipse cx={3} cy={-8} rx={5} ry={2.4} transform="rotate(-12 3 -8)" className="fill-mossa" opacity={0.85} />
      <ellipse cx={12} cy={-10.5} rx={4.4} ry={2.1} transform="rotate(8 12 -10.5)" className="fill-mossa" opacity={0.7} />
      <circle cx={6} cy={1} r={4.6} className="fill-lingon" />
      <circle cx={13.5} cy={-1} r={4.1} className="fill-lingon" />
      <circle cx={-1.5} cy={4.5} r={4} className="fill-lingon" />
      <circle cx={4.6} cy={-0.6} r={1.2} className="fill-surface" opacity={0.75} />
      <circle cx={12.3} cy={-2.4} r={1.05} className="fill-surface" opacity={0.75} />
      <circle cx={-2.7} cy={3.1} r={1} className="fill-surface" opacity={0.75} />
    </g>
  )
}

/** Gran i tre våningar. */
function Fir({ x, y, h, className, opacity }: { x: number; y: number; h: number; className: string; opacity?: number }) {
  const w = h * 0.62
  const t = (f: number) => y + h * f
  const d = [
    `M${x} ${y}`,
    `L${x + w * 0.3} ${t(0.34)} L${x + w * 0.16} ${t(0.34)}`,
    `L${x + w * 0.42} ${t(0.64)} L${x + w * 0.24} ${t(0.64)}`,
    `L${x + w * 0.5} ${t(0.92)} L${x - w * 0.5} ${t(0.92)}`,
    `L${x - w * 0.24} ${t(0.64)} L${x - w * 0.42} ${t(0.64)}`,
    `L${x - w * 0.16} ${t(0.34)} L${x - w * 0.3} ${t(0.34)} Z`,
  ].join(' ')
  return (
    <g opacity={opacity}>
      <rect x={x - 2} y={t(0.9)} width={4} height={h * 0.12} rx={1} className="fill-ink-3" opacity={0.5} />
      <path d={d} strokeLinejoin="round" strokeWidth={2} className={className} />
    </g>
  )
}

function PlateArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-auto w-full" aria-hidden>
      <ellipse cx={80} cy={100} rx={58} ry={7} className="fill-surface-3" opacity={0.55} />
      {/* Gaffel och kniv */}
      <g fill="none" strokeLinecap="round" className="stroke-ink-3" opacity={0.45} strokeWidth={2.4}>
        <path d="M14 46 v13 M19 46 v13 M24 46 v13 M14 59 q5 7 10 0 M19 63 v33" />
        <path d="M143 46 c7 8 7 20 0 27 v23" />
      </g>
      {/* Tallrik */}
      <ellipse cx={80} cy={78} rx={56} ry={22} strokeWidth={1.5} className="fill-surface stroke-line" />
      <ellipse cx={80} cy={77} rx={38} ry={13.5} className="fill-surface-2" />
      <ellipse cx={80} cy={75.5} rx={30} ry={9} className="fill-surface-2 stroke-line" strokeWidth={1} opacity={0.8} />
      <LingonSprig x={94} y={72} s={1.4} />
      <Sparkle x={40} y={30} s={1.1} className="fill-sol" />
      <Sparkle x={122} y={22} s={0.7} className="fill-sol" />
      <Sparkle x={62} y={16} s={0.55} className="fill-hjortron" />
    </svg>
  )
}

function ForestArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-auto w-full" aria-hidden>
      <circle cx={118} cy={34} r={17} className="fill-sol-soft" />
      <circle cx={118} cy={34} r={10} className="fill-sol" />
      <path d="M10 106 C22 90 50 86 78 92 C104 97 132 88 150 100 C156 108 150 113 136 113 H26 C12 113 6 110 10 106 Z" className="fill-mossa-soft" />
      <Fir x={70} y={46} h={52} className="fill-gran stroke-gran" opacity={0.55} />
      <Fir x={46} y={30} h={70} className="fill-gran stroke-gran" />
      {/* Björk */}
      <g>
        <circle cx={108} cy={60} r={13} className="fill-mossa" opacity={0.75} />
        <circle cx={98} cy={68} r={10} className="fill-mossa" opacity={0.6} />
        <circle cx={117} cy={70} r={9} className="fill-mossa" opacity={0.55} />
        <rect x={104.5} y={66} width={6} height={34} rx={2} strokeWidth={1.2} className="fill-surface stroke-line" />
        <path d="M105 74 h3 M107.5 82 h3 M105 90 h2.5" strokeWidth={1.6} strokeLinecap="round" className="stroke-ink-2" />
      </g>
    </svg>
  )
}

function SearchArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-auto w-full" aria-hidden>
      <ellipse cx={80} cy={104} rx={46} ry={6} className="fill-surface-3" opacity={0.55} />
      <path d="M92 76 L114 98" strokeWidth={10} strokeLinecap="round" className="stroke-gran" />
      <circle cx={72} cy={56} r={29} strokeWidth={6} className="fill-surface stroke-ink-3" opacity={0.95} />
      <circle cx={72} cy={56} r={22} className="fill-surface-2" />
      <LingonSprig x={70} y={60} s={0.95} />
      <path d="M58 40 a18 18 0 0 1 12 -6" fill="none" strokeWidth={3} strokeLinecap="round" className="stroke-surface" opacity={0.9} />
      <Sparkle x={122} y={34} s={0.9} className="fill-sol" />
      <Sparkle x={30} y={26} s={0.6} className="fill-hjortron" />
    </svg>
  )
}

function ChartArt() {
  const bars = [
    { x: 30, h: 26 },
    { x: 52, h: 40 },
    { x: 74, h: 32 },
    { x: 96, h: 52 },
    { x: 118, h: 44 },
  ]
  return (
    <svg viewBox="0 0 160 120" className="h-auto w-full" aria-hidden>
      <circle cx={126} cy={30} r={12} className="fill-sol-soft" />
      <circle cx={126} cy={30} r={6.5} className="fill-sol" />
      <path d="M18 58 H148" strokeWidth={1.5} strokeDasharray="4 5" strokeLinecap="round" className="stroke-ink-3" opacity={0.5} />
      {bars.map((b, i) => (
        <rect key={b.x} x={b.x - 8} y={100 - b.h} width={16} height={b.h} rx={6} className={i === 3 ? 'fill-gran' : 'fill-gran-soft'} />
      ))}
      <path d="M14 100 H150" strokeWidth={1.5} strokeLinecap="round" className="stroke-line" />
    </svg>
  )
}

const ART: Record<EmptyIllustration, () => ReactNode> = {
  plate: PlateArt,
  forest: ForestArt,
  search: SearchArt,
  chart: ChartArt,
}

function isBuiltIn(x: unknown): x is EmptyIllustration {
  return typeof x === 'string' && x in ART
}

/**
 * ```tsx
 * <EmptyState illustration="plate" title="Inget ätet ännu"
 *   text="Börja med frukosten – eller skanna en streckkod."
 *   action={<Button iconLeft={Plus} to="/lagg-till">Lägg till</Button>} />
 * ```
 */
export function EmptyState({ title, text, action, illustration = 'plate', compact, titleAs, className }: EmptyStateProps) {
  const reduce = useReducedMotion()
  const Art = isBuiltIn(illustration) ? ART[illustration] : null
  const rootRef = useRef<HTMLDivElement>(null)
  const TitleTag = headingTag(useHeadingLevel(rootRef, titleAs ? (Number(titleAs.slice(1)) as 2 | 3 | 4) : undefined))
  return (
    <motion.div
      ref={rootRef}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cx('flex flex-col items-center text-center', compact ? 'px-4 py-6' : 'px-6 py-10', className)}
    >
      {illustration !== null && (
        <div className={cx('shrink-0', compact ? 'mb-3 w-28' : 'mb-5 w-40')}>{Art ? <Art /> : illustration}</div>
      )}
      <TitleTag className={cx('font-display font-semibold leading-tight tracking-tight text-ink', compact ? 'text-lg' : 'text-xl')}>
        {title}
      </TitleTag>
      {text !== undefined && (
        <p className={cx('mt-1.5 max-w-xs leading-relaxed text-ink-2', compact ? 'text-sm' : 'text-[0.9375rem]')}>{text}</p>
      )}
      {action !== undefined && <div className={cx('flex flex-wrap justify-center gap-2', compact ? 'mt-4' : 'mt-6')}>{action}</div>}
    </motion.div>
  )
}
