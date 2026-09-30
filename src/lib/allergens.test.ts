/**
 * Allergiprofilen och de varsamma flaggorna: EU:s allergenlista med Livsmedelsverkets namn,
 * mappningen från Open Food Facts, laktosregeln och att Lagom aldrig säger "säker" eller
 * "fri från" utan att citera produktens märkning med källa.
 */
import { describe, expect, it } from 'vitest'
import type { AllergenKey, Food } from '../types'
import { ALLERGEN_KEYS } from '../types'
import { mapOffProduct, offAllergens } from './openFoodFacts'
import {
  ALLERGEN_META,
  ALLERGENS_NONE_LISTED_TEXT,
  ALLERGENS_OTHER_UNKNOWN_TEXT,
  ALLERGENS_SOURCE_TEXT,
  ALLERGENS_SOURCE_TRACES_UNKNOWN_TEXT,
  ALLERGENS_TRACES_UNKNOWN_TEXT,
  ALLERGENS_UNKNOWN_TEXT,
  ALLERGENS_UNREAD_TEXT,
  EU_ALLERGENS,
  INTOLERANCES,
  LABELLED_GLUTEN_FREE_TEXT,
  LABELLED_LACTOSE_FREE_TEXT,
  LACTOSE_FROM_MILK_TEXT,
  MILK_TRACES_TEXT,
  allergenKeyFromName,
  allergenSummary,
  assessAllergens,
  foodAllergenData,
  hasUnreadAllergenTags,
  joinSv,
  offAllergenKey,
  offAllergenKeys,
  sortAllergens,
  toggleAllergen,
  traceNames,
  warnFlags,
  type FoodExtraWithAllergens,
} from './allergens'

function food(partial: Partial<Food> & { extra?: FoodExtraWithAllergens } = {}): Food {
  return {
    id: 'off:7310865004703',
    name: 'Produkt',
    source: 'openfoodfacts',
    category: 'ovrigt',
    nutrients: { kcal: 100 },
    portions: [],
    ...partial,
  }
}

const CURATED = food({ id: 'lagom:mellanmjolk', source: 'lagom', category: 'mejeri', extra: undefined })
const LMV = food({ id: 'lmv:123', source: 'livsmedelsverket', extra: undefined })
const CUSTOM = food({ id: 'custom:abc', source: 'custom', extra: undefined, tags: ['glutenfri', 'laktosfri'] })
const RECIPE = food({ id: 'recipe:pannkakor', source: 'recipe', extra: undefined })

// Produkter som lästs in med dagens ordlista har alltid `allergenKeys` och `traceKeys` (även tomma).
const MILK = food({ extra: { allergens: ['mjölk'], allergenKeys: ['mjolk'], traceKeys: [], ingredientsText: 'Mellanmjölk.' } })
const LACTOSE_FREE_MILK = food({
  extra: { allergens: ['mjölk'], allergenKeys: ['mjolk'], traceKeys: [], labels: ['Laktosfri'], ingredientsText: 'Laktosfri mjölkdryck.' },
})
const CHOCOLATE = food({
  extra: { allergens: ['mjölk', 'soja'], allergenKeys: ['soja', 'mjolk'], traceKeys: ['notter', 'jordnotter'], ingredientsText: 'Socker, kakaosmör …' },
})
const GLUTEN_FREE_BREAD = food({ extra: { allergenKeys: [], traceKeys: [], labels: ['Glutenfri'], ingredientsText: 'Majsstärkelse, vatten …' } })
const GLUTEN_FREE_OATS = food({
  extra: { allergens: ['gluten'], allergenKeys: ['gluten'], traceKeys: [], labels: ['Glutenfri'], ingredientsText: 'Glutenfri havre.' },
})
const LABEL_ONLY = food({ extra: { labels: ['Glutenfri', 'Laktosfri'] } })
const NO_ALLERGENS = food({ extra: { allergenKeys: [], traceKeys: [], ingredientsText: 'Vatten, apelsinjuice.' } })
const BARE_OFF = food({ extra: { quantity: '1 l', allergenKeys: [], traceKeys: [] } })
const MILK_TRACES = food({ extra: { allergenKeys: [], traceKeys: ['mjolk'], ingredientsText: 'Mörk choklad.' } })
/** En äldre sparad produkt – bara de svenska namnen i `extra.allergens`, inga spår inlästa. */
const OLD_SAVED = food({ extra: { allergens: ['gluten', 'svaveldioxid/sulfit', 'ägg'] } })
/** En äldre sparad produkt utan allergener men med ingredienser – spåren lästes aldrig in. */
const OLD_SAVED_NO_ALLERGENS = food({ extra: { ingredientsText: 'Socker, kakaosmör, mjölkpulver.' } })
/** Open Food Facts anger något som Lagom inte kan tolka. */
const UNREAD = food({ extra: { allergenKeys: [], traceKeys: [], unreadAllergenTags: true, ingredientsText: 'Maito, sokeri.' } })

describe('allergenlistan', () => {
  it('har de 14 allergenerna i bilaga II till förordning (EU) 1169/2011 och laktos', () => {
    expect(EU_ALLERGENS).toHaveLength(14)
    expect(INTOLERANCES).toEqual(['laktos'])
    expect([...EU_ALLERGENS, ...INTOLERANCES].sort()).toEqual([...ALLERGEN_KEYS].sort())
    for (const key of ALLERGEN_KEYS) {
      expect(ALLERGEN_META[key].label.length).toBeGreaterThan(1)
      expect(ALLERGEN_META[key].name).toBe(ALLERGEN_META[key].name.toLocaleLowerCase('sv-SE'))
    }
  })

  it('använder Livsmedelsverkets svenska benämningar', () => {
    expect(EU_ALLERGENS.map((k) => ALLERGEN_META[k].label)).toEqual([
      'Spannmål som innehåller gluten',
      'Kräftdjur',
      'Ägg',
      'Fisk',
      'Jordnötter',
      'Sojabönor',
      'Mjölk och mjölkprodukter',
      'Nötter',
      'Selleri',
      'Senap',
      'Sesamfrön',
      'Svaveldioxid och sulfit',
      'Lupin',
      'Blötdjur',
    ])
    expect(ALLERGEN_META.gluten.hint).toMatch(/vete, råg, korn, havre, spelt\/dinkel, khorasanvete/i)
    expect(ALLERGEN_META.notter.hint).toMatch(/^Mandel, hasselnöt, valnöt, cashewnöt, pekannöt, paranöt, pistaschmandel och makadamianöt\/Queenslandsnöt/)
    expect(ALLERGEN_META.blotdjur.hint).toMatch(/snäckor, musslor och bläckfisk/i)
    expect(ALLERGEN_META.sulfiter.hint).toMatch(/10 mg per kg eller liter/)
  })
})

describe('mappning från Open Food Facts', () => {
  it('mappar alla kanoniska allergentaggar', () => {
    const tags: Record<string, AllergenKey> = {
      'en:gluten': 'gluten',
      'en:crustaceans': 'kraftdjur',
      'en:eggs': 'agg',
      'en:fish': 'fisk',
      'en:peanuts': 'jordnotter',
      'en:soybeans': 'soja',
      'en:milk': 'mjolk',
      'en:nuts': 'notter',
      'en:celery': 'selleri',
      'en:mustard': 'senap',
      'en:sesame-seeds': 'sesam',
      'en:sulphur-dioxide-and-sulphites': 'sulfiter',
      'en:lupin': 'lupin',
      'en:molluscs': 'blotdjur',
    }
    for (const [tag, key] of Object.entries(tags)) expect(offAllergenKey(tag)).toBe(key)
    expect(new Set(Object.values(tags))).toEqual(new Set(EU_ALLERGENS))
  })

  it('ger nycklarna i listans ordning utan dubbletter och hoppar över okända taggar', () => {
    expect(offAllergenKeys(['en:nuts', 'en:milk', 'en:gluten', 'en:milk', 'en:none', 'en:kiwi', 'en:okand'])).toEqual(['gluten', 'mjolk', 'notter'])
    expect(offAllergenKeys(undefined)).toEqual([])
    expect(offAllergenKeys([])).toEqual([])
  })

  it('tolkar okända svenska taggar bara när hela ordet är känt', () => {
    expect(offAllergenKey('sv:havre')).toBe('gluten')
    expect(offAllergenKey('sv:vetemjöl')).toBe('gluten')
    expect(offAllergenKey('sv:mandel')).toBe('notter')
    expect(offAllergenKey('sv:räkor')).toBe('kraftdjur')
    expect(offAllergenKey('sv:laktos')).toBe('mjolk')
    // Delar av ord räknas inte: "ragu" är inte råg, "kornas" inte korn.
    expect(offAllergenKey('sv:ragu')).toBeUndefined()
    expect(offAllergenKey('sv:kornas')).toBeUndefined()
    expect(offAllergenKey('sv:apelsin')).toBeUndefined()
  })

  it('känner igen Lagoms egna svenska namn i äldre sparade produkter', () => {
    const names = offAllergens([
      'en:gluten', 'en:crustaceans', 'en:eggs', 'en:fish', 'en:peanuts', 'en:soybeans', 'en:milk', 'en:nuts',
      'en:celery', 'en:mustard', 'en:sesame-seeds', 'en:sulphur-dioxide-and-sulphites', 'en:lupin', 'en:molluscs',
    ])
    expect(sortAllergens(names.map(allergenKeyFromName))).toEqual([...EU_ALLERGENS])
    expect(allergenKeyFromName('Svaveldioxid/sulfit')).toBe('sulfiter')
    expect(allergenKeyFromName('okänt')).toBeUndefined()
  })

  it('sparar nycklarna på produkten från Open Food Facts', () => {
    const product = mapOffProduct({
      code: '7310865004703',
      product_name: 'Mjölkchoklad med nötter',
      nutriments: { 'energy-kcal_100g': 540 },
      allergens_tags: ['en:milk', 'en:nuts'],
      traces_tags: ['en:peanuts', 'en:nuts'],
      labels_tags: ['en:no-gluten'],
    })!
    const data = foodAllergenData(product)
    expect(data).toEqual({
      known: true,
      tracesKnown: true,
      unread: false,
      contains: ['mjolk', 'notter'],
      traces: ['jordnotter'],
      labelledLactoseFree: false,
      labelledGlutenFree: true,
    })
    expect(traceNames(product)).toEqual(['jordnötter'])
  })
})

describe('produktens allergenuppgifter', () => {
  it('kurerade livsmedel, Livsmedelsverket, recept och egna livsmedel saknar allergenuppgifter', () => {
    for (const f of [CURATED, LMV, CUSTOM, RECIPE]) {
      expect(foodAllergenData(f)).toEqual({
        known: false,
        tracesKnown: false,
        unread: false,
        contains: [],
        traces: [],
        labelledLactoseFree: false,
        labelledGlutenFree: false,
      })
    }
  })

  it('läser äldre sparade produkter via de svenska namnen', () => {
    expect(foodAllergenData(OLD_SAVED)).toMatchObject({ known: true, tracesKnown: false, contains: ['gluten', 'agg', 'sulfiter'] })
  })

  it('en produkt från Open Food Facts utan ingredienser eller allergener är okänd, inte "inga"', () => {
    expect(foodAllergenData(BARE_OFF).known).toBe(false)
    expect(foodAllergenData(NO_ALLERGENS).known).toBe(true)
  })

  it('tål trasiga fält', () => {
    const broken = food({ extra: { allergenKeys: ['mjolk', 'okand' as AllergenKey], traceKeys: 'notter' as unknown as AllergenKey[], labels: 'Laktosfri' as unknown as string[] } })
    expect(foodAllergenData(broken)).toMatchObject({ contains: ['mjolk'], traces: [], labelledLactoseFree: false })
  })

  it('en egen kopia av en produkt flaggar det den innehåller men räknas aldrig som känd', () => {
    const copy = food({ id: 'custom:kopia', source: 'custom', extra: { ...LACTOSE_FREE_MILK.extra } })
    expect(foodAllergenData(copy)).toMatchObject({ known: false, contains: ['mjolk'], labelledLactoseFree: false })
    const a = assessAllergens(copy, ['mjolk', 'laktos'])
    expect(a.flags.map((f) => f.text)).toEqual(['Innehåller mjölk – som du har markerat'])
    expect(a.note).toBe(ALLERGENS_OTHER_UNKNOWN_TEXT)
    // Utan flaggor: aldrig "Open Food Facts anger inget …".
    expect(assessAllergens(copy, ['notter']).note).toBe(ALLERGENS_UNKNOWN_TEXT)
  })

  it('bara Open Food Facts kan ge "anger inget" – inte egna, delade eller andra källor', () => {
    for (const source of ['custom', 'lagom', 'livsmedelsverket', 'recipe'] as const) {
      const f = food({ id: `${source}:x`, source, extra: { ...NO_ALLERGENS.extra, allergens: ['xyz'] } })
      expect(assessAllergens(f, ['jordnotter']).note).toBe(ALLERGENS_UNKNOWN_TEXT)
    }
  })

  it('tolkar okända taggar som "anger något Lagom inte kan tolka"', () => {
    expect(hasUnreadAllergenTags(['fi:maito'])).toBe(true)
    expect(hasUnreadAllergenTags(['sv:vetegluten'])).toBe(true)
    expect(hasUnreadAllergenTags(['en:milk', 'en:kiwi', 'en:none', 'sv:havre'])).toBe(false)
    expect(hasUnreadAllergenTags(undefined)).toBe(false)
    expect(foodAllergenData(UNREAD)).toMatchObject({ known: true, unread: true })
    // Ett sparat namn som inte går att tolka räknas likadant.
    expect(foodAllergenData(food({ extra: { allergens: ['vetegluten'], allergenKeys: [], traceKeys: [] } })).unread).toBe(true)
  })
})

describe('varsamma flaggor', () => {
  it('visar ingenting utan profil', () => {
    for (const f of [MILK, CURATED, CHOCOLATE]) {
      const a = assessAllergens(f, [])
      expect(a).toMatchObject({ active: false, flags: [] })
      expect(a.note).toBeUndefined()
      expect(assessAllergens(f, undefined).active).toBe(false)
    }
  })

  it('flaggar det som ingår: "Innehåller mjölk – som du har markerat"', () => {
    const a = assessAllergens(MILK, ['mjolk'])
    expect(a.flags).toEqual([{ kind: 'contains', key: 'mjolk', text: 'Innehåller mjölk – som du har markerat', tone: 'warn' }])
    expect(a.note).toBe(ALLERGENS_SOURCE_TEXT)
    expect(a.note).toMatch(/Open Food Facts/)
    expect(a.note).toMatch(/läs alltid förpackningen/)
  })

  it('flaggar "kan innehålla spår av" separat', () => {
    const a = assessAllergens(CHOCOLATE, ['notter', 'soja', 'sesam'])
    expect(a.flags.map((f) => f.text)).toEqual(['Innehåller soja – som du har markerat', 'Kan innehålla spår av nötter – som du har markerat'])
    expect(a.flags.every((f) => f.tone === 'warn')).toBe(true)
  })

  it('laktos: mjölk ger "Innehåller mjölk – kan innehålla laktos"', () => {
    const a = assessAllergens(MILK, ['laktos'])
    expect(a.flags).toEqual([{ kind: 'lactose', key: 'laktos', text: LACTOSE_FROM_MILK_TEXT, tone: 'warn' }])
    expect(LACTOSE_FROM_MILK_TEXT).toBe('Innehåller mjölk – kan innehålla laktos')
  })

  it('laktos: märkt laktosfri citeras med källa i stället för flaggan', () => {
    const a = assessAllergens(LACTOSE_FREE_MILK, ['laktos'])
    expect(a.flags).toEqual([{ kind: 'label', key: 'laktos', text: 'Märkt laktosfri enligt Open Food Facts', tone: 'info' }])
    expect(a.note).toBe(ALLERGENS_NONE_LISTED_TEXT)
  })

  it('laktos och mjölkallergi: mjölken flaggas även när produkten är märkt laktosfri', () => {
    const a = assessAllergens(LACTOSE_FREE_MILK, ['mjolk', 'laktos'])
    expect(a.flags.map((f) => f.text)).toEqual(['Innehåller mjölk – som du har markerat', LABELLED_LACTOSE_FREE_TEXT])
    // Ingen dubbel laktosflagga när mjölken redan är flaggad.
    expect(assessAllergens(MILK, ['mjolk', 'laktos']).flags.map((f) => f.kind)).toEqual(['contains'])
  })

  it('laktos: spår av mjölk visas som neutral uppgift', () => {
    const a = assessAllergens(MILK_TRACES, ['laktos'])
    expect(a.flags).toEqual([{ kind: 'traces', key: 'laktos', text: MILK_TRACES_TEXT, tone: 'info' }])
    expect(warnFlags(a)).toEqual([])
    expect(a.note).toBe(ALLERGENS_SOURCE_TEXT)
    expect(assessAllergens(MILK_TRACES, ['mjolk']).flags[0].text).toBe('Kan innehålla spår av mjölk – som du har markerat')
  })

  it('gluten: märkt glutenfri citeras med källa – och flaggan står kvar om gluten anges', () => {
    expect(assessAllergens(GLUTEN_FREE_BREAD, ['gluten']).flags).toEqual([{ kind: 'label', key: 'gluten', text: 'Märkt glutenfri enligt Open Food Facts', tone: 'info' }])
    expect(assessAllergens(GLUTEN_FREE_OATS, ['gluten']).flags.map((f) => f.text)).toEqual(['Innehåller gluten – som du har markerat', LABELLED_GLUTEN_FREE_TEXT])
  })

  it('märkningen visas bara för den som har markerat allergenen', () => {
    expect(assessAllergens(LABEL_ONLY, ['mjolk']).flags).toEqual([])
    expect(assessAllergens(GLUTEN_FREE_BREAD, ['laktos']).flags).toEqual([])
  })

  it('egna taggar (glutenfri/laktosfri) på egna livsmedel citeras aldrig som märkning', () => {
    const a = assessAllergens(CUSTOM, ['gluten', 'laktos'])
    expect(a.flags).toEqual([])
    expect(a.note).toBe(ALLERGENS_UNKNOWN_TEXT)
  })

  it('saknade uppgifter sägs rakt ut – som att Lagom saknar dem, inte att allergenerna är okända', () => {
    for (const f of [CURATED, LMV, CUSTOM, RECIPE, BARE_OFF]) {
      const a = assessAllergens(f, ['mjolk'])
      expect(a).toMatchObject({ active: true, known: false, flags: [] })
      expect(a.note).toBe('Lagom har inga uppgifter om allergener för det här livsmedlet – läs alltid förpackningen och ingredienserna.')
    }
    expect(assessAllergens(LABEL_ONLY, ['gluten']).note).toBe(ALLERGENS_OTHER_UNKNOWN_TEXT)
  })

  it('äldre sparade produkter utan spår säger att spåren saknas – aldrig "anger inget"', () => {
    const flagged = assessAllergens(OLD_SAVED, ['agg', 'notter'])
    expect(flagged.flags.map((f) => f.text)).toEqual(['Innehåller ägg – som du har markerat'])
    expect(flagged.note).toBe(ALLERGENS_SOURCE_TRACES_UNKNOWN_TEXT)
    for (const f of [OLD_SAVED, OLD_SAVED_NO_ALLERGENS]) {
      const a = assessAllergens(f, ['notter'])
      expect(a.flags).toEqual([])
      expect(a.note).toBe(ALLERGENS_TRACES_UNKNOWN_TEXT)
      expect(a.note).not.toBe(ALLERGENS_NONE_LISTED_TEXT)
    }
  })

  it('något som Lagom inte kan tolka ger aldrig "anger inget"', () => {
    const a = assessAllergens(UNREAD, ['mjolk'])
    expect(a.flags).toEqual([])
    expect(a.note).toBe(ALLERGENS_UNREAD_TEXT)
  })

  it('när inget av det markerade anges säger Lagom det – utan att lova något', () => {
    const a = assessAllergens(NO_ALLERGENS, ['mjolk', 'gluten'])
    expect(a.flags).toEqual([])
    expect(a.note).toBe('Open Food Facts anger inget av det du har markerat. Uppgifterna kan vara ofullständiga – läs alltid förpackningen.')
  })

  it('säger aldrig "säker" eller "fri från" utan att citera märkningen med källa', () => {
    const foods = [
      MILK,
      LACTOSE_FREE_MILK,
      CHOCOLATE,
      GLUTEN_FREE_BREAD,
      GLUTEN_FREE_OATS,
      LABEL_ONLY,
      NO_ALLERGENS,
      BARE_OFF,
      MILK_TRACES,
      OLD_SAVED,
      OLD_SAVED_NO_ALLERGENS,
      UNREAD,
      CURATED,
      LMV,
      CUSTOM,
      RECIPE,
    ]
    const profiles: AllergenKey[][] = [...ALLERGEN_KEYS.map((k) => [k]), [...ALLERGEN_KEYS], ['mjolk', 'laktos'], ['gluten', 'laktos']]
    const texts = new Set<string>()
    for (const f of foods) {
      for (const p of profiles) {
        const a = assessAllergens(f, p)
        for (const flag of a.flags) {
          texts.add(flag.text)
          if (flag.kind === 'label') {
            // Märkningen citeras bara när produkten har den enligt Open Food Facts.
            const labels = (f.extra?.labels ?? []).map((l) => l.toLocaleLowerCase('sv-SE'))
            expect(flag.text).toMatch(/^Märkt (laktosfri|glutenfri) enligt Open Food Facts$/)
            expect(labels).toContain(flag.text.split(' ')[1])
          }
        }
        if (a.note) texts.add(a.note)
      }
    }
    expect(texts.size).toBeGreaterThan(8)
    for (const text of texts) {
      expect(text).not.toMatch(/säker|tryggt?\b|ofarlig|fri från|fritt från|allergifri|allergenfri|utan (gluten|laktos|mjölk|nötter)/i)
      if (/(laktos|gluten)fri/i.test(text)) expect(text).toMatch(/^Märkt (laktosfri|glutenfri) enligt Open Food Facts$/)
    }
  })
})

describe('profilen', () => {
  it('slår på och av i listans ordning och sparar inget tomt fält', () => {
    expect(toggleAllergen(undefined, 'mjolk', true)).toEqual(['mjolk'])
    expect(toggleAllergen(['mjolk'], 'gluten', true)).toEqual(['gluten', 'mjolk'])
    expect(toggleAllergen(['gluten', 'mjolk'], 'gluten', true)).toEqual(['gluten', 'mjolk'])
    expect(toggleAllergen(['gluten', 'mjolk'], 'gluten', false)).toEqual(['mjolk'])
    expect(toggleAllergen(['mjolk'], 'mjolk', false)).toBeUndefined()
    expect(sortAllergens(['laktos', 'okand', 'gluten', 'laktos'])).toEqual(['gluten', 'laktos'])
  })

  it('sammanfattar för raden i Inställningar', () => {
    expect(allergenSummary(undefined)).toBe('Inga valda')
    expect(allergenSummary([])).toBe('Inga valda')
    expect(allergenSummary(['mjolk'])).toBe('Mjölk')
    expect(allergenSummary(['notter', 'mjolk'])).toBe('Mjölk och nötter')
    expect(allergenSummary(['laktos', 'gluten', 'sesam'])).toBe('Gluten, sesam och laktos')
    expect(allergenSummary(['laktos', 'gluten', 'sesam', 'mjolk', 'fisk'])).toBe('Gluten, fisk, mjölk och 2 till')
    expect(joinSv([])).toBe('')
  })
})
