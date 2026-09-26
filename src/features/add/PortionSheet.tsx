/**
 * Bottenark med portionsväljaren för ett livsmedel – används av sök, korg och streckkodsläsaren.
 * Knapparna ligger i arkets fasta sidfot så att de syns även när tangentbordet är uppe.
 */
import { useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Info, Users } from 'lucide-react'
import type { Food, UnitKey } from '../../types'
import { Button, IconButton, Sheet, type IconLike } from '../../components/ui'
import { PortionPicker, type PortionSelection } from '../../components/domain/PortionPicker'
import { hasUsableNutrition } from '../../lib/openFoodFacts'
import { sourceMeta } from './addLogic'
import { FoodSourceBadge } from './components'

export interface SheetAction {
  label: string
  icon?: IconLike
  onClick: (amount: number, unit: UnitKey, grams: number) => void
}

export interface PortionSheetProps {
  /** Livsmedlet – `null` stänger arket. */
  food: Food | null
  onClose: () => void
  /** Huvudknappen (även Enter i mängdfältet). */
  primary: SheetAction
  /** Valfri andra knapp. */
  secondary?: SheetAction
  initialAmount?: number
  initialUnit?: UnitKey
  /** Länk till detaljsidan (visar en info-knapp i huvudet). */
  detailsTo?: string
  /** Extra innehåll överst i arket. */
  children?: ReactNode
  /** Knapp eller länk i varningen när näringsvärden saknas (standard: hänvisning till detaljsidan). */
  missingNutritionAction?: ReactNode
}

export function PortionSheet({ food, onClose, primary, secondary, initialAmount, initialUnit, detailsTo, children, missingNutritionAction }: PortionSheetProps) {
  const navigate = useNavigate()
  // Behåll livsmedlet medan arket animeras ut.
  const [shown, setShown] = useState<Food | null>(food)
  if (food && food !== shown) setShown(food)
  const current = food ?? shown
  const sel = useRef<PortionSelection | null>(null)
  const [valid, setValid] = useState(true)

  const run = (action: SheetAction) => {
    const s = sel.current
    if (!s || !Number.isFinite(s.grams) || s.grams <= 0) return
    action.onClick(s.amount, s.unit, s.grams)
  }

  const meta = current ? sourceMeta(current.source) : null
  const missingNutrition = current ? !hasUsableNutrition(current) : false

  return (
    <Sheet
      open={food !== null}
      onClose={onClose}
      onExitComplete={() => setShown(null)}
      title={current?.name ?? 'Välj mängd'}
      description={
        current ? (
          <span className="flex flex-wrap items-center gap-1.5">
            {current.brand && <span className="text-ink-2">{current.brand}</span>}
            <FoodSourceBadge source={current.source} />
          </span>
        ) : undefined
      }
      headerAction={
        detailsTo && current ? (
          <IconButton
            icon={Info}
            aria-label={`Detaljer om ${current.name}`}
            variant="ghost"
            size="sm"
            noTooltip
            onClick={() => navigate(detailsTo, { state: { from: 'lagg-till' } })}
          />
        ) : undefined
      }
      footer={
        current ? (
          <div className="flex gap-2">
            {secondary && (
              <Button variant="soft" size="lg" className="flex-1" iconLeft={secondary.icon} disabled={!valid} onClick={() => run(secondary)}>
                {secondary.label}
              </Button>
            )}
            <Button size="lg" className="flex-1" iconLeft={primary.icon} disabled={!valid} onClick={() => run(primary)}>
              {primary.label}
            </Button>
          </div>
        ) : undefined
      }
    >
      {current && (
        <div className="flex flex-col gap-4 pb-2">
          {children}
          {meta?.crowdSourced && (
            <p className="flex items-start gap-2.5 rounded-2xl bg-hjortron-soft px-4 py-3 text-sm text-ink">
              <Users className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
              <span>{meta.provenance}</span>
            </p>
          )}
          {missingNutrition && (
            <div role="alert" className="flex items-start gap-2.5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-hjortron" aria-hidden />
              <div className="flex flex-col items-start gap-2">
                <span>
                  Näringsvärden saknas för den här produkten.
                  {missingNutritionAction ? ' Komplettera dem från förpackningen så räknas den rätt.' : ' Du kan komplettera dem via detaljsidan.'}
                </span>
                {missingNutritionAction}
              </div>
            </div>
          )}
          <PortionPicker
            key={`${current.id}|${initialUnit ?? ''}|${initialAmount ?? ''}`}
            food={current}
            initialAmount={initialAmount}
            initialUnit={initialUnit}
            hideActions
            onChange={(s) => {
              sel.current = s
              setValid(Number.isFinite(s.grams) && s.grams > 0)
            }}
            onConfirm={(amount, unit, grams) => primary.onClick(amount, unit, grams)}
          />
        </div>
      )}
    </Sheet>
  )
}
