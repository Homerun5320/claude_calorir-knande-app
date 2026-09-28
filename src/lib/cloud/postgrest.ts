/**
 * Lagom Moln – en liten PostgREST-klient (Supabase-databasens REST-gränssnitt) via fetch.
 *
 * Varje anrop skickar den inloggade användarens åtkomsttoken. Radskyddet (RLS) i databasen ser
 * till att användaren bara når sina egna rader. Ett 401-svar ger en förnyad token och ett nytt
 * försök – svarar servern 401 igen är användaren utloggad.
 *
 * Fel läses ur PostgREST-svarets `code`/`message` och blir `CloudError` med svensk text.
 */
import { useCloudStore } from '../../stores/cloudStore'
import { CloudError, cloudFetch, field, readJson, type CloudRequest } from './http'
import { getAccessToken } from './supabaseAuth'

const NAME = /^[a-z_][a-z0-9_]*$/

function checkName(name: string): string {
  if (!NAME.test(name)) throw new TypeError(`Ogiltigt namn: ${name}`)
  return name
}

/** Översätt ett PostgREST-fel till CloudError. */
function restError(res: Response, body: unknown): CloudError {
  const serverCode = field(body, 'code')
  const opts = { status: res.status, serverCode, detail: field(body, 'message', 'details', 'hint') }
  if (res.status === 429) return new CloudError('for-manga', opts)
  if (serverCode === 'P0002') return new CloudError('saknar-valv', opts)
  if (serverCode === '53400') return new CloudError('kvot', opts)
  if (res.status === 401 || serverCode === 'PGRST301' || serverCode === 'PGRST302' || serverCode === 'PGRST303') {
    return new CloudError('utloggad', opts)
  }
  if (serverCode === '42501' || res.status === 403) return new CloudError('nekad', opts)
  return new CloudError('server', opts)
}

/** Anropa PostgREST med token, ett nytt försök vid 401 och svenska fel. */
async function call(path: string, req: Omit<CloudRequest, 'token'>): Promise<unknown> {
  let token = await getAccessToken()
  let res = await cloudFetch(path, { ...req, token })
  if (res.status === 401) {
    // Åtkomsttoken kan ha slutat gälla tidigare än väntat (t.ex. fel klocka) – förnya och försök en gång till.
    token = await getAccessToken({ forceRefresh: true })
    res = await cloudFetch(path, { ...req, token })
    if (res.status === 401) {
      useCloudStore.getState().setSession(null)
      throw restError(res, await readJson(res))
    }
  }
  const body = await readJson(res)
  if (!res.ok) throw restError(res, body)
  return body
}

/** Läs rader: `select('sync_items', 'select=item_id,rev&item_id=eq.abc')`. */
export async function select<T>(table: string, query: string): Promise<T[]> {
  const body = await call(`/rest/v1/${checkName(table)}?${query}`, { method: 'GET' })
  return Array.isArray(body) ? (body as T[]) : []
}

/** Lägg till en rad och få tillbaka den som den sparades. */
export async function insert<T>(table: string, row: Record<string, unknown>): Promise<T[]> {
  const body = await call(`/rest/v1/${checkName(table)}`, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } })
  return Array.isArray(body) ? (body as T[]) : []
}

/** Ändra rader som matchar `query` (t.ex. 'user_id=eq.<id>'). */
export async function update<T>(table: string, query: string, patch: Record<string, unknown>): Promise<T[]> {
  if (!query) throw new TypeError('update kräver ett filter')
  const body = await call(`/rest/v1/${checkName(table)}?${query}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } })
  return Array.isArray(body) ? (body as T[]) : []
}

/** Anropa en databasfunktion: `rpc('sync_push', { p_items: [...] })`. */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return (await call(`/rest/v1/rpc/${checkName(fn)}`, { method: 'POST', body: args })) as T
}

/** Ta bort rader som matchar `query`. Ett filter krävs alltid. */
export async function del(table: string, query: string): Promise<void> {
  if (!query) throw new TypeError('del kräver ett filter')
  await call(`/rest/v1/${checkName(table)}?${query}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}
