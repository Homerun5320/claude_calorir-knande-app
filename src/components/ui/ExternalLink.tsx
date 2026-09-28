/**
 * ExternalLink – länk till en annan webbplats (1177, Livsmedelsverket, Open Food Facts …).
 *
 * - Öppnas i en ny flik (i appen: utanför appen) med rel="noopener noreferrer", så att sidan
 *   varken kan styra Lagom eller se varifrån besökaren kom.
 * - En liten ikon efter texten visar att länken leder bort, och skärmläsare får höra
 *   "(öppnas i ny flik)" eller "(öppnas utanför appen)".
 * - mailto: och tel: öppnar e-post eller telefon – de får ingen ikon och ingen ny flik.
 * - Synlig fokus. Utan `className` får länken standardutseendet (grön, understruken).
 *
 * ```tsx
 * <ExternalLink href="https://www.1177.se">1177 Vårdguiden</ExternalLink>
 * <ExternalLink href={url} className="flex min-h-11 items-center gap-3" showIcon={false}>…</ExternalLink>
 * ```
 */
import type { ComponentProps, ReactNode } from 'react'
import { ExternalLink as ExternalLinkIcon } from 'lucide-react'
import { isInApp } from '../../config/platform'
import { cx } from './Button'

export interface ExternalLinkProps extends Omit<ComponentProps<'a'>, 'href' | 'target' | 'rel' | 'children'> {
  href: string
  children: ReactNode
  className?: string
  /**
   * Visa ikonen för extern länk efter texten. Standard true; stäng av när länken har en egen ikon
   * (t.ex. ett kort med pil). Utan ikon är länken tänkt för flex- eller blocklayout – i löptext
   * syns mellanslaget före skärmläsartexten (t.ex. före en punkt efter länken).
   */
  showIcon?: boolean
}

/** Standardutseende för en extern länk i löptext. */
const DEFAULT_CLASS = 'font-semibold text-gran underline underline-offset-2 hover:decoration-2'
const FOCUS_CLASS = 'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gran'

/** mailto: och tel: öppnar en app på enheten, inte en webbsida. */
export function isAppLink(href: string): boolean {
  return /^(mailto|tel|sms):/i.test(href.trim())
}

/** Texten som skärmläsare hör efter länktexten. */
export function externalLinkHint(): string {
  return isInApp() ? '(öppnas utanför appen)' : '(öppnas i ny flik)'
}

export function ExternalLink({ href, children, className, showIcon = true, ...rest }: ExternalLinkProps) {
  const classes = cx(className ?? DEFAULT_CLASS, FOCUS_CLASS)
  if (isAppLink(href)) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
      {children}
      {/*
        Mellanslaget står före ikonen och utanför den dolda texten – annars tappas det i länkens
        tillgängliga namn ("1177 Vårdguiden (öppnas i ny flik)"). I flex-layouter försvinner det.
      */}
      {' '}
      {showIcon && <ExternalLinkIcon aria-hidden className="inline-block size-[0.85em] shrink-0 align-[-0.05em]" strokeWidth={2.2} />}
      <span className="sr-only">{externalLinkHint()}</span>
    </a>
  )
}
