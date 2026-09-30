/**
 * En enda regel för när en e-postadress bara är ett exempel – samma i byggkontrollen
 * (scripts/commerce-guard.ts), på servern (netlify/lib/config.ts), i appen och på de fristående
 * sidorna (src/features/legal/staticSeller.ts).
 *
 * Filen får inte importera något: den laddas även av vite.config.ts och serverfunktionerna, där
 * appens moduler (och import.meta.env) saknas.
 */

/**
 * true om adressen saknas eller bara är ett exempel: domänen example.* (t.ex. example.se,
 * example.com, lagom.example) eller en domän som aldrig kan ta emot post (.invalid, .test,
 * .localhost). Då ska ingen mailto-länk visas och inget skarpt bygge godkännas.
 */
export function isExampleEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  if (!e) return true
  const labels = (e.split('@').pop() ?? '').split('.')
  return labels.includes('example') || ['invalid', 'test', 'localhost'].includes(labels[labels.length - 1] ?? '')
}
