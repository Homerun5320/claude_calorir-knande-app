/**
 * Registret över Lagoms ikoner: emoji-tecknet (utan U+FE0F) → ikon. Grupperna ligger i egna filer under
 * `glyphs/` (mat, aktiviteter, kalender, mående och symboler). Se Glyph.tsx.
 */
import type { GlyphDef } from './Glyph'
import { AKTIVITET } from './glyphs/aktivitet'
import { KALENDER } from './glyphs/kalender'
import { MAT } from './glyphs/mat'
import { OVRIGT } from './glyphs/ovrigt'

const strip = (record: Record<string, GlyphDef>): Record<string, GlyphDef> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k.replace(/️/g, ''), v]))

export const GLYPHS: Record<string, GlyphDef> = {
  ...strip(MAT),
  ...strip(AKTIVITET),
  ...strip(KALENDER),
  ...strip(OVRIGT),
}
