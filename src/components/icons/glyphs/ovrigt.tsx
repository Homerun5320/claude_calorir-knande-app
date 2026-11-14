import {
  CalendarDays,
  Check,
  Clock,
  HeartHandshake,
  Landmark,
  PartyPopper,
  Pencil,
  Search,
  Stethoscope,
  X,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { GlyphDef } from '../Glyph'

const SOFT = { fill: 'currentColor', fillOpacity: 0.18, stroke: 'none' } as const
const EYES = 'M9 10h.01M15 10h.01'

/** Ansikte: mjuk fylld cirkel med linjer ovanpå. */
function face(parts: ReactNode): GlyphDef {
  return {
    draw: (
      <>
        <circle cx="12" cy="12" r="10" {...SOFT} />
        <circle cx="12" cy="12" r="10" />
        {parts}
      </>
    ),
  }
}

export const OVRIGT: Record<string, GlyphDef> = {
  // Mående, från tungt till toppen
  '😞': face(
    <>
      <path d={EYES} strokeWidth={2.6} />
      <path d="M8.5 17q3.5-3.2 7 0" />
    </>,
  ),
  '😕': face(
    <>
      <path d={EYES} strokeWidth={2.6} />
      <path d="M8 7.2l2.6-.9" />
      <path d="M8.5 16.5l7-1.5" />
    </>,
  ),
  '😐': face(
    <>
      <path d={EYES} strokeWidth={2.6} />
      <path d="M8.5 15.5h7" />
    </>,
  ),
  '🙂': face(
    <>
      <path d={EYES} strokeWidth={2.6} />
      <path d="M8.5 14q3.5 3 7 0" />
    </>,
  ),
  '😄': {
    draw: (
      <>
        <circle cx="12" cy="12" r="10" {...SOFT} />
        <circle cx="12" cy="12" r="10" />
        <path d="M8.5 9.5h.01M15.5 9.5h.01" strokeWidth={2.6} />
        <path d="M7 13.5h10a5 5 0 0 1-10 0z" fill="currentColor" fillOpacity={0.3} />
      </>
    ),
  },
  '😊': face(
    <>
      <path d="M7.5 10.5q1.5-2 3 0M13.5 10.5q1.5-2 3 0" />
      <path d="M8.5 14.5q3.5 3 7 0" />
    </>,
  ),
  '😌': face(
    <>
      <path d="M7.5 10q1.5 1.8 3 0M13.5 10q1.5 1.8 3 0" />
      <path d="M9.5 15q2.5 1.8 5 0" />
    </>,
  ),
  '😋': face(
    <>
      <path d={EYES} strokeWidth={2.6} />
      <path d="M8 14q4 3.5 8 0" />
      <path d="M12.5 16.6v1a1.6 1.6 0 0 0 3.2 0v-2" fill="currentColor" fillOpacity={0.3} />
    </>,
  ),
  '🪫': {
    draw: (
      <>
        <rect x="2.5" y="7.5" width="17" height="9" rx="2.5" {...SOFT} />
        <rect x="2.5" y="7.5" width="17" height="9" rx="2.5" />
        <path d="M22 10.5v3" />
        <path d="M6 11v2" />
      </>
    ),
  },

  // Symboler
  '✕': { icon: X },
  '✓': { icon: Check },
  '✎': { icon: Pencil },
  '🔎': { icon: Search },
  '🩺': { icon: Stethoscope },
  '🏛️': { icon: Landmark },
  '📅': { icon: CalendarDays },
  '⚡': { icon: Zap },
  '🕰️': { icon: Clock },
  '🎉': { icon: PartyPopper },
  '🫶': { icon: HeartHandshake },
  '💚': {
    draw: (
      <>
        <path
          d="M12 20.5s-8.5-5-8.5-11A4.7 4.7 0 0 1 12 6.8a4.7 4.7 0 0 1 8.5 2.7c0 6-8.5 11-8.5 11z"
          {...SOFT}
        />
        <path d="M12 20.5s-8.5-5-8.5-11A4.7 4.7 0 0 1 12 6.8a4.7 4.7 0 0 1 8.5 2.7c0 6-8.5 11-8.5 11z" />
      </>
    ),
  },

  // Matlåda (bento)
  '🍱': {
    draw: (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="3" {...SOFT} />
        <rect x="2.5" y="5" width="19" height="14" rx="3" />
        <path d="M10 5v14M10 12h11.5" />
        <circle cx="6.2" cy="12" r="1.6" />
      </>
    ),
  },

  // Burk
  '🥫': {
    draw: (
      <>
        <path d="M5.5 6h13v12a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3z" {...SOFT} />
        <ellipse cx="12" cy="5.5" rx="6.5" ry="2" />
        <path d="M5.5 5.5V18a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3V5.5" />
        <path d="M9 11h6M9 15h6" />
      </>
    ),
  },
}
