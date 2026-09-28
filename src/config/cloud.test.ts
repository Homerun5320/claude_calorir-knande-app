/**
 * Flaggan för Lagom Moln: avstängd tills både adress och publik nyckel finns och ser rätt ut.
 */
import { describe, expect, it } from 'vitest'
import { CLOUD_ENABLED, SUPABASE_URL, parseCloudConfig } from './cloud'

const URL_OK = 'https://abcdefghijklmnop.supabase.co'
const KEY_OK = 'sb_publishable_AbC123_xyz-9'

describe('parseCloudConfig', () => {
  it('är avstängd när inget är satt', () => {
    expect(parseCloudConfig({})).toEqual({ url: '', publishableKey: '', enabled: false })
  })

  it('slås på med https-adress och publik nyckel', () => {
    expect(parseCloudConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK })).toEqual({
      url: URL_OK,
      publishableKey: KEY_OK,
      enabled: true,
    })
  })

  it('tar bort avslutande snedstreck och blanksteg', () => {
    const c = parseCloudConfig({ VITE_SUPABASE_URL: `  ${URL_OK}//  `, VITE_SUPABASE_PUBLISHABLE_KEY: ` ${KEY_OK} ` })
    expect(c.url).toBe(URL_OK)
    expect(c.publishableKey).toBe(KEY_OK)
    expect(c.enabled).toBe(true)
  })

  it('kräver https', () => {
    expect(parseCloudConfig({ VITE_SUPABASE_URL: 'http://abcdefghijklmnop.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }).enabled).toBe(false)
  })

  it('godtar inte en adress med sökväg eller frågedel', () => {
    expect(parseCloudConfig({ VITE_SUPABASE_URL: `${URL_OK}/rest/v1`, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }).enabled).toBe(false)
    expect(parseCloudConfig({ VITE_SUPABASE_URL: `${URL_OK}?x=1`, VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }).enabled).toBe(false)
  })

  it('godtar aldrig en hemlig nyckel eller en gammal JWT-nyckel', () => {
    expect(parseCloudConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc123' }).enabled).toBe(false)
    expect(parseCloudConfig({ VITE_SUPABASE_URL: URL_OK, VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x' }).enabled).toBe(false)
  })

  it('godtar http mot den lokala stacken bara i utvecklingsläget', () => {
    const env = { VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }
    expect(parseCloudConfig(env).enabled).toBe(false)
    expect(parseCloudConfig(env, { allowLocalHttp: true }).enabled).toBe(true)
    expect(parseCloudConfig({ ...env, VITE_SUPABASE_URL: 'http://example.com' }, { allowLocalHttp: true }).enabled).toBe(false)
  })

  it('kräver båda värdena', () => {
    expect(parseCloudConfig({ VITE_SUPABASE_URL: URL_OK }).enabled).toBe(false)
    expect(parseCloudConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: KEY_OK }).enabled).toBe(false)
  })
})

describe('standardläget', () => {
  it('är avstängt i testerna (inga VITE_SUPABASE_*-variabler)', () => {
    expect(CLOUD_ENABLED).toBe(false)
    expect(SUPABASE_URL).toBe('')
  })
})
