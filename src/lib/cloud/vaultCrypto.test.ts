/**
 * Valvets kryptering: tur och retur, upplåsning, bindning till konto och post-id, och
 * återställningsnyckelns format. Testerna använder 1 000 PBKDF2-varv för fart – appen 600 000.
 */
import { describe, expect, it } from 'vitest'
import {
  PBKDF2_ITERATIONS,
  VAULT_FORMAT,
  VaultError,
  createVault,
  decryptItem,
  encryptItem,
  formatRecoveryKey,
  itemId,
  parseRecoveryKey,
  rewrapWithRecovery,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
  type VaultRecord,
} from './vaultCrypto'

const ITER = 1_000
const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const PASS = 'lingon och blåbär i skogen'

async function expectVaultError(p: Promise<unknown>, code: VaultError['code']): Promise<VaultError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(VaultError)
    expect((e as VaultError).code).toBe(code)
    return e as VaultError
  }
  throw new Error('Förväntade ett VaultError')
}

describe('konstanter', () => {
  it('använder 600 000 PBKDF2-varv i appen och format 1', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000)
    expect(VAULT_FORMAT).toBe(1)
  })
})

describe('createVault', () => {
  it('ger ett valv utan nycklar i klartext och en återställningsnyckel i grupper om fyra', async () => {
    const { record, recoveryKey, unlocked } = await createVault(PASS, USER, ITER)
    expect(record.format).toBe(1)
    expect(record.kdf).toMatchObject({ alg: 'PBKDF2-SHA256', iter: ITER })
    expect(record.wrappedKeyPassphrase).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/)
    expect(record.wrappedKeyRecovery).toMatch(/^v1\./)
    expect(recoveryKey).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(unlocked.dataKey.extractable).toBe(false)
    expect(unlocked.idKey.extractable).toBe(false)
    // Lösenfrasen finns inte i posten.
    expect(JSON.stringify(record)).not.toContain('lingon')
  })

  it('använder 600 000 varv som standard', async () => {
    // Bara formen kontrolleras (en fullständig nyckelhärledning tar någon sekund).
    const p = createVault(PASS, USER)
    const { record } = await p
    expect(record.kdf.iter).toBe(PBKDF2_ITERATIONS)
  }, 20_000)

  it('godtar inte ett orimligt antal varv', async () => {
    await expectVaultError(createVault(PASS, USER, 10), 'fel-format')
  })
})

describe('tur och retur', () => {
  it('krypterar och dekrypterar med samma upplåsta valv', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const value = { dagbok: { '2026-09-28': [{ namn: 'Havregrynsgröt', kcal: 312.5 }] }, text: 'åäö – “citat”' }
    const payload = await encryptItem(unlocked, USER, id, value)
    expect(payload).toMatch(/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/)
    expect(payload).not.toContain('Havregryn')
    expect(await decryptItem(unlocked, USER, id, payload)).toEqual(value)
  })

  it('ger olika chiffertext varje gång (slumpad IV)', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const a = await encryptItem(unlocked, USER, id, { x: 1 })
    const b = await encryptItem(unlocked, USER, id, { x: 1 })
    expect(a).not.toBe(b)
  })

  it('komprimerar stora dagböcker', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const big = { rader: Array.from({ length: 2000 }, (_, i) => ({ id: `post-${i}`, namn: 'Kycklingbröst', gram: 150 })) }
    const payload = await encryptItem(unlocked, USER, id, big)
    expect(payload.length).toBeLessThan(JSON.stringify(big).length / 4)
    expect(await decryptItem(unlocked, USER, id, payload)).toEqual(big)
  })
})

describe('upplåsning', () => {
  it('låser upp med lösenfrasen och med återställningsnyckeln – samma nycklar', async () => {
    const { record, recoveryKey, unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const payload = await encryptItem(unlocked, USER, id, { hej: 'då' })

    const viaPass = await unlockWithPassphrase(record, PASS, USER)
    expect(await itemId(viaPass, 'backup')).toBe(id)
    expect(await decryptItem(viaPass, USER, id, payload)).toEqual({ hej: 'då' })

    const viaRecovery = await unlockWithRecoveryKey(record, recoveryKey.toLowerCase().replace(/-/g, ' '), USER)
    expect(await itemId(viaRecovery, 'backup')).toBe(id)
    expect(await decryptItem(viaRecovery, USER, id, payload)).toEqual({ hej: 'då' })
  })

  it('normaliserar lösenfrasen (NFKC)', async () => {
    const { record } = await createVault('Café Åre fika', USER, ITER)
    // "é" och "Å" som bokstav + kombinerande tecken.
    await expect(unlockWithPassphrase(record, 'Café Åre fika', USER)).resolves.toBeDefined()
  })

  it('fel lösenfras ger fel-losenfras', async () => {
    const { record } = await createVault(PASS, USER, ITER)
    const err = await expectVaultError(unlockWithPassphrase(record, 'fel lösenfras här', USER), 'fel-losenfras')
    expect(err.message).toMatch(/Lösenfrasen stämmer inte/)
  })

  it('fel återställningsnyckel ger fel-losenfras med egen text', async () => {
    const { record } = await createVault(PASS, USER, ITER)
    const other = await createVault(PASS, USER, ITER)
    const err = await expectVaultError(unlockWithRecoveryKey(record, other.recoveryKey, USER), 'fel-losenfras')
    expect(err.message).toMatch(/Återställningsnyckeln stämmer inte/)
  })

  it('avvisar ett valv som flyttats till en annan användare', async () => {
    const { record, recoveryKey } = await createVault(PASS, USER, ITER)
    await expectVaultError(unlockWithPassphrase(record, PASS, OTHER), 'fel-losenfras')
    await expectVaultError(unlockWithRecoveryKey(record, recoveryKey, OTHER), 'fel-losenfras')
  })

  it('avvisar okänt format och orimliga parametrar från servern', async () => {
    const { record } = await createVault(PASS, USER, ITER)
    await expectVaultError(unlockWithPassphrase({ ...record, format: 2 } as unknown as VaultRecord, PASS, USER), 'fel-format')
    await expectVaultError(unlockWithPassphrase({ ...record, kdf: { ...record.kdf, iter: 1e9 } }, PASS, USER), 'fel-format')
    await expectVaultError(unlockWithPassphrase({ ...record, kdf: { ...record.kdf, salt: 'kort' } }, PASS, USER), 'fel-format')
    await expectVaultError(unlockWithPassphrase({ ...record, wrappedKeyPassphrase: 'v2.a.b' }, PASS, USER), 'fel-format')
  })

  it('ny lösenfras via återställningsnyckeln – gammal data går fortfarande att läsa', async () => {
    const { record, recoveryKey, unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const payload = await encryptItem(unlocked, USER, id, [1, 2, 3])
    const next = await rewrapWithRecovery(record, recoveryKey, 'en helt ny lösenfras', USER, ITER)
    await expectVaultError(unlockWithPassphrase(next, PASS, USER), 'fel-losenfras')
    const again = await unlockWithPassphrase(next, 'en helt ny lösenfras', USER)
    expect(await decryptItem(again, USER, id, payload)).toEqual([1, 2, 3])
    // Återställningsnyckeln gäller fortfarande.
    await expect(unlockWithRecoveryKey(next, recoveryKey, USER)).resolves.toBeDefined()
  })

  it('ny lösenfras med fel återställningsnyckel ger en text om nyckeln, inte om lösenfrasen', async () => {
    const { record } = await createVault(PASS, USER, ITER)
    const other = await createVault(PASS, USER, ITER)
    const err = await expectVaultError(rewrapWithRecovery(record, other.recoveryKey, 'en helt ny lösenfras', USER, ITER), 'fel-losenfras')
    expect(err.message).toMatch(/Återställningsnyckeln stämmer inte/)
  })
})

describe('bindning av poster', () => {
  it('chiffertext som flyttats till ett annat post-id ger skadad', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const a = await itemId(unlocked, 'backup')
    const b = await itemId(unlocked, 'annat')
    expect(a).not.toBe(b)
    const payload = await encryptItem(unlocked, USER, a, { x: 1 })
    await expectVaultError(decryptItem(unlocked, USER, b, payload), 'skadad')
  })

  it('chiffertext som flyttats till en annan användare ger skadad', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const payload = await encryptItem(unlocked, USER, id, { x: 1 })
    await expectVaultError(decryptItem(unlocked, OTHER, id, payload), 'skadad')
  })

  it('ändrad chiffertext eller fel nyckel ger skadad', async () => {
    const { unlocked } = await createVault(PASS, USER, ITER)
    const other = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    const payload = await encryptItem(unlocked, USER, id, { x: 1 })
    const [v, iv, ct] = payload.split('.')
    const flipped = `${v}.${iv}.${ct.slice(0, -2)}${ct.at(-2) === 'A' ? 'B' : 'A'}${ct.at(-1)}`
    await expectVaultError(decryptItem(unlocked, USER, id, flipped), 'skadad')
    await expectVaultError(decryptItem(other.unlocked, USER, id, payload), 'skadad')
    await expectVaultError(decryptItem(unlocked, USER, id, 'v9.abc.def'), 'fel-format')
  })

  it('post-id:t är 32 tecken base64url och samma för samma valv', async () => {
    const { record, unlocked } = await createVault(PASS, USER, ITER)
    const id = await itemId(unlocked, 'backup')
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const again = await unlockWithPassphrase(record, PASS, USER)
    expect(await itemId(again, 'backup')).toBe(id)
    // Ett annat valv ger ett annat id för samma namn (servern kan inte känna igen posten).
    const other = await createVault(PASS, USER, ITER)
    expect(await itemId(other.unlocked, 'backup')).not.toBe(id)
  })
})

describe('återställningsnyckeln', () => {
  it('formaterar 32 byte som 13 grupper om fyra och tolkar tillbaka', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 255)
    const text = formatRecoveryKey(bytes)
    expect(text.split('-')).toHaveLength(13)
    expect(Array.from(parseRecoveryKey(text))).toEqual(Array.from(bytes))
  })

  it('tål gemener, mellanslag och förväxlingsbara tecken (O→0, I/L→1)', () => {
    const bytes = new Uint8Array(32).fill(0)
    bytes[1] = 0b01000000 // ger "01" först
    const text = formatRecoveryKey(bytes)
    expect(text.startsWith('01')).toBe(true)
    const sloppy = ` ${text.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l')} `
    expect(Array.from(parseRecoveryKey(sloppy))).toEqual(Array.from(bytes))
    expect(Array.from(parseRecoveryKey(text.replace(/1/g, 'I')))).toEqual(Array.from(bytes))
  })

  it('avvisar fel längd och ogiltiga tecken med fel-format', () => {
    expect(() => parseRecoveryKey('ABCD-EFGH')).toThrow(VaultError)
    const ok = formatRecoveryKey(new Uint8Array(32))
    expect(() => parseRecoveryKey(ok.replace(/^0/, 'U'))).toThrow(/52 tecken/)
  })
})
