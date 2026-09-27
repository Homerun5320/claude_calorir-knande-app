/**
 * Dagens tips – ett kort, vänligt råd som följer årstiden. Kan döljas för resten av dagen.
 */
import { memo, useMemo, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { Card, IconButton, toast } from '../../components/ui'
import { TIP_CATEGORIES, tipForDate } from '../../data/tips'
import { SEASONS, swedishSeason } from '../../lib/season'
import type { ISODate } from '../../types'
import { focusAfterRender, focusableNear } from '../diary/focus'
import { useDismissedForDay } from './hooks'

const STORAGE_KEY = 'lagom-idag-tips-dolt'

export const TipCard = memo(function TipCard({ today }: { today: ISODate }) {
  const reduce = useReducedMotion() ?? false
  const [dismissed, dismiss, restore] = useDismissedForDay(STORAGE_KEY, today)
  const tip = useMemo(() => tipForDate(today), [today])
  const season = SEASONS[swedishSeason(today)]
  const seasonal = tip.seasons !== undefined || tip.months !== undefined
  const category = TIP_CATEGORIES[tip.category]

  const cardRef = useRef<HTMLDivElement>(null)

  const onDismiss = () => {
    // Kortet (och knappen) försvinner – ge fokus till det som kommer efter, inte till <body>.
    const next = focusableNear(cardRef.current)
    dismiss()
    focusAfterRender(() => next)
    toast('Tipset är dolt till imorgon', { action: { label: 'Ångra', onClick: restore } })
  }

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          ref={cardRef}
          key="tip"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        >
          <Card
            tone="sol"
            eyebrow={seasonal ? `Dagens tips · ${season.label} ${season.emoji}` : `Dagens tips · ${category.label}`}
            title={tip.title}
            titleAs="h2"
            action={<IconButton icon={X} size="sm" aria-label="Dölj dagens tips" onClick={onDismiss} />}
          >
            <div className="flex gap-3">
              <span className="text-2xl leading-none" aria-hidden="true">
                {category.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-[0.9375rem] leading-relaxed text-ink-2">{tip.text}</p>
                {tip.source && <p className="mt-2 text-xs text-ink-3">Källa: {tip.source}</p>}
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  )
})
