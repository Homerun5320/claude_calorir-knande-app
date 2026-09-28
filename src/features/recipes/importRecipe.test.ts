import { describe, expect, it } from 'vitest'
import type { Food } from '../../types'
import {
  cleanText,
  ingredientAmount,
  ingredientQuery,
  parseIngredientLines,
  parseIsoDuration,
  parseRecipeJsonLd,
  parseRecipeQuantity,
  parseYield,
} from './importRecipe'

/** Ett eget, minimalt exempel på hur en svensk receptsida märker upp ett recept (schema.org/Recipe). */
const RECEPTSIDA = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <title>Kladdkaka – enkel och kladdig | Exempelrecept</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "name": "Exempelrecept", "url": "https://recept.example.se/" },
      { "@type": "BreadcrumbList", "itemListElement": [] },
      {
        "@type": ["Recipe", "NewsArticle"],
        "name": "Kladdkaka &ndash; enkel och kladdig",
        "url": "https://recept.example.se/kladdkaka",
        "recipeYield": "ca 8 bitar",
        "prepTime": "PT15M",
        "totalTime": "PT45M",
        "recipeIngredient": [
          "100 g sm&ouml;r",
          "2 ägg",
          "2½ dl strösocker",
          "1 dl vetemjöl",
          "4 msk kakao",
          "1 krm salt",
          "Smör och ströbröd till formen"
        ],
        "recipeInstructions": [{ "@type": "HowToStep", "text": "Sätt ugnen på 175 grader." }]
      }
    ]
  }
  </script>
  <script type="application/ld+json">{ "@type": "Organization", "name": "Exempelrecept AB" }</script>
  <script type="application/ld+json">{ inte giltig json </script>
</head>
<body><h1>Kladdkaka</h1></body>
</html>`

describe('parseRecipeJsonLd', () => {
  it('hittar receptet i @graph med @type som lista', () => {
    const [recipe, ...rest] = parseRecipeJsonLd(RECEPTSIDA)
    expect(rest).toHaveLength(0)
    expect(recipe).toEqual({
      name: 'Kladdkaka – enkel och kladdig',
      servings: 8,
      totalMinutes: 45,
      url: 'https://recept.example.se/kladdkaka',
      ingredients: ['100 g smör', '2 ägg', '2½ dl strösocker', '1 dl vetemjöl', '4 msk kakao', '1 krm salt', 'Smör och ströbröd till formen'],
    })
  })

  it('läser recept som ligger direkt, i en lista eller nästlat', () => {
    const direct = `<script type="application/ld+json">{"@type":"Recipe","name":"Pannkakor","recipeYield":["4","4 portioner"],"prepTime":"PT1H10M","recipeIngredient":["3 dl vetemjöl"]}</script>`
    expect(parseRecipeJsonLd(direct)).toEqual([{ name: 'Pannkakor', servings: 4, totalMinutes: 70, ingredients: ['3 dl vetemjöl'] }])

    const list = `<script type="application/ld+json">[{"@type":"Person","name":"Anna"},{"@type":"http://schema.org/Recipe","name":"Gröt","recipeYield":2,"recipeIngredient":["1 dl havregryn","2 dl vatten"]}]</script>`
    expect(parseRecipeJsonLd(list)[0]).toMatchObject({ name: 'Gröt', servings: 2, ingredients: ['1 dl havregryn', '2 dl vatten'] })

    const nested = `<script type="application/ld+json">{"@type":"WebPage","mainEntity":{"@type":"Recipe","name":"Soppa","prepTime":"PT10M","cookTime":"PT20M"}}</script>`
    expect(parseRecipeJsonLd(nested)[0]).toMatchObject({ name: 'Soppa', totalMinutes: 30, ingredients: [] })
  })

  it('ger en tom lista när sidan saknar recept', () => {
    expect(parseRecipeJsonLd('<html><body>Inget här</body></html>')).toEqual([])
    expect(parseRecipeJsonLd('<script type="application/ld+json">{"@type":"Organization","name":"X"}</script>')).toEqual([])
    expect(parseRecipeJsonLd('')).toEqual([])
  })
})

describe('hjälpfunktioner', () => {
  it('tolkar portioner', () => {
    expect(parseYield('ca 8 bitar')).toBe(8)
    expect(parseYield('4 portioner')).toBe(4)
    expect(parseYield('4-6 portioner')).toBe(4)
    expect(parseYield(['portioner', '6'])).toBe(6)
    expect(parseYield(3)).toBe(3)
    expect(parseYield('några')).toBeUndefined()
  })

  it('tolkar ISO 8601-tider', () => {
    expect(parseIsoDuration('PT45M')).toBe(45)
    expect(parseIsoDuration('PT1H10M')).toBe(70)
    expect(parseIsoDuration('P0DT2H')).toBe(120)
    expect(parseIsoDuration('PT0M')).toBeUndefined()
    expect(parseIsoDuration('45 minuter')).toBeUndefined()
    expect(parseIsoDuration(undefined)).toBeUndefined()
  })

  it('avkodar HTML-entiteter och taggar', () => {
    expect(cleanText('K&ouml;ttbullar &amp; <b>potatis</b>')).toBe('Köttbullar & potatis')
  })

  it('tolkar mängd och enhet – med fritextens parseQuantity och receptens egna former', () => {
    const q = (text: string) => {
      const { amount, unit, name } = parseRecipeQuantity(text)
      return { amount, unit, name }
    }
    expect(q('2 dl mjölk')).toEqual({ amount: 2, unit: 'dl', name: 'mjölk' })
    expect(q('1½ msk smör')).toEqual({ amount: 1.5, unit: 'msk', name: 'smör' })
    expect(q('1,5 kg potatis')).toEqual({ amount: 1.5, unit: 'kg', name: 'potatis' })
    expect(q('500g köttfärs')).toEqual({ amount: 500, unit: 'g', name: 'köttfärs' })
    expect(q('2–3 klyftor vitlök')).toEqual({ amount: 2.5, unit: 'klyfta', name: 'vitlök' })
    expect(q('ca 1 st gul lök')).toEqual({ amount: 1, unit: 'st', name: 'gul lök' })
    expect(q('1/2 tsk salt')).toEqual({ amount: 0.5, unit: 'tsk', name: 'salt' })
    expect(q('3 msk. olivolja')).toEqual({ amount: 3, unit: 'msk', name: 'olivolja' })
    expect(q('2 ägg')).toEqual({ amount: 2, unit: undefined, name: 'ägg' })
    expect(q('en nypa salt')).toEqual({ amount: 1, unit: 'nypa', name: 'salt' })
    expect(q('2 burkar krossade tomater (à 400 g)')).toEqual({ amount: 800, unit: 'g', name: 'krossade tomater' })
    expect(q('1 paket à 250 g pasta')).toEqual({ amount: 250, unit: 'g', name: 'pasta' })
    expect(q('1 förp. krossade tomater (500 g)')).toEqual({ amount: 500, unit: 'g', name: 'krossade tomater' })
    expect(q('salt och peppar')).toEqual({ amount: undefined, unit: undefined, name: 'salt och peppar' })
    expect(parseRecipeQuantity('  ca 2 dl grädde ').raw).toBe('ca 2 dl grädde')
    expect(parseRecipeQuantity('1 stor gul lök')).toMatchObject({ amount: 1, size: 'stor', name: 'gul lök' })
    expect(q('2 port. ris')).toEqual({ amount: 2, unit: 'portion', name: 'ris' })
  })

  it('använder vikten inom parentes som hela mängden efter styck och portioner', () => {
    const q = (text: string) => {
      const { amount, unit, name } = parseRecipeQuantity(text)
      return { amount, unit, name }
    }
    expect(q('2 st kycklingfiléer (ca 300 g)')).toEqual({ amount: 300, unit: 'g', name: 'kycklingfiléer' })
    expect(q('1 kyckling (ca 1,2 kg)')).toEqual({ amount: 1.2, unit: 'kg', name: 'kyckling' })
    expect(q('6 skivor bacon (ca 140 g)')).toEqual({ amount: 140, unit: 'g', name: 'bacon' })
    // Efter ett förpackningsord gäller vikten per förpackning.
    expect(q('2 burkar krossade tomater (400 g)')).toEqual({ amount: 800, unit: 'g', name: 'krossade tomater' })
    // Volymer inom parentes efter styck räknas inte om.
    expect(q('1 citron (ca 1 dl saft)')).toMatchObject({ amount: 1, unit: undefined })
  })

  it('gör sökord av ingrediensen', () => {
    expect(ingredientQuery('finhackad gul lök')).toBe('gul lök')
    expect(ingredientQuery('smör, rumsvarmt')).toBe('smör')
    expect(ingredientQuery('smör till formen')).toBe('smör')
    expect(ingredientQuery('vetemjöl (special)')).toBe('vetemjöl')
    expect(ingredientQuery('krossade tomater')).toBe('krossade tomater')
    expect(ingredientQuery('lax i bitar')).toBe('lax')
    expect(ingredientQuery('potatis i tunna skivor')).toBe('potatis')
    // "i" i ett riktigt namn står kvar.
    expect(ingredientQuery('makrill i tomatsås')).toBe('makrill i tomatsås')
    expect(ingredientQuery('soja')).toBe('sojasås')
    expect(ingredientQuery('Japansk soja')).toBe('sojasås')
  })
})

describe('parseIngredientLines', () => {
  it('delar upp en inklistrad lista och markerar rader utan mängd', () => {
    const lines = parseIngredientLines(`Kladdkaka:
- 100 g smör
• 2 ägg

2½ dl strösocker
Smör och ströbröd till formen
salt och peppar`)
    expect(lines).toEqual([
      { raw: '100 g smör', amount: 100, unit: 'g', name: 'smör', check: false },
      { raw: '2 ägg', amount: 2, name: 'ägg', check: false },
      { raw: '2½ dl strösocker', amount: 2.5, unit: 'dl', name: 'strösocker', check: false },
      { raw: 'Smör och ströbröd till formen', name: 'Smör och ströbröd', check: true },
      { raw: 'salt och peppar', name: 'salt och peppar', check: true },
    ])
  })

  it('hoppar över tomma rader och rubriker', () => {
    expect(parseIngredientLines('\n\nSås:\n\n')).toEqual([])
  })
})

describe('ingredientAmount', () => {
  const mjol: Food = { id: 'lagom:vetemjol', name: 'Vetemjöl', source: 'lagom', category: 'spannmal', nutrients: { kcal: 340 }, portions: [], density: 0.6 }
  const agg: Food = {
    id: 'lagom:agg',
    name: 'Ägg',
    source: 'lagom',
    category: 'agg',
    nutrients: { kcal: 140 },
    portions: [
      { id: 'gula', label: '1 äggula', grams: 18 },
      { id: 'st', label: '1 st (60 g)', grams: 60 },
    ],
  }
  const vitlok: Food = { id: 'lagom:vitlok', name: 'Vitlök', source: 'lagom', category: 'gronsaker', nutrients: { kcal: 140 }, portions: [{ id: 'klyfta', label: '1 klyfta', grams: 5 }] }
  const pasta: Food = {
    id: 'lagom:pasta',
    name: 'Pasta',
    source: 'lagom',
    category: 'pasta_ris',
    nutrients: { kcal: 150 },
    portions: [],
    rawWeight: { factor: 2.5, kind: 'okokt', density: 0.4 },
  }
  const kikartor: Food = { id: 'lagom:kikartor', name: 'Kikärtor', source: 'lagom', category: 'baljvaxter', nutrients: { kcal: 120 }, portions: [], rawWeight: { factor: 2.2, kind: 'torkad' } }

  it('räknar gram, köksmått och styck', () => {
    expect(ingredientAmount(mjol, { amount: 2, unit: 'dl' })).toEqual({ amount: 2, unit: 'dl', grams: 120 })
    expect(ingredientAmount(mjol, { amount: 1, unit: 'hg' })).toEqual({ amount: 100, unit: 'g', grams: 100 })
    expect(ingredientAmount(agg, { amount: 2 })).toEqual({ amount: 2, unit: 'portion:st', grams: 120 })
    expect(ingredientAmount(vitlok, { amount: 2, unit: 'klyfta' })).toEqual({ amount: 2, unit: 'portion:klyfta', grams: 10 })
  })

  it('anger tillagade livsmedel i rå/okokt vikt – utom när raden säger kokt', () => {
    expect(ingredientAmount(pasta, { amount: 400, unit: 'g' })).toEqual({ amount: 400, unit: 'g-ra', grams: 1000 })
    expect(ingredientAmount(pasta, { amount: 3, unit: 'dl' })).toEqual({ amount: 3, unit: 'dl-ra', grams: 300 })
    expect(ingredientAmount(kikartor, { amount: 400, unit: 'g', raw: '400 g kokta kikärtor' })).toEqual({ amount: 400, unit: 'g', grams: 400 })
  })

  it('använder portioner när måttet saknas och låter förpackningsord matcha varandra', () => {
    const sirap: Food = { id: 'lagom:sirap', name: 'Sirap', source: 'lagom', category: 'sotsaker', nutrients: { kcal: 300 }, portions: [{ id: 'msk', label: '1 msk', grams: 20 }] }
    expect(ingredientAmount(sirap, { amount: 2, unit: 'msk' })).toEqual({ amount: 2, unit: 'portion:msk', grams: 40 })
    const tomater: Food = {
      id: 'lagom:krossade-tomater',
      name: 'Krossade tomater',
      source: 'lagom',
      category: 'gronsaker',
      nutrients: { kcal: 25 },
      portions: [{ id: 'paket', label: '1 paket (500 g)', grams: 500 }],
    }
    expect(ingredientAmount(tomater, { amount: 1, unit: 'förpackning' })).toEqual({ amount: 1, unit: 'portion:paket', grams: 500 })
    // En stor gul lök blir portionen "1 stor" när livsmedlet har den.
    const lok: Food = {
      id: 'lagom:gul-lok',
      name: 'Gul lök',
      source: 'lagom',
      category: 'gronsaker',
      nutrients: { kcal: 40 },
      portions: [
        { id: 'st', label: '1 st (100 g)', grams: 100 },
        { id: 'stor', label: '1 stor (150 g)', grams: 150 },
      ],
    }
    expect(ingredientAmount(lok, { amount: 1, size: 'stor' })).toEqual({ amount: 1, unit: 'portion:stor', grams: 150 })
    expect(ingredientAmount(lok, { amount: 2, unit: 'st' })).toEqual({ amount: 2, unit: 'portion:st', grams: 200 })
  })

  it('ger undefined när mängden saknas eller inte går att räkna om', () => {
    expect(ingredientAmount(mjol, { amount: undefined })).toBeUndefined()
    expect(ingredientAmount({ ...mjol, density: undefined }, { amount: 2, unit: 'dl' })).toBeUndefined()
    expect(ingredientAmount(vitlok, { amount: 1, unit: 'burk' })).toBeUndefined()
    expect(ingredientAmount(mjol, { amount: 2 })).toBeUndefined()
  })
})
