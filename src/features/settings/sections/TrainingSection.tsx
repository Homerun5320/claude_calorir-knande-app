/**
 * Inställningar → Träning och vatten: hur stor del av träningskalorierna som läggs till
 * dagens budget, och glasstorlek för vattenregistrering.
 */
import { useId } from 'react'
import { Dumbbell, GlassWater } from 'lucide-react'
import { Card, SegmentedControl, Slider } from '../../../components/ui'
import { useEnergyFormatter } from '../../../components/domain/EnergyValue'
import { formatLiters } from '../../../components/domain/WaterGlasses'
import { useTargets } from '../../../hooks/useTargets'
import { formatNumber } from '../../../lib/format'
import { useProfileStore } from '../../../stores/profileStore'
import { GLASS_SIZES, glassLabel } from '../settingsLogic'

const EXAMPLE_KCAL = 300

export function TrainingSection() {
  const pct = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const glass = useProfileStore((s) => s.settings.waterGlassMl)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const { targets } = useTargets()
  const fmt = useEnergyFormatter()
  const glassId = useId()
  const extra = Math.round((EXAMPLE_KCAL * pct) / 100)

  return (
    <div className="flex flex-col gap-5">
      <Card eyebrow="Träning" title="Träningskalorier">
        <p className="-mt-1 mb-4 text-[0.9375rem] leading-relaxed text-ink-2">
          Lagom räknar <strong className="font-semibold text-ink">nettokalorier</strong>: bara energin utöver det kroppen ändå hade gjort av med i vila.
          Både klockor och formler brukar ändå överskatta – därför lägger Lagom som standard bara tillbaka hälften.
        </p>
        <Slider
          label="Andel som läggs till dagens budget"
          value={pct}
          onChange={(exerciseAddBackPct) => updateSettings({ exerciseAddBackPct })}
          min={0}
          max={100}
          step={5}
          showValue
          tone="lingon"
          formatValue={(v) => `${formatNumber(v)} %`}
          marks={[
            { value: 0, label: 'Inget' },
            { value: 50, label: 'Lagom' },
            { value: 100, label: 'Allt' },
          ]}
        />
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-lingon-soft p-3.5">
          <Dumbbell aria-hidden className="mt-0.5 size-5 shrink-0 text-lingon" />
          <p className="text-[0.875rem] leading-relaxed text-ink">
            {pct === 0
              ? 'Träningen påverkar inte dagens budget – bra om du vill att maten ska vara densamma varje dag.'
              : `Loggar du ett pass på ${fmt(EXAMPLE_KCAL)} får du ${fmt(extra)} extra att äta den dagen.`}
          </p>
        </div>
      </Card>

      <Card eyebrow="Vatten" title="Glasstorlek">
        <div id={glassId} className="sr-only">
          Glasstorlek
        </div>
        <SegmentedControl<number>
          aria-labelledby={glassId}
          fullWidth
          value={glass}
          onChange={(waterGlassMl) => updateSettings({ waterGlassMl })}
          options={GLASS_SIZES.map((ml) => ({ value: ml, label: glassLabel(ml) }))}
        />
        <p className="mt-3 flex items-start gap-2 text-[0.8125rem] leading-snug text-ink-3">
          <GlassWater aria-hidden className="mt-0.5 size-4 shrink-0 text-fjall" />
          Ett tryck på vattenglaset lägger till {glassLabel(glass)}. Ditt dryckesmål är {formatLiters(targets.waterMl)} per dag – ändra det under Mål och makron.
        </p>
      </Card>
    </div>
  )
}
