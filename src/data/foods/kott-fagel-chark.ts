/**
 * Kött, fågel, vilt och charkuterier.
 *
 * En rad per vardagsbegrepp så som det äts: "Kycklingbröst", "Nötfärs", "Falukorv". Värden per
 * 100 g ätlig del (utan ben), baserade på Livsmedelsverkets livsmedelsdatabas och typiska svenska
 * förpackningsuppgifter.
 *
 * Tillagat är standard. Styckdetaljer, färser och fågel anges stekta/kokta utan tillsatt fett och
 * salt – räkna stekfett och salt separat. Den som väger köttet rått väljer enheten "g rå":
 * `raw` anger hur många gram tillagat kött ett gram rått kött blir (vid stekning försvinner ca
 * 15–25 % av vikten, mest vatten, så näringsvärdena per 100 g blir högre än för rått kött).
 * Faktorn är i regel kvoten mellan proteinhalten i Livsmedelsverkets råa och tillagade post för
 * samma styckdetalj (protein försvinner inte vid stekning). Charkuterier (korv, skinka, pålägg)
 * anges som de säljs – de är redan tillagade.
 *
 * Poster med `lmv` är samma livsmedel (samma tillagning) som Livsmedelsverkets post med det
 * numret och har dess makronäringsvärden; övriga näringsämnen fylls i därifrån. Livsmedelsverkets
 * stekta kött innehåller lite salt (ca 0,4–0,5 g/100 g). Där deras post är "stekt m. salt" med
 * mer salt än så anger vi i stället osaltat värde, eftersom saltet räknas separat.
 *
 * Produkttyper med många märken (färdiga köttbullar, korv, pålägg, pulled pork …) är samlingsvärden
 * (`avg`): ett genomsnitt för vanliga märken i svenska butiker. Exakta värden för ett visst märke
 * fås genom att skanna streckkoden. Borttagna och sammanslagna id:n har alias i
 * `aliases/kott-fagel-chark.ts`.
 *
 * Klimatavtryck (co2e) i kg CO2e per kg livsmedel enligt ungefärliga värden från RISE och
 * Livsmedelsverket. För tillagat kött är värdet omräknat per kg tillagad vikt (rå vikt / utbyte).
 * Vilt från jakt har mycket lågt avtryck eftersom djuren inte föds upp.
 */
import type { FoodTag } from '../../types'
import { defineFoods, type FoodSeed } from './define'

const TILLAGAD = 'Tillagad utan tillsatt fett och salt – räkna stekfett och salt separat.'
const SKANNA = 'Skanna streckkoden för exakta värden för ditt märke.'
/** Rent kött är naturligt fritt från gluten och laktos. */
const KOTT: FoodTag[] = ['glutenfri', 'laktosfri']
/** Rökt och saltat fågelkött räknas som chark i Livsmedelsverkets råd om rött kött och chark. */
const FAGELCHARK = 'Rökt eller saltat fågelkött och korv av fågel räknas som chark i Livsmedelsverkets råd om rött kött och chark.'

// ---------------------------------------------------------------------------
// Nötkött och kalv
// ---------------------------------------------------------------------------

const notkott: FoodSeed[] = [
  {
    id: 'notfars-12-stekt',
    name: 'Nötfärs',
    cat: 'rott_kott',
    lmv: 2101,
    kcal: 226, prot: 25, carb: 0, fat: 13.9, fiber: 0, sugar: 0, satFat: 6.1, salt: 0.25,
    // Livsmedelsverkets post är saltad med jodsalt – osaltad färs har nästan inget jod.
    n: { iodine: 2 },
    raw: [0.8, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['burgare', '1 hamburgerbiff (ca 90 g)', 90],
      ['forp', '1 förpackning (500 g rå ≈ 400 g stekt)', 400],
      ['forp-800', '1 förpackning (800 g rå ≈ 640 g stekt)', 640],
      ['forp-kg', '1 förpackning (1 kg rå ≈ 800 g stekt)', 800],
    ],
    tags: [...KOTT],
    syn: [
      'nötfärs', 'köttfärs', 'färs', 'notfars', 'notfärs', 'nöt färs', 'svensk nötfärs', 'malet nötkött', 'köttfärs nöt',
      'stekt nötfärs', 'stekt köttfärs', 'nötfärs stekt', 'nötfärs rå', 'nötfärs 10%', 'nötfärs 12%', 'nötfärs 15%',
      'nötfärs 20%', 'hamburgerfärs', 'burgarfärs', 'smashburgare', 'burgare kött', 'köttfärs till tacos',
    ],
    co2e: 37,
    note: 'Nötfärs med ca 10–12 % fett. Fetare färs (15–20 %) ger ca 15 % mer energi. ' + TILLAGAD,
  },
  {
    id: 'notfars-5-stekt',
    name: 'Mager nötfärs',
    cat: 'rott_kott',
    kcal: 161, prot: 26.5, carb: 0, fat: 6.1, fiber: 0, sugar: 0, satFat: 2.7, salt: 0.19,
    n: {
      monoFat: 2.6, polyFat: 0.25, omega3: 0.07, cholesterol: 75,
      vitA: 3, vitD: 0.2, vitE: 0.25, thiamin: 0.06, riboflavin: 0.22, niacin: 5.6, vitB6: 0.38, folate: 6, vitB12: 2.3,
      calcium: 8, iron: 2.9, magnesium: 25, potassium: 380, phosphorus: 230, zinc: 5.9, selenium: 8, iodine: 1,
    },
    raw: [0.77, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['burgare', '1 hamburgerbiff (ca 90 g)', 90],
      ['forp', '1 förpackning (500 g rå ≈ 385 g stekt)', 385],
    ],
    tags: [...KOTT],
    syn: ['mager nötfärs', 'extra mager färs', 'nötfärs 5%', 'mager färs', 'mager köttfärs', 'nötfärs mager', 'lean färs'],
    co2e: 36,
    note: 'Nötfärs med ca 5 % fett. ' + TILLAGAD,
  },
  {
    id: 'entrecote-stekt',
    name: 'Entrecote',
    cat: 'rott_kott',
    lmv: 1017,
    kcal: 165, prot: 25.2, carb: 0, fat: 7.1, fiber: 0, sugar: 0, satFat: 3.5, salt: 0.5,
    raw: [0.86, 'ra'],
    portions: [['st', '1 entrecote (ca 170 g)', 170], ['portion', '1 portion (120 g)', 120]],
    tags: [...KOTT],
    syn: ['entrecôte', 'entrecot', 'entrekot', 'ribeye', 'rib eye', 'grillad entrecote', 'stekt entrecote', 'grillbiff', 'nötkött'],
    co2e: 36,
    note: TILLAGAD,
  },
  {
    id: 'ryggbiff-stekt',
    name: 'Biff',
    cat: 'rott_kott',
    lmv: 1014,
    kcal: 144, prot: 25.5, carb: 0, fat: 4.5, fiber: 0, sugar: 0, satFat: 1.9, salt: 0.5,
    raw: [0.85, 'ra'],
    portions: [
      ['st', '1 biff (ca 150 g)', 150],
      ['portion', '1 portion (120 g)', 120],
      ['tournedos', '1 tournedos (ca 155 g)', 155],
      ['skiva', '1 lövbiff eller skiva stek (ca 40 g)', 40],
    ],
    tags: [...KOTT],
    syn: [
      'biff', 'ryggbiff', 'rygg biff', 'sirloin', 'striploin', 'oxfilé', 'oxfile', 'oxfilet', 'nötfilé', 'filé mignon',
      'tournedos', 'black and white', 'pepparstek', 'lövbiff', 'lovbiff', 'nötstek', 'rostbiff', 'hemlagad rostbiff',
      'söndagsstek', 'fransyska', 'innanlår', 'ytterlår', 'biffstrimlor', 'strimlat nötkött', 'wokkött', 'biffkött', 'nötkött',
    ],
    co2e: 36,
    note:
      'Magra styckdetaljer av nöt – ryggbiff, oxfilé och innanlår (lövbiff, nötstek, hemlagad rostbiff) – stekta ' +
      'eller ugnsstekta. Värdena skiljer sig bara lite mellan dem; entrecote är fetare och finns som egen rad. ' + TILLAGAD,
  },
  {
    id: 'notkott-grytbitar-kokt',
    name: 'Grytbitar av nöt',
    cat: 'rott_kott',
    lmv: 1038,
    kcal: 184, prot: 26.1, carb: 0, fat: 8.8, fiber: 0, sugar: 0, satFat: 4.1, salt: 0.2,
    n: { iodine: 2 },
    raw: [0.79, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['forp', '1 förpackning (600 g rå ≈ 475 g kokt)', 475],
      ['bit', '1 bit högrev (1 kg rå ≈ 790 g kokt)', 790],
    ],
    tags: [...KOTT],
    syn: [
      'grytbitar', 'grytkött', 'kalopskött', 'kalops', 'högrev', 'hogrev', 'chuck', 'nötnacke', 'nötbog', 'bog', 'kött till gryta',
      'kokt nötkött', 'bräserad högrev', 'långkokt högrev', 'långkokt nötkött', 'pulled beef', 'soppkött', 'notkott',
    ],
    co2e: 43,
    note: 'Kokt, bräserat eller långkokt nötkött (grytbitar, högrev, pulled beef). Såsen räknas separat. ' + TILLAGAD,
  },
  {
    id: 'kalvlever-stekt',
    name: 'Lever',
    cat: 'rott_kott',
    kcal: 147, prot: 24.1, carb: 3.4, fat: 4.1, fiber: 0, sugar: 0, satFat: 1.4, salt: 0.25,
    n: {
      monoFat: 1.0, polyFat: 0.7, cholesterol: 375,
      vitA: 8200, vitD: 0.25, vitE: 0.9, vitC: 40, thiamin: 0.2, riboflavin: 4.2, niacin: 20.9, vitB6: 0.56, folate: 1880, vitB12: 56,
      calcium: 14, iron: 10.7, magnesium: 25, potassium: 270, phosphorus: 420, zinc: 4.0, selenium: 18.6,
    },
    raw: [0.8, 'ra'],
    portions: [['portion', '1 portion (100 g)', 100], ['skiva', '1 skiva (ca 65 g)', 65]],
    tags: [...KOTT],
    syn: ['lever', 'kalvlever', 'nötlever', 'oxlever', 'stekt lever', 'leverbiff', 'lever med lök', 'lever stekt'],
    co2e: 13,
    note:
      'Stekt kalv- eller nötlever. Extremt rik på vitamin A (halten varierar kraftigt), B12 och folat. ' +
      'Livsmedelsverket avråder gravida från lever och leverrätter. ' + TILLAGAD,
  },
  {
    id: 'kalvfile-stekt',
    name: 'Kalvkött',
    cat: 'rott_kott',
    lmv: 1032,
    kcal: 123, prot: 23.5, carb: 0, fat: 3.2, fiber: 0, sugar: 0, satFat: 1.2, salt: 0.4,
    raw: [0.85, 'ra'],
    portions: [['portion', '1 portion (120 g)', 120]],
    tags: [...KOTT],
    syn: ['kalv', 'kalvkött', 'kalvfilé', 'kalvfile', 'kalvstek', 'kalvytterfilé', 'kalvinnanlår', 'stekt kalvfilé', 'kalvfilé stekt'],
    co2e: 26,
    note: 'Stekt kalvfilé eller kalvstek. ' + TILLAGAD,
  },
  {
    id: 'kalvfars-stekt',
    name: 'Kalvfärs',
    cat: 'rott_kott',
    kcal: 183, prot: 25, carb: 0, fat: 9.2, fiber: 0, sugar: 0, satFat: 3.9, salt: 0.26,
    n: {
      monoFat: 3.6, polyFat: 0.58, omega3: 0.09, cholesterol: 92,
      vitA: 6, vitD: 0.26, vitE: 0.32, thiamin: 0.09, riboflavin: 0.28, niacin: 7.5, vitB6: 0.43, folate: 8, vitB12: 1.6,
      calcium: 13, iron: 1.3, magnesium: 28, potassium: 420, phosphorus: 256, zinc: 4.6, selenium: 7.7, iodine: 1,
    },
    raw: [0.78, 'ra'],
    portions: [['portion', '1 portion (100 g)', 100], ['forp', '1 förpackning (500 g rå ≈ 390 g stekt)', 390]],
    tags: [...KOTT],
    syn: ['kalvfärs', 'kalvfars', 'kalv färs', 'färs kalv', 'stekt kalvfärs', 'färs till wallenbergare'],
    co2e: 26,
    note: 'Kalvfärs med ca 8 % fett (rå). ' + TILLAGAD,
  },
]

// ---------------------------------------------------------------------------
// Blandfärs och fläskkött
// ---------------------------------------------------------------------------

const flask: FoodSeed[] = [
  {
    id: 'blandfars-stekt',
    name: 'Blandfärs',
    cat: 'rott_kott',
    lmv: 3618,
    kcal: 241, prot: 23.3, carb: 0, fat: 16.5, fiber: 0, sugar: 0, satFat: 7.2, salt: 0.4,
    raw: [0.77, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['forp', '1 förpackning (500 g rå ≈ 385 g stekt)', 385],
      ['forp-800', '1 förpackning (800 g rå ≈ 615 g stekt)', 615],
    ],
    tags: [...KOTT],
    syn: [
      'blandfärs', 'blandfars', 'köttfärs', 'färs', 'nöt- och fläskfärs', 'blandad färs', 'blanfärs', 'blandfärs 50/50',
      'stekt blandfärs', 'blandfärs stekt', 'stekt köttfärs', 'köttfärssås kött',
    ],
    co2e: 22,
    note: 'Hälften nötfärs och hälften fläskfärs, ca 15 % fett (rå). Fetthalten varierar mellan ca 10 och 20 %. ' + TILLAGAD,
  },
  {
    id: 'flaskfars-stekt',
    name: 'Fläskfärs',
    cat: 'rott_kott',
    lmv: 3619,
    kcal: 250, prot: 21.1, carb: 0, fat: 18.5, fiber: 0, sugar: 0, satFat: 7.9, salt: 0.4,
    raw: [0.8, 'ra'],
    portions: [['portion', '1 portion (100 g)', 100], ['forp', '1 förpackning (500 g rå ≈ 400 g stekt)', 400]],
    tags: [...KOTT],
    syn: ['fläskfärs', 'flaskfars', 'grisfärs', 'fläsk färs', 'stekt fläskfärs', 'fläskfärs stekt', 'färs'],
    co2e: 6.7,
    note: 'Ca 15 % fett (rå) – fetthalten varierar mellan ca 10 och 20 %. ' + TILLAGAD,
  },
  {
    id: 'hamburgerbiff',
    name: 'Hamburgerbiff',
    cat: 'rott_kott',
    lmv: 1138,
    avg: true,
    kcal: 260, prot: 14, carb: 5.4, fat: 20.3, fiber: 0.8, sugar: 0.5, satFat: 9.2, salt: 1.8,
    raw: [0.85, 'ra'],
    portions: [
      ['st', '1 hamburgerbiff (ca 75 g)', 75],
      ['stor', '1 stor hamburgerbiff (ca 130 g)', 130],
      ['forp', '1 förpackning (6 × 90 g fryst ≈ 460 g stekt)', 460],
    ],
    syn: [
      'hamburgare', 'hamburgerbiff', 'hamburgerbiffar', 'frysta hamburgare', 'hamburgare fryst', 'färdiga hamburgare',
      'burgarbiff', 'burgare', 'grillburgare', 'scan hamburgare', 'dafgårds hamburgare',
    ],
    co2e: 19,
    kostrad: { rottKott: 70 },
    note:
      'Samlingsvärde: Livsmedelsverkets genomsnitt för färdigformade frysta hamburgerbiffar av nöt (t.ex. Scan, ' +
      'Dafgårds, Garant), stekta. En fryst biff på 90 g blir ca 75 g stekt. Bröd och dressing räknas separat. ' + SKANNA,
  },
  {
    id: 'flaskfile-stekt',
    name: 'Fläskfilé',
    cat: 'rott_kott',
    lmv: 1023,
    kcal: 128, prot: 24.6, carb: 0, fat: 3.1, fiber: 0, sugar: 0, satFat: 1.2, salt: 0.4,
    raw: [0.84, 'ra'],
    portions: [
      ['portion', '1 portion (120 g)', 120],
      ['skiva', '1 medaljong (ca 40 g)', 40],
      ['st', '1 hel fläskfilé (ca 380 g)', 380],
    ],
    tags: [...KOTT],
    syn: [
      'fläskfilé', 'flaskfile', 'fläskfile', 'grisfilé', 'pork tenderloin', 'filé', 'stekt fläskfilé', 'fläskfilé stekt',
      'ugnsstekt fläskfilé', 'fläskmedaljong', 'fläskfilégryta kött',
    ],
    co2e: 6.7,
    note: TILLAGAD,
  },
  {
    id: 'flaskytterfile-stekt',
    name: 'Fläskytterfilé',
    cat: 'rott_kott',
    kcal: 166, prot: 29.3, carb: 0, fat: 5.4, fiber: 0, sugar: 0, satFat: 1.9, salt: 0.19,
    n: {
      monoFat: 2.4, polyFat: 0.65, omega3: 0.06, cholesterol: 80,
      vitA: 2, vitD: 0.4, vitE: 0.25, thiamin: 0.85, riboflavin: 0.26, niacin: 7.4, vitB6: 0.52, folate: 2, vitB12: 0.7,
      calcium: 8, iron: 0.9, magnesium: 29, potassium: 430, phosphorus: 265, zinc: 2.3, selenium: 17, iodine: 2,
    },
    raw: [0.75, 'ra'],
    portions: [['portion', '1 portion (120 g)', 120], ['skiva', '1 skiva (ca 75 g)', 75]],
    tags: [...KOTT],
    syn: [
      'fläskytterfilé', 'flaskytterfile', 'ytterfilé gris', 'grisytterfilé', 'kotlettrad', 'pork loin', 'fläskkotlett utan ben',
      'stekt fläskytterfilé', 'ugnsstekt fläskytterfilé', 'grillad fläskytterfilé', 'fläskstek',
    ],
    co2e: 6.7,
    note: 'Putsad ytterfilé (kotlettraden utan ben) med tunn fettkant. ' + TILLAGAD,
  },
  {
    id: 'flaskkotlett-stekt',
    name: 'Fläskkotlett',
    cat: 'rott_kott',
    lmv: 1025,
    kcal: 217, prot: 22.7, carb: 0, fat: 14.1, fiber: 0, sugar: 0, satFat: 6.1, salt: 0.5,
    raw: [0.85, 'ra'],
    portions: [['st', '1 kotlett, ätlig del (ca 105 g)', 105]],
    tags: [...KOTT],
    syn: ['kotlett', 'kotletter', 'fläskkotlett', 'flaskkotlett', 'griskotlett', 'pork chop', 'stekt kotlett', 'grillad kotlett', 'fläskkotlett stekt'],
    co2e: 6.7,
    note: 'Med ca 5 mm fettkant. Utan fettkant ca 150 kcal/100 g. ' + TILLAGAD,
  },
  {
    id: 'flaskkarre-stekt',
    name: 'Fläskkarré',
    cat: 'rott_kott',
    lmv: 1024,
    kcal: 202, prot: 21, carb: 0, fat: 13.2, fiber: 0, sugar: 0, satFat: 5.7, salt: 0.4,
    raw: [0.85, 'ra'],
    portions: [['portion', '1 portion (120 g)', 120], ['skiva', '1 karréskiva (ca 100 g)', 100]],
    tags: [...KOTT],
    syn: [
      'karré', 'kare', 'fläskkarré', 'flaskkarre', 'grisnacke', 'fläsknacke', 'karrébit', 'karrékotlett', 'stekt karré',
      'grillad karré', 'ugnsstekt karré', 'karréstek', 'fläskstek', 'grillkarré',
    ],
    co2e: 6.7,
    note: TILLAGAD,
  },
  {
    id: 'revbensspjall-ugnsstekta',
    name: 'Revbensspjäll',
    cat: 'rott_kott',
    lmv: 1059,
    kcal: 283, prot: 18, carb: 0, fat: 23.7, fiber: 0, sugar: 0, satFat: 9.8, salt: 0.2,
    portions: [['portion', '1 portion, ätlig del (ca 150 g)', 150], ['bit', '1 revbensbit, ätlig del (ca 25 g)', 25]],
    tags: [...KOTT],
    syn: ['revbensspjäll', 'revbenspjäll', 'revbensspjall', 'revben', 'spareribs', 'ribs', 'julrevben', 'ugnsrevben', 'fläskrevben', 'gris'],
    co2e: 7,
    note: 'Ugnsstekta, ätlig del utan ben. Utan glaze och marinad – en söt BBQ-glaze ger ca 20–40 kcal extra per 100 g. ' + TILLAGAD,
  },
  {
    id: 'pulled-pork-bbq',
    name: 'Pulled pork',
    cat: 'rott_kott',
    avg: true,
    kcal: 167, prot: 18, carb: 9, fat: 6.5, fiber: 0.3, sugar: 7.5, addedSugar: 6, satFat: 2.3, salt: 1.4,
    n: {
      monoFat: 2.8, polyFat: 0.8,
      vitD: 0.3, vitC: 1, thiamin: 0.45, folate: 5, vitB12: 0.6,
      calcium: 15, iron: 1.3, potassium: 330, zinc: 3.0,
    },
    portions: [['portion', '1 portion (150 g)', 150], ['forp', '1 förpackning (400 g)', 400]],
    tags: ['laktosfri'],
    syn: [
      'pulled pork', 'bbq pork', 'pulled pork färdig', 'pulled pork bbq', 'dragen fläsk', 'dragen gris', 'fläskbog', 'grisbog',
      'långkokt fläsk', 'pulled pork naturell',
    ],
    co2e: 6,
    plate: { veg: 0, carb: 0, protein: 0.85 },
    kostrad: { rottKott: 85 },
    note:
      'Samlingsvärde: genomsnitt för färdig pulled pork med BBQ-sås (t.ex. Scan, Pärsons, Garant). ' +
      'Hemlagad långkokt fläskbog utan sås har mer protein och fett, ca 220 kcal/100 g. ' + SKANNA,
  },
  {
    id: 'schnitzel-stekt',
    name: 'Schnitzel',
    cat: 'rott_kott',
    lmv: 1066,
    kcal: 212, prot: 19.6, carb: 9.7, fat: 10.2, fiber: 1.2, sugar: 0.6, addedSugar: 0.6, satFat: 1.9, salt: 1.4,
    portions: [['st', '1 schnitzel (ca 130 g)', 130], ['portion', '1 portion (150 g)', 150]],
    tags: ['laktosfri'],
    syn: [
      'schnitzel', 'snitsel', 'schnitsel', 'fläskschnitzel', 'kalvschnitzel', 'wienerschnitzel', 'panerad schnitzel',
      'panerad kotlett', 'panerat fläsk', 'stekt schnitzel',
    ],
    co2e: 6,
    plate: { veg: 0, carb: 0.15, protein: 0.85 },
    kostrad: { rottKott: 80 },
    note: 'Panerad och stekt schnitzel av fläsk eller kalv (stekfettet ingår). Kycklingschnitzel finns som egen rad.',
  },
  {
    id: 'pannbiff-stekt',
    name: 'Pannbiff',
    cat: 'rott_kott',
    lmv: 1129,
    kcal: 198, prot: 15.7, carb: 4.2, fat: 13.2, fiber: 0.5, sugar: 1, satFat: 5.5, salt: 1.6,
    portions: [['st', '1 pannbiff (ca 100 g)', 100], ['portion', '1 portion (2 st, ca 200 g)', 200]],
    tags: ['klassiker', 'svensk'],
    syn: ['pannbiff', 'pannbiffar', 'färsbiff', 'köttfärsbiff', 'biff av färs', 'hackebiff', 'hemlagad pannbiff'],
    co2e: 15,
    plate: { veg: 0.05, carb: 0.1, protein: 0.85 },
    kostrad: { rottKott: 80 },
    note: 'Hemlagad pannbiff av blandfärs med ströbröd, lök och ägg, stekt. Löksås och tillbehör räknas separat.',
  },
  {
    id: 'tacofars',
    name: 'Tacofärs',
    cat: 'rott_kott',
    lmv: 2932,
    kcal: 210, prot: 17.4, carb: 2.6, fat: 14.4, fiber: 0.6, sugar: 1.2, addedSugar: 1, satFat: 5.4, salt: 1.2,
    portions: [['portion', '1 portion (100 g)', 100], ['taco', 'Fyllning till 1 taco (ca 40 g)', 40]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['tacofärs', 'tacokött', 'köttfärs med tacokrydda', 'tacokryddad färs', 'tacokryddad köttfärs', 'färs till tacos', 'fredagstacos'],
    co2e: 20,
    kostrad: { rottKott: 85 },
    note: 'Stekt köttfärs (nöt och fläsk) med tacokrydda och vatten. Skal, sås och grönsaker räknas separat.',
  },
]

// ---------------------------------------------------------------------------
// Lamm
// ---------------------------------------------------------------------------

const lamm: FoodSeed[] = [
  {
    id: 'lammfars-stekt',
    name: 'Lammfärs',
    cat: 'rott_kott',
    lmv: 3620,
    kcal: 286, prot: 21.1, carb: 0, fat: 22.7, fiber: 0, sugar: 0, satFat: 10.6, salt: 0.24,
    // Livsmedelsverkets post är saltad med jodsalt – osaltad färs har lite jod (rå färs ca 5,5 µg/100 g).
    n: { iodine: 7 },
    raw: [0.82, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['burgare', '1 lammburgare (ca 90 g)', 90],
      ['forp', '1 förpackning (500 g rå ≈ 410 g stekt)', 410],
    ],
    tags: [...KOTT],
    syn: ['lammfärs', 'lammfars', 'lamm färs', 'färs av lamm', 'stekt lammfärs', 'lammbiff', 'köftebiff', 'lammburgare', 'köfte'],
    co2e: 29,
    note: TILLAGAD,
  },
  {
    id: 'lammkotlett-stekt',
    name: 'Lammkotlett',
    cat: 'rott_kott',
    lmv: 1036,
    kcal: 231, prot: 22.1, carb: 0, fat: 16.1, fiber: 0, sugar: 0, satFat: 7.3, salt: 0.5,
    raw: [0.86, 'ra'],
    portions: [['portion', '1 portion (3 kotletter, ätlig del)', 125], ['st', '1 lammkotlett, ätlig del (ca 40 g)', 40]],
    tags: [...KOTT],
    syn: ['lammkotlett', 'lammkotletter', 'lammracks', 'lammrack', 'lammentrecote', 'lamm kotlett', 'grillad lammkotlett', 'stekt lammkotlett'],
    co2e: 29,
    note: 'Stekt eller grillad. ' + TILLAGAD,
  },
  {
    id: 'lammstek-ugnsstekt',
    name: 'Lammstek',
    cat: 'rott_kott',
    lmv: 1037,
    kcal: 119, prot: 24, carb: 0, fat: 2.4, fiber: 0, sugar: 0, satFat: 0.9, salt: 0.5,
    raw: [0.87, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['skiva', '1 skiva (ca 30 g)', 30],
      ['stek', '1 hel lammstek utan ben (1,5 kg rå ≈ 1,3 kg tillagad)', 1305],
    ],
    tags: [...KOTT],
    syn: ['lammstek', 'lammlår', 'lammytterfilé', 'lamm', 'lammkött', 'påsklamm', 'ugnsstekt lamm', 'lammsadel', 'lammlägg', 'stekt lamm'],
    co2e: 28,
    note: 'Ugnsstekt lammstek eller lammytterfilé. ' + TILLAGAD,
  },
]

// ---------------------------------------------------------------------------
// Vilt och ren
// ---------------------------------------------------------------------------

/** Vilt och ren – svensk råvara, magert och järnrikt. */
const VILT: FoodTag[] = ['glutenfri', 'laktosfri', 'svensk']

const vilt: FoodSeed[] = [
  {
    id: 'algstek-ugnsstekt',
    name: 'Viltkött',
    cat: 'rott_kott',
    lmv: 1050,
    kcal: 132, prot: 27, carb: 1.8, fat: 1.6, fiber: 0, sugar: 0, satFat: 0.5, salt: 0.4,
    raw: [0.82, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['skiva', '1 skiva (ca 30 g)', 30],
      ['stek', '1 hel stek (1,5 kg rå ≈ 1,2 kg tillagad)', 1230],
    ],
    tags: VILT,
    syn: [
      'viltkött', 'vilt', 'älg', 'älgkött', 'algkott', 'älgstek', 'algstek', 'älginnanlår', 'älgytterfilé', 'älgfilé', 'moose',
      'rådjur', 'radjur', 'rådjursfilé', 'rådjursstek', 'hjort', 'kronhjort', 'dovhjort', 'hjortstek', 'hjortfilé', 'venison',
      'vildsvin', 'vildsvinskött', 'vildsvinsfilé', 'vildgris', 'wild boar', 'ren', 'renkött', 'renstek', 'renfilé', 'reindeer',
      'viltstek', 'ugnsstekt älg', 'stekt rådjur',
    ],
    co2e: 1.4,
    note:
      'Stekt eller ugnsstekt magert vilt – älg, rådjur, hjort, vildsvin och ren har nästan samma näringsvärden. ' +
      'Ren kommer från renskötseln i Sápmi och har något högre klimatavtryck. ' + TILLAGAD,
  },
  {
    id: 'algfars-stekt',
    name: 'Älgfärs',
    cat: 'rott_kott',
    kcal: 165, prot: 27.3, carb: 0, fat: 6.2, fiber: 0, sugar: 0, satFat: 2.5, salt: 0.2,
    n: {
      monoFat: 2.4, polyFat: 0.6, omega3: 0.12, cholesterol: 78,
      thiamin: 0.13, riboflavin: 0.33, niacin: 5.8, vitB6: 0.37, folate: 5, vitB12: 3.4,
      calcium: 9, iron: 4.0, magnesium: 26, potassium: 360, phosphorus: 230, zinc: 5.0,
    },
    raw: [0.77, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['burgare', '1 älgburgare (ca 90 g)', 90],
      ['forp', '1 förpackning (500 g rå ≈ 385 g stekt)', 385],
    ],
    tags: VILT,
    syn: ['älgfärs', 'algfars', 'älg färs', 'färs älg', 'viltfärs', 'viltfars', 'hjortfärs', 'vildsvinsfärs', 'jaktfärs', 'älgburgare', 'stekt älgfärs'],
    co2e: 2,
    note: 'Älg- eller viltfärs med lite inblandat fett (ca 5 % rå). Med fläskfett eller nötfärs blir fetthalten ofta 10–15 %. ' + TILLAGAD,
  },
  {
    id: 'renskav',
    name: 'Renskav',
    cat: 'rott_kott',
    kcal: 157, prot: 25.4, carb: 0, fat: 6.1, fiber: 0, sugar: 0, satFat: 3.0, salt: 0.5,
    n: {
      monoFat: 2.0, polyFat: 0.4, cholesterol: 93,
      vitA: 8, vitE: 0.5, thiamin: 0.2, riboflavin: 0.49, niacin: 11.4, vitB6: 0.31, folate: 2, vitB12: 2.6,
      calcium: 9, iron: 4.0, magnesium: 25, potassium: 338, phosphorus: 250, zinc: 6.1, selenium: 13, iodine: 9,
    },
    raw: [0.8, 'ra'],
    portions: [['portion', '1 portion (100 g)', 100], ['forp', '1 förpackning (240 g fryst ≈ 190 g brynt)', 190]],
    tags: VILT,
    syn: ['renskav', 'ren skav', 'skav', 'renskavsgryta', 'skavsås', 'älgskav', 'viltskav', 'renkött'],
    co2e: 6,
    note: 'Tunt hyvlat fryst renkött, brynt. Grädde och svamp i renskavsgrytan räknas separat. ' + TILLAGAD,
  },
  {
    id: 'tjalknol',
    name: 'Tjälknöl',
    cat: 'chark',
    kcal: 132, prot: 28, carb: 0.5, fat: 2, fiber: 0, sugar: 0.5, satFat: 0.8, salt: 1.8,
    n: {
      monoFat: 0.55, polyFat: 0.4, omega3: 0.1, cholesterol: 75,
      thiamin: 0.08, riboflavin: 0.33, niacin: 5.5, vitB6: 0.38, folate: 5, vitB12: 3.8,
      calcium: 7, iron: 4.2, magnesium: 27, potassium: 330, phosphorus: 230, zinc: 4.7,
    },
    portions: [['portion', '1 portion (100 g)', 100], ['skiva', '1 skiva (ca 20 g)', 20]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['tjälknöl', 'tjälknul', 'tjalknol', 'tjälknöl älg', 'saltad älgstek', 'älgstek saltad', 'lakad älgstek'],
    co2e: 1.4,
    note:
      'Fryst älgstek som långsamstekts i ugnen och sedan lagts i saltlake. ' +
      'Görs även på nötstek – då blir fetthalten och klimatavtrycket betydligt högre.',
  },
]

// ---------------------------------------------------------------------------
// Fågel
// ---------------------------------------------------------------------------

const FAGEL: FoodTag[] = ['glutenfri', 'laktosfri']

const fagel: FoodSeed[] = [
  {
    id: 'kycklingfile-stekt',
    name: 'Kycklingbröst',
    cat: 'fagel',
    kcal: 139, prot: 30.8, carb: 0, fat: 1.6, fiber: 0, sugar: 0, satFat: 0.5, salt: 0.25,
    n: {
      monoFat: 0.8, polyFat: 0.3, omega3: 0.03, cholesterol: 77,
      vitA: 9, vitD: 0.5, vitE: 1.4, vitC: 0, thiamin: 0.27, riboflavin: 0.17, niacin: 19.5, vitB6: 1.0, folate: 25, vitB12: 0.31,
      calcium: 15, iron: 0.9, magnesium: 37, potassium: 340, phosphorus: 260, zinc: 1.1, selenium: 15, iodine: 1,
    },
    raw: [0.75, 'ra'],
    portions: [
      ['st', '1 filé (ca 95 g)', 95],
      ['portion', '1 portion (125 g)', 125],
      ['forp', '1 förpackning färdig strimlad kyckling (150 g)', 150],
    ],
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: [
      'kycklingbröst', 'kycklingfilé', 'kycklingfile', 'kycklingbröstfilé', 'kyckling', 'kykling', 'bröstfilé', 'chicken',
      'chicken breast', 'innerfilé', 'kycklinginnerfilé', 'kycklingfilé rå', 'stekt kyckling', 'grillad kycklingfilé',
      'ugnsstekt kycklingfilé', 'kokt kycklingfilé', 'kycklingfilé stekt', 'kycklingbröst stekt', 'tillagad kycklingfilé',
      'kycklingstrimlor', 'strimlad kyckling', 'färdig kyckling', 'kycklingbitar', 'kycklingstrips', 'kyckling till sallad',
    ],
    co2e: 4,
    note:
      'Stekt, grillad eller ugnsstekt kycklingbröstfilé utan skinn. En rå filé på ca 125 g blir ca 95 g tillagad. ' +
      'Färdigstekt kryddad kyckling (strimlor) innehåller mer salt, ca 1–1,5 g/100 g. ' + TILLAGAD,
  },
  {
    id: 'kycklinglarfile-stekt',
    name: 'Kycklinglårfilé',
    cat: 'fagel',
    kcal: 148, prot: 25.5, carb: 0, fat: 5.1, fiber: 0, sugar: 0, satFat: 1.6, salt: 0.27,
    n: {
      monoFat: 2.5, polyFat: 0.8, omega3: 0.05, cholesterol: 108,
      vitA: 26, vitD: 0.5, vitE: 1.4, thiamin: 0.09, riboflavin: 0.22, niacin: 11.4, vitB6: 0.38, folate: 20, vitB12: 0.4,
      calcium: 13, iron: 1.3, magnesium: 31, potassium: 300, phosphorus: 218, zinc: 2.5, selenium: 14.6, iodine: 2.3,
    },
    raw: [0.77, 'ra'],
    portions: [
      ['st', '1 lårfilé (ca 70 g)', 70],
      ['portion', '1 portion (125 g)', 125],
      ['forp', '1 förpackning (700 g rå ≈ 540 g tillagad)', 540],
    ],
    tags: [...FAGEL],
    syn: ['kycklinglårfilé', 'lårfilé', 'larfile', 'kyckling lårfilé', 'kycklinglår utan ben', 'stekt lårfilé', 'grillad lårfilé', 'kyckling'],
    co2e: 4,
    note: 'Utan skinn och ben. ' + TILLAGAD,
  },
  {
    id: 'grillkyckling-med-skinn',
    name: 'Grillkyckling',
    cat: 'fagel',
    lmv: 1182,
    kcal: 214, prot: 22.6, carb: 0, fat: 13.8, fiber: 0, sugar: 0, satFat: 4.4, salt: 0.9,
    raw: [0.8, 'ra'],
    portions: [
      ['kvarts', '1/4 kyckling, ätlig del (ca 160 g)', 160],
      ['halv', '1/2 kyckling, ätlig del (ca 320 g)', 320],
      ['hel', '1 hel kyckling, ätlig del (ca 650 g)', 650],
      ['portion', '1 portion (150 g)', 150],
    ],
    tags: [...FAGEL],
    syn: [
      'grillkyckling', 'grillad kyckling', 'helgrillad kyckling', 'kyckling med skinn', 'rotisserie', 'grillkykling',
      'kyckling grillad', 'färdiggrillad kyckling', 'hel grillad kyckling', 'hel kyckling', 'kyckling hel', 'helstekt kyckling',
      'ugnsstekt kyckling', 'ugnsstekt hel kyckling', 'grillkyckling utan skinn', 'kycklingkött',
    ],
    co2e: 4,
    note:
      'Färdiggrillad eller ugnsstekt hel kyckling, kött och skinn utan ben. Utan skinn ca 175 kcal/100 g. ' +
      'Butikens grillkyckling är kryddad och saltad.',
  },
  {
    id: 'kycklinglar-ugnsstekta',
    name: 'Kycklinglår och klubbor',
    cat: 'fagel',
    kcal: 208, prot: 25, carb: 0, fat: 12, fiber: 0, sugar: 0, satFat: 3.4, salt: 0.26,
    n: {
      monoFat: 5.0, polyFat: 2.6, omega3: 0.2, cholesterol: 132,
      vitA: 30, vitD: 0.33, vitE: 0.38, thiamin: 0.07, riboflavin: 0.21, niacin: 6.3, vitB6: 0.34, folate: 8, vitB12: 0.55,
      calcium: 12, iron: 1.2, magnesium: 22, potassium: 260, phosphorus: 188, zinc: 2.6, selenium: 15, iodine: 3,
    },
    portions: [
      ['st', '1 helt kycklinglår, ätlig del (ca 130 g)', 130],
      ['klubba', '1 klubba, ätlig del (ca 70 g)', 70],
      ['portion', '1 portion (3 klubbor, ca 210 g)', 210],
    ],
    tags: [...FAGEL],
    syn: [
      'kycklinglår', 'hela kycklinglår', 'kycklingklubba', 'kycklingklubbor', 'klubbor', 'drumsticks', 'underlår', 'kycklingben',
      'lår med skinn', 'kycklingdelar', 'ugnsstekt kyckling',
    ],
    co2e: 4,
    note: 'Ugnsstekta med skinn, ätlig del utan ben. ' + TILLAGAD,
  },
  {
    id: 'kycklingvingar-ugnsstekta',
    name: 'Kycklingvingar',
    cat: 'fagel',
    kcal: 275, prot: 26, carb: 0, fat: 19, fiber: 0, sugar: 0, satFat: 5.3, salt: 0.25,
    n: {
      monoFat: 7.6, polyFat: 4.0, omega3: 0.25, cholesterol: 85,
      vitA: 45, vitD: 0.3, vitE: 0.5, thiamin: 0.04, riboflavin: 0.13, niacin: 6.5, vitB6: 0.4, folate: 4, vitB12: 0.3,
      calcium: 15, iron: 1.1, magnesium: 18, potassium: 180, phosphorus: 160, zinc: 1.7, selenium: 18, iodine: 3,
    },
    portions: [['portion', '1 portion (8 vingbitar, ätlig del)', 160], ['st', '1 vingbit, ätlig del (ca 20 g)', 20]],
    tags: [...FAGEL],
    syn: [
      'kycklingvingar', 'kycklingvinge', 'vingar', 'chicken wings', 'wings', 'buffalo wings', 'hot wings', 'friterade vingar',
      'kycklingvingar friterade', 'grillade kycklingvingar',
    ],
    co2e: 4,
    note:
      'Ugnsstekta, ätlig del. Utan marinad och sås – färdigmarinerade vingar innehåller ofta socker och salt. Friterade ' +
      'vingar med stark sås (buffalo wings) har ungefär samma energi men mer salt. ' + TILLAGAD,
  },
  {
    id: 'kycklingfars-stekt',
    name: 'Kycklingfärs',
    cat: 'fagel',
    kcal: 172, prot: 24, carb: 0, fat: 8.4, fiber: 0, sugar: 0, satFat: 2.4, salt: 0.26,
    n: {
      monoFat: 3.6, polyFat: 1.8, omega3: 0.12, cholesterol: 105,
      vitA: 17, vitD: 0.25, vitE: 0.35, thiamin: 0.07, riboflavin: 0.2, niacin: 7.7, vitB6: 0.37, folate: 7, vitB12: 0.55,
      calcium: 13, iron: 1.0, magnesium: 26, potassium: 340, phosphorus: 215, zinc: 2.0, selenium: 14, iodine: 2,
    },
    raw: [0.75, 'ra'],
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['burgare', '1 kycklingburgare (ca 90 g)', 90],
      ['forp', '1 förpackning (500 g rå ≈ 375 g stekt)', 375],
    ],
    tags: [...FAGEL],
    syn: ['kycklingfärs', 'kycklingfars', 'kyckling färs', 'färs kyckling', 'ljus färs', 'fågelfärs', 'stekt kycklingfärs', 'kycklingburgare', 'kycklingbiff'],
    co2e: 4,
    note: 'Ca 7 % fett (rå) – fetthalten varierar mellan ca 4 och 10 % beroende på andel lårkött. ' + TILLAGAD,
  },
  {
    id: 'kycklingschnitzel',
    name: 'Kycklingschnitzel',
    cat: 'fagel',
    avg: true,
    kcal: 220, prot: 16, carb: 14, fat: 11, fiber: 1, sugar: 1, satFat: 1.5, salt: 1.2,
    portions: [['st', '1 schnitzel (ca 115 g)', 115], ['portion', '1 portion (2 st, ca 230 g)', 230]],
    tags: ['laktosfri'],
    syn: [
      'kycklingschnitzel', 'kyckling schnitzel', 'panerad kyckling', 'panerad kycklingfilé', 'kycklingfilé panerad',
      'crispy chicken', 'kronfågel schnitzel', 'guldfågeln schnitzel',
    ],
    co2e: 4,
    plate: { veg: 0, carb: 0.15, protein: 0.85 },
    note:
      'Samlingsvärde: ungefärligt genomsnitt för panerad kycklingschnitzel, stekt eller ugnsbakad (t.ex. Kronfågel, ' +
      'Guldfågeln, ICA, Garant). Hemgjord schnitzel av kycklingbröst har mer protein, ca 20–25 g/100 g. ' + SKANNA,
  },
  {
    id: 'pulled-chicken',
    name: 'Pulled chicken',
    cat: 'fagel',
    lmv: 5875,
    avg: true,
    kcal: 133, prot: 19.6, carb: 0.9, fat: 5.4, fiber: 0.9, sugar: 0.9, addedSugar: 0.9, satFat: 1.4, salt: 1.7,
    portions: [['portion', '1 portion (125 g)', 125], ['forp', '1 förpackning (300 g)', 300]],
    tags: ['laktosfri'],
    syn: ['pulled chicken', 'dragen kyckling', 'strimlad kyckling', 'kyckling pulled', 'bbq-kyckling'],
    co2e: 4,
    note: 'Samlingsvärde: Livsmedelsverkets värde för tillagad pulled chicken med marinad (t.ex. Kronfågel, Guldfågeln, ICA). ' + SKANNA,
  },
  {
    id: 'kycklingkottbullar-fardiga',
    name: 'Kycklingköttbullar',
    cat: 'fagel',
    lmv: 1100,
    avg: true,
    kcal: 224, prot: 16, carb: 13, fat: 12, fiber: 0, sugar: 1.7, addedSugar: 1.7, satFat: 2.8, salt: 1.8,
    portions: [['portion', '1 portion (10 st, ca 150 g)', 150], ['st', '1 köttbulle (ca 15 g)', 15]],
    syn: ['kycklingköttbullar', 'kycklingbullar', 'köttbullar av kyckling', 'kyckling köttbullar'],
    co2e: 4,
    plate: { veg: 0.03, carb: 0.1, protein: 0.87 },
    note:
      'Samlingsvärde: Livsmedelsverkets genomsnitt för färdiga kycklingköttbullar (kylda eller frysta, t.ex. Kronfågel, ' +
      'Guldfågeln, Garant), med ströbröd eller potatisflingor. ' + SKANNA,
  },
  {
    id: 'kalkonfile-stekt',
    name: 'Kalkonbröst',
    cat: 'fagel',
    kcal: 138, prot: 31, carb: 0, fat: 1.6, fiber: 0, sugar: 0, satFat: 0.45, salt: 0.2,
    n: {
      monoFat: 0.45, polyFat: 0.4, omega3: 0.04, cholesterol: 80,
      vitE: 0.12, thiamin: 0.04, riboflavin: 0.14, niacin: 11, vitB6: 0.55, folate: 6, vitB12: 0.55,
      calcium: 9, iron: 0.8, magnesium: 31, potassium: 370, phosphorus: 250, zinc: 1.4, selenium: 19, iodine: 3,
    },
    raw: [0.78, 'ra'],
    portions: [['portion', '1 portion (125 g)', 125], ['forp', '1 förpackning (500 g rå ≈ 390 g tillagad)', 390]],
    tags: [...FAGEL],
    syn: ['kalkon', 'kalkonbröst', 'kalkonfilé', 'kalkonfile', 'kalkonbröstfilé', 'turkey', 'stekt kalkon', 'kalkonstek'],
    co2e: 5.3,
    note: TILLAGAD,
  },
  {
    id: 'ankbrost-stekt',
    name: 'Ankbröst',
    cat: 'fagel',
    kcal: 254, prot: 23, carb: 0, fat: 18, fiber: 0, sugar: 0, satFat: 5.6, salt: 0.2,
    n: {
      monoFat: 8.3, polyFat: 2.4, omega3: 0.15, cholesterol: 120,
      vitA: 30, vitE: 0.5, thiamin: 0.2, riboflavin: 0.35, niacin: 5.5, vitB6: 0.3, folate: 8, vitB12: 0.4,
      calcium: 10, iron: 3.0, magnesium: 20, potassium: 270, phosphorus: 190, zinc: 2.2, selenium: 20,
    },
    // Ankbröst med skinn tappar ungefär en fjärdedel av vikten (fett och vatten) i pannan.
    raw: [0.75, 'ra'],
    portions: [
      ['portion', '1/2 ankbröst (ca 110 g)', 110],
      ['st', '1 helt ankbröst (ca 220 g)', 220],
    ],
    tags: [...FAGEL],
    syn: ['ankbröst', 'ankbrost', 'anka', 'magret', 'duck', 'ankfilé', 'helstekt anka', 'ugnsstekt anka', 'andstek', 'pekinganka', 'ankstek'],
    co2e: 6,
    note: 'Stekt med skinn. Skinnet innehåller det mesta av fettet – utan skinn ca 140 kcal/100 g. Helstekt anka är fetare, ca 330 kcal/100 g. ' + TILLAGAD,
  },
  {
    id: 'gas-ugnsstekt',
    name: 'Gås',
    cat: 'fagel',
    lmv: 1184,
    kcal: 324, prot: 25.9, carb: 0, fat: 24.7, fiber: 0, sugar: 0, satFat: 7.2, salt: 0.5,
    portions: [['portion', '1 portion (ca 150 g)', 150]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['gås', 'gas', 'mårten gås', 'mårtensgås', 'gåsstek', 'stekt gås', 'skånsk gås', 'gåsamiddag'],
    co2e: 7,
    note: 'Ugnsstekt med skinn, ätlig del. Mårten Gås firas i Skåne den 10 november. ' + TILLAGAD,
  },
]

// ---------------------------------------------------------------------------
// Charkuterier: bacon, fläsk, skinka och pålägg
// ---------------------------------------------------------------------------

const PALAGG_PORTIONS = (skiva: number, forp: number): Array<[string, string, number]> => [
  ['skiva', `1 skiva (ca ${skiva} g)`, skiva],
  ['smorgas', `1 smörgås (3 skivor, ca ${skiva * 3} g)`, skiva * 3],
  ['forp', `1 förpackning (${forp} g)`, forp],
]

const chark: FoodSeed[] = [
  {
    id: 'bacon-stekt',
    name: 'Bacon',
    cat: 'chark',
    lmv: 1004,
    avg: true,
    kcal: 412, prot: 17, carb: 0, fat: 38.8, fiber: 0, sugar: 0, satFat: 15.2, salt: 2.4,
    raw: [0.8, 'ra'],
    portions: [
      ['skiva', '1 skiva stekt (ca 8 g)', 8],
      ['portion', '1 portion (4 skivor, ca 32 g)', 32],
      ['forp', '1 förpackning (140 g rå ≈ 110 g stekt)', 112],
    ],
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'bacon', 'gris', 'stekt bacon', 'baconskivor', 'rökt sidfläsk', 'tärnat bacon', 'baconstrimlor', 'baconbitar', 'bacontärningar',
      'knaprigt bacon', 'crispy bacon', 'bacon stekt', 'bacon rå',
    ],
    co2e: 7,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för stekt bacon, typiskt för vanliga märken (t.ex. Scan, Pärsons, ICA, ' +
      'Garant). Knaperstekt och avrunnet bacon väger mindre (140 g rått blir ca 60 g) och har ca 30 % mer energi per ' +
      '100 g, men ger ändå mindre energi totalt eftersom fett rinner av – väg det gärna rått och välj "g rå". ' + SKANNA,
  },
  {
    // Beräknat från rimmat stekfläsk (Livsmedelsverket nr 991, rått) med faktorn 0,6: allt protein
    // finns kvar (11,6 g / 0,6 ≈ 19 g per 100 g stekt), en del av fettet steks ut.
    id: 'sidflask-rimmat-stekt',
    name: 'Sidfläsk',
    cat: 'chark',
    kcal: 396, prot: 19, carb: 0, fat: 35.5, fiber: 0, sugar: 0, satFat: 13, salt: 4,
    n: {
      monoFat: 15.4, polyFat: 4.1, omega3: 0.4, cholesterol: 100,
      vitA: 5, vitD: 0.7, vitE: 0.5, thiamin: 0.4, riboflavin: 0.15, niacin: 3.5, vitB6: 0.25, folate: 2, vitB12: 0.55,
      calcium: 8, iron: 0.7, magnesium: 15, potassium: 250, phosphorus: 180, zinc: 2.2, selenium: 9, iodine: 2,
    },
    raw: [0.6, 'ra'],
    portions: [
      ['skiva', '1 skiva stekt (ca 18 g)', 18],
      ['portion', '1 portion (4 skivor, ca 70 g)', 70],
      ['forp', '1 förpackning (400 g rå ≈ 240 g stekt)', 240],
    ],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: [
      'stekt fläsk', 'fläsk', 'gris', 'sidfläsk', 'sidflask', 'rimmat fläsk', 'rimmat sidfläsk', 'saltat fläsk', 'stekfläsk',
      'färskt fläsk', 'fläsksida', 'pork belly', 'fläskbuk', 'knaperstekt fläsk', 'stekt flask', 'fläsk och löksås',
      'stekt fläsk med löksås', 'fläsk med bruna bönor', 'fläsk till ärtsoppa', 'pancetta',
    ],
    co2e: 9,
    note:
      'Stekt fläsk: knaperstekt sidfläsk utan tillsatt fett – stekflottet räknas inte. Värdena gäller rimmat (lättsaltat) ' +
      'fläsk, det vanligaste till ärtsoppa och fläsk med löksås. Färskt fläsk har mindre fett, mer protein (ca 28 g/100 g ' +
      'stekt) och bara ca 0,4 g salt/100 g.',
  },
  {
    id: 'kassler',
    name: 'Kassler',
    cat: 'chark',
    lmv: 1006,
    kcal: 106, prot: 20.7, carb: 0.5, fat: 2.2, fiber: 0, sugar: 0, satFat: 0.8, salt: 4.3,
    portions: [['portion', '1 portion (125 g)', 125], ['skiva', '1 skiva (ca 20 g)', 20]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['kassler', 'kasseler', 'rökt karré', 'rökt kotlettrad', 'ugnsbakad kassler', 'kasslerstek', 'kassler skivad', 'kassler med ananas', 'rökt fläskkarré', 'gris'],
    co2e: 5.5,
    note: 'Färdig rökt kotlettrad – kan ätas som den är eller värmas.',
  },
  {
    id: 'julskinka-kokt',
    name: 'Julskinka',
    cat: 'chark',
    kcal: 143, prot: 19.5, carb: 0.5, fat: 7, fiber: 0, sugar: 0.5, satFat: 2.5, salt: 2.5,
    n: {
      monoFat: 3.2, polyFat: 0.8, omega3: 0.08, cholesterol: 60,
      vitD: 0.4, thiamin: 0.65, riboflavin: 0.2, niacin: 4.8, vitB6: 0.35, folate: 3, vitB12: 0.7,
      calcium: 8, iron: 0.9, magnesium: 21, potassium: 300, phosphorus: 200, zinc: 2.2, selenium: 12,
    },
    portions: [['skiva', '1 skiva (ca 25 g)', 25], ['portion', '1 portion på julbordet (ca 75 g)', 75]],
    tags: ['laktosfri', 'klassiker', 'svensk'],
    syn: ['julskinka', 'kokt julskinka', 'griljerad skinka', 'griljerad julskinka', 'julskinka griljerad', 'rimmad skinka', 'jul skinka', 'julbord', 'skinka'],
    co2e: 5.5,
    note:
      'Rimmad och kokt, med fettkant. Utan fettkant ca 110 kcal/100 g. Griljering (senap, ägg och ströbröd) ger ca 25 kcal ' +
      'mer per 100 g och innehåller gluten.',
  },
  {
    id: 'skinka-rokt-palagg',
    name: 'Skinka',
    cat: 'chark',
    lmv: 1010,
    avg: true,
    kcal: 99, prot: 18.4, carb: 1.3, fat: 2.2, fiber: 0, sugar: 0.8, addedSugar: 0.8, satFat: 0.7, salt: 3.8,
    portions: PALAGG_PORTIONS(8, 120),
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'skinka', 'skinkpålägg', 'pålägg', 'smörgåsskinka', 'rökt skinka', 'rokt skinka', 'skinka rökt', 'kokt skinka',
      'skinka kokt', 'hamburgerskinka', 'tärnad skinka', 'skinktärningar', 'skinkstrimlor', 'skinka till pizza', 'pärsons skinka',
    ],
    co2e: 5.5,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för skivad rökt skinka som pålägg, typiskt för vanliga märken (t.ex. Pärsons, ' +
      'Scan, ICA). Kokt skinka har något mer fett och mindre salt. ' + SKANNA,
  },
  {
    id: 'rostbiff-palagg',
    name: 'Rostbiff',
    cat: 'chark',
    avg: true,
    kcal: 124, prot: 21.5, carb: 1, fat: 3.8, fiber: 0, sugar: 0.5, satFat: 1.55, salt: 2.0,
    n: {
      monoFat: 1.6, polyFat: 0.2, cholesterol: 60,
      vitD: 0.2, thiamin: 0.07, riboflavin: 0.2, niacin: 5.0, vitB6: 0.4, folate: 5.5, vitB12: 2.1,
      calcium: 8.5, iron: 2.25, magnesium: 24, potassium: 320, phosphorus: 200, zinc: 4.35, selenium: 7,
    },
    portions: PALAGG_PORTIONS(10, 120),
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'rostbiff', 'rostbiffpålägg', 'rostbiff skivad', 'skivad rostbiff', 'rostbiff pålägg', 'rostbiffsmörgås', 'pastrami',
      'pastramipålägg', 'pastramismörgås', 'rökt nötkött', 'pålägg nöt',
    ],
    co2e: 34,
    note:
      'Samlingsvärde: genomsnitt för skivad rostbiff och pastrami som pålägg (t.ex. Pärsons, Scan, ICA) – de har ' +
      'nästan samma värden. Hemlagad rostbiff finns under Biff. ' + SKANNA,
  },
  {
    id: 'lufttorkad-skinka',
    name: 'Lufttorkad skinka',
    cat: 'chark',
    lmv: 1008,
    kcal: 245, prot: 31.9, carb: 1.5, fat: 12.4, fiber: 0, sugar: 0, satFat: 4, salt: 4.6,
    portions: [['skiva', '1 skiva (ca 12 g)', 12], ['forp', '1 förpackning (70 g)', 70]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['serranoskinka', 'serrano', 'parmaskinka', 'prosciutto', 'jamón serrano', 'lufttorkad', 'lufttorkad skinka'],
    co2e: 8,
  },
  {
    id: 'oxbringa-rimmad-kokt',
    name: 'Oxbringa',
    cat: 'chark',
    lmv: 1042,
    kcal: 252, prot: 21.6, carb: 0, fat: 18.6, fiber: 0, sugar: 0, satFat: 8.9, salt: 3.9,
    portions: [['portion', '1 portion (125 g)', 125], ['skiva', '1 skiva (ca 30 g)', 30]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['oxbringa', 'rimmad oxbringa', 'bringa', 'corned beef', 'rimmat nötkött', 'oxbringa med rotmos'],
    co2e: 37,
    note: 'Rimmad och kokt.',
  },
  {
    id: 'flasklagg-rimmad-kokt',
    name: 'Fläsklägg',
    cat: 'chark',
    kcal: 233, prot: 21, carb: 0, fat: 16.5, fiber: 0, sugar: 0, satFat: 5.8, salt: 1.8,
    n: {
      monoFat: 7.4, polyFat: 1.9, omega3: 0.15, cholesterol: 90,
      vitD: 0.4, thiamin: 0.4, riboflavin: 0.2, niacin: 3.5, vitB6: 0.25, folate: 2, vitB12: 0.8,
      calcium: 15, iron: 1.0, magnesium: 16, potassium: 150, phosphorus: 150, zinc: 2.8, selenium: 12,
    },
    portions: [['portion', '1 portion, ätlig del (ca 175 g)', 175], ['hel', '1 hel fläsklägg, ätlig del (ca 550 g)', 550]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['fläsklägg', 'flasklagg', 'rimmad fläsklägg', 'lägg', 'grislägg', 'fläsklägg med rotmos', 'eisbein', 'kokt fläsklägg'],
    co2e: 7,
    note: 'Rimmad och kokt, kött med fett och svål men utan ben. Rotmos och senap räknas separat.',
  },
  {
    id: 'renkott-rokt-suovas',
    name: 'Suovas',
    cat: 'chark',
    lmv: 5045,
    kcal: 132, prot: 26.2, carb: 0.5, fat: 2.7, fiber: 0, sugar: 0, satFat: 1, salt: 2.8,
    portions: [['skiva', '1 skiva (ca 5 g)', 5], ['forp', '1 förpackning (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: ['suovas', 'rökt renkött', 'kallrökt renkött', 'renkött rökt', 'rökt ren', 'renpålägg', 'suovasbitar'],
    co2e: 7,
    note: 'Saltat och kallrökt renkött – en samisk specialitet. Värdena varierar med hur torrt köttet är.',
  },
  {
    id: 'kycklingpalagg',
    name: 'Kycklingpålägg',
    cat: 'chark',
    avg: true,
    kcal: 99, prot: 19.2, carb: 1.3, fat: 1.8, fiber: 0, sugar: 0.5, satFat: 0.55, salt: 2.5,
    n: {
      monoFat: 0.5, polyFat: 0.3, cholesterol: 50,
      niacin: 9.0, vitB6: 0.4, folate: 5, vitB12: 0.3,
      calcium: 10, iron: 0.5, potassium: 300, phosphorus: 200, zinc: 0.8, selenium: 12,
    },
    portions: PALAGG_PORTIONS(8, 100),
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'kycklingpålägg', 'kyckling pålägg', 'rökt kyckling', 'kycklingbröst pålägg', 'kycklingskivor', 'grillad kyckling pålägg',
      'kalkonpålägg', 'kalkon pålägg', 'rökt kalkon', 'kalkonbröst pålägg', 'kalkonskivor', 'fågelpålägg',
    ],
    co2e: 4.5,
    note:
      'Samlingsvärde: genomsnitt för rökt kyckling- och kalkonbröst som pålägg (t.ex. Pärsons, Scan, Kronfågel) – ' +
      'kalkonpålägg har nästan samma värden. ' +
      FAGELCHARK + ' ' + SKANNA,
  },

  // --- Korv -----------------------------------------------------------------
  {
    id: 'falukorv',
    name: 'Falukorv',
    cat: 'chark',
    lmv: 1488,
    avg: true,
    kcal: 240, prot: 9.1, carb: 5.1, fat: 20.6, fiber: 0, sugar: 0.7, addedSugar: 0.7, satFat: 7.7, salt: 1.6,
    portions: [
      ['portion', '1 portion (150 g)', 150],
      ['skiva', '1 skiva (ca 1 cm, 30 g)', 30],
      ['hel', '1 hel falukorv (800 g)', 800],
    ],
    tags: ['glutenfri', 'klassiker', 'svensk'],
    syn: [
      'falukorv', 'falu korv', 'korv', 'ringkorv', 'korvskivor', 'falukorv original', 'stekt falukorv', 'falukorv stekt',
      'stekt korv', 'ugnskorv', 'falukorv med makaroner', 'scan falukorv',
    ],
    co2e: 5,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för falukorv, typiskt för vanliga märken (t.ex. Scan, Pärsons, Lithells). ' +
      'Stekt falukorv har ungefär samma värden; lätt falukorv finns som egen rad. Falukorv är skyddad som garanterad ' +
      'traditionell specialitet och innehåller minst 45 % kött. ' + SKANNA,
  },
  {
    id: 'falukorv-latt',
    name: 'Lätt falukorv',
    cat: 'chark',
    avg: true,
    kcal: 158, prot: 11, carb: 6, fat: 10, fiber: 0, sugar: 1.5, satFat: 3.8, salt: 2.0,
    n: {
      monoFat: 4.4, polyFat: 1.1,
      vitD: 0.2, folate: 3, vitB12: 0.9,
      calcium: 25, iron: 0.9, potassium: 190,
    },
    portions: [
      ['portion', '1 portion (150 g)', 150],
      ['skiva', '1 skiva (ca 1 cm, 30 g)', 30],
      ['hel', '1 hel falukorv (800 g)', 800],
    ],
    tags: ['glutenfri', 'svensk'],
    syn: ['lätt falukorv', 'falukorv lätt', 'lättare falukorv', 'mager falukorv', 'lättfalukorv', 'falukorv 10 %'],
    co2e: 5,
    note: 'Samlingsvärde: genomsnitt av falukorv med ca 10 % fett (t.ex. Scan, Garant, ICA). ' + SKANNA,
  },
  {
    id: 'prinskorv',
    name: 'Prinskorv',
    cat: 'chark',
    lmv: 1516,
    avg: true,
    kcal: 268, prot: 10, carb: 3.8, fat: 24, fiber: 0, sugar: 0, satFat: 8.8, salt: 1.9,
    portions: [['st', '1 prinskorv (ca 15 g)', 15], ['portion', '1 portion (8 st)', 120]],
    tags: ['klassiker', 'svensk'],
    syn: ['prinskorv', 'prinskorvar', 'prins korv', 'cocktailkorv', 'småkorv', 'julkorv', 'stekt prinskorv'],
    co2e: 5,
    note: 'Samlingsvärde: Livsmedelsverkets värde för prinskorv, typiskt för vanliga märken (t.ex. Scan, Pärsons, Garant). ' + SKANNA,
  },
  {
    id: 'grillkorv',
    name: 'Grillkorv',
    cat: 'chark',
    lmv: 1508,
    avg: true,
    kcal: 215, prot: 11, carb: 9.2, fat: 15, fiber: 0, sugar: 1.2, addedSugar: 1, satFat: 5.8, salt: 2,
    portions: [['st', '1 grillkorv (ca 80 g)', 80], ['forp', '1 förpackning (600 g)', 600]],
    syn: ['grillkorv', 'grillkorvar', 'grill korv', 'korv', 'bbq-korv', 'fläskkorv', 'bratwurst', 'tjock korv', 'middagskorv'],
    co2e: 5,
    note: 'Samlingsvärde: Livsmedelsverkets värde för grillkorv, typiskt för vanliga märken (t.ex. Scan, Pärsons, Garant). ' + SKANNA,
  },
  {
    id: 'varmkorv-wienerkorv',
    name: 'Varmkorv',
    cat: 'chark',
    lmv: 1534,
    avg: true,
    kcal: 273, prot: 9.9, carb: 7.8, fat: 22.6, fiber: 0.8, sugar: 1.4, addedSugar: 1, satFat: 8.1, salt: 1.9,
    portions: [['st', '1 varmkorv (ca 45 g)', 45], ['stor', '1 stor korv (ca 70 g)', 70]],
    tags: ['klassiker', 'svensk'],
    syn: ['varmkorv', 'wienerkorv', 'wienerkorvar', 'wiener', 'kokt korv', 'frankfurter', 'hot dog-korv', 'korv', 'hot dog', 'korv med bröd', 'kokkorv'],
    co2e: 5,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för kokt varmkorv (wienerkorv), typiskt för vanliga märken (t.ex. Scan, ' +
      'Sibylla, Garant). Bara korven – bröd, senap och ketchup räknas separat. ' + SKANNA,
  },
  {
    id: 'isterband',
    name: 'Isterband',
    cat: 'chark',
    lmv: 1509,
    kcal: 278, prot: 11, carb: 4.6, fat: 24, fiber: 1, sugar: 1.5, addedSugar: 1.5, satFat: 9.4, salt: 0.8,
    portions: [['st', '1 isterband (ca 75 g)', 75], ['forp', '1 förpackning (4 st, ca 300 g)', 300]],
    tags: ['klassiker', 'svensk'],
    syn: ['isterband', 'isterbandskorv', 'ister band', 'småländsk korv', 'syrlig korv'],
    co2e: 5,
    note: 'Syrlig, rökt korv från Småland med fläsk, nötkött och korngryn. Steks eller grillas – värdena ändras bara lite.',
  },
  {
    id: 'varmlandskorv',
    name: 'Värmlandskorv',
    cat: 'chark',
    lmv: 1522,
    kcal: 223, prot: 6.5, carb: 8.5, fat: 18.2, fiber: 0.5, sugar: 0.3, satFat: 6.9, salt: 1.8,
    portions: [['portion', '1 portion (150 g)', 150], ['skiva', '1 skiva (ca 40 g)', 40]],
    tags: ['glutenfri', 'klassiker', 'svensk'],
    syn: ['värmlandskorv', 'varmlandskorv', 'potatiskorv', 'potatis korv', 'julkorv', 'fläskkorv'],
    co2e: 3.5,
    plate: { veg: 0.03, carb: 0.35, protein: 0.6 },
    note: 'Kokt korv av fläsk, nötkött och potatis – serveras ofta till jul med rödbetor och senap.',
  },
  {
    id: 'chorizo-matlagning',
    name: 'Chorizo',
    cat: 'chark',
    lmv: 1513,
    avg: true,
    kcal: 286, prot: 14.3, carb: 4.1, fat: 23.8, fiber: 0, sugar: 0.5, satFat: 8.6, salt: 2.7,
    portions: [['st', '1 korv (ca 70 g)', 70], ['forp', '1 förpackning (240 g)', 240]],
    syn: ['chorizo', 'chorizokorv', 'grillchorizo', 'chorizo till pasta', 'chorizo i gryta', 'spansk korv', 'stekt chorizo'],
    co2e: 6,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för stekt chorizo för matlagning (t.ex. Scan, Pärsons, Garant). ' +
      'Lufttorkad skivad chorizo liknar salami. ' + SKANNA,
  },
  {
    id: 'salami',
    name: 'Salami',
    cat: 'chark',
    lmv: 1498,
    avg: true,
    kcal: 430, prot: 16.1, carb: 0.2, fat: 41.2, fiber: 0, sugar: 0.2, addedSugar: 0.2, satFat: 15.6, salt: 3,
    portions: [
      ['skiva', '1 skiva (ca 5 g)', 5],
      ['smorgas', '1 smörgås (3 skivor)', 15],
      ['pizza', 'Topping till 1 pizza (ca 30 g)', 30],
      ['forp', '1 förpackning (80 g)', 80],
    ],
    syn: [
      'salami', 'salamikorv', 'salamipålägg', 'milanosalami', 'italiensk salami', 'salamiskivor', 'salamie', 'pepperoni',
      'pepperonikorv', 'pepperoniskivor', 'pizzasalami', 'peperonikorv', 'lufttorkad chorizo', 'chorizo skivad', 'tapas',
    ],
    co2e: 9,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för rökt salami, typiskt för vanliga märken. Pepperoni och lufttorkad ' +
      'chorizo har liknande värden. ' + SKANNA,
  },
  {
    id: 'mortadella',
    name: 'Mortadella',
    cat: 'chark',
    kcal: 302, prot: 15.5, carb: 1.5, fat: 26, fiber: 0, sugar: 1, satFat: 9.5, salt: 2.5,
    n: {
      monoFat: 11.5, polyFat: 3.0, omega3: 0.2, cholesterol: 60,
      vitD: 0.4, thiamin: 0.15, riboflavin: 0.15, niacin: 2.7, vitB6: 0.13, folate: 3, vitB12: 1.4,
      calcium: 18, iron: 1.4, magnesium: 16, potassium: 160, phosphorus: 97, zinc: 2.1, selenium: 22,
    },
    portions: PALAGG_PORTIONS(10, 100),
    syn: ['mortadella', 'mortadela', 'mortadella bologna', 'bologna', 'italiensk korvpålägg'],
    co2e: 6,
  },
  {
    id: 'salsiccia',
    name: 'Salsiccia',
    cat: 'chark',
    lmv: 1519,
    kcal: 299, prot: 21.8, carb: 7.7, fat: 20.2, fiber: 0, sugar: 0.2, satFat: 7.6, salt: 2.7,
    // Livsmedelsverkets post har askorbinsyra (tillsats) som C-vitamin – det räknas inte här.
    n: { vitC: 0 },
    raw: [0.9, 'ra'],
    portions: [['st', '1 salsiccia (ca 70 g)', 70],['forp', '1 förpackning (300 g rå ≈ 270 g stekt)', 270]],
    syn: ['salsiccia', 'salsicca', 'salsicia', 'salciccia', 'italiensk korv', 'färskkorv', 'salsicciakorv', 'salsiccia till pasta'],
    co2e: 6,
    note: 'Italiensk färskkorv av grisfärs med salt, fänkål och vitlök, stekt. Väg gärna rå om du smular ner den i en pastasås.',
  },
  {
    id: 'kebabkott',
    name: 'Kebabkött',
    cat: 'chark',
    lmv: 2056,
    avg: true,
    kcal: 248, prot: 14.3, carb: 6.2, fat: 18.6, fiber: 0, sugar: 0.6, satFat: 8.6, salt: 1.8,
    portions: [['portion', '1 portion (125 g)', 125], ['forp', '1 förpackning (400 g)', 400]],
    syn: ['kebab', 'kebabkött', 'kebabkott', 'kebab kött', 'döner', 'dönerkött', 'gyros', 'kebabskav', 'kebabstrimlor'],
    co2e: 12,
    note:
      'Samlingsvärde: Livsmedelsverkets genomsnitt för fryst, förstekt och kryddat kebabkött (ofta nöt, lamm och/eller ' +
      'kyckling) att värma i stekpanna. Varierar mycket mellan märken – ca 240–360 kcal/100 g. Bröd, sås och grönsaker ' +
      'räknas separat. ' + SKANNA,
  },
  {
    id: 'medwurst',
    name: 'Medwurst',
    cat: 'chark',
    lmv: 1497,
    kcal: 386, prot: 14.2, carb: 5.4, fat: 34.6, fiber: 0, sugar: 3.3, addedSugar: 3, satFat: 13.2, salt: 3.1,
    portions: [['skiva', '1 skiva (ca 6 g)', 6], ['smorgas', '1 smörgås (3 skivor)', 18], ['forp', '1 förpackning (100 g)', 100]],
    tags: ['svensk'],
    syn: ['medwurst', 'medvurst', 'metwurst', 'korvpålägg', 'rökt korv pålägg'],
    co2e: 9,
  },
  {
    id: 'kabanoss',
    name: 'Kabanoss',
    cat: 'chark',
    kcal: 384, prot: 22, carb: 2, fat: 32, fiber: 0, sugar: 1, satFat: 12, salt: 3.5,
    n: {
      monoFat: 14.5, polyFat: 3.5, omega3: 0.3, cholesterol: 80,
      vitD: 0.4, thiamin: 0.5, folate: 3, vitB12: 1.3,
      calcium: 15, iron: 1.4, potassium: 330, phosphorus: 200, zinc: 2.7,
    },
    portions: [['st', '1 kabanoss (ca 25 g)', 25], ['forp', '1 förpackning (200 g)', 200]],
    syn: ['kabanoss', 'kabanos', 'kabanosy', 'snackkorv', 'korvsnacks', 'torkad korv'],
    co2e: 7,
  },
  {
    id: 'kycklingkorv',
    name: 'Kycklingkorv',
    cat: 'chark',
    lmv: 5059,
    avg: true,
    kcal: 197, prot: 9.4, carb: 9.6, fat: 13.6, fiber: 0, sugar: 1.2, addedSugar: 1, satFat: 4.2, salt: 1.8,
    portions: [['st', '1 korv (ca 60 g)', 60], ['forp', '1 förpackning (400 g)', 400]],
    syn: ['kycklingkorv', 'kyckling korv', 'grillkorv kyckling', 'fågelkorv', 'kalkonkorv', 'kycklingkorvar'],
    co2e: 4,
    note:
      'Samlingsvärde: Livsmedelsverkets genomsnitt för kycklingkorv (t.ex. Kronfågel, Guldfågeln, Scan). Magrare ' +
      'varianter har ca 150 kcal/100 g. ' + FAGELCHARK + ' ' + SKANNA,
  },

  // --- Pastej, blodpudding och sylta -----------------------------------------
  {
    id: 'leverpastej',
    name: 'Leverpastej',
    cat: 'chark',
    lmv: 1474,
    avg: true,
    kcal: 292, prot: 9.5, carb: 9, fat: 24.5, fiber: 0, sugar: 3.8, addedSugar: 3.8, satFat: 7.2, salt: 2,
    portions: [['smorgas', '1 smörgås (ca 15 g)', 15], ['forp', '1 förpackning (200 g)', 200]],
    tags: ['klassiker', 'svensk'],
    syn: ['leverpastej', 'levepastej', 'pastej', 'leverpastej original', 'pastejpålägg', 'leverpastejsmörgås', 'skivbar leverpastej'],
    co2e: 4,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för vanlig bredbar leverpastej (t.ex. Pastejköket, Scan, Garant). Lätt ' +
      'leverpastej finns som egen rad. Rik på vitamin A, järn och B12 från levern. ' + SKANNA,
  },
  {
    id: 'leverpastej-latt',
    name: 'Lätt leverpastej',
    cat: 'chark',
    lmv: 1477,
    avg: true,
    kcal: 183, prot: 12, carb: 13.5, fat: 9, fiber: 0, sugar: 2.6, addedSugar: 2, satFat: 3.2, salt: 1.5,
    portions: [['smorgas', '1 smörgås (ca 15 g)', 15], ['forp', '1 förpackning (200 g)', 200]],
    tags: ['svensk'],
    syn: ['lätt leverpastej', 'leverpastej lätt', 'lättpastej', 'mager leverpastej', 'leverpastej 10 %'],
    co2e: 4,
    note:
      'Samlingsvärde: Livsmedelsverkets värde för bredbar leverpastej med ca 10 % fett, typiskt för vanliga märken ' +
      '(t.ex. Pastejköket, Scan, Garant). ' + SKANNA,
  },
  {
    id: 'blodpudding',
    name: 'Blodpudding',
    cat: 'chark',
    lmv: 1430,
    avg: true,
    kcal: 202, prot: 12, carb: 17.3, fat: 9, fiber: 2, sugar: 11.7, addedSugar: 11.7, satFat: 3.9, salt: 1,
    portions: [['portion', '1 portion (4 skivor, ca 160 g)', 160], ['skiva', '1 skiva (ca 40 g)', 40]],
    tags: ['laktosfri', 'klassiker', 'svensk'],
    syn: ['blodpudding', 'blodpuding', 'blod pudding', 'blodkorv', 'blodpudding med lingon', 'stekt blodpudding'],
    co2e: 3,
    plate: { veg: 0, carb: 0.3, protein: 0.7 },
    note:
      'Samlingsvärde: Livsmedelsverkets värde för blodpudding med ca 10 % fett, typiskt för vanliga märken. Blod, ' +
      'rågmjöl, fläskfett och sirap – fetthalten (ca 5–19 %) och järnhalten (ca 10–25 mg/100 g) varierar mellan ' +
      'märken. ' + SKANNA,
  },
  {
    id: 'sylta-pressylta',
    name: 'Sylta',
    cat: 'chark',
    lmv: 1554,
    kcal: 305, prot: 17.5, carb: 0, fat: 26.5, fiber: 0, sugar: 0, satFat: 10.2, salt: 1.6,
    portions: [['skiva', '1 skiva (ca 30 g)', 30], ['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['sylta', 'pressylta', 'julsylta', 'grissylta', 'fläsksylta'],
    co2e: 4,
    note: 'Pressylta av fläsk.',
  },
  {
    id: 'rullsylta',
    name: 'Rullsylta',
    cat: 'chark',
    lmv: 1029,
    kcal: 246, prot: 19.2, carb: 0, fat: 19, fiber: 0, sugar: 0, satFat: 8.2, salt: 3.7,
    portions: [['skiva', '1 skiva (ca 12 g)', 12], ['smorgas', '1 smörgås (3 skivor, ca 36 g)', 36], ['portion', '1 portion på julbordet (ca 50 g)', 50]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['rullsylta', 'rulsylta', 'rull sylta', 'rullad sylta', 'fläskrulle', 'julbord', 'rullsylta pålägg'],
    co2e: 5,
    note: 'Rimmat sidfläsk som rullats med kryddpeppar och lök, kokats och pressats. Serveras tunt skivad.',
  },
  {
    id: 'kalvsylta',
    name: 'Kalvsylta',
    cat: 'chark',
    lmv: 1553,
    kcal: 100, prot: 12, carb: 0.1, fat: 5.7, fiber: 0, sugar: 0, satFat: 2.3, salt: 1.5,
    portions: [['portion', '1 portion (100 g)', 100], ['skiva', '1 skiva (ca 30 g)', 30]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['kalvsylta', 'kalvsylt', 'sylta kalv', 'kalvsylta med rödbetor'],
    co2e: 10,
  },
]

// ---------------------------------------------------------------------------
// Köttbullar
// ---------------------------------------------------------------------------

const KOTTBULLE_PLATE = { veg: 0.05, carb: 0.1, protein: 0.85 }

const kottbullar: FoodSeed[] = [
  {
    id: 'kottbullar-fardiga',
    name: 'Färdiga köttbullar',
    cat: 'rott_kott',
    lmv: 1102,
    avg: true,
    kcal: 217, prot: 12.3, carb: 6.5, fat: 15.6, fiber: 1.5, sugar: 1.4, addedSugar: 1, satFat: 5.7, salt: 1.6,
    portions: [
      ['portion', '1 portion (12 st, ca 170 g)', 170],
      ['st', '1 köttbulle (ca 14 g)', 14],
      ['forp', '1 förpackning (500 g)', 500],
    ],
    tags: ['klassiker', 'svensk'],
    syn: [
      'köttbullar', 'köttbulle', 'kottbullar', 'köttbular', 'färdiga köttbullar', 'frysta köttbullar', 'kylda köttbullar',
      'swedish meatballs', 'hemlagade köttbullar', 'hemgjorda köttbullar', 'mammas köttbullar', 'frikadeller', 'frikadell',
      'soppbullar', 'kokta köttbullar', 'köttbullar i soppa', 'små köttbullar', 'scan köttbullar',
    ],
    co2e: 12,
    plate: KOTTBULLE_PLATE,
    kostrad: { rottKott: 70 },
    note:
      'Samlingsvärde: Livsmedelsverkets genomsnitt för färdiga köttbullar av nöt- och fläskkött (t.ex. Scan, Dafgårds, ' +
      'ICA, Garant). Hemlagade köttbullar har ca 180 kcal/100 g – receptet Köttbullar bland klassikerna räknar på dina ' +
      'egna mängder. ' + SKANNA,
  },
]

export const kottFagelChark = defineFoods([...notkott, ...flask, ...lamm, ...vilt, ...fagel, ...chark, ...kottbullar])
