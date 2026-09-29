import { describe, expect, it } from 'vitest'
import type { Food } from '../../types'
import {
  cleanText,
  ingredientAmount,
  ingredientQuery,
  parseIngredientLines,
  parseIsoDuration,
  parseRecipeDuration,
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

  it('dl av ett tillagat livsmedel utan rå densitet räknas inte som tillagad volym – raden ska kontrolleras', () => {
    const nudlar: Food = {
      id: 'lagom:nudlar',
      name: 'Nudlar',
      source: 'lagom',
      category: 'pasta_ris',
      nutrients: { kcal: 140 },
      portions: [],
      density: 0.6,
      rawWeight: { factor: 2.4, kind: 'okokt' },
    }
    expect(ingredientAmount(nudlar, { amount: 2, unit: 'dl' })).toBeUndefined()
    // Gram går fortfarande att räkna om (rå vikt), och en kokt vara i dl är tillagad volym.
    expect(ingredientAmount(nudlar, { amount: 200, unit: 'g' })).toEqual({ amount: 200, unit: 'g-ra', grams: 480 })
    expect(ingredientAmount(nudlar, { amount: 2, unit: 'dl', raw: '2 dl kokta nudlar' })).toEqual({ amount: 2, unit: 'dl', grams: 120 })
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

// ---------------------------------------------------------------------------
// Svenska receptsajter och matkassar
// ---------------------------------------------------------------------------

/**
 * Egna, påhittade recept som efterliknar hur olika svenska receptsajter och matkassar märker upp
 * sina recept (struktur, inte innehåll): ett ensamt Recipe-objekt, @graph med @id, grupper
 * (HowToSection), recipeYield som tal, text, lista eller objekt, ingredienser som objekt, HTML i
 * strängar, ogiltig JSON och serverns block för sidor med mikrodata.
 */
const ld = (json: string) => `<!doctype html><html lang="sv"><head><script type="application/ld+json">${json}</script></head><body></body></html>`

const SAJTER: Record<string, { html: string; recipe: Record<string, unknown>; ingredients?: string[]; lines: Array<[string, Record<string, unknown>]> }> = {
  'ett ensamt Recipe-objekt med HowToStep (som ICA)': {
    html: ld(`{
      "@context": "https://schema.org/",
      "@type": "Recipe",
      "name": "Fiskbullar i dillsås",
      "url": "https://recept.example.se/recept/fiskbullar-i-dillsas-100001/",
      "author": { "@type": "Organization", "name": "Exempelköket" },
      "totalTime": "PT40M",
      "recipeCategory": "Huvudrätt,Middag",
      "recipeYield": "4",
      "nutrition": { "@type": "NutritionInformation", "servingSize": "4 Servings", "calories": "500 calories" },
      "recipeIngredient": [
        "800 g fast potatis",
        "2 1/2 dl matlagningsgrädde",
        "ca 500 g fiskfärs eller torskfilé",
        "1/2 förp färsk dill (à 20 g)",
        "2 förp tonfisk i vatten (à 150 g)",
        "smör (till stekning)",
        "ev majsstärkelse",
        "4 port ris"
      ],
      "recipeInstructions": [{ "@type": "HowToStep", "text": "Koka potatisen." }]
    }`),
    recipe: { name: 'Fiskbullar i dillsås', servings: 4, totalMinutes: 40, url: 'https://recept.example.se/recept/fiskbullar-i-dillsas-100001/' },
    lines: [
      ['800 g fast potatis', { amount: 800, unit: 'g', name: 'fast potatis' }],
      ['2 1/2 dl matlagningsgrädde', { amount: 2.5, unit: 'dl', name: 'matlagningsgrädde' }],
      ['ca 500 g fiskfärs eller torskfilé', { amount: 500, unit: 'g', name: 'fiskfärs' }],
      ['1/2 förp färsk dill (à 20 g)', { amount: 10, unit: 'g', name: 'dill' }],
      ['2 förp tonfisk i vatten (à 150 g)', { amount: 300, unit: 'g', name: 'tonfisk i vatten' }],
      ['smör (till stekning)', { name: 'smör', check: true }],
      ['ev majsstärkelse', { name: 'majsstärkelse', check: true }],
      ['4 port ris', { amount: 4, unit: 'portion', name: 'ris' }],
    ],
  },
  'HowToSection i instruktionerna och "4 portioner" (som Arla)': {
    html: ld(`{
      "@context": "http://schema.org",
      "@type": "Recipe",
      "name": "Havregrynsgröt med äpple",
      "recipeYield": "4 portioner",
      "prepTime": "PT5M",
      "cookTime": "PT10M",
      "recipeIngredient": ["1 ½ dl havregryn", "½ gurka", "1 msk + 1 tsk rapsolja", "2 krm salt"],
      "recipeInstructions": [{ "@type": "HowToSection", "name": "Gör så här", "itemListElement": [{ "@type": "HowToStep", "text": "Koka upp." }] }]
    }`),
    recipe: { name: 'Havregrynsgröt med äpple', servings: 4, totalMinutes: 15 },
    lines: [
      ['1 ½ dl havregryn', { amount: 1.5, unit: 'dl', name: 'havregryn' }],
      ['½ gurka', { amount: 0.5, name: 'gurka' }],
      ['1 msk + 1 tsk rapsolja', { amount: 4, unit: 'tsk', name: 'rapsolja' }],
      ['2 krm salt', { amount: 2, unit: 'krm', name: 'salt' }],
    ],
  },
  '@graph med @id, recipeYield som lista och ingredienser i grupper (som Köket.se)': {
    html: ld(`{
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": "https://kok.example/#site", "name": "Exempelkök" },
        { "@type": "WebPage", "@id": "https://kok.example/linsgryta", "mainEntity": { "@id": "https://kok.example/linsgryta#recept" } },
        {
          "@type": ["Recipe"],
          "@id": "https://kok.example/linsgryta#recept",
          "name": "Linsgryta med kokos",
          "image": ["https://kok.example/a.jpg", "https://kok.example/b.jpg"],
          "recipeYield": ["4", "4 portioner"],
          "cookTime": "PT1H30M0S",
          "recipeIngredient": [
            { "@type": "HowToSection", "name": "Gryta", "itemListElement": ["2 dl röda linser", "1 burk kokosmjölk (400 ml)"] },
            { "@type": "HowToSection", "name": "Till servering", "itemListElement": [{ "@type": "HowToSupply", "name": "koriander" }, { "@type": "ListItem", "item": { "name": "1 lime" } }] }
          ]
        }
      ]
    }`),
    recipe: { name: 'Linsgryta med kokos', servings: 4, totalMinutes: 90, url: 'https://kok.example/linsgryta#recept' },
    lines: [
      ['2 dl röda linser', { amount: 2, unit: 'dl', name: 'röda linser' }],
      ['1 burk kokosmjölk (400 ml)', { amount: 400, unit: 'ml', name: 'kokosmjölk' }],
      ['koriander', { name: 'koriander', check: true }],
      ['1 lime', { amount: 1, name: 'lime' }],
    ],
  },
  'recipeYield som tal, stor bokstav och decimalpunkt (som HelloFresh)': {
    html: ld(`{
      "@context": "http://schema.org",
      "@type": "Recipe",
      "name": "Krämig kycklingpasta",
      "recipeYield": 2,
      "totalTime": "PT35M",
      "recipeIngredient": ["1 st Gul lök", "0.5 st Grönsaksbuljongtärning", "150 g Kycklingbröst", "1 förpackning Crème fraiche (2 dl)", "2 x 125 g Mozzarella", "Salt", "Peppar"],
      "recipeInstructions": [{ "@type": "HowToStep", "text": "<p>Skala och hacka löken.</p>" }]
    }`),
    recipe: { name: 'Krämig kycklingpasta', servings: 2, totalMinutes: 35 },
    lines: [
      ['1 st Gul lök', { amount: 1, unit: 'st', name: 'Gul lök' }],
      ['0.5 st Grönsaksbuljongtärning', { amount: 0.5, unit: 'st', name: 'Grönsaksbuljongtärning' }],
      ['150 g Kycklingbröst', { amount: 150, unit: 'g', name: 'Kycklingbröst' }],
      ['1 förpackning Crème fraiche (2 dl)', { amount: 2, unit: 'dl', name: 'Crème fraiche' }],
      ['2 x 125 g Mozzarella', { amount: 250, unit: 'g', name: 'Mozzarella' }],
      ['Salt', { name: 'Salt', check: true }],
      ['Peppar', { name: 'Peppar', check: true }],
    ],
  },
  'ogiltig JSON med radbrytningar och avslutande kommatecken (som Linas Matkasse)': {
    html: ld(`{
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Kyckling
i ugn",
      "recipeYield": "4 port",
      "recipeIngredient": ["300 g kycklingfilé (ca 2 st)", "1⁄2 tsk chiliflakes", "Gul lök, 1 st", "Kycklingbuljong 2 dl",],
    }`),
    recipe: { name: 'Kyckling i ugn', servings: 4 },
    lines: [
      ['300 g kycklingfilé (ca 2 st)', { amount: 300, unit: 'g', name: 'kycklingfilé' }],
      ['1⁄2 tsk chiliflakes', { amount: 0.5, unit: 'tsk', name: 'chiliflakes' }],
      ['Gul lök, 1 st', { amount: 1, unit: 'st', name: 'Gul lök' }],
      ['Kycklingbuljong 2 dl', { amount: 2, unit: 'dl', name: 'Kycklingbuljong' }],
    ],
  },
  'mainEntity, tid som text, portioner som objekt och ingredienser som HowToSupply (som Mathem)': {
    html: ld(`{
      "@context": "https://schema.org",
      "@type": "WebPage",
      "mainEntity": {
        "@type": "Recipe",
        "name": "Tomatsoppa",
        "totalTime": "30 minuter",
        "recipeYield": { "@type": "QuantitativeValue", "value": 4, "unitText": "portioner" },
        "recipeIngredient": [
          { "@type": "HowToSupply", "name": "krossade tomater", "requiredQuantity": { "@type": "QuantitativeValue", "value": 400, "unitText": "g" } },
          { "@type": "HowToSupply", "name": "grönsaksbuljong", "requiredQuantity": { "@type": "QuantitativeValue", "value": 2.5, "unitText": "dl" } },
          { "@type": "HowToSupply", "name": "1 gul lök" }
        ]
      }
    }`),
    recipe: { name: 'Tomatsoppa', servings: 4, totalMinutes: 30 },
    lines: [
      ['400 g krossade tomater', { amount: 400, unit: 'g', name: 'krossade tomater' }],
      ['2,5 dl grönsaksbuljong', { amount: 2.5, unit: 'dl', name: 'grönsaksbuljong' }],
      ['1 gul lök', { amount: 1, name: 'gul lök' }],
    ],
  },
  'HTML-entiteter, <br> i en sträng och lång ISO-tid (som Tasteline)': {
    html: ld(`{
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Kanelbullar &amp; vaniljbullar",
      "totalTime": "P0Y0M0DT1H30M0.000S",
      "recipeYield": "ca 30 st",
      "recipeIngredient": "25 g j&auml;st<br>2 1/2 dl mjölk<br />75 g smör"
    }`),
    recipe: { name: 'Kanelbullar & vaniljbullar', servings: 30, totalMinutes: 90 },
    lines: [
      ['25 g jäst', { amount: 25, unit: 'g', name: 'jäst' }],
      ['2 1/2 dl mjölk', { amount: 2.5, unit: 'dl', name: 'mjölk' }],
      ['75 g smör', { amount: 75, unit: 'g', name: 'smör' }],
    ],
  },
  'schema:Recipe, "4 personer" och punkttecken (som Godfredo)': {
    html: ld(`[{ "@type": "schema:Recipe", "name": "Vegetarisk curry", "recipeYield": "4 personer", "recipeIngredient": ["• 2 dl kokosmjölk", "– 1 tsk currypulver", "smör/margarin"] }]`),
    recipe: { name: 'Vegetarisk curry', servings: 4 },
    ingredients: ['• 2 dl kokosmjölk', '– 1 tsk currypulver', 'smör/margarin'],
    lines: [
      ['2 dl kokosmjölk', { amount: 2, unit: 'dl', name: 'kokosmjölk' }],
      ['1 tsk currypulver', { amount: 1, unit: 'tsk', name: 'currypulver' }],
      ['smör/margarin', { name: 'smör', check: true }],
    ],
  },
  'serverns block för en sida med mikrodata': {
    html: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Mormors fiskgratäng","recipeYield":"4 portioner","totalTime":"PT50M","recipeIngredient":["600 g torskfilé","2&nbsp;dl vispgrädde","\\u003cb\\u003e1\\u003c/b\\u003e msk senap"]}</script>`,
    recipe: { name: 'Mormors fiskgratäng', servings: 4, totalMinutes: 50 },
    lines: [
      ['600 g torskfilé', { amount: 600, unit: 'g', name: 'torskfilé' }],
      ['2 dl vispgrädde', { amount: 2, unit: 'dl', name: 'vispgrädde' }],
      ['1 msk senap', { amount: 1, unit: 'msk', name: 'senap' }],
    ],
  },
}

describe('receptsajter och matkassar', () => {
  it.each(Object.entries(SAJTER))('%s', (_name, { html, recipe, ingredients: expectedIngredients, lines }) => {
    const found = parseRecipeJsonLd(html)
    expect(found).toHaveLength(1)
    const { ingredients, ...rest } = found[0]
    expect(rest).toEqual(recipe)
    expect(ingredients).toEqual(expectedIngredients ?? lines.map(([raw]) => raw))
    const parsed = parseIngredientLines(ingredients.join('\n'))
    expect(parsed).toHaveLength(lines.length)
    lines.forEach(([raw, expected], i) => expect(parsed[i], raw).toMatchObject({ raw, check: false, ...expected }))
  })

  it('djupt nästlade värden spränger inte tolkningen', () => {
    const deep = (n: number, leaf: string) => '{"text":'.repeat(n) + leaf + '}'.repeat(n)
    const html = ld(`{"@type":"Recipe","name":${deep(20_000, '"x"')},"recipeYield":${deep(20_000, '4')},"recipeIngredient":[{"name":"ägg","requiredQuantity":${deep(20_000, '2')}}]}`)
    expect(parseRecipeJsonLd(html)).toEqual([{ name: 'Importerat recept', ingredients: ['ägg'] }])
  })

  it('hittar receptet även bland flera block, med ett trasigt block först', () => {
    const html = `<script type="application/ld+json">{ "@type": "Recipe", "name": "Trasig" </script>${SAJTER['schema:Recipe, "4 personer" och punkttecken (som Godfredo)'].html}`
    expect(parseRecipeJsonLd(html).map((r) => r.name)).toEqual(['Vegetarisk curry'])
  })
})

describe('portioner och tider i olika former', () => {
  it('portioner går före styck, och styck före första talet', () => {
    expect(parseYield('1 långpanna (ca 24 bitar)')).toBe(24)
    expect(parseYield('4 portioner (8 st)')).toBe(4)
    expect(parseYield(['1 sats', '6 portioner'])).toBe(6)
    expect(parseYield({ '@type': 'QuantitativeValue', value: 6, unitText: 'portioner' })).toBe(6)
    expect(parseYield('Serves 2')).toBe(2)
    expect(parseYield('2 limpor')).toBe(2)
    expect(parseYield(2.5)).toBe(3)
    expect(parseYield(0)).toBeUndefined()
  })

  it('ISO 8601 med år, månader, veckor och decimaler', () => {
    expect(parseIsoDuration('P0Y0M0DT0H45M0.000S')).toBe(45)
    expect(parseIsoDuration('PT1H30M0S')).toBe(90)
    expect(parseIsoDuration('PT0.5H')).toBe(30)
    expect(parseIsoDuration('P1W')).toBe(10080)
    // En månad eller ett år är ingen tillagningstid.
    expect(parseIsoDuration('P1M')).toBeUndefined()
    expect(parseIsoDuration('PT')).toBeUndefined()
  })

  it('tid som tal eller svensk text', () => {
    expect(parseRecipeDuration('30 minuter')).toBe(30)
    expect(parseRecipeDuration('1 tim 15 min')).toBe(75)
    expect(parseRecipeDuration('ca 1 h')).toBe(60)
    expect(parseRecipeDuration('1,5 timmar')).toBe(90)
    expect(parseRecipeDuration('45')).toBe(45)
    expect(parseRecipeDuration(20)).toBe(20)
    expect(parseRecipeDuration('PT20M')).toBe(20)
    expect(parseRecipeDuration('snabbt')).toBeUndefined()
  })
})

describe('sammansatta mängder', () => {
  const q = (text: string) => {
    const { amount, unit, name } = parseRecipeQuantity(text)
    return { amount, unit, name }
  }

  it('lägger ihop två mått av samma slag i ett jämnt mått', () => {
    expect(q('1 msk + 1 tsk olja')).toEqual({ amount: 4, unit: 'tsk', name: 'olja' })
    expect(q('1 dl + 2 msk vatten')).toEqual({ amount: 1.3, unit: 'dl', name: 'vatten' })
    expect(q('2 msk + 1 krm salt')).toEqual({ amount: 6.2, unit: 'tsk', name: 'salt' })
    expect(q('1 kg och 200 g potatis')).toEqual({ amount: 1.2, unit: 'kg', name: 'potatis' })
    // Volym och vikt går inte att lägga ihop – då gäller den första mängden.
    expect(q('1 dl + 100 g ris')).toMatchObject({ amount: 1, unit: 'dl' })
  })

  it('multiplicerar "2 x 400 g"', () => {
    expect(q('2 x 400 g krossade tomater')).toEqual({ amount: 800, unit: 'g', name: 'krossade tomater' })
    expect(q('2 st × 125 g mozzarella')).toEqual({ amount: 250, unit: 'g', name: 'mozzarella' })
  })

  it('första alternativet blir sökordet', () => {
    expect(ingredientQuery('blandfärs eller nötfärs (ärt- och nötfärs)')).toBe('blandfärs')
    expect(ingredientQuery('smör/margarin till stekning')).toBe('smör')
    expect(ingredientQuery('salt + 1 krm peppar')).toBe('salt')
  })
})

describe('ett helt inklistrat recept', () => {
  it('hoppar över rubriker, uppgifter och steg – och slutar vid instruktionerna', () => {
    const text = `Pannbiff med lök
4 portioner
Portioner: 4
Tid: 45 min
Ingredienser
Pannbiff:
500 g nötfärs
1 dl ströbröd
Sås
2 dl grädde
Till servering
kokt potatis
1. Blanda färs och ströbröd.
Gör så här
Forma biffarna och stek dem i smör.
1 ägg`
    expect(parseIngredientLines(text).map((l) => l.raw)).toEqual(['Pannbiff med lök', '500 g nötfärs', '1 dl ströbröd', '2 dl grädde', 'kokt potatis'])
  })

  it('en lång mening som slutar med punkt är en instruktion', () => {
    expect(parseIngredientLines('Sätt ugnen på 200 grader och låt den bli ordentligt varm innan du börjar.\n2 dl mjölk')).toEqual([
      { raw: '2 dl mjölk', amount: 2, unit: 'dl', name: 'mjölk', check: false },
    ])
  })
})
