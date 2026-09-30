/**
 * public/sw-overgang.js: övergången från den gamla service workern (autoUpdate, före 1.0) till
 * uppdateringsfrågan. En ny version tar över direkt bara när den aktiva är gammal (ingen markering);
 * därefter väntar nästa version på "Uppdatera".
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Node-moduler laddas dynamiskt – appens tsconfig har inga typer för Node.
type Loose = Record<string, (...args: never[]) => unknown>
const nodeModule = (name: string): Promise<Loose> => import(/* @vite-ignore */ name)

let code = ''
beforeAll(async () => {
  const { readFile } = await nodeModule('node:fs/promises')
  const { join } = await nodeModule('node:path')
  const { cwd } = await nodeModule('node:process')
  code = (await (readFile as (p: string, e: string) => Promise<string>)((join as (...p: string[]) => string)((cwd as () => string)(), 'public/sw-overgang.js'), 'utf8'))
})

type Listener = (event: { waitUntil: (p: Promise<unknown>) => void }) => void

function load(opts: { active: boolean; marked: boolean }) {
  const listeners = new Map<string, Listener>()
  const store = new Map<string, unknown>(opts.marked ? [['./__lagom-uppdateringsfraga', '1']] : [])
  const self = {
    registration: { active: opts.active ? {} : null },
    skipWaiting: vi.fn(async () => {}),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
  }
  const caches = {
    open: async () => ({
      match: async (key: string) => store.get(key),
      put: async (key: string, value: unknown) => void store.set(key, value),
    }),
  }
  new Function('self', 'caches', 'Response', code)(self, caches, class {})
  const fire = async (type: string) => {
    const pending: Promise<unknown>[] = []
    listeners.get(type)?.({ waitUntil: (p) => pending.push(p) })
    await Promise.all(pending)
  }
  return { self, store, fire }
}

describe('service workerns övergång till uppdateringsfrågan', () => {
  it('en gammal version (utan markering) ersätts direkt', async () => {
    const sw = load({ active: true, marked: false })
    await sw.fire('install')
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
    await sw.fire('activate')
    expect(sw.store.has('./__lagom-uppdateringsfraga')).toBe(true)
  })

  it('efter övergången väntar nästa version på "Uppdatera"', async () => {
    const sw = load({ active: true, marked: true })
    await sw.fire('install')
    expect(sw.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('den första installationen tar över direkt', async () => {
    const sw = load({ active: false, marked: false })
    await sw.fire('install')
    expect(sw.self.skipWaiting).toHaveBeenCalledTimes(1)
  })
})
