// @vitest-environment node
/**
 * iPhone-widgeten i Xcode-projektet och brytaren som slår på den (docs/WIDGET.md §8):
 *
 * - scripts/pbxproj.mjs läser ios/App/App.xcodeproj/project.pbxproj (OpenStep-formatet).
 * - Projektet hänger ihop: varje id finns, varje fil finns på disken, varje objekt står i sin
 *   sektion, och widgetmålet "LagomWidgetExtension" har exakt de bygginställningar som kontraktet
 *   anger – men är inte en del av appen förrän App Group finns i ägarens Apple-konto.
 * - scripts/ios-widget.mjs (status | check | enable) på en kopia av de tre filerna.
 * - Kontraktet mellan språken: samma App Group, nyckel, gräns och länkar i Swift, TypeScript och
 *   Java, tillägget "LagomWidget" och integritetsmanifesten.
 *
 * Xcode och Swift finns inte här – filerna läses som text. Swift-koden kompileras i molnbygget
 * (.github/workflows/native.yml: `xcodebuild -target LagomWidgetExtension` och Swift-testerna i
 * ios/App/LagomWidgetTests/).
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { OBJECT_ID, parsePbxproj, PbxprojError, pbxObjectList } from '../../scripts/pbxproj.mjs'
import {
  APP_ENTITLEMENTS_PATH,
  APP_GROUP,
  APP_GROUP_KEY,
  danglingReferences,
  EMBED_PHASE_NAME,
  ENABLE_CHECKLIST,
  ENABLE_IDS,
  enableEntitlementsText,
  enableFlagText,
  enableProjectText,
  entitlementsWidgetState,
  flagWidgetState,
  IosWidgetError,
  parseArgs,
  PBXPROJ_PATH,
  projectWidgetState,
  widgetStatus,
  WIDGET_TARGET,
  WIDGET_TS_PATH,
} from '../../scripts/ios-widget.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const read = (path: string): string => readFileSync(join(root, path), 'utf8')

/** Mappen med App.xcodeproj – projektets SOURCE_ROOT/SRCROOT. */
const IOS = 'ios/App'
const WIDGET_DIR = 'ios/App/LagomWidget'
const APP_DIR = 'ios/App/App'
const APP_ID = 'se.lagomappen.lagom'
const WIDGET_BUNDLE_ID = `${APP_ID}.widget`
/** Skapas av `npx cap sync ios` och ignoreras av git (ios/.gitignore) – finns inte i en ren utcheckning. */
const CAP_SYNC_FILES = ['ios/App/App/public', 'ios/App/App/capacitor.config.json', 'ios/App/App/config.xml']

type Obj = Record<string, any>

/** Tolkat projekt med hjälpfunktioner för testerna. */
function load(text: string = read(PBXPROJ_PATH)) {
  const project = parsePbxproj(text)
  const objects: Record<string, Obj> = project.objects
  const get = (id: unknown): Obj => {
    const obj = typeof id === 'string' ? objects[id] : undefined
    if (!obj) throw new Error(`Objektet ${String(id)} saknas`)
    return obj
  }
  const target = (name: string): Obj & { id: string } => {
    const found = Object.entries(objects).filter(([, o]) => o.isa === 'PBXNativeTarget' && o.name === name)
    if (found.length !== 1) throw new Error(`${found.length} mål heter ${name}`)
    return { ...found[0][1], id: found[0][0] }
  }
  /** Byggfasen av en viss typ i ett mål. */
  const phase = (t: Obj, isa: string): Obj => {
    const phases = (t.buildPhases as string[]).map(get).filter((p) => p.isa === isa)
    if (phases.length !== 1) throw new Error(`${phases.length} faser av typen ${isa} i ${t.name}`)
    return phases[0]
  }
  /** Filnamnen (path) i en byggfas. */
  const fileNames = (p: Obj): string[] => (p.files as string[]).map((f) => get(get(f).fileRef).path as string).sort()
  /** Byggkonfigurationerna för ett mål eller projektet, efter namn. */
  const configs = (owner: Obj): Record<string, Obj> =>
    Object.fromEntries((get(owner.buildConfigurationList).buildConfigurations as string[]).map((id) => [get(id).name, get(id).buildSettings]))
  return { project, objects, get, target, phase, fileNames, configs, root: get(project.rootObject) }
}

/** Sökvägen (relativt repots rot) för varje filreferens som nås från huvudgruppen – null för SDK:t och byggprodukter. */
function fileRefPaths(p: ReturnType<typeof load>): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const locate = (o: Obj, dir: string): string | null => {
    switch (o.sourceTree) {
      case '<group>':
        return o.path ? posix.join(dir, o.path) : dir
      case 'SOURCE_ROOT':
        return posix.join(IOS, o.path ?? '')
      case 'BUILT_PRODUCTS_DIR':
      case 'SDKROOT':
        return null
      default:
        throw new Error(`Okänt sourceTree "${o.sourceTree}"`)
    }
  }
  const visit = (id: string, dir: string) => {
    const o = p.get(id)
    if (o.isa === 'PBXGroup' || o.isa === 'PBXVariantGroup') {
      const here = locate(o, dir)
      if (here === null) throw new Error(`Gruppen ${id} ligger utanför källorna`)
      for (const child of o.children as string[]) visit(child, here)
    } else if (o.isa === 'PBXFileReference') {
      if (out.has(id)) throw new Error(`Filreferensen ${id} står i två grupper`)
      out.set(id, locate(o, dir))
    } else {
      throw new Error(`Oväntat objekt ${id} (${o.isa}) i en grupp`)
    }
  }
  visit(p.root.mainGroup, IOS)
  return out
}

/** Problem med sektionerna: ordningen (bokstavsordning, som Xcode) och att varje objekt står i sin egen. */
function sectionProblems(text: string, objects: Record<string, Obj>): string[] {
  const problems: string[] = []
  const names: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(/^\/\* Begin (\w+) section \*\/\n([\s\S]*?)^\/\* End (\w+) section \*\/$/gm)) {
    names.push(m[1])
    if (m[1] !== m[3]) problems.push(`sektionen ${m[1]} avslutas som ${m[3]}`)
    for (const def of m[2].matchAll(/^\t\t([0-9A-F]{24})(?: \/\*.*?\*\/)? = \{/gm)) {
      seen.add(def[1])
      if (objects[def[1]]?.isa !== m[1]) problems.push(`${def[1]} står i ${m[1]} men är ${objects[def[1]]?.isa}`)
    }
  }
  if (names.join() !== [...names].sort().join()) problems.push(`sektionerna står inte i bokstavsordning: ${names.join(', ')}`)
  if (new Set(names).size !== names.length) problems.push('en sektion förekommer två gånger')
  for (const id of Object.keys(objects)) if (!seen.has(id)) problems.push(`${id} står inte i någon sektion`)
  return problems
}

/** Står raderna i `original` i samma ordning i `changed` (bara tillägg)? */
function onlyAdditions(original: string, changed: string): boolean {
  const before = original.split('\n')
  let i = 0
  for (const line of changed.split('\n')) if (i < before.length && line === before[i]) i++
  return i === before.length
}

// ---------------------------------------------------------------------------
// Läget i repot: WIDGET_IOS_READY avgör vad som väntas (testerna gäller båda lägena).
// ---------------------------------------------------------------------------

const FLAG = /^export const WIDGET_IOS_READY: boolean = (true|false)$/m.exec(read(WIDGET_TS_PATH))?.[1]
const REPO_STATE = FLAG === 'true' ? 'på' : 'av'

// ---------------------------------------------------------------------------
// Kommandoraden och kopior
// ---------------------------------------------------------------------------

function cli(args: string[]) {
  const res = spawnSync(process.execPath, [join(root, 'scripts/ios-widget.mjs'), ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '' },
    timeout: 20_000,
  })
  return { code: res.status, out: res.stdout, err: res.stderr }
}

const temps: string[] = []
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

/** En tom katalog med de tre filerna som `enable` ändrar, på samma sökvägar som i repot. */
function copyParts(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lagom-ios-widget-'))
  temps.push(dir)
  for (const path of [PBXPROJ_PATH, APP_ENTITLEMENTS_PATH, WIDGET_TS_PATH]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    copyFileSync(join(root, path), join(dir, path))
  }
  return dir
}

const readIn = (dir: string, path: string) => readFileSync(join(dir, path), 'utf8')
const writeIn = (dir: string, path: string, text: string) => writeFileSync(join(dir, path), text)
const snapshot = (dir: string) => [PBXPROJ_PATH, APP_ENTITLEMENTS_PATH, WIDGET_TS_PATH].map((p) => readIn(dir, p))

// ---------------------------------------------------------------------------
// Swift-källor
// ---------------------------------------------------------------------------

/** Värdet på `static let <name>` i Swift: en textsträng, `URL(string: "…")!` eller ett heltal. */
function swiftStatic(source: string, name: string): string | undefined {
  const m = new RegExp(`static let ${name}(?:\\s*:\\s*[\\w.]+)?\\s*=\\s*(?:URL\\(string:\\s*)?(?:"((?:[^"\\\\]|\\\\.)*)"|([\\d_]+))`).exec(source)
  return m ? (m[1] ?? m[2]) : undefined
}

/** `import`-raderna i en Swift-fil. */
const swiftImports = (source: string): string[] => [...source.matchAll(/^\s*import\s+(\w+)/gm)].map((m) => m[1]).sort()

/** Skälen för UserDefaults i ett integritetsmanifest. */
function userDefaultsReasons(xml: string): string[] {
  const at = xml.indexOf('NSPrivacyAccessedAPICategoryUserDefaults')
  if (at === -1) return []
  const reasons = /<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(xml.slice(at))?.[1] ?? ''
  return [...reasons.matchAll(/<string>([^<]+)<\/string>/g)].map((m) => m[1]).sort()
}

/** Värdet (<string>) för en nyckel i en egenskapslista. */
const plistString = (xml: string, key: string): string | undefined =>
  new RegExp(`<key>${key.replace(/\./g, '\\.')}</key>\\s*<string>([^<]*)</string>`).exec(xml)?.[1]

// ===========================================================================

describe('scripts/pbxproj.mjs', () => {
  it('läser ordböcker, listor, citerad och ociterad text och hoppar över kommentarer', () => {
    const text = [
      '// !$*UTF8*$!',
      '{',
      '\ta = 1; /* kommentar */',
      '\tb = "två ord";',
      '\tc = ( d, "e f", ); // radkommentar',
      '\tg = (h);',
      '\ti = { j = System/Library/Frameworks/SwiftUI.framework; k = ( ); l = {}; };',
      '\tm = "";',
      '\t"n o" = \'p\';',
      '\tq = "$(inherited)";',
      '}',
    ].join('\n')
    expect(parsePbxproj(text)).toEqual({
      a: '1',
      b: 'två ord',
      c: ['d', 'e f'],
      g: ['h'],
      i: { j: 'System/Library/Frameworks/SwiftUI.framework', k: [], l: {} },
      m: '',
      'n o': 'p',
      q: '$(inherited)',
    })
  })

  it('tolkar escape-sekvenser i citerad text', () => {
    expect(parsePbxproj('{ a = "x\\"y\\\\z\\n\\tw\\U00e5\\101"; }')).toEqual({ a: 'x"y\\z\n\twåA' })
    expect(parsePbxproj(`{ a = "$(inherited) \\"-D\\" \\"COCOAPODS\\""; }`).a).toBe('$(inherited) "-D" "COCOAPODS"')
  })

  it('en nyckel som heter __proto__ blir en vanlig nyckel', () => {
    const parsed = parsePbxproj('{ __proto__ = x; constructor = y; }')
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true)
    expect(parsed.constructor).toBe('y')
  })

  it.each([
    ['{ a = b }', /väntade ";" men hittade "}"/],
    ['{ a = b; a = c; }', /nyckeln "a" förekommer två gånger/],
    ['{ a = "b; }', /citerad text avslutas aldrig/],
    ['{ a = ( b c ); }', /väntade "," eller "\)"/],
    ['{ a = b; } x', /oväntad text efter projektets slut/],
    ['{ a = b; /* }', /kommentaren \/\* avslutas aldrig/],
    ['{ a = { b = c; }; ', /ordboken \{ avslutas aldrig/],
    ['', /väntade "\{" men filen tog slut/],
  ])('kastar PbxprojError med rad och kolumn: %s', (text, message) => {
    let error: unknown
    try {
      parsePbxproj(text)
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(PbxprojError)
    expect((error as Error).message).toMatch(message)
    expect((error as Error).message).toMatch(/^project\.pbxproj rad \d+, kolumn \d+: /)
  })

  it('anger rätt rad för ett fel', () => {
    expect(() => parsePbxproj('{\n\ta = b;\n\tc = d\n}')).toThrow(/rad 4, kolumn 1: väntade ";"/)
  })

  it('läser det riktiga projektet', () => {
    const { project, objects, root: proj } = load()
    expect(project.archiveVersion).toBe('1')
    expect(project.objectVersion).toBe('60')
    expect(proj.isa).toBe('PBXProject')
    expect(pbxObjectList(project).length).toBe(Object.keys(objects).length)
    expect(pbxObjectList(project).every((o) => OBJECT_ID.test(o.id) && typeof o.isa === 'string')).toBe(true)
  })
})

describe('Xcode-projektet hänger ihop', () => {
  const text = read(PBXPROJ_PATH)
  const p = load(text)

  it('varje id är unikt och varje hänvisning finns', () => {
    const defined = [...text.matchAll(/^\t\t([0-9A-F]{24})(?: \/\*.*?\*\/)? = \{/gm)].map((m) => m[1])
    expect(new Set(defined).size).toBe(defined.length)
    expect(defined.length).toBe(Object.keys(p.objects).length)
    expect(danglingReferences(p.project)).toEqual([])
  })

  it('varje objekt står i sin sektion, och sektionerna i bokstavsordning', () => {
    expect(sectionProblems(text, p.objects)).toEqual([])
  })

  it('varje byggfil pekar på en fil eller en paketprodukt som finns', () => {
    const buildFiles = Object.entries(p.objects).filter(([, o]) => o.isa === 'PBXBuildFile')
    expect(buildFiles.length).toBeGreaterThan(0)
    for (const [id, file] of buildFiles) {
      const ref = file.fileRef ?? file.productRef
      expect(ref, id).toBeDefined()
      expect(['PBXFileReference', 'PBXVariantGroup', 'XCSwiftPackageProductDependency'], id).toContain(p.objects[ref]?.isa)
    }
  })

  it('varje filreferens står i en grupp, och filen finns på disken', () => {
    const paths = fileRefPaths(p)
    const refs = Object.entries(p.objects).filter(([, o]) => o.isa === 'PBXFileReference').map(([id]) => id)
    expect([...paths.keys()].sort()).toEqual(refs.sort())
    for (const [id, path] of paths) {
      if (path === null || CAP_SYNC_FILES.includes(path)) continue
      expect(existsSync(join(root, path)), `${id}: ${path}`).toBe(true)
    }
    // Filerna som cap sync skapar är de som ios/.gitignore ignorerar.
    const gitignore = read('ios/.gitignore')
    for (const path of CAP_SYNC_FILES) expect(gitignore.split('\n'), path).toContain(path.replace(/^ios\//, ''))
  })

  it('varje fil i ios/App/LagomWidget och varje Swift-fil i ios/App/App finns i projektet', () => {
    const referenced = new Set(fileRefPaths(p).values())
    const onDisk = [
      ...readdirSync(join(root, WIDGET_DIR)).map((f) => `${WIDGET_DIR}/${f}`),
      ...readdirSync(join(root, APP_DIR))
        .filter((f) => f.endsWith('.swift'))
        .map((f) => `${APP_DIR}/${f}`),
    ].filter((path) => !posix.basename(path).startsWith('.'))
    for (const path of onDisk) expect(referenced.has(path), path).toBe(true)
  })

  it('Swift-testerna (ios/App/LagomWidgetTests) ingår inte i projektet', () => {
    for (const path of fileRefPaths(p).values()) expect(path ?? '').not.toContain('LagomWidgetTests')
  })
})

describe('widgetmålet LagomWidgetExtension', () => {
  const p = load()
  const widget = p.target(WIDGET_TARGET)
  const app = p.target('App')
  const paths = fileRefPaths(p)
  /** Sökvägarna (relativt repots rot) för filerna i en byggfas. */
  const phasePaths = (phase: Obj) => (phase.files as string[]).map((f) => paths.get(p.get(f).fileRef)).sort()

  it('är ett app extension-mål med produkten LagomWidgetExtension.appex, utan beroenden', () => {
    expect(widget.productName).toBe('LagomWidgetExtension')
    expect(widget.productType).toBe('com.apple.product-type.app-extension')
    expect(widget.dependencies).toEqual([])
    expect(widget.buildRules).toEqual([])
    expect(widget.packageProductDependencies ?? []).toEqual([])
    expect(p.get(widget.productReference)).toEqual({
      isa: 'PBXFileReference',
      explicitFileType: 'wrapper.app-extension',
      includeInIndex: '0',
      path: 'LagomWidgetExtension.appex',
      sourceTree: 'BUILT_PRODUCTS_DIR',
    })
    const products = p.get(p.root.productRefGroup)
    expect(products.children).toContain(widget.productReference)
    expect(p.root.targets).toEqual([app.id, widget.id])
    expect(p.root.attributes.TargetAttributes[widget.id]).toEqual({ CreatedOnToolsVersion: '26.0' })
  })

  it('bygger källorna, resurserna och ramverken i kontraktet', () => {
    expect((widget.buildPhases as string[]).map((id) => p.get(id).isa)).toEqual(['PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase'])
    expect(phasePaths(p.phase(widget, 'PBXSourcesBuildPhase'))).toEqual(
      ['LagomTodayWidget.swift', 'LagomWidgetBundle.swift', 'TodayWidgetView.swift', 'WidgetContent.swift', 'WidgetPayload.swift', 'WidgetShared.swift']
        .map((f) => `${WIDGET_DIR}/${f}`)
        .sort(),
    )
    expect(phasePaths(p.phase(widget, 'PBXResourcesBuildPhase'))).toEqual([`${WIDGET_DIR}/Assets.xcassets`, `${WIDGET_DIR}/PrivacyInfo.xcprivacy`])
    const frameworks = (p.phase(widget, 'PBXFrameworksBuildPhase').files as string[]).map((f) => p.get(p.get(f).fileRef))
    expect(frameworks).toEqual(
      ['WidgetKit', 'SwiftUI'].map((name) => ({
        isa: 'PBXFileReference',
        lastKnownFileType: 'wrapper.framework',
        name: `${name}.framework`,
        path: `System/Library/Frameworks/${name}.framework`,
        sourceTree: 'SDKROOT',
      })),
    )
  })

  it('Info.plist och behörigheterna ligger i gruppen men i ingen byggfas', () => {
    const groups = Object.entries(p.objects).filter(([, o]) => o.isa === 'PBXGroup' && o.path === 'LagomWidget')
    expect(groups).toHaveLength(1)
    const [groupId, group] = groups[0]
    expect(p.get(p.root.mainGroup).children).toContain(groupId)
    const inGroup = (group.children as string[]).map((id) => p.get(id).path).sort()
    expect(inGroup).toEqual(
      [
        'Assets.xcassets',
        'Info.plist',
        'LagomTodayWidget.swift',
        'LagomWidget.entitlements',
        'LagomWidgetBundle.swift',
        'PrivacyInfo.xcprivacy',
        'TodayWidgetView.swift',
        'WidgetContent.swift',
        'WidgetPayload.swift',
        'WidgetShared.swift',
      ].sort(),
    )
    const inPhases = Object.values(p.objects)
      .filter((o) => o.isa === 'PBXBuildFile')
      .map((o) => paths.get(o.fileRef))
    expect(inPhases).not.toContain(`${WIDGET_DIR}/Info.plist`)
    expect(inPhases).not.toContain(`${WIDGET_DIR}/LagomWidget.entitlements`)
  })

  it('har exakt kontraktets bygginställningar i Debug och Release', () => {
    const common = {
      APPLICATION_EXTENSION_API_ONLY: 'YES',
      ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
      ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME: 'WidgetBackground',
      CLANG_ENABLE_OBJC_WEAK: 'YES',
      CODE_SIGN_ENTITLEMENTS: 'LagomWidget/LagomWidget.entitlements',
      CODE_SIGN_STYLE: 'Automatic',
      CURRENT_PROJECT_VERSION: '1',
      GENERATE_INFOPLIST_FILE: 'NO',
      INFOPLIST_FILE: 'LagomWidget/Info.plist',
      IPHONEOS_DEPLOYMENT_TARGET: '17.0',
      LD_RUNPATH_SEARCH_PATHS: ['$(inherited)', '@executable_path/Frameworks', '@executable_path/../../Frameworks'],
      MARKETING_VERSION: '1.0.0',
      PRODUCT_BUNDLE_IDENTIFIER: WIDGET_BUNDLE_ID,
      PRODUCT_NAME: '$(TARGET_NAME)',
      SKIP_INSTALL: 'YES',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '1',
    }
    expect(p.configs(widget)).toEqual({
      Debug: { ...common, SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG' },
      Release: { ...common, SWIFT_ACTIVE_COMPILATION_CONDITIONS: '' },
    })
    // Filerna som inställningarna pekar på (relativt SRCROOT = ios/App).
    for (const path of [common.CODE_SIGN_ENTITLEMENTS, common.INFOPLIST_FILE]) expect(existsSync(join(root, IOS, path)), path).toBe(true)
    // Färgerna som inställningarna namnger finns i widgetens asset-katalog.
    for (const color of [common.ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME, common.ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME]) {
      expect(existsSync(join(root, WIDGET_DIR, 'Assets.xcassets', `${color}.colorset`, 'Contents.json')), color).toBe(true)
    }
  })

  it('har samma version och byggnummer som appen (App Store kräver det)', () => {
    const appConfigs = p.configs(app)
    const widgetConfigs = p.configs(widget)
    for (const name of ['Debug', 'Release']) {
      for (const key of ['MARKETING_VERSION', 'CURRENT_PROJECT_VERSION', 'SWIFT_VERSION', 'TARGETED_DEVICE_FAMILY']) {
        expect(widgetConfigs[name][key], `${name} ${key}`).toBe(appConfigs[name][key])
      }
    }
  })

  it('har inget eget delat schema (molnbygget använder -target)', () => {
    expect(readdirSync(join(root, IOS, 'App.xcodeproj/xcshareddata/xcschemes'))).toEqual(['App.xcscheme'])
    const scheme = read(`${IOS}/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme`)
    const blueprints = new Set([...scheme.matchAll(/BlueprintIdentifier = "([0-9A-F]{24})"/g)].map((m) => m[1]))
    expect([...blueprints]).toEqual([app.id])
  })
})

describe('appmålet App', () => {
  const p = load()
  const app = p.target('App')
  const widget = p.target(WIDGET_TARGET)

  it('kompilerar tillägget, bryggvyn och de delade filerna', () => {
    expect(p.fileNames(p.phase(app, 'PBXSourcesBuildPhase'))).toEqual(
      ['AppDelegate.swift', 'LagomBridgeViewController.swift', 'LagomWidgetPlugin.swift', 'SceneDelegate.swift', 'WidgetPayload.swift', 'WidgetShared.swift'].sort(),
    )
  })

  it('delar WidgetShared.swift och WidgetPayload.swift med widgeten – samma fil, egna byggfiler', () => {
    const appSources = p.phase(app, 'PBXSourcesBuildPhase').files as string[]
    const widgetSources = p.phase(widget, 'PBXSourcesBuildPhase').files as string[]
    for (const name of ['WidgetShared.swift', 'WidgetPayload.swift']) {
      const inApp = appSources.filter((f) => p.get(p.get(f).fileRef).path === name)
      const inWidget = widgetSources.filter((f) => p.get(p.get(f).fileRef).path === name)
      expect(inApp, name).toHaveLength(1)
      expect(inWidget, name).toHaveLength(1)
      expect(inApp[0], name).not.toBe(inWidget[0])
      expect(p.get(inApp[0]).fileRef, name).toBe(p.get(inWidget[0]).fileRef)
      expect(fileRefPaths(p).get(p.get(inApp[0]).fileRef), name).toBe(`${WIDGET_DIR}/${name}`)
    }
  })

  it('behåller appens inställningar (iOS 16.4, app-id:t, behörigheterna)', () => {
    for (const [name, settings] of Object.entries(p.configs(app))) {
      expect(settings.IPHONEOS_DEPLOYMENT_TARGET, name).toBe('16.4')
      expect(settings.PRODUCT_BUNDLE_IDENTIFIER, name).toBe(APP_ID)
      expect(settings.CODE_SIGN_ENTITLEMENTS, name).toBe('App/App.entitlements')
      expect(settings.INFOPLIST_FILE, name).toBe('App/Info.plist')
    }
    expect(app.packageProductDependencies).toHaveLength(1)
  })

  it.runIf(REPO_STATE === 'av')('så länge widgeten är av: inget beroende och ingen inbäddning', () => {
    expect(app.dependencies).toEqual([])
    expect((app.buildPhases as string[]).map((id) => p.get(id).isa)).toEqual(['PBXSourcesBuildPhase', 'PBXFrameworksBuildPhase', 'PBXResourcesBuildPhase'])
    expect(Object.values(p.objects).filter((o) => ['PBXContainerItemProxy', 'PBXTargetDependency', 'PBXCopyFilesBuildPhase'].includes(o.isa))).toEqual([])
    for (const id of Object.values(ENABLE_IDS)) expect(p.objects[id], id).toBeUndefined()
  })
})

describe('scripts/ios-widget.mjs i repot', () => {
  it(`status skriver "${REPO_STATE}" (samma som WIDGET_IOS_READY i src/native/widget.ts)`, () => {
    expect(FLAG).toBeDefined()
    const res = cli(['status'])
    expect(res.err).toBe('')
    expect(res.code).toBe(0)
    expect(res.out).toBe(`${REPO_STATE}\n`)
    expect(widgetStatus()).toBe(REPO_STATE)
  })

  it('check skriver inget och lyckas', () => {
    expect(cli(['check'])).toEqual({ code: 0, out: '', err: '' })
  })

  it('widgeten är av tills App Group finns i ägarens Apple-konto (docs/WIDGET.md §8)', () => {
    // Ändras med node scripts/ios-widget.mjs enable – då gäller "på" överallt i testerna.
    if (REPO_STATE === 'av') {
      expect(FLAG).toBe('false')
      expect(read(APP_ENTITLEMENTS_PATH)).not.toContain(APP_GROUP_KEY)
      expect(read(APP_ENTITLEMENTS_PATH)).not.toContain(APP_GROUP)
    } else {
      expect(entitlementsWidgetState(read(APP_ENTITLEMENTS_PATH)).state).toBe('på')
    }
    expect(projectWidgetState(read(PBXPROJ_PATH)).state).toBe(REPO_STATE)
  })

  it('fungerar också när skriptet startas via en symbolisk länk (annars gör kommandona inget och lyckas ändå)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lagom-ios-widget-link-'))
    temps.push(dir)
    const link = join(dir, 'repo')
    symlinkSync(root, link, 'dir')
    const run = (args: string[]) => {
      const res = spawnSync(process.execPath, [join(link, 'scripts/ios-widget.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' }, timeout: 20_000 })
      return { code: res.status, out: res.stdout, err: res.stderr }
    }
    expect(run(['status'])).toEqual({ code: 0, out: `${REPO_STATE}\n`, err: '' })
    const missing = run(['check', `--root=${join(dir, 'finns-inte')}`])
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('saknas')
  })

  it('okända kommandon och argument ger användningen och kod 1', () => {
    for (const args of [[], ['slå-på'], ['status', '--rot=x'], ['status', 'check']]) {
      const res = cli(args)
      expect(res.code, args.join(' ')).toBe(1)
      expect(res.out, args.join(' ')).toBe('')
      expect(res.err, args.join(' ')).toContain('Användning: node scripts/ios-widget.mjs status | check | enable')
    }
    expect(cli(['--help'])).toMatchObject({ code: 0, err: '' })
    expect(parseArgs(['status', '--root=/tmp/x'])).toEqual({ command: 'status', root: '/tmp/x' })
  })

  it('en fil som saknas eller ett trasigt projekt ger ett svenskt fel och kod 1', () => {
    const missing = copyParts()
    rmSync(join(missing, APP_ENTITLEMENTS_PATH))
    const res = cli(['status', `--root=${missing}`])
    expect(res).toMatchObject({ code: 1, out: '' })
    expect(res.err).toContain(`${APP_ENTITLEMENTS_PATH} saknas`)

    const broken = copyParts()
    writeIn(broken, PBXPROJ_PATH, readIn(broken, PBXPROJ_PATH).replace('isa = PBXProject;', 'isa = PBXProject'))
    for (const command of ['status', 'check', 'enable']) {
      const out = cli([command, `--root=${broken}`])
      expect(out.code, command).toBe(1)
      expect(out.err, command).toContain('Xcode-projektet går inte att läsa – project.pbxproj rad ')
    }

    // Ett id som inte finns, och ett som inte ens är ett id (en siffra för lite).
    const appDelegateInSources = /(\t\t\t\t)504EC3081FED79650016851F( \/\* AppDelegate\.swift in Sources \*\/,)/
    for (const bad of ['F'.repeat(24), 'F'.repeat(23)]) {
      const dangling = copyParts()
      writeIn(dangling, PBXPROJ_PATH, readIn(dangling, PBXPROJ_PATH).replace(appDelegateInSources, `$1${bad}$2`))
      const dang = cli(['check', `--root=${dangling}`])
      expect(dang.code, bad).toBe(1)
      expect(dang.err, bad).toContain('Xcode-projektet hänvisar till objekt som saknas')
      expect(dang.err, bad).toContain(`${bad} (i 504EC3001FED79650016851F.files[0]`)
    }
  })
})

describe.runIf(REPO_STATE === 'av')('scripts/ios-widget.mjs enable (på en kopia)', () => {
  const original = {
    project: read(PBXPROJ_PATH),
    entitlements: read(APP_ENTITLEMENTS_PATH),
    flag: read(WIDGET_TS_PATH),
  }

  it('slår på widgeten och skriver ut vad som återstår', () => {
    const dir = copyParts()
    const res = cli(['enable', `--root=${dir}`])
    expect(res.err).toBe('')
    expect(res.code).toBe(0)
    expect(res.out).toContain('iPhone-widgeten är påslagen i koden')
    const unchecked = res.out.split('\n').filter((line) => line.trimStart().startsWith('[ ] '))
    expect(unchecked).toHaveLength(ENABLE_CHECKLIST.length)
    // Apple-kontot, integritetspolicyn (appStore-varianten), dokumenten och TestFlight.
    for (const words of [APP_GROUP, WIDGET_BUNDLE_ID, 'appStore-variantens lagringstabell', 'src/features/legal', 'docs/WIDGET.md', 'CLAUDE.md', 'TestFlight']) {
      expect(res.out, words).toContain(words)
    }
    expect(cli(['status', `--root=${dir}`])).toEqual({ code: 0, out: 'på\n', err: '' })
    expect(cli(['check', `--root=${dir}`])).toEqual({ code: 0, out: '', err: '' })
    expect(widgetStatus(dir)).toBe('på')
  })

  it('appmålet beror på widgetmålet och bäddar in det i PlugIns', () => {
    const dir = copyParts()
    expect(cli(['enable', `--root=${dir}`]).code).toBe(0)
    const text = readIn(dir, PBXPROJ_PATH)
    const p = load(text)
    const app = p.target('App')
    const widget = p.target(WIDGET_TARGET)
    expect(danglingReferences(p.project)).toEqual([])
    expect(sectionProblems(text, p.objects)).toEqual([])

    expect(app.dependencies).toEqual([ENABLE_IDS.dependency])
    expect(p.get(ENABLE_IDS.dependency)).toEqual({ isa: 'PBXTargetDependency', target: widget.id, targetProxy: ENABLE_IDS.proxy })
    expect(p.get(ENABLE_IDS.proxy)).toEqual({
      isa: 'PBXContainerItemProxy',
      containerPortal: p.project.rootObject,
      proxyType: '1',
      remoteGlobalIDString: widget.id,
      remoteInfo: 'LagomWidgetExtension',
    })

    expect((app.buildPhases as string[]).map((id) => p.get(id).isa)).toEqual([
      'PBXSourcesBuildPhase',
      'PBXFrameworksBuildPhase',
      'PBXResourcesBuildPhase',
      'PBXCopyFilesBuildPhase',
    ])
    expect(p.get(ENABLE_IDS.embedPhase)).toEqual({
      isa: 'PBXCopyFilesBuildPhase',
      buildActionMask: '2147483647',
      dstPath: '',
      dstSubfolderSpec: '13',
      files: [ENABLE_IDS.embedFile],
      name: EMBED_PHASE_NAME,
      runOnlyForDeploymentPostprocessing: '0',
    })
    expect(EMBED_PHASE_NAME).toBe('Embed Foundation Extensions')
    expect(p.get(ENABLE_IDS.embedFile)).toEqual({
      isa: 'PBXBuildFile',
      fileRef: widget.productReference,
      settings: { ATTRIBUTES: ['RemoveHeadersOnCopy'] },
    })
    // Widgetmålet självt är orört (inga beroenden åt andra hållet).
    expect(widget).toEqual(load().target(WIDGET_TARGET))
  })

  it('ändrar bara det som behövs – resten av projektet står kvar rad för rad', () => {
    const dir = copyParts()
    expect(cli(['enable', `--root=${dir}`]).code).toBe(0)
    const changed = readIn(dir, PBXPROJ_PATH)
    expect(onlyAdditions(original.project, changed)).toBe(true)
    const before = load(original.project).objects
    const after = load(changed).objects
    expect(Object.keys(after).sort()).toEqual([...Object.keys(before), ...Object.values(ENABLE_IDS)].sort())
    const appId = load(original.project).target('App').id
    for (const [id, obj] of Object.entries(before)) {
      if (id === appId) continue
      expect(after[id], id).toEqual(obj)
    }
    // Id:na som enable lägger till krockar inte med projektets.
    for (const id of Object.values(ENABLE_IDS)) {
      expect(id).toMatch(OBJECT_ID)
      expect(original.project).not.toContain(id)
    }
    expect(new Set(Object.values(ENABLE_IDS)).size).toBe(4)
  })

  it('App.entitlements får App Group och behåller HealthKit; flaggan blir true', () => {
    const dir = copyParts()
    expect(cli(['enable', `--root=${dir}`]).code).toBe(0)
    const entitlements = readIn(dir, APP_ENTITLEMENTS_PATH)
    expect(entitlements).toMatch(
      new RegExp(`<key>${APP_GROUP_KEY.replace(/\./g, '\\.')}</key>\\s*<array>\\s*<string>${APP_GROUP.replace(/\./g, '\\.')}</string>\\s*</array>`),
    )
    expect(entitlements).toContain('<key>com.apple.developer.healthkit</key>')
    expect(entitlements).toContain('<key>com.apple.developer.healthkit.access</key>')
    expect(onlyAdditions(original.entitlements, entitlements)).toBe(true)
    expect(entitlements.trimEnd().endsWith('</dict>\n</plist>')).toBe(true)

    const flag = readIn(dir, WIDGET_TS_PATH)
    expect(flag).toMatch(/^export const WIDGET_IOS_READY: boolean = true$/m)
    expect(flag).not.toMatch(/WIDGET_IOS_READY: boolean = false/)
    // Bara flaggans rad ändras.
    const a = original.flag.split('\n')
    const b = flag.split('\n')
    expect(b.length).toBe(a.length)
    expect(a.filter((line, i) => line !== b[i])).toEqual(['export const WIDGET_IOS_READY: boolean = false'])
  })

  it('vägrar en andra gång och lämnar filerna orörda', () => {
    const dir = copyParts()
    expect(cli(['enable', `--root=${dir}`]).code).toBe(0)
    const before = snapshot(dir)
    const res = cli(['enable', `--root=${dir}`])
    expect(res.code).toBe(1)
    expect(res.out).toBe('')
    expect(res.err).toContain('iPhone-widgeten är redan påslagen')
    expect(snapshot(dir)).toEqual(before)
  })

  it.each([
    ['bara flaggan', (dir: string) => writeIn(dir, WIDGET_TS_PATH, enableFlagText(readIn(dir, WIDGET_TS_PATH)))],
    ['bara App Group', (dir: string) => writeIn(dir, APP_ENTITLEMENTS_PATH, enableEntitlementsText(readIn(dir, APP_ENTITLEMENTS_PATH)))],
    ['bara Xcode-projektet', (dir: string) => writeIn(dir, PBXPROJ_PATH, enableProjectText(readIn(dir, PBXPROJ_PATH)))],
    [
      'projektet och flaggan men inte App Group',
      (dir: string) => {
        writeIn(dir, PBXPROJ_PATH, enableProjectText(readIn(dir, PBXPROJ_PATH)))
        writeIn(dir, WIDGET_TS_PATH, enableFlagText(readIn(dir, WIDGET_TS_PATH)))
      },
    ],
    [
      'beroendet utan inbäddningen',
      (dir: string) => {
        const on = enableProjectText(readIn(dir, PBXPROJ_PATH))
        writeIn(dir, PBXPROJ_PATH, on.replace(`\t\t\t\t${ENABLE_IDS.embedPhase} /* ${EMBED_PHASE_NAME} */,\n`, ''))
      },
    ],
    [
      'inbäddningen utan beroendet',
      (dir: string) => {
        const on = enableProjectText(readIn(dir, PBXPROJ_PATH))
        writeIn(dir, PBXPROJ_PATH, on.replace(`\t\t\t\t${ENABLE_IDS.dependency} /* PBXTargetDependency */,\n`, ''))
      },
    ],
    [
      'App Group utan gruppens namn',
      (dir: string) =>
        writeIn(
          dir,
          APP_ENTITLEMENTS_PATH,
          readIn(dir, APP_ENTITLEMENTS_PATH).replace('</dict>', `\t<key>${APP_GROUP_KEY}</key>\n\t<array/>\n</dict>`),
        ),
    ],
  ])('halvvägs påslagen (%s): status, check och enable ger kod 1', (_name, breakIt) => {
    const dir = copyParts()
    breakIt(dir)
    const before = snapshot(dir)
    for (const command of ['status', 'check', 'enable']) {
      const res = cli([command, `--root=${dir}`])
      expect(res.code, command).toBe(1)
      expect(res.out, command).toBe('')
      expect(res.err, command).toContain('iPhone-widgeten är halvvägs påslagen')
    }
    expect(() => widgetStatus(dir)).toThrow(IosWidgetError)
    expect(snapshot(dir)).toEqual(before)
  })

  it('fungerar med Windows-radbrytningar (\\r\\n) och behåller dem', () => {
    const dir = copyParts()
    for (const path of [PBXPROJ_PATH, APP_ENTITLEMENTS_PATH, WIDGET_TS_PATH]) writeIn(dir, path, readIn(dir, path).replace(/\n/g, '\r\n'))
    expect(cli(['status', `--root=${dir}`]).out).toBe('av\n')
    expect(cli(['enable', `--root=${dir}`]).code).toBe(0)
    expect(cli(['status', `--root=${dir}`])).toEqual({ code: 0, out: 'på\n', err: '' })
    for (const path of [PBXPROJ_PATH, APP_ENTITLEMENTS_PATH, WIDGET_TS_PATH]) {
      const text = readIn(dir, path)
      expect(text.replace(/\r\n/g, ''), path).not.toContain('\n')
    }
  })

  it('funktionerna vägrar när en del redan är på', () => {
    const on = enableProjectText(original.project)
    expect(() => enableProjectText(on)).toThrow(/redan påslagen i Xcode-projektet/)
    expect(() => enableEntitlementsText(enableEntitlementsText(original.entitlements))).toThrow(/App Group finns redan/)
    expect(() => enableFlagText(enableFlagText(original.flag))).toThrow(/redan true/)
    expect(flagWidgetState(original.flag.replace('WIDGET_IOS_READY: boolean = false', 'WIDGET_IOS_READY: boolean = true')).state).toBe('på')
    expect(() => flagWidgetState('export const WIDGET_IOS_READY = false')).toThrow(IosWidgetError)
  })
})

describe('kontraktet mellan Swift, TypeScript och Java', () => {
  const shared = () => read(`${WIDGET_DIR}/WidgetShared.swift`)

  it('LagomWidgetShared: App Group, nyckeln, gränsen, namnet och länkarna', () => {
    const swift = shared()
    expect(swift).toMatch(/enum LagomWidgetShared\s*\{/)
    expect(swiftStatic(swift, 'appGroup')).toBe(APP_GROUP)
    expect(swiftStatic(swift, 'kind')).toBe('LagomWidget')

    // Nyckeln – samma som Android-widgetens SharedPreferences.
    const store = read('android/app/src/main/java/se/lagomappen/lagom/widget/WidgetStore.java')
    expect(swiftStatic(swift, 'payloadKey')).toBe('payload')
    expect(/static final String KEY_PAYLOAD = "([^"]+)";/.exec(store)?.[1]).toBe('payload')

    // Gränsen – i UTF-16-enheter överallt (JS length, Java length(), Swift utf16.count).
    const maxSwift = Number(swiftStatic(swift, 'maxChars')?.replace(/_/g, ''))
    const maxTs = Number(/export const WIDGET_MAX_CHARS = ([\d_]+)/.exec(read('src/lib/widgetSummary.ts'))?.[1].replace(/_/g, ''))
    const maxJava = Number(/static final int MAX_CHARS = ([\d_]+);/.exec(read('android/app/src/main/java/se/lagomappen/lagom/widget/WidgetPayload.java'))?.[1].replace(/_/g, ''))
    expect(maxSwift).toBe(32_768)
    expect(maxTs).toBe(maxSwift)
    expect(maxJava).toBe(maxSwift)
    expect(read(`${WIDGET_DIR}/WidgetPayload.swift`)).toMatch(/\.utf16\.count\s*>\s*LagomWidgetShared\.maxChars/)

    // Länkarna – exakt de som src/native/widget.ts tar emot.
    const tsLinks = [...read(WIDGET_TS_PATH).matchAll(/\['(lagom-widget:\/\/[^']+)', '[^']+'\]/g)].map((m) => m[1]).sort()
    expect(tsLinks).toEqual(['lagom-widget://idag', 'lagom-widget://lagg-till'])
    expect(swiftStatic(swift, 'todayURL')).toBe('lagom-widget://idag')
    expect(swiftStatic(swift, 'addURL')).toBe('lagom-widget://lagg-till')

    // Behållaren kontrolleras först, och bara på Apples plattformar (Linux saknar App Groups).
    expect(swift).toMatch(/static func sharedDefaults\(\)\s*->\s*UserDefaults\?/)
    const darwin = swift.indexOf('#if canImport(Darwin)')
    const container = swift.indexOf('containerURL(forSecurityApplicationGroupIdentifier')
    expect(darwin).toBeGreaterThan(-1)
    expect(container).toBeGreaterThan(darwin)
    expect(container).toBeLessThan(swift.indexOf('#else', darwin))
  })

  it('WidgetPayload: parse och felen har kontraktets namn', () => {
    const payload = read(`${WIDGET_DIR}/WidgetPayload.swift`)
    expect(payload).toMatch(/struct WidgetPayload\s*:\s*Equatable/)
    expect(payload).toMatch(/static func parse\(_ text: String\) throws -> WidgetPayload/)
    expect(payload).toMatch(/enum WidgetPayloadError\s*:\s*Error,\s*Equatable/)
    expect(payload).toMatch(/case tooLarge\b/)
    expect(payload).toMatch(/case invalid\(String\)/)
  })

  it('filerna som Swift-testerna kompilerar på Linux använder bara Foundation', () => {
    for (const file of ['WidgetShared.swift', 'WidgetPayload.swift', 'WidgetContent.swift']) {
      const source = read(`${WIDGET_DIR}/${file}`)
      expect(swiftImports(source), file).toEqual(['Foundation'])
      expect(source, file).not.toMatch(/@main\b/)
    }
    const tests = read('ios/App/LagomWidgetTests/main.swift')
    for (const framework of ['UIKit', 'SwiftUI', 'WidgetKit', 'Capacitor']) expect(swiftImports(tests), framework).not.toContain(framework)
    const fixtures = readdirSync(join(root, 'ios/App/LagomWidgetTests/fixtures')).filter((f) => f.endsWith('.json'))
    expect(fixtures.length).toBeGreaterThan(0)
  })

  it('widgeten har en @main och använder LagomWidgetShared.kind', () => {
    const sources = readdirSync(join(root, WIDGET_DIR)).filter((f) => f.endsWith('.swift'))
    const withMain = sources.filter((f) => /^\s*@main\b/m.test(read(`${WIDGET_DIR}/${f}`)))
    expect(withMain).toEqual(['LagomWidgetBundle.swift'])
    expect(read(`${WIDGET_DIR}/LagomWidgetBundle.swift`)).toMatch(/:\s*WidgetBundle\b/)
    expect(read(`${WIDGET_DIR}/LagomTodayWidget.swift`)).toContain('LagomWidgetShared.kind')
  })

  it('tillägget heter LagomWidget, har update och clear och samma felkoder som Android', () => {
    const plugin = read(`${APP_DIR}/LagomWidgetPlugin.swift`)
    expect(plugin).toMatch(/class LagomWidgetPlugin\s*:\s*CAPPlugin,\s*CAPBridgedPlugin/)
    expect(plugin).toMatch(/let identifier = "LagomWidgetPlugin"/)
    expect(plugin).toMatch(/let jsName = "LagomWidget"/)
    for (const method of ['update', 'clear']) {
      expect(plugin, method).toMatch(new RegExp(`CAPPluginMethod\\(name: "${method}", returnType: CAPPluginReturnPromise\\)`))
      expect(plugin, method).toMatch(new RegExp(`@objc func ${method}\\(_ call: CAPPluginCall\\)`))
    }
    expect(plugin).toContain('LagomWidgetShared.sharedDefaults()')
    expect(plugin).toContain('LagomWidgetShared.payloadKey')
    expect(plugin).toContain('WidgetPayload.parse(')
    // Samma namn som JS registrerar (registerPlugin('LagomWidget') i src/native/widget.ts).
    expect(read(WIDGET_TS_PATH)).toMatch(/registerPlugin<[^>]*>\('LagomWidget'\)/)

    const codes = (source: string) => new Set([...source.matchAll(/call\.reject\([^\n]*?"([A-Z_]+)"\)/g)].map((m) => m[1]))
    const android = codes(read('android/app/src/main/java/se/lagomappen/lagom/widget/LagomWidgetPlugin.java'))
    const ios = codes(plugin)
    expect(ios.has('STORAGE')).toBe(true)
    for (const code of ios) expect(android.has(code), code).toBe(true)
  })

  it('appen registrerar tillägget via LagomBridgeViewController i SceneDelegate', () => {
    const bridge = read(`${APP_DIR}/LagomBridgeViewController.swift`)
    expect(bridge).toMatch(/class LagomBridgeViewController\s*:\s*CAPBridgeViewController/)
    expect(bridge).toMatch(/override (?:open )?func capacitorDidLoad\(\)/)
    expect(bridge).toContain('registerPluginInstance(LagomWidgetPlugin())')
    const scene = read(`${APP_DIR}/SceneDelegate.swift`)
    expect(scene).toContain('window?.rootViewController = LagomBridgeViewController()')
    expect(scene).not.toMatch(/=\s*CAPBridgeViewController\(\)/)
  })

  it('behörigheterna: widgeten har App Group (och inget annat), appen bara när widgeten är på', () => {
    const widget = read(`${WIDGET_DIR}/LagomWidget.entitlements`)
    expect(entitlementsWidgetState(widget).state).toBe('på')
    expect([...widget.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1])).toEqual([APP_GROUP_KEY])
    expect(entitlementsWidgetState(read(APP_ENTITLEMENTS_PATH)).state).toBe(REPO_STATE)
  })

  it('Info.plist: WidgetKit-tillägg med appens version och byggnummer', () => {
    const plist = read(`${WIDGET_DIR}/Info.plist`)
    expect(plistString(plist, 'NSExtensionPointIdentifier')).toBe('com.apple.widgetkit-extension')
    expect(plistString(plist, 'CFBundleIdentifier')).toBe('$(PRODUCT_BUNDLE_IDENTIFIER)')
    expect(plistString(plist, 'CFBundleExecutable')).toBe('$(EXECUTABLE_NAME)')
    expect(plistString(plist, 'CFBundleShortVersionString')).toBe('$(MARKETING_VERSION)')
    expect(plistString(plist, 'CFBundleVersion')).toBe('$(CURRENT_PROJECT_VERSION)')
    // WidgetKit startar widgeten via @main – en huvudklass eller storyboard hindrar det.
    expect(plist).not.toContain('NSExtensionPrincipalClass')
    expect(plist).not.toContain('NSExtensionMainStoryboard')
  })

  it('asset-katalogen har färgerna i ljust och mörkt läge', () => {
    const catalog = join(root, WIDGET_DIR, 'Assets.xcassets')
    const colorsets = readdirSync(catalog).filter((f) => f.endsWith('.colorset'))
    expect(colorsets).toEqual(expect.arrayContaining(['AccentColor.colorset', 'WidgetBackground.colorset']))
    for (const set of colorsets) {
      expect(statSync(join(catalog, set)).isDirectory(), set).toBe(true)
      const contents = JSON.parse(readFileSync(join(catalog, set, 'Contents.json'), 'utf8')) as {
        colors?: Array<{ appearances?: Array<{ appearance: string; value: string }> }>
      }
      const dark = (contents.colors ?? []).some((c) => c.appearances?.some((a) => a.appearance === 'luminosity' && a.value === 'dark'))
      expect(dark, `${set}: mörkt läge`).toBe(true)
    }
  })

  it('integritetsmanifesten anger UserDefaults-skälet 1C8F.1 (App Group) – appen även CA92.1', () => {
    // Appen: sina egna inställningar (CA92.1) och App Groupens (1C8F.1). Widgeten läser bara App Groupens.
    expect(userDefaultsReasons(read(`${APP_DIR}/PrivacyInfo.xcprivacy`))).toEqual(['1C8F.1', 'CA92.1'])
    const widgetReasons = userDefaultsReasons(read(`${WIDGET_DIR}/PrivacyInfo.xcprivacy`))
    expect(widgetReasons).toContain('1C8F.1')
    for (const reason of widgetReasons) expect(['1C8F.1', 'CA92.1']).toContain(reason)
    for (const path of [`${APP_DIR}/PrivacyInfo.xcprivacy`, `${WIDGET_DIR}/PrivacyInfo.xcprivacy`]) {
      expect(read(path), path).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/)
    }
    // Widgeten samlar inget.
    expect(read(`${WIDGET_DIR}/PrivacyInfo.xcprivacy`)).toMatch(/<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>|<key>NSPrivacyCollectedDataTypes<\/key>\s*<array>\s*<\/array>/)
  })
})
