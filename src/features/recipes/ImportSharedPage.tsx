/**
 * Öppna ett delat recept eller en delad måltid (/dela).
 *
 * Läser `d` i adressen (`#/dela?d=…`, en delningslänk), en inklistrad länk eller en vald fil
 * ("<namn>.lagom.json"). Allt behandlas som opålitligt (`lib/shareLink.ts` kontrollerar strikt)
 * och visas först som förhandsvisning: namn, ingredienser och näring per portion. Inget sparas
 * automatiskt – "Spara recept"/"Spara måltid" sparar efter `requireAccess(…)` (exempeldata är
 * skrivskyddad och efter provperioden skapas inget nytt).
 *
 * I apparna öppnas en delningslänk i webbläsaren (Universal Links/App Links kräver domänen och
 * kommer senare) – där klistrar man in länken här eller väljer filen.
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ClipboardPaste, Eye, FileUp, Info, Save, ShieldCheck } from 'lucide-react'
import type { Nutrients } from '../../types'
import { Button, Card, PageHeader, Spinner, TextField, toast } from '../../components/ui'
import { EnergyValue } from '../../components/domain'
import { mindfulPortionLabel } from '../../components/domain/PortionPicker'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useProfileStore } from '../../stores/profileStore'
import { useFoodStore } from '../../stores/foodStore'
import { builtinFood, loadBuiltinCatalog, type BuiltinCatalog } from '../../lib/foodRepo'
import { formatDuration, formatNumber, plural } from '../../lib/format'
import { nutrientsForGrams, sumNutrients } from '../../lib/nutrients'
import { recipePerServing } from '../../lib/recipes'
import { logError } from '../../lib/errorLog'
import {
  SHARE_ERRORS,
  decodeShareParam,
  importShare,
  readShareFile,
  readShareText,
  resolveShare,
  type ResolvedShare,
  type ShareReadResult,
  type SharePayload,
} from '../../lib/shareLink'
import { requireAccess } from '../premium/requireAccess'
import { formatIngredientAmount, parseInstructions, servingsText, sourceHost } from './recipeLogic'
import { RecipeEmoji } from './components'

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'preview'; id: number; payload: SharePayload; catalog: BuiltinCatalog }

/** Behöver det delade den inbyggda databasen (Lagom-livsmedel eller Livsmedelsverket)? */
function needsCatalog(payload: SharePayload): boolean {
  return payload.foods.some((f) => 'ref' in f || f.lmv !== undefined)
}

export default function ImportSharedPage() {
  useDocumentTitle('Öppna delat')
  const [params, setParams] = useSearchParams()
  const d = params.get('d')
  const [view, setView] = useState<ViewState>(() => (d ? { status: 'loading' } : { status: 'idle' }))
  const [pasted, setPasted] = useState('')
  const request = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  /** Fältet ska få fokus när formuläret visas igen efter "Öppna något annat". */
  const focusInput = useRef(false)

  /** Visa resultatet av en läsning (länk, inklistrat eller fil) – senaste läsningen vinner. */
  const show = async (read: Promise<ShareReadResult>) => {
    const id = ++request.current
    setView({ status: 'loading' })
    try {
      const result = await read
      if (id !== request.current) return
      if (!result.ok) {
        setView({ status: 'error', message: SHARE_ERRORS[result.error] })
        return
      }
      const catalog = await loadBuiltinCatalog()
      if (id !== request.current) return
      if (catalog.error && needsCatalog(result.payload)) {
        setView({ status: 'error', message: catalog.error })
        return
      }
      setView({ status: 'preview', id, payload: result.payload, catalog })
    } catch (error) {
      logError(error, 'dela-öppna')
      if (id === request.current) setView({ status: 'error', message: SHARE_ERRORS.invalid })
    }
  }

  // En delningslänk öppnar förhandsvisningen direkt – men sparar ingenting.
  useEffect(() => {
    if (d) void show(decodeShareParam(d))
    // Bara `d` styrar – `show` läser inget annat ur komponenten än sina argument.
  }, [d])

  // Flytta fokus till förhandsvisningens rubrik när den visas, och tillbaka till fältet när man
  // väljer att öppna något annat (skärmläsare och tangentbord).
  useEffect(() => {
    if (view.status === 'preview') headingRef.current?.focus()
    else if (view.status === 'idle' && focusInput.current) {
      focusInput.current = false
      inputRef.current?.focus()
    }
  }, [view.status])

  const onPaste = (e: FormEvent) => {
    e.preventDefault()
    void show(readShareText(pasted))
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) void show(readShareFile(file))
  }

  const reset = () => {
    request.current++
    focusInput.current = true
    setView({ status: 'idle' })
    setPasted('')
    if (d) setParams({}, { replace: true })
  }

  return (
    <div className="px-4 pb-10">
      <PageHeader back title="Öppna delat" subtitle="Recept och måltider som någon har delat med dig – som länk eller fil." />

      <div className="flex flex-col gap-4">
        {view.status === 'loading' && (
          <div role="status" className="card flex items-center gap-3 p-5 text-sm text-ink-2">
            <Spinner className="size-5" />
            Öppnar …
          </div>
        )}

        {view.status === 'preview' && <Preview key={view.id} payload={view.payload} catalog={view.catalog} headingRef={headingRef} onCancel={reset} />}

        {view.status === 'error' && (
          <div role="alert" className="flex items-start gap-3 rounded-[1.5rem] bg-hjortron-soft px-4 py-3.5 text-sm leading-relaxed text-ink">
            <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
            <p>{view.message}</p>
          </div>
        )}

        {(view.status === 'idle' || view.status === 'error') && (
          <Card title="Klistra in länk eller välj fil" titleAs="h2">
            <form onSubmit={onPaste} className="flex flex-col gap-3" noValidate>
              <TextField
                ref={inputRef}
                label="Länk"
                value={pasted}
                onValueChange={setPasted}
                placeholder="https://…#/dela?d=…"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                inputMode="url"
                hint="Klistra in hela länken du har fått."
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" iconLeft={ClipboardPaste} disabled={!pasted.trim()}>
                  Öppna länken
                </Button>
                <Button type="button" variant="soft" iconLeft={FileUp} onClick={() => fileRef.current?.click()}>
                  Välj fil
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Välj en delad fil"
                  onChange={onFile}
                />
              </div>
            </form>
            <p className="mt-4 flex items-start gap-2 text-[0.8125rem] leading-relaxed text-ink-3">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>Du ser allt innan något sparas. Inget skickas till någon server – länken och filen läses här på enheten.</span>
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Förhandsvisning
// ---------------------------------------------------------------------------

const MACROS = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Kolhydrater' },
  { key: 'fat', label: 'Fett' },
] as const

function Preview({
  payload,
  catalog,
  headingRef,
  onCancel,
}: {
  payload: SharePayload
  catalog: BuiltinCatalog
  headingRef: RefObject<HTMLHeadingElement | null>
  onCancel: () => void
}) {
  const navigate = useNavigate()
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const customFoods = useFoodStore((s) => s.customFoods)
  const [showNumbers, setShowNumbers] = useState(false)
  const [saving, setSaving] = useState(false)
  const resolved = useMemo<ResolvedShare>(
    () => resolveShare(payload, { lookup: (id) => builtinFood(catalog, id), customFoods }),
    [payload, catalog, customFoods],
  )
  const isRecipe = resolved.kind === 'recipe'
  const lines = resolved.kind === 'recipe' ? resolved.recipe.ingredients : resolved.template.items
  const perPortion = useMemo<Nutrients>(() => {
    if (resolved.kind === 'recipe') return recipePerServing(resolved.recipe)
    return sumNutrients(resolved.template.items.map((i) => nutrientsForGrams(i.food.nutrients, i.grams)))
  }, [resolved])
  const steps = resolved.kind === 'recipe' ? parseInstructions(resolved.recipe.instructions).steps : []
  const blocked = resolved.missing.length > 0
  const numbersHidden = mindful && !showNumbers

  const save = () => {
    if (blocked || saving) return
    if (!requireAccess(isRecipe ? 'recept' : 'kopiera')) return
    setSaving(true)
    try {
      const result = importShare(payload, (id) => builtinFood(catalog, id))
      if (!result) {
        setSaving(false)
        toast('Något livsmedel saknas i din version av Lagom – uppdatera appen och försök igen.', { tone: 'error' })
        return
      }
      if (result.kind === 'recipe') {
        navigate(`/recept/${encodeURIComponent(result.id)}`, { replace: true })
        toast(`”${result.name}” är sparat i Mina recept`, { tone: 'success' })
      } else {
        navigate('/lagg-till?flik=maltider', { replace: true })
        toast(`”${result.name}” är sparad – du hittar den under Måltider när du lägger till mat`, { tone: 'success' })
      }
    } catch (error) {
      logError(error, 'dela-spara')
      setSaving(false)
      toast('Det gick inte att spara. Försök igen.', { tone: 'error' })
    }
  }

  return (
    <>
      <section className="card p-5" aria-labelledby="delat-rubrik">
        <p className="eyebrow text-ink-3">{isRecipe ? 'Delat recept' : 'Delad måltid'}</p>
        <div className="mt-2 flex items-center gap-4">
          {resolved.kind === 'recipe' && <RecipeEmoji emoji={resolved.recipe.emoji} size="md" />}
          <div className="min-w-0 flex-1">
            <h2 id="delat-rubrik" ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold leading-tight text-ink outline-none">
              {resolved.name}
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              {resolved.kind === 'recipe'
                ? [servingsText(resolved.recipe.servings), resolved.recipe.prepMinutes ? formatDuration(resolved.recipe.prepMinutes) : null]
                    .filter(Boolean)
                    .join(' · ')
                : plural(lines.length, 'livsmedel', 'livsmedel')}
            </p>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[0.8125rem] leading-relaxed text-ink-2">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-3" />
          <span>Någon har delat det här med dig. Titta igenom innan du sparar – inget sparas förrän du väljer det.</span>
        </p>
      </section>

      <Card title={isRecipe ? 'Näring per portion' : 'Näring för måltiden'} titleAs="h3">
        {numbersHidden ? (
          <div className="flex flex-col items-start gap-3">
            <p className="font-display text-lg font-semibold text-ink">{mindfulPortionLabel(perPortion.kcal)}</p>
            <p className="text-sm leading-relaxed text-ink-2">Medvetet läge är på – siffrorna är dolda.</p>
            <Button variant="soft" size="sm" iconLeft={Eye} onClick={() => setShowNumbers(true)}>
              Visa näringsvärden
            </Button>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="flex flex-col rounded-2xl bg-surface-2/70 px-3 py-2.5">
              <dt className="order-last text-xs text-ink-3">Energi</dt>
              <dd className="font-display text-lg font-semibold text-ink">
                <EnergyValue kcal={perPortion.kcal} />
              </dd>
            </div>
            {MACROS.map((m) => {
              const v = perPortion[m.key]
              return (
                <div key={m.key} className="flex flex-col rounded-2xl bg-surface-2/70 px-3 py-2.5">
                  <dt className="order-last text-xs text-ink-3">{m.label}</dt>
                  <dd className="font-display text-lg font-semibold text-ink tabular-nums">{v !== undefined ? `${formatNumber(v, v < 10 ? 1 : 0)}\u00a0g` : '–'}</dd>
                </div>
              )
            })}
          </dl>
        )}
      </Card>

      <Card title={isRecipe ? 'Ingredienser' : 'Livsmedel'} titleAs="h3">
        <ul className="divide-y divide-line">
          {lines.map((line, i) => {
            const amount = formatIngredientAmount(line.food, line.amount, line.unit)
            return (
              <li key={i} className="flex items-baseline gap-3 py-2.5">
                <span className="w-28 shrink-0 text-[0.9375rem] font-semibold text-ink tabular-nums">{amount.text}</span>
                <span className="min-w-0 flex-1 text-[0.9375rem] leading-snug text-ink-2">
                  {line.food.name}
                  {line.food.brand && <span className="text-ink-3"> · {line.food.brand}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {resolved.newFoods.length > 0 && (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-3">
            {resolved.newFoods.length === 1
              ? '1 livsmedel följer med och sparas bland dina egna livsmedel.'
              : `${formatNumber(resolved.newFoods.length)} livsmedel följer med och sparas bland dina egna livsmedel.`}
          </p>
        )}
      </Card>

      {blocked && (
        <div role="alert" className="flex items-start gap-3 rounded-[1.5rem] bg-hjortron-soft px-4 py-3.5 text-sm leading-relaxed text-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warn" />
          <p>
            {resolved.missing.length === 1 ? 'Ett livsmedel finns' : 'Några livsmedel finns'} inte i din version av Lagom: {resolved.missing.join(', ')}. Uppdatera
            appen och öppna länken igen.
          </p>
        </div>
      )}

      {resolved.kind === 'recipe' && (steps.length > 0 || resolved.recipe.sourceUrl) && (
        <Card title="Så gör du" titleAs="h3">
          {steps.length > 0 && (
            <details className="group">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-gran">
                Visa instruktionerna ({formatNumber(steps.length)}&nbsp;steg)
              </summary>
              <ol className="mt-2 flex list-decimal flex-col gap-2 pl-5 text-[0.9375rem] leading-relaxed text-ink">
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>
          )}
          {resolved.recipe.sourceUrl && (
            <p className="mt-2 text-sm text-ink-3">
              Källa: <span className="font-medium text-ink-2">{sourceHost(resolved.recipe.sourceUrl)}</span>
            </p>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" iconLeft={Save} onClick={save} disabled={blocked} loading={saving} fullWidth>
          {isRecipe ? 'Spara recept' : 'Spara måltid'}
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel} fullWidth>
          Öppna något annat
        </Button>
      </div>
    </>
  )
}
