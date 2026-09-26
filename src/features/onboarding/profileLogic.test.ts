import {
  buildProfile,
  canContinue,
  clampRate,
  describeProjection,
  draftFromProfile,
  effectiveGoal,
  emptyDraft,
  hasErrors,
  isDraftComplete,
  isMinor,
  lossBlockReason,
  maxRateFor,
  minHealthyWeight,
  projectedGoalDate,
  rateOptions,
  reviveDraft,
  stepsFor,
  validateAbout,
  validateBirthYear,
  validateHeight,
  validateTarget,
  validateWeight,
  type ProfileDraft,
} from './profileLogic'

const TODAY = '2026-09-26'

function draft(patch: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    ...emptyDraft(),
    goalChoice: 'ga_ner',
    sex: 'kvinna',
    birthYear: 1990,
    heightCm: 168,
    weightKg: 76,
    activityLevel: 'latt',
    ...patch,
  }
}

describe('validering av Om dig', () => {
  it('kräver alla fält i ett tomt utkast', () => {
    const errors = validateAbout(emptyDraft(), TODAY)
    expect(Object.keys(errors).sort()).toEqual(['birthYear', 'heightCm', 'sex', 'weightKg'])
    expect(hasErrors(errors)).toBe(true)
  })

  it('godkänner ett rimligt utkast', () => {
    expect(validateAbout(draft(), TODAY)).toEqual({})
  })

  it('födelseår: fyra siffror, inte i framtiden och minst 13 år', () => {
    expect(validateBirthYear(undefined, TODAY)).toMatch(/Fyll i/)
    expect(validateBirthYear(90, TODAY)).toMatch(/fyra siffror/)
    expect(validateBirthYear(2030, TODAY)).toMatch(/fyra siffror/)
    expect(validateBirthYear(2015, TODAY)).toMatch(/13 år eller äldre/)
    expect(validateBirthYear(2013, TODAY)).toBeUndefined()
    expect(validateBirthYear(1950, TODAY)).toBeUndefined()
  })

  it('längd och vikt inom rimliga gränser', () => {
    expect(validateHeight(119)).toBeDefined()
    expect(validateHeight(170)).toBeUndefined()
    expect(validateWeight(29.9)).toBeDefined()
    expect(validateWeight(72.4)).toBeUndefined()
  })

  it('känner igen minderåriga (13–17 år)', () => {
    expect(isMinor(draft({ birthYear: 2010 }), TODAY)).toBe(true)
    expect(isMinor(draft({ birthYear: 2008 }), TODAY)).toBe(false)
  })
})

describe('säkerhetsregler för viktnedgång', () => {
  it('ingen viktnedgång vid graviditet, amning eller under 18 år', () => {
    expect(lossBlockReason(draft({ lifeStage: 'gravid' }), TODAY)).toMatch(/graviditeten/)
    expect(lossBlockReason(draft({ lifeStage: 'ammar' }), TODAY)).toMatch(/ammar/)
    expect(lossBlockReason(draft({ birthYear: 2011 }), TODAY)).toMatch(/under 18/)
    expect(effectiveGoal(draft({ lifeStage: 'gravid' }), TODAY)).toBe('behalla')
  })

  it('ingen viktnedgång när BMI redan är under 18,5', () => {
    const d = draft({ heightCm: 170, weightKg: 52 })
    expect(lossBlockReason(d, TODAY)).not.toBeNull()
    expect(effectiveGoal(d, TODAY)).toBe('behalla')
  })

  it('livsstadium ignoreras för män', () => {
    expect(lossBlockReason(draft({ sex: 'man', lifeStage: 'gravid' }), TODAY)).toBeNull()
  })

  it('"balans" och "medvetet" betyder att behålla vikten', () => {
    expect(effectiveGoal(draft({ goalChoice: 'balans' }), TODAY)).toBe('behalla')
    expect(effectiveGoal(draft({ goalChoice: 'medvetet' }), TODAY)).toBe('behalla')
    expect(effectiveGoal(draft({ goalChoice: 'ga_upp' }), TODAY)).toBe('ga_upp')
  })
})

describe('takt', () => {
  it('begränsar viktnedgång till 1 % av kroppsvikten per vecka', () => {
    expect(maxRateFor(60, 'ga_ner')).toBe(0.6)
    const opts = rateOptions(60, 'ga_ner')
    expect(opts.map((o) => [o.value, o.disabled])).toEqual([
      [0.25, false],
      [0.5, false],
      [0.75, true],
    ])
    expect(opts[1].kcalPerDay).toBe(550)
  })

  it('viktuppgång högst 0,5 kg per vecka', () => {
    expect(rateOptions(70, 'ga_upp').map((o) => o.value)).toEqual([0.25, 0.5])
    expect(rateOptions(70, 'behalla')).toEqual([])
  })

  it('väljer närmaste tillåtna takt', () => {
    expect(clampRate(0.75, 60, 'ga_ner')).toBe(0.5)
    expect(clampRate(0.75, 90, 'ga_ner')).toBe(0.75)
    expect(clampRate(0.5, 40, 'ga_ner')).toBe(0.25)
    expect(clampRate(0.75, 80, 'ga_upp')).toBe(0.5)
  })
})

describe('målvikt och prognos', () => {
  it('målvikten ska ligga åt rätt håll och inte under BMI 18,5', () => {
    expect(validateTarget(draft({ targetWeightKg: 80 }), TODAY)).toMatch(/lägre/)
    expect(validateTarget(draft({ targetWeightKg: 50 }), TODAY)).toMatch(/BMI under 18,5/)
    expect(validateTarget(draft({ targetWeightKg: 68 }), TODAY)).toBeUndefined()
    expect(validateTarget(draft({ goalChoice: 'ga_upp', targetWeightKg: 70 }), TODAY)).toMatch(/högre/)
    expect(validateTarget(draft({ targetWeightKg: undefined }), TODAY)).toBeUndefined()
  })

  it('lägsta hälsosamma vikt räknas från längden', () => {
    expect(minHealthyWeight(170)).toBe(53.5)
  })

  it('räknar fram ett ungefärligt datum', () => {
    // 76 → 71 kg med 0,5 kg/vecka = 10 veckor = 70 dagar
    expect(projectedGoalDate(draft({ targetWeightKg: 71, weeklyRateKg: 0.5 }), TODAY)).toBe('2026-12-05')
    expect(projectedGoalDate(draft({ targetWeightKg: 71, goalChoice: 'behalla' }), TODAY)).toBeNull()
  })

  it('beskriver prognosen med svenska ord', () => {
    expect(describeProjection('2026-12-05', TODAY)).toBe('om ca 10 veckor – runt 5 december 2026')
    expect(describeProjection('2027-06-01', TODAY)).toMatch(/^om ca 8 månader – runt 1 juni 2027$/)
    expect(describeProjection('2026-10-01', TODAY)).toBe('om ungefär 5 dagar – runt 1 oktober 2026')
  })
})

describe('steg i välkomstflödet', () => {
  it('takt-steget finns bara när vikten ska ändras', () => {
    expect(stepsFor(draft(), TODAY)).toContain('takt')
    expect(stepsFor(draft({ goalChoice: 'behalla' }), TODAY)).not.toContain('takt')
    expect(stepsFor(draft({ goalChoice: 'medvetet' }), TODAY)).not.toContain('takt')
    expect(stepsFor(draft({ lifeStage: 'ammar' }), TODAY)).not.toContain('takt')
    expect(stepsFor(draft(), TODAY)[0]).toBe('valkommen')
    expect(stepsFor(draft(), TODAY).at(-1)).toBe('sammanfattning')
  })

  it('kan bara gå vidare med giltiga svar', () => {
    const empty = emptyDraft()
    expect(canContinue('valkommen', empty, TODAY)).toBe(true)
    expect(canContinue('mal', empty, TODAY)).toBe(false)
    expect(canContinue('om-dig', empty, TODAY)).toBe(false)
    expect(canContinue('aktivitet', empty, TODAY)).toBe(false)
    expect(canContinue('sammanfattning', empty, TODAY)).toBe(false)
    expect(canContinue('sammanfattning', draft(), TODAY)).toBe(true)
    expect(canContinue('takt', draft({ targetWeightKg: 90 }), TODAY)).toBe(false)
  })
})

describe('buildProfile', () => {
  it('bygger en komplett profil', () => {
    const p = buildProfile(draft({ name: '  Anna ', targetWeightKg: 70, weeklyRateKg: 0.75 }), { today: TODAY, now: 123 })
    expect(p).toMatchObject({
      name: 'Anna',
      sex: 'kvinna',
      birthYear: 1990,
      heightCm: 168,
      startWeightKg: 76,
      activityLevel: 'latt',
      goal: 'ga_ner',
      weeklyRateKg: 0.75,
      targetWeightKg: 70,
      lifeStage: 'ingen',
      diet: 'allatare',
      macroPreset: 'nnr',
      createdAt: 123,
    })
  })

  it('sätter målet till att behålla vikten när nedgång inte är lämplig', () => {
    const p = buildProfile(draft({ lifeStage: 'gravid', targetWeightKg: 70 }), { today: TODAY })
    expect(p.goal).toBe('behalla')
    expect(p.targetWeightKg).toBeUndefined()
    expect('name' in p).toBe(false)
  })

  it('män får alltid livsstadiet "ingen"', () => {
    expect(buildProfile(draft({ sex: 'man', lifeStage: 'ammar' }), { today: TODAY }).lifeStage).toBe('ingen')
  })

  it('behåller startvikt, skapad-datum och egna makron från en befintlig profil', () => {
    const base = buildProfile(draft(), { today: TODAY, now: 1 })
    const withCustom = { ...base, macroPreset: 'anpassad' as const, customMacroPct: { protein: 30, carbs: 40, fat: 30 } }
    const next = buildProfile({ ...draftFromProfile(withCustom, 74), heightCm: 170 }, { today: TODAY, base: withCustom, now: 999 })
    expect(next.createdAt).toBe(1)
    expect(next.startWeightKg).toBe(76)
    expect(next.heightCm).toBe(170)
    expect(next.customMacroPct).toEqual({ protein: 30, carbs: 40, fat: 30 })
  })

  it('kastar för ofullständiga utkast', () => {
    expect(() => buildProfile(emptyDraft(), { today: TODAY })).toThrow()
    expect(isDraftComplete(emptyDraft(), TODAY)).toBe(false)
  })
})

describe('reviveDraft', () => {
  it('tål skräp och behåller giltiga fält', () => {
    expect(reviveDraft(null)).toEqual(emptyDraft())
    const r = reviveDraft({ goalChoice: 'ga_upp', sex: 'x', heightCm: 180, activityLevel: 'aktiv', diet: 'vegan', macroPreset: 'okänd', weightKg: 'tung' })
    expect(r.goalChoice).toBe('ga_upp')
    expect(r.sex).toBeNull()
    expect(r.heightCm).toBe(180)
    expect(r.activityLevel).toBe('aktiv')
    expect(r.diet).toBe('vegan')
    expect(r.macroPreset).toBe('nnr')
    expect(r.weightKg).toBeUndefined()
  })
})
