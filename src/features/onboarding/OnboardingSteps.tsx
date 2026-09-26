/**
 * De enskilda stegen i välkomstflödet. Varje steg ställer en fråga.
 */
import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Armchair,
  CalendarHeart,
  Footprints,
  Gift,
  Hammer,
  HeartHandshake,
  PersonStanding,
  Salad,
  Scale,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wheat,
  type LucideIcon,
} from 'lucide-react'
import { Card, NumberField, toneVars, type IconLike, type Tone } from '../../components/ui'
import { EnergyValue } from '../../components/domain/EnergyValue'
import { PlateModel } from '../../components/signature/PlateModel'
import { SeasonalHeader } from '../../components/signature/SeasonalHeader'
import { LogoMark, Wordmark } from '../../components/layout/Logo'
import { MACRO_PRESETS, computeEnergy, computeTargets } from '../../lib/energy'
import { formatNumber } from '../../lib/format'
import { PLATE_IDEAL } from '../../lib/plate'
import { ACTIVITY_LEVELS, type ActivityLevel, type ISODate, type MacroPreset } from '../../types'
import { AboutFields, Note } from './AboutFields'
import { ChoiceCard, ChoiceGroup } from './ChoiceCard'
import { MacroSplitBar } from './MacroSplitBar'
import { TargetsSummary } from './TargetsSummary'
import {
  DIET_OPTIONS,
  GOAL_CHOICES,
  buildProfile,
  clampRate,
  describeProjection,
  effectiveGoal,
  goalFromChoice,
  lossBlockReason,
  projectedGoalDate,
  rateOptions,
  validateTarget,
  type FieldErrors,
  type GoalChoice,
  type ProfileDraft,
  type ProfileField,
} from './profileLogic'

// ---------------------------------------------------------------------------
// Gemensamt
// ---------------------------------------------------------------------------

export function StepHeading({
  eyebrow,
  title,
  subtitle,
  focusOnMount,
  id,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  focusOnMount?: boolean
  id?: string
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    // Endast vid montering – varje steg monteras på nytt när man byter steg.
    if (focusOnMount) ref.current?.focus({ preventScroll: true })
  }, [focusOnMount])
  return (
    <div className="mb-6">
      {eyebrow !== undefined && <div className="eyebrow mb-2">{eyebrow}</div>}
      <h1
        ref={ref}
        id={id}
        tabIndex={-1}
        className="font-display text-[1.875rem] font-semibold leading-[1.12] tracking-tight text-ink outline-none sm:text-[2.25rem]"
      >
        {title}
      </h1>
      {subtitle !== undefined && <p className="mt-2.5 text-[1rem] leading-relaxed text-ink-2">{subtitle}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 0 Välkommen
// ---------------------------------------------------------------------------

const PROMISES: ReadonlyArray<{ icon: LucideIcon; tone: Tone; title: string; text: string }> = [
  { icon: Wheat, tone: 'hjortron', title: 'Svenska livsmedel och mått', text: 'Knäckebröd, falukorv och kanelbulle – i dl, msk och krm.' },
  { icon: Gift, tone: 'lingon', title: 'Gratis, utan reklam', text: 'Inga konton, inga prenumerationer och ingen betalvägg.' },
  { icon: ShieldCheck, tone: 'gran', title: 'Din data stannar i din telefon', text: 'Ingen server. Exportera eller radera allt när du vill.' },
]

export function WelcomeStep({ today }: { today: ISODate }) {
  const reduce = useReducedMotion()
  return (
    <div>
      <SeasonalHeader date={today} height={224} className="lg:rounded-b-[2rem]" contentClassName="absolute inset-x-0 top-0 px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
        <div className="flex items-center gap-2.5">
          <LogoMark size={40} />
          <Wordmark className="text-[1.75rem]" />
        </div>
      </SeasonalHeader>
      <div className="mx-auto w-full max-w-lg px-4">
        <motion.h1
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          className="-mt-2 font-display text-[1.875rem] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[2.5rem]"
          tabIndex={-1}
        >
          Lagom – kaloriräknaren som gör det lätt att äta lagom.
        </motion.h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-2">Varken för mycket eller för lite – gott, varierat och utan skuld.</p>
        <ul className="mt-6 flex flex-col gap-2.5">
          {PROMISES.map((p, i) => (
            <motion.li
              key={p.title}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.12 + i * 0.08, type: 'spring', stiffness: 260, damping: 30 }}
              className="flex items-center gap-3.5 rounded-[1.25rem] bg-surface p-3 shadow-card"
            >
              <span style={toneVars(p.tone)} aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-(--tone-soft) text-(--tone)">
                <p.icon className="size-[1.375rem]" strokeWidth={2} />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{p.title}</span>
                <span className="block text-[0.8125rem] leading-snug text-ink-2">{p.text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 1 Mål
// ---------------------------------------------------------------------------

const GOAL_META: Record<GoalChoice, { icon: IconLike; tone: Tone }> = {
  ga_ner: { icon: TrendingDown, tone: 'fjall' },
  behalla: { icon: Scale, tone: 'gran' },
  ga_upp: { icon: TrendingUp, tone: 'hjortron' },
  balans: { icon: Salad, tone: 'mossa' },
  medvetet: { icon: HeartHandshake, tone: 'vinbar' },
}

export function GoalStep({ draft, onChange, focusOnMount, eyebrow }: StepProps) {
  const headingId = useId()
  return (
    <>
      <StepHeading
        id={headingId}
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title="Vad vill du med Lagom?"
        subtitle="Välj det som känns mest rätt just nu. Du kan ändra det när du vill."
      />
      <ChoiceGroup labelledBy={headingId}>
        {GOAL_CHOICES.map((g) => (
          <ChoiceCard
            key={g.value}
            name="mal"
            value={g.value}
            checked={draft.goalChoice === g.value}
            onSelect={() => onChange({ goalChoice: g.value })}
            title={g.label}
            description={g.description}
            icon={GOAL_META[g.value].icon}
            tone={GOAL_META[g.value].tone}
            className={g.value === 'medvetet' ? 'mt-2' : undefined}
          />
        ))}
      </ChoiceGroup>
    </>
  )
}

// ---------------------------------------------------------------------------
// 2 Om dig
// ---------------------------------------------------------------------------

export interface StepProps {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
  today: ISODate
  focusOnMount?: boolean
  eyebrow?: ReactNode
}

export function AboutStep({
  draft,
  onChange,
  today,
  focusOnMount,
  eyebrow,
  errors,
  visibleErrors,
  onBlurField,
}: StepProps & { errors: FieldErrors; visibleErrors: Partial<Record<ProfileField, boolean>>; onBlurField: (f: ProfileField) => void }) {
  return (
    <>
      <StepHeading
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title="Lite om dig"
        subtitle="Det behövs för att räkna ut hur mycket energi din kropp gör av med. Uppgifterna stannar i din telefon."
      />
      <AboutFields draft={draft} onChange={onChange} errors={errors} visibleErrors={visibleErrors} onBlurField={onBlurField} today={today} />
    </>
  )
}

// ---------------------------------------------------------------------------
// 3 Vardagsaktivitet
// ---------------------------------------------------------------------------

export const ACTIVITY_META: Record<ActivityLevel, { icon: IconLike; tone: Tone }> = {
  stillasittande: { icon: Armchair, tone: 'blabar' },
  latt: { icon: Footprints, tone: 'mossa' },
  aktiv: { icon: PersonStanding, tone: 'hjortron' },
  mycket_aktiv: { icon: Hammer, tone: 'lingon' },
}

export function ActivityStep({ draft, onChange, focusOnMount, eyebrow }: StepProps) {
  const headingId = useId()
  return (
    <>
      <StepHeading
        id={headingId}
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title="Hur ser en vanlig dag ut?"
        subtitle="Tänk på jobbet och vardagen. Planerad träning loggar du separat – räkna inte med den här."
      />
      <ChoiceGroup labelledBy={headingId}>
        {(Object.keys(ACTIVITY_LEVELS) as ActivityLevel[]).map((key) => (
          <ChoiceCard
            key={key}
            name="aktivitet"
            value={key}
            checked={draft.activityLevel === key}
            onSelect={() => onChange({ activityLevel: key })}
            title={ACTIVITY_LEVELS[key].label}
            description={ACTIVITY_LEVELS[key].description}
            icon={ACTIVITY_META[key].icon}
            tone={ACTIVITY_META[key].tone}
          />
        ))}
      </ChoiceGroup>
    </>
  )
}

// ---------------------------------------------------------------------------
// 4 Takt och målvikt
// ---------------------------------------------------------------------------

export function RateStep({ draft, onChange, today, focusOnMount, eyebrow, showErrors }: StepProps & { showErrors: boolean }) {
  const headingId = useId()
  const goal = effectiveGoal(draft, today)
  const options = rateOptions(draft.weightKg, goal)
  const rate = clampRate(draft.weeklyRateKg, draft.weightKg, goal)
  const targetError = validateTarget(draft, today)
  const projection = projectedGoalDate(draft, today)
  const losing = goal === 'ga_ner'
  const anyDisabled = options.some((o) => o.disabled)

  return (
    <>
      <StepHeading
        id={headingId}
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title={losing ? 'I vilken takt?' : 'I vilken takt vill du gå upp?'}
        subtitle={
          losing
            ? 'Lugnt och stadigt håller bäst. Kroppen får tid att vänja sig och maten kan fortfarande vara god.'
            : 'En lugn takt gör att mer blir muskler och mindre blir fett – särskilt om du styrketränar.'
        }
      />
      <ChoiceGroup labelledBy={headingId}>
        {options.map((o) => (
          <ChoiceCard
            key={o.value}
            name="takt"
            value={String(o.value)}
            checked={Math.abs(rate - o.value) < 1e-9}
            disabled={o.disabled}
            onSelect={() => onChange({ weeklyRateKg: o.value })}
            title={
              <>
                {formatNumber(o.value, 2)} kg per vecka <span className="font-normal text-ink-3">· {o.label}</span>
              </>
            }
            description={o.disabled ? 'Mer än 1 % av din vikt per vecka – det rekommenderas inte.' : o.description}
            tone={losing ? 'fjall' : 'hjortron'}
            compact
            aside={
              <span className="shrink-0 text-right text-[0.8125rem] font-semibold tabular-nums text-ink-2">
                {losing ? '−' : '+'}
                <EnergyValue kcal={o.kcalPerDay} unitClassName="text-[0.75rem] font-medium text-ink-3" />
                <span className="block text-[0.6875rem] font-medium text-ink-3">per dag</span>
              </span>
            }
          />
        ))}
      </ChoiceGroup>
      {anyDisabled && losing && (
        <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-ink-3">Lagom begränsar takten till högst 1 % av kroppsvikten per vecka.</p>
      )}

      <div className="mt-7">
        <NumberField
          label="Målvikt"
          optional
          value={draft.targetWeightKg}
          onChange={(targetWeightKg) => onChange({ targetWeightKg })}
          suffix="kg"
          step={0.5}
          decimals={1}
          placeholder={draft.weightKg !== undefined ? formatNumber(Math.round(draft.weightKg + (losing ? -5 : 3)), 1) : '65'}
          error={showErrors || draft.targetWeightKg !== undefined ? targetError : undefined}
          hint={targetError ? undefined : 'Valfritt – det går lika bra att bara ta en vecka i taget.'}
        />
        {projection && !targetError && (
          <Card tone="sol" padding="sm" className="mt-3">
            <div className="flex items-start gap-3 px-1 py-0.5">
              <CalendarHeart aria-hidden className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" />
              <p className="text-[0.9375rem] leading-relaxed text-ink">
                Med {formatNumber(rate, 2)} kg i veckan når du {formatNumber(draft.targetWeightKg, 1)} kg{' '}
                <strong className="font-semibold">{describeProjection(projection, today)}</strong>. Vikten går sällan spikrakt – Lagom följer din
                trend, inte enskilda vägningar.
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// 5 Kost
// ---------------------------------------------------------------------------

type PresetKey = Exclude<MacroPreset, 'anpassad'>

export function DietStep({ draft, onChange, focusOnMount, eyebrow }: StepProps) {
  const dietId = useId()
  const macroId = useId()
  const mindful = draft.goalChoice === 'medvetet'
  return (
    <>
      <StepHeading
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title="Hur äter du?"
        subtitle="Det hjälper Lagom att ge tips som passar dig. Inget är rätt eller fel."
      />
      <h2 id={dietId} className="sr-only">
        Kost
      </h2>
      <div role="radiogroup" aria-labelledby={dietId} className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        {DIET_OPTIONS.map((d) => (
          <ChoiceCard
            key={d.value}
            name="kost"
            value={d.value}
            checked={draft.diet === d.value}
            onSelect={() => onChange({ diet: d.value })}
            title={
              <>
                <span aria-hidden className="mr-1.5">
                  {d.emoji}
                </span>
                {d.label}
              </>
            }
            description={d.description}
            compact
            tone="mossa"
          />
        ))}
      </div>

      {!mindful && (
        <section className="mt-8">
          <h2 id={macroId} className="font-display text-[1.25rem] font-semibold tracking-tight text-ink">
            Makrofördelning
          </h2>
          <p className="mb-3 mt-1 text-[0.9375rem] leading-relaxed text-ink-2">
            Hur energin fördelas mellan protein, kolhydrater och fett. Osäker? Välj Balanserad – den följer de nordiska rekommendationerna.
          </p>
          <ChoiceGroup labelledBy={macroId}>
            {(Object.keys(MACRO_PRESETS) as PresetKey[]).map((key) => {
              const p = MACRO_PRESETS[key]
              return (
                <ChoiceCard
                  key={key}
                  name="makro"
                  value={key}
                  checked={draft.macroPreset === key}
                  onSelect={() => onChange({ macroPreset: key })}
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
          </ChoiceGroup>
        </section>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// 6 Sammanfattning
// ---------------------------------------------------------------------------

export function SummaryStep({ draft, today, focusOnMount, eyebrow }: StepProps) {
  const mindful = draft.goalChoice === 'medvetet'
  const result = useMemo(() => {
    try {
      const profile = buildProfile(draft, { today })
      const weight = draft.weightKg as number
      return { profile, energy: computeEnergy(profile, weight, { today }), targets: computeTargets(profile, weight, {}, { today }) }
    } catch {
      return null
    }
  }, [draft, today])

  const name = draft.name.trim()
  const blocked = goalFromChoice(draft.goalChoice) === 'ga_ner' ? lossBlockReason(draft, today) : null
  const projection = projectedGoalDate(draft, today)

  if (!result) {
    return (
      <StepHeading
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title="Nästan klart"
        subtitle="Några uppgifter saknas. Gå tillbaka och fyll i dem, så räknar Lagom fram dina mål."
      />
    )
  }

  const { energy, targets, profile } = result
  const extraNotes = blocked ? [blocked] : []

  return (
    <>
      <StepHeading
        eyebrow={eyebrow}
        focusOnMount={focusOnMount}
        title={name ? `Välkommen, ${name}!` : 'Välkommen till Lagom!'}
        subtitle={
          mindful
            ? 'Lagom visar Tallriksmodellen och hur du mår i stället för siffror. Dina mål finns kvar i bakgrunden.'
            : 'Här är ditt förslag. Det är en start – kroppen är ingen miniräknare, och du kan justera när som helst.'
        }
      />

      {mindful ? (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col items-center">
            <PlateModel fractions={PLATE_IDEAL.vanlig} size={260} />
            <p className="mt-3 text-center text-[0.9375rem] leading-relaxed text-ink-2">
              Hälften grönsaker, en fjärdedel till en tredjedel potatis, pasta eller bröd – och resten protein. Lagom påminner dig mjukt.
            </p>
          </Card>
          <details className="group card p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl font-semibold text-ink">
              Visa siffrorna ändå
              <span aria-hidden className="text-ink-3 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <TargetsSummary energy={energy} targets={targets} extraNotes={extraNotes} className="mt-3" />
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow">Ditt dagsmål</div>
                <EnergyValue kcal={targets.kcal} display className="text-[2.75rem] font-semibold leading-none text-ink" unitClassName="ml-1 text-[1rem] font-medium text-ink-3" />
              </div>
              <MacroSplitBar split={macroPct(profile.macroPreset)} className="mb-2 w-28" />
            </div>
            <TargetsSummary energy={energy} targets={targets} extraNotes={extraNotes} />
          </Card>
          {projection && (
            <Card tone="sol" padding="sm">
              <div className="flex items-start gap-3 px-1 py-0.5">
                <CalendarHeart aria-hidden className="mt-0.5 size-5 shrink-0 text-(--tone-ink)" />
                <p className="text-[0.9375rem] leading-relaxed text-ink">
                  Målvikten {formatNumber(draft.targetWeightKg, 1)} kg nås {describeProjection(projection, today)}, om allt går enligt plan.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2.5">
        <Note tone="mossa" icon={ShieldCheck}>
          Allt du fyllt i sparas bara i den här telefonen. Inget konto, ingen server och ingen reklam.
        </Note>
        <p className="flex items-center gap-2 px-1 text-[0.875rem] text-ink-3">
          <Sparkles aria-hidden className="size-4 shrink-0" />
          Ändra när som helst i Inställningar.
        </p>
      </div>
    </>
  )
}

function macroPct(preset: MacroPreset) {
  const p = MACRO_PRESETS[preset === 'anpassad' ? 'nnr' : preset]
  return { protein: p.protein, carbs: p.carbs, fat: p.fat }
}
