/** Kort unikt id (tidsordnat prefix + slump). */
export function uid(prefix = ''): string {
  const time = Date.now().toString(36)
  const rand =
    typeof crypto !== 'undefined' && 'getRandomValues' in crypto
      ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}${time}${rand}`
}

/** Gör en url-/id-vänlig slug av ett svenskt namn: "Kanelbulle, bageri" → "kanelbulle-bageri". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/é/g, 'e')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
