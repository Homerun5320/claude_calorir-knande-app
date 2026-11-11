/**
 * "Radera all data" loggar också ut från Lagom Moln på enheten (när molnet är påslaget), så att
 * nästa person som använder enheten inte kommer åt den förra ägarens molnkopia. Den tar också
 * kopian på telefonen, framstegsbilderna, korgen och webbens bildcache – även när exempeldata är
 * påslaget. Bara den som uttryckligen rensar exempeldata (`keepOwnCopies`) lämnar kopian och
 * bilderna.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Food } from '../../types'

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

  it('raderar bilderna även när exempeldata är påslaget – "Radera all data" ber om allt', async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos }))
    const { setDemoFlag } = await import('../../lib/demoFlag')
    setDemoFlag()
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset()
    expect(deleteAllProgressPhotos).toHaveBeenCalledTimes(1)
  })

  it('låter bilderna ligga kvar när anroparen bara rensar exempeldata (keepOwnCopies)', async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos }))
    const { setDemoFlag } = await import('../../lib/demoFlag')
    setDemoFlag()
    const { wipeAndReset } = await import('./wipe')
    await wipeAndReset({ keepOwnCopies: true })
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

describe('wipeAndReset och kopian på telefonen', () => {
  const deleteMirror = vi.fn(async () => {})
  const clearExportCache = vi.fn(async () => {})
  const clearWidget = vi.fn(async () => {})
  const resetHealth = vi.fn()

  const load = async () => {
    vi.resetModules()
    vi.doMock('../../native', () => ({
      isNative: () => true,
      loadNative: async (name: string) =>
        ({ mirror: { deleteMirror }, files: { clearExportCache }, widget: { clearWidget }, health: { resetHealth } })[name] ?? null,
    }))
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos: async () => true }))
    return import('./wipe')
  }

  afterEach(() => {
    vi.doUnmock('../../native')
    vi.doUnmock('../../lib/progressPhotos')
    for (const fn of [deleteMirror, clearExportCache, clearWidget, resetHealth]) fn.mockClear()
  })

  it('"Radera all data" tar bort kopian även när exempeldata är påslaget', async () => {
    const { wipeAndReset } = await load()
    const { setDemoFlag } = await import('../../lib/demoFlag')
    setDemoFlag()
    await wipeAndReset()
    expect(deleteMirror).toHaveBeenCalledTimes(1)
    expect(clearExportCache).toHaveBeenCalledTimes(1)
    expect(clearWidget).toHaveBeenCalledTimes(1)
  })

  it('"Radera all data" tar bort kopian även utan exempeldata', async () => {
    const { wipeAndReset } = await load()
    await wipeAndReset({ removeLicense: true })
    expect(deleteMirror).toHaveBeenCalledTimes(1)
  })

  it('bara exempeldata rensas (keepOwnCopies): kopian ligger kvar, widgeten töms ändå', async () => {
    const { wipeAndReset } = await load()
    const { setDemoFlag } = await import('../../lib/demoFlag')
    setDemoFlag()
    await wipeAndReset({ keepOwnCopies: true })
    expect(deleteMirror).not.toHaveBeenCalled()
    expect(clearWidget).toHaveBeenCalledTimes(1)
  })
})

describe('wipeAndReset och korgen', () => {
  const banan: Food = {
    id: 'lagom:test-banan',
    name: 'Banan',
    source: 'lagom',
    category: 'frukt',
    nutrients: { kcal: 90, protein: 1, carbs: 20, fat: 0.3 },
    portions: [],
  }

  const load = async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos: async () => true }))
    const { useBasketStore } = await import('../add/basketStore')
    const { wipeAndReset } = await import('./wipe')
    return { useBasketStore, wipeAndReset }
  }

  afterEach(() => {
    vi.doUnmock('../../lib/progressPhotos')
    sessionStorage.clear()
  })

  it('tömmer korgen i minnet och i sessionStorage, så att den inte följer med till nästa profil', async () => {
    const { useBasketStore, wipeAndReset } = await load()
    useBasketStore.getState().add(banan, 100, 'g', 'search', 'Uppskattad mängd')
    expect(useBasketStore.getState().items).toHaveLength(1)
    expect(sessionStorage.getItem('lagom-korg')).toContain('Banan')
    await wipeAndReset()
    expect(useBasketStore.getState().items).toEqual([])
    expect(sessionStorage.getItem('lagom-korg')).toBeNull()
    // Korgen går att använda igen i den nya profilen.
    useBasketStore.getState().add(banan, 50, 'g')
    expect(useBasketStore.getState().items).toHaveLength(1)
  })

  it('tömmer korgen även när bara exempeldata rensas', async () => {
    const { useBasketStore, wipeAndReset } = await load()
    useBasketStore.getState().add(banan, 100, 'g')
    await wipeAndReset({ keepOwnCopies: true })
    expect(useBasketStore.getState().items).toEqual([])
  })
})

describe('wipeAndReset och webbens bildcache', () => {
  const deleteCache = vi.fn(async () => true)

  const load = async () => {
    vi.resetModules()
    vi.doMock('../../lib/progressPhotos', () => ({ deleteAllProgressPhotos: async () => true }))
    return import('./wipe')
  }

  afterEach(() => {
    vi.doUnmock('../../lib/progressPhotos')
    vi.unstubAllGlobals()
    deleteCache.mockClear()
  })

  it('tar bort produktbilderna (streckkoder i adresserna) ur service workerns cache', async () => {
    vi.stubGlobal('caches', { delete: deleteCache })
    const { wipeAndReset } = await load()
    await wipeAndReset()
    expect(deleteCache).toHaveBeenCalledTimes(1)
    expect(deleteCache).toHaveBeenCalledWith('off-images')
  })

  it('rör inte cachen när bara exempeldata rensas', async () => {
    vi.stubGlobal('caches', { delete: deleteCache })
    const { wipeAndReset } = await load()
    await wipeAndReset({ keepOwnCopies: true })
    expect(deleteCache).not.toHaveBeenCalled()
  })

  it('kastar aldrig: utan Cache API eller när cachen inte går att radera', async () => {
    const { wipeAndReset } = await load()
    expect(typeof caches).toBe('undefined')
    await expect(wipeAndReset()).resolves.toBeUndefined()
    vi.stubGlobal('caches', {
      delete: async () => {
        throw new Error('blockerad')
      },
    })
    await expect(wipeAndReset()).resolves.toBeUndefined()
  })
})
