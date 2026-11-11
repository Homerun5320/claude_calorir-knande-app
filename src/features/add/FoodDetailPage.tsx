/**
 * Livsmedlets detaljsida – /livsmedel/:id?maltid=frukost&datum=2026-09-26
 *
 * Allt om ett livsmedel på ett ställe: var värdena kommer ifrån, välj mängd och lägg till,
 * energi och makron per portion eller 100 g, näringsämnen mot NNR 2023, Tallriksmodellen,
 * kostråden, klimatavtryck, märkningar och Open Food Facts-information. Samlingsvärden (genomsnitt
 * av vanliga märken) hänvisar till streckkoden för exakta värden, och tillagade livsmedel med
 * `rawWeight` förklarar att man kan väga rått.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  BookOpen,
  Car,
  ChefHat,
  Copy,
  Heart,
  Leaf,
  Pencil,
  Plus,
  Scale,
  ScanBarcode,
  ShieldCheck,
  Trash2,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { Food, FoodSource, Nutrients } from '../../types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ExternalLink,
  IconButton,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  confirmDialog,
  cx,
  toast,
} from '../../components/ui'
import { DonutChart } from '../../components/charts'
import { PlateModel } from '../../components/signature'
import { CategoryIcon, CATEGORY_META, EnergyValue, NutrientTable } from '../../components/domain'
import { PortionPicker, mindfulPortionLabel, type PortionSelection } from '../../components/domain/PortionPicker'
import { useFood } from '../../hooks/useFood'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { latestWeight, useBodyStore } from '../../stores/bodyStore'
import { referenceIntakes, type ReferenceMap } from '../../lib/nnr'
import { completeness, KCAL_PER_G, nutrientsForGrams } from '../../lib/nutrients'
import { formatGrams, formatNumber } from '../../lib/format'
import { ageFromBirthYear, relativeDayLabel } from '../../lib/dates'
import { mealName } from '../../lib/meals'
import { foodPlate, PLATE_PART_LABELS, type PlatePart } from '../../lib/plate'
import { co2eEquivalents, foodClimateFactor } from '../../lib/climate'
import { gramsFor, unitLabel } from '../../lib/units'
import { hasUsableNutrition, offAttributionText, offProductUrl } from '../../lib/openFoodFacts'
import { traceNames } from '../../lib/allergens'
import {
  TAG_LABELS,
  decodeFoodId,
  foodClimateLevel,
  foodEditHref,
  kostradContributions,
  newFoodHref,
  novaInfo,
  nutriScoreInfo,
  parseAddParams,
  scanHref,
  sourceMeta,
} from './addLogic'
import { useAddFood } from './useAddFood'
import { FoodSourceBadge, MealChips, nutriScoreTextClass, useLeave } from './components'
import { PregnancyNote } from './PregnancyNote'
import { AllergenFlags, useAllergenProfile } from './AllergenFlags'

type Basis = 'portion' | '100g'

export default function FoodDetailPage() {
  const { id: rawId } = useParams()
  const id = decodeFoodId(rawId)
  const { food, loading, error } = useFood(id)

  if (!food) {
    return (
      <div className="px-4 pb-10">
        <PageHeader back title={loading ? 'Livsmedel' : 'Hittades inte'} />
        {loading ? (
          <div className="flex flex-col gap-4" role="status" aria-busy="true">
            <span className="sr-only">Laddar livsmedlet …</span>
            <div className="card flex items-center gap-4 p-5">
              <Skeleton circle className="size-20" />
              <SkeletonText lines={2} className="flex-1" />
            </div>
            <Skeleton className="h-72 w-full rounded-[1.5rem]" />
            <Skeleton className="h-48 w-full rounded-[1.5rem]" />
          </div>
        ) : (
          <EmptyState
            illustration="search"
            title="Livsmedlet hittades inte"
            text={error ?? 'Det kan ha tagits bort, eller så är länken felaktig.'}
            action={
              <Button variant="soft" to="/lagg-till">
                Sök livsmedel
              </Button>
            }
          />
        )}
      </div>
    )
  }
  return <FoodDetail key={food.id} food={food} />
}

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

function FoodDetail({ food }: { food: Food }) {
  const navigate = useNavigate()
  const location = useLocation()
  const leave = useLeave()
  const reduce = useReducedMotion()
  const [params, setParams] = useSearchParams()
  const today = useToday()
  const meals = useProfileStore((s) => s.settings.meals)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const showClimate = useProfileStore((s) => s.settings.showClimate)
  const isFavorite = useFoodStore((s) => s.favorites.includes(food.id))
  const toggleFavorite = useFoodStore((s) => s.toggleFavorite)
  const removeCustomFood = useFoodStore((s) => s.removeCustomFood)
  const references = useReferences()
  const { addFood } = useAddFood()
  // Med en allergiprofil visas inte egenskaperna Glutenfri/Laktosfri som egna märken: de har ingen
  // källa (Lagoms, recept och egna livsmedel) och laktosfri betyder inte mjölkfri. Produktens
  // märkning citeras i stället med källa av allergiflaggorna ("Märkt laktosfri enligt Open Food Facts").
  const allergyProfile = useAllergenProfile().length > 0
  const shownTags = useMemo(
    () => (allergyProfile ? (food.tags ?? []).filter((t) => t !== 'glutenfri' && t !== 'laktosfri') : (food.tags ?? [])),
    [allergyProfile, food.tags],
  )

  const { date, meal } = useMemo(() => parseAddParams(params, meals, today), [params, meals, today])
  const fromAdd = (location.state as { from?: string } | null)?.from === 'lagg-till'
  const [sel, setSel] = useState<PortionSelection | null>(null)
  const [basis, setBasis] = useState<Basis>('portion')
  const [showNumbers, setShowNumbers] = useState(false)

  const liquid = food.liquid === true
  const per = liquid ? '100\u00A0ml' : '100\u00A0g'
  const portionGrams = sel && Number.isFinite(sel.grams) && sel.grams > 0 ? sel.grams : undefined
  const useBasis: Basis = basis === 'portion' && portionGrams ? 'portion' : '100g'
  const grams = useBasis === 'portion' && portionGrams ? portionGrams : 100
  const shown: Nutrients = useMemo(() => nutrientsForGrams(food.nutrients, grams), [food.nutrients, grams])
  const caption = useBasis === 'portion' ? `Per portion (${formatGrams(grams)})` : `Per ${per}`
  // Rubrikerna (`.eyebrow`) skrivs med versaler – enheten ska ändå stå som "g", inte "G".
  const captionNode: ReactNode =
    useBasis === 'portion' ? (
      <>
        Per portion <span className="whitespace-nowrap normal-case">({formatGrams(grams)})</span>
      </>
    ) : (
      <>
        Per <span className="whitespace-nowrap normal-case">{per}</span>
      </>
    )
  const complete = completeness(food.nutrients)
  const usable = hasUsableNutrition(food)
  const recipeId = food.source === 'recipe' ? food.id.replace(/^recipe:/, '') : null

  const setMeal = (m: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('maltid', m)
        return next
      },
      { replace: true },
    )

  const confirmAdd = (amount: number, unit: PortionSelection['unit']) => {
    const entry = addFood(food, amount, unit, { date, meal })
    if (entry) leave(fromAdd ? '/lagg-till' : date === today ? '/' : `/dagbok/${date}`)
  }

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Ta bort ${food.name}?`,
      message: 'Livsmedlet försvinner från dina egna livsmedel. Det du redan har loggat i dagboken finns kvar.',
      confirmLabel: 'Ta bort',
      tone: 'danger',
    })
    if (!ok) return
    removeCustomFood(food.id)
    toast('Livsmedlet är borttaget', { tone: 'success' })
    leave('/lagg-till?flik=mina')
  }

  const favoriteButton = (
    <IconButton
      icon={<Heart className={cx('size-5', isFavorite && 'fill-current')} aria-hidden />}
      aria-label={isFavorite ? 'Ta bort från favoriter' : 'Spara som favorit'}
      pressed={isFavorite}
      onClick={() => {
        toggleFavorite(food.id)
        toast(isFavorite ? 'Borttagen från favoriter' : 'Sparad som favorit', { tone: 'success' })
      }}
      className={isFavorite ? 'text-lingon' : undefined}
    />
  )

  return (
    <div className="px-4 pb-12">
      <PageHeader
        back
        title={food.name}
        subtitle={[food.brand, food.extra?.quantity].filter(Boolean).join(' · ') || undefined}
        actions={
          <>
            {food.source === 'custom' && <IconButton icon={Pencil} aria-label="Redigera livsmedlet" onClick={() => navigate(foodEditHref(food.id))} />}
            {favoriteButton}
          </>
        }
      />

      <div className="flex flex-col gap-4">
        {/* Hjälte och ursprung */}
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          aria-label="Om livsmedlet"
          className="card flex flex-col gap-4 p-5"
        >
          <div className="flex items-center gap-4">
            <Hero food={food} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <FoodSourceBadge source={food.source} />
                <Badge tone="neutral">{CATEGORY_META[food.category]?.label ?? 'Övrigt'}</Badge>
              </div>
              {!mindful && food.nutrients.kcal !== undefined && (
                <p className="mt-2 text-sm text-ink-2">
                  <EnergyValue kcal={food.nutrients.kcal} className="font-semibold text-ink" /> per {per}
                </p>
              )}
            </div>
          </div>
          <Provenance
            source={food.source}
            note={food.isAverage ? undefined : food.note}
            lmvNumber={food.lmvNumber}
            brand={food.brand}
            isAverage={food.isAverage}
            averageFromLmv={food.isAverage === true && averageUsesLmvValues(food.note)}
          />
          {food.isAverage && (
            <div className="flex flex-col items-start gap-3 rounded-2xl bg-sol-soft px-4 py-3 text-sm" role="note" aria-labelledby="samlingsvarde-rubrik">
              <div>
                <p id="samlingsvarde-rubrik" className="font-semibold text-ink">
                  Samlingsvärde
                </p>
                <p className="mt-1 text-ink-2">{averageNoteText(food.note)}</p>
              </div>
              <Button variant="soft" size="sm" iconLeft={ScanBarcode} to={scanHref({ meal, date })} state={{ from: 'lagg-till' }}>
                Skanna streckkod
              </Button>
            </div>
          )}
          {food.rawWeight && <RawWeightNote food={food} />}
          <PregnancyNote food={food} />
          <AllergenFlags food={food} />
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs text-ink-2">
              <span>Näringsdata</span>
              <span className="tabular-nums">{formatNumber(complete * 100)}{'\u00a0'}% kända värden</span>
            </div>
            <ProgressBar value={complete * 100} max={100} size="xs" tone={complete >= 0.6 ? 'mossa' : complete >= 0.3 ? 'sol' : 'hjortron'} aria-label="Andel kända näringsvärden" />
            {complete < 0.3 && <p className="mt-1.5 text-xs text-ink-3">Bara grundvärdena är kända. Okända ämnen visas som ”–”, aldrig som noll.</p>}
          </div>
          {shownTags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Egenskaper">
              {shownTags.map((t) => (
                <li key={t}>
                  <Badge tone={t === 'nyckelhal' ? 'gran' : t === 'vegan' || t === 'vegetarisk' ? 'mossa' : 'neutral'} icon={t === 'nyckelhal' ? ShieldCheck : t === 'vegan' || t === 'vegetarisk' ? Leaf : undefined}>
                    {TAG_LABELS[t]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </motion.section>

        {/* Lägg till */}
        <Card title={`Lägg till i ${mealName(meals, meal)}`} eyebrow={relativeDayLabel(date, today)} padding="lg">
          <MealChips value={meal} onChange={setMeal} className="mb-4" />
          {!usable && (
            <p className="mb-4 rounded-2xl bg-hjortron-soft px-4 py-3 text-sm text-ink">
              Näringsvärden saknas. Du kan lägga till livsmedlet ändå, men det räknas inte in i dagens energi förrän du kompletterar värdena.
            </p>
          )}
          <PortionPicker food={food} onChange={setSel} onConfirm={confirmAdd} confirmLabel={`Lägg till i ${mealName(meals, meal)}`} confirmIcon={Plus} />
        </Card>

        {/* Energi och makron */}
        <Card
          title="Energi och makron"
          action={
            <SegmentedControl<Basis>
              size="sm"
              value={useBasis}
              onChange={setBasis}
              aria-label="Visa värden per"
              options={[
                { value: 'portion', label: 'Portion', disabled: !portionGrams },
                { value: '100g', label: per },
              ]}
            />
          }
        >
          <MacroSummary nutrients={shown} mindful={mindful} caption={captionNode} />
        </Card>

        {/* Näringsämnen */}
        <Card title="Näringsämnen" eyebrow={references ? 'Jämfört med NNR 2023' : undefined}>
          {mindful && !showNumbers ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink-2">Medvetet läge är på, så siffrorna är dolda. Du kan visa dem för just det här livsmedlet.</p>
              <Button variant="soft" size="sm" onClick={() => setShowNumbers(true)}>
                Visa näringsvärden
              </Button>
            </div>
          ) : (
            <>
              <NutrientTable nutrients={shown} references={references} caption={caption} showStatus={false} />
              <p className="mt-3 text-xs leading-relaxed text-ink-3">
                {references
                  ? '% av RI visar hur stor del av ditt dagliga referensintag (NNR 2023) mängden ger. Ett enskilt livsmedel behöver inte täcka hela behovet – det är helheten över veckan som räknas.'
                  : 'Fyll i din profil för att se hur mycket av ditt dagliga behov (NNR 2023) mängden ger.'}
              </p>
            </>
          )}
        </Card>

        <PlateCard food={food} />

        <KostradCard food={food} grams={grams} caption={captionNode} />

        {showClimate && <ClimateCard food={food} grams={grams} caption={captionNode} />}

        {food.extra && <ProductCard food={food} />}

        {food.portions.length > 0 && (
          <Card title="Portioner och mått">
            <ul className="divide-y divide-line/70">
              {food.portions.map((p) => {
                const g = gramsFor(food, 1, `portion:${p.id}`)
                const n = nutrientsForGrams(food.nutrients, g)
                return (
                  <li key={p.id} className="flex min-h-12 items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 text-ink">{unitLabel(food, `portion:${p.id}`)}</span>
                    <span className="shrink-0 text-right tabular-nums text-ink-2">
                      {formatGrams(g)}
                      {!mindful && n.kcal !== undefined && (
                        <>
                          {' · '}
                          <EnergyValue kcal={n.kcal} unitClassName="" />
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {food.density !== undefined && (
              <p className="mt-2 text-xs text-ink-3">1{'\u00a0'}dl väger ca <span className="whitespace-nowrap">{formatGrams(food.density * 100)}</span> – därför går det att ange mängden i dl, msk och tsk.</p>
            )}
          </Card>
        )}

        {/* Åtgärder */}
        <div className="flex flex-col gap-2 pt-2">
          {recipeId && (
            <Button variant="outline" iconLeft={ChefHat} to={`/recept/${encodeURIComponent(recipeId)}`} fullWidth>
              Öppna receptet
            </Button>
          )}
          {food.source === 'custom' ? (
            <>
              <Button variant="outline" iconLeft={Pencil} to={foodEditHref(food.id)} fullWidth>
                Redigera
              </Button>
              <Button variant="ghost" iconLeft={Trash2} onClick={remove} fullWidth className="text-lingon">
                Ta bort livsmedlet
              </Button>
            </>
          ) : (
            food.source !== 'recipe' && (
              <Button variant="outline" iconLeft={Copy} to={newFoodHref({ copyOf: food.id, meal, date })} fullWidth>
                Kopiera och redigera
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delar
// ---------------------------------------------------------------------------

function Hero({ food }: { food: Food }) {
  const [failed, setFailed] = useState(false)
  if (food.imageUrl && !failed) {
    return (
      <img
        src={food.imageUrl}
        alt={`Förpackningen för ${food.name}`}
        onError={() => setFailed(true)}
        className="size-20 shrink-0 rounded-[1.5rem] bg-surface-2 object-contain"
        loading="lazy"
        decoding="async"
      />
    )
  }
  return <CategoryIcon category={food.category} size="xl" labelled />
}

/**
 * Tillagat som standard: "Värdena gäller tillagad vara. Väger du rått kan du välja ”g rå” – Lagom
 * räknar om (1 g rå ≈ 0,75 g tillagat)."
 */
function RawWeightNote({ food }: { food: Food }) {
  const rw = food.rawWeight
  if (!rw || !(rw.factor > 0)) return null
  const units = [unitLabel(food, 'g-ra'), ...(rw.density ? [unitLabel(food, 'dl-ra')] : [])].map((u) => `”${u}”`).join(' eller ')
  const kind = unitLabel(food, 'g-ra').replace(/^g /, '')
  // "Väger du rått", "Väger eller mäter du okokt" (när "dl okokt" finns), "Väger du fryst".
  const neuter = rw.kind === 'ra' ? 'rått' : rw.kind === 'torkad' ? 'torkat' : kind
  const verb = `${rw.density ? 'Väger eller mäter du' : 'Väger du'} ${neuter}`
  return (
    <p className="flex items-start gap-2.5 text-sm text-ink-2">
      <Scale className="mt-0.5 size-4 shrink-0 text-gran" aria-hidden />
      <span>
        Värdena gäller tillagad vara. {verb} kan du välja {units} när du lägger till – Lagom räknar om till tillagad vikt (1{'\u00a0'}g {kind} ≈{' '}
        {formatNumber(rw.factor, 2)}
        {'\u00a0'}g tillagat).
      </span>
    </p>
  )
}

/** Samlingsvärdets förklaring utan ett inledande "Samlingsvärde:" – rubriken står redan ovanför. */
function averageNoteText(note: string | undefined): string {
  const text = note?.replace(/^\s*Samlingsvärde\s*:\s*/i, '').trim()
  if (!text) return 'Genomsnitt av vanliga märken i svenska butiker. Skanna streckkoden för exakta värden för ditt märke.'
  return text.charAt(0).toLocaleUpperCase('sv-SE') + text.slice(1)
}

/** true när samlingsvärdet är Livsmedelsverkets värde för produkttypen (inte Lagoms eget genomsnitt). */
function averageUsesLmvValues(note: string | undefined): boolean {
  return /^\s*Samlingsvärde\s*:\s*Livsmedelsverkets/i.test(note ?? '')
}

const PROVENANCE_ICON: Record<FoodSource, LucideIcon> = {
  lagom: ShieldCheck,
  livsmedelsverket: ShieldCheck,
  openfoodfacts: Users,
  custom: Pencil,
  recipe: BookOpen,
}

/**
 * Var värdena kommer ifrån. Lagoms livsmedel som länkar till Livsmedelsverket har dess värden
 * (saknade näringsämnen fylls i från den länkade posten); märkesvaror behåller förpackningens.
 * Samlingsvärden är Lagoms genomsnitt (se rutan "Samlingsvärde") – den länkade posten fyller bara
 * i näringsämnen som saknas.
 */
function provenanceText(
  source: FoodSource,
  lmvNumber: number | undefined,
  brand: string | undefined,
  isAverage?: boolean,
  averageFromLmv?: boolean,
): string {
  if (source === 'lagom' && lmvNumber !== undefined) {
    if (brand) return `Näringsvärden från förpackningen, kompletterade med Livsmedelsverkets livsmedelsdatabas (nr ${lmvNumber}).`
    if (isAverage && averageFromLmv) {
      return `Samlingsvärde med Livsmedelsverkets värde för produkttypen (nr ${lmvNumber}), med svenska portioner och mått från Lagom.`
    }
    if (isAverage) return `Samlingsvärde från Lagom, kompletterat med Livsmedelsverkets livsmedelsdatabas (nr ${lmvNumber}).`
    return `Värden från Livsmedelsverkets livsmedelsdatabas (nr ${lmvNumber}), med svenska portioner och mått från Lagom.`
  }
  if (source === 'lagom' && isAverage) return 'Samlingsvärde från Lagom – genomsnitt av vanliga märken i svenska butiker.'
  return sourceMeta(source).provenance
}

function Provenance({
  source,
  note,
  lmvNumber,
  brand,
  isAverage,
  averageFromLmv,
}: {
  source: FoodSource
  note?: string
  lmvNumber?: number
  brand?: string
  isAverage?: boolean
  averageFromLmv?: boolean
}) {
  const meta = sourceMeta(source)
  const Icon = PROVENANCE_ICON[source] ?? ShieldCheck
  const linkedCurated = source === 'lagom' && lmvNumber !== undefined
  // Produkter från Open Food Facts har noten "Från Open Food Facts – jämför gärna med förpackningen."
  // – källan står redan i raden ovanför, så den meningen visas inte två gånger.
  const shownNote = source === 'openfoodfacts' ? note?.replace(/^\s*Från Open Food Facts\b[^.]*\.\s*/, '').trim() : note
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl px-4 py-3 text-sm', meta.crowdSourced ? 'bg-hjortron-soft' : 'bg-surface-2')}>
      <Icon className={cx('mt-0.5 size-4 shrink-0', meta.crowdSourced ? 'text-hjortron' : 'text-gran')} aria-hidden />
      <div className="min-w-0 text-ink-2">
        <p className="text-ink">{provenanceText(source, lmvNumber, brand, isAverage, averageFromLmv)}</p>
        {lmvNumber !== undefined && !linkedCurated && <p className="mt-1 text-xs">Livsmedelsnummer {lmvNumber} i Livsmedelsverkets databas.</p>}
        {shownNote && <p className="mt-1 text-xs">{shownNote}</p>}
      </div>
    </div>
  )
}

const MACRO_SEGMENTS = [
  { key: 'protein', label: 'Protein', color: 'var(--lg-lingon)', dot: 'bg-protein' },
  { key: 'carbs', label: 'Kolhydrater', color: 'var(--lg-hjortron)', dot: 'bg-carbs' },
  { key: 'fat', label: 'Fett', color: 'var(--lg-blabar)', dot: 'bg-fat' },
  { key: 'alcohol', label: 'Alkohol', color: 'var(--lg-vinbar)', dot: 'bg-vinbar' },
] as const

function macroEnergy(n: Nutrients): Record<(typeof MACRO_SEGMENTS)[number]['key'], number> {
  return {
    protein: (n.protein ?? 0) * KCAL_PER_G.protein,
    carbs: (n.carbs ?? 0) * KCAL_PER_G.carbs + (n.fiber ?? 0) * KCAL_PER_G.fiber,
    fat: (n.fat ?? 0) * KCAL_PER_G.fat,
    alcohol: (n.alcohol ?? 0) * KCAL_PER_G.alcohol,
  }
}

function MacroSummary({ nutrients, mindful, caption }: { nutrients: Nutrients; mindful: boolean; caption: ReactNode }) {
  const e = macroEnergy(nutrients)
  const total = e.protein + e.carbs + e.fat + e.alcohol
  const segments = MACRO_SEGMENTS.filter((m) => m.key !== 'alcohol' || e.alcohol > 0).map((m) => ({ key: m.key, label: m.label, value: e[m.key], color: m.color }))
  const known = nutrients.protein !== undefined || nutrients.carbs !== undefined || nutrients.fat !== undefined

  return (
    <div>
      <div className="eyebrow mb-3">{caption}</div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <DonutChart
          segments={known && total > 0 ? segments : []}
          size={148}
          thickness={14}
          legend="none"
          title="Energifördelning"
          hideNumbers={mindful}
          summary={
            known && total > 0
              ? `Energifördelning: ${segments.map((s) => `${s.label.toLowerCase()} ${formatNumber((s.value / total) * 100)} procent`).join(', ')}`
              : 'Makronäringsämnen saknas'
          }
        >
          <div className="text-center">
            {mindful ? (
              <span className="px-3 text-sm font-semibold leading-tight text-ink">{mindfulPortionLabel(nutrients.kcal)}</span>
            ) : (
              <>
                <EnergyValue kcal={nutrients.kcal} display className="block text-2xl font-semibold text-ink" unitClassName="block text-xs font-medium text-ink-3" />
              </>
            )}
          </div>
        </DonutChart>
        <dl className="grid w-full flex-1 grid-cols-1 gap-2">
          {MACRO_SEGMENTS.filter((m) => m.key !== 'alcohol' || e.alcohol > 0).map((m) => {
            const g = nutrients[m.key]
            const pct = total > 0 ? (e[m.key] / total) * 100 : undefined
            return (
              <div key={m.key} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                <dt className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                  <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', m.dot)} />
                  <span className="min-w-0 break-words">{m.label}</span>
                </dt>
                <dd className="ml-auto text-right text-sm tabular-nums text-ink">
                  {mindful ? (
                    pct !== undefined ? (
                      <span className="text-ink-2">{pct >= 40 ? 'Stor del' : pct >= 15 ? 'En del' : 'Liten del'}</span>
                    ) : (
                      '–'
                    )
                  ) : (
                    <>
                      <span className="font-semibold">{g !== undefined ? `${formatNumber(g, g < 10 ? 1 : 0)}\u00a0g` : '–'}</span>
                      {pct !== undefined && g !== undefined && <span className="ml-2 whitespace-nowrap text-ink-3">{formatNumber(pct)}{'\u00a0'}E%</span>}
                    </>
                  )}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
      {!known && <p className="mt-3 text-sm text-ink-3">Makronäringsämnena är okända för det här livsmedlet.</p>}
    </div>
  )
}

const PLATE_PARTS: PlatePart[] = ['veg', 'carb', 'protein']

function PlateCard({ food }: { food: Food }) {
  const split = foodPlate(food)
  const parts = PLATE_PARTS.filter((p) => split[p] >= 0.05)
  const onPlate = split.veg + split.carb + split.protein
  return (
    <Card title="Tallriksmodellen" eyebrow="Livsmedelsverket">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <PlateModel fractions={{ veg: split.veg, carb: split.carb, protein: split.protein }} size={168} showLabels={false} cutlery={false} empty={onPlate < 0.05} />
        <div className="w-full flex-1 text-sm">
          {parts.length === 0 ? (
            <p className="text-ink-2">
              Ingår inte i tallrikens tre delar – till exempel dryck, matfett, sås eller något sött. Helt okej som komplement till måltiden.
            </p>
          ) : (
            <>
              <p className="mb-2 text-ink-2">Räknas till:</p>
              <ul className="flex flex-col gap-1.5">
                {parts.map((p) => (
                  <li key={p} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                    <span className="text-ink">{PLATE_PART_LABELS[p].label}</span>
                    {parts.length > 1 && <span className="tabular-nums text-ink-3">{formatNumber(split[p] * 100)}{'\u00a0'}%</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}

function KostradCard({ food, grams, caption }: { food: Food; grams: number; caption: ReactNode }) {
  const list = useMemo(() => kostradContributions(food, grams), [food, grams])
  if (list.length === 0) return null
  return (
    <Card title="Kostråden" eyebrow={caption}>
      <ul className="flex flex-col gap-3">
        {list.map((c) => (
          <li key={c.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold text-ink">{c.label}</span>
              <span className="text-right text-xs text-ink-2">{c.text}</span>
            </div>
            {c.share !== undefined && <ProgressBar value={Math.min(1, c.share) * 100} max={100} size="xs" tone={c.tone} aria-label={`${c.label}: ${c.text}`} />}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-3">Enligt Livsmedelsverkets kostråd för vuxna (2025).</p>
    </Card>
  )
}

function ClimateCard({ food, grams, caption }: { food: Food; grams: number; caption: ReactNode }) {
  const factor = foodClimateFactor(food)
  const kg = (factor.kgPerKg * grams) / 1000
  const eq = co2eEquivalents(kg)
  const level = foodClimateLevel(factor.kgPerKg)
  const car = eq.carKm < 1 ? `${formatNumber(Math.max(10, Math.round((eq.carKm * 1000) / 10) * 10))}\u00a0meter` : `${formatNumber(eq.carKm, 1)}\u00a0km`
  return (
    <Card title="Klimatavtryck" eyebrow={caption}>
      {/* flex-wrap: vid stor text (200 %) hamnar märket under siffran i stället för utanför kortet. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* Två decimaler under 0,1 kg; väldigt små mängder visas som "< 0,01". */}
          <span className="display-num text-4xl font-semibold text-ink">{kg > 0 && kg < 0.005 ? `< ${formatNumber(0.01, 2)}` : formatNumber(kg, kg < 0.1 ? 2 : 1)}</span>{' '}
          <span className="text-sm font-medium text-ink-3">kg CO₂e</span>
        </div>
        <Badge tone={level.tone} icon={Leaf} size="md">
          {level.label}
        </Badge>
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
        <Car className="size-5 shrink-0 text-ink-3" aria-hidden />
        <span>Ungefär som att köra {car} med en genomsnittlig svensk personbil.</span>
      </div>
      <p className="mt-3 text-xs text-ink-3">
        {formatNumber(factor.kgPerKg, 1)}{'\u00a0'}kg{'\u00a0'}CO₂e per kg · Källa: {factor.source}
      </p>
    </Card>
  )
}

function ProductCard({ food }: { food: Food }) {
  const x = food.extra ?? {}
  const nutri = nutriScoreInfo(x.nutriscore)
  const nova = novaInfo(x.nova)
  const traces = traceNames(food)
  const hasAny =
    nutri || nova || x.ingredientsText || (x.allergens && x.allergens.length) || traces.length > 0 || (x.labels && x.labels.length) || x.origin || x.quantity
  if (!hasAny) return null
  return (
    <Card title="Produktinformation" eyebrow={food.source === 'openfoodfacts' ? 'Open Food Facts' : undefined}>
      <div className="flex flex-col gap-4 text-sm">
        {(nutri || nova) && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {nutri && (
              <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <span className="flex shrink-0 overflow-hidden rounded-xl" aria-hidden>
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((g) => (
                    <span
                      key={g}
                      className={cx(
                        'grid w-6 place-items-center font-display text-sm font-bold',
                        g === nutri.grade ? cx('h-9 scale-y-110 bg-(--tone)', nutriScoreTextClass(nutri.tone)) : 'h-7 self-center bg-surface-3 text-ink-3',
                      )}
                      style={g === nutri.grade ? ({ '--tone': `var(--lg-${nutri.tone})` } as CSSProperties) : undefined}
                    >
                      {g}
                    </span>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">Nutri-Score {nutri.grade}</span>
                  <span className="block text-xs text-ink-3">Jämför produkter inom samma kategori, från A till{'\u00a0'}E.</span>
                </span>
              </div>
            )}
            {nova && (
              <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-3 font-display text-lg font-bold text-ink" aria-hidden>
                  {nova.group}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    NOVA {nova.group} · {nova.label}
                  </span>
                  <span className="block text-xs text-ink-3">{nova.description}</span>
                </span>
              </div>
            )}
          </div>
        )}
        {x.allergens && x.allergens.length > 0 && (
          <div>
            <h3 className="eyebrow mb-1.5">Allergener</h3>
            <ul className="flex flex-wrap gap-1.5">
              {x.allergens.map((a) => (
                <li key={a}>
                  <Badge tone="hjortron">{a}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {traces.length > 0 && (
          <div>
            <h3 className="eyebrow mb-1.5">Kan innehålla spår av</h3>
            <ul className="flex flex-wrap gap-1.5">
              {traces.map((t) => (
                <li key={t}>
                  <Badge tone="neutral">{t}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {x.ingredientsText && (
          <div>
            <h3 className="eyebrow mb-1.5">Ingredienser</h3>
            <p className="leading-relaxed text-ink-2">{x.ingredientsText}</p>
          </div>
        )}
        {x.labels && x.labels.length > 0 && (
          <div>
            <h3 className="eyebrow mb-1.5">Märkningar</h3>
            <ul className="flex flex-wrap gap-1.5">
              {x.labels.map((l) => (
                <li key={l}>
                  <Badge tone="mossa">{l}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {(x.quantity || x.origin || food.barcode) && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-2">
            {x.quantity && (
              <>
                <dt className="text-ink-3">Förpackning</dt>
                <dd>{x.quantity}</dd>
              </>
            )}
            {x.origin && (
              <>
                <dt className="text-ink-3">Ursprung</dt>
                <dd>{x.origin}</dd>
              </>
            )}
            {food.barcode && (
              <>
                <dt className="text-ink-3">Streckkod</dt>
                <dd className="tabular-nums">{food.barcode}</dd>
              </>
            )}
          </dl>
        )}
        {food.source === 'openfoodfacts' && (
          <div className="flex items-start gap-2 text-xs text-ink-3">
            <UtensilsCrossed className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <div>
              <p>{offAttributionText(Boolean(food.imageUrl))}</p>
              {food.barcode && (
                <ExternalLink
                  href={offProductUrl(food.barcode)}
                  className="inline-flex min-h-11 items-center gap-1 font-semibold text-gran underline-offset-4 hover:underline"
                >
                  Visa produkten hos Open Food Facts
                </ExternalLink>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
