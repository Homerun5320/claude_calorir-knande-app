/**
 * Veckobudgeten: summan är alltid 0, förvalen, "Egen" i steg om 50 kcal, golvet varje dag,
 * makrona per dag och att graviditet, amning och under 18 år aldrig får någon veckobudget.
 * (Golvet prövas dessutom över tusentals kombinationer i energy.safety.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import type { Profile, Targets } from '../types'
import { addDays, startOfWeek } from './dates'
import { computeEnergy, computeTargets, weeklyBudgetBlockReason } from './energy'
import { formatEnergy } from './format'
import {
  DEFAULT_EXTRA,
  MAX_DAY_SHIFT,
  ZERO_SHIFT,
  adjustDay,
  averageKcalFor,
  canAdjustDay,
  detectPreset,
  extraDaysText,
  isShiftAllowed,
  kcalForDate,
  maxPresetExtra,
  minShiftFor,
  normalizeShift,
  presetShift,
  resolveWeeklyBudget,
  scaleTargetsToKcal,
  shiftForDate,
  shiftSum,
  targetsForDate,
  weeklyBudgetSummary,
  weeklyDayNote,
  weeklyPlan,
} from './weeklyBudget'

const TODAY = '2026-09-29' // tisdag
const MONDAY = startOfWeek(TODAY)
const FRIDAY = addDays(MONDAY, 4)
const SATURDAY = addDays(MONDAY, 5)

const ADULT: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 76,
  activityLevel: 'latt',
  goal: 'ga_ner',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

describe('normalizeShift', () => {
  it('ger alltid sju heltal inom ±1 500 med summan 0', () => {
    const inputs: unknown[] = [
      undefined,
      null,
      'fel',
      [],
      [100],
      [1, 2, 3, 4, 5, 6, 7],
      [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      [5000, -5000, 1500, 1500, 1500, 1500, 1500],
      [Number.NaN, Number.POSITIVE_INFINITY, -1, 'x', null, 3, 99],
      [-1500, -1500, -1500, -1500, -1500, -1500, -1500],
      [-120, -120, -120, -120, 300, 300, -120, 999],
    ]
    for (const raw of inputs) {
      const v = normalizeShift(raw)
      expect(v).toHaveLength(7)
      expect(shiftSum(v)).toBe(0)
      expect(v.every((x) => Number.isInteger(x) && Math.abs(x) <= MAX_DAY_SHIFT)).toBe(true)
      expect(isShiftAllowed(v)).toBe(true)
    }
  })

  it('lämnar en giltig förskjutning orörd', () => {
    const v = [-120, -120, -120, -120, 300, 300, -120]
    expect(normalizeShift(v)).toEqual(v)
  })

  it('höjer dagar under golvet och tar skillnaden från de andra dagarna', () => {
    const v = normalizeShift([-120, -120, -120, -120, 300, 300, -120], -60)
    expect(v).toEqual([-60, -60, -60, -60, 150, 150, -60])
    expect(isShiftAllowed(v, -60)).toBe(true)
  })
})

describe('förval', () => {
  it('Fredagsmys: extra på fredag och lördag, fördelat på övriga dagar', () => {
    const v = presetShift('fredagsmys', 300)
    expect(v).toEqual([-120, -120, -120, -120, 300, 300, -120])
    expect(shiftSum(v)).toBe(0)
    expect(detectPreset(v)).toEqual({ id: 'fredagsmys', extra: 300 })
  })

  it('Helg: extra på lördag och söndag', () => {
    const v = presetShift('helg', 250)
    expect(v).toEqual([-100, -100, -100, -100, -100, 250, 250])
    expect(detectPreset(v)).toEqual({ id: 'helg', extra: 250 })
  })

  it('udda belopp fördelas med heltal och summan blir ändå 0', () => {
    const v = presetShift('fredagsmys', 333)
    expect(shiftSum(v)).toBe(0)
    expect(detectPreset(v)).toEqual({ id: 'fredagsmys', extra: 333 })
  })

  it('begränsas så att ingen dag hamnar under golvet', () => {
    // 100 kcal utrymme per dag: fem dagar × 100 = 500 att dela på två dagar → högst 250.
    expect(maxPresetExtra('fredagsmys', -100)).toBe(250)
    expect(maxPresetExtra('helg', -100)).toBe(250)
    const v = presetShift('fredagsmys', DEFAULT_EXTRA, -100)
    expect(v).toEqual([-100, -100, -100, -100, 250, 250, -100])
    expect(isShiftAllowed(v, -100)).toBe(true)
    // Inget utrymme alls: en jämn vecka.
    expect(maxPresetExtra('fredagsmys', 0)).toBe(0)
    expect(presetShift('fredagsmys', DEFAULT_EXTRA, 0)).toEqual([...ZERO_SHIFT])
  })

  it('allt annat än förvalen är "Egen"', () => {
    expect(detectPreset([50, -50, 0, 0, 0, 0, 0]).id).toBe('egen')
    expect(detectPreset(undefined).id).toBe('egen')
    expect(detectPreset([...ZERO_SHIFT]).id).toBe('egen')
  })
})

describe('Egen: ändra en dag i steg om 50 kcal', () => {
  it('jämnar ut ändringen över de andra dagarna – summan är alltid 0', () => {
    const v = adjustDay(ZERO_SHIFT, 4, 50)
    expect(v[4]).toBe(50)
    expect(shiftSum(v)).toBe(0)
    expect(v.every((x, i) => i === 4 || x <= 0)).toBe(true)
  })

  it('utjämningen blir jämna tiotal – inga udda tal som −109 och −111', () => {
    let v: number[] = [...ZERO_SHIFT]
    for (const [day, delta] of [
      [5, 50],
      [5, 50],
      [1, -50],
      [1, -50],
      [1, -50],
    ] as const) {
      v = adjustDay(v, day, delta)
      expect(shiftSum(v)).toBe(0)
      for (const x of v) expect(Math.abs(x) % 10).toBe(0)
    }
    expect(v[5]).toBe(100)
    expect(v[1]).toBe(-170)
    // Så jämnt som möjligt: de vanliga dagarna skiljer sig högst ett steg.
    const others = v.filter((_, i) => i !== 1 && i !== 5)
    expect(Math.max(...others) - Math.min(...others)).toBeLessThanOrEqual(10)
  })

  it('en redan vald extradag ligger kvar när en annan dag höjs', () => {
    const fri = adjustDay(ZERO_SHIFT, 4, 50)
    // Varje tryck flyttar exakt 50 kcal till eller från dagen.
    const both = adjustDay(fri, 5, 50)
    expect(both[4]).toBe(50)
    expect(both[5]).toBe(fri[5] + 50)
    expect(shiftSum(both)).toBe(0)
    // Och tillbaka: att sänka en extradag ger energin till de vanliga dagarna.
    const back = adjustDay(both, 5, -50)
    expect(back[5]).toBe(fri[5])
    expect(back[4]).toBe(50)
    expect(shiftSum(back)).toBe(0)
  })

  it('går aldrig under golvet – ändringen blir mindre eller ingen alls', () => {
    const lo = -40
    let v: number[] = [...ZERO_SHIFT]
    for (let i = 0; i < 20; i++) v = adjustDay(v, 4, 50, lo)
    expect(isShiftAllowed(v, lo)).toBe(true)
    // Sex dagar × 40 kcal = 240 kcal kan flyttas till fredagen, inte mer.
    expect(v[4]).toBe(240)
    expect(canAdjustDay(v, 4, 50, lo)).toBe(false)
    // En vanlig dag kan inte sänkas under golvet.
    expect(canAdjustDay(v, 0, -50, lo)).toBe(false)
    expect(adjustDay(v, 0, -50, lo)).toEqual(v)
  })

  it('aldrig över ±1 500 kcal en dag', () => {
    let v: number[] = [...ZERO_SHIFT]
    for (let i = 0; i < 40; i++) v = adjustDay(v, 6, 50)
    expect(v[6]).toBe(1500)
    expect(isShiftAllowed(v)).toBe(true)
    expect(canAdjustDay(v, 6, 50)).toBe(false)
  })

  it('ogiltiga index och steg ändrar ingenting', () => {
    const v = presetShift('helg', 200)
    expect(adjustDay(v, 7, 50)).toEqual(v)
    expect(adjustDay(v, -1, 50)).toEqual(v)
    expect(adjustDay(v, 2, Number.NaN)).toEqual(v)
  })
})

describe('veckans plan', () => {
  it('samma energi över veckan när ingen dag når golvet', () => {
    const plan = weeklyPlan(2000, 1400, presetShift('fredagsmys', 300))
    expect(plan.dayKcal).toEqual([1880, 1880, 1880, 1880, 2300, 2300, 1880])
    expect(plan.weekKcal).toBe(7 * 2000)
    expect(plan.clamped).toBe(false)
    expect(plan.preset).toBe('fredagsmys')
    expect(plan.minShift).toBe(-600)
  })

  it('klämmer varje dag till golvet – då blir veckans summa och snittmålet något högre', () => {
    // Sparad med gott om utrymme, men nu ligger golvet 50 kcal under basmålet.
    const plan = weeklyPlan(1650, 1600, presetShift('fredagsmys', 300))
    expect(Math.min(...plan.dayKcal)).toBe(1600)
    expect(plan.clamped).toBe(true)
    expect(plan.weekKcal).toBeGreaterThan(7 * 1650)
    for (const k of plan.dayKcal) expect(k).toBeGreaterThanOrEqual(1600)
    // Snittmålet är veckans summa delat på sju – inte basmålet.
    expect(plan.averageKcal).toBe(Math.round(plan.weekKcal / 7))
    expect(plan.averageKcal).toBeGreaterThan(1650)
    expect(averageKcalFor(1650, plan)).toBe(plan.averageKcal)
    expect(averageKcalFor(1650, null)).toBe(1650)
    expect(weeklyPlan(2000, 1400, presetShift('fredagsmys', 300)).averageKcal).toBe(2000)
  })

  it('sänker aldrig en dag under basmålet om basmålet (i teorin) redan är under golvet', () => {
    const plan = weeklyPlan(1500, 1600, [-100, -100, -100, -100, 200, 200, 0])
    for (const k of plan.dayKcal) expect(k).toBeGreaterThanOrEqual(1500)
    expect(minShiftFor(1500, 1600)).toBe(0)
  })

  it('kcalForDate och shiftForDate följer veckodagen (måndag = 0)', () => {
    const plan = weeklyPlan(2000, 1400, presetShift('fredagsmys', 300))
    expect(kcalForDate(2000, plan, FRIDAY)).toBe(2300)
    expect(kcalForDate(2000, plan, SATURDAY)).toBe(2300)
    expect(kcalForDate(2000, plan, MONDAY)).toBe(1880)
    expect(kcalForDate(2000, null, FRIDAY)).toBe(2000)
    expect(shiftForDate(plan, FRIDAY)).toBe(300)
    expect(shiftForDate(plan, addDays(FRIDAY, 7))).toBe(300)
    expect(shiftForDate(null, FRIDAY)).toBe(0)
  })

  it('dagar före dagen veckobudgeten slogs på har det jämna dagsmålet', () => {
    const plan = weeklyPlan(2000, 1400, presetShift('fredagsmys', 300), TODAY)
    const lastSaturday = addDays(SATURDAY, -7)
    expect(kcalForDate(2000, plan, lastSaturday)).toBe(2000)
    expect(shiftForDate(plan, lastSaturday)).toBe(0)
    expect(weeklyDayNote(plan, lastSaturday, { context: 'dag' })).toBeNull()
    // Måndagen i samma vecka var före – tisdagen (idag) och framåt följer fördelningen.
    expect(kcalForDate(2000, plan, MONDAY)).toBe(2000)
    expect(kcalForDate(2000, plan, TODAY)).toBe(1880)
    expect(kcalForDate(2000, plan, SATURDAY)).toBe(2300)
    // Ett ogiltigt datum ignoreras – då gäller fördelningen alla dagar.
    expect(weeklyPlan(2000, 1400, presetShift('fredagsmys', 300), 'igår' as never).since).toBeUndefined()
  })
})

describe('resolveWeeklyBudget – graviditet, amning och under 18 år', () => {
  const setting = { enabled: true, shift: presetShift('fredagsmys', 300) }
  const run = (profile: Profile) => {
    const energy = computeEnergy(profile, 76, { today: TODAY })
    const targets = computeTargets(profile, 76, {}, { today: TODAY })
    return resolveWeeklyBudget({ profile, energy, baseKcal: targets.kcal, setting, today: TODAY })
  }

  it('vuxen: planen används och följer golvet för egna mål', () => {
    const r = run(ADULT)
    expect(r.blocked).toBeNull()
    expect(r.plan).not.toBeNull()
    const energy = computeEnergy(ADULT, 76, { today: TODAY })
    expect(r.plan?.floorKcal).toBe(energy.overrideFloor.kcal)
  })

  it('ingen veckobudget alls vid graviditet, amning, under 18 år eller okänd ålder', () => {
    for (const patch of [{ lifeStage: 'gravid' as const }, { lifeStage: 'ammar' as const }, { birthYear: 2009 }, { birthYear: 2008 }, { birthYear: Number.NaN }]) {
      const r = run({ ...ADULT, ...patch })
      expect(r.plan).toBeNull()
      expect(r.blocked).toMatch(/jämn energi varje dag/)
    }
    // 2008: fyller 18 i år men kan vara född i december – räknas inte som vuxen förrän 31 december.
    expect(weeklyBudgetBlockReason('ingen', 17)).not.toBeNull()
    expect(weeklyBudgetBlockReason('ingen', undefined)).not.toBeNull()
    expect(weeklyBudgetBlockReason('ingen', 18)).toBeNull()
  })

  it('avstängd, saknad eller utan profil: ingen plan', () => {
    const energy = computeEnergy(ADULT, 76, { today: TODAY })
    expect(resolveWeeklyBudget({ profile: ADULT, energy, baseKcal: 1800, setting: { ...setting, enabled: false }, today: TODAY }).plan).toBeNull()
    expect(resolveWeeklyBudget({ profile: ADULT, energy, baseKcal: 1800, setting: undefined, today: TODAY }).plan).toBeNull()
    expect(resolveWeeklyBudget({ profile: null, energy: null, baseKcal: 1800, setting, today: TODAY })).toEqual({ plan: null, blocked: null })
  })

  it('vid lågt BMI eller nådd målvikt tas inget från de andra dagarna (golvet = underhåll)', () => {
    const low = { ...ADULT, heightCm: 175 }
    const energy = computeEnergy(low, 55, { today: TODAY })
    expect(energy.goalPause).toBe('lowBmi')
    const targets = computeTargets(low, 55, {}, { today: TODAY })
    const r = resolveWeeklyBudget({ profile: low, energy, baseKcal: targets.kcal, setting, today: TODAY })
    for (const k of r.plan?.dayKcal ?? []) expect(k).toBeGreaterThanOrEqual(energy.maintenanceKcal)
    expect(r.plan?.minShift).toBe(0)
  })
})

describe('makron per dag', () => {
  const base = computeTargets(ADULT, 76, {}, { today: TODAY })

  it('protein och fibrer behålls, fett och kolhydrater skalas med energin', () => {
    const up = scaleTargetsToKcal(base, base.kcal + 300)
    const down = scaleTargetsToKcal(base, base.kcal - 120)
    for (const t of [up, down]) {
      expect(t.proteinG).toBe(base.proteinG)
      expect(t.fiberG).toBe(base.fiberG)
      expect(t.waterMl).toBe(base.waterMl)
      expect(t.caffeineMaxMg).toBe(base.caffeineMaxMg)
      expect(t.saltMaxG).toBe(base.saltMaxG)
      // Makrona går jämnt upp med dagens energi (avrundning till hela gram).
      const sum = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9
      expect(sum).toBeLessThanOrEqual(t.kcal + 2)
      expect(sum).toBeGreaterThanOrEqual(t.kcal - 12)
    }
    expect(up.fatG).toBeGreaterThan(base.fatG)
    expect(up.carbsG).toBeGreaterThan(base.carbsG)
    expect(down.fatG).toBeLessThan(base.fatG)
    expect(down.carbsG).toBeLessThan(base.carbsG)
    // Fett och kolhydrater behåller ungefär sin inbördes andel.
    const share = (t: Targets) => (t.fatG * 9) / (t.fatG * 9 + t.carbsG * 4)
    expect(Math.abs(share(up) - share(base))).toBeLessThan(0.01)
    // 10 E%-taken följer dagens energi.
    expect(up.addedSugarMaxG).toBe(Math.round(((base.kcal + 300) * 0.1) / 4))
    expect(up.satFatMaxG).toBe(Math.round(((base.kcal + 300) * 0.1) / 9))
  })

  it('egna mål för fett eller kolhydrater ändras aldrig – det andra makrot tar förskjutningen', () => {
    for (const delta of [300, -120]) {
      const kcal = base.kcal + delta
      const ownFat = scaleTargetsToKcal(base, kcal, { fatG: base.fatG })
      expect(ownFat.fatG).toBe(base.fatG)
      expect(ownFat.proteinG).toBe(base.proteinG)
      expect(ownFat.carbsG).toBe(Math.round((base.carbsG * 4 + delta) / 4))
      const ownCarbs = scaleTargetsToKcal(base, kcal, { carbsG: base.carbsG })
      expect(ownCarbs.carbsG).toBe(base.carbsG)
      expect(Math.abs(ownCarbs.fatG - (base.fatG * 9 + delta) / 9)).toBeLessThanOrEqual(1)
      for (const t of [ownFat, ownCarbs]) expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeLessThanOrEqual(t.kcal + 2)
      const both = scaleTargetsToKcal(base, kcal, { fatG: base.fatG, carbsG: base.carbsG })
      expect([both.kcal, both.fatG, both.carbsG]).toEqual([kcal, base.fatG, base.carbsG])
    }
    // Egna mål via targetsForDate (så som useTargets skickar dem).
    const plan = weeklyPlan(base.kcal, 1200, presetShift('fredagsmys', 300))
    expect(targetsForDate(base, plan, FRIDAY, { fatG: base.fatG }).fatG).toBe(base.fatG)
    expect(targetsForDate(base, plan, MONDAY, { fatG: base.fatG }).fatG).toBe(base.fatG)
  })

  it('egna tak för mättat fett och socker behålls', () => {
    const t = scaleTargetsToKcal(base, base.kcal + 300, { satFatMaxG: 15, addedSugarMaxG: 30 })
    expect(t.satFatMaxG).toBe(base.satFatMaxG)
    expect(t.addedSugarMaxG).toBe(base.addedSugarMaxG)
  })

  it('samma objekt när dagen inte ändras', () => {
    expect(scaleTargetsToKcal(base, base.kcal)).toBe(base)
    expect(targetsForDate(base, null, FRIDAY)).toBe(base)
    const plan = weeklyPlan(base.kcal, 1200, presetShift('fredagsmys', 300))
    expect(targetsForDate(base, plan, FRIDAY).kcal).toBe(base.kcal + 300)
    expect(targetsForDate(base, plan, MONDAY).kcal).toBe(base.kcal - 120)
  })

  it('ett beräknat protein tar aldrig mer än hela dagens energi', () => {
    const heavy: Targets = { ...base, kcal: 1400, proteinG: 340, fatG: 0, carbsG: 0 }
    const t = scaleTargetsToKcal(heavy, 1300)
    expect(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9).toBeLessThanOrEqual(1300 + 2)
  })
})

describe('texter', () => {
  const plan = weeklyPlan(2000, 1400, presetShift('fredagsmys', 300))

  it('diskret rad för dagen – aldrig skuld', () => {
    expect(weeklyDayNote(plan, FRIDAY)).toBe('Fredagsmys: +300 kcal idag')
    expect(weeklyDayNote(plan, MONDAY)).toBe('Veckobudget: 120 kcal mindre idag – sparat till fredagsmyset')
    expect(weeklyDayNote(plan, FRIDAY, { context: 'dag' })).toBe('Fredagsmys: +300 kcal i dagens budget')
    expect(weeklyDayNote(null, FRIDAY)).toBeNull()
    expect(weeklyDayNote(weeklyPlan(2000, 1400, ZERO_SHIFT), FRIDAY)).toBeNull()
    const helg = weeklyPlan(2000, 1400, presetShift('helg', 300))
    expect(weeklyDayNote(helg, MONDAY)).toMatch(/sparat till helgen/)
  })

  it('medvetet läge: inga siffror', () => {
    expect(weeklyDayNote(plan, FRIDAY, { mindful: true })).toBe('Fredagsmys idag – lite extra utrymme i dagsmålet.')
    expect(weeklyDayNote(plan, MONDAY, { mindful: true })).toBeNull()
    expect(weeklyDayNote(plan, FRIDAY, { mindful: true, context: 'dag' })).toBeNull()
  })

  it('veckans budget i neutral ton', () => {
    expect(extraDaysText(plan)).toBe('fredag och lördag')
    expect(weeklyBudgetSummary(plan)).toBe(`Veckobudget ${formatEnergy(14000)} – med extra på fredag och lördag.`)
    expect(weeklyBudgetSummary(null)).toBeNull()
    expect(weeklyBudgetSummary(weeklyPlan(2000, 1400, ZERO_SHIFT))).toBe(`Veckobudget ${formatEnergy(14000)}.`)
  })
})
