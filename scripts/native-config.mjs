#!/usr/bin/env node
/**
 * Inställningar i de inbyggda projekten som beror på bygget (körs av `npm run build:android`).
 *
 *   node scripts/native-config.mjs
 *
 * Skriver android/app/src/main/res/values/lagom_generated.xml (checkas inte in) med
 * `health_connect_privacy_policy_url` = VITE_API_BASE + /integritet/. Health Connect visar den
 * sidan när användaren trycker på "Integritetspolicy" i behörighetsfrågan (Android 13 och äldre)
 * eller under Inställningar → Health Connect (Android 14+). Aktiviteten som visar den kommer från
 * @capgo/capacitor-health. Adressen ska vara densamma som integritetspolicyn i Play Console.
 *
 * VITE_API_BASE läses som Vite gör vid bygget (miljövariabler, .env, .env.local, .env.production).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadEnv } from 'vite'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ANDROID_VALUES = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values')

/** Integritetspolicyns adress på webbplatsen, eller ett fel på svenska. */
export function privacyPolicyUrl(apiBase) {
  const base = (apiBase ?? '').trim().replace(/\/+$/, '')
  let url
  try {
    url = new URL(`${base}/integritet/`)
  } catch {
    throw new Error('VITE_API_BASE saknas eller är ingen adress – sätt den till webbplatsens https-adress (se docs/NATIVE.md).')
  }
  if (url.protocol !== 'https:') throw new Error(`VITE_API_BASE (${base}) måste börja med https://.`)
  return url.href
}

/** XML-resursen med adressen (tecknen som är speciella i XML och Android-strängar skyddas). */
export function resourcesXml(policyUrl) {
  const escaped = policyUrl.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll("'", "\\'").replaceAll('"', '\\"')
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- Skapad av scripts/native-config.mjs vid bygget – ändra inte här. -->\n' +
    '<resources>\n' +
    '    <!-- Integritetspolicyn som Health Connect visar (@capgo/capacitor-health). -->\n' +
    `    <string name="health_connect_privacy_policy_url" translatable="false">${escaped}</string>\n` +
    '</resources>\n'
  )
}

async function main() {
  if (!existsSync(ANDROID_VALUES)) {
    console.log('android/ saknas – inget att göra.')
    return
  }
  const env = loadEnv('production', ROOT, 'VITE_')
  const url = privacyPolicyUrl(env.VITE_API_BASE)
  await mkdir(ANDROID_VALUES, { recursive: true })
  await writeFile(join(ANDROID_VALUES, 'lagom_generated.xml'), resourcesXml(url))
  console.log(`✓ Health Connect visar integritetspolicyn på ${url}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`Lagom: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
