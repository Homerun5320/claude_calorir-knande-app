/**
 * Select – stylad inbyggd <select> (bäst tillgänglighet och native väljare på mobil).
 */
import { useId, type ComponentProps, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx, renderIcon, type IconLike } from './Button'
import { FIELD_SHELL, Field, fieldDescribedBy } from './TextField'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectOptionGroup<T extends string = string> {
  group: string
  options: ReadonlyArray<SelectOption<T>>
}

export interface SelectProps<T extends string = string> extends Omit<ComponentProps<'select'>, 'value' | 'defaultValue' | 'onChange' | 'prefix' | 'children' | 'size'> {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  labelHidden?: boolean
  optional?: boolean
  labelAction?: ReactNode
  /** Valt värde. Använd '' för "inget valt" (visar `placeholder`). */
  value?: T | ''
  defaultValue?: T | ''
  /** Alternativ (eller grupper av alternativ). */
  options: ReadonlyArray<SelectOption<T> | SelectOptionGroup<T>>
  /** Anropas med det valda värdet. */
  onChange?: (value: T) => void
  /** Text för ett tomt förval (värde ""), t.ex. "Välj …". */
  placeholder?: string
  /** Ikon före värdet. */
  prefix?: IconLike
  size?: 'sm' | 'md'
  className?: string
  fieldClassName?: string
}

function isGroup<T extends string>(o: SelectOption<T> | SelectOptionGroup<T>): o is SelectOptionGroup<T> {
  return 'group' in o
}

/**
 * ```tsx
 * <Select label="Aktivitetsnivå" value={level} onChange={setLevel}
 *   options={[{ value: 'lag', label: 'Låg' }, { value: 'mattlig', label: 'Måttlig' }]} />
 * ```
 */
export function Select<T extends string = string>({
  label,
  hint,
  error,
  labelHidden,
  optional,
  labelAction,
  options,
  onChange,
  placeholder,
  prefix,
  size = 'md',
  className,
  fieldClassName,
  id: idProp,
  disabled,
  defaultValue,
  ...rest
}: SelectProps<T>) {
  const autoId = useId()
  const id = idProp ?? autoId
  const invalid = Boolean(error)
  return (
    <Field id={id} label={label} hint={hint} error={error} labelHidden={labelHidden} optional={optional} labelAction={labelAction} className={className}>
      <div
        data-invalid={invalid}
        data-disabled={Boolean(disabled)}
        className={cx(FIELD_SHELL, size === 'sm' ? 'h-10' : 'h-12', 'pr-0', fieldClassName)}
      >
        {prefix !== undefined && <span className="pointer-events-none flex shrink-0 items-center text-ink-3">{renderIcon(prefix, 'size-5')}</span>}
        <select
          {...rest}
          // Okontrollerat med platshållare: börja på det tomma förvalet.
          defaultValue={rest.value === undefined ? (defaultValue ?? (placeholder !== undefined ? '' : undefined)) : undefined}
          id={id}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={fieldDescribedBy(id, hint, error, rest['aria-describedby'])}
          onChange={(e) => onChange?.(e.target.value as T)}
          className={cx(
            'h-full min-w-0 flex-1 cursor-pointer appearance-none truncate bg-transparent pr-10 text-ink outline-none focus-visible:outline-none',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) =>
            isGroup(o) ? (
              <optgroup key={o.group} label={o.group}>
                {o.options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ),
          )}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3.5 size-[1.125rem] text-ink-3" strokeWidth={2.2} />
      </div>
    </Field>
  )
}
