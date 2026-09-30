/**
 * PageHeader – sidrubrik i Fraunces med valfri tillbaka-knapp och åtgärder.
 *
 * Överst ligger en klibbig rad (säker yta för iOS inräknad). När den stora rubriken har
 * scrollats ur bild tonar raden in en suddig bakgrund och visar rubriken i kompakt form.
 *
 * Placera först på sidan, inuti sidans `px-4`-behållare (raden går kant i kant via -mx-4).
 * Vid utskrift döljs den klibbiga raden; den stora rubriken skrivs ut.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, type To } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft } from 'lucide-react'
import { cx } from './Button'
import { IconButton } from './IconButton'

export interface PageHeaderProps {
  title: ReactNode
  /** Liten etikett ovanför rubriken (t.ex. datum). */
  eyebrow?: ReactNode
  /** Text under rubriken. */
  subtitle?: ReactNode
  /** Visa tillbaka-knapp som går bakåt i historiken (eller till `/` om historiken är tom). */
  back?: boolean
  /** Visa tillbaka-knapp som navigerar till en bestämd sida. */
  backTo?: To
  /** Etikett för tillbaka-knappen (standard "Tillbaka"). */
  backLabel?: string
  /** Knappar till höger i den klibbiga raden. */
  actions?: ReactNode
  /** Kompakt rubrik i den klibbiga raden (standard: `title` om den är text). */
  compactTitle?: ReactNode
  /** Extra innehåll under rubriken, t.ex. flikar eller en datumväljare. */
  children?: ReactNode
  /** Låt den klibbiga raden alltid ha bakgrund (t.ex. över bilder). */
  solid?: boolean
  className?: string
}

/**
 * ```tsx
 * <PageHeader eyebrow="Fredag 26 september" title="Dagbok" actions={<IconButton icon={Calendar} aria-label="Välj dag" />} />
 * <PageHeader back title="Havregrynsgröt" subtitle="Livsmedelsverket" />
 * ```
 */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  back,
  backTo,
  backLabel = 'Tillbaka',
  actions,
  compactTitle,
  children,
  solid,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const barRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [compact, setCompact] = useState(false)
  const showBack = back || backTo !== undefined

  // Kompakt läge när den stora rubriken har passerat in under den klibbiga raden
  // (radens verkliga höjd, inklusive säker yta på iOS).
  useEffect(() => {
    const el = titleRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const barHeight = barRef.current?.offsetHeight || 56
    const io = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting && entry.boundingClientRect.top < barHeight + 8),
      { rootMargin: `-${barHeight}px 0px 0px 0px`, threshold: 0 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const goBack = () => {
    if (backTo !== undefined) {
      navigate(backTo)
      return
    }
    // react-router sparar historikindex i history.state – finns inget att gå tillbaka till, gå hem.
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate('/', { replace: true })
  }

  const small = compactTitle ?? (typeof title === 'string' ? title : null)
  const elevated = compact || solid

  return (
    <header className={cx('relative', className)}>
      <div
        ref={barRef}
        className={cx(
          // Knappraden (tillbaka, åtgärder) behövs inte på papper – rubriken nedanför skrivs ut.
          'pt-safe sticky top-0 z-30 -mx-4 px-2 transition-[background-color,box-shadow,backdrop-filter] duration-300 print:hidden',
          elevated
            ? 'bg-bg/80 shadow-[0_1px_0_0_var(--lg-line)] backdrop-blur-xl backdrop-saturate-150'
            : 'bg-transparent shadow-[0_1px_0_0_transparent]',
        )}
      >
        <div className="flex h-14 items-center gap-1">
          <div className="flex min-w-11 items-center">
            {showBack && <IconButton icon={ChevronLeft} aria-label={backLabel} onClick={goBack} noTooltip />}
          </div>
          <div className="min-w-0 flex-1 text-center">
            <AnimatePresence initial={false}>
              {compact && small !== null && (
                <motion.div
                  key="compact"
                  aria-hidden
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  className="truncate font-display text-[1.0625rem] font-semibold tracking-tight text-ink"
                >
                  {small}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex min-w-11 items-center justify-end gap-0.5">{actions}</div>
        </div>
      </div>

      <div className="pb-4 pt-1">
        {eyebrow !== undefined && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 ref={titleRef} className="font-display text-[2rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[2.375rem]">
          {title}
        </h1>
        {subtitle !== undefined && <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">{subtitle}</p>}
        {children !== undefined && <div className="mt-4">{children}</div>}
      </div>
    </header>
  )
}
