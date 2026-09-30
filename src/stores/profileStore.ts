import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MealConfig, Profile, Settings } from '../types'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

export const DEFAULT_MEALS: MealConfig[] = [
  { id: 'frukost', name: 'Frukost', enabled: true },
  { id: 'lunch', name: 'Lunch', enabled: true },
  { id: 'fika', name: 'Fika', enabled: true },
  { id: 'middag', name: 'Middag', enabled: true },
  { id: 'kvallsmat', name: 'Kvällsmat', enabled: false },
  { id: 'mellanmal', name: 'Mellanmål', enabled: true },
]

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  meals: DEFAULT_MEALS,
  exerciseAddBackPct: 50,
  mindfulMode: false,
  energyUnit: 'kcal',
  adaptiveTargets: false,
  waterGlassMl: 250,
  showClimate: true,
  showMicros: true,
  seasonalTheme: true,
  dashboardNutrients: ['protein', 'carbs', 'fat', 'fiber'],
  targetOverrides: {},
  onboardingDone: false,
}

interface ProfileState {
  profile: Profile | null
  settings: Settings
  setProfile: (p: Profile) => void
  updateProfile: (patch: Partial<Profile>) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetProfile: () => void
}

/** Spegla temat till localStorage så att index.html kan sätta rätt tema före första renderingen. */
function mirrorTheme(theme: Settings['theme']) {
  try {
    localStorage.setItem('lagom-theme', theme)
  } catch {
    /* privat läge etc. */
  }
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      settings: DEFAULT_SETTINGS,
      setProfile: (p) => set({ profile: p }),
      updateProfile: (patch) => {
        const cur = get().profile
        if (!cur) return
        set({ profile: { ...cur, ...patch } })
      },
      updateSettings: (patch) => {
        if (patch.theme) mirrorTheme(patch.theme)
        set({ settings: { ...get().settings, ...patch } })
      },
      resetProfile: () => {
        mirrorTheme('system')
        set({ profile: null, settings: DEFAULT_SETTINGS })
      },
    }),
    {
      name: STORE_KEYS.profile,
      storage: idbStorage,
      version: PERSIST_VERSIONS[STORE_KEYS.profile],
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as ProfileState,
      // Nya inställningsfält får standardvärden även för befintliga användare.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ProfileState>
        return {
          ...current,
          ...p,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
        }
      },
    },
  ),
)
