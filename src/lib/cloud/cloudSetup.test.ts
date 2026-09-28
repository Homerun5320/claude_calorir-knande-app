/**
 * Att komma igång med Lagom Moln: valvet sparas med samtycket, och ett svar som går förlorat efter
 * att raden sparats gör inte att återställningsnyckeln försvinner.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCloudStore } from '../../stores/cloudStore'
import { CLOUD_CONSENT_VERSION } from './consent'
import { CloudError } from './http'
import { clearUnlockedVault, loadUnlockedVault } from './keyStore'
import { passphraseProblem, setUpVault } from './cloudSetup'
import type { VaultRow } from './vault'

const USER = '11111111-1111-4111-8111-111111111111'

const m = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  row: null as unknown,
}))

// Fejkad PostgREST-klient: inga nätverksanrop.
vi.mock('./postgrest', () => ({ select: m.select, insert: m.insert, update: m.update, rpc: vi.fn(), del: vi.fn() }))

// 1 000 varv i stället för 600 000, så att testerna går fort.
vi.mock('./vaultCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vaultCrypto')>()
  return { ...actual, createVault: (pass: string, userId: string) => actual.createVault(pass, userId, 1_000) }
})

function storeRow(values: Record<string, unknown>): VaultRow {
  m.row = { user_id: USER, seq: 0, bytes_used: 0, ...values }
  return m.row as VaultRow
}

beforeEach(async () => {
  vi.clearAllMocks()
  m.row = null
  useCloudStore.getState().reset()
  await clearUnlockedVault()
  m.select.mockImplementation(async () => (m.row ? [m.row] : []))
  m.insert.mockImplementation(async (_table: string, values: Record<string, unknown>) => [storeRow(values)])
})

describe('passphraseProblem', () => {
  it('kräver minst 12 tecken och två likadana lösenfraser', () => {
    expect(passphraseProblem('för kort', 'för kort')).toMatch(/minst 12 tecken/)
    expect(passphraseProblem('            ', '            ')).toMatch(/mellanslag/)
    expect(passphraseProblem('lingon och blåbär', 'lingon och blåbar')).toMatch(/inte likadana/)
    expect(passphraseProblem('lingon och blåbär', 'lingon och blåbär')).toBeNull()
  })
})

describe('setUpVault', () => {
  it('sparar valvet med samtycket och låser upp det på enheten', async () => {
    const { recoveryKey } = await setUpVault(USER, 'lingon och blåbär', false)
    expect(recoveryKey).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(m.insert).toHaveBeenCalledWith('vaults', expect.objectContaining({ format: 1, consent_version: CLOUD_CONSENT_VERSION }))
    expect(await loadUnlockedVault(USER)).not.toBeNull()
    expect(useCloudStore.getState().consentVersion).toBe(CLOUD_CONSENT_VERSION)
  })

  it('valvet sparades men svaret gick förlorat: nyckeln visas ändå', async () => {
    m.insert.mockImplementation(async (_table: string, values: Record<string, unknown>) => {
      storeRow(values)
      throw new CloudError('natverk')
    })
    const { recoveryKey } = await setUpVault(USER, 'lingon och blåbär', false)
    expect(recoveryKey).toBeTruthy()
    expect(await loadUnlockedVault(USER)).not.toBeNull()
  })

  it('ett annat valv i molnet eller ett fel utan sparad rad ger felet', async () => {
    m.insert.mockRejectedValue(new CloudError('natverk'))
    await expect(setUpVault(USER, 'lingon och blåbär', false)).rejects.toMatchObject({ code: 'natverk' })

    storeRow({ format: 1, wrapped_key_passphrase: 'v1.annat.valv' })
    m.insert.mockRejectedValue(new CloudError('server', { status: 409 }))
    await expect(setUpVault(USER, 'lingon och blåbär', false)).rejects.toMatchObject({ code: 'server' })
    expect(await loadUnlockedVault(USER)).toBeNull()
  })
})
