import type { Food } from '../../types'
import { DEFAULT_MEALS } from '../../stores/profileStore'
import { MACRO_PRESETS } from '../../lib/energy'
import { backupDue } from './backupStatus'
import {
  MACRO_BOUNDS,
  cachedFoodStats,
  formatBytes,
  glassLabel,
  isDeleteConfirmed,
  macroGrams,
  mealsAreDefault,
  mergeImportedFoods,
  nnrNote,
  normalizeMacroPct,
  outsideNnr,
  overrideCount,
  pruneCachedFoods,
  rebalanceMacros,
  renameMeal,
  setMealEnabled,
  toggleDashboardNutrient,
  withOverride,
  type MacroKey,
  type MacroPct,
} from './settingsLogic'

const sum = (p: MacroPct) => p.protein + p.carbs + p.fat

describe('makrofördelning', () => {
  it('normaliserar till heltal som summerar till 100', () => {
    expect(normalizeMacroPct({ protein: 18, carbs: 50, fat: 32 })).toEqual({ protein: 18, carbs: 50, fat: 32 })
    expect(normalizeMacroPct({ protein: 1, carbs: 1, fat: 1 })).toEqual({ protein: 34, carbs: 33, fat: 33 })
    const scaled = normalizeMacroPct({ protein: 30, carbs: 60, fat: 60 })
    expect(sum(scaled)).toBe(100)
    expect(scaled).toEqual({ protein: 20, carbs: 40, fat: 40 })
  })

  it('ogiltiga värden ger NNR:s fördelning', () => {
    expect(normalizeMacroPct(undefined)).toEqual({ protein: 18, carbs: 50, fat: 32 })
    expect(normalizeMacroPct({ protein: Number.NaN, carbs: -5, fat: 0 })).toEqual({ protein: 18, carbs: 50, fat: 32 })
  })

  it('fördelar om proportionellt när ett makro ändras', () => {
    const next = rebalanceMacros({ protein: 20, carbs: 50, fat: 30 }, 'protein', 30)
    expect(next.protein).toBe(30)
    expect(sum(next)).toBe(100)
    // 70 delas 50:30 → 44 och 26
    expect(next).toEqual({ protein: 30, carbs: 44, fat: 26 })
  })

  it('håller alla makron inom sina gränser, även vid extremvärden', () => {
    const keys: MacroKey[] = ['protein', 'carbs', 'fat']
    const start: MacroPct = { protein: 18, carbs: 50, fat: 32 }
    for (const key of keys) {
      for (const value of [-50, 0, 5, 12, 37, 60, 90, 200]) {
        const next = rebalanceMacros(start, key, value)
        expect(sum(next)).toBe(100)
        for (const k of keys) {
          expect(next[k]).toBeGreaterThanOrEqual(MACRO_BOUNDS[k][0])
          expect(next[k]).toBeLessThanOrEqual(MACRO_BOUNDS[k][1])
          expect(Number.isInteger(next[k])).toBe(true)
        }
      }
    }
  })

  it('alla förinställningar ryms inom gränserna', () => {
    for (const p of Object.values(MACRO_PRESETS)) {
      for (const k of ['protein', 'carbs', 'fat'] as const) {
        expect(p[k]).toBeGreaterThanOrEqual(MACRO_BOUNDS[k][0])
        expect(p[k]).toBeLessThanOrEqual(MACRO_BOUNDS[k][1])
      }
    }
  })

  it('räknar gram per dag', () => {
    expect(macroGrams(2000, { protein: 20, carbs: 50, fat: 30 })).toEqual({ protein: 100, carbs: 250, fat: 67 })
  })

  it('påpekar vänligt avvikelser från NNR', () => {
    expect(nnrNote({ protein: 18, carbs: 50, fat: 32 })).toBeNull()
    expect(outsideNnr(MACRO_PRESETS.lchf)).toEqual(['carbs', 'fat'])
    expect(nnrNote(MACRO_PRESETS.lchf)).toMatch(/kolhydrater \(45–60 %\) och fett \(25–40 %\)/)
    expect(nnrNote(MACRO_PRESETS.lchf)).toMatch(/helt okej/)
  })
})

describe('egna mål', () => {
  it('sätter och tar bort överskrivningar', () => {
    const a = withOverride({}, 'kcal', 1800)
    expect(a).toEqual({ kcal: 1800 })
    const b = withOverride(a, 'proteinG', 120)
    expect(overrideCount(b)).toBe(2)
    expect(withOverride(b, 'kcal', undefined)).toEqual({ proteinG: 120 })
    expect(b).toEqual({ kcal: 1800, proteinG: 120 }) // oförändrad
  })
})

describe('måltider', () => {
  it('minst en måltid är alltid på', () => {
    const one = DEFAULT_MEALS.map((m) => ({ ...m, enabled: m.id === 'lunch' }))
    expect(setMealEnabled(one, 'lunch', false)).toEqual(one)
    const two = setMealEnabled(one, 'middag', true)
    expect(two.filter((m) => m.enabled).map((m) => m.id)).toEqual(['lunch', 'middag'])
    expect(setMealEnabled(two, 'lunch', false).filter((m) => m.enabled).map((m) => m.id)).toEqual(['middag'])
  })

  it('byter namn, trimmar och faller tillbaka på standardnamnet', () => {
    expect(renameMeal(DEFAULT_MEALS, 'fika', '  Eftermiddags   fika ').find((m) => m.id === 'fika')?.name).toBe('Eftermiddags fika')
    expect(renameMeal(DEFAULT_MEALS, 'fika', '   ').find((m) => m.id === 'fika')?.name).toBe('Fika')
    expect(renameMeal(DEFAULT_MEALS, 'lunch', 'x'.repeat(50)).find((m) => m.id === 'lunch')?.name).toHaveLength(24)
  })

  it('känner igen standardinställningen', () => {
    expect(mealsAreDefault(DEFAULT_MEALS)).toBe(true)
    expect(mealsAreDefault(renameMeal(DEFAULT_MEALS, 'lunch', 'Dagens'))).toBe(false)
  })
})

describe('visning', () => {
  it('lägger till och tar bort näringsämnen på Idag', () => {
    expect(toggleDashboardNutrient(['protein', 'carbs'], 'fiber', true)).toEqual(['protein', 'carbs', 'fiber'])
    expect(toggleDashboardNutrient(['protein', 'fiber'], 'fiber', true)).toEqual(['protein', 'fiber'])
    expect(toggleDashboardNutrient(['protein', 'fiber'], 'fiber', false)).toEqual(['protein'])
  })

  it('glasstorlekar i deciliter med decimalkomma', () => {
    expect(glassLabel(200)).toBe('2 dl')
    expect(glassLabel(250)).toBe('2,5 dl')
    expect(glassLabel(330)).toBe('3,3 dl')
  })
})

describe('lagring och sparade livsmedel', () => {
  it('formaterar storlekar', () => {
    expect(formatBytes(512)).toBe('512 byte')
    expect(formatBytes(1536)).toBe('1,5 kB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes(123 * 1024 * 1024)).toBe('123 MB')
    expect(formatBytes(-1)).toBe('–')
  })

  const food = (id: string, source: Food['source']): Food => ({ id, name: id, source, category: 'ovrigt', nutrients: {}, portions: [] })
  const cached = {
    'off:1': food('off:1', 'openfoodfacts'),
    'off:2': food('off:2', 'openfoodfacts'),
    'lmv:3': food('lmv:3', 'livsmedelsverket'),
  }

  it('räknar sparade livsmedel per källa', () => {
    expect(cachedFoodStats(cached)).toEqual({ openfoodfacts: 2, livsmedelsverket: 1, other: 0, total: 3 })
  })

  it('rensar per källa men behåller favoriter', () => {
    expect(Object.keys(pruneCachedFoods(cached, 'openfoodfacts'))).toEqual(['lmv:3'])
    expect(Object.keys(pruneCachedFoods(cached, 'all', new Set(['off:2'])))).toEqual(['off:2'])
  })

  it('slår ihop importerade livsmedel', () => {
    const next = mergeImportedFoods(cached, [food('lmv:4', 'livsmedelsverket'), { ...food('lmv:3', 'livsmedelsverket'), name: 'Ny' }])
    expect(Object.keys(next)).toHaveLength(4)
    expect(next['lmv:3'].name).toBe('Ny')
    expect(mergeImportedFoods(cached, [])).toBe(cached)
  })
})

describe('radering och säkerhetskopia', () => {
  it('kräver att man skriver RADERA', () => {
    expect(isDeleteConfirmed('radera ')).toBe(true)
    expect(isDeleteConfirmed('RADERA')).toBe(true)
    expect(isDeleteConfirmed('RADER')).toBe(false)
    expect(isDeleteConfirmed('')).toBe(false)
  })

  it('påminner om säkerhetskopia efter 30 dagar – men bara om det finns data', () => {
    const now = Date.UTC(2026, 8, 26)
    const day = 86_400_000
    expect(backupDue(null, now, false)).toBe(false)
    expect(backupDue(null, now, true)).toBe(true)
    expect(backupDue(now - 10 * day, now, true)).toBe(false)
    expect(backupDue(now - 31 * day, now, true)).toBe(true)
  })
})
