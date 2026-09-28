#!/usr/bin/env node
/**
 * Skapar public/.well-known/assetlinks.json (Digital Asset Links) för Google Play-appen.
 *
 * Filen bevisar för Android att webbplatsen och Play-appen hör ihop. Utan den visar Play-appen
 * (en Trusted Web Activity) en adressrad överst, som i en vanlig webbläsare.
 *
 *   ANDROID_PACKAGE=se.exempel.lagom \
 *   ANDROID_SHA256="AA:BB:…:99,11:22:…:FF" \
 *   node scripts/generate-assetlinks.mjs [--out=public/.well-known/assetlinks.json]
 *
 * - ANDROID_PACKAGE: appens paketnamn i Play Console (omvänd domän, t.ex. se.exempel.lagom).
 *   Det går inte att ändra efter första uppladdningen.
 * - ANDROID_SHA256: SHA-256-fingeravtrycken för signeringsnycklarna, kommaseparerade. Ta med BÅDA:
 *     1. "App signing key certificate" (Play App Signing – Google signerar appen som laddas ned)
 *     2. "Upload key certificate" (din uppladdningsnyckel – används för interna tester)
 *   Båda finns i Play Console → Testa och släpp → Appintegritet → Appsignering.
 *   Ett fingeravtryck är 32 par hexsiffror med kolon emellan (AB:CD:…).
 *
 * Fingeravtrycken är inga hemligheter (de är offentliga i filen), men signeringsnyckeln
 * (.jks/.keystore) och dess lösenord är det – de checkas aldrig in (se .gitignore).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DEFAULT_OUT = join(ROOT, 'public', '.well-known', 'assetlinks.json')

export const RELATION = 'delegate_permission/common.handle_all_urls'

/** Paketnamn: minst två delar, varje del börjar med en bokstav (Androids regler). */
const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
/** Google Play tillåter högst 150 tecken. */
const PACKAGE_MAX = 150
/** SHA-256: 32 par hexsiffror med kolon emellan. */
const SHA256_RE = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/
const SHA1_RE = /^[0-9A-F]{2}(:[0-9A-F]{2}){19}$/

export class AssetLinksError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(`assetlinks.json kunde inte skapas:\n- ${problems.join('\n- ')}`)
    this.name = 'AssetLinksError'
    this.problems = problems
  }
}

/**
 * Kontrollera paketnamnet. Returnerar en lista med problem (tom om namnet är giltigt).
 * @param {unknown} pkg
 * @returns {string[]}
 */
export function packageProblems(pkg) {
  if (typeof pkg !== 'string' || pkg.trim() === '') {
    return ['ANDROID_PACKAGE saknas. Ange paketnamnet från Play Console, t.ex. se.exempel.lagom.']
  }
  const name = pkg.trim()
  if (name.length > PACKAGE_MAX) return [`Paketnamnet är ${name.length} tecken långt – högst ${PACKAGE_MAX} är tillåtet.`]
  if (!PACKAGE_RE.test(name)) {
    return [
      `Paketnamnet "${name}" är ogiltigt. Det ska vara en omvänd domän med minst två delar, t.ex. se.exempel.lagom – ` +
        'bara bokstäver (a–z), siffror och understreck, och varje del ska börja med en bokstav (inga å/ä/ö, bindestreck eller mellanslag).',
    ]
  }
  return []
}

/**
 * Normalisera och kontrollera fingeravtryck. Tomma poster hoppas över och dubbletter tas bort.
 * @param {readonly string[]} fingerprints
 * @returns {{ fingerprints: string[], problems: string[] }}
 */
export function checkFingerprints(fingerprints) {
  const problems = []
  const out = []
  const list = Array.isArray(fingerprints) ? fingerprints : []
  list.forEach((raw, i) => {
    if (typeof raw !== 'string') {
      problems.push(`Fingeravtryck ${i + 1} är inte text.`)
      return
    }
    const value = raw.trim().replace(/^SHA-?256:\s*/i, '').toUpperCase()
    if (value === '') return
    if (SHA256_RE.test(value)) {
      if (!out.includes(value)) out.push(value)
    } else if (SHA1_RE.test(value)) {
      problems.push(`Fingeravtryck ${i + 1} ser ut att vara SHA-1 (20 par). Använd SHA-256-fingeravtrycket (32 par) från Play Console.`)
    } else {
      const pairs = value.split(':').length
      problems.push(
        `Fingeravtryck ${i + 1} ("${raw.trim().slice(0, 24)}${raw.trim().length > 24 ? '…' : ''}") är ogiltigt: det ska vara 32 par hexsiffror (0–9, A–F) med kolon emellan` +
          (pairs > 1 ? ` – det här har ${pairs} delar.` : '.'),
      )
    }
  })
  if (out.length === 0 && problems.length === 0) {
    problems.push('ANDROID_SHA256 saknas. Ange SHA-256-fingeravtrycken för Play App Signing och uppladdningsnyckeln, kommaseparerade.')
  }
  return { fingerprints: out, problems }
}

/**
 * Bygg innehållet i assetlinks.json. Kastar AssetLinksError med alla problem på en gång.
 * @param {string} pkg
 * @param {readonly string[]} fingerprints
 */
export function buildAssetLinks(pkg, fingerprints) {
  const checked = checkFingerprints(fingerprints)
  const problems = [...packageProblems(pkg), ...checked.problems]
  if (problems.length > 0) throw new AssetLinksError(problems)
  return [
    {
      relation: [RELATION],
      target: {
        namespace: 'android_app',
        package_name: pkg.trim(),
        sha256_cert_fingerprints: checked.fingerprints,
      },
    },
  ]
}

/** Dela upp ANDROID_SHA256 ("AA:…, BB:…") i en lista. */
export function splitFingerprints(value) {
  return (value ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseArgs(argv) {
  const args = { out: DEFAULT_OUT }
  for (const a of argv) {
    const m = a.match(/^--out=(.+)$/)
    if (m) args.out = resolve(process.cwd(), m[1])
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error(`Okänt argument: ${a}`)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('Användning: ANDROID_PACKAGE=se.exempel.lagom ANDROID_SHA256="AA:…,BB:…" node scripts/generate-assetlinks.mjs [--out=public/.well-known/assetlinks.json]')
    return
  }
  const statements = buildAssetLinks(process.env.ANDROID_PACKAGE ?? '', splitFingerprints(process.env.ANDROID_SHA256))
  await mkdir(dirname(args.out), { recursive: true })
  await writeFile(args.out, `${JSON.stringify(statements, null, 2)}\n`)
  const n = statements[0].target.sha256_cert_fingerprints.length
  console.log(`✓ ${args.out}`)
  console.log(`  ${statements[0].target.package_name} med ${n} fingeravtryck${n === 1 ? ' (tips: ta med både Play App Signing och uppladdningsnyckeln)' : ''}.`)
  console.log('  Publicera webbplatsen och kontrollera sedan med:')
  console.log('  https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<din-domän>&relation=delegate_permission/common.handle_all_urls')
}

// Kör bara när filen startas direkt (så att funktionerna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
