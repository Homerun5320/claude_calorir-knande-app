/**
 * Lagom Moln – valvet i databasen (tabellen `vaults`, en rad per konto).
 *
 * Raden innehåller bara det som behövs för att låsa upp på en ny enhet: inslagna nycklar,
 * nyckelhärledningens parametrar och samtycket. Aldrig lösenfrasen, återställningsnyckeln eller
 * någon nyckel i klartext.
 */
import { insert, select, update } from './postgrest'
import type { KdfParams, VaultRecord } from './vaultCrypto'

export interface VaultRow {
  user_id: string
  format: number | null
  kdf: unknown
  wrapped_key_passphrase: string | null
  wrapped_key_recovery: string | null
  seq: number
  bytes_used: number
  consent_version: string | null
  consent_at: string | null
}

const COLUMNS = 'user_id,format,kdf,wrapped_key_passphrase,wrapped_key_recovery,seq,bytes_used,consent_version,consent_at'

const eqUser = (userId: string) => `user_id=eq.${encodeURIComponent(userId)}`

/** Kontots valv, eller null om det inte har skapats ännu. */
export async function fetchVault(userId: string): Promise<VaultRow | null> {
  const rows = await select<VaultRow>('vaults', `select=${COLUMNS}&${eqUser(userId)}&limit=1`)
  return rows[0] ?? null
}

/** Valvets nycklar ur raden, eller null om raden saknar dem (valvet är inte färdigt). */
export function vaultRecordFromRow(row: VaultRow | null): VaultRecord | null {
  if (!row || row.format !== 1) return null
  const kdf = row.kdf as Partial<KdfParams> | null
  if (!kdf || typeof kdf !== 'object' || typeof row.wrapped_key_passphrase !== 'string' || typeof row.wrapped_key_recovery !== 'string') return null
  return {
    format: 1,
    kdf: kdf as KdfParams,
    wrappedKeyPassphrase: row.wrapped_key_passphrase,
    wrappedKeyRecovery: row.wrapped_key_recovery,
  }
}

/**
 * Spara ett nytt valv tillsammans med samtycket. `existingRow` = en rad finns redan (t.ex. ett
 * avbrutet försök) och uppdateras i stället för att läggas till. `user_id` sätts av databasen
 * (auth.uid()) och kan inte väljas av appen.
 */
export async function saveNewVault(userId: string, record: VaultRecord, consentVersion: string, existingRow: boolean, now: Date = new Date()): Promise<void> {
  const values = {
    format: record.format,
    kdf: record.kdf,
    wrapped_key_passphrase: record.wrappedKeyPassphrase,
    wrapped_key_recovery: record.wrappedKeyRecovery,
    consent_version: consentVersion,
    consent_at: now.toISOString(),
    updated_at: now.toISOString(),
  }
  if (existingRow) await update('vaults', eqUser(userId), values)
  else await insert('vaults', values)
}

/** Spara ett nytt samtycke (när samtyckestexten har ändrats). */
export async function saveConsent(userId: string, consentVersion: string, now: Date = new Date()): Promise<void> {
  await update('vaults', eqUser(userId), { consent_version: consentVersion, consent_at: now.toISOString(), updated_at: now.toISOString() })
}

/** Spara om valvets nycklar (ny lösenfras). */
export async function saveVaultRecord(userId: string, record: VaultRecord, now: Date = new Date()): Promise<void> {
  await update('vaults', eqUser(userId), {
    format: record.format,
    kdf: record.kdf,
    wrapped_key_passphrase: record.wrappedKeyPassphrase,
    wrapped_key_recovery: record.wrappedKeyRecovery,
    updated_at: now.toISOString(),
  })
}
