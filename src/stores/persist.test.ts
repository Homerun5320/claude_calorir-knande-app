/**
 * Alla persisterade butiker: rätt version, en migrering som aldrig kastar och skydd mot att data
 * från en nyare version av Lagom skrivs över (riktig IndexedDB via fake-indexeddb).
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { waitFor } from '@testing-library/react'
import { get, set } from 'idb-keyval'
import { useBodyStore } from './bodyStore'
import { useDiaryStore } from './diaryStore'
import { useFastingStore } from './fastingStore'
import { useFoodStore } from './foodStore'
import { useLicenseStore } from './licenseStore'
import { useProfileStore } from './profileStore'
import { usePlanStore } from './planStore'
import { useReminderStore } from './reminderStore'
import { hasNewerData, isMemoryOnlyStorage, PERSIST_VERSIONS, resetStorageStateForTests, STORE_KEYS } from './storage'
import { wipeAllData } from '../lib/backup'

const BY_KEY = {
  [STORE_KEYS.profile]: useProfileStore,
  [STORE_KEYS.diary]: useDiaryStore,
  [STORE_KEYS.food]: useFoodStore,
  [STORE_KEYS.body]: useBodyStore,
  [STORE_KEYS.fasting]: useFastingStore,
  [STORE_KEYS.license]: useLicenseStore,
  [STORE_KEYS.plan]: usePlanStore,
  [STORE_KEYS.reminders]: useReminderStore,
} as const

const ALL = Object.entries(BY_KEY)

beforeAll(async () => {
  await waitFor(() => expect(ALL.every(([, s]) => s.persist.hasHydrated())).toBe(true))
})

afterEach(() => resetStorageStateForTests())

describe('persisterade butiker', () => {
  it('täcker alla nycklar i STORE_KEYS', () => {
    expect(Object.keys(BY_KEY).sort()).toEqual(Object.values(STORE_KEYS).sort())
  })

  it.each(ALL)('%s har version från PERSIST_VERSIONS och en migrering', (name, store) => {
    const options = store.persist.getOptions()
    expect(options.name).toBe(name)
    expect(options.version).toBe(PERSIST_VERSIONS[name])
    expect(options.migrate).toBeTypeOf('function')
    // Version 0 och 1 migreras som de är – och migreringen kastar aldrig.
    const persisted = { exempel: 1 }
    expect(options.migrate!(persisted, 0)).toBe(persisted)
    expect(options.migrate!(persisted, 1)).toBe(persisted)
    expect(() => options.migrate!(undefined, 0)).not.toThrow()
  })

  it('läser in sparad data med en äldre version (0)', async () => {
    await set(STORE_KEYS.body, JSON.stringify({ state: { weights: [{ id: 'w1', date: '2026-09-01', kg: 80 }], measurements: [] }, version: 0 }))
    await useBodyStore.persist.rehydrate()
    expect(useBodyStore.getState().weights).toEqual([{ id: 'w1', date: '2026-09-01', kg: 80 }])
    expect(hasNewerData()).toBe(false)
  })

  it('data från en nyare version läses inte in och skrivs aldrig över', async () => {
    const newer = JSON.stringify({ state: { active: null, history: [{ id: 'f1', framtida: true }] }, version: PERSIST_VERSIONS[STORE_KEYS.fasting] + 1 })
    await set(STORE_KEYS.fasting, newer)
    await useFastingStore.persist.rehydrate()
    expect(hasNewerData()).toBe(true)
    expect(isMemoryOnlyStorage()).toBe(true)
    // Butiken används ändå (i minnet) …
    useFastingStore.getState().startFast(16, '16:8', Date.now())
    expect(useFastingStore.getState().active).not.toBeNull()
    await new Promise((r) => setTimeout(r, 20))
    // … men den sparade datan är orörd.
    expect(await get(STORE_KEYS.fasting)).toBe(newer)
  })
})

describe('radering med data från en nyare version', () => {
  it('"Radera all data" raderar även den nyare dagboken, men licensen med provstarten skyddas', async () => {
    const newerDiary = JSON.stringify({ state: { entries: { '2026-09-01': [] }, water: {}, exercise: {}, days: {} }, version: 9 })
    const newerLicense = JSON.stringify({ state: { trialStartedAt: 123, licenseKey: null, activatedAt: null }, version: 9 })
    await set(STORE_KEYS.diary, newerDiary)
    await set(STORE_KEYS.license, newerLicense)
    await useDiaryStore.persist.rehydrate()
    await useLicenseStore.persist.rehydrate()
    expect(hasNewerData()).toBe(true)

    wipeAllData({ removeLicense: true })
    await waitFor(async () => expect(await get(STORE_KEYS.diary)).not.toBe(newerDiary))
    expect(JSON.parse((await get<string>(STORE_KEYS.diary))!)).toMatchObject({ state: { entries: {} }, version: 1 })
    // Licensbutiken skrivs aldrig över härifrån – då skulle provperioden kunna börja om.
    expect(await get(STORE_KEYS.license)).toBe(newerLicense)
    expect(hasNewerData()).toBe(true)
  })

  it('dagboken i månadsformat från en nyare version (index 3) skrivs aldrig över, men "Radera all data" tar bort den', async () => {
    const newerIndex = JSON.stringify({ state: { format: 'manader', stateVersion: 1 }, version: 3 })
    const month = JSON.stringify({ entries: {}, water: { '2026-09-01': 500 }, exercise: {}, days: {} })
    await set(STORE_KEYS.diary, newerIndex)
    await set(`${STORE_KEYS.diary}:2026-09`, month)
    await useDiaryStore.persist.rehydrate()
    expect(hasNewerData()).toBe(true)
    expect(useDiaryStore.getState().water).not.toHaveProperty('2026-09-01')
    useDiaryStore.getState().addWater('2026-09-02', 250)
    await new Promise((r) => setTimeout(r, 20))
    expect(await get(STORE_KEYS.diary)).toBe(newerIndex)
    expect(await get(`${STORE_KEYS.diary}:2026-09`)).toBe(month)

    wipeAllData()
    await waitFor(async () => expect(await get(STORE_KEYS.diary)).not.toBe(newerIndex))
    expect(JSON.parse((await get<string>(STORE_KEYS.diary))!)).toEqual({ state: { entries: {}, water: {}, exercise: {}, days: {} }, version: 1 })
    expect(await get(`${STORE_KEYS.diary}:2026-09`)).toBeUndefined()
  })
})
