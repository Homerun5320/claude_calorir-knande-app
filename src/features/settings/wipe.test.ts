/**
 * "Radera all data" loggar också ut från Lagom Moln på enheten (när molnet är påslaget), så att
 * nästa person som använder enheten inte kommer åt den förra ägarens molnkopia.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn(async () => {})
vi.mock('../../lib/cloud/supabaseAuth', () => ({ signOut }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  signOut.mockClear()
})

describe('wipeAndReset och Lagom Moln', () => {
  it('med Lagom Moln påslaget: loggar ut på enheten', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnop.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_abc123')
    vi.resetModules()
    const { CLOUD_ENABLED } = await import('../../config/cloud')
    expect(CLOUD_ENABLED).toBe(true)
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset()
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('med Lagom Moln avstängt: ingen molnkod laddas', async () => {
    vi.resetModules()
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset()
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('wipeAndReset och framstegsbilderna', () => {
  const deleteAllProgressPhotos = vi.fn(async () => true)

  afterEach(() => {
    vi.doUnmock('../../lib/progressPhotos')
    deleteAllProgressPhotos.mockClear()
  })

  it('raderar framstegsbilderna, som ligger utanför STORE_KEYS', async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos }))
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset()
    expect(deleteAllProgressPhotos).toHaveBeenCalledTimes(1)
  })

  it('låter bilderna ligga kvar när det bara var exempeldata som raderades', async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos }))
    const { setDemoFlag } = await import('../../lib/demoFlag')
    setDemoFlag()
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset()
    expect(deleteAllProgressPhotos).not.toHaveBeenCalled()
  })

  it('kastar aldrig, även om bilderna inte går att radera', async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({
      deleteAllProgressPhotos: async () => {
        throw new Error('trasig databas')
      },
    }))
    const { wipeAndReset } = await import('./wipe')
    await expect(wipeAndReset()).resolves.toBeUndefined()
  })
})
