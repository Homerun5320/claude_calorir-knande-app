/**
 * Huvudet på Idag: säsongslandskapet med hälsning, datum och (när det finns) dagens
 * eller en kommande svensk matdag. Tryck på matdagen → Matkalendern.
 *
 * Har användaren stängt av säsongstemat visas en vanlig sidrubrik i stället.
 */
import { memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { SeasonalHeader } from '../../components/signature'
import { PageHeader } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { useClock } from './hooks'
import { formatHeaderDate, greetingFor, headerFoodDay, type HeaderFoodDay } from './todayLogic'

function FoodDayChip({ foodDay, onLandscape }: { foodDay: HeaderFoodDay; onLandscape: boolean }) {
  const { day, text } = foodDay
  return (
    <Link
      to="/matkalender"
      aria-label={`${text}. Öppna matkalendern`}
      className={
        onLandscape
          ? // Genomskinlig bakgrund av bläckfärgen – läsbar både mot dagshimmel och natthimmel.
            'relative inline-flex h-9 max-w-full items-center gap-1.5 self-start rounded-full bg-[color-mix(in_oklab,var(--lg-ink)_10%,transparent)] py-1 pr-2.5 pl-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-[color-mix(in_oklab,var(--lg-ink)_16%,transparent)] backdrop-blur-md transition-colors ring-inset after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-[color-mix(in_oklab,var(--lg-ink)_16%,transparent)]'
          : 'relative inline-flex h-9 max-w-full items-center gap-1.5 self-start rounded-full bg-sol-soft py-1 pr-2.5 pl-3 text-[0.8125rem] font-semibold text-ink ring-1 ring-sol/30 ring-inset after:absolute after:inset-x-0 after:-inset-y-1'
      }
    >
      <span aria-hidden="true">{day.emoji}</span>
      <span className="truncate">{text}</span>
      <ChevronRight className="size-3.5 shrink-0 opacity-70" strokeWidth={2.6} aria-hidden="true" />
    </Link>
  )
}

export const TodayHeader = memo(function TodayHeader({ today }: { today: ISODate }) {
  // Hälsningen byter bara vid några få klockslag – var femte minut räcker gott.
  const now = useClock(5 * 60_000)
  const name = useProfileStore((s) => s.profile?.name)
  const seasonal = useProfileStore((s) => s.settings.seasonalTheme)
  const foodDay = useMemo(() => headerFoodDay(today), [today])
  const hello = greetingFor(now, name)
  const dateText = formatHeaderDate(today)

  if (!seasonal) {
    return (
      <div className="px-4">
        <PageHeader eyebrow={dateText} title={hello}>
          {foodDay && <FoodDayChip foodDay={foodDay} onLandscape={false} />}
        </PageHeader>
      </div>
    )
  }

  return (
    <header className="lg:px-4 lg:pt-4">
      <SeasonalHeader date={today} height={212} className="lg:rounded-[1.75rem]">
        <p className="text-[0.9375rem] font-medium text-ink-2">{dateText}</p>
        <h1 className="mt-0.5 font-display text-[2rem] leading-[1.1] font-semibold tracking-tight text-balance text-ink sm:text-[2.375rem]">
          {hello}
        </h1>
        {foodDay && (
          <div className="mt-3 flex">
            <FoodDayChip foodDay={foodDay} onLandscape />
          </div>
        )}
      </SeasonalHeader>
    </header>
  )
})
