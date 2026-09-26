/**
 * Inställningar → Profil. Samma fält och validering som välkomstflödet. Målen räknas om
 * direkt medan man ändrar, och sparas först när man trycker Spara.
 */
import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CalendarHeart, Check, UserRound } from 'lucide-react'
import { Button, Card, EmptyState, NumberField, SegmentedControl, Select, toast } from '../../../components/ui'
import { useTargets } from '../../../hooks/useTargets'
import { useToday } from '../../../hooks/useToday'
import { computeEnergy, computeTargets } from '../../../lib/energy'
import { formatNumber } from '../../../lib/format'
import { useBodyStore } from '../../../stores/bodyStore'
import { useProfileStore } from '../../../stores/profileStore'
import { ACTIVITY_LEVELS, type ActivityLevel, type DietType, type GoalType, type Profile } from '../../../types'
import { AboutFields, Note } from '../../onboarding/AboutFields'
import { TargetsSummary } from '../../onboarding/TargetsSummary'
import {
  DIET_OPTIONS,
  buildProfile,
  clampRate,
  describeProjection,
  draftFromProfile,
  effectiveGoal,
  hasErrors,
  isDraftComplete,
  lossBlockReason,
  projectedGoalDate,
  rateOptions,
  validateAbout,
  validateTarget,
  type ProfileDraft,
  type ProfileField,
} from '../../onboarding/profileLogic'

const GOAL_OPTIONS: ReadonlyArray<{ value: GoalType; label: string }> = [
  { value: 'ga_ner', label: 'Gå ner' },
  { value: 'behalla', label: 'Behålla' },
  { value: 'ga_upp', label: 'Gå upp' },
]

export function ProfileSection() {
  const profile = useProfileStore((s) => s.profile)
  const { weightKg } = useTargets()
  if (!profile) {
    return (
      <EmptyState
        illustration="forest"
        title="Ingen profil ännu"
        text="Svara på några snabba frågor så räknar Lagom fram dina mål."
        action={<Button to="/valkommen">Kom igång</Button>}
      />
    )
  }
  // Nyckeln gör att formuläret börjar om när profilen ändras utifrån (t.ex. efter import).
  return <ProfileForm key={profile.createdAt} profile={profile} currentWeight={weightKg ?? profile.startWeightKg} />
}

function ProfileForm({ profile, currentWeight }: { profile: Profile; currentWeight: number }) {
  const today = useToday()
  const reduce = useReducedMotion()
  const setProfile = useProfileStore((s) => s.setProfile)
  const overrides = useProfileStore((s) => s.settings.targetOverrides)
  const logWeight = useBodyStore((s) => s.logWeight)
  const { adaptive } = useTargets(today)
  const goalLabelId = useId()
  const rateLabelId = useId()

  const initial = useMemo(() => draftFromProfile(profile, currentWeight), [profile, currentWeight])
  const [draft, setDraft] = useState<ProfileDraft>(initial)
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({})
  const [attempted, setAttempted] = useState(false)

  const change = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const errors = validateAbout(draft, today)
  const targetError = validateTarget(draft, today)
  const visible = attempted ? { sex: true, birthYear: true, heightCm: true, weightKg: true } : touched
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const complete = isDraftComplete(draft, today)

  const goal = effectiveGoal(draft, today)
  const wanted = draft.goalChoice
  const options = rateOptions(draft.weightKg, goal)
  const rate = clampRate(draft.weeklyRateKg, draft.weightKg, goal)
  const projection = projectedGoalDate(draft, today)

  // Förhandsvisning av målen med de ändrade uppgifterna.
  const preview = useMemo(() => {
    if (!complete) return null
    try {
      const p = buildProfile(draft, { today, base: profile })
      const w = draft.weightKg as number
      const opts = { today, adaptiveTdee: adaptive?.tdee }
      return { energy: computeEnergy(p, w, opts), targets: computeTargets(p, w, overrides, opts) }
    } catch {
      return null
    }
  }, [complete, draft, today, profile, adaptive, overrides])

  const save = () => {
    if (!complete) {
      setAttempted(true)
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const next = buildProfile(draft, { today, base: profile })
    setProfile(next)
    const w = Math.round((draft.weightKg as number) * 10) / 10
    if (Math.abs(w - currentWeight) >= 0.05) logWeight(today, w)
    setDraft(draftFromProfile(next, w))
    setAttempted(false)
    toast('Profilen är sparad', { tone: 'success' })
  }

  const blocked = wanted === 'ga_ner' ? lossBlockReason(draft, today) : null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex flex-col gap-5"
      aria-label="Profil"
    >
      <Card title="Om dig" eyebrow="Uppgifter">
        <AboutFields
          draft={draft}
          onChange={change}
          errors={errors}
          visibleErrors={visible}
          onBlurField={(f) => setTouched((t) => ({ ...t, [f]: true }))}
          today={today}
        />
        <p className="mt-3 text-[0.8125rem] leading-snug text-ink-3">
          Ändrar du vikten sparas den i viktloggen för idag. Startvikt: {formatNumber(profile.startWeightKg, 1)} kg.
        </p>
      </Card>

      <Card title="Vardag och kost" eyebrow="Livsstil">
        <div className="flex flex-col gap-4">
          <Select<ActivityLevel>
            label="Vardagsaktivitet"
            value={draft.activityLevel ?? ''}
            onChange={(activityLevel) => change({ activityLevel })}
            options={(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((k) => ({ value: k, label: ACTIVITY_LEVELS[k].label }))}
            hint={draft.activityLevel ? `${ACTIVITY_LEVELS[draft.activityLevel].description}. Planerad träning loggas separat.` : undefined}
          />
          <Select<DietType> label="Kost" value={draft.diet} onChange={(diet) => change({ diet })} options={DIET_OPTIONS.map((d) => ({ value: d.value, label: `${d.emoji} ${d.label}` }))} />
        </div>
      </Card>

      <Card title="Mål och takt" eyebrow="Vikt">
        <div className="flex flex-col gap-4">
          <div>
            <div id={goalLabelId} className="mb-1.5 text-sm font-medium text-ink-2">
              Mål
            </div>
            <SegmentedControl<GoalType>
              aria-labelledby={goalLabelId}
              fullWidth
              value={(wanted === 'balans' || wanted === 'medvetet' ? 'behalla' : wanted) ?? 'behalla'}
              onChange={(g) => change({ goalChoice: g })}
              options={GOAL_OPTIONS}
            />
          </div>
          {blocked && <Note>{blocked}</Note>}

          {goal !== 'behalla' && (
            <>
              <div>
                <div id={rateLabelId} className="mb-1.5 text-sm font-medium text-ink-2">
                  Takt per vecka
                </div>
                <SegmentedControl<number>
                  aria-labelledby={rateLabelId}
                  fullWidth
                  value={rate}
                  onChange={(weeklyRateKg) => change({ weeklyRateKg })}
                  options={options.map((o) => ({ value: o.value, label: `${formatNumber(o.value, 2)} kg`, disabled: o.disabled }))}
                />
                <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-3">
                  {options.find((o) => o.value === rate)?.label} – {options.find((o) => o.value === rate)?.description}.{' '}
                  {goal === 'ga_ner' ? 'Högst 1 % av kroppsvikten per vecka.' : 'Högst 0,5 kg per vecka.'}
                </p>
              </div>
              <NumberField
                label="Målvikt"
                optional
                value={draft.targetWeightKg}
                onChange={(targetWeightKg) => change({ targetWeightKg })}
                suffix="kg"
                step={0.5}
                decimals={1}
                error={targetError}
              />
              {projection && !targetError && (
                <p className="flex items-start gap-2 text-[0.875rem] leading-relaxed text-ink-2">
                  <CalendarHeart aria-hidden className="mt-0.5 size-4 shrink-0 text-hjortron" />
                  <span>
                    Med den takten når du {formatNumber(draft.targetWeightKg, 1)} kg {describeProjection(projection, today)}.
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Dina mål med de här uppgifterna" eyebrow={dirty ? 'Förhandsvisning' : 'Nu'}>
        {preview ? (
          <TargetsSummary energy={preview.energy} targets={preview.targets} />
        ) : (
          <p className="text-[0.9375rem] text-ink-2">Fyll i alla uppgifter så räknas målen om direkt.</p>
        )}
        <p className="mt-3 text-[0.8125rem] text-ink-3">Egna mål och makrofördelning ändrar du under Mål och makron.</p>
      </Card>

      <AnimatePresence>
        {(dirty || attempted) && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="sticky bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 lg:bottom-6"
          >
            <div className="flex gap-2 rounded-[1.5rem] border border-line/70 bg-surface/90 p-2 shadow-[var(--shadow-float)] backdrop-blur-xl">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(initial)
                  setAttempted(false)
                  setTouched({})
                }}
              >
                Ångra
              </Button>
              <Button type="submit" fullWidth iconLeft={Check} className="flex-1">
                Spara profilen
              </Button>
            </div>
            {attempted && (hasErrors(errors) || targetError) && (
              <p role="alert" className="mt-2 rounded-xl bg-surface/90 px-3 py-1.5 text-center text-[0.8125rem] text-bad backdrop-blur">
                Kontrollera de markerade fälten.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <p className="flex items-center gap-2 px-1 text-[0.8125rem] text-ink-3">
        <UserRound aria-hidden className="size-4 shrink-0" />
        Uppgifterna används bara för att räkna ut dina mål och lämnar aldrig telefonen.
      </p>
    </form>
  )
}
