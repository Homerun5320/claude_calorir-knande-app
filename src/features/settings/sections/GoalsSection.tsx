/**
 * Inställningar → Mål och makron: hur dagsmålet räknas fram, adaptiv förbrukning,
 * makrofördelning (förinställningar eller egen) och egna mål som skriver över de beräknade.
 */
import { useMemo, useState } from 'react'
import { Activity, EyeOff, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, EmptyState, NumberField, Slider, Switch, toast } from '../../../components/ui'
import { useEnergyUnit } from '../../../components/domain/EnergyValue'
import { useTargets } from '../../../hooks/useTargets'
import { useToday } from '../../../hooks/useToday'
import { addDays } from '../../../lib/dates'
import { totals } from '../../../lib/diary'
import { MACRO_PRESETS, MIN_KCAL, computeTargets, macroPercents } from '../../../lib/energy'
import { formatEnergy, formatNumber, parseSwedishNumber } from '../../../lib/format'
import { KJ_PER_KCAL } from '../../../lib/nutrients'
import { useBodyStore } from '../../../stores/bodyStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useProfileStore } from '../../../stores/profileStore'
import type { MacroPreset, Profile, Targets } from '../../../types'
import { Note } from '../../onboarding/AboutFields'
import { ChoiceCard, ChoiceGroup } from '../../onboarding/ChoiceCard'
import { MacroSplitBar } from '../../onboarding/MacroSplitBar'
import { TargetsSummary } from '../../onboarding/TargetsSummary'
import {
  MACRO_BOUNDS,
  MACRO_KEYS,
  MACRO_LABELS,
  OVERRIDE_FIELDS,
  macroGrams,
  nnrNote,
  normalizeMacroPct,
  overrideCount,
  rebalanceMacros,
  withOverride,
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
  const { targets, energy, weightKg } = useTargets(today)

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
        <TargetsSummary energy={energy} targets={targets} />
      </Card>
      <AdaptiveCard />
      <MacroCard profile={profile} kcal={targets.kcal} />
      <OverridesCard profile={profile} weightKg={weightKg} computedKcal={energy.kcal} />
    </div>
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
  const { adaptive, energy } = useTargets(today)
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
          description="Ställ in procenten själv – summan blir alltid 100 %."
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
              formatValue={(v) => `${formatNumber(v)} %`}
              hint={`≈ ${formatNumber(grams[k])} g per dag`}
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

function OverridesCard({ profile, weightKg, computedKcal }: { profile: Profile; weightKg: number; computedKcal: number }) {
  const overrides = useProfileStore((s) => s.settings.targetOverrides)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const { adaptive } = useTargets()
  const unit = useEnergyUnit()

  // Beräknade standardvärden: egna kcal påverkar makrona, men egna makron räknas inte in.
  const defaults = useMemo<Targets>(() => {
    const base = computeTargets(profile, weightKg, overrides.kcal !== undefined ? { kcal: overrides.kcal } : {}, { adaptiveTdee: adaptive?.tdee })
    return { ...base, kcal: computedKcal }
  }, [profile, weightKg, overrides.kcal, adaptive, computedKcal])

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
      <ul className="flex flex-col gap-4">
        {OVERRIDE_FIELDS.map((f) => (
          <li key={f.key}>
            <OverrideRow
              field={f}
              value={overrides[f.key]}
              computed={defaults[f.key]}
              onCommit={(v) => set(f.key, v)}
              unit={unit}
              floorKcal={MIN_KCAL[profile.sex]}
            />
          </li>
        ))}
      </ul>
    </Card>
  )
}

function OverrideRow({
  field,
  value,
  computed,
  onCommit,
  unit,
  floorKcal,
}: {
  field: OverrideField
  value: number | undefined
  computed: number
  onCommit: (v: number | undefined) => void
  unit: 'kcal' | 'kJ'
  floorKcal: number
}) {
  const energy = field.key === 'kcal'
  const kj = energy && unit === 'kJ'
  const factor = kj ? KJ_PER_KCAL : 1
  const min = energy ? floorKcal : field.min
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
    v = Math.min(field.max, Math.max(min, v))
    v = energy ? Math.round(v / 10) * 10 : Number(v.toFixed(field.decimals))
    onCommit(v)
    setLocal(toShown(v))
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
          ? `Beräknat: ${computedText}. Lägst ${formatEnergy(floorKcal, unit)} – så att kroppen får tillräckligt med näring.`
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
