/**
 * Receptredigeraren (/recept/nytt och /recept/:id/redigera).
 *
 * Namn, emoji, portioner, tid, ingredienser (sök → portionsväljare → rad), direkt uträknad näring
 * per portion och för hela receptet, tillagad vikt (löser problemet med rå- och tillagad vikt),
 * instruktioner och märkningar. Sparas i `useFoodStore.saveRecipe` med id 'r_<uid>'.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChefHat, Copy, Info, Save, Scale, Sparkles, UtensilsCrossed } from 'lucide-react'
import type { Food, FoodTag, Recipe, RecipeIngredient, UnitKey } from '../../types'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  NumberField,
  PageHeader,
  Stepper,
  TextField,
  confirmDialog,
  cx,
  toast,
} from '../../components/ui'
import { EnergyValue } from '../../components/domain'
import { mindfulPortionLabel } from '../../components/domain/PortionPicker'
import { useFoodStore } from '../../stores/foodStore'
import { useProfileStore } from '../../stores/profileStore'
import { findRecipe } from '../../lib/foodRepo'
import { recipeFoodId, recipePerServing, recipeTotals } from '../../lib/recipes'
import { formatGrams, formatNumber } from '../../lib/format'
import { isBuiltinRecipeId } from '../../data/recipes'
import {
  EDITABLE_TAGS,
  MAX_SERVINGS,
  RECIPE_EMOJIS,
  TAG_LABELS,
  copyRecipe,
  cookedWeightWarning,
  draftFromRecipe,
  emptyDraft,
  hasErrors,
  isDraftDirty,
  makeIngredient,
  recipeFromDraft,
  validateDraft,
  weightInfo,
  type RecipeDraft,
} from './recipeLogic'
import { useRecipe } from './useRecipes'
import { RecipeEmoji } from './components'
import { AmountSheet, IngredientRow, IngredientSearch, type IngredientSearchHandle, type PickerState } from './IngredientPicker'

export default function RecipeEditorPage() {
  const { id } = useParams()
  if (id === undefined) return <RecipeEditor key="nytt" />
  if (isBuiltinRecipeId(id)) return <BuiltinNotEditable id={id} />
  return <EditExisting id={id} />
}

function EditExisting({ id }: { id: string }) {
  const recipe = useFoodStore((s) => findRecipe(s.recipes, id))
  if (!recipe) {
    return (
      <div className="px-4 pt-safe">
        <PageHeader backTo="/recept" backLabel="Till recepten" title="Receptet hittades inte" />
        <div className="card">
          <EmptyState
            illustration="search"
            title="Här fanns inget recept"
            text="Det kan ha tagits bort. Du kan skapa ett nytt i stället."
            action={
              <Button variant="soft" to="/recept/nytt" iconLeft={ChefHat}>
                Nytt recept
              </Button>
            }
          />
        </div>
      </div>
    )
  }
  return <RecipeEditor key={recipe.id} existing={recipe} />
}

/** Klassiker kan inte ändras – erbjud en kopia i stället. */
function BuiltinNotEditable({ id }: { id: string }) {
  const navigate = useNavigate()
  const saveRecipe = useFoodStore((s) => s.saveRecipe)
  const { recipe, loading } = useRecipe(id)
  const copy = () => {
    if (!recipe) return
    const own = copyRecipe(recipe)
    saveRecipe(own)
    toast('Kopierat till Mina recept', { tone: 'success' })
    navigate(`/recept/${encodeURIComponent(own.id)}/redigera`, { replace: true })
  }
  return (
    <div className="px-4 pt-safe">
      <PageHeader back title="Redigera klassiker" />
      <div className="card">
        <EmptyState
          illustration="forest"
          title="Klassikerna är skrivskyddade"
          text="Gör en egen kopia så kan du ändra mängder, portioner och instruktioner precis som du vill."
          action={
            <Button iconLeft={Copy} onClick={copy} loading={loading} disabled={!loading && !recipe}>
              Kopiera till mina recept
            </Button>
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Redigeraren
// ---------------------------------------------------------------------------

/** Sätts i `location.state` när redigeraren öppnas från receptsidan – då går "Spara" tillbaka dit. */
export interface EditorLocationState {
  fromDetail?: boolean
}

function RecipeEditor({ existing }: { existing?: Recipe }) {
  const navigate = useNavigate()
  const location = useLocation()
  const fromDetail = (location.state as EditorLocationState | null)?.fromDetail === true
  const reduce = useReducedMotion()
  const saveRecipe = useFoodStore((s) => s.saveRecipe)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const nameId = useId()

  const [original] = useState<RecipeDraft>(() => (existing ? draftFromRecipe(existing) : emptyDraft()))
  const [draft, setDraft] = useState<RecipeDraft>(original)
  const [submitted, setSubmitted] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [announce, setAnnounce] = useState('')
  const savedRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<IngredientSearchHandle>(null)
  const refocusSearch = useRef(false)

  const update = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const errors = useMemo(() => validateDraft(draft), [draft])
  const shownErrors = submitted ? errors : {}
  const dirty = isDraftDirty(draft, original)

  // Fråga innan ändringar går förlorade (tillbaka-knapp, bottenmeny, länkar).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirmDialog({
      title: 'Lämna utan att spara?',
      message: 'Dina ändringar i receptet sparas inte.',
      confirmLabel: 'Lämna',
      cancelLabel: 'Fortsätt redigera',
      tone: 'danger',
    }).then((ok) => {
      asking.current = false
      if (ok) blocker.proceed()
      else blocker.reset()
    })
  }, [blocker])

  // Live-summering.
  const totals = useMemo(() => recipeTotals({ ingredients: draft.ingredients }), [draft.ingredients])
  const perServing = useMemo(
    () => recipePerServing({ ingredients: draft.ingredients, servings: draft.servings }),
    [draft.ingredients, draft.servings],
  )
  const weight = useMemo(
    () => weightInfo({ ingredients: draft.ingredients, cookedWeightG: draft.cookedWeightG, servings: draft.servings }),
    [draft.ingredients, draft.cookedWeightG, draft.servings],
  )
  const weightWarning = cookedWeightWarning(weight.raw, draft.cookedWeightG)
  const excludeId = existing ? recipeFoodId(existing.id) : undefined

  // --- Ingredienser --------------------------------------------------------

  const openPicker = (state: PickerState) => {
    setPicker(state)
    setPickerOpen(true)
  }

  const confirmAmount = (food: Food, amount: number, unit: UnitKey, grams: number) => {
    if (!picker) return
    if (picker.mode === 'add') {
      const ing = makeIngredient(food, amount, unit, grams)
      setDraft((d) => ({ ...d, ingredients: [...d.ingredients, ing] }))
      setAnnounce(`${food.name} har lagts till.`)
      // Med mus/tangentbord: fortsätt direkt med nästa ingrediens. På mobil fälls inte tangentbordet upp.
      refocusSearch.current = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches
    } else {
      const target = picker.ingredient
      setDraft((d) => ({
        ...d,
        ingredients: d.ingredients.map((i) => (i.id === target.id ? { ...i, amount, unit, grams: Math.round(grams * 10) / 10 } : i)),
      }))
      setAnnounce(`Mängden för ${food.name} är ändrad.`)
    }
    setPickerOpen(false)
  }

  const removeIngredient = (ing: RecipeIngredient) => {
    const index = draft.ingredients.findIndex((i) => i.id === ing.id)
    setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((i) => i.id !== ing.id) }))
    toast(`${ing.food.name} är borttagen`, {
      action: {
        label: 'Ångra',
        onClick: () =>
          setDraft((d) => {
            if (d.ingredients.some((i) => i.id === ing.id)) return d
            const next = [...d.ingredients]
            next.splice(Math.min(index, next.length), 0, ing)
            return { ...d, ingredients: next }
          }),
      },
    })
  }

  // --- Spara ---------------------------------------------------------------

  const save = () => {
    setSubmitted(true)
    if (hasErrors(errors)) {
      if (errors.name) nameRef.current?.focus()
      else if (errors.ingredients) searchRef.current?.focus()
      return
    }
    const recipe = recipeFromDraft(draft, existing ? { id: existing.id, createdAt: existing.createdAt } : undefined)
    saveRecipe(recipe)
    savedRef.current = true
    toast(existing ? 'Receptet är uppdaterat' : 'Receptet är sparat', { tone: 'success' })
    if (existing && fromDetail) navigate(-1)
    else navigate(`/recept/${encodeURIComponent(recipe.id)}`, { replace: true })
  }

  const toggleTag = (tag: FoodTag) =>
    setDraft((d) => ({ ...d, tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }))

  const section = (i: number) =>
    reduce
      ? {}
      : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] as const } }

  return (
    <div className="px-4 pt-safe pb-10">
      <PageHeader
        back
        backLabel="Avbryt"
        eyebrow={existing ? 'Redigera recept' : 'Kokbok'}
        title={existing ? existing.name : 'Nytt recept'}
        compactTitle={draft.name.trim() || (existing ? existing.name : 'Nytt recept')}
        actions={
          <Button size="sm" iconLeft={Save} onClick={save}>
            Spara
          </Button>
        }
      />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        className="flex flex-col gap-4"
      >
        {/* Namn och emoji */}
        <motion.div {...section(0)}>
          <Card>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => setEmojiOpen((o) => !o)}
                aria-expanded={emojiOpen}
                aria-controls="emoji-picker"
                aria-label={`Välj emoji, nu ${draft.emoji}`}
                className="relative mt-6 shrink-0 rounded-[1.1rem] transition-transform active:scale-95"
              >
                <RecipeEmoji emoji={draft.emoji} size="md" />
                <span aria-hidden className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-gran text-[0.625rem] text-on-gran shadow-card">
                  ✎
                </span>
              </button>
              <TextField
                id={nameId}
                ref={nameRef}
                label="Namn"
                value={draft.name}
                onValueChange={(v) => update('name', v)}
                placeholder="T.ex. Mormors köttbullar"
                error={shownErrors.name}
                autoComplete="off"
                enterKeyHint="next"
                maxLength={80}
                className="min-w-0 flex-1"
              />
            </div>
            <AnimatePresence initial={false}>
              {emojiOpen && (
                <motion.div
                  id="emoji-picker"
                  key="emoji"
                  initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div role="radiogroup" aria-label="Emoji för receptet" className="grid grid-cols-6 gap-1.5 pt-4 sm:grid-cols-9">
                    {RECIPE_EMOJIS.map((e) => {
                      const selected = draft.emoji === e
                      return (
                        <button
                          key={e}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={e}
                          onClick={() => {
                            update('emoji', e)
                            setEmojiOpen(false)
                          }}
                          className={cx(
                            'grid size-11 place-items-center justify-self-center rounded-2xl text-2xl transition-colors',
                            selected ? 'bg-gran-soft ring-2 ring-gran' : 'hover:bg-surface-2',
                          )}
                        >
                          <span aria-hidden>{e}</span>
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-2" id={`${nameId}-servings`}>
                  Portioner
                </span>
                <Stepper
                  label="Portioner"
                  value={draft.servings}
                  onChange={(v) => update('servings', v)}
                  min={1}
                  max={MAX_SERVINGS}
                  className="self-start"
                />
              </div>
              <NumberField
                label="Tid"
                optional
                value={draft.prepMinutes}
                onChange={(v) => update('prepMinutes', v)}
                min={0}
                max={24 * 60}
                step={5}
                decimals={0}
                suffix="min"
                placeholder="30"
                error={shownErrors.prepMinutes}
              />
            </div>
          </Card>
        </motion.div>

        {/* Ingredienser */}
        <motion.div {...section(1)}>
          <Card
            title="Ingredienser"
            eyebrow={draft.ingredients.length > 0 ? `${draft.ingredients.length} st` : 'Börja här'}
            action={<UtensilsCrossed aria-hidden className="size-5 text-ink-3" />}
          >
            {draft.ingredients.length > 0 ? (
              <ul className="mb-3 flex flex-col divide-y divide-line" aria-label="Ingredienser i receptet">
                <AnimatePresence initial={false}>
                  {draft.ingredients.map((ing) => (
                    <motion.li
                      key={ing.id}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <IngredientRow
                        ingredient={ing}
                        onEdit={() => openPicker({ mode: 'edit', ingredient: ing })}
                        onRemove={() => removeIngredient(ing)}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <p className="mb-3 text-sm leading-relaxed text-ink-2">
                Sök och lägg till det som går i rätten – mängder kan anges i gram, dl, msk, tsk eller styck.
              </p>
            )}
            <IngredientSearch
              ref={searchRef}
              excludeId={excludeId}
              onPick={(food) => openPicker({ mode: 'add', food })}
              error={shownErrors.ingredients}
            />
            <span className="sr-only" aria-live="polite">
              {announce}
            </span>
          </Card>
        </motion.div>

        {/* Summering */}
        <motion.div {...section(2)}>
          <Card tone="gran" title="Näring" eyebrow="Räknas ut medan du skriver">
            {draft.ingredients.length === 0 ? (
              <p className="text-sm text-ink-2">Lägg till ingredienser så visas energi och makron per portion här.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-surface/70 p-3.5">
                  <div className="eyebrow">Per portion</div>
                  {mindful ? (
                    <div className="mt-1 font-display text-lg font-semibold leading-tight text-ink">{mindfulPortionLabel(perServing.kcal)}</div>
                  ) : (
                    <div className="mt-1 text-[1.75rem] font-semibold leading-none text-ink">
                      <EnergyValue kcal={perServing.kcal} display />
                    </div>
                  )}
                  <div className="mt-1.5 text-xs text-ink-3 tabular-nums">≈ {formatGrams(weight.perServing)}</div>
                </div>
                <div className="rounded-2xl bg-surface/70 p-3.5">
                  <div className="eyebrow">Hela receptet</div>
                  {mindful ? (
                    <div className="mt-1 font-display text-lg font-semibold leading-tight text-ink">{formatGrams(weight.final)}</div>
                  ) : (
                    <div className="mt-1 text-[1.75rem] font-semibold leading-none text-ink">
                      <EnergyValue kcal={totals.kcal} display />
                    </div>
                  )}
                  <div className="mt-1.5 text-xs text-ink-3 tabular-nums">
                    {weight.cooked ? `${formatGrams(weight.final)} tillagat` : `${formatGrams(weight.raw)} rått`}
                  </div>
                </div>
                {!mindful && (
                  <dl className="col-span-2 grid grid-cols-4 gap-2 text-center">
                    <Macro label="Protein" dot="bg-protein" value={perServing.protein} />
                    <Macro label="Kolhydr." dot="bg-carbs" value={perServing.carbs} />
                    <Macro label="Fett" dot="bg-fat" value={perServing.fat} />
                    <Macro label="Fibrer" dot="bg-fiber" value={perServing.fiber} />
                  </dl>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        {/* Tillagad vikt */}
        <motion.div {...section(3)}>
          <Card title="Tillagad vikt" eyebrow="Rå eller tillagad?" action={<Scale aria-hidden className="size-5 text-ink-3" />}>
            <div className="mb-4 rounded-2xl bg-fjall-soft px-4 py-3.5 text-ink">
              <p className="font-display text-[1.0625rem] font-semibold leading-snug">
                Väg grytan när den är klar – då blir varje portion rätt, även om vatten kokat bort.
              </p>
              <ol className="mt-2.5 flex list-decimal flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-2 marker:font-semibold marker:text-fjall">
                <li>Väg kastrullen tom (eller nollställ vågen med kastrullen på).</li>
                <li>Väg igen när rätten är klar och dra av kastrullens vikt.</li>
                <li>Skriv in vikten här – Lagom räknar om näringen per portion och per 100 g.</li>
              </ol>
            </div>
            <NumberField
              label="Vikt efter tillagning"
              optional
              value={draft.cookedWeightG}
              onChange={(v) => update('cookedWeightG', v)}
              min={0}
              max={100000}
              step={50}
              decimals={0}
              suffix="g"
              placeholder={weight.raw > 0 ? formatNumber(Math.round(weight.raw)) : 'T.ex. 1 450'}
              error={shownErrors.cookedWeightG}
              hint={
                weight.raw > 0
                  ? `Råvikt ${formatGrams(weight.raw)}. Utan tillagad vikt räknar Lagom med råvikten.`
                  : 'Utan tillagad vikt räknar Lagom med ingrediensernas råvikt.'
              }
            />
            {weightWarning && (
              <p role="status" className="mt-3 flex items-start gap-2 rounded-2xl bg-hjortron-soft px-3.5 py-2.5 text-sm text-ink">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-hjortron" />
                {weightWarning}
              </p>
            )}
            {weight.raw > 0 && (
              <p className="mt-3 text-sm text-ink-2 tabular-nums">
                1 portion väger ungefär <span className="font-semibold text-ink">{formatGrams(weight.perServing)}</span>
                {weight.cooked && weight.changePct !== undefined && Math.abs(weight.changePct) >= 2 && (
                  <span className="text-ink-3">
                    {' '}
                    ({weight.changePct < 0 ? 'vatten har kokat bort' : 'vatten har sugits upp'}: {formatNumber(Math.abs(weight.changePct))} %)
                  </span>
                )}
                .
              </p>
            )}
          </Card>
        </motion.div>

        {/* Instruktioner och märkningar */}
        <motion.div {...section(4)}>
          <Card title="Instruktioner" eyebrow="Valfritt">
            <TextField
              multiline
              minRows={5}
              label="Så gör du"
              labelHidden
              value={draft.instructions}
              onValueChange={(v) => update('instructions', v)}
              placeholder={'Hacka löken.\nFräs den mjuk i smör.\nTillsätt resten och låt sjuda.'}
              hint="Skriv ett steg per rad – numreringen sköter Lagom."
            />
            <div className="mt-5">
              <div className="eyebrow mb-2 flex items-center gap-1.5">
                <Sparkles aria-hidden className="size-3.5" />
                Märkningar
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Märkningar">
                {EDITABLE_TAGS.map((tag) => (
                  <Chip key={tag} selected={draft.tags.includes(tag)} onClick={() => toggleTag(tag)} tone={tag === 'vegan' || tag === 'vegetarisk' ? 'mossa' : 'gran'}>
                    {TAG_LABELS[tag]}
                  </Chip>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-3">Vegetarisk, glutenfri och laktosfri sätts även automatiskt när alla ingredienser är det.</p>
            </div>
          </Card>
        </motion.div>

        {submitted && hasErrors(errors) && (
          <p role="alert" className="rounded-2xl bg-lingon-soft px-4 py-3 text-sm text-ink">
            {[errors.name, errors.ingredients, errors.servings, errors.cookedWeightG, errors.prepMinutes].filter(Boolean).join(' ')}
          </p>
        )}

        <Button type="submit" size="lg" iconLeft={Save} fullWidth>
          {existing ? 'Spara ändringar' : 'Spara recept'}
        </Button>
      </form>

      <AmountSheet
        state={picker}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onExitComplete={() => {
          setPicker(null)
          if (refocusSearch.current) {
            refocusSearch.current = false
            searchRef.current?.focus()
          }
        }}
        onConfirm={confirmAmount}
      />
    </div>
  )
}

function Macro({ label, dot, value }: { label: string; dot: string; value: number | undefined }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface/70 px-1 py-2">
      <dt className="flex items-center justify-center gap-1 truncate text-[0.6875rem] font-medium text-ink-2">
        <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', dot)} />
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink tabular-nums">{value !== undefined ? `${formatNumber(value, value < 10 ? 1 : 0)} g` : '–'}</dd>
    </div>
  )
}
