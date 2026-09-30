/**
 * iPhone-widgeten i molnbyggena (docs/WIDGET.md §8):
 *
 * - `.github/workflows/native.yml` (kontrollbygget) kompilerar och kör widgetens Swift-tester
 *   (ios/App/LagomWidgetTests) på Linux vid varje körning och på macOS i iPhone-bygget, bygger
 *   widgetmålet för sig och – efter det vanliga appbygget, påslagen med `scripts/ios-widget.mjs
 *   enable` bara i molnets utcheckning – appen med widgeten inbäddad.
 * - `.github/workflows/release.yml` och `codemagic.yaml` (de signerade butiksbyggena) läser läget
 *   en gång med `scripts/ios-widget.mjs check`/`status`, hämtar widgetens profil bara när den är
 *   "på" och kontrollerar IPA:n i båda lägena.
 *
 * Byggena kan inte köras här (Swift och Xcode saknas) – filerna läses som text, som i
 * storeBuilds.test.ts (inga nya paket).
 */
import { describe, expect, it } from 'vitest'

interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readdir(path: string): Promise<string[]>
}
interface NodeUrl {
  fileURLToPath(url: string): string
  pathToFileURL(path: string): { href: string }
}
interface NodePath {
  dirname(p: string): string
  resolve(...parts: string[]): string
}
/** Det testet använder ur scripts/ios-widget.mjs. */
interface IosWidgetModule {
  APP_GROUP: string
  APP_GROUP_KEY: string
  WIDGET_TARGET: string
  WIDGET_PRODUCT: string
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

/** Konstanterna i scripts/ios-widget.mjs – samma som skriptet som slår på widgeten använder. */
async function iosWidgetScript(): Promise<IosWidgetModule> {
  const { pathToFileURL } = await nodeModule<NodeUrl>('node:url')
  return nodeModule<IosWidgetModule>(pathToFileURL(await repoPath('scripts/ios-widget.mjs')).href)
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

const indentOf = (line: string): number => line.length - line.trimStart().length

/** Stegen (GitHub Actions `steps:`) eller skripten (Codemagic `scripts:`) i ett jobb, i ordning. */
function steps(job: string): Array<{ name: string; text: string }> {
  const found: Array<{ name: string; lines: string[] }> = []
  let current: { name: string; lines: string[] } | null = null
  for (const line of job.split('\n')) {
    const head = /^ {6}- name: (.+)$/.exec(line)
    if (head) {
      current = { name: head[1].trim(), lines: [line] }
      found.push(current)
    } else if (line.trim() !== '' && indentOf(line) <= 6) {
      // En kommentar mellan stegen, eller nästa nyckel (t.ex. `artifacts:` i Codemagic).
      current = null
    } else if (current) {
      current.lines.push(line)
    }
  }
  return found.map((s) => ({ name: s.name, text: s.lines.join('\n') }))
}

/** Steget med exakt det namnet – precis ett. */
function step(job: string, name: string): string {
  const matching = steps(job).filter((s) => s.name === name)
  if (matching.length !== 1) throw new Error(`Hittade ${matching.length} steg med namnet "${name}"`)
  return matching[0].text
}

/** Stegens namn i ordning. */
const stepNames = (job: string): string[] => steps(job).map((s) => s.name)

/** Ett kommando som står på flera rader (`\` sist på raden, eller YAML:s `>-`) på en rad. */
const oneLine = (text: string): string => text.replace(/\\\n/g, ' ').replace(/\s+/g, ' ')

/**
 * Grenarna i `if <villkor>; then … [else …] fi` i ett skalskript (efter indenteringen): raderna
 * mellan `then` och `else`/`fi` respektive mellan `else` och `fi` på samma indentering.
 */
function shellIf(script: string, condition: string): { ifTrue: string; ifFalse: string } {
  const lines = script.split('\n')
  const heads = lines.flatMap((line, i) => (line.trim() === `if ${condition}; then` ? [i] : []))
  if (heads.length !== 1) throw new Error(`Hittade ${heads.length} rader "if ${condition}; then"`)
  const indent = indentOf(lines[heads[0]])
  const branches = { ifTrue: [] as string[], ifFalse: [] as string[] }
  let branch: 'ifTrue' | 'ifFalse' = 'ifTrue'
  for (const line of lines.slice(heads[0] + 1)) {
    if (line.trim() !== '' && indentOf(line) <= indent) {
      if (line.trim() === 'else' && indentOf(line) === indent && branch === 'ifTrue') {
        branch = 'ifFalse'
        continue
      }
      if (line.trim() === 'fi' && indentOf(line) === indent) {
        return { ifTrue: branches.ifTrue.join('\n'), ifFalse: branches.ifFalse.join('\n') }
      }
      throw new Error(`Oväntad rad i if ${condition}: ${line.trim()}`)
    }
    branches[branch].push(line)
  }
  throw new Error(`if ${condition} avslutas inte med fi`)
}

/** Antal förekomster av en text. */
const count = (text: string, needle: string): number => text.split(needle).length - 1

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `echo "<prefix>…"` (citattecken i texten skrivna \") direkt följt av `exit 1`. */
const errorThenExit = (prefix: string): RegExp => new RegExp(`echo "${escapeRegExp(prefix)}(?:[^"\\\\]|\\\\.)*"\\n\\s+exit 1`)

/** Antal rader som kör `node scripts/ios-widget.mjs enable` (inte texter som nämner kommandot). */
const enableRuns = (text: string): number => text.match(/^[ \t]*node scripts\/ios-widget\.mjs enable\b/gm)?.length ?? 0

/** Det första steget i jobbet som bygger appen (det befintliga simulatorbygget). */
function appBuildText(job: string): string {
  const first = steps(job).find((s) => oneLine(s.text).includes(APP_BUILD))
  if (!first) throw new Error('Inget steg bygger appen')
  return first.text
}

const APP_ID = 'se.lagomappen.lagom'
/** Filerna som widgetens Swift-tester kompileras från – i den ordning kontraktet anger. */
const SWIFT_TEST_FILES = [
  'ios/App/LagomWidget/WidgetShared.swift',
  'ios/App/LagomWidget/WidgetPayload.swift',
  'ios/App/LagomWidget/WidgetContent.swift',
  'ios/App/LagomWidgetTests/main.swift',
]
const SWIFT_FIXTURES = 'ios/App/LagomWidgetTests/fixtures'
/** Kompilera och kör Swift-testerna (samma på Linux och macOS). */
const SWIFT_TEST_COMMANDS = ['out="$RUNNER_TEMP/', `swiftc -o "$out" ${SWIFT_TEST_FILES.join(' ')}`, `"$out" ${SWIFT_FIXTURES}`]
const WIDGET_TARGET_BUILD =
  'xcodebuild -project ios/App/App.xcodeproj -target LagomWidgetExtension -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build'
const APP_BUILD = 'xcodebuild -project ios/App/App.xcodeproj -scheme App'
/** Villkoret för widgeten i butiksbyggena (läget sparas i LAGOM_WIDGET av steget som läser det). */
const WIDGET_ON = '[ "$LAGOM_WIDGET" = "på" ]'
const STATE_STEP = 'iPhone-widgeten – av eller på (scripts/ios-widget.mjs)'
const SIGNING_STEP = 'Signering – distributionscertifikat och profil via App Store Connect API'
const IPA_STEP = 'Kontrollera IPA:n (version, byggnummer och HealthKit)'
const IPA_WIDGET_STEP = 'Kontrollera IPA:n (iPhone-widgeten)'

describe('native.yml – iPhone-widgeten i kontrollbygget', () => {
  it('Linux-jobbet kompilerar och kör widgetens Swift-tester vid samma tillfällen som Android-kontrollen, utan Node', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    const job = block(native, 'ios-widget-logik', 2)
    expect(job).toContain('name: iPhone-widgetens logik (Swift på Linux)')
    expect(job).toContain('runs-on: ubuntu-latest')
    // Inget villkor på jobbet: det körs vid pull requests, push till main och för hand, som Android.
    expect(job).not.toMatch(/^ {4}if:/m)
    expect(block(native, 'android', 2)).not.toMatch(/^ {4}if:/m)

    const swift = step(job, 'Swift finns på maskinen')
    expect(swift).toContain('if ! command -v swiftc > /dev/null; then')
    expect(swift).toMatch(errorThenExit('::error::swiftc saknas'))
    const tests = oneLine(step(job, 'Widget – logiktester (swiftc)'))
    for (const command of SWIFT_TEST_COMMANDS) expect(tests).toContain(command)
    expect(tests).toContain('set -euo pipefail')
    expect(stepNames(job).indexOf('Swift finns på maskinen')).toBeLessThan(stepNames(job).indexOf('Widget – logiktester (swiftc)'))

    // Ingen Node, inga npm-paket och inga hemligheter – bara Swift.
    expect(job).not.toContain('setup-node')
    expect(job).not.toMatch(/\bnpm\b|\bnode\b/)
    expect(job).not.toContain('secrets.')
  })

  it('filerna i kommandot finns, bara med Foundation, och facitfilerna ligger där testprogrammet läser dem', async () => {
    const { readdir } = await nodeModule<NodeFs>('node:fs/promises')
    for (const path of SWIFT_TEST_FILES) {
      const source = await readRepoFile(path)
      // Kompileras även på Linux (swift-corelibs-foundation): inga Apple-ramverk för gränssnittet.
      expect(source, path).not.toMatch(/^\s*import\s+(?:UIKit|WidgetKit|SwiftUI|Capacitor)\b/m)
    }
    const fixtures = (await readdir(await repoPath(SWIFT_FIXTURES))).filter((f) => f.endsWith('.json'))
    expect(fixtures.length).toBeGreaterThan(0)
    // Programmet tar mappen som första argument.
    expect(await readRepoFile('ios/App/LagomWidgetTests/main.swift')).toContain('CommandLine.arguments')
  })

  it('iPhone-jobbet: samma Swift-tester, widgetmålet för sig och appen med widgeten inbäddad – efter det vanliga appbygget', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    const ios = block(native, 'ios', 2)
    expect(ios).toContain("if: github.event_name == 'workflow_dispatch' && inputs.ios")
    expect(ios).toContain('runs-on: macos-')

    // Det befintliga appbygget står kvar oförändrat.
    const appBuild = step(ios, 'Xcode – bygg för simulatorn')
    expect(appBuild).toBe(
      [
        '      - name: Xcode – bygg för simulatorn',
        '        run: >-',
        '          xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug',
        "          -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'",
        '          CODE_SIGNING_ALLOWED=NO build',
        '',
      ].join('\n'),
    )

    const names = stepNames(ios)
    const order = [
      'Webbdelen (VITE_DISTRIBUTION=appstore) och cap sync',
      'Xcode – bygg för simulatorn',
      'Widget – logiktester (swiftc)',
      'Widget – bygg målet för simulatorn',
      'Widget påslagen – bygg appen med widgeten inbäddad',
    ].map((name) => names.indexOf(name))
    expect(order.every((i) => i !== -1), names.join(' | ')).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)

    const tests = oneLine(step(ios, 'Widget – logiktester (swiftc)'))
    for (const command of SWIFT_TEST_COMMANDS) expect(tests).toContain(command)
    expect(oneLine(step(ios, 'Widget – bygg målet för simulatorn'))).toContain(WIDGET_TARGET_BUILD)
  })

  it('slår på widgeten bara i utcheckningen och kontrollerar att den är inbäddad med rätt Bundle ID och tilläggspunkt', async () => {
    const { WIDGET_PRODUCT } = await iosWidgetScript()
    const native = await readRepoFile('.github/workflows/native.yml')
    const ios = block(native, 'ios', 2)
    const enable = step(ios, 'Widget påslagen – bygg appen med widgeten inbäddad')
    const flat = oneLine(enable)

    // check → status → enable (bara när den är av) → bygget, i den ordningen.
    const at = (needle: string): number => {
      const i = flat.indexOf(needle)
      expect(i, needle).toBeGreaterThan(-1)
      return i
    }
    const sequence = [
      at('if ! node scripts/ios-widget.mjs check; then'),
      at('WIDGET="$(node scripts/ios-widget.mjs status)"'),
      at('node scripts/ios-widget.mjs enable'),
      at(APP_BUILD),
    ]
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence)
    expect(shellIf(enable, '[ "$WIDGET" = "av" ]').ifTrue).toContain('node scripts/ios-widget.mjs enable')
    expect(enable).toMatch(errorThenExit('::error::iPhone-widgeten är halvvägs påslagen'))

    // Egen DerivedData-mapp under $RUNNER_TEMP och ingen signering.
    expect(enable).toMatch(/derived="\$RUNNER_TEMP\/[\w-]+"/)
    expect(flat).toContain(
      `${APP_BUILD} -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$derived" CODE_SIGNING_ALLOWED=NO build`,
    )
    expect(enable).toContain('app="$derived/Build/Products/Debug-iphonesimulator/App.app"')
    expect(enable).toContain(`plist="$app/PlugIns/${WIDGET_PRODUCT}/Info.plist"`)
    expect(shellIf(enable, '[ ! -f "$plist" ]').ifTrue).toMatch(errorThenExit('::error::'))

    // PlistBuddy: Bundle ID och tilläggspunkt – samma som målet och widgetens Info.plist.
    expect(enable).toContain(`id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist"`)
    expect(enable).toContain(`point="$(/usr/libexec/PlistBuddy -c 'Print :NSExtension:NSExtensionPointIdentifier' "$plist"`)
    expect(shellIf(enable, `[ "$id" != "${APP_ID}.widget" ]`).ifTrue).toMatch(errorThenExit('::error::'))
    expect(shellIf(enable, '[ "$point" != "com.apple.widgetkit-extension" ]').ifTrue).toMatch(errorThenExit('::error::'))
    const plist = await readRepoFile('ios/App/LagomWidget/Info.plist')
    expect(plist).toMatch(/<key>NSExtensionPointIdentifier<\/key>\s*<string>com\.apple\.widgetkit-extension<\/string>/)
    // Samma version och byggnummer som appen (App Store kräver det).
    expect(enable).toContain('for key in CFBundleShortVersionString CFBundleVersion; do')

    // Det vanliga appbygget (utan egen DerivedData) kommer före varje påslagning i jobbet.
    const firstAppBuild = ios.indexOf(APP_BUILD)
    expect(firstAppBuild).toBeGreaterThan(-1)
    expect(firstAppBuild).toBeLessThan(ios.search(/^[ \t]*node scripts\/ios-widget\.mjs enable\b/m))
    expect(oneLine(appBuildText(ios))).not.toContain('-derivedDataPath')
    // Påslagningen körs på ett enda ställe: i steget ovan.
    expect(enableRuns(native)).toBe(1)
    expect(enableRuns(enable)).toBe(1)
  })

  it('checkar aldrig in något: ingen commit eller push, och butiksbyggena slår aldrig på widgeten', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    expect(native).not.toMatch(/\bgit\s+(?:commit|push)\b/)
    expect(native).toContain('contents: read')
    for (const file of ['.github/workflows/release.yml', 'codemagic.yaml']) {
      expect(enableRuns(await readRepoFile(file)), file).toBe(0)
    }
  })
})

/** iPhone-jobbet i butiksbyggena och filen som läget sparas i. */
const STORE_BUILDS = [
  { file: '.github/workflows/release.yml', job: 'ios', envFile: '"$GITHUB_ENV"', error: '::error title=iPhone-widgeten::' },
  { file: 'codemagic.yaml', job: 'ios-testflight', envFile: '"$CM_ENV"', error: 'FEL: ' },
] as const

describe.each(STORE_BUILDS)('$file – iPhone-widgeten i butiksbygget', ({ file, job: jobName, envFile, error }) => {
  const readJob = async (): Promise<string> => block(await readRepoFile(file), jobName, 2)

  it('läser läget en gång, tidigt, med check och status – och ett halvt läge stoppar bygget', async () => {
    const job = await readJob()
    const state = step(job, STATE_STEP)
    const flat = oneLine(state)
    expect(flat).toContain('if ! node scripts/ios-widget.mjs check; then')
    expect(shellIf(state, '! node scripts/ios-widget.mjs check').ifTrue).toMatch(errorThenExit(error))
    expect(shellIf(state, '! node scripts/ios-widget.mjs check').ifTrue).toContain('halvvägs påslagen')
    expect(flat.indexOf('ios-widget.mjs check')).toBeLessThan(flat.indexOf('WIDGET="$(node scripts/ios-widget.mjs status)"'))
    expect(state).toContain('case "$WIDGET" in')
    expect(state).toContain('på|av) ;;')
    expect(state).toContain(`echo "LAGOM_WIDGET=$WIDGET" >> ${envFile}`)
    expect(state).not.toContain('secrets.')
    // En gång i jobbet – och innan något ändrar Xcode-projektet eller bygger.
    expect(count(job, '$(node scripts/ios-widget.mjs status)')).toBe(1)
    expect(count(job, '! node scripts/ios-widget.mjs check')).toBe(1)
    const names = stepNames(job)
    const stateAt = names.indexOf(STATE_STEP)
    expect(stateAt).toBeGreaterThan(-1)
    for (const later of ['Installera beroenden', SIGNING_STEP, 'Xcode – arkivera och exportera IPA']) {
      expect(names.indexOf(later), later).toBeGreaterThan(stateAt)
    }
  })

  it('hämtar widgetens profil bara när widgeten är på – med samma flaggor som appens och före use-profiles', async () => {
    const job = await readJob()
    const signing = step(job, SIGNING_STEP)
    const on = shellIf(signing, WIDGET_ON)
    expect(on.ifTrue).toContain('app-store-connect fetch-signing-files "$LAGOM_APP_ID.widget"')
    expect(on.ifFalse).toBe('')
    expect(count(await readRepoFile(file), 'fetch-signing-files "$LAGOM_APP_ID.widget"')).toBe(1)

    const flags = [...signing.matchAll(/fetch-signing-files "\$LAGOM_APP_ID(\.widget)?" \\\n\s+(--[^\n]+)/g)]
    expect(flags.map((m) => m[1] ?? '')).toEqual(['', '.widget'])
    expect(flags[1][2]).toBe(flags[0][2])
    expect(flags[0][2]).toBe('--platform IOS --type IOS_APP_STORE --strict-match-identifier --create')

    const flat = oneLine(signing)
    expect(flat.indexOf('fetch-signing-files "$LAGOM_APP_ID.widget"')).toBeLessThan(flat.indexOf('xcode-project use-profiles'))
    expect(flat.indexOf('fetch-signing-files "$LAGOM_APP_ID.widget"')).toBeLessThan(flat.indexOf('keychain add-certificates'))
    expect(flat.indexOf('fetch-signing-files "$LAGOM_APP_ID" ')).toBeLessThan(flat.indexOf('fetch-signing-files "$LAGOM_APP_ID.widget"'))
  })

  it('kontrollerar widgeten i IPA:n i båda lägena, efter den vanliga kontrollen', async () => {
    const { APP_GROUP, APP_GROUP_KEY, WIDGET_PRODUCT } = await iosWidgetScript()
    const job = await readJob()
    const names = stepNames(job)
    expect(names.indexOf(IPA_WIDGET_STEP)).toBe(names.indexOf(IPA_STEP) + 1)
    // Den vanliga kontrollen (HealthKit) står kvar.
    expect(step(job, IPA_STEP)).toContain("grep -q 'com.apple.developer.healthkit'")

    const check = step(job, IPA_WIDGET_STEP)
    expect(check).toContain('set -euo pipefail')
    expect(check).toContain(`appex="$app/PlugIns/${WIDGET_PRODUCT}"`)
    expect(check).toContain(`group=${APP_GROUP}`)
    const { ifTrue: on, ifFalse: off } = shellIf(check, WIDGET_ON)

    // På: widgeten finns, med eget Bundle ID, appens version och App Group i båda signaturerna.
    expect(shellIf(on, '[ ! -d "$appex" ]').ifTrue).toMatch(errorThenExit(error))
    expect(on).toContain(`id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist"`)
    expect(shellIf(on, '[ "$id" != "$LAGOM_APP_ID.widget" ]').ifTrue).toMatch(errorThenExit(error))
    expect(on).toContain(`short="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist"`)
    expect(on).toContain(`bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$plist"`)
    expect(on).toContain(`app_short="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Info.plist")"`)
    expect(on).toContain(`app_bundle="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app/Info.plist")"`)
    expect(shellIf(on, '[ "$short" != "$app_short" ] || [ "$bundle" != "$app_bundle" ]').ifTrue).toMatch(errorThenExit(error))
    expect(on).toContain('app_entitlements="$(codesign -d --entitlements - "$app" 2>/dev/null || true)"')
    expect(on).toContain('widget_entitlements="$(codesign -d --entitlements - "$appex" 2>/dev/null || true)"')
    for (const who of ['app', 'widget']) {
      const guard = `! grep -qF '${APP_GROUP_KEY}' <<< "$${who}_entitlements" || ! grep -qF "$group" <<< "$${who}_entitlements"`
      const message = shellIf(on, guard).ifTrue
      expect(message, who).toMatch(errorThenExit(error))
      // Felet säger vad ägaren ska göra i Apple-kontot.
      expect(message, who).toContain('developer.apple.com')
      expect(message, who).toContain('App Groups')
      expect(message, who).toContain('docs/WIDGET.md §8')
    }
    expect(shellIf(on, `! grep -qF '${APP_GROUP_KEY}' <<< "$widget_entitlements" || ! grep -qF "$group" <<< "$widget_entitlements"`).ifTrue).toContain(
      'skapa App ID:t $LAGOM_APP_ID.widget',
    )

    // Av: widgeten får inte ha följt med – och inget annat kontrolleras eller hämtas.
    expect(shellIf(off, '[ -e "$appex" ]').ifTrue).toMatch(errorThenExit(error))
    expect(off).not.toContain('codesign')
    expect(off).not.toContain('fetch-signing-files')
  })
})

describe('release.yml – kontrollen av widgeten läser samma uppackade IPA', () => {
  it('den vanliga kontrollen packar upp i $RUNNER_TEMP/ipa, och widgetkontrollen läser därifrån', async () => {
    const ios = block(await readRepoFile('.github/workflows/release.yml'), 'ios', 2)
    expect(step(ios, IPA_STEP)).toContain('work="$RUNNER_TEMP/ipa"')
    expect(step(ios, IPA_WIDGET_STEP)).toContain(`app="$(find "$RUNNER_TEMP/ipa/Payload" -maxdepth 1 -name '*.app' | head -1)"`)
  })
})
