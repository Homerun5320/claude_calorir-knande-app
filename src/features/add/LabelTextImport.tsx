/**
 * "Fyll i från förpackningen" – panel i formuläret för eget livsmedel.
 *
 * Ett textfält där man klistrar in eller skannar in näringsdeklarationen med telefonens egen
 * textigenkänning: på iPhone "Skanna text" (Live Text) i textfältet, på Android kamerans
 * textigenkänning eller Google Lens och sedan klistra in. Ingen egen kamera- eller OCR-kod och
 * inget nytt tillägg behövs – och inget skickas någonstans: tolkningen (`lib/nutritionLabel`)
 * sker på enheten och texten sparas inte.
 *
 * "Tolka" visar vad Lagom hittade – med samma tal och i samma kolumn som på förpackningen, "–" för
 * okänt – med varningar. "Fyll i formuläret" fyller bara i – användaren granskar och sparar själv.
 */
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, ChevronDown, ClipboardCheck, Info, ScanText, Sparkles } from 'lucide-react'
import type { NutrientKey } from '../../types'
import { Button, Card, TextField, cx } from '../../components/ui'
import { formatNumber } from '../../lib/format'
import { KJ_PER_KCAL, NUTRIENTS } from '../../lib/nutrients'
import { LABEL_NUTRIENTS, labelValueCount, parseNutritionLabel, type LabelValues, type NutritionLabelResult } from '../../lib/nutritionLabel'
import { DISTRIBUTION, isIosDevice, type Distribution } from '../../config/platform'
import { MAIN_LABELS, MAIN_NUTRIENTS } from './customFood'

const PLACEHOLDER = `T.ex.
Näringsvärde per 100 g
Energi 1550 kJ / 370 kcal
Fett 12 g
varav mättat fett 3,5 g
Kolhydrat 55 g
…`

/** Underrader till fett som inte finns i formulärets huvuddel. */
const FAT_SUB_LABELS: Partial<Record<NutrientKey, string>> = {
  monoFat: 'varav enkelomättat fett',
  polyFat: 'varav fleromättat fett',
}

const SUB_ROWS = new Set<NutrientKey>(['satFat', 'monoFat', 'polyFat', 'sugars'])

interface PreviewRow {
  key: NutrientKey | 'energy'
  label: string
  value: string
  sub?: boolean
}

/** Ett värde med samma precision som på förpackningen (upp till 2 decimaler i gram, 3 i mg och µg). */
function valueText(key: NutrientKey, value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '–'
  const unit = NUTRIENTS[key].unit
  return `${formatNumber(value, unit === 'g' ? 2 : 3)} ${unit}`
}

function energyText(v: LabelValues): string {
  if (v.kJ !== undefined && v.kcal !== undefined) return `${formatNumber(v.kJ)}\u00a0kJ / ${formatNumber(v.kcal, 1)}\u00a0kcal`
  if (v.kJ !== undefined) return `${formatNumber(v.kJ)}\u00a0kJ (≈\u00a0${formatNumber(v.kJ / KJ_PER_KCAL)}\u00a0kcal)`
  if (v.kcal !== undefined) return `${formatNumber(v.kcal, 1)}\u00a0kcal`
  return '–'
}

/** Energi, huvudraderna i deklarationens ordning (alltid, "–" för okänt) och övriga som hittades. */
export function previewRows(values: LabelValues): PreviewRow[] {
  const n = values.nutrients
  const rows: PreviewRow[] = [{ key: 'energy', label: 'Energi', value: energyText(values) }]
  for (const key of MAIN_NUTRIENTS) {
    rows.push({ key, label: MAIN_LABELS[key], value: valueText(key, n[key]), sub: SUB_ROWS.has(key) })
    // Enkel- och fleromättat fett står under mättat fett på förpackningen.
    if (key === 'satFat') {
      for (const extra of ['monoFat', 'polyFat'] as const) {
        if (n[extra] !== undefined) rows.push({ key: extra, label: FAT_SUB_LABELS[extra] ?? NUTRIENTS[extra].name, value: valueText(extra, n[extra]), sub: true })
      }
    }
  }
  const shown = new Set<NutrientKey>([...MAIN_NUTRIENTS, 'monoFat', 'polyFat'])
  for (const key of LABEL_NUTRIENTS) {
    if (shown.has(key) || n[key] === undefined) continue
    rows.push({ key, label: NUTRIENTS[key].name, value: valueText(key, n[key]) })
  }
  return rows
}

/** Vilken kolumn värdena kommer från, på svenska: "Per 100 g", "Per bar (40 g)". */
export function columnDescription(result: NutritionLabelResult): string {
  const c = result.column
  if (!c) return ''
  if (c.kind === 'per100') return c.assumed ? 'Tolkat som per 100\u00a0g' : `Per 100\u00a0${c.unit}${c.qualifier ? ` ${c.qualifier}` : ''}`
  const what = c.label.replace(/^1\s+/, '')
  if (c.amount !== undefined) return `Per ${what} (${formatNumber(c.amount, 1)}\u00a0${c.unit})`
  return `Per ${what} – portionens vikt saknas`
}

export type ScanHintPlatform = 'ios' | 'android' | 'both'

/**
 * Vilken förklaring som visas. Apparna nämner bara sin egen plattform (App Store-riktlinje 2.3.10:
 * inga namn på andra mobilplattformar i appen); på webben efter enheten, annars båda.
 */
export function scanHintPlatform(
  distribution: Distribution = DISTRIBUTION,
  ios: boolean = isIosDevice(),
  userAgent: string = typeof navigator === 'undefined' ? '' : (navigator.userAgent ?? ''),
): ScanHintPlatform {
  if (distribution === 'appstore') return 'ios'
  if (distribution === 'play') return 'android'
  if (ios) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'both'
}

function ScanHint({ platform }: { platform: ScanHintPlatform }) {
  const iphone = (
    <>
      tryck i rutan och välj <span className="font-semibold text-ink">Skanna text</span> – texten läses av på telefonen.
    </>
  )
  const android = <>kopiera texten med kamerans textigenkänning och klistra in här.</>
  return (
    <p className="text-sm leading-relaxed text-ink-2">
      {platform === 'ios' ? (
        <>Skanna in näringsdeklarationen: {iphone} Eller klistra in texten.</>
      ) : platform === 'android' ? (
        <>Skanna in näringsdeklarationen: {android}</>
      ) : (
        <>
          På iPhone: {iphone} På Android: {android}
        </>
      )}
    </p>
  )
}

export interface LabelTextImportProps {
  /** Öppen från början (t.ex. från skanningen när en produkt saknas). */
  defaultOpen?: boolean
  /** Fyll i formuläret med de tolkade värdena. */
  onApply: (result: NutritionLabelResult) => void
  /**
   * Anropas när panelen har fällts ihop efter "Fyll i formuläret" – först då står formuläret på sin
   * plats, så att det går att rulla dit (medan panelen fälls ihop flyttar sig allt under den).
   */
  onApplied?: () => void
  className?: string
}

export function LabelTextImport({ defaultOpen = false, onApply, onApplied, className }: LabelTextImportProps) {
  const reduce = useReducedMotion()
  const id = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [text, setText] = useState('')
  const [result, setResult] = useState<NutritionLabelResult | null>(null)
  /** Det som läses upp. Töms före varje tolkning så att samma resultat läses upp igen. */
  const [announcement, setAnnouncement] = useState('')
  const [hintPlatform] = useState(scanHintPlatform)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const applied = useRef(false)
  const announceFrame = useRef<number | undefined>(undefined)
  const headingId = `${id}-rubrik`
  const panelId = `${id}-panel`

  useEffect(() => () => cancelAnimationFrame(announceFrame.current ?? 0), [])

  const interpret = () => {
    const next = parseNutritionLabel(text)
    setResult(next)
    setAnnouncement('')
    cancelAnimationFrame(announceFrame.current ?? 0)
    announceFrame.current = requestAnimationFrame(() => setAnnouncement(summaryText(next)))
  }
  const reset = () => {
    setResult(null)
    setAnnouncement('')
  }
  const apply = () => {
    if (!result) return
    onApply(result)
    reset()
    applied.current = true
    setOpen(false)
  }

  return (
    <Card padding="lg" as="section" aria-labelledby={headingId} className={cx('print:hidden', className)}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="-m-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-surface-2"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gran-soft text-gran" aria-hidden>
            <ScanText className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span id={headingId} className="block font-display text-[1.1875rem] font-semibold leading-snug tracking-tight">
              Fyll i från förpackningen
            </span>
            <span className="block font-sans text-sm font-normal text-ink-3">Skanna eller klistra in näringsdeklarationen</span>
          </span>
          <ChevronDown className={cx('size-5 shrink-0 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h2>

      <AnimatePresence
        initial={false}
        onExitComplete={() => {
          if (!applied.current) return
          applied.current = false
          onApplied?.()
        }}
      >
        {open && (
          <motion.div
            id={panelId}
            key="panel"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 pt-5">
              <ScanHint platform={hintPlatform} />
              <TextField
                ref={textRef}
                multiline
                minRows={5}
                label="Näringsdeklarationen som text"
                placeholder={PLACEHOLDER}
                value={text}
                onValueChange={(v) => {
                  setText(v)
                  reset()
                }}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                maxLength={8000}
                hint="Texten tolkas på enheten och sparas inte."
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" iconLeft={Sparkles} onClick={interpret} disabled={text.trim() === ''}>
                  Tolka
                </Button>
                {text !== '' && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setText('')
                      reset()
                      // Knappen försvinner – fokus till textrutan, som är nästa steg.
                      textRef.current?.focus()
                    }}
                  >
                    Rensa
                  </Button>
                )}
              </div>
              {result && <LabelPreview result={result} onApply={apply} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Finns hela tiden så att skärmläsare säger vad tolkningen gav. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Card>
  )
}

/** Sammanfattningen som läses upp efter "Tolka". */
export function summaryText(result: NutritionLabelResult): string {
  const count = labelValueCount(result)
  if (count === 0) return 'Lagom hittade inga näringsvärden i texten.'
  const found = `Lagom hittade ${count === 1 ? '1 värde' : `${count} värden`}, ${columnDescription(result).toLowerCase()}.`
  return result.warnings.length > 0 ? `${found} ${result.warnings.length === 1 ? '1 sak' : `${result.warnings.length} saker`} att kontrollera.` : found
}

function LabelPreview({ result, onApply }: { result: NutritionLabelResult; onApply: () => void }) {
  const count = labelValueCount(result)
  if (count === 0) {
    return (
      <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
        Lagom hittade inga näringsvärden i texten. Kontrollera att hela näringsdeklarationen kom med – från ”Energi” till ”Salt” – eller fyll i
        värdena för hand nedan.
      </p>
    )
  }
  // Samma tal som på förpackningen – också per portion. Lagom räknar om när livsmedlet sparas.
  const rows = previewRows(result.stated)
  const c = result.column
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        <span className="font-semibold">Lagom hittade {count === 1 ? '1 värde' : `${count} värden`}</span>
        <span className="text-ink-2"> · {columnDescription(result)}</span>
      </p>

      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm" aria-label="Tolkade värden">
        {rows.map((r) => (
          <Fragment key={r.key}>
            <dt className={cx(r.sub ? 'pl-3 text-ink-2' : 'font-medium text-ink')}>{r.label}</dt>
            <dd className={cx('text-right tabular-nums', r.value === '–' ? 'text-ink-3' : 'text-ink')}>{r.value}</dd>
          </Fragment>
        ))}
      </dl>

      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-hjortron-soft px-4 py-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
          <ul className="flex flex-col gap-1" aria-label="Kontrollera">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {(result.notes.length > 0 || (c?.kind === 'portion' && c.amount !== undefined)) && (
        <div className="flex items-start gap-2.5 px-1 text-sm text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
          <ul className="flex flex-col gap-1">
            {c?.kind === 'portion' && c.amount !== undefined && (
              <li>Formuläret fylls i per portion, som på förpackningen – Lagom räknar om till per 100{'\u00a0'}{c.unit} när du sparar.</li>
            )}
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {result.unparsed.length > 0 && (
        <div className="px-1 text-sm text-ink-2">
          <p className="font-medium text-ink">Kunde inte tolkas</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-ink-3">
            {result.unparsed.map((u) => (
              <li key={u} className="break-words">
                {u}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button iconLeft={ClipboardCheck} onClick={onApply} fullWidth>
        Fyll i formuläret
      </Button>
      <p className="text-center text-xs text-ink-3">Värdena fylls bara i – granska dem och spara själv.</p>
    </div>
  )
}
