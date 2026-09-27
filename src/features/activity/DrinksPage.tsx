/**
 * Dryck – /dryck. Dagens vatten, koffein (med tidslinje och sömntips) och alkohol i standardglas.
 *
 * Kaffe, te och alkohol loggas som vanliga dagboksposter (snabbval ur Lagoms databas) så att
 * energi och näring hamnar rätt i dagboken. Vattnet räknas separat i vattenloggen.
 */
import { PageHeader } from '../../components/ui'
import { useTargets } from '../../hooks/useTargets'
import { useToday } from '../../hooks/useToday'
import { formatDayLong } from '../../lib/dates'
import { youngestAge } from '../../lib/energy'
import { useDiaryStore } from '../../stores/diaryStore'
import { useProfileStore } from '../../stores/profileStore'
import type { DiaryEntry } from '../../types'
import { AlcoholCard } from './drinks/AlcoholCard'
import { CaffeineCard } from './drinks/CaffeineCard'
import { WaterCard } from './drinks/WaterCard'

const EMPTY_ENTRIES: readonly DiaryEntry[] = []

export default function DrinksPage() {
  const today = useToday()
  const { targets } = useTargets(today)
  const entries = useDiaryStore((s) => s.entries[today] ?? EMPTY_ENTRIES)
  const mindful = useProfileStore((s) => s.settings.mindfulMode)
  const lifeStage = useProfileStore((s) => s.profile?.lifeStage)
  const birthYear = useProfileStore((s) => s.profile?.birthYear)
  // Försiktig ålder: den som kan vara under 18 år räknas som det (samma regel som dagsmålen).
  const minor = birthYear !== undefined && youngestAge(birthYear, today) < 18
  // Dagsmålet räknar redan in EFSA:s gränser: 400 mg för vuxna, 200 mg vid graviditet och amning
  // och högst ca 3 mg per kg kroppsvikt under 18 år – samma tal som koffeinkortet på Idag.
  const caffeineMax = targets.caffeineMaxMg

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
