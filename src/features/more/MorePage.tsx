/**
 * Mer (/mer) – navet för allt utöver Idag, Dagbok och Insikter. Varje kort visar ett litet,
 * levande nyckeltal så att sidan känns som en överblick och inte bara en meny.
 */
import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  CalendarHeart,
  ChartNoAxesColumn,
  ChefHat,
  CloudUpload,
  Dumbbell,
  GlassWater,
  HeartHandshake,
  Info,
  Scale,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Card, PageHeader, toneVars, type Tone } from '../../components/ui'
import { formatLiters } from '../../components/domain/WaterGlasses'
import { LogoMark } from '../../components/layout/Logo'
import { useToday } from '../../hooks/useToday'
import { relativeDayLabel } from '../../lib/dates'
import { formatDuration, formatKg, plural } from '../../lib/format'
import { foodDayCountdown, foodDayFor, upcomingFoodDays } from '../../lib/swedishCalendar'
import { latestWeight, useBodyStore } from '../../stores/bodyStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { backupDue, useLastBackup } from '../settings/backupStatus'
import { dayNumberSince, formatElapsed, loggedDaysInLast } from './moreLogic'
import { SupportSheet } from './SupportSheet'

interface HubItem {
  id: string
  title: string
  stat: string
  icon: LucideIcon
  tone: Tone
  to?: string
  onClick?: () => void
}

/** Nu, uppdaterat varje minut (för pågående fasta). */
function useMinuteNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function HubCard({ item, index }: { item: HubItem; index: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : Math.min(index, 10) * 0.035, type: 'spring', stiffness: 320, damping: 32 }}
      className="flex"
    >
      <Card to={item.to} onClick={item.onClick} padding="none" className="flex min-h-[8.75rem] flex-col p-4">
        <span style={toneVars(item.tone)} aria-hidden className="grid size-11 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)">
          <item.icon className="size-[1.3rem]" strokeWidth={2.1} />
        </span>
        <span className="mt-auto block pt-3 font-display text-[1.0625rem] font-semibold leading-snug tracking-tight text-ink">{item.title}</span>
        <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug text-ink-3">{item.stat}</span>
      </Card>
    </motion.li>
  )
}

export default function MorePage() {
  const today = useToday()
  const [support, setSupport] = useState(false)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const profileCreated = useProfileStore((s) => s.profile?.createdAt)
  const name = useProfileStore((s) => s.profile?.name)
  const weights = useBodyStore((s) => s.weights)
  const recipeCount = useFoodStore((s) => Object.keys(s.recipes).length)
  const entries = useDiaryStore((s) => s.entries)
  const exercise = useDiaryStore((s) => s.exercise[today])
  const waterMl = useDiaryStore((s) => s.water[today] ?? 0)
  const fast = useFastingStore((s) => s.active)
  const lastBackup = useLastBackup()
  const now = useMinuteNow(fast !== null)

  const latest = latestWeight(weights)
  const logged = useMemo(() => loggedDaysInLast(entries, today, 7), [entries, today])
  const hasData = useMemo(() => Object.values(entries).some((l) => l.length > 0) || weights.length > 0, [entries, weights])
  const exerciseMin = useMemo(() => (exercise ?? []).reduce((s, e) => s + e.minutes, 0), [exercise])
  const foodDay = useMemo(() => {
    const todays = foodDayFor(today).find((d) => !d.weekly)
    if (todays) return `${todays.emoji} ${todays.name} idag`
    const next = upcomingFoodDays(today, 1)[0]
    return next ? `${next.emoji} ${next.name} · ${foodDayCountdown(next, today).toLocaleLowerCase('sv-SE')}` : 'Svenska matdagar och säsong'
  }, [today])

  const items: HubItem[] = [
    {
      id: 'vikt',
      title: 'Vikt & mått',
      to: '/vikt',
      icon: Scale,
      tone: 'blabar',
      stat: latest
        ? mindful
          ? `Senast vägd ${relativeDayLabel(latest.date, today).toLocaleLowerCase('sv-SE')}`
          : `${formatKg(latest.kg)} · ${relativeDayLabel(latest.date, today).toLocaleLowerCase('sv-SE')}`
        : 'Följ din trend, inte dagsformen',
    },
    {
      id: 'insikter',
      title: 'Insikter',
      to: '/insikter',
      icon: ChartNoAxesColumn,
      tone: 'mossa',
      stat: logged > 0 ? `${logged} av 7 dagar loggade i veckan` : 'Näring, kostråd och klimat',
    },
    { id: 'recept', title: 'Recept', to: '/recept', icon: ChefHat, tone: 'hjortron', stat: recipeCount > 0 ? plural(recipeCount, 'eget recept', 'egna recept') : 'Svenska klassiker och dina egna' },
    {
      id: 'traning',
      title: 'Träning',
      to: '/traning',
      icon: Dumbbell,
      tone: 'lingon',
      stat: exerciseMin > 0 ? `${formatDuration(exerciseMin)} rörelse idag` : 'Promenad, skidor, padel …',
    },
    { id: 'dryck', title: 'Dryck', to: '/dryck', icon: GlassWater, tone: 'fjall', stat: waterMl > 0 ? `${formatLiters(waterMl)} vatten idag` : 'Vatten, kaffe och alkohol' },
    { id: 'fasta', title: 'Fasta', to: '/fasta', icon: Timer, tone: 'vinbar', stat: fast ? `Pågår · ${formatElapsed(now - fast.start)}` : 'Ingen fasta pågår' },
    { id: 'matkalender', title: 'Matkalender', to: '/matkalender', icon: CalendarHeart, tone: 'sol', stat: foodDay },
    { id: 'installningar', title: 'Inställningar', to: '/installningar', icon: Settings, tone: 'gran', stat: 'Mål, tema och data' },
    { id: 'om', title: 'Om Lagom', to: '/om', icon: Info, tone: 'neutral', stat: 'Källor och integritet' },
    { id: 'stod', title: 'Stöd & hjälp', onClick: () => setSupport(true), icon: HeartHandshake, tone: 'vinbar', stat: '1177, Frisk & Fri och Alkoholhjälpen' },
  ]

  const showBackup = backupDue(lastBackup, Date.now(), hasData)

  return (
    <div className="px-4 pb-8">
      <PageHeader title="Mer" subtitle="Allt det andra som gör Lagom komplett." />

      <div className="flex flex-col gap-4">
        {profileCreated !== undefined && (
          <Card tone="gran" padding="md">
            <div className="flex items-center gap-4">
              <LogoMark size={44} className="shrink-0" />
              <div className="min-w-0">
                <p className="font-display text-[1.1875rem] font-semibold leading-snug tracking-tight text-ink">
                  {name ? `${name}, dag ${dayNumberSince(profileCreated, today)} med Lagom` : `Dag ${dayNumberSince(profileCreated, today)} med Lagom`}
                </p>
                <p className="mt-0.5 text-[0.875rem] leading-snug text-ink-2">
                  {logged >= 5 ? 'Fin rutin – du är med nästan varje dag.' : logged > 0 ? 'Varje registrering räknas. Lagom är bäst.' : 'Börja när du vill – en måltid i taget.'}
                </p>
              </div>
            </div>
          </Card>
        )}

        {showBackup && (
          <Card to="/installningar/data" tone="sol" padding="sm">
            <div className="flex items-center gap-3 px-1">
              <CloudUpload aria-hidden className="size-5 shrink-0 text-(--tone-ink)" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink">{lastBackup === null ? 'Gör din första säkerhetskopia' : 'Dags för en ny säkerhetskopia?'}</span>
                <span className="block text-[0.8125rem] leading-snug text-ink-2">Din data finns bara i telefonen – en fil tar tio sekunder.</span>
              </span>
            </div>
          </Card>
        )}

        <nav aria-label="Mer i Lagom">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((item, i) => (
              <HubCard key={item.id} item={item} index={i} />
            ))}
          </ul>
        </nav>

        <p className="px-2 pt-2 text-center text-[0.8125rem] leading-relaxed text-ink-3">
          Lagom är gratis, utan reklam och din data stannar i din telefon.
        </p>
      </div>

      <SupportSheet open={support} onClose={() => setSupport(false)} />
    </div>
  )
}
