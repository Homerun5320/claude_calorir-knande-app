/**
 * Lagom Moln – inloggning och läget för molnkopian på den här enheten.
 *
 * Sparas under nyckeln 'lagom-cloud', som medvetet INTE finns i `STORE_KEYS`: säkerhetskopior och
 * export ska aldrig ta med en inloggning. "Radera all data" loggar i stället ut på enheten
 * (`signOutOfCloud` i features/settings/wipe.ts), som glömmer både inloggningen och den upplåsta
 * datanyckeln. Datanyckeln sparas inte här utan separat (icke-exporterbar CryptoKey, se
 * src/lib/cloud/keyStore.ts).
 *
 * Butiken importerar ingen molnkod, så den kan läsas in även när Lagom Moln är avstängt (då är
 * den bara tom).
 *
 * Välj fält var för sig i komponenter (t.ex. `useCloudStore((s) => s.lastUploadAt)`) – en selektor
 * som skapar ett nytt objekt ger en oändlig renderingsloop.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { canRehydrate, idbStorage, onRemoteWrite } from './storage'

/** Nyckeln i IndexedDB. */
export const CLOUD_STORE_KEY = 'lagom-cloud'

/** En inloggning i Lagom Moln (Supabase Auth). */
export interface Session {
  accessToken: string
  refreshToken: string
  /** När åtkomsttoken går ut (epoch-ms). */
  expiresAt: number
  userId: string
  email: string
}

export interface CloudState {
  session: Session | null
  /** Automatisk säkerhetskopiering till molnet är på. */
  enabled: boolean
  /** När den senaste kopian laddades upp från den här enheten (epoch-ms). */
  lastUploadAt: number | null
  /** Senaste försöket (lyckat eller inte) – begränsar uppladdningar när appen göms. */
  lastAttemptAt: number | null
  /** Högsta ändringsnumret (seq) som den här enheten känner till. */
  lastSeq: number
  /** Revisionen av molnkopian som den här enheten senast laddade upp eller återställde (0 = ingen). */
  backupRev: number
  /** Kontrollsumma för innehållet i senaste uppladdningen – samma innehåll laddas inte upp igen automatiskt. */
  lastUploadHash: string | null
  /** Antal dagboksposter i senaste uppladdningen (skydd mot att en tömd dagbok skriver över kopian). */
  lastUploadEntries: number | null
  /** Versionen av samtyckestexten som användaren har godkänt. */
  consentVersion: string | null
  /** Varför den senaste automatiska kopian inte blev av (svensk text), eller null. */
  lastError: string | null

  setSession: (session: Session | null) => void
  patch: (p: Partial<Omit<CloudState, 'setSession' | 'patch' | 'reset'>>) => void
  /** Glöm allt om molnet på den här enheten (utloggning eller raderat konto). */
  reset: () => void
}

const INITIAL = {
  session: null,
  enabled: false,
  lastUploadAt: null,
  lastAttemptAt: null,
  lastSeq: 0,
  backupRev: 0,
  lastUploadHash: null,
  lastUploadEntries: null,
  consentVersion: null,
  lastError: null,
} satisfies Partial<CloudState>

export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      ...INITIAL,
      setSession: (session) => set({ session }),
      patch: (p) => set(p),
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: CLOUD_STORE_KEY,
      storage: idbStorage,
      version: 1,
      // Framtida migreringar läggs här – kasta aldrig fel.
      migrate: (persisted) => persisted as CloudState,
      merge: (persisted, current) => {
        const p = (typeof persisted === 'object' && persisted !== null ? persisted : {}) as Partial<CloudState>
        const next: CloudState = { ...current, ...p }
        // En inläsning får inte ersätta en inloggning som den här fliken just har förnyat (samma
        // konto, senare utgång). Utloggning eller byte av konto i en annan flik gäller däremot.
        const cur = current.session
        if (cur && p.session && p.session.userId === cur.userId && cur.expiresAt > p.session.expiresAt) next.session = cur
        return next
      },
    },
  ),
)

/**
 * Flera flikar delar samma inloggning. Supabase byter förnyelsetoken vid varje förnyelse, och en
 * förnyelsetoken som redan har använts avslutar hela inloggningen på enheten. Därför läses
 * butiken in på nytt när en annan flik har sparat den (och när fliken visas igen, om ett
 * meddelande missades) – annars kan den här fliken skriva tillbaka en gammal token.
 */
function rehydrateIfChanged(name: string): void {
  if (name === CLOUD_STORE_KEY && canRehydrate(name)) void useCloudStore.persist.rehydrate()
}

onRemoteWrite(rehydrateIfChanged)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rehydrateIfChanged(CLOUD_STORE_KEY)
  })
}
