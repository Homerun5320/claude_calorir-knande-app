/**
 * Varje emoji som finns i koden ska ha en egen ikon i registret – inga emojis ritas som text (se Glyph.tsx).
 * Emoji-tecknen är nycklar i data (recept, aktiviteter, kalenderdagar …); här kontrolleras att inget saknas.
 */
import { describe, expect, it } from 'vitest'
import { findEmoji } from '../../lib/emoji'
import { glyphKey, hasGlyph } from './Glyph'
import { GLYPHS } from './registry'

/** All källkod utom tester, som text (Vite läser filerna; inga Node-typer behövs). */
const SOURCES = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/**/*.test.ts', '!/src/**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('ikoner i stället för emojis', () => {
  it('varje emoji i koden har en ikon', () => {
    const missing = new Map<string, string[]>()
    for (const [file, text] of Object.entries(SOURCES)) {
      // Ikonerna själva (nycklarna) och emoji-hjälpen (mönstret) får innehålla tecknen.
      if (file.includes('/components/icons/') || file.endsWith('/lib/emoji.ts')) continue
      for (const e of findEmoji(text)) {
        if (!hasGlyph(e)) missing.set(glyphKey(e), [...(missing.get(glyphKey(e)) ?? []), file.slice('/src/'.length)])
      }
    }
    expect([...missing.entries()].map(([e, files]) => `${e} (${[...new Set(files)].slice(0, 2).join(', ')})`)).toEqual([])
  })

  it('registret har inga tomma eller dubbla ikoner', () => {
    for (const [key, def] of Object.entries(GLYPHS)) {
      expect(key.length).toBeGreaterThan(0)
      expect('icon' in def || 'draw' in def).toBe(true)
    }
  })
})
