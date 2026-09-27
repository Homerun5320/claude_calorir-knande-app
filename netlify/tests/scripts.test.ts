// @vitest-environment node
/**
 * Skripten för nycklar och manuella licenser körs som riktiga kommandon och deras nycklar
 * kontrolleras med appens egen verifiering (src/lib/license.ts).
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { decodeLicense, verifyLicense } from '../../src/lib/license.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))

function run(script: string, args: string[], env: Record<string, string> = {}) {
  const res = spawnSync(process.execPath, [`${root}scripts/${script}`, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
    timeout: 20_000,
  })
  return { code: res.status, out: res.stdout, err: res.stderr }
}

let keys: { publicKey: string; privateKey: string }

beforeAll(() => {
  const res = run('generate-license-keys.mjs', ['--json'])
  expect(res.code).toBe(0)
  keys = JSON.parse(res.out)
})

describe('scripts/generate-license-keys.mjs', () => {
  it('skapar ett P-256-nyckelpar i base64 (SPKI + PKCS#8)', () => {
    expect(keys.publicKey).toMatch(/^MFkw[A-Za-z0-9+/]+=*$/)
    expect(keys.privateKey).toMatch(/^MI[A-Za-z0-9+/]+=*$/)
  })

  it('skriver ut båda miljövariablerna med svenska instruktioner', () => {
    const res = run('generate-license-keys.mjs', [])
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/^VITE_LICENSE_PUBLIC_KEY=MFkw/m)
    expect(res.out).toMatch(/^LICENSE_PRIVATE_KEY=MI/m)
    expect(res.out).toContain('Checka aldrig in den i git')
  })
})

describe('scripts/issue-license.mjs', () => {
  it('livstidslicens som appen godkänner i skarpt läge', async () => {
    const res = run('issue-license.mjs', ['--plan', 'livstid', '--id', 'arende_123', '--json'], {
      LICENSE_PRIVATE_KEY: keys.privateKey,
      VITE_LICENSE_PUBLIC_KEY: keys.publicKey,
    })
    expect(res.code, res.err).toBe(0)
    const out = JSON.parse(res.out) as { licenseKey: string; publicKey: string; verified: boolean }
    expect(out.verified).toBe(true)
    expect(out.publicKey).toBe(keys.publicKey)
    const check = await verifyLicense(out.licenseKey, { publicKey: keys.publicKey, mode: 'live' })
    expect(check.ok).toBe(true)
    expect(decodeLicense(out.licenseKey)).toMatchObject({ v: 1, id: 'arende_123', plan: 'livstid' })
    expect(decodeLicense(out.licenseKey)?.exp).toBeUndefined()
  })

  it('årslicens med eget startdatum och längd', async () => {
    const res = run('issue-license.mjs', ['--plan=ar', '--from', '2026-03-01', '--days', '30', '--json'], { LICENSE_PRIVATE_KEY: keys.privateKey })
    expect(res.code, res.err).toBe(0)
    const { licenseKey, verified } = JSON.parse(res.out) as { licenseKey: string; verified: boolean | null }
    expect(verified).toBeNull()
    const p = decodeLicense(licenseKey)
    expect(p?.plan).toBe('ar')
    expect((p!.exp! - p!.iat) / 86_400).toBe(30)
    expect(new Date(p!.iat * 1000).getDate()).toBe(1)
    // Utgången nu, men giltig mitt i perioden.
    expect(await verifyLicense(licenseKey, { publicKey: keys.publicKey, mode: 'live', now: (p!.iat + 86_400) * 1000 })).toMatchObject({ ok: true })
  })

  it('standardlängd för årslicens är 365 dagar och läsbar text utan --json', () => {
    const res = run('issue-license.mjs', ['--plan', 'ar'], { LICENSE_PRIVATE_KEY: keys.privateKey })
    expect(res.code, res.err).toBe(0)
    expect(res.out).toContain('Plan:         Årslicens')
    const key = /^(LAGOM1\.\S+)$/m.exec(res.out)?.[1] ?? ''
    const p = decodeLicense(key)
    expect(p && p.exp! - p.iat).toBe(365 * 86_400)
  })

  it('stoppar om nyckelparet inte hör ihop med appens publika nyckel', () => {
    const other = JSON.parse(run('generate-license-keys.mjs', ['--json']).out) as { publicKey: string }
    const res = run('issue-license.mjs', ['--plan', 'livstid'], { LICENSE_PRIVATE_KEY: keys.privateKey, VITE_LICENSE_PUBLIC_KEY: other.publicKey })
    expect(res.code).toBe(1)
    expect(res.err).toContain('hör inte ihop')
    expect(res.out).not.toContain('LAGOM1.')
  })

  it.each([
    [['--plan', 'livstid'], {}, 'LICENSE_PRIVATE_KEY saknas'],
    [['--plan', 'guld'], { LICENSE_PRIVATE_KEY: 'x' }, '--plan ar'],
    [['--plan', 'livstid', '--days', '30'], { LICENSE_PRIVATE_KEY: 'x' }, 'bara med --plan ar'],
    [['--plan', 'ar', '--days', '0'], { LICENSE_PRIVATE_KEY: 'x' }, 'mellan 1 och 3650'],
    [['--plan', 'ar', '--from', '2026-02-30'], { LICENSE_PRIVATE_KEY: 'x' }, 'Ogiltigt datum'],
    [['--plan', 'ar', '--id', 'å ä ö'], { LICENSE_PRIVATE_KEY: 'x' }, '--id'],
    [['--plan', 'ar'], { LICENSE_PRIVATE_KEY: 'inte-en-nyckel' }, 'ingen giltig ECDSA P-256-nyckel'],
    [['--okand'], {}, 'Okänt argument'],
  ])('tydliga fel: %j', (args, env, message) => {
    const res = run('issue-license.mjs', args, env as Record<string, string>)
    expect(res.code).toBe(1)
    expect(res.err).toContain(message)
  })
})
