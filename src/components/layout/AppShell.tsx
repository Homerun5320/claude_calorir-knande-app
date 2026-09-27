import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, ChartNoAxesColumn, Plus, Sun, Menu } from 'lucide-react'
import { motion } from 'motion/react'
import { Suspense, useEffect } from 'react'
import { LogoMark, Wordmark } from './Logo'
import { ToastViewport } from '../ui/toast'
import { DialogHost } from '../ui/Dialog'
import { useProfileStore } from '../../stores/profileStore'
import { mealForTime } from '../../lib/meals'
import { useTheme } from '../../hooks/useTheme'

const TABS = [
  { to: '/', label: 'Idag', icon: Sun, end: true },
  { to: '/dagbok', label: 'Dagbok', icon: BookOpen, end: false },
  { to: '/insikter', label: 'Insikter', icon: ChartNoAxesColumn, end: false },
  { to: '/mer', label: 'Mer', icon: Menu, end: false },
] as const

/** Sidor som visas i helskärm utan bottennavigering. */
const FULLSCREEN = [/^\/valkommen/, /^\/lagg-till/, /^\/skanna/]

export function PageFallback() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" aria-busy="true" aria-label="Laddar">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-gran-soft border-t-gran" />
    </div>
  )
}

/** Datumet i dagboken (/dagbok/2026-09-20) så att "+" lägger till på dagen man tittar på. */
const DIARY_DATE = /^\/dagbok\/(\d{4}-\d{2}-\d{2})$/

function AddButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const meals = useProfileStore((s) => s.settings.meals)
  const add = () => {
    const date = DIARY_DATE.exec(pathname)?.[1]
    navigate(`/lagg-till?maltid=${mealForTime(meals)}${date ? `&datum=${date}` : ''}`)
  }
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={add}
      className={`grid place-items-center rounded-full bg-gran text-on-gran shadow-[var(--shadow-float)] ${className}`}
      aria-label="Lägg till mat"
    >
      <Plus className="h-7 w-7" strokeWidth={2.4} />
    </motion.button>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const fullscreen = FULLSCREEN.some((r) => r.test(pathname))
  useTheme()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="grain min-h-dvh">
      {/* Sidomeny på stora skärmar */}
      {!fullscreen && (
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface/70 px-4 py-6 backdrop-blur-xl lg:flex">
          <div className="mb-8 flex items-center gap-3 px-2">
            <LogoMark size={36} />
            <Wordmark />
          </div>
          <nav className="flex flex-col gap-1" aria-label="Huvudmeny">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[0.95rem] font-medium transition-colors ${
                    isActive ? 'bg-gran-soft text-gran' : 'text-ink-2 hover:bg-surface-2'
                  }`
                }
              >
                <t.icon className="h-5 w-5" />
                {t.label}
              </NavLink>
            ))}
          </nav>
          <AddButton className="mt-6 h-12 w-full !rounded-2xl" />
        </aside>
      )}

      <main className={`mx-auto w-full max-w-3xl ${fullscreen ? '' : 'pb-nav lg:pl-64 lg:max-w-none'}`}>
        <div className={fullscreen ? '' : 'mx-auto max-w-3xl'}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Bottennavigering på mobil */}
      {!fullscreen && (
        <nav
          aria-label="Huvudmeny"
          className="fixed inset-x-0 bottom-0 z-50 px-3 lg:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto flex max-w-md items-center justify-between rounded-[1.75rem] border border-line/70 bg-surface/85 px-2 py-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
            {TABS.slice(0, 2).map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
            <AddButton className="-my-5 h-14 w-14" />
            {TABS.slice(2).map((t) => (
              <TabLink key={t.to} {...t} />
            ))}
          </div>
        </nav>
      )}
      <ToastViewport />
      <DialogHost />
    </div>
  )
}

function TabLink({ to, label, icon: Icon, end }: (typeof TABS)[number]) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `relative flex w-16 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.6875rem] font-semibold transition-colors ${
          isActive ? 'text-gran' : 'text-ink-3 hover:text-ink-2'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="tab-pill"
              className="absolute inset-0 -z-10 rounded-2xl bg-gran-soft"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <Icon className="h-[1.35rem] w-[1.35rem]" strokeWidth={isActive ? 2.4 : 2} />
          {label}
        </>
      )}
    </NavLink>
  )
}
