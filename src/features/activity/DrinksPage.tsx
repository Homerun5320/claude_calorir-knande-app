/**
 * Dryck – /dryck. Dagens vatten, koffein (med tidslinje och sömntips) och alkohol i standardglas.
 *
 * Kaffe, te och alkohol loggas som vanliga dagboksposter (snabbval ur Lagoms databas) så att
 * energi och näring hamnar rätt i dagboken. Vattnet räknas separat i vattenloggen.
 */
import { PageHeader } from '../../components/ui'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { ageFromBirthYear, formatDayLong } from '../../lib/dates'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { DiaryEntry } from '../../types'
import { AlcoholCard } from './drinks/AlcoholCard'
import { CaffeineCard } from './drinks/CaffeineCard'
import { WaterCard } from './drinks/WaterCard'
import { caffeineLimitMg } from './drinksLogic'

const EMPTY_ENTRIES: readonly DiaryEntry[] = []

export default function DrinksPage() {
  const today = useToday()
  const { targets, weightKg } = useTargets(today)
  const entries = useDiaryStore((s) => s.entries[today] ?? EMPTY_ENTRIES)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  const age = birthYear !== undefined ? ageFromBirthYear(birthYear, today) : undefined
  const minor = age !== undefined && age < 18
  // Under 18 år: högst ca 3 mg koffein per kg kroppsvikt (EFSA), inte vuxnas 400 mg.
  const caffeineMax = caffeineLimitMg(targets.caffeineMaxMg, age, weightKg ?? undefined)

  return (
    <div className="px-4 pb-8">
      <PageHeader eyebrow={formatDayLong(today, today)} title="Dryck" subtitle="Vatten, kaffe och alkohol – i lugn och ro, utan pekpinnar." />

      <div className="flex flex-col gap-4">
        <WaterCard date={today} targetMl={targets.waterMl} />
        <CaffeineCard date={today} entries={entries} maxMg={caffeineMax} mindful={mindful} isToday minor={minor} />
        <AlcoholCard today={today} mindful={mindful} pregnantOrNursing={lifeStage === 'gravid' || lifeStage === 'ammar'} minor={minor} />
      </div>
    </div>
  )
}
