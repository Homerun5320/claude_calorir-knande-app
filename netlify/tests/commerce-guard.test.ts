// @vitest-environment node
/**
 * Byggkontrollen (scripts/commerce-guard.ts, körs av vite.config.ts): ett skarpt bygge får aldrig
 * tyst bli testläge med gratis testlicenser, inga hemligheter får hamna i appen, säljarens
 * uppgifter måste finnas före försäljning och butiksbyggen måste nå serverfunktionerna.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { VOICE_SEARCH_MARKERS, WEB_PURCHASE_MARKERS, checkCommerceBuild, findVoiceSearchCode, findWebPurchaseCode, isExampleEmail, isP256PublicKey } from '../../scripts/commerce-guard.ts'
import { licenseKeyPair } from './fakeStripe.ts'

let keys: { priv: string; pub: string }
let keys2: { priv: string; pub: string }

beforeAll(async () => {
  keys = await licenseKeyPair()
  keys2 = await licenseKeyPair()
})

const seller = () => ({
  VITE_SELLER_NAME: 'Anna Andersson',
  VITE_SUPPORT_EMAIL: 'hej@annasfirma.se',
  VITE_SELLER_ORGNR: '900101-1234',
  VITE_SELLER_ADDRESS: 'Storgatan 1, 123 45 Småstad',
  VITE_SELLER_PHONE: '070-123 45 67',
})

const complete = (): Record<string, string | undefined> => ({
  VITE_COMMERCE_MODE: 'live',
  VITE_LICENSE_PUBLIC_KEY: keys.pub,
  VITE_TERMS_URL: 'https://annasfirma.se/villkor/',
  ...seller(),
})

/** Ett butiksbygge med köp i appen inkopplade. */
const READY = { nativePurchasesReady: true }

/** En JWT-liknande sträng (som Supabases äldre nycklar) med given roll. */
function jwt(role: string): string {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'supabase', ref: 'abc', role })}.c2lnbmF0dXI`
}

describe('byggkontrollen för betalningen', () => {
  it('testläge och ett komplett skarpt bygge godkänns', () => {
    expect(checkCommerceBuild({})).toEqual({ errors: [], warnings: [] })
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' }).errors).toEqual([])
    expect(checkCommerceBuild(complete())).toEqual({ errors: [], warnings: [] })
  })

  it('skarpt läge utan publik nyckel stoppas (skulle annars bli testläge med gratis licenser)', () => {
    for (const key of [undefined, '', '   ']) {
      const { errors } = checkCommerceBuild({ ...complete(), VITE_LICENSE_PUBLIC_KEY: key })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('VITE_LICENSE_PUBLIC_KEY saknas')
    }
  })

  it('en trasig eller fel nyckel stoppas', () => {
    expect(isP256PublicKey(keys.pub)).toBe(true)
    expect(isP256PublicKey(keys.pub.slice(0, 40))).toBe(false)
    expect(isP256PublicKey('inte en nyckel')).toBe(false)
    const truncated = checkCommerceBuild({ ...complete(), VITE_LICENSE_PUBLIC_KEY: keys.pub.slice(0, -8) })
    expect(truncated.errors.join(' ')).toContain('ingen publik ECDSA P-256-nyckel')
  })

  it('felstavat "live" stoppas i stället för att tyst bli testläge', () => {
    for (const mode of ['Live', ' live', 'LIVE ']) {
      expect(checkCommerceBuild({ ...complete(), VITE_COMMERCE_MODE: mode }).errors.join(' ')).toContain('Skriv exakt live')
    }
  })

  it('hemligheter i VITE_-variabler stoppas i alla lägen', () => {
    const cases: Record<string, string>[] = [
      { VITE_LICENSE_PRIVATE_KEY: keys.priv },
      // Den privata nyckeln inklistrad som publik nyckel.
      { VITE_LICENSE_PUBLIC_KEY: keys.priv },
      { VITE_STRIPE_KEY: 'sk_live_123abc' },
      { VITE_STRIPE_KEY: 'rk_test_123abc' },
      { VITE_WEBHOOK: 'whsec_abc' },
      { VITE_STRIPE_SECRET_KEY: 'något' },
      { VITE_SUPABASE_KEY: 'sb_secret_abc123' },
      { VITE_SUPABASE_ANON_KEY: jwt('service_role') },
    ]
    for (const env of cases) {
      for (const mode of ['test', 'live']) {
        const { errors } = checkCommerceBuild({ ...complete(), VITE_COMMERCE_MODE: mode, ...env })
        expect(errors.some((e) => e.includes('ser ut att innehålla en hemlighet'))).toBe(true)
        // Hemligheten själv skrivs aldrig ut i byggloggen.
        expect(errors.join(' ')).not.toContain(Object.values(env)[0])
      }
    }
    // Serverns variabler (utan VITE_) byggs inte in och är därför okej.
    expect(checkCommerceBuild({ ...complete(), LICENSE_PRIVATE_KEY: keys.priv, STRIPE_SECRET_KEY: 'sk_live_x' }).errors).toEqual([])
  })

  it('privata nycklar i andra format och andra tjänsters hemligheter stoppas också', async () => {
    const { generateKeyPairSync } = await import('node:crypto')
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()
    const sec1 = (privateKey.export({ format: 'der', type: 'sec1' }) as Buffer).toString('base64')
    const jwk = JSON.stringify(privateKey.export({ format: 'jwk' }))
    const values = [
      pem,
      sec1,
      jwk,
      '{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----\\nMIIE…"}',
      'sk_AbCdEfGhIjKlMnOpQrSt',
    ]
    for (const value of values) {
      const { errors } = checkCommerceBuild({ VITE_LICENSE_PUBLIC_KEY: value })
      expect(errors.some((e) => e.includes('ser ut att innehålla en hemlighet')), value.slice(0, 30)).toBe(true)
    }
    // En publik nyckel är ingen hemlighet.
    expect(checkCommerceBuild({ VITE_LICENSE_PUBLIC_KEY: keys.pub }).errors).toEqual([])
  })

  it('felmeddelandet om hemligheter nämner Supabases hemliga nyckel', () => {
    const { errors } = checkCommerceBuild({ VITE_SUPABASE_KEY: 'sb_secret_abc123' })
    expect(errors.join(' ')).toContain('SUPABASE_SECRET_KEY')
  })

  it('Supabases publika nycklar är okej, men en fel nyckel varnas för', () => {
    expect(checkCommerceBuild({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })).toEqual({
      errors: [],
      warnings: [],
    })
    // Den äldre publika JWT-nyckeln (anon) är ingen hemlighet, men inte heller den nya publika nyckeln.
    const anon = checkCommerceBuild({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') })
    expect(anon.errors).toEqual([])
    expect(anon.warnings.join(' ')).toContain('sb_publishable_')
    // Utan URL är Lagom Moln avstängt – ingen varning.
    expect(checkCommerceBuild({}).warnings).toEqual([])
    // En adress utan https ger en varning (molnet förblir avstängt).
    const http = checkCommerceBuild({ VITE_SUPABASE_URL: 'http://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' })
    expect(http.errors).toEqual([])
    expect(http.warnings.join(' ')).toContain('https')
  })
})

describe('säljarens uppgifter (distansavtalslagen)', () => {
  it('org.nr är frivilligt (för enskild firma personnumret) – bara en varning när det saknas', () => {
    const { errors, warnings } = checkCommerceBuild({ ...complete(), VITE_SELLER_ORGNR: undefined })
    expect(errors).toEqual([])
    expect(warnings).toEqual([expect.stringContaining('VITE_SELLER_ORGNR saknas')])
    expect(warnings[0]).toContain('Verksamt eller en jurist')
    // En platshållare från mallen stoppas ändå.
    expect(checkCommerceBuild({ ...complete(), VITE_SELLER_ORGNR: '[Org.nr]' }).errors).toEqual([expect.stringContaining('platshållare')])
  })

  it('namn, e-post, adress och telefon krävs i skarpt läge', () => {
    const res = checkCommerceBuild({ VITE_COMMERCE_MODE: 'live', VITE_LICENSE_PUBLIC_KEY: keys.pub })
    for (const name of ['VITE_SELLER_NAME', 'VITE_SUPPORT_EMAIL', 'VITE_SELLER_ADDRESS', 'VITE_SELLER_PHONE']) {
      expect(res.errors.some((e) => e.startsWith(`${name} saknas`))).toBe(true)
    }
    expect(res.errors).toHaveLength(4)
    expect(res.errors.every((e) => e.includes('distansavtalslagen'))).toBe(true)
  })

  it('skarpt läge på webben utan VITE_TERMS_URL ger en varning', () => {
    const res = checkCommerceBuild({ ...complete(), VITE_TERMS_URL: undefined })
    expect(res.errors).toEqual([])
    expect(res.warnings.join(' ')).toContain('VITE_TERMS_URL saknas')
  })

  it('en supportadress som bara är ett exempel stoppas', () => {
    for (const email of ['support@example.invalid', 'hej@example.se', 'Support@Example.Invalid', 'hej@example.com', 'hej@lagom.example', 'a@b.test']) {
      const { errors } = checkCommerceBuild({ ...complete(), VITE_SUPPORT_EMAIL: email })
      expect(errors.join(' ')).toContain('bara ett exempel')
    }
    expect(isExampleEmail('hej@annasfirma.se')).toBe(false)
    expect(isExampleEmail('support@exempelgatan.se')).toBe(false)
  })

  it('platshållare från mallarna ("[Företagsnamn]", "<din domän>") stoppas', () => {
    const name = checkCommerceBuild({ ...complete(), VITE_SELLER_NAME: '[Företagsnamn]' })
    expect(name.errors).toEqual([expect.stringContaining('VITE_SELLER_NAME ([Företagsnamn]) ser ut som en platshållare')])
    const email = checkCommerceBuild({ ...complete(), VITE_SUPPORT_EMAIL: 'hej@<din domän>' })
    expect(email.errors).toEqual([expect.stringContaining('VITE_SUPPORT_EMAIL (hej@<din domän>) ser ut som en platshållare')])
  })

  it('testläge kräver inga säljaruppgifter', () => {
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' })).toEqual({ errors: [], warnings: [] })
  })
})

describe('produktionsbygge i testläge', () => {
  it('production + test stoppas', () => {
    for (const mode of [undefined, 'test', '']) {
      const { errors } = checkCommerceBuild({ VITE_COMMERCE_MODE: mode }, { netlifyContext: 'production' })
      expect(errors).toEqual(['Produktionsbygge i testläge – sätt VITE_COMMERCE_MODE=live, eller LAGOM_ALLOW_TEST_COMMERCE=1 om det är avsiktligt.'])
    }
  })

  it('production + live godkänns', () => {
    expect(checkCommerceBuild(complete(), { netlifyContext: 'production' })).toEqual({ errors: [], warnings: [] })
  })

  it('förhandsvisningar och grenbyggen får vara i testläge', () => {
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' }, { netlifyContext: 'deploy-preview' }).errors).toEqual([])
    expect(checkCommerceBuild({}, { netlifyContext: 'branch-deploy' }).errors).toEqual([])
    expect(checkCommerceBuild({}).errors).toEqual([])
  })

  it('production + test + LAGOM_ALLOW_TEST_COMMERCE=1 godkänns (avsiktligt)', () => {
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' }, { netlifyContext: 'production', allowTest: '1' }).errors).toEqual([])
    expect(checkCommerceBuild({ VITE_COMMERCE_MODE: 'test' }, { netlifyContext: 'production', allowTest: 'ja' }).errors).toHaveLength(1)
  })
})

describe('distribution och butiksbyggen', () => {
  const storeEnv = (distribution: string, apiBase?: string) => ({
    VITE_DISTRIBUTION: distribution,
    VITE_API_BASE: apiBase,
    VITE_LICENSE_PUBLIC_KEY: keys.pub,
    ...seller(),
  })

  it('en felstavad distribution stoppas', () => {
    for (const d of ['AppStore', 'ios', 'google', ' play']) {
      const { errors } = checkCommerceBuild({ VITE_DISTRIBUTION: d })
      expect(errors).toEqual([`VITE_DISTRIBUTION måste vara web, appstore eller play (nu: "${d}").`])
    }
    expect(checkCommerceBuild({ VITE_DISTRIBUTION: 'web' }).errors).toEqual([])
    expect(checkCommerceBuild({ VITE_DISTRIBUTION: '' }).errors).toEqual([])
  })

  it('App Store utan VITE_API_BASE stoppas', () => {
    const { errors } = checkCommerceBuild(storeEnv('appstore'), READY)
    expect(errors).toEqual(['Butiksappen når inte serverfunktionerna – sätt VITE_API_BASE till webbplatsens https-adress.'])
  })

  it('App Store med http:// stoppas', () => {
    expect(checkCommerceBuild(storeEnv('appstore', 'http://lagom.example'), READY).errors).toHaveLength(1)
  })

  it('Google Play med https godkänns', () => {
    expect(checkCommerceBuild(storeEnv('play', 'https://lagom.example'), READY)).toEqual({ errors: [], warnings: [] })
  })

  it('butiksbyggen kräver säljarens uppgifter även utan VITE_COMMERCE_MODE=live', () => {
    const { errors } = checkCommerceBuild({ VITE_DISTRIBUTION: 'appstore', VITE_API_BASE: 'https://lagom.example', VITE_LICENSE_PUBLIC_KEY: keys.pub }, READY)
    expect(errors.length).toBe(4)
    expect(errors.every((e) => e.includes('distansavtalslagen'))).toBe(true)
  })

  it('varnar när Play-bygget saknar publik licensnyckel – men inte App Store-bygget, där nycklar inte används', () => {
    const res = checkCommerceBuild({ ...storeEnv('play', 'https://lagom.example'), VITE_LICENSE_PUBLIC_KEY: undefined }, READY)
    expect(res.errors).toEqual([])
    expect(res.warnings.join(' ')).toContain('licensnycklar från webbköp kan inte aktiveras i appen')
    expect(checkCommerceBuild({ ...storeEnv('appstore', 'https://lagom.example'), VITE_LICENSE_PUBLIC_KEY: undefined }, READY)).toEqual({ errors: [], warnings: [] })
  })

  it('butiksbyggen stoppas tills köp i appen är inkopplade – ett testbygge går med LAGOM_ALLOW_STORE_WITHOUT_IAP=1', () => {
    for (const d of ['appstore', 'play']) {
      const stopped = checkCommerceBuild(storeEnv(d, 'https://lagom.example'))
      expect(stopped.errors).toEqual([expect.stringContaining('Köp i appen är inte inkopplade')])
      const test = checkCommerceBuild(storeEnv(d, 'https://lagom.example'), { allowStoreWithoutIap: '1' })
      expect(test.errors).toEqual([])
      expect(test.warnings).toEqual([expect.stringContaining('aldrig skickas in')])
    }
    // Webbygget påverkas inte.
    expect(checkCommerceBuild(complete()).errors).toEqual([])
  })

  it('Lagom Moln stoppas i butiksbyggen tills ägaren uttryckligen tillåter det', () => {
    const cloud = { VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' }
    for (const d of ['appstore', 'play']) {
      expect(checkCommerceBuild({ ...storeEnv(d, 'https://lagom.example'), ...cloud }, READY).errors).toEqual([expect.stringContaining('VITE_SUPABASE_URL är satt i ett butiksbygge')])
      expect(checkCommerceBuild({ ...storeEnv(d, 'https://lagom.example'), ...cloud }, { ...READY, allowStoreCloud: '1' }).errors).toEqual([])
    }
    // Webbygget påverkas inte.
    expect(checkCommerceBuild({ ...complete(), ...cloud }).errors).toEqual([])
  })

  it('testköp får aldrig godtas i produktionsbyggen eller butiksbyggen', () => {
    const flag = { VITE_ACCEPT_TEST_PURCHASES: '1' }
    expect(checkCommerceBuild({ ...complete(), ...flag }, { netlifyContext: 'deploy-preview' }).errors).toEqual([])
    expect(checkCommerceBuild({ ...complete(), ...flag }, { netlifyContext: 'production' }).errors).toEqual([
      expect.stringContaining('VITE_ACCEPT_TEST_PURCHASES=1'),
    ])
    expect(checkCommerceBuild({ ...storeEnv('play', 'https://lagom.example'), ...flag }, READY).errors).toEqual([expect.stringContaining('VITE_ACCEPT_TEST_PURCHASES=1')])
  })
})

describe('webbförsäljningen på eller av', () => {
  it('off utan länkar till appbutikerna ger en varning, ett felstavat värde stoppas', () => {
    expect(checkCommerceBuild({ ...complete(), VITE_WEB_SALES: 'off', VITE_APPSTORE_URL: 'https://apps.apple.com/se/app/lagom/id1' })).toEqual({
      errors: [],
      warnings: [],
    })
    expect(checkCommerceBuild({ ...complete(), VITE_WEB_SALES: 'off' }).warnings.join(' ')).toContain('VITE_APPSTORE_URL')
    expect(checkCommerceBuild({ ...complete(), VITE_WEB_SALES: 'av' }).errors).toEqual(['VITE_WEB_SALES måste vara on eller off (nu: "av").'])
    expect(checkCommerceBuild({ ...complete(), VITE_WEB_SALES: 'on' }).errors).toEqual([])
  })
})

describe('flera publika licensnycklar', () => {
  it('varje nyckel i VITE_LICENSE_PUBLIC_KEYS kontrolleras', () => {
    const base = { ...seller(), VITE_COMMERCE_MODE: 'live', VITE_TERMS_URL: 'https://annasfirma.se/villkor/', VITE_LICENSE_PUBLIC_KEY: undefined }
    expect(checkCommerceBuild({ ...base, VITE_LICENSE_PUBLIC_KEYS: `${keys.pub}, ${keys2.pub}` })).toEqual({ errors: [], warnings: [] })
    const broken = checkCommerceBuild({ ...base, VITE_LICENSE_PUBLIC_KEYS: `${keys.pub},${keys2.pub.slice(0, -8)}` })
    expect(broken.errors).toEqual([expect.stringContaining('Nyckel 2 i VITE_LICENSE_PUBLIC_KEYS är ingen publik ECDSA P-256-nyckel')])
    // En privat nyckel i listan är en hemlighet.
    const secret = checkCommerceBuild({ ...base, VITE_LICENSE_PUBLIC_KEYS: `${keys.pub},${keys2.priv}` })
    expect(secret.errors.some((e) => e.includes('ser ut att innehålla en hemlighet'))).toBe(true)
  })

  it('en ensam VITE_LICENSE_PUBLIC_KEY som inte finns i listan varnas för', () => {
    const res = checkCommerceBuild({ ...complete(), VITE_LICENSE_PUBLIC_KEYS: keys2.pub })
    expect(res.errors).toEqual([])
    expect(res.warnings.join(' ')).toContain('VITE_LICENSE_PUBLIC_KEY används inte')
  })
})

describe('webbköpen i butiksappens paket (findWebPurchaseCode)', () => {
  const webbkop = [
    { name: 'assets/premiumLogic-abc.js', code: 'fetch(`${a}/api/create-checkout`);fetch(`${a}/api/recover-license`)' },
    { name: 'assets/components-abc.js', code: 'children:`Tappat nyckeln?`},{hint:`Klistra in hela nyckeln – den börjar med LAGOM1.`}' },
    { name: 'assets/useAccess-abc.js', code: 'fetch(`${a}/api/license-revocations`)' },
    { name: 'index.html', code: '<!doctype html><title>Lagom</title>' },
  ]

  it('webbygget kontrolleras inte – där hör webbköpen hemma', () => {
    expect(findWebPurchaseCode(webbkop, 'web')).toEqual([])
    expect(findWebPurchaseCode(webbkop, undefined)).toEqual([])
  })

  it('App Store: webbköp, aktivering av licensnycklar och spärrlistan ger en rad per fund med filnamn', () => {
    const found = findWebPurchaseCode(webbkop, 'appstore')
    expect(found).toEqual([
      expect.stringMatching(/^assets\/premiumLogic-abc\.js: "\/api\/create-checkout" – köpstarten i Stripe Checkout/),
      expect.stringMatching(/^assets\/premiumLogic-abc\.js: "\/api\/recover-license"/),
      expect.stringMatching(/^assets\/components-abc\.js: "Tappat nyckeln\?"/),
      expect.stringMatching(/^assets\/components-abc\.js: "Klistra in hela nyckeln" – aktiveringen av licensnycklar/),
      expect.stringMatching(/^assets\/useAccess-abc\.js: "\/api\/license-revocations"/),
    ])
  })

  it('Google Play: licensnycklar och spärrlistan får finnas, webbköpen inte', () => {
    const found = findWebPurchaseCode(webbkop, 'play')
    expect(found).toHaveLength(3)
    expect(found.join('\n')).not.toMatch(/Klistra in hela nyckeln|license-revocations/)
  })

  it('ett paket utan webbköp godkänns', () => {
    const clean = [{ name: 'assets/index.js', code: 'const a=`Köp i appen`;fetch(`${b}/api/recipe-fetch`)' }]
    expect(findWebPurchaseCode(clean, 'appstore')).toEqual([])
    expect(findWebPurchaseCode(clean, 'play')).toEqual([])
  })

  it('varje spår finns i appens källkod – en ändrad adress eller knapptext får inte göra kontrollen tom', () => {
    const src = fileURLToPath(new URL('../../src/', import.meta.url))
    const code = readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => readFileSync(`${src}${f}`, 'utf8'))
      .join('\n')
    for (const m of WEB_PURCHASE_MARKERS) {
      expect(m.stores.length, m.text).toBeGreaterThan(0)
      expect(code, `"${m.text}" finns inte längre i src/ – uppdatera WEB_PURCHASE_MARKERS`).toContain(m.text)
    }
  })
})

describe('röstsökningen i butiksappens paket (findVoiceSearchCode)', () => {
  const voice = [
    { name: 'assets/AddFoodPage-abc.js', code: 'const R=globalThis.SpeechRecognition;r.processLocally=!0' },
    { name: 'assets/index-abc.js', code: 'const a=`Sök livsmedel`' },
  ]

  it('webbygget kontrolleras inte – där finns röstsökningen', () => {
    expect(findVoiceSearchCode(voice, 'web')).toEqual([])
    expect(findVoiceSearchCode(voice, undefined)).toEqual([])
  })

  it('båda butiksbyggena: en rad per spår med filnamn', () => {
    for (const store of ['appstore', 'play']) {
      expect(findVoiceSearchCode(voice, store)).toEqual(['assets/AddFoodPage-abc.js: SpeechRecognition', 'assets/AddFoodPage-abc.js: processLocally'])
    }
    expect(findVoiceSearchCode([voice[1]], 'play')).toEqual([])
  })

  it('varje spår finns i röstsökningens källkod – annars är kontrollen tom', () => {
    const code = readFileSync(fileURLToPath(new URL('../../src/lib/voiceSearch.ts', import.meta.url)), 'utf8')
    for (const m of VOICE_SEARCH_MARKERS) expect(code, `"${m}" finns inte längre i src/lib/voiceSearch.ts – uppdatera VOICE_SEARCH_MARKERS`).toContain(m)
  })
})
