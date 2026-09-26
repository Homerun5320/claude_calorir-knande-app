/**
 * Mjuk, återhållsam entré för sektionerna på Idag – en liten fjädrande förskjutning i tur och ordning.
 * Vid reducerad rörelse visas allt direkt. Tomma sektioner döljs (`empty:hidden`) så att
 * mellanrummen i layouten stämmer även när ett kort inte har något att visa.
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

export function Reveal({ index = 0, className = '', children }: { index?: number; className?: string; children?: ReactNode }) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      className={`empty:hidden ${className}`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30, delay: Math.min(index, 10) * 0.035 }}
    >
      {children}
    </motion.div>
  )
}
