/**
 * Molnbyggena för butiksapparna – `.github/workflows/native.yml` (kontrollbygge),
 * `.github/workflows/release.yml` (signerat, till TestFlight och Google Play) och `codemagic.yaml` –
 * och dokumenten runt dem. Byggena kan inte köras här (Xcode och Android SDK saknas), så testerna
 * kontrollerar att filerna hänger ihop med projekten och aldrig gör ett testbygge för butikerna.
 * Filerna är YAML; här läses texten (inga nya paket).
 */
import { describe, expect, it } from 'vitest'
import { FASTING_PROTOCOLS, MAX_FAST_HOURS, MIN_SAVED_FAST_MS } from '../features/activity/fastingLogic'
import { STORE_PRODUCT_IDS } from '../lib/storePurchases'

interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
}
interface NodeUrl {
  fileURLToPath(url: string): string
  pathToFileURL(path: string): { href: string }
}
interface NodePath {
  dirname(p: string): string
  resolve(...parts: string[]): string
}

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>

/** En sökväg i repot (relativt roten) som absolut sökväg. */
async function repoPath(path: string): Promise<string> {
  const { fileURLToPath } = await nodeModule<NodeUrl>('node:url')
  const { dirname, resolve } = await nodeModule<NodePath>('node:path')
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..', path)
}

/** Läs en fil i repot (sökväg relativt roten). */
async function readRepoFile(path: string): Promise<string> {
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  return readFile(await repoPath(path), 'utf8')
}

/** Det testet läser ur Xcode-projektet (tolkat av scripts/pbxproj.mjs, samma som scripts/ios-widget.mjs). */
interface PbxObject {
  isa?: string
  name?: string
  buildConfigurationList?: string
  buildConfigurations?: string[]
  buildSettings?: Record<string, unknown>
}
interface PbxprojModule {
  parsePbxproj(text: string): { objects: Record<string, PbxObject> }
}

/** `PRODUCT_BUNDLE_IDENTIFIER` för varje mål och konfiguration, t.ex. `{ 'App/Release': 'se.…' }`. */
async function xcodeBundleIds(): Promise<Record<string, unknown>> {
  const { pathToFileURL } = await nodeModule<NodeUrl>('node:url')
  const { parsePbxproj } = await nodeModule<PbxprojModule>(pathToFileURL(await repoPath('scripts/pbxproj.mjs')).href)
  const { objects } = parsePbxproj(await readRepoFile('ios/App/App.xcodeproj/project.pbxproj'))
  const ids: Record<string, unknown> = {}
  for (const target of Object.values(objects).filter((o) => o.isa === 'PBXNativeTarget')) {
    const configs = objects[target.buildConfigurationList ?? '']?.buildConfigurations ?? []
    for (const config of configs.map((id) => objects[id])) {
      ids[`${target.name}/${config?.name}`] = config?.buildSettings?.PRODUCT_BUNDLE_IDENTIFIER
    }
  }
  return ids
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

/** Ett kodblock utan språk (```) i ett dokument, med rubriken ovanför och antalet som står efter. */
interface DocBlock {
  heading: string
  text: string
  /** "(76 tecken.)" eller "(94 byte …)" direkt efter blocket, om det står något. */
  statedCount?: number
  /** Enheten för `statedCount`: tecken (kodpunkter) eller byte (UTF-8, App Stores nyckelord). */
  statedUnit?: 'tecken' | 'byte'
}

/** Avsnittet `## <title>` (till nästa `## `). */
function mdSection(md: string, title: string): string {
  const start = md.indexOf(`\n## ${title}\n`)
  if (start === -1) throw new Error(`Hittar inte avsnittet ${title}`)
  const end = md.indexOf('\n## ', start + 1)
  return md.slice(start, end === -1 ? undefined : end)
}

/** Kodblocken utan språk i ordning, var och en med närmaste rubrik ovanför (utan #). */
function docBlocks(md: string): DocBlock[] {
  const lines = md.split('\n')
  const blocks: DocBlock[] = []
  let heading = ''
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{1,6}\s+(.+)$/.exec(lines[i])
    if (h) heading = h[1].trim()
    if (!lines[i].startsWith('```')) continue
    let end = i + 1
    while (end < lines.length && !/^```\s*$/.test(lines[end])) end++
    if (lines[i] === '```') {
      const next = lines.slice(end + 1).find((line) => line.trim() !== '') ?? ''
      const count = /^\((\d{1,3}(?: \d{3})*) (tecken|byte)(?!\p{L})/u.exec(next)
      blocks.push({
        heading,
        text: lines.slice(i + 1, end).join('\n'),
        statedCount: count ? Number(count[1].replaceAll(' ', '')) : undefined,
        statedUnit: count ? (count[2] as 'tecken' | 'byte') : undefined,
      })
    }
    i = end
  }
  return blocks
}

/** Alla block under rubriken som börjar med `prefix` – minst ett, annars fel. */
function blocksUnder(blocks: readonly DocBlock[], prefix: string): string[] {
  const found = blocks.filter((b) => b.heading.startsWith(prefix)).map((b) => b.text)
  if (found.length === 0) throw new Error(`Inget kodblock under rubriken "${prefix} …"`)
  return found
}

/** Antal tecken som butikerna räknar dem (kodpunkter; radbrytningar räknas). */
const chars = (text: string): number => [...text].length
/** Antal byte i UTF-8 – App Store Connect räknar nyckelorden så (å, ä och ö är två byte var). */
const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length

/** Hela ord eller fraser, oberoende av å/ä/ö runt omkring (JavaScripts \b känner inte igen dem). */
function wordPattern(words: readonly string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`, 'iu')
}

/** Rankning och pris (App Store 2.3.7, Googles metadatapolicy). */
const RANKING_WORDS = wordPattern(['gratis', 'bäst', 'bästa', 'billigast', 'nr 1', 'nr. 1', 'nummer 1', 'nummer ett', 'etta', 'topp'])
/** Köp utanför butiken eller webbversionen (App Store 3.1.1 och 2.3.10, Play: inga andra butiker). */
const OUTSIDE_PURCHASE = /webbköp|köp(?:t|er)?\s+på\s+webben|licensnyckel|licensnycklar|stripe|webbversion|webbläsar|webbplats/i
/** Röstsökningen finns bara på webben – aldrig i apparna. */
const VOICE_SEARCH = /(?<!\p{L})(?:röst|mikrofon|taligenkänning|tala\s+in)/iu
/** Allergier: bara vad Open Food Facts anger, med källan – aldrig löften (CLAUDE.md, lib/allergens.ts). */
const ALLERGY_PROMISES =
  /(?<!\p{L})(?:säker|säkert|säkra)(?!\p{L})|fri\s+från|fritt\s+från|fria\s+från|innehåller\s+inte|allergisäker|allergivänlig|allergifri|utan\s+allergener|garanter/iu
/** Ingen antydan om att Lagom hör ihop med Livsmedelsverket (eller någon annan myndighet). */
const AUTHORITY_LINK = /i\s+samarbete\s+med|godkänd\s+av|rekommenderad\s+av|på\s+uppdrag\s+av|officiell/i
/** Tonen (CLAUDE.md "Ton"): inga streaks, ingen skuld eller skam kring mat. */
const GUILT = /streak|fusk|synda|syndig|dåligt\s+samvete|skäms|straff/i
/** Fastan beskrivs utan hälsopåståenden, löften eller beröm (CLAUDE.md "Ton"; samma regler som sidan Fasta i appen). */
const FASTING_CLAIMS =
  /bränn(?:er|a|ing)|fettförbränning|autofagi|detox|snabbare\s+viktnedgång|ämnesomsättning|insulinkänslighet|gå\s+ner\s+i\s+vikt|bra\s+jobbat|nå\s+målet|garanter/iu
/** Andra plattformar i App Store-texterna (2.3.10). */
const NOT_IN_APP_STORE = /android|google|health\s+connect|samsung|huawei|windows/i
/** Andra plattformar i Play-texterna. */
const NOT_IN_PLAY = /(?<!\p{L})(?:iphone|ipad|ios|apple|app\s+store|healthkit|icloud|skanna\s+text|live\s+text|siri)(?!\p{L})/iu
/** Ett pris i kronor (utom provperiodens köp för 0 kr i App Store). */
const PRICE = /(?<![\d,])[1-9]\d*(?:[ \u00a0]\d{3})*(?:,\d+)?\s*(?:kr|kronor|:-)(?!\p{L})/iu

const APP_ID = 'se.lagomappen.lagom'
/** iPhone-widgetens eget Bundle ID (målet LagomWidgetExtension, docs/WIDGET.md §8) – alltid appens + ".widget". */
const WIDGET_BUNDLE_ID = `${APP_ID}.widget`
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
    // Appen har app-id:t och widgetmålet sitt eget under det – i båda konfigurationerna.
    expect(await xcodeBundleIds()).toEqual({
      'App/Debug': APP_ID,
      'App/Release': APP_ID,
      'LagomWidgetExtension/Debug': WIDGET_BUNDLE_ID,
      'LagomWidgetExtension/Release': WIDGET_BUNDLE_ID,
    })
    const bundleIds = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1])
    expect(new Set(bundleIds)).toEqual(new Set([APP_ID, WIDGET_BUNDLE_ID]))
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
      // iPhone-widgetens brytare och projektläsaren (iPhone-bygget kör dem).
      'scripts/ios-widget.mjs',
      'scripts/pbxproj.mjs',
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

/** Butikstexterna i dokumenten: kodblocken under rubrikerna i App Store §4 och Google Play §5. */
async function storeTexts() {
  const apple = docBlocks(mdSection(await readRepoFile('docs/APP-STORE.md'), '4. Butikstexter'))
  const play = docBlocks(mdSection(await readRepoFile('docs/GOOGLE-PLAY.md'), '5. Butikstexter'))
  return {
    apple,
    play,
    appStore: {
      names: blocksUnder(apple, 'Namn '),
      subtitle: blocksUnder(apple, 'Undertitel')[0],
      promo: blocksUnder(apple, 'Kampanjtext')[0],
      description: blocksUnder(apple, 'Beskrivning')[0],
      keywords: blocksUnder(apple, 'Nyckelord')[0],
      news: blocksUnder(apple, 'Nyheter i den här versionen')[0],
    },
    googlePlay: {
      name: blocksUnder(play, 'Appnamn')[0],
      short: blocksUnder(play, 'Kort beskrivning')[0],
      description: blocksUnder(play, 'Fullständig beskrivning')[0],
      releaseNotes: blocksUnder(play, 'Versionsinformation')[0],
    },
  }
}

describe('butikstexterna (docs/APP-STORE.md §4 och docs/GOOGLE-PLAY.md §5)', () => {
  it('håller butikernas gränser för antal tecken', async () => {
    const { appStore, googlePlay } = await storeTexts()
    const limits: Array<[string, string, number]> = [
      ...appStore.names.map((name): [string, string, number] => ['App Store: namn', name, 30]),
      ['App Store: undertitel', appStore.subtitle, 30],
      ['App Store: kampanjtext', appStore.promo, 170],
      ['App Store: beskrivning', appStore.description, 4000],
      ['App Store: nyckelord', appStore.keywords, 100],
      ['App Store: nyheter', appStore.news, 4000],
      ['Google Play: appnamn', googlePlay.name, 30],
      ['Google Play: kort beskrivning', googlePlay.short, 80],
      ['Google Play: fullständig beskrivning', googlePlay.description, 4000],
      ['Google Play: versionsinformation', googlePlay.releaseNotes, 500],
    ]
    for (const [what, text, max] of limits) {
      expect(text.trim().length, `${what} är tom`).toBeGreaterThan(0)
      expect(chars(text), what).toBeLessThanOrEqual(max)
      // Teckenantalet räknas på sammansatta tecken (å, ä, ö som ett tecken var).
      expect(text, `${what}: inte NFC`).toBe(text.normalize('NFC'))
      expect(text, `${what}: blanksteg i början eller slutet`).toBe(text.trim())
    }
    // Nyckelorden: högst 100 byte i App Store Connect, inte 100 tecken – "kaloriräknare" och "hälsa"
    // kostar en byte extra var.
    expect(utf8Bytes(appStore.keywords), 'App Store: nyckelord (byte)').toBeLessThanOrEqual(100)
  })

  it('teckenantalen som står efter texterna stämmer', async () => {
    const { apple, play } = await storeTexts()
    const stated = [...apple, ...play].filter((b) => b.statedCount !== undefined)
    expect(stated.length).toBeGreaterThanOrEqual(8)
    for (const block of stated) {
      expect(block.statedUnit === 'byte' ? utf8Bytes(block.text) : chars(block.text), block.heading).toBe(block.statedCount)
    }
    // Nyckelordens antal står i byte (App Store Connects gräns).
    expect(apple.find((b) => b.heading.startsWith('Nyckelord'))?.statedUnit).toBe('byte')
  })

  it('App Store: "Nyheter" finns inte för den första versionen – texten gäller en uppdatering', async () => {
    const { appStore } = await storeTexts()
    const section = mdSection(await readRepoFile('docs/APP-STORE.md'), '4. Butikstexter')
    expect(section).toContain('Fältet finns inte för appens första version i App Store Connect')
    // En text om "den första versionen" skulle visas först vid uppdateringen – och då vara fel.
    expect(appStore.news).not.toMatch(/första\s+versionen|välkommen\s+till/i)
  })

  it('nyckelorden: kommaseparerade utan mellanslag, utan dubbletter och utan ord ur namnet eller undertiteln', async () => {
    const { appStore } = await storeTexts()
    expect(appStore.keywords).toMatch(/^[^,\s]+(?:,[^,\s]+)*$/)
    const words = appStore.keywords.split(',').map((w) => w.toLocaleLowerCase('sv-SE'))
    expect(new Set(words).size).toBe(words.length)
    const taken = new Set(
      [...appStore.names, appStore.subtitle].flatMap((t) => t.toLocaleLowerCase('sv-SE').split(/[^\p{L}\p{N}]+/u)).filter((w) => w !== ''),
    )
    for (const word of words) expect(taken.has(word), word).toBe(false)
    // Aldrig namn på myndigheter, tjänster eller andra appar.
    expect(appStore.keywords).not.toMatch(/livsmedelsverket|1177|open ?food ?facts|myfitnesspal|lifesum|apple|app ?store/i)
  })

  it('inga rankingord, priser, emoji, köp utanför butiken, röstsökning, allergilöften, myndighetskoppling eller skuld', async () => {
    const { appStore, googlePlay } = await storeTexts()
    const all: Array<[string, string]> = [
      ...appStore.names.map((name): [string, string] => ['App Store: namn', name]),
      ['App Store: undertitel', appStore.subtitle],
      ['App Store: kampanjtext', appStore.promo],
      ['App Store: beskrivning', appStore.description],
      ['App Store: nyckelord', appStore.keywords],
      ['App Store: nyheter', appStore.news],
      ['Google Play: appnamn', googlePlay.name],
      ['Google Play: kort beskrivning', googlePlay.short],
      ['Google Play: fullständig beskrivning', googlePlay.description],
      ['Google Play: versionsinformation', googlePlay.releaseNotes],
    ]
    for (const [what, text] of all) {
      expect(text, what).not.toMatch(RANKING_WORDS)
      expect(text, what).not.toMatch(PRICE)
      expect(text, what).not.toMatch(/\p{Extended_Pictographic}/u)
      expect(text, what).not.toMatch(OUTSIDE_PURCHASE)
      expect(text, what).not.toMatch(VOICE_SEARCH)
      expect(text, what).not.toMatch(ALLERGY_PROMISES)
      expect(text, what).not.toMatch(AUTHORITY_LINK)
      expect(text, what).not.toMatch(GUILT)
    }
    // Namn, undertitel, nyckelord och kort beskrivning: inte ens ordet pris eller kronor.
    for (const text of [...appStore.names, appStore.subtitle, appStore.keywords, googlePlay.name, googlePlay.short]) {
      expect(text).not.toMatch(wordPattern(['kr', 'kronor', 'pris', 'priset', 'priser', 'rabatt', 'rea']))
    }
  })

  it('App Store-texterna nämner inga andra plattformar och Play-texterna varken iPhone eller Apple', async () => {
    const { appStore, googlePlay } = await storeTexts()
    for (const text of [...appStore.names, appStore.subtitle, appStore.promo, appStore.description, appStore.keywords, appStore.news]) {
      expect(text).not.toMatch(NOT_IN_APP_STORE)
    }
    for (const text of [googlePlay.name, googlePlay.short, googlePlay.description, googlePlay.releaseNotes]) {
      expect(text).not.toMatch(NOT_IN_PLAY)
    }
  })

  it('beskrivningarna har det som krävs: Hälsa-raden, källorna, provperioden, stödet och förbehållet', async () => {
    const { appStore, googlePlay } = await storeTexts()
    // HealthKit (2.5.1): beskrivningen säger att appen använder Apple Hälsa – och vad som händer med uppgifterna.
    expect(appStore.description).toContain('• Koppla till Apple Hälsa om du vill: hämta vikt och steg, och spara energi, vatten och vikt')
    expect(appStore.description).toContain('Uppgifter från Apple Hälsa läses och sparas bara i telefonen och används aldrig för reklam')
    expect(googlePlay.description).toContain('• Koppla till Health Connect om du vill')
    // Myndighetsinformation i Play: källan med adress.
    expect(googlePlay.description).toContain('Källa: https://soknaringsinnehall.livsmedelsverket.se')
    for (const description of [appStore.description, googlePlay.description]) {
      expect(description).toContain('är en fristående app och är inte kopplad till Livsmedelsverket')
      expect(description).toContain('14 dagar utan kostnad')
      expect(description).toContain('utan automatisk förnyelse')
      expect(description).toContain('1177 och Frisk & Fri')
      expect(description).toContain('inte medicinsk rådgivning')
      expect(description).toContain('kalorigolv')
    }
  })

  it('beskrivningarna tar med det som finns i apparna nu – och allergiraden hänvisar till källan och förpackningen', async () => {
    const { appStore, googlePlay } = await storeTexts()
    for (const [store, description] of [
      ['App Store', appStore.description],
      ['Google Play', googlePlay.description],
    ] as const) {
      for (const feature of ['Veckobudget', 'fredagsmyset', 'Allergiprofil', 'länk eller fil', 'Framstegsbilder', 'Fyll i från förpackningen', 'Milstolparna']) {
        expect(description, `${store}: ${feature}`).toContain(feature)
      }
      const allergy = description.split('\n').find((line) => line.includes('Allergiprofil')) ?? ''
      expect(allergy, store).toContain('Open Food Facts')
      expect(allergy, store).toContain('läs alltid förpackningen')
      // Open Food Facts byggs av användare – inte tillverkarens egen märkning på förpackningen.
      expect(allergy, store).not.toMatch(/förpackningens\s+uppgifter/i)
      const photos = description.split('\n').find((line) => line.includes('Framstegsbilder')) ?? ''
      expect(photos, store).toContain('avstängda från början')
      expect(photos, store).toContain('inte med i säkerhetskopian')
      // Milstolparna firar engagemang, aldrig dagar i rad (CLAUDE.md "Milstolpar").
      expect(description, store).toContain('aldrig dagar i rad')
    }
    // Textigenkänningen: telefonens egen – iPhones Skanna text i App Store, inget plattformsnamn i Play.
    expect(appStore.description).toMatch(/Fyll i från förpackningen med iPhones Skanna text eller inklistrad text/)
    expect(googlePlay.description).toMatch(/Fyll i från förpackningen med telefonens textigenkänning eller inklistrad text/)
  })

  it('fastan: en kort rad utan poäng eller löften, och vem den inte rekommenderas för (App Store 1.4.1)', async () => {
    const { appStore, googlePlay } = await storeTexts()
    // Upplägget i raden är samma som i appen: första och sista protokollet.
    const range = `${FASTING_PROTOCOLS[0].id} till ${FASTING_PROTOCOLS[FASTING_PROTOCOLS.length - 1].id}`
    for (const [store, description] of [
      ['App Store', appStore.description],
      ['Google Play', googlePlay.description],
    ] as const) {
      const line = description.split('\n').find((l) => l.startsWith('• Fasta')) ?? ''
      expect(line, store).toBe(`• Fasta om du vill – en enkel timer för ${range}, utan poäng eller serier`)
      // Samma ord som "Fasta passar inte alla" i appen (NotRecommendedFor) och på supportsidan, med hänvisning till vården.
      const care = description.split('\n').find((l) => l.startsWith('Lagom dömer inte')) ?? ''
      expect(care, store).toContain(
        'Fasta rekommenderas inte vid graviditet, amning, under 18 år, ätstörning eller diabetes med blodsockersänkande läkemedel – prata med vården först.',
      )
      expect(care, store).toContain('1177 och Frisk & Fri')
      expect(description, store).not.toMatch(FASTING_CLAIMS)
    }
    // Play: versionsinformationen tar med fastan bland funktionerna, och widgetraden säger att den visar en pågående fasta.
    expect(googlePlay.releaseNotes).toContain('träning och fasta')
    expect(googlePlay.description).toContain('• Widget på hemskärmen om du vill – dagens energi, måltider, vatten och en pågående fasta')
    expect(googlePlay.releaseNotes).not.toMatch(FASTING_CLAIMS)
  })

  it('granskningsanteckningarna beskriver fastan – och spärren för gravida, ammande och under 18 år finns i koden', async () => {
    for (const path of ['docs/APP-STORE.md', 'docs/GOOGLE-PLAY.md']) {
      const doc = await readRepoFile(path)
      const note = doc.split('\n').find((l) => l.startsWith('Fasting (Mer → Fasta, optional)')) ?? ''
      expect(note, path).toContain('a simple timer for 12:12 to 20:4')
      expect(note, path).toContain('no scores, streaks or health claims and does not change the daily goal')
      expect(note, path).toContain('pregnancy or breastfeeding, under 18, diabetes treated with blood-sugar-lowering medicine, a current or past eating disorder')
      expect(note, path).toContain('the start button is replaced by a caution message until they choose to show the timer')
      expect(note, path).toContain('Fasts are stored only on the device')
    }
    // Spärren som anteckningarna beskriver: varsam text i stället för starta-kortet tills man väljer att visa timern.
    const page = (await readRepoFile('src/features/activity/FastingPage.tsx')).replace(/\s+/g, ' ')
    expect(page).toMatch(/lifeStage === 'gravid' \|\| lifeStage === 'ammar'/)
    expect(page).toMatch(/youngestAge\(birthYear, today\) < 18/)
    expect(page).toMatch(/caution && !showAnyway \? \( <FastingCautionCard[^>]*onShowAnyway/)
  })
})

describe('supportsidan (Support-URL i båda butikerna)', () => {
  it('innehållsförteckningen pekar på varje fråga, och varje fråga har en rubrik', async () => {
    const html = await readRepoFile('public/support/index.html')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id)
    expect(new Set(ids).size, 'id:n är unika').toBe(ids.length)
    const toc = [...doc.querySelectorAll('nav a[href^="#"]')].map((a) => a.getAttribute('href')?.slice(1) ?? '')
    const sections = [...doc.querySelectorAll('main > section[id]')]
    expect(toc).toEqual(sections.map((s) => s.id))
    for (const section of sections) {
      const heading = doc.getElementById(section.getAttribute('aria-labelledby') ?? '')
      expect(heading?.tagName, section.id).toBe('H2')
      expect(section.contains(heading), section.id).toBe(true)
    }
    for (const title of [
      'Hur delar jag ett recept eller en måltid?',
      'Var sparas mina framstegsbilder?',
      'Vad betyder allergiflaggorna?',
      'Hur fungerar Fyll i från förpackningen?',
      'Hur fungerar veckobudgeten?',
      'Hur fungerar fastan?',
      'Sparas steg och anteckningar automatiskt?',
    ]) {
      expect(sections.some((s) => s.querySelector('h2')?.textContent?.trim() === title), title).toBe(true)
    }
    // Samma regler för allergier som i appen och butikstexterna.
    expect(doc.body.textContent ?? '').not.toMatch(ALLERGY_PROMISES)
  })

  it('menyvägarna och knapparna finns i appen: formuläret för eget livsmedel och provperioden i iPhone-appen', async () => {
    const html = await readRepoFile('public/support/index.html')
    const text = (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').replace(/\s+/g, ' ')
    // "Skapa eget livsmedel" visas bara under sökresultaten – utan sökning nås formuläret via fliken Mina.
    expect(text).toContain('Lägg till mat → Mina → Nytt livsmedel')
    expect(text).not.toContain('Lägg till mat → Skapa eget livsmedel')
    const addPage = await readRepoFile('src/features/add/AddFoodPage.tsx')
    const addLogic = await readRepoFile('src/features/add/addLogic.ts')
    expect(addLogic).toMatch(/\bmina: 'Mina'/)
    expect(addPage).toMatch(/tab === 'mina' && \([\s\S]{0,400}?Nytt livsmedel/)
    expect(addPage).toContain('Skapa eget livsmedel')

    // iPhone-appen: provperioden startas med köpet för 0 kr (trialViaStore) – inte när profilen skapas.
    expect(text).toContain('I iPhone-appen startar du provperioden själv')
    expect(text).toContain('Starta 14 dagar gratis')
    expect(text).not.toMatch(/(?<!Android-appen )startar provperioden när du skapar din egen profil/)
    const trialButton = await readRepoFile('src/features/premium/StartTrialButton.tsx')
    const commerce = await readRepoFile('src/config/commerce.ts')
    expect(trialButton).toContain('Starta {TRIAL_DAYS} dagar gratis')
    expect(commerce).toMatch(/export const TRIAL_DAYS = 14\b/)
  })

  it('Hur fungerar fastan?: allt som står stämmer med koden – upplägg, gränser, knappar, dagsmålet och säkerhetstexten', async () => {
    const html = await readRepoFile('public/support/index.html')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const section = doc.getElementById('fasta')
    expect(section?.tagName).toBe('SECTION')
    expect(section?.getAttribute('aria-labelledby')).toBe('fasta-rubrik')
    expect(doc.getElementById('fasta-rubrik')?.textContent?.trim()).toBe('Hur fungerar fastan?')
    const text = (section?.textContent ?? '').replace(/\s+/g, ' ')

    // Upplägg och gränser kommer ur fastingLogic – inte egna siffror på sidan.
    for (const protocol of FASTING_PROTOCOLS) expect(text, protocol.id).toContain(protocol.id)
    expect(text).toContain(`upp till ${MAX_FAST_HOURS} timmar bakåt`)
    expect(text).toContain(`kortare än ${MIN_SAVED_FAST_MS / 60_000} minuter sparas inte`)

    // Varje knapp och menyväg som nämns finns i appen.
    const labels: Array<[string, string]> = [
      ['Starta fastan nu', 'src/features/activity/fasting/StartFastCard.tsx'],
      ['Jag började tidigare', 'src/features/activity/fasting/StartFastCard.tsx'],
      ['Avbryt', 'src/features/activity/fasting/FastTimerCard.tsx'],
      ['Veckans fasta', 'src/features/activity/fasting/FastingWeekCard.tsx'],
      ['När fastan är klar', 'src/features/settings/sections/RemindersSection.tsx'],
      ['Radera all data', 'src/features/settings/sections/DataSection.tsx'],
    ]
    const spans = [...(section?.querySelectorAll('.vag') ?? [])].map((el) => (el.textContent ?? '').trim())
    for (const [label, file] of labels) {
      expect(spans, label).toContain(label)
      expect(await readRepoFile(file), `${label} i ${file}`).toContain(label)
    }
    expect(spans).toContain('Mer → Fasta')
    expect(await readRepoFile('src/features/more/MorePage.tsx')).toMatch(/title: 'Fasta', to: '\/fasta'/)
    expect(spans).toContain('Inställningar → Påminnelser')
    expect(await readRepoFile('src/features/settings/SettingsPage.tsx')).toMatch(/paminnelser: \{ title: 'Påminnelser'/)

    // Dagsmålet: ingen del av målberäkningen läser fastan.
    expect(text).toContain('Fastan påverkar inte ditt dagsmål')
    for (const file of ['src/lib/energy.ts', 'src/hooks/useTargets.ts', 'src/lib/weeklyBudget.ts', 'src/lib/targetsInfo.ts', 'src/lib/diary.ts']) {
      expect(await readRepoFile(file), file).not.toMatch(/fasting|fastingStore/i)
    }

    // Lagring: bara på enheten, med i säkerhetskopian och borta med "Radera all data".
    expect(text).toContain('Fastorna följer med i säkerhetskopian och raderas med Radera all data')
    const backup = await readRepoFile('src/lib/backup.ts')
    expect(backup).toContain('fasting: { active: fa.active, history: fa.history }')
    expect(backup).toContain('useFastingStore.getState().clearFasting()')

    // Ingen poäng, inga serier, ingen timer för 5:2 – och inga hälsopåståenden eller löften.
    expect(text).toContain('Det finns inga poäng eller serier')
    expect(text).toContain('5:2 har ingen timer i Lagom')
    expect(text).not.toMatch(FASTING_CLAIMS)
    const weekCard = await readRepoFile('src/features/activity/fasting/FastingWeekCard.tsx')
    expect(weekCard).toContain('inga poäng eller serier')
    expect(await readRepoFile('src/features/activity/fasting/FastingInfoCards.tsx')).toContain('Lagom har ingen timer för 5:2')

    // Säkerhetstexten: samma ord som "Fasta passar inte alla" i appen (NotRecommendedFor, SupportLinks och kortet "Bra att veta").
    const info = (await readRepoFile('src/features/activity/fasting/FastingInfoCards.tsx')).replace(/\s+/g, ' ')
    for (const sentence of [
      'Fasta passar inte alla.',
      'Det rekommenderas inte om du är gravid eller ammar, är under 18 år, har diabetes och tar blodsockersänkande läkemedel',
      'eller har eller har haft en ätstörning. Prata med vårdcentralen eller',
      'Drick vatten, te eller svart kaffe under fastan. Blir du yr, svag eller mår dåligt – ät något. Det är inget misslyckande.',
    ]) {
      expect(text, sentence).toContain(sentence.replace(/ eller$/, ''))
      expect(info, sentence).toContain(sentence)
    }
    expect(text).toContain('(till exempel insulin)')
    // Externa länkar på den fristående sidan: vanliga länkar med rel, aldrig target="_blank".
    const links = [...(section?.querySelectorAll('a[href^="https://"]') ?? [])]
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://www.1177.se', 'https://www.friskfri.se', 'https://www.1177.se'])
    for (const a of links) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
      expect(a.hasAttribute('target')).toBe(false)
    }
  })
})
