/**
 * Påminnelserna i säkerhetskopian: följer med i kopian, återställs vid "Ersätt allt", behålls vid
 * sammanfogning och stängs av vid "Radera all data". Skadade val blir avstängda.
 */
import { waitFor } from '@testing-library/react'
import { createBackup, parseBackup, restoreBackup, wipeAllData } from './backup'
import { defaultReminderSettings, useReminderStore } from '../stores/reminderStore'

beforeAll(async () => {
  await waitFor(() => expect(useReminderStore.persist.hasHydrated()).toBe(true))
})

afterEach(() => useReminderStore.getState().clearReminders())

describe('påminnelser i säkerhetskopian', () => {
  it('följer med och återställs vid Ersätt allt', () => {
    useReminderStore.getState().setMeal('lunch', { enabled: true, time: '12:30' })
    useReminderStore.getState().setFlag('backup', true)
    const file = parseBackup(JSON.stringify(createBackup()))
    expect(file.data.reminders?.meals.lunch).toEqual({ enabled: true, time: '12:30' })
    useReminderStore.getState().clearReminders()
    restoreBackup(file, 'replace')
    expect(useReminderStore.getState().meals.lunch).toEqual({ enabled: true, time: '12:30' })
    expect(useReminderStore.getState().backup).toBe(true)
  })

  it('sammanfogning behåller enhetens egna val', () => {
    const file = parseBackup(JSON.stringify(createBackup()))
    useReminderStore.getState().setFlag('focus', true)
    restoreBackup({ ...file, data: { ...file.data, reminders: { ...defaultReminderSettings(), backup: true } } }, 'merge')
    expect(useReminderStore.getState().focus).toBe(true)
    expect(useReminderStore.getState().backup).toBe(false)
  })

  it('äldre kopior utan påminnelser och skadade val', () => {
    const raw = JSON.parse(JSON.stringify(createBackup())) as { data: Record<string, unknown> }
    delete raw.data.reminders
    expect(parseBackup(JSON.stringify(raw)).data.reminders).toBeUndefined()
    raw.data.reminders = { fasting: 'ja', water: { enabled: true, from: 3 } }
    expect(parseBackup(JSON.stringify(raw)).data.reminders).toEqual({ ...defaultReminderSettings(), water: { enabled: true, from: 9, to: 20, every: 2 } })
  })

  it('Radera all data stänger av alla påminnelser', () => {
    useReminderStore.getState().setFlag('fasting', true)
    wipeAllData()
    expect(useReminderStore.getState().fasting).toBe(false)
  })
})
