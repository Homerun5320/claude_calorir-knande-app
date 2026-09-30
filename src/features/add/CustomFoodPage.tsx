/**
 * Eget livsmedel – /nytt-livsmedel?streckkod=&namn=&kopia=&etikett=1 och /livsmedel/:id/redigera
 *
 * "Fyll i från förpackningen" (`LabelTextImport`, öppen med `etikett=1`) tolkar
 * näringsdeklarationen som text – inskannad med telefonens textigenkänning eller inklistrad – och
 * fyller i formuläret. Eller skriv av den för hand: per 100 g eller per portion (räknas om),
 * energi i kcal eller kJ, fält i samma ordning som på förpackningen, egna portioner och mått,
 * streckkod och märkningar. En rimlighetskontroll varnar om energin inte stämmer med makronäringsämnena.
 * Allt sparas bara på enheten.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, ChevronDown, Plus, Save, Trash2, X } from 'lucide-react'
import type { Food, FoodCategory, NutrientKey } from '../../types'
import { FOOD_CATEGORIES } from '../../types'
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  NumberField,
  PageHeader,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  TextField,
  confirmDialog,
  cx,
  toast,
  useToastStore,
} from '../../components/ui'
import { CATEGORY_META } from '../../components/domain'
import { useFood } from '../../hooks/useFood'
import { useFoodStore } from '../../stores/foodStore'
import { requireAccess } from '../premium/requireAccess'
import { useProfileStore } from '../../stores/profileStore'
import { NUTRIENTS, KJ_PER_KCAL } from '../../lib/nutrients'
import { formatEnergy, formatNumber } from '../../lib/format'
import { ALL_TAGS, TAG_LABELS, decodeFoodId, foodDetailHref, isISODate, isMealId } from './addLogic'
import {
  EXTRA_GROUPS,
  EXTRA_KEYS,
  LABEL_PANEL_PARAM,
  MAIN_LABELS,
  MAIN_NUTRIENTS,
  SUB_NUTRIENTS,
  applyLabelToDraft,
  clearedMessage,
  draftFromFood,
  draftSignature,
  draftToFood,
  draftWarnings,
  emptyDraft,
  energyToKcal,
  labelFillsExtras,
  newCustomFoodId,
  newPortionDraft,
  toPer100,
  validateDraft,
  type CustomFoodDraft,
  type DraftErrors,
} from './customFood'
import { useLeave } from './components'
import { LabelTextImport } from './LabelTextImport'
import type { NutritionLabelResult } from '../../lib/nutritionLabel'

type Mode = 'new' | 'copy' | 'edit'

export default function CustomFoodPage() {
  const { id: rawId } = useParams()
  const [params] = useSearchParams()
  const energyUnit = useProfileStore((s) => s.settings.energyUnit)
  const editId = rawId ? decodeFoodId(rawId) : null
  const copyId = params.get('kopia')
  const sourceId = editId ?? copyId
  const { food, loading } = useFood(sourceId)

  if (sourceId && !food) {
    return (
      <div className="px-4 pb-10">
        <PageHeader back title={editId ? 'Redigera livsmedel' : 'Nytt livsmedel'} />
        {loading ? (
          <div className="flex flex-col gap-4" aria-busy="true" aria-label="Laddar">
            <Skeleton className="h-56 w-full rounded-[1.5rem]" />
            <Skeleton className="h-96 w-full rounded-[1.5rem]" />
          </div>
        ) : (
          <EmptyState
            illustration="search"
            title="Livsmedlet hittades inte"
            text="Det kan ha tagits bort. Du kan skapa ett nytt i stället."
            action={
              <Button variant="soft" to="/nytt-livsmedel">
                Nytt livsmedel
              </Button>
            }
          />
        )}
      </div>
    )
  }

  const mode: Mode = editId && food?.source === 'custom' ? 'edit' : food ? 'copy' : 'new'
  const barcodeParam = params.get('streckkod') ?? undefined
  const initial = (() => {
    if (!food) return emptyDraft({ name: params.get('namn') ?? undefined, barcode: barcodeParam, energyUnit })
    const d = draftFromFood(food, energyUnit)
    if (mode === 'copy') {
      if (barcodeParam) d.barcode = barcodeParam
      // Kategorin och egenskaperna följer med; källan blir "Eget".
    }
    return d
  })()

  return <CustomFoodForm key={`${mode}:${food?.id ?? 'ny'}`} mode={mode} source={food} initial={initial} />
}

// ---------------------------------------------------------------------------
// Formulär
// ---------------------------------------------------------------------------

/** Fältet "Portionens vikt" – dit flyttas fokus när en etikett per portion saknar vikten. */
const BASIS_GRAMS_ID = 'custom-food-basis-grams'

const CATEGORY_OPTIONS = FOOD_CATEGORIES.map((c) => ({ value: c, label: `${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}` })).sort((a, b) =>
  a.value === 'ovrigt' ? 1 : b.value === 'ovrigt' ? -1 : CATEGORY_META[a.value].label.localeCompare(CATEGORY_META[b.value].label, 'sv'),
)

function CustomFoodForm({ mode, source, initial }: { mode: Mode; source: Food | undefined; initial: CustomFoodDraft }) {
  const navigate = useNavigate()
  const leave = useLeave()
  const reduce = useReducedMotion()
  const [params] = useSearchParams()
  const addCustomFood = useFoodStore((s) => s.addCustomFood)
  const updateCustomFood = useFoodStore((s) => s.updateCustomFood)
  const removeCustomFood = useFoodStore((s) => s.removeCustomFood)

  const [draft, setDraft] = useState(initial)
  const [initialSig] = useState(() => draftSignature(initial))
  const [tried, setTried] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(() => EXTRA_KEYS.some((k) => initial.values[k] !== undefined))
  /** Det som ska kontrolleras efter "Fyll i från förpackningen" – står kvar tills man döljer det. */
  const [labelCheck, setLabelCheck] = useState<string[]>([])
  const labelToast = useRef<string | undefined>(undefined)
  const labelTarget = useRef<'weight' | 'card' | undefined>(undefined)
  const savedRef = useRef(false)
  const fromScan = params.get(LABEL_PANEL_PARAM) === '1'

  const set = <K extends keyof CustomFoodDraft>(key: K, value: CustomFoodDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setValue = (key: NutrientKey, value: number | undefined) =>
    setDraft((d) => {
      const values = { ...d.values }
      if (value === undefined) delete values[key]
      else values[key] = value
      return { ...d, values }
    })

  const errors: DraftErrors = useMemo(() => validateDraft(draft), [draft])
  const shownErrors: DraftErrors = tried ? errors : {}
  const warnings = useMemo(() => draftWarnings(draft), [draft])
  const dirty = draftSignature(draft) !== initialSig
  const unitWord = draft.liquid ? 'ml' : 'g'
  const extrasFilled = EXTRA_KEYS.filter((k) => draft.values[k] !== undefined).length

  // --- Skydd mot att tappa det man skrivit ----------------------------------
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname)
  const asking = useRef(false)
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return
    asking.current = true
    void confirmDialog({
      title: 'Lämna utan att spara?',
      message: 'Det du har fyllt i sparas inte.',
      confirmLabel: 'Lämna',
      cancelLabel: 'Fortsätt fylla i',
      tone: 'danger',
    }).then((ok) => {
      asking.current = false
      if (ok) blocker.proceed?.()
      else blocker.reset?.()
    })
  }, [blocker])

  useEffect(() => {
    if (!dirty) return
    const onUnload = (e: BeforeUnloadEvent) => {
      if (savedRef.current) return
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [dirty])

  // --- Spara -----------------------------------------------------------------
  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    setTried(true)
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>('[data-custom-food] [aria-invalid="true"]')
        el?.focus()
        el?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      })
      return
    }
    // Ett nytt livsmedel (även en kopia via "Redigera" på ett inbyggt) är ny loggning och spärras
    // efter provperioden precis som Nytt livsmedel. Att ändra ett eget livsmedel går alltid.
    if (mode !== 'edit' && !requireAccess('livsmedel')) return
    savedRef.current = true
    // "Värdena är ifyllda – granska dem" ska inte ligga kvar ovanpå "Sparat".
    if (labelToast.current) useToastStore.getState().dismiss(labelToast.current)
    if (mode === 'edit' && source) {
      const { id: _id, createdAt: _c, ...patch } = draftToFood(draft, { id: source.id, createdAt: source.createdAt, from: source })
      updateCustomFood(source.id, patch)
      toast('Ändringarna är sparade', { tone: 'success' })
      leave(foodDetailHref(source.id))
      return
    }
    const id = newCustomFoodId()
    const food = draftToFood(draft, { id, from: source })
    addCustomFood(food)
    toast(mode === 'copy' ? 'Kopian är sparad bland dina livsmedel' : 'Sparat bland dina livsmedel', { tone: 'success' })
    const meal = params.get('maltid')
    const date = params.get('datum')
    navigate(foodDetailHref(id, { meal: isMealId(meal) ? meal : undefined, date: isISODate(date) ? date : undefined }), { replace: true })
  }

  const remove = async () => {
    if (!source) return
    const ok = await confirmDialog({
      title: `Ta bort ${source.name}?`,
      message: 'Livsmedlet försvinner från dina egna livsmedel. Det du redan har loggat i dagboken finns kvar.',
      confirmLabel: 'Ta bort',
      tone: 'danger',
    })
    if (!ok) return
    savedRef.current = true
    removeCustomFood(source.id)
    toast('Livsmedlet är borttaget', { tone: 'success' })
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx >= 2) navigate(-2)
    else navigate('/lagg-till?flik=mina', { replace: true })
  }

  // --- Fyll i från förpackningen ---------------------------------------------
  const labelTargetElement = () =>
    labelTarget.current === 'weight' ? document.getElementById(BASIS_GRAMS_ID) : document.getElementById('custom-food-nutrients')

  const applyLabel = (result: NutritionLabelResult) => {
    const { draft: next, cleared } = applyLabelToDraft(draft, result)
    setDraft(next)
    const clearedText = clearedMessage(cleared, draft.basis)
    setLabelCheck([...result.warnings, ...(clearedText ? [clearedText] : [])])
    if (labelFillsExtras(result)) setExtrasOpen(true)
    labelToast.current = toast('Värdena är ifyllda – granska dem och spara.', { tone: 'success' })
    // Saknas portionens vikt är den nästa steg – annars kortet med värdena.
    labelTarget.current = next.basis === 'portion' && next.basisGrams === undefined ? 'weight' : 'card'
    // Fokus flyttas direkt (knappen försvinner), men sidan rullas först när panelen har fällts ihop.
    requestAnimationFrame(() => labelTargetElement()?.focus({ preventScroll: true }))
  }

  const afterLabelApplied = () => {
    const el = labelTargetElement()
    el?.scrollIntoView?.({ block: labelTarget.current === 'weight' ? 'center' : 'start', behavior: reduce ? 'auto' : 'smooth' })
    labelTarget.current = undefined
  }

  // Från skanningen (etikett=1) står panelen först, direkt under rubriken.
  const labelPanel = <LabelTextImport defaultOpen={fromScan} onApply={applyLabel} onApplied={afterLabelApplied} />

  const kcalPreview = energyToKcal(draft.energy, draft.energyUnit)
  const per100Kcal = toPer100(kcalPreview, draft.basis, draft.basisGrams)
  const title = mode === 'edit' ? 'Redigera livsmedel' : mode === 'copy' ? 'Kopiera livsmedel' : 'Nytt livsmedel'

  return (
    <div className="px-4 pb-12" data-custom-food>
      <PageHeader
        back
        title={title}
        subtitle={mode === 'copy' ? 'Du ändrar en egen kopia – originalet påverkas inte.' : 'Skanna in eller skriv av näringsdeklarationen. Allt sparas bara på din enhet.'}
        actions={
          <Button size="sm" variant="soft" iconLeft={Save} onClick={() => submit()}>
            Spara
          </Button>
        }
      />

      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {/* Fyll i från förpackningen (textigenkänning eller inklistrad text) */}
        {fromScan && labelPanel}

        {/* Grunduppgifter */}
        <Card title="Grunduppgifter" padding="lg">
          <div className="flex flex-col gap-4">
            <TextField
              label="Namn"
              value={draft.name}
              onValueChange={(v) => set('name', v)}
              placeholder="T.ex. Proteinbar choklad"
              error={shownErrors.name}
              autoComplete="off"
              maxLength={120}
              required
            />
            <TextField label="Märke" optional value={draft.brand} onValueChange={(v) => set('brand', v)} placeholder="T.ex. ICA, Arla" autoComplete="off" />
            <Select<FoodCategory>
              label="Kategori"
              value={draft.category}
              onChange={(v) => set('category', v)}
              options={CATEGORY_OPTIONS}
              hint="Styr ikon, Tallriksmodellen, kostråden och klimatberäkningen."
            />
            <TextField
              label="Streckkod"
              optional
              value={draft.barcode}
              onValueChange={(v) => set('barcode', v.replace(/[^\d\s-]/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="7310865000637"
              hint="Då hittar Lagom livsmedlet direkt när du skannar streckkoden."
              error={shownErrors.barcode}
            />
          </div>
        </Card>

        {!fromScan && labelPanel}

        {/* Näringsvärden */}
        <Card title="Näringsvärden" padding="lg" id="custom-food-nutrients" tabIndex={-1} className="scroll-mt-4">
          <div className="flex flex-col gap-4">
            {labelCheck.length > 0 && (
              <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-hjortron-soft py-3 pl-4 pr-1.5 text-sm text-ink print:hidden">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Att kontrollera mot förpackningen</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {labelCheck.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
                <IconButton icon={X} size="sm" aria-label="Dölj det som ska kontrolleras" onClick={() => setLabelCheck([])} className="-mt-1.5 shrink-0" />
              </div>
            )}
            <SegmentedControl
              fullWidth
              value={draft.basis}
              onChange={(v) => set('basis', v)}
              aria-label="Värdena gäller"
              options={[
                { value: 'per100', label: `Per 100\u00a0${unitWord}` },
                { value: 'portion', label: 'Per portion' },
              ]}
            />
            <AnimatePresence initial={false}>
              {draft.basis === 'portion' && (
                <motion.div
                  key="portion"
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-3 pb-1">
                    <NumberField
                      id={BASIS_GRAMS_ID}
                      label="Portionens vikt"
                      value={draft.basisGrams}
                      onChange={(v) => set('basisGrams', v)}
                      suffix={unitWord === 'ml' ? 'g (ml)' : 'g'}
                      min={0}
                      max={5000}
                      error={shownErrors.basisGrams}
                    />
                    <TextField label="Portionens namn" optional value={draft.basisLabel} onValueChange={(v) => set('basisLabel', v)} placeholder="1 bar" />
                  </div>
                  <p className="mt-1 text-xs text-ink-3">Lagom räknar om till per 100{'\u00a0'}g och sparar portionen så att du kan välja den direkt.</p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-start gap-2">
              <NumberField
                label="Energi"
                className="flex-1"
                value={draft.energy}
                onChange={(v) => set('energy', v)}
                suffix={draft.energyUnit}
                min={0}
                max={draft.energyUnit === 'kJ' ? 20000 : 5000}
                step={draft.energyUnit === 'kJ' ? 10 : 1}
                decimals={1}
                error={shownErrors.energy}
                required
                hint={
                  draft.energy !== undefined && draft.energy > 0
                    ? `= ${formatEnergy(draft.energyUnit === 'kJ' ? draft.energy / KJ_PER_KCAL : draft.energy, draft.energyUnit === 'kJ' ? 'kcal' : 'kJ')}${
                        draft.basis === 'portion' && per100Kcal !== undefined ? ` · ${formatNumber(per100Kcal)}\u00a0kcal per 100\u00a0${unitWord}` : ''
                      }`
                    : 'Välj den enhet som står på förpackningen.'
                }
              />
              <SegmentedControl
                size="sm"
                className="mt-7"
                value={draft.energyUnit}
                onChange={(v) => set('energyUnit', v)}
                aria-label="Energienhet"
                options={[
                  { value: 'kcal', label: 'kcal' },
                  { value: 'kJ', label: 'kJ' },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-4">
              {MAIN_NUTRIENTS.map((k) => (
                <NumberField
                  key={k}
                  label={MAIN_LABELS[k]}
                  value={draft.values[k]}
                  onChange={(v) => setValue(k, v)}
                  suffix="g"
                  min={0}
                  max={draft.basis === 'portion' ? 5000 : 100}
                  step={0.1}
                  decimals={2}
                  className={cx(SUB_NUTRIENTS.has(k) ? '[&_label]:font-normal [&_label]:text-ink-2' : undefined)}
                />
              ))}
            </div>

            {warnings.length > 0 && (
              <div role="status" className="flex items-start gap-2.5 rounded-2xl bg-hjortron-soft px-4 py-3 text-sm text-ink">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
                <ul className="flex flex-col gap-1">
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-ink-3">Tomma fält sparas som okända – inte som noll.</p>

            <button
              type="button"
              aria-expanded={extrasOpen}
              aria-controls={extrasOpen ? 'custom-food-extras' : undefined}
              onClick={() => setExtrasOpen((o) => !o)}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-left text-sm font-semibold text-ink transition-colors hover:bg-surface-3"
            >
              <span className="flex-1">
                Fler näringsämnen
                {extrasFilled > 0 && <span className="ml-1.5 font-normal text-ink-3">({extrasFilled} ifyllda)</span>}
                <span className="block text-xs font-normal text-ink-3">Tillsatt socker, fullkorn, vitaminer och mineraler</span>
              </span>
              <ChevronDown className={cx('size-4 text-ink-3 transition-transform', extrasOpen && 'rotate-180')} aria-hidden />
            </button>
            <AnimatePresence initial={false}>
              {extrasOpen && (
                <motion.div
                  id="custom-food-extras"
                  key="extras"
                  initial={reduce ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-5 pt-1">
                    {EXTRA_GROUPS.map((g) => (
                      <fieldset key={g.id}>
                        <legend className="eyebrow mb-2">{g.label}</legend>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                          {g.keys.map((k) => (
                            <NumberField
                              key={k}
                              label={NUTRIENTS[k].name}
                              value={draft.values[k]}
                              onChange={(v) => setValue(k, v)}
                              suffix={NUTRIENTS[k].unit}
                              min={0}
                              step={NUTRIENTS[k].unit === 'g' ? 0.1 : 1}
                              decimals={3}
                            />
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>

        {/* Portioner och mått */}
        <Card title="Portioner och mått" padding="lg">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">Lägg till mått du brukar använda, t.ex. ”1 bar”, ”1 skiva” eller ”1 burk”.</p>
            {draft.portions.length > 0 && (
              <ul className="flex flex-col gap-3">
                {draft.portions.map((p, i) => (
                  <li key={p.key} className="flex items-end gap-2">
                    <TextField
                      label={i === 0 ? 'Mått' : `Mått ${i + 1}`}
                      labelHidden={i > 0}
                      className="min-w-0 flex-1"
                      value={p.label}
                      onValueChange={(v) => set('portions', draft.portions.map((x) => (x.key === p.key ? { ...x, label: v } : x)))}
                      placeholder="1 st"
                      autoComplete="off"
                    />
                    <NumberField
                      label={i === 0 ? 'Vikt' : `Vikt för mått ${i + 1}`}
                      labelHidden={i > 0}
                      className="w-28 shrink-0"
                      value={p.grams}
                      onChange={(v) => set('portions', draft.portions.map((x) => (x.key === p.key ? { ...x, grams: v } : x)))}
                      suffix="g"
                      min={0}
                      max={5000}
                    />
                    <IconButton
                      icon={Trash2}
                      aria-label={`Ta bort måttet ${p.label || i + 1}`}
                      onClick={() => set('portions', draft.portions.filter((x) => x.key !== p.key))}
                      noTooltip
                    />
                  </li>
                ))}
              </ul>
            )}
            {shownErrors.portions && (
              <p role="alert" className="text-sm text-lingon">
                {shownErrors.portions}
              </p>
            )}
            <Button variant="outline" size="sm" iconLeft={Plus} onClick={() => set('portions', [...draft.portions, newPortionDraft()])} className="self-start">
              Lägg till portion
            </Button>

            <div className="h-px bg-line" aria-hidden />

            <Switch
              label="Flytande"
              description="Dryck, soppa eller sås – då kan mängden anges i dl, cl och ml."
              checked={draft.liquid}
              onChange={(v) => set('liquid', v)}
            />
            <NumberField
              label="Vikt per dl"
              optional
              value={draft.gramsPerDl}
              onChange={(v) => set('gramsPerDl', v)}
              suffix="g"
              min={0}
              max={300}
              error={shownErrors.gramsPerDl}
              hint={
                draft.liquid
                  ? 'Lämna tomt så räknas 1\u00a0dl som 100\u00a0g.'
                  : 'Gör att du kan ange mängden i dl, msk och tsk. T.ex. havregryn ca 35\u00a0g, vetemjöl ca 60\u00a0g.'
              }
            />
          </div>
        </Card>

        {/* Egenskaper */}
        <Card title="Egenskaper" padding="lg">
          <div role="group" aria-label="Egenskaper" className="flex flex-wrap gap-2">
            {ALL_TAGS.map((t) => {
              const on = draft.tags.includes(t)
              return (
                <Chip key={t} selected={on} onClick={() => set('tags', on ? draft.tags.filter((x) => x !== t) : [...draft.tags, t])}>
                  {TAG_LABELS[t]}
                </Chip>
              )
            })}
          </div>
          <TextField
            multiline
            minRows={2}
            label="Anteckning"
            optional
            className="mt-5"
            value={draft.note}
            onValueChange={(v) => set('note', v)}
            placeholder="T.ex. var du köpte den eller hur den tillagas"
          />
        </Card>

        <div className="flex flex-col gap-2 pt-1">
          <Button type="submit" size="lg" fullWidth iconLeft={Save}>
            {mode === 'edit' ? 'Spara ändringar' : 'Spara livsmedlet'}
          </Button>
          {tried && Object.keys(errors).length > 0 && (
            <p role="alert" className="text-center text-sm text-lingon">
              Några uppgifter saknas – se de markerade fälten.
            </p>
          )}
          {mode === 'edit' && (
            <Button variant="ghost" iconLeft={Trash2} onClick={remove} fullWidth className="text-lingon">
              Ta bort livsmedlet
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
