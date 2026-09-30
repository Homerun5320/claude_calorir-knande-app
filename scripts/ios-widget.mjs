#!/usr/bin/env node
/**
 * iPhone-widgeten: av eller på (docs/WIDGET.md §8).
 *
 *   node scripts/ios-widget.mjs status   skriver "på" eller "av"
 *   node scripts/ios-widget.mjs check    skriver inget när allt hänger ihop
 *   node scripts/ios-widget.mjs enable   slår på widgeten (en gång)
 *   … [--root=<katalog>]                 repots rot (standard: den här checkouten)
 *
 * Widgetmålet "LagomWidgetExtension" finns alltid i Xcode-projektet (molnet bygger det för sig med
 * `xcodebuild -target LagomWidgetExtension`), men så länge ägarens Apple-konto saknar App Group
 * "group.se.lagomappen.lagom" är det inte en del av appen – annars går appen inte att signera.
 * Tre saker skiljer "på" från "av", och de ändras alltid tillsammans:
 *
 * 1. ios/App/App.xcodeproj/project.pbxproj – appmålet beror på widgetmålet
 *    (PBXContainerItemProxy + PBXTargetDependency) och bäddar in LagomWidgetExtension.appex i
 *    PlugIns (PBXCopyFilesBuildPhase "Embed Foundation Extensions", dstSubfolderSpec 13).
 * 2. ios/App/App/App.entitlements – `com.apple.security.application-groups` med gruppen.
 * 3. src/native/widget.ts – `export const WIDGET_IOS_READY: boolean = true`.
 *
 * `status` och `check` avslutar med kod 1 och ett svenskt fel när de tre inte är överens (halvvägs
 * påslagen) eller projektfilen är trasig. `enable` vägrar om widgeten redan är på eller halvvägs,
 * ändrar bara de rader som behövs (resten av filerna står kvar tecken för tecken), kontrollerar
 * resultatet och skriver sedan ut det som återstår att göra för hand. Molnbyggena läser läget med
 *   WIDGET="$(node scripts/ios-widget.mjs status)"; if [ "$WIDGET" = "på" ]; then …; fi
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { OBJECT_ID, parsePbxproj, PbxprojError } from './pbxproj.mjs'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Filerna som skiljer "på" från "av" (relativt repots rot). */
export const PBXPROJ_PATH = 'ios/App/App.xcodeproj/project.pbxproj'
export const APP_ENTITLEMENTS_PATH = 'ios/App/App/App.entitlements'
export const WIDGET_TS_PATH = 'src/native/widget.ts'

export const APP_GROUP = 'group.se.lagomappen.lagom'
export const APP_GROUP_KEY = 'com.apple.security.application-groups'
export const APP_TARGET = 'App'
export const WIDGET_TARGET = 'LagomWidgetExtension'
export const WIDGET_PRODUCT = 'LagomWidgetExtension.appex'
export const EMBED_PHASE_NAME = 'Embed Foundation Extensions'
/** PBXCopyFilesBuildPhase: 13 = PlugIns (där app extensions ligger i appen). */
export const EMBED_SUBFOLDER_SPEC = '13'

export const FLAG_ON = 'export const WIDGET_IOS_READY: boolean = true'
export const FLAG_OFF = 'export const WIDGET_IOS_READY: boolean = false'
const FLAG_LINE = /^export const WIDGET_IOS_READY: boolean = (true|false)[ \t]*$/gm

/** De fasta id:na för objekten som `enable` lägger till (samma serie som widgetmålet, 7A1D6E0…). */
export const ENABLE_IDS = Object.freeze({
  proxy: '7A1D6E042EA0C0DE00000001',
  dependency: '7A1D6E042EA0C0DE00000002',
  embedPhase: '7A1D6E042EA0C0DE00000003',
  embedFile: '7A1D6E042EA0C0DE00000004',
})

/** Det som återstår efter `enable` (docs/WIDGET.md §8) – i samma ändring. */
export const ENABLE_CHECKLIST = Object.freeze([
  `Apple Developer-kontot (developer.apple.com → Certificates, Identifiers & Profiles → Identifiers): App Groups → + → ${APP_GROUP} (beskrivning "Lagom widget").`,
  `App ID:t se.lagomappen.lagom → App Groups → Configure: välj ${APP_GROUP} och spara (de befintliga profilerna blir ogiltiga – molnbygget skapar nya med --create).`,
  `Ett nytt App ID (App, Explicit) se.lagomappen.lagom.widget, beskrivning "Lagom widget", med förmågan App Groups och samma grupp – inget annat (ingen HealthKit).`,
  'Molnbyggena (.github/workflows/release.yml och codemagic.yaml) följer med av sig själva när node scripts/ios-widget.mjs status ger "på": de hämtar även profilen för se.lagomappen.lagom.widget och kontrollerar att IPA:n har PlugIns/LagomWidgetExtension.appex med Bundle ID:t, samma version och App Group i båda signaturerna. Kontrollera efter den första körningen att steget "Kontrollera IPA:n (iPhone-widgeten)" gick igenom.',
  'Integritetspolicyn (src/features/legal/legalContent.ts): en rad i appStore-variantens lagringstabell (App Group-behållaren, delad mellan appen och widgeten) och ett stycke under "Din dagbok finns bara på din enhet" – utan att nämna Android, Google Play eller Health Connect. Ändra testet i src/features/legal/legal.test.tsx och kör npx vitest run src/features/legal -u.',
  'Dokumenten: docs/WIDGET.md §8, docs/NATIVE.md §5 och §8, docs/APP-STORE.md (beskrivningen och "Nyheter"), supportsidan (public/support/) och CLAUDE.md.',
  'Testerna: npx vitest run netlify/tests/ios-widget.test.ts src/native src/features/legal, npx tsc -p tsconfig.app.json --noEmit och node scripts/ios-widget.mjs check.',
  'Prova i TestFlight (docs/WIDGET.md §7): håll fingret på hemskärmen → Redigera → Lägg till widget → Lagom, och tryck på widgeten och på "Lägg till".',
])

export class IosWidgetError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'IosWidgetError'
  }
}

/** @typedef {'på' | 'av' | 'halv'} PartState */

// ---------------------------------------------------------------------------
// Xcode-projektet
// ---------------------------------------------------------------------------

/**
 * Alla id:n som projektet hänvisar till (värden med 24 hexsiffror och nycklar i t.ex.
 * TargetAttributes), med var hänvisningen står.
 * @param {Record<string, any>} project
 * @returns {Array<{ id: string, from: string }>}
 */
export function referencedIds(project) {
  /** @type {Array<{ id: string, from: string }>} */
  const refs = []
  /**
   * @param {unknown} value
   * @param {string} from
   */
  const walk = (value, from) => {
    if (typeof value === 'string') {
      if (OBJECT_ID.test(value)) refs.push({ id: value, from })
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${from}[${i}]`))
    } else if (value && typeof value === 'object') {
      for (const [key, v] of Object.entries(value)) {
        if (OBJECT_ID.test(key)) refs.push({ id: key, from: `${from}.${key} (nyckel)` })
        walk(v, `${from}.${key}`)
      }
    }
  }
  if (typeof project.rootObject === 'string') refs.push({ id: project.rootObject, from: 'rootObject' })
  for (const [id, obj] of Object.entries(project.objects ?? {})) {
    // En proxy till ett annat Xcode-projekt pekar på ett id i det projektets fil.
    if (obj?.isa === 'PBXContainerItemProxy' && obj.containerPortal !== project.rootObject) {
      const { remoteGlobalIDString: _remote, ...rest } = obj
      walk(rest, id)
    } else {
      walk(obj, id)
    }
  }
  return refs
}

/** Fälten där Xcode alltid skriver id:n (ett id eller en lista med id:n). */
const REFERENCE_KEYS = new Set([
  'baseConfigurationReference',
  'buildConfigurationList',
  'buildConfigurations',
  'buildPhases',
  'children',
  'containerPortal',
  'dependencies',
  'fileRef',
  'files',
  'mainGroup',
  'package',
  'packageProductDependencies',
  'packageReferences',
  'productRef',
  'productRefGroup',
  'productReference',
  'remoteGlobalIDString',
  'target',
  'targetProxy',
  'targets',
])

/**
 * Värden i id-fälten som inte är ett id (t.ex. en siffra för lite).
 * @param {Record<string, any>} project
 * @returns {string[]}
 */
function malformedReferences(project) {
  /** @type {string[]} */
  const bad = []
  for (const [id, obj] of Object.entries(project.objects ?? {})) {
    if (!obj || typeof obj !== 'object') continue
    for (const [key, value] of Object.entries(obj)) {
      if (!REFERENCE_KEYS.has(key)) continue
      for (const [i, v] of (Array.isArray(value) ? value : [value]).entries()) {
        if (typeof v !== 'string' || !OBJECT_ID.test(v)) {
          bad.push(`${typeof v === 'string' ? v : JSON.stringify(v)} (i ${id}.${key}${Array.isArray(value) ? `[${i}]` : ''} – inget id)`)
        }
      }
    }
  }
  return bad
}

/**
 * Hänvisningar till objekt som inte finns, och id-fält som inte innehåller ett id (tom lista när
 * projektet hänger ihop).
 * @param {Record<string, any>} project
 * @returns {string[]}
 */
export function danglingReferences(project) {
  const objects = project.objects ?? {}
  return [
    ...referencedIds(project)
      .filter((ref) => !Object.hasOwn(objects, ref.id))
      .map((ref) => `${ref.id} (i ${ref.from})`),
    ...malformedReferences(project),
  ]
}

/**
 * @param {Record<string, any>} objects
 * @param {string} name
 */
function nativeTarget(objects, name) {
  const found = Object.entries(objects).filter(([, o]) => o?.isa === 'PBXNativeTarget' && o.name === name)
  if (found.length > 1) throw new IosWidgetError(`Xcode-projektet har ${found.length} mål som heter ${name}.`)
  return found.length === 1 ? { id: found[0][0], target: found[0][1] } : null
}

/** @param {unknown} value */
const list = (value) => (Array.isArray(value) ? value : [])

/**
 * Läget i Xcode-projektet: beror appmålet på widgetmålet och bäddar det in widgeten?
 * @param {string} text project.pbxproj
 * @returns {{ state: PartState, details: string[] }}
 */
export function projectWidgetState(text) {
  let project
  try {
    project = parsePbxproj(text)
  } catch (err) {
    if (err instanceof PbxprojError) throw new IosWidgetError(`Xcode-projektet går inte att läsa – ${err.message}`)
    throw err
  }
  const objects = project.objects ?? {}
  const dangling = danglingReferences(project)
  if (dangling.length > 0) {
    throw new IosWidgetError(`Xcode-projektet hänvisar till objekt som saknas:\n- ${dangling.slice(0, 10).join('\n- ')}`)
  }
  const app = nativeTarget(objects, APP_TARGET)
  if (!app) throw new IosWidgetError(`Xcode-projektet saknar appmålet ${APP_TARGET}.`)
  const widget = nativeTarget(objects, WIDGET_TARGET)
  if (!widget) throw new IosWidgetError(`Xcode-projektet saknar widgetmålet ${WIDGET_TARGET}.`)
  const appex = widget.target.productReference

  const dependsOnWidget = list(app.target.dependencies).some((id) => {
    const dep = objects[id]
    if (dep?.isa !== 'PBXTargetDependency' || dep.target !== widget.id) return false
    const proxy = objects[dep.targetProxy]
    return (
      proxy?.isa === 'PBXContainerItemProxy' &&
      proxy.containerPortal === project.rootObject &&
      proxy.proxyType === '1' &&
      proxy.remoteGlobalIDString === widget.id
    )
  })
  const embedsWidget = list(app.target.buildPhases).some((id) => {
    const phase = objects[id]
    return (
      phase?.isa === 'PBXCopyFilesBuildPhase' &&
      phase.dstSubfolderSpec === EMBED_SUBFOLDER_SPEC &&
      list(phase.files).some((file) => objects[file]?.fileRef === appex)
    )
  })
  // Rester av ett halvt påslag: objekt som bara `enable` lägger till.
  const leftovers = [
    ...Object.values(ENABLE_IDS).filter((id) => Object.hasOwn(objects, id)),
    ...Object.entries(objects)
      .filter(
        ([, o]) =>
          (o?.isa === 'PBXContainerItemProxy' && o.remoteGlobalIDString === widget.id) ||
          (o?.isa === 'PBXTargetDependency' && o.target === widget.id) ||
          (o?.isa === 'PBXBuildFile' && o.fileRef === appex),
      )
      .map(([id]) => id),
  ]

  if (dependsOnWidget && embedsWidget) return { state: 'på', details: [] }
  if (!dependsOnWidget && !embedsWidget && leftovers.length === 0) return { state: 'av', details: [] }
  const details = [
    `appmålet beror på widgetmålet: ${dependsOnWidget ? 'ja' : 'nej'}`,
    `appmålet bäddar in ${WIDGET_PRODUCT}: ${embedsWidget ? 'ja' : 'nej'}`,
  ]
  if (leftovers.length > 0) details.push(`objekt från ett påslag: ${[...new Set(leftovers)].join(', ')}`)
  return { state: 'halv', details }
}

/**
 * Skriv in objekten i sin sektion (före `/* End … section *\/`). Saknas sektionen skapas den på
 * sin plats i bokstavsordning, som Xcode sorterar dem.
 * @param {string} text
 * @param {string} isa
 * @param {string} entry en eller flera hela rader
 */
export function addToSection(text, isa, entry) {
  const end = `/* End ${isa} section */\n`
  const endAt = text.indexOf(end)
  if (endAt !== -1) return text.slice(0, endAt) + entry + text.slice(endAt)
  const block = `/* Begin ${isa} section */\n${entry}${end}`
  for (const match of text.matchAll(/^\/\* Begin (\w+) section \*\/\n/gm)) {
    if (match[1] > isa) return `${text.slice(0, match.index)}${block}\n${text.slice(match.index)}`
  }
  // Sist bland objekten: före `};` som avslutar objects.
  const objectsEnd = /\n\t\};\n\trootObject = /.exec(text)
  if (!objectsEnd) throw new IosWidgetError('Hittar inte slutet på objects i Xcode-projektet.')
  const at = objectsEnd.index + 1
  return `${text.slice(0, at)}\n${block}${text.slice(at)}`
}

/**
 * Lägg till rader sist i en lista (`key = ( … );`) i ett objekt som står på flera rader.
 * @param {string} text
 * @param {string} objectId
 * @param {string} key
 * @param {string} line raden utan indentering och radbrytning
 */
function appendToObjectList(text, objectId, key, line) {
  const head = new RegExp(`^\\t\\t${objectId}(?: /\\*.*?\\*/)? = \\{\\n`, 'm').exec(text)
  if (!head) throw new IosWidgetError(`Hittar inte objektet ${objectId} i Xcode-projektet.`)
  const start = head.index + head[0].length
  const end = text.indexOf('\n\t\t};\n', start)
  if (end === -1) throw new IosWidgetError(`Hittar inte slutet på objektet ${objectId} i Xcode-projektet.`)
  const body = text.slice(start, end)
  const listHead = `\t\t\t${key} = (\n`
  const listAt = body.indexOf(listHead)
  if (listAt === -1) throw new IosWidgetError(`Objektet ${objectId} i Xcode-projektet saknar listan ${key}.`)
  const closeAt = body.indexOf('\t\t\t);', listAt + listHead.length)
  if (closeAt === -1) throw new IosWidgetError(`Listan ${key} i objektet ${objectId} avslutas inte som väntat.`)
  const at = start + closeAt
  return `${text.slice(0, at)}\t\t\t\t${line}\n${text.slice(at)}`
}

/**
 * Slå på widgeten i Xcode-projektet: beroendet och inbäddningen i appmålet. Kastar om projektet
 * inte är i läget "av".
 * @param {string} text project.pbxproj
 * @returns {string}
 */
export function enableProjectText(text) {
  const { state } = projectWidgetState(text)
  if (state !== 'av') throw new IosWidgetError(`Widgeten är redan ${state === 'på' ? 'påslagen' : 'halvvägs påslagen'} i Xcode-projektet.`)
  const project = parsePbxproj(text)
  const objects = project.objects
  const app = /** @type {{ id: string }} */ (nativeTarget(objects, APP_TARGET))
  const widget = /** @type {{ id: string, target: Record<string, any> }} */ (nativeTarget(objects, WIDGET_TARGET))
  const appex = widget.target.productReference
  const root = project.rootObject
  const { proxy, dependency, embedPhase, embedFile } = ENABLE_IDS

  let out = text
  out = addToSection(
    out,
    'PBXBuildFile',
    `\t\t${embedFile} /* ${WIDGET_PRODUCT} in ${EMBED_PHASE_NAME} */ = {isa = PBXBuildFile; fileRef = ${appex} /* ${WIDGET_PRODUCT} */; settings = {ATTRIBUTES = (RemoveHeadersOnCopy, ); }; };\n`,
  )
  out = addToSection(
    out,
    'PBXContainerItemProxy',
    `\t\t${proxy} /* PBXContainerItemProxy */ = {\n` +
      '\t\t\tisa = PBXContainerItemProxy;\n' +
      `\t\t\tcontainerPortal = ${root} /* Project object */;\n` +
      '\t\t\tproxyType = 1;\n' +
      `\t\t\tremoteGlobalIDString = ${widget.id};\n` +
      `\t\t\tremoteInfo = ${WIDGET_TARGET};\n` +
      '\t\t};\n',
  )
  out = addToSection(
    out,
    'PBXCopyFilesBuildPhase',
    `\t\t${embedPhase} /* ${EMBED_PHASE_NAME} */ = {\n` +
      '\t\t\tisa = PBXCopyFilesBuildPhase;\n' +
      '\t\t\tbuildActionMask = 2147483647;\n' +
      '\t\t\tdstPath = "";\n' +
      `\t\t\tdstSubfolderSpec = ${EMBED_SUBFOLDER_SPEC};\n` +
      '\t\t\tfiles = (\n' +
      `\t\t\t\t${embedFile} /* ${WIDGET_PRODUCT} in ${EMBED_PHASE_NAME} */,\n` +
      '\t\t\t);\n' +
      `\t\t\tname = "${EMBED_PHASE_NAME}";\n` +
      '\t\t\trunOnlyForDeploymentPostprocessing = 0;\n' +
      '\t\t};\n',
  )
  out = addToSection(
    out,
    'PBXTargetDependency',
    `\t\t${dependency} /* PBXTargetDependency */ = {\n` +
      '\t\t\tisa = PBXTargetDependency;\n' +
      `\t\t\ttarget = ${widget.id} /* ${WIDGET_TARGET} */;\n` +
      `\t\t\ttargetProxy = ${proxy} /* PBXContainerItemProxy */;\n` +
      '\t\t};\n',
  )
  out = appendToObjectList(out, app.id, 'buildPhases', `${embedPhase} /* ${EMBED_PHASE_NAME} */,`)
  out = appendToObjectList(out, app.id, 'dependencies', `${dependency} /* PBXTargetDependency */,`)

  if (projectWidgetState(out).state !== 'på') throw new IosWidgetError('Xcode-projektet blev inte påslaget som väntat – inget har sparats.')
  return out
}

// ---------------------------------------------------------------------------
// App.entitlements
// ---------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const GROUP_KEY_RE = new RegExp(`<key>\\s*${escapeRe(APP_GROUP_KEY)}\\s*</key>`)
const GROUP_ARRAY_RE = new RegExp(`<key>\\s*${escapeRe(APP_GROUP_KEY)}\\s*</key>\\s*<array>([\\s\\S]*?)</array>`)
const GROUP_STRING_RE = new RegExp(`<string>\\s*${escapeRe(APP_GROUP)}\\s*</string>`)

/**
 * Läget i appens behörigheter: har appen App Group-behörigheten med Lagoms grupp?
 * @param {string} text App.entitlements
 * @returns {{ state: PartState, details: string[] }}
 */
export function entitlementsWidgetState(text) {
  if (!/<plist[\s>]/.test(text) || !text.includes('</dict>')) throw new IosWidgetError(`${APP_ENTITLEMENTS_PATH} ser inte ut som en egenskapslista.`)
  const hasKey = GROUP_KEY_RE.test(text)
  const array = GROUP_ARRAY_RE.exec(text)
  if (hasKey && array && GROUP_STRING_RE.test(array[1])) return { state: 'på', details: [] }
  if (!hasKey && !text.includes(APP_GROUP)) return { state: 'av', details: [] }
  return {
    state: 'halv',
    details: [hasKey ? `${APP_GROUP_KEY} finns men utan ${APP_GROUP}` : `${APP_GROUP} står i filen utan ${APP_GROUP_KEY}`],
  }
}

/**
 * Lägg till App Group-behörigheten sist i rotordboken (övriga behörigheter, t.ex. HealthKit, står kvar).
 * @param {string} text
 * @returns {string}
 */
export function enableEntitlementsText(text) {
  const { state } = entitlementsWidgetState(text)
  if (state !== 'av') throw new IosWidgetError(`App Group finns redan ${state === 'på' ? '' : 'delvis '}i ${APP_ENTITLEMENTS_PATH}.`)
  const end = /\n<\/dict>\s*<\/plist>\s*$/.exec(text)
  if (!end) throw new IosWidgetError(`Hittar inte slutet på rotordboken i ${APP_ENTITLEMENTS_PATH}.`)
  const at = end.index + 1
  const entry = `\t<key>${APP_GROUP_KEY}</key>\n\t<array>\n\t\t<string>${APP_GROUP}</string>\n\t</array>\n`
  const out = text.slice(0, at) + entry + text.slice(at)
  if (entitlementsWidgetState(out).state !== 'på') throw new IosWidgetError(`${APP_ENTITLEMENTS_PATH} blev inte som väntat – inget har sparats.`)
  return out
}

// ---------------------------------------------------------------------------
// WIDGET_IOS_READY
// ---------------------------------------------------------------------------

/**
 * Läget för `WIDGET_IOS_READY` i src/native/widget.ts.
 * @param {string} text
 * @returns {{ state: PartState, details: string[] }}
 */
export function flagWidgetState(text) {
  const matches = [...text.matchAll(FLAG_LINE)]
  if (matches.length !== 1) {
    throw new IosWidgetError(
      `${WIDGET_TS_PATH} ska ha exakt en rad "${FLAG_OFF}" (eller "= true") – hittade ${matches.length}.`,
    )
  }
  return { state: matches[0][1] === 'true' ? 'på' : 'av', details: [] }
}

/**
 * @param {string} text
 * @returns {string}
 */
export function enableFlagText(text) {
  const { state } = flagWidgetState(text)
  if (state !== 'av') throw new IosWidgetError(`WIDGET_IOS_READY är redan true i ${WIDGET_TS_PATH}.`)
  const out = text.replace(FLAG_LINE, FLAG_ON)
  if (flagWidgetState(out).state !== 'på') throw new IosWidgetError(`${WIDGET_TS_PATH} blev inte som väntat – inget har sparats.`)
  return out
}

// ---------------------------------------------------------------------------
// Hela läget
// ---------------------------------------------------------------------------

/**
 * @param {string} root
 * @param {string} path
 */
function readRepoText(root, path) {
  const file = join(root, path)
  if (!existsSync(file)) throw new IosWidgetError(`${path} saknas (under ${root}).`)
  return readFileSync(file, 'utf8')
}

/**
 * Ändra en text med \n som radbrytning och lämna tillbaka den med filens egna radbrytningar
 * (\r\n i en utcheckning med core.autocrlf på Windows).
 * @param {string} text
 * @param {(text: string) => string} change
 */
function keepLineEndings(text, change) {
  if (!text.includes('\r\n')) return change(text)
  return change(text.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n')
}

/**
 * Läget i de tre filerna. Kastar `IosWidgetError` när en fil saknas eller inte går att läsa.
 * @param {string} [root]
 */
export function readWidgetParts(root = REPO_ROOT) {
  return {
    project: projectWidgetState(readRepoText(root, PBXPROJ_PATH)),
    entitlements: entitlementsWidgetState(readRepoText(root, APP_ENTITLEMENTS_PATH)),
    flag: flagWidgetState(readRepoText(root, WIDGET_TS_PATH)),
  }
}

/**
 * "på" eller "av" – kastar `IosWidgetError` när filerna inte är överens (halvvägs påslagen).
 * @param {string} [root]
 * @returns {'på' | 'av'}
 */
export function widgetStatus(root = REPO_ROOT) {
  const parts = readWidgetParts(root)
  const states = [parts.project.state, parts.entitlements.state, parts.flag.state]
  if (states.every((s) => s === 'på')) return 'på'
  if (states.every((s) => s === 'av')) return 'av'
  const label = /** @param {PartState} s */ (s) => (s === 'halv' ? 'halvvägs' : s)
  const lines = [
    `- ${PBXPROJ_PATH}: ${label(parts.project.state)}${parts.project.details.map((d) => `\n    ${d}`).join('')}`,
    `- ${APP_ENTITLEMENTS_PATH} (App Group): ${label(parts.entitlements.state)}${parts.entitlements.details.map((d) => `\n    ${d}`).join('')}`,
    `- ${WIDGET_TS_PATH} (WIDGET_IOS_READY): ${label(parts.flag.state)}`,
  ]
  throw new IosWidgetError(
    'iPhone-widgeten är halvvägs påslagen – de tre delarna ska alltid vara på eller av tillsammans:\n' +
      `${lines.join('\n')}\n` +
      `Återställ filerna (git checkout -- ${PBXPROJ_PATH} ${APP_ENTITLEMENTS_PATH} ${WIDGET_TS_PATH}) och kör sedan node scripts/ios-widget.mjs enable, eller slå på det som saknas för hand (docs/WIDGET.md §8).`,
  )
}

/**
 * Kontrollera att widgetens tre delar hänger ihop (på eller av). Kastar `IosWidgetError` annars.
 * @param {string} [root]
 */
export function checkWidget(root = REPO_ROOT) {
  widgetStatus(root)
}

/**
 * Slå på iPhone-widgeten i de tre filerna. Vägrar (kastar `IosWidgetError`) om den redan är på
 * eller halvvägs. Alla tre filerna räknas fram och kontrolleras innan något skrivs.
 * @param {string} [root]
 * @returns {string[]} filerna som ändrades (relativt roten)
 */
export function enableWidget(root = REPO_ROOT) {
  if (widgetStatus(root) === 'på') throw new IosWidgetError('iPhone-widgeten är redan påslagen – inget att göra.')
  const changes = [
    [PBXPROJ_PATH, keepLineEndings(readRepoText(root, PBXPROJ_PATH), enableProjectText)],
    [APP_ENTITLEMENTS_PATH, keepLineEndings(readRepoText(root, APP_ENTITLEMENTS_PATH), enableEntitlementsText)],
    [WIDGET_TS_PATH, keepLineEndings(readRepoText(root, WIDGET_TS_PATH), enableFlagText)],
  ]
  for (const [path, text] of changes) writeFileSync(join(root, path), text)
  if (widgetStatus(root) !== 'på') throw new IosWidgetError('Widgeten blev inte påslagen som väntat – kontrollera filerna med git diff.')
  return changes.map(([path]) => path)
}

// ---------------------------------------------------------------------------
// Kommandoraden
// ---------------------------------------------------------------------------

const USAGE = 'Användning: node scripts/ios-widget.mjs status | check | enable [--root=<katalog>]'

/**
 * @param {string[]} argv
 * @returns {{ command?: string, root: string, help?: boolean }}
 */
export function parseArgs(argv) {
  /** @type {{ command?: string, root: string, help?: boolean }} */
  const args = { root: REPO_ROOT }
  for (const a of argv) {
    const root = /^--root=(.+)$/.exec(a)
    if (root) args.root = resolve(process.cwd(), root[1])
    else if (a === '--help' || a === '-h') args.help = true
    else if (!a.startsWith('-') && args.command === undefined) args.command = a
    else throw new IosWidgetError(`Okänt argument: ${a}\n${USAGE}`)
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    return
  }
  switch (args.command) {
    case 'status':
      console.log(widgetStatus(args.root))
      return
    case 'check':
      checkWidget(args.root)
      return
    case 'enable': {
      enableWidget(args.root)
      console.log('✓ iPhone-widgeten är påslagen i koden:')
      console.log(`  ${PBXPROJ_PATH}: appen beror på ${WIDGET_TARGET} och bäddar in den ("${EMBED_PHASE_NAME}")`)
      console.log(`  ${APP_ENTITLEMENTS_PATH}: App Group ${APP_GROUP}`)
      console.log(`  ${WIDGET_TS_PATH}: WIDGET_IOS_READY = true`)
      console.log('')
      console.log('Kvar att göra i samma ändring (docs/WIDGET.md §8):')
      for (const item of ENABLE_CHECKLIST) console.log(`  [ ] ${item}`)
      return
    }
    default:
      throw new IosWidgetError(args.command === undefined ? USAGE : `Okänt kommando: ${args.command}\n${USAGE}`)
  }
}

// Kör bara när filen startas direkt (så att funktionerna kan importeras i tester).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}
