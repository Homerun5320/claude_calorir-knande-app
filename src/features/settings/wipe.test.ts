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
