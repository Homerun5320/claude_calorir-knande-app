import { beforeEach, describe, expect, it } from 'vitest'
import { createBackup, diaryToCsv, parseBackup, restoreBackup, summarizeBackup, wipeAllData, BackupError } from './backup'
import { useDiaryStore } from '../stores/diaryStore'
import { useBodyStore } from '../stores/bodyStore'
import { useFastingStore } from '../stores/fastingStore'
import { useFoodStore } from '../stores/foodStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../stores/profileStore'
import type { Food } from '../types'
import { MEAL_IDS } from '../types'
import { totals as dayTotals } from './diary'
import { foodCo2e } from './climate'
import { foodKostrad } from './kostrad'
import { recipeToFood } from './recipes'

const mjolk: Food = {
  id: 'lagom:test-mjolk',
  name: 'Mjölk 1,5 %',
  source: 'lagom',
  category: 'mejeri',
  nutrients: { kcal: 46, protein: 3.5, carbs: 4.8, fat: 1.5 },
  portions: [{ id: 'glas', label: '1 glas (2 dl)', grams: 206 }],
  density: 1.03,
  liquid: true,
}

const kyckling: Food = {
  id: 'lagom:test-kycklingbrost',
  name: 'Kycklingbröst',
  source: 'lagom',
  category: 'fagel',
  nutrients: { kcal: 150, protein: 30, carbs: 0, fat: 3 },
  portions: [],
  rawWeight: { factor: 0.75, kind: 'ra' },
}

const havredryck: Food = {
  id: 'lagom:test-havredryck',
  name: 'Havredryck',
  source: 'lagom',
  category: 'vaxtdryck',
  nutrients: { kcal: 45, protein: 1, carbs: 6.5, fat: 1.5 },
  portions: [],
  liquid: true,
  isAverage: true,
  note: 'Samlingsvärde: genomsnitt av vanliga märken.',
}

describe('backup', () => {
  beforeEach(() => wipeAllData())

  it('behåller rå vikt och samlingsvärden genom export och återställning', () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: kyckling, amount: 200, unit: 'g-ra', grams: 150, date: '2026-09-20', meal: 'middag' })
    useDiaryStore.getState().addEntry({ kind: 'food', food: havredryck, amount: 2, unit: 'dl', grams: 200, date: '2026-09-20', meal: 'frukost' })
    useFoodStore.getState().recordUsage(kyckling.id, 200, 'g-ra', 'middag')
    const json = JSON.stringify(createBackup())
    wipeAllData()
    const parsed = parseBackup(json)
    expect(parsed.repairs?.repaired ?? 0).toBe(0)
    restoreBackup(parsed, 'replace')
    const [middag] = useDiaryStore.getState().entries['2026-09-20'].filter((e) => e.kind === 'food' && e.meal === 'middag')
    expect(middag).toMatchObject({ amount: 200, unit: 'g-ra', grams: 150, food: { rawWeight: { factor: 0.75, kind: 'ra' } } })
    const frukost = useDiaryStore.getState().entries['2026-09-20'].find((e) => e.kind === 'food' && e.meal === 'frukost')
    expect(frukost?.kind === 'food' && frukost.food.isAverage).toBe(true)
    expect(useFoodStore.getState().usage[kyckling.id]).toMatchObject({ lastAmount: 200, lastUnit: 'g-ra' })
    // CSV:en skriver enheten i klartext.
    expect(diaryToCsv(useDiaryStore.getState().entries)).toContain(';200;g rå;150;')
  })

  it('exporterar och återställer (ersätt)', () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-09-20', meal: 'frukost' })
    useBodyStore.getState().logWeight('2026-09-20', 72.4)
    const json = JSON.stringify(createBackup())
    wipeAllData()
    expect(useDiaryStore.getState().entries).toEqual({})
    const parsed = parseBackup(json)
    expect(summarizeBackup(parsed)).toMatchObject({ days: 1, entries: 1, weights: 1 })
    restoreBackup(parsed, 'replace')
    expect(useDiaryStore.getState().entries['2026-09-20']).toHaveLength(1)
    expect(useBodyStore.getState().weights[0].kg).toBe(72.4)
  })

  it('sammanfogar utan dubbletter', () => {
    const e = useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Fika', nutrients: { kcal: 300 }, date: '2026-09-21', meal: 'fika' })
    const backup = parseBackup(JSON.stringify(createBackup()))
    restoreBackup(backup, 'merge')
    expect(useDiaryStore.getState().entries['2026-09-21'].map((x) => x.id)).toEqual([e.id])
  })

  it('avvisar felaktiga filer med svensk text', () => {
    expect(() => parseBackup('inte json')).toThrow(BackupError)
    expect(() => parseBackup('{"format":"annat"}')).toThrow('ingen säkerhetskopia')
  })

  it('skapar CSV med semikolon och decimalkomma', () => {
    useDiaryStore.getState().addEntry({ kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-09-20', meal: 'frukost' })
    const csv = diaryToCsv(useDiaryStore.getState().entries)
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Datum;Måltid')
    expect(lines[1]).toContain('Mjölk 1,5 %')
    expect(lines[1]).toContain('94,76') // 46 kcal × 2,06
    expect(lines[1].split(';')[1]).toBe('Frukost')
  })

  it('skriver användarens måltidsnamn, aldrig interna id:n', () => {
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Äpple', nutrients: { kcal: 60 }, date: '2026-09-20', meal: 'mellanmal' })
    useDiaryStore.getState().addEntry({ kind: 'quick', name: 'Te', nutrients: { kcal: 5 }, date: '2026-09-20', meal: 'kvallsmat' })
    const meals = DEFAULT_SETTINGS.meals.map((m) => (m.id === 'mellanmal' ? { ...m, name: 'Eftermiddagsfika' } : m))
    const lines = diaryToCsv(useDiaryStore.getState().entries, meals).split('\r\n')
    const mealCol = lines.slice(1).map((l) => l.split(';')[1])
    expect(mealCol).toContain('Eftermiddagsfika')
    expect(mealCol).toContain('Kvällsmat')
    expect(mealCol).not.toContain('mellanmal')
    expect(mealCol).not.toContain('kvallsmat')
  })

  it('skyddar mot formelinjektion i textceller', () => {
    useDiaryStore.getState().addEntry({ kind: 'quick', name: '=HYPERLINK("http://example.com";"klick")', nutrients: { kcal: 1 }, date: '2026-09-20', meal: 'fika' })
    useDiaryStore.getState().addEntry({ kind: 'quick', name: '@SUM(A1)', nutrients: { kcal: 1 }, date: '2026-09-20', meal: 'fika' })
    const csv = diaryToCsv(useDiaryStore.getState().entries)
    expect(csv).toContain(`"'=HYPERLINK(""http://example.com"";""klick"")"`)
    expect(csv).toContain(`'@SUM(A1)`)
    expect(csv).not.toMatch(/;=HYPERLINK/)
  })

  describe('skadat innehåll', () => {
    const NOW = new Date(2026, 8, 27, 12).getTime()
    const file = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      JSON.stringify({ format: 'lagom-backup', version: 1, exportedAt: '2026-09-20T10:00:00.000Z', app: 'Lagom', ...extra, data })
    const sections = { profile: {}, diary: {}, food: {}, body: {} }

    /** Samma sak som appen gör: ersätt allt och räkna ut dagens summor för varje dag. */
    function replaceAndUse(text: string) {
      const backup = parseBackup(text, NOW)
      restoreBackup(backup, 'replace')
      const { entries, exercise, water, days } = useDiaryStore.getState()
      for (const [date, list] of Object.entries(entries)) {
        expect(Array.isArray(list)).toBe(true)
        const totals = dayTotals(list)
        for (const v of Object.values(totals)) expect(Number.isFinite(v)).toBe(true)
        for (const e of list) {
          expect(e.date).toBe(date)
          expect(MEAL_IDS).toContain(e.meal)
          if (e.kind === 'food') {
            expect(Number.isFinite(e.grams)).toBe(true)
            expect(Number.isFinite(foodCo2e(e.food))).toBe(true)
            expect(foodKostrad(e.food)).toBeTypeOf('object')
            expect(e.food.name.length).toBeGreaterThan(0)
          }
        }
      }
      for (const list of Object.values(exercise)) for (const x of list) expect(Number.isFinite(x.kcal) && Number.isFinite(x.minutes)).toBe(true)
      for (const ml of Object.values(water)) expect(Number.isFinite(ml)).toBe(true)
      expect(days).toBeTypeOf('object')
      for (const r of Object.values(useFoodStore.getState().recipes)) expect(() => recipeToFood(r)).not.toThrow()
      return backup
    }

    it('hoppar över trasiga dagboksposter och rättar småfel', () => {
      const backup = replaceAndUse(
        file({
          ...sections,
          diary: {
            entries: {
              '2026-09-20': [
                // Giltig post men utan id, med fel datum och okänd måltid → rättas.
                { kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-01-01', meal: 'brunch', createdAt: 1 },
                // Livsmedel utan näringsvärden och portioner → rättas (värdena blir okända, inte 0).
                { id: 'e2', kind: 'food', food: { id: 'custom:x', name: 'Soppa' }, amount: 300, unit: 'g', grams: 300, date: '2026-09-20', meal: 'lunch', createdAt: NOW },
                // Okänd portion men känd vikt → loggas i gram.
                { id: 'e3', kind: 'food', food: mjolk, amount: 2, unit: 'portion:finns-inte', grams: 150, date: '2026-09-20', meal: 'fika', createdAt: NOW },
                // Snabbpost med ogiltiga tal → talen tas bort.
                { id: 'e4', kind: 'quick', name: 'Fika', nutrients: { kcal: 'mycket', protein: -3, fat: 12, carbs: null }, date: '2026-09-20', meal: 'fika', createdAt: NOW },
                // Dubblerat id → nytt id.
                { id: 'e4', kind: 'quick', name: '', nutrients: { kcal: 100 }, date: '2026-09-20', meal: 'fika', createdAt: NOW },
                // Trasiga poster → hoppas över.
                null,
                'inte en post',
                { id: 'e5', kind: 'food', food: { name: 'Utan id' }, amount: 1, unit: 'g', grams: 1, meal: 'lunch' },
                { id: 'e6', kind: 'food', food: mjolk, amount: 'två', unit: 'glas', grams: 'mycket', meal: 'lunch' },
                { id: 'e7', kind: 'okänd', meal: 'lunch' },
              ],
              'inte-ett-datum': [{ id: 'e8', kind: 'quick', name: 'x', nutrients: {}, meal: 'lunch' }],
              '2026-02-30': [],
              '2026-09-21': 'inte en lista',
            },
            water: { '2026-09-20': 1500, '2026-09-21': -5, '2026-09-22': 'mycket', '2026-09-23': Number.MAX_VALUE },
            exercise: {
              '2026-09-20': [
                { id: 'x1', activityId: 'promenad', name: 'Promenad', minutes: 30, kcal: 'hundra', createdAt: NOW },
                { id: 'x2', activityId: 'promenad', name: 'Promenad', minutes: -30, kcal: 100 },
              ],
            },
            days: { '2026-09-20': { mood: 9, energy: 3, complete: 'ja', note: 'Bra dag' }, '2026-09-21': 'trasig' },
          },
        }),
      )
      const list = useDiaryStore.getState().entries['2026-09-20']
      expect(list).toHaveLength(5)
      expect(list[0]).toMatchObject({ date: '2026-09-20', meal: 'mellanmal' })
      expect(list[0].id).toMatch(/^e_/)
      expect(new Set(list.map((e) => e.id)).size).toBe(5)
      const soup = list[1]
      expect(soup.kind === 'food' && soup.food).toMatchObject({ category: 'ovrigt', source: 'custom', nutrients: {}, portions: [] })
      expect(list[2]).toMatchObject({ amount: 150, unit: 'g', grams: 150 })
      expect(list[3].kind === 'quick' && list[3].nutrients).toEqual({ fat: 12 })
      expect(list[4]).toMatchObject({ kind: 'quick', name: 'Snabbregistrering' })
      expect(Object.keys(useDiaryStore.getState().entries)).toEqual(['2026-09-20'])
      expect(useDiaryStore.getState().water).toEqual({ '2026-09-20': 1500 })
      expect(useDiaryStore.getState().exercise['2026-09-20']).toEqual([expect.objectContaining({ id: 'x1', kcal: 0, date: '2026-09-20' })])
      expect(useDiaryStore.getState().days).toEqual({ '2026-09-20': { energy: 3, note: 'Bra dag' } })

      const summary = summarizeBackup(backup)
      expect(summary).toMatchObject({ days: 1, entries: 5 })
      // 5 trasiga poster samma dag + 1 med ogiltigt datum + 1 dag som inte är en lista.
      expect(backup.repairs?.skipped.entries).toBe(7)
      expect(backup.repairs?.skipped.water).toBe(3)
      expect(backup.repairs?.skipped.exercise).toBe(1)
      expect(summary.skipped).toBe(12)
      expect(summary.repaired).toBeGreaterThanOrEqual(5)
      expect(summary.skippedDetails).toEqual(['7 dagboksposter', '3 vattennoteringar', '1 träningspass', '1 dagsanteckning'])
    })

    it('ersätter allt utan att krascha när avsnitten har fel form', () => {
      const backup = replaceAndUse(
        file({
          profile: { profile: 'Anna', settings: ['fel'] },
          diary: { entries: [], water: 'x', exercise: 5, days: null },
          food: { customFoods: [1, 2], recipes: 'x', cachedFoods: null, favorites: { a: 1 }, usage: [], templates: {} },
          body: { weights: { date: '2026-09-01', kg: 70 }, measurements: 'x' },
          fasting: { active: { start: 'igår' }, history: 'x' },
        }),
      )
      expect(useDiaryStore.getState()).toMatchObject({ entries: {}, water: {}, exercise: {}, days: {} })
      expect(useFoodStore.getState()).toMatchObject({ customFoods: {}, recipes: {}, cachedFoods: {}, favorites: [], usage: {}, templates: [] })
      expect(useBodyStore.getState()).toMatchObject({ weights: [], measurements: [] })
      expect(useFastingStore.getState()).toMatchObject({ active: null, history: [] })
      // Profilen var oläsbar – appen frågar efter uppgifterna igen.
      expect(useProfileStore.getState().profile).toBeNull()
      expect(useProfileStore.getState().settings).toEqual({ ...DEFAULT_SETTINGS, onboardingDone: false })
      const summary = summarizeBackup(backup)
      expect(summary.skippedDetails).toContain('vikterna (fel format)')
      expect(summary.skippedDetails).toContain('1 profil')
      expect(summary.skippedDetails).toContain('1 fasta')
    })

    it('kontrollerar profil och inställningar', () => {
      const backup = parseBackup(
        file({
          ...sections,
          profile: {
            profile: {
              sex: 'kvinna',
              birthYear: 1990,
              heightCm: 168,
              startWeightKg: 70,
              activityLevel: 'soffa',
              goal: 'svälta',
              weeklyRateKg: 5,
              lifeStage: 'gravid',
              diet: 'vegan',
              macroPreset: 'anpassad',
              createdAt: 'igår',
            },
            settings: {
              theme: 'neon',
              meals: [{ id: 'lunch', name: 'Mitt på dagen', enabled: true }, { id: 'brunch', name: 'Brunch', enabled: true }, 'x'],
              exerciseAddBackPct: 250,
              waterGlassMl: Number.NaN,
              energyUnit: 'kcal',
              dashboardNutrients: ['protein', 'bensin'],
              targetOverrides: { kcal: 1800, proteinG: -10, hemligt: 3 },
              onboardingDone: true,
            },
          },
        }),
        NOW,
      )
      const { profile, settings } = backup.data.profile
      expect(profile).toMatchObject({ activityLevel: 'stillasittande', goal: 'behalla', weeklyRateKg: 0.25, lifeStage: 'gravid', diet: 'vegan', macroPreset: 'nnr', createdAt: NOW })
      expect(settings.theme).toBe('system')
      expect(settings.meals.map((m) => m.id)).toEqual(['lunch', 'frukost', 'fika', 'middag', 'kvallsmat', 'mellanmal'])
      expect(settings.meals[0].name).toBe('Mitt på dagen')
      expect(settings.exerciseAddBackPct).toBe(100)
      expect(settings.waterGlassMl).toBe(DEFAULT_SETTINGS.waterGlassMl)
      expect(settings.dashboardNutrients).toEqual(['protein'])
      expect(settings.targetOverrides).toEqual({ kcal: 1800 })
      expect(settings.onboardingDone).toBe(true)
      expect(summarizeBackup(backup)).toMatchObject({ skipped: 0, skippedDetails: [] })
      expect(summarizeBackup(backup).repaired).toBe(2)

      // Saknas kön eller är längden orimlig används inte profilen.
      const bad = parseBackup(file({ ...sections, profile: { profile: { sex: 'x', birthYear: 1990, heightCm: 168, startWeightKg: 70 }, settings: { onboardingDone: true } } }), NOW)
      expect(bad.data.profile.profile).toBeNull()
      expect(bad.data.profile.settings.onboardingDone).toBe(false)
    })

    it('kontrollerar livsmedel, recept, vikt och fasta', () => {
      const ingredient = { id: 'i1', food: mjolk, amount: 2, unit: 'dl', grams: 206 }
      const backup = replaceAndUse(
        file({
          ...sections,
          food: {
            customFoods: {
              'custom:ok': { ...mjolk, id: 'custom:ok', source: 'custom', density: -1, plate: { veg: 2 }, imageUrl: 'javascript:alert(1)', tags: ['vegan', 'magisk'] },
              'custom:utan-id': { name: 'Utan id' },
            },
            recipes: {
              r1: { id: 'r1', name: 'Gröt', servings: 0, ingredients: [ingredient, { id: 'i2', food: null, amount: 1, unit: 'g', grams: 1 }], builtin: true, createdAt: NOW, updatedAt: NOW },
              r2: { name: 'Utan id', servings: 2, ingredients: [] },
              r3: { id: 'r3', name: 'Trasiga ingredienser', servings: 4, ingredients: 'x', createdAt: NOW, updatedAt: NOW },
            },
            favorites: ['lagom:x', 'lagom:x', 5],
            usage: {
              'lagom:x': { count: 3, lastUsed: NOW, lastAmount: 1, lastUnit: 'portion:glas', meals: { frukost: 2, brunch: 1 } },
              'lagom:y': { count: 2, lastUsed: NOW, lastAmount: -1, lastUnit: 'kopp', meals: {} },
              'lagom:z': { count: 0 },
            },
            templates: [
              { id: 'tpl1', name: 'Frukost', items: [{ food: mjolk, amount: 1, unit: 'portion:glas', grams: 206 }, { food: 'x' }], createdAt: NOW },
              { id: 'tpl2', name: 'Tom', items: [] },
            ],
          },
          body: {
            weights: [
              { id: 'w1', date: '2026-09-01', kg: 72.4, createdAt: NOW - 10 },
              { id: 'w2', date: '2026-09-01', kg: 72.1, createdAt: NOW },
              { id: 'w3', date: '2026-09-02', kg: 'sjuttio' },
              { id: 'w4', date: '1 september', kg: 70 },
              { id: 'w5', date: '2026-08-30', kg: 7000 },
            ],
            measurements: [{ id: 'm1', date: '2026-09-01', waistCm: 80, hipCm: -2 }, { id: 'm2', date: '2026-09-01' }],
          },
          fasting: {
            active: { start: NOW - 3_600_000, targetHours: 16 },
            history: [
              { id: 'f1', start: NOW - 20 * 3_600_000, end: NOW - 4 * 3_600_000, targetHours: 16, protocol: '16:8' },
              { id: 'f2', start: NOW, end: NOW - 1 },
            ],
          },
        }),
      )
      const food = useFoodStore.getState()
      expect(Object.keys(food.customFoods)).toEqual(['custom:ok'])
      const ok = food.customFoods['custom:ok']
      expect(ok.density).toBeUndefined()
      expect(ok.plate).toBeUndefined()
      expect(ok.imageUrl).toBeUndefined()
      expect(ok.tags).toEqual(['vegan'])
      expect(Object.keys(food.recipes).sort()).toEqual(['r1', 'r3'])
      expect(food.recipes.r1).toMatchObject({ servings: 1, ingredients: [expect.objectContaining({ id: 'i1', grams: 206 })] })
      expect(food.recipes.r1.builtin).toBeUndefined()
      expect(food.recipes.r3.ingredients).toEqual([])
      expect(food.favorites).toEqual(['lagom:x'])
      expect(food.usage['lagom:x'].meals).toEqual({ frukost: 2 })
      expect(food.usage['lagom:y']).toMatchObject({ lastAmount: 100, lastUnit: 'g' })
      expect(food.usage['lagom:z']).toBeUndefined()
      expect(food.templates).toHaveLength(1)
      expect(food.templates[0].items).toHaveLength(1)
      // En vägning per dag – den senast sparade gäller.
      expect(useBodyStore.getState().weights).toEqual([expect.objectContaining({ id: 'w2', kg: 72.1 })])
      expect(useBodyStore.getState().measurements).toEqual([expect.objectContaining({ id: 'm1', waistCm: 80 })])
      expect(useBodyStore.getState().measurements[0].hipCm).toBeUndefined()
      expect(useFastingStore.getState().active).toMatchObject({ targetHours: 16, protocol: 'eget' })
      expect(useFastingStore.getState().history.map((h) => h.id)).toEqual(['f1'])

      const details = summarizeBackup(backup).skippedDetails
      expect(details).toEqual(['1 eget livsmedel', '1 recept', '1 receptingrediens', '1 favorit', '1 rad i användningsstatistiken', '1 sparad måltid', '3 vägningar', '1 mätning', '1 fasta'])
    })

    it('stoppar orimliga tal och id:n som kan byta prototyp', () => {
      const text = `{"format":"lagom-backup","version":1,"data":{"profile":{},"body":{},"diary":{"entries":{"2026-09-20":[
        {"id":"e1","kind":"food","food":{"id":"custom:x","name":"X","nutrients":{"kcal":1e300,"protein":5}},"amount":1e300,"unit":"g","grams":1e300,"meal":"lunch"},
        {"id":"e2","kind":"quick","name":"Stor","nutrients":{"kcal":1e300,"fat":10},"meal":"lunch"}
      ]}},"food":{"customFoods":{"__proto__":{"id":"__proto__","name":"Hack","nutrients":{}}},
        "usage":{"__proto__":{"count":1,"lastUsed":1,"lastAmount":1,"lastUnit":"g","meals":{}}}}}}`
      const backup = parseBackup(text, NOW)
      const list = backup.data.diary.entries['2026-09-20']
      // Posten utan användbar mängd hoppas över, snabbposten behåller bara rimliga värden.
      expect(list).toHaveLength(1)
      expect(list[0].kind === 'quick' && list[0].nutrients).toEqual({ fat: 10 })
      expect(Object.getPrototypeOf(backup.data.food.customFoods)).toBe(Object.prototype)
      expect(Object.keys(backup.data.food.customFoods)).toEqual([])
      expect(Object.getPrototypeOf(backup.data.food.usage)).toBe(Object.prototype)
      expect(backup.repairs?.skipped).toMatchObject({ entries: 1, customFoods: 1, usage: 1 })
    })

    it('behåller receptlänk och veckans fokus men rensar bort ogiltiga värden', () => {
      const recipe = (id: string, sourceUrl: unknown) => ({ id, name: 'Gröt', servings: 2, ingredients: [], sourceUrl, createdAt: NOW, updatedAt: NOW })
      const withFocus = (weeklyFocus: unknown) =>
        parseBackup(file({ ...sections, profile: { profile: null, settings: { weeklyFocus } } }), NOW).data.profile.settings.weeklyFocus
      const backup = parseBackup(
        file({
          ...sections,
          food: {
            recipes: {
              r1: recipe('r1', 'https://example.com/recept/grot?portioner=2'),
              r2: recipe('r2', 'http://example.com/gammal'),
              r3: recipe('r3', 'javascript:alert(1)'),
              r4: recipe('r4', `https://example.com/${'a'.repeat(2000)}`),
              r5: recipe('r5', 42),
              r6: recipe('r6', 'example.com/utan-schema'),
            },
          },
        }),
        NOW,
      )
      const recipes = backup.data.food.recipes
      expect(recipes.r1.sourceUrl).toBe('https://example.com/recept/grot?portioner=2')
      expect(recipes.r2.sourceUrl).toBe('http://example.com/gammal')
      for (const id of ['r3', 'r4', 'r5', 'r6']) expect(recipes[id].sourceUrl).toBeUndefined()
      // Receptet finns kvar – bara länken rensas bort.
      expect(summarizeBackup(backup)).toMatchObject({ skipped: 0, repaired: 4 })

      expect(withFocus({ id: 'mer-gronsaker', since: '2026-09-21' })).toEqual({ id: 'mer-gronsaker', since: '2026-09-21' })
      expect(withFocus(undefined)).toBeUndefined()
      expect(withFocus({ id: '', since: '2026-09-21' })).toBeUndefined()
      expect(withFocus({ id: 'mer-gronsaker', since: '21 september' })).toBeUndefined()
      expect(withFocus({ id: 'mer-gronsaker', since: '2026-02-30' })).toBeUndefined()
      expect(withFocus('mer-gronsaker')).toBeUndefined()
    })

    it('rör inte en hel säkerhetskopia', () => {
      useDiaryStore.getState().addEntry({ kind: 'food', food: mjolk, amount: 1, unit: 'portion:glas', grams: 206, date: '2026-09-20', meal: 'frukost', time: '07:15' })
      useDiaryStore.getState().addExercise({ date: '2026-09-20', activityId: 'promenad', name: 'Promenad', minutes: 30, kcal: 110, met: 3.8 })
      useDiaryStore.getState().setWater('2026-09-20', 750)
      useDiaryStore.getState().setDayMeta('2026-09-20', { mood: 4, complete: true })
      useBodyStore.getState().logWeight('2026-09-20', 72.4)
      useBodyStore.getState().addMeasurement({ date: '2026-09-20', waistCm: 80 })
      useFoodStore.getState().addCustomFood({ ...mjolk, id: 'custom:mjolk', source: 'custom' })
      useFoodStore.getState().recordUsage(mjolk.id, 1, 'portion:glas', 'frukost')
      useFoodStore.getState().toggleFavorite(mjolk.id)
      useFastingStore.getState().startFast(16, '16:8', Date.now() - 3_600_000)
      useFoodStore.getState().saveRecipe({
        id: 'recipe:gröt', name: 'Gröt', servings: 2, sourceUrl: 'https://example.com/recept/grot',
        ingredients: [{ id: 'i1', food: mjolk, amount: 2, unit: 'dl', grams: 206 }], createdAt: Date.now(), updatedAt: Date.now(),
      })
      useProfileStore.getState().updateSettings({ weeklyFocus: { id: 'mer-gronsaker', since: '2026-09-21' } })
      useProfileStore.getState().setProfile({
        sex: 'man', birthYear: 1985, heightCm: 180, startWeightKg: 82, activityLevel: 'latt', goal: 'ga_ner', weeklyRateKg: 0.5,
        targetWeightKg: 78, lifeStage: 'ingen', diet: 'allatare', macroPreset: 'nnr', createdAt: Date.now(),
      })
      const original = createBackup()
      const parsed = parseBackup(JSON.stringify(original))
      expect(parsed.data).toEqual(JSON.parse(JSON.stringify(original.data)))
      expect(summarizeBackup(parsed)).toMatchObject({ skipped: 0, repaired: 0, skippedDetails: [] })
    })
  })
})
