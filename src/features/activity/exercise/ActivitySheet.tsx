/**
 * Ark för att lägga till eller ändra en aktivitet – i två steg:
 *  1. Välj aktivitet: sök, grupper som chips, vanliga aktiviteter, eller en egen aktivitet.
 *  2. Detaljer: tid, valfri sträcka, beräknad nettoförbrukning (kan ersättas med eget värde,
 *     t.ex. från en klocka), anteckning.
 *
 * Arket monteras om för varje öppning (nyckel i föräldern), så att formuläret alltid börjar rent.
 */
import { useId, useMemo, useState } from 'react'
import { ChevronLeft, Plus, Search } from 'lucide-react'
import { Badge, Button, Chip, EmptyState, IconButton, ListRow, NumberField, SegmentedControl, Sheet, Switch, TextField, toast, type Tone } from '../../../components/ui'
import { EnergyValue } from '../../../components/domain'
import { getActivity, POPULAR_ACTIVITY_IDS, type Activity } from '../../../data/activities'
import { metIntensity, paceMinPerKm, type Intensity } from '../../../lib/exercise'
import { formatDuration, formatEnergy, formatNumber } from '../../../lib/format'
import { KJ_PER_KCAL } from '../../../lib/nutrients'
import { useDiaryStore, type NewExerciseEntry } from '../../../stores/diaryStore'
import type { ExerciseEntry, ISODate } from '../../../types'
import {
  CUSTOM_ACTIVITY_ID,
  CUSTOM_INTENSITIES,
  effectiveMet,
  entryNameFor,
  filterActivities,
  GROUP_FILTERS,
  intensityLabel,
  nearestCustomIntensity,
  netKcal,
  restingKcalDuring,
  showsDistance,
  speedKindFor,
  type GroupFilter,
} from '../activityLogic'

export interface ActivitySheetProps {
  open: boolean
  onClose: () => void
  date: ISODate
  /** Post att ändra – annars läggs en ny till. */
  editing: ExerciseEntry | null
  weightKg: number
  weightKnown: boolean
  mindful: boolean
  energyUnit: 'kcal' | 'kJ'
}

const INTENSITY_TONE: Record<Intensity, Tone> = { lätt: 'fjall', måttlig: 'mossa', hög: 'hjortron' }
const MINUTE_CHOICES = [15, 30, 45, 60, 90] as const
const DEFAULT_MINUTES = 30

type Step = 'pick' | 'details'

export function ActivitySheet({ open, onClose, date, editing, weightKg, weightKnown, mindful, energyUnit }: ActivitySheetProps) {
  const editActivity = editing ? getActivity(editing.activityId) : undefined
  const toUnit = (kcal: number) => Math.round(energyUnit === 'kJ' ? kcal * KJ_PER_KCAL : kcal)
  const toKcal = (value: number) => (energyUnit === 'kJ' ? value / KJ_PER_KCAL : value)

  const [step, setStep] = useState<Step>(editing ? 'details' : 'pick')
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<GroupFilter>('alla')
  const [activity, setActivity] = useState<Activity | null>(editActivity ?? null)
  const [custom, setCustom] = useState(editing !== null && !editActivity)
  const [customName, setCustomName] = useState(editing && !editActivity ? editing.name : '')
  const [customMet, setCustomMet] = useState<number>(editing && !editActivity ? (editing.met ?? 4.5) : 4.5)
  const [minutes, setMinutes] = useState<number | undefined>(editing?.minutes ?? DEFAULT_MINUTES)
  const [distance, setDistance] = useState<number | undefined>(editing?.distanceKm)
  const [note, setNote] = useState(editing?.note ?? '')
  // Eget energivärde: på om den sparade posten avviker från det beräknade.
  const [overrideOn, setOverrideOn] = useState(() => {
    if (!editing) return false
    const base = editActivity?.met ?? editing.met ?? 4.5
    const eff = effectiveMet(editActivity?.id, base, editing.distanceKm, editing.minutes)
    return Math.abs(netKcal(eff.met, weightKg, editing.minutes) - editing.kcal) > 1
  })
  const [override, setOverride] = useState<number | undefined>(editing ? toUnit(editing.kcal) : undefined)
  const [restDeducted, setRestDeducted] = useState(false)

  const baseMet = custom ? customMet : (activity?.met ?? 4.5)
  const eff = effectiveMet(custom ? undefined : activity?.id, baseMet, distance, minutes)
  const computed = minutes ? netKcal(eff.met, weightKg, minutes) : 0
  const finalKcal = overrideOn && override !== undefined ? Math.max(0, Math.round(toKcal(override))) : computed
  const rest = restingKcalDuring(weightKg, minutes ?? 0)
  const name = custom ? customName.trim() : activity ? entryNameFor(activity, eff, distance, minutes) : ''
  const valid = minutes !== undefined && minutes > 0 && name.length > 0 && (!overrideOn || override !== undefined)

  const pick = (a: Activity) => {
    if (a.id !== activity?.id) setDistance(undefined)
    setActivity(a)
    setCustom(false)
    setStep('details')
  }

  const startCustom = () => {
    const q = query.trim()
    if (q && !customName) setCustomName(q.charAt(0).toUpperCase() + q.slice(1))
    setCustom(true)
    setActivity(null)
    setStep('details')
  }

  const toggleOverride = (on: boolean) => {
    setOverrideOn(on)
    if (on && override === undefined) setOverride(toUnit(computed))
    setRestDeducted(false)
  }

  const save = () => {
    if (!valid || minutes === undefined) return
    const payload: NewExerciseEntry = {
      date: editing?.date ?? date,
      // Egna poster och steg behåller sitt id vid ändring.
      activityId: custom ? (editing && !editActivity ? editing.activityId : CUSTOM_ACTIVITY_ID) : (activity?.id ?? CUSTOM_ACTIVITY_ID),
      name,
      minutes: Math.round(minutes),
      kcal: finalKcal,
      met: Math.round(eff.met * 10) / 10,
      distanceKm: distance !== undefined && distance > 0 ? Math.round(distance * 100) / 100 : undefined,
      note: note.trim() || undefined,
    }
    const store = useDiaryStore.getState()
    if (editing) {
      store.updateExercise(editing.date, editing.id, payload)
      toast('Ändringen är sparad', { tone: 'success' })
    } else {
      const entry = store.addExercise(payload)
      toast(`${name} är tillagd`, {
        tone: 'success',
        action: { label: 'Ångra', onClick: () => useDiaryStore.getState().removeExercise(entry.date, entry.id) },
      })
    }
    onClose()
  }

  const title = step === 'pick' ? 'Välj aktivitet' : editing ? 'Ändra aktivitet' : 'Lägg till aktivitet'

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size={step === 'pick' ? 'tall' : 'auto'}
      headerAction={
        step === 'details' && !editing ? (
          <IconButton icon={ChevronLeft} aria-label="Tillbaka till aktiviteterna" variant="secondary" size="sm" onClick={() => setStep('pick')} noTooltip />
        ) : undefined
      }
      footer={
        step === 'pick' ? (
          <Button fullWidth variant="secondary" iconLeft={Plus} onClick={startCustom}>
            Egen aktivitet
          </Button>
        ) : (
          <Button fullWidth size="lg" onClick={save} disabled={!valid}>
            {editing ? 'Spara' : 'Lägg till'}
          </Button>
        )
      }
    >
      {step === 'pick' ? (
        <PickStep
          query={query}
          onQuery={setQuery}
          group={group}
          onGroup={setGroup}
          onPick={pick}
          onCustom={startCustom}
          weightKg={weightKg}
          mindful={mindful}
        />
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          {custom ? (
            <CustomFields name={customName} onName={setCustomName} met={customMet} onMet={setCustomMet} />
          ) : (
            activity && <ActivitySummary activity={activity} met={eff.met} />
          )}

          <div>
            <NumberField
              size="lg"
              label="Tid"
              value={minutes}
              onChange={setMinutes}
              suffix="min"
              step={5}
              min={1}
              max={720}
              decimals={0}
              error={minutes === undefined ? 'Ange hur länge du höll på.' : undefined}
            />
            <div className="mt-3 flex flex-wrap justify-center gap-2" role="group" aria-label="Snabbval för tid">
              {MINUTE_CHOICES.map((m) => (
                <Chip key={m} size="sm" selected={minutes === m} onClick={() => setMinutes(m)}>
                  {formatDuration(m)}
                </Chip>
              ))}
            </div>
          </div>

          {showsDistance(custom ? undefined : (activity ?? undefined)) && (
            <NumberField
              label="Sträcka"
              optional
              value={distance}
              onChange={setDistance}
              suffix="km"
              step={0.5}
              min={0}
              max={500}
              decimals={2}
              placeholder="t.ex. 5"
              hint={speedHint(eff, custom ? undefined : activity?.id, distance, minutes)}
            />
          )}

          {mindful ? (
            <p className="rounded-2xl bg-mossa-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
              {intensityLabel(metIntensity(eff.met))} intensitet – all rörelse är bra för hjärta, humör och sömn.
            </p>
          ) : (
            <EnergyBlock
              kcal={finalKcal}
              computedFrom={overrideOn ? null : { weightKg, met: eff.met }}
              weightKnown={weightKnown}
              overrideOn={overrideOn}
              onToggle={toggleOverride}
              override={override}
              onOverride={(v) => {
                setOverride(v)
                setRestDeducted(false)
              }}
              restKcal={rest}
              restDeducted={restDeducted}
              onDeductRest={() => {
                if (override === undefined) return
                setOverride(Math.max(0, override - toUnit(rest)))
                setRestDeducted(true)
              }}
              energyUnit={energyUnit}
            />
          )}

          <TextField label="Anteckning" optional value={note} onValueChange={setNote} placeholder="T.ex. skogsrundan med Stina" maxLength={200} />
        </div>
      )}
    </Sheet>
  )
}

/** "Fart 10,2 km/h · 5:53 min/km · energin räknas på din fart" */
function speedHint(eff: ReturnType<typeof effectiveMet>, activityId: string | undefined, distance: number | undefined, minutes: number | undefined): string | undefined {
  if (!eff.speed || !distance || !minutes) return undefined
  const kind = speedKindFor(activityId)
  const parts = [`Fart ${formatNumber(eff.speed, 1)}\u00a0km/h`]
  if (kind !== 'cykling') {
    const pace = paceMinPerKm(distance, minutes)
    if (pace) parts.push(`${pace}\u00a0min/km`)
  }
  if (eff.fromSpeed) parts.push('energin räknas på din fart')
  return parts.join(' · ')
}

// ---------------------------------------------------------------------------
// Steg 1: välj aktivitet
// ---------------------------------------------------------------------------

interface PickStepProps {
  query: string
  onQuery: (q: string) => void
  group: GroupFilter
  onGroup: (g: GroupFilter) => void
  onPick: (a: Activity) => void
  onCustom: () => void
  weightKg: number
  mindful: boolean
}

function PickStep({ query, onQuery, group, onGroup, onPick, onCustom, weightKg, mindful }: PickStepProps) {
  const results = useMemo(() => filterActivities(query, group), [query, group])
  const popular = useMemo(() => POPULAR_ACTIVITY_IDS.map(getActivity).filter((a): a is Activity => a !== undefined), [])
  const searching = query.trim().length > 0
  const showPopular = !searching && group === 'alla'

  const row = (a: Activity) => (
    <li key={a.id}>
      <ListRow
        dense
        leading={a.emoji}
        leadingTone="mossa"
        title={a.name}
        subtitle={`${intensityLabel(metIntensity(a.met))} · ${formatNumber(a.met, 1)} MET`}
        value={mindful ? undefined : <EnergyValue kcal={netKcal(a.met, weightKg, 30)} />}
        valueSub={mindful ? undefined : 'per 30\u00a0min'}
        onClick={() => onPick(a)}
        chevron
      />
    </li>
  )

  return (
    <div className="flex flex-col gap-3 pb-2">
      <TextField
        label="Sök aktivitet"
        labelHidden
        type="search"
        prefix={Search}
        clearable
        value={query}
        onValueChange={onQuery}
        placeholder="Sök, t.ex. padel, skidor, trädgård"
        autoComplete="off"
        enterKeyHint="search"
      />
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1.5" role="group" aria-label="Filtrera på grupp">
        {GROUP_FILTERS.map((g) => (
          <Chip key={g.value} size="sm" selected={group === g.value} tone="mossa" onClick={() => onGroup(g.value)}>
            <span aria-hidden>{g.emoji}</span>
            {g.label}
          </Chip>
        ))}
      </div>

      {showPopular && (
        <section aria-labelledby="aktivitet-vanliga">
          <h3 id="aktivitet-vanliga" className="eyebrow mb-1 px-1">
            Vanliga
          </h3>
          <ul className="-mx-3 flex flex-col">{popular.map(row)}</ul>
        </section>
      )}

      {results.length === 0 ? (
        <EmptyState
          compact
          illustration="search"
          title="Ingen aktivitet hittades"
          text="Prova ett annat ord – eller lägg till en egen aktivitet."
          action={
            <Button variant="soft" iconLeft={Plus} onClick={onCustom}>
              Lägg till {query.trim() ? `”${query.trim()}”` : 'egen'}
            </Button>
          }
        />
      ) : (
        <section aria-labelledby="aktivitet-alla">
          <h3 id="aktivitet-alla" className="eyebrow mb-1 px-1">
            {searching ? `${results.length === 1 ? '1 träff' : `${results.length} träffar`}` : showPopular ? 'Alla aktiviteter' : (GROUP_FILTERS.find((g) => g.value === group)?.label ?? '')}
          </h3>
          <ul className="-mx-3 flex flex-col">{results.map(row)}</ul>
        </section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Steg 2: detaljer
// ---------------------------------------------------------------------------

function ActivitySummary({ activity, met }: { activity: Activity; met: number }) {
  const intensity = metIntensity(met)
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-2xl bg-mossa-soft text-2xl">
        {activity.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-ink">{activity.name}</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Badge tone={INTENSITY_TONE[intensity]}>{intensityLabel(intensity)} intensitet</Badge>
          <Badge tone="neutral">{formatNumber(met, 1)} MET</Badge>
        </div>
        {activity.note && <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">{activity.note}</p>}
        {activity.group === 'vardag' && <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-2">{EVERYDAY_HINT}</p>}
      </div>
    </div>
  )
}

/**
 * Vardagsrörelse (promenader, pendling) ingår ofta redan i aktivitetsnivån i profilen – loggas
 * den också räknas den två gånger.
 */
const EVERYDAY_HINT = 'Ingår det här redan i din vanliga vardag räknas det i din aktivitetsnivå – logga bara det som är extra.'

function CustomFields({ name, onName, met, onMet }: { name: string; onName: (v: string) => void; met: number; onMet: (v: number) => void }) {
  const labelId = useId()
  const current = nearestCustomIntensity(met)
  const description = CUSTOM_INTENSITIES.find((c) => c.value === current)?.description
  return (
    <>
      <TextField label="Aktivitet" value={name} onValueChange={onName} placeholder="T.ex. friluftsdag, lek i snön" autoComplete="off" maxLength={60} />
      <div>
        <p id={labelId} className="mb-1.5 text-sm font-medium text-ink-2">
          Hur ansträngande?
        </p>
        <SegmentedControl
          aria-labelledby={labelId}
          fullWidth
          value={current}
          onChange={(v) => onMet(CUSTOM_INTENSITIES.find((c) => c.value === v)?.met ?? 4.5)}
          options={CUSTOM_INTENSITIES.map((c) => ({ value: c.value, label: c.label }))}
        />
        {description && <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">{description}</p>}
      </div>
    </>
  )
}

interface EnergyBlockProps {
  kcal: number
  computedFrom: { weightKg: number; met: number } | null
  weightKnown: boolean
  overrideOn: boolean
  onToggle: (on: boolean) => void
  override: number | undefined
  onOverride: (v: number | undefined) => void
  restKcal: number
  restDeducted: boolean
  onDeductRest: () => void
  energyUnit: 'kcal' | 'kJ'
}

function EnergyBlock({
  kcal,
  computedFrom,
  weightKnown,
  overrideOn,
  onToggle,
  override,
  onOverride,
  restKcal,
  restDeducted,
  onDeductRest,
  energyUnit,
}: EnergyBlockProps) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="rounded-3xl bg-mossa-soft p-4">
      <h3 id={headingId} className="eyebrow">
        Förbrukning utöver vila
      </h3>
      <p className="mt-1.5 text-[2rem] font-semibold leading-none text-ink" aria-live="polite">
        <EnergyValue kcal={kcal} display />
      </p>
      <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-2">
        {computedFrom
          ? `Beräknat på ${formatNumber(computedFrom.weightKg, 1)}\u00a0kg och ${formatNumber(computedFrom.met, 1)} MET, minus vilan.`
          : 'Ditt eget värde används.'}
        {!weightKnown && computedFrom && ' Vi räknar med 70\u00a0kg tills du loggar din vikt.'}
      </p>

      <Switch
        className="mt-4"
        checked={overrideOn}
        onChange={onToggle}
        label="Ange eget värde"
        description="T.ex. från klockan eller maskinen på gymmet"
      />

      {overrideOn && (
        <div className="mt-3 flex flex-col gap-2.5">
          <NumberField
            label="Egen förbrukning"
            labelHidden
            value={override}
            onChange={onOverride}
            suffix={energyUnit}
            step={10}
            min={0}
            max={energyUnit === 'kJ' ? 25000 : 6000}
            decimals={0}
            error={override === undefined ? 'Ange ett värde eller stäng av eget värde.' : undefined}
          />
          <p className="text-[0.8125rem] leading-relaxed text-ink-2">
            Klockor visar ofta total förbrukning, inklusive vilan. Lagom räknar bara det som kommer utöver vila – dra av ungefär{' '}
            {formatEnergy(restKcal, energyUnit)} för passets vila.
          </p>
          <div>
            <Button size="sm" variant="secondary" onClick={onDeductRest} disabled={restDeducted || override === undefined || restKcal <= 0}>
              {restDeducted ? 'Vilan är avdragen' : `Dra av vilan (−${formatEnergy(restKcal, energyUnit)})`}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
