/**
 * Inloggning och PostgREST mot en fejkad fetch: rätt headers, förnyelse bara en gång vid
 * samtidiga anrop, 401 → utloggad och svenska felmeddelanden.
 */
import { get, set } from 'idb-keyval'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLOUD_STORE_KEY, useCloudStore, type Session } from '../../stores/cloudStore'
import { CloudError, setCloudEndpointForTests } from './http'
import { loadUnlockedVault, saveUnlockedVault } from './keyStore'
import { del, rpc, select } from './postgrest'
import { getAccessToken, getUser, isValidEmail, normalizeCode, requestCode, signOut, verifyCode } from './supabaseAuth'
import { createVault } from './vaultCrypto'

const BASE = 'https://test-ref.supabase.co'
const KEY = 'sb_publishable_testnyckel'
const USER = '11111111-1111-4111-8111-111111111111'

type Call = { url: string; init: RequestInit }
const calls: Call[] = []
let responder: (url: string, init: RequestInit) => Response | Promise<Response>

function json(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function headersOf(c: Call): Record<string, string> {
  return c.init.headers as Record<string, string>
}

function bodyOf(c: Call): unknown {
  return JSON.parse(String(c.init.body))
}

function session(over: Partial<Session> = {}): Session {
  return { accessToken: 'at-1', refreshToken: 'rt-1', expiresAt: Date.now() + 3_600_000, userId: USER, email: 'anna@example.com', ...over }
}

const tokenBody = (n: number) => ({
  access_token: `at-${n}`,
  refresh_token: `rt-${n}`,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: USER, email: 'anna@example.com' },
})

beforeEach(() => {
  calls.length = 0
  setCloudEndpointForTests(BASE, KEY)
  useCloudStore.getState().reset()
  responder = () => json({})
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
})

describe('hjälpare', () => {
  it('kontrollerar e-post och normaliserar koden', () => {
    expect(isValidEmail('anna@example.com')).toBe(true)
    expect(isValidEmail('anna@example')).toBe(false)
    expect(isValidEmail('anna example.com')).toBe(false)
    expect(normalizeCode(' 1234 5678 ')).toBe('12345678')
    expect(normalizeCode('1234-5678')).toBe('12345678')
  })
})

describe('requestCode och verifyCode', () => {
  it('begär en kod med publik nyckel men utan Bearer', async () => {
    await requestCode(' anna@example.com ')
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${BASE}/auth/v1/otp`)
    expect(calls[0].init.method).toBe('POST')
    expect(headersOf(calls[0]).apikey).toBe(KEY)
    expect(headersOf(calls[0]).Authorization).toBeUndefined()
    expect(bodyOf(calls[0])).toEqual({ email: 'anna@example.com', create_user: true })
  })

  it('loggar in med koden och sparar sessionen', async () => {
    responder = () => json(tokenBody(1))
    const s = await verifyCode('anna@example.com', '1234 5678')
    expect(calls[0].url).toBe(`${BASE}/auth/v1/verify`)
    expect(bodyOf(calls[0])).toEqual({ type: 'email', email: 'anna@example.com', token: '12345678' })
    expect(s).toMatchObject({ accessToken: 'at-1', refreshToken: 'rt-1', userId: USER, email: 'anna@example.com' })
    expect(s.expiresAt).toBeGreaterThan(Date.now() + 3_500_000)
    expect(useCloudStore.getState().session?.accessToken).toBe('at-1')
  })

  it('fel eller utgången kod ger fel-kod med svensk text', async () => {
    responder = () => json({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
    const err = await verifyCode('anna@example.com', '00000000').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CloudError)
    expect((err as CloudError).code).toBe('fel-kod')
    expect((err as CloudError).message).toMatch(/Koden stämmer inte/)
    expect((err as CloudError).serverCode).toBe('otp_expired')
    expect(useCloudStore.getState().session).toBeNull()
  })

  it('för många försök ger for-manga', async () => {
    responder = () => json({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'rate limit' }, 429)
    const err = (await requestCode('anna@example.com').catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('for-manga')
    expect(err.message).toMatch(/För många försök/)
  })

  it('ingen anslutning ger natverk', async () => {
    responder = () => {
      throw new TypeError('Failed to fetch')
    }
    const err = (await requestCode('anna@example.com').catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('natverk')
    expect(err.message).toMatch(/Kunde inte nå Lagom Moln/)
  })

  it('serverfel ger server', async () => {
    responder = () => json({ msg: 'boom' }, 500)
    const err = (await requestCode('anna@example.com').catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('server')
    expect(err.message).toMatch(/Något gick fel/)
  })
})

describe('getAccessToken', () => {
  it('kastar utloggad utan session', async () => {
    const err = (await getAccessToken().catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('utloggad')
    expect(calls).toHaveLength(0)
  })

  it('använder sparad token utan anrop när den är giltig', async () => {
    useCloudStore.getState().setSession(session())
    expect(await getAccessToken()).toBe('at-1')
    expect(calls).toHaveLength(0)
  })

  it('förnyar 60 s före utgång – bara en gång vid samtidiga anrop', async () => {
    useCloudStore.getState().setSession(session({ expiresAt: Date.now() + 30_000 }))
    responder = async () => {
      await new Promise((r) => setTimeout(r, 5))
      return json(tokenBody(2))
    }
    const tokens = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()])
    expect(tokens).toEqual(['at-2', 'at-2', 'at-2'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`${BASE}/auth/v1/token?grant_type=refresh_token`)
    expect(bodyOf(calls[0])).toEqual({ refresh_token: 'rt-1' })
    expect(headersOf(calls[0]).apikey).toBe(KEY)
    expect(useCloudStore.getState().session?.refreshToken).toBe('rt-2')
  })

  it('serialiseras med navigator.locks och använder en session som en annan flik redan har förnyat', async () => {
    const request = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
    try {
      useCloudStore.getState().setSession(session({ expiresAt: Date.now() - 1000 }))
      const newer = session({ accessToken: 'at-flik', refreshToken: 'rt-flik', expiresAt: Date.now() + 3_600_000 })
      await set(CLOUD_STORE_KEY, JSON.stringify({ state: { session: newer }, version: 1 }))
      expect(await getAccessToken()).toBe('at-flik')
      expect(request).toHaveBeenCalledWith('lagom-auth', expect.any(Function))
      expect(calls).toHaveLength(0)
      expect(useCloudStore.getState().session?.refreshToken).toBe('rt-flik')
    } finally {
      delete (navigator as { locks?: unknown }).locks
    }
  })

  it('läser in en inloggning som en annan flik har förnyat när fliken visas igen', async () => {
    await useCloudStore.persist.rehydrate()
    useCloudStore.getState().setSession(session())
    await vi.waitFor(async () => expect(await get(CLOUD_STORE_KEY)).toContain('rt-1'))
    // En annan flik sparar en förnyad inloggning (ny data och ny stämpel i localStorage).
    const newer = session({ accessToken: 'at-flik', refreshToken: 'rt-flik', expiresAt: Date.now() + 3_600_000 })
    await set(CLOUD_STORE_KEY, JSON.stringify({ state: { ...useCloudStore.getState(), session: newer }, version: 1 }))
    localStorage.setItem(`lagom-sparad:${CLOUD_STORE_KEY}`, 'annan-flik')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    try {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.waitFor(() => expect(useCloudStore.getState().session?.refreshToken).toBe('rt-flik'))
    } finally {
      visibility.mockRestore()
    }
  })

  it('en inläsning ersätter inte en inloggning som fliken just har förnyat', async () => {
    await useCloudStore.persist.rehydrate()
    const older = session({ accessToken: 'at-gammal', refreshToken: 'rt-gammal', expiresAt: Date.now() + 1_000_000 })
    await set(CLOUD_STORE_KEY, JSON.stringify({ state: { session: older, enabled: true }, version: 1 }))
    useCloudStore.getState().setSession(session({ accessToken: 'at-ny', refreshToken: 'rt-ny', expiresAt: Date.now() + 3_600_000 }))
    await set(CLOUD_STORE_KEY, JSON.stringify({ state: { session: older, enabled: true }, version: 1 }))
    await useCloudStore.persist.rehydrate()
    expect(useCloudStore.getState().session?.refreshToken).toBe('rt-ny')
    expect(useCloudStore.getState().enabled).toBe(true)

    // Utloggning i en annan flik gäller.
    await set(CLOUD_STORE_KEY, JSON.stringify({ state: { session: null, enabled: false }, version: 1 }))
    await useCloudStore.persist.rehydrate()
    expect(useCloudStore.getState().session).toBeNull()
  })

  it('en förnyelsetoken som inte gäller ger utloggad och glömmer sessionen', async () => {
    useCloudStore.getState().setSession(session({ expiresAt: Date.now() - 1000 }))
    responder = () => json({ error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' }, 400)
    const err = (await getAccessToken().catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('utloggad')
    expect(err.message).toMatch(/utloggad/)
    expect(useCloudStore.getState().session).toBeNull()
  })

  it('ett nätverksfel vid förnyelse loggar inte ut', async () => {
    useCloudStore.getState().setSession(session({ expiresAt: Date.now() - 1000 }))
    responder = () => {
      throw new TypeError('offline')
    }
    const err = (await getAccessToken().catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('natverk')
    expect(useCloudStore.getState().session).not.toBeNull()
  })
})

describe('PostgREST', () => {
  it('skickar publik nyckel och användarens token', async () => {
    useCloudStore.getState().setSession(session())
    responder = () => json([{ item_id: 'x' }])
    const rows = await select<{ item_id: string }>('sync_items', 'select=item_id&limit=1')
    expect(rows).toEqual([{ item_id: 'x' }])
    expect(calls[0].url).toBe(`${BASE}/rest/v1/sync_items?select=item_id&limit=1`)
    expect(calls[0].init.method).toBe('GET')
    expect(headersOf(calls[0])).toMatchObject({ apikey: KEY, Authorization: 'Bearer at-1' })
  })

  it('anropar funktioner med rpc och läser tomt svar', async () => {
    useCloudStore.getState().setSession(session())
    responder = () => new Response(null, { status: 204 })
    await expect(rpc('delete_my_account')).resolves.toBeNull()
    expect(calls[0].url).toBe(`${BASE}/rest/v1/rpc/delete_my_account`)
    expect(calls[0].init.method).toBe('POST')
    expect(bodyOf(calls[0])).toEqual({})
  })

  it('401 → förnya och försök igen, 401 igen → utloggad', async () => {
    useCloudStore.getState().setSession(session())
    responder = (url) => (url.includes('/auth/v1/token') ? json(tokenBody(3)) : json({ code: 'PGRST303', message: 'JWT expired' }, 401))
    const err = (await select('vaults', 'select=user_id').catch((e: unknown) => e)) as CloudError
    expect(err.code).toBe('utloggad')
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/rest/v1/vaults?select=user_id`, `${BASE}/auth/v1/token?grant_type=refresh_token`, `${BASE}/rest/v1/vaults?select=user_id`])
    expect(headersOf(calls[2]).Authorization).toBe('Bearer at-3')
    expect(useCloudStore.getState().session).toBeNull()
  })

  it('401 följt av lyckat försök efter förnyelse', async () => {
    useCloudStore.getState().setSession(session())
    let first = true
    responder = (url) => {
      if (url.includes('/auth/v1/token')) return json(tokenBody(4))
      if (first) {
        first = false
        return json({ code: 'PGRST303', message: 'JWT expired' }, 401)
      }
      return json([])
    }
    await expect(select('vaults', 'select=user_id')).resolves.toEqual([])
    expect(useCloudStore.getState().session?.accessToken).toBe('at-4')
  })

  it('läser felkoden ur svaret: P0002, 53400 och 42501', async () => {
    useCloudStore.getState().setSession(session())
    const cases: Array<[string, number, CloudError['code'], RegExp]> = [
      ['P0002', 400, 'saknar-valv', /inte klart/],
      ['53400', 400, 'kvot', /större än/],
      ['42501', 403, 'nekad', /tillät inte/],
      ['XX000', 500, 'server', /Något gick fel/],
    ]
    for (const [code, status, expected, text] of cases) {
      responder = () => json({ code, message: 'engelsk text', details: null, hint: null }, status)
      const err = (await rpc('sync_push', { p_items: [] }).catch((e: unknown) => e)) as CloudError
      expect(err.code).toBe(expected)
      expect(err.message).toMatch(text)
      expect(err.serverCode).toBe(code)
      expect(err.detail).toBe('engelsk text')
    }
  })

  it('del kräver ett filter och skickar DELETE', async () => {
    useCloudStore.getState().setSession(session())
    responder = () => new Response(null, { status: 204 })
    await expect(del('sync_items', '')).rejects.toThrow(TypeError)
    await del('sync_items', `user_id=eq.${USER}`)
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('DELETE')
  })

  it('godtar inte konstiga tabellnamn', async () => {
    useCloudStore.getState().setSession(session())
    await expect(select('vaults?x=1', '')).rejects.toThrow(TypeError)
  })
})

describe('getUser och signOut', () => {
  it('hämtar användaren', async () => {
    useCloudStore.getState().setSession(session())
    responder = () => json({ id: USER, email: 'anna@example.com' })
    await expect(getUser()).resolves.toEqual({ id: USER, email: 'anna@example.com' })
    expect(calls[0].url).toBe(`${BASE}/auth/v1/user`)
  })

  it('loggar ut lokalt även när servern inte svarar – session och nyckel glöms', async () => {
    useCloudStore.getState().setSession(session())
    useCloudStore.getState().patch({ enabled: true, lastUploadAt: 1 })
    const { unlocked } = await createVault('en lång lösenfras här', USER, 1_000)
    await saveUnlockedVault(USER, unlocked)
    responder = () => {
      throw new TypeError('offline')
    }
    await signOut()
    expect(calls[0].url).toBe(`${BASE}/auth/v1/logout?scope=local`)
    expect(headersOf(calls[0]).Authorization).toBe('Bearer at-1')
    expect(useCloudStore.getState().session).toBeNull()
    expect(useCloudStore.getState().enabled).toBe(false)
    expect(await loadUnlockedVault(USER)).toBeNull()
  })
})
