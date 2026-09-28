// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PLANS, TRIAL_DAYS } from '../../src/config/commerce.ts'
import { PLANS as SCRIPT_PLANS } from '../../scripts/issue-license.mjs'
import { SERVER_PLANS, isPlanId, priceInOre } from '../lib/plans.ts'

describe('planerna är desamma i appen, på servern och i supportskriptet', () => {
  it('samma id, namn, pris och giltighet som src/config/commerce.ts', () => {
    expect(Object.keys(SERVER_PLANS).sort()).toEqual(PLANS.map((p) => p.id).sort())
    for (const plan of PLANS) {
      const server = SERVER_PLANS[plan.id]
      expect({ id: server.id, name: server.name, priceKr: server.priceKr, durationDays: server.durationDays }).toEqual({
        id: plan.id,
        name: plan.name,
        priceKr: plan.priceKr,
        durationDays: plan.durationDays,
      })
    }
  })

  it('supportskriptet använder samma namn och giltighet', () => {
    for (const plan of PLANS) {
      expect(SCRIPT_PLANS[plan.id]).toEqual({ name: plan.name, ...(plan.durationDays ? { durationDays: plan.durationDays } : {}) })
    }
  })

  it('årslicensen förnyas inte automatiskt och texten i Checkout säger det', () => {
    expect(SERVER_PLANS.ar.checkoutNote).toContain('förnyas inte automatiskt')
    expect(PLANS.find((p) => p.id === 'ar')?.period).toContain('förnyas inte automatiskt')
    expect(TRIAL_DAYS).toBeGreaterThan(0)
  })

  it('livstidslicensen lovar försiktigt: för alltid och felrättningar – inte alla framtida uppdateringar', () => {
    expect(SERVER_PLANS.livstid.checkoutNote).toContain('gäller för alltid')
    expect(SERVER_PLANS.livstid.checkoutNote).toContain('felrättningar ingår')
    expect(SERVER_PLANS.livstid.checkoutNote).not.toMatch(/framtida uppdateringar/i)
  })

  it('pris i öre och plan-id (ägarens beslut 2026-09-28: 349 kr och 699 kr)', () => {
    expect(SERVER_PLANS.ar.priceKr).toBe(349)
    expect(SERVER_PLANS.livstid.priceKr).toBe(699)
    expect(priceInOre(SERVER_PLANS.ar)).toBe(34_900)
    expect(priceInOre(SERVER_PLANS.livstid)).toBe(69_900)
    expect(isPlanId('ar')).toBe(true)
    expect(isPlanId('livstid')).toBe(true)
    expect(isPlanId('manad')).toBe(false)
    expect(isPlanId(undefined)).toBe(false)
  })
})
