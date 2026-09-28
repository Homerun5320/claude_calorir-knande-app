/**
 * Inställningar → Lagom Moln med fejkade klienter (Auth och PostgREST): inloggning, samtycke som
 * krävs, lösenfras och återställningsnyckel, att exempeldata aldrig laddas upp och radering av
 * kontot (inklusive att Avbryt inte gör något).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../../types'
import { useBodyStore } from '../../../stores/bodyStore'
import { useCloudStore, type Session } from '../../../stores/cloudStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useFastingStore } from '../../../stores/fastingStore'
import { useFoodStore } from '../../../stores/foodStore'
import { useLicenseStore } from '../../../stores/licenseStore'
import { useProfileStore } from '../../../stores/profileStore'
import { clearDemoFlag, setDemoFlag } from '../../../lib/demoFlag'
import { CLOUD_CONSENT_TEXT, CLOUD_CONSENT_VERSION } from '../../../lib/cloud/consent'
import { clearUnlockedVault, loadUnlockedVault, saveUnlockedVault } from '../../../lib/cloud/keyStore'
import { createVault, type UnlockedVault } from '../../../lib/cloud/vaultCrypto'
import type { VaultRow } from '../../../lib/cloud/vault'
import CloudSection from './CloudSection'

MotionGlobalConfig.skipAnimations = true

const USER = '11111111-1111-4111-8111-111111111111'

const m = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  del: vi.fn(),
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  wipeAndReset: vi.fn(),
  vaultRow: null as unknown,
}))

// Fejkad PostgREST-klient: inga nätverksanrop i testerna.
vi.mock('../../../lib/cloud/postgrest', () => ({
  select: m.select,
  insert: m.insert,
  update: m.update,
  rpc: m.rpc,
  del: m.del,
}))

// Fejkad inloggning (engångskoden).
vi.mock('../../../lib/cloud/supabaseAuth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/cloud/supabaseAuth')>()),
  requestCode: m.requestCode,
  verifyCode: m.verifyCode,
}))

// 1 000 varv i stället för 600 000, så att testerna går fort.
vi.mock('../../../lib/cloud/vaultCrypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/cloud/vaultCrypto')>()
  return { ...actual, createVault: (pass: string, userId: string) => actual.createVault(pass, userId, 1_000) }
})

vi.mock('../wipe', () => ({ wipeAndReset: m.wipeAndReset }))

const PROFILE: Profile = {
  name: 'Anna',
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  targetWeightKg: 68,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: new Date(2026, 8, 1).getTime(),
}

const session = (): Session => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, userId: USER, email: 'anna@example.com' })

let readyRow: VaultRow
let readyKeys: UnlockedVault

function renderSection() {
  return render(
    <MemoryRouter initialEntries={['/installningar/moln']}>
      <Routes>
        <Route path="/installningar/moln" element={<CloudSection />} />
        <Route path="/valkommen" element={<p>Välkomstsidan</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Ett färdigt, upplåst valv på enheten. */
async function signedInAndReady() {
  m.vaultRow = readyRow
  await saveUnlockedVault(USER, readyKeys)
  useCloudStore.getState().setSession(session())
  useCloudStore.getState().patch({ enabled: true, consentVersion: CLOUD_CONSENT_VERSION })
}

const syncPushCalls = () => m.rpc.mock.calls.filter(([fn]) => fn === 'sync_push')

beforeAll(async () => {
  await Promise.all([useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore].map((s) => s.persist.rehydrate()))
  const { record, unlocked } = await createVault('en lång lösenfras här', USER)
  readyKeys = unlocked
  readyRow = {
    user_id: USER,
    format: 1,
    kdf: record.kdf,
    wrapped_key_passphrase: record.wrappedKeyPassphrase,
    wrapped_key_recovery: record.wrappedKeyRecovery,
    seq: 0,
    bytes_used: 0,
    consent_version: CLOUD_CONSENT_VERSION,
    consent_at: '2026-10-01T10:00:00Z',
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  m.vaultRow = null
  clearDemoFlag()
  await clearUnlockedVault()
  useCloudStore.getState().reset()
  useProfileStore.setState({ profile: PROFILE })
  m.select.mockImplementation(async (table: string) => (table === 'vaults' ? (m.vaultRow ? [m.vaultRow] : []) : []))
  m.insert.mockImplementation(async (_table: string, row: Record<string, unknown>) => {
    m.vaultRow = { user_id: USER, seq: 0, bytes_used: 0, ...row }
    return [m.vaultRow]
  })
  m.update.mockResolvedValue([])
  m.del.mockResolvedValue(undefined)
  m.rpc.mockImplementation(async (fn: string, args?: { p_items?: Array<{ id: string }> }) =>
    fn === 'sync_push' ? { applied: [{ id: args?.p_items?.[0]?.id, rev: 1, seq: 1 }], conflicts: [] } : null,
  )
  m.requestCode.mockResolvedValue(undefined)
  m.verifyCode.mockImplementation(async () => {
    const s = session()
    useCloudStore.getState().setSession(s)
    return s
  })
})

afterEach(() => {
  clearDemoFlag()
})

describe('inloggning', () => {
  it('skickar en kod och loggar in – sedan kommer samtycket', async () => {
    renderSection()
    expect(screen.getByText('Steg 1 av 3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('E-postadress'), { target: { value: 'anna@example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka kod' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('giltig e-postadress')
    expect(m.requestCode).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('E-postadress'), { target: { value: 'anna@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka kod' }))
    await waitFor(() => expect(m.requestCode).toHaveBeenCalledWith('anna@example.com'))
    fireEvent.change(await screen.findByLabelText('Kod (8 siffror)'), { target: { value: '1234 5678' } })
    fireEvent.click(screen.getByRole('button', { name: 'Logga in' }))
    await waitFor(() => expect(m.verifyCode).toHaveBeenCalledWith('anna@example.com', '12345678'))
    expect(await screen.findByRole('heading', { name: 'Innan något sparas' })).toBeInTheDocument()
    // Ingenting har sparats i molnet före samtycket.
    expect(m.insert).not.toHaveBeenCalled()
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('visar felet från inloggningen på svenska', async () => {
    const { CloudError } = await import('../../../lib/cloud/http')
    m.verifyCode.mockRejectedValue(new CloudError('fel-kod'))
    renderSection()
    fireEvent.change(screen.getByLabelText('E-postadress'), { target: { value: 'anna@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skicka kod' }))
    fireEvent.change(await screen.findByLabelText('Kod (8 siffror)'), { target: { value: '00000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Logga in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Koden stämmer inte')
  })
})

describe('samtycke och lösenfras', () => {
  it('samtycket krävs: kryssrutan är inte förifylld och inget sparas utan den', async () => {
    useCloudStore.getState().setSession(session())
    renderSection()
    const box = await screen.findByRole('checkbox', { name: CLOUD_CONSENT_TEXT })
    expect(box).not.toBeChecked()
    const next = screen.getByRole('button', { name: 'Fortsätt' })
    expect(next).toBeDisabled()
    fireEvent.click(next)
    expect(screen.queryByLabelText('Lösenfras')).not.toBeInTheDocument()
    expect(m.insert).not.toHaveBeenCalled()

    fireEvent.click(box)
    expect(next).toBeEnabled()
    fireEvent.click(next)
    expect(await screen.findByText('Steg 3 av 3')).toBeInTheDocument()
    expect(m.insert).not.toHaveBeenCalled()
  })

  it('skapar valvet med samtycket, visar återställningsnyckeln och laddar upp första kopian', async () => {
    useCloudStore.getState().setSession(session())
    renderSection()
    fireEvent.click(await screen.findByRole('checkbox', { name: CLOUD_CONSENT_TEXT }))
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))

    fireEvent.change(await screen.findByLabelText('Lösenfras'), { target: { value: 'för kort' } })
    fireEvent.change(screen.getByLabelText('Upprepa lösenfrasen'), { target: { value: 'för kort' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skapa krypterad kopia' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('minst 12 tecken')

    fireEvent.change(screen.getByLabelText('Lösenfras'), { target: { value: 'lingon och blåbär' } })
    fireEvent.change(screen.getByLabelText('Upprepa lösenfrasen'), { target: { value: 'lingon och blåbär' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skapa krypterad kopia' }))

    const key = await screen.findByText(/^([0-9A-HJKMNP-TV-Z]{4}-){12}[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(screen.getByText('Återställningsnyckel')).toBeInTheDocument()
    expect(m.insert).toHaveBeenCalledTimes(1)
    const [table, row] = m.insert.mock.calls[0] as [string, Record<string, unknown>]
    expect(table).toBe('vaults')
    expect(row).toMatchObject({ format: 1, consent_version: CLOUD_CONSENT_VERSION })
    // Samtyckets tidpunkt sätts av databasen – appen kan inte bakdatera den.
    expect(row).not.toHaveProperty('consent_at')
    expect(row).not.toHaveProperty('updated_at')
    expect(row).not.toHaveProperty('user_id')
    // Lösenfrasen och nyckeln skickas aldrig.
    expect(JSON.stringify(row)).not.toContain('lingon')
    expect(JSON.stringify(row)).not.toContain(key.textContent)
    expect(syncPushCalls()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Jag har sparat nyckeln' }))
    await waitFor(() => expect(syncPushCalls()).toHaveLength(1))
    expect(useCloudStore.getState().enabled).toBe(true)
    expect(await screen.findByRole('button', { name: 'Säkerhetskopiera nu' })).toBeEnabled()
    expect(screen.queryByText('Återställningsnyckel')).not.toBeInTheDocument()
  })

  it('en ny samtyckestext måste godkännas innan molnet används', async () => {
    await signedInAndReady()
    m.vaultRow = { ...readyRow, consent_version: '2020-01-01' }
    renderSection()
    expect(await screen.findByRole('heading', { name: 'Samtyckestexten har ändrats' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: CLOUD_CONSENT_TEXT })).not.toBeChecked()
    expect(screen.queryByRole('button', { name: 'Säkerhetskopiera nu' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: CLOUD_CONSENT_TEXT }))
    m.update.mockImplementation(async () => {
      m.vaultRow = readyRow
      return []
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
    await waitFor(() => expect(m.update).toHaveBeenCalledWith('vaults', `user_id=eq.${USER}`, expect.objectContaining({ consent_version: CLOUD_CONSENT_VERSION })))
    expect(await screen.findByRole('button', { name: 'Säkerhetskopiera nu' })).toBeInTheDocument()
  })
})

describe('exempeldata', () => {
  it('demoläget laddar aldrig upp – inte efter uppstarten och inte med knappen', async () => {
    setDemoFlag()
    useCloudStore.getState().setSession(session())
    renderSection()
    fireEvent.click(await screen.findByRole('checkbox', { name: CLOUD_CONSENT_TEXT }))
    fireEvent.click(screen.getByRole('button', { name: 'Fortsätt' }))
    fireEvent.change(await screen.findByLabelText('Lösenfras'), { target: { value: 'lingon och blåbär' } })
    fireEvent.change(screen.getByLabelText('Upprepa lösenfrasen'), { target: { value: 'lingon och blåbär' } })
    fireEvent.click(screen.getByRole('button', { name: 'Skapa krypterad kopia' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Jag har sparat nyckeln' }))

    const upload = await screen.findByRole('button', { name: 'Säkerhetskopiera nu' })
    expect(upload).toBeDisabled()
    expect(screen.getByText(/Du tittar på exempeldata/)).toBeInTheDocument()
    fireEvent.click(upload)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(syncPushCalls()).toHaveLength(0)
  })
})

describe('radera konto', () => {
  it('radering anropar delete_my_account, rensar sessionen och nyckeln och bekräftar', async () => {
    await signedInAndReady()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Radera konto och molndata' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Kontot och all krypterad data i molnet raderas permanent. Din data på den här enheten finns kvar.')
    const wipe = within(dialog).getByRole('checkbox', { name: /Radera också allt på den här enheten/ })
    expect(wipe).not.toBeChecked()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Radera konto' }))
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith('delete_my_account'))
    expect(await screen.findByRole('heading', { name: 'Ditt konto är raderat' })).toBeInTheDocument()
    expect(useCloudStore.getState().session).toBeNull()
    expect(useCloudStore.getState().enabled).toBe(false)
    expect(await loadUnlockedVault(USER)).toBeNull()
    expect(m.wipeAndReset).not.toHaveBeenCalled()
    // Tillbaka till inloggningen.
    expect(screen.getByLabelText('E-postadress')).toBeInTheDocument()
  })

  it('kan radera allt på enheten samtidigt', async () => {
    await signedInAndReady()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Radera konto och molndata' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Radera också allt på den här enheten/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Radera konto' }))
    expect(await screen.findByText('Välkomstsidan')).toBeInTheDocument()
    expect(m.rpc).toHaveBeenCalledWith('delete_my_account')
    expect(m.wipeAndReset).toHaveBeenCalledTimes(1)
  })

  it('avbryt gör ingenting', async () => {
    await signedInAndReady()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Radera konto och molndata' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(m.rpc).not.toHaveBeenCalledWith('delete_my_account')
    expect(useCloudStore.getState().session).not.toBeNull()
    expect(await loadUnlockedVault(USER)).not.toBeNull()
    expect(m.wipeAndReset).not.toHaveBeenCalled()
  })

  it('ett fel vid radering visas och inget glöms lokalt', async () => {
    const { CloudError } = await import('../../../lib/cloud/http')
    await signedInAndReady()
    m.rpc.mockRejectedValue(new CloudError('natverk'))
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Radera konto och molndata' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Radera konto' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Kunde inte nå Lagom Moln')
    expect(useCloudStore.getState().session).not.toBeNull()
    expect(await loadUnlockedVault(USER)).not.toBeNull()
  })
})

describe('stäng av', () => {
  it('stänger av, loggar ut och kan radera kopian i molnet', async () => {
    await signedInAndReady()
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Stäng av Lagom Moln' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Radera också kopian i molnet/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stäng av' }))
    await waitFor(() => expect(m.del).toHaveBeenCalledWith('sync_items', `user_id=eq.${USER}`))
    await waitFor(() => expect(useCloudStore.getState().session).toBeNull())
    expect(await loadUnlockedVault(USER)).toBeNull()
    expect(m.rpc).not.toHaveBeenCalledWith('delete_my_account')
  })
})
