/**
 * Inställningar → Profil. Samma fält och validering som välkomstflödet. Målen räknas om
 * direkt medan man ändrar, och sparas först när man trycker Spara. Lämnar man sidan med
 * osparade ändringar frågar Lagom först – t.ex. graviditet ändrar målen och får inte tappas bort.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useBlocker } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CalendarHeart, Check, UserRound } from 'lucide-react'
import { Button, Card, EmptyState, NumberField, SegmentedControl, Select, confirmDialog, toast } from '../../../components/ui'
import { useEnergyUnit } from '../../../components/domain/EnergyValue'
import { useTargets } from '../../../hooks/useTargets'
import { useToday } from '../../../hooks/useToday'
import { computeEnergy, computeTargets } from '../../../lib/energy'
import { formatEnergy, formatNumber } from '../../../lib/format'
import { useBodyStore } from '../../../stores/bodyStore'
import { useProfileStore } from '../../../stores/profileStore'
import { ACTIVITY_LEVELS, type ActivityLevel, type DietType, type GoalType, type Profile } from '../../../types'
import { AboutFields, Note } from '../../onboarding/AboutFields'
import { focusFirstInvalid } from '../../onboarding/focusFirstInvalid'
import { TargetsSummary } from '../../onboarding/TargetsSummary'
import { clampKcalOverride, kcalFloorText, kcalOverrideFloor } from '../settingsLogic'
import {
  DIET_OPTIONS,
  buildProfile,
  clampRate,
  describeProjection,
  draftFromProfile,
  effectiveGoal,
  effectiveRate,
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
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const logWeight = useBodyStore((s) => s.logWeight)
  const { adaptive } = useTargets(today)
  const unit = useEnergyUnit()
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
  const projection = projectedGoalDate(draft, today, { adaptiveTdee: adaptive?.tdee })
  const eff = effectiveRate(draft, today, { adaptiveTdee: adaptive?.tdee })

  // Förhandsvisning av målen med de ändrade uppgifterna. Ett eget energimål som blir för lågt
  // med de nya uppgifterna (t.ex. vid graviditet) höjs till golvet – samma sak sker när man sparar.
  const preview = useMemo(() => {
    if (!complete) return null
    try {
      const p = buildProfile(draft, { today, base: profile })
      const w = draft.weightKg as number
      const opts = { today, adaptiveTdee: adaptive?.tdee }
      const energy = computeEnergy(p, w, opts)
      const floor = kcalOverrideFloor(p, energy, today)
      const safeOverrides = clampKcalOverride(overrides, floor.kcal)
      return { energy, floor, safeOverrides, targets: computeTargets(p, w, safeOverrides, opts) }
    } catch {
      return null
    }
  }, [complete, draft, today, profile, adaptive, overrides])

  // Fråga innan osparade ändringar går förlorade (tillbaka-knapp, bottenmeny, länkar).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirmDialog({
      title: 'Lämna utan att spara?',
      message: 'Ändringarna i din profil sparas inte, och dina mål räknas inte om.',
      confirmLabel: 'Lämna',
      cancelLabel: 'Fortsätt redigera',
      tone: 'danger',
    }).then((ok) => {
      asking.current = false
      if (ok) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker])

  const save = () => {
    if (!complete) {
      setAttempted(true)
      window.requestAnimationFrame(() => focusFirstInvalid())
      return
    }
    const next = buildProfile(draft, { today, base: profile })
    setProfile(next)
    const w = Math.round((draft.weightKg as number) * 10) / 10
    if (Math.abs(w - currentWeight) >= 0.05) logWeight(today, w)
    const raised = preview !== null && preview.safeOverrides !== overrides
    if (raised) updateSettings({ targetOverrides: preview.safeOverrides })
    setDraft(draftFromProfile(next, w))
    setAttempted(false)
    toast(raised ? `Profilen är sparad. Ditt eget energimål är höjt till ${formatEnergy(preview.floor.kcal, unit)}.` : 'Profilen är sparad', {
      tone: 'success',
    })
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
              {goal === 'ga_ner' && eff?.limitedByFloor && eff.kcal !== undefined && (
                <Note>
                  Lagom sätter aldrig dagsmålet under {formatEnergy(eff.kcal, unit)}, så att du får i dig tillräckligt med näring. För dig blir takten därför
                  ungefär {formatNumber(eff.rate, 2)} kg i veckan – och det är helt okej.
                </Note>
              )}
              {projection && !targetError && (
                <p className="flex items-start gap-2 text-[0.875rem] leading-relaxed text-ink-2">
                  <CalendarHeart aria-hidden className="mt-0.5 size-4 shrink-0 text-hjortron" />
                  <span>
                    Med {eff?.limitedByFloor ? `ungefär ${formatNumber(eff.rate, 2)} kg i veckan` : 'den takten'} når du {formatNumber(draft.targetWeightKg, 1)} kg{' '}
                    {describeProjection(projection, today)}.
                  </span>
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Dina mål med de här uppgifterna" eyebrow={dirty ? 'Förhandsvisning' : 'Nu'}>
        {preview ? (
          <TargetsSummary
            energy={preview.energy}
            targets={preview.targets}
            extraNotes={
              preview.safeOverrides !== overrides && overrides.kcal !== undefined
                ? [`Ditt eget energimål (${formatEnergy(overrides.kcal, unit)}) höjs när du sparar. ${kcalFloorText(preview.floor, unit)}`]
                : []
            }
          />
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
