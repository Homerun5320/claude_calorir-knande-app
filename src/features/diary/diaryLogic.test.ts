import type { DiaryEntry, ExerciseEntry, Food, FoodEntry, MealConfig, QuickEntry } from '../../types'
import { DEFAULT_MEALS } from '../../stores/profileStore'
import {
  addFoodHref,
  balanceNote,
  dayBalance,
  dayKind,
  dayPhrase,
  daySummaryText,
  dayTitle,
  defaultMealForDay,
  diaryPath,
  isValidISODate,
  mealAriaSummary,
  mealMacroDots,
  newEntryIds,
  normalizeNote,
  normalizeTime,
  quickNutrientsPatch,
  quickTargetDates,
  shortFoodName,
  suggestTemplateName,
  targetPhrase,
  templateItems,
  visibleMeals,
  withoutIdentity,
} from './diaryLogic'

const TODAY = '2026-09-26' // lördag

const GROT: Food = {
  id: 'lagom:havregrynsgrot',
  name: 'Havregrynsgröt, kokt i vatten',
  source: 'lagom',
  category: 'spannmal',
  nutrients: { kcal: 70, protein: 2.5, carbs: 11, fat: 1.3 },
  portions: [],
  density: 1,
}

const LAX: Food = {
  id: 'lagom:lax',
  name: 'Lax, ugnsbakad',
  source: 'lagom',
  category: 'fisk',
  nutrients: { kcal: 200, protein: 22, fat: 12 },
  portions: [{ id: 'bit', label: '1 bit', grams: 125 }],
}

function food(f: Food, grams: number, meal: FoodEntry['meal'], extra: Partial<FoodEntry> = {}): FoodEntry {
  return { id: `e_${f.id}_${meal}_${grams}`, kind: 'food', food: f, amount: grams, unit: 'g', grams, date: TODAY, meal, createdAt: 1, ...extra }
}

function quick(name: string, nutrients: QuickEntry['nutrients'], meal: QuickEntry['meal']): QuickEntry {
  return { id: `q_${name}`, kind: 'quick', name, nutrients, date: TODAY, meal, createdAt: 2 }
}

describe('datum och adresser', () => {
  it('validerar kalenderdagar', () => {
    expect(isValidISODate('2026-09-26')).toBe(true)
    expect(isValidISODate('2024-02-29')).toBe(true)
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-9-26')).toBe(false)
    expect(isValidISODate('idag')).toBe(false)
    expect(isValidISODate(undefined)).toBe(false)
  })

  it('klassar dagar som tidigare, idag eller planerade', () => {
    expect(dayKind(TODAY, TODAY)).toBe('today')
    expect(dayKind('2026-09-25', TODAY)).toBe('past')
    expect(dayKind('2026-09-28', TODAY)).toBe('future')
  })

  it('bygger adresser för dagboken och "Lägg till"', () => {
    expect(diaryPath(TODAY, TODAY)).toBe('/dagbok')
    expect(diaryPath('2026-09-20', TODAY)).toBe('/dagbok/2026-09-20')
    expect(addFoodHref('lunch', '2026-09-20')).toBe('/lagg-till?maltid=lunch&datum=2026-09-20')
  })

  it('skriver dagar i löptext och som rubrik', () => {
    expect(dayPhrase(TODAY, TODAY)).toBe('idag')
    expect(dayPhrase('2026-09-25', TODAY)).toBe('igår')
    expect(dayPhrase('2026-09-27', TODAY)).toBe('imorgon')
    expect(dayPhrase('2026-09-22', TODAY)).toBe('tisdag 22 september')
    expect(dayTitle(TODAY, TODAY)).toBe('Idag, lördag 26 september')
    expect(dayTitle('2026-09-22', TODAY)).toBe('Tisdag 22 september')
  })

  it('ger snabbval för kopiera/flytta utan källdagen', () => {
    expect(quickTargetDates(TODAY).map((d) => d.label)).toEqual(['Igår', 'Idag', 'Imorgon'])
    expect(quickTargetDates(TODAY, TODAY).map((d) => d.label)).toEqual(['Igår', 'Imorgon'])
  })
})

describe('måltider', () => {
  it('visar aktiverade måltider i ordning plus avstängda som har poster', () => {
    const none = visibleMeals(DEFAULT_MEALS, {})
    expect(none.map((m) => m.id)).toEqual(['frukost', 'lunch', 'fika', 'middag', 'mellanmal'])
    const withEvening = visibleMeals(DEFAULT_MEALS, { kvallsmat: [food(GROT, 100, 'kvallsmat')] })
    expect(withEvening.map((m) => m.id)).toEqual(['frukost', 'lunch', 'fika', 'middag', 'kvallsmat', 'mellanmal'])
  })

  it('följer användarens ordning', () => {
    const meals: MealConfig[] = [
      { id: 'lunch', name: 'Lunch', enabled: true },
      { id: 'frukost', name: 'Morgonmål', enabled: true },
    ]
    expect(visibleMeals(meals, {}).map((m) => m.name)).toEqual(['Lunch', 'Morgonmål'])
    // En måltid som saknas i inställningarna men har poster visas sist med standardnamn.
    expect(visibleMeals(meals, { middag: [food(LAX, 125, 'middag')] }).map((m) => m.name)).toEqual(['Lunch', 'Morgonmål', 'Middag'])
  })

  it('väljer förvald måltid efter klockslaget bara för idag', () => {
    const lunchTime = new Date(2026, 8, 26, 12, 15)
    expect(defaultMealForDay(DEFAULT_MEALS, TODAY, TODAY, lunchTime)).toBe('lunch')
    expect(defaultMealForDay(DEFAULT_MEALS, '2026-09-20', TODAY, lunchTime)).toBe('frukost')
  })

  it('räknar makroprickar och läser upp måltiden', () => {
    expect(mealMacroDots({ kcal: 300, protein: 20, fat: 10 }).map((d) => d.short)).toEqual(['P', 'F'])
    const entries = [food(LAX, 125, 'middag')]
    expect(mealAriaSummary('Middag', entries, 'kcal', false)).toBe('Middag: 250 kcal, 1 post')
    expect(mealAriaSummary('Middag', entries, 'kcal', true)).toBe('Middag: 1 post')
    expect(mealAriaSummary('Fika', [], 'kcal', false)).toBe('Fika: inget registrerat')
  })

  it('beskriver kopieringsmål', () => {
    expect(targetPhrase(DEFAULT_MEALS, 'lunch', '2026-09-27', TODAY)).toBe('lunch imorgon')
  })
})

describe('balans', () => {
  it('räknar kvar, över och lagom', () => {
    expect(dayBalance(1500, 2000)).toMatchObject({ eaten: 1500, budget: 2000, remaining: 500, over: 0, status: 'kvar' })
    expect(dayBalance(2300, 2000)).toMatchObject({ remaining: 0, over: 300, status: 'over' })
    expect(dayBalance(2020, 2000).status).toBe('lagom')
    expect(dayBalance(undefined, 2000).status).toBe('tom')
  })

  it('är aldrig dömande', () => {
    const over = balanceNote('over', 'today')
    expect(over).toMatch(/helt okej/)
    expect(over).not.toMatch(/för mycket/i)
    expect(balanceNote('tom', 'future')).toMatch(/planerat/i)
  })
})

describe('poster', () => {
  it('hittar nyss tillagda poster för ångra', () => {
    const a = food(GROT, 100, 'frukost', { id: 'a' })
    const b = food(LAX, 100, 'lunch', { id: 'b' })
    const c = food(LAX, 100, 'lunch', { id: 'c' })
    expect(newEntryIds([a], [a, b, c])).toEqual(['b', 'c'])
    expect(newEntryIds(undefined, [a])).toEqual(['a'])
    expect(newEntryIds([a], undefined)).toEqual([])
  })

  it('tar bort id och tidsstämpel inför kopiering', () => {
    const copy = withoutIdentity(food(GROT, 100, 'frukost', { note: 'god' }))
    expect(copy).not.toHaveProperty('id')
    expect(copy).not.toHaveProperty('createdAt')
    expect(copy).toMatchObject({ kind: 'food', grams: 100, note: 'god' })
  })

  it('behandlar tomma fält i snabbregistreringar som okända, inte noll', () => {
    const next = quickNutrientsPatch({ kcal: 300, protein: 10, fiber: 4 }, { kcal: 250, protein: undefined, fat: 12 })
    expect(next).toEqual({ kcal: 250, fat: 12, fiber: 4 })
    expect('protein' in next).toBe(false)
    // Fält som inte redigerats rörs inte.
    expect(quickNutrientsPatch({ kcal: 100, carbs: 5 }, {})).toEqual({ kcal: 100, carbs: 5 })
    // Negativa värden räknas som okända.
    expect(quickNutrientsPatch({ kcal: 100 }, { kcal: -5 })).toEqual({})
  })

  it('normaliserar klockslag och anteckningar', () => {
    expect(normalizeTime('7:05')).toBe('07:05')
    expect(normalizeTime('18:30')).toBe('18:30')
    expect(normalizeTime('25:00')).toBeUndefined()
    expect(normalizeTime('')).toBeUndefined()
    expect(normalizeNote('  ')).toBeUndefined()
    expect(normalizeNote(' god ')).toBe('god')
  })
})

describe('sparade måltider', () => {
  it('sparar bara livsmedelsposter med vikt', () => {
    const entries: DiaryEntry[] = [food(GROT, 300, 'frukost'), quick('Kaffe med mjölk', { kcal: 30 }, 'frukost'), food(LAX, 0, 'frukost')]
    const items = templateItems(entries)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ amount: 300, unit: 'g', grams: 300 })
    expect(items[0].food.id).toBe(GROT.id)
  })

  it('kortar namn utan att dela decimalkomma', () => {
    expect(shortFoodName('Lax, ugnsbakad')).toBe('Lax')
    expect(shortFoodName('Mjölk mellan 1,5 % fett')).toBe('Mjölk mellan 1,5 % fett')
    expect(shortFoodName('Mjölk mellan 1,5 % fett, laktosfri')).toBe('Mjölk mellan 1,5 % fett')
  })

  it('föreslår ett läsbart namn', () => {
    expect(suggestTemplateName('Frukost', [food(GROT, 300, 'frukost')])).toBe('Havregrynsgröt')
    expect(suggestTemplateName('Middag', [food(LAX, 125, 'middag'), food(GROT, 100, 'middag')])).toBe('Lax och havregrynsgröt')
    expect(suggestTemplateName('Fika', [quick('Bulle', { kcal: 250 }, 'fika')])).toBe('Fika')
    const milk: Food = { ...GROT, id: 'lagom:mjolk', name: 'Mjölk mellan 1,5 % fett' }
    expect(suggestTemplateName('Frukost', [food(GROT, 300, 'frukost'), food(milk, 100, 'frukost')])).toBe('Havregrynsgröt och mjölk mellan 1,5 % fett')
  })
})

describe('daySummaryText', () => {
  const entries: DiaryEntry[] = [
    food(GROT, 300, 'frukost'),
    food(LAX, 125, 'middag', { unit: 'portion:bit', amount: 1 }),
    quick('Kanelbulle', { kcal: 250 }, 'fika'),
  ]
  const exercise: ExerciseEntry[] = [
    { id: 'x', date: TODAY, activityId: 'promenad', name: 'Promenad', minutes: 45, kcal: 150, createdAt: 1 },
  ]

  it('sammanfattar dagen på svenska med decimalkomma och måltider i ordning', () => {
    // Intl använder hårt mellanslag som tusentalsavgränsare – jämför med vanliga mellanslag.
    const text = daySummaryText({ date: TODAY, today: TODAY, meals: DEFAULT_MEALS, entries, exercise, waterMl: 1500, budgetKcal: 2000 }).replace(/\u00a0/g, ' ')
    const lines = text.split('\n')
    expect(lines[0]).toBe('Min dag i Lagom – Idag, lördag 26 september')
    expect(lines[1]).toBe('Ätit 710 kcal av 2 000 kcal – 1 290 kcal kvar')
    expect(lines[2]).toBe('Protein 35 g · Kolhydrater 33 g · Fett 19 g')
    expect(text).toContain('🥣 Frukost – 210 kcal')
    expect(text).toContain('• Havregrynsgröt, kokt i vatten, 300 g – 210 kcal')
    expect(text).toContain('• Lax, ugnsbakad, 1 bit (125 g) – 250 kcal')
    expect(text).toContain('• Kanelbulle – 250 kcal')
    expect(text.indexOf('Frukost')).toBeLessThan(text.indexOf('Fika'))
    expect(text.indexOf('Fika')).toBeLessThan(text.indexOf('Middag'))
    expect(text).toContain('Träning: Promenad 45 min (150 kcal)')
    expect(text).toContain('Vatten: 1,5 l')
  })

  it('säger "över – helt okej" och visar kJ när det är valt', () => {
    const text = daySummaryText({ date: TODAY, today: TODAY, meals: DEFAULT_MEALS, entries, budgetKcal: 600, unit: 'kJ' })
    expect(text).toMatch(/över – helt okej/)
    expect(text).toContain('kJ')
    expect(text).not.toMatch(/\bkcal\b/)
  })

  it('visar inga siffror för energi i medvetet läge', () => {
    const text = daySummaryText({ date: TODAY, today: TODAY, meals: DEFAULT_MEALS, entries, exercise, budgetKcal: 2000, mindful: true })
    expect(text).not.toMatch(/kcal/)
    expect(text).not.toMatch(/Protein/)
    expect(text).toContain('🥣 Frukost\n')
    expect(text).toContain('Träning: Promenad 45 min')
  })

  it('visar "–" för okänd energi och hanterar planerade och tomma dagar', () => {
    const unknown = quick('Något gott', {}, 'fika')
    const text = daySummaryText({ date: '2026-09-27', today: TODAY, meals: DEFAULT_MEALS, entries: [unknown] })
    expect(text.split('\n')[0]).toBe('Min plan i Lagom – Imorgon, söndag 27 september')
    expect(text).toContain('• Något gott – –')
    expect(text).toContain('Planerat 0 kcal')
    const empty = daySummaryText({ date: '2026-09-20', today: TODAY, meals: DEFAULT_MEALS, entries: [], complete: true })
    expect(empty).toContain('Inget registrerat.')
    expect(empty).toContain('Dagen är markerad som klar')
  })
})
