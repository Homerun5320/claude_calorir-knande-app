/**
 * Skeleton – platshållare med mjuk skimmer medan något laddas.
 * Skimret stängs av automatiskt vid "reducerad rörelse" (global regel i index.css).
 */
import type { CSSProperties } from 'react'
import { cx } from './Button'

/** Nyckelbilder för skimret. React 19 lyfter <style href> till <head> och dedupliceras. */
const SHIMMER_CSS = '@keyframes lagom-shimmer{0%{background-position:150% 0}100%{background-position:-50% 0}}'

const SHIMMER_STYLE: CSSProperties = {
  // Bandet är bläck med låg opacitet: mörkare i ljust läge, ljusare i mörkt – syns i båda.
  backgroundImage:
    'linear-gradient(100deg, transparent 20%, color-mix(in oklab, var(--lg-ink) 7%, transparent) 50%, transparent 80%)',
  backgroundSize: '200% 100%',
  backgroundRepeat: 'no-repeat',
  animation: 'lagom-shimmer 1.6s ease-in-out infinite',
}

export interface SkeletonProps {
  /** Storlek och form via klasser, t.ex. "h-4 w-32". */
  className?: string
  /** Rund (t.ex. avatar/ikon). */
  circle?: boolean
  style?: CSSProperties
}

/** En skimrande platshållare. Dold för skärmläsare – markera behållaren med aria-busy. */
export function Skeleton({ className, circle, style }: SkeletonProps) {
  return (
    <>
      <style href="lagom-shimmer" precedence="default">
        {SHIMMER_CSS}
      </style>
      <span
        aria-hidden
        data-skeleton=""
        style={{ ...SHIMMER_STYLE, ...style }}
        className={cx(
          'block bg-surface-2',
          circle ? 'rounded-full' : !className?.includes('rounded') && 'rounded-xl',
          className ?? 'h-4 w-full',
        )}
      />
    </>
  )
}

/** Flera textrader där sista raden är kortare. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cx('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cx('h-3.5', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  )
}

/** Platshållare med samma mått som en ListRow. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx('flex min-h-[3.75rem] items-center gap-3 px-3 py-2.5', className)}>
      <Skeleton className="size-11 rounded-2xl" />
      <span className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </span>
      <Skeleton className="h-4 w-14" />
    </span>
  )
}
