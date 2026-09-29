import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, ChartNoAxesColumn, ChefHat, CloudOff, Download, Dumbbell, GlassWater, Menu, Plus, RotateCw, Scale, Sun, Timer, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { lazy, Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { LogoMark, Wordmark } from './Logo'
import { ToastViewport, toast } from '../ui/toast'
import { DialogHost } from '../ui/Dialog'
import { useProfileStore } from '../../stores/profileStore'
import { mealForTime } from '../../lib/meals'
import { ensurePersistentStorage, saveBackup } from '../../lib/backup'
import { IS_STORE_BUILD, isNativeApp } from '../../config/platform'
import { useTheme } from '../../hooks/useTheme'
import { useHasNewerData, useMemoryOnlyStorage } from '../../hooks/useStorageStatus'
import { hasNewerData } from '../../stores/storage'
import { markBackupNow } from '../../features/settings/backupStatus'
import { AccessBlockedDialog, AccessSync } from '../../features/premium/AccessGate'
import { requireAccess } from '../../features/premium/requireAccess'
import { storeName } from '../../features/premium/premiumLogic'
import { initNative } from '../../native'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Bara exakt matchning (Idag). */
  end?: boolean
  /** Undersidor som hör till fliken, t.ex. allt man når från "Mer". */
  sections?: readonly string[]
}

/** Sidor man når via "Mer" – fliken markeras på dem också. */
const MORE_SECTIONS = [
  '/vikt',
  '/recept',
  '/traning',
  '/dryck',
  '/fasta',
  '/matkalender',
  '/planering',
  '/installningar',
  '/om',
  '/premium',
  '/tack',
  '/integritet',
  '/villkor',
] as const

const TABS: readonly NavItem[] = [
  { to: '/', label: 'Idag', icon: Sun, end: true },
  { to: '/dagbok', label: 'Dagbok', icon: BookOpen },
  { to: '/insikter', label: 'Insikter', icon: ChartNoAxesColumn, sections: ['/rapport'] },
  { to: '/mer', label: 'Mer', icon: Menu, sections: MORE_SECTIONS },
]

/** Genvägar i sidomenyn på stora skärmar (där det finns plats). */
const SIDEBAR_SHORTCUTS: readonly NavItem[] = [
  { to: '/vikt', label: 'Vikt & mått', icon: Scale },
  { to: '/recept', label: 'Recept', icon: ChefHat },
  { to: '/traning', label: 'Träning', icon: Dumbbell },
  { to: '/dryck', label: 'Dryck', icon: GlassWater },
  { to: '/fasta', label: 'Fasta', icon: Timer },
]
const SHORTCUT_PATHS = SIDEBAR_SHORTCUTS.map((s) => s.to)

/** Sidor som visas i helskärm utan bottennavigering. */
const FULLSCREEN = [/^\/valkommen/, /^\/lagg-till/, /^\/skanna/]

/** Sidtitlar för flikar, historik och skärmläsare ("Dagbok – Lagom"). Mest specifika först. */
const ROUTE_TITLES: ReadonlyArray<[RegExp, string]> = [
  [/^\/$/, 'Idag'],
  [/^\/dagbok/, 'Dagbok'],
  [/^\/lagg-till/, 'Lägg till mat'],
  [/^\/skanna/, 'Skanna streckkod'],
  [/^\/nytt-livsmedel/, 'Nytt livsmedel'],
  [/^\/livsmedel\/[^/]+\/redigera/, 'Redigera livsmedel'],
  [/^\/livsmedel/, 'Livsmedel'],
  [/^\/recept\/nytt/, 'Nytt recept'],
  [/^\/recept\/importera/, 'Importera recept'],
  [/^\/recept\/[^/]+\/redigera/, 'Redigera recept'],
  [/^\/recept/, 'Recept'],
  [/^\/vikt/, 'Vikt & mått'],
  [/^\/insikter/, 'Insikter'],
  [/^\/rapport/, 'Rapport'],
  [/^\/traning/, 'Träning'],
  [/^\/dryck/, 'Dryck'],
  [/^\/fasta/, 'Fasta'],
  [/^\/mer/, 'Mer'],
  [/^\/om/, 'Om Lagom'],
  [/^\/matkalender/, 'Matkalender'],
  [/^\/planering/, 'Veckoplanering'],
  [/^\/installningar/, 'Inställningar'],
  [/^\/valkommen/, 'Välkommen'],
  [/^\/premium/, 'Lagom Premium'],
  [/^\/tack/, 'Tack för ditt köp'],
  [/^\/integritet/, 'Integritetspolicy'],
  [/^\/villkor/, 'Köp- och användarvillkor'],
]

/** Dokumenttitel för en sökväg, t.ex. "Vikt & mått – Lagom". */
export function routeTitle(pathname: string): string {
  const match = ROUTE_TITLES.find(([re]) => re.test(pathname))
  return match ? `${match[1]} – Lagom` : 'Lagom – kaloriräknaren'
}

function underPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

/** 'page' = exakt den här sidan, 'section' = en undersida till fliken, annars null. */
export function navMatch(item: Pick<NavItem, 'to' | 'end' | 'sections'>, pathname: string, exclude: readonly string[] = []): 'page' | 'section' | null {
  if (item.end ? pathname === item.to : underPath(pathname, item.to)) return 'page'
  if (item.sections?.some((s) => !exclude.includes(s) && underPath(pathname, s))) return 'section'
  return null
}

export function PageFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-busy="true">
      <div aria-hidden className="h-10 w-10 animate-spin rounded-full border-[3px] border-gran-soft border-t-gran" />
      <span className="sr-only">Laddar …</span>
    </div>
  )
}

/** Datumet i dagboken (/dagbok/2026-09-20) så att "+" lägger till på dagen man tittar på. */
const DIARY_DATE = /^\/dagbok\/(\d{4}-\d{2}-\d{2})$/

function AddButton({ className = '', withLabel = false }: { className?: string; withLabel?: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const meals = useProfileStore((s) => s.settings.meals)
  const add = () => {
    // Efter provperioden: förklara lugnt i stället för att öppna en sida som inte går att använda.
    if (!requireAccess('mat')) return
    const date = DIARY_DATE.exec(pathname)?.[1]
    navigate(`/lagg-till?maltid=${mealForTime(meals)}${date ? `&datum=${date}` : ''}`)
  }
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={add}
      className={`flex items-center justify-center gap-2 rounded-full bg-gran font-semibold text-on-gran shadow-[var(--shadow-float)] ${className}`}
      aria-label={withLabel ? undefined : 'Lägg till mat'}
    >
      <Plus className={withLabel ? 'h-5 w-5' : 'h-7 w-7'} strokeWidth={2.4} aria-hidden />
      {withLabel && <span>Lägg till mat</span>}
    </motion.button>
  )
}

/**
 * Uppdateringsfrågan (ny version finns) laddas bara i webbversionen med service worker – i
 * butiksapparna kommer uppdateringarna via App Store och Google Play.
 */
const UpdatePrompt = lazy(() => import('./UpdatePrompt'))

function canPromptForUpdate(): boolean {
  return !IS_STORE_BUILD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

const WARNING_ACTION = 'inline-flex min-h-11 items-center gap-1.5 font-semibold text-gran underline-offset-2 hover:underline'

/**
 * Lugn, beständig varning när ändringar inte kan sparas på enheten – eller när sparad data kommer
 * från en nyare version av Lagom (den läses inte in och skrivs aldrig över).
 */
function StorageWarning() {
  const memoryOnly = useMemoryOnlyStorage()
  const newerData = useHasNewerData()
  if (!memoryOnly && !newerData) return null

  if (newerData) {
    // Appen från butiken har sin kod inbyggd och uppdateras i butiken. Webbversionen (även
    // Play-appen, som visar webbversionen) hämtar den nya versionen när sidan laddas om.
    const bundled = IS_STORE_BUILD || isNativeApp()
    return (
      <div className="px-4 pt-safe lg:pt-4 print:hidden">
        <div role="status" className="mt-3 flex items-start gap-3 rounded-2xl bg-sol-soft px-4 py-3 text-[0.875rem] leading-relaxed text-ink">
          <CloudOff className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Din data är från en nyare version av Lagom – uppdatera appen innan du fortsätter. Inget skrivs över.</p>
            <p className="text-ink-2">
              {bundled
                ? `Uppdatera Lagom i ${storeName()}. Det du ändrar innan dess sparas inte.`
                : 'Ladda om sidan så att den nya versionen hämtas. Det du ändrar innan dess sparas inte.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {!bundled && (
                <button type="button" className={WARNING_ACTION} onClick={() => window.location.reload()}>
                  <RotateCw className="size-4" aria-hidden />
                  Ladda om
                </button>
              )}
              <Link to="/installningar/data" className="inline-flex min-h-11 items-center font-semibold text-gran underline-offset-2 hover:underline">
                Mer om data
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe lg:pt-4 print:hidden">
      <div role="status" className="mt-3 flex items-start gap-3 rounded-2xl bg-sol-soft px-4 py-3 text-[0.875rem] leading-relaxed text-ink">
        <CloudOff className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Din data sparas inte på enheten just nu</p>
          <p className="text-ink-2">
            Webbläsaren låter inte Lagom spara (t.ex. i privat läge eller när lagringen är full). Spara en säkerhetskopia så att inget går förlorat.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <button
              type="button"
              className={WARNING_ACTION}
              onClick={() => {
                // Anropas direkt i klicket – delningsdialogen på telefoner kräver det.
                void saveBackup().then((outcome) => {
                  if ((outcome === 'saved' || outcome === 'shared') && !hasNewerData()) markBackupNow()
                  else if (outcome === 'failed') toast('Säkerhetskopian kunde inte sparas. Försök igen.', { tone: 'error' })
                })
              }}
            >
              <Download className="size-4" aria-hidden />
              Spara säkerhetskopia
            </button>
            <Link to="/installningar/data" className="inline-flex min-h-11 items-center font-semibold text-gran underline-offset-2 hover:underline">
              Mer om data
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Efter ett sidbyte: flytta fokus till sidans rubrik när fokus annars skulle hamna på <body>
 * (den klickade länken försvann) eller ligga kvar i huvudmenyn – då läser skärmläsare upp den nya
 * sidan. Rör inte fokus om sidan själv har flyttat det (t.ex. sökfältet i Lägg till).
 */
function useFocusOnNavigate(pathname: string) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    let frame = 0
    let tries = 0
    const tick = () => {
      const active = document.activeElement
      const lost = !active || active === document.body || active.closest('[data-main-nav]') !== null
      if (!lost) return
      const main = document.querySelector('main')
      const heading = main?.querySelector<HTMLElement>('h1')
      if (heading && !main?.querySelector('[aria-busy="true"]')) {
        if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
        heading.focus({ preventScroll: true })
        return
      }
      // Sidan laddas fortfarande (lat inläsning) – försök igen i högst ett par sekunder.
      if (tries++ < 150) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [pathname])
}

export function AppShell() {
  const { pathname } = useLocation()
  const fullscreen = FULLSCREEN.some((r) => r.test(pathname))
  useTheme()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  // Titeln sätts i en layout-effekt så att en sida kan förfina den med en vanlig effekt.
  useLayoutEffect(() => {
    document.title = routeTitle(pathname)
  }, [pathname])

  useFocusOnNavigate(pathname)

  // Be en gång om beständig lagring, så att webbläsaren (t.ex. Safari efter sju dagar utan besök)
  // inte rensar dagboken automatiskt. Tyst – inget visas om det inte går.
  useEffect(() => {
    try {
      void ensurePersistentStorage().catch(() => {})
    } catch {
      /* lagrings-API:t saknas – inget att göra */
    }
  }, [])

  // De inbyggda apparna (Capacitor): starta native-funktionerna en gång (statusfält, startskärm,
  // bakåtknapp, köp, påminnelser, Hälsa och spegling – src/native/init.ts). No-op på webben. Körs
  // här och inte i main.tsx: AppShell ritas först när butikerna har lästs in (Gate i App.tsx), så
  // startskärmen döljs först när dagboken finns, och efter useTheme, så att statusfältet får rätt
  // tema.
  useEffect(() => {
    void initNative()
  }, [])

  // Bottennavigeringen täcker nederkanten – håll fokuserade element ovanför den (se index.css).
  useEffect(() => {
    document.documentElement.classList.toggle('has-bottom-nav', !fullscreen)
    return () => document.documentElement.classList.remove('has-bottom-nav')
  }, [fullscreen])

  return (
    <div className="grain min-h-dvh">
      {/* Sidomeny på stora skärmar */}
      {!fullscreen && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col overflow-y-auto border-r border-line bg-surface/70 px-4 py-6 backdrop-blur-xl lg:flex print:hidden">
          <div className="mb-8 flex items-center gap-3 px-2">
            <LogoMark size={36} />
            <Wordmark />
          </div>
          <nav className="flex flex-col gap-1" aria-label="Huvudmeny" data-main-nav="">
            {TABS.map((t) => (
              <SideLink key={t.to} item={t} pathname={pathname} exclude={SHORTCUT_PATHS} />
            ))}
            <AddButton withLabel className="mt-4 mb-2 h-12 w-full !rounded-2xl" />
            <p className="eyebrow mt-4 mb-1 px-3" id="sidebar-shortcuts">
              Genvägar
            </p>
            <ul className="flex flex-col gap-1" aria-labelledby="sidebar-shortcuts">
              {SIDEBAR_SHORTCUTS.map((t) => (
                <li key={t.to}>
                  <SideLink item={t} pathname={pathname} />
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}

      <main className={`mx-auto w-full max-w-3xl ${fullscreen ? '' : 'pb-nav lg:pl-64 lg:max-w-none print:pb-0 print:pl-0'}`}>
        <div className={fullscreen ? '' : 'mx-auto max-w-3xl'}>
          <StorageWarning />
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Bottennavigering på mobil. I apparna krymper webbvyn med tangentbordet – då döljs den
          (klassen keyboard-open sätts av src/native/system.ts), annars hamnar den ovanpå tangentbordet. */}
      {!fullscreen && (
        <nav
          aria-label="Huvudmeny"
          data-main-nav=""
          className="fixed inset-x-0 bottom-0 z-50 px-3 lg:hidden print:hidden [.keyboard-open_&]:hidden"
          style={{ paddingBottom: 'max(0.75rem, var(--sa-bottom))' }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between rounded-[1.75rem] border border-line/70 bg-surface/85 px-2 py-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
            {TABS.slice(0, 2).map((t) => (
              <TabLink key={t.to} item={t} pathname={pathname} />
            ))}
            <AddButton className="-my-5 h-14 w-14" />
            {TABS.slice(2).map((t) => (
              <TabLink key={t.to} item={t} pathname={pathname} />
            ))}
          </div>
        </nav>
      )}
      <ToastViewport />
      <DialogHost />
      <AccessSync />
      <AccessBlockedDialog />
      {canPromptForUpdate() && (
        <Suspense fallback={null}>
          <UpdatePrompt />
        </Suspense>
      )}
    </div>
  )
}

function SideLink({ item, pathname, exclude }: { item: NavItem; pathname: string; exclude?: readonly string[] }) {
  const match = navMatch(item, pathname, exclude)
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={match === 'page' ? 'page' : match === 'section' ? 'true' : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.95rem] font-medium transition-colors ${
        match ? 'bg-gran-soft text-gran' : 'text-ink-2 hover:bg-surface-2'
      }`}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {item.label}
    </Link>
  )
}

function TabLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const match = navMatch(item, pathname)
  const active = match !== null
  const Icon = item.icon
  return (
    <Link
      to={item.to}
      aria-current={match === 'page' ? 'page' : match === 'section' ? 'true' : undefined}
      className={`relative flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.6875rem] font-semibold transition-colors ${
        active ? 'text-gran' : 'text-ink-3 hover:text-ink-2'
      }`}
    >
      {active && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 -z-10 rounded-2xl bg-gran-soft"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      )}
      <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={active ? 2.4 : 2} aria-hidden />
      {item.label}
    </Link>
  )
}
