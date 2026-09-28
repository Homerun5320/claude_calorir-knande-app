/**
 * Filerna runt Lagom Moln som inte är TypeScript: sidan om kontoradering, SQL-migreringen,
 * databastesterna och konsekvensbedömningen. (Själva databastesterna körs med Supabase CLI –
 * se docs/BACKEND.md – här kontrolleras att filerna hänger ihop.)
 */
import { describe, expect, it } from 'vitest'
import { fillSellerPlaceholders, missingSellerPlaceholders } from '../../features/legal/staticSeller'
import { CLOUD_CONSENT_TEXT, CLOUD_CONSENT_VERSION } from './consent'

interface NodeFs {
  readFile(path: string, encoding: 'utf8'): Promise<string>
}
interface NodeUrl {
  fileURLToPath(url: string): string
}
interface NodePath {
  dirname(p: string): string
  resolve(...parts: string[]): string
}

// Node-moduler laddas dynamiskt (appens tsconfig har inte Node-typerna).
const nodeModule = <T>(name: string): Promise<T> => import(/* @vite-ignore */ name) as Promise<T>

/** Läs en fil i repot (sökväg relativt roten). */
async function readRepoFile(path: string): Promise<string> {
  const { readFile } = await nodeModule<NodeFs>('node:fs/promises')
  const { fileURLToPath } = await nodeModule<NodeUrl>('node:url')
  const { dirname, resolve } = await nodeModule<NodePath>('node:path')
  return readFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../..', path), 'utf8')
}

describe('public/radera-konto/index.html', () => {
  it('är fristående, på svenska och utan JavaScript', async () => {
    const html = await readRepoFile('public/radera-konto/index.html')
    expect(html).toMatch(/^<!doctype html>/i)
    expect(html).toContain('<html lang="sv">')
    expect(html).toContain('name="viewport"')
    expect(html).not.toMatch(/<script\b/i)
    expect(html).toMatch(/prefers-color-scheme: dark/)
  })

  it('har appnamn, utvecklare, stegen i appen och en väg utan appen', async () => {
    const html = await readRepoFile('public/radera-konto/index.html')
    expect(html).toContain('<title>Radera konto – Lagom</title>')
    expect(html).toContain('Inställningar → Lagom Moln')
    expect(html).toContain('Radera konto och molndata')
    expect(html).toContain('>Har du inte längre appen?</h2>')
    expect(html).not.toMatch(/lorem|ipsum|TODO|FIXME/i)
    // Utvecklare och supportadress fylls i när sidan byggs.
    expect(missingSellerPlaceholders(html)).toEqual(['[Företagsnamn]', '[E-post]'])
    const filled = fillSellerPlaceholders(html, { VITE_SELLER_NAME: 'Anna Andersson', VITE_SUPPORT_EMAIL: 'hej@lagom.se' })
    expect(missingSellerPlaceholders(filled)).toEqual([])
    expect(filled).toContain('Utvecklare: Anna Andersson (enskild firma)')
    expect(filled).toContain('href="mailto:hej@lagom.se?subject=')
  })

  it('länkar aldrig till köp', async () => {
    const html = await readRepoFile('public/radera-konto/index.html')
    expect(html).not.toMatch(/checkout|\/premium|köp licens/i)
  })
})

describe('supabase/migrations', () => {
  it('slår på RLS, stänger ute anon och låser funktionernas search_path', async () => {
    const sql = await readRepoFile('supabase/migrations/20261001120000_lagom_moln.sql')
    for (const table of ['vaults', 'sync_items', 'entitlements', 'webhook_events']) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`)
      expect(sql).toMatch(new RegExp(`create table public\\.${table} \\(`))
    }
    expect(sql).toContain('revoke all on table public.vaults, public.sync_items, public.entitlements, public.webhook_events from anon, authenticated;')
    expect(sql).not.toMatch(/grant [^;]* to [^;]*\banon\b/i)
    expect(sql.match(/security definer\s+set search_path = ''/g)).toHaveLength(2)
    expect(sql).toContain('revoke execute on function public.sync_push(jsonb) from public, anon;')
    expect(sql).toContain('revoke execute on function public.delete_my_account() from public, anon;')
    // Kvoten och felkoderna som appen känner igen (src/lib/cloud/postgrest.ts).
    expect(sql).toContain('50000000')
    expect(sql).toContain('4000000')
    expect(sql).toContain("errcode = 'P0002'")
    expect(sql).toContain("errcode = '53400'")
  })

  it('databastesternas plan stämmer med antalet tester', async () => {
    const sql = await readRepoFile('supabase/tests/lagom_moln.test.sql')
    const planned = Number(/select plan\((\d+)\);/.exec(sql)?.[1])
    const assertions = sql.match(/^select (?:ok|is|isnt|throws_ok|lives_ok|results_eq|is_empty)\(/gm) ?? []
    expect(assertions.length).toBe(planned)
    expect(sql).toMatch(/^begin;/m)
    expect(sql).toMatch(/^rollback;/m)
  })
})

describe('docs/DPIA-SYNK.md', () => {
  it('innehåller samtyckestexten och versionen ordagrant', async () => {
    const md = await readRepoFile('docs/DPIA-SYNK.md')
    expect(md).toContain(CLOUD_CONSENT_TEXT)
    expect(md).toContain(`\`${CLOUD_CONSENT_VERSION}\``)
  })
})
