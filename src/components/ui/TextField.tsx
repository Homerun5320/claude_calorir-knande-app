/**
 * TextField – textfält med etikett, hjälptext, felmeddelande, prefix/suffix och rensa-knapp.
 * `multiline` ger en textarea som växer med innehållet.
 *
 * Filen exporterar även fältramen (`Field`, `FIELD_SHELL`, `fieldDescribedBy`, `mergeRefs`)
 * som NumberField och Select återanvänder.
 */
import { useId, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type Ref, type RefCallback } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { cx, renderIcon, type IconLike } from './Button'

// ---------------------------------------------------------------------------
// Fältram
// ---------------------------------------------------------------------------

/** Slår ihop flera refs till en callback-ref. */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (typeof ref === 'function') ref(value)
      else if (ref) (ref as { current: T | null }).current = value
    }
  }
}

/**
 * Ytan runt ett inmatningsfält. Fokus markeras på ramen (focus-within), inte på själva input.
 * Den tunna ramen (`field-line`) har minst 3:1 mot sidan och korten i båda temana (WCAG 1.4.11) –
 * fyllningen ensam (surface-2) skulle bara ge cirka 1,1:1. Ogiltigt fält: kraftigare lingonram.
 */
export const FIELD_SHELL =
  'relative flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 text-ink ring-1 ring-inset ring-field-line ' +
  'transition-[box-shadow,background-color] duration-150 hover:ring-ink-3 ' +
  'focus-within:bg-surface focus-within:ring-2 focus-within:ring-gran focus-within:hover:ring-gran ' +
  'data-[invalid=true]:ring-2 data-[invalid=true]:ring-lingon data-[invalid=true]:hover:ring-lingon ' +
  'data-[invalid=true]:focus-within:ring-lingon data-[invalid=true]:focus-within:hover:ring-lingon ' +
  'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50'

/** Själva input-elementet inne i ramen. 16 px text förhindrar zoom i iOS. */
export const FIELD_INPUT =
  'min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 focus-visible:outline-none disabled:cursor-not-allowed'

/** aria-describedby för hjälp-/feltext. */
export function fieldDescribedBy(id: string, hint: ReactNode, error: ReactNode, extra?: string): string | undefined {
  const ids = [extra, error ? `${id}-error` : hint ? `${id}-hint` : undefined].filter(Boolean)
  return ids.length ? ids.join(' ') : undefined
}

export interface FieldProps {
  /** Id på input-elementet (etiketten pekar hit). */
  id: string
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  /** Dölj etiketten visuellt (läses fortfarande upp). */
  labelHidden?: boolean
  /** Visar "valfritt" efter etiketten. */
  optional?: boolean
  /** Innehåll till höger om etiketten, t.ex. en länk. */
  labelAction?: ReactNode
  /**
   * Läs upp felmeddelandet för skärmläsare när det dyker upp (standard true). NumberField slår av
   * det för gränsmeddelandet medan man skriver och läser upp det efter en paus och vid blur i stället.
   */
  announceError?: boolean
  className?: string
  children: ReactNode
}

/**
 * Etikett + fält + hjälp-/feltext.
 *
 * Felet ligger i en beständig levande region (`aria-live="polite"`): ett fel som dyker upp medan man
 * fyller i läses upp (WCAG 3.3.1/4.1.3), men ett fel som redan finns när fältet visas läses inte upp
 * på en gång – till skillnad från `role="alert"`, som annars ropar ut varje tomt obligatoriskt fält
 * när ett ark öppnas. Fältet pekar på felet med aria-describedby och aria-invalid (se `fieldDescribedBy`).
 * Regionen är tom (och tar ingen plats, `empty:-mt-1.5` tar bort radavståndet) när inget fel visas.
 */
export function Field({ id, label, hint, error, labelHidden, optional, labelAction, announceError = true, className, children }: FieldProps) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {(label !== undefined || labelAction !== undefined) && (
        <div className={cx('flex items-baseline justify-between gap-3', labelHidden && 'sr-only')}>
          {label !== undefined && (
            <label htmlFor={id} className="text-sm font-medium text-ink-2">
              {label}
              {optional && <span className="font-normal text-ink-3"> · valfritt</span>}
            </label>
          )}
          {labelAction}
        </div>
      )}
      {children}
      <div aria-live={announceError ? 'polite' : 'off'} aria-atomic="true" className="empty:-mt-1.5">
        {error ? (
          <p id={`${id}-error`} className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-lingon">
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0" strokeWidth={2.2} />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
      {!error && hint ? (
        <p id={`${id}-hint`} className="text-[0.8125rem] leading-snug text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TextField
// ---------------------------------------------------------------------------

interface TextFieldOwnProps {
  label?: ReactNode
  hint?: ReactNode
  /** Felmeddelande – markerar fältet som ogiltigt. */
  error?: ReactNode
  /** Ikon eller text före värdet (t.ex. Search-ikon). */
  prefix?: IconLike
  /** Ikon eller text efter värdet (t.ex. "g"). */
  suffix?: IconLike
  /** Visa en rensa-knapp när fältet har innehåll. */
  clearable?: boolean
  /** Anropas efter att fältet rensats med knappen. */
  onClear?: () => void
  /** Bekvämlighet: anropas med det nya värdet vid varje ändring. */
  onValueChange?: (value: string) => void
  labelHidden?: boolean
  optional?: boolean
  labelAction?: ReactNode
  /** Klass på ytterboxen (etikett + fält). */
  className?: string
  /** Klass på själva fältramen. */
  fieldClassName?: string
}

export type TextFieldInputProps = TextFieldOwnProps &
  Omit<ComponentProps<'input'>, keyof TextFieldOwnProps | 'size'> & { multiline?: false }

export type TextFieldAreaProps = TextFieldOwnProps &
  Omit<ComponentProps<'textarea'>, keyof TextFieldOwnProps> & {
    multiline: true
    /** Minsta antal rader (standard 3). Fältet växer med innehållet. */
    minRows?: number
  }

export type TextFieldProps = TextFieldInputProps | TextFieldAreaProps

/**
 * ```tsx
 * <TextField label="Namn" value={name} onValueChange={setName} />
 * <TextField label="Sök" labelHidden prefix={Search} clearable placeholder="Sök livsmedel" … />
 * <TextField multiline label="Anteckning" minRows={4} … />
 * ```
 */
export function TextField(props: TextFieldProps) {
  const autoId = useId()
  const id = props.id ?? autoId
  const innerRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [uncontrolledFilled, setUncontrolledFilled] = useState(() => Boolean(props.defaultValue))

  const {
    label,
    hint,
    error,
    prefix,
    suffix,
    clearable,
    onClear,
    onValueChange,
    labelHidden,
    optional,
    labelAction,
    className,
    fieldClassName,
    ...native
  } = props
  const filled = native.value !== undefined ? String(native.value).length > 0 : uncontrolledFilled
  const invalid = Boolean(error) || native['aria-invalid'] === true || native['aria-invalid'] === 'true'
  const describedBy = fieldDescribedBy(id, hint, error, native['aria-describedby'])
  const showClear = clearable && filled && !native.disabled && !native.readOnly

  const clear = () => {
    const el = innerRef.current
    if (!el) return
    // Sätt värdet via prototypens setter och skicka ett input-event så att Reacts onChange körs
    // även för kontrollerade fält.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, '')
    el.dispatchEvent(new Event('input', { bubbles: true }))
    onClear?.()
    el.focus()
  }

  const handleValue = (value: string) => {
    setUncontrolledFilled(value.length > 0)
    onValueChange?.(value)
  }

  const adornment = (node: IconLike | undefined) =>
    node === undefined ? null : (
      <span className="flex shrink-0 items-center text-[0.9375rem] font-medium text-ink-3">{renderIcon(node, 'size-5', 2)}</span>
    )

  const clearButton = showClear ? (
    <button
      type="button"
      onClick={clear}
      aria-label="Rensa"
      className="relative -mr-1.5 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors after:absolute after:-inset-1.5 hover:bg-surface-3 hover:text-ink"
    >
      <X aria-hidden className="size-4" strokeWidth={2.4} />
    </button>
  ) : null

  const field = (shellClass: string, control: ReactNode) => (
    <Field id={id} label={label} hint={hint} error={error} labelHidden={labelHidden} optional={optional} labelAction={labelAction} className={className}>
      <div data-invalid={invalid} data-disabled={Boolean(native.disabled)} className={cx(FIELD_SHELL, shellClass, fieldClassName)}>
        {adornment(prefix)}
        {control}
        {adornment(suffix)}
        {clearButton}
      </div>
    </Field>
  )

  if (native.multiline) {
    const { multiline: _multiline, minRows = 3, ref, onChange, style, ...rest } = native
    return field(
      'items-start py-3',
      <textarea
        {...rest}
        id={id}
        ref={mergeRefs(ref, innerRef as Ref<HTMLTextAreaElement>)}
        rows={minRows}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          onChange?.(e)
          handleValue(e.target.value)
        }}
        // field-sizing: content låter fältet växa med texten i moderna webbläsare.
        style={{ fieldSizing: 'content', minHeight: `${minRows * 1.5}rem`, ...style } as CSSProperties}
        className={cx(FIELD_INPUT, 'resize-none leading-6')}
      />,
    )
  }

  const { multiline: _multiline, ref, onChange, type = 'text', ...rest } = native
  return field(
    'h-12',
    <input
      {...rest}
      id={id}
      type={type}
      ref={mergeRefs(ref, innerRef as Ref<HTMLInputElement>)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        onChange?.(e)
        handleValue(e.target.value)
      }}
      className={cx(FIELD_INPUT, 'h-full')}
    />,
  )
}
