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

/**
 * Vanliga lösenord och ord som ofta används i dem (utan å/ä/ö och siffror). Den som kommer åt
 * databasen har den inslagna nyckeln och kan gissa offline – de här provas alltid först.
 */
const COMMON_WORDS = [
  'losenord',
  'password',
  'passord',
  'hemlig',
  'hemligt',
  'qwertyuiop',
  'qwerty',
  'asdfghjkl',
  'asdf',
  'zxcvbnm',
  'lagom',
  'sommar',
  'vinter',
  'hejhej',
  'admin',
  'welcome',
  'valkommen',
  'letmein',
  'iloveyou',
  'test',
  'abc',
]

/** Tangentbordsrader och följder som ofta används ("abcdefgh…", "qwerty…", "1234…"). */
const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm', '01234567890', '09876543210']

/** Gemener utan diakritiska tecken (å → a), för jämförelserna nedan. */
function plain(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

/** Varför lösenfrasen är lätt att gissa, eller null. Längden kontrolleras i `passphraseProblem`. */
export function passphraseWeakness(passphrase: string): string | null {
  const text = plain(passphrase)
  const compact = text.replace(/\s+/g, '')
  const advice = 'Välj hellre några ord som bara du kopplar ihop, till exempel fyra ord.'
  if (/^\d+$/.test(compact)) return `Lösenfrasen kan inte bara vara siffror. ${advice}`
  if (new Set(compact).size < 5) return `Lösenfrasen har för få olika tecken. ${advice}`
  if (SEQUENCES.some((seq) => seq.repeat(3).includes(compact))) return `Lösenfrasen är en följd av tecken som är lätt att gissa. ${advice}`
  const letters = text.replace(/[^a-z]/g, '')
  const stripped = COMMON_WORDS.reduce((rest, word) => rest.replaceAll(word, ''), letters)
  if (letters.length > 0 && stripped.length < 3) return `Lösenfrasen är för vanlig och lätt att gissa. ${advice}`
  return null
}

export type PassphraseStrength = 'svag' | 'okej' | 'stark'

/** En enkel styrkemätare: fyra ord eller fler (eller minst 20 tecken) är stark. */
export function passphraseStrength(passphrase: string): PassphraseStrength {
  if ([...passphrase.normalize('NFKC')].length < MIN_PASSPHRASE_LENGTH || passphraseWeakness(passphrase)) return 'svag'
  const words = passphrase
    .trim()
    .split(/[\s\-_.,]+/)
    .filter((w) => [...w].length >= 2).length
  return words >= 4 || [...passphrase.normalize('NFKC')].length >= 20 ? 'stark' : 'okej'
}

/** Tipset under fältet: längden, rådet om ord och styrkan när något är ifyllt. */
export function passphraseHint(passphrase: string): string {
  const base = `Minst ${MIN_PASSPHRASE_LENGTH} tecken – helst fyra ord eller fler.`
  return passphrase ? `${base} Styrka: ${passphraseStrength(passphrase)}.` : base
}

/** Svensk text om lösenfrasen inte duger, annars null. */
export function passphraseProblem(passphrase: string, repeat: string): string | null {
  if ([...passphrase.normalize('NFKC')].length < MIN_PASSPHRASE_LENGTH) return `Lösenfrasen behöver vara minst ${MIN_PASSPHRASE_LENGTH} tecken.`
  if (passphrase.trim().length === 0) return 'Lösenfrasen kan inte bara vara mellanslag.'
  const weak = passphraseWeakness(passphrase)
  if (weak) return weak
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
