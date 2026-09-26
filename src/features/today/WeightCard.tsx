/**
 * Vikt i korthet – senaste vägningen, trendriktning senaste veckan och en snabb "Väg dig".
 *
 * Trenden (exponentiellt glidande medelvärde) visas i stället för dag-till-dag-svängningar,
 * och tonen är neutral: bara en förändring i linje med användarens mål tonas mjukt grönt.
 */
import { memo, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Scale } from 'lucide-react'
import { Button, Card, NumberField, Sheet, toast } from '../../components/ui'
import { ageFromBirthYear, relativeDayLabel } from '../../lib/dates'
import { formatKg, formatNumber } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { SectionLink } from './SectionLink'
import { weightGoodDirection, weightSnapshot } from './todayLogic'

const MIN_KG = 20
const MAX_KG = 400
const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const
const TREND_WORD = { up: 'uppåt', down: 'nedåt', flat: 'oförändrad' } as const

export const WeightCard = memo(function WeightCard({ today }: { today: ISODate }) {
  const weights = useBodyStore((s) => s.weights)
  const goal = useProfileStore((s) => s.profile?.goal)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  const startWeight = useProfileStore((s) => s.profile?.startWeightKg)

  const snap = useMemo(() => weightSnapshot(weights, today), [weights, today])
  const good = weightGoodDirection(goal, lifeStage, birthYear !== undefined ? ageFromBirthYear(birthYear, today) : undefined)

  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const valid = value !== undefined && value >= MIN_KG && value <= MAX_KG

  const openSheet = () => {
    setValue(snap?.latest.kg ?? startWeight)
    setOpen(true)
  }

  const save = () => {
    if (!valid || value === undefined) return
    const { weights: current, logWeight } = useBodyStore.getState()
    const previous = current.find((w) => w.date === today)
    const entry = logWeight(today, Math.round(value * 10) / 10)
    setOpen(false)
    toast(previous ? 'Dagens vikt är uppdaterad' : 'Vikten är sparad', {
      tone: 'success',
      action: {
        label: 'Ångra',
        onClick: () => {
          const store = useBodyStore.getState()
          if (previous) store.logWeight(previous.date, previous.kg, previous.note)
          else store.removeWeight(entry.id)
        },
      },
    })
  }

  const TrendIcon = snap ? TREND_ICON[snap.direction] : null
  const trendGood = snap !== null && good !== undefined && snap.direction === good

  return (
    <Card title="Vikt" action={<SectionLink to="/vikt" label="Visa viktkurvan">Visa</SectionLink>}>
      {snap ? (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-baseline gap-1">
              <span className="display-num text-[2.25rem] leading-none font-medium text-ink">{formatNumber(snap.latest.kg, 1)}</span>
              <span className="text-sm font-medium text-ink-3">kg</span>
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] text-ink-3">
              {snap.weekChangeKg !== undefined && TrendIcon && (
                <span
                  className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular-nums ${
                    trendGood ? 'bg-mossa-soft text-good' : 'bg-surface-2 text-ink-2'
                  }`}
                >
                  <TrendIcon className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                  <span className="sr-only">Trenden går {TREND_WORD[snap.direction]}:</span>
                  {snap.direction === 'flat'
                    ? 'Stabil'
                    : `${snap.weekChangeKg > 0 ? '+' : '−'}${formatNumber(Math.abs(snap.weekChangeKg), 1)} kg/vecka`}
                </span>
              )}
              <span>Vägd {relativeDayLabel(snap.latest.date, today).toLowerCase()}</span>
            </p>
          </div>
          <Button variant="soft" iconLeft={Scale} onClick={openSheet}>
            Väg dig
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm leading-relaxed text-ink-2">
            Ingen vägning ännu. Väg dig gärna någon gång i veckan – trenden säger mer än enskilda dagar.
          </p>
          <Button variant="soft" iconLeft={Scale} onClick={openSheet}>
            Väg dig
          </Button>
        </div>
      )}
      {snap && snap.weekChangeKg !== undefined && (
        <p className="mt-3 text-xs leading-relaxed text-ink-3">
          Trendvikt {formatKg(snap.trendKg)}. Vikten svänger naturligt från dag till dag – det är riktningen över tid som räknas.
        </p>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Väg dig"
        description="Väg dig gärna på morgonen innan frukost, så blir trenden jämnast."
        width="sm"
        initialFocusRef={inputRef}
        footer={
          <Button fullWidth size="lg" onClick={save} disabled={!valid}>
            Spara vikt
          </Button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <NumberField
            ref={inputRef}
            label="Vikt idag"
            labelHidden
            size="lg"
            value={value}
            onChange={setValue}
            suffix="kg"
            step={0.1}
            decimals={1}
            min={MIN_KG}
            max={MAX_KG}
            error={value !== undefined && !valid ? `Ange en vikt mellan ${MIN_KG} och ${MAX_KG} kg` : undefined}
          />
        </form>
      </Sheet>
    </Card>
  )
})
