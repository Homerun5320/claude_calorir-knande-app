/**
 * Facit för iPhone-widgetens Swift-tester (ios/App/LagomWidgetTests/main.swift): riktiga
 * sammanfattningar från `buildWidgetPayload`, sparade som JSON-filer i
 * ios/App/LagomWidgetTests/fixtures/. Swift-testerna (som körs i molnbygget – här finns ingen
 * Swift-kompilator) kontrollerar att `WidgetPayload.parse` godtar precis det som appen skickar och
 * att widgeten väljer rätt rad. Ändras texterna i src/lib/widgetSummary.ts eller formatet i
 * src/lib/format.ts ändras filerna också: `npx vitest run src/native/widgetIosFixtures.test.ts -u`
 * och sedan Swift-testerna (se main.swift).
 *
 * Filerna blir desamma i alla tidszoner: "nu" är onsdag 30 september 2026 kl. 12 lokal tid (så att
 * datumen alltid är 2026-09-30 till 2026-10-06), `generatedAt` ersätts med ett fast värde och
 * fastans starttid är en fast tidpunkt. Dagsmålen är fasta (inte uträknade ur profilen).
 */
import { DEFAULT_SETTINGS } from '../stores/profileStore'
import type { DiaryEntry, ISODate, MealId, Profile, Settings, Targets } from '../types'
import { buildWidgetPayload, serializeWidgetPayload, WIDGET_MAX_CHARS, WIDGET_TEXT, type WidgetInput, type WidgetPayload, type WidgetTargets } from '../lib/widgetSummary'
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

async function readRepoFile(path: string): Promise<string> {
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  return readFile(await repoPath(path), 'utf8')
}

async function listRepoDir(path: string): Promise<string[]> {
  const { readdir } = await nodeModule<NodeFs>('node:fs/promises')
  return readdir(await repoPath(path))
}

const WIDGET_DIR = 'ios/App/LagomWidget'
const TESTS_DIR = 'ios/App/LagomWidgetTests'

/** Onsdag 30 september 2026 kl. 12 lokal tid – datumen blir desamma i alla tidszoner. */
const NOW = new Date(2026, 8, 30, 12, 0)
const TODAY: ISODate = '2026-09-30'
/** 2026-09-30 kl. 12 i Stockholm (UTC+2) – fast, så att filerna inte beror på tidszonen. */
const GENERATED_AT = Date.UTC(2026, 8, 30, 10, 0)
/** 2026-09-29 kl. 22 i Stockholm – fastans start. */
const FASTING_START = Date.UTC(2026, 8, 29, 20, 0)

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

const SETTINGS: Settings = { ...DEFAULT_SETTINGS, onboardingDone: true }

const TARGETS: Targets = {
  kcal: 2000,
  proteinG: 90,
  carbsG: 250,
  fatG: 70,
  fiberG: 30,
  waterMl: 2000,
  saltMaxG: 6,
  satFatMaxG: 22,
  addedSugarMaxG: 50,
  caffeineMaxMg: 400,
}
const FIXED: WidgetTargets = { targetsFor: () => TARGETS, addBackPct: 50 }

let seq = 0
function quick(date: ISODate, meal: MealId, kcal: number): DiaryEntry {
  seq += 1
  return { id: `e${seq}`, kind: 'quick', name: 'Post', nutrients: { kcal }, date, meal, createdAt: seq }
}

function input(patch: Partial<WidgetInput> = {}, diary: Partial<WidgetInput['diary']> = {}): WidgetInput {
  return {
    profile: PROFILE,
    settings: SETTINGS,
    weights: [],
    diary: { entries: {}, water: {}, exercise: {}, days: {}, ...diary },
    fasting: null,
    demo: false,
    targets: FIXED,
    ...patch,
  }
}

/** En vanlig dag: tre måltider, 760 kcal och 0,75 l vatten idag; i morgon en post till lunch. */
const TYPICAL_DIARY: Partial<WidgetInput['diary']> = {
  entries: {
    [TODAY]: [quick(TODAY, 'frukost', 380), quick(TODAY, 'lunch', 300), quick(TODAY, 'middag', 80)],
    '2026-10-01': [quick('2026-10-01', 'lunch', 500)],
  },
  water: { [TODAY]: 750 },
}

/** Facitfilerna: namn (filen `<namn>.json`) och sammanfattningen. */
const FIXTURES: ReadonlyArray<readonly [string, () => WidgetPayload]> = [
  ['normal', () => buildWidgetPayload(input({}, TYPICAL_DIARY), NOW)],
  ['over', () => buildWidgetPayload(input({}, { entries: { [TODAY]: [quick(TODAY, 'middag', 2300)] }, water: { [TODAY]: 2500 } }), NOW)],
  ['mindful', () => buildWidgetPayload(input({ settings: { ...SETTINGS, mindfulMode: true } }, TYPICAL_DIARY), NOW)],
  ['fasting', () => buildWidgetPayload(input({ fasting: { start: FASTING_START, targetHours: 16 } }, TYPICAL_DIARY), NOW)],
  ['noWaterTarget', () => buildWidgetPayload(input({ targets: { targetsFor: () => ({ ...TARGETS, waterMl: 0 }), addBackPct: 50 } }, TYPICAL_DIARY), NOW)],
  ['demo', () => buildWidgetPayload(input({ demo: true, fasting: { start: FASTING_START, targetHours: 16 } }, TYPICAL_DIARY), NOW)],
  ['noProfile', () => buildWidgetPayload(input({ profile: null, targets: undefined }), NOW)],
]

/** JSON-texten som appen skickar, med en fast tidsstämpel. */
function fixtureJson(build: () => WidgetPayload): string {
  return serializeWidgetPayload({ ...build(), generatedAt: GENERATED_AT })
}

describe('facitfilerna för iPhone-widgetens Swift-tester', () => {
  it.each(FIXTURES)('%s.json', async (name, build) => {
    const json = fixtureJson(build)
    expect(json.length).toBeLessThanOrEqual(WIDGET_MAX_CHARS)
    await expect(json).toMatchFileSnapshot(`../../${TESTS_DIR}/fixtures/${name}.json`)
  })

  it('facitfilerna täcker lägena som Swift-testerna kontrollerar', () => {
    const payloads = Object.fromEntries(FIXTURES.map(([name, build]) => [name, build()]))
    expect(payloads.normal.days).toHaveLength(7)
    expect(payloads.normal.days[0].date).toBe(TODAY)
    expect(payloads.normal.days[6].date).toBe('2026-10-06')
    expect(payloads.normal.days[0].waterText).not.toBeNull()
    expect(payloads.over.days[0].energyText).toContain('över – helt okej')
    expect(payloads.over.days[0].energyPermille).toBe(1000)
    expect(payloads.mindful.mindful).toBe(true)
    expect(payloads.mindful.days[0].energyText).toBeNull()
    expect(payloads.fasting.fasting).toEqual({ startedAt: FASTING_START, label: WIDGET_TEXT.fasting, targetText: 'Mål 16 h' })
    expect(payloads.noWaterTarget.days[0].waterText).toBeNull()
    expect(payloads.demo).toMatchObject({ state: 'demo', days: [], fasting: null, fallbackText: WIDGET_TEXT.demo })
    expect(payloads.noProfile).toMatchObject({ state: 'noProfile', days: [], fasting: null, fallbackText: WIDGET_TEXT.noProfile })
  })

  it('Swift-testerna läser varje facitfil, och det finns inga andra', async () => {
    const main = await readRepoFile(`${TESTS_DIR}/main.swift`)
    const names = FIXTURES.map(([name]) => name)
    for (const name of names) expect(main, name).toContain(`"${name}"`)
    const files = (await listRepoDir(`${TESTS_DIR}/fixtures`)).filter((f) => f.endsWith('.json'))
    expect(files.sort()).toEqual(names.map((name) => `${name}.json`).sort())
  })
})

describe('kontraktet mellan JS och iPhone-widgeten', () => {
  it('gränsen, App Group, nyckeln och länkarna i WidgetShared.swift', async () => {
    const shared = await readRepoFile(`${WIDGET_DIR}/WidgetShared.swift`)
    const max = /static let maxChars = ([\d_]+)/.exec(shared)?.[1]
    expect(Number(max?.replace(/_/g, ''))).toBe(WIDGET_MAX_CHARS)
    expect(shared).toContain('static let appGroup = "group.se.lagomappen.lagom"')
    expect(shared).toContain('static let payloadKey = "payload"')
    expect(shared).toContain('static let kind = "LagomWidget"')
    const links = [...shared.matchAll(/URL\(string: "(lagom-widget:\/\/[^"]+)"\)/g)].map((m) => m[1]).sort()
    expect(links).toEqual([...WIDGET_LINKS.keys()].sort())
  })

  it('samma fasta texter som Android-widgeten', async () => {
    const content = await readRepoFile(`${WIDGET_DIR}/WidgetContent.swift`)
    const strings = await readRepoFile('android/app/src/main/res/values/strings.xml')
    const android = (name: string) => new RegExp(`<string name="${name}">([^<]*)</string>`).exec(strings)?.[1]
    for (const name of ['widget_title_today', 'widget_title_app', 'widget_add', 'widget_add_description', 'widget_fallback_default', 'widget_fasting_description', 'widget_water_description']) {
      const text = android(name)
      expect(text, name).toBeTruthy()
      expect(content, name).toContain(`"${text}"`)
    }
    expect(android('widget_fallback_default')).toBe(WIDGET_TEXT.openApp)
    const widget = await readRepoFile(`${WIDGET_DIR}/LagomTodayWidget.swift`)
    expect(widget).toContain(`.configurationDisplayName("${android('widget_label')}")`)
    expect(widget).toContain(`.description("${android('widget_description')}")`)
  })
})
