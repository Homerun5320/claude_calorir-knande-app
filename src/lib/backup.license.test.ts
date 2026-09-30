/**
 * Licens och provperiod i säkerhetskopian: följer med, förlänger aldrig en provperiod, skriver
 * aldrig över en giltig licens – och radering startar inte om provperioden.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { createBackup, licenseRank, mergeLicense, parseBackup, restoreBackup, wipeAllData } from './backup'
import { createTestLicense } from './license'
import { DEMO_PROFILE } from './demo'
import { useLicenseStore } from '../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import { useDiaryStore } from '../stores/diaryStore'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 8, 27, 12)

beforeAll(async () => {
  await waitFor(() => expect([useLicenseStore, useProfileStore, useDiaryStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useLicenseStore.getState().resetLicenseState()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS } })
})

describe('mergeLicense', () => {
  const lifetime = createTestLicense('livstid', undefined, NOW - 100 * DAY)
  const annual = createTestLicense('ar', 365, NOW - 10 * DAY)
  const expired = createTestLicense('ar', 365, NOW - 400 * DAY)

  it('den tidigaste provstarten gäller – en återställning förlänger aldrig provperioden', () => {
    expect(mergeLicense({ licenseKey: null, trialStartedAt: NOW - 2 * DAY }, { licenseKey: null, trialStartedAt: NOW - 30 * DAY }, NOW).trialStartedAt).toBe(NOW - 30 * DAY)
    expect(mergeLicense({ licenseKey: null, trialStartedAt: NOW - 30 * DAY }, { licenseKey: null, trialStartedAt: NOW - 2 * DAY }, NOW).trialStartedAt).toBe(NOW - 30 * DAY)
    expect(mergeLicense({ licenseKey: null, trialStartedAt: null }, { licenseKey: null, trialStartedAt: NOW - 5 * DAY }, NOW).trialStartedAt).toBe(NOW - 5 * DAY)
    // En provstart i framtiden kan inte ge extra dagar.
    expect(mergeLicense({ licenseKey: null, trialStartedAt: null }, { licenseKey: null, trialStartedAt: NOW + 300 * DAY }, NOW).trialStartedAt).toBe(NOW)
    // Äldre säkerhetskopia utan licensavsnitt ändrar ingenting.
    expect(mergeLicense({ licenseKey: annual, trialStartedAt: NOW - DAY }, undefined, NOW)).toEqual({ licenseKey: annual, trialStartedAt: NOW - DAY })
  })

  it('en giltig licens på enheten behålls, annars används kopians', () => {
    expect(mergeLicense({ licenseKey: annual, trialStartedAt: null }, { licenseKey: lifetime, trialStartedAt: null }, NOW).licenseKey).toBe(annual)
    expect(mergeLicense({ licenseKey: null, trialStartedAt: null }, { licenseKey: lifetime, trialStartedAt: null }, NOW).licenseKey).toBe(lifetime)
    expect(mergeLicense({ licenseKey: expired, trialStartedAt: null }, { licenseKey: annual, trialStartedAt: null }, NOW).licenseKey).toBe(annual)
    expect(mergeLicense({ licenseKey: annual, trialStartedAt: null }, { licenseKey: null, trialStartedAt: null }, NOW).licenseKey).toBe(annual)
    expect(mergeLicense({ licenseKey: expired, trialStartedAt: null }, { licenseKey: 'skräp', trialStartedAt: null }, NOW).licenseKey).toBe(expired)
  })

  it('rangordnar nycklar utan att lita på dem', () => {
    expect(licenseRank(null, NOW)).toBe(-1)
    expect(licenseRank('LAGOM1.x.y', NOW)).toBe(-1)
    expect(licenseRank(expired, NOW)).toBe(0)
    expect(licenseRank(lifetime, NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(licenseRank(annual, NOW)).toBeGreaterThan(NOW)
  })
})

describe('säkerhetskopia med licens', () => {
  it('createBackup tar med licensnyckel och provstart', () => {
    const key = createTestLicense('livstid', undefined)
    useLicenseStore.setState({ trialStartedAt: NOW - 3 * DAY, licenseKey: key })
    expect(createBackup().data.license).toEqual({ licenseKey: key, trialStartedAt: NOW - 3 * DAY })
  })

  it('återställning på en ny enhet tar med licensen och den ursprungliga provstarten', () => {
    const key = createTestLicense('livstid', undefined)
    useLicenseStore.setState({ trialStartedAt: NOW - 40 * DAY, licenseKey: key })
    const text = JSON.stringify(createBackup())

    useLicenseStore.getState().resetLicenseState()
    const parsed = parseBackup(text, NOW)
    restoreBackup(parsed, 'replace')
    expect(useLicenseStore.getState()).toMatchObject({ trialStartedAt: NOW - 40 * DAY, licenseKey: key })
    expect(useLicenseStore.getState().activatedAt).not.toBeNull()
  })

  it('en äldre kopia med senare provstart eller utan licens påverkar inte enhetens licens', () => {
    const key = createTestLicense('ar', 365)
    useLicenseStore.setState({ trialStartedAt: Date.now() - 60 * DAY, licenseKey: key })
    const backup = createBackup()
    backup.data.license = { licenseKey: null, trialStartedAt: Date.now() - DAY }
    restoreBackup(parseBackup(JSON.stringify(backup)), 'merge')
    expect(useLicenseStore.getState().licenseKey).toBe(key)
    expect(useLicenseStore.getState().trialStartedAt).toBeLessThan(Date.now() - 59 * DAY)
  })

  it('läser inte in skräp eller en provstart i framtiden', () => {
    const backup = createBackup()
    const raw = JSON.parse(JSON.stringify(backup))
    raw.data.license = { licenseKey: 'inte en nyckel', trialStartedAt: NOW + 100 * DAY }
    const parsed = parseBackup(JSON.stringify(raw), NOW)
    expect(parsed.data.license).toEqual({ licenseKey: null, trialStartedAt: NOW })
    // Äldre kopior saknar avsnittet helt.
    delete raw.data.license
    expect(parseBackup(JSON.stringify(raw), NOW).data.license).toBeUndefined()
  })
})

describe('radering', () => {
  it('startar inte om provperioden och behåller licensen som standard', () => {
    const key = createTestLicense('livstid', undefined)
    useLicenseStore.setState({ trialStartedAt: NOW - 5 * DAY, licenseKey: key })
    useDiaryStore.getState().addWater('2026-09-27', 250)
    wipeAllData()
    expect(useDiaryStore.getState().water).toEqual({})
    expect(useLicenseStore.getState()).toMatchObject({ trialStartedAt: NOW - 5 * DAY, licenseKey: key })
  })

  it('tar bort licensen bara när man uttryckligen väljer det – provstarten finns kvar', () => {
    useLicenseStore.setState({ trialStartedAt: NOW - 5 * DAY, licenseKey: createTestLicense('ar', 365) })
    wipeAllData({ removeLicense: true })
    expect(useLicenseStore.getState()).toMatchObject({ trialStartedAt: NOW - 5 * DAY, licenseKey: null })
  })
})

describe('exempeldata', () => {
  it('exempelprofilen har inget namn', () => {
    expect('name' in DEMO_PROFILE).toBe(false)
  })
})

describe('App Store-bygget: licensnycklar följer inte med', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /** Ladda om backup-modulen (och dess butiker) för en viss distribution. */
  async function load(distribution: 'appstore' | 'web') {
    vi.stubEnv('VITE_DISTRIBUTION', distribution)
    vi.resetModules()
    const platform = await import('../config/platform')
    expect(platform.DISTRIBUTION).toBe(distribution)
    const mod = await import('./backup')
    const license = await import('./license')
    const { useLicenseStore: store } = await import('../stores/licenseStore')
    await waitFor(() => expect(store.persist.hasHydrated()).toBe(true))
    store.getState().resetLicenseState()
    return { ...mod, createTestLicense: license.createTestLicense, store }
  }

  it('en importerad giltig licensnyckel aktiveras inte – den lokala behålls', async () => {
    const { createTestLicense: makeKey, mergeLicense: merge, parseBackup: parse, restoreBackup: restore, store } = await load('appstore')
    const key = makeKey('livstid', undefined)
    const file = {
      format: 'lagom-backup',
      version: 1,
      exportedAt: new Date(NOW).toISOString(),
      app: 'Lagom',
      data: {
        profile: { profile: null, settings: {} },
        diary: { entries: {}, water: {}, exercise: {}, days: {} },
        food: {},
        body: { weights: [], measurements: [] },
        license: { licenseKey: key, trialStartedAt: NOW - 20 * DAY },
      },
    }
    for (const mode of ['replace', 'merge'] as const) {
      store.getState().resetLicenseState()
      store.setState({ trialStartedAt: NOW - 3 * DAY })
      restore(parse(JSON.stringify(file), NOW), mode)
      expect(store.getState().licenseKey).toBeNull()
      expect(store.getState().activatedAt).toBeNull()
      // Provstarten slås ihop som vanligt – den tidigaste gäller.
      expect(store.getState().trialStartedAt).toBe(NOW - 20 * DAY)
    }
    // En befintlig nyckel på enheten (t.ex. från en äldre version) byts inte heller ut.
    const local = makeKey('ar', 365, NOW - 10 * DAY)
    expect(merge({ licenseKey: local, trialStartedAt: null }, { licenseKey: key, trialStartedAt: null }, NOW)).toEqual({ licenseKey: local, trialStartedAt: null })
    expect(merge({ licenseKey: null, trialStartedAt: null }, { licenseKey: key, trialStartedAt: null }, NOW).licenseKey).toBeNull()
  })

  it('provperioden förlängs aldrig', async () => {
    const { mergeLicense: merge } = await load('appstore')
    expect(merge({ licenseKey: null, trialStartedAt: NOW - 30 * DAY }, { licenseKey: null, trialStartedAt: NOW - 2 * DAY }, NOW).trialStartedAt).toBe(NOW - 30 * DAY)
    expect(merge({ licenseKey: null, trialStartedAt: NOW - 2 * DAY }, { licenseKey: null, trialStartedAt: NOW - 30 * DAY }, NOW).trialStartedAt).toBe(NOW - 30 * DAY)
    expect(merge({ licenseKey: null, trialStartedAt: null }, { licenseKey: null, trialStartedAt: NOW + 300 * DAY }, NOW).trialStartedAt).toBe(NOW)
  })

  it('createBackup utelämnar licensnyckeln men tar med provstarten', async () => {
    const { createBackup: create, createTestLicense: makeKey, store } = await load('appstore')
    store.setState({ trialStartedAt: NOW - 3 * DAY, licenseKey: makeKey('livstid', undefined) })
    expect(create().data.license).toEqual({ licenseKey: null, trialStartedAt: NOW - 3 * DAY })
  })

  it('webbygget beter sig som tidigare', async () => {
    const { createBackup: create, createTestLicense: makeKey, parseBackup: parse, restoreBackup: restore, store } = await load('web')
    const key = makeKey('livstid', undefined)
    store.setState({ trialStartedAt: NOW - 40 * DAY, licenseKey: key })
    const text = JSON.stringify(create())
    expect(JSON.parse(text).data.license.licenseKey).toBe(key)
    store.getState().resetLicenseState()
    restore(parse(text, NOW), 'replace')
    expect(store.getState()).toMatchObject({ trialStartedAt: NOW - 40 * DAY, licenseKey: key })
    expect(store.getState().activatedAt).not.toBeNull()
  })
})
