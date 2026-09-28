/**
 * Byggkontroll för betalningen och butiksbyggena (körs av vite.config.ts vid `vite build`, aldrig
 * i appen).
 *
 * Stoppar bygget när inställningarna annars tyst skulle ge fel app:
 * - `VITE_COMMERCE_MODE=live` utan en giltig publik licensnyckel blir annars testläge – där
 *   köpknappen ger gratis testlicenser till alla. Samma sak om "live" är felstavat (" Live").
 * - Ett produktionsbygge på Netlify i testläge (om det inte är avsiktligt, LAGOM_ALLOW_TEST_COMMERCE=1).
 * - En hemlighet i en `VITE_`-variabel (Stripes hemliga nyckel, webhook-hemligheten, den privata
 *   licensnyckeln eller Supabases hemliga nyckel) byggs annars in i appen och syns för alla.
 * - Ett skarpt bygge eller butiksbygge utan säljarens uppgifter (distansavtalslagen) eller med
 *   en supportadress som bara är ett exempel.
 * - En felstavad `VITE_DISTRIBUTION`, eller ett butiksbygge som inte når serverfunktionerna.
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

/** Var bygget körs – från vite.config.ts. */
export interface CommerceBuildContext {
  /** Netlifys `CONTEXT`: 'production', 'deploy-preview', 'branch-deploy' eller 'dev'. */
  netlifyContext?: string
  /** `LAGOM_ALLOW_TEST_COMMERCE`: '1' = ett produktionsbygge i testläge är avsiktligt. */
  allowTest?: string
}

/** Början av en privat ECDSA P-256-nyckel (PKCS#8, base64) – som från generate-license-keys.mjs. */
const PKCS8_P256_PREFIX = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEH'

const DISTRIBUTIONS = ['web', 'appstore', 'play'] as const

/** Payload-delen av en JWT-liknande sträng (tre base64url-delar som börjar med "eyJ"), eller null. */
function jwtPayload(value: string): Record<string, unknown> | null {
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[0].startsWith('eyJ') || !parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p))) return null
  try {
    const data: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function looksSecret(name: string, value: string): boolean {
  if (/PRIVATE|SECRET/i.test(name)) return true
  // Listor (t.ex. VITE_LICENSE_PUBLIC_KEYS) kontrolleras del för del.
  return value.split(',').some((part) => looksLikeSecretValue(part))
}

function looksLikeSecretValue(value: string): boolean {
  const v = value.trim()
  return (
    /^(sk|rk)_(live|test)_/.test(v) ||
    v.startsWith('whsec_') ||
    // Supabases hemliga nyckel (ny form) och service_role-nyckeln (JWT) ger full åtkomst till databasen.
    v.startsWith('sb_secret_') ||
    jwtPayload(v)?.role === 'service_role' ||
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

/** De publika licensnycklarna som appen kommer att använda (samma regel som src/config/commerce.ts). */
function publicKeysFrom(env: BuildEnv): { name: string; keys: string[] } {
  const list = env.VITE_LICENSE_PUBLIC_KEYS?.trim()
  if (list) {
    return {
      name: 'VITE_LICENSE_PUBLIC_KEYS',
      keys: list
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
    }
  }
  const single = env.VITE_LICENSE_PUBLIC_KEY?.trim()
  return { name: 'VITE_LICENSE_PUBLIC_KEY', keys: single ? [single] : [] }
}

/** Säljarens uppgifter som köparen måste få före köpet (lagen om distansavtal, 2 kap. 2 §). */
const SELLER_FIELDS: ReadonlyArray<{ name: string; what: string }> = [
  { name: 'VITE_SELLER_NAME', what: 'säljarens namn (för enskild firma ditt namn eller firmanamnet)' },
  { name: 'VITE_SUPPORT_EMAIL', what: 'e-post för frågor om köp' },
  { name: 'VITE_SELLER_ORGNR', what: 'organisationsnummer (för enskild firma ditt personnummer)' },
  { name: 'VITE_SELLER_ADDRESS', what: 'postadress' },
  { name: 'VITE_SELLER_PHONE', what: 'telefonnummer' },
]

/**
 * true om e-postadressen bara är ett exempel: domänen example.* (t.ex. example.se, example.com)
 * eller en domän som aldrig kan ta emot post (.invalid, .test, .example, .localhost).
 */
export function isExampleEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop() ?? ''
  const labels = domain.split('.')
  return labels.includes('example') || ['invalid', 'test', 'localhost'].includes(labels[labels.length - 1] ?? '')
}

/** true om värdet är en platshållare från en mall, t.ex. "[Företagsnamn]" eller "hej@<din domän>". */
function isTemplatePlaceholder(value: string): boolean {
  return /[[\]<>]/.test(value)
}

export function checkCommerceBuild(env: BuildEnv, ctx: CommerceBuildContext = {}): CommerceBuildCheck {
  const errors: string[] = []
  const warnings: string[] = []

  // --- Hemligheter (alla lägen) ---
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || typeof value !== 'string' || !value.trim()) continue
    if (looksSecret(name, value)) {
      errors.push(
        `${name} ser ut att innehålla en hemlighet. Allt i VITE_-variabler byggs in i appen och syns för alla – ` +
          'hemliga nycklar (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, LICENSE_PRIVATE_KEY, SUPABASE_SECRET_KEY) ska bara finnas utan VITE_-prefix.',
      )
    }
  }

  // --- Supabase (Lagom Moln är avstängt tills VITE_SUPABASE_URL finns) ---
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() ?? ''
  if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
    warnings.push(
      `VITE_SUPABASE_URL (${supabaseUrl}) är ingen https-adress – Lagom Moln förblir avstängt. Använd projektets adress, t.ex. https://<ref>.supabase.co.`,
    )
  }
  if (supabaseUrl && !env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim().startsWith('sb_publishable_')) {
    warnings.push(
      'VITE_SUPABASE_URL är satt men VITE_SUPABASE_PUBLISHABLE_KEY börjar inte med sb_publishable_. Appen ska bara ha den publika nyckeln ' +
        '(Supabase → Project Settings → API Keys → Publishable key) – aldrig den hemliga.',
    )
  }

  // --- Distribution ---
  const rawDistribution = env.VITE_DISTRIBUTION
  let distribution: (typeof DISTRIBUTIONS)[number] = 'web'
  if (rawDistribution !== undefined && rawDistribution !== '') {
    if ((DISTRIBUTIONS as readonly string[]).includes(rawDistribution)) {
      distribution = rawDistribution as (typeof DISTRIBUTIONS)[number]
    } else {
      errors.push(`VITE_DISTRIBUTION måste vara web, appstore eller play (nu: "${rawDistribution}").`)
    }
  }
  const store = distribution === 'appstore' || distribution === 'play'

  // --- Webbförsäljningen på eller av ---
  const webSales = (env.VITE_WEB_SALES ?? '').trim().toLowerCase()
  if (webSales && webSales !== 'on' && webSales !== 'off') {
    errors.push(`VITE_WEB_SALES måste vara on eller off (nu: "${env.VITE_WEB_SALES}").`)
  }
  if (!store && webSales === 'off' && !env.VITE_APPSTORE_URL?.trim() && !env.VITE_PLAY_URL?.trim()) {
    warnings.push('VITE_WEB_SALES=off men varken VITE_APPSTORE_URL eller VITE_PLAY_URL är satt – köpsidan kan då inte länka till appbutikerna.')
  }

  const mode = env.VITE_COMMERCE_MODE ?? ''
  const live = mode === 'live'
  const { name: keyVar, keys } = publicKeysFrom(env)

  // --- Produktionsbygge i testläge ---
  if (!live) {
    if (mode.trim().toLowerCase() === 'live') {
      errors.push(`VITE_COMMERCE_MODE är "${mode}". Skriv exakt live – annars byggs appen i testläge med gratis testlicenser.`)
    }
    if (ctx.netlifyContext === 'production' && ctx.allowTest !== '1') {
      errors.push('Produktionsbygge i testläge – sätt VITE_COMMERCE_MODE=live, eller LAGOM_ALLOW_TEST_COMMERCE=1 om det är avsiktligt.')
    }
  }

  // --- Publika licensnycklar ---
  if (live && keys.length === 0) {
    errors.push(
      'VITE_COMMERCE_MODE=live men VITE_LICENSE_PUBLIC_KEY saknas – då skulle appen byggas i testläge med gratis testlicenser. ' +
        'Skapa nycklar med: node scripts/generate-license-keys.mjs',
    )
  }
  keys.forEach((key, i) => {
    if (isP256PublicKey(key)) return
    // Hemligheter har redan rapporterats ovan – upprepa inte.
    if (looksSecret(keyVar, key)) return
    const which = keys.length > 1 ? `Nyckel ${i + 1} i ${keyVar}` : keyVar
    const message =
      `${which} är ingen publik ECDSA P-256-nyckel (SPKI, base64) – inga licenser signerade med den skulle gå att aktivera. ` +
      'Kopiera hela raden från scripts/generate-license-keys.mjs.'
    if (live || store) errors.push(message)
    else warnings.push(message)
  })
  if (keyVar === 'VITE_LICENSE_PUBLIC_KEYS' && env.VITE_LICENSE_PUBLIC_KEY?.trim() && !keys.includes(env.VITE_LICENSE_PUBLIC_KEY.trim())) {
    warnings.push('VITE_LICENSE_PUBLIC_KEY används inte när VITE_LICENSE_PUBLIC_KEYS är satt – lägg den i listan om gamla licenser ska fortsätta gälla.')
  }

  // --- Butiksbyggen ---
  if (store) {
    const apiBase = env.VITE_API_BASE?.trim() ?? ''
    if (!apiBase.startsWith('https://')) {
      errors.push('Butiksappen når inte serverfunktionerna – sätt VITE_API_BASE till webbplatsens https-adress.')
    }
    if (keys.length === 0) {
      warnings.push(
        `${distribution === 'appstore' ? 'App Store' : 'Google Play'}-bygget saknar publik licensnyckel (VITE_LICENSE_PUBLIC_KEY) – ` +
          'licensnycklar kan inte aktiveras i appen och spärrlistan för återbetalda licenser kan inte kontrolleras.',
      )
    }
  }

  // --- Säljarens uppgifter (skarpt läge och butiksbyggen) ---
  if (live || store) {
    for (const field of SELLER_FIELDS) {
      if (!env[field.name]?.trim()) {
        errors.push(
          `${field.name} saknas – ${field.what} måste visas för köparen före köpet enligt distansavtalslagen. ` +
            'Sätt variabeln (se docs/BETALNING.md) innan appen byggs för försäljning.',
        )
      }
    }
    for (const field of SELLER_FIELDS) {
      const value = env[field.name]?.trim()
      if (value && isTemplatePlaceholder(value)) {
        errors.push(`${field.name} (${value}) ser ut som en platshållare från en mall – skriv in den riktiga uppgiften (distansavtalslagen).`)
      }
    }
    const email = env.VITE_SUPPORT_EMAIL?.trim().toLowerCase() ?? ''
    if (email && !isTemplatePlaceholder(email) && isExampleEmail(email)) {
      errors.push(
        `VITE_SUPPORT_EMAIL (${email}) är bara ett exempel – köpare måste kunna nå dig på en riktig adress enligt distansavtalslagen.`,
      )
    }
  }
  return { errors, warnings }
}
