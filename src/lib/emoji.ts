/**
 * Emojis visas aldrig som text i Lagom (se components/icons/Glyph.tsx). Där en sträng ändå ska
 * ut som ren text – i en lista med val, en sidtitel eller en delad text – tas tecknet bort här.
 */
const EMOJI = /(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B05}-\u{2B07}\u{27A1}\u{2764}][\u{FE0F}]?(?:\u{200D}[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2640}\u{2642}][\u{FE0F}]?)*)/gu

export function stripEmoji(text: string): string {
  return text.replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim()
}

/** Alla emoji-tecken i en text (för testet som kräver en ikon per tecken). */
export function findEmoji(text: string): string[] {
  return text.match(EMOJI) ?? []
}
