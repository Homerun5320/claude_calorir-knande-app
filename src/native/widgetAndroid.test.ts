/**
 * Hemskärmswidgeten: att JS-sidan (src/native/widget.ts, src/lib/widgetSummary.ts) och Android-sidan
 * (android/app/src/main/java/se/lagomappen/lagom/widget/) följer samma kontrakt – och att
 * dokumentationen tar upp filerna. Android SDK finns inte här, så testerna läser källtexten
 * (JUnit-testerna körs i kontrollbygget, .github/workflows/native.yml).
 */
import { WIDGET_MAX_CHARS } from '../lib/widgetSummary'
import { WIDGET_LINKS } from './widget'

interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readdir(path: string): Promise<string[]>
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

async function listRepoDir(path: string): Promise<string[]> {
  const { readdir } = await nodeModule<NodeFs>('node:fs/promises')
  return readdir(await repoPath(path))
}

const JAVA = 'android/app/src/main/java/se/lagomappen/lagom'
const JAVA_TESTS = 'android/app/src/test/java/se/lagomappen/lagom/widget'

/** Värdet på en `String`-konstant i en Java-klass, med `SCHEME + "…"` utskrivet. */
function javaString(source: string, name: string): string | undefined {
  const scheme = /static final String SCHEME = "([^"]+)";/.exec(source)?.[1] ?? ''
  const match = new RegExp(`static final String ${name} = (SCHEME \\+ )?"([^"]+)";`).exec(source)
  if (!match) return undefined
  return (match[1] ? scheme : '') + match[2]
}

describe('kontraktet mellan JS och Android', () => {
  it('länkarna i WIDGET_LINKS är exakt de i WidgetLinks.java', async () => {
    const links = await readRepoFile(`${JAVA}/widget/WidgetLinks.java`)
    expect(javaString(links, 'TODAY')).toBe('lagom-widget://idag')
    expect(javaString(links, 'ADD')).toBe('lagom-widget://lagg-till')
    expect([...WIDGET_LINKS.keys()].sort()).toEqual([javaString(links, 'ADD'), javaString(links, 'TODAY')].sort())
    expect(WIDGET_LINKS.get('lagom-widget://idag')).toBe('/')
    expect(WIDGET_LINKS.get('lagom-widget://lagg-till')).toBe('/lagg-till')
  })

  it('WIDGET_MAX_CHARS är samma gräns som WidgetPayload.MAX_CHARS', async () => {
    const payload = await readRepoFile(`${JAVA}/widget/WidgetPayload.java`)
    const max = /static final int MAX_CHARS = ([\d_]+);/.exec(payload)?.[1]
    expect(Number(max?.replace(/_/g, ''))).toBe(WIDGET_MAX_CHARS)
    expect(WIDGET_MAX_CHARS).toBe(32_768)
  })

  it('tillägget heter LagomWidget och har metoderna update och clear', async () => {
    const plugin = await readRepoFile(`${JAVA}/widget/LagomWidgetPlugin.java`)
    expect(plugin).toContain('@CapacitorPlugin(name = "LagomWidget")')
    expect(plugin).toMatch(/@PluginMethod\s+public void update\(PluginCall call\)/)
    expect(plugin).toMatch(/@PluginMethod\s+public void clear\(PluginCall call\)/)
  })

  it('MainActivity registrerar tillägget och tar bort en uppspelad länk – båda före super.onCreate', async () => {
    const main = await readRepoFile(`${JAVA}/MainActivity.java`)
    const onCreate = main.indexOf('super.onCreate(')
    expect(onCreate).toBeGreaterThan(0)
    for (const call of ['registerPlugin(LagomWidgetPlugin.class)', 'dropReplayedWidgetLink(getIntent()']) {
      const at = main.indexOf(call)
      expect(at, call).toBeGreaterThan(0)
      expect(at, call).toBeLessThan(onCreate)
    }
    expect(main).toContain('WidgetLinks.isReplayedLink(')
  })
})

describe('manifestet', () => {
  it('mottagaren är inte exporterad, och ingen intent-filter tar emot lagom-widget://', async () => {
    const manifest = await readRepoFile('android/app/src/main/AndroidManifest.xml')
    const receiver = /<receiver\s[^>]*android:name="\.widget\.LagomWidgetProvider"[^>]*>/.exec(manifest)?.[0] ?? ''
    expect(receiver).toContain('android:exported="false"')
    expect(receiver).not.toContain('android:permission=')
    expect(manifest).not.toMatch(/android:scheme="lagom-widget"/)
  })

  it('widgeten kräver inga exakta alarm', async () => {
    const manifest = await readRepoFile('android/app/src/main/AndroidManifest.xml')
    for (const permission of ['SCHEDULE_EXACT_ALARM', 'USE_EXACT_ALARM']) {
      expect(manifest, permission).toMatch(new RegExp(`android\\.permission\\.${permission}" tools:node="remove"`))
    }
  })
})

describe('kontrollbygget och dokumentationen', () => {
  it('native.yml kör widgetens JUnit-tester', async () => {
    const native = await readRepoFile('.github/workflows/native.yml')
    expect(native).toMatch(/gradlew[^\n]*:app:testDebugUnitTest/)
    const tests = (await listRepoDir(JAVA_TESTS)).filter((f) => f.endsWith('Test.java'))
    expect(tests).toContain('WidgetLinksTest.java')
  })

  it('WIDGET.md tar upp varje klass i widget/ och varje JUnit-test', async () => {
    const doc = await readRepoFile('docs/WIDGET.md')
    const classes = (await listRepoDir(`${JAVA}/widget`)).filter((f) => f.endsWith('.java')).map((f) => f.replace(/\.java$/, ''))
    const tests = (await listRepoDir(JAVA_TESTS)).filter((f) => f.endsWith('.java')).map((f) => f.replace(/\.java$/, ''))
    expect(classes.length).toBeGreaterThan(0)
    for (const name of [...classes, ...tests]) expect(doc, name).toContain(`\`${name}\``)
  })

  it('WIDGET.md och NATIVE.md beskriver hur en uppspelad länk stoppas', async () => {
    for (const path of ['docs/WIDGET.md', 'docs/NATIVE.md']) {
      const doc = await readRepoFile(path)
      expect(doc, path).toContain('WidgetLinks.isReplayedLink')
      expect(doc, path).toContain('pageWasReloaded()')
    }
  })
})
