/**
 * Lagoms egna ikoner i stället för emojis.
 *
 * Emojis ritas olika på varje plattform (Apple, Google, Samsung …), och Apples bilder är deras egna. Därför
 * lagras emoji-tecknet fortfarande som nyckel i data (recept, aktiviteter, kalenderdagar …), men det visas
 * aldrig som text: `<Glyph emoji="🥦" />` slår upp tecknet i registret (`GLYPHS`) och ritar en egen SVG-ikon,
 * eller en Lucide-ikon där den passar. Ikonen ärver textfärgen (`currentColor`) och följer teckenstorleken.
 *
 * - Ett tecken som saknas i registret ritas inte alls (aldrig som emoji). `glyph.test.ts` kräver att varje
 *   emoji i koden har en ikon.
 * - Egen SVG: ritad på ett 24×24-rutnät, `stroke="currentColor"`, 2 px linje, rundade ändar. En mjuk
 *   fyllning görs med `fill="currentColor" fillOpacity={0.18}` så att ikonerna ser ut som en familj.
 */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { GLYPHS } from './registry'

export type GlyphDef =
  /** En Lucide-ikon. */
  | { icon: LucideIcon }
  /** Egen SVG: innehållet i en 24×24-<svg> (path, circle, rect …). */
  | { draw: ReactNode }

/** Nyckeln utan emoji-variantväljaren (U+FE0F), så att "❤️" och "❤" ger samma ikon. */
export function glyphKey(emoji: string): string {
  return emoji.replace(/️/g, '')
}

export function hasGlyph(emoji: string): boolean {
  return glyphKey(emoji) in GLYPHS
}

export interface GlyphProps {
  /** Emoji-tecknet som nyckel, t.ex. "🥦". */
  emoji: string | undefined
  className?: string
  /** Linjetjocklek på 24-rutnätet (standard 2). */
  strokeWidth?: number
}

export function Glyph({ emoji, className = '', strokeWidth = 2 }: GlyphProps) {
  if (!emoji) return null
  const def = GLYPHS[glyphKey(emoji)]
  if (!def) return null
  // 1.15em: följer teckenstorleken som emojin gjorde (inklusive vid stor text).
  const cls = `inline-block size-[1.15em] shrink-0 align-[-0.2em] ${className}`
  if ('icon' in def) {
    const Icon = def.icon
    return <Icon data-glyph={glyphKey(emoji)} aria-hidden="true" focusable="false" className={cls} strokeWidth={strokeWidth} />
  }
  return (
    <svg
      data-glyph={glyphKey(emoji)}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cls}
    >
      {def.draw}
    </svg>
  )
}
