/**
 * Molnbyggena för butiksapparna – `.github/workflows/native.yml` (kontrollbygge),
 * `.github/workflows/release.yml` (signerat, till TestFlight och Google Play) och `codemagic.yaml` –
 * och dokumenten runt dem. Byggena kan inte köras här (Xcode och Android SDK saknas), så testerna
 * kontrollerar att filerna hänger ihop med projekten och aldrig gör ett testbygge för butikerna.
 * Filerna är YAML; här läses texten (inga nya paket).
 */
import { describe, expect, it } from 'vitest'
import { STORE_PRODUCT_IDS } from '../lib/storePurchases'

interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
}
interface NodeUrl {
  fileURLToPath(url: string): string
}
interface NodePath {
  dirname(p: string): string
  resolve(...parts: string[]): string
}

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>

/** Läs en fil i repot (sökväg relativt roten). */
async function readRepoFile(path: string): Promise<string> {
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  const { fileURLToPath } = await nodeModule<NodeUrl>('node:url')
  const { dirname, resolve } = await nodeModule<NodePath>('node:path')
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../..', path), 'utf8')
}

/**
 * Blocket under `key:` med exakt `indent` blanksteg framför (t.ex. ett jobb på indentering 2):
 * raden själv och alla följande rader som är tomma eller mer indenterade.
 */
function block(yaml: string, key: string, indent: number): string {
  const lines = yaml.split('\n')
  const head = `${' '.repeat(indent)}${key}:`
  const start = lines.findIndex((line) => line === head || line.startsWith(`${head} `))
  if (start === -1) throw new Error(`Hittar inte ${key}: på indentering ${indent}`)
  const out = [lines[start]]
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && line.length - line.trimStart().length <= indent) break
    out.push(line)
  }
  return out.join('\n')
}

/** Listan (`- värde`) direkt under `key:` i ett block. */
function listUnder(text: string, key: string): string[] {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === `${key}:`)
  if (start === -1) return []
  const items: string[] = []
  for (const line of lines.slice(start + 1)) {
    const match = /^\s*-\s+(.+?)\s*$/.exec(line)
    if (!match) break
    items.push(match[1])
  }
  return items
}

/** Miljövariablerna som android/app/build.gradle läser för uppladdningsnyckeln. */
function gradleKeystoreEnv(gradle: string): string[] {
  return [...new Set([...gradle.matchAll(/getenv\('(LAGOM_UPLOAD_[A-Z_]+)'\)/g)].map((m) => m[1]))].sort()
}

const APP_ID = 'se.lagomappen.lagom'
const ARTIFACT_URL = 'https://claude.ai/artifact/7ysdpNCMhY6366LEWtjGXE'

describe('app-id:t', () => {
  it('är detsamma i Capacitor, Xcode, Gradle och molnbyggena', async () => {
    const capacitor = await readRepoFile('capacitor.config.ts')
    const gradle = await readRepoFile('android/app/build.gradle')
    const pbxproj = await readRepoFile('ios/App/App.xcodeproj/project.pbxproj')
    const release = await readRepoFile('.github/workflows/release.yml')
    const codemagic = await readRepoFile('codemagic.yaml')

    expect(capacitor).toContain(`appId: '${APP_ID}'`)
    expect(gradle).toContain(`applicationId "${APP_ID}"`)
    const bundleIds = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1])
    expect(bundleIds.length).toBeGreaterThan(0)
    expect(new Set(bundleIds)).toEqual(new Set([APP_ID]))
    expect(release).toContain(`LAGOM_APP_ID: ${APP_ID}`)
    expect(codemagic.match(new RegExp(`LAGOM_APP_ID: ${APP_ID.replaceAll('.', '\\.')}`, 'g'))).toHaveLength(2)
  })
})

describe('release.yml – signerade butiksbyggen', () => {
  it('körs bara vid versionstaggar och för hand', async () => {
    const release = await readRepoFile('.github/workflows/release.yml')
    const on = block(release, 'on', 0)
    expect(on).toContain("tags: ['v*']")
    expect(on).toContain('workflow_dispatch:')
    expect(on).not.toContain('pull_request')
    expect(on).not.toContain('branches')
  })

  it('bygger aldrig ett testbygge och kräver skarpt läge', async () => {
    const release = await readRepoFile('.github/workflows/release.yml')
    expect(release).not.toMatch(/^\s*LAGOM_ALLOW_STORE_WITHOUT_IAP:/m)
    expect(release).not.toMatch(/^\s*VITE_ACCEPT_TEST_PURCHASES:/m)
    expect(release).toContain('"${VITE_COMMERCE_MODE:-}" != live')
    // Webbdelen får säljaruppgifterna och licensnyckeln från Variables, inte från testvärden.
    for (const name of ['VITE_API_BASE', 'VITE_SELLER_NAME', 'VITE_SELLER_ADDRESS', 'VITE_SELLER_PHONE', 'VITE_SUPPORT_EMAIL', 'VITE_LICENSE_PUBLIC_KEYS']) {
      expect(release).toContain(`${name}: \${{ vars.${name} }}`)
    }
    expect(release).not.toMatch(/vars\.VITE_[A-Z_]+ \|\|/)
  })

  it('hemligheterna finns bara i de steg som behöver dem', async () => {
    const release = await readRepoFile('.github/workflows/release.yml')
    expect(block(release, 'env', 0)).not.toContain('secrets.')
    for (const job of ['forutsattningar', 'android', 'ios']) {
      const jobText = block(release, job, 2)
      const jobEnv = jobText.split('\n').some((line) => line === '    env:') ? block(jobText, 'env', 4) : ''
      expect(jobEnv, job).not.toContain('secrets.')
    }
    // Inte under npm ci eller vite build.
    const android = block(release, 'android', 2)
    const npmCi = android.slice(android.indexOf('- name: Installera beroenden'), android.indexOf('- name: Uppladdningsnyckeln'))
    expect(npmCi).not.toContain('secrets.')
  })

  it('använder uppladdningsnyckelns namn som android/app/build.gradle läser', async () => {
    const gradle = await readRepoFile('android/app/build.gradle')
    const names = gradleKeystoreEnv(gradle)
    expect(names).toEqual(['LAGOM_UPLOAD_KEYSTORE', 'LAGOM_UPLOAD_KEYSTORE_PASSWORD', 'LAGOM_UPLOAD_KEY_ALIAS', 'LAGOM_UPLOAD_KEY_PASSWORD'])
    const gradleStep = block(await readRepoFile('.github/workflows/release.yml'), 'android', 2)
    for (const name of names) expect(gradleStep).toMatch(new RegExp(`^\\s+${name}: `, 'm'))
    expect(gradle).toContain("findProperty('lagomVersionCode')")
    expect(gradleStep).toContain('bundleRelease -PlagomVersionCode="$BUILD_NUMBER"')
  })

  it('startar bara jobben (och macOS-maskinen) när förutsättningarna finns', async () => {
    const release = await readRepoFile('.github/workflows/release.yml')
    const android = block(release, 'android', 2)
    const ios = block(release, 'ios', 2)
    expect(android).toContain("if: needs.forutsattningar.outputs.android == 'true'")
    expect(ios).toContain("if: needs.forutsattningar.outputs.ios == 'true'")
    expect(ios).toMatch(/runs-on: macos-/)
    expect(block(release, 'forutsattningar', 2)).toContain('runs-on: ubuntu-latest')
    expect(android).toContain("if: needs.forutsattningar.outputs.play == 'true'")
    expect(ios).toContain("if: needs.forutsattningar.outputs.testflight == 'true'")
  })

  it('låser actions från tredje part till en commit', async () => {
    for (const file of ['.github/workflows/release.yml', '.github/workflows/native.yml', '.github/workflows/ci.yml']) {
      const uses = [...(await readRepoFile(file)).matchAll(/uses:\s*(\S+)/g)].map((m) => m[1])
      for (const action of uses.filter((a) => !a.startsWith('actions/'))) {
        expect(action, `${file}: ${action}`).toMatch(/@[0-9a-f]{40}$/)
      }
    }
  })

  it('dokumenterar varje hemlighet och variabel i docs/NATIVE.md', async () => {
    const release = await readRepoFile('.github/workflows/release.yml')
    const native = await readRepoFile('docs/NATIVE.md')
    const secrets = new Set([...release.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))
    const vars = new Set([...release.matchAll(/vars\.([A-Z0-9_]+)/g)].map((m) => m[1]))
    expect(secrets.size).toBeGreaterThanOrEqual(9)
    for (const name of [...secrets, ...vars]) expect(native, name).toContain(`\`${name}\``)
  })
})

describe('native.yml – kontrollbygget', () => {
  it('signerar inget, laddar inte upp och bygger webbdelen som testbygge', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    expect(native).not.toContain('secrets.')
    expect(native).toContain("LAGOM_ALLOW_STORE_WITHOUT_IAP: '1'")
    expect(native).toContain('CODE_SIGNING_ALLOWED=NO')
  })

  it('kör bara iPhone-bygget (macOS) på begäran', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    const ios = block(native, 'ios', 2)
    expect(ios).toContain("if: github.event_name == 'workflow_dispatch' && inputs.ios")
    expect(block(native, 'android', 2)).toContain('runs-on: ubuntu-latest')
  })

  it('bevakar det som påverkar appskalet, lika för pull requests och main', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    const on = block(native, 'on', 0)
    const pr = listUnder(block(on, 'pull_request', 2), 'paths')
    const push = listUnder(block(on, 'push', 2), 'paths')
    expect(push).toEqual(pr)
    for (const path of [
      'android/**',
      'ios/**',
      'capacitor.config.ts',
      'package.json',
      'package-lock.json',
      'vite.config.ts',
      'src/native/**',
      'src/lib/storePurchases.ts',
      'scripts/commerce-guard.ts',
      'scripts/native-config.mjs',
      'scripts/check-android-16kb.mjs',
    ]) {
      expect(pr, path).toContain(path)
    }
  })
})

describe('ci.yml – varje ändring', () => {
  it('bygger också butiksvarianterna av webbdelen (utan SDK), så att ett brutet butiksbygge märks direkt', async () => {
    const ci = await readRepoFile('.github/workflows/ci.yml')
    expect(ci).toContain('VITE_DISTRIBUTION=appstore npx vite build')
    expect(ci).toContain('VITE_DISTRIBUTION=play npx vite build')
    expect(ci).toContain("LAGOM_ALLOW_STORE_WITHOUT_IAP: '1'")
    expect(ci).not.toContain('secrets.')
  })
})

describe('codemagic.yaml', () => {
  it('använder bara gratisnivåns maskin och aldrig testbyggen', async () => {
    const codemagic = await readRepoFile('codemagic.yaml')
    const types = [...codemagic.matchAll(/instance_type:\s*(\S+)/g)].map((m) => m[1])
    expect(types).toEqual(['mac_mini_m2', 'mac_mini_m2'])
    expect(codemagic).not.toMatch(/^\s*LAGOM_ALLOW_STORE_WITHOUT_IAP:/m)
    expect(codemagic).not.toMatch(/LAGOM_ALLOW_STORE_WITHOUT_IAP=1/)
    expect(codemagic).toContain('"${VITE_COMMERCE_MODE:-}" != live')
  })

  it('lämnar uppladdningsnyckeln till build.gradle under samma namn', async () => {
    const codemagic = await readRepoFile('codemagic.yaml')
    for (const name of gradleKeystoreEnv(await readRepoFile('android/app/build.gradle'))) {
      expect(codemagic).toContain(`export ${name}=`)
    }
    expect(codemagic).toContain('bundleRelease -PlagomVersionCode="$LAGOM_BUILD_NUMBER"')
  })
})

describe('dokumenten', () => {
  it('har produkternas id:n från src/lib/storePurchases.ts', async () => {
    const native = await readRepoFile('docs/NATIVE.md')
    const appStore = await readRepoFile('docs/APP-STORE.md')
    const play = await readRepoFile('docs/GOOGLE-PLAY.md')
    for (const id of STORE_PRODUCT_IDS) {
      expect(native, id).toContain(`\`${id}\``)
      expect(appStore, id).toContain(`\`${id}\``)
    }
    // prov14 finns bara i App Store (Play räknar provperioden i appen).
    for (const id of STORE_PRODUCT_IDS.filter((p) => p !== 'prov14')) expect(play, id).toContain(`\`${id}\``)
  })

  it('deklarerar varje Health Connect-behörighet i manifestet för Play Console', async () => {
    const manifest = await readRepoFile('android/app/src/main/AndroidManifest.xml')
    const play = await readRepoFile('docs/GOOGLE-PLAY.md')
    const used = [...manifest.matchAll(/<uses-permission android:name="android\.permission\.health\.([A-Z_]+)"\s*\/>/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    for (const permission of used) expect(play, permission).toContain(permission)
  })

  it('Health Connect: bara de behörigheter som Lagoms val använder (inte aktiv energi)', async () => {
    const manifest = await readRepoFile('android/app/src/main/AndroidManifest.xml')
    const used = [...manifest.matchAll(/<uses-permission android:name="android\.permission\.health\.([A-Z_]+)"\s*\/>/g)].map((m) => m[1]).sort()
    // HEALTH_CHOICE_TYPES i src/native/health.ts: vikt (läsa/skriva), steg (läsa), energi och vatten (skriva).
    expect(used).toEqual(['READ_STEPS', 'READ_WEIGHT', 'WRITE_HYDRATION', 'WRITE_NUTRITION', 'WRITE_WEIGHT'])
    expect(manifest).toMatch(/android\.permission\.health\.READ_ACTIVE_CALORIES_BURNED" tools:node="remove"/)
    const plist = await readRepoFile('ios/App/App/Info.plist')
    const share = /<key>NSHealthShareUsageDescription<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? ''
    expect(share).toContain('vikt och steg')
    expect(share).not.toMatch(/aktiv energi/i)
    const play = await readRepoFile('docs/GOOGLE-PLAY.md')
    expect(play).not.toMatch(/\| `READ_ACTIVE_CALORIES_BURNED` \| Läsa/)
  })

  it('Android: ML Kit startar inte (ZXing läser streckkoderna) och delningen når bara exportmappen', async () => {
    const manifest = await readRepoFile('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toMatch(/android:name="com\.google\.mlkit\.common\.internal\.MlKitInitProvider"[^>]*tools:node="remove"/)
    const paths = await readRepoFile('android/app/src/main/res/xml/file_paths.xml')
    expect(paths).not.toContain('<files-path')
    expect(paths).toContain('<cache-path name="delning" path="delning/" />')
  })

  it('iPhone: "Spara bild" kraschar inte appen (texten för Bilder finns)', async () => {
    const plist = await readRepoFile('ios/App/App/Info.plist')
    expect(plist).toMatch(/<key>NSPhotoLibraryAddUsageDescription<\/key>\s*<string>[^<]*Bilder[^<]*<\/string>/)
    expect(plist).not.toContain('NSPhotoLibraryUsageDescription')
    // …och menyn med "Spara bild" visas inte ens: långtrycket på bilder är avstängt i apparna.
    const css = await readRepoFile('src/index.css')
    expect(css).toMatch(/html\.native-app img\s*\{\s*-webkit-touch-callout:\s*none;/)
  })

  it('Play-dokumentet beskriver Capacitor-appen, inte Bubblewrap', async () => {
    const play = await readRepoFile('docs/GOOGLE-PLAY.md')
    expect(play).not.toContain('npx @bubblewrap/cli')
    expect(play).toContain('Health Connect')
    expect(play).toContain('LAGOM_UPLOAD_KEYSTORE_BASE64')
  })

  it('LANSERING.md länkar lanseringslistan', async () => {
    expect(await readRepoFile('docs/LANSERING.md')).toContain(ARTIFACT_URL)
  })
})
