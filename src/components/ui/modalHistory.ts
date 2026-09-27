/**
 * Bakåtknappen (webbläsare, Android, svepgest) stänger öppna ark och dialoger i stället för att
 * lämna sidan.
 *
 * Så fungerar det:
 * - När en modal öppnas läggs en historikpost till med samma URL och samma router-state
 *   (key/idx/usr) plus en markör: `__lagomModal`, en kedja med id:n för de öppna modalerna.
 *   För routern är det "samma" post.
 * - Bakåt → popstate till posten under → modaler vars id inte längre finns i kedjan stängs.
 *   Händelsen döljs för routern (samma post för den), så den navigerar inte och inga
 *   "Lämna utan att spara?"-frågor (useBlocker) visas.
 * - Stängs modalen i gränssnittet (✕, Escape, bakgrund, Spara …) tas markören bort med ett dolt
 *   steg bakåt – men bara om markören fortfarande är aktuell post, och först efter en kort stund
 *   (setTimeout 0) så att en navigering inifrån modalen hinner göras först.
 * - Navigering inifrån en öppen modal fungerar som vanligt och ångras aldrig:
 *   · push (t.ex. "Lägg till" → Dagbok) ersätter markörposten – bakåt därifrån går till sidan.
 *   · navigate(-1) / history.go(-n) hoppar även över markörerna.
 *   · replace till en annan sida ersätter sidans egen post; markörerna tas bort med ett dolt steg
 *     bakåt. replace på samma sida (t.ex. sökparametrar medan ett ark är öppet) behåller
 *     markörerna – posten under uppdateras när man går bakåt till den.
 * - Stängs en modal och en ny öppnas direkt (eller i Reacts StrictMode) återanvänds posten.
 *
 * Fungerar med createHashRouter. I tester med createMemoryRouter/MemoryRouter rör routern inte
 * window.history – markörerna lever då bara i jsdom och påverkar inte navigeringen.
 */

const KEY = '__lagomModal'
/** Så länge väntar vi på att ett eget steg i historiken landar innan vi ger upp. */
const LANDING_TIMEOUT_MS = 3000

type State = Record<string, unknown> | null
type Url = string | URL | null | undefined

interface Snapshot {
  state: State
  key: unknown
  idx: unknown
  href: string
  tokens: readonly string[]
}

interface Landing {
  /** Routerns index för posten vi väntar på (markörer har samma index som sidans post). */
  idx: unknown
  /** Antal markörer i posten vi väntar på. */
  depth: number
  until: number
  /** Körs när steget har landat (före routern – som aldrig ser det). */
  onLand?: () => void
}

interface ModalHistory {
  open: (onBack: () => void) => () => void
  hasEntries: () => boolean
}

function tokensOf(state: unknown): string[] {
  const t = state && typeof state === 'object' ? (state as Record<string, unknown>)[KEY] : undefined
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === 'string') : []
}

/** Sidans väg i URL:en: "/lagg-till" för "#/lagg-till?maltid=lunch" (hash-routing), annars pathname. */
function routeOf(href: string): string {
  const u = new URL(href)
  return u.hash ? u.hash.replace(/^#/, '').split('?')[0] : u.pathname
}

function withTokens(state: unknown, tokens: readonly string[]): Record<string, unknown> {
  const next: Record<string, unknown> = state && typeof state === 'object' ? { ...(state as Record<string, unknown>) } : {}
  if (tokens.length > 0) next[KEY] = [...tokens]
  else delete next[KEY]
  return next
}

function createModalHistory(win: Window): ModalHistory {
  const h = win.history
  const orig = {
    push: h.pushState.bind(h),
    replace: h.replaceState.bind(h),
    go: h.go.bind(h),
  }

  /** Öppna modaler med historikpost, i öppningsordning. */
  const open = new Map<string, () => void>()
  /** Modaler vars post redan är på väg bort (navigering inifrån) – ska inte poppas igen. */
  const consumed = new Set<string>()
  /** Uppskjutna "ta bort min markör" efter stängning i gränssnittet. */
  const pendingPops = new Map<string, number>()
  /** Åtgärder som väntar tills vårt eget steg i historiken har landat. */
  const queued: Array<() => void> = []
  let landing: Landing | null = null
  let current: Snapshot = snapshot()
  let seq = 0

  function snapshot(): Snapshot {
    const s = h.state as State
    return { state: s, key: s?.key, idx: s?.idx, href: win.location.href, tokens: tokensOf(s) }
  }

  function landingPending(): boolean {
    if (landing && Date.now() > landing.until) landing = null
    return landing !== null
  }

  function whenSettled(fn: () => void) {
    if (landingPending()) queued.push(fn)
    else fn()
  }

  /** Eget, dolt steg bakåt i historiken. */
  function traverseOwn(steps: number, target: Omit<Landing, 'until'>) {
    landing = { ...target, until: Date.now() + LANDING_TIMEOUT_MS }
    orig.go(-steps)
  }

  function cancelPops(tokens: readonly string[]) {
    for (const t of tokens) {
      const timer = pendingPops.get(t)
      if (timer !== undefined) {
        win.clearTimeout(timer)
        pendingPops.delete(t)
      }
    }
  }

  /** Markörerna i posten försvinner (navigering inifrån modalen). */
  function consume(tokens: readonly string[]) {
    cancelPops(tokens)
    for (const t of tokens) if (open.has(t)) consumed.add(t)
  }

  // --- Andras anrop (routern) ----------------------------------------------

  function foreignPush(data: unknown, unused: string, url?: Url) {
    if (landingPending()) {
      // Vårt eget steg är på väg – gör push när det har landat, annars hamnar den fel.
      queued.push(() => foreignPush(data, unused, url))
      return
    }
    const chain = tokensOf(h.state)
    if (chain.length === 0) {
      orig.push(data, unused, url)
      current = snapshot()
      return
    }
    // Navigering inifrån en modal: den nya sidan ersätter markörposten, så att bakåt från den
    // går direkt till sidan under (och ingen markör ligger kvar emellan).
    const { idx } = current
    consume(chain)
    orig.replace(data, unused, url)
    current = snapshot()
    if (chain.length > 1) {
      // Nästlade modaler: gå dolt ned till den första markörposten och lägg den nya sidan där.
      traverseOwn(chain.length - 1, {
        idx,
        depth: 1,
        onLand: () => {
          orig.replace(data, unused, url)
          current = snapshot()
        },
      })
    }
  }

  function foreignReplace(data: unknown, unused: string, url?: Url) {
    if (landingPending()) {
      queued.push(() => foreignReplace(data, unused, url))
      return
    }
    const chain = tokensOf(h.state)
    // Ingen markör – eller någon som kopierar state och behåller den (routerns egen init).
    if (chain.length === 0 || tokensOf(data).length > 0) {
      orig.replace(data, unused, url)
      current = snapshot()
      return
    }
    const target = url === null || url === undefined || url === '' ? win.location.href : new URL(String(url), win.location.href).href
    if (routeOf(target) === routeOf(win.location.href)) {
      // Samma sida (t.ex. sökparametrar medan ett ark är öppet): modalen är kvar, så markörerna
      // behålls. Posterna under uppdateras när man går bakåt till dem (se onPopState).
      orig.replace(withTokens(data, chain), unused, url)
      current = snapshot()
      return
    }
    // replace till en annan sida inifrån en modal gäller sidans egen post: ersätt direkt (rätt
    // URL på en gång), gå sedan dolt ned förbi markörerna och ersätt sidans post.
    const { idx } = current
    consume(chain)
    orig.replace(data, unused, url)
    current = snapshot()
    traverseOwn(chain.length, {
      idx,
      depth: 0,
      onLand: () => {
        orig.replace(data, unused, url)
        current = snapshot()
      },
    })
  }

  function foreignGo(delta?: number) {
    const d = delta ?? 0
    if (d < 0) {
      // Markörerna räknas inte som sidor: navigate(-1) inifrån ett ark ska lämna sidan.
      const depth = landingPending() ? (landing?.depth ?? 0) : tokensOf(h.state).length
      if (depth > 0) {
        consume(tokensOf(h.state))
        orig.go(d - depth)
        return
      }
    }
    orig.go(d)
  }

  // --- popstate --------------------------------------------------------------

  /**
   * Steg mellan en sida och dess markörer ska inte heller flytta sidan. Webbläsaren återställer
   * annars rullningen som sidans post hade när markören lades till – t.ex. efter ett köp i ett ark
   * som ändrade sidan under det (då hamnade man mitt på sidan i stället för vid tackkortet).
   * Återställningen sker direkt efter popstate, så läget före händelsen läggs tillbaka i nästa
   * bildruta (requestAnimationFrame körs före ritningen).
   */
  function keepScroll() {
    const x = win.scrollX
    const y = win.scrollY
    if (typeof win.requestAnimationFrame !== 'function') return
    win.requestAnimationFrame(() => {
      if (win.scrollX !== x || win.scrollY !== y) win.scrollTo(x, y)
    })
  }

  function onPopState(e: PopStateEvent) {
    const prev = current
    const landed = snapshot()
    // Första popstate efter ett eget steg är dess landning – förväntan gäller inte längre.
    const expected = landingPending() ? landing : null
    landing = null
    const own = expected !== null && landed.idx === expected.idx && landed.tokens.length === expected.depth
    // Bakåt förbi markörer på samma sida (routern har samma index för dem).
    const withinPage =
      landed.idx === prev.idx &&
      landed.tokens.length < prev.tokens.length &&
      landed.tokens.every((t, i) => prev.tokens[i] === t) &&
      routeOf(landed.href) === routeOf(prev.href)
    if (own && expected?.onLand) {
      expected.onLand()
    } else if (withinPage && (landed.key !== prev.key || landed.href !== prev.href)) {
      // Sidans URL/state ersattes medan modalen var öppen – för ned den till posten vi landade
      // på, så att routern inte ser någon skillnad.
      orig.replace(withTokens(prev.state, landed.tokens), '', prev.href)
    }
    current = snapshot()
    // Samma post för routern (bara markören skiljer): dölj händelsen så att routern inte
    // navigerar och inga blockerare frågas. Våra egna steg döljs alltid.
    const sameEntry = prev.key === landed.key && prev.idx === landed.idx && prev.href === landed.href
    if (own || sameEntry || withinPage) {
      e.stopImmediatePropagation()
      keepScroll()
    }

    if (!own) {
      // Bakåt (eller en navigering): stäng modaler vars post inte längre finns, översta först.
      const chain = new Set(landed.tokens)
      for (const [token, onBack] of Array.from(open).reverse()) {
        if (chain.has(token)) continue
        open.delete(token)
        consumed.delete(token)
        cancelPops([token])
        onBack()
      }
    }

    while (!landingPending() && queued.length > 0) queued.shift()?.()
  }

  // --- Modaler ----------------------------------------------------------------

  function openEntry(onBack: () => void): () => void {
    const token = `m${Date.now().toString(36)}${(seq++).toString(36)}`
    open.set(token, onBack)

    whenSettled(() => {
      if (!open.has(token)) return
      const state = h.state as State
      const chain = tokensOf(state)
      const top = chain[chain.length - 1]
      if (top !== undefined && pendingPops.has(top) && !open.has(top)) {
        // En modal stängdes nyss och dess post är kvar – återanvänd den (StrictMode, byte av ark).
        cancelPops([top])
        orig.replace(withTokens(state, [...chain.slice(0, -1), token]), '')
      } else {
        orig.push(withTokens(state, [...chain, token]), '')
      }
      current = snapshot()
    })

    return () => {
      if (!open.has(token)) return // redan stängd med bakåtknappen
      open.delete(token)
      if (consumed.delete(token)) return // posten är redan borta (navigering inifrån)
      whenSettled(() => schedulePop(token))
    }
  }

  function schedulePop(token: string) {
    const chain = tokensOf(h.state)
    if (chain[chain.length - 1] !== token) return
    const timer = win.setTimeout(() => {
      pendingPops.delete(token)
      whenSettled(() => popClosedTop(token))
    }, 0)
    pendingPops.set(token, timer)
  }

  /** Ta bort stängda markörer överst – om `token` fortfarande är aktuell post. */
  function popClosedTop(token: string) {
    const chain = tokensOf(h.state)
    if (chain[chain.length - 1] !== token) return // någon har navigerat – rör ingenting
    // Alla stängda markörer överst (t.ex. ett ark och en dialog i det som stängdes samtidigt).
    let closed = 0
    while (closed < chain.length && !open.has(chain[chain.length - 1 - closed])) closed++
    if (closed === 0) return
    traverseOwn(closed, { idx: current.idx, depth: chain.length - closed })
  }

  // --- Installera -------------------------------------------------------------

  h.pushState = function pushState(data: unknown, unused: string, url?: Url) {
    foreignPush(data, unused, url)
  }
  h.replaceState = function replaceState(data: unknown, unused: string, url?: Url) {
    foreignReplace(data, unused, url)
  }
  // Bara go() justeras – det är vad routern använder för navigate(-1). history.back() lämnas orörd
  // och fungerar som webbläsarens bakåtknapp (stänger översta modalen).
  h.go = function go(delta?: number) {
    foreignGo(delta)
  }
  // Fånga popstate före routern (fångstlyssnare på målet körs först, och vi registreras tidigt).
  win.addEventListener('popstate', onPopState, true)

  // Kvarglömda markörer (t.ex. om sidan laddades om med ett ark öppet): gå dolt förbi dem.
  if (current.tokens.length > 0) traverseOwn(current.tokens.length, { idx: current.idx, depth: 0 })

  return {
    open: openEntry,
    hasEntries: () => open.size > 0,
  }
}

const GLOBAL_KEY = '__lagomModalHistory'

function instance(): ModalHistory | null {
  if (typeof window === 'undefined' || !window.history) return null
  const w = window as unknown as Record<string, ModalHistory | undefined>
  // En instans per fönster (överlever t.ex. att modulen laddas om under utveckling).
  return (w[GLOBAL_KEY] ??= createModalHistory(window))
}

// Installera direkt när modulen laddas, så att vår popstate-lyssnare registreras före routerns.
instance()

/**
 * Ge en öppen modal en egen historikpost så att bakåtknappen stänger den. `onBack` anropas när
 * användaren går bakåt förbi posten. Returnerar en funktion som ska anropas när modalen stängs
 * (på vilket sätt som helst) – den tar bort posten om den fortfarande är aktuell.
 */
export function registerModalEntry(onBack: () => void): () => void {
  return instance()?.open(onBack) ?? (() => {})
}

/** Sant om någon öppen modal har en historikpost (t.ex. ett ark under en bekräftelsedialog). */
export function hasModalEntries(): boolean {
  return instance()?.hasEntries() ?? false
}
