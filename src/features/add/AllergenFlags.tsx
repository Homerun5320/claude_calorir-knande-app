/**
 * Varsamma allergiflaggor för ett livsmedel – se `lib/allergens.ts` för reglerna.
 *
 * Visas bara när användaren har markerat allergier eller intoleranser (Inställningar → Allergier
 * och överkänslighet). Aldrig röda larm: varningsfärgens token, en ikon och en text som "Innehåller
 * mjölk – som du har markerat". Lagom säger aldrig att något är säkert eller fritt från något –
 * bara vad Open Food Facts anger, med källan, och att förpackningen alltid gäller.
 *
 * - `detail` (produktdetaljen): flaggor, källa eller att uppgifterna saknas, och en länk till inställningarna.
 * - `compact` (skanningens resultat innan man lägger till): flaggor och källa eller att uppgifterna saknas.
 * - `row` (online-sökningens träfflista): bara de varsamma flaggorna, diskret under raden.
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, Info, Tag } from 'lucide-react'
import type { AllergenKey, Food } from '../../types'
import { cx } from '../../components/ui'
import { useProfileStore } from '../../stores/profileStore'
import { ALLERGY_SETTINGS_PATH, assessAllergens, warnFlags, type AllergenAssessment, type AllergenFlag } from '../../lib/allergens'

const EMPTY: readonly AllergenKey[] = []

/** Användarens allergier och intoleranser (stabil tom lista när inget är markerat). */
export function useAllergenProfile(): readonly AllergenKey[] {
  return useProfileStore((s) => s.settings.allergens ?? EMPTY)
}

/** Flaggorna för ett livsmedel mot användarens profil. */
export function useAllergenAssessment(food: Pick<Food, 'source' | 'extra'> | null | undefined): AllergenAssessment | null {
  const profile = useAllergenProfile()
  return useMemo(() => (food ? assessAllergens(food, profile) : null), [food, profile])
}

export interface AllergenFlagsProps {
  food: Food
  variant?: 'detail' | 'compact' | 'row'
  className?: string
}

export function AllergenFlags({ food, variant = 'detail', className }: AllergenFlagsProps) {
  const assessment = useAllergenAssessment(food)
  if (!assessment || !assessment.active) return null

  if (variant === 'row') {
    const flags = warnFlags(assessment)
    if (flags.length === 0) return null
    return (
      <ul aria-label={`Allergier: ${food.name}`} className={cx('flex flex-col gap-0.5 pb-2 pl-14 text-xs font-medium leading-snug text-warn', className)}>
        {flags.map((f) => (
          <li key={`${f.kind}-${f.key}`} className="flex items-start gap-1.5">
            <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden strokeWidth={2.2} />
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    )
  }

  const warned = assessment.flags.some((f) => f.tone === 'warn')
  return (
    <section
      aria-label="Allergier och överkänslighet"
      className={cx('rounded-2xl px-4 py-3 text-sm text-ink', warned ? 'bg-hjortron-soft' : 'bg-surface-2', className)}
    >
      {assessment.flags.length > 0 && (
        <ul className="mb-1.5 flex flex-col gap-1.5">
          {assessment.flags.map((f) => (
            <FlagItem key={`${f.kind}-${f.key}`} flag={f} />
          ))}
        </ul>
      )}
      {assessment.note && (
        <p className={cx('flex items-start gap-2 text-ink-2', assessment.flags.length > 0 ? 'text-xs' : 'text-sm')}>
          {assessment.flags.length === 0 && <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />}
          <span>{assessment.note}</span>
        </p>
      )}
      {variant === 'detail' && (
        <Link
          to={ALLERGY_SETTINGS_PATH}
          className="mt-0.5 inline-flex min-h-11 items-center rounded-sm text-sm font-semibold text-gran underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gran"
        >
          Ändra dina allergier
        </Link>
      )}
    </section>
  )
}

function FlagItem({ flag }: { flag: AllergenFlag }) {
  if (flag.tone === 'warn') {
    return (
      <li className="flex items-start gap-2 font-semibold">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden strokeWidth={2.2} />
        <span>{flag.text}</span>
      </li>
    )
  }
  // Märkningen (etikett) eller en neutral uppgift som "Kan innehålla spår av mjölk".
  const Icon = flag.kind === 'label' ? Tag : Info
  return (
    <li className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <span>{flag.text}</span>
    </li>
  )
}
