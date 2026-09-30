/**
 * Hemskärmswidgeten i Android-appen: dagens energi (kvar/över), loggade måltider, vatten och en
 * pågående fasta – och en knapp "Lägg till". Laddas bara via `loadNative('widget')`
 * (src/native/index.ts) och startas med `startWidget()` från `startNative()` – aldrig på webben.
 *
 * - Widgeten själv (AppWidgetProvider och layouten) ligger i android/ och registrerar det lokala
 *   tillägget "LagomWidget" (inget npm-paket). Kontraktet: `update({ data })` sparar JSON-texten
 *   för `WidgetPayload` version 1 (src/lib/widgetSummary.ts, högst 32 768 tecken) och ritar om alla
 *   widgetar; `clear()` tar bort den (widgetarna visar då sitt läge utan data). Ogiltig eller för
 *   lång data avvisas, och den förra ligger kvar.
 * - Sammanfattningen byggs av `buildWidgetPayload` ur dagboken, profilen och inställningarna,
 *   vikterna, fastan och exempelmarkeringen. Den skickas en gång vid start, `WIDGET_DEBOUNCE_MS`
 *   efter den senaste ändringen, direkt när appen öppnas igen (datumet kan ha bytts) och direkt när
 *   appen går till bakgrunden om en ändring väntar. Samma innehåll skickas aldrig två gånger i rad
 *   (tidsstämpeln räknas inte).
 * - Ingen sammanfattning skickas från ett ofullständigt läge – innan butikerna har lästs in eller
 *   när lagringen bara finns i minnet (t.ex. en läsning som inte har blivit klar, data från en
 *   nyare version). Då ligger den senaste hela sammanfattningen kvar i widgeten.
 * - Länkar från widgeten: en uttrycklig Intent till MainActivity med `lagom-widget://idag`
 *   (widgeten) eller `lagom-widget://lagg-till` (knappen). Ingen intent-filter läggs till, men
 *   MainActivity är startaktiviteten och därmed exporterad – en annan app kan alltså också starta
 *   den med en sådan länk. Därför leder bara de två någonstans: till "/" och "/lagg-till" i
 *   hash-routern. /lagg-till ligger bakom AccessGate som vanligt, och Gate skickar den som saknar
 *   profil till välkomstflödet.
 * - Capacitors App-tillägg lämnar länkarna som 'appUrlOpen' (appen körs) och via
 *   `App.getLaunchUrl()` (kallstart). Vid en kallstart kommer länken båda vägarna – att öppna den
 *   är därför idempotent. `getLaunchUrl()` ger samma startlänk så länge aktiviteten lever, så den
 *   följs bara vid sidans första laddning, inte efter en omladdning (`pageWasReloaded()`). Länkar
 *   som Android spelar upp igen när aktiviteten återskapas tar MainActivity bort
 *   (`WidgetLinks.isReplayedLink`).
 * - iPhone: widgeten (ios/App/LagomWidget/) och tillägget (ios/App/App/LagomWidgetPlugin.swift –
 *   samma kontrakt och samma kontroll av datan som på Android) finns i koden men är avslagna tills
 *   App Group "group.se.lagomappen.lagom" finns i ägarens Apple-konto. Då slås allt på med
 *   `node scripts/ios-widget.mjs enable` (docs/WIDGET.md §8); så länge `WIDGET_IOS_READY` är false
 *   gör modulen ingenting på iPhone. Där ligger datan i App Groupens UserDefaults (nyckeln
 *   "payload"), och länkarna kommer via SceneDelegate som 'appUrlOpen' och `App.getLaunchUrl()` –
 *   iOS spelar inte upp dem igen när appen återskapas.
 * - "Radera all data" tömmer widgeten med `clearWidget()` (features/settings/wipe.ts).
 * - Inget här kastar: fel loggas med `logError(error, 'native:widget')`.
 *
 * Integritet: widgeten visar bara summor och antal (inga livsmedel, måltidsnamn eller
 * anteckningar), i medvetet läge inga energisiffror och aldrig exempeldata. Datan ligger i appens
 * egna SharedPreferences ("lagom-widget") på enheten.
 */
import { App } from '@capacitor/app'
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { isDemoData, subscribeDemoFlag } from '../lib/demoFlag'
import { logError } from '../lib/errorLog'
import { buildWidgetPayload, serializeWidgetPayload, WIDGET_MAX_CHARS, type WidgetInput, type WidgetPayload } from '../lib/widgetSummary'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { useFastingStore } from '../stores/fastingStore'
import { useProfileStore } from '../stores/profileStore'
import { isMemoryOnlyStorage, subscribeStorageStatus } from '../stores/storage'
import { nativePlatform } from './index'

/**
 * Det lokala tillägget i apparna: android/app/src/main/java/…/widget/LagomWidgetPlugin.java och
 * ios/App/App/LagomWidgetPlugin.swift (samma namn, metoder och felkoder).
 */
export interface LagomWidgetPlugin {
  /** Spara JSON-texten för `WidgetPayload` och rita om alla widgetar. Avvisar ogiltig data. */
  update(options: { data: string }): Promise<void>
  /** Ta bort den sparade datan och rita om alla widgetar (läget utan data). */
  clear(): Promise<void>
}

export const LagomWidget = registerPlugin<LagomWidgetPlugin>('LagomWidget')

/**
 * iPhone-widgeten (WidgetKit med App Group "group.se.lagomappen.lagom") finns i koden men är
 * avslagen – den kräver App Groups på ägarens Apple-konto. Ändra inte raden för hand: den slås på
 * tillsammans med Xcode-projektet och App.entitlements med `node scripts/ios-widget.mjs enable`
 * (docs/WIDGET.md §8), och molnbyggena stoppar när de tre inte stämmer (`check`). Så länge den är
 * false gör modulen ingenting på iPhone.
 */
export const WIDGET_IOS_READY: boolean = false

/** Väntan efter den senaste ändringen, så att flera ändringar i rad blir en uppdatering. */
export const WIDGET_DEBOUNCE_MS = 1500

/** Länkarna från widgeten och sidorna de öppnar – allt annat ignoreras. */
export const WIDGET_LINKS: ReadonlyMap<string, string> = new Map([
  ['lagom-widget://idag', '/'],
  ['lagom-widget://lagg-till', '/lagg-till'],
])

const LOG_CONTEXT = 'native:widget'

/** Butikerna som sammanfattningen bygger på. */
const SOURCES = [useDiaryStore, useProfileStore, useBodyStore, useFastingStore] as const

/** Finns widgeten på den här plattformen? Android nu, iPhone när `WIDGET_IOS_READY` blir true. */
export function widgetSupported(): boolean {
  const os = nativePlatform()
  return os === 'android' || (os === 'ios' && WIDGET_IOS_READY)
}

// ---------------------------------------------------------------------------
// Tillstånd
// ---------------------------------------------------------------------------

let started = false
let timer: ReturnType<typeof setTimeout> | null = null
/** Innehållet (utan tidsstämpel) i den senaste sammanfattningen som widgeten tog emot. */
let lastSent: string | null = null
/**
 * false från appStateChange med isActive false till nästa med true. En ändring då (t.ex. ett fält
 * som sparas på visibilitychange) skickas direkt – timers kan stå still i bakgrunden.
 */
let appActive = true
let unsubscribers: Array<() => void> = []
let handles: PluginListenerHandle[] = []
/** Anropen till tillägget görs ett i taget, i tur och ordning (en tömning hinner aldrig före). */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = queue.then(op, op)
  queue = run.catch(() => undefined)
  return run
}

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

// ---------------------------------------------------------------------------
// Sammanfattningen
// ---------------------------------------------------------------------------

/** Butikernas tillstånd just nu, som indata till `buildWidgetPayload`. */
export function readWidgetInput(): WidgetInput {
  const diary = useDiaryStore.getState()
  const { profile, settings } = useProfileStore.getState()
  return {
    profile,
    settings,
    weights: useBodyStore.getState().weights,
    diary: { entries: diary.entries, water: diary.water, exercise: diary.exercise, days: diary.days },
    fasting: useFastingStore.getState().active,
    demo: isDemoData(),
  }
}

/** Innehållet utan tidsstämpeln – samma innehåll skickas inte två gånger i rad. */
function contentKey(payload: WidgetPayload): string {
  return JSON.stringify({ ...payload, generatedAt: 0 })
}

/** Får en sammanfattning byggas just nu? Bara när datan i minnet är hela den sparade datan. */
function canSummarize(): boolean {
  return SOURCES.every((s) => s.persist.hasHydrated()) && !isMemoryOnlyStorage()
}

/**
 * Bygg sammanfattningen och skicka den till widgeten nu (i tur efter andra anrop). true om widgeten
 * tog emot en ny sammanfattning; false om den var oförändrad, inte fick byggas eller avvisades.
 * Kastar aldrig.
 */
export function pushWidgetNow(now: () => Date = () => new Date()): Promise<boolean> {
  clearTimer()
  if (!widgetSupported()) return Promise.resolve(false)
  return enqueue(async () => {
    if (!canSummarize()) return false
    let data: string
    let key: string
    try {
      const payload = buildWidgetPayload(readWidgetInput(), now())
      key = contentKey(payload)
      if (key === lastSent) return false
      data = serializeWidgetPayload(payload)
    } catch (error) {
      logError(error, LOG_CONTEXT)
      return false
    }
    if (data.length > WIDGET_MAX_CHARS) {
      // Kan inte hända med sju dagar – men widgeten skulle avvisa den, så skicka den inte.
      logError(new Error('Widgetens sammanfattning är för lång'), LOG_CONTEXT)
      return false
    }
    try {
      await LagomWidget.update({ data })
      lastSent = key
      return true
    } catch (error) {
      // Nästa ändring (eller nästa gång appen öppnas) försöker igen.
      logError(error, LOG_CONTEXT)
      return false
    }
  })
}

/** Skicka om en stund (varje ändring flyttar tiden). Medan appen inte är aktiv skickas den direkt. */
export function scheduleWidgetPush(): void {
  if (!started) return
  if (!appActive) {
    void pushWidgetNow()
    return
  }
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    void pushWidgetNow()
  }, WIDGET_DEBOUNCE_MS)
}

/** Skicka en väntande ändring direkt (när appen går till bakgrunden). Kastar aldrig. */
export async function flushWidget(): Promise<void> {
  if (timer !== null) await pushWidgetNow()
  else await queue
}

/**
 * Töm widgeten ("Radera all data"): den sparade sammanfattningen tas bort och widgetarna visar
 * läget utan data tills något nytt läggs in. Fungerar även när widgeten inte är startad. No-op
 * där widgeten inte finns. Kastar aldrig.
 */
export function clearWidget(): Promise<void> {
  if (!widgetSupported()) return Promise.resolve()
  // En väntande uppdatering (t.ex. från raderingen själv) ska inte fylla widgeten igen.
  clearTimer()
  lastSent = null
  return enqueue(async () => {
    try {
      await LagomWidget.clear()
    } catch (error) {
      logError(error, LOG_CONTEXT)
    }
    lastSent = null
  })
}

// ---------------------------------------------------------------------------
// Länkar från widgeten
// ---------------------------------------------------------------------------

/** Sidan som en länk från widgeten ska öppna, eller null för allt annat. */
export function widgetLinkRoute(url: unknown): string | null {
  return typeof url === 'string' ? (WIDGET_LINKS.get(url) ?? null) : null
}

/**
 * Öppna sidan som länken från widgeten pekar på (appen använder en hash-router). Andra adresser
 * ignoreras. true om länken var widgetens.
 */
export function openWidgetLink(url: unknown): boolean {
  const route = widgetLinkRoute(url)
  if (route === null) return false
  try {
    if (window.location.hash !== `#${route}`) window.location.hash = route
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
  return true
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

/**
 * Laddades sidan om i samma aktivitet ("Ladda om" på felsidan, en omladdning efter
 * `vite:preloadError`)? Capacitor läser startlänken en gång, när aktiviteten skapas, och
 * `App.getLaunchUrl()` ger den därefter vid varje anrop – efter en omladdning har den redan följts.
 * Ingen egen lagring: navigeringens typ (Navigation Timing). false när den inte går att läsa.
 */
export function pageWasReloaded(): boolean {
  try {
    const [entry] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    return entry?.type === 'reload'
  } catch {
    return false
  }
}

/** Registrera en lyssnare hos ett tillägg – tas bort igen om modulen hann stoppas under tiden. */
async function listen(add: () => Promise<PluginListenerHandle>): Promise<void> {
  try {
    const handle = await add()
    if (started) handles.push(handle)
    else void handle.remove()
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

function onAppState(isActive: boolean): void {
  appActive = isActive
  // Tillbaka i appen: datumet kan ha bytts och något kan ha ändrats utanför (t.ex. Health Connect).
  if (isActive) void pushWidgetNow()
  else void flushWidget()
}

/**
 * Starta widgeten – en gång, från `startNative()`, efter de andra funktionerna. Lyssnar på länkar
 * från widgeten och på ändringar i butikerna och skickar sammanfattningen en gång direkt. No-op på
 * webben, på iPhone (`WIDGET_IOS_READY`) och om den redan har startats. Kastar aldrig.
 */
export async function startWidget(): Promise<void> {
  if (started || !widgetSupported()) return
  started = true
  try {
    // Länkarna först, så att trycket som öppnade appen inte missas.
    await listen(() => App.addListener('appUrlOpen', ({ url }) => void openWidgetLink(url)))
    // Startlänken bara vid sidans första laddning – annars öppnas Lägg till igen efter en omladdning.
    if (!pageWasReloaded()) {
      try {
        const launch = await App.getLaunchUrl()
        if (started) openWidgetLink(launch?.url)
      } catch (error) {
        logError(error, LOG_CONTEXT)
      }
    }
    if (!started) return // stoppad under tiden (bara i tester)

    unsubscribers = [
      ...SOURCES.map((s) => s.subscribe(scheduleWidgetPush)),
      // Läses en butik in sent (eller igen) skickas sammanfattningen när den är klar.
      ...SOURCES.map((s) => s.persist.onFinishHydration(scheduleWidgetPush)),
      subscribeDemoFlag(scheduleWidgetPush),
      subscribeStorageStatus(scheduleWidgetPush),
    ]
    await listen(() => App.addListener('appStateChange', ({ isActive }) => onAppState(isActive)))
    if (started) await pushWidgetNow()
  } catch (error) {
    logError(error, LOG_CONTEXT)
  }
}

/** Stoppa widgeten (väntande ändringar skickas inte). För tester. */
export function stopWidget(): void {
  started = false
  clearTimer()
  unsubscribers.forEach((u) => u())
  unsubscribers = []
  handles.forEach((h) => void h.remove())
  handles = []
  appActive = true
}

/** Endast för tester: stoppa och glöm allt, även kön och den senast skickade sammanfattningen. */
export function resetWidgetForTests(): void {
  stopWidget()
  queue = Promise.resolve()
  lastSent = null
}
