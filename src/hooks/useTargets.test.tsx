/**
 * useTargets: adaptiv förbrukning ignoreras vid graviditet, amning och under 18 år, viktmålet
 * bedöms mot trendvikten (BMI-gränsen även mot senaste vägningen), träningen läggs inte till två
 * gånger med adaptiva mål och trasiga eller framtida värden styr aldrig dagens mål.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { addDays, todayISO } from '../lib/dates'
import { useBodyStore } from '../stores/bodyStore'
import { useDiaryStore } from '../stores/diaryStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import type { Profile } from '../types'
import { useTargets } from './useTargets'

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

/** Fyra veckor med 2 000 kcal per dag och stabil vikt ⇒ adaptiv förbrukning ≈ 2 000 kcal. */
function seedAdaptive(today: string) {
  const { addEntry } = useDiaryStore.getState()
  for (let i = 1; i <= 27; i++) {
    const date = addDays(today, -i)
    addEntry({ kind: 'quick', name: 'Dag', nutrients: { kcal: 2000 }, date, meal: 'middag' })
    if (i % 3 === 0) useBodyStore.getState().logWeight(date, 70)
  }
}

beforeAll(async () => {
  await waitFor(() => expect([useProfileStore, useDiaryStore, useBodyStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true, adaptiveTargets: true } })
})

describe('useTargets', () => {
  it('använder adaptiv förbrukning för vuxna och lägger då inte till träningen', () => {
    const today = todayISO()
    seedAdaptive(today)
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.adaptive).not.toBeNull()
    expect(result.current.energy?.tdeeSource).toBe('adaptiv')
    expect(result.current.exerciseAddBack).toEqual({ pct: 0, includedInTarget: true })
  })

  it('ett eget energimål går före – då följer träningen inställningen', () => {
    const today = todayISO()
    seedAdaptive(today)
    useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal: 2100 } } }))
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.exerciseAddBack).toEqual({ pct: DEFAULT_SETTINGS.exerciseAddBackPct, includedInTarget: false })
  })

  it('ignorerar adaptiv förbrukning vid graviditet, amning och under 18 år', () => {
    const today = todayISO()
    seedAdaptive(today)
    for (const patch of [{ lifeStage: 'gravid' as const }, { lifeStage: 'ammar' as const }, { birthYear: Number(today.slice(0, 4)) - 17 }]) {
      useProfileStore.setState({ profile: { ...PROFILE, ...patch } })
      const { result, unmount } = renderHook(() => useTargets(today))
      expect(result.current.adaptive).toBeNull()
      expect(result.current.adaptiveBlocked).toMatch(/används formeln/)
      expect(result.current.energy?.tdeeSource).toBe('formel')
      expect(result.current.exerciseAddBack.includedInTarget).toBe(false)
      unmount()
    }
  })

  it('bedömer målvikten mot trendvikten, inte mot en enskild vägning', () => {
    const today = todayISO()
    // Stabilt kring 66 kg i tre veckor, sedan en låg vägning idag.
    for (let i = 21; i >= 1; i--) useBodyStore.getState().logWeight(addDays(today, -i), 66)
    useBodyStore.getState().logWeight(today, 64.9)
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner', targetWeightKg: 65 } })
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.trendKg).toBeGreaterThan(65.5)
    expect(result.current.energy?.goalPause).toBeNull()
    expect(result.current.energy?.adjustment).toBeLessThan(0)
  })

  it('ett ogiltigt eget energimål (t.ex. NaN eller null från en säkerhetskopia) räknar inte träningen två gånger', () => {
    const today = todayISO()
    seedAdaptive(today)
    for (const kcal of [Number.NaN, null as unknown as number]) {
      useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal } } }))
      const { result, unmount } = renderHook(() => useTargets(today))
      expect(result.current.energy?.tdeeSource).toBe('adaptiv')
      expect(result.current.targets.kcal).toBe(result.current.energy?.kcal)
      expect(result.current.exerciseAddBack).toEqual({ pct: 0, includedInTarget: true })
      unmount()
    }
  })

  it('ett eget energimål som höjts till golvet (från den adaptiva förbrukningen) räknar inte träningen två gånger', () => {
    const today = todayISO()
    seedAdaptive(today)
    useProfileStore.setState((s) => ({ settings: { ...s.settings, targetOverrides: { kcal: 1000 } } }))
    const { result } = renderHook(() => useTargets(today))
    const energy = result.current.energy
    expect(energy?.tdeeSource).toBe('adaptiv')
    // Underhåll ≈ 2 000 kcal, högst 1 % av 70 kg i veckan (770 kcal/dag) → golvet ≈ 1 230 kcal.
    expect(result.current.targets.kcal).toBe(energy?.overrideFloor.kcal)
    expect(result.current.targets.kcal).toBeGreaterThan(1200)
    expect(result.current.exerciseAddBack.includedInTarget).toBe(true)
  })

  it('senaste vägningen under BMI 18,5 pausar underskottet även när trendvikten släpar efter', () => {
    const today = todayISO()
    // 168 cm: BMI 18,5 ≈ 52,2 kg. Tre veckor på 54 kg och idag 51,5 kg.
    for (let i = 21; i >= 1; i--) useBodyStore.getState().logWeight(addDays(today, -i), 54)
    useBodyStore.getState().logWeight(today, 51.5)
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner' } })
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.trendKg).toBeGreaterThan(52.2)
    expect(result.current.energy?.goalPause).toBe('lowBmi')
    expect(result.current.energy?.adjustment).toBe(0)
    expect(result.current.targets.kcal).toBe(result.current.energy?.maintenanceKcal)
  })

  it('en vägning med ett senare datum eller en osorterad lista styr aldrig dagens mål', () => {
    const today = todayISO()
    useProfileStore.setState({ profile: { ...PROFILE, goal: 'ga_ner' } })
    useBodyStore.setState({
      weights: [
        { id: 'b', date: addDays(today, 5), kg: 45, createdAt: 0 },
        { id: 'a', date: today, kg: 70, createdAt: 0 },
        { id: 'c', date: addDays(today, -3), kg: 71, createdAt: 0 },
      ],
    })
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.weightKg).toBe(70)
    expect(result.current.trendKg).toBeGreaterThan(69)
    expect(result.current.energy?.goalPause).toBeNull()
    expect(result.current.energy?.adjustment).toBeLessThan(0)
  })

  it('utan profil: aldrig under 1 500 kcal och aldrig över 400 mg koffein', () => {
    useProfileStore.setState((s) => ({ profile: null, settings: { ...s.settings, targetOverrides: { kcal: 500, caffeineMaxMg: 2000, proteinG: Number.NaN } } }))
    const { result } = renderHook(() => useTargets(todayISO()))
    expect(result.current.targets.kcal).toBe(1500)
    expect(result.current.targets.caffeineMaxMg).toBe(400)
    expect(result.current.targets.proteinG).toBe(90)
  })

  it('vid lågt BMI används inte en lägre uppmätt förbrukning – och alla vyer får samma besked', () => {
    const today = todayISO()
    // 27 dagar à 1 200 kcal med stabil vikt 50 kg (BMI 17,7 vid 168 cm) ⇒ uppmätt förbrukning ≈ 1 200 kcal.
    const { addEntry } = useDiaryStore.getState()
    for (let i = 1; i <= 27; i++) {
      const date = addDays(today, -i)
      addEntry({ kind: 'quick', name: 'Dag', nutrients: { kcal: 1200 }, date, meal: 'middag' })
      if (i % 3 === 0) useBodyStore.getState().logWeight(date, 50)
    }
    const { result } = renderHook(() => useTargets(today))
    expect(result.current.adaptive?.tdee).toBeLessThan(1300)
    expect(result.current.energy?.tdeeSource).toBe('formel')
    expect(result.current.adaptiveBlocked).toMatch(/under det som räknas som hälsosamt/)
    expect(result.current.targets.kcal).toBeGreaterThan(1500)
    expect(result.current.exerciseAddBack.includedInTarget).toBe(false)
  })
})
