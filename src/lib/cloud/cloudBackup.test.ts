/**
 * Den krypterade molnkopian: vad som stoppar en uppladdning (exempeldata, ej inläst, ingen profil),
 * uppladdning med rätt revision, konflikter, nedladdning och radering av konto.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../../types'
import { useBodyStore } from '../../stores/bodyStore'
import { useCloudStore, type Session } from '../../stores/cloudStore'
import { useDiaryStore } from '../../stores/diaryStore'
import { useFastingStore } from '../../stores/fastingStore'
import { useFoodStore } from '../../stores/foodStore'
import { useLicenseStore } from '../../stores/licenseStore'
import { useProfileStore } from '../../stores/profileStore'
import { clearDemoFlag, setDemoFlag } from '../demoFlag'
import { CLOUD_CONSENT_VERSION } from './consent'
import { setCloudEndpointForTests } from './http'
import { clearUnlockedVault, loadUnlockedVault, saveUnlockedVault } from './keyStore'
import {
  DAILY_MS,
  HIDDEN_MIN_INTERVAL_MS,
  autoUploadDue,
  deleteAccount,
  deleteCloudData,
  downloadBackup,
  localUploadBlocker,
  markRestored,
  startCloudAutoBackup,
  uploadBackup,
  type SyncPushResult,
} from './cloudBackup'
import { createVault, decryptItem, encryptItem, itemId, type UnlockedVault } from './vaultCrypto'

const BASE = 'https://test-ref.supabase.co'
const USER = '11111111-1111-4111-8111-111111111111'

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

type Call = { url: string; init: RequestInit }
const calls: Call[] = []
let responder: (url: string, init: RequestInit) => Response | Promise<Response>
let unlocked: UnlockedVault

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const session = (): Session => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000, userId: USER, email: 'anna@example.com' })
const rpcCalls = (fn: string) => calls.filter((c) => c.url.includes(`/rest/v1/rpc/${fn}`))
const pushBody = (c: Call) => JSON.parse(String(c.init.body)) as { p_items: Array<{ id: string; baseRev: number; payload: string | null }> }

function addEntries(n: number) {
  const entries = Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    date: '2026-09-28',
    meal: 'frukost',
    kind: 'quick',
    name: `Post ${i}`,
    amount: 1,
    unit: 'portion',
    nutrients: { kcal: 100 },
    createdAt: 1,
  }))
  useDiaryStore.setState({ entries: { '2026-09-28': entries as never } })
}

beforeAll(async () => {
  await Promise.all([useProfileStore, useDiaryStore, useFoodStore, useBodyStore, useFastingStore, useLicenseStore].map((s) => s.persist.rehydrate()))
  unlocked = (await createVault('en lång lösenfras här', USER, 1_000)).unlocked
})

beforeEach(async () => {
  calls.length = 0
  setCloudEndpointForTests(BASE, 'sb_publishable_test')
  clearDemoFlag()
  useCloudStore.getState().reset()
  useCloudStore.getState().setSession(session())
  useCloudStore.getState().patch({ enabled: true, consentVersion: CLOUD_CONSENT_VERSION })
  useProfileStore.setState({ profile: PROFILE })
  useDiaryStore.setState({ entries: {} })
  await saveUnlockedVault(USER, unlocked)
  responder = () => json({ applied: [], conflicts: [] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return responder(url, init)
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearDemoFlag()
})

describe('localUploadBlocker', () => {
  it('stoppar exempeldata, ingen profil och butiker som inte lästs in', () => {
    expect(localUploadBlocker()).toBeNull()
    setDemoFlag()
    expect(localUploadBlocker()).toBe('exempeldata')
    clearDemoFlag()
    useProfileStore.setState({ profile: null })
    expect(localUploadBlocker()).toBe('ingen-profil')
    useProfileStore.setState({ profile: PROFILE })
    vi.spyOn(useDiaryStore.persist, 'hasHydrated').mockReturnValue(false)
    expect(localUploadBlocker()).toBe('inte-inlast')
  })
})

describe('autoUploadDue', () => {
  const now = 10 * DAILY_MS
  it('dagligen: när senaste kopian är minst ett dygn gammal', () => {
    expect(autoUploadDue('daglig', now, { lastUploadAt: null, lastAttemptAt: null })).toBe(true)
    expect(autoUploadDue('daglig', now, { lastUploadAt: now - DAILY_MS + 1, lastAttemptAt: null })).toBe(false)
    expect(autoUploadDue('daglig', now, { lastUploadAt: now - DAILY_MS, lastAttemptAt: null })).toBe(true)
  })
  it('när appen göms: högst var tionde minut', () => {
    expect(autoUploadDue('dold', now, { lastUploadAt: now, lastAttemptAt: now - HIDDEN_MIN_INTERVAL_MS + 1 })).toBe(false)
    expect(autoUploadDue('dold', now, { lastUploadAt: now, lastAttemptAt: now - HIDDEN_MIN_INTERVAL_MS })).toBe(true)
  })
})

describe('uploadBackup', () => {
  it('laddar aldrig upp exempeldata', async () => {
    setDemoFlag()
    await expect(uploadBackup()).resolves.toEqual({ status: 'hoppade-over', reason: 'exempeldata' })
    await expect(uploadBackup({ force: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'exempeldata' })
    expect(calls).toHaveLength(0)
  })

  it('laddar inte upp innan butikerna har lästs in', async () => {
    vi.spyOn(useFoodStore.persist, 'hasHydrated').mockReturnValue(false)
    await expect(uploadBackup()).resolves.toEqual({ status: 'hoppade-over', reason: 'inte-inlast' })
    expect(calls).toHaveLength(0)
  })

  it('kräver inloggning och upplåst valv', async () => {
    await clearUnlockedVault()
    await expect(uploadBackup()).resolves.toEqual({ status: 'hoppade-over', reason: 'last' })
    useCloudStore.getState().setSession(null)
    await expect(uploadBackup()).resolves.toEqual({ status: 'hoppade-over', reason: 'utloggad' })
    expect(calls).toHaveLength(0)
  })

  it('laddar inte upp utan samtycke till den gällande samtyckestexten', async () => {
    useCloudStore.getState().patch({ consentVersion: '2020-01-01' })
    await expect(uploadBackup()).resolves.toEqual({ status: 'hoppade-over', reason: 'samtycke' })
    await expect(uploadBackup({ force: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'samtycke' })
    useCloudStore.getState().patch({ consentVersion: null })
    await expect(uploadBackup({ auto: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'samtycke' })
    expect(calls).toHaveLength(0)
  })

  it('krypterar kopian och skickar den med sync_push och rätt baseRev', async () => {
    addEntries(3)
    const id = await itemId(unlocked, 'backup')
    responder = () => json({ applied: [{ id, rev: 1, seq: 1 }], conflicts: [] } satisfies SyncPushResult)
    const r = await uploadBackup()
    expect(r).toMatchObject({ status: 'klar', rev: 1 })
    const [call] = rpcCalls('sync_push')
    const item = pushBody(call).p_items[0]
    expect(item.id).toBe(id)
    expect(item.baseRev).toBe(0)
    expect(item.payload).toMatch(/^v1\./)
    expect(item.payload).not.toContain('Anna')
    const back = await decryptItem<{ format: string; data: { profile: { profile: Profile } } }>(unlocked, USER, id, item.payload as string)
    expect(back.format).toBe('lagom-backup')
    expect(back.data.profile.profile.name).toBe('Anna')

    const s = useCloudStore.getState()
    expect(s.backupRev).toBe(1)
    expect(s.lastSeq).toBe(1)
    expect(s.lastUploadAt).not.toBeNull()
    expect(s.lastUploadEntries).toBe(3)

    // Nästa uppladdning bygger på revision 1.
    responder = () => json({ applied: [{ id, rev: 2, seq: 2 }], conflicts: [] })
    await uploadBackup()
    expect(pushBody(rpcCalls('sync_push')[1]).p_items[0].baseRev).toBe(1)
  })

  it('automatiskt: hoppar över oförändrat innehåll och avstängd automatik', async () => {
    const id = await itemId(unlocked, 'backup')
    responder = () => json({ applied: [{ id, rev: 1, seq: 1 }], conflicts: [] })
    await uploadBackup({ auto: true })
    await expect(uploadBackup({ auto: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'oforandrad' })
    useCloudStore.getState().patch({ enabled: false })
    await expect(uploadBackup({ auto: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'avstangt' })
    expect(rpcCalls('sync_push')).toHaveLength(1)
  })

  it('automatiskt: en dagbok som krympt kraftigt laddas inte upp', async () => {
    useCloudStore.getState().patch({ lastUploadEntries: 40, backupRev: 3 })
    addEntries(5)
    await expect(uploadBackup({ auto: true })).resolves.toEqual({ status: 'hoppade-over', reason: 'krympt' })
    expect(calls).toHaveLength(0)
  })

  it('konflikt när en annan enhet har laddat upp – inget skrivs över', async () => {
    addEntries(2)
    const id = await itemId(unlocked, 'backup')
    const otherPayload = await encryptItem(unlocked, USER, id, { format: 'lagom-backup', data: { annan: true } })
    responder = (url) => {
      if (url.includes('/rpc/sync_push')) return json({ applied: [], conflicts: [{ id, rev: 4 }] })
      return json([{ item_id: id, rev: 4, seq: 9, payload: otherPayload, deleted: false, size: 100, updated_at: '2026-09-27T10:00:00Z' }])
    }
    await expect(uploadBackup()).resolves.toEqual({ status: 'konflikt', remoteRev: 4 })
    expect(useCloudStore.getState().backupRev).toBe(0)
  })

  it('force skriver över med molnets aktuella revision', async () => {
    const id = await itemId(unlocked, 'backup')
    responder = (url) => {
      if (url.includes('/rpc/sync_push')) return json({ applied: [{ id, rev: 5, seq: 10 }], conflicts: [] })
      return json([{ item_id: id, rev: 4, seq: 9, deleted: false, size: 100, updated_at: '2026-09-27T10:00:00Z' }])
    }
    await expect(uploadBackup({ force: true })).resolves.toMatchObject({ status: 'klar', rev: 5 })
    expect(pushBody(rpcCalls('sync_push')[0]).p_items[0].baseRev).toBe(4)
    expect(useCloudStore.getState().backupRev).toBe(5)
  })
})

describe('startCloudAutoBackup', () => {
  it('laddar upp när appen göms – högst var tionde minut – och bara när automatiken är på', async () => {
    const id = await itemId(unlocked, 'backup')
    responder = () => json({ applied: [{ id, rev: 1, seq: 1 }], conflicts: [] })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const stop = startCloudAutoBackup()
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(useCloudStore.getState().backupRev).toBe(1))
      expect(rpcCalls('sync_push')).toHaveLength(1)
      expect(useCloudStore.getState().lastAttemptAt).not.toBeNull()

      // Direkt igen: inom tio minuter – inget nytt försök.
      addEntries(1)
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 20))
      expect(rpcCalls('sync_push')).toHaveLength(1)

      // Avstängd automatik: inget försök alls.
      useCloudStore.getState().patch({ enabled: false, lastAttemptAt: null })
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 20))
      expect(rpcCalls('sync_push')).toHaveLength(1)
    } finally {
      stop()
    }
  })

  it('visar varför den automatiska kopian stannade när samtyckestexten har ändrats', async () => {
    useCloudStore.getState().patch({ consentVersion: '2020-01-01' })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const stop = startCloudAutoBackup()
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(useCloudStore.getState().lastError).toMatch(/Samtyckestexten för Lagom Moln har ändrats/))
      expect(rpcCalls('sync_push')).toHaveLength(0)
    } finally {
      stop()
    }
  })

  it('sparar ett fel från den automatiska kopian så att det kan visas', async () => {
    responder = () => {
      throw new TypeError('offline')
    }
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const stop = startCloudAutoBackup()
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(useCloudStore.getState().lastError).toMatch(/Kunde inte nå Lagom Moln/))
    } finally {
      stop()
    }
  })
})

describe('downloadBackup', () => {
  it('hämtar, dekrypterar och sammanfattar kopian', async () => {
    const id = await itemId(unlocked, 'backup')
    addEntries(4)
    const { createBackup } = await import('../backup')
    const payload = await encryptItem(unlocked, USER, id, createBackup())
    responder = () => json([{ item_id: id, rev: 7, seq: 12, payload, deleted: false, size: payload.length, updated_at: '2026-09-27T10:00:00Z' }])
    const copy = await downloadBackup()
    expect(calls[0].url).toContain(`item_id=eq.${id}`)
    expect(copy?.rev).toBe(7)
    expect(copy?.summary.entries).toBe(4)
    expect(copy?.backup.data.profile.profile?.name).toBe('Anna')
    markRestored({ rev: 7 })
    expect(useCloudStore.getState().backupRev).toBe(7)
  })

  it('ger null när det inte finns någon kopia', async () => {
    responder = () => json([])
    await expect(downloadBackup()).resolves.toBeNull()
  })
})

describe('radering', () => {
  it('deleteCloudData raderar posterna och stänger av automatiken', async () => {
    useCloudStore.getState().patch({ backupRev: 3, lastUploadAt: 5 })
    responder = () => new Response(null, { status: 204 })
    await deleteCloudData()
    expect(calls[0].init.method).toBe('DELETE')
    expect(calls[0].url).toBe(`${BASE}/rest/v1/sync_items?user_id=eq.${USER}`)
    expect(useCloudStore.getState()).toMatchObject({ enabled: false, backupRev: 0, lastUploadAt: null })
    expect(useCloudStore.getState().session).not.toBeNull()
  })

  it('deleteCloudData väntar in en pågående uppladdning – kopian skapas inte igen efter raderingen', async () => {
    const id = await itemId(unlocked, 'backup')
    let releasePush: () => void = () => undefined
    const pushGate = new Promise<void>((r) => {
      releasePush = r
    })
    responder = async (url) => {
      if (url.includes('/rpc/sync_push')) {
        await pushGate
        return json({ applied: [{ id, rev: 1, seq: 1 }], conflicts: [] })
      }
      return new Response(null, { status: 204 })
    }
    const upload = uploadBackup()
    await vi.waitFor(() => expect(rpcCalls('sync_push')).toHaveLength(1))
    const deletion = deleteCloudData()
    await new Promise((r) => setTimeout(r, 20))
    // Raderingen har inte skickats medan uppladdningen pågår.
    expect(calls.filter((c) => c.init.method === 'DELETE')).toHaveLength(0)
    releasePush()
    await upload
    await deletion
    const methods = calls.map((c) => (c.url.includes('/rpc/sync_push') ? 'push' : c.init.method))
    expect(methods).toEqual(['push', 'DELETE'])
    expect(useCloudStore.getState()).toMatchObject({ enabled: false, backupRev: 0, lastUploadAt: null })
  })

  it('deleteAccount anropar delete_my_account och glömmer session och nyckel', async () => {
    responder = () => new Response(null, { status: 204 })
    await deleteAccount()
    expect(rpcCalls('delete_my_account')).toHaveLength(1)
    expect(useCloudStore.getState().session).toBeNull()
    expect(await loadUnlockedVault(USER)).toBeNull()
  })
})
