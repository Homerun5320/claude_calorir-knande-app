/**
 * Bröd, knäckebröd, flingor, gryn, mjöl, pasta, ris och andra spannmålsprodukter.
 *
 * En rad per vardagsbegrepp så som det äts: "Knäckebröd", "Pasta", "Ris", "Granola". Värden per
 * 100 g ätlig del, i första hand enligt Livsmedelsverkets livsmedelsdatabas. Livsmedel med `lmv` är
 * samma livsmedel (samma tillagning) som Livsmedelsverkets post med det numret; näringsämnen som
 * saknas här fylls i därifrån.
 *
 * Tillagat är standard för pasta, ris, nudlar och gryn (bulgur, couscous, quinoa, matvete …). Den
 * som väger eller mäter torrt väljer "g okokt" eller "dl okokt": `raw` anger hur många gram kokt
 * vara ett gram okokt vara blir och den okokta varans densitet. Faktorn är i regel kvoten mellan
 * energin i Livsmedelsverkets okokta och kokta post, så att 100 g okokt ger samma energi som på
 * förpackningen. För pasta och korngryn har Livsmedelsverkets kokta post ovanligt mycket vatten
 * (faktor 2,8 respektive 4,3) – där är den kokta raden i stället beräknad med en vanlig viktökning
 * vid hemmakokning (2,5 respektive 3).
 *
 * Kokta rader har eget `co2e` (per kg kokt vara): klimatschablonen för pasta och ris gäller torr
 * vara och räknas bara om automatiskt när namnet säger "kokt".
 * Undantag som anges torra: havregryn, mannagryn, snabbgröt, grötris och mjöl. De används torra som
 * ingredienser (i gröt, bakning och recept – grötriset i dl i risgrynsgröt och ris à la Malta), och
 * den färdiga gröten finns som egen rad ("Havregrynsgröt på vatten", "Risgrynsgröt" …). Polenta anges
 * däremot kokt, med "g okokt"/"dl okokt" för torra majsgryn.
 *
 * Produkttyper med många märken (knäckebröd, flingor, müsli, granola, snabbnudlar …) är
 * samlingsvärden (`avg`): ett genomsnitt av vanliga märken i svenska butiker. Exakta värden för ett
 * visst märke fås genom att skanna streckkoden. Borttagna och sammanslagna id:n har alias i
 * `aliases/brod-spannmal.ts`.
 */
import { defineFoods } from './define'

const SKANNA = 'Skanna streckkoden för exakta värden för ditt märke.'

export const brodSpannmal = defineFoods([
  // ---------------------------------------------------------------------------
  // Knäckebröd, skorpor och riskakor
  // ---------------------------------------------------------------------------
  {
    id: 'knackebrod-wasa-husman', name: 'Knäckebröd', cat: 'brod', lmv: 169, avg: true,
    kcal: 345, prot: 9.5, carb: 63, fat: 2, fiber: 16.5, sugar: 1.6, satFat: 0.4, salt: 1.3,
    n: { wholegrain: 90 },
    portions: [['skiva', '1 skiva', 12], ['bit', '1 bit runt knäcke', 15], ['skiva-tunn', '1 tunn skiva', 7]],
    tags: ['vegan', 'fullkorn', 'nyckelhal', 'svensk', 'klassiker'],
    syn: [
      'knäcke', 'knäckebröd', 'knäckis', 'rågknäcke', 'hårt bröd', 'grovt knäcke', 'knäkebröd', 'knäckbröd', 'knackebrod',
      'fullkornsknäcke', 'fullkornsknäckebröd', 'knäckebröd råg fullkorn', 'husman', 'wasa husman', 'wasa', 'wasa sport',
      'sportknäcke', 'leksands', 'leksandsknäcke', 'runda', 'runt knäcke', 'rundknäcke', 'knäcke med hål', 'normalgräddat',
      'brungräddat', 'hårdgräddat knäcke', 'mörkt knäcke', 'finn crisp', 'finncrisp', 'tunt knäcke', 'pågen knäcke',
    ],
    note: `Samlingsvärde: genomsnitt av vanliga rågknäckebröd (t.ex. Wasa Husman, Wasa Sport, Leksands, Finn Crisp och Livsmedelsverkets fullkornsknäcke). ${SKANNA}`,
  },
  {
    id: 'knackebrod-wasa-frukost', name: 'Ljust knäckebröd', cat: 'brod', lmv: 180,
    kcal: 406, prot: 11, carb: 67.7, fat: 8.5, fiber: 6, sugar: 4.2, addedSugar: 4, satFat: 1.4, salt: 1,
    portions: [['skiva', '1 skiva', 12]],
    tags: ['vegetarisk', 'svensk'],
    syn: [
      'wasa frukost', 'frukostknäcke', 'knäcke', 'veteknäcke', 'ljust knäcke', 'knäcke med vallmo', 'vallmoknäcke',
      'knäckebröd frukost', 'wasa',
    ],
    note: 'Ljust veteknäcke med vallmofrön (typ Wasa Frukost).',
  },
  {
    id: 'knackebrod-glutenfritt', name: 'Glutenfritt knäckebröd', cat: 'brod', lmv: 168,
    kcal: 346, prot: 6.3, carb: 71.1, fat: 2, fiber: 7, sugar: 7.6, addedSugar: 7.6, satFat: 0.1, salt: 1.4,
    portions: [['skiva', '1 skiva', 10]],
    tags: ['glutenfri'],
    syn: ['glutenfritt knäcke', 'gf knäcke', 'knäcke glutenfritt', 'knäckebröd glutenfritt', 'celiaki'],
    note: 'Varierar mycket mellan märken (majs-, ris- eller fröbaserat).',
  },
  {
    id: 'froknacke-hembakat', name: 'Fröknäcke', cat: 'brod',
    kcal: 500, prot: 16, carb: 22, fat: 37, fiber: 11, sugar: 1, satFat: 4, salt: 1.2,
    n: {
      monoFat: 12, polyFat: 18, omega3: 4, cholesterol: 0,
      vitD: 0, vitE: 8, vitC: 0, thiamin: 0.6, folate: 60, vitB12: 0,
      calcium: 250, iron: 5, magnesium: 280, potassium: 500, zinc: 4.5,
    },
    portions: [['bit', '1 bit', 15]],
    tags: ['vegan'],
    syn: ['fröknäcke', 'fröknäckebröd', 'lchf-knäcke', 'knäcke med frön', 'nötknäcke', 'froknacke', 'fröknäcke hembakat'],
    kostrad: { notter: 70 },
    note: 'Solros-, pumpa-, sesam- och linfrön med lite majsmjöl eller havregryn och olja – hembakat eller köpt.',
  },
  {
    id: 'skorpor-vete', name: 'Skorpor', cat: 'brod', lmv: 1603,
    kcal: 419, prot: 10.3, carb: 70.7, fat: 9.2, fiber: 4.2, sugar: 9.9, addedSugar: 9.9, satFat: 1.3, salt: 0.7,
    portions: [['st', '1 skorpa', 12]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: [
      'skorpa', 'vetekorpor', 'veteskorpor', 'ljusa skorpor', 'skorpor', 'grova skorpor', 'fullkornsskorpor', 'rågskorpor',
      'fiberskorpor', 'krisprolls', 'småskorpor', 'rostade småbröd', 'rostat småbröd', 'pågen krisprolls',
    ],
    note: 'Gäller även grova skorpor och rostade småbröd (typ Krisprolls) – energin per skorpa är nästan densamma.',
  },
  {
    id: 'riskakor-naturella', name: 'Riskakor', cat: 'brod',
    kcal: 385, prot: 8, carb: 80, fat: 3, fiber: 3.5, sugar: 0.5, satFat: 0.6, salt: 0.3,
    n: {
      wholegrain: 85, vitD: 0, vitC: 0, vitB12: 0, niacin: 7.8, vitB6: 0.15, folate: 20,
      calcium: 10, iron: 1.5, magnesium: 130, potassium: 290, phosphorus: 300, zinc: 2.5,
    },
    portions: [['st', '1 riskaka', 7.5]],
    tags: ['vegan', 'glutenfri', 'fullkorn'],
    syn: ['riskaka', 'rice cakes', 'riskakor', 'riskex', 'majskakor', 'riskakor naturella'],
  },

  // ---------------------------------------------------------------------------
  // Tunnbröd och mjuka kakor
  // ---------------------------------------------------------------------------
  {
    id: 'tunnbrod-mjukt', name: 'Tunnbröd', cat: 'brod', lmv: 217,
    kcal: 280, prot: 8, carb: 52.4, fat: 3.1, fiber: 3.8, sugar: 8.4, addedSugar: 4, satFat: 0.5, salt: 1,
    portions: [
      ['st', '1 kaka (medel)', 45],
      ['st-stor', '1 stor kaka (till rulle)', 70],
      ['polarkaka', '1 rund mjuk kaka (polarkaka)', 88],
    ],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: [
      'mjukt tunnbröd', 'tunnbröd till rulle', 'tunnbröd', 'norrländskt tunnbröd', 'tunnbrod', 'tunnbröd mjukt',
      'polarkaka', 'polarkakor', 'polarbröd', 'mjuk kaka', 'mjuka kakor', 'norrländsk kaka', 'mjuk vetekaka',
    ],
    note: 'Mjukt tunnbröd och mjuka runda vetekakor (polarkakor) har ungefär samma näringsvärden.',
  },
  {
    id: 'tunnbrod-hart', name: 'Hårt tunnbröd', cat: 'brod', lmv: 216,
    kcal: 353, prot: 10.1, carb: 68.9, fat: 2.5, fiber: 5.1, sugar: 2.6, addedSugar: 0, satFat: 0.7, salt: 0.8,
    portions: [['bit', '1 bit', 10]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['hårt tunnbröd', 'spisbröd', 'tunnbröd hårt', 'knäcketunnbröd'],
  },
  {
    id: 'honokaka', name: 'Hönökaka', cat: 'brod', lmv: 204,
    kcal: 293, prot: 7.4, carb: 56.7, fat: 3.1, fiber: 3, sugar: 8.4, addedSugar: 8, satFat: 0.6, salt: 0.5,
    portions: [['st', '1 kaka', 55], ['halv', '1/2 kaka', 28]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['hönökakor', 'hönö kaka', 'hönökaka', 'platt bröd', 'tekaka', 'tekakor', 'frukostkaka', 'rund kaka'],
    note: 'Gäller även tekakor – energin är nästan densamma.',
  },

  // ---------------------------------------------------------------------------
  // Limpor, rågbröd och matbröd
  // ---------------------------------------------------------------------------
  {
    id: 'formfranska', name: 'Vitt formbröd', cat: 'brod', lmv: 3791,
    kcal: 249, prot: 8.6, carb: 44, fat: 3, fiber: 4.8, sugar: 4.4, addedSugar: 4, satFat: 0.2, salt: 1,
    portions: [['skiva', '1 skiva', 25]],
    tags: ['vegetarisk'],
    syn: [
      'franska', 'formbröd', 'formfranska', 'vitt bröd', 'toast', 'toastbröd', 'rostbröd', 'franskbröd', 'ljust bröd', 'fransk',
      'brödskiva', 'mackbröd', 'bröd', 'smörgåsbröd', 'rostat bröd', 'rostad macka', 'rostade mackor', 'rostat formbröd', 'rostad toast', 'macka',
    ],
    note: 'Rostat bröd väger ca 10 % mindre per skiva men innehåller lika mycket energi – räkna skivor.',
  },
  {
    id: 'fullkornsbrod', name: 'Fullkornsbröd', cat: 'brod',
    kcal: 240, prot: 9, carb: 38, fat: 4, fiber: 7.5, sugar: 3.5, satFat: 0.5, salt: 0.9,
    n: {
      monoFat: 2, polyFat: 1.2, omega3: 0.3, cholesterol: 0, wholegrain: 40,
      vitD: 0, vitE: 1.2, vitC: 0, thiamin: 0.2, riboflavin: 0.1, niacin: 2.5, vitB6: 0.15, folate: 40, vitB12: 0,
      calcium: 35, iron: 2.2, magnesium: 65, potassium: 250, phosphorus: 200, zinc: 1.6,
    },
    portions: [['skiva', '1 skiva', 35]],
    tags: ['vegan', 'fullkorn', 'nyckelhal'],
    syn: [
      'fullkorn', 'bröd', 'grovbröd', 'nyckelhålsbröd', 'fiberbröd', 'grovt bröd', 'matbröd', 'fullkornsbröd', 'grov macka',
      'fullkornsbrod', 'fullkornstoast', 'grovt formbröd', 'fullkornsformbröd', 'grov toast', 'formbröd fullkorn',
      'lingongrova', 'lingonbröd', 'pågen lingongrova', 'grova', 'skogaholm grova',
    ],
    note: 'Grovt formbröd eller matbröd med fullkorn (ca 40 %), t.ex. nyckelhålsmärkt bröd och Lingongrova.',
  },
  {
    id: 'grovt-brod-froer', name: 'Fröbröd', cat: 'brod', lmv: 6759,
    kcal: 270, prot: 8.7, carb: 41, fat: 5.9, fiber: 8.2, sugar: 5.8, addedSugar: 5.8, satFat: 0.5, salt: 1,
    portions: [['skiva', '1 skiva', 40]],
    tags: ['vegan', 'fullkorn'],
    syn: ['fröbröd', 'kärnbröd', 'solrosbröd', 'linfröbröd', 'grovt bröd', 'grovt bröd med frön', 'bröd med frön och kärnor'],
    kostrad: { notter: 12 },
  },
  {
    id: 'ragbrod-fullkorn', name: 'Rågbröd', cat: 'brod', lmv: 3797,
    kcal: 226, prot: 9.3, carb: 38.3, fat: 2.3, fiber: 6.5, sugar: 4.9, addedSugar: 4.9, satFat: 0.2, salt: 0.9,
    portions: [['skiva', '1 skiva', 35], ['st', '1 rågkuse (mjukt rågbröd)', 45]],
    tags: ['vegan', 'fullkorn', 'nyckelhal'],
    syn: [
      'rågbröd', 'mörkt bröd', 'grovt rågbröd', 'ragbrod', 'rågbröd fullkorn', 'rugbröd', 'rugbrød', 'pumpernickel',
      'danskt rågbröd', 'smørrebrød', 'rågsurdeg', 'rågsurdegsbröd', 'surdegsbröd råg', 'grovt surdegsbröd', 'rågkusar',
      'rågkuse', 'kusar', 'rågbullar', 'rågkaka', 'ragkusar',
    ],
    note: 'Gäller även danskt rågbröd, grovt rågsurdegsbröd och rågkusar – energin är nästan densamma.',
  },
  {
    id: 'limpa-sirap', name: 'Limpa', cat: 'brod', lmv: 3795,
    kcal: 261, prot: 7.5, carb: 47.7, fat: 2.7, fiber: 6.3, sugar: 12.7, addedSugar: 12.7, satFat: 0.2, salt: 0.9,
    portions: [['skiva', '1 skiva', 25]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['skogaholmslimpa', 'skogaholm', 'limpa', 'sirapslimpa', 'limpbröd', 'söt limpa'],
    note: 'Söt limpa med sirap (typ Skogaholmslimpa).',
  },
  {
    id: 'kavring', name: 'Kavring', cat: 'brod', lmv: 207,
    kcal: 270, prot: 5.5, carb: 47.3, fat: 4.7, fiber: 7, sugar: 10.8, addedSugar: 10.8, satFat: 0.5, salt: 0.7,
    portions: [['skiva', '1 skiva', 30]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['kavringbröd', 'skånsk kavring', 'kavringsbröd', 'mörkt sött rågbröd'],
  },
  {
    id: 'vortbrod', name: 'Vörtbröd', cat: 'brod',
    kcal: 292, prot: 7, carb: 57, fat: 3, fiber: 5, sugar: 18, addedSugar: 14, satFat: 0.9, salt: 1.0,
    n: { vitD: 0, vitC: 0, vitB12: 0, folate: 20, calcium: 30, iron: 1.8, potassium: 250 },
    portions: [['skiva', '1 skiva', 30]],
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['vörtlimpa', 'julbröd', 'vörtbrod', 'julvört', 'vört'],
  },
  {
    id: 'surdegsbrod-vete', name: 'Surdegsbröd', cat: 'brod', lmv: 6084,
    kcal: 249, prot: 7.5, carb: 49.5, fat: 1.4, fiber: 2.5, sugar: 1.8, satFat: 0.1, salt: 1.3,
    portions: [['skiva', '1 skiva', 35], ['skiva-tjock', '1 tjock skiva', 50]],
    tags: ['vegan'],
    syn: ['surdeg', 'levain', 'surdegsbröd', 'lantbröd', 'surdegsfranska', 'surdegsbrod', 'surdegsbaguette', 'brytbröd'],
    note: 'Ljust surdegsbröd av vete (levain). Grovt rågsurdegsbröd – se Rågbröd.',
  },
  {
    id: 'brod-glutenfritt-ljust', name: 'Glutenfritt bröd', cat: 'brod', lmv: 226,
    kcal: 238, prot: 1.8, carb: 47.3, fat: 3.6, fiber: 3.2, sugar: 3.7, addedSugar: 3.7, satFat: 1, salt: 1,
    portions: [['skiva', '1 skiva', 30]],
    tags: ['glutenfri', 'vegetarisk'],
    syn: ['glutenfritt bröd', 'glutenfritt formbröd', 'gf-bröd', 'celiaki', 'glutenfri toast'],
    note: 'Glutenfria bröd varierar mycket mellan märken.',
  },

  // ---------------------------------------------------------------------------
  // Frallor, baguetter och bröd till mat
  // ---------------------------------------------------------------------------
  {
    id: 'fralla-ljus', name: 'Fralla', cat: 'brod',
    kcal: 272, prot: 9, carb: 51, fat: 3, fiber: 2.5, sugar: 3, addedSugar: 2, satFat: 0.5, salt: 1.2,
    n: { vitD: 0, vitC: 0, vitB12: 0, thiamin: 0.1, folate: 25, calcium: 25, iron: 1.1, magnesium: 22, potassium: 130 },
    portions: [['st', '1 fralla', 50], ['st-liten', '1 liten fralla', 35]],
    tags: ['vegetarisk'],
    syn: ['fralla', 'frallor', 'småfranska', 'frukostfralla', 'rundstycke', 'kuvertbröd', 'ljus fralla', 'bake-off-frallor'],
  },
  {
    id: 'fralla-grov', name: 'Grov fralla', cat: 'brod',
    kcal: 258, prot: 9.5, carb: 42, fat: 4.5, fiber: 6, sugar: 3, addedSugar: 2, satFat: 0.6, salt: 1.1,
    n: { wholegrain: 30, vitD: 0, vitC: 0, vitB12: 0, folate: 35, calcium: 35, iron: 2, magnesium: 55, potassium: 230 },
    portions: [['st', '1 fralla', 60]],
    tags: ['vegetarisk', 'fullkorn'],
    syn: ['grov fralla', 'fullkornsfralla', 'grova frallor', 'rågfralla', 'fröfralla', 'grahamsbulle', 'grahamsfralla'],
  },
  {
    id: 'baguette', name: 'Baguette', cat: 'brod', lmv: 200,
    kcal: 270, prot: 8.5, carb: 53.2, fat: 1.7, fiber: 2.6, sugar: 3.6, satFat: 0.2, salt: 1,
    portions: [['bit', '1 bit (ca 10 cm)', 50], ['mini', '1 minibaguette', 60], ['hel', '1 hel baguette', 250]],
    tags: ['vegan'],
    syn: ['baguett', 'pain riche', 'långfranska', 'fransk baguette', 'franskbröd', 'minibaguette'],
  },
  {
    id: 'ciabatta', name: 'Ciabatta', cat: 'brod', lmv: 198,
    kcal: 256, prot: 8.6, carb: 50.2, fat: 1.4, fiber: 2.4, sugar: 2.3, satFat: 0.3, salt: 1.2,
    portions: [['st', '1 ciabattabröd (litet)', 90], ['skiva', '1 skiva', 30]],
    tags: ['vegan'],
    syn: ['ciabattabröd', 'italienskt bröd', 'chiabatta'],
  },
  {
    id: 'focaccia', name: 'Focaccia', cat: 'brod',
    kcal: 285, prot: 8, carb: 43, fat: 8.5, fiber: 2.5, sugar: 2, satFat: 1.2, salt: 1.4,
    n: {
      monoFat: 5.5, polyFat: 1.2, cholesterol: 0,
      vitD: 0, vitE: 1.2, vitC: 0, vitB12: 0, folate: 20, calcium: 20, iron: 1.1, magnesium: 22, potassium: 130,
    },
    portions: [['bit', '1 bit (ca 8 × 8 cm)', 70]],
    tags: ['vegan'],
    syn: ['foccacia', 'fokaccia', 'focacia', 'italienskt bröd med olivolja', 'ugnsbröd', 'långpannebröd'],
    note: 'Typiska värden för focaccia bakad med olivolja, utan pålägg.',
  },
  {
    id: 'vitloksbaguette-ugnsbakad', name: 'Vitlöksbaguette', cat: 'brod', avg: true,
    kcal: 310, prot: 7.5, carb: 42, fat: 12, fiber: 2.5, sugar: 2.5, addedSugar: 1, satFat: 5, salt: 1.3,
    n: { vitC: 0, folate: 20, calcium: 30, iron: 1.1, potassium: 130 },
    portions: [['bit', '1 bit (ca 1/6 baguette)', 30], ['hel', '1 hel baguette', 175]],
    tags: ['vegetarisk'],
    syn: ['vitlöksbröd', 'vitlöksbaguett', 'garlic bread', 'vitlöksbaguetter', 'vitloksbrod', 'frysta vitlöksbaguetter'],
    note: `Samlingsvärde: genomsnitt av vanliga frysta vitlöksbaguetter, ugnsbakade (t.ex. Dafgårds, Eldorado, ICA). ${SKANNA}`,
  },
  {
    id: 'bagel', name: 'Bagel', cat: 'brod',
    kcal: 260, prot: 10, carb: 50, fat: 1.7, fiber: 2.5, sugar: 5, addedSugar: 4, satFat: 0.3, salt: 1.1,
    n: { vitD: 0, vitC: 0, vitB12: 0, folate: 25, calcium: 20, iron: 1.4, magnesium: 25, potassium: 130 },
    portions: [['st', '1 bagel', 90]],
    tags: ['vegan'],
    syn: ['bagels', 'bagelbröd', 'bejgel'],
  },
  {
    id: 'hamburgerbrod', name: 'Hamburgerbröd', cat: 'brod', lmv: 3818,
    kcal: 290, prot: 8, carb: 47, fat: 6.7, fiber: 3.5, sugar: 7.7, addedSugar: 7.7, satFat: 0.5, salt: 0.8,
    portions: [['st', '1 bröd', 60], ['st-stor', '1 stort bröd', 85]],
    tags: ['vegetarisk'],
    syn: ['burgerbröd', 'hamburgerbullar', 'briochebröd', 'brioche', 'hamburgerbrod', 'burgerbullar'],
  },
  {
    id: 'korvbrod', name: 'Korvbröd', cat: 'brod', lmv: 194,
    kcal: 285, prot: 8.1, carb: 51.2, fat: 4.1, fiber: 4.2, sugar: 6, addedSugar: 3, satFat: 0.8, salt: 0.7,
    portions: [['st', '1 korvbröd', 40]],
    tags: ['vegetarisk', 'svensk'],
    syn: ['korvbrod', 'varmkorvbröd', 'hot dog-bröd', 'korvbrö'],
  },
  {
    id: 'pitabrod', name: 'Pitabröd', cat: 'brod', lmv: 193,
    kcal: 274, prot: 8.6, carb: 53.6, fat: 1.6, fiber: 3.4, sugar: 1.8, satFat: 0.3, salt: 1.2,
    portions: [['st', '1 pitabröd', 65], ['halv', '1/2 pitabröd', 33]],
    tags: ['vegan'],
    syn: ['pita', 'pitabrod', 'pitaficka', 'kebabbröd', 'libabröd'],
  },
  {
    id: 'naanbrod', name: 'Naanbröd', cat: 'brod',
    kcal: 290, prot: 9, carb: 48, fat: 6.5, fiber: 2, sugar: 4, addedSugar: 2.5, satFat: 1.5, salt: 1.2,
    n: { vitC: 0, folate: 20, calcium: 70, iron: 1.5, potassium: 130 },
    portions: [['st', '1 naanbröd', 100], ['halv', '1/2 naanbröd', 50]],
    tags: ['vegetarisk'],
    syn: ['naan', 'nan', 'nanbröd', 'vitlöksnaan', 'garlic naan', 'indiskt bröd'],
  },
  {
    id: 'tortilla-vete', name: 'Tortilla', cat: 'brod', lmv: 5974,
    kcal: 306, prot: 8.4, carb: 55.5, fat: 4.8, fiber: 1.8, sugar: 1.9, addedSugar: 0, satFat: 1.4, salt: 1.8,
    portions: [['st', '1 tortilla (medel, 20 cm)', 40], ['st-stor', '1 stor tortilla (25 cm)', 62], ['st-liten', '1 liten tortilla (16 cm)', 25]],
    tags: ['vegan'],
    syn: [
      'tortillabröd', 'wrap', 'wraps', 'mjukt tacobröd', 'burritobröd', 'tortillas', 'tacobröd', 'vetetortilla',
      'fullkornstortilla', 'fullkornswrap', 'grov tortilla', 'grova wraps', 'tortilla fullkorn',
    ],
    note: 'Vetetortilla. Fullkornstortillor har ungefär samma energi men mer fiber.',
  },
  {
    id: 'tortilla-majs', name: 'Majstortilla', cat: 'brod',
    kcal: 218, prot: 5.7, carb: 38, fat: 2.9, fiber: 6.3, sugar: 0.9, satFat: 0.4, salt: 0.1,
    n: {
      vitD: 0, vitC: 0, vitB12: 0, thiamin: 0.1, niacin: 1.5, folate: 5,
      calcium: 80, iron: 1.2, magnesium: 70, potassium: 180, phosphorus: 300, zinc: 1.2,
    },
    portions: [['st', '1 tortilla', 26]],
    tags: ['vegan', 'glutenfri'],
    syn: ['majstortilla', 'corn tortilla', 'tortilla majs', 'mexikanska tortillas'],
  },
  {
    id: 'tacoskal-majs', name: 'Tacoskal', cat: 'brod', lmv: 2557,
    kcal: 481, prot: 5.5, carb: 59.9, fat: 23.5, fiber: 4, sugar: 0.9, satFat: 2, salt: 0.6,
    portions: [['st', '1 tacoskal', 11]],
    tags: ['vegan', 'glutenfri'],
    syn: ['tacoskal', 'taco', 'tacos', 'hårda tacoskal', 'taco shells', 'fredagstacos'],
  },
  {
    id: 'krutonger', name: 'Krutonger', cat: 'brod', lmv: 3247,
    kcal: 415, prot: 11.9, carb: 73.5, fat: 6.6, fiber: 5.1, sugar: 2.3, addedSugar: 0, satFat: 1.5, salt: 1.8,
    portions: [['portion', '1 portion till sallad (2 msk)', 10], ['nave', '1 näve', 20]],
    tags: ['vegetarisk'],
    syn: ['krutong', 'brödkrutonger', 'croutons', 'rostade brödtärningar', 'caesarkrutonger'],
  },

  // ---------------------------------------------------------------------------
  // Gryn och gröt
  // ---------------------------------------------------------------------------
  {
    id: 'havregryn', name: 'Havregryn', cat: 'spannmal', lmv: 702,
    kcal: 375, prot: 9.5, carb: 64.1, fat: 7, fiber: 7.5, sugar: 1, satFat: 1.1, salt: 0,
    portions: [['portion', '1 portion gröt (1 dl)', 35]],
    density: 0.35,
    tags: ['vegan', 'fullkorn', 'nyckelhal', 'svensk'],
    syn: [
      'havre', 'gryn', 'oats', 'havreflingor', 'grovvalsade havregryn', 'fina havregryn', 'glutenfria havregryn',
      'havregryn glutenfria', 'grötgryn', 'havregryn fina', 'fiberhavregryn', 'fiberhavre', 'fiber havregryn',
      'havregryn med kli', 'havregryn med vetekli', 'betaglukan',
    ],
    note: 'Torra havregryn. Vanliga havregryn kan innehålla spår av vete – välj glutenfria havregryn vid celiaki (samma näringsvärden). Fiberhavregryn har lite mer fiber men samma energi.',
  },
  {
    id: 'ragflingor', name: 'Rågflingor', cat: 'spannmal', lmv: 6481,
    kcal: 323, prot: 9.2, carb: 61.1, fat: 1.5, fiber: 12.7, sugar: 2.4, satFat: 0.2, salt: 0,
    portions: [['portion', '1 portion gröt (1 dl)', 35]],
    density: 0.35,
    tags: ['vegan', 'fullkorn', 'nyckelhal', 'svensk'],
    syn: ['rågflakes', 'råggryn', 'ragflingor', 'rågflingegröt'],
  },
  {
    id: 'havregrynsgrot-vatten', name: 'Havregrynsgröt på vatten', cat: 'spannmal', lmv: 677,
    kcal: 66, prot: 1.7, carb: 11.3, fat: 1.2, fiber: 1.3, sugar: 0.2, satFat: 0.2, salt: 0.8,
    portions: [['portion', '1 portion (på 1 dl gryn)', 200], ['portion-stor', '1 stor portion (på 1,5 dl gryn)', 300]],
    density: 1.05,
    tags: ['vegan', 'fullkorn', 'svensk', 'klassiker'],
    syn: ['gröt', 'havregröt', 'frukostgröt', 'porridge', 'grot', 'havregrynsgrot', 'vattengröt', 'havregrynsgröt'],
    co2e: 0.24,
    note: 'Kokt på vatten: 1 dl havregryn (35 g) + 2 dl vatten och salt ger ca 200 g gröt.',
  },
  {
    id: 'havregrynsgrot-mellanmjolk', name: 'Havregrynsgröt på mjölk', cat: 'spannmal', lmv: 2124,
    kcal: 89, prot: 4.1, carb: 12.2, fat: 2.3, fiber: 1, sugar: 3.8, satFat: 1, salt: 0.6,
    portions: [['portion', '1 portion (på 1 dl gryn)', 240]],
    density: 1.05,
    tags: ['vegetarisk', 'fullkorn', 'svensk', 'klassiker'],
    syn: [
      'mjölkgröt', 'havregröt med mjölk', 'gröt på mjölk', 'havregrynsgröt mjölk', 'gröt på mellanmjölk', 'gröt',
      'gröt på havredryck', 'havregrynsgröt på havredryck',
    ],
    co2e: 1.1,
    kostrad: { mejeri: 85 },
    note: '1 dl havregryn + 2 dl mjölk och salt ger ca 230 g gröt. Gröt på havredryck ger ungefär samma energi.',
  },
  {
    id: 'overnight-oats', name: 'Overnight oats', cat: 'spannmal',
    kcal: 100, prot: 4.4, carb: 13.4, fat: 2.9, fiber: 1.1, sugar: 4.1, addedSugar: 0, satFat: 1.4, salt: 0.1,
    n: { wholegrain: 15 },
    portions: [['portion', '1 portion (1 dl gryn, 1 dl mjölk, 1 dl yoghurt)', 240], ['portion-liten', '1 liten burk', 150]],
    tags: ['vegetarisk', 'fullkorn'],
    syn: ['overnight oats', 'kylskåpsgröt', 'nattgröt', 'kall gröt', 'blötlagda havregryn', 'havregryn med yoghurt', 'overnightoats'],
    co2e: 1.1,
    kostrad: { mejeri: 85 },
    note: 'Hemgjord: 1 dl havregryn, 1 dl mellanmjölk och 1 dl naturell yoghurt (3 %) utan bär, frön och sötning – lägg till dem separat. Med havredryck och havregurt blir energin ungefär densamma.',
  },
  {
    id: 'snabbgrot', name: 'Snabbgröt', cat: 'spannmal', avg: true,
    kcal: 370, prot: 10.5, carb: 61.5, fat: 6.5, fiber: 8, sugar: 12, addedSugar: 8, satFat: 1.5, salt: 0.3,
    n: { wholegrain: 70 },
    portions: [['pase', '1 påse eller kopp (ca 35 g pulver)', 35]],
    tags: ['vegetarisk', 'fullkorn'],
    syn: ['grötkopp', 'portionsgröt', 'mikrogröt', 'havregrynsgröt kopp', 'oat so simple', 'quaker', 'snabbgröt', 'grötpåse'],
    note: `Samlingsvärde: genomsnitt av vanlig portionsgröt i påse eller kopp (t.ex. AXA, Quaker Oat So Simple, Garant), naturell och med smak. Värden per 100 g pulver – vatten ger ingen energi, men räkna mjölk separat. ${SKANNA}`,
  },
  {
    id: 'mannagryn', name: 'Mannagryn', cat: 'spannmal', lmv: 828,
    kcal: 351, prot: 10.1, carb: 72.1, fat: 1.3, fiber: 2.8, sugar: 0.4, satFat: 0.1, salt: 0,
    portions: [['portion', '1 portion till gröt (0,5 dl)', 33]],
    density: 0.65,
    tags: ['vegan', 'svensk'],
    syn: ['manna', 'semolina', 'vetegryn', 'mannagryn vete'],
  },
  {
    id: 'mannagrynsgrot-mellanmjolk', name: 'Mannagrynsgröt', cat: 'spannmal', lmv: 682,
    kcal: 79, prot: 4.3, carb: 11, fat: 1.8, fiber: 0.3, sugar: 4.4, satFat: 1.1, salt: 0.6,
    portions: [['portion', '1 portion', 250], ['portion-liten', '1 liten portion (barn)', 150]],
    density: 1.05,
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['mannagröt', 'semolinagröt', 'mannagrynsgrot', 'gröt', 'mannagrynsgröt på mjölk'],
    co2e: 1.1,
    kostrad: { mejeri: 85 },
    note: 'Kokt på mjölk, utan socker och sylt.',
  },
  {
    id: 'risgrynsgrot-mellanmjolk', name: 'Risgrynsgröt', cat: 'spannmal', lmv: 655,
    kcal: 86, prot: 3.2, carb: 13.3, fat: 2.1, fiber: 0.1, sugar: 3.1, satFat: 1.2, salt: 0.4,
    portions: [['portion', '1 portion', 250], ['portion-liten', '1 liten portion', 150]],
    density: 1.05,
    tags: ['vegetarisk', 'glutenfri', 'svensk', 'klassiker'],
    syn: ['julgröt', 'risgröt', 'tomtegröt', 'risgrynsgrot', 'gröt', 'risgrynsgröt på mjölk'],
    co2e: 1.5,
    kostrad: { mejeri: 75 },
    note: '1 dl grötris, 2 dl vatten och 1 liter mjölk. Utan socker, kanel och smörklick.',
  },
  {
    id: 'ris-grotris-torrt', name: 'Grötris', cat: 'pasta_ris', lmv: 2485,
    kcal: 361, prot: 6.4, carb: 80.2, fat: 0.8, fiber: 1.1, sugar: 0.2, satFat: 0.1, salt: 0,
    portions: [['portion-grot', '1 portion risgrynsgröt (0,25 dl ris)', 21], ['portion', '1 portion (0,75 dl)', 64]],
    density: 0.85,
    tags: ['vegan', 'glutenfri'],
    syn: ['grötris', 'risgryn', 'rundkornigt ris', 'ris till gröt', 'julgrötris', 'grotris'],
    co2e: 2.7,
    note: 'Torrt grötris att koka gröt på – färdig gröt finns som Risgrynsgröt. 1 dl grötris + 1 liter mjölk räcker till ca 4 portioner.',
  },
  {
    id: 'valling-fullkorn-drickfardig', name: 'Välling', cat: 'spannmal', lmv: 6257,
    kcal: 59, prot: 2.1, carb: 8.1, fat: 1.9, fiber: 0.2, sugar: 4.2, satFat: 0.4, salt: 0.1,
    portions: [['glas', '1 glas (2 dl)', 206], ['flaska', '1 flaska (2,5 dl)', 258]],
    density: 1.03,
    liquid: true,
    tags: ['vegetarisk', 'svensk', 'klassiker'],
    syn: ['välling', 'barnvälling', 'fullkornsvälling', 'flaskvälling', 'valling', 'kvällsvälling', 'havrevälling'],
    co2e: 1.1,
    note: 'Drickfärdig, osötad fullkornsvälling för barn (ca 1 år+). Välling berikas med järn, jod, kalcium och vitaminer – halterna varierar mellan märken.',
  },

  // ---------------------------------------------------------------------------
  // Flingor, müsli och granola (samlingsvärden)
  // ---------------------------------------------------------------------------
  {
    id: 'cornflakes', name: 'Cornflakes', cat: 'spannmal', lmv: 6781, avg: true,
    kcal: 378, prot: 7, carb: 83, fat: 1, fiber: 3.5, sugar: 8.5, addedSugar: 8, satFat: 0.2, salt: 1.1,
    portions: [['portion', '1 portion (30 g)', 30], ['skal', '1 skål (3 dl)', 36]],
    density: 0.12,
    tags: ['vegan'],
    syn: [
      'majsflingor', 'corn flakes', 'flingor', 'frukostflingor', 'kornflakes', 'kellogg\'s corn flakes', 'rice krispies',
      'ricekrispies', 'risflingor', 'krispies', 'rispuffar', 'puffat ris', 'special k', 'specialk', 'ris- och veteflingor',
      'lättflingor', 'specialflingor',
    ],
    note: `Samlingsvärde: genomsnitt av cornflakes och liknande lätt sötade flingor (t.ex. Kellogg's Corn Flakes, Rice Krispies, Special K, Garant, ICA). Berikade märken har extra järn, D-vitamin och B-vitaminer. ${SKANNA}`,
  },
  {
    id: 'puffat-vete-sotat', name: 'Sötade flingor', cat: 'spannmal', avg: true,
    kcal: 382, prot: 7, carb: 81, fat: 1.7, fiber: 4.5, sugar: 28, addedSugar: 28, satFat: 0.5, salt: 0.6,
    portions: [['portion', '1 portion (30 g)', 30]],
    density: 0.14,
    tags: ['vegetarisk'],
    syn: [
      'kalaspuffar', 'kalas puffar', 'frosties', 'coco pops', 'chokladflingor', 'chokladpuffar', 'chocapic', 'chokladris',
      'sockerflingor', 'frostade flingor', 'sockrade flingor', 'sockrade cornflakes', 'tigerflingor', 'frosted flakes',
      'honungspuffar', 'sockerpuffar', 'puffat vete', 'puffar', 'honey loops', 'cheerios', 'fruit loops', 'barnflingor',
    ],
    note: `Samlingsvärde: genomsnitt av vanliga sötade flingor (t.ex. Kalaspuffar, Frosties, Coco Pops, Honey Loops). Energin är nästan densamma – sockerhalten varierar mellan ca 17 och 37 %. ${SKANNA}`,
  },
  {
    id: 'havrefras', name: 'Fullkornsflingor', cat: 'spannmal', lmv: 3447, avg: true,
    kcal: 370, prot: 12, carb: 61, fat: 5.2, fiber: 15, sugar: 8, addedSugar: 6, satFat: 0.9, salt: 0.7,
    n: { wholegrain: 85 },
    portions: [['portion', '1 portion (30 g)', 30], ['skal', '1 skål (2 dl)', 45], ['st', '1 vetekaka (ca 19 g)', 19]],
    density: 0.22,
    tags: ['vegan', 'fullkorn'],
    syn: [
      'havrefras', 'havre fras', 'havrerutor', 'havrekuddar', 'havreflingor', 'frukostflingor', 'havreflakes', 'havrefleks',
      'oat flakes', 'rostade havreflingor', 'weetabix', 'vetekakor', 'weetabixkakor', 'fullkornskakor', 'vetekuddar',
      'all-bran', 'all bran', 'fiberflingor', 'kliflingor', 'fiberpinnar', 'veteklisticks', 'fullkornsvetekakor',
    ],
    note: `Samlingsvärde: genomsnitt av fullkornsflingor med lite socker (t.ex. Havrefras, havreflakes, Weetabix och All-Bran). ${SKANNA}`,
  },
  {
    id: 'musli-sotad', name: 'Müsli', cat: 'spannmal', lmv: 2032, avg: true,
    kcal: 372, prot: 9, carb: 63, fat: 6.5, fiber: 9, sugar: 16, addedSugar: 10, satFat: 1.3, salt: 0.2,
    n: { wholegrain: 60 },
    portions: [['portion', '1 portion (1 dl)', 40]],
    density: 0.4,
    tags: ['vegetarisk', 'fullkorn'],
    syn: [
      'müsli', 'musli', 'mysli', 'fruktmüsli', 'sötad müsli', 'osötad müsli', 'müsli utan socker', 'müsli med socker',
      'basmüsli', 'axa müsli', 'frebaco', 'start müsli', 'paulúns', 'pauluns',
    ],
    kostrad: { notter: 5 },
    note: `Samlingsvärde: genomsnitt av vanliga müslisorter med frukt och nötter (t.ex. AXA, Frebaco, Start!, Paulúns och Garant), med och utan tillsatt socker. Osötad müsli har ungefär samma energi men mindre socker. ${SKANNA}`,
  },
  {
    id: 'granola', name: 'Granola', cat: 'spannmal', avg: true,
    kcal: 440, prot: 9.5, carb: 57, fat: 17, fiber: 9, sugar: 17, addedSugar: 14, satFat: 3.5, salt: 0.2,
    n: {
      monoFat: 8, polyFat: 5, wholegrain: 50,
      vitD: 0, vitE: 4, vitC: 0, vitB12: 0, folate: 30, calcium: 50, iron: 3, magnesium: 110, potassium: 380, zinc: 2.3,
    },
    portions: [['portion', '1 portion (1 dl)', 45], ['portion-liten', '1 liten portion (0,5 dl)', 23]],
    density: 0.45,
    tags: ['vegetarisk', 'fullkorn'],
    syn: ['granola', 'crunchy', 'knaprig müsli', 'rostad müsli', 'crunch', 'start granola', 'paulúns granola', 'axa granola'],
    kostrad: { notter: 12 },
    note: `Samlingsvärde: genomsnitt av vanliga granolasorter (t.ex. Start!, AXA, Paulúns, ICA och Garant). ${SKANNA}`,
  },

  // ---------------------------------------------------------------------------
  // Mjöl, stärkelse, kli och ströbröd
  // ---------------------------------------------------------------------------
  {
    id: 'vetemjol', name: 'Vetemjöl', cat: 'spannmal', lmv: 1941,
    kcal: 352, prot: 8.5, carb: 72.4, fat: 1.9, fiber: 3.6, sugar: 1.6, satFat: 0.3, salt: 0,
    density: 0.6,
    tags: ['vegan', 'svensk'],
    syn: [
      'mjöl', 'vetemjol', 'ljust mjöl', 'vitt mjöl', 'mjol', 'vetemjöl special', 'bagerivetemjöl', 'starkt vetemjöl',
      'brödmjöl', 'manitoba', 'tipo 00', 'pizzamjöl',
    ],
  },
  {
    id: 'grahamsmjol', name: 'Grahamsmjöl', cat: 'spannmal', lmv: 1935,
    kcal: 336, prot: 10.7, carb: 61, fat: 2, fiber: 13.8, sugar: 1.2, satFat: 0.2, salt: 0,
    density: 0.55,
    tags: ['vegan', 'fullkorn', 'svensk'],
    syn: ['graham', 'grahamsmjol', 'fullkornsvetemjöl', 'fullkornsmjöl', 'grovt vetemjöl'],
  },
  {
    id: 'ragmjol-fullkorn', name: 'Rågmjöl', cat: 'spannmal', lmv: 1934,
    kcal: 325, prot: 8.1, carb: 59.3, fat: 1.7, fiber: 18.8, sugar: 2, satFat: 0.3, salt: 0,
    density: 0.5,
    tags: ['vegan', 'fullkorn', 'svensk'],
    syn: ['rågmjöl', 'ragmjol', 'fullkornsrågmjöl', 'råg'],
  },
  {
    id: 'ragsikt', name: 'Rågsikt', cat: 'spannmal', lmv: 6576,
    kcal: 356, prot: 8.6, carb: 71.8, fat: 1.4, fiber: 8.8, sugar: 0.6, satFat: 0.2, salt: 0,
    density: 0.55,
    tags: ['vegan', 'svensk'],
    syn: ['ragsikt', 'sikt', 'siktat rågmjöl', 'rågvetemjöl'],
    note: 'Blandning av vetemjöl och rågmjöl (ca 60/40).',
  },
  {
    id: 'dinkelmjol-siktat', name: 'Dinkelmjöl', cat: 'spannmal', lmv: 6494,
    kcal: 355, prot: 12, carb: 69.3, fat: 1.7, fiber: 5.1, sugar: 0.9, satFat: 0.3, salt: 0,
    density: 0.6,
    tags: ['vegan'],
    syn: [
      'dinkel', 'dinkelmjol', 'spelt', 'speltmjöl', 'ljust dinkelmjöl', 'fullkornsdinkel', 'grovt dinkelmjöl',
      'speltmjöl fullkorn', 'dinkel fullkorn',
    ],
    note: 'Siktat dinkelmjöl. Fullkornsdinkelmjöl har samma energi men mer fiber.',
  },
  {
    id: 'havremjol', name: 'Havremjöl', cat: 'spannmal', lmv: 6468,
    kcal: 352, prot: 11.3, carb: 59.2, fat: 4.4, fiber: 14.2, sugar: 0.8, satFat: 0.7, salt: 0,
    density: 0.45,
    tags: ['vegan', 'fullkorn'],
    syn: ['havremjol', 'malda havregryn', 'havrepulver'],
  },
  {
    id: 'potatismjol', name: 'Potatismjöl', cat: 'spannmal', lmv: 1946,
    kcal: 346, prot: 0, carb: 84.3, fat: 0.4, fiber: 0, sugar: 0, satFat: 0, salt: 0,
    portions: [['msk-redning', '1 msk (till redning)', 10]],
    density: 0.7,
    tags: ['vegan', 'glutenfri', 'svensk'],
    syn: ['potatismjol', 'potatisstärkelse', 'redning', 'stärkelse'],
  },
  {
    id: 'majsstarkelse', name: 'Majsstärkelse', cat: 'spannmal', lmv: 1945,
    kcal: 362, prot: 0, carb: 87.5, fat: 0.7, fiber: 0, sugar: 0, satFat: 0, salt: 0,
    portions: [['msk-redning', '1 msk (till redning)', 8]],
    density: 0.55,
    tags: ['vegan', 'glutenfri'],
    syn: ['maizena', 'majsena', 'majsstarkelse', 'maizenamjöl', 'cornstarch', 'majsredning'],
  },
  {
    id: 'rismjol', name: 'Rismjöl', cat: 'spannmal', lmv: 810,
    kcal: 358, prot: 5.8, carb: 80.2, fat: 0.5, fiber: 2.1, sugar: 0.2, satFat: 0.1, salt: 0,
    density: 0.6,
    tags: ['vegan', 'glutenfri'],
    syn: ['rismjol', 'glutenfritt mjöl', 'rice flour'],
  },
  {
    id: 'mjolmix-glutenfri', name: 'Glutenfri mjölmix', cat: 'spannmal', lmv: 6865,
    kcal: 336, prot: 2.8, carb: 75, fat: 0, fiber: 10.3, sugar: 3.4, addedSugar: 2, satFat: 0, salt: 0.1,
    density: 0.6,
    tags: ['vegan', 'glutenfri'],
    syn: ['glutenfri mjölmix', 'glutenfritt mjöl', 'gf mjöl', 'mjölmix', 'finax', 'celiaki', 'glutenfri bakning'],
    note: 'Ljus glutenfri mjölblandning (stärkelse, rismjöl, fiber). Varierar mellan märken.',
  },
  {
    id: 'strobrod', name: 'Ströbröd', cat: 'spannmal', lmv: 188,
    kcal: 402, prot: 10.3, carb: 65.6, fat: 8.6, fiber: 9.1, sugar: 4.7, addedSugar: 4.7, satFat: 0.8, salt: 1.1,
    density: 0.45,
    tags: ['vegetarisk'],
    syn: ['strobrod', 'panering', 'brödsmulor', 'panko', 'skorpmjöl', 'ströbrö'],
  },
  {
    id: 'vetegroddar', name: 'Vetegroddar', cat: 'spannmal', lmv: 708,
    kcal: 349, prot: 27.5, carb: 31.4, fat: 9.4, fiber: 14, sugar: 16.4, satFat: 1.6, salt: 0,
    portions: [['portion', '1 portion (2 msk)', 13]],
    density: 0.45,
    tags: ['vegan'],
    syn: ['vetegrodd', 'groddar', 'wheat germ'],
  },
  {
    id: 'vetekli', name: 'Vetekli', cat: 'spannmal', lmv: 709,
    kcal: 277, prot: 14.9, carb: 25.5, fat: 4.6, fiber: 37.5, sugar: 2.1, satFat: 0.7, salt: 0,
    portions: [['portion', '1 portion (2 msk)', 7]],
    density: 0.25,
    tags: ['vegan'],
    syn: ['kli', 'vetekli fint', 'wheat bran', 'fiber'],
  },
  {
    id: 'havrekli', name: 'Havrekli', cat: 'spannmal', lmv: 704,
    kcal: 356, prot: 15.1, carb: 48.4, fat: 7.3, fiber: 17.5, sugar: 1.2, satFat: 1.3, salt: 0,
    portions: [['portion', '1 portion (2 msk)', 12]],
    density: 0.4,
    tags: ['vegan'],
    syn: ['kli', 'oat bran', 'betaglukan', 'havrekli fint'],
    note: 'Rikt på betaglukan, en löslig fiber som kan bidra till att sänka kolesterolet.',
  },

  // ---------------------------------------------------------------------------
  // Pasta och nudlar (kokta – "g okokt" och "dl okokt" för torr vara)
  // ---------------------------------------------------------------------------
  {
    // Livsmedelsverkets kokta pasta (nr 846) motsvarar ca 2,8 gånger torrvikten – mer vatten än pasta
    // kokt enligt förpackningen (2–2,5 gånger). Värdena är nr 846 omräknade till 2,5 gånger
    // torrvikten (× 1,12); fibrer från den okokta posten (nr 845). 100 g okokt ger ca 358 kcal.
    id: 'pasta-vete-kokt', name: 'Pasta', cat: 'pasta_ris',
    kcal: 143, prot: 4.7, carb: 28.9, fat: 0.6, fiber: 1.6, sugar: 0.7, satFat: 0, salt: 0,
    n: {
      monoFat: 0.1, polyFat: 0.2, omega3: 0, cholesterol: 0, wholegrain: 0,
      vitA: 0, vitD: 0, vitE: 0.2, vitC: 0, thiamin: 0.02, riboflavin: 0.02, niacin: 1.2, vitB6: 0.02, folate: 3.4, vitB12: 0,
      calcium: 11, iron: 0.6, magnesium: 15, potassium: 78, phosphorus: 65, zinc: 0.45, selenium: 0.2, iodine: 1,
    },
    raw: [2.5, 'okokt', 0.4],
    portions: [
      ['portion', '1 portion (ca 75 g okokt)', 190],
      ['portion-liten', '1 liten portion (ca 50 g okokt)', 125],
      ['portion-stor', '1 stor portion (ca 100 g okokt)', 250],
      ['st', '1 lasagneplatta (ca 18 g okokt)', 45],
    ],
    density: 0.55,
    tags: ['vegan'],
    syn: [
      'pasta', 'kokt pasta', 'spaghetti', 'spagetti', 'penne', 'fusilli', 'farfalle', 'rigatoni', 'tagliatelle', 'linguine',
      'pastaskruvar', 'snäckor', 'durumpasta', 'okokt pasta', 'torr pasta', 'spaghetti kokt', 'kokt spaghetti', 'penne kokt',
      'pasta tillagad', 'makaroner', 'makaron', 'snabbmakaroner', 'idealmakaroner', 'hörnmakaroner', 'kokta makaroner',
      'lasagneplattor', 'lasagneplatta', 'lasagnaplattor', 'pärlcouscous', 'israelisk couscous', 'giant couscous',
      'moghrabieh', 'ptitim',
    ],
    co2e: 0.32,
    note: 'All vanlig torr pasta av durumvete (spaghetti, penne, makaroner, lasagneplattor, pärlcouscous …), kokt utan salt. 100 g okokt pasta blir ca 250 g kokt – mer ju längre den kokar. Beräknat från Livsmedelsverkets kokta pasta. Kokt i saltat vatten tillkommer ca 0,4 g salt per 100 g.',
  },
  {
    id: 'pasta-fullkorn-kokt', name: 'Fullkornspasta', cat: 'pasta_ris', lmv: 3828,
    kcal: 161, prot: 5.8, carb: 29.9, fat: 1, fiber: 3.7, sugar: 0.7, satFat: 0.1, salt: 0.4,
    raw: [2.15, 'okokt', 0.4],
    portions: [['portion', '1 portion (ca 75 g okokt)', 160]],
    density: 0.55,
    tags: ['vegan', 'fullkorn', 'nyckelhal'],
    syn: [
      'fullkornspasta', 'fullkornsspaghetti', 'fullkornsmakaroner', 'grov pasta', 'pasta fullkorn', 'kokt fullkornspasta',
      'fullkornsspaghetti kokt',
    ],
    co2e: 0.32,
    note: 'Kokt i saltat vatten.',
  },
  {
    id: 'pasta-glutenfri-kokt', name: 'Glutenfri pasta', cat: 'pasta_ris', lmv: 2521,
    kcal: 153, prot: 3.1, carb: 32.8, fat: 0.5, fiber: 1.2, sugar: 0.3, satFat: 0.3, salt: 0.2,
    raw: [2.35, 'okokt', 0.4],
    portions: [['portion', '1 portion (ca 75 g okokt)', 175]],
    density: 0.55,
    tags: ['vegan', 'glutenfri'],
    syn: ['glutenfri pasta', 'gf pasta', 'majspasta', 'rispasta', 'glutenfri spaghetti', 'kokt glutenfri pasta'],
    co2e: 0.32,
    note: 'Pasta av majs och ris, kokt i saltat vatten.',
  },
  {
    id: 'pasta-farsk-agg-kokt', name: 'Färsk pasta', cat: 'pasta_ris', lmv: 852,
    kcal: 132, prot: 5.3, carb: 22.8, fat: 1.6, fiber: 1.7, sugar: 0.5, satFat: 0.4, salt: 0.8,
    raw: [2.1, 'okokt'],
    portions: [['portion', '1 portion (125 g okokt)', 260], ['forp', '1 förpackning (250 g okokt)', 525]],
    tags: ['vegetarisk'],
    syn: ['färsk pasta', 'fresh pasta', 'färsk tagliatelle', 'äggpasta', 'fettuccine', 'pasta fresca', 'kokt färsk pasta', 'färsk pasta kokt'],
    co2e: 0.32,
    note: 'Färsk äggpasta från kyldisken, kokt.',
  },
  {
    id: 'tortellini', name: 'Tortellini', cat: 'pasta_ris', lmv: 872,
    kcal: 186, prot: 7.2, carb: 25.7, fat: 5.3, fiber: 2.6, sugar: 1.2, addedSugar: 0, satFat: 3, salt: 1,
    raw: [1.45, 'okokt'],
    portions: [['portion', '1 portion (125 g okokt)', 180], ['forp', '1 förpackning (250 g okokt)', 360]],
    tags: ['vegetarisk'],
    syn: [
      'tortellini', 'tortelloni', 'ravioli', 'fylld pasta', 'tortellini ricotta', 'tortellini ost', 'färsk fylld pasta',
      'tortellini ricotta spenat', 'tortellini med ostfyllning',
    ],
    co2e: 1.7,
    plate: { veg: 0, carb: 0.75, protein: 0.25 },
    note: 'Färsk fylld pasta med ost (tortellini, tortelloni, ravioli), kokt. En förpackning på 250 g blir ca 360 g kokt.',
  },
  {
    id: 'gnocchi', name: 'Gnocchi', cat: 'pasta_ris',
    kcal: 155, prot: 3.8, carb: 33, fat: 0.6, fiber: 2, sugar: 0.5, satFat: 0.1, salt: 1.1,
    n: { vitD: 0, vitB12: 0, folate: 10, calcium: 15, iron: 0.6, potassium: 250 },
    portions: [['portion', '1 portion', 200], ['forp', '1 förpackning (500 g)', 500]],
    tags: ['vegetarisk'],
    syn: ['potatisgnocchi', 'nyokki', 'gnocci', 'gnochi'],
    note: 'Potatisgnocchi. Vikten ändras knappt vid kokning – värdena gäller både före och efter.',
  },
  {
    id: 'pasta-roda-linser-kokt', name: 'Linspasta', cat: 'pasta_ris',
    kcal: 153, prot: 11.4, carb: 22.3, fat: 1, fiber: 4.5, sugar: 0.5, satFat: 0.14, salt: 0.01,
    n: {
      vitD: 0, vitC: 0, vitB12: 0, folate: 35,
      calcium: 20, iron: 2.8, magnesium: 35, potassium: 250, phosphorus: 140, zinc: 1.4,
    },
    raw: [2.2, 'okokt', 0.4],
    portions: [['portion', '1 portion (ca 75 g okokt)', 165]],
    density: 0.55,
    tags: ['vegan', 'glutenfri'],
    syn: [
      'linspasta', 'röd linspasta', 'pasta av röda linser', 'baljväxtpasta', 'proteinpasta', 'linsspaghetti',
      'kikärtspasta', 'bönpasta', 'kokt linspasta', 'proteinpasta kokt',
    ],
    co2e: 0.32,
    kostrad: { baljvaxter: 100 },
    note: 'Pasta av röda linser, kokt utan salt. Pasta av kikärtor eller bönor har ungefär samma energi.',
  },
  {
    id: 'aggnudlar-kokta', name: 'Nudlar', cat: 'pasta_ris', lmv: 6786,
    kcal: 121, prot: 4.2, carb: 22.8, fat: 0.8, fiber: 2.3, sugar: 0.3, satFat: 0.1, salt: 0.1,
    raw: [3.1, 'okokt'],
    portions: [['portion', '1 portion (ca 60 g okokt)', 185]],
    tags: ['vegetarisk'],
    syn: [
      'nudlar', 'äggnudlar', 'wokknudlar', 'egg noodles', 'kinesiska nudlar', 'aggnudlar', 'kokta nudlar', 'äggnudlar kokta',
      'risnudlar', 'rice noodles', 'risvermicelli', 'pad thai-nudlar', 'pad thai nudlar', 'vermicelli', 'bánh phở',
      'kokta risnudlar', 'glasnudlar', 'udon', 'udonnudlar',
    ],
    co2e: 0.32,
    note: 'Äggnudlar kokta utan salt. Risnudlar och glasnudlar ger ungefär samma energi (risnudlar är glutenfria).',
  },
  {
    id: 'snabbnudlar-okokta', name: 'Snabbnudlar', cat: 'pasta_ris', avg: true,
    kcal: 445, prot: 9.5, carb: 60, fat: 18, fiber: 2.5, sugar: 3, addedSugar: 1.5, satFat: 8, salt: 4,
    n: { vitD: 0, vitC: 0, vitB12: 0, calcium: 20, iron: 1.4, potassium: 180 },
    portions: [['paket', '1 paket (85 g)', 85], ['kopp', '1 kopp/bägare (65 g)', 65]],
    syn: [
      'snabbnudlar', 'instant noodles', 'ramen', 'koppnudlar', 'cup noodles', 'nudlar med smak', 'snabbnudlar torra',
      'nudelsoppa', 'nudlar i soppa', 'samyang', 'nissin', 'mama', 'yum yum', 'koka noodles',
    ],
    note: `Samlingsvärde: genomsnitt av vanliga snabbnudlar med kryddpåse (t.ex. Nissin, Samyang, Mama, Yum Yum). Värden per 100 g torra nudlar inklusive kryddpåse – logga hela paketet, vattnet ger ingen energi. Häller du av vattnet blir det mindre salt. ${SKANNA}`,
  },

  // ---------------------------------------------------------------------------
  // Ris (kokt – "g okokt" och "dl okokt" för torrt ris)
  // ---------------------------------------------------------------------------
  {
    id: 'ris-langkornigt-kokt', name: 'Ris', cat: 'pasta_ris', lmv: 2515,
    kcal: 119, prot: 2.7, carb: 25.9, fat: 0.3, fiber: 0.3, sugar: 0.1, satFat: 0.1, salt: 0.5,
    raw: [3.0, 'okokt', 0.85],
    portions: [
      ['portion', '1 portion (ca 60 g okokt)', 180],
      ['portion-liten', '1 liten portion (ca 40 g okokt)', 120],
      ['portion-stor', '1 stor portion (ca 90 g okokt)', 270],
    ],
    density: 0.7,
    tags: ['vegan', 'glutenfri'],
    syn: [
      'ris', 'kokt ris', 'vitt ris', 'ris kokt', 'kokt vitt ris', 'långkornigt ris', 'long grain', 'okokt ris', 'torrt ris',
      'jasminris', 'jasmin', 'thailändskt ris', 'doftris', 'thairis', 'basmatiris', 'basmati', 'indiskt ris', 'parboiled',
      'parboiled ris', 'förångat ris', 'kokfast ris', 'snabbris', 'boil in bag', 'risottoris', 'arborio', 'arborioris',
      'avorioris', 'carnaroli', 'sushiris', 'vildris', 'wild rice', 'indianris', 'ris och vildris',
    ],
    co2e: 0.95,
    note: 'Genomsnitt av vitt ris (långkornigt, jasmin, basmati och parboiled) kokt i saltat vatten – energin per gram okokt ris är densamma för alla sorter. 1 dl okokt ris (85 g) blir ca 255 g kokt. Risotto med buljong, smör och parmesan ger betydligt mer energi.',
  },
  {
    id: 'ris-fullkorn-kokt', name: 'Fullkornsris', cat: 'pasta_ris', lmv: 2517,
    kcal: 138, prot: 3.6, carb: 27.3, fat: 1.1, fiber: 1.6, sugar: 0.2, satFat: 0.2, salt: 0.7,
    raw: [2.65, 'okokt', 0.85],
    portions: [['portion', '1 portion (ca 70 g okokt)', 180], ['portion-liten', '1 liten portion', 120]],
    density: 0.7,
    tags: ['vegan', 'glutenfri', 'fullkorn', 'nyckelhal'],
    syn: ['fullkornsris', 'råris', 'brunt ris', 'naturris', 'brown rice', 'kokt fullkornsris', 'kokt råris', 'brunt ris kokt'],
    co2e: 1.0,
    note: 'Kokt i saltat vatten.',
  },

  // ---------------------------------------------------------------------------
  // Övriga gryn: bulgur, couscous, quinoa, matvete, korn, hirs, bovete, polenta
  // ---------------------------------------------------------------------------
  {
    id: 'bulgur-kokt', name: 'Bulgur', cat: 'pasta_ris', lmv: 3564,
    kcal: 113, prot: 4.1, carb: 20.7, fat: 0.6, fiber: 3.8, sugar: 0.3, satFat: 0.1, salt: 0,
    raw: [3.1, 'okokt', 0.65],
    portions: [['portion', '1 portion (ca 50 g okokt)', 155]],
    density: 0.75,
    tags: ['vegan', 'fullkorn'],
    syn: ['bulgur', 'bulgurvete', 'bulgor', 'bulghur', 'krossat vete', 'kokt bulgur', 'bulgursallad'],
    co2e: 0.32,
    note: 'Fullkornsbulgur kokt utan salt.',
  },
  {
    id: 'couscous-tillagad', name: 'Couscous', cat: 'pasta_ris', lmv: 832,
    kcal: 108, prot: 3.8, carb: 21.8, fat: 0.2, fiber: 1.4, sugar: 0.2, satFat: 0, salt: 0,
    raw: [3.35, 'okokt', 0.72],
    portions: [['portion', '1 portion (ca 60 g okokt)', 200]],
    density: 0.6,
    tags: ['vegan'],
    syn: [
      'couscous', 'cous cous', 'kuskus', 'cuscus', 'kokt couscous', 'cous cous tillagad',
    ],
    co2e: 0.32,
    note: 'Tillagad med kokande vatten, utan fett och salt. Pärlcouscous är pasta och finns under Pasta.',
  },
  {
    id: 'quinoa-kokt', name: 'Quinoa', cat: 'pasta_ris',
    kcal: 117, prot: 4.4, carb: 18.5, fat: 1.9, fiber: 2.8, sugar: 0.9, satFat: 0.23, salt: 0.01,
    n: {
      monoFat: 0.5, polyFat: 1.08, omega3: 0.08, cholesterol: 0,
      vitD: 0, vitE: 0.6, vitC: 0, thiamin: 0.1, riboflavin: 0.11, niacin: 0.4, vitB6: 0.12, folate: 42, vitB12: 0,
      calcium: 17, iron: 1.5, magnesium: 64, potassium: 172, phosphorus: 152, zinc: 1.1, selenium: 2.8,
    },
    raw: [3.05, 'okokt', 0.75],
    portions: [['portion', '1 portion (ca 55 g okokt)', 165]],
    density: 0.75,
    tags: ['vegan', 'glutenfri', 'fullkorn'],
    syn: ['quinoa', 'kinoa', 'quinua', 'mjölmålla', 'kokt quinoa'],
    co2e: 0.32,
    note: 'Kokt utan salt.',
  },
  {
    id: 'matvete-kokt', name: 'Matvete', cat: 'pasta_ris', lmv: 6145,
    kcal: 178, prot: 4.5, carb: 33.5, fat: 0.7, fiber: 9.3, sugar: 0.4, satFat: 0.1, salt: 0.4,
    raw: [2.0, 'okokt', 0.8],
    portions: [['portion', '1 portion (ca 65 g okokt)', 130]],
    density: 0.75,
    tags: ['vegan', 'svensk'],
    syn: ['matvete', 'vetekärnor', 'durumvete', 'mat vete', 'förkokt vete', 'kokt matvete'],
    co2e: 0.32,
    note: 'Kokt i saltat vatten.',
  },
  {
    id: 'mathavre', name: 'Mathavre', cat: 'pasta_ris', lmv: 6146,
    kcal: 199, prot: 5.8, carb: 33.1, fat: 3, fiber: 7.8, sugar: 0.4, satFat: 0.5, salt: 0.4,
    n: { wholegrain: 51 },
    raw: [1.9, 'okokt', 0.75],
    portions: [['portion', '1 portion (ca 65 g okokt)', 125]],
    density: 0.75,
    tags: ['vegan', 'fullkorn', 'svensk'],
    syn: ['mathavre', 'havreris', 'havrekärnor', 'kokt havre', 'hel havre'],
    co2e: 0.32,
    note: 'Hela havrekärnor som tillbehör i stället för ris, kokta i saltat vatten. Innehåller betaglukan.',
  },
  {
    id: 'korngryn-kokta', name: 'Korngryn', cat: 'pasta_ris',
    kcal: 117, prot: 3.1, carb: 21.8, fat: 1, fiber: 3.6, sugar: 0.3, satFat: 0.2, salt: 0,
    n: { wholegrain: 33 },
    raw: [3.0, 'okokt', 0.8],
    portions: [['portion', '1 portion (ca 65 g okokt)', 195]],
    density: 0.75,
    tags: ['vegan', 'svensk'],
    syn: ['korngryn', 'pärlgryn', 'pärlkorn', 'korn', 'matkorn', 'kornris', 'kokta korngryn', 'kokt korn', 'kornotto'],
    co2e: 0.32,
    note: 'Kokta utan salt med 2–2,5 delar vatten (beräknat från Livsmedelsverkets okokta korngryn). Livsmedelsverkets kokta korngryn har mer vatten och därför lägre energi, ca 80 kcal per 100 g – räknat per gram okokt blir det samma. Korn innehåller betaglukan, en löslig fiber som kan bidra till att sänka kolesterolet.',
  },
  {
    id: 'hirs-kokt', name: 'Hirs', cat: 'pasta_ris', lmv: 834,
    kcal: 97, prot: 2.9, carb: 18.9, fat: 0.8, fiber: 0.9, sugar: 0.2, satFat: 0.2, salt: 0.6,
    raw: [3.6, 'okokt', 0.85],
    portions: [['portion', '1 portion (ca 50 g okokt)', 180]],
    density: 0.75,
    tags: ['vegan', 'glutenfri', 'fullkorn'],
    syn: ['hirs', 'hirsgryn', 'millet', 'kokt hirs'],
    co2e: 0.32,
    note: 'Kokt i saltat vatten.',
  },
  {
    id: 'bovete-kokt', name: 'Bovete', cat: 'pasta_ris',
    kcal: 92, prot: 3.4, carb: 17.2, fat: 0.6, fiber: 2.7, sugar: 0.9, satFat: 0.13, salt: 0.01,
    n: {
      monoFat: 0.18, polyFat: 0.18, cholesterol: 0,
      vitD: 0, vitC: 0, thiamin: 0.04, riboflavin: 0.04, niacin: 0.9, vitB6: 0.08, folate: 14, vitB12: 0,
      calcium: 7, iron: 0.8, magnesium: 51, potassium: 88, phosphorus: 70, zinc: 0.6, selenium: 2.2,
    },
    raw: [3.85, 'okokt', 0.7],
    portions: [['portion', '1 portion (ca 50 g okokt)', 190]],
    density: 0.7,
    tags: ['vegan', 'glutenfri', 'fullkorn'],
    syn: ['bovete', 'bovetegryn', 'buckwheat', 'kasha', 'kokt bovete'],
    co2e: 0.32,
    note: 'Kokt utan salt.',
  },
  {
    // Faktorn 5,1 är kvoten mellan energin i Livsmedelsverkets torra (nr 6872) och kokta (nr 835) polenta.
    id: 'polenta-kokt', name: 'Polenta', cat: 'pasta_ris', lmv: 835,
    kcal: 68, prot: 1.7, carb: 13.4, fat: 0.4, fiber: 1.4, sugar: 0.1, satFat: 0.1, salt: 0.6,
    raw: [5.1, 'okokt', 0.75],
    portions: [['portion', '1 portion (ca 50 g okokt)', 250]],
    density: 1.0,
    tags: ['vegan', 'glutenfri'],
    syn: ['kokt polenta', 'polenta', 'majsgröt', 'polentagryn', 'majsgryn', 'torr polenta', 'corn grits'],
    co2e: 0.16,
    note: '1 del majsgryn + 4 delar lätt saltat vatten, utan smör och ost. Väger du torra majsgryn väljer du "g okokt".',
  },
])
