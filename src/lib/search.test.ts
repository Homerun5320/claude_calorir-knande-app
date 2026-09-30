/**
 * Tester för Lagoms livsmedelssök. Kör: npx vitest run src/lib/search.test.ts
 */
import { describe, expect, it } from 'vitest'
import type { Food, FoodCategory, FoodSource, MealId } from '../types'
import type { FoodUsage } from '../stores/foodStore'
import { createSearchIndex, foldSv, highlightSv, isCompositeFood, normalizeSv, searchFoods, stemSv, type SearchOptions } from './search'
import { BUILTIN_FOODS } from '../data/foods'
import { STAPLE_FOODS } from '../data/foods/staples'
import { loadBuiltinRecipes } from '../data/recipes'
import { recipeFood } from './foodRepo'
import { DEMO_FAVORITES, demoFoodIds } from './demo'
import { createUsageBoost } from '../hooks/useFoodSearch'

let seq = 0
function food(
  name: string,
  category: FoodCategory,
  extra: Partial<Omit<Food, 'name' | 'category'>> & { source?: FoodSource } = {},
): Food {
  seq++
  return {
    id: extra.id ?? `lagom:t${seq}`,
    source: extra.source ?? 'lagom',
    nutrients: { kcal: 100 },
    portions: [],
    ...extra,
    name,
    category,
  }
}

const FOODS: Food[] = [
  food('Mjölk 3 %', 'mejeri', { id: 'lagom:mjolk-3', synonyms: ['standardmjölk', 'helmjölk'] }),
  food('Mjölk mellan 1,5 % fett', 'mejeri', { id: 'lagom:mellanmjolk', synonyms: ['mellanmjölk'] }),
  food('Lättmjölk 0,5 %', 'mejeri', { id: 'lagom:lattmjolk' }),
  food('Mjölkchoklad', 'sotsaker', { id: 'lagom:mjolkchoklad' }),
  food('Chokladmjölk', 'mejeri', { id: 'lagom:chokladmjolk', synonyms: ["O'boy"] }),
  food('Mjöl vete', 'spannmal', { id: 'lagom:vetemjol', synonyms: ['vetemjöl'] }),
  food('Köttbullar stekta', 'fardigratt', { id: 'lagom:kottbullar', synonyms: ['köttbulle'] }),
  food('Kycklingbröstfilé rå', 'fagel', { id: 'lagom:kycklingfile' }),
  food('Kycklinglårfilé grillad', 'fagel', { id: 'lagom:kycklinglar' }),
  food('Kyckling hel grillad', 'fagel', { id: 'lagom:grillad-kyckling', synonyms: ['grillkyckling'] }),
  food('Fläskfilé', 'rott_kott', { id: 'lagom:flaskfile' }),
  food('Prästost 31 %', 'ost', { id: 'lagom:prastost' }),
  food('Herrgårdsost 28 %', 'ost', { id: 'lagom:herrgard' }),
  food('Ostkaka', 'bakverk', { id: 'lagom:ostkaka' }),
  food('Rostbiff', 'rott_kott', { id: 'lagom:rostbiff' }),
  food('Vitkål', 'gronsaker', { id: 'lagom:vitkal' }),
  food('Kalkonbröst pålägg', 'chark', { id: 'lagom:kalkon' }),
  food('Kalops', 'fardigratt', { id: 'lagom:kalops' }),
  food('Kanelbulle', 'bakverk', { id: 'lagom:kanelbulle', synonyms: ['bulle', 'kanelsnäcka'] }),
  food('Tomat', 'gronsaker', { id: 'lagom:tomat' }),
  food('Tomatsoppa', 'fardigratt', { id: 'lagom:tomatsoppa' }),
  food('Äpple', 'frukt', { id: 'lagom:apple' }),
  food('Äppelmos', 'frukt', { id: 'lagom:appelmos' }),
  food('Banan', 'frukt', { id: 'lagom:banan' }),
  food('Havregryn', 'spannmal', { id: 'lagom:havregryn' }),
  food('Havregrynsgröt', 'spannmal', { id: 'lagom:grot', synonyms: ['gröt'] }),
  food('Kaffe bryggt', 'dryck', { id: 'lagom:kaffe' }),
  food('Kaffe med mjölk', 'dryck', { id: 'lagom:kaffe-mjolk' }),
  food('Coca-Cola', 'lask_saft', { id: 'lagom:cola' }),
  food('Räkor kokta', 'skaldjur', { id: 'lagom:rakor' }),
  food('Morötter kokta', 'rotfrukter', { id: 'lagom:morotter' }),
  food('Ris jasmin kokt', 'pasta_ris', { id: 'lagom:ris' }),
  food('Grisfilé', 'rott_kott', { id: 'lagom:grisfile' }),
  food('Mellanmjölk', 'mejeri', { id: 'off:7310865004703', source: 'openfoodfacts', brand: 'Arla' }),
  food('Mjölk fett 3%', 'mejeri', { id: 'lmv:1', source: 'livsmedelsverket' }),
  food('Crème fraiche 34 %', 'mejeri', { id: 'lagom:cremefraiche' }),
  food('Smörgåsgurka', 'gronsaker', { id: 'lagom:smorgasgurka' }),
  food('Fil 3 %', 'mejeri', { id: 'lagom:fil' }),
  food('Ostron, råa', 'skaldjur', { id: 'lagom:ostron' }),
]

const index = createSearchIndex(FOODS)
const ids = (query: string, opts?: Parameters<typeof searchFoods>[2]) => searchFoods(index, query, opts).map((r) => r.food.id)
const top = (query: string, opts?: Parameters<typeof searchFoods>[2]) => searchFoods(index, query, opts)[0]

describe('normalizeSv / foldSv', () => {
  it('gör gemener, komprimerar blanksteg och tar bort skiljetecken', () => {
    expect(normalizeSv('  Kanelbulle,   bageri! ')).toBe('kanelbulle bageri')
    expect(normalizeSv('Coca-Cola')).toBe('coca cola')
    expect(normalizeSv("Ben & Jerry's")).toBe('ben jerrys')
  })

  it('behåller decimalkomma men tar bort procent', () => {
    expect(normalizeSv('Mjölk 1,5%')).toBe('mjölk 1,5')
    expect(normalizeSv('mjölk 1.5 %')).toBe('mjölk 1,5')
    expect(normalizeSv('Mjölk 3 %')).toBe('mjölk 3')
    expect(normalizeSv('Salt, jodberikat')).toBe('salt jodberikat')
  })

  it('behåller å/ä/ö men tar bort andra accenter', () => {
    expect(normalizeSv('Kycklingbröstfilé')).toBe('kycklingbröstfile')
    expect(normalizeSv('MÜSLI')).toBe('musli')
    expect(normalizeSv('Crème Fraîche')).toBe('creme fraiche')
    expect(normalizeSv('ÅÄÖ')).toBe('åäö')
    expect(normalizeSv('Smørrebrød')).toBe('smörrebröd')
  })

  it('viker å/ä/ö till ASCII', () => {
    expect(foldSv('Köttbullar')).toBe('kottbullar')
    expect(foldSv('Mjölk')).toBe('mjolk')
    expect(foldSv('Räkor på båt')).toBe('rakor pa bat')
  })

  it('stammar vanliga böjningsformer', () => {
    expect(stemSv('köttbullar')).toBe(stemSv('köttbulle'))
    expect(stemSv('tomater')).toBe(stemSv('tomat'))
    expect(stemSv('räkor')).toBe(stemSv('räka'))
    expect(stemSv('äpplen')).toBe(stemSv('äpple'))
    expect(stemSv('morötter')).toBe('morot')
    expect(stemSv('ost')).toBe('ost')
    expect(stemSv('1,5')).toBe('1,5')
  })
})

describe('searchFoods', () => {
  it('ger tom lista för tom sökning', () => {
    expect(searchFoods(index, '')).toEqual([])
    expect(searchFoods(index, '   ')).toEqual([])
    expect(searchFoods(index, '%%')).toEqual([])
  })

  it('rankar exakt namn högst', () => {
    const r = top('tomat')
    expect(r.food.id).toBe('lagom:tomat')
    expect(r.matched).toBe('exact')
    expect(top('Kanelbulle').matched).toBe('exact')
  })

  it('föredrar korta, basala namn: "Mjölk 3 %" före "Mjölkchoklad"', () => {
    const list = ids('mjölk')
    expect(list[0]).toBe('lagom:mjolk-3')
    expect(list.indexOf('lagom:mjolk-3')).toBeLessThan(list.indexOf('lagom:mjolkchoklad'))
    expect(list.indexOf('lagom:mellanmjolk')).toBeLessThan(list.indexOf('lagom:mjolkchoklad'))
    // Sammansatta ord med "mjölk" som huvudord hittas också.
    expect(list).toContain('lagom:lattmjolk')
    expect(list).toContain('lagom:chokladmjolk')
  })

  it('hittar å/ä/ö även när användaren skriver utan dem', () => {
    expect(top('kottbullar').food.id).toBe('lagom:kottbullar')
    expect(top('mjolk').food.id).toBe('lagom:mjolk-3')
    expect(ids('rakor')).toContain('lagom:rakor')
    expect(ids('prastost')[0]).toBe('lagom:prastost')
  })

  it('är exakt med å/ä/ö när användaren skriver dem: "kål" ger inte "kalkon"', () => {
    const list = ids('kål')
    expect(list).toContain('lagom:vitkal')
    expect(list).not.toContain('lagom:kalkon')
    expect(list).not.toContain('lagom:kalops')
    // Utan å matchar "kal" både kalkon och kalops.
    expect(ids('kal')).toEqual(expect.arrayContaining(['lagom:kalkon', 'lagom:kalops']))
  })

  it('matchar inuti svenska sammansatta ord', () => {
    expect(ids('kyckling')).toEqual(
      expect.arrayContaining(['lagom:kycklingfile', 'lagom:kycklinglar', 'lagom:grillad-kyckling']),
    )
    expect(ids('filé')).toEqual(expect.arrayContaining(['lagom:kycklingfile', 'lagom:flaskfile']))
    expect(ids('file')).toContain('lagom:kycklingfile')
    // "filé" är inte en böjning av "fil".
    expect(ids('filé')).not.toContain('lagom:fil')
    expect(ids('fil')[0]).toBe('lagom:fil')
    expect(ids('bröst')).toContain('lagom:kycklingfile')
    expect(ids('ost')).toEqual(expect.arrayContaining(['lagom:prastost', 'lagom:herrgard', 'lagom:ostkaka']))
  })

  it('rankar huvudord i sammansättningar före förled och andra ord', () => {
    const list = ids('ost')
    // "Prästost" och "Herrgårdsost" är ostar, "Ostkaka" är en kaka och "Ostron" ett skaldjur.
    expect(list.indexOf('lagom:prastost')).toBeLessThan(list.indexOf('lagom:ostkaka'))
    expect(list.indexOf('lagom:herrgard')).toBeLessThan(list.indexOf('lagom:ostron'))
    expect(list.indexOf('lagom:ostkaka')).toBeLessThan(list.indexOf('lagom:ostron'))
    // Förled i sammansättning ("Mjölkchoklad") ligger under huvudord ("Lättmjölk").
    const milk = ids('mjölk')
    expect(milk.indexOf('lagom:lattmjolk')).toBeLessThan(milk.indexOf('lagom:mjolkchoklad'))
    // Böjningsform räknas som ordgräns.
    const r = searchFoods(createSearchIndex([food('Tomater, krossade', 'gronsaker', { id: 'x:1' }), food('Tomatsoppa', 'fardigratt', { id: 'x:2' })]), 'tomat')
    expect(r.map((x) => x.food.id)).toEqual(['x:1', 'x:2'])
    expect(r[0].matched).toBe('prefix')
  })

  it('kräver samma första bokstav vid stavfel', () => {
    const idx = createSearchIndex([food('Köttbullar, hemlagade', 'fardigratt', { id: 'x:1' }), food('Semlor', 'bakverk', { id: 'x:2' })])
    expect(searchFoods(idx, 'semla').map((x) => x.food.id)).toEqual(['x:2'])
    expect(searchFoods(idx, 'hemlgade').map((x) => x.food.id)).toEqual(['x:1'])
  })

  it('undviker brus från korta ord inuti andra ord', () => {
    // "ost" finns i "rostbiff" men är inte en del av sammansättningen.
    expect(ids('ost')).not.toContain('lagom:rostbiff')
    // "ris" är slutet på "gris" men "g" är inget eget ord.
    expect(ids('ris')).not.toContain('lagom:grisfile')
    expect(ids('ris')[0]).toBe('lagom:ris')
  })

  it('kombinerar flera ord i valfri ordning', () => {
    expect(top('kyckling bröst').food.id).toBe('lagom:kycklingfile')
    expect(top('filé kyckling').food.id).toBe('lagom:kycklingfile')
    expect(top('grillad kyckling').food.id).toBe('lagom:grillad-kyckling')
    expect(top('mjölk 1,5').food.id).toBe('lagom:mellanmjolk')
    expect(top('mjolk 1.5%').food.id).toBe('lagom:mellanmjolk')
  })

  it('ignorerar småord som "med"', () => {
    expect(top('kaffe med mjölk').food.id).toBe('lagom:kaffe-mjolk')
    expect(top('kaffe med mjölk').matched).toBe('exact')
    expect(ids('kaffe mjölk')[0]).toBe('lagom:kaffe-mjolk')
  })

  it('matchar namn utan mellanslag och bindestreck', () => {
    expect(top('cocacola').food.id).toBe('lagom:cola')
    expect(top('coca cola').food.id).toBe('lagom:cola')
  })

  it('använder synonymer och varumärke', () => {
    const bulle = searchFoods(index, 'kanelsnäcka')[0]
    expect(bulle.food.id).toBe('lagom:kanelbulle')
    expect(bulle.matched).toBe('synonym')
    expect(top('grillkyckling').food.id).toBe('lagom:grillad-kyckling')
    expect(top('oboy').food.id).toBe('lagom:chokladmjolk')
    expect(top('arla').food.id).toBe('off:7310865004703')
    expect(top('arla mellanmjölk').food.id).toBe('off:7310865004703')
  })

  it('sätter vardagsbegreppet först när sökningen är exakt en synonym: "kyckling" → Kycklingbröst', () => {
    const foods = [
      food('Grillkyckling', 'fagel', { id: 'lagom:grill' }),
      food('Kycklingwrap', 'fardigratt', { id: 'lagom:wrap' }),
      food('Kycklingbröst', 'fagel', { id: 'lagom:brost', synonyms: ['kyckling', 'kycklingfilé'] }),
      food('Hårdost 17 %', 'ost', { id: 'lagom:hardost' }),
      food('Hushållsost 26 %', 'ost', { id: 'lagom:hushallsost', synonyms: ['ost'] }),
    ]
    const idx = createSearchIndex(foods)
    expect(searchFoods(idx, 'kyckling')[0].food.id).toBe('lagom:brost')
    expect(searchFoods(idx, 'kyckling').map((r) => r.food.id)).toContain('lagom:grill')
    expect(searchFoods(idx, 'ost')[0].food.id).toBe('lagom:hushallsost')
    // Ett exakt namn går fortfarande först.
    expect(searchFoods(idx, 'grillkyckling')[0].food.id).toBe('lagom:grill')
  })

  it('förstår böjningsformer', () => {
    expect(ids('köttbulle')[0]).toBe('lagom:kottbullar')
    expect(ids('tomater')[0]).toBe('lagom:tomat')
    expect(ids('räka')).toContain('lagom:rakor')
    expect(ids('morot')).toContain('lagom:morotter')
    expect(ids('äpplen')[0]).toBe('lagom:apple')
    expect(ids('bullar')).toContain('lagom:kanelbulle')
    // Böjning av namnets första ord går före sammansättningar.
    const idx = createSearchIndex([
      food('Kycklingköttbullar, färdiga', 'fardigratt', { id: 'x:1' }),
      food('Köttbullar, hemlagade, stekta', 'fardigratt', { id: 'x:2' }),
    ])
    const r = searchFoods(idx, 'köttbulle')
    expect(r.map((x) => x.food.id)).toEqual(['x:2', 'x:1'])
    expect(r[0].matched).toBe('prefix')
  })

  it('tål stavfel', () => {
    const r = searchFoods(index, 'kycklng')
    expect(r.map((x) => x.food.id)).toContain('lagom:kycklingfile')
    expect(r[0].matched).toBe('fuzzy')
    expect(top('havregyrn').food.id).toBe('lagom:havregryn') // omkastade bokstäver
    expect(top('kaffee').food.id).toBe('lagom:kaffe')
    expect(top('bannan').food.id).toBe('lagom:banan')
    expect(top('mjök').food.id).toBe('lagom:mjolk-3')
  })

  it('tillåter inte för många stavfel i korta ord', () => {
    expect(ids('xyzq')).toEqual([])
    expect(ids('tmt')).toEqual([])
  })

  it('föredrar svenska källor framför Open Food Facts vid lika träff', () => {
    const idx = createSearchIndex([
      food('Havredryck', 'vaxtdryck', { id: 'off:1', source: 'openfoodfacts' }),
      food('Havredryck', 'vaxtdryck', { id: 'lmv:2', source: 'livsmedelsverket' }),
      food('Havredryck', 'vaxtdryck', { id: 'lagom:3' }),
    ])
    expect(searchFoods(idx, 'havredryck').map((r) => r.food.id)).toEqual(['lagom:3', 'lmv:2', 'off:1'])
  })

  it('tillämpar boost (t.ex. användning och favoriter)', () => {
    const plain = ids('mjölk')
    expect(plain[0]).toBe('lagom:mjolk-3')
    // Inom samma nivå räcker en måttlig boost för att vinna.
    expect(ids('mjölk', { boost: (f) => (f.id === 'lagom:mellanmjolk' ? 60 : 0) })[0]).toBe('lagom:mellanmjolk')
    // En liten boost räcker inte för att passera en högre nivå …
    const small = ids('mjölk', { boost: (f) => (f.id === 'lagom:lattmjolk' ? 30 : 0) })
    expect(small[0]).toBe('lagom:mjolk-3')
    // … men ett ofta använt livsmedel (stor boost) hamnar överst.
    expect(ids('mjölk', { boost: (f) => (f.id === 'lagom:lattmjolk' ? 200 : 0) })[0]).toBe('lagom:lattmjolk')
    // En boost som inte är ett tal ignoreras.
    expect(ids('mjölk', { boost: () => Number.NaN })[0]).toBe('lagom:mjolk-3')
  })

  it('filtrerar på kategori och respekterar limit', () => {
    expect(ids('mjölk', { categories: ['sotsaker'] })).toEqual(['lagom:mjolkchoklad'])
    expect(ids('mjölk', { limit: 2 })).toHaveLength(2)
  })

  it('listar en kategori vid tom sökning med kategorifilter', () => {
    const r = searchFoods(index, '', { categories: ['ost'] })
    expect(r.map((x) => x.food.id).sort()).toEqual(['lagom:herrgard', 'lagom:prastost'])
  })

  it('slår ihop flera index och tar bort dubbletter', () => {
    const user = createSearchIndex([food('Mjölk 3 %', 'mejeri', { id: 'lagom:mjolk-3' }), food('Mammas mjölkbullar', 'bakverk', { id: 'custom:1', source: 'custom' })])
    const r = searchFoods([user, index], 'mjölk')
    const list = r.map((x) => x.food.id)
    expect(new Set(list).size).toBe(list.length)
    expect(list).toContain('custom:1')
    expect(list[0]).toBe('lagom:mjolk-3')
  })

  it('visar delvisa träffar när inget matchar alla ord', () => {
    const r = searchFoods(index, 'banan flarpigt')
    expect(r[0]?.food.id).toBe('lagom:banan')
    expect(r[0]?.matched).toBe('fuzzy')
  })

  it('kastar för okända index', () => {
    expect(() => searchFoods({ foods: [], size: 0 }, 'mjölk')).toThrow(/sökindex/)
  })

  it('är snabb: under 5 ms per sökning bland 3 000 livsmedel', () => {
    const bases = ['Mjölk', 'Kyckling', 'Nötfärs', 'Lax', 'Potatis', 'Ris', 'Pasta', 'Ost', 'Bröd', 'Knäckebröd', 'Äpple', 'Päron', 'Yoghurt', 'Fil', 'Korv', 'Skinka', 'Bulle', 'Kaka', 'Choklad', 'Sylt', 'Gröt', 'Soppa', 'Gryta', 'Sallad', 'Juice', 'Läsk', 'Öl', 'Vin', 'Kaffe', 'Te']
    const mods = ['rå', 'kokt', 'stekt', 'grillad', 'rökt', 'fullkorn', 'laktosfri', 'eko', 'naturell', 'vanilj', 'jordgubb', 'blåbär', 'hallon', 'citron', 'kanel', 'lätt', 'mellan', 'extra', 'mini', 'maxi']
    const prefixes = ['', 'Kyckling', 'Fläsk', 'Havre', 'Råg', 'Vete', 'Grädd', 'Choklad', 'Frukt']
    const big: Food[] = []
    let n = 0
    outer: for (const p of prefixes) {
      for (const b of bases) {
        for (const m of mods) {
          const name = `${p}${p ? b.toLowerCase() : b} ${m} ${(n % 37) / 2} %`
          big.push(food(name, 'ovrigt', { id: `big:${n}`, synonyms: n % 5 === 0 ? [`${b.toLowerCase()}${m}`] : undefined }))
          if (++n >= 3000) break outer
        }
      }
    }
    expect(big).toHaveLength(3000)
    const t0 = performance.now()
    const bigIndex = createSearchIndex(big)
    const buildMs = performance.now() - t0
    expect(buildMs).toBeLessThan(500)

    const queries = [
      'mjölk', 'kyck', 'kyckling grillad', 'kycklng', 'nötfärs', 'notfars', 'lax rökt', 'potatis', 'ris kokt', 'pasta',
      'ost', 'knäckebröd fullkorn', 'äpple', 'paron', 'yoghurt vanilj', 'fil', 'korv', 'skinka rökt', 'bulle kanel', 'kaka',
      'choklad', 'sylt jordgubb', 'gröt havre', 'soppa', 'gryta', 'sallad', 'juice', 'läsk', 'öl', 'vin', 'kaffe', 'te',
      'k', 'm', 'h', 'havregrynsgröt', 'chokladmjölk', 'fläskkorv', 'vetebröd', 'fruktsallad', 'grädd', 'mellan 1,5',
      'blabar', 'hallon', 'citron', 'laktosfri mjölk', 'extra lätt', 'maxi', 'mini', 'naturell yoghurt',
    ]
    // Uppvärmning (JIT) på separata sökningar så att tidtagningen mäter nya sökord.
    searchFoods(bigIndex, 'uppvärmning')
    searchFoods(bigIndex, 'q')
    const t1 = performance.now()
    for (const q of queries) searchFoods(bigIndex, q, { limit: 40 })
    const avg = (performance.now() - t1) / queries.length
    expect(avg).toBeLessThan(5)
  })
})

describe('grundläggande först', () => {
  const dishes = [
    food('Kycklinggryta med ris', 'fardigratt', { id: 'x:gryta' }),
    food('Kycklingtallrik', 'fardigratt', { id: 'x:tallrik' }),
    food('Kycklingsoppa', 'fardigratt', { id: 'recipe:soppa', source: 'recipe' }),
    food('Kycklingburgare', 'snabbmat', { id: 'x:burgare' }),
  ]
  const basics = [
    food('Kycklingbröst', 'fagel', { id: 'x:brost', synonyms: ['kyckling', 'kycklingfilé'] }),
    food('Kycklingkorv', 'chark', { id: 'x:korv' }),
    food('Grillkyckling', 'fagel', { id: 'x:grill' }),
    food('Pulled chicken', 'fagel', { id: 'x:pulled', synonyms: ['dragen kyckling'] }),
    food('Nötfärs', 'rott_kott', { id: 'x:notfars', synonyms: ['köttfärs'] }),
    food('Biff', 'rott_kott', { id: 'x:biff', synonyms: ['ryggbiff'] }),
    food('Köttbullar med potatismos', 'fardigratt', { id: 'x:kottbullar' }),
    food('Vetemjöl', 'spannmal', { id: 'x:mjol', synonyms: ['mjöl'] }),
    food('Mjölk 3 %', 'mejeri', { id: 'x:mjolk' }),
  ]
  const idx = createSearchIndex([...dishes, ...basics])
  const staples = {
    kyckling: ['x:brost', 'x:grill', 'x:pulled', 'x:korv'],
    kött: ['x:notfars', 'x:biff'],
    mjölk: ['x:mjolk'],
  }
  /** Rätterna används ofta – maximal personlig boost. */
  const dishBoost = (f: Food) => (isCompositeFood(f) ? 250 : 0)
  const run = (query: string, opts: SearchOptions = {}) => searchFoods(idx, query, { boost: dishBoost, ...opts }).map((r) => r.food.id)

  it('klassar färdigrätter, snabbmat och recept som sammansatta', () => {
    expect(isCompositeFood({ category: 'fardigratt', source: 'lagom' })).toBe(true)
    expect(isCompositeFood({ category: 'snabbmat', source: 'lagom' })).toBe(true)
    expect(isCompositeFood({ category: 'bakverk', source: 'recipe' })).toBe(true)
    expect(isCompositeFood({ category: 'fagel', source: 'lagom' })).toBe(false)
    expect(isCompositeFood({ category: 'chark', source: 'custom' })).toBe(false)
  })

  it('sätter grundläggande livsmedel före rätter bland namnträffar – trots boost för rätterna', () => {
    const firstDishIn = (list: string[]) => Math.min(...dishes.map((d) => list.indexOf(d.id)))
    const typing = run('kyckl')
    for (const id of ['x:brost', 'x:korv']) expect(typing.indexOf(id)).toBeLessThan(firstDishIn(typing))
    // "Grillkyckling" har "kyckling" som huvudord – en namnträff för hela ordet.
    const word = run('kyckling')
    for (const id of ['x:brost', 'x:korv', 'x:grill']) expect(word.indexOf(id)).toBeLessThan(firstDishIn(word))
    // Boosten avgör ordningen inom gruppen.
    expect(run('kyckl', { boost: (f) => (f.id === 'x:korv' ? 100 : 0) })[0]).toBe('x:korv')
    // Utan basvaror hamnar en ren synonymträff ("Pulled chicken") efter namnträffarna.
    expect(word.indexOf('x:pulled')).toBeGreaterThan(firstDishIn(word))
  })

  it('låter en exakt namnträff gå först, även för en rätt', () => {
    expect(run('kycklinggryta med ris')[0]).toBe('x:gryta')
    expect(run('kycklingtallrik', { staples })[0]).toBe('x:tallrik')
  })

  it('visar basvarorna först i angiven ordning, oavsett boost', () => {
    const list = run('kyckling', { staples, boost: (f) => (f.id === 'x:korv' ? 400 : dishBoost(f)) })
    expect(list.slice(0, 4)).toEqual(['x:brost', 'x:grill', 'x:pulled', 'x:korv'])
    expect(list).toEqual(expect.arrayContaining(dishes.map((d) => d.id)))
  })

  it('lägger till basvaror som inte matchar sökningen i sig: "kött" → Nötfärs', () => {
    const r = searchFoods(idx, 'kött', { staples, boost: dishBoost })
    expect(r.slice(0, 2).map((x) => x.food.id)).toEqual(['x:notfars', 'x:biff'])
    expect(r.map((x) => x.food.id)).toContain('x:kottbullar')
    // Biff matchar inte "kött" alls – den finns med ändå.
    expect(searchFoods(idx, 'kött').map((x) => x.food.id)).not.toContain('x:biff')
  })

  it('hittar sökordet i böjd form, utan å/ä/ö och medan man skriver', () => {
    for (const q of ['kycklingar', 'Kyckling', 'kyckling rå', 'kyck', 'kyckli']) {
      expect(run(q, { staples, optionalWords: new Set(['rå']) })[0], q).toBe('x:brost')
    }
    expect(run('kott', { staples })[0]).toBe('x:notfars')
    // "mjöl" är ett eget ord – inte början av "mjölk".
    expect(run('mjöl', { staples })[0]).toBe('x:mjol')
    // För korta eller flertydiga början ger ingen gissning.
    expect(run('ky', { staples })[0]).not.toBe('x:brost')
  })

  it('respekterar kategorifilter och filter', () => {
    expect(run('kyckling', { staples, categories: ['chark'] })).toEqual(['x:korv'])
    expect(run('kött', { staples, filter: (f) => f.id !== 'x:notfars' })[0]).toBe('x:biff')
  })

  it('fungerar över flera index', () => {
    const user = createSearchIndex([food('Mammas kycklinggryta', 'fardigratt', { id: 'recipe:mamma', source: 'recipe' })])
    const list = searchFoods([user, idx], 'kyckling', { staples, boost: () => 300 }).map((r) => r.food.id)
    expect(list.slice(0, 4)).toEqual(['x:brost', 'x:grill', 'x:pulled', 'x:korv'])
    expect(list).toContain('recipe:mamma')
    expect(new Set(list).size).toBe(list.length)
  })
})

describe('grundläggande först i Lagoms databas (med användning som gynnar rätter)', () => {
  const recipes = loadBuiltinRecipes(BUILTIN_FOODS).map(recipeFood)
  const indexes = [createSearchIndex(BUILTIN_FOODS), createSearchIndex(recipes)]
  const now = Date.UTC(2026, 8, 28, 12)
  // Exempeldatans livsmedel och alla rätter/recept används ofta och nyligen, till lunch och middag.
  const usage: Record<string, FoodUsage> = {}
  const used = (id: string, count: number, meal: MealId) => {
    const meals: Partial<Record<MealId, number>> = { [meal]: count }
    usage[id] = { count, lastUsed: now - 3_600_000, meals } as FoodUsage
  }
  for (const id of demoFoodIds()) used(id, 8, 'middag')
  for (const f of [...BUILTIN_FOODS, ...recipes]) if (isCompositeFood(f)) used(f.id, 12, 'lunch')
  const favorites = [...DEMO_FAVORITES, 'lagom:kycklinggryta-gradde-ris', 'lagom:kycklingfile-klyftpotatis-tzatziki', 'lagom:lax-potatis-hollandaise']
  const boost = createUsageBoost(usage, favorites, 'lunch', now)
  const search = (q: string, staples: SearchOptions['staples'] = STAPLE_FOODS) =>
    searchFoods(indexes, q, { limit: 40, boost, staples, optionalWords: new Set(['rå']) })
  const idsOf = (q: string) => search(q).map((r) => r.food.id)

  it('ger rätterna en stor boost (annars prövar testet inget)', () => {
    const dish = BUILTIN_FOODS.find((f) => f.id === 'lagom:kycklinggryta-gradde-ris')!
    expect(boost(dish)).toBeGreaterThan(200)
  })

  it('"kyckling" → Kycklingbröst först och alla kycklingbasvaror före alla kycklingrätter', () => {
    const r = search('kyckling')
    expect(r[0].food.id).toBe('lagom:kycklingfile-stekt')
    const lastBasic = Math.max(...r.map((x, i) => (!isCompositeFood(x.food) && /kyckling|chicken/i.test(x.food.name) ? i : -1)))
    const firstDish = r.findIndex((x) => isCompositeFood(x.food))
    expect(firstDish).toBeGreaterThan(0)
    expect(lastBasic).toBeLessThan(firstDish)
    for (const id of STAPLE_FOODS.kyckling) expect(r.findIndex((x) => x.food.id === id)).toBeLessThan(firstDish)
  })

  it('"kött" → Nötfärs först', () => {
    expect(idsOf('kött')[0]).toBe('lagom:notfars-12-stekt')
    expect(idsOf('kott')[0]).toBe('lagom:notfars-12-stekt')
  })

  it('"gris" och "fläsk" → en fläskbasvara först', () => {
    for (const q of ['gris', 'fläsk', 'flask']) {
      const first = search(q)[0].food
      expect(first.id, q).toBe('lagom:flaskfile-stekt')
      expect(['rott_kott', 'chark'], q).toContain(first.category)
    }
  })

  it('"fisk" → Torsk och Lax före fiskrätterna', () => {
    const list = idsOf('fisk')
    expect(list[0]).toBe('lagom:torsk-kokt')
    const firstDish = search('fisk').findIndex((x) => isCompositeFood(x.food))
    expect(list.indexOf('lagom:lax-odlad-ugnsbakad')).toBeLessThan(firstDish)
  })

  it('sätter basvaran först för vardagliga sökord', () => {
    const expected: Record<string, string> = {
      ägg: 'lagom:agg-ratt',
      agg: 'lagom:agg-ratt',
      mjölk: 'lagom:mjolk-standard-3',
      pasta: 'lagom:pasta-vete-kokt',
      ris: 'lagom:ris-langkornigt-kokt',
      potatis: 'lagom:potatis-kokt-skalad',
      bröd: 'lagom:fullkornsbrod',
      ost: 'lagom:hushallsost-26',
      äpple: 'lagom:apple-med-skal',
      lax: 'lagom:lax-odlad-ugnsbakad',
      korv: 'lagom:falukorv',
      kycklingar: 'lagom:kycklingfile-stekt',
      kyck: 'lagom:kycklingfile-stekt',
    }
    for (const [q, id] of Object.entries(expected)) expect(idsOf(q)[0], q).toBe(id)
    // Varje sökord ger sin första basvara först.
    for (const [word, ids] of Object.entries(STAPLE_FOODS)) expect(idsOf(word)[0], word).toBe(ids[0])
  })

  it('en exakt namnsökning på en rätt ger rätten först', () => {
    expect(idsOf('kycklinggryta med ris')[0]).toBe('lagom:kycklinggryta-gradde-ris')
    expect(idsOf('Kycklingtallrik')[0]).toBe('lagom:kycklingfile-klyftpotatis-tzatziki')
  })

  it('låter andra ord vara: "file", "bar", "mjöl" och "havr" ger inga basvaror', () => {
    const plain = (q: string) => search(q, undefined).map((r) => r.food.id)
    for (const q of ['file', 'bar', 'mjöl', 'mjol', 'havr', 'kycklinggryta']) expect(idsOf(q), q).toEqual(plain(q))
    expect(STAPLE_FOODS.fil).not.toContain(idsOf('file')[0])
    expect(STAPLE_FOODS.mjölk).not.toContain(idsOf('mjöl')[0])
  })
})

describe('highlightSv', () => {
  it('markerar träffar inuti sammansatta ord', () => {
    expect(highlightSv('Kycklingbröstfilé rå', 'bröst')).toEqual([
      { text: 'Kyckling', match: false },
      { text: 'bröst', match: true },
      { text: 'filé rå', match: false },
    ])
  })

  it('tål saknade å/ä/ö och accenter', () => {
    const parts = highlightSv('Köttbullar stekta', 'kottbull')
    expect(parts[0]).toEqual({ text: 'Köttbull', match: true })
    const file = highlightSv('Fläskfilé', 'file')
    expect(file.find((p) => p.match)?.text).toBe('filé')
  })

  it('hanterar decimaltal och tom sökning', () => {
    expect(highlightSv('Mjölk 1,5 %', '1.5').find((p) => p.match)?.text).toBe('1,5')
    expect(highlightSv('Mjölk', '')).toEqual([{ text: 'Mjölk', match: false }])
    expect(highlightSv('', 'mjölk')).toEqual([])
  })
})
