/**
 * Lagom Moln – att komma igång: samtycke, nytt valv, upplåsning och glömd lösenfras.
 * Gränssnittet finns i Inställningar → Lagom Moln (src/features/settings/sections/CloudSection.tsx).
 */
import { useCloudStore } from '../../stores/cloudStore'
import { CLOUD_CONSENT_VERSION } from './consent'
import { loadUnlockedVault, saveUnlockedVault } from './keyStore'
import { fetchVault, saveConsent, saveNewVault, saveVaultRecord, vaultRecordFromRow, type VaultRow } from './vault'
import { createVault, rewrapWithRecovery, unlockWithPassphrase, unlockWithRecoveryKey, type VaultRecord } from './vaultCrypto'

/** Minsta längd på lösenfrasen. */
export const MIN_PASSPHRASE_LENGTH = 12

/** Svensk text om lösenfrasen inte duger, annars null. */
export function passphraseProblem(passphrase: string, repeat: string): string | null {
  if ([...passphrase.normalize('NFKC')].length < MIN_PASSPHRASE_LENGTH) return `Lösenfrasen behöver vara minst ${MIN_PASSPHRASE_LENGTH} tecken.`
  if (passphrase.trim().length === 0) return 'Lösenfrasen kan inte bara vara mellanslag.'
  if (passphrase !== repeat) return 'Lösenfraserna är inte likadana.'
  return null
}

/** Läget för kontots valv, sett från den här enheten. */
export type VaultState =
  /** Inget färdigt valv ännu – samtycke och lösenfras behövs. */
  | { kind: 'nytt'; row: VaultRow | null }
  /** Valvet finns. */
  | { kind: 'finns'; row: VaultRow; record: VaultRecord; consentOk: boolean; unlockedHere: boolean }

/** Läs valvet och om det är upplåst på den här enheten. */
export async function loadVaultState(userId: string): Promise<VaultState> {
  const row = await fetchVault(userId)
  const record = vaultRecordFromRow(row)
  if (!row || !record) return { kind: 'nytt', row }
  const consentOk = row.consent_version === CLOUD_CONSENT_VERSION
  if (consentOk) useCloudStore.getState().patch({ consentVersion: row.consent_version })
  const unlockedHere = (await loadUnlockedVault(userId)) !== null
  return { kind: 'finns', row, record, consentOk, unlockedHere }
}

/** Spara ett nytt samtycke för ett befintligt valv (när samtyckestexten har ändrats). */
export async function acceptNewConsent(userId: string): Promise<void> {
  await saveConsent(userId, CLOUD_CONSENT_VERSION)
  useCloudStore.getState().patch({ consentVersion: CLOUD_CONSENT_VERSION, lastError: null })
}

/**
 * Skapa valvet med lösenfrasen och spara det tillsammans med samtycket. Returnerar
 * återställningsnyckeln, som visas en gång och aldrig sparas.
 */
export async function setUpVault(userId: string, passphrase: string, existingRow: boolean): Promise<{ recoveryKey: string }> {
  const { record, recoveryKey, unlocked } = await createVault(passphrase, userId)
  try {
    await saveNewVault(userId, record, CLOUD_CONSENT_VERSION, existingRow)
  } catch (e) {
    // Svaret kan ha gått förlorat fast raden sparades (t.ex. tappad anslutning). Är raden i
    // molnet vår egen – samma inslagna nyckel – är valvet klart, och återställningsnyckeln måste
    // visas nu (den finns ingen annanstans). Annars gäller felet.
    const saved = await fetchVault(userId).catch(() => null)
    if (saved?.wrapped_key_passphrase !== record.wrappedKeyPassphrase) throw e
  }
  await saveUnlockedVault(userId, unlocked)
  useCloudStore.getState().patch({
    consentVersion: CLOUD_CONSENT_VERSION,
    backupRev: 0,
    lastUploadHash: null,
    lastUploadEntries: null,
    lastError: null,
  })
  return { recoveryKey }
}

/** Lås upp valvet på den här enheten med lösenfrasen. Kastar VaultError vid fel lösenfras. */
export async function unlockHere(userId: string, record: VaultRecord, passphrase: string): Promise<void> {
  const unlocked = await unlockWithPassphrase(record, passphrase, userId)
  await saveUnlockedVault(userId, unlocked)
}

/**
 * Glömd lösenfras: lås upp med återställningsnyckeln och välj en ny lösenfras. Datan i molnet
 * går fortfarande att läsa, och återställningsnyckeln fortsätter att gälla.
 */
export async function recoverHere(userId: string, record: VaultRecord, recoveryKey: string, newPassphrase: string): Promise<void> {
  const unlocked = await unlockWithRecoveryKey(record, recoveryKey, userId)
  const next = await rewrapWithRecovery(record, recoveryKey, newPassphrase, userId)
  await saveVaultRecord(userId, next)
  await saveUnlockedVault(userId, unlocked)
}
