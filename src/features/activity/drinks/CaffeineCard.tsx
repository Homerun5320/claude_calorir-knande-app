/**
 * Koffein idag: summa mot riktmärket (EFSA), en tidslinje över uppskattat koffein i kroppen
 * (halveringstid ~5 h), dagens intag i tidsordning, sömntips och snabbval för kaffe och te.
 */
import { memo, useId, useMemo } from 'react'
import { Moon } from 'lucide-react'
import { Badge, Card, ProgressBar } from '../../../components/ui'
import { areaPath, curvePath, useElementWidth } from '../../../components/charts'
import { formatNumber, formatNutrient } from '../../../lib/format'
import type { DiaryEntry, ISODate } from '../../../types'
import {
  BEDTIME_MINUTE,
  CAFFEINE_LEVEL_TEXT,
  caffeineCurve,
  caffeineInBody,
  caffeineIntakes,
  caffeineLevel,
  DEFAULT_CAFFEINE_MAX_MG,
  minutesToTime,
  sleepTip,
  type CaffeineIntake,
} from '../drinksLogic'
import { useNow } from '../hooks'
import { COFFEE_OPTIONS, QuickDrinks } from './QuickDrinks'

export interface CaffeineCardProps {
  date: ISODate
  entries: readonly DiaryEntry[]
  maxMg: number
  mindful: boolean
  /** Visa "nu"-markering och mängd i kroppen just nu (bara för idag). */
  isToday: boolean
  /** Under 18 år – riktmärket är då 3 mg per kg kroppsvikt (redan inräknat i `maxMg`). */
  minor?: boolean
}

export const CaffeineCard = memo(function CaffeineCard({ date, entries, maxMg, mindful, isToday, minor = false }: CaffeineCardProps) {
  const intakes = useMemo(() => caffeineIntakes(entries), [entries])
  const total = intakes.reduce((s, i) => s + i.mg, 0)
  const max = maxMg > 0 ? maxMg : DEFAULT_CAFFEINE_MAX_MG
  const level = caffeineLevel(total, max)
  const levelText = CAFFEINE_LEVEL_TEXT[level]
  const nowMs = useNow(60_000, isToday)
  const now = new Date(nowMs)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const inBodyNow = caffeineInBody(intakes, nowMinute)
  const atBedtime = caffeineInBody(intakes, BEDTIME_MINUTE)
  const listId = useId()

  return (
    <Card tone="hjortron" eyebrow="Koffein idag" title="Kaffe och te">
      <div className="flex items-end justify-between gap-3">
        {mindful ? (
          <p className="font-display text-2xl font-semibold leading-tight text-ink">{levelText.label}</p>
        ) : (
          <p className="leading-none">
            <span className="display-num text-[2.5rem] font-semibold text-ink">{formatNumber(total)}</span>{' '}
            <span className="ml-1 text-sm text-ink-3">mg av {formatNumber(max)}{'\u00a0'}mg</span>
          </p>
        )}
        {!mindful && level !== 'inget' && (
          <Badge tone={level === 'lagom' ? 'mossa' : 'hjortron'} variant="soft">
            {levelText.label}
          </Badge>
        )}
      </div>
      <ProgressBar
        className="mt-3"
        value={total}
        max={max}
        tone="hjortron"
        size="sm"
        aria-label="Koffein mot dagens riktmärke"
        valueText={mindful ? levelText.label : `${formatNumber(total)} av ${formatNumber(max)} milligram`}
      />
      <p className="mt-2 text-[0.8125rem] leading-snug text-ink-2">{levelText.text}</p>

      {intakes.length > 0 && (
        <div className="mt-4">
          <CaffeineTimeline intakes={intakes} nowMinute={isToday ? nowMinute : null} mindful={mindful} />
          {!mindful && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[0.8125rem]">
              {isToday && (
                <div className="rounded-2xl bg-surface/70 px-3 py-2">
                  <dt className="text-ink-3">I kroppen nu</dt>
                  <dd className="font-semibold tabular-nums text-ink">≈{'\u00a0'}{formatNumber(inBodyNow)}{'\u00a0'}mg</dd>
                </div>
              )}
              <div className="rounded-2xl bg-surface/70 px-3 py-2">
                <dt className="text-ink-3">Vid läggdags ({minutesToTime(BEDTIME_MINUTE)})</dt>
                <dd className="font-semibold tabular-nums text-ink">≈{'\u00a0'}{formatNumber(atBedtime)}{'\u00a0'}mg</dd>
              </div>
            </dl>
          )}
          <h3 id={listId} className="eyebrow mb-1 mt-4">
            Dagens intag
          </h3>
          <ol aria-labelledby={listId} className="flex flex-col divide-y divide-line/60">
            {intakes.map((i) => (
              <li key={i.id} className="flex items-baseline gap-3 py-2 text-[0.875rem]">
                <span className="w-12 shrink-0 tabular-nums text-ink-3">{minutesToTime(i.minute)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{i.name}</span>
                {!mindful && <span className="shrink-0 tabular-nums text-ink-2">{formatNutrient('caffeine', i.mg)}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-4 flex gap-2.5 rounded-2xl bg-surface/70 p-3 text-[0.8125rem] leading-relaxed text-ink-2">
        <Moon aria-hidden className="mt-0.5 size-4 shrink-0 text-blabar" strokeWidth={2.2} />
        <span>{sleepTip(intakes)}</span>
      </p>

      <h3 className="eyebrow mb-2 mt-5">Lägg till</h3>
      <QuickDrinks options={COFFEE_OPTIONS} kind="caffeine" date={date} mindful={mindful} label="Snabbval kaffe och te" />
      <p className="mt-3 text-xs leading-relaxed text-ink-3">
        {minor
          ? 'Riktmärke enligt EFSA: för dig under 18 år gäller högst ca 3\u00a0mg per kg kroppsvikt och dag – undvik gärna energidrycker. '
          : 'Riktmärke enligt EFSA: upp till 400\u00a0mg per dag för friska vuxna, 200\u00a0mg under graviditet och amning. '}
        Kurvan är en förenklad uppskattning – hur snabbt koffein bryts ned varierar mycket mellan personer.
      </p>
    </Card>
  )
})

// ---------------------------------------------------------------------------
// Tidslinje
// ---------------------------------------------------------------------------

const HEIGHT = 128
const PAD = { top: 16, bottom: 22, left: 6, right: 6 }
const END_MINUTE = 24 * 60

interface CaffeineTimelineProps {
  intakes: readonly CaffeineIntake[]
  /** Minuter efter midnatt för "nu", eller null för andra dagar än idag. */
  nowMinute: number | null
  mindful: boolean
}

/** Uppskattat koffein i kroppen från morgon till midnatt, med intag, "nu" och läggdags. */
function CaffeineTimeline({ intakes, nowMinute, mindful }: CaffeineTimelineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const first = intakes[0]?.minute ?? 6 * 60
  const from = Math.min(6 * 60, Math.floor(first / 60) * 60)
  const curve = useMemo(() => caffeineCurve(intakes, from, END_MINUTE, 10), [intakes, from])
  const peak = Math.max(50, ...curve.map((p) => p.mg))
  const yMax = peak * 1.15
  const innerW = Math.max(1, width - PAD.left - PAD.right)
  const x = (m: number) => PAD.left + ((m - from) / (END_MINUTE - from)) * innerW
  const y = (mg: number) => PAD.top + (1 - mg / yMax) * (HEIGHT - PAD.top - PAD.bottom)
  const points = curve.map((p) => ({ x: x(p.minute), y: y(p.mg) }))
  const baseline = y(0)
  const ticks: number[] = []
  for (let h = Math.ceil(from / 60 / 3) * 3; h < 24; h += 3) ticks.push(h)
  const nowVisible = nowMinute !== null && nowMinute >= from && nowMinute <= END_MINUTE
  const bedX = x(BEDTIME_MINUTE)
  const label = mindful
    ? 'Uppskattat koffein i kroppen under dagen.'
    : `Uppskattat koffein i kroppen under dagen: högst cirka ${formatNumber(peak)} mg, cirka ${formatNumber(caffeineInBody(intakes, BEDTIME_MINUTE))} mg vid läggdags.`

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={label} className="block overflow-visible">
        <path d={areaPath(points, baseline, 'linear')} fill="var(--lg-hjortron)" fillOpacity={0.2} />
        <path d={curvePath(points, 'linear')} fill="none" stroke="var(--lg-hjortron)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Läggdags */}
        <line x1={bedX} x2={bedX} y1={PAD.top - 2} y2={baseline} stroke="var(--lg-blabar)" strokeWidth={1.5} strokeDasharray="3 4" />
        <text x={bedX - 4} y={PAD.top - 5} textAnchor="end" fontSize={10} fontWeight={600} className="fill-blabar">
          Läggdags
        </text>

        {/* Nu */}
        {nowVisible && nowMinute !== null && (
          <g>
            <line x1={x(nowMinute)} x2={x(nowMinute)} y1={PAD.top} y2={baseline} stroke="var(--lg-ink-3)" strokeWidth={1} strokeOpacity={0.6} />
            <circle cx={x(nowMinute)} cy={y(caffeineInBody(intakes, nowMinute))} r={3.5} fill="var(--lg-ink)" />
            <text x={x(nowMinute) + 4} y={PAD.top + 4} fontSize={10} className="fill-ink-3">
              Nu
            </text>
          </g>
        )}

        {/* Intag */}
        {intakes.map((i) => (
          <circle key={i.id} cx={x(i.minute)} cy={y(caffeineInBody(intakes, i.minute))} r={4} fill="var(--lg-surface)" stroke="var(--lg-hjortron)" strokeWidth={2}>
            <title>{mindful ? `${minutesToTime(i.minute)} ${i.name}` : `${minutesToTime(i.minute)} ${i.name}, ${formatNutrient('caffeine', i.mg)}`}</title>
          </circle>
        ))}

        {/* Tidsaxel */}
        <line x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} stroke="var(--lg-line)" strokeWidth={1} />
        {ticks.map((h) => (
          <text key={h} x={x(h * 60)} y={HEIGHT - 6} textAnchor="middle" fontSize={10} className="fill-ink-3 tabular-nums">
            {String(h).padStart(2, '0')}
          </text>
        ))}
      </svg>
    </div>
  )
}
