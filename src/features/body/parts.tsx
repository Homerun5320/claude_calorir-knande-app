/**
 * Små delade byggstenar för sidan "Vikt & mått".
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Scale } from 'lucide-react'
import { Button, ExternalLink, cx, toast } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import { directionOf, formatSignedKg } from './bodyLogic'

/** Mjuk, återhållsam intoning av en sektion när sidan öppnas. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: reduce ? 0 : delay }}
    >
      {children}
    </motion.div>
  )
}

const ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const
const WORDS = { up: 'uppåt', down: 'nedåt', flat: 'oförändrat' } as const

/**
 * Piller med en förändring, t.ex. "↘ −0,4 kg senaste veckan". Tonas mjukt grönt bara när
 * riktningen är den användaren vill – annars neutralt. Aldrig rött.
 */
export function ChangePill({
  change,
  suffix,
  good,
  unit = 'kg',
  decimals = 1,
  className,
}: {
  change: number
  suffix?: ReactNode
  good?: 'up' | 'down'
  unit?: string
  decimals?: number
  className?: string
}) {
  const dir = directionOf(change, unit === 'kg' ? 0.05 : 0.1)
  const Icon = ICONS[dir]
  const isGood = good !== undefined && dir === good
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8125rem] font-semibold tabular-nums',
        isGood ? 'bg-mossa-soft text-good' : 'bg-surface-2 text-ink-2',
        className,
      )}
    >
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
      <span className="sr-only">{WORDS[dir]}</span>
      {formatSignedKg(change, decimals, unit)}
      {suffix !== undefined && <span className="font-medium text-ink-3">{suffix}</span>}
    </span>
  )
}

/**
 * Byt målet till "behålla vikten" med ett tryck (med Ångra). Används när viktmålet är pausat
 * (låg vikt) eller målvikten är nådd – under Vikt och på Idag.
 */
export function SwitchToMaintainButton({ className = 'mt-3' }: { className?: string }) {
  const onClick = () => {
    const { profile, updateProfile } = useProfileStore.getState()
    if (!profile || profile.goal === 'behalla') return
    const previous = profile.goal
    updateProfile({ goal: 'behalla' })
    toast('Målet är nu att behålla vikten', {
      tone: 'success',
      action: { label: 'Ångra', onClick: () => useProfileStore.getState().updateProfile({ goal: previous }) },
    })
  }
  return (
    <Button variant="soft" size="sm" iconLeft={Scale} onClick={onClick} className={className}>
      Byt till att behålla vikten
    </Button>
  )
}

/** Länkar till stöd vid oro kring mat, vikt och kropp. */
export function SupportLinks() {
  return (
    <>
      <ExternalLink href="https://www.1177.se/" className="font-semibold text-gran underline underline-offset-2">
        1177
      </ExternalLink>{' '}
      och{' '}
      <ExternalLink href="https://www.friskfri.se" className="font-semibold text-gran underline underline-offset-2">
        Frisk &amp; Fri
      </ExternalLink>
    </>
  )
}
