/**
 * Ikoner för kalendern: matdagar, säsonger, högtider och välkomsttexter. Egna ritningar följer familjens stil
 * (2 px linje, en mjuk fyllning med `fillOpacity` 0,18), Lucide används där den passar. Se Glyph.tsx.
 */
import { Carrot, CakeSlice, Crown, Fish, Heart, LeafyGreen, Recycle, Sprout, Sunrise, Leaf } from 'lucide-react'
import type { GlyphDef } from '../Glyph'

const SOFT = { fill: 'currentColor', fillOpacity: 0.18, stroke: 'none' } as const

export const KALENDER: Record<string, GlyphDef> = {
  '🥕': { icon: Carrot },
  // Potatis: knölig oval med två ögon
  '🥔': {
    draw: (
      <>
        <path d="M5 11c0-4 4-6 8-6s7 3 6 7-4 7-8 7-6-4-6-8z" {...SOFT} />
        <path d="M5 11c0-4 4-6 8-6s7 3 6 7-4 7-8 7-6-4-6-8z" />
        <path d="M9.5 10.5h.01M14 13.5h.01M12.5 9h.01" />
      </>
    ),
  },
  // Blåbär: tre bär med kronor
  '🫐': {
    draw: (
      <>
        <circle cx="8" cy="14" r="4.5" {...SOFT} />
        <circle cx="16" cy="14" r="4.5" {...SOFT} />
        <circle cx="12" cy="7.5" r="4" {...SOFT} />
        <circle cx="8" cy="14" r="4.5" />
        <circle cx="16" cy="14" r="4.5" />
        <circle cx="12" cy="7.5" r="4" />
        <path d="M8 13.2v1.6M16 13.2v1.6M12 6.7v1.6" />
      </>
    ),
  },
  '🐟': { icon: Fish },
  '🌱': { icon: Sprout },
  '🍰': { icon: CakeSlice },
  // Jordgubbe: hjärtliknande bär med blad och frön
  '🍓': {
    draw: (
      <>
        <path d="M4.5 9c0-1.5 2-2.5 7.5-2.5S19.5 7.5 19.5 9c0 5-4 11-7.5 11S4.5 14 4.5 9z" {...SOFT} />
        <path d="M4.5 9c0-1.5 2-2.5 7.5-2.5S19.5 7.5 19.5 9c0 5-4 11-7.5 11S4.5 14 4.5 9z" />
        <path d="M9 6.5 12 3l3 3.5" />
        <path d="M9 11h.01M12.5 10.500h.01M15 13h.01M10.5 15h.01M13 16.500h.01" />
      </>
    ),
  },
  // Gurka: lång, lätt vriden form med fläckar
  '🥒': {
    draw: (
      <>
        <rect x="1" y="8" width="22" height="8" rx="4" transform="rotate(-35 12 12)" {...SOFT} />
        <rect x="1" y="8" width="22" height="8" rx="4" transform="rotate(-35 12 12)" />
        <path d="M9.5 14.5h.01M12.5 12h.01M15 9.5h.01M7 17h.01M17.5 7h.01" />
      </>
    ),
  },
  // Lök: runt med spets och rötter
  '🧅': {
    draw: (
      <>
        <path d="M12 6c5 3 7 6 7 9a7 6 0 0 1-14 0c0-3 2-6 7-9z" {...SOFT} />
        <path d="M12 6c5 3 7 6 7 9a7 6 0 0 1-14 0c0-3 2-6 7-9z" />
        <path d="M12 6V3M12 6c-2.5 3-3 6-3 12M12 6c2.5 3 3 6 3 12" />
      </>
    ),
  },
  '🌿': { icon: Leaf },
  // Ärtor: balja med tre ärtor
  '🫛': {
    draw: (
      <>
        <path d="M3.5 17C3 9 9 4 20.5 5c1 11-5 16-17 12z" {...SOFT} />
        <path d="M3.5 17C3 9 9 4 20.5 5c1 11-5 16-17 12z" />
        <circle cx="8.5" cy="13.5" r="1.2" />
        <circle cx="12" cy="11" r="1.2" />
        <circle cx="15.5" cy="8.5" r="1.2" />
      </>
    ),
  },
  '🥬': { icon: LeafyGreen },
  // Rädisa: rött klot med blast
  '🔴': {
    draw: (
      <>
        <circle cx="12" cy="14" r="6.5" {...SOFT} />
        <circle cx="12" cy="14" r="6.5" />
        <path d="M12 7.500C11 5 9 4 7.5 4M12 7.500c1-2.5 3-3.5 4.5-3.500M12 20.500v1.5" />
      </>
    ),
  },
  // Pumpa
  '🎃': {
    draw: (
      <>
        <path d="M12 7c-5-1-9 2-9 6.500S7 20 12 20s9-2 9-6.500S17 6 12 7z" {...SOFT} />
        <path d="M12 7c-5-1-9 2-9 6.500S7 20 12 20s9-2 9-6.500S17 6 12 7z" />
        <path d="M12 7c-2 3-2 9 0 13M12 7c2 3 2 9 0 13" />
        <path d="M12 7c0-1.5.5-3 2.5-4" />
      </>
    ),
  },
  // Plommon: runt med skåra och skaft
  '🟣': {
    draw: (
      <>
        <circle cx="12" cy="13.5" r="7" {...SOFT} />
        <circle cx="12" cy="13.5" r="7" />
        <path d="M12 6.500c0-1.5 1-3 3-3.500M12 8.500c-1.5 2.5-1.5 7 0 10" />
      </>
    ),
  },
  // Krusbär: bär med ränder och krona
  '🟢': {
    draw: (
      <>
        <circle cx="12" cy="13" r="7" {...SOFT} />
        <circle cx="12" cy="13" r="7" />
        <path d="M12 6v14M8.5 8c-1.5 3.5-1.5 7 0 10M15.5 8c1.5 3.5 1.5 7 0 10" />
        <path d="M10 3.5 12 6l2-2.5" />
      </>
    ),
  },
  // Hjortron: klase av små bär med blad
  '🟠': {
    draw: (
      <>
        <circle cx="8.5" cy="12" r="4" {...SOFT} />
        <circle cx="15.5" cy="12" r="4" {...SOFT} />
        <circle cx="12" cy="18" r="3.5" {...SOFT} />
        <circle cx="8.5" cy="12" r="4" />
        <circle cx="15.5" cy="12" r="4" />
        <path d="M9.5 15.5a3.5 3.5 0 1 0 5 0" />
        <path d="M12 8.500c0-2.5 1.5-4.5 4-5" />
      </>
    ),
  },
  // Kräfta: kropp, två stora klor och svansfläkt
  '🦞': {
    draw: (
      <>
        <ellipse cx="12" cy="12.5" rx="3.5" ry="5" {...SOFT} />
        <circle cx="5.5" cy="5.5" r="2.5" {...SOFT} />
        <circle cx="18.5" cy="5.5" r="2.5" {...SOFT} />
        <ellipse cx="12" cy="12.5" rx="3.5" ry="5" />
        <circle cx="5.5" cy="5.5" r="2.5" />
        <circle cx="18.5" cy="5.5" r="2.5" />
        <path d="M9 10 7 7.500M15 10l2-2.5" />
        <path d="M8.5 17.5 7.5 21h9l-1-3.5" />
        <path d="M9 13.500H4.500M15 13.500h4.5" />
      </>
    ),
  },
  // Ostron: skal med pärla
  '🦪': {
    draw: (
      <>
        <path d="M3 14c0-5 4-9 9-9s9 4 9 9c0 3-4 5-9 5s-9-2-9-5z" {...SOFT} />
        <path d="M3 14c0-5 4-9 9-9s9 4 9 9c0 3-4 5-9 5s-9-2-9-5z" />
        <path d="M12 5v6M7.5 6.5 9 11M16.5 6.5 15 11" />
        <circle cx="12" cy="15" r="1.5" />
      </>
    ),
  },
  '🌅': { icon: Sunrise },
  // Julgran
  '🎄': {
    draw: (
      <>
        <path d="M12 3 6 11h3l-4 6h14l-4-6h3z" {...SOFT} />
        <path d="M12 3 6 11h3l-4 6h14l-4-6h3z" />
        <path d="M12 17v4" />
        <path d="M10.5 9.500h.01M14 14h.01" />
      </>
    ),
  },
  '❤️': { icon: Heart },
  // Tunnbröd: rund kaka med mönster
  '🫓': {
    draw: (
      <>
        <circle cx="12" cy="12" r="9" {...SOFT} />
        <circle cx="12" cy="12" r="9" />
        <path d="M8 9h.01M14 8h.01M16 13h.01M10 14h.01M13 16.500h.01M7.5 13.500h.01" />
      </>
    ),
  },
  // Ljus: låga och ljusstake
  '🕯️': {
    draw: (
      <>
        <rect x="8" y="11" width="8" height="10" rx="1.5" {...SOFT} />
        <rect x="8" y="11" width="8" height="10" rx="1.5" />
        <path d="M12 11V9.5" />
        <path d="M12 3c2 2 3 3.5 3 5a3 3 0 0 1-6 0c0-1.5 1-3 3-5z" />
      </>
    ),
  },
  // Kyckling: kyckling som kläcks ur ägg
  '🐣': {
    draw: (
      <>
        <path d="M5 13c0-4.5 3-8 7-8s7 3.5 7 8c0 .5 0 1-.1 1.500L16.5 13l-2 2-2.5-2-2.5 2-2-2-2.4 1.500C5 14 5 13.5 5 13z" {...SOFT} />
        <path d="M5 14.500C5 18 8 21 12 21s7-3 7-6.5" />
        <path d="M5.1 14.5 7.5 13l2 2 2.5-2 2.5 2 2-2 2.4 1.5" />
        <path d="M5 13c0-4.5 3-8 7-8s7 3.5 7 8" />
        <path d="M12 9h.01" />
      </>
    ),
  },
  // Tulpan
  '🌷': {
    draw: (
      <>
        <path d="M6.5 5c0 6 1.5 9 5.5 9s5.5-3 5.5-9l-3 2-2.5-3.500L9.5 7z" {...SOFT} />
        <path d="M6.5 5c0 6 1.5 9 5.5 9s5.5-3 5.5-9l-3 2-2.5-3.500L9.5 7z" />
        <path d="M12 14v7M12 18c-2.5 0-4-1.5-4-3.500M12 17.500c2.5 0 4-1 4-3" />
      </>
    ),
  },
  // Bukett: tre blommor och inslagning
  '💐': {
    draw: (
      <>
        <path d="M5.5 13h13L12 21z" {...SOFT} />
        <path d="M5.5 13h13L12 21z" />
        <circle cx="12" cy="5.5" r="2.5" {...SOFT} />
        <circle cx="12" cy="5.5" r="2.5" />
        <circle cx="6.5" cy="8.5" r="2.5" />
        <circle cx="17.5" cy="8.5" r="2.5" />
        <path d="M12 8v5M7.5 11 10 13M16.5 11 14 13" />
      </>
    ),
  },
  '♻️': { icon: Recycle },
  '👑': { icon: Crown },
  // Gås: kropp, lång hals, huvud med näbb
  '🪿': {
    draw: (
      <>
        <path d="M4 15c0-3 3-4 6-4h5c2.5 0 4.5 1.5 4.5 4s-3 4.5-8 4.500S4 18.5 4 15z" {...SOFT} />
        <path d="M4 15c0-3 3-4 6-4h5c2.5 0 4.5 1.5 4.5 4s-3 4.5-8 4.500S4 18.5 4 15z" />
        <path d="M15 11c0-3-1-4-1-6.500a2.5 2.5 0 0 1 5 0" />
        <path d="M19 4.5 21.5 5.5 19 6.5" />
        <path d="M4 15 2.5 12.5" />
        <path d="M11 19.500v2M14 19.500v2" />
      </>
    ),
  },
  // Blått hjärta (Sveriges färger): hjärta med glans
  '💙': {
    draw: (
      <>
        <path d="M12 20S3 14.5 3 8.500A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.500C21 14.5 12 20 12 20z" {...SOFT} />
        <path d="M12 20S3 14.5 3 8.500A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.500C21 14.5 12 20 12 20z" />
        <path d="M6.5 9a2.5 2.5 0 0 1 2-2.5" />
      </>
    ),
  },
}

