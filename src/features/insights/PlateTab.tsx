/**
 * Tallriken – den genomsnittliga tallriken för periodens huvudmåltider jämfört med
 * Tallriksmodellen, och hur energin fördelas mellan dagens måltider.
 */
import { useMemo } from 'react'
import { MealIcon, MEAL_META, TINT_VAR } from '../../components/domain'
import { Card } from '../../components/ui'
import { PlateModel } from '../../components/signature'
import { formatEnergy } from '../../lib/format'
import { percentText } from './fmt'
import { mealName } from '../../lib/meals'
import { PLATE_GOOD_SCORE, PLATE_VARIANT_LABELS } from '../../lib/plate'
import { mainMealPlate, mealDistribution, plateMealsText } from './aggregate'
import { Callout, InfoNote, NameValueRow, ShareBar, SourceNote } from './ui'
import type { InsightsData } from './useInsights'

export function PlateTab({ data }: { data: InsightsData }) {
  const { entriesByDate, period, plateVariant, entries, summary, meals, mindful, unit } = data
  const plate = useMemo(() => mainMealPlate(entriesByDate, period.elapsed, plateVariant), [entriesByDate, period.elapsed, plateVariant])
  const dist = useMemo(() => mealDistribution(entries, summary.loggedDays), [entries, summary.loggedDays])
  const largest = dist.length ? dist.reduce((a, b) => (b.share > a.share ? b : a)) : undefined
  const variant = PLATE_VARIANT_LABELS[plateVariant]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Din genomsnittliga tallrik" eyebrow="Lunch och middag">
        {plate.meals === 0 ? (
          <div className="flex flex-col items-center">
            <PlateModel fractions={{ veg: 0, carb: 0, protein: 0 }} ideal={plate.plate.ideal} size={240} empty />
            <p className="mt-3 text-sm leading-relaxed text-ink-2">
              När du loggar luncher och middagar med livsmedel eller recept visar vi hur tallriken brukar se ut. Snabbposter
              (bara kalorier) har ingen vikt och räknas inte.
            </p>
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <PlateModel fractions={plate.plate.fractions} ideal={plate.plate.ideal} size={260} />
            </div>
            <Callout emoji={plate.plate.score >= PLATE_GOOD_SCORE ? '🌟' : '🥗'} className="mt-4">
              {plate.plate.advice}
            </Callout>
            <p className="mt-3 text-sm text-ink-2">
              {plateMealsText(plate.meals, plate.lagomMeals)}
            </p>
          </>
        )}
        <InfoNote className="mt-3">
          {variant.label}: {variant.description.charAt(0).toLowerCase() + variant.description.slice(1)}
        </InfoNote>
      </Card>

      <Card title="Måltiderna" eyebrow="Andel av dagens energi">
        {dist.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-2">Här syns hur energin fördelar sig över dagen när du har loggat några måltider.</p>
        ) : (
          <>
            <ul className="space-y-3.5" aria-label="Energi per måltid">
              {dist.map((m) => (
                <li key={m.meal} className="flex items-center gap-3">
                  <MealIcon meal={m.meal} size="sm" />
                  <div className="min-w-0 flex-1">
                    <NameValueRow
                      name={mealName(meals, m.meal)}
                      value={`${mindful ? '' : `${formatEnergy(m.perDay, unit)}/dag · `}${percentText(m.share * 100)}`}
                    />
                    <ShareBar value={m.share} color={TINT_VAR[MEAL_META[m.meal].tint]} className="mt-1" />
                  </div>
                </li>
              ))}
            </ul>
            {largest && (
              <Callout emoji={MEAL_META[largest.meal].emoji} className="mt-4">
                Största måltiden är {mealName(meals, largest.meal).toLowerCase()} med {percentText(largest.share * 100)} av energin.
                Det finns ingen rätt fördelning – det viktiga är att måltiderna passar din dag.
              </Callout>
            )}
          </>
        )}
      </Card>

      <SourceNote>
        Tallriksmodellen kommer från Livsmedelsverket. Fördelningen räknas på vikt och bygger på livsmedlens kategori – recept och
        sammansatta rätter delas upp efter ingredienserna.
      </SourceNote>
    </div>
  )
}
