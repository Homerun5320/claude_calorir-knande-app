/**
 * Drycker: vatten, kaffe, te, chokladdrycker, protein-, energi- och sportdrycker, läsk, saft, juice,
 * smoothies samt öl, cider, vin, sprit och drinkar.
 *
 * Grova linjer: en rad per dryck så som den beställs eller köps ("Kaffe", "Cappuccino", "Starköl",
 * "Rödvin"). Närliggande varianter med nästan samma värden (t.ex. kokkaffe, flat white,
 * veteöl, gin och whisky) ingår i raden och hittas via synonymerna. Produkttyper med många märken
 * (energidryck, läsk, cola, sportdryck, proteindryck, chokladmjölk, smoothie, cider …) är
 * samlingsvärden (`avg`): genomsnittet av vanliga märken i svenska butiker. Exakta värden för ett
 * märke får man genom att skanna streckkoden (Open Food Facts).
 *
 * Alla värden per 100 g (≈ 100 ml). Värden från förpackningar anges ofta per 100 ml – de är här
 * omräknade till per 100 g med dryckens densitet. Baserat på Livsmedelsverkets livsmedelsdatabas,
 * tillverkarnas och butikernas näringsdeklarationer (samlingsvärden) och standardrecept
 * (sammansatta drycker, räknade på Livsmedelsverkets värden för ingredienserna, t.ex. espresso och
 * mellanmjölk). Drycker med `lmv` är samma livsmedel som i Livsmedelsverkets databas; de
 * näringsämnen som saknas här fylls i därifrån.
 *
 * Alkohol anges i gram etanol per 100 g: vol-% × 0,789 / densitet (för kopplade drycker
 * Livsmedelsverkets värde).
 * Ett svenskt standardglas = 12 g alkohol.
 * Koffein i mg per 100 g. Bryggkaffe ca 58 mg, espresso ca 200 mg, te ca 20 mg, cola ca 10 mg.
 */
import { defineFoods, type FoodSeed } from './define'

type PortionSeed = [string, string, number]

/** Gram för en volym i ml vid en viss densitet. */
const g = (ml: number, density = 1): number => Math.round(ml * density)

/** Förklaring för samlingsvärden (visas i rutan "Samlingsvärde" på detaljsidan). */
const samling = (brands: string, extra = ''): string =>
  `Samlingsvärde: genomsnitt av vanliga märken (t.ex. ${brands}).${extra ? ` ${extra}` : ''} Skanna streckkoden för exakta värden för ditt märke.`

/** Koffeinråd för energidrycker. */
const KOFFEIN_RAD = 'EFSA bedömer upp till 400 mg koffein per dag som säkert för vuxna. Inte lämpligt för barn, gravida eller ammande.'

const VATTEN_PORTIONS: PortionSeed[] = [
  ['glas', '1 glas (2 dl)', 200],
  ['flaska', '1 flaska (50 cl)', 500],
  ['stort-glas', '1 stort glas (3 dl)', 300],
  ['liter', '1 liter', 1000],
]

const KAFFE_PORTIONS: PortionSeed[] = [
  ['kopp', '1 kopp (1,5 dl)', 150],
  ['mugg', '1 mugg (2,5 dl)', 250],
  ['stor-mugg', '1 stor mugg (3 dl)', 300],
]

const TE_PORTIONS: PortionSeed[] = [
  ['kopp', '1 kopp (2 dl)', 200],
  ['mugg', '1 mugg (3 dl)', 300],
]

const LATTE_PORTIONS: PortionSeed[] = [
  ['glas', '1 latte (3 dl)', 300],
  ['liten', '1 liten latte (2 dl)', 200],
  ['stor', '1 stor latte (4 dl)', 400],
]

/** Läsk och andra kolsyrade drycker. */
const laskPortions = (d: number): PortionSeed[] => [
  ['burk', '1 burk (33 cl)', g(330, d)],
  ['flaska', '1 flaska (50 cl)', g(500, d)],
  ['glas', '1 glas (2 dl)', g(200, d)],
  ['stor-flaska', '1 stor flaska (1,5 l)', g(1500, d)],
]

/** Juice, saft och andra drycker som serveras i glas. */
const glasPortions = (d: number): PortionSeed[] => [
  ['glas', '1 glas (2 dl)', g(200, d)],
  ['litet-glas', '1 litet glas (1 dl)', g(100, d)],
  ['stort-glas', '1 stort glas (3 dl)', g(300, d)],
]

const olPortions = (d: number): PortionSeed[] => [
  ['burk', '1 burk/flaska (33 cl)', g(330, d)],
  ['storstark', '1 stor stark (50 cl)', g(500, d)],
  ['stor-40', '1 stort glas (40 cl)', g(400, d)],
  ['glas', '1 glas (2 dl)', g(200, d)],
]

const vinPortions = (d: number): PortionSeed[] => [
  ['glas', '1 vinglas (15 cl)', g(150, d)],
  ['litet-glas', '1 litet glas (12 cl)', g(120, d)],
  ['stort-glas', '1 stort glas (20 cl)', g(200, d)],
  ['flaska', '1 flaska (75 cl)', g(750, d)],
  ['box', '1 box (3 l)', g(3000, d)],
]

const spritPortions = (d: number): PortionSeed[] => [
  ['snaps', '1 snaps/shot (4 cl)', g(40, d)],
  ['halv', '1 liten (2 cl)', g(20, d)],
  ['drink', '1 drinkmängd (6 cl)', g(60, d)],
]

/** Näringsämnen som är noll i sprit och andra rena drycker (kända nollor, inte okända). */
const NOLL_MIKRO = { vitD: 0, vitC: 0, folate: 0, vitB12: 0 } as const

// ---------------------------------------------------------------------------
// Vatten
// ---------------------------------------------------------------------------

const vatten: FoodSeed[] = [
  {
    id: 'vatten-kranvatten',
    name: 'Vatten',
    cat: 'dryck',
    lmv: 1953,
    kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    portions: VATTEN_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['vatten', 'kranvatten', 'glas vatten', 'vattenglas', 'kallt vatten', 'h2o', 'vatn', 'vattn', 'stilla vatten', 'ljummet vatten'],
    note: 'Kranvatten. Mineralhalten varierar mellan kommuner.',
  },
  {
    id: 'vatten-kolsyrat',
    name: 'Kolsyrat vatten',
    cat: 'dryck',
    lmv: 1949,
    kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    portions: VATTEN_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'bubbelvatten', 'kolsyrat vatten', 'sodavatten', 'sodastream', 'danskvatten', 'bubblor', 'kolsyrat', 'selters',
      'mineralvatten', 'ramlösa', 'ramlosa', 'ramlösa naturell', 'loka', 'loka naturell', 'källvatten', 'vichyvatten', 'vichy',
    ],
    note: 'Kolsyrat vatten och mineralvatten utan smak. Mineralvatten innehåller lite natrium, kalcium och magnesium beroende på källan.',
  },
  {
    id: 'vatten-kolsyrat-smak-osotat',
    name: 'Vatten med smak',
    cat: 'dryck',
    kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { ...NOLL_MIKRO },
    portions: [['flaska', '1 flaska (33 cl)', 330], ['flaska-50', '1 flaska (50 cl)', 500], ['glas', '1 glas (2 dl)', 200], ['stor-flaska', '1 stor flaska (1,5 l)', 1500]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['smaksatt vatten', 'loka citron', 'ramlösa citrus', 'bubbelvatten med smak', 'loka', 'ramlösa', 'vatten med smak', 'smakvatten', 'mineralvatten med smak', 'päronvatten', 'citronvatten'],
    note: 'Kolsyrat vatten med smak, utan socker och sötningsmedel (t.ex. Loka och Ramlösa med smak).',
  },
  {
    id: 'vitamindryck-sotad',
    name: 'Vitamindryck',
    cat: 'lask_saft',
    avg: true,
    kcal: 17, prot: 0, carb: 4.1, fat: 0, fiber: 0, sugar: 4.1, addedSugar: 4.1, satFat: 0, salt: 0,
    portions: [['flaska', '1 flaska (50 cl)', 510], ['glas', '1 glas (2 dl)', 204]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['vitamin well', 'vitaminwell', 'vitamindryck', 'vitaminvatten', 'vitamin water', 'funktionsdryck', 'vitamin well reload', 'vitamin vell'],
    note: 'Samlingsvärde: genomsnitt av vanliga smaker av sötad vitamindryck (t.ex. Vitamin Well, ca 17 kcal och 4 g socker per 100 ml). Tillsatta vitaminer och mineraler varierar mellan smaker och sockerfria varianter ger nästan 0 kcal. Skanna streckkoden för exakta värden för din dryck.',
  },
  {
    id: 'kokosvatten',
    name: 'Kokosvatten',
    cat: 'juice',
    lmv: 1591,
    kcal: 18, prot: 0, carb: 4.5, fat: 0, fiber: 0, sugar: 4, addedSugar: 0, satFat: 0, salt: 0.1,
    portions: [['forp', '1 förpackning (33 cl)', 337], ['glas', '1 glas (2 dl)', 204]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['kokosvatten', 'coconut water', 'kokos vatten', 'vita coco'],
  },
]

// ---------------------------------------------------------------------------
// Kaffe
// ---------------------------------------------------------------------------

/** Mikronäringsämnen i svart bryggkaffe per 100 g (Livsmedelsverket, kaffe bryggt). */
const KAFFE_MIKRO = {
  vitA: 0, vitD: 0, vitE: 0, vitC: 0, thiamin: 0, riboflavin: 0, niacin: 0.6, vitB6: 0, folate: 0.1, vitB12: 0,
  calcium: 3, iron: 0, magnesium: 8, potassium: 102, phosphorus: 6, zinc: 0, selenium: 0, iodine: 3,
} as const

const kaffe: FoodSeed[] = [
  {
    id: 'kaffe-bryggt',
    name: 'Kaffe',
    cat: 'dryck',
    lmv: 1957,
    kcal: 2, prot: 0, carb: 0.5, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { caffeine: 58 },
    portions: KAFFE_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'kaffe', 'bryggkaffe', 'svart kaffe', 'filterkaffe', 'kopp kaffe', 'kaffe svart', 'påtår', 'patar', 'bryggt kaffe', 'kaffé', 'kafe',
      'java', 'termoskaffe', 'zoégas', 'zoegas', 'gevalia', 'löfbergs', 'lofbergs', 'arvid nordquist', 'mellanrost', 'mörkrost', 'kaffe bryggt',
      'kokkaffe', 'kokt kaffe', 'lägerkaffe', 'presskaffe', 'presskanna', 'french press', 'kokekaffe',
      'americano', 'amerikano', 'caffe americano', 'long black', 'kallbryggt', 'cold brew',
    ],
    note: 'Svart bryggkaffe. Svenskt bryggkaffe är relativt starkt – koffeinhalten varierar, ca 40–80 mg per dl. Kokkaffe, presskaffe och americano har samma värden. Ofiltrerat kaffe (kokkaffe, presskaffe) innehåller cafestol som kan höja LDL-kolesterolet – filtrerat bryggkaffe gör det knappt.',
    co2e: 0.3,
  },
  {
    id: 'kaffe-koffeinfritt',
    name: 'Koffeinfritt kaffe',
    cat: 'dryck',
    kcal: 2, prot: 0, carb: 0.5, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { ...KAFFE_MIKRO, caffeine: 2 },
    portions: KAFFE_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['koffeinfritt', 'koffeinfritt kaffe', 'decaf', 'kaffe utan koffein', 'koffeinfri', 'koffeinfritt bryggkaffe', 'koffeinfritt snabbkaffe'],
    co2e: 0.3,
  },
  {
    id: 'snabbkaffe-tillrett',
    name: 'Snabbkaffe',
    cat: 'dryck',
    lmv: 1956,
    kcal: 2, prot: 0.1, carb: 0.4, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { caffeine: 40 },
    portions: KAFFE_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['snabbkaffe', 'pulverkaffe', 'nescafe', 'nescafé', 'instant kaffe', 'frystorkat kaffe', 'snabb kaffe', 'löskaffe'],
    note: 'Tillrett med vatten, ca 2 g pulver per kopp.',
    co2e: 0.3,
  },
  {
    id: 'espresso',
    name: 'Espresso',
    cat: 'dryck',
    lmv: 1958,
    kcal: 9, prot: 0.1, carb: 1.7, fat: 0.2, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.1, salt: 0,
    n: { caffeine: 200 },
    portions: [['shot', '1 enkel espresso (3 cl)', 30], ['dubbel', '1 dubbel espresso (6 cl)', 60]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['espresso', 'expresso', 'espressoshot', 'ristretto', 'doppio', 'lungo', 'kaffeshot'],
    note: 'En enkel espresso innehåller ca 60 mg koffein.',
    co2e: 1.2,
  },
  {
    id: 'caffe-latte-mellanmjolk',
    name: 'Latte',
    cat: 'dryck',
    kcal: 41, prot: 3.0, carb: 4.4, fat: 1.3, fiber: 0, sugar: 4.2, addedSugar: 0, satFat: 0.84, salt: 0.09,
    n: {
      caffeine: 27,
      monoFat: 0.26, polyFat: 0.01, cholesterol: 6,
      vitA: 11, vitD: 0.87, vitC: 0.6, riboflavin: 0.15, niacin: 1.6, vitB6: 0.04, folate: 8, vitB12: 0.38,
      calcium: 109, iron: 0.01, magnesium: 20, potassium: 155, phosphorus: 123, zinc: 0.35, selenium: 1.5, iodine: 20,
    },
    portions: LATTE_PORTIONS,
    density: 1.02, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['latte', 'caffe latte', 'cafe latte', 'kaffe latte', 'caffelatte', 'latte macchiato', 'café au lait', 'lattemacchiato', 'late', 'mjölklatte'],
    note: 'Räknat på ca 4 cl espresso och 2,6 dl mellanmjölk. Smaksirap tillkommer, ca 20–25 kcal per pump.',
    co2e: 1.1,
  },
  {
    id: 'cappuccino-mellanmjolk',
    name: 'Cappuccino',
    cat: 'dryck',
    kcal: 40, prot: 2.9, carb: 4.2, fat: 1.3, fiber: 0, sugar: 4.0, addedSugar: 0, satFat: 0.8, salt: 0.09,
    n: {
      caffeine: 33,
      monoFat: 0.25, polyFat: 0.02, cholesterol: 6,
      vitA: 11, vitD: 0.83, vitC: 0.5, riboflavin: 0.15, niacin: 1.7, vitB6: 0.04, folate: 8, vitB12: 0.37,
      calcium: 105, iron: 0.02, magnesium: 23, potassium: 153, phosphorus: 118, zinc: 0.33, selenium: 1.4, iodine: 19,
    },
    portions: [
      ['kopp', '1 cappuccino (1,8 dl)', 180],
      ['stor', '1 stor cappuccino (3 dl)', 300],
      ['flat-white', '1 flat white (1,6 dl)', 163],
      ['cortado', '1 cortado (0,8 dl)', 81],
    ],
    density: 1.02, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: [
      'cappuccino', 'capuccino', 'cappucino', 'kapuccino', 'cappu', 'kaffe med mjölkskum',
      'flat white', 'flatwhite', 'cortado', 'gibraltar', 'piccolo', 'piccolo latte', 'macchiato', 'espresso med mjölk',
    ],
    note: 'Räknat på en enkel espresso och 1,5 dl mellanmjölk. Flat white och cortado har mer espresso i förhållande till mjölken men ungefär samma energi per 100 g.',
    co2e: 1.2,
  },
  {
    id: 'caffe-latte-havredryck',
    name: 'Latte med havredryck',
    cat: 'dryck',
    kcal: 52, prot: 1.0, carb: 5.9, fat: 2.6, fiber: 0.7, sugar: 2.9, satFat: 0.27, salt: 0.09,
    n: {
      caffeine: 27,
      monoFat: 1.6, polyFat: 0.7, omega3: 0.2,
      vitD: 1.0, vitC: 0, riboflavin: 0.24, vitB12: 0.33,
      calcium: 105, iron: 0.01, magnesium: 10, potassium: 206, phosphorus: 97,
    },
    portions: [...LATTE_PORTIONS, ['kopp', '1 cappuccino (1,8 dl)', 185]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'laktosfri'],
    syn: [
      'havrelatte', 'oatly latte', 'latte havre', 'vegansk latte', 'latte med havremjölk', 'oat latte', 'havremjölk latte', 'latte havredryck',
      'ikaffe latte', 'havrecappuccino', 'cappuccino havre', 'cappuccino havredryck', 'cappuccino havremjölk', 'vegansk cappuccino',
      'oat cappuccino', 'havre cappu', 'cappuccino oatly', 'flat white havre',
    ],
    note: 'Räknat på espresso och berikad baristahavredryck (kalcium, vitamin D, B2, B12). Gäller även cappuccino med havredryck.',
    co2e: 0.5,
  },
  {
    id: 'caffe-mocha',
    name: 'Mocha',
    cat: 'dryck',
    kcal: 60, prot: 2.9, carb: 8.9, fat: 1.4, fiber: 0.2, sugar: 7.9, addedSugar: 4.1, satFat: 0.86, salt: 0.1,
    n: {
      caffeine: 28,
      vitD: 0.8, vitC: 1, folate: 4, vitB12: 0.35,
      calcium: 96, iron: 0.2, magnesium: 24, potassium: 162,
    },
    portions: [['glas', '1 mocha (3 dl)', 305], ['stor', '1 stor mocha (4 dl)', 406]],
    density: 1.02, liquid: true,
    tags: ['vegetarisk'],
    syn: ['mocha', 'caffè mocha', 'caffe mocha', 'mocka', 'mockachino', 'mochaccino', 'caffe mocca', 'kaffe med choklad', 'chokladlatte'],
    note: 'Espresso, mellanmjölk och chokladsås, utan vispgrädde. Med grädde tillkommer ca 60 kcal per klick.',
    co2e: 1.3,
  },
  {
    id: 'kaffe-med-mjolk',
    name: 'Kaffe med mjölk',
    cat: 'dryck',
    kcal: 7, prot: 0.4, carb: 1, fat: 0.2, fiber: 0, sugar: 0.6, addedSugar: 0, satFat: 0.12, salt: 0.01,
    n: {
      caffeine: 51,
      vitD: 0.12, vitC: 0.1, riboflavin: 0.02, niacin: 0.65, folate: 1, vitB12: 0.05,
      calcium: 18, iron: 0, magnesium: 8, potassium: 109, phosphorus: 22, zinc: 0.05, iodine: 5,
    },
    portions: [['kopp', '1 kopp (1,5 dl + 2 cl mjölk)', 171], ['mugg', '1 mugg (2,5 dl + 2 cl mjölk)', 271]],
    density: 1.0, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['kaffe med mjölk', 'kaffe mjölk', 'mjölkkaffe', 'kaffe m mjölk', 'kaffe o mjölk', 'kaffe med skvätt mjölk', 'ljust kaffe'],
    note: 'Bryggkaffe med en skvätt mellanmjölk.',
    co2e: 0.4,
  },
  {
    id: 'kaffe-med-havredryck',
    name: 'Kaffe med havredryck',
    cat: 'dryck',
    kcal: 9, prot: 0.3, carb: 1.1, fat: 0.4, fiber: 0.1, sugar: 0.4, addedSugar: 0, satFat: 0.04, salt: 0.01,
    n: {
      caffeine: 51,
      vitD: 0.14, vitC: 0, riboflavin: 0.04, niacin: 0.5, folate: 2, vitB12: 0.05,
      calcium: 16, iron: 0.04, magnesium: 7, potassium: 83,
    },
    portions: [['kopp', '1 kopp (1,5 dl + 2 cl havredryck)', 171], ['mugg', '1 mugg (2,5 dl + 2 cl havredryck)', 271]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'laktosfri'],
    syn: ['kaffe med havredryck', 'kaffe med havremjölk', 'kaffe havredryck', 'kaffe havre', 'kaffe med havre', 'kaffe med ikaffe', 'kaffe oatly', 'kaffe m havre', 'kaffe med växtmjölk', 'kaffe med barista'],
    note: 'Bryggkaffe med en skvätt berikad baristahavredryck.',
    co2e: 0.3,
  },
  {
    id: 'kaffe-med-gradde',
    name: 'Kaffe med grädde',
    cat: 'dryck',
    kcal: 18, prot: 0.5, carb: 0.7, fat: 1.4, fiber: 0, sugar: 0.5, addedSugar: 0, satFat: 0.92, salt: 0.01,
    n: {
      caffeine: 51,
      vitA: 13, vitD: 0.01, vitC: 0, riboflavin: 0.04, niacin: 0.5, folate: 2, vitB12: 0.04,
      calcium: 14, iron: 0.03, magnesium: 8, potassium: 95, phosphorus: 15, zinc: 0.06,
    },
    portions: [['kopp', '1 kopp (1,5 dl + 2 cl grädde)', 170], ['mugg', '1 mugg (2,5 dl + 2 cl grädde)', 270]],
    density: 1.0, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['kaffe med grädde', 'kaffe grädde', 'gräddkaffe', 'kaffe m grädde', 'kaffe o grädde', 'kaffe med kaffegrädde'],
    note: 'Bryggkaffe med 2 cl kaffegrädde.',
    co2e: 0.5,
  },
  {
    id: 'iskaffe-latte-fardig',
    name: 'Iskaffe',
    cat: 'dryck',
    lmv: 7298,
    kcal: 66, prot: 2.7, carb: 8.6, fat: 2.3, fiber: 0, sugar: 8.5, addedSugar: 5, satFat: 1.4, salt: 0.1,
    n: { caffeine: 30 },
    portions: [['bagare', '1 bägare/flaska (2,3 dl)', 237], ['burk', '1 burk (2,5 dl)', 258]],
    density: 1.03, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['iskaffe', 'iced coffee', 'iced latte', 'kall kaffe', 'kaffedryck', 'caffe latte bägare', 'emmi', 'starbucks', 'frappuccino', 'kall latte', 'is kaffe', 'islatte'],
    note: 'Färdig, sötad iskaffe med mjölk på bägare, flaska eller burk (latte, cappuccino, macchiato).',
    co2e: 1.3,
  },
]

// ---------------------------------------------------------------------------
// Te
// ---------------------------------------------------------------------------

const te: FoodSeed[] = [
  {
    id: 'te-svart-bryggt',
    name: 'Te',
    cat: 'dryck',
    lmv: 1962,
    kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { caffeine: 20 },
    portions: TE_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'te', 'svart te', 'earl grey', 'english breakfast', 'engelskt te', 'tepåse', 'darjeeling', 'assam', 'kopp te', 'the', 'thé', 'kvällste',
      'grönt te', 'gront te', 'green tea', 'sencha', 'jasminte', 'jasmin te', 'gyokuro', 'grönt', 'vitt te', 'oolong',
      'te med mjölk', 'mjölkte', 'te mjölk', 'milk tea',
    ],
    note: 'Svart eller grönt te. Koffeinhalten beror på dragtid – ca 30–50 mg per kopp svart te, något mindre för grönt. En skvätt mellanmjölk (2 cl) ger ca 10 kcal per kopp.',
  },
  {
    id: 'orte-bryggt',
    name: 'Örtte',
    cat: 'dryck',
    lmv: 1963,
    kcal: 1, prot: 0, carb: 0.3, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0,
    n: { caffeine: 0 },
    portions: TE_PORTIONS,
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['örtte', 'orte', 'rooibos', 'rotbuskte', 'kamomillte', 'kamomill', 'pepparmyntste', 'myntate', 'nyponte', 'ingefärste', 'fruktte', 'koffeinfritt te', 'örtthe', 'kryddte'],
    note: 'Koffeinfritt, t.ex. rooibos, kamomill, mynta och fruktte.',
  },
  {
    id: 'chai-latte-mellanmjolk',
    name: 'Chai latte',
    cat: 'dryck',
    kcal: 62, prot: 2.9, carb: 9.8, fat: 1.3, fiber: 0, sugar: 9.7, addedSugar: 5.7, satFat: 0.8, salt: 0.09,
    n: {
      caffeine: 12,
      vitA: 11, vitD: 0.83, vitC: 0.5, riboflavin: 0.12, folate: 7, vitB12: 0.36,
      calcium: 100, iron: 0.05, magnesium: 9, potassium: 130, phosphorus: 112, zinc: 0.33, iodine: 18,
    },
    portions: [['glas', '1 chai latte (3 dl)', 300], ['liten', '1 liten chai latte (2 dl)', 200]],
    density: 1.03, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['chai', 'chai latte', 'chai te', 'chai tea latte', 'tchai', 'masala chai', 'kryddte med mjölk', 'chailatte'],
    note: 'Café-variant med sötad chaisirap eller -koncentrat och mellanmjölk.',
    co2e: 1.1,
  },
  {
    id: 'matcha-latte-mellanmjolk',
    name: 'Matcha latte',
    cat: 'dryck',
    kcal: 43, prot: 3.3, carb: 4.3, fat: 1.4, fiber: 0.2, sugar: 4.2, addedSugar: 0, satFat: 0.85, salt: 0.09,
    n: {
      caffeine: 17,
      vitA: 25, vitK: 7, vitD: 0.9, vitC: 1, riboflavin: 0.13, folate: 9, vitB12: 0.4,
      calcium: 115, iron: 0.1, magnesium: 11, potassium: 152, phosphorus: 129, zinc: 0.37, iodine: 21,
    },
    portions: [['glas', '1 matcha latte (2,8 dl)', 280]],
    density: 1.02, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['matcha', 'matcha latte', 'matchalatte', 'grönt te latte', 'matcha te'],
    note: 'Osötad, räknat på 1,5 g matchapulver och 2,5 dl mellanmjölk. Sötad variant: ca +15 kcal per 100 g.',
    co2e: 1.1,
  },
  {
    id: 'iste-sotat',
    name: 'Iste',
    cat: 'lask_saft',
    avg: true,
    kcal: 19, prot: 0, carb: 4.6, fat: 0, fiber: 0, sugar: 4.5, addedSugar: 4.5, satFat: 0, salt: 0.02,
    n: { caffeine: 5, ...NOLL_MIKRO, calcium: 1, potassium: 10 },
    portions: [['flaska', '1 flaska (50 cl)', 510], ['glas', '1 glas (2 dl)', 204], ['burk', '1 burk (33 cl)', 337], ['stor-flaska', '1 stor flaska (1,5 l)', 1530]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['iste', 'ice tea', 'iced tea', 'lipton', 'lipton ice tea', 'persika iste', 'is te', 'fuze tea', 'fuzetea', 'persikoiste', 'citroniste'],
    note: samling('Lipton Ice Tea, Fuze Tea', 'Sötat iste med persika, citron m.m. Sockerfria varianter ger ca 1 kcal per 100 ml.'),
  },
  {
    id: 'bubbelte',
    name: 'Bubbelte',
    cat: 'lask_saft',
    kcal: 72, prot: 0.8, carb: 13.5, fat: 1.6, fiber: 0.1, sugar: 8.5, addedSugar: 7.5, satFat: 1.1, salt: 0.05,
    n: { caffeine: 10, vitD: 0, calcium: 25, potassium: 40 },
    portions: [['mugg', '1 bubbelte (5 dl)', 520], ['liten', '1 liten bubbelte (3,5 dl)', 365]],
    density: 1.04, liquid: true,
    tags: ['vegetarisk'],
    syn: ['bubbelte', 'bubble tea', 'boba', 'boba tea', 'bobate', 'bubbel te', 'tapiokate', 'pärlte', 'mjölkte med pärlor', 'bubbletea'],
    note: 'Sötat mjölkte med tapiokapärlor. Varierar mycket – ca 250–450 kcal per 5 dl beroende på sötma, mjölk eller gräddersättning och mängden pärlor.',
  },
]

// ---------------------------------------------------------------------------
// Choklad-, mjölk- och proteindrycker
// ---------------------------------------------------------------------------

const chokladProtein: FoodSeed[] = [
  {
    id: 'chokladmjolk-pulver-mellanmjolk',
    name: 'Varm choklad',
    cat: 'mejeri',
    lmv: 157,
    kcal: 64, prot: 3.8, carb: 8.4, fat: 1.6, fiber: 0, sugar: 8.1, addedSugar: 3, satFat: 1.1, salt: 0.1,
    n: { caffeine: 3 },
    portions: [['glas', '1 glas (2 dl mjölk + 2 tsk pulver)', 216], ['mugg', '1 mugg (2,5 dl mjölk + pulver)', 270]],
    density: 1.05, liquid: true,
    tags: ['vegetarisk', 'svensk'],
    syn: [
      "o'boy", 'oboy', 'o boy', 'o´boy', 'chokladmjölk', 'varm choklad', 'varmchoklad', 'kakao', 'varm kakao', 'hot chocolate', 'choklad mjölk',
      'nesquik', 'chokladdryck', 'oboy med mjölk', 'chokladmjolk', 'drickchoklad', 'choklad med grädde', 'kakao med grädde',
    ],
    note: "Chokladdryck av pulver (t.ex. O'boy) och mellanmjölk, varm eller kall – ca 2 tsk pulver per 2 dl. Med 3 tsk pulver blir det ca 70 kcal per 100 g. En rejäl klick vispgrädde (25 g) ger ca 90 kcal extra.",
    co2e: 1.3,
  },
  {
    id: 'varm-choklad-havredryck',
    name: 'Varm choklad med havredryck',
    cat: 'vaxtdryck',
    lmv: 6599,
    kcal: 61, prot: 1.5, carb: 9.6, fat: 1.6, fiber: 0.6, sugar: 6.6, addedSugar: 4, satFat: 0.2, salt: 0.1,
    portions: [['glas', '1 glas (2 dl)', 208], ['mugg', '1 mugg (2,5 dl)', 260]],
    density: 1.04, liquid: true,
    tags: ['vegan', 'laktosfri'],
    syn: ['varm choklad havre', 'varm choklad havredryck', 'vegansk varm choklad', 'havrechoklad', 'oboy med havredryck', 'kakao med havredryck', 'chokladdryck havre', 'mjölkfri varm choklad', 'oatly choklad'],
    note: 'Chokladdryck av pulver och berikad havredryck (ca 1,5 % fett), varm eller kall.',
    co2e: 0.6,
  },
  {
    id: 'chokladmjolk-fardig',
    name: 'Chokladmjölk',
    cat: 'mejeri',
    lmv: 1847,
    avg: true,
    kcal: 67, prot: 3.4, carb: 9.6, fat: 1.5, fiber: 0.5, sugar: 9.5, addedSugar: 4, satFat: 1, salt: 0.15,
    n: { caffeine: 3 },
    portions: [['flaska', '1 flaska (27 cl)', 284], ['glas', '1 glas (2 dl)', 210], ['stor-flaska', '1 flaska (60 cl)', 630], ['liter', '1 förpackning (1 l)', 1050]],
    density: 1.05, liquid: true,
    tags: ['vegetarisk', 'svensk'],
    syn: ['pucko', 'cocio', 'chokladmjölk', 'färdig chokladmjölk', 'choklad dryck', 'chokladdryck', 'chocolate milk', 'mellanmjölk choklad', 'kall choklad', 'choklad mjölk', 'cocio classic', 'oboy drickfärdig'],
    note: samling('Pucko, Cocio', 'Drickfärdig chokladmjölk på flaska eller förpackning.'),
    co2e: 1.4,
  },
  {
    id: 'milkshake-vanilj',
    name: 'Milkshake',
    cat: 'mejeri',
    kcal: 104, prot: 3.1, carb: 14.4, fat: 3.7, fiber: 0, sugar: 12.1, addedSugar: 7.4, satFat: 2.8, salt: 0.1,
    n: {
      monoFat: 0.52, polyFat: 0.09, cholesterol: 5,
      vitA: 10, vitD: 0.56, vitE: 0.14, vitC: 0.3, riboflavin: 0.15, folate: 9, vitB12: 0.38,
      calcium: 116, iron: 0, magnesium: 11, potassium: 159, phosphorus: 118, zinc: 0.31, iodine: 17,
    },
    portions: [['glas', '1 glas (3 dl)', 280], ['stor', '1 stor milkshake (4,5 dl)', 420]],
    density: 1.0, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['milkshake', 'mjölkshake', 'shake', 'vaniljshake', 'glassdrink', 'jordgubbsshake', 'chokladshake', 'milk shake', 'milkchake'],
    note: 'Hemgjord på ca 2 dl vaniljglass och 1,5 dl mellanmjölk. Snabbmatskedjornas shakes ligger på liknande nivå.',
    co2e: 1.6,
  },
  {
    id: 'proteindryck-fardig',
    name: 'Proteindryck',
    cat: 'kosttillskott',
    avg: true,
    kcal: 51, prot: 6.0, carb: 4.1, fat: 1.2, sugar: 4.1, satFat: 0.7, salt: 0.15,
    n: { calcium: 160, phosphorus: 140, potassium: 170, vitB12: 0.4 },
    portions: [['flaska', '1 flaska (3,3 dl)', 340], ['liten', '1 förpackning (2,5 dl)', 258], ['stor', '1 flaska (5 dl)', 520]],
    density: 1.04, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: [
      'proteindryck', 'proteinshake', 'protein shake', 'protein milkshake', 'färdig shake', 'protein drink', 'barebells', 'barebells shake',
      'barebells milkshake', 'propud', 'njie', 'propud milkshake', 'arla protein', 'proteinmjölk', 'proteinmjölkdryck',
    ],
    note: samling('Barebells, Njie ProPud, Arla Protein', 'Mjölkbaserade proteindrycker med smak, ofta sötade med sötningsmedel och laktosfria. Ca 20–25 g protein per flaska.'),
  },
  {
    id: 'proteinshake-vassle-vatten',
    name: 'Proteinshake med vatten',
    cat: 'kosttillskott',
    kcal: 35, prot: 6.8, carb: 0.6, fat: 0.55, fiber: 0, sugar: 0.5, addedSugar: 0, satFat: 0.32, salt: 0.05,
    n: {
      vitD: 0, vitC: 0, riboflavin: 0.14, folate: 1, vitB12: 0.14,
      calcium: 41, iron: 0.09, magnesium: 7, potassium: 50, phosphorus: 32,
    },
    portions: [['shaker', '1 shaker (30 g pulver + 3 dl vatten)', 330], ['shaker-stor', '1 shaker (30 g pulver + 4 dl vatten)', 430]],
    density: 1.01, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['proteinshake', 'whey', 'whey shake', 'vassleprotein', 'proteinpulver med vatten', 'shake', 'proteindrink', 'återhämtningsdryck'],
    note: 'Räknat på 30 g vassleproteinpulver i 3 dl vatten. Registrera pulvret separat för exakta värden.',
  },
  {
    id: 'proteinshake-vassle-mellanmjolk',
    name: 'Proteinshake med mjölk',
    cat: 'kosttillskott',
    kcal: 76, prot: 9.8, carb: 5.0, fat: 1.9, fiber: 0, sugar: 4.8, addedSugar: 0, satFat: 1.2, salt: 0.14,
    n: {
      vitD: 0.9, vitC: 1, riboflavin: 0.29, folate: 5, vitB12: 0.54,
      calcium: 149, iron: 0.11, magnesium: 17, potassium: 190, phosphorus: 119, zinc: 0.6, iodine: 11,
    },
    portions: [['shaker', '1 shaker (30 g pulver + 3 dl mjölk)', 339]],
    density: 1.03, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['proteinshake med mjölk', 'whey med mjölk', 'proteinshake', 'shake med mjölk', 'vassleprotein mjölk'],
    note: 'Räknat på 30 g vassleproteinpulver i 3 dl mellanmjölk.',
    co2e: 1.2,
  },
]

// ---------------------------------------------------------------------------
// Sport- och energidrycker
// ---------------------------------------------------------------------------

const energiSport: FoodSeed[] = [
  {
    id: 'sportdryck-isoton',
    name: 'Sportdryck',
    cat: 'lask_saft',
    lmv: 1832,
    avg: true,
    kcal: 23, prot: 0, carb: 5.7, fat: 0, fiber: 0, sugar: 4.6, addedSugar: 4.6, satFat: 0, salt: 0.13,
    portions: [['flaska', '1 flaska (50 cl)', 510], ['sportflaska', '1 sportflaska (75 cl)', 765], ['glas', '1 glas (2 dl)', 204]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['sportdryck', 'powerade', 'gatorade', 'isostar', 'isoton dryck', 'elektrolytdryck', 'sportdricka', 'törstsläckare'],
    note: samling('Powerade, Gatorade', 'Isotona sportdrycker med socker och salt. Flera är numera delvis sötade med sötningsmedel.'),
  },
  {
    id: 'energidryck-sockersotad',
    name: 'Energidryck',
    cat: 'lask_saft',
    lmv: 2302,
    avg: true,
    kcal: 43, prot: 0, carb: 10.3, fat: 0, fiber: 0, sugar: 10.3, addedSugar: 10.3, satFat: 0, salt: 0.13,
    n: { caffeine: 31 },
    portions: [
      ['burk', '1 burk (50 cl)', 523],
      ['burk-33', '1 burk (33 cl)', 345],
      ['burk-355', '1 burk (35,5 cl)', 371],
      ['burk-25', '1 burk (25 cl)', 261],
      ['glas', '1 glas (2 dl)', 209],
    ],
    density: 1.045, liquid: true,
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'energidryck', 'energidricka', 'energy drink', 'energidryck med socker', 'sockrad energidryck', 'energi dryck',
      'red bull', 'redbull', 'redbul', 'monster', 'monster energy', 'monster grön', 'monster original', 'monstar',
      'burn', 'powerking', 'battery', 'rockstar',
    ],
    note: samling('Red Bull, Monster Energy', `Oftast 32 mg koffein per 100 ml – 80 mg per 25 cl-burk och 160 mg per 50 cl-burk. Många är berikade med B-vitaminer. ${KOFFEIN_RAD}`),
  },
  {
    id: 'energidryck-sockerfri',
    name: 'Sockerfri energidryck',
    cat: 'lask_saft',
    avg: true,
    kcal: 3, prot: 0.4, carb: 0.3, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0.1,
    n: { caffeine: 43, niacin: 6.5, vitB6: 0.9, vitB12: 1.7 },
    portions: [
      ['burk', '1 burk (33 cl)', 330],
      ['burk-50', '1 burk (50 cl)', 500],
      ['burk-355', '1 burk (35,5 cl)', 355],
      ['burk-25', '1 burk (25 cl)', 250],
    ],
    density: 1.0, liquid: true,
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'energidryck sockerfri', 'sockerfri energidryck', 'zero energidryck', 'light energidryck', 'energidryck zero',
      'nocco', 'nocco bcaa', 'noco', 'bcaa dryck', 'bcaa', 'celsius', 'red bull sugarfree', 'red bull sockerfri', 'red bull zero',
      'monster ultra', 'monster zero', 'monster vit', 'ultra white', 'monster sockerfri', 'funktionsdryck',
    ],
    note: samling('Nocco, Celsius, Red Bull Sugarfree, Monster Ultra', `Koffeinhalten varierar mellan märkena, ca 30–56 mg per 100 ml – en burk Nocco eller Celsius ger 180–200 mg, lika mycket som drygt två koppar bryggkaffe. ${KOFFEIN_RAD}`),
  },
]

// ---------------------------------------------------------------------------
// Läsk
// ---------------------------------------------------------------------------

/** Sockersötad läsk: inga vitaminer, spår av mineraler. */
const LASK_MIKRO = { ...NOLL_MIKRO, calcium: 2, iron: 0.02, potassium: 2 } as const

const lask: FoodSeed[] = [
  {
    id: 'lask-sockersotad',
    name: 'Läsk',
    cat: 'lask_saft',
    lmv: 1828,
    avg: true,
    kcal: 35, prot: 0, carb: 8.5, fat: 0, fiber: 0, sugar: 8.4, addedSugar: 8.4, satFat: 0, salt: 0.01,
    n: { ...LASK_MIKRO },
    portions: laskPortions(1.04),
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'läsk', 'lask', 'dricka', 'soda', 'sockerläsk', 'kolsyrad läsk', 'hallonsoda', 'päronsoda', 'grapetonic', 'cream soda', 'pop', 'loranga',
      'fanta', 'fanta orange', 'zingo', 'jaffa', 'apelsinläsk', 'apelsinsoda', 'apelsindricka', 'orangeade',
      'sprite', '7up', 'seven up', '7 up', 'citronläsk', 'citronsoda', 'lime läsk',
      'trocadero', 'troca', 'trocca', 'trokadero', 'pommac', 'pomac', 'festdricka', 'sockerdricka', 'sockerdrecka',
      'champis', 'barnchampagne', 'alkoholfri champagne', 'ginger ale', 'canada dry', 'ingefärsläsk', 'ginger beer',
    ],
    note: samling(
      'Fanta, Sprite, Zingo, Trocadero, Pommac',
      'Sockerhalten varierar: Fanta är numera sockerreducerad (ca 4,6 g per 100 ml), de flesta andra har ca 8–11 g. Trocadero innehåller koffein (ca 25 mg per burk).',
    ),
  },
  {
    id: 'lask-sockerfri',
    name: 'Sockerfri läsk',
    cat: 'dryck',
    lmv: 1830,
    avg: true,
    kcal: 1, prot: 0, carb: 0.3, fat: 0, fiber: 0, sugar: 0.1, addedSugar: 0, satFat: 0, salt: 0.01,
    portions: laskPortions(1.0),
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'lightläsk', 'light läsk', 'sockerfri läsk', 'lättläsk', 'zero läsk', 'dietläsk', 'diet', 'läsk light', 'läsk zero',
      'fanta zero', 'sprite zero', '7up free', 'zingo sockerfri', 'trocadero zero', 'pommac sockerfri',
      'julmust light', 'sockerfri julmust', 'julmust zero', 'lightmust', 'påskmust light',
    ],
    note: samling('Fanta Zero, Sprite Zero, Zingo sockerfri, Trocadero Zero, julmust light', 'Sötad med sötningsmedel. Vissa smaker (t.ex. Trocadero) innehåller koffein.'),
  },
  {
    id: 'cola-coca-cola-original',
    name: 'Cola',
    cat: 'lask_saft',
    lmv: 1829,
    avg: true,
    kcal: 40, prot: 0, carb: 10.2, fat: 0, fiber: 0, sugar: 10.2, addedSugar: 10.2, satFat: 0, salt: 0,
    n: { ...LASK_MIKRO, caffeine: 9.5, phosphorus: 16 },
    portions: laskPortions(1.04),
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['coca-cola', 'coca cola', 'cocacola', 'coke', 'cola', 'pepsi', 'kola', 'colaläsk', 'cola med socker'],
    note: samling('Coca-Cola, Pepsi', 'Ca 35 g socker och 32 mg koffein per 33 cl-burk.'),
  },
  {
    id: 'cola-coca-cola-zero',
    name: 'Sockerfri cola',
    cat: 'dryck',
    lmv: 1831,
    avg: true,
    kcal: 0, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0.03,
    n: { ...NOLL_MIKRO, caffeine: 11, phosphorus: 14 },
    portions: laskPortions(1.0),
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'coca-cola zero', 'coca cola zero', 'coke zero', 'cola zero', 'zero', 'cola light', 'coca-cola light', 'coke light', 'sockerfri cola',
      'pepsi max', 'pepsimax', 'pepsi zero', 'pepsi light',
    ],
    note: samling('Coca-Cola Zero, Pepsi Max, Coca-Cola Light', 'Sötad med sötningsmedel. Ca 30–40 mg koffein per 33 cl-burk.'),
  },
  {
    id: 'julmust',
    name: 'Julmust',
    cat: 'lask_saft',
    lmv: 5147,
    kcal: 34, prot: 0, carb: 8.3, fat: 0, fiber: 0, sugar: 8.3, addedSugar: 8, satFat: 0, salt: 0,
    portions: laskPortions(1.04),
    density: 1.04, liquid: true,
    tags: ['vegan', 'laktosfri', 'svensk', 'klassiker'],
    syn: ['julmust', 'must', 'jul must', 'julmus', 'apotekarnes', 'nygårda', 'harboe', 'lagrad julmust', 'påskmust', 'paskmust', 'påsk must', 'midsommarmust'],
    note: 'Julmust och påskmust är samma dryck. Innehåller maltextrakt från korn. Sockerhalten varierar mellan märken (ca 8–11 g per 100 ml). Sockerfri must finns under Sockerfri läsk.',
  },
  {
    id: 'tonic-water',
    name: 'Tonic',
    cat: 'lask_saft',
    kcal: 31, prot: 0, carb: 7.8, fat: 0, fiber: 0, sugar: 7.8, addedSugar: 7.8, satFat: 0, salt: 0.03,
    n: { ...NOLL_MIKRO, calcium: 1, potassium: 0 },
    portions: [['flaska', '1 flaska (20 cl)', 206], ['burk', '1 burk (33 cl)', 340], ['glas', '1 glas (1,5 dl)', 155]],
    density: 1.03, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['tonic', 'tonic water', 'tonicvatten', 'tonic vatten', 'indian tonic', 'schweppes', 'fever-tree', 'fever tree'],
    note: 'Light- och slimlinevarianter har ca 1–15 kcal per 100 ml.',
  },
  {
    id: 'svagdricka',
    name: 'Svagdricka',
    cat: 'alkohol',
    lmv: 1900,
    kcal: 29, prot: 0.2, carb: 3.8, fat: 0, fiber: 0, sugar: 0.5, addedSugar: 0, satFat: 0, salt: 0, alc: 1.8,
    portions: [['flaska', '1 flaska (33 cl)', 333], ['glas', '1 glas (2 dl)', 202], ['stor-flaska', '1 stor flaska (1,5 l)', 1515]],
    density: 1.01, liquid: true,
    tags: ['vegan', 'laktosfri', 'svensk', 'klassiker'],
    syn: ['svagdricka', 'svagdrika', 'julsvagdricka', 'vörtdricka', 'maltdricka', 'lättdricka'],
    note: 'Söt och mörk maltdryck med ca 2 % alkohol – en klassiker på julbordet.',
  },
]

// ---------------------------------------------------------------------------
// Saft och fruktdrycker
// ---------------------------------------------------------------------------

const saft: FoodSeed[] = [
  {
    id: 'saft-utspadd-bar',
    name: 'Saft',
    cat: 'lask_saft',
    lmv: 1820,
    kcal: 36, prot: 0, carb: 8.8, fat: 0, fiber: 0, sugar: 6.6, addedSugar: 6.6, satFat: 0, salt: 0,
    portions: [...glasPortions(1.04), ['kanna', '1 kanna (1 l)', 1040]],
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri', 'svensk', 'klassiker'],
    syn: [
      'saft', 'hallonsaft', 'jordgubbssaft', 'blåbärssaft', 'svartvinbärssaft', 'bärsaft', 'glas saft', 'blandad saft', 'rabarbersaft', 'saftglas',
      'hallondricka', 'blandsaft', 'flädersaft', 'fläderblomssaft', 'fläder', 'fladersaft', 'midsommarsaft', 'hemgjord saft',
      'lingondricka', 'lingonsaft', 'lingon dricka', 'lingondryck', 'måltidsdryck', 'saft utspädd',
    ],
    note: 'Drickfärdig sockersötad saft – bär, fläder, lingon m.m. Blandad starkare (1 + 4) blir den ca 42 kcal per 100 g.',
  },
  {
    id: 'saft-sockerfri-utspadd',
    name: 'Sockerfri saft',
    cat: 'dryck',
    lmv: 1834,
    kcal: 9, prot: 0, carb: 2.2, fat: 0, fiber: 0, sugar: 0.4, addedSugar: 0, satFat: 0, salt: 0,
    portions: [...glasPortions(1.0), ['kanna', '1 kanna (1 l)', 1000]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['sockerfri saft', 'light saft', 'lightsaft', 'saft utan socker', 'zerosaft', 'lättsaft', 'zeroh', 'saft zero'],
    note: 'Drickfärdig saft sötad med sötningsmedel.',
  },
  {
    id: 'saft-koncentrat-sockersotad',
    name: 'Saftkoncentrat',
    cat: 'lask_saft',
    lmv: 1819,
    kcal: 213, prot: 0, carb: 52.4, fat: 0, fiber: 0, sugar: 52.4, addedSugar: 49, satFat: 0, salt: 0,
    portions: [['dl', '1 dl (blir 5 dl saft)', 122], ['glaskoncentrat', 'koncentrat till 1 glas (4 cl)', 49], ['flaska', '1 flaska (50 cl)', 610]],
    density: 1.22, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri', 'svensk'],
    syn: ['saftkoncentrat', 'koncentrerad saft', 'outspädd saft', 'hallonsaft', 'flädersaft', 'fläderblomssaft', 'jordgubbssaft', 'rabarbersaft', 'hemgjord saft', 'blandsaft', 'bärsaft'],
    note: 'Sockersötad saft, outspädd. Späds normalt 1 + 4 (en del saft, fyra delar vatten).',
  },
  {
    id: 'lemonad-hemgjord',
    name: 'Lemonad',
    cat: 'lask_saft',
    kcal: 37, prot: 0, carb: 9.3, fat: 0, fiber: 0, sugar: 8.9, addedSugar: 8.6, satFat: 0, salt: 0,
    n: { vitD: 0, vitC: 4, folate: 2, vitB12: 0, calcium: 1, potassium: 11 },
    portions: [...glasPortions(1.03), ['kanna', '1 kanna (1 l)', 1030]],
    density: 1.03, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['lemonad', 'lemonade', 'citronlemonad', 'hemgjord lemonad', 'rosa lemonad', 'lemonad med mynta', 'limonad', 'lemonaad', 'citrondricka'],
    note: 'Räknat på 1 dl pressad citron, 1 dl socker och 8 dl vatten. Köpt lemonad har ofta liknande sockerhalt.',
  },
  {
    id: 'saftdryck-fardig',
    name: 'Fruktdryck',
    cat: 'lask_saft',
    avg: true,
    kcal: 29, prot: 0.1, carb: 7.1, fat: 0, fiber: 0, sugar: 6.9, addedSugar: 5, satFat: 0, salt: 0.02,
    portions: [
      ['forp', '1 förpackning (2 dl)', 208],
      ['forp-25', '1 förpackning (2,5 dl)', 260],
      ['flaska', '1 flaska (33 cl)', 343],
      ['glas', '1 glas (2 dl)', 208],
      ['litet-glas', '1 litet glas (1 dl)', 104],
      ['stort-glas', '1 stort glas (3 dl)', 312],
      ['liter', '1 förpackning (1 l)', 1040],
    ],
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'festis', 'fruktdryck', 'saftdryck', 'juicedryck', 'mer', 'mer apelsin', 'tetrasaft', 'saft förpackning', 'skolsaft', 'nektar',
      'tranbärsdryck', 'tranbärsjuice', 'tranbär', 'cranberry juice', 'ocean spray', 'tranbarsjuice', 'tranbärsdricka',
    ],
    note: 'Samlingsvärde: genomsnitt av vanliga färdiga fruktdrycker (t.ex. Festis, Mer och tranbärsdryck). Många är numera sockerreducerade. Skanna streckkoden för exakta värden för ditt märke.',
  },
  {
    id: 'glogg-alkoholfri',
    name: 'Alkoholfri glögg',
    cat: 'lask_saft',
    kcal: 52, prot: 0.1, carb: 12.8, fat: 0, fiber: 0, sugar: 12.5, addedSugar: 10.5, satFat: 0, salt: 0.01,
    n: { vitD: 0, vitB12: 0, calcium: 5, iron: 0.2, potassium: 30 },
    portions: [['kopp', '1 glöggkopp (1 dl)', 105], ['mugg', '1 mugg (2 dl)', 210]],
    density: 1.05, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri', 'svensk', 'klassiker'],
    syn: ['glögg', 'alkoholfri glögg', 'barnglögg', 'glögg utan alkohol', 'julglögg', 'glöggsaft', 'glogg'],
    note: 'Färdig alkoholfri glögg. Russin och mandel registreras separat.',
  },
]

// ---------------------------------------------------------------------------
// Juice, smoothie och kombucha
// Juice och smoothies räknas inte in i kostrådets 500 g frukt och grönt (utom hemgjord smoothie
// på hel frukt och bär, som delvis räknas).
// ---------------------------------------------------------------------------

const juice: FoodSeed[] = [
  {
    id: 'apelsinjuice',
    name: 'Apelsinjuice',
    cat: 'juice',
    lmv: 643,
    kcal: 39, prot: 0.7, carb: 8.6, fat: 0.1, fiber: 0, sugar: 8, addedSugar: 0, satFat: 0, salt: 0,
    portions: [...glasPortions(1.045), ['liter', '1 förpackning (1 l)', 1045]],
    density: 1.045, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'apelsinjuice', 'apelsin juice', 'appelsinjuice', 'apelsinjos', 'oj', 'juice', 'färskpressad apelsinjuice', 'tropicana', 'bravo', 'god morgon', 'orange juice',
      'grapefruktjuice', 'grapejuice', 'grape juice', 'grapefrukt juice', 'citrusjuice',
    ],
    note: 'Grapefruktjuice har ungefär samma näringsvärden – men grapefrukt kan påverka effekten av vissa läkemedel, fråga på apoteket om du är osäker.',
  },
  {
    id: 'appeljuice',
    name: 'Äppeljuice',
    cat: 'juice',
    lmv: 659,
    kcal: 40, prot: 0.2, carb: 9.7, fat: 0, fiber: 0, sugar: 9.7, addedSugar: 0, satFat: 0, salt: 0,
    portions: [...glasPortions(1.045), ['liter', '1 förpackning (1 l)', 1045]],
    density: 1.045, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'äppeljuice', 'appeljuice', 'äpplejuice', 'äppeljos', 'apple juice', 'äpple juice',
      'äppelmust', 'appelmust', 'musteri', 'pressad äppeljuice', 'kiviks', 'ofiltrerad äppeljuice', 'äpplemust', 'gårdsmust',
    ],
    note: 'Pressad äppelmust har ungefär samma värden (ca 45 kcal per 100 g). Utan tillsatt C-vitamin – berikade varianter kan innehålla ca 20–30 mg per 100 ml.',
  },
  {
    id: 'multivitaminjuice',
    name: 'Multivitaminjuice',
    cat: 'juice',
    kcal: 48, prot: 0.4, carb: 10.8, fat: 0.1, fiber: 0.3, sugar: 10.2, addedSugar: 0, satFat: 0, salt: 0,
    n: {
      vitD: 0, vitC: 30, folate: 20,
      calcium: 12, iron: 0.15, magnesium: 10, potassium: 160,
    },
    portions: [...glasPortions(1.05), ['liter', '1 förpackning (1 l)', 1050]],
    density: 1.05, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'multivitamin', 'multijuice', 'multi juice', 'multivitaminjuice', 'blandjuice', 'tropisk juice', 'god morgon multi', 'bravo multi', 'frukostjuice',
      'ananasjuice', 'ananas juice', 'pineapple juice', 'fruktjuice', 'mangojuice', 'passionsjuice',
    ],
    note: 'Blandad fruktjuice med tillsatta vitaminer – de varierar mellan märken, se förpackningen. Ananasjuice och tropisk juice har liknande värden.',
  },
  {
    id: 'tomatjuice',
    name: 'Tomatjuice',
    cat: 'juice',
    lmv: 408,
    kcal: 18, prot: 0.8, carb: 2.7, fat: 0.1, fiber: 1.4, sugar: 2.7, addedSugar: 0, satFat: 0, salt: 0.9,
    portions: [...glasPortions(1.03), ['forp', '1 förpackning (1 l)', 1030]],
    density: 1.03, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['tomatjuice', 'tomat juice', 'tomatjos', 'grönsaksjuice', 'v8', 'bloody mary mix'],
    note: 'Saltad.',
  },
  {
    id: 'smoothie-frukt-bar-fardig',
    name: 'Smoothie',
    cat: 'juice',
    lmv: 3855,
    avg: true,
    kcal: 50, prot: 0.6, carb: 11.2, fat: 0.1, fiber: 0.9, sugar: 10.2, addedSugar: 0, satFat: 0, salt: 0,
    portions: [['flaska', '1 flaska (25 cl)', 265], ['glas', '1 glas (2 dl)', 212], ['liten', '1 liten flaska (15 cl)', 159], ['stor-flaska', '1 stor flaska (75 cl)', 795]],
    density: 1.06, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'smoothie', 'froosh', 'innocent', 'fruktsmoothie', 'bärsmoothie', 'mangosmoothie', 'smothie', 'smootie', 'smoothi', 'fruktdrink',
      'grön smoothie', 'green smoothie', 'spenatsmoothie', 'grönsakssmoothie', 'gron smoothie',
    ],
    note: samling('Froosh, Innocent', 'Färdig smoothie på frukt och bär, utan tillsatt socker.'),
  },
  {
    id: 'smoothie-hemgjord-banan-bar-mjolk',
    name: 'Hemgjord smoothie',
    cat: 'juice',
    kcal: 61, prot: 2.3, carb: 10.3, fat: 0.9, fiber: 0.9, sugar: 9.1, addedSugar: 0, satFat: 0.53, salt: 0.05,
    n: {
      vitA: 8, vitD: 0.53, vitC: 4, riboflavin: 0.1, vitB6: 0.13, folate: 10, vitB12: 0.23,
      calcium: 72, iron: 0.1, magnesium: 16, potassium: 202, phosphorus: 85, zinc: 0.31, iodine: 13,
    },
    portions: [['glas', '1 glas (2,5 dl)', 260], ['stor', '1 stort glas (4 dl)', 416]],
    density: 1.04, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['hemgjord smoothie', 'smoothie med mjölk', 'smoothie med yoghurt', 'bananasmoothie', 'bananshake', 'bärsmoothie', 'frukostsmoothie', 'smoothie banan'],
    note: '1 banan, 1 dl frysta bär och 2 dl mellanmjölk.',
    kostrad: { fruktGront: 45 },
    co2e: 0.8,
  },
  {
    id: 'ingefarsshot',
    name: 'Ingefärsshot',
    cat: 'juice',
    avg: true,
    kcal: 36, prot: 0.5, carb: 8.0, fat: 0, fiber: 0, sugar: 7.1, addedSugar: 0, satFat: 0, salt: 0.01,
    portions: [['shot', '1 shot (6 cl)', 62], ['flaska', '1 liten flaska (12,5 cl)', 130]],
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['ingefärsshot', 'ingefära shot', 'ingefärashot', 'ginger shot', 'shot', 'hälsoshot', 'immunshot', 'gurkmejashot', 'juiceshot'],
    note: 'Samlingsvärde: genomsnitt av vanliga ingefärsshots (t.ex. ICA och ICA Selection), oftast äppeljuice med ingefära och citron eller lime. Skanna streckkoden för exakta värden för ditt märke.',
  },
  {
    id: 'kombucha',
    name: 'Kombucha',
    cat: 'dryck',
    lmv: 5979,
    kcal: 17, prot: 0, carb: 2.2, fat: 0, fiber: 0, sugar: 2.2, addedSugar: 2.2, satFat: 0, salt: 0, alc: 1.1,
    n: { caffeine: 6 },
    portions: [['flaska', '1 flaska (33 cl)', 333], ['glas', '1 glas (2 dl)', 202]],
    density: 1.01, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['kombucha', 'kombusha', 'fermenterat te', 'svampte'],
    note: 'Sockerhalten varierar (ca 1–6 g per 100 ml). Kombucha jäser och innehåller lite alkohol – i Livsmedelsverkets analys ca 1 g per 100 g (drygt 1 volymprocent).',
  },
]

// ---------------------------------------------------------------------------
// Öl och cider
// ---------------------------------------------------------------------------

/** Mikronäringsämnen i ljus starköl per 100 g (Livsmedelsverket) – används för öltyper som saknas där. */
const OL_MIKRO = {
  vitD: 0, vitC: 0, thiamin: 0, riboflavin: 0.03, niacin: 0.6, vitB6: 0, folate: 10, vitB12: 0,
  calcium: 3, iron: 0, magnesium: 7, potassium: 49, phosphorus: 23, zinc: 0, selenium: 0,
} as const

const olCider: FoodSeed[] = [
  {
    id: 'ol-lattol-2-2',
    name: 'Lättöl',
    cat: 'alkohol',
    lmv: 1901,
    kcal: 29, prot: 0.2, carb: 3.8, fat: 0, fiber: 0, sugar: 0.5, addedSugar: 0, satFat: 0, salt: 0, alc: 1.8,
    portions: olPortions(1.01),
    density: 1.01, liquid: true,
    syn: ['lättöl', 'lattol', 'lätt öl', 'lättpilsner', 'pilsner', 'klass 1', 'lättöl 2,2', 'matöl', 'lattöl'],
    note: 'Högst 2,25 %.',
  },
  {
    id: 'ol-folkol-3-5',
    name: 'Folköl',
    cat: 'alkohol',
    lmv: 1902,
    kcal: 40, prot: 0.4, carb: 4.6, fat: 0, fiber: 0, sugar: 0.3, addedSugar: 0, satFat: 0, salt: 0, alc: 2.8,
    portions: olPortions(1.01),
    density: 1.01, liquid: true,
    syn: ['folköl', 'folkol', 'folk öl', 'öl 3,5', 'klass 2', 'folkis', 'öl från mataffären'],
    note: 'Ca 3,5 %.',
  },
  {
    id: 'ol-starkol-lager-5',
    name: 'Starköl',
    cat: 'alkohol',
    lmv: 1906,
    kcal: 42, prot: 0, carb: 3, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0, alc: 4.3,
    portions: olPortions(1.01),
    density: 1.01, liquid: true,
    syn: [
      'öl', 'starköl', 'stor stark', 'lager', 'pilsner', 'pils', 'bärs', 'bira', 'burköl', 'norrlands guld', 'mariestads', 'sofiero', 'pripps',
      'spendrups', 'carlsberg', 'heineken', 'falcon', 'öl 5,3', 'ol', 'starkol', 'exportöl',
      'veteöl', 'veteol', 'weissbier', 'hefeweizen', 'wheat beer', 'witbier', 'hoegaarden', 'blue moon',
    ],
    note: 'Ljus lager ca 5–5,4 %. Veteöl har ungefär samma värden.',
  },
  {
    id: 'ol-ipa-6-5',
    name: 'IPA',
    cat: 'alkohol',
    kcal: 56, prot: 0.5, carb: 4.5, fat: 0, fiber: 0, sugar: 0.7, addedSugar: 0, satFat: 0, salt: 0.01, alc: 5.1,
    n: { ...OL_MIKRO },
    portions: olPortions(1.012),
    density: 1.012, liquid: true,
    syn: ['ipa', 'india pale ale', 'ale', 'hazy ipa', 'neipa', 'pale ale', 'apa', 'hantverksöl', 'craft beer', 'mikrobryggeri', 'dipa'],
    note: 'Ca 6,5 %. Starkare IPA (7–9 %) ger ca 60–80 kcal per 100 g.',
  },
  {
    id: 'ol-porter-stout',
    name: 'Mörk öl',
    cat: 'alkohol',
    kcal: 52, prot: 0.5, carb: 5.0, fat: 0, fiber: 0, sugar: 1.0, addedSugar: 0, satFat: 0, salt: 0.01, alc: 4.3,
    n: { ...OL_MIKRO, magnesium: 8 },
    portions: olPortions(1.015),
    density: 1.015, liquid: true,
    syn: [
      'mörk öl', 'mork ol', 'porter', 'stout', 'guinness', 'carnegie porter', 'imperial stout',
      'julöl', 'jul öl', 'julol', 'påsköl', 'mörk lager', 'bock', 'brown ale',
    ],
    note: 'Porter, stout, julöl och annan mörk öl, ca 5,5 %.',
  },
  {
    id: 'ol-alkoholfri',
    name: 'Alkoholfri öl',
    cat: 'alkohol',
    lmv: 2305,
    kcal: 15, prot: 0.4, carb: 3.1, fat: 0, fiber: 0, sugar: 0.9, addedSugar: 0.9, satFat: 0, salt: 0, alc: 0.17,
    portions: olPortions(1.015),
    density: 1.015, liquid: true,
    syn: ['alkoholfri öl', 'alkoholfritt öl', 'alkoholfri', '0,0 öl', 'noll öl', 'öl 0,5', 'alkoholfri lager', 'alkoholfri ipa', 'alkfri öl'],
    note: 'Högst 0,5 %. Alkoholfri IPA kan ha något mer kolhydrater.',
  },
  {
    id: 'cider-sot-4-5',
    name: 'Cider',
    cat: 'alkohol',
    avg: true,
    kcal: 56, prot: 0, carb: 8.1, fat: 0, fiber: 0, sugar: 8.0, addedSugar: 6.5, satFat: 0, salt: 0.01, alc: 3.4,
    n: { ...NOLL_MIKRO, calcium: 4, iron: 0.1, potassium: 30 },
    portions: [['flaska', '1 flaska/burk (33 cl)', 340], ['burk-50', '1 burk (50 cl)', 515], ['glas', '1 glas (2 dl)', 206]],
    density: 1.03, liquid: true,
    tags: ['glutenfri'],
    syn: [
      'cider', 'kopparberg', 'päroncider', 'somersby', 'rekorderlig', 'briska', 'fruktcider', 'jordgubbscider', 'strawberry lime', 'fläder cider',
      'sot cider', 'söt cider', 'äppelcider', 'torr cider', 'dry cider', 'brut cider', 'cidre',
    ],
    note: samling('Kopparberg, Somersby', 'Söt cider ca 4,5 %, t.ex. päron, äpple eller jordgubb-lime. Torr cider har mindre socker, ca 40 kcal per 100 g.'),
  },
  {
    id: 'cider-alkoholfri',
    name: 'Alkoholfri cider',
    cat: 'lask_saft',
    kcal: 42, prot: 0, carb: 10.4, fat: 0, fiber: 0, sugar: 10.2, addedSugar: 7.0, satFat: 0, salt: 0.01,
    n: { vitD: 0, vitB12: 0, calcium: 3, potassium: 25 },
    portions: [['flaska', '1 flaska/burk (33 cl)', 343], ['glas', '1 glas (2 dl)', 208]],
    density: 1.04, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['alkoholfri cider', 'cider alkoholfri', 'päroncider alkoholfri', 'cider 0', 'kopparberg alkoholfri', 'äppelcider alkoholfri', 'alkoholfri päroncider'],
    note: 'Söt, t.ex. päron eller äpple.',
  },
  {
    id: 'hard-seltzer',
    name: 'Hard seltzer',
    cat: 'alkohol',
    kcal: 28, prot: 0, carb: 0.8, fat: 0, fiber: 0, sugar: 0.6, addedSugar: 0.6, satFat: 0, salt: 0.01, alc: 3.6,
    n: { ...NOLL_MIKRO },
    portions: [['burk', '1 burk (33 cl)', 328], ['glas', '1 glas (2 dl)', 199]],
    density: 0.995, liquid: true,
    syn: ['hard seltzer', 'seltzer', 'hard selzer', 'selzer', 'spiked seltzer', 'white claw', 'smirnoff seltzer', 'alkoholhaltigt vatten', 'alkoholvatten'],
    note: 'Alkoholhaltigt bubbelvatten med smak, ca 4,5 %. Sockerhalten varierar mellan märken (ca 0–2 g per 100 ml).',
  },
  {
    id: 'alkolask',
    name: 'Alkoläsk',
    cat: 'alkohol',
    lmv: 5152,
    kcal: 52, prot: 0, carb: 5.9, fat: 0, fiber: 0, sugar: 5.8, addedSugar: 5.8, satFat: 0, salt: 0, alc: 4.05,
    portions: [['burk', '1 burk/flaska (33 cl)', 335], ['burk-50', '1 burk (50 cl)', 508], ['glas', '1 glas (2 dl)', 203]],
    density: 1.015, liquid: true,
    syn: ['alkoläsk', 'alkolask', 'long drink', 'longdrink', 'lonkero', 'breezer', 'bacardi breezer', 'smirnoff ice', 'premix', 'alcopop', 'färdigblandad drink', 'drink på burk', 'gin long drink'],
    note: 'Färdigblandad drink på burk eller flaska, ca 4–5,5 % (t.ex. long drink och Smirnoff Ice). En 33 cl-burk motsvarar ungefär ett standardglas.',
  },
]

// ---------------------------------------------------------------------------
// Vin
// ---------------------------------------------------------------------------

const vin: FoodSeed[] = [
  {
    id: 'vin-rott',
    name: 'Rödvin',
    cat: 'alkohol',
    lmv: 1907,
    kcal: 79, prot: 0, carb: 1, fat: 0, fiber: 0, sugar: 0.7, addedSugar: 0, satFat: 0, salt: 0, alc: 10.8,
    portions: vinPortions(0.995),
    density: 0.995, liquid: true,
    tags: ['glutenfri'],
    syn: ['rödvin', 'rött vin', 'vin', 'rodvin', 'rödtjut', 'bag in box', 'bib', 'boxvin', 'glas vin', 'glas rött', 'merlot', 'cabernet', 'shiraz', 'primitivo', 'rioja', 'amarone', 'pinot noir'],
    note: 'Ca 13,5–14 %.',
  },
  {
    id: 'vin-vitt-torrt',
    name: 'Vitvin',
    cat: 'alkohol',
    lmv: 1908,
    kcal: 70, prot: 0, carb: 1, fat: 0, fiber: 0, sugar: 0.9, addedSugar: 0, satFat: 0, salt: 0, alc: 9.5,
    portions: vinPortions(0.99),
    density: 0.99, liquid: true,
    tags: ['glutenfri'],
    syn: [
      'vitt vin', 'vitvin', 'vin vitt', 'glas vitt', 'chardonnay', 'sauvignon blanc', 'riesling', 'pinot grigio', 'chablis', 'vitt',
      'halvtorrt vin', 'halvtorrt', 'fruktigt vitt', 'halvsött vin', 'off dry',
    ],
    note: 'Torrt, ca 12 %. Halvtorrt vitt vin (ca 10 %) har något mer socker men mindre alkohol – ungefär samma energi.',
  },
  {
    id: 'vin-rose',
    name: 'Rosévin',
    cat: 'alkohol',
    kcal: 75, prot: 0.1, carb: 1.8, fat: 0, fiber: 0, sugar: 1.5, addedSugar: 0, satFat: 0, salt: 0.01, alc: 9.6,
    n: {
      vitD: 0, vitC: 0, folate: 1, vitB12: 0,
      calcium: 8, iron: 0.4, magnesium: 10, potassium: 80, phosphorus: 18,
    },
    portions: vinPortions(0.99),
    density: 0.99, liquid: true,
    tags: ['glutenfri'],
    syn: ['rosé', 'rose', 'rosévin', 'rosevin', 'rosé vin', 'glas rosé'],
    note: 'Ca 12 %.',
  },
  {
    id: 'vin-mousserande-torrt',
    name: 'Mousserande vin',
    cat: 'alkohol',
    kcal: 70, prot: 0.2, carb: 1.3, fat: 0, fiber: 0, sugar: 1.2, addedSugar: 0.8, satFat: 0, salt: 0.01, alc: 9.1,
    n: {
      vitD: 0, vitC: 0, folate: 1, vitB12: 0,
      calcium: 8, iron: 0.3, magnesium: 9, potassium: 70, phosphorus: 15,
    },
    portions: [['glas', '1 glas (12 cl)', 119], ['stort-glas', '1 stort glas (15 cl)', 149], ['piccolo', '1 liten flaska (20 cl)', 199], ['flaska', '1 flaska (75 cl)', 746]],
    density: 0.995, liquid: true,
    tags: ['glutenfri'],
    syn: ['bubbel', 'champagne', 'cava', 'prosecco', 'mousserande', 'skumpa', 'crémant', 'cremant', 'brut', 'bubbelvin', 'mousserande vin', 'bubbles'],
    note: 'Torrt (brut), t.ex. cava, prosecco och champagne, ca 11,5 %.',
  },
  {
    id: 'vin-alkoholfritt',
    name: 'Alkoholfritt vin',
    cat: 'alkohol',
    kcal: 22, prot: 0.1, carb: 5.2, fat: 0, fiber: 0, sugar: 4.8, satFat: 0, salt: 0.01, alc: 0.2,
    n: { vitD: 0, vitC: 0, vitB12: 0, calcium: 7, iron: 0.3, magnesium: 8, potassium: 60 },
    portions: vinPortions(1.01),
    density: 1.01, liquid: true,
    tags: ['glutenfri'],
    syn: ['alkoholfritt vin', 'alkoholfri vin', 'alkfritt vin', 'vin 0 %', 'alkoholfritt bubbel', 'alkoholfri champagne', 'alkoholfritt rött', 'alkoholfritt vitt'],
    note: 'Rött, vitt eller mousserande. Sockerhalten varierar (ca 2–8 g per 100 ml).',
  },
  {
    id: 'starkvin-portvin',
    name: 'Starkvin',
    cat: 'alkohol',
    lmv: 1915,
    kcal: 150, prot: 0, carb: 9.5, fat: 0, fiber: 0, sugar: 9.5, addedSugar: 0, satFat: 0, salt: 0, alc: 16,
    portions: [['glas', '1 glas (6 cl)', 62], ['litet-glas', '1 litet glas (4 cl)', 41], ['flaska', '1 flaska (75 cl)', 773]],
    density: 1.03, liquid: true,
    tags: ['glutenfri'],
    syn: [
      'portvin', 'port', 'porto', 'sherry', 'madeira', 'marsala', 'starkvin', 'vermouth', 'vermut', 'sött starkvin',
      'dessertvin', 'sött vin', 'sauternes', 'tokaji', 'isvin', 'ice wine', 'moscatel', 'muscat',
    ],
    note: 'Sött starkvin som portvin och cream sherry, ca 20 %. Dessertvin (ca 14 %) har ungefär lika mycket socker men mindre alkohol, ca 130 kcal per 100 g.',
  },
  {
    id: 'glogg-vinglogg',
    name: 'Glögg',
    cat: 'alkohol',
    lmv: 1912,
    kcal: 124, prot: 0, carb: 17, fat: 0, fiber: 0, sugar: 17, addedSugar: 17, satFat: 0, salt: 0, alc: 8,
    portions: [['kopp', '1 glöggkopp (1 dl)', 106], ['mugg', '1 mugg (2 dl)', 212]],
    density: 1.06, liquid: true,
    tags: ['glutenfri', 'svensk', 'klassiker'],
    syn: ['glögg', 'vinglögg', 'blossa', 'julglögg', 'rödvinsglögg', 'glögg med alkohol', 'starkglögg', 'glogg', 'vitvinsglögg'],
    note: 'Vinglögg ca 10 %. Russin och mandel registreras separat.',
  },
]

// ---------------------------------------------------------------------------
// Sprit, likör och drinkar
// ---------------------------------------------------------------------------

const sprit: FoodSeed[] = [
  {
    id: 'akvavit-snaps',
    name: 'Snaps',
    cat: 'alkohol',
    lmv: 1924,
    kcal: 226, prot: 0, carb: 1.1, fat: 0, fiber: 0, sugar: 1.1, addedSugar: 1, satFat: 0, salt: 0, alc: 32,
    portions: [['snaps', '1 snaps (4 cl)', 38], ['halv', '1 liten snaps (2 cl)', 19], ['nubbe', '1 nubbe (3 cl)', 29]],
    density: 0.95, liquid: true,
    tags: ['glutenfri', 'svensk', 'klassiker'],
    syn: ['snaps', 'akvavit', 'nubbe', 'nubben', 'brännvin', 'kryddat brännvin', 'o.p. anderson', 'op anderson', 'skåne akvavit', 'aalborg', 'bäska droppar', 'besk', 'midsommarsnaps', 'julsnaps', 'snapps', 'akvavitt'],
    note: 'Akvavit och kryddat brännvin, ca 38–40 %.',
  },
  {
    id: 'vodka-40',
    name: 'Starksprit',
    cat: 'alkohol',
    lmv: 1918,
    kcal: 222, prot: 0, carb: 0, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0, alc: 32,
    portions: spritPortions(0.95),
    density: 0.95, liquid: true,
    tags: ['glutenfri'],
    syn: [
      'sprit', 'shot', 'vodka', 'absolut', 'absolut vodka', 'explorer', 'smirnoff', 'wodka', 'votka', 'renat brännvin', 'renat', 'grey goose',
      'gin', 'london dry', 'hernö', 'tanqueray', 'bombay', 'gordons', 'beefeater', 'hendricks',
      'whisky', 'whiskey', 'maltwhisky', 'single malt', 'scotch', 'bourbon', 'mackmyra', 'jameson', 'jack daniels',
      'rom', 'rum', 'mörk rom', 'ljus rom', 'kryddad rom', 'spiced rum', 'bacardi', 'captain morgan', 'havana club',
      'tequila', 'tekila', 'tequilla', 'tequilashot', 'mezcal', 'mescal', 'jose cuervo', 'olmeca', 'patron',
      'konjak', 'cognac', 'brandy', 'calvados', 'armagnac', 'grappa', 'avec', 'kaffe avec',
    ],
    note: 'Vodka, gin, whisky, rom, konjak, tequila m.m., ca 40 %. Högre styrka ger mer alkohol och energi. Kryddad rom kan innehålla några gram socker per 100 ml.',
  },
  {
    id: 'punsch-arrak',
    name: 'Punsch',
    cat: 'alkohol',
    lmv: 1922,
    kcal: 244, prot: 0, carb: 26, fat: 0, fiber: 0, sugar: 26, addedSugar: 26, satFat: 0, salt: 0, alc: 20,
    portions: [['glas', '1 punschglas (4 cl)', 43], ['glas-6', '1 glas (6 cl)', 64]],
    density: 1.07, liquid: true,
    tags: ['glutenfri', 'svensk', 'klassiker'],
    syn: ['punsch', 'arrakpunsch', 'flaggpunsch', 'carlshamns', 'varm punsch', 'kall punsch', 'svensk punsch', 'punch'],
    note: 'Arrakpunsch ca 26 %. Serveras kall eller varm, t.ex. till ärtsoppa på torsdagar.',
  },
  {
    id: 'likor-gradde',
    name: 'Gräddlikör',
    cat: 'alkohol',
    kcal: 306, prot: 2.8, carb: 23.4, fat: 12.7, fiber: 0, sugar: 18.7, addedSugar: 16, satFat: 7.8, salt: 0.18, alc: 12.5,
    n: { vitD: 0, vitC: 0, calcium: 50, iron: 0.1, potassium: 60 },
    portions: [['glas', '1 glas (4 cl)', 43], ['glas-6', '1 glas (6 cl)', 64], ['kaffe', '1 skvätt i kaffet (2 cl)', 21]],
    density: 1.07, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['baileys', "bailey's", 'gräddlikör', 'irish cream', 'amarula', 'likör', 'graddlikor'],
    note: 'Ca 17 % (typ Baileys).',
  },
  {
    id: 'likor-sot',
    name: 'Likör',
    cat: 'alkohol',
    lmv: 1919,
    kcal: 266, prot: 0, carb: 33, fat: 0, fiber: 0, sugar: 33, addedSugar: 33, satFat: 0, salt: 0, alc: 19,
    portions: [['glas', '1 glas (4 cl)', 44], ['halv', '1 liten (2 cl)', 22]],
    density: 1.1, liquid: true,
    tags: ['glutenfri'],
    syn: ['likör', 'likor', 'fruktlikör', 'kaffelikör', 'kahlua', 'amaretto', 'limoncello', 'cointreau', 'triple sec', 'licor 43', 'sourz', 'hallonlikör', 'mintlikör', 'jägermeister', 'fernet', 'örtlikör'],
    note: 'Söt likör ca 20–30 %, t.ex. frukt-, kaffe- eller örtlikör. Socker- och alkoholhalt varierar mycket mellan likörer.',
  },
  {
    id: 'drink-gin-tonic',
    name: 'Gin och tonic',
    cat: 'alkohol',
    kcal: 72, prot: 0, carb: 6.4, fat: 0, fiber: 0, sugar: 6.4, addedSugar: 6.4, satFat: 0, salt: 0.02, alc: 6.6,
    n: { ...NOLL_MIKRO, calcium: 1, iron: 0, potassium: 1 },
    portions: [['drink', '1 drink (ca 2 dl)', 193]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['gin tonic', 'gin och tonic', 'gin & tonic', 'g&t', 'gt', 'gintonic', 'vodka tonic', 'drink'],
    note: '4 cl gin och 1,5 dl tonic. Med light-tonic blir det ca 50 kcal per 100 g.',
  },
  {
    id: 'drink-sprit-cola',
    name: 'Grogg',
    cat: 'alkohol',
    kcal: 80, prot: 0, carb: 8.5, fat: 0, fiber: 0, sugar: 8.5, addedSugar: 8.5, satFat: 0, salt: 0, alc: 6.6,
    n: { ...NOLL_MIKRO, caffeine: 8, calcium: 2, iron: 0.06, potassium: 2, phosphorus: 13 },
    portions: [['drink', '1 drink (ca 2 dl)', 193]],
    density: 1.02, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: [
      'grogg', 'drink', 'rom och cola', 'rom cola', 'cuba libre', 'whisky cola', 'jack och cola', 'vodka cola', 'rum and coke', 'vodka sprite',
      'moscow mule', 'mule', 'moscow mjul', 'mjul', 'vodka ginger beer', 'gin mule', 'london mule', 'kentucky mule', 'moskva mule',
      'mojito', 'mohito', 'rom lime mynta', 'drink med mynta',
    ],
    note: '4 cl sprit och 1,5 dl läsk, t.ex. rom och cola eller vodka och Sprite. Moscow mule och mojito har ungefär samma värden. Med sockerfri läsk blir det ca 45 kcal per 100 g.',
  },
  {
    id: 'drink-aperol-spritz',
    name: 'Spritz',
    cat: 'alkohol',
    kcal: 85, prot: 0, carb: 8.8, fat: 0, fiber: 0, sugar: 8.8, addedSugar: 8.2, satFat: 0, salt: 0, alc: 7.1,
    n: { ...NOLL_MIKRO, calcium: 5, iron: 0.2, potassium: 36 },
    portions: [['drink', '1 drink (ca 2 dl)', 184]],
    density: 1.01, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri'],
    syn: ['spritz', 'aperol spritz', 'aperol', 'campari spritz', 'hugo spritz', 'hugo', 'sprits', 'limoncello spritz'],
    note: 'Klassisk Aperol spritz 3-2-1: 9 cl prosecco, 6 cl Aperol och 3 cl sodavatten.',
  },
  {
    id: 'irish-coffee',
    name: 'Irish coffee',
    cat: 'alkohol',
    lmv: 1929,
    kcal: 80, prot: 0.1, carb: 4.2, fat: 2.7, fiber: 0, sugar: 3.8, addedSugar: 3.8, satFat: 1.7, salt: 0, alc: 5.54,
    n: { caffeine: 35 },
    portions: [['glas', '1 glas (ca 2 dl)', 190]],
    density: 1.0, liquid: true,
    tags: ['vegetarisk', 'glutenfri'],
    syn: ['irish coffee', 'irländskt kaffe', 'kaffedrink', 'kaffe med whisky', 'kaffe karlsson', 'kaffe med likör'],
    note: 'Kaffe med whiskey, farinsocker och lättvispad grädde.',
  },
  {
    id: 'drink-kaffekask',
    name: 'Kaffekask',
    cat: 'alkohol',
    kcal: 48, prot: 0.2, carb: 0.3, fat: 0, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0, salt: 0, alc: 6.6,
    n: { caffeine: 46, vitD: 0, vitC: 0, folate: 2, vitB12: 0, calcium: 2, iron: 0.02, magnesium: 6, potassium: 72 },
    portions: [['kopp', '1 kopp (1,5 dl kaffe + 4 cl brännvin)', 188]],
    density: 1.0, liquid: true,
    tags: ['vegan', 'glutenfri', 'laktosfri', 'svensk', 'klassiker'],
    syn: ['kaffekask', 'kask', 'karsk', 'kaffekarsk', 'kaffegök', 'kaffe med sprit', 'kaffe med brännvin'],
    note: 'Kaffe med brännvin – en norrländsk klassiker. Socker tillkommer om det används.',
  },
]

export const drycker = defineFoods([
  ...vatten,
  ...kaffe,
  ...te,
  ...chokladProtein,
  ...energiSport,
  ...lask,
  ...saft,
  ...juice,
  ...olCider,
  ...vin,
  ...sprit,
])
