/**
 * Svensk matkalender (/matkalender): dagens tradition, kommande matdagar med nedräkning,
 * säsongens råvaror och dagsljuset i Stockholm (med en rad om D-vitamin under mörka halvåret).
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Lightbulb, MapPin, Search, Sunrise, Sunset } from 'lucide-react'
import { Badge, Card, PageHeader, Sheet, cx } from '../../components/ui'
import { useToday } from '../../hooks/useToday'
import { MONTHS, WEEKDAYS, capitalize, diffDays, formatDayLong, formatDayShort, fromISODate } from '../../lib/dates'
import { seasonalProduce, sunTimes, SEASONS, swedishSeason } from '../../lib/season'
import { FOOD_DAY_KIND_LABELS, WEEKLY_FOOD_TRADITIONS, foodDayCountdown, foodDayFor, upcomingFoodDays, type FoodDay } from '../../lib/swedishCalendar'
import {
  STOCKHOLM_TZ,
  clockMinutes,
  daylightDeltaMinutes,
  daylightSpan,
  describeDaylightDelta,
  foodSearchPath,
  formatClock,
  formatDaylight,
  groupProduce,
  isVitaminDSeason,
  nextWeeklyOccurrence,
  nextWeeklyTradition,
} from './moreLogic'

const CHIP_LINK =
  'inline-flex h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[0.875rem] font-semibold text-ink transition-colors hover:bg-surface-3 active:scale-[0.98]'

function dateText(day: FoodDay, today: string): string {
  const start = day.approximate ? `ca ${formatDayShort(day.date)}` : formatDayLong(day.date, today)
  if (day.endDate && day.endDate !== day.date) return `${formatDayShort(day.date)} – ${formatDayShort(day.endDate)}`
  return start
}

function SectionHeading({ id, children, sub }: { id: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 px-1">
      <h2 id={id} className="font-display text-[1.3125rem] font-semibold tracking-tight text-ink">
        {children}
      </h2>
      {sub && <p className="mt-0.5 text-[0.875rem] text-ink-3">{sub}</p>}
    </div>
  )
}

export default function FoodCalendarPage() {
  const today = useToday()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState<FoodDay | null>(null)

  const todays = useMemo(() => foodDayFor(today), [today])
  const upcoming = useMemo(() => {
    const ids = new Set(todays.map((d) => d.id))
    return upcomingFoodDays(today, 10)
      .filter((d) => !ids.has(d.id))
      .slice(0, 8)
  }, [today, todays])
  const nextWeekly = useMemo(() => (todays.some((d) => d.weekly) ? null : nextWeeklyTradition(today)), [today, todays])
  const month = fromISODate(today).getMonth() + 1
  const produce = useMemo(() => groupProduce(seasonalProduce(month)), [month])
  const season = SEASONS[swedishSeason(today)]

  return (
    <div className="px-4 pb-10">
      <PageHeader back eyebrow={formatDayLong(today, today)} title="Svensk matkalender" subtitle="Matdagar, högtider och det som växer just nu." />

      <div className="flex flex-col gap-8">
        {/* Idag */}
        <section aria-labelledby="mk-idag">
          <SectionHeading id="mk-idag">Idag</SectionHeading>
          {todays.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {todays.map((d, i) => (
                <motion.li
                  key={d.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : i * 0.05, type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <Card onClick={() => setOpen(d)} tone={d.weekly ? 'hjortron' : 'sol'} aria-label={`${d.name}. Läs mer`}>
                    <div className="flex items-start gap-4">
                      <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-[1.25rem] bg-surface text-[2.25rem] leading-none shadow-card">
                        {d.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={d.weekly ? 'hjortron' : 'sol'}>{d.weekly ? `Varje ${WEEKDAYS[(fromISODate(today).getDay() + 6) % 7]}` : FOOD_DAY_KIND_LABELS[d.kind]}</Badge>
                          {d.redDay && <Badge tone="lingon">Röd dag</Badge>}
                        </span>
                        <span className="mt-1.5 block font-display text-[1.375rem] font-semibold leading-tight tracking-tight">{d.name}</span>
                        <span className="mt-1 line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-2">{d.description}</span>
                      </span>
                    </div>
                  </Card>
                </motion.li>
              ))}
            </ul>
          ) : (
            <Card variant="flat">
              <p className="text-[0.9375rem] leading-relaxed text-ink-2">
                Ingen särskild matdag idag – en helt vanlig {WEEKDAYS[(fromISODate(today).getDay() + 6) % 7]}. {season.emoji} {season.tagline}.
              </p>
              {nextWeekly && (
                <button
                  type="button"
                  onClick={() => setOpen(nextWeekly.day)}
                  className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-2xl bg-surface px-3 py-2 text-left shadow-card transition-colors hover:bg-surface-2"
                >
                  <span aria-hidden className="text-[1.5rem] leading-none">
                    {nextWeekly.day.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.75rem] font-semibold text-ink-3">
                      {nextWeekly.inDays === 1 ? 'Imorgon' : `På ${WEEKDAYS[(fromISODate(nextWeekly.day.date).getDay() + 6) % 7]}`}
                    </span>
                    <span className="block font-semibold text-ink">{nextWeekly.day.name}</span>
                  </span>
                </button>
              )}
            </Card>
          )}
        </section>

        {/* Kommande */}
        <section aria-labelledby="mk-kommande">
          <SectionHeading id="mk-kommande" sub="Tryck för att läsa mer och hitta typiska livsmedel.">
            Kommande matdagar
          </SectionHeading>
          <ul className="card flex flex-col p-1.5 [&>*+*]:border-t [&>*+*]:border-line/70">
            {upcoming.map((d) => {
              const days = diffDays(today, d.date)
              const countdown = foodDayCountdown(d, today)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(d)}
                    className="flex min-h-[3.75rem] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-3"
                  >
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-[1.375rem] leading-none">
                      {d.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium text-ink">{d.name}</span>
                      <span className="block truncate text-[0.8125rem] text-ink-3">
                        {capitalize(dateText(d, today))} · {FOOD_DAY_KIND_LABELS[d.kind]}
                      </span>
                    </span>
                    <Badge tone={days <= 7 ? 'sol' : 'neutral'} className="shrink-0">
                      {countdown}
                    </Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Veckans traditioner */}
        <section aria-labelledby="mk-veckan">
          <SectionHeading id="mk-veckan">Varje vecka</SectionHeading>
          <ul className="grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-3">
            {WEEKLY_FOOD_TRADITIONS.map((t) => {
              const isToday = todays.some((d) => d.key === t.key)
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    onClick={() => {
                      const hit = nextWeeklyOccurrence(t.key, today)
                      if (hit) setOpen(hit)
                    }}
                    className={cx(
                      'flex h-full min-h-11 w-full items-center gap-3 rounded-[1.25rem] p-3 text-left shadow-card transition-colors',
                      isToday ? 'bg-hjortron-soft ring-2 ring-inset ring-hjortron' : 'bg-surface hover:bg-surface-2',
                    )}
                  >
                    <span aria-hidden className="text-[1.75rem] leading-none">
                      {t.emoji}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[0.75rem] font-semibold text-ink-3">{capitalize(WEEKDAYS[t.weekday])}</span>
                      <span className="block text-[0.9375rem] font-semibold leading-snug text-ink">{t.name}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Säsong */}
        <section aria-labelledby="mk-sasong">
          <SectionHeading id="mk-sasong" sub="Svenska råvaror när de är som godast – ofta billigare och med mindre klimatpåverkan.">
            Säsong i {MONTHS[month - 1]}
          </SectionHeading>
          <div className="card flex flex-col gap-4 p-4 sm:p-5">
            {produce.map((g) => (
              <div key={g.kind}>
                <h3 className="eyebrow mb-2">{g.label}</h3>
                <ul className="flex flex-wrap gap-2">
                  {g.items.map((p) => (
                    <li key={p.name}>
                      <Link to={foodSearchPath(p.name)} className={CHIP_LINK} aria-label={`Sök efter ${p.name}`}>
                        <span aria-hidden>{p.emoji}</span>
                        {capitalize(p.name)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Dagsljus */}
        <DaylightCard today={today} />
      </div>

      <FoodDaySheet day={open} today={today} onClose={() => setOpen(null)} />
    </div>
  )
}

function DaylightCard({ today }: { today: string }) {
  const t = useMemo(() => sunTimes(today), [today])
  const span = daylightSpan(t)
  const delta = useMemo(() => daylightDeltaMinutes(today), [today])
  const nowFrac = clockMinutes(new Date(), STOCKHOLM_TZ) / 1440
  const dark = isVitaminDSeason(today)

  return (
    <section aria-labelledby="mk-ljus">
      <SectionHeading id="mk-ljus" sub="Soluppgång och solnedgång idag.">
        Dagsljus i Stockholm
      </SectionHeading>
      <Card>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="eyebrow">Solen är uppe</div>
            <div className="display-num mt-1 text-[2.25rem] font-semibold leading-none text-ink">{formatDaylight(t.daylightHours)}</div>
            <div className="mt-1.5 text-[0.875rem] text-ink-2">{describeDaylightDelta(delta)}</div>
          </div>
          <dl className="flex shrink-0 flex-col gap-1.5 text-right">
            <div className="flex items-center justify-end gap-2">
              <dt className="sr-only">Soluppgång</dt>
              <Sunrise aria-hidden className="size-4 text-sol" />
              <dd className="text-[0.9375rem] font-semibold tabular-nums text-ink">{formatClock(t.sunrise)}</dd>
            </div>
            <div className="flex items-center justify-end gap-2">
              <dt className="sr-only">Solnedgång</dt>
              <Sunset aria-hidden className="size-4 text-hjortron" />
              <dd className="text-[0.9375rem] font-semibold tabular-nums text-ink">{formatClock(t.sunset)}</dd>
            </div>
          </dl>
        </div>

        {span && (
          <div className="mt-5" aria-hidden>
            <div className="relative h-3 overflow-hidden rounded-full bg-blabar-soft">
              <div
                className="absolute inset-y-0 rounded-full bg-linear-to-r from-hjortron via-sol to-hjortron"
                style={{ left: `${span.start * 100}%`, width: `${(span.end - span.start) * 100}%` }}
              />
              <div className="absolute inset-y-[-2px] w-0.5 rounded-full bg-ink" style={{ left: `${nowFrac * 100}%` }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[0.6875rem] font-medium tabular-nums text-ink-3">
              <span>00</span>
              <span>06</span>
              <span>12</span>
              <span>18</span>
              <span>24</span>
            </div>
          </div>
        )}

        {dark && (
          <div className="mt-4 flex gap-3 rounded-2xl bg-sol-soft p-3.5">
            <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-hjortron" />
            <p className="text-[0.875rem] leading-relaxed text-ink">
              Från oktober till mars står solen så lågt i Sverige att huden knappt bildar något D-vitamin. Fet fisk, ägg och berikade mejeriprodukter och
              matfetter hjälper. Undrar du över tillskott – fråga{' '}
              <a href="https://www.1177.se" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
                1177
              </a>
              .
            </p>
          </div>
        )}
      </Card>
    </section>
  )
}

function FoodDaySheet({ day, today, onClose }: { day: FoodDay | null; today: string; onClose: () => void }) {
  // Behåll innehållet under stängningsanimationen.
  const [shown, setShown] = useState<FoodDay | null>(day)
  if (day && day !== shown) setShown(day)
  const d = day ?? shown

  return (
    <Sheet
      open={day !== null}
      onClose={onClose}
      title={d ? `${d.emoji} ${d.name}` : ''}
      description={d ? `${capitalize(d.weekly ? `varje ${WEEKDAYS[(fromISODate(d.date).getDay() + 6) % 7]}` : dateText(d, today))} · ${foodDayCountdown(d, today)}` : undefined}
    >
      {d && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="sol">{d.weekly ? 'Veckotradition' : FOOD_DAY_KIND_LABELS[d.kind]}</Badge>
            {d.redDay && <Badge tone="lingon">Röd dag</Badge>}
            {d.region && (
              <Badge icon={MapPin} tone="neutral">
                {d.region}
              </Badge>
            )}
          </div>
          <p className="text-[1rem] leading-relaxed text-ink">{d.description}</p>
          {d.tip && (
            <div className="flex gap-3 rounded-2xl bg-mossa-soft p-3.5">
              <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-mossa" />
              <p className="text-[0.9375rem] leading-relaxed text-ink">
                <span className="font-semibold">Lagom-tips: </span>
                {d.tip}
              </p>
            </div>
          )}
          {d.foods.length > 0 && (
            <div>
              <h3 className="eyebrow mb-2">Typiska livsmedel</h3>
              <ul className="flex flex-wrap gap-2">
                {d.foods.map((f) => (
                  <li key={f}>
                    <Link to={foodSearchPath(f)} className={CHIP_LINK} onClick={onClose}>
                      <Search aria-hidden className="size-4 text-ink-3" />
                      {capitalize(f)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
