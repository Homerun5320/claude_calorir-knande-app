/**
 * Säljarens uppgifter i de fristående sidorna public/integritet/ och public/villkor/.
 *
 * Sidorna checkas in med platshållare som [Företagsnamn] (så att de kan jämföras med texten i
 * legalContent.ts). Vid bygget ersätts platshållarna med VITE_SELLER_*-variablerna – se
 * `fillSellerPlaceholders`, som anropas från vite.config.ts.
 *
 * Filen får inte importera något: den laddas även av vite.config.ts i Node, där appens moduler
 * (och import.meta.env) inte finns.
 */

export const STATIC_PLACEHOLDERS = {
  name: '[Företagsnamn]',
  orgNr: '[Org.nr]',
  address: '[Adress]',
  phone: '[Telefon]',
  vat: '[Momsreg.nr]',
  email: '[E-post]',
} as const

type Field = keyof typeof STATIC_PLACEHOLDERS

/** Miljövariabeln som bär varje uppgift. */
export const SELLER_ENV_KEYS: Readonly<Record<Field, string>> = {
  name: 'VITE_SELLER_NAME',
  orgNr: 'VITE_SELLER_ORGNR',
  address: 'VITE_SELLER_ADDRESS',
  phone: 'VITE_SELLER_PHONE',
  vat: 'VITE_SELLER_VAT',
  email: 'VITE_SUPPORT_EMAIL',
}

/** Meningen med momsregistreringsnumret på de fristående sidorna (platshållaren kan vara markerad). */
const VAT_SENTENCE_HTML = / Momsregistreringsnummer: (?:<span class="fyll">)?\[Momsreg\.nr\](?:<\/span>)?\./g

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * Ersätt platshållarna i en fristående sida med säljarens uppgifter. Uppgifter som saknas (eller en
 * supportadress som slutar på .invalid eller ligger hos example.*) lämnas som platshållare, så att det
 * syns vad som fattas.
 */
export function fillSellerPlaceholders(html: string, env: Readonly<Record<string, string | undefined>>): string {
  let out = html
  // Momsregistreringsnumret är frivilligt (en momsbefriad firma har inget) – saknas det tas hela
  // meningen bort i stället för att platshållaren står kvar.
  if (!(env[SELLER_ENV_KEYS.vat] ?? '').trim()) out = out.replace(VAT_SENTENCE_HTML, '')
  for (const field of Object.keys(STATIC_PLACEHOLDERS) as Field[]) {
    const value = (env[SELLER_ENV_KEYS[field]] ?? '').trim()
    // Samma regel som i appen (legalContent.ts): .invalid- och example-adresser är platshållare.
    if (!value || (field === 'email' && (/\.invalid$/i.test(value) || /@example\./i.test(value)))) continue
    // Ifyllda uppgifter ska inte längre vara markerade som platshållare.
    out = out
      .replaceAll(`<span class="fyll">${STATIC_PLACEHOLDERS[field]}</span>`, escapeHtml(value))
      .replaceAll(STATIC_PLACEHOLDERS[field], escapeHtml(value))
  }
  return out
}

/**
 * Platshållare som finns kvar i en sida – används för att varna när ett skarpt bygge saknar
 * uppgifter. Momsregistreringsnumret räknas inte (det är frivilligt och tas bort när det saknas).
 */
export function missingSellerPlaceholders(html: string): string[] {
  return Object.values(STATIC_PLACEHOLDERS).filter((p) => p !== STATIC_PLACEHOLDERS.vat && html.includes(p))
}
