/**
 * Vatten: glas att trycka på, snabbval (glas, flaska, egen mängd) med "Ångra", och en lugn
 * påminnelse om att även mat och andra drycker ger vätska.
 */
import { memo, useId, useState, type FormEvent } from 'react'
import { Droplet, Plus } from 'lucide-react'
import { Button, Card, NumberField, toast } from '../../../components/ui'
import { WaterGlasses } from '../../../components/domain'
import { formatNumber } from '../../../lib/format'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useProfileStore } from '../../../stores/profileStore'
import type { ISODate } from '../../../types'
import { waterPresets } from '../drinksLogic'

export const WaterCard = memo(function WaterCard({ date, targetMl }: { date: ISODate; targetMl: number }) {
  const waterMl = useDiaryStore((s) => s.water[date] ?? 0)
  const glassMl = useProfileStore((s) => s.settings.waterGlassMl)
  const [customOpen, setCustomOpen] = useState(false)
  const [customMl, setCustomMl] = useState<number | undefined>(330)
  const formId = useId()
  const presets = waterPresets(glassMl)

  const addWater = (ml: number) => useDiaryStore.getState().addWater(date, ml)

  const addWithUndo = (ml: number) => {
    addWater(ml)
    toast(`${formatNumber(ml)} ml vatten tillagt`, {
      tone: 'success',
      action: { label: 'Ångra', onClick: () => addWater(-ml) },
    })
  }

  const submitCustom = (e: FormEvent) => {
    e.preventDefault()
    if (!customMl || customMl <= 0) return
    addWithUndo(Math.round(customMl))
    setCustomOpen(false)
  }

  return (
    <Card tone="fjall" eyebrow="Vätska" title="Vatten">
      <WaterGlasses ml={waterMl} targetMl={targetMl} glassMl={glassMl} onAdd={addWater} onRemove={(ml) => addWater(-ml)} />

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button key={p.id} size="sm" variant="secondary" iconLeft={Plus} onClick={() => addWithUndo(p.ml)}>
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={customOpen ? 'soft' : 'ghost'}
          iconLeft={Droplet}
          onClick={() => setCustomOpen((o) => !o)}
          aria-expanded={customOpen}
          aria-controls={formId}
        >
          Egen mängd
        </Button>
      </div>

      {customOpen && (
        <form id={formId} onSubmit={submitCustom} className="mt-3 flex items-end gap-2">
          <NumberField
            className="flex-1"
            label="Mängd vatten"
            value={customMl}
            onChange={setCustomMl}
            suffix="ml"
            step={50}
            min={10}
            max={3000}
            decimals={0}
            autoFocus
          />
          <Button type="submit" disabled={!customMl || customMl <= 0}>
            Lägg till
          </Button>
        </form>
      )}

      <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-2">
        Här räknas vattnet du loggar. Kaffe, te, mjölk och maten ger också vätska, så målet är en riktlinje – inte ett krav. Drick
        efter törst, och lite extra när det är varmt eller när du tränar.
      </p>
    </Card>
  )
})
