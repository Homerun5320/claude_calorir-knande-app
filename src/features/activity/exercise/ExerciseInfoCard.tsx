/**
 * "Så räknar Lagom träning" – förklarar nettoprincipen och varför bara en del av träningen
 * läggs till budgeten. Andelen går att ändra direkt här (inställningen `exerciseAddBackPct`).
 */
import { memo } from 'react'
import { BookOpen, Gauge, Scale } from 'lucide-react'
import { Card, Slider } from '../../../components/ui'
import { useEnergyUnit } from '../../../components/domain'
import { formatEnergy, formatPercent } from '../../../lib/format'
import { useProfileStore } from '../../../stores/profileStore'
import { addBackKcal } from '../activityLogic'

const MARKS = [
  { value: 0, label: '0 %' },
  { value: 50, label: 'Lagom' },
  { value: 100, label: '100 %' },
]

export const ExerciseInfoCard = memo(function ExerciseInfoCard({ dayKcal, mindful }: { dayKcal: number; mindful: boolean }) {
  const pct = useProfileStore((s) => s.settings.exerciseAddBackPct)
  const updateSettings = useProfileStore((s) => s.updateSettings)
  const unit = useEnergyUnit()

  const example = mindful
    ? 'Lägre andel ger en försiktigare budget. 50 % är ett bra förval för de flesta.'
    : dayKcal > 0
      ? `Idag: ${formatEnergy(dayKcal, unit)} träning ger ${formatEnergy(addBackKcal(dayKcal, pct), unit)} extra i dagens budget.`
      : `Exempel: ett pass på ${formatEnergy(300, unit)} ger ${formatEnergy(addBackKcal(300, pct), unit)} extra i dagens budget.`

  const points = [
    {
      icon: Scale,
      title: 'Bara det som kommer utöver vila.',
      text: 'Ditt dagsmål räknar redan med energin kroppen gör av med i vila – även medan du tränar. Lagom räknar därför nettoförbrukningen, så att vilan inte räknas två gånger.',
    },
    {
      icon: Gauge,
      title: 'Försiktigt med budgeten.',
      text: 'Träningskalorier överskattas ofta – av appar, maskiner och klockor. Därför läggs bara en del av dem till dagens budget.',
    },
    {
      icon: BookOpen,
      title: 'Öppna källor.',
      text: 'MET-värden från 2024 Adult Compendium of Physical Activities, räknat på din senaste vikt. Gång, löpning och cykling räknas om efter din fart när du anger sträcka.',
    },
  ]

  return (
    <Card eyebrow="Ärligt och försiktigt" title="Så räknar Lagom träning">
      <ul className="flex flex-col gap-3.5">
        {points.map((p) => (
          <li key={p.title} className="flex gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-mossa-soft text-mossa">
              <p.icon className="size-[1.125rem]" strokeWidth={2.2} />
            </span>
            <p className="text-[0.875rem] leading-relaxed text-ink-2">
              <strong className="font-semibold text-ink">{p.title}</strong> {p.text}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-2xl bg-surface-2 px-4 pb-3 pt-4">
        <Slider
          label="Andel av träningen till budgeten"
          value={pct}
          onChange={(v) => updateSettings({ exerciseAddBackPct: v })}
          min={0}
          max={100}
          step={5}
          showValue
          formatValue={(v) => formatPercent(v)}
          marks={MARKS}
          tone="mossa"
          hint={example}
        />
      </div>
    </Card>
  )
})
