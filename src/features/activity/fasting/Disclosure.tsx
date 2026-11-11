/**
 * Hopfällbar förklaring på Fasta-sidan: ett inbyggt `<details>`/`<summary>`, så att den fungerar
 * med tangentbord (Enter/Mellanslag) och skärmläsare utan egen kod. Stängd från början – sidan ska
 * vara kort. Rubriken radbryts vid stor text (`min-w-0`, `min-h-11`).
 */
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cx } from '../../../components/ui'

export interface DisclosureProps {
  /** Rubriken som alltid syns, t.ex. "Mer om 16:8". */
  summary: ReactNode
  children: ReactNode
  className?: string
}

export function Disclosure({ summary, children, className }: DisclosureProps) {
  return (
    <details className={cx('group rounded-2xl bg-surface-2 px-4', className)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl py-1 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 break-words">{summary}</span>
        <Plus aria-hidden className="size-4 shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45" strokeWidth={2.4} />
      </summary>
      <div className="min-w-0 break-words pb-3 text-[0.875rem] leading-relaxed text-ink-2">{children}</div>
    </details>
  )
}
