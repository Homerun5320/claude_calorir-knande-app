/**
 * NumberField – sifferfält för svenska tal ("1,5", "1 234", "½", "1 1/2").
 *
 * - `inputMode="decimal"` ger siffertangentbord med decimalkomma på mobil.
 * - Den råa texten behålls medan man skriver (inget omformaterande mitt i), värdet tolkas med
 *   `parseSwedishNumber` och skickas som `number | undefined` (tomt fält = undefined).
 * - min/max kläms INTE medan man skriver – då gick "7,24" inte att skriva i ett fält med min 20
 *   (första siffran blev 20). Ett tal utanför gränserna ger i stället ett meddelande vid fältet
 *   ("Ange ett värde mellan 20 och 400 kg.") och skickas som `undefined`, så att föräldern aldrig
 *   får ett ogiltigt värde. Enter skickar inte formuläret då. Värdet kläms först när fältet
 *   lämnas eller när man stegar (knappar/piltangenter), och texten snyggas till.
 * - Piltangenter upp/ned stegar (Shift = ×10). Valfria −/+-knappar med håll-för-att-upprepa.
 * - `size="lg"` är den stora portionsväljaren med siffror i Fraunces.
 */
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { formatNumber, parseSwedishNumber } from '../../lib/format'
import { cx, renderIcon, type IconLike } from './Button'
import { FIELD_INPUT, FIELD_SHELL, Field, fieldDescribedBy, mergeRefs } from './TextField'
import { StepButton, clampNumber, stepDecimals, stepNumber } from './Stepper'

export interface NumberFieldProps {
  value: number | undefined
  /** Anropas medan man skriver (med giltiga tal) och vid steg. Tomt fält ger undefined. */
  onChange: (value: number | undefined) => void
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  labelHidden?: boolean
  optional?: boolean
  labelAction?: ReactNode
  min?: number
  max?: number
  /** Steglängd för knappar och piltangenter (standard 1). */
  step?: number
  /** Max antal decimaler när värdet visas/avrundas (standard: stegets decimaler, minst 2). */
  decimals?: number
  /** Enhet efter värdet, t.ex. "g" eller "kcal". */
  suffix?: ReactNode
  /** Ikon eller text före värdet. */
  prefix?: IconLike
  /** Visa −/+-knappar (standard: på för lg, av för md). */
  stepper?: boolean
  /** md = vanligt formulärfält, lg = stor portionsväljare. */
  size?: 'md' | 'lg'
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  required?: boolean
  autoFocus?: boolean
  /** Webbläsarens autofyll, t.ex. "bday-year" för födelseår. Standard "off". */
  autoComplete?: string
  id?: string
  name?: string
  'aria-label'?: string
  /** Markera allt vid fokus så att ett nytt värde kan skrivas direkt (standard true). */
  selectOnFocus?: boolean
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void
  onFocus?: (e: FocusEvent<HTMLInputElement>) => void
  ref?: Ref<HTMLInputElement>
  className?: string
  fieldClassName?: string
}

/** Formatera för redigering: decimalkomma, inga tusentalsavgränsare, inga onödiga nollor. */
function toEditText(value: number | undefined, decimals: number): string {
  if (value === undefined || !Number.isFinite(value)) return ''
  const n = Number(value.toFixed(decimals))
  return String(Object.is(n, -0) ? 0 : n).replace('.', ',')
}

/** Typografi för den stora portionsväljaren (delas av fältet och dess breddspegel). */
const LARGE_TEXT = 'display-num text-[3.5rem] font-medium leading-none'

function sameNumber(a: number | undefined, b: number | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && Math.abs(a - b) < 1e-9)
}

function parseInput(raw: string): number {
  return parseSwedishNumber(raw.trim().replace('−', '-'))
}

/** "Ange ett värde mellan 10 och 3 000 ml." – eller bara min/max om den andra gränsen saknas. */
export function rangeMessage(min: number | undefined, max: number | undefined, unit?: string, decimals = 2): string {
  const u = unit ? `\u00a0${unit}` : ''
  const f = (n: number) => formatNumber(n, decimals)
  if (min !== undefined && max !== undefined) return `Ange ett värde mellan ${f(min)} och ${f(max)}${u}.`
  if (min !== undefined) return `Ange minst ${f(min)}${u}.`
  if (max !== undefined) return `Ange högst ${f(max)}${u}.`
  return ''
}

/**
 * ```tsx
 * <NumberField label="Vikt" value={kg} onChange={setKg} suffix="kg" step={0.1} min={30} max={300} />
 * <NumberField size="lg" label="Mängd" labelHidden value={grams} onChange={setGrams} suffix="g" step={10} min={0} />
 * ```
 */
export function NumberField({
  value,
  onChange,
  label,
  hint,
  error,
  labelHidden,
  optional,
  labelAction,
  min,
  max,
  step = 1,
  decimals,
  suffix,
  prefix,
  stepper,
  size = 'md',
  placeholder,
  disabled,
  readOnly,
  required,
  autoFocus,
  autoComplete = 'off',
  id: idProp,
  name,
  'aria-label': ariaLabel,
  selectOnFocus = true,
  onBlur,
  onFocus,
  ref,
  className,
  fieldClassName,
}: NumberFieldProps) {
  const autoId = useId()
  const id = idProp ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const justFocused = useRef(false)
  const dec = decimals ?? Math.max(stepDecimals(step), 2)
  const allowNegative = min === undefined || min < 0
  const large = size === 'lg'
  const showStepper = stepper ?? large

  // Rå text + senast synkade värde. Om värdet ändras utifrån (t.ex. av steg eller återställning)
  // skrivs texten om – annars lämnas det användaren skriver orört.
  const [text, setText] = useState(() => toEditText(value, dec))
  const [synced, setSynced] = useState(value)
  if (!sameNumber(value, synced)) {
    setSynced(value)
    setText(toEditText(value, dec))
  }

  const emit = (next: number | undefined) => {
    setSynced(next)
    if (!sameNumber(next, value)) onChange(next)
  }

  const allowed = allowNegative ? /^[-−]?[\d\s  .,½¼¾⅓⅔/]*$/ : /^[\d\s  .,½¼¾⅓⅔/]*$/
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max)

  // Tal utanför gränserna medan man skriver: meddelande i stället för att klämma.
  const typed = text.trim() === '' ? Number.NaN : parseInput(text)
  const outOfRange = !Number.isNaN(typed) && !inRange(typed)
  const unitText = typeof suffix === 'string' ? suffix : undefined
  const rangeError = outOfRange ? rangeMessage(min, max, unitText, dec) : undefined
  // Uppläses när Enter stoppas av ett värde utanför gränserna.
  const [announcement, setAnnouncement] = useState('')

  const handleInput = (raw: string) => {
    if (!allowed.test(raw)) return
    setText(raw)
    setAnnouncement('')
    if (raw.trim() === '') {
      emit(undefined)
      return
    }
    const parsed = parseInput(raw)
    // Ofullständig inmatning ("-", "1/", "1 1") – vänta tills den blir ett tal.
    if (Number.isNaN(parsed)) return
    // Utanför gränserna: föräldern får inget ogiltigt värde (undefined = inget giltigt tal än).
    emit(inRange(parsed) ? parsed : undefined)
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    const trimmed = text.trim()
    if (trimmed !== '') {
      const parsed = parseInput(trimmed)
      if (Number.isNaN(parsed)) {
        // Ogiltigt – återgå till senaste giltiga värde.
        setText(toEditText(value, dec))
      } else {
        const next = Number(clampNumber(parsed, min, max).toFixed(dec))
        emit(next)
        setText(toEditText(next, dec))
      }
    } else if (text !== '') {
      setText('')
    }
    setAnnouncement('')
    onBlur?.(e)
  }

  const stepBy = (dir: 1 | -1, multiplier = 1) => {
    if (disabled || readOnly) return
    // Stega från det som står i fältet (även ett tal utanför gränserna – det kläms då).
    const from = !Number.isNaN(typed) ? typed : value
    const next = stepNumber(from, dir, step, min, max, multiplier)
    emit(next)
    setText(toEditText(next, dec))
    setAnnouncement('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      stepBy(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey ? 10 : 1)
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      stepBy(e.key === 'PageUp' ? 1 : -1, 10)
    } else if (e.key === 'Enter' && rangeError) {
      // Skicka inte formuläret med ett värde utanför gränserna – säg varför i stället.
      e.preventDefault()
      setAnnouncement(rangeError)
    }
  }

  // Gränsmeddelandet går före förälderns fel (som ofta bara säger att värdet saknas).
  const shownError = rangeError ?? error
  const invalid = Boolean(shownError)
  const describedBy = fieldDescribedBy(id, hint, shownError)
  const unitSuffix = unitText ? ` ${unitText}` : ''
  const atMin = min !== undefined && value !== undefined && value <= min
  const atMax = max !== undefined && value !== undefined && value >= max
  const labelText = typeof label === 'string' ? label.toLocaleLowerCase('sv-SE') : (ariaLabel?.toLocaleLowerCase('sv-SE') ?? 'värdet')

  const live = (
    <span className="sr-only" aria-live="assertive">
      {announcement}
    </span>
  )

  const input = (
    <input
      ref={mergeRefs(ref, inputRef)}
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete={autoComplete}
      autoCorrect="off"
      spellCheck={false}
      role="spinbutton"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={value !== undefined ? `${text || toEditText(value, dec)}${unitSuffix}` : undefined}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      aria-required={required || undefined}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      autoFocus={autoFocus}
      value={text}
      // I stort läge styrs bredden av spegeln – size=1 hindrar fältets egen standardbredd.
      size={large ? 1 : undefined}
      onChange={(e) => handleInput(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={(e) => {
        if (selectOnFocus && !readOnly) {
          e.currentTarget.select()
          justFocused.current = true
        }
        onFocus?.(e)
      }}
      // Safari avmarkerar vid mouseup direkt efter fokus – behåll markeringen.
      onMouseUp={(e) => {
        if (justFocused.current) {
          e.preventDefault()
          justFocused.current = false
        }
      }}
      onBlur={handleBlur}
      className={
        large
          ? cx(LARGE_TEXT, 'col-start-1 row-start-1 w-full min-w-0 bg-transparent p-0 text-center text-ink outline-none placeholder:text-ink-3/60 focus-visible:outline-none')
          : cx(FIELD_INPUT, 'h-full tabular-nums')
      }
    />
  )

  if (large) {
    return (
      <Field id={id} label={label} hint={hint} error={shownError} labelHidden={labelHidden} optional={optional} labelAction={labelAction} className={className}>
        {live}
        <div
          data-invalid={invalid}
          className={cx('flex items-center justify-between gap-3', disabled && 'pointer-events-none opacity-50', fieldClassName)}
        >
          {showStepper && (
            <StepButton direction={-1} onStep={() => stepBy(-1)} label={`Minska ${labelText}`} disabled={disabled || readOnly || atMin} size="lg" variant="soft" />
          )}
          <div
            className="group/num flex min-w-0 flex-1 cursor-text flex-col items-center"
            onClick={() => inputRef.current?.focus()}
          >
            <div className="flex max-w-full items-baseline justify-center gap-1.5">
              {prefix !== undefined && <span className="font-display text-2xl text-ink-3">{renderIcon(prefix, 'size-6')}</span>}
              {/* Fältet får exakt textens bredd: en osynlig spegel med samma typsnitt bestämmer gridcellen. */}
              <span className="inline-grid min-w-0 max-w-full">
                <span aria-hidden className={cx(LARGE_TEXT, 'invisible col-start-1 row-start-1 whitespace-pre px-0.5')}>
                  {text || placeholder || '0'}
                </span>
                {input}
              </span>
              {suffix !== undefined && <span className="font-display text-2xl font-medium text-ink-3">{suffix}</span>}
            </div>
            <span
              aria-hidden
              className={cx(
                'mt-2 h-[3px] w-14 rounded-full transition-[background-color,width] duration-200',
                invalid ? 'bg-lingon' : 'bg-line group-focus-within/num:w-20 group-focus-within/num:bg-gran',
              )}
            />
          </div>
          {showStepper && (
            <StepButton direction={1} onStep={() => stepBy(1)} label={`Öka ${labelText}`} disabled={disabled || readOnly || atMax} size="lg" variant="soft" />
          )}
        </div>
      </Field>
    )
  }

  return (
    <Field id={id} label={label} hint={hint} error={shownError} labelHidden={labelHidden} optional={optional} labelAction={labelAction} className={className}>
      {live}
      <div data-invalid={invalid} data-disabled={Boolean(disabled)} className={cx(FIELD_SHELL, 'h-12', showStepper && 'pr-1.5', fieldClassName)}>
        {prefix !== undefined && <span className="flex shrink-0 items-center text-ink-3">{renderIcon(prefix, 'size-5')}</span>}
        {input}
        {suffix !== undefined && <span className="shrink-0 text-[0.9375rem] font-medium text-ink-3">{suffix}</span>}
        {showStepper && (
          <div className="ml-1 flex shrink-0 items-center gap-1">
            <StepButton direction={-1} onStep={() => stepBy(-1)} label={`Minska ${labelText}`} disabled={disabled || readOnly || atMin} size="sm" />
            <StepButton direction={1} onStep={() => stepBy(1)} label={`Öka ${labelText}`} disabled={disabled || readOnly || atMax} size="sm" />
          </div>
        )}
      </div>
    </Field>
  )
}
