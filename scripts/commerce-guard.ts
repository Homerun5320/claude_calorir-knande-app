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
 * - Ett butiksbygge utan riktiga köp i appen (`NATIVE_PURCHASES_READY` i src/lib/storePurchases.ts)
 *   – Apple och Google avvisar en app där det inte går att köpa. Bara testbyggen får göras med
 *   LAGOM_ALLOW_STORE_WITHOUT_IAP=1.
 * - Testköp som godtas i ett produktionsbygge eller butiksbygge (`VITE_ACCEPT_TEST_PURCHASES`).
 * Se docs/BETALNING.md.
 */
import { createPrivateKey, createPublicKey } from 'node:crypto'
import { isExampleEmail } from '../src/lib/placeholderEmail.ts'

export { isExampleEmail }

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
  /** `NATIVE_PURCHASES_READY` i src/lib/storePurchases.ts: köp i appen är inkopplade. */
  nativePurchasesReady?: boolean
  /**
   * `LAGOM_ALLOW_STORE_WITHOUT_IAP`: '1' = ett butiksbygge utan köp i appen är avsiktligt – bara
   * för testbyggen (simulator, skärmdumpar), aldrig för inskickning.
   */
  allowStoreWithoutIap?: string
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

/** true om texten (base64, DER) går att läsa som en privat nyckel i PKCS#8- eller SEC1-format. */
function isDerPrivateKey(value: string): boolean {
  const clean = value.replace(/\s+/g, '')
  if (clean.length < 64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return false
  const der = Buffer.from(clean, 'base64')
  for (const type of ['pkcs8', 'sec1'] as const) {
    try {
      createPrivateKey({ key: der, format: 'der', type })
      return true
    } catch {
      /* inte det formatet */
    }
  }
  return false
}

function looksLikeSecretValue(value: string): boolean {
  const v = value.trim()
  return (
    /^(sk|rk)_(live|test)_/.test(v) ||
    // Andra tjänsters hemliga nycklar som börjar med sk_ (t.ex. RevenueCat).
    /^sk_[A-Za-z0-9]{16,}$/.test(v) ||
    v.startsWith('whsec_') ||
    // Supabases hemliga nyckel (ny form) och service_role-nyckeln (JWT) ger full åtkomst till databasen.
    v.startsWith('sb_secret_') ||
    jwtPayload(v)?.role === 'service_role' ||
    v.replace(/\s+/g, '').startsWith(PKCS8_P256_PREFIX) ||
    // Privata nycklar i andra format: PEM, JSON-servicekonton (Google) och JWK med "d".
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(v) ||
    /"private_key"\s*:/.test(v) ||
    /"d"\s*:\s*"/.test(v) ||
    isDerPrivateKey(v)
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
  { name: 'VITE_SELLER_ADDRESS', what: 'postadress' },
  { name: 'VITE_SELLER_PHONE', what: 'telefonnummer' },
]

/**
 * Frivilliga uppgifter: kontrolleras bara om de är satta. Organisationsnumret är för en enskild
 * firma personnumret – om det måste visas är inte kontrollerat (se docs/BETALNING.md).
 */
const OPTIONAL_SELLER_FIELDS = ['VITE_SELLER_ORGNR', 'VITE_SELLER_VAT'] as const

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

  // --- Testköp (Stripes testkort) ---
  if ((env.VITE_ACCEPT_TEST_PURCHASES ?? '').trim() === '1' && (ctx.netlifyContext === 'production' || store)) {
    errors.push(
      'VITE_ACCEPT_TEST_PURCHASES=1 i ett produktionsbygge eller butiksbygge – då blir köp med Stripes testkort giltiga licenser. ' +
        'Variabeln hör bara hemma i förhandsversioner och grenbyggen (netlify.toml).',
    )
  }

  // --- Butiksbyggen ---
  if (store) {
    const apiBase = env.VITE_API_BASE?.trim() ?? ''
    if (!apiBase.startsWith('https://')) {
      errors.push('Butiksappen når inte serverfunktionerna – sätt VITE_API_BASE till webbplatsens https-adress.')
    }
    // Licensnycklar används bara i Google Play-appen – i App Store-bygget finns inga (alternativ A).
    if (distribution === 'play' && keys.length === 0) {
      warnings.push(
        'Google Play-bygget saknar publik licensnyckel (VITE_LICENSE_PUBLIC_KEY) – licensnycklar från webbköp kan inte aktiveras i appen ' +
          'och spärrlistan för återbetalda licenser kan inte kontrolleras.',
      )
    }
    if (!ctx.nativePurchasesReady) {
      const message =
        'Köp i appen är inte inkopplade (NATIVE_PURCHASES_READY i src/lib/storePurchases.ts) – i appen går det då inte att köpa Lagom, ' +
        'och Apple och Google avvisar appen. Koppla in IAP-tillägget först (docs/APP-STORE.md).'
      if (ctx.allowStoreWithoutIap === '1') {
        warnings.push(`${message} LAGOM_ALLOW_STORE_WITHOUT_IAP=1: bygget får bara användas för test, aldrig skickas in.`)
      } else {
        errors.push(`${message} Ett testbygge (simulator, skärmdumpar) kan göras med LAGOM_ALLOW_STORE_WITHOUT_IAP=1.`)
      }
    }
  }

  // --- Köpvillkoren i Stripe (skarpt läge på webben) ---
  if (live && !store && webSales !== 'off' && !env.VITE_TERMS_URL?.trim()) {
    warnings.push(
      'VITE_TERMS_URL saknas – sätt den (och TERMS_URL i serverfunktionerna) till köpvillkorens adress, t.ex. https://<din domän>/villkor/, ' +
        'så att köparen godkänner villkoren i Stripe.',
    )
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
    for (const name of [...SELLER_FIELDS.map((f) => f.name), ...OPTIONAL_SELLER_FIELDS]) {
      const value = env[name]?.trim()
      if (value && isTemplatePlaceholder(value)) {
        errors.push(`${name} (${value}) ser ut som en platshållare från en mall – skriv in den riktiga uppgiften (distansavtalslagen).`)
      }
    }
    if (!env.VITE_SELLER_ORGNR?.trim()) {
      warnings.push(
        'VITE_SELLER_ORGNR saknas – organisationsnumret visas då inte i appen, i villkoren eller på kvittot. För en enskild firma är det ' +
          'ditt personnummer. Distansavtalslagen kräver namn, adress, telefon och e-post; registreringsnumret krävs (e-handelslagen 8 §) ' +
          'om firman finns i handelsregistret. Kontrollera med Verksamt eller en jurist (docs/BETALNING.md).',
      )
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
