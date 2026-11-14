/**
 * VITE_OWNER_ONLY=1 (ägarens privata webbversion): full åtkomst, ingen provperiod eller köpspärr.
 * Avstängd som standard – se useAccess.test.ts för det vanliga flödet.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

const DAY = 86_400_000

describe('privat användning', () => {
  it('ger full åtkomst även efter provperioden och utan licens', async () => {
    vi.stubEnv('VITE_OWNER_ONLY', '1')
    vi.resetModules()
    const { accessStatus, canLog } = await import('./useAccess')
    const now = Date.now()
    for (const trialStartedAt of [null, now, now - 400 * DAY]) {
      const status = accessStatus({ trialStartedAt, license: null, now })
      expect(status.kind).toBe('licensierad')
      expect(canLog(status)).toBe(true)
    }
  })

  it('är avstängd som standard: en utgången provperiod spärrar ny loggning', async () => {
    vi.resetModules()
    const { accessStatus, canLog } = await import('./useAccess')
    const now = Date.now()
    const status = accessStatus({ trialStartedAt: now - 400 * DAY, license: null, now })
    expect(status.kind).toBe('utgangen')
    expect(canLog(status)).toBe(false)
  })
})
