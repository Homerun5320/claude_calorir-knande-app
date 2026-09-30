/**
 * Den upplåsta datanyckeln på den här enheten.
 *
 * Nycklarna är icke-exporterbara CryptoKey-objekt och sparas i IndexedDB under 'lagom-cloud-key'
 * (utanför `STORE_KEYS`, så att de aldrig hamnar i en säkerhetskopia). Webbläsaren kan använda
 * dem men aldrig lämna ut själva nyckeln. Går IndexedDB inte att använda finns nyckeln bara i
 * minnet tills appen stängs – då behöver lösenfrasen skrivas in igen.
 */
import { del, get, set } from 'idb-keyval'
import type { UnlockedVault } from './vaultCrypto'

export const CLOUD_KEY_STORAGE = 'lagom-cloud-key'

interface StoredKeys extends UnlockedVault {
  userId: string
}

let memory: StoredKeys | null = null

function isStoredKeys(v: unknown): v is StoredKeys {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return typeof o.userId === 'string' && o.dataKey instanceof CryptoKey && o.idKey instanceof CryptoKey
}

/** Spara det upplåsta valvet för användaren på den här enheten. */
export async function saveUnlockedVault(userId: string, unlocked: UnlockedVault): Promise<void> {
  memory = { userId, dataKey: unlocked.dataKey, idKey: unlocked.idKey }
  try {
    await set(CLOUD_KEY_STORAGE, memory)
  } catch {
    /* lagringen är blockerad – nyckeln finns kvar i minnet för sessionen */
  }
}

/** Det upplåsta valvet för användaren, eller null om det inte är upplåst på den här enheten. */
export async function loadUnlockedVault(userId: string): Promise<UnlockedVault | null> {
  if (memory?.userId === userId) return memory
  try {
    const stored: unknown = await get(CLOUD_KEY_STORAGE)
    if (isStoredKeys(stored) && stored.userId === userId) {
      memory = stored
      return stored
    }
  } catch {
    /* lagringen är blockerad */
  }
  return null
}

/** Glöm nyckeln på den här enheten (utloggning, avstängning eller raderat konto). */
export async function clearUnlockedVault(): Promise<void> {
  memory = null
  try {
    await del(CLOUD_KEY_STORAGE)
  } catch {
    /* ignorera */
  }
}
