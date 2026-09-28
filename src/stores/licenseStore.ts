import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { idbStorage, PERSIST_VERSIONS, STORE_KEYS } from './storage'

interface LicenseState {
  /** När provperioden började (epoch-ms). Sätts när profilen skapas första gången. */
  trialStartedAt: number | null
  /** Aktiverad licensnyckel (verifieras vid start och när den läggs in). */
  licenseKey: string | null
  /** När licensen aktiverades på den här enheten. */
  activatedAt: number | null

  /** Starta provperioden om den inte redan har startat. */
  ensureTrialStarted: (at?: number) => void
  setLicense: (key: string) => void
  clearLicense: () => void
  /** Endast för tester/demo: nollställ allt. */
  resetLicenseState: () => void
}

export const useLicenseStore = create<LicenseState>()(
  persist(
    (set, get) => ({
      trialStartedAt: null,
      licenseKey: null,
      activatedAt: null,
      ensureTrialStarted: (at = Date.now()) => {
        const cur = get().trialStartedAt
        // Den tidigaste starten gäller – en provperiod kan inte förlängas genom att starta om.
        if (cur === null || at < cur) set({ trialStartedAt: cur === null ? at : Math.min(cur, at) })
      },
      setLicense: (key) => set({ licenseKey: key, activatedAt: Date.now() }),
      clearLicense: () => set({ licenseKey: null, activatedAt: null }),
      resetLicenseState: () => set({ trialStartedAt: null, licenseKey: null, activatedAt: null }),
    }),
    {
      name: STORE_KEYS.license,
      storage: idbStorage,
      version: PERSIST_VERSIONS[STORE_KEYS.license],
      // Framtida migreringar läggs här – kasta aldrig fel, skyddet mot nyare data ligger i storage.ts.
      migrate: (persisted) => persisted as LicenseState,
    },
  ),
)
