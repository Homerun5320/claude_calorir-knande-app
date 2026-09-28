/**
 * Importera recept från en länk (/recept/importera).
 *
 * Användaren klistrar in länken till ett recept på en webbsida. Lagoms serverfunktion
 * (POST {API_BASE}/api/recipe-fetch med { url }) hämtar sidan och svarar med sidans
 * JSON-LD-block ({ html }) eller ett fel ({ error }). Receptet (schema.org/Recipe) tolkas här:
 * namn, portioner, tid och ingrediensrader, som matchas mot livsmedel och visas för kontroll.
 *
 * Instruktionerna importeras inte – bara länken sparas (`Recipe.sourceUrl`), så att man läser
 * dem på originalsidan. Bara länken skickas till servern, ingenting annat.
 */
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChefHat, ClipboardPaste, Download, Globe, Save } from 'lucide-react'
import { Button, Card, NumberField, PageHeader, Stepper, TextField, toast } from '../../components/ui'
import { API_BASE } from '../../config/commerce'
import { plural } from '../../lib/format'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useFoodStore } from '../../stores/foodStore'
import { requireAccess } from '../premium/requireAccess'
import { parseIngredientLines, parseRecipeJsonLd, type ParsedIngredientLine } from './importRecipe'
import { IngredientReview, reviewSummary, useIngredientReview } from './IngredientImport'
import { MAX_SERVINGS, emptyDraft, recipeFromDraft, safeSourceUrl, sourceHost } from './recipeLogic'

export const IMPORT_ERRORS = {
  invalidUrl: 'Klistra in hela länken till receptet – den börjar med https://',
  fetch: 'Kunde inte hämta sidan – kontrollera länken',
  noRecipe: 'Hittade inget recept på sidan',
} as const

export type RecipeFetchOutcome = { ok: true; html: string } | { ok: false; error: keyof typeof IMPORT_ERRORS }

/**
 * Länken som den skickas till servern, eller undefined om den inte går att använda. Serverfunktionen
 * hämtar bara https-sidor, så "http://" blir "https://" – och en länk utan protokoll
 * ("ica.se/recept/…") får "https://" framför sig. Ett ensamt ord ("kladdkaka") är ingen länk.
 */
export function recipeImportUrl(input: string): string | undefined {
  let text = input.trim()
  if (!text) return undefined
  if (/^http:\/\//i.test(text)) text = `https://${text.slice('http://'.length)}`
  else if (!/^[a-z][a-z\d+.-]*:/i.test(text)) {
    // Utan protokoll: bara när det ser ut som en webbadress (värdnamn med punkt).
    if (!/^(www\.)?[\p{L}\d-]+(\.[\p{L}\d-]+)+(?=[/?#]|$)/iu.test(text)) return undefined
    text = `https://${text.replace(/^\/+/, '')}`
  }
  const safe = safeSourceUrl(text)
  return safe && safe.startsWith('https://') ? safe : undefined
}

/** Hämta en receptsidas JSON-LD via Lagoms serverfunktion. */
export async function fetchRecipePage(url: string, signal?: AbortSignal): Promise<RecipeFetchOutcome> {
  try {
    const res = await fetch(`${API_BASE}/api/recipe-fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    })
    const body = (await res.json().catch(() => null)) as { html?: unknown; error?: unknown; code?: unknown } | null
    // Servern svarar 422 ({ code: 'inget-recept' }) när sidan hämtades men saknade recept.
    if (res.status === 422 || body?.code === 'inget-recept' || body?.error === 'no-recipe') return { ok: false, error: 'noRecipe' }
    // 400 ({ code: 'ogiltig' }): länken går inte att hämta (inte https, egen port …).
    if (res.status === 400 || body?.code === 'ogiltig') return { ok: false, error: 'invalidUrl' }
    if (!res.ok || !body || typeof body.html !== 'string') return { ok: false, error: 'fetch' }
    return { ok: true, html: body.html }
  } catch {
    return { ok: false, error: 'fetch' }
  }
}

interface Imported {
  url: string
  lines: readonly ParsedIngredientLine[]
}

const NO_LINES: readonly ParsedIngredientLine[] = []

export default function RecipeImportPage() {
  useDocumentTitle('Importera recept')
  const navigate = useNavigate()
  const saveRecipe = useFoodStore((s) => s.saveRecipe)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [imported, setImported] = useState<Imported | null>(null)
  const [name, setName] = useState('')
  const [servings, setServings] = useState(4)
  const [minutes, setMinutes] = useState<number | undefined>(undefined)
  const [submitted, setSubmitted] = useState(false)
  /** Egna ingredienser när sidan inte angav några. */
  const [pasted, setPasted] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const review = useIngredientReview(imported?.lines ?? NO_LINES)
  const result = review.result
  const pastedLines = useMemo(() => parseIngredientLines(pasted), [pasted])

  const fetchRecipe = async () => {
    if (loading) return
    const safe = recipeImportUrl(url)
    if (!safe) {
      setError(IMPORT_ERRORS.invalidUrl)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)
    setError(undefined)
    const outcome = await fetchRecipePage(safe, ctrl.signal)
    if (ctrl.signal.aborted) return
    setLoading(false)
    if (!outcome.ok) {
      setError(IMPORT_ERRORS[outcome.error])
      return
    }
    const recipes = parseRecipeJsonLd(outcome.html)
    const recipe = recipes.find((r) => r.ingredients.length > 0) ?? recipes[0]
    if (!recipe) {
      setError(IMPORT_ERRORS.noRecipe)
      return
    }
    setName(recipe.name)
    setServings(Math.min(MAX_SERVINGS, Math.max(1, recipe.servings ?? 4)))
    setMinutes(recipe.totalMinutes)
    setSubmitted(false)
    setPasted('')
    setImported({ url: safe, lines: parseIngredientLines(recipe.ingredients.join('\n')) })
  }

  const nameError = submitted && !name.trim() ? 'Ge receptet ett namn.' : undefined
  const ingredientsError = submitted && result.ingredients.length === 0 ? 'Välj livsmedel och mängd för minst en ingrediens.' : undefined

  const create = () => {
    if (!imported) return
    setSubmitted(true)
    if (!name.trim()) {
      nameRef.current?.focus()
      return
    }
    if (result.ingredients.length === 0) return
    if (!requireAccess('recept')) return
    const recipe = recipeFromDraft({
      ...emptyDraft(),
      name: name.trim().slice(0, 80),
      servings,
      prepMinutes: minutes,
      ingredients: result.ingredients,
      sourceUrl: imported.url,
    })
    saveRecipe(recipe)
    toast('Receptet är importerat – kontrollera gärna mängderna', { tone: 'success' })
    navigate(`/recept/${encodeURIComponent(recipe.id)}`, { replace: true })
  }

  return (
    <div className="px-4 pb-10">
      <PageHeader
        back
        backLabel="Till recepten"
        eyebrow="Kokbok"
        title="Importera recept"
        subtitle="Klistra in en länk till ett recept – Lagom hämtar ingredienserna och räknar ut näringen."
      />

      <div className="flex flex-col gap-4">
        <Card>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void fetchRecipe()
            }}
            className="flex flex-col gap-3"
          >
            <TextField
              label="Länk till receptet"
              type="url"
              inputMode="url"
              prefix={Globe}
              value={url}
              onValueChange={(v) => {
                setUrl(v)
                if (error) setError(undefined)
              }}
              placeholder="https://"
              autoComplete="off"
              enterKeyHint="go"
              error={error}
            />
            <Button type="submit" iconLeft={Download} loading={loading} fullWidth>
              Hämta recept
            </Button>
          </form>
          <p className="mt-3 text-xs leading-relaxed text-ink-3">
            Lagom hämtar namn, portioner, tid och ingredienser från sidan. Instruktionerna läser du på originalsidan – länken sparas i
            receptet. Bara länken skickas till Lagoms server, som hämtar sidan åt dig.
          </p>
        </Card>

        {imported ? (
          <>
            <Card title="Receptet" eyebrow={`Från ${sourceHost(imported.url)}`}>
              <div className="flex flex-col gap-4">
                <TextField ref={nameRef} label="Namn" value={name} onValueChange={setName} maxLength={80} error={nameError} autoComplete="off" />
                <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink-2">Portioner</span>
                    <Stepper label="Portioner" value={servings} onChange={setServings} min={1} max={MAX_SERVINGS} className="self-start" />
                  </div>
                  <NumberField
                    label="Tid"
                    optional
                    value={minutes}
                    onChange={setMinutes}
                    min={0}
                    max={24 * 60}
                    step={5}
                    decimals={0}
                    suffix="min"
                  />
                </div>
              </div>
            </Card>

            <Card title="Ingredienser" eyebrow={imported.lines.length > 0 ? plural(imported.lines.length, 'rad', 'rader') : undefined}>
              {imported.lines.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm leading-relaxed text-ink-2">
                    Sidan angav inga ingredienser. Klistra in dem från receptet, en per rad – sedan får du kontrollera dem här.
                  </p>
                  <TextField
                    multiline
                    minRows={5}
                    label="Ingredienser"
                    value={pasted}
                    onValueChange={setPasted}
                    placeholder={'3 dl vetemjöl\n2 ägg\n5 dl mjölk'}
                  />
                  <Button
                    variant="soft"
                    iconLeft={ClipboardPaste}
                    className="self-start"
                    disabled={pastedLines.length === 0}
                    onClick={() => setImported({ ...imported, lines: pastedLines })}
                  >
                    Matcha ingredienser
                  </Button>
                </div>
              ) : (
                <>
                  <p className="-mt-1 mb-1 text-sm leading-relaxed text-ink-2">
                    Kontrollera att varje rad har fått rätt livsmedel och mängd. Tryck på en rad för att ändra mängden.
                  </p>
                  <IngredientReview review={review} />
                  <p className="mt-2 text-xs leading-relaxed text-ink-3" aria-live="polite">
                    {reviewSummary(result)}
                  </p>
                </>
              )}
              {ingredientsError && (
                <p role="alert" className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink">
                  {ingredientsError}
                </p>
              )}
            </Card>

            <Button size="lg" iconLeft={Save} fullWidth onClick={create}>
              Skapa receptet
            </Button>
          </>
        ) : (
          <Card variant="flat">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-ink-2">
              <ClipboardPaste aria-hidden className="mt-0.5 size-4 shrink-0 text-gran" />
              <span>Har du bara en ingredienslista? Skapa ett nytt recept och välj ”Klistra in ingredienser”.</span>
            </p>
            <Button variant="soft" size="sm" iconLeft={ChefHat} to="/recept/nytt" className="mt-3">
              Nytt recept
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
