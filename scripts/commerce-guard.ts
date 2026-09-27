/**
 * Byggkontroll för betalningen (körs av vite.config.ts vid `vite build`, aldrig i appen).
 *
 * Stoppar bygget när inställningarna annars tyst skulle ge fel app:
 * - `VITE_COMMERCE_MODE=live` utan en giltig publik licensnyckel blir annars testläge – där
 *   köpknappen ger gratis testlicenser till alla. Samma sak om "live" är felstavat (" Live").
 * - En hemlighet i en `VITE_`-variabel (Stripes hemliga nyckel, webhook-hemligheten eller den
 *   privata licensnyckeln) byggs annars in i appen och syns för alla.
 * Se docs/BETALNING.md.
 */
import { createPublicKey } from 'node:crypto'

export type BuildEnv = Record<string, string | undefined>

export interface CommerceBuildCheck {
  /** Bygget stoppas. */
  errors: string[]
  /** Bygget fortsätter, men något bör rättas före försäljning. */
  warnings: string[]
}

/** Början av en privat ECDSA P-256-nyckel (PKCS#8, base64) – som från generate-license-keys.mjs. */
const PKCS8_P256_PREFIX = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEH'

function looksSecret(name: string, value: string): boolean {
  const v = value.trim()
  return (
    /PRIVATE|SECRET/i.test(name) ||
    /^(sk|rk)_(live|test)_/.test(v) ||
    v.startsWith('whsec_') ||
    v.replace(/\s+/g, '').startsWith(PKCS8_P256_PREFIX)
  )
}

/** true om texten är en publik ECDSA P-256-nyckel (SPKI, base64) – det appen verifierar med. */
export function isP256PublicKey(base64: string): boolean {
  const clean = base64.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return false
  try {
    const key = createPublicKey({ key: Buffer.from(clean, 'base64'), format: 'der', type: 'spki' })
    return key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1'
  } catch {
    return false
  }
}

export function checkCommerceBuild(env: BuildEnv): CommerceBuildCheck {
  const errors: string[] = []
  const warnings: string[] = []

  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || typeof value !== 'string' || !value.trim()) continue
    if (looksSecret(name, value)) {
      errors.push(
        `${name} ser ut att innehålla en hemlighet. Allt i VITE_-variabler byggs in i appen och syns för alla – ` +
          'hemliga nycklar (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, LICENSE_PRIVATE_KEY) ska bara finnas utan VITE_-prefix.',
      )
    }
  }

  const mode = env.VITE_COMMERCE_MODE ?? ''
  if (mode !== 'live') {
    if (mode.trim().toLowerCase() === 'live') {
      errors.push(`VITE_COMMERCE_MODE är "${mode}". Skriv exakt live – annars byggs appen i testläge med gratis testlicenser.`)
    }
    return { errors, warnings }
  }

  const publicKey = env.VITE_LICENSE_PUBLIC_KEY ?? ''
  if (!publicKey.trim()) {
    errors.push(
      'VITE_COMMERCE_MODE=live men VITE_LICENSE_PUBLIC_KEY saknas – då skulle appen byggas i testläge med gratis testlicenser. ' +
        'Skapa nycklar med: node scripts/generate-license-keys.mjs',
    )
  } else if (!isP256PublicKey(publicKey)) {
    errors.push(
      'VITE_LICENSE_PUBLIC_KEY är ingen publik ECDSA P-256-nyckel (SPKI, base64) – inga licenser skulle gå att aktivera. ' +
        'Kopiera hela raden från scripts/generate-license-keys.mjs.',
    )
  }
  if (!env.VITE_SELLER_NAME?.trim()) {
    warnings.push('VITE_SELLER_NAME saknas – köparket visar då "Lagom" som säljare. Ange företagets eller ditt namn (distansavtalslagen).')
  }
  if (!env.VITE_SUPPORT_EMAIL?.trim()) {
    warnings.push('VITE_SUPPORT_EMAIL saknas – appen visar en exempeladress för frågor om köp.')
  }
  return { errors, warnings }
}
