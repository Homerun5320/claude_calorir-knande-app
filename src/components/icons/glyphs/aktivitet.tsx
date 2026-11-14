import {
  Apple,
  Axe,
  Baby,
  Beer,
  Bike,
  Broom,
  Coffee,
  Compass,
  Dog,
  Droplets,
  Dumbbell,
  FishingRod,
  Flame,
  Flower,
  Footprints,
  House,
  Leaf,
  Moon,
  MountainSnow,
  Package,
  Paintbrush,
  RefreshCw,
  Sailboat,
  ShoppingCart,
  Shovel,
  Snowflake,
  Sparkles,
  Star,
  TreePine,
  Volleyball,
  Waves,
} from 'lucide-react'
import type { GlyphDef } from '../Glyph'

/** Mjuk fyllning (duoton) och samma utan kontur. */
const S = { fill: 'currentColor', fillOpacity: 0.18 } as const
const N = { ...S, stroke: 'none' } as const

/**
 * Ikoner för träning, sport, vardagsaktiviteter och drycker. Lucide där den passar, annars egen ritning
 * på 24×24-rutnätet (se Glyph.tsx). Människor är ett huvud och streck, utan ansikten.
 */
export const AKTIVITET: Record<string, GlyphDef> = {
  // Drycker
  '☕': { icon: Coffee },
  '🍺': { icon: Beer },
  '🫖': {
    draw: (
      <>
        <path {...S} d="M5 11c0-3 3-4 6-4s6 1 6 4v4c0 3-3 4-6 4s-6-1-6-4z" />
        <path d="M17 11l4-3" />
        <path d="M5 10c-3.5 0-3.5 6 .5 6" />
        <path d="M9.5 4.5h3" />
      </>
    ),
  },
  '🌙': { icon: Moon },
  '🍏': { icon: Apple },
  '🥃': {
    draw: (
      <>
        <path {...S} d="M6 4h12l-1 16H7z" />
        <path d="M6.5 11h11" />
      </>
    ),
  },

  // Allmänt
  '✨': { icon: Sparkles },
  '👟': { icon: Footprints },
  '⭐': { icon: Star },
  '🔥': { icon: Flame },
  '🔄': { icon: RefreshCw },
  '🧭': { icon: Compass },
  '💪': { icon: Dumbbell },

  // Människor i rörelse
  '🏃': {
    draw: (
      <>
        <circle {...S} cx="15" cy="4.5" r="2" />
        <path d="M13.5 8l-2 6 3 2-1 5" />
        <path d="M14 9l3.5 2.5M13 9l-4 1.5-2-1.5" />
        <path d="M11.5 14l-4 2.5-2 3.5" />
      </>
    ),
  },
  '🚶': {
    draw: (
      <>
        <circle {...S} cx="13" cy="4.5" r="2" />
        <path d="M13 8l-1 6" />
        <path d="M13 9l-3 3M13 9l3 3" />
        <path d="M12 14l-2.5 6.5M12 14l3 3.5v3.5" />
      </>
    ),
  },
  '🧘': {
    draw: (
      <>
        <ellipse {...N} cx="12" cy="17.5" rx="8" ry="3" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 8.5V15" />
        <path d="M5.5 14l3.5-4 3-1 3 1 3.5 4" />
        <path d="M4 18.5c3-3 6-3 8-1 2-2 5-2 8 1" />
      </>
    ),
  },
  '🏋️': {
    draw: (
      <>
        <path {...S} d="M10 10h4l-1 6h-2z" />
        <path d="M2.5 5h19M4.5 3v4M19.5 3v4" />
        <circle cx="12" cy="7.5" r="2" />
        <path d="M8 5l2 5M16 5l-2 5" />
        <path d="M11 16l-1 5M13 16l1 5" />
      </>
    ),
  },
  '🏊': {
    draw: (
      <>
        <circle {...S} cx="17" cy="7.5" r="2" />
        <path d="M4 12c3-5 7-6 10-3l1.5 1.5" />
        <path d="M3 16c2-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
        <path d="M3 20.5c2-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" />
      </>
    ),
  },
  '💃': {
    draw: (
      <>
        <circle {...S} cx="12" cy="4.5" r="2" />
        <path {...S} d="M12 8l-5 10h10z" />
        <path d="M12 9L7 6M12 9l5 3" />
        <path d="M10 18l-.5 3.5M14 18l1.5 3" />
      </>
    ),
  },
  '🕺': {
    draw: (
      <>
        <circle {...S} cx="11" cy="4.5" r="2" />
        <path d="M11 8v6" />
        <path d="M11 9l5.5-5M11 9l-4.5 3.5" />
        <path d="M11 14l-3 7M11 14l4.5 3-1 4" />
      </>
    ),
  },
  '🤸': {
    draw: (
      <>
        <circle {...S} cx="12" cy="4.5" r="2" />
        <path d="M12 8v6M12 9.5L7.5 11M12 9.5l4.5 1.5M12 14l-3 4.5M12 14l3 4.5" />
        <path d="M7.5 11C2 22 22 22 16.5 11" />
      </>
    ),
  },
  '🧗': {
    draw: (
      <>
        <rect {...N} x="17" y="3" width="4" height="18" />
        <path d="M17 3v18" />
        <circle {...S} cx="10" cy="5.5" r="2" />
        <path d="M10 8.5v5.5" />
        <path d="M10 9.5l7-4M10 9.5l-3.5 3" />
        <path d="M10 14l7 1M10 14l-3.5 5.5" />
      </>
    ),
  },
  '🤾': {
    draw: (
      <>
        <circle {...S} cx="18" cy="5" r="2.5" />
        <circle cx="9" cy="5" r="2" />
        <path d="M9 8l1 6" />
        <path d="M9.5 9l5-3M9.5 9L5.5 11" />
        <path d="M10 14l-3 6.5M10 14l4.5 2.5L14 21" />
      </>
    ),
  },
  '🚴': {
    draw: (
      <>
        <circle {...S} cx="5.5" cy="17.5" r="3.5" />
        <circle {...S} cx="18.5" cy="17.5" r="3.5" />
        <circle cx="14" cy="4.5" r="2" />
        <path d="M5.5 17.5l5-6 3 6M10.5 11.5l3-4 3.5 4.5M13.5 17.5l5-0" />
      </>
    ),
  },
  '🚵': {
    draw: (
      <>
        <path {...N} d="M2 12L7 4l5 8z" />
        <path d="M2 12L7 4l5 8" />
        <path d="M10.5 9.5l3-3 3.5 5.5" />
        <circle {...S} cx="6" cy="18" r="3" />
        <circle {...S} cx="18" cy="18" r="3" />
        <path d="M6 18l4.5-5 3 5h4.5M10.5 13h5" />
      </>
    ),
  },
  '🚲': { icon: Bike },
  '🚣': {
    draw: (
      <>
        <path {...S} d="M2.5 15h19c-1 4-4 5-9.500 5S3.500 19 2.500 15z" />
        <circle cx="10" cy="5" r="2" />
        <path d="M10 8l1.500 6M10.500 10l5 2.500" />
        <path d="M4 8l17 8" />
      </>
    ),
  },
  '🏄': {
    draw: (
      <>
        <path {...S} d="M2.500 20c6-2 13-2 19 0-6 2-13 2-19 0z" />
        <circle cx="11" cy="4.500" r="2" />
        <path d="M11 8v6M11 14l-2 5M11 14l2 5" />
        <path d="M11 9.500l-3 2.500M11 9.500l5 1.500" />
        <path d="M18 4l-2.500 13" />
      </>
    ),
  },

  // Bollsport och racket
  '⚽': {
    draw: (
      <>
        <circle {...S} cx="12" cy="12" r="9" />
        <path d="M12 8.500l3.200 2.300L14 14.500h-4l-1.200-3.700z" />
        <path d="M12 8.500V3.300M15.200 10.800L20 9.300M14 14.500l3 4.200M10 14.500l-3 4.200M8.800 10.800L4 9.300" />
      </>
    ),
  },
  '🏀': {
    draw: (
      <>
        <circle {...S} cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18M5.600 5.600c2.500 4 2.500 8.800 0 12.800M18.400 5.600c-2.500 4-2.500 8.800 0 12.800" />
      </>
    ),
  },
  '🏐': { icon: Volleyball },
  '🎾': {
    draw: (
      <>
        <path {...S} d="M12 2.500c4.500 0 7 2.800 7 6.500 0 4-3.500 7-7 7s-7-3-7-7c0-3.700 2.500-6.500 7-6.500z" />
        <path d="M12 16v5.500" />
        <path d="M9.500 7h.01M14.500 7h.01M12 10.500h.01" />
      </>
    ),
  },
  '🏸': {
    draw: (
      <>
        <ellipse {...S} cx="8.500" cy="9.500" rx="4" ry="5.500" transform="rotate(-45 8.500 9.500)" />
        <path d="M12.500 13.500L19 20" />
        <circle {...S} cx="19" cy="5" r="1.800" />
        <path d="M17.600 6.400L14.500 9.500" />
      </>
    ),
  },
  '🏓': {
    draw: (
      <>
        <circle {...S} cx="10" cy="10" r="6.500" />
        <path d="M14.600 14.600l4.400 4.400" />
        <circle {...S} cx="19" cy="5" r="1.800" />
      </>
    ),
  },
  '⛳': {
    draw: (
      <>
        <path {...S} d="M8 3l9 3.500L8 10z" />
        <path d="M8 3v17" />
        <path d="M3.500 21h17" />
        <circle cx="15.500" cy="18.800" r="1.400" />
      </>
    ),
  },
  '🏑': {
    draw: (
      <>
        <circle {...S} cx="18" cy="14" r="3" />
        <path d="M5 3l7.500 14c.8 1.500 2 2 3.500 2" />
        <path d="M17 13h.01M19 13.500h.01M17.500 15.500h.01" />
      </>
    ),
  },
  '🏒': {
    draw: (
      <>
        <ellipse {...S} cx="17" cy="20" rx="3.500" ry="1.500" />
        <path d="M18 3l-8 14c-.8 1.500-2 2-4 2" />
      </>
    ),
  },
  '🥏': {
    draw: (
      <>
        <ellipse {...S} cx="12" cy="12.500" rx="9.500" ry="4" transform="rotate(-18 12 12.500)" />
        <path d="M7 12.500c3 2 7 1.500 10-.5" />
      </>
    ),
  },
  '🪵': {
    draw: (
      <>
        <rect {...S} x="3.500" y="7" width="17" height="10" rx="2.500" />
        <ellipse cx="6.500" cy="12" rx="2.500" ry="5" />
        <path d="M6.500 10.500c.8.800.8 2.200 0 3" />
        <path d="M12 9.500h5M12 14.500h4" />
      </>
    ),
  },

  // Kampsport
  '🥊': {
    draw: (
      <>
        <path
          {...S}
          d="M7 10c0-4 2-6 6-6h1.500C17 4 19 6 19 9v6c0 2-1 3.500-3 3.500h-6C8 18.500 7 17 7 15z"
        />
        <path d="M8.500 18.500V22h8v-3.500" />
        <path d="M7 11h3.500c1 0 1.500.800 1.500 1.700" />
      </>
    ),
  },
  '🥋': {
    draw: (
      <>
        <path {...S} d="M9 3l3 5 3-5 6 4-3 5-2-2v11H8V10l-2 2-3-5z" />
        <path d="M8 15.500h8" />
      </>
    ),
  },

  // Vinter
  '⛷️': {
    draw: (
      <>
        <path {...N} d="M3 17l17 4H3z" />
        <circle {...S} cx="14" cy="4.500" r="2" />
        <path d="M3 17l17 4" />
        <path d="M13 8l-2.500 5 4 2-.500 3.500" />
        <path d="M13 9l4 1.500 1 8" />
        <path d="M10.500 13L8 16.500" />
      </>
    ),
  },
  '🎿': {
    draw: (
      <>
        <path d="M2.500 18.500l16-5.500q2.500-.8 3 .5M2.500 22l16-5.500q2.500-.8 3 .5" />
        <path d="M7 3l2.500 14M14 3l-1 9" />
      </>
    ),
  },
  '🏂': {
    draw: (
      <g transform="rotate(-28 12 12)">
        <rect {...S} x="1.500" y="10" width="21" height="4.500" rx="2.250" />
        <path d="M8.500 7.500v9.500M15.500 7.500v9.500" />
      </g>
    ),
  },
  '⛸️': {
    draw: (
      <>
        <path {...S} d="M6 3h5v6.500c0 1.500 1 2.500 3 3l5 1V17H6z" />
        <path d="M3.500 20.500h17" />
        <path d="M8 17v3.500M16.500 17v3.500" />
      </>
    ),
  },
  '🛼': {
    draw: (
      <>
        <path {...S} d="M6 3h5v6.500c0 1.500 1 2.500 3 3l5 1V17H6z" />
        <circle cx="8" cy="20" r="1.700" />
        <circle cx="12.500" cy="20" r="1.700" />
        <circle cx="17" cy="20" r="1.700" />
      </>
    ),
  },
  '❄️': { icon: Snowflake },
  '🛷': {
    draw: (
      <>
        <rect {...N} x="6" y="8.500" width="11" height="8.500" />
        <path d="M5 8.500h13M7 8.500V17M16 8.500V17" />
        <path d="M2.500 18.500h15.500q3 0 3-3" />
      </>
    ),
  },
  '🎣': { icon: FishingRod },

  // Friluftsliv
  '🌲': { icon: TreePine },
  '🥾': {
    draw: (
      <>
        <path {...S} d="M6 3h6v6.500l5.500 2.500c2 .800 2.500 2 2.500 4v2.500H6z" />
        <path d="M5 21h16" />
        <path d="M9 6.500h3M9 9.500h3" />
      </>
    ),
  },
  '🏔️': { icon: MountainSnow },
  '🐎': {
    draw: (
      <>
        <path
          {...S}
          d="M7 21c-.500-6 0-11 4.500-14.500L15 3l.5 3 5 4.500-.5 2.500c-2 .800-3 .300-4-.800l-2 1c-.500 3 0 5.500 1 8z"
        />
        <path d="M11.500 6.500C9.500 9 9 13 9.500 16" />
        <path d="M16.500 8h.01" />
      </>
    ),
  },
  '🌊': { icon: Waves },
  '💦': { icon: Droplets },
  '🛶': {
    draw: (
      <>
        <path {...S} d="M2 12.500c6 1 14 1 20 0-1.500 4.500-5 6-10 6s-8.500-1.500-10-6z" />
        <path d="M17.500 3L9.500 15.500" />
        <path d="M17 3l3 2-2 2.500M9.500 15.500l-3-1.500 1.500-3" />
      </>
    ),
  },
  '⛵': { icon: Sailboat },
  '🌼': { icon: Flower },

  // Hem och arbete
  '🏡': { icon: House },
  '🐕': { icon: Dog },
  '👶': { icon: Baby },
  '🪜': {
    draw: (
      <>
        <rect {...N} x="7.500" y="3" width="9" height="18" />
        <path d="M7.500 3v18M16.500 3v18M7.500 7h9M7.500 11.500h9M7.500 16h9" />
      </>
    ),
  },
  '🧹': { icon: Broom },
  '🪟': {
    draw: (
      <>
        <rect {...S} x="4" y="3" width="16" height="18" rx="2" />
        <path d="M12 3v18M4 12h16" />
      </>
    ),
  },
  '🛒': { icon: ShoppingCart },
  '🧸': {
    draw: (
      <>
        <circle {...S} cx="7.500" cy="5" r="2.200" />
        <circle {...S} cx="16.500" cy="5" r="2.200" />
        <circle {...S} cx="12" cy="9.500" r="5" />
        <ellipse {...S} cx="12" cy="18.500" rx="5.500" ry="3.500" />
        <path d="M12 10.500h.01" />
      </>
    ),
  },
  '📦': { icon: Package },
  '🍂': { icon: Leaf },
  '⛏️': { icon: Shovel },
  '🪓': { icon: Axe },
  '🖌️': { icon: Paintbrush },
}
