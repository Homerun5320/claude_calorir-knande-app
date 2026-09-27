/**
 * Fälten för "Om dig": kön, födelseår, längd, vikt och livsstadium – med samma validering
 * i välkomstflödet och i Inställningar → Profil.
 */
import { useId, type ReactNode } from 'react'
import { Baby, Info, LifeBuoy } from 'lucide-react'
import { NumberField, SegmentedControl, TextField, cx } from '../../components/ui'
import type { ISODate, LifeStage, Sex } from '../../types'
import {
  LIFE_STAGE_OPTIONS,
  SEX_OPTIONS,
  goalFromChoice,
  isMinor,
  lossBlockReason,
  type FieldErrors,
  type ProfileDraft,
  type ProfileField,
} from './profileLogic'

export interface AboutFieldsProps {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
  errors: FieldErrors
  /** Fält som ska visa sina fel (lämnade eller efter försök att gå vidare). */
  visibleErrors: Partial<Record<ProfileField, boolean>>
  onBlurField: (field: ProfileField) => void
  today: ISODate
  /** Visa namnfältet (standard true). */
  showName?: boolean
  autoFocus?: boolean
}

export function Note({ children, tone = 'blabar', icon: Icon = Info }: { children: ReactNode; tone?: 'blabar' | 'sol' | 'mossa'; icon?: typeof Info }) {
  return (
    <div
      className={cx(
        'flex gap-2.5 rounded-2xl px-3.5 py-3 text-[0.875rem] leading-relaxed text-ink',
        tone === 'blabar' && 'bg-blabar-soft',
        tone === 'sol' && 'bg-sol-soft',
        tone === 'mossa' && 'bg-mossa-soft',
      )}
      role="note"
    >
      <Icon
        aria-hidden
        className={cx('mt-0.5 size-4 shrink-0', tone === 'blabar' && 'text-blabar', tone === 'sol' && 'text-hjortron', tone === 'mossa' && 'text-mossa')}
        strokeWidth={2.2}
      />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

export function AboutFields({ draft, onChange, errors, visibleErrors, onBlurField, today, showName = true, autoFocus }: AboutFieldsProps) {
  const sexLabelId = useId()
  const sexHintId = useId()
  const stageLabelId = useId()
  const err = (f: ProfileField) => (visibleErrors[f] ? errors[f] : undefined)
  const wantsLoss = goalFromChoice(draft.goalChoice) === 'ga_ner'
  const blocked = wantsLoss ? lossBlockReason(draft, today) : null
  const minor = isMinor(draft, today)

  return (
    <div className="flex flex-col gap-5">
      {showName && (
        <TextField
          label="Vad vill du att vi kallar dig?"
          optional
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          autoComplete="given-name"
          maxLength={40}
          placeholder="Ditt förnamn"
          autoFocus={autoFocus}
        />
      )}

      <div>
        <div id={sexLabelId} className="mb-1.5 text-sm font-medium text-ink-2">
          Kön
        </div>
        <SegmentedControl<Sex>
          aria-labelledby={sexLabelId}
          // Felet (eller förklaringen) kopplas till radiogruppen så att skärmläsare läser upp det,
          // och aria-invalid gör att "gå till första felet" hittar gruppen. SegmentedControl
          // sprider ARIA-attributen till radiogruppen.
          {...{ 'aria-describedby': sexHintId, 'aria-invalid': err('sex') ? true : undefined }}
          fullWidth
          value={draft.sex ?? ('' as Sex)}
          onChange={(sex) => {
            onChange({ sex, lifeStage: sex === 'man' ? 'ingen' : draft.lifeStage })
            onBlurField('sex')
          }}
          options={SEX_OPTIONS}
        />
        <p id={sexHintId} className={cx('mt-1.5 text-[0.8125rem] leading-snug', err('sex') ? 'text-bad' : 'text-ink-3')}>
          {err('sex') ?? 'Används bara i formeln för ditt energibehov – kroppar med olika kön gör i genomsnitt av med olika mycket energi.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Födelseår"
          value={draft.birthYear}
          onChange={(birthYear) => onChange({ birthYear: birthYear === undefined ? undefined : Math.round(birthYear) })}
          onBlur={() => onBlurField('birthYear')}
          step={1}
          decimals={0}
          placeholder="t.ex. 1990"
          error={err('birthYear')}
          required
        />
        <NumberField
          label="Längd"
          value={draft.heightCm}
          onChange={(heightCm) => onChange({ heightCm })}
          onBlur={() => onBlurField('heightCm')}
          suffix="cm"
          step={1}
          decimals={0}
          placeholder="170"
          error={err('heightCm')}
          required
        />
      </div>

      <NumberField
        label="Vikt idag"
        value={draft.weightKg}
        onChange={(weightKg) => onChange({ weightKg })}
        onBlur={() => onBlurField('weightKg')}
        suffix="kg"
        step={0.1}
        decimals={1}
        placeholder="70,0"
        hint={err('weightKg') ? undefined : 'Ungefär räcker – du kan väga dig senare.'}
        error={err('weightKg')}
        required
      />

      {draft.sex === 'kvinna' && (
        <div>
          <div id={stageLabelId} className="mb-1.5 text-sm font-medium text-ink-2">
            Är du gravid eller ammar du?
          </div>
          <SegmentedControl<LifeStage>
            aria-labelledby={stageLabelId}
            fullWidth
            value={draft.lifeStage}
            onChange={(lifeStage) => onChange({ lifeStage })}
            options={LIFE_STAGE_OPTIONS}
          />
          {draft.lifeStage !== 'ingen' && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] leading-snug text-ink-3">
              <Baby aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Lagom lägger till extra energi och vätska enligt rekommendationerna.
            </p>
          )}
        </div>
      )}

      {blocked && <Note>{blocked} Du kan ändra målet när som helst i Inställningar.</Note>}
      {minor && !blocked && (
        <Note tone="mossa" icon={LifeBuoy}>
          Du som är under 18 år växer fortfarande och behöver mycket energi och näring. Om du funderar på din vikt – prata gärna med
          skolsköterskan, elevhälsan eller{' '}
          <a href="https://www.1177.se" target="_blank" rel="noreferrer" className="font-semibold text-gran underline underline-offset-2">
            1177 Vårdguiden
          </a>{' '}
          först.
        </Note>
      )}
    </div>
  )
}
