/**
 * Receptsida (/recept/:id) – egna recept (id från butiken) och svenska klassiker ('klassiker-…').
 *
 * Visar näring per portion, ingredienser som kan skalas till valfritt antal portioner,
 * Tallriksmodellen, klimatavtryck och instruktioner. Härifrån loggas en portion i dagboken,
 * egna recept redigeras eller tas bort och klassiker kopieras till "Mina recept".
 */
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Car, Clock, Copy, Eye, Heart, Info, Leaf, ListOrdered, Pencil, Plus, Scale, Trash2, Users, Utensils } from 'lucide-react'
import type { FoodTag, Nutrients, Recipe } from '../../types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  IconButton,
  PageHeader,
  Skeleton,
  SkeletonText,
  Stepper,
  confirmDialog,
  cx,
  toast,
} from '../../components/ui'
import { DonutChart, type DonutSegment } from '../../components/charts'
import { EnergyValue, NutrientTable, useEnergyUnit } from '../../components/domain'
import { mindfulPortionLabel } from '../../components/domain/PortionPicker'
import { PlateModel } from '../../components/signature'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { latestWeight, useBodyStore } from '../../stores/bodyStore'
import { useTargets } from '../../hooks/useTargets'
import { referenceIntakes, type ReferenceMap } from '../../lib/nnr'
import { ageFromBirthYear } from '../../lib/dates'
import { energyDistribution } from '../../lib/nutrients'
import { formatDuration, formatGrams, formatNumber } from '../../lib/format'
import { recipePerServing, recipePlate, recipeTags, recipeTotals } from '../../lib/recipes'
import { builtinRecipeInfo } from '../../data/recipes'
import {
  MAX_SERVINGS,
  cookedWeightText,
  copyRecipe,
  formatIngredientAmount,
  parseInstructions,
  perServingText,
  plateFractions,
  plateNote,
  recipeFavoriteId,
  scaleFactor,
  scaleIngredient,
  servingClimate,
  servingsText,
  showPlateFor,
  sourceHost,
  weightInfo,
  type ServingNoun,
} from './recipeLogic'
import { servingNounFor, useIsFavoriteRecipe, useRecipe } from './useRecipes'
import { LogRecipeSheet, RecipeEmoji, TagBadges } from './components'
import { requireAccess } from '../premium/requireAccess'

/** Redigeraren går tillbaka hit efter "Spara" i stället för att lägga en ny sida i historiken. */
const EDIT_STATE = { fromDetail: true }

/** Märkningar som inte upprepas som badges – klassikerna har redan "Svensk klassiker" i rubriken. */
const OWN_HIDDEN_TAGS: readonly FoodTag[] = ['svensk']
const CLASSIC_HIDDEN_TAGS: readonly FoodTag[] = ['svensk', 'klassiker']

export default function RecipeDetailPage() {
  const { id } = useParams()
  const { recipe, loading, error } = useRecipe(id)

  if (loading) return <DetailSkeleton />
  if (!recipe) {
    return (
      <div className="px-4">
        <PageHeader backTo="/recept" backLabel="Till recepten" title="Receptet hittades inte" />
        <div className="card">
          <EmptyState
            illustration="search"
            title="Här fanns inget recept"
            text={error ?? 'Det kan ha tagits bort, eller så är länken felaktig.'}
            action={
              <Button variant="soft" to="/recept">
                Till recepten
              </Button>
            }
          />
        </div>
      </div>
    )
  }
  return <RecipeDetail key={recipe.id} recipe={recipe} />
}

function DetailSkeleton() {
  return (
    <div className="px-4 pt-safe" aria-busy="true" aria-label="Laddar receptet">
      <div className="h-14" />
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-5 h-9 w-3/4" />
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="size-20 rounded-[1.6rem]" />
        <SkeletonText lines={2} className="flex-1" />
      </div>
      <Skeleton className="mb-3 h-44 w-full rounded-[1.5rem]" />
      <Skeleton className="h-64 w-full rounded-[1.5rem]" />
    </div>
  )
}

/** Referensvärden enligt NNR 2023 för användarens profil (om den finns). */
function useReferences(): ReferenceMap | undefined {
  const profile = useProfileStore((s) => s.profile)
  const weights = useBodyStore((s) => s.weights)
  const { targets } = useTargets()
  const kcal = targets.kcal
  return useMemo(() => {
    if (!profile) return undefined
    return referenceIntakes({
      sex: profile.sex,
      age: ageFromBirthYear(profile.birthYear),
      lifeStage: profile.lifeStage,
      weightKg: latestWeight(weights)?.kg ?? profile.startWeightKg,
      kcal,
    })
  }, [profile, weights, kcal])
}

function RecipeDetail({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const showClimate = useProfileStore((s) => s.settings.showClimate)
  const saveRecipe = useFoodStore((s) => s.saveRecipe)
  const removeRecipe = useFoodStore((s) => s.removeRecipe)
  const toggleFavorite = useFoodStore((s) => s.toggleFavorite)
  const favorite = useIsFavoriteRecipe(recipe.id)
  const references = useReferences()

  const [servings, setServings] = useState(recipe.servings > 0 ? recipe.servings : 1)
  const [logOpen, setLogOpen] = useState(false)
  const [showNumbers, setShowNumbers] = useState(false)

  const builtin = recipe.builtin === true
  const info = builtin ? builtinRecipeInfo(recipe.id) : undefined
  const noun = servingNounFor(recipe)
  const perServing = useMemo(() => recipePerServing(recipe), [recipe])
  const totals = useMemo(() => recipeTotals(recipe), [recipe])
  const weight = useMemo(() => weightInfo(recipe), [recipe])
  const plate = useMemo(() => recipePlate(recipe), [recipe])
  // Andelar av tallrikens tre delar (summa 1) – samma som när rätten loggas som måltid.
  const plateShown = useMemo(() => plateFractions(plate), [plate])
  const climate = useMemo(() => servingClimate(recipe), [recipe])
  const tags = useMemo(() => recipeTags(recipe), [recipe])
  const parsed = useMemo(() => parseInstructions(recipe.instructions), [recipe.instructions])
  const numbersHidden = mindful && !showNumbers
  const showPlate = showPlateFor(recipe, perServing, plate)
  const servingCaption = `${perServingText(noun)} (${formatGrams(weight.perServing)})`

  const favId = recipeFavoriteId(recipe.id)
  const onFavorite = () => {
    toggleFavorite(favId)
    toast(favorite ? 'Borttaget från favoriter' : 'Sparat som favorit')
  }

  const onCopy = () => {
    if (!requireAccess('recept')) return
    const own = copyRecipe(recipe)
    saveRecipe(own)
    navigate(`/recept/${encodeURIComponent(own.id)}`)
    toast('Kopierat till Mina recept', {
      tone: 'success',
      action: { label: 'Redigera', onClick: () => navigate(`/recept/${encodeURIComponent(own.id)}/redigera`, { state: EDIT_STATE }) },
    })
  }

  const onDelete = async () => {
    const ok = await confirmDialog({
      title: 'Ta bort receptet?',
      message: 'Receptet försvinner från Mina recept. Det du redan loggat i dagboken finns kvar.',
      tone: 'danger',
      confirmLabel: 'Ta bort',
    })
    if (!ok) return
    const snapshot = recipe
    const wasFavorite = useFoodStore.getState().favorites.includes(favId)
    removeRecipe(recipe.id)
    // Butiken rensar favoriter på recept-id – favoriten sparas på livsmedels-id ('recipe:…').
    if (wasFavorite) useFoodStore.getState().toggleFavorite(favId)
    navigate('/recept', { replace: true })
    toast('Receptet är borttaget', {
      action: {
        label: 'Ångra',
        onClick: () => {
          useFoodStore.getState().saveRecipe(snapshot)
          if (wasFavorite && !useFoodStore.getState().favorites.includes(favId)) useFoodStore.getState().toggleFavorite(favId)
        },
      },
    })
  }

  const enter = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.35, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] as const },
        }

  return (
    <div className="px-4 pb-10">
      <PageHeader
        back
        eyebrow={builtin ? 'Svensk klassiker' : 'Mitt recept'}
        title={recipe.name}
        subtitle={info?.intro}
        actions={
          <IconButton
            icon={<Heart className={cx('size-5', favorite && 'fill-lingon text-lingon')} strokeWidth={2.1} aria-hidden />}
            aria-label={favorite ? 'Ta bort från favoriter' : 'Spara som favorit'}
            pressed={favorite}
            onClick={onFavorite}
          />
        }
      >
        <div className="flex items-center gap-4">
          <RecipeEmoji emoji={recipe.emoji} size="lg" />
          <dl className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
            <HeroStat icon={Clock} label="Tid" value={recipe.prepMinutes ? formatDuration(recipe.prepMinutes) : '–'} />
            <HeroStat icon={Users} label={capitalizeSv(noun[1])} value={formatNumber(recipe.servings)} />
            <HeroStat
              icon={Utensils}
              label={perServingText(noun)}
              value={numbersHidden ? mindfulShort(perServing.kcal) : <EnergyValue kcal={perServing.kcal} unitClassName="text-[0.72em] font-medium text-ink-3" />}
            />
          </dl>
        </div>
        {tags.length > 0 && (
          <div className="mt-4">
            <TagBadges tags={tags} hide={builtin ? CLASSIC_HIDDEN_TAGS : OWN_HIDDEN_TAGS} size="md" />
          </div>
        )}
        {recipe.sourceUrl && <SourceRow url={recipe.sourceUrl} hasSteps={parsed.steps.length > 0} />}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button size="lg" iconLeft={Plus} onClick={() => requireAccess('mat') && setLogOpen(true)} fullWidth>
            Logga en portion
          </Button>
          {builtin ? (
            <Button size="lg" variant="soft" iconLeft={Copy} onClick={onCopy} fullWidth>
              Kopiera till mina recept
            </Button>
          ) : (
            <Button size="lg" variant="soft" iconLeft={Pencil} to={`/recept/${encodeURIComponent(recipe.id)}/redigera`} state={EDIT_STATE} fullWidth>
              Redigera
            </Button>
          )}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4">
        <motion.div {...enter(0)}>
          <NutritionCard
            perServing={perServing}
            totals={totals}
            totalWeight={weight.final}
            caption={servingCaption}
            noun={noun}
            numbersHidden={numbersHidden}
            mindful={mindful}
            onShowNumbers={() => setShowNumbers(true)}
          />
        </motion.div>

        <motion.div {...enter(1)}>
          <IngredientsCard recipe={recipe} servings={servings} onServings={setServings} noun={noun} extras={parsed.extras} />
        </motion.div>

        {parsed.steps.length > 0 && (
          <motion.div {...enter(2)}>
            <Card title="Så gör du" eyebrow={`${parsed.steps.length}\u00a0steg`} action={<ListOrdered aria-hidden className="size-5 text-ink-3" />}>
              <ol className="flex flex-col gap-3.5">
                {parsed.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span
                      aria-hidden
                      className="grid size-7 shrink-0 place-items-center rounded-full bg-gran-soft font-display text-sm font-semibold text-gran tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[0.9375rem] leading-relaxed text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </motion.div>
        )}

        {((showPlate && plateShown) || (showClimate && climate)) && (
          <motion.div {...enter(3)} className="grid gap-4 sm:grid-cols-2">
            {showPlate && plateShown && (
              <Card title="Tallriksmodellen" eyebrow="Livsmedelsverket">
                <div className="flex justify-center">
                  <PlateModel fractions={plateShown} size={220} showLabels={!numbersHidden} />
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-2">{plateNote(plateShown)}</p>
              </Card>
            )}
            {showClimate && climate && (
              <Card title="Klimatavtryck" eyebrow={perServingText(noun)}>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <span className="display-num text-4xl font-semibold text-ink">
                      {climate.kg < 0.005 ? '<0,01' : formatNumber(climate.kg, climate.kg < 0.1 ? 2 : 1)}
                    </span>{' '}
                    <span className="ml-1 text-sm font-medium text-ink-3">kg CO₂e</span>
                  </div>
                  <Badge tone={climate.tone} icon={Leaf} size="md">
                    {climate.label}
                  </Badge>
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
                  <Car className="size-5 shrink-0 text-ink-3" aria-hidden />
                  <span>Ungefär som att köra {climate.carText} med en genomsnittlig svensk personbil.</span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-ink-3">
                  En måltid i nivå med WWF:s One Planet Plate ligger kring 0,5{'\u00a0'}kg CO₂e. Beräknat från ingrediensernas schabloner.
                </p>
              </Card>
            )}
          </motion.div>
        )}

        <motion.div {...enter(4)}>
          <Card title="Näringsvärden" eyebrow={references ? 'Jämfört med NNR 2023' : perServingText(noun)}>
            {numbersHidden ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm leading-relaxed text-ink-2">
                  Medvetet läge är på – siffrorna är dolda. Du kan visa dem för just det här receptet.
                </p>
                <Button variant="soft" size="sm" iconLeft={Eye} onClick={() => setShowNumbers(true)}>
                  Visa näringsvärden
                </Button>
              </div>
            ) : (
              <>
                <NutrientTable nutrients={perServing} references={references} caption={servingCaption} showStatus={false} />
                <p className="mt-3 text-xs leading-relaxed text-ink-3">
                  {references
                    ? 'Staplarna visar hur stor del av ditt dagliga referensintag (NNR 2023) en portion ger. En enskild rätt behöver inte täcka allt.'
                    : 'Fyll i din profil för att jämföra med dina referensvärden enligt NNR 2023.'}{' '}
                  Okända värden visas som ”–” och räknas inte som noll.
                </p>
              </>
            )}
          </Card>
        </motion.div>

        {builtin ? (
          <p className="px-1 text-xs leading-relaxed text-ink-3">
            Näringsvärdena är beräknade från ingredienserna i Lagoms livsmedelsdatabas (baserad på Livsmedelsverkets
            livsmedelsdatabas). Mängder och tillagad vikt är typiska för ett hemlagat recept.
          </p>
        ) : (
          <div className="flex justify-center pt-2">
            <Button variant="ghost" iconLeft={Trash2} onClick={onDelete} className="text-lingon hover:text-lingon">
              Ta bort receptet
            </Button>
          </div>
        )}
      </div>

      <LogRecipeSheet recipe={recipe} open={logOpen} onClose={() => setLogOpen(false)} />
    </div>
  )
}

/** "Källa: ica.se ↗" – länken till originalreceptet för importerade recept. */
function SourceRow({ url, hasSteps }: { url: string; hasSteps: boolean }) {
  return (
    <dl className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
      <dt className="font-medium text-ink-3">Källa</dt>
      <dd className="min-w-0">
        <ExternalLink
          href={url}
          className="inline-flex min-h-11 max-w-full items-center gap-0.5 font-semibold text-gran underline-offset-2 hover:underline"
        >
          <span className="truncate">{sourceHost(url)}</span>
        </ExternalLink>
      </dd>
      {!hasSteps && <dd className="w-full text-xs text-ink-3">Instruktionerna finns hos källan.</dd>}
    </dl>
  )
}

function mindfulShort(kcal: number | undefined): string {
  return capitalizeSv(mindfulPortionLabel(kcal).replace(/^(En|Ett) /, ''))
}

function capitalizeSv(s: string): string {
  return s ? s[0].toLocaleUpperCase('sv-SE') + s.slice(1) : s
}

/**
 * Liten faktaruta: ikon, värde och en etikett under ("45 min / Tid", "4 / Portioner",
 * "387 kcal / Per portion"). Etiketten står först i DOM:en (dt före dd) men visas sist, och får
 * radbrytas i stället för att kapas på smala skärmar.
 */
function HeroStat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-2xl bg-surface-2/70 px-1 py-2.5">
      <dt className="order-last mt-0.5 text-[0.6875rem] font-medium leading-tight text-ink-3 hyphens-auto [overflow-wrap:break-word]">{label}</dt>
      <dd className="flex flex-col items-center font-display text-[0.9375rem] font-semibold leading-tight text-ink tabular-nums">
        <Icon aria-hidden className="mb-1 size-3.5 shrink-0 text-ink-3" />
        {value}
      </dd>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Näring per portion
// ---------------------------------------------------------------------------

const MACROS = [
  { key: 'protein', label: 'Protein', color: 'var(--lg-lingon)', dot: 'bg-protein' },
  { key: 'carbs', label: 'Kolhydrater', color: 'var(--lg-hjortron)', dot: 'bg-carbs' },
  { key: 'fat', label: 'Fett', color: 'var(--lg-blabar)', dot: 'bg-fat' },
] as const

function NutritionCard({
  perServing,
  totals,
  totalWeight,
  caption,
  noun,
  numbersHidden,
  mindful,
  onShowNumbers,
}: {
  perServing: Nutrients
  totals: Nutrients
  totalWeight: number
  caption: string
  noun: ServingNoun
  numbersHidden: boolean
  mindful: boolean
  onShowNumbers: () => void
}) {
  const unit = useEnergyUnit()
  const dist = energyDistribution(perServing)
  const segments: DonutSegment[] = MACROS.map((m) => ({ key: m.key, label: m.label, value: dist[m.key], color: m.color }))
  if (dist.alcohol > 0) segments.push({ key: 'alcohol', label: 'Alkohol', value: dist.alcohol, color: 'var(--lg-vinbar)' })
  const hasEnergy = segments.some((s) => s.value > 0)

  return (
    <Card title="Näring" eyebrow={caption}>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <DonutChart
          segments={segments}
          size={148}
          thickness={15}
          legend="none"
          title="Energifördelning"
          formatValue={(v) => `${formatNumber(v)}\u00a0E%`}
        >
          <div className="flex flex-col items-center px-3 text-center">
            {numbersHidden ? (
              <span className="font-display text-base font-semibold leading-tight text-ink">{mindfulPortionLabel(perServing.kcal)}</span>
            ) : (
              <>
                <EnergyValue kcal={perServing.kcal} display showUnit={false} className="text-[2rem] font-semibold leading-none text-ink" />
                <span className="mt-1 text-xs font-medium text-ink-3">{perServing.kcal !== undefined ? `${unit} / ${noun[0]}` : 'okänd energi'}</span>
              </>
            )}
          </div>
        </DonutChart>

        <div className="w-full min-w-0 flex-1">
          <ul className="flex flex-col divide-y divide-line">
            {MACROS.map((m) => {
              const grams = perServing[m.key]
              return (
                <li key={m.key} className="flex items-center gap-2.5 py-2.5">
                  <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', m.dot)} />
                  <span className="flex-1 text-sm font-medium text-ink">{m.label}</span>
                  {!numbersHidden && (
                    <>
                      <span className="text-xs text-ink-3 tabular-nums">{hasEnergy ? `${formatNumber(dist[m.key])}\u00a0E%` : ''}</span>
                      <span className="w-16 text-right text-sm font-semibold text-ink tabular-nums">
                        {grams !== undefined ? `${formatNumber(grams, grams < 10 ? 1 : 0)}\u00a0g` : '–'}
                      </span>
                    </>
                  )}
                  {numbersHidden && <span className="text-xs text-ink-3">{hasEnergy ? shareWord(dist[m.key]) : '–'}</span>}
                </li>
              )
            })}
            {!numbersHidden && (
              <li className="flex items-center gap-2.5 py-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-fiber" />
                <span className="flex-1 text-sm font-medium text-ink">Fibrer</span>
                <span className="w-16 text-right text-sm font-semibold text-ink tabular-nums">
                  {perServing.fiber !== undefined ? `${formatNumber(perServing.fiber, 1)}\u00a0g` : '–'}
                </span>
              </li>
            )}
          </ul>
        </div>
      </div>
      {numbersHidden ? (
        <button type="button" onClick={onShowNumbers} className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-gran">
          <Eye aria-hidden className="size-4" />
          Visa siffror för receptet
        </button>
      ) : (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span>
            Hela receptet: <EnergyValue kcal={totals.kcal} className="font-semibold text-ink" /> · {formatGrams(totalWeight)}
            {mindful && ' · Medvetet läge är på'}
          </span>
        </p>
      )}
    </Card>
  )
}

function shareWord(pct: number): string {
  if (pct >= 45) return 'Största delen'
  if (pct >= 25) return 'En stor del'
  if (pct >= 10) return 'En del'
  return 'Lite'
}

// ---------------------------------------------------------------------------
// Ingredienser
// ---------------------------------------------------------------------------

function IngredientsCard({
  recipe,
  servings,
  onServings,
  noun,
  extras,
}: {
  recipe: Recipe
  servings: number
  onServings: (n: number) => void
  noun: ServingNoun
  extras?: string
}) {
  const factor = scaleFactor(recipe, servings)
  const scaled = factor !== 1
  const weight = useMemo(() => weightInfo(recipe), [recipe])
  const nounLabel = noun[0] === 'portion' ? 'Portioner' : capitalizeSv(noun[1])
  const step = recipe.servings >= 20 ? 5 : 1

  return (
    <Card title="Ingredienser" eyebrow={servingsText(servings, noun)}>
      <div className="-mt-1 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2/70 px-3 py-2">
        <span className="text-sm font-medium text-ink-2">{nounLabel}</span>
        <Stepper label={nounLabel} value={servings} onChange={onServings} min={1} max={MAX_SERVINGS} step={step} size="sm" />
      </div>
      {scaled && (
        <p className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-3" aria-live="polite">
          <span>
            Mängderna är räknade för {servingsText(servings, noun)} (receptet är för {formatNumber(recipe.servings)}).
          </span>
          <button type="button" onClick={() => onServings(recipe.servings)} className="relative shrink-0 font-semibold text-gran after:absolute after:-inset-3">
            Återställ
          </button>
        </p>
      )}
      <ul className="divide-y divide-line">
        {recipe.ingredients.map((ing) => {
          const s = scaleIngredient(ing, factor)
          const amount = formatIngredientAmount(ing.food, s.amount, ing.unit)
          return (
            <li key={ing.id} className="flex items-baseline gap-3 py-2.5">
              <span className="w-28 shrink-0 text-[0.9375rem] font-semibold text-ink tabular-nums">{amount.text}</span>
              <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-ink-2">
                {ing.food.name}
                {amount.grams && (
                  <>
                    {' '}
                    <span className="ml-1 whitespace-nowrap text-xs text-ink-3 tabular-nums">({amount.grams})</span>
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {extras && (
        <p className="mt-3 rounded-2xl bg-surface-2/70 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Du behöver även:</span> {extras}. <span className="text-ink-3">De påverkar inte näringsvärdet nämnvärt.</span>
        </p>
      )}
      <div className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-3">
        <Scale aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {weight.cooked
            ? `Färdig vikt ${formatGrams(weight.final * factor)} (rå ${formatGrams(weight.raw * factor)}). `
            : weight.rawUnits
              ? `Total vikt ca ${formatGrams(weight.final * factor)} (rå ${formatGrams(weight.raw * factor)}). `
              : `Total vikt ${formatGrams(weight.raw * factor)}. `}
          {cookedWeightText(weight)}
        </span>
      </div>
    </Card>
  )
}
