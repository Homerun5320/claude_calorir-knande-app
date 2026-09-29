/**
 * Inställningar → Mål och makron: hur dagsmålet räknas fram, adaptiv förbrukning, veckobudget
 * (samma energi över veckan, fördelad t.ex. för fredagsmys), makrofördelning (förinställningar
 * eller egen), egna mål som skriver över de beräknade, veckans fokus (ett litet mål byggt på
 * kostråden) och kosttillskott med en daglig bock på Idag.
 */
import { useMemo, useState } from 'react'
import { Activity, CalendarRange, EyeOff, Pill, Plus, RotateCcw, SlidersHorizontal, Sprout, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  NumberField,
  SegmentedControl,
  Select,
  Sheet,
  Slider,
  StepButton,
  Stepper,
  Switch,
  cx,
  toast,
} from '../../../components/ui'
import { useEnergyUnit } from '../../../components/domain/EnergyValue'
import { useTargets } from '../../../hooks/useTargets'
import { useToday } from '../../../hooks/useToday'
import { WEEKDAYS, addDays, capitalize, weekdayIndex } from '../../../lib/dates'
import { totals } from '../../../lib/diary'
import { MACRO_PRESETS, kcalFloorReasonText, macroPercents, weeklyBudgetBlockReasonFor, type EnergyBreakdown } from '../../../lib/energy'
import { formatEnergy, formatNumber, parseSwedishNumber } from '../../../lib/format'
import {
  DEFAULT_EXTRA,
  SHIFT_STEP,
  WEEKLY_PRESETS,
  WEEKLY_PRESET_IDS,
  ZERO_SHIFT,
  adjustDay,
  canAdjustDay,
  detectPreset,
  maxPresetExtra,
  minShiftFor,
  normalizeShift,
  presetShift,
  weeklyPlan,
  type FixedPresetId,
  type WeeklyPresetId,
} from '../../../lib/weeklyBudget'
import { KJ_PER_KCAL, NUTRIENTS, type NutrientKey } from '../../../lib/nutrients'
import { FOCUS_GOALS, focusGoal, focusSince } from '../../../lib/focusGoals'
import {
  SUPPLEMENT_LIMIT_NOTE,
  SUPPLEMENT_TEMPLATES,
  isSupplementFood,
  nutrientListText,
  overUpperLimit,
  supplementAmounts,
  supplementFood,
  supplementName,
  supplementTemplate,
  type SupplementTemplate,
  type SupplementTemplateId,
} from '../../../data/supplements'
import { useBodyStore } from '../../../stores/bodyStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useFoodStore } from '../../../stores/foodStore'
import { useProfileStore } from '../../../stores/profileStore'
import type { ISODate, MacroPreset, Profile, Targets, WeeklyBudgetSettings } from '../../../types'
import { requireAccess } from '../../premium/requireAccess'
import { Note } from '../../onboarding/AboutFields'
import { ChoiceCard, ChoiceGroup } from '../../onboarding/ChoiceCard'
import { MacroSplitBar } from '../../onboarding/MacroSplitBar'
import { TargetsSummary } from '../../onboarding/TargetsSummary'
import {
  MACRO_BOUNDS,
  MACRO_KEYS,
  MACRO_LABELS,
  OVERRIDE_FIELDS,
  clampKcalOverride,
  computedDefaults,
  kcalFloorText,
  kcalOverrideFloor,
  macroEnergyMismatch,
  macroGrams,
  nnrNote,
  normalizeMacroPct,
  overrideCount,
  rebalanceMacros,
  withOverride,
  type KcalFloor,
  type MacroKey,
  type MacroPct,
  type OverrideField,
} from '../settingsLogic'

type PresetKey = Exclude<MacroPreset, 'anpassad'>
const MACRO_TONE = { protein: 'protein', carbs: 'carbs', fat: 'fat' } as const

export function GoalsSection() {
  const profile = useProfileStore((s) => s.profile)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const today = useToday()
  // Basmålen: dagsmålet utan veckobudget (veckans snittdag).
  const { baseTargets: targets, energy, weightKg, weeklyPlan: plan } = useTargets(today)

  if (!profile || !energy || weightKg === null) {
    return (
      <EmptyState
        illustration="chart"
        title="Inga mål ännu"
        text="Fyll i din profil så räknar Lagom fram mål som passar dig."
        action={<Button to="/installningar/profil">Till profilen</Button>}
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {mindful && (
        <Note icon={EyeOff}>
          Medvetet läge är på. Målen används i bakgrunden men siffrorna visas inte i översikten – du kan ändra det under Utseende.
        </Note>
      )}
      <Card eyebrow="Energi" title="Så räknas ditt dagsmål">
        <TargetsSummary
          energy={energy}
          targets={targets}
          extraNotes={plan ? ['Med veckobudgeten varierar dagsmålet mellan veckodagarna – veckans summa är densamma. Se Veckobudget nedan.'] : []}
        />
      </Card>
      <AdaptiveCard />
      <WeeklyBudgetCard profile={profile} energy={energy} baseKcal={targets.kcal} mindful={mindful} />
      <MacroCard profile={profile} kcal={targets.kcal} />
      <OverridesCard profile={profile} weightKg={weightKg} energy={energy} targets={targets} />
      <WeeklyFocusCard />
      <SupplementsSettingsCard />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Veckans fokus
// ---------------------------------------------------------------------------

const NO_FOCUS = 'inget'

function WeeklyFocusCard() {
  const today = useToday()
  const focusId = useProfileStore((s) => s.settings.weeklyFocus?.id)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const current = focusGoal(focusId)
  const options = useMemo(
    () => [{ value: NO_FOCUS, label: 'Inget fokus' }, ...FOCUS_GOALS.map((g) => ({ value: g.id as string, label: `${g.emoji} ${g.title}` }))],
    [],
  )

  const choose = (value: string) => {
    if (value === NO_FOCUS) updateSettings({ weeklyFocus: undefined })
    // Fokuset gäller från veckans måndag, så att hela veckan räknas.
    else updateSettings({ weeklyFocus: { id: value, since: focusSince(today) } })
  }

  return (
    <Card eyebrow="Kostråden" title="Veckans fokus" action={<Sprout aria-hidden className="size-5 text-mossa" />}>
      <p className="-mt-1 mb-3 text-[0.875rem] leading-relaxed text-ink-2">
        Välj ett litet mål för veckan, byggt på Livsmedelsverkets kostråd. Det visas på Idag, och på söndagen får du en kort
        summering. Byt när du vill – det finns inget att tappa.
      </p>
      <Select label="Veckans fokus" value={current ? current.id : NO_FOCUS} onChange={choose} options={options} />
      {current && <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">{current.description}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Kosttillskott
// ---------------------------------------------------------------------------

function SupplementsSettingsCard() {
  const customFoods = useFoodStore((s) => s.customFoods)
  const [open, setOpen] = useState(false)
  const supplements = useMemo(
    () => Object.values(customFoods).filter(isSupplementFood).sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [customFoods],
  )

  const remove = (id: string) => {
    const food = useFoodStore.getState().customFoods[id]
    if (!food) return
    useFoodStore.getState().removeCustomFood(id)
    toast(`${food.name} är borttaget`, {
      action: { label: 'Ångra', onClick: () => useFoodStore.getState().addCustomFood(food) },
    })
  }

  return (
    <Card eyebrow="Idag" title="Kosttillskott" action={<Pill aria-hidden className="size-5 text-ink-3" />}>
      <p className="-mt-1 mb-3 text-[0.875rem] leading-relaxed text-ink-2">
        Lägg till de tillskott du tar, så får du en bock per tillskott på Idag. Det du redan loggat finns kvar i dagboken om du tar bort ett
        tillskott här.
      </p>
      {supplements.length > 0 && (
        <ul className="mb-3 flex flex-col divide-y divide-line" aria-label="Dina kosttillskott">
          {supplements.map((f) => (
            <li key={f.id} className="flex min-h-12 items-center gap-3 py-1">
              <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-ink">{f.name}</span>
              <IconButton icon={Trash2} size="sm" variant="ghost" aria-label={`Ta bort ${f.name}`} onClick={() => remove(f.id)} />
            </li>
          ))}
        </ul>
      )}
      <Button variant="soft" iconLeft={Plus} onClick={() => setOpen(true)}>
        Lägg till kosttillskott
      </Button>
      <AddSupplementSheet open={open} onClose={() => setOpen(false)} />
    </Card>
  )
}

type Strengths = Partial<Record<NutrientKey, number | undefined>>

function defaultStrengths(template: SupplementTemplate): Strengths {
  const out: Strengths = {}
  for (const n of template.nutrients) out[n.key] = n.amount
  return out
}

/** Arket där man väljer mall och styrka. Värdena sparas som ett eget livsmedel i kategorin 'kosttillskott'. */
function AddSupplementSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [templateId, setTemplateId] = useState<SupplementTemplateId>('d-vitamin')
  const template = supplementTemplate(templateId) ?? SUPPLEMENT_TEMPLATES[0]
  const [strengths, setStrengths] = useState<Strengths>(() => defaultStrengths(template))
  const options = useMemo(() => SUPPLEMENT_TEMPLATES.map((t) => ({ value: t.id, label: `${t.emoji} ${t.name}` })), [])

  const chooseTemplate = (id: SupplementTemplateId) => {
    const next = supplementTemplate(id)
    if (!next) return
    setTemplateId(id)
    setStrengths(defaultStrengths(next))
  }

  const cleanStrengths = useMemo(() => {
    const out: Partial<Record<NutrientKey, number>> = {}
    for (const [k, v] of Object.entries(strengths) as Array<[NutrientKey, number | undefined]>) if (v !== undefined) out[k] = v
    return out
  }, [strengths])
  const amounts = useMemo(() => supplementAmounts(template, cleanStrengths), [template, cleanStrengths])
  const over = overUpperLimit(amounts)
  const missing = template.nutrients.some((n) => !(strengths[n.key] !== undefined && (strengths[n.key] as number) >= 0))
  const primary = template.nutrients[0]
  const name = supplementName(template, cleanStrengths)
  // Samma tillskott med samma styrka finns redan – annars blir det två likadana bockar på Idag.
  const customFoods = useFoodStore((s) => s.customFoods)
  const duplicate = useMemo(() => {
    const wanted = name.toLocaleLowerCase('sv-SE')
    return Object.values(customFoods).some((f) => isSupplementFood(f) && f.name.toLocaleLowerCase('sv-SE') === wanted)
  }, [customFoods, name])

  const save = () => {
    if (missing || duplicate || !requireAccess('livsmedel')) return
    const food = supplementFood(template, cleanStrengths)
    useFoodStore.getState().addCustomFood(food)
    toast(`${food.name} är tillagt – bocka av det på Idag`, {
      tone: 'success',
      action: { label: 'Ångra', onClick: () => useFoodStore.getState().removeCustomFood(food.id) },
    })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lägg till kosttillskott"
      description="Välj tillskott och ange styrkan från din förpackning."
      width="sm"
      footer={
        <Button fullWidth size="lg" iconLeft={Plus} onClick={save} disabled={missing || duplicate}>
          Lägg till {name}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Select<SupplementTemplateId> label="Tillskott" value={templateId} onChange={chooseTemplate} options={options} />
        <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2">{template.note}</p>
        {template.nutrients.map((n) => {
          const meta = NUTRIENTS[n.key]
          return (
            <NumberField
              key={`${template.id}-${n.key}`}
              label={`${meta.name} per ${template.portionLabel.replace(/^1 /, '')}`}
              value={strengths[n.key]}
              onChange={(v) => setStrengths((prev) => ({ ...prev, [n.key]: v }))}
              min={0}
              step={meta.unit === 'g' ? 0.05 : 1}
              decimals={meta.unit === 'g' ? 2 : 1}
              suffix={meta.unit}
              error={strengths[n.key] === undefined ? 'Ange mängden – står på förpackningen.' : undefined}
            />
          )
        })}
        {template.presets && template.presets.length > 1 && (
          <div role="group" aria-label="Vanliga styrkor" className="-mt-2 flex flex-wrap gap-2">
            {template.presets.map((v) => (
              <Chip key={v} size="sm" selected={strengths[primary.key] === v} onClick={() => setStrengths((prev) => ({ ...prev, [primary.key]: v }))}>
                {formatNumber(v, 2)} {NUTRIENTS[primary.key].unit}
              </Chip>
            ))}
          </div>
        )}
        {duplicate && (
          <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2" role="status">
            Du har redan {name}. Välj ett annat tillskott eller en annan styrka.
          </p>
        )}
        {over.length > 0 && (
          <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2" role="note">
            Styrkan är högre än den övre gränsen i NNR för {nutrientListText(over)}.{' '}
            {SUPPLEMENT_LIMIT_NOTE}
          </p>
        )}
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// Adaptiv förbrukning
// ---------------------------------------------------------------------------

function AdaptiveCard() {
  const today = useToday()
  const adaptiveOn = useProfileStore((s) => s.settings.adaptiveTargets)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const entries = useDiaryStore((s) => s.entries)
  const weights = useBodyStore((s) => s.weights)
  const { adaptive, energy, adaptiveBlocked } = useTargets(today)
  const fmt = useEnergyUnit()

  // Underlag de senaste 28 dagarna (samma regler som lib/energy).
  const basis = useMemo(() => {
    const start = addDays(today, -27)
    const end = addDays(today, -1)
    let logged = 0
    for (const [d, list] of Object.entries(entries)) {
      if (d >= start && d <= end && (totals(list).kcal ?? 0) >= 800) logged++
    }
    const weighIns = weights.filter((w) => w.date >= start && w.date <= today).length
    return { logged, weighIns }
  }, [entries, weights, today])

  // Graviditet, amning och under 18 år: vikten ändras av naturliga skäl – formeln gäller.
  if (adaptiveBlocked) {
    return (
      <Card eyebrow="Smartare mål" title="Adaptiv energiförbrukning">
        <Switch
          label="Räkna förbrukningen ur min vikttrend"
          description="Inte tillgängligt just nu – dagsmålet räknas från formeln utifrån din profil."
          checked={false}
          disabled
        />
        <p className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-[0.875rem] leading-relaxed text-ink-2">{adaptiveBlocked}</p>
      </Card>
    )
  }

  return (
    <Card eyebrow="Smartare mål" title="Adaptiv energiförbrukning">
      <Switch
        label="Räkna förbrukningen ur min vikttrend"
        description="Lagom jämför vad du ätit med hur din trendvikt ändrats och justerar förbrukningen efter din kropp – i stället för en formel."
        checked={adaptiveOn}
        onChange={(adaptiveTargets) => updateSettings({ adaptiveTargets })}
      />
      {adaptiveOn && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-[0.875rem] leading-relaxed text-ink-2">
          {adaptive ? (
            <>
              <div className="mb-1 flex items-center gap-2">
                <Activity aria-hidden className="size-4 text-gran" />
                <span className="font-semibold text-ink">Din förbrukning: {formatEnergy(adaptive.tdee, fmt)} per dag</span>
                <Badge tone={adaptive.confidence === 'hög' ? 'good' : adaptive.confidence === 'medel' ? 'fjall' : 'neutral'}>{adaptive.confidence} säkerhet</Badge>
              </div>
              Baserat på {adaptive.loggedDays} loggade dagar och {adaptive.weighIns} vägningar. Formeln skulle ge{' '}
              {energy ? formatEnergy(Math.round(energy.bmr * energy.pal), fmt) : '–'}.
            </>
          ) : (
            <>
              Samlar underlag: <strong className="font-semibold text-ink">{basis.logged} av 14</strong> loggade dagar och{' '}
              <strong className="font-semibold text-ink">{basis.weighIns} av 4</strong> vägningar de senaste fyra veckorna (vägningarna behöver
              spänna över minst två veckor). Tills dess används formeln.
            </>
          )}
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Veckobudget
// ---------------------------------------------------------------------------

/** "+300 kcal", "−120 kcal" – förskjutningen med tecken (typografiskt minus). */
function signedEnergy(kcal: number, unit: 'kcal' | 'kJ'): string {
  if (kcal === 0) return 'Som vanligt'
  return `${kcal > 0 ? '+' : '−'}${formatEnergy(Math.abs(kcal), unit)}`
}

/**
 * Veckobudget: samma energi över veckan, fördelad så som livet ser ut. Förvalen och "Egen" kan
 * aldrig ge en dag under golvet (`kcalOverrideFloor`), och vid graviditet, amning och under 18 år
 * används ingen veckobudget alls – det förklaras vänligt i stället.
 *
 * Medvetet läge: inga siffror – bara reglaget och förvalen (Fredagsmys och Helg med den extra som
 * redan är vald). Tabellen, stegen och summorna visas när medvetet läge är av.
 */
function WeeklyBudgetCard({ profile, energy, baseKcal, mindful }: { profile: Profile; energy: EnergyBreakdown; baseKcal: number; mindful: boolean }) {
  const today = useToday()
  const unit = useEnergyUnit()
  const setting = useProfileStore((s) => s.settings.weeklyBudget)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const blocked = weeklyBudgetBlockReasonFor(profile, today)
  const floor = kcalOverrideFloor(profile, energy, today)
  const minShift = minShiftFor(baseKcal, floor.kcal)
  const saved = setting?.shift
  const shift = useMemo(() => normalizeShift(saved), [saved])
  const plan = useMemo(() => weeklyPlan(baseKcal, floor.kcal, shift), [baseKcal, floor.kcal, shift])
  const detected = useMemo(() => detectPreset(shift), [shift])
  // Förvalet sparas inte – det läses ut ur fördelningen. "Egen" gäller tills man väljer ett förval.
  const [chosen, setChosen] = useState<WeeklyPresetId | null>(null)
  const preset: WeeklyPresetId = chosen ?? detected.id
  const enabled = setting?.enabled === true
  const todayIndex = weekdayIndex(today)
  const noRoom = minShift === 0

  // `since`: dagen veckobudgeten slogs på – dagar före den behåller det jämna dagsmålet (lib/weeklyBudget).
  const write = (next: number[], on: boolean, since: ISODate | undefined) => {
    const value: WeeklyBudgetSettings = { enabled: on, shift: next }
    if (since) value.since = since
    updateSettings({ weeklyBudget: value })
  }
  /** En ny fördelning medan veckobudgeten är på – den gäller från dagen den slogs på. */
  const save = (next: number[]) => write(next, true, setting?.since ?? today)

  const toggle = (on: boolean) => {
    if (!on) {
      write(shift, false, setting?.since)
      return
    }
    // Börja från den sparade fördelningen (anpassad till golvet) – annars Fredagsmys. Gäller från idag.
    const current = normalizeShift(saved, minShift)
    const keep = current.some((v) => v !== 0)
    setChosen(keep ? null : 'fredagsmys')
    write(keep ? current : presetShift('fredagsmys', DEFAULT_EXTRA, minShift), true, today)
  }

  const choosePreset = (id: WeeklyPresetId) => {
    setChosen(id)
    if (id === 'egen') return
    const extra = detected.id !== 'egen' && detected.extra > 0 ? detected.extra : DEFAULT_EXTRA
    save(presetShift(id, extra, minShift))
  }

  const extra = preset !== 'egen' && detected.id === preset ? detected.extra : 0
  const maxExtra = preset !== 'egen' ? maxPresetExtra(preset as FixedPresetId, minShift) : 0

  if (blocked) {
    return (
      <Card eyebrow="Veckan" title="Veckobudget" action={<CalendarRange aria-hidden className="size-5 text-ink-3" />}>
        <Switch label="Veckobudget" description="Inte tillgängligt just nu – dagsmålet är detsamma alla dagar." checked={false} disabled />
        <p className="mt-3 rounded-2xl bg-surface-2 p-3.5 text-[0.875rem] leading-relaxed text-ink-2">{blocked}</p>
      </Card>
    )
  }

  return (
    <Card eyebrow="Veckan" title="Veckobudget" action={<CalendarRange aria-hidden className="size-5 text-gran" />}>
      <p className="-mt-1 mb-3 text-[0.875rem] leading-relaxed text-ink-2">
        Samma energi över veckan – bara fördelad så som ditt liv ser ut. Lite mer till fredagsmyset eller helgen, lite mindre de andra dagarna.
      </p>
      <Switch
        label="Veckobudget"
        description="Flytta energi mellan veckans dagar. Protein och fibrer är desamma varje dag."
        checked={enabled}
        onChange={toggle}
      />
      {enabled && (
        <div className="mt-4 flex flex-col gap-4">
          <SegmentedControl<WeeklyPresetId>
            aria-label="Fördelning"
            fullWidth
            value={preset}
            onChange={choosePreset}
            options={WEEKLY_PRESET_IDS.map((id) => ({ value: id, label: WEEKLY_PRESETS[id].label }))}
          />
          {mindful ? (
            <p className="-mt-2 rounded-2xl bg-surface-2 p-3.5 text-[0.875rem] leading-relaxed text-ink-2">
              {preset === 'egen'
                ? 'Din egen fördelning gäller som du har valt den. Siffrorna vilar i medvetet läge – stäng av det under Utseende om du vill ändra dagarna.'
                : `${WEEKLY_PRESETS[preset].description} Siffrorna vilar i medvetet läge – dagsmålet fördelas som du har valt, utan att du behöver tänka på det.`}
            </p>
          ) : (
            <>
              <p className="-mt-2 text-[0.8125rem] leading-relaxed text-ink-3">{WEEKLY_PRESETS[preset].description}</p>

              {noRoom && (
                <Note>
                  Just nu finns inget utrymme att flytta energi från de andra dagarna: ditt dagsmål ligger redan på det lägsta Lagom rekommenderar
                  för dig ({formatEnergy(floor.kcal, unit)}) – {kcalFloorReasonText(floor.reason)}
                </Note>
              )}

              {preset !== 'egen' && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[0.9375rem] font-medium text-ink">Extra per dag</span>
                  <Stepper
                    label="Extra per dag"
                    value={Math.min(extra, maxExtra)}
                    onChange={(v) => {
                      // Håll kvar förvalet även när extra blir 0 (då ser fördelningen ut som en jämn vecka).
                      setChosen(preset)
                      save(presetShift(preset as FixedPresetId, v, minShift))
                    }}
                    min={0}
                    max={maxExtra}
                    step={SHIFT_STEP}
                    format={(v) => `+${formatEnergy(v, unit)}`}
                    disabled={maxExtra === 0}
                    size="sm"
                  />
                </div>
              )}

              <WeekTable
                plan={plan}
                unit={unit}
                todayIndex={todayIndex}
                editable={preset === 'egen'}
                canStep={(i, dir) => canAdjustDay(shift, i, dir * SHIFT_STEP, minShift)}
                onStep={(i, dir) => save(adjustDay(shift, i, dir * SHIFT_STEP, minShift))}
              />

              <p className="text-[0.875rem] leading-relaxed text-ink-2">
                Veckans summa: <strong className="font-semibold text-ink tabular-nums">{formatEnergy(plan.weekKcal, unit)}</strong>
                {plan.clamped ? ' – lite mer än med ett jämnt dagsmål, eftersom ingen dag går under golvet.' : ` – samma som sju dagar à ${formatEnergy(baseKcal, unit)}.`}
              </p>

              {plan.clamped && (
                <Note>
                  Fördelningen gjordes när ditt dagsmål var ett annat. Ingen dag går under {formatEnergy(floor.kcal, unit)}, så de lättare dagarna har höjts
                  en aning.
                  <div className="mt-2">
                    <Button size="sm" variant="soft" onClick={() => save(normalizeShift(shift, minShift))}>
                      Anpassa fördelningen
                    </Button>
                  </div>
                </Note>
              )}

              {preset === 'egen' && shift.some((v) => v !== 0) && (
                <div>
                  <Button size="sm" variant="ghost" iconLeft={RotateCcw} onClick={() => save([...ZERO_SHIFT])}>
                    Jämn vecka
                  </Button>
                </div>
              )}

              <p className="text-[0.8125rem] leading-relaxed text-ink-3">
                Ingen dag går under {formatEnergy(floor.kcal, unit)} – {kcalFloorReasonText(floor.reason)} Träning läggs till som vanligt på den dag du
                tränar. Det jämnar ut sig över veckan – och en dag över är helt okej.
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function WeekTable({
  plan,
  unit,
  todayIndex,
  editable,
  canStep,
  onStep,
}: {
  plan: ReturnType<typeof weeklyPlan>
  unit: 'kcal' | 'kJ'
  todayIndex: number
  editable: boolean
  canStep: (index: number, dir: 1 | -1) => boolean
  onStep: (index: number, dir: 1 | -1) => void
}) {
  return (
    <table className="w-full border-collapse text-left text-[0.875rem]">
      <caption className="sr-only">Dagsmål per veckodag med veckobudgeten</caption>
      <thead>
        <tr className="text-[0.75rem] text-ink-3">
          <th scope="col" className="pb-1.5 font-medium">
            Dag
          </th>
          <th scope="col" className={cx('pb-1.5 font-medium', editable ? 'text-center' : 'text-right')}>
            Ändring
          </th>
          <th scope="col" className="pb-1.5 text-right font-medium">
            Dagsmål
          </th>
        </tr>
      </thead>
      <tbody>
        {WEEKDAYS.map((name, i) => {
          const s = plan.applied[i]
          const isToday = i === todayIndex
          const day = capitalize(name)
          return (
            <tr key={name} className={cx('border-t border-line/70', isToday && 'bg-gran-soft/60')}>
              <th scope="row" className={cx('py-1.5 pl-1 font-medium', isToday ? 'text-gran' : 'text-ink')}>
                {day}
                {isToday && <span className="sr-only"> (idag)</span>}
              </th>
              <td className={cx('py-1 tabular-nums', editable ? 'text-center' : 'text-right', s === 0 ? 'text-ink-3' : 'text-ink-2')}>
                {editable ? (
                  <span className="inline-flex items-center gap-1">
                    <StepButton direction={-1} size="sm" variant="plain" label={`Mindre energi på ${name}`} disabled={!canStep(i, -1)} onStep={() => onStep(i, -1)} />
                    <span className="min-w-[4.75rem] text-center">{signedEnergy(s, unit)}</span>
                    <StepButton direction={1} size="sm" variant="plain" label={`Mer energi på ${name}`} disabled={!canStep(i, 1)} onStep={() => onStep(i, 1)} />
                  </span>
                ) : (
                  signedEnergy(s, unit)
                )}
              </td>
              <td className="py-1.5 pr-1 text-right font-semibold tabular-nums text-ink">{formatEnergy(plan.dayKcal[i], unit)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Makrofördelning
// ---------------------------------------------------------------------------

function MacroCard({ profile, kcal }: { profile: Profile; kcal: number }) {
  const updateProfile = useProfileStore((s) => s.updateProfile)
  const custom = profile.macroPreset === 'anpassad'
  const pct: MacroPct = custom ? normalizeMacroPct(profile.customMacroPct) : macroPercents(profile)
  const grams = macroGrams(kcal, pct)
  const note = nnrNote(pct)

  const choose = (preset: MacroPreset) => {
    if (preset === 'anpassad') {
      // Börja från den fördelning man har nu.
      updateProfile({ macroPreset: 'anpassad', customMacroPct: normalizeMacroPct(profile.customMacroPct ?? macroPercents(profile)) })
    } else {
      updateProfile({ macroPreset: preset })
    }
  }

  const setMacro = (key: MacroKey, value: number) => updateProfile({ customMacroPct: rebalanceMacros(pct, key, value) })

  return (
    <Card eyebrow="Makron" title="Makrofördelning">
      <p className="-mt-1 mb-3 text-[0.875rem] leading-relaxed text-ink-2">Hur dagens energi fördelas mellan protein, kolhydrater och fett.</p>
      <ChoiceGroup label="Makrofördelning">
        {(Object.keys(MACRO_PRESETS) as PresetKey[]).map((key) => {
          const p = MACRO_PRESETS[key]
          return (
            <ChoiceCard
              key={key}
              name="makrofordelning"
              value={key}
              checked={profile.macroPreset === key}
              onSelect={() => choose(key)}
              title={p.label}
              description={
                <>
                  <span className="block">{p.description}</span>
                  <MacroSplitBar split={p} className="mt-2 max-w-60" />
                </>
              }
              compact
            />
          )
        })}
        <ChoiceCard
          name="makrofordelning"
          value="anpassad"
          checked={custom}
          onSelect={() => choose('anpassad')}
          title="Egen fördelning"
          description="Ställ in procenten själv – summan blir alltid 100 %."
          icon={SlidersHorizontal}
          compact
        />
      </ChoiceGroup>

      {custom && (
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-surface-2 p-4">
          {MACRO_KEYS.map((k) => (
            <Slider
              key={k}
              label={MACRO_LABELS[k]}
              value={pct[k]}
              onChange={(v) => setMacro(k, v)}
              min={MACRO_BOUNDS[k][0]}
              max={MACRO_BOUNDS[k][1]}
              step={1}
              tone={MACRO_TONE[k]}
              showValue
              formatValue={(v) => `${formatNumber(v)}\u00a0%`}
              hint={`≈ ${formatNumber(grams[k])}\u00a0g per dag`}
            />
          ))}
          <MacroSplitBar split={pct} showLegend />
        </div>
      )}
      {note && <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">{note}</p>}
      <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
        Protein sätts alltid minst till NNR:s rekommendation för din vikt (0,83 g/kg, 1,2 g/kg från 65 år).
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Egna mål
// ---------------------------------------------------------------------------

function OverridesCard({ profile, weightKg, energy, targets }: { profile: Profile; weightKg: number; energy: EnergyBreakdown; targets: Targets }) {
  const overrides = useProfileStore((s) => s.settings.targetOverrides)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const today = useToday()
  const { adaptive, trendKg } = useTargets(today)
  const unit = useEnergyUnit()
  const floor = kcalOverrideFloor(profile, energy, today)
  // Ett eget energimål från förr (t.ex. innan graviditet eller byte av kön) kan ligga under golvet.
  // Dagsmålen använder då golvet i stället (computeTargets), och här föreslås att höja det sparade värdet.
  const tooLow = overrides.kcal !== undefined && overrides.kcal < floor.kcal
  // Med egna makron tar kolhydraterna resten av energin; det kan bara slå fel när kolhydraterna
  // själva är egna eller när protein och fett tillsammans redan överstiger dagsmålet.
  const mismatch = macroEnergyMismatch(targets)

  // Platshållare: värdet varje fält skulle få om det lämnades tomt – med alla andra egna mål
  // inräknade (samma regler som dagsmålen).
  const defaults = useMemo<Targets>(
    () => computedDefaults(profile, weightKg, overrides, { today, adaptiveTdee: adaptive?.tdee, trendKg: trendKg ?? undefined }),
    [profile, weightKg, overrides, today, adaptive, trendKg],
  )

  const set = (key: keyof Targets, value: number | undefined) => updateSettings({ targetOverrides: withOverride(overrides, key, value) })
  const count = overrideCount(overrides)

  return (
    <Card
      eyebrow="Finjustera"
      title="Egna mål"
      action={
        count > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={RotateCcw}
            onClick={() => {
              const prev = overrides
              updateSettings({ targetOverrides: {} })
              toast('Alla mål är beräknade igen', { action: { label: 'Ångra', onClick: () => updateSettings({ targetOverrides: prev }) } })
            }}
          >
            Återställ alla
          </Button>
        ) : undefined
      }
    >
      <p className="-mt-1 mb-4 text-[0.875rem] leading-relaxed text-ink-2">
        Lämna fältet tomt för att använda Lagoms beräkning. Egna värden gäller tills du återställer dem.
      </p>
      {tooLow && (
        <div className="mb-4">
          <Note>
            Ditt eget energimål ({formatEnergy(overrides.kcal, unit)}) är lägre än vad Lagom rekommenderar för dig nu, så dagsmålet är{' '}
            {formatEnergy(floor.kcal, unit)} tills vidare. {kcalFloorText(floor, unit)}
            <div className="mt-2">
              <Button size="sm" variant="soft" onClick={() => updateSettings({ targetOverrides: clampKcalOverride(overrides, floor.kcal) })}>
                Höj till {formatEnergy(floor.kcal, unit)}
              </Button>
            </div>
          </Note>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {OVERRIDE_FIELDS.map((f) => (
          <li key={f.key}>
            <OverrideRow field={f} value={overrides[f.key]} computed={defaults[f.key]} onCommit={(v) => set(f.key, v)} unit={unit} floor={floor} />
          </li>
        ))}
      </ul>
      {mismatch && (
        <p className="mt-4 rounded-2xl bg-surface-2 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2" role="note">
          Makromålen motsvarar tillsammans {formatEnergy(mismatch.macroKcal, unit)} – {formatEnergy(Math.abs(mismatch.diff), unit)}{' '}
          {mismatch.diff > 0 ? 'mer' : 'mindre'} än dagsmålet på {formatEnergy(targets.kcal, unit)}.{' '}
          {overrides.carbsG !== undefined
            ? 'Lämna gärna kolhydraterna tomma, så får de det som blir kvar av energin.'
            : 'Protein och fett tar redan hela dagsmålet – sänk gärna något av dem.'}
        </p>
      )}
    </Card>
  )
}

function OverrideRow({
  field,
  value,
  computed,
  onCommit,
  unit,
  floor,
}: {
  field: OverrideField
  value: number | undefined
  computed: number
  onCommit: (v: number | undefined) => void
  unit: 'kcal' | 'kJ'
  floor: KcalFloor
}) {
  const energy = field.key === 'kcal'
  const kj = energy && unit === 'kJ'
  const factor = kj ? KJ_PER_KCAL : 1
  const min = energy ? floor.kcal : field.min
  const toShown = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * factor))
  const [local, setLocal] = useState<number | undefined>(() => toShown(value))
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setLocal(toShown(value))
  }

  const commit = (raw: string) => {
    const parsed = raw.trim() === '' ? Number.NaN : parseSwedishNumber(raw)
    if (Number.isNaN(parsed)) {
      if (raw.trim() === '') onCommit(undefined)
      return
    }
    let v = parsed / factor
    // Ett för lågt energimål höjs till golvet – och det sägs tydligt, inte bara i tysthet.
    const raised = energy && v < min
    v = Math.min(field.max, Math.max(min, v))
    v = energy ? Math.round(v / 10) * 10 : Number(v.toFixed(field.decimals))
    onCommit(v)
    setLocal(toShown(v))
    if (raised) toast(`Energimålet är höjt till ${formatEnergy(v, unit)} – det lägsta Lagom rekommenderar för dig just nu.`)
  }

  const shownUnit = energy ? unit : field.unit
  const computedText = energy ? formatEnergy(computed, unit) : `${formatNumber(computed, field.decimals)} ${field.unit}`
  const set = value !== undefined

  return (
    <NumberField
      label={field.label}
      value={local}
      onChange={setLocal}
      onBlur={(e) => commit(e.currentTarget.value)}
      placeholder={energy ? formatNumber(Math.round(computed * factor)) : formatNumber(computed, field.decimals)}
      suffix={shownUnit}
      step={kj ? 50 : field.step}
      decimals={field.decimals}
      hint={
        energy
          ? `Beräknat: ${computedText}. ${kcalFloorText(floor, unit)}`
          : `Beräknat: ${computedText}${field.hint ? ` · ${field.hint}` : ''}`
      }
      labelAction={
        set ? (
          <button
            type="button"
            onClick={() => onCommit(undefined)}
            aria-label={`Återställ ${field.label.toLocaleLowerCase('sv-SE')} till beräknat värde`}
            className="-my-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-[0.8125rem] font-semibold text-gran hover:underline"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Återställ
          </button>
        ) : (
          <span className="text-[0.75rem] text-ink-3">Beräknat</span>
        )
      }
    />
  )
}
