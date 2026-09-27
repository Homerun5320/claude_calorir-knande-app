/**
 * Vikt i korthet – senaste vägningen, trendriktning senaste veckan och en snabb "Väg dig".
 *
 * Trenden (exponentiellt glidande medelvärde) visas i stället för dag-till-dag-svängningar,
 * och tonen är neutral: viktnedgång tonas aldrig grönt. Är viktmålet pausat (låg vikt) eller
 * målvikten nådd visas samma besked som under Vikt och i målen.
 */
import { memo, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Scale, Sprout } from 'lucide-react'
import { Button, Card, NumberField, Sheet, toast } from '../../components/ui'
import { ageFromBirthYear, relativeDayLabel } from '../../lib/dates'
import { goalPauseNote, OLDER_ADULT_AGE, youngestAge, type GoalPause } from '../../lib/energy'
import { formatKg, formatNumber } from '../../lib/format'
import { useBodyStore } from '../../stores/bodyStore'
import { useProfileStore } from '../../stores/profileStore'
import type { ISODate } from '../../types'
import { SwitchToMaintainButton } from '../body/parts'
import { CareNote } from './CareNote'
import { SectionLink } from './SectionLink'
import { weightCaution, weightGoodDirection, weightSnapshot, type WeightCaution } from './todayLogic'
import { requireAccess } from '../premium/requireAccess'

const MIN_KG = 20
const MAX_KG = 400
const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const
const TREND_WORD = { up: 'uppåt', down: 'nedåt', flat: 'oförändrad' } as const

function cautionText(caution: WeightCaution, age: number | undefined): string {
  if (caution === 'snabb') {
    return 'Vikten går ner snabbare än vi rekommenderar – högst ungefär 1\u00a0% av kroppsvikten i veckan. Ät gärna lite mer; kroppen mår bäst av en lugn takt.'
  }
  const forWhom = age !== undefined && age >= OLDER_ADULT_AGE ? 'för din längd och ålder' : 'för din längd'
  return `Din trendvikt ligger under det som räknas som hälsosamt ${forWhom}. Ät gärna lite mer, och prata med vården om du är osäker.`
}

/**
 * Medvetet läge: Vikt-kortet vilar, men är viktmålet pausat för att vikten redan är låg visas
 * samma varsamma besked som under Vikt – utan siffror.
 */
export const GoalCareCard = memo(function GoalCareCard({ today }: { today: ISODate }) {
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  const age = birthYear !== undefined ? ageFromBirthYear(birthYear, today) : undefined
  return (
    <Card title="Ditt mål">
      <CareNote>{goalPauseNote('lowBmi', age)}</CareNote>
      <SwitchToMaintainButton />
    </Card>
  )
})

export interface WeightCardProps {
  today: ISODate
  /** Varför viktmålet är pausat (från `useTargets().energy.goalPause`), eller null. */
  goalPause?: GoalPause | null
}

export const WeightCard = memo(function WeightCard({ today, goalPause = null }: WeightCardProps) {
  const weights = useBodyStore((s) => s.weights)
  const goal = useProfileStore((s) => s.profile?.goal)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  const startWeight = useProfileStore((s) => s.profile?.startWeightKg)
  const heightCm = useProfileStore((s) => s.profile?.heightCm)

  const snap = useMemo(() => weightSnapshot(weights, today), [weights, today])
  // 70-årsgränsen räknas på åldern enligt födelseåret, 18-årsgränsen försiktigt (yngsta möjliga).
  const age = birthYear !== undefined ? ageFromBirthYear(birthYear, today) : undefined
  const young = birthYear !== undefined ? youngestAge(birthYear, today) : undefined
  const good = goalPause ? undefined : weightGoodDirection(goal, lifeStage, young)
  // För snabb nedgång eller låg vikt tonas aldrig grönt – då visas en varsam notis i stället.
  const caution = snap ? weightCaution(snap, { heightCm, age, youngestAge: young, lifeStage }) : null
  // Pausat mål för att vikten redan är låg säger samma sak som "lag" – visa bara pausbeskedet.
  const shownCaution = goalPause === 'lowBmi' && caution === 'lag' ? null : caution

  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<number | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const valid = value !== undefined && value >= MIN_KG && value <= MAX_KG

  const openSheet = () => {
    if (!requireAccess('vikt')) return
    setValue(snap?.latest.kg ?? startWeight)
    setOpen(true)
  }

  const save = () => {
    if (!valid || value === undefined) return
    if (!requireAccess('vikt')) {
      setOpen(false)
      return
    }
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
  const trendGood = snap !== null && good !== undefined && snap.direction === good && caution === null

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
                    : `${snap.weekChangeKg > 0 ? '+' : '−'}${formatNumber(Math.abs(snap.weekChangeKg), 1)}\u00a0kg/vecka`}
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
      {goalPause === 'lowBmi' && (
        <>
          <CareNote className="mt-3">{goalPauseNote('lowBmi', age)}</CareNote>
          <SwitchToMaintainButton />
        </>
      )}
      {goalPause !== null && goalPause !== 'lowBmi' && (
        // Nådd målvikt, graviditet, amning eller under 18 år: ett lugnt besked, samma som i målen.
        <div className="mt-3 rounded-2xl bg-surface-2 p-3.5">
          <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-2">
            <Sprout aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-mossa" strokeWidth={2.2} />
            <span>{goalPauseNote(goalPause, age)}</span>
          </p>
          <SwitchToMaintainButton className="mt-2" />
        </div>
      )}
      {shownCaution && <CareNote className="mt-3">{cautionText(shownCaution, age)}</CareNote>}

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
            // Bara min 0: fältet ska inte tyst skriva om en felskriven vikt ("7,24" → 20 kg).
            // Intervallet kontrolleras här och visas som fel.
            min={0}
            error={value !== undefined && !valid ? `Ange en vikt mellan ${MIN_KG} och ${MAX_KG}\u00a0kg` : undefined}
          />
        </form>
      </Sheet>
    </Card>
  )
})
