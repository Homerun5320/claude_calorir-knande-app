#!/usr/bin/env node
/**
 * Inställningar i de inbyggda projekten som beror på bygget (körs av `npm run build:android`, efter
 * `VITE_DISTRIBUTION=play vite build`).
 *
 *   node scripts/native-config.mjs
 *
 * Skriver android/app/src/main/res/values/lagom_generated.xml (checkas inte in) med
 * `health_connect_privacy_policy_url` = file:///android_asset/public/privacypolicy.html. Health
 * Connect visar den sidan när användaren trycker på "Integritetspolicy" i behörighetsfrågan
 * (Android 13 och äldre) eller under Inställningar → Health Connect (Android 14+). Aktiviteten som
 * visar den kommer från @capgo/capacitor-health (en WebView som följer länkar).
 *
 * Sidan är integritetspolicyn för Android-appen (public/integritet/android/, skapad ur
 * src/features/legal/legalContent.ts), som Google Play-bygget lägger i appens paket
 * (dist-native/privacypolicy.html, se vite.config.ts). Den ligger alltså i appen och fungerar utan
 * uppkoppling, och den saknar länkar vidare – till exempel till webbplatsens villkor med webbpriser,
 * som Play-appen inte ska leda till. Integritetspolicyns adress i Play Console är fortfarande
 * webbplatsens (https://<domän>/integritet/ eller /integritet/android/).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ANDROID_VALUES = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'values')

/** Filen i appens paket (dist-native/ kopieras till android/app/src/main/assets/public/ av cap sync). */
export const PRIVACY_FILE = 'privacypolicy.html'

/** Adressen som Health Connect-aktiviteten öppnar (tilläggets egen standard, uttryckligen). */
export const PRIVACY_POLICY_URL = `file:///android_asset/public/${PRIVACY_FILE}`

/** XML-resursen med adressen (tecknen som är speciella i XML och Android-strängar skyddas). */
export function resourcesXml(policyUrl) {
  const escaped = policyUrl.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll("'", "\\'").replaceAll('"', '\\"')
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!-- Skapad av scripts/native-config.mjs vid bygget – ändra inte här. -->\n' +
    '<resources>\n' +
    '    <!-- Integritetspolicyn som Health Connect visar (@capgo/capacitor-health) – i appens paket. -->\n' +
    `    <string name="health_connect_privacy_policy_url" translatable="false">${escaped}</string>\n` +
    '</resources>\n'
  )
}

async function main() {
  if (!existsSync(ANDROID_VALUES)) {
    console.log('android/ saknas – inget att göra.')
    return
  }
  if (!existsSync(join(ROOT, 'dist-native', PRIVACY_FILE))) {
    throw new Error(`dist-native/${PRIVACY_FILE} saknas – bygg först webbdelen för Google Play: VITE_DISTRIBUTION=play npx vite build (eller npm run build:android).`)
  }
  await mkdir(ANDROID_VALUES, { recursive: true })
  await writeFile(join(ANDROID_VALUES, 'lagom_generated.xml'), resourcesXml(PRIVACY_POLICY_URL))
  console.log(`✓ Health Connect visar integritetspolicyn i appen (${PRIVACY_POLICY_URL})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(`Lagom: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
}
