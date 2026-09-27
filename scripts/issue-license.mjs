#!/usr/bin/env node
/**
 * Utfärda en licens manuellt – för support, reklamationer, presskoder eller om en kund har tappat
 * sin nyckel och köpet inte längre går att hämta via tacksidan.
 *
 *   LICENSE_PRIVATE_KEY=… node scripts/issue-license.mjs --plan livstid
 *   LICENSE_PRIVATE_KEY=… node scripts/issue-license.mjs --plan ar [--days 365] [--from 2026-03-01]
 *
 *   --plan ar|livstid   Årslicens (365 dagar som standard) eller Livstidslicens
 *   --days N            Årslicensens längd i dagar (1–3650), t.ex. 30 för en förlängd provperiod
 *   --from ÅÅÅÅ-MM-DD   Startdatum (standard: nu), t.ex. ursprungliga köpdatumet för en årslicens
 *   --id ID             Eget licens-id (standard: lic_…); skriv gärna in ärendenumret
 *   --json              Skriv ut resultatet som JSON
 *
 * Om VITE_LICENSE_PUBLIC_KEY också är satt kontrolleras att nyckeln fungerar i appen.
 * Formatet är detsamma som i src/lib/license.ts (testas i netlify/tests/scripts.test.ts).
 */
import { randomBytes, webcrypto } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const subtle = globalThis.crypto?.subtle ?? webcrypto.subtle

export const LICENSE_PREFIX = 'LAGOM1'
export const PLANS = {
  ar: { name: 'Årslicens', durationDays: 365 },
  livstid: { name: 'Livstidslicens' },
}

class UsageError extends Error {}

const enc = new TextEncoder()
const b64url = (bytes) => Buffer.from(bytes).toString('base64url')
const fromB64 = (s) => new Uint8Array(Buffer.from(s.replace(/\s+/g, ''), 'base64'))
const toB64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64')

async function importPrivateKey(pkcs8Base64) {
  try {
    return await subtle.importKey('pkcs8', fromB64(pkcs8Base64), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  } catch {
    throw new UsageError('LICENSE_PRIVATE_KEY är ingen giltig ECDSA P-256-nyckel (PKCS#8, base64). Skapa en med scripts/generate-license-keys.mjs.')
  }
}

/** Den publika nyckeln (SPKI, base64) som hör till den privata. */
async function publicKeyFor(privateKey) {
  const jwk = await subtle.exportKey('jwk', privateKey)
  const pub = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'verify',
  ])
  return toB64(await subtle.exportKey('spki', pub))
}

async function verifyWith(publicKeyBase64, licenseKey) {
  const [prefix, body, sig] = licenseKey.split('.')
  try {
    const pub = await subtle.importKey('spki', fromB64(publicKeyBase64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(sig, 'base64url'), enc.encode(`${prefix}.${body}`))
  } catch {
    return false
  }
}

function parseDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '')
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
  if (!d || d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
    throw new UsageError(`Ogiltigt datum "${value}". Skriv det som ÅÅÅÅ-MM-DD.`)
  }
  return d.getTime()
}

/**
 * Skapa en signerad licens. Returnerar { licenseKey, payload, publicKey, verified } där verified är
 * true/false om `appPublicKey` angavs, annars null.
 */
export async function issueLicense({ plan, days, from, id, privateKey, appPublicKey, now = Date.now() }) {
  if (!Object.hasOwn(PLANS, plan ?? '')) throw new UsageError('Ange --plan ar (Årslicens) eller --plan livstid (Livstidslicens).')
  if (!privateKey) throw new UsageError('Miljövariabeln LICENSE_PRIVATE_KEY saknas.')
  let duration = PLANS[plan].durationDays
  if (days !== undefined) {
    if (plan !== 'ar') throw new UsageError('--days fungerar bara med --plan ar. En livstidslicens gäller för alltid.')
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 3650) throw new UsageError('--days ska vara ett heltal mellan 1 och 3650.')
    duration = n
  }
  const licenseId = id ?? `lic_${Math.floor(now / 1000).toString(36)}${randomBytes(4).toString('hex')}`
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(licenseId)) throw new UsageError('--id får bara innehålla a–z, A–Z, 0–9, _ och - (3–100 tecken).')

  const iat = Math.floor((from !== undefined ? parseDate(from) : now) / 1000)
  const payload = { v: 1, id: licenseId, plan, iat, ...(duration ? { exp: iat + duration * 86_400 } : {}) }

  const key = await importPrivateKey(privateKey)
  const body = b64url(enc.encode(JSON.stringify(payload)))
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${LICENSE_PREFIX}.${body}`)))
  const licenseKey = `${LICENSE_PREFIX}.${body}.${b64url(sig)}`
  const publicKey = await publicKeyFor(key)
  const verified = appPublicKey ? await verifyWith(appPublicKey.replace(/\s+/g, ''), licenseKey) : null
  return { licenseKey, payload, publicKey, verified }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--json') {
      out.json = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      out.help = true
      continue
    }
    const m = /^--(plan|days|from|id)(?:=(.*))?$/.exec(arg)
    if (!m) throw new UsageError(`Okänt argument "${arg}". Kör med --help för hjälp.`)
    const value = m[2] ?? argv[++i]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`--${m[1]} behöver ett värde.`)
    out[m[1]] = value
  }
  return out
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

async function main(argv) {
  const args = parseArgs(argv)
  if (args.help) {
    console.log('Användning: LICENSE_PRIVATE_KEY=… node scripts/issue-license.mjs --plan ar|livstid [--days N] [--from ÅÅÅÅ-MM-DD] [--id ID] [--json]')
    return
  }
  const res = await issueLicense({
    plan: args.plan,
    days: args.days,
    from: args.from,
    id: args.id,
    privateKey: process.env.LICENSE_PRIVATE_KEY?.trim(),
    appPublicKey: process.env.VITE_LICENSE_PUBLIC_KEY?.trim(),
  })
  if (res.verified === false) {
    console.error(
      'Fel: licensen godkänns INTE av VITE_LICENSE_PUBLIC_KEY. Den privata och den publika nyckeln hör inte ihop – kontrollera att du använder samma nyckelpar som appen byggdes med.',
    )
    process.exit(1)
  }
  if (args.json) {
    console.log(JSON.stringify(res))
    return
  }
  const { payload } = res
  console.log(`
Licens utfärdad
  Plan:         ${PLANS[payload.plan].name}
  Licens-id:    ${payload.id}
  Gäller från:  ${dateFmt.format(payload.iat * 1000)}
  Gäller till:  ${payload.exp ? dateFmt.format(payload.exp * 1000) : 'för alltid'}
  Kontroll:     ${res.verified ? 'OK, godkänns av VITE_LICENSE_PUBLIC_KEY' : 'inte gjord – sätt VITE_LICENSE_PUBLIC_KEY för att kontrollera mot appens nyckel'}

Licensnyckel – skicka hela nyckeln till kunden, som klistrar in den i appen:

${res.licenseKey}
`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e instanceof UsageError ? `Fel: ${e.message}` : `Oväntat fel: ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  })
}
