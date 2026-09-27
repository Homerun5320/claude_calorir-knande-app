/**
 * Livsmedelsregistret: de inbyggda klassikerna ('recipe:klassiker-*') ska gå att slå upp som
 * livsmedel – annars försvinner en loggad klassiker från Senaste, favoriter och detaljsidan.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { getFoodById, loadBuiltinCatalog, recipeFood, resolveFoodSync, type BuiltinCatalog } from './foodRepo'
import { recipeFoodId } from './recipes'

let catalog: BuiltinCatalog

beforeAll(async () => {
  // Livsmedelsverkets fil finns inte i testmiljön.
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
  catalog = await loadBuiltinCatalog()
})

describe('inbyggda recept i registret', () => {
  it('läser in klassikerna tillsammans med livsmedlen', () => {
    expect(catalog.error).toBeUndefined()
    expect(catalog.recipes.length).toBeGreaterThan(20)
    expect(catalog.recipes.every((r) => r.builtin && r.id.startsWith('klassiker-'))).toBe(true)
    expect(catalog.recipeFoods).toHaveLength(catalog.recipes.length)
  })

  it('slår upp en klassiker på livsmedels-id – samma objekt som när den loggas', () => {
    const kottbullar = catalog.recipes.find((r) => r.id === 'klassiker-kottbullar')
    expect(kottbullar).toBeDefined()
    const id = recipeFoodId('klassiker-kottbullar')
    const food = catalog.byId.get(id)
    expect(food).toMatchObject({ id: 'recipe:klassiker-kottbullar', name: 'Köttbullar', source: 'recipe', category: 'fardigratt' })
    expect(food).toBe(recipeFood(kottbullar!))
    expect(resolveFoodSync(id)).toBe(food)
    expect(food?.portions[0]).toMatchObject({ id: 'portion' })
    expect(food?.nutrients.kcal).toBeGreaterThan(0)
  })

  it('hittar klassikerna asynkront och låter livsmedelslistan vara orörd', async () => {
    await expect(getFoodById('recipe:klassiker-pannkakor')).resolves.toMatchObject({ name: 'Pannkakor', source: 'recipe' })
    await expect(getFoodById('recipe:klassiker-finns-inte')).resolves.toBeUndefined()
    // Databasens livsmedelslista (t.ex. antal i Inställningar) innehåller bara livsmedel.
    expect(catalog.foods.some((f) => f.source === 'recipe')).toBe(false)
  })

  it('ger samma recept i båda stegen av inläsningen', async () => {
    const again = await loadBuiltinCatalog()
    expect(again.recipes).toBe(catalog.recipes)
    expect(again.recipeFoods).toBe(catalog.recipeFoods)
  })
})
