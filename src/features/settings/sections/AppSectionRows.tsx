/**
 * Raderna för apparnas egna inställningar – Påminnelser och Apple Hälsa/Health Connect – i
 * inställningslistan. Laddas bara i butiksbyggen och visas bara i de inbyggda apparna (se
 * `APP_SECTIONS_BUILD` i SettingsPage.tsx), så att sektionerna inte följer med i webbygget.
 */
import type { ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useProfileStore } from '../../../stores/profileStore'
import { useReminderStore } from '../../../stores/reminderStore'
import { useHealthRowSubtitle } from './HealthSection'
import { remindersSummary } from './RemindersSection'

export interface AppSectionRowsProps {
  /** Ritar en rad i listan (samma som övriga rader i SettingsPage). */
  row: (id: 'paminnelser' | 'halsa', subtitle: string) => ReactNode
}

export default function AppSectionRows({ row }: AppSectionRowsProps) {
  const meals = useProfileStore((s) => s.settings.meals)
  const reminders = useReminderStore(useShallow((s) => ({ meals: s.meals, water: s.water, fasting: s.fasting, backup: s.backup, focus: s.focus })))
  const healthSub = useHealthRowSubtitle()
  return (
    <>
      {row('paminnelser', remindersSummary(reminders, meals))}
      {row('halsa', healthSub)}
    </>
  )
}
