/**
 * Varsam notis på Idag när något tyder på att man äter för lite eller går ner för fort.
 * Aldrig larmande – en vänlig uppmaning och vägar till stöd (1177 och Frisk & Fri).
 */
import type { ReactNode } from 'react'
import { HeartHandshake } from 'lucide-react'
import { ExternalLink } from '../../components/ui'

function SupportLink({ href, children }: { href: string; children: ReactNode }) {
  return <ExternalLink href={href}>{children}</ExternalLink>
}

export function CareNote({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-2xl bg-surface-2 p-3.5 text-[0.8125rem] leading-relaxed text-ink-2 ${className}`}>
      <HeartHandshake aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-lingon" strokeWidth={2} />
      <p>
        {children} Känns det svårt kring mat eller vikt? Stöd finns hos <SupportLink href="https://www.1177.se">1177</SupportLink> och{' '}
        <SupportLink href="https://www.friskfri.se">Frisk &amp; Fri</SupportLink>.
      </p>
    </div>
  )
}
