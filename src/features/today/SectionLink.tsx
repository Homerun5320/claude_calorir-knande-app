/**
 * Liten länk i ett korthuvud ("Dagbok ›", "Visa ›") med en tryckyta på minst 44 px.
 */
import type { ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function SectionLink({ to, children, label }: { to: To; children: ReactNode; label?: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative inline-flex items-center gap-0.5 rounded-lg px-1 py-1 text-[0.8125rem] font-semibold text-gran transition-colors after:absolute after:-inset-2 hover:text-gran-strong"
    >
      {children}
      <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </Link>
  )
}
