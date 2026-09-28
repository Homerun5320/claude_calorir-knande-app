/**
 * Fisk och skaldjur.
 *
 * Grova linjer: en rad per vardagsbegrepp så som det äts ("Lax", "Torsk", "Räkor"). Arter med
 * nästan samma näringsvärde delar rad (kolja, kummel och rödspätta räknas som torsk, alaska pollock
 * som sej) – sökorden och anteckningen talar om vilka som ingår.
 *
 * Tillagat är standard: fisk, bläckfisk, jätteräkor och pilgrimsmusslor anges tillagade
 * (ugnsbakade, kokta eller stekta utan panering). Väger man fisken rå väljer man "g rå" – `raw`
 * anger hur mycket tillagad fisk ett gram rå fisk blir (ca 0,8–0,85; bläckfisk krymper mer).
 * För fet fisk (lax, regnbåge, hälleflundra, havsabborre, strömming, makrill, tonfisk) kommer
 * faktorerna från Livsmedelsverkets råa och tillagade poster för samma fisk (protein och energi per
 * 100 g). För mager vit fisk och insjöfisk används en typisk viktförlust på ca 20 % vid ugnsbakning
 * eller stekning. Ostron äts råa och anges så.
 *
 * Samlingsvärden (`avg`): produkter med många märken – fiskpinnar, panerad fisk, fiskbullar,
 * kaviar, inlagd sill, makrill i tomatsås m.fl. – anges som genomsnittet av vanliga märken i
 * svenska butiker (näringsdeklarationer hos ICA, september 2026). Exakta värden för ett visst märke
 * fås med streckkodsläsaren.
 *
 * Livsmedel med `lmv` är samma livsmedel (samma tillagning) som i Livsmedelsverkets databas och har
 * dess värden för energi och makronäringsämnen; övriga näringsämnen fylls i därifrån. Livsmedel
 * utan `lmv` är beräknade från Livsmedelsverkets råa poster och tillagningsfaktorn.
 *
 * Fet fisk (lax, sill, strömming, makrill) är en av få naturliga källor till vitamin D och
 * långkedjiga omega-3-fettsyror. Mager havsfisk (torsk, kolja, sej) ger mycket jod och selen.
 *
 * Klimat (co2e, kg CO2e/kg): ungefärliga värden från svenska källor (RISE m.fl.), för tillagad fisk
 * omräknade till tillagad vikt. Trålfångade skaldjur (räkor, havskräftor) har högt avtryck,
 * musslor, sill och strömming mycket lågt.
 */
import { defineFoods, type FoodSeed } from './define'

// ---------------------------------------------------------------------------
// Gemensamma texter och portioner
// ---------------------------------------------------------------------------

const LISTERIA =
  'Gravid? Livsmedelsverket avråder från kallrökt och gravad fisk under graviditeten på grund av risk för listeria.'
const OSTERSJON =
  'Fet fisk från Östersjön kan innehålla dioxiner och PCB. Barn, unga och kvinnor i barnafödande ålder bör äta den högst 2–3 gånger per år (Livsmedelsverket).'
const KVICKSILVER =
  'Kan innehålla kvicksilver. Gravida och ammande bör begränsa eller undvika den här fisken – se Livsmedelsverkets råd om fisk.'
/** Vägledning för tillagade rader med `raw`. */
const RA_VIKT = 'Vägde du fisken rå? Välj "g rå" så räknar Lagom om till tillagad vikt.'

/** Samlingsvärde: förklaringen som visas i rutan "Samlingsvärde" på detaljsidan. */
const samling = (brands: string, extra = ''): string =>
  `Samlingsvärde: genomsnitt av vanliga märken (t.ex. ${brands}).${extra ? ` ${extra}` : ''} Skanna streckkoden för exakta värden för ditt märke.`

/** Tillagad fiskfilé: 1 portion ≈ 125–140 g rå fisk. */
const TILLAGAD: Array<[string, string, number]> = [
  ['portion', '1 portion (110 g)', 110],
  ['bit', '1 fryst bit, tillagad (ca 80 g)', 80],
]

// ---------------------------------------------------------------------------
// Lax och andra laxfiskar, rom
// ---------------------------------------------------------------------------

const laxfiskar: FoodSeed[] = [
  {
    id: 'lax-odlad-ugnsbakad',
    name: 'Lax',
    cat: 'fisk',
    lmv: 1317,
    kcal: 246, prot: 23.7, carb: 0.8, fat: 16.6, fiber: 0, sugar: 0, addedSugar: 0, satFat: 2.2, salt: 0.8,
    raw: [0.85, 'ra'],
    portions: [
      ['portion', '1 portion (110 g)', 110],
      ['bit', '1 laxbit, tillagad (ca 95 g)', 95],
      ['sashimi', '1 bit sashimi (15 g rå)', 13],
    ],
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: [
      'laxfilé', 'laxfile', 'ugnsbakad lax', 'ugnslax', 'lax i ugn', 'kokt lax', 'pocherad lax', 'ångad lax', 'stekt lax',
      'grillad lax', 'odlad lax', 'norsk lax', 'atlantlax', 'vildlax', 'vild lax', 'rå lax', 'laxrygg', 'laxsida',
      'sushilax', 'sashimi', 'laxsashimi', 'lax på burk', 'laxkonserv',
    ],
    co2e: 4.1,
    note: `Tillagad odlad lax – ugnsbakad, kokt eller stekt utan panering, lätt saltad. Laxen tappar ca 15 % i vikt. ${RA_VIKT} Vildfångad lax är något magrare, och lax på burk (rosa lax) betydligt magrare – ca 140 kcal per 100 g.`,
  },
  {
    id: 'lax-varmrokt',
    name: 'Varmrökt lax',
    cat: 'fisk',
    lmv: 1288,
    kcal: 220, prot: 21.9, carb: 0.1, fat: 14.8, fiber: 0, sugar: 0, addedSugar: 0, satFat: 2, salt: 1.6,
    portions: [['bit', '1 bit (ca 125 g)', 125], ['portion', '1 portion (100 g)', 100], ['smorgas', 'på en smörgås (30 g)', 30]],
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'rökt lax', 'varmrökt laxfilé', 'ugnsrökt lax', 'laxbit rökt', 'varmrökt regnbåge', 'rökt regnbåge', 'rökt laxöring',
      'rökt öring', 'varmrökt fisk',
    ],
    co2e: 5.0,
    note: 'Varmrökt regnbåge och röding är något magrare (ca 160 kcal per 100 g).',
  },
  {
    id: 'lax-kallrokt',
    name: 'Kallrökt lax',
    cat: 'fisk',
    lmv: 1269,
    kcal: 173, prot: 20, carb: 1.3, fat: 9.8, fiber: 0, sugar: 0, addedSugar: 0, satFat: 1.4, salt: 2.8,
    portions: [['skiva', '1 skiva', 15], ['portion', '1 portion (50 g)', 50], ['forp', '1 förpackning (200 g)', 200]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['rökt lax', 'rökt laxfilé', 'laxskivor', 'skivad lax', 'lax skivad', 'smoked salmon', 'kallrökt regnbåge'],
    co2e: 5.0,
    note: LISTERIA,
  },
  {
    id: 'lax-gravad',
    name: 'Gravad lax',
    cat: 'fisk',
    lmv: 1285,
    kcal: 166, prot: 18.8, carb: 3.1, fat: 8.7, fiber: 0, sugar: 1.3, addedSugar: 1, satFat: 1.2, salt: 2.9,
    portions: [['skiva', '1 skiva', 15], ['portion', '1 portion (75 g)', 75], ['forp', '1 förpackning (200 g)', 200]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['gravlax', 'gravade laxskivor', 'gravlaxskivor', 'gravad laxfilé', 'gravlachs', 'gravad regnbåge'],
    co2e: 5.0,
    note: `Utan gravlaxsås. ${LISTERIA}`,
  },
  {
    id: 'regnbage-roding',
    name: 'Regnbåge eller röding',
    cat: 'fisk',
    lmv: 1308,
    kcal: 191, prot: 22.2, carb: 0, fat: 11.5, fiber: 0, sugar: 0, addedSugar: 0, satFat: 2.6, salt: 1,
    raw: [0.85, 'ra'],
    portions: [['portion', '1 portion (110 g)', 110], ['bit', '1 bit, tillagad (ca 95 g)', 95]],
    tags: ['glutenfri', 'laktosfri', 'svensk', 'nyckelhal'],
    syn: [
      'regnbåge', 'regnbåg', 'regnbage', 'regnbågslax', 'regnbågsfilé', 'laxöring', 'öring', 'röding', 'roding',
      'fjällröding', 'rödingfilé', 'arctic char',
    ],
    co2e: 4.1,
    note: `Tillagad (kokt, ugnsbakad eller stekt), lätt saltad. Odlad röding har nästan samma näringsvärde som regnbåge. ${RA_VIKT}`,
  },
  {
    id: 'lojrom',
    name: 'Löjrom',
    cat: 'fisk',
    lmv: 1382,
    kcal: 126, prot: 24.5, carb: 1.5, fat: 2.3, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.4, salt: 4.2,
    portions: [['portion', '1 portion till förrätt (30 g)', 30], ['toast', 'på en toast (15 g)', 15], ['burk', '1 burk (100 g)', 100]],
    density: 1.05,
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: [
      'lojrom', 'kalix löjrom', 'siklöja', 'siklöjerom', 'rom', 'löjromstoast', 'vendace roe', 'laxrom', 'ketarom',
      'laxkaviar', 'ikura', 'torskrom', 'kokt torskrom',
    ],
    co2e: 3.0,
    note: 'Saltad rom från siklöja. Kalix löjrom har skyddad ursprungsbeteckning (SUB). Laxrom (ketarom) är fetare, ca 250 kcal per 100 g. Kokt torskrom har ungefär samma energi men mycket mindre salt.',
  },
  {
    id: 'stenbitsrom',
    name: 'Stenbitsrom',
    cat: 'fisk',
    lmv: 1381,
    kcal: 84, prot: 10.6, carb: 2.5, fat: 3.4, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.6, salt: 4.4,
    portions: [['portion', '1 portion (20 g)', 20]],
    density: 1.05,
    tags: ['glutenfri', 'laktosfri'],
    syn: ['svart rom', 'röd rom', 'stenbit', 'lumpfish', 'kaviar svart', 'rom i burk', 'stenbitsrom svart'],
    co2e: 3.0,
    note: 'Färgad, saltad rom av stenbit.',
  },
]

// ---------------------------------------------------------------------------
// Mager havsfisk (vit fisk) och plattfisk
// ---------------------------------------------------------------------------

const vitFisk: FoodSeed[] = [
  {
    id: 'torsk-kokt',
    name: 'Torsk',
    cat: 'fisk',
    kcal: 98, prot: 22.8, carb: 0, fat: 0.6, fiber: 0, sugar: 0, satFat: 0.1, salt: 0.25,
    n: {
      monoFat: 0.1, polyFat: 0.25, omega3: 0.25, cholesterol: 60,
      vitA: 3, vitD: 2.3, vitE: 0.9, vitC: 0, thiamin: 0.05, riboflavin: 0.06, niacin: 6.9, vitB6: 0.14,
      folate: 14, vitB12: 1.8,
      calcium: 15, iron: 0.12, magnesium: 34, potassium: 500, phosphorus: 270, zinc: 0.75, selenium: 34, iodine: 225,
    },
    raw: [0.8, 'ra'],
    portions: [...TILLAGAD, ['file', '1 liten filé, t.ex. rödspätta (ca 60 g)', 60]],
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: [
      'torskfilé', 'torskfile', 'torskrygg', 'torskbit', 'skrei', 'kokt torsk', 'ugnsbakad torsk', 'torsk i ugn',
      'ugnstorsk', 'stekt torsk', 'vit fisk', 'fiskfilé', 'kolja', 'koljafilé', 'kummel', 'hake', 'långa', 'rödspätta',
      'spätta', 'flundra', 'plattfisk', 'sjötunga', 'piggvar', 'marulk', 'havskatt', 'pangasius', 'tilapia', 'vitling',
      'rå torsk',
    ],
    co2e: 3.7,
    note: `Tillagad utan salt och fett (kokt, ugnsbakad eller stekt). Gäller även annan mager vit fisk – kolja, kummel, långa, vitling, sjötunga, piggvar, havskatt och tilapia har nästan samma näringsvärde; rödspätta, marulk och pangasius är något magrare. Fisken tappar ca 20 % i vikt i ugnen eller pannan – kokt eller ångkokt fisk tappar mer (upp till 40 %), så väger du tillagad fisk blir värdena då något för låga. ${RA_VIKT}`,
  },
  {
    id: 'sej-ugnsbakad',
    name: 'Sej',
    cat: 'fisk',
    kcal: 102, prot: 23.9, carb: 0, fat: 0.6, fiber: 0, sugar: 0, satFat: 0.1, salt: 0.25,
    n: {
      monoFat: 0.12, polyFat: 0.25, omega3: 0.12, cholesterol: 73,
      vitA: 4.3, vitD: 0.2, vitE: 1.1, vitC: 0, thiamin: 0.11, riboflavin: 0.2, niacin: 7.3, vitB6: 0.21,
      folate: 18, vitB12: 3.9,
      calcium: 15, iron: 0.38, magnesium: 39, potassium: 525, phosphorus: 300, zinc: 0.75, selenium: 35, iodine: 160,
    },
    raw: [0.8, 'ra'],
    portions: TILLAGAD,
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: [
      'sejfilé', 'sejfile', 'gråsej', 'saithe', 'ugnsbakad sej', 'kokt sej', 'ugnssej', 'alaska pollock', 'alaskapollock',
      'alaskasej', 'pollock', 'polarsej', 'fryst vit fisk',
    ],
    co2e: 2.5,
    note: `Tillagad utan salt och fett. Gäller även alaska pollock (alaskasej), som ofta säljs fryst. Fisken tappar ca 20 % i vikt i ugnen – kokt fisk tappar mer. ${RA_VIKT}`,
  },
  {
    id: 'fiskfile-panerad-fryst',
    name: 'Panerad fisk',
    cat: 'fisk',
    avg: true,
    kcal: 214, prot: 12.2, carb: 18.2, fat: 10.1, fiber: 0.8, sugar: 0.6, satFat: 0.8, salt: 0.76,
    n: {
      monoFat: 5.6, polyFat: 3.0, omega3: 0.8, cholesterol: 30,
      vitD: 0.8, vitE: 1.9, vitC: 0, folate: 10, vitB12: 0.9,
      calcium: 20, iron: 0.5, potassium: 260, phosphorus: 170, selenium: 20, iodine: 60,
    },
    portions: [['bit', '1 bit (ca 100 g)', 100], ['portion', '1 portion (150 g)', 150]],
    syn: [
      'panerad torsk', 'panerad torskfilé', 'panerad sej', 'panerad alaska pollock', 'panerade fiskfiléer', 'frysta fiskfiléer',
      'sprödbakad fisk', 'sprödpanerad torsk', 'ugnspanerad fisk', 'crispy fish', 'fish & crisp', 'findus panerad fisk',
      'friterad fisk', 'fisk i frityr', 'frityrfisk', 'fish and chips', 'fish & chips', 'battered fish', 'hemmapanerad fisk',
    ],
    co2e: 2.5,
    plate: { veg: 0, carb: 0.3, protein: 0.7 },
    kostrad: { fisk: 65 },
    note: samling(
      'Findus, ICA och ICA Basic',
      'Förstekta, frysta panerade fiskfiléer som de säljs. Hemlagad panerad torsk har mer fisk och mindre panering – ca 190 kcal och 21 g protein per 100 g.',
    ),
  },
  {
    id: 'rodspatta-panerad-stekt',
    name: 'Panerad rödspätta',
    cat: 'fisk',
    lmv: 1323,
    kcal: 169, prot: 15.1, carb: 6.4, fat: 9.1, fiber: 0.6, sugar: 0.3, addedSugar: 0, satFat: 1.1, salt: 2.2,
    portions: [['file', '1 filé (ca 75 g)', 75], ['portion', '1 portion (2 filéer)', 150]],
    tags: ['klassiker', 'svensk'],
    syn: ['stekt rödspätta', 'rödspätta panerad', 'rödspätta med remouladsås', 'spätta panerad', 'panerad plattfisk'],
    co2e: 4.5,
    plate: { veg: 0, carb: 0.15, protein: 0.85 },
    kostrad: { fisk: 80 },
    note: 'Panerad med ägg och ströbröd, stekt i matfett. Utan remouladsås.',
  },
  {
    id: 'lutfisk-kokt',
    name: 'Lutfisk',
    cat: 'fisk',
    lmv: 1298,
    kcal: 28, prot: 5.9, carb: 0, fat: 0.5, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.1, salt: 0.1,
    portions: [['portion', '1 portion (200 g)', 200]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['lutefisk', 'julfisk', 'lutfisk med vit sås', 'kokt lutfisk'],
    co2e: 3.0,
    note: 'Kokt lutfisk – lutbehandlad torkad långa eller torsk som lakats ur. Utan sås.',
  },
  {
    id: 'halleflundra',
    name: 'Hälleflundra',
    cat: 'fisk',
    lmv: 1312,
    kcal: 168, prot: 18.8, carb: 0, fat: 10.3, fiber: 0, sugar: 0, addedSugar: 0, satFat: 1.6, salt: 1,
    raw: [0.82, 'ra'],
    portions: TILLAGAD,
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'halleflundra', 'hälleflundrafilé', 'blåhälleflundra', 'grönlandshälleflundra', 'liten hälleflundra', 'blåkveite',
      'atlantisk hälleflundra', 'halibut', 'greenland halibut',
    ],
    co2e: 4.9,
    note: `Tillagad (kokt eller ugnsbakad), lätt saltad. Mellanläge mellan den feta blåhälleflundran (som oftast säljs fryst) och den magrare atlantiska hälleflundran. ${RA_VIKT} ${KVICKSILVER}`,
  },
  {
    id: 'havsabborre',
    name: 'Havsabborre',
    cat: 'fisk',
    lmv: 4617,
    kcal: 146, prot: 21.2, carb: 0, fat: 6.7, fiber: 0, sugar: 0, addedSugar: 0, satFat: 1.3, salt: 0.8,
    raw: [0.9, 'ra'],
    portions: [['st', '1 hel fisk (ca 180 g ätbart)', 180], ['portion', '1 portion (110 g)', 110]],
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: ['branzino', 'branzini', 'sea bass', 'loup de mer', 'havsabborrfilé', 'grillad havsabborre', 'guldsparid', 'dorade'],
    co2e: 5.6,
    note: `Odlad havsabborre, grillad eller ugnsbakad och lätt saltad. Guldsparid (dorade) har liknande näringsvärde. ${RA_VIKT}`,
  },
]

// ---------------------------------------------------------------------------
// Insjöfisk
// ---------------------------------------------------------------------------

const insjofisk: FoodSeed[] = [
  {
    id: 'insjofisk',
    name: 'Gös, abborre eller gädda',
    cat: 'fisk',
    kcal: 106, prot: 25.1, carb: 0, fat: 0.4, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.05, salt: 0.13,
    n: {
      polyFat: 0.17, omega3: 0.08, cholesterol: 78,
      vitA: 6.4, vitD: 23, vitE: 0.71, vitC: 0, thiamin: 0.1, riboflavin: 0.1, niacin: 8.8, vitB6: 0.4, folate: 14.7, vitB12: 2.8,
      calcium: 30, iron: 0.21, magnesium: 35, potassium: 540, phosphorus: 275, zinc: 0.71, selenium: 36, iodine: 18,
    },
    raw: [0.8, 'ra'],
    portions: [['portion', '1 portion (110 g)', 110], ['bit', '1 filé, tillagad (ca 80 g)', 80]],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: [
      'gös', 'gos', 'gösfilé', 'gosfile', 'zander', 'abborre', 'aborre', 'abborrfilé', 'abborrfile', 'gädda', 'gadda',
      'gäddfilé', 'gäddfärs', 'sik', 'sikfilé', 'rökt sik', 'insjöfisk', 'sötvattensfisk',
    ],
    co2e: 2.7,
    note: `Tillagad utan salt och fett. Beräknad från Livsmedelsverkets värden för rå gös, abborre och gädda, som är nästan likadana; sik har ungefär samma näringsvärde. Varmrökt sik är saltare och något fetare, ca 130 kcal per 100 g. Fisken tappar ca 20 % i vikt i ugnen eller pannan – kokt fisk tappar mer. ${RA_VIKT} ${KVICKSILVER}`,
  },
]

// ---------------------------------------------------------------------------
// Sill, strömming, ansjovis och sardiner
// ---------------------------------------------------------------------------

const sillStromming: FoodSeed[] = [
  {
    id: 'stromming',
    name: 'Strömming',
    cat: 'fisk',
    lmv: 1333,
    kcal: 122, prot: 21.6, carb: 0, fat: 3.9, fiber: 0, sugar: 0, addedSugar: 0, satFat: 1, salt: 0.8,
    raw: [0.85, 'ra'],
    portions: [['portion', '1 portion (110 g)', 110], ['flundra', '1 filé eller flundra utan panering (ca 25 g)', 25]],
    tags: ['glutenfri', 'laktosfri', 'svensk', 'nyckelhal'],
    syn: [
      'stromming', 'strömmingsfilé', 'strömmingsfile', 'östersjösill', 'baltic herring', 'färsk sill', 'sill färsk',
      'stekt strömmingsfilé', 'grillad strömming',
    ],
    co2e: 1.2,
    note: `Strömmingsfilé stekt eller kokt utan panering, lätt saltad. ${RA_VIKT} Sill från Atlanten är fetare – ca 150 kcal per 100 g rå. ${OSTERSJON}`,
  },
  {
    id: 'stromming-stekt',
    name: 'Strömmingsflundror',
    cat: 'fisk',
    lmv: 1300,
    kcal: 249, prot: 15.2, carb: 4.1, fat: 19.2, fiber: 0.3, sugar: 0, addedSugar: 0, satFat: 5.8, salt: 1.3,
    portions: [['flundra', '1 strömmingsflundra', 35], ['portion', '1 portion (4 flundror)', 140]],
    tags: ['klassiker', 'svensk'],
    syn: [
      'stekt strömming', 'strömmingsflundra', 'flundror', 'strömming med mos', 'panerad strömming', 'inlagd strömming',
      'inlagd stekt strömming', 'ättiksströmming',
    ],
    co2e: 1.3,
    plate: { veg: 0, carb: 0.1, protein: 0.9 },
    kostrad: { fisk: 85 },
    note: `Mjölad eller panerad och stekt i matfett. Stekt och inlagd strömming har ungefär samma energi. ${OSTERSJON}`,
  },
  {
    id: 'bockling',
    name: 'Böckling',
    cat: 'fisk',
    lmv: 1266,
    kcal: 199, prot: 21.2, carb: 0, fat: 12.8, fiber: 0, sugar: 0, addedSugar: 0, satFat: 3.8, salt: 2.1,
    portions: [['st', '1 böckling (ca 50 g ätbart)', 50], ['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['bockling', 'böcklingfilé', 'rökt strömming', 'varmrökt strömming'],
    co2e: 1.5,
    note: `Varmrökt strömming. ${OSTERSJON}`,
  },
  {
    id: 'surstromming',
    name: 'Surströmming',
    cat: 'fisk',
    lmv: 1297,
    kcal: 82, prot: 11.8, carb: 0, fat: 3.9, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.6, salt: 8.8,
    portions: [['st', '1 strömming (rensad, ca 40 g)', 40], ['portion', '1 portion (3 strömmingar)', 120]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: ['surstromming', 'sur strömming', 'fermenterad strömming', 'surströmmingsklämma'],
    co2e: 2.0,
    note: 'Per 100 g rensad, avrunnen fisk. Mycket salt – halten varierar mellan tillverkare.',
  },
  {
    id: 'sill-inlagd',
    name: 'Inlagd sill',
    cat: 'fisk',
    avg: true,
    lmv: 4608,
    kcal: 238, prot: 10.7, carb: 18.8, fat: 13, fiber: 0, sugar: 17.3, addedSugar: 17, satFat: 3.2, salt: 4.3,
    portions: [['bit', '1 sillbit', 20], ['portion', '1 portion (3 bitar)', 60], ['file', '1 matjesfilé (ca 20 g)', 20]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: [
      'sill', 'sillbitar', 'ättiksill', '5-minuterssill', 'glasmästarsill', 'julsill', 'midsommarsill', 'sill i lag', 'löksill',
      'loksill', 'fransk löksill', 'rödlökssill', 'matjessill', 'matjes', 'matjesill', 'matjesfiléer', 'matjessill med gräddfil',
      'abba sill', 'klädesholmen sill',
    ],
    co2e: 1.5,
    kostrad: { fisk: 90 },
    note: samling(
      'Abba, Klädesholmen och ICA',
      'Inlagd sill, löksill och matjessill i söt ättikslag, avrunnen. Matjessill är saltare än annan inlagd sill.',
    ),
  },
  {
    id: 'senapssill',
    name: 'Sill i sås',
    cat: 'fisk',
    avg: true,
    lmv: 3036,
    kcal: 246, prot: 5.5, carb: 15.5, fat: 18, fiber: 0, sugar: 14, addedSugar: 13.5, satFat: 2, salt: 2.2,
    portions: [['portion', '1 portion (50 g)', 50], ['bit', '1 sillbit med sås', 25]],
    tags: ['glutenfri', 'klassiker', 'svensk'],
    syn: [
      'senapssill', 'senapsill', 'sill i senapssås', 'skärgårdssill', 'dillsill', 'sill i dillsås', 'sill i gräddfilssås',
      'sill i gräddfil', 'gräddfilssill', 'sill i crème fraiche', 'abba senapssill',
    ],
    co2e: 1.8,
    plate: { veg: 0, carb: 0, protein: 0.5 },
    kostrad: { fisk: 50 },
    note: samling('Abba och Klädesholmen', 'Sill i krämig sås – t.ex. senapssill, skärgårdssill och dillsill – inklusive sås.'),
  },
  {
    id: 'ansjovis-skarpsill',
    name: 'Ansjovis',
    cat: 'fisk',
    lmv: 1265,
    kcal: 215, prot: 12.5, carb: 11.8, fat: 13.1, fiber: 0, sugar: 2.9, addedSugar: 2.9, satFat: 3, salt: 6.9,
    portions: [['file', '1 filé', 4], ['janssons', 'till 1 portion Janssons (ca 25 g)', 25], ['burk', '1 burk (125 g)', 125]],
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: [
      'anjovis', 'ansjovisfiléer', 'ansjovisfile', 'grebbestads', 'grebbestads ansjovis', 'skarpsill', 'janssons ansjovis',
      'sardeller', 'sardell', 'sardellfiléer', 'anchovies',
    ],
    co2e: 1.5,
    note: 'Svensk "ansjovis" är kryddinlagd skarpsill – inte samma sak som sardeller (äkta ansjovis i olja, ca 170 kcal per 100 g). Mycket salt.',
  },
  {
    id: 'sardiner-olja',
    name: 'Sardiner',
    cat: 'fisk',
    kcal: 208, prot: 24.6, carb: 0, fat: 11.5, fiber: 0, sugar: 0, satFat: 1.5, salt: 0.8,
    n: {
      monoFat: 3.9, polyFat: 5.2, omega3: 1.5, cholesterol: 142,
      vitA: 32, vitD: 4.8, vitE: 2.0, vitK: 2.6, vitC: 0, thiamin: 0.08, riboflavin: 0.23, niacin: 5.2, vitB6: 0.17,
      folate: 10, vitB12: 8.9,
      calcium: 382, iron: 2.9, magnesium: 39, potassium: 397, phosphorus: 490, zinc: 1.3, selenium: 53,
    },
    portions: [['burk', '1 burk (ca 85 g avrunnen)', 85], ['st', '1 sardin', 12]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['sardin', 'sardiner i olja', 'sardiner på burk', 'sardiner i olivolja', 'sardiner i tomatsås'],
    co2e: 2.0,
    note: 'Konserv i olja, avrunna, med ben – benen ger mycket kalcium.',
  },
]

// ---------------------------------------------------------------------------
// Makrill och tonfisk
// ---------------------------------------------------------------------------

const makrillTonfisk: FoodSeed[] = [
  {
    id: 'makrill',
    name: 'Makrill',
    cat: 'fisk',
    lmv: 1320,
    kcal: 295, prot: 20.4, carb: 0, fat: 24, fiber: 0, sugar: 0, addedSugar: 0, satFat: 5.1, salt: 0.7,
    raw: [0.85, 'ra'],
    portions: [['portion', '1 portion (110 g)', 110], ['file', '1 filé, tillagad (ca 85 g)', 85]],
    tags: ['glutenfri', 'laktosfri', 'nyckelhal'],
    syn: ['makril', 'makrillfilé', 'makrillfile', 'färsk makrill', 'atlantmakrill', 'stekt makrill', 'grillad makrill'],
    co2e: 1.4,
    note: `Färsk makrill, stekt eller grillad och lätt saltad. ${RA_VIKT}`,
  },
  {
    id: 'makrill-varmrokt',
    name: 'Varmrökt makrill',
    cat: 'fisk',
    lmv: 1279,
    kcal: 296, prot: 19.4, carb: 0, fat: 24.5, fiber: 0, sugar: 0, addedSugar: 0, satFat: 5.3, salt: 1.4,
    portions: [['file', '1 filé (ca 100 g)', 100], ['smorgas', 'på en smörgås (30 g)', 30]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['rökt makrill', 'rokt makrill', 'pepparmakrill', 'makrillfilé rökt', 'makrill rökt'],
    co2e: 1.8,
  },
  {
    id: 'makrill-tomatsas',
    name: 'Makrill i tomatsås',
    cat: 'fisk',
    avg: true,
    lmv: 1296,
    kcal: 185, prot: 11.5, carb: 4.4, fat: 13.2, fiber: 0, sugar: 4.1, satFat: 2.6, salt: 1.2,
    portions: [['burk', '1 burk (170 g)', 170], ['smorgas', 'på en smörgås (30 g)', 30]],
    tags: ['glutenfri', 'laktosfri', 'klassiker'],
    syn: [
      'makrill på burk', 'makrill i tomat', 'tomatmakrill', 'makrillfilé i tomatsås', 'abba makrill', 'makrill tomatsås',
      'mästarmakrill', 'makrillkonserv',
    ],
    co2e: 2.0,
    plate: { veg: 0, carb: 0, protein: 0.7 },
    kostrad: { fisk: 70 },
    note: samling('Abba, ICA och Evra Fish', 'Konserv, makrillfiléer med tomatsås.'),
  },
  {
    id: 'tonfisk-vatten',
    name: 'Tonfisk i vatten',
    cat: 'fisk',
    lmv: 1278,
    kcal: 106, prot: 24.1, carb: 0, fat: 1, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.2, salt: 1,
    portions: [['burk', '1 burk, 185 g (ca 140 g avrunnen)', 140], ['halv', '½ burk (70 g)', 70], ['msk', '1 msk', 12]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['tonfisk', 'tunfisk', 'tonfisk på burk', 'tonfiskkonserv', 'tonfisk i eget spad', 'tonfisk i lake', 'tonfisk i buljong', 'tuna'],
    co2e: 3.0,
    note: 'Konserv, avrunnen.',
  },
  {
    id: 'lax-konserv-rosa',
    name: 'Lax på burk',
    cat: 'fisk',
    kcal: 139, prot: 19.8, carb: 0, fat: 6.1, fiber: 0, sugar: 0, satFat: 1.5, salt: 0.9,
    n: {
      monoFat: 1.8, polyFat: 2.0, omega3: 1.6, cholesterol: 80,
      vitA: 20, vitD: 13, vitC: 0, niacin: 6.5, vitB6: 0.3, folate: 15, vitB12: 5,
      calcium: 280, iron: 0.8, magnesium: 30, potassium: 330, phosphorus: 330, zinc: 0.9, selenium: 35,
    },
    portions: [['burk', '1 burk (ca 210 g)', 210], ['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['laxkonserv', 'rosa lax', 'lax på burk', 'konserverad lax', 'burklax', 'pink salmon', 'lax i konserv'],
    co2e: 3.0,
    note: 'Konserverad rosa lax med de mjuka benen, som ger mycket kalcium. Mycket magrare än odlad lax.',
  },
  {
    id: 'tonfisk-olja',
    name: 'Tonfisk i olja',
    cat: 'fisk',
    lmv: 1275,
    kcal: 189, prot: 24.9, carb: 0, fat: 9.9, fiber: 0, sugar: 0, addedSugar: 0, satFat: 1.2, salt: 1,
    portions: [['burk', '1 burk, 185 g (ca 140 g avrunnen)', 140], ['halv', '½ burk (70 g)', 70], ['msk', '1 msk', 12]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['tonfisk i solrosolja', 'tonfisk i olivolja', 'tuna in oil'],
    co2e: 3.5,
    note: 'Konserv, avrunnen.',
  },
  {
    id: 'farsk-tonfisk',
    name: 'Färsk tonfisk',
    cat: 'fisk',
    lmv: 1334,
    kcal: 128, prot: 29.2, carb: 0.7, fat: 0.8, fiber: 0, sugar: 0.3, addedSugar: 0, satFat: 0.1, salt: 2.2,
    raw: [0.75, 'ra'],
    portions: [['biff', '1 tonfiskbiff, tillagad (ca 110 g)', 110], ['sashimi', '1 bit sashimi (15 g rå)', 11]],
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'tonfiskbiff', 'stekt tonfisk', 'gulfenad tonfisk', 'yellowfin', 'tuna steak', 'tonfisk sashimi', 'ahi', 'rå tonfisk',
    ],
    co2e: 5.3,
    note: `Stekt tonfiskbiff (Livsmedelsverkets värden, lätt saltad). ${RA_VIKT} ${KVICKSILVER}`,
  },
  {
    id: 'tonfiskrora',
    name: 'Tonfiskröra',
    cat: 'fisk',
    lmv: 2109,
    kcal: 182, prot: 13.3, carb: 3, fat: 13, fiber: 0.3, sugar: 1.5, addedSugar: 1, satFat: 1.8, salt: 1.7,
    portions: [['smorgas', 'på en smörgås (30 g)', 30], ['msk', '1 msk', 15], ['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri'],
    syn: ['tonfisksallad', 'tonfiskmix', 'tuna mayo', 'tonfisk med majonnäs', 'tonfiskpålägg'],
    co2e: 2.8,
    plate: { veg: 0, carb: 0, protein: 0.5 },
    kostrad: { fisk: 55 },
    note: 'Hemlagad: tonfisk i vatten med majonnäs, lök och kryddor.',
  },
]

// ---------------------------------------------------------------------------
// Beredda fiskprodukter och kaviar
// ---------------------------------------------------------------------------

const fiskprodukter: FoodSeed[] = [
  {
    id: 'fiskpinnar-frysta',
    name: 'Fiskpinnar',
    cat: 'fisk',
    avg: true,
    lmv: 4602,
    kcal: 194, prot: 12.6, carb: 16.4, fat: 8.3, fiber: 1, sugar: 1.3, satFat: 0.8, salt: 0.8,
    portions: [['st', '1 fiskpinne', 25], ['portion', '1 portion (5 st)', 125]],
    syn: [
      'fiskpinne', 'fish fingers', 'fish sticks', 'findus fiskpinnar', 'ica fiskpinnar', 'garant fiskpinnar', 'panerade fiskpinnar',
      'fiskpinnar ugn', 'frasiga fiskpinnar', 'laxfiskpinnar',
    ],
    co2e: 2.5,
    plate: { veg: 0, carb: 0.35, protein: 0.65 },
    kostrad: { fisk: 60 },
    note: samling('Findus, ICA, ICA Basic och Garant', 'Förstekta, frysta fiskpinnar som de säljs. Steks de i extra fett blir det mer fett.'),
  },
  {
    id: 'fiskbullar-hummersas',
    name: 'Fiskbullar',
    cat: 'fisk',
    avg: true,
    lmv: 1345,
    kcal: 85, prot: 4.7, carb: 7.4, fat: 4.2, fiber: 0, sugar: 0.8, satFat: 0.7, salt: 1.15,
    portions: [['portion', '1 portion (½ burk, 185 g)', 185], ['burk', '1 burk (375 g)', 375], ['st', '1 fiskbulle med sås (ca 25 g)', 25]],
    tags: ['klassiker', 'svensk'],
    syn: [
      'fiskbulle', 'abba fiskbullar', 'fiskbullar i sås', 'fiskbullar i hummersås', 'fiskbullar med hummersås', 'hummersås',
      'fiskbullar i dillsås', 'fiskbullar dill', 'fiskbullar i buljong', 'fiskbullar på burk', 'fiskbullar naturell',
    ],
    co2e: 2.5,
    plate: { veg: 0, carb: 0, protein: 0.5 },
    kostrad: { fisk: 30 },
    note: samling(
      'Abba, ICA Basic och Pacific',
      'Konserv, fiskbullar i hummer- eller dillsås inklusive sås. Avrunna fiskbullar i buljong har ca 65–70 kcal per 100 g.',
    ),
  },
  {
    id: 'kaviar-smorgas',
    name: 'Kaviar',
    cat: 'fisk',
    avg: true,
    lmv: 1378,
    kcal: 409, prot: 8.7, carb: 15.5, fat: 35, fiber: 0, sugar: 12.8, addedSugar: 12.5, satFat: 2.5, salt: 5.9,
    portions: [['strang', '1 sträng på mackan (8 g)', 8], ['tub', '1 tub (190 g)', 190]],
    density: 1.0,
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: [
      'smörgåskaviar', 'kalles', 'kalles kaviar', 'kalles original', 'tubkaviar', 'kaviar på tub', 'rökt torskrom',
      'kaviar original', 'rom i tub', 'påläggskaviar', 'svennes kaviar', 'klädesholmen kaviar', 'mildrökt kaviar',
    ],
    co2e: 3.0,
    plate: { veg: 0, carb: 0, protein: 0.5 },
    kostrad: { fisk: 50 },
    note: samling('Kalles, Klädesholmen, ICA och Svennes', 'Smörgåskaviar av rökt torskrom med socker och rapsolja.'),
  },
  {
    id: 'kaviar-mjukost',
    name: 'Kaviar med mjukost',
    cat: 'fisk',
    avg: true,
    lmv: 6170,
    kcal: 296, prot: 6.3, carb: 10.6, fat: 24.7, fiber: 0.8, sugar: 7.1, addedSugar: 6, satFat: 4.4, salt: 3.5,
    portions: [['strang', '1 sträng på mackan (10 g)', 10], ['tub', '1 tub (285 g)', 285]],
    density: 1.0,
    tags: ['glutenfri', 'klassiker', 'svensk'],
    syn: ['randig kaviar', 'randiga', 'kalles randiga', 'kaviar och färskost', 'kaviar med färskost', 'kaviarmix', 'randig kaviar med ägg'],
    co2e: 3.0,
    plate: { veg: 0, carb: 0, protein: 0.3 },
    kostrad: { fisk: 20 },
    note: 'Samlingsvärde: genomsnitt av randig kaviar med mjukost (t.ex. Kalles Randiga, med och utan ägg) och Livsmedelsverkets värde för påläggskaviar med färskost. Skanna streckkoden för exakta värden för ditt märke.',
  },
  {
    id: 'crabfish-surimi',
    name: 'Crabfish',
    cat: 'fisk',
    avg: true,
    kcal: 91, prot: 8.2, carb: 13, fat: 0.7, fiber: 0.1, sugar: 5.4, addedSugar: 5, satFat: 0.3, salt: 1.65,
    n: {
      monoFat: 0.15, polyFat: 0.3, omega3: 0.15, cholesterol: 20,
      vitD: 0.2, vitC: 0, folate: 2, vitB12: 1.2,
      calcium: 13, iron: 0.4, potassium: 90, phosphorus: 280, selenium: 21,
    },
    portions: [['st', '1 stav', 17], ['forp', '1 förpackning (200 g)', 200]],
    syn: ['crabfisk', 'crab sticks', 'crabsticks', 'surimi', 'surimisticks', 'krabbstavar', 'krabbsticks', 'kanikama', 'imitation krabba'],
    co2e: 2.5,
    plate: { veg: 0, carb: 0, protein: 0.35 },
    kostrad: { fisk: 35 },
    note: samling(
      'ICA och Coop',
      'Fiskmassa (surimi) med stärkelse, socker och krabbarom – innehåller ingen eller lite krabba. Energin varierar mellan ca 85 och 110 kcal per 100 g.',
    ),
  },
  {
    id: 'ugnsfisk-topping',
    name: 'Ugnsbakad fisk med topping',
    cat: 'fisk',
    avg: true,
    kcal: 95, prot: 13.3, carb: 2.9, fat: 3.3, fiber: 0.3, sugar: 0.6, satFat: 1.1, salt: 0.8,
    portions: [['portion', '1 portion (½ förpackning, 190 g)', 190], ['forp', '1 förpackning (380 g)', 380]],
    syn: [
      'fisk bordelaise', 'bordelaise', 'fisk à la bordelaise', 'findus ugnsbakad fisk', 'ugnsbakad fisk', 'fisk i ugn med sås',
      'fryst fisk med sås', 'fisk i form', 'torsk med citronsmör', 'torskrygg med dillsmör', 'fiskfilé med topping',
    ],
    co2e: 3.0,
    plate: { veg: 0.05, carb: 0.05, protein: 0.8 },
    kostrad: { fisk: 70 },
    note: samling(
      'Findus och ICA',
      'Frysta fiskfiléer med sås, smör eller ströbrödstopping som tillagas i ugn, även fisk bordelaise.',
    ),
  },
]

// ---------------------------------------------------------------------------
// Skaldjur
// ---------------------------------------------------------------------------

const skaldjur: FoodSeed[] = [
  {
    id: 'rakor-kokta-skalade',
    name: 'Räkor',
    cat: 'skaldjur',
    lmv: 1395,
    kcal: 77, prot: 17.6, carb: 0, fat: 0.6, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.1, salt: 1.6,
    portions: [
      ['portion', '1 portion (100 g)', 100],
      ['smorgas', 'på en räksmörgås (60 g)', 60],
      ['liter', '1 liter räkor med skal (ca 190 g ätbart)', 190],
      ['st', '1 räka (ca 4 g ätbart)', 4],
    ],
    density: 0.6,
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'rakor', 'räka', 'skalade räkor', 'kokta räkor', 'frysta räkor', 'nordhavsräkor', 'handskalade räkor', 'cocktailräkor',
      'räkor med skal', 'oskalade räkor', 'färska räkor', 'västkusträkor', 'räkfrossa', 'räkor i lake', 'räkor i lag',
      'räkor på burk', 'räkor i glas',
    ],
    co2e: 12,
    note: 'Kokta, skalade räkor (per 100 g ätbart). 1 kg räkor med skal ger ca 450 g ätbart. Räkor i lake är saltare.',
  },
  {
    id: 'jatterakor',
    name: 'Jätteräkor',
    cat: 'skaldjur',
    kcal: 106, prot: 25, carb: 0, fat: 0.75, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.13, salt: 0.6,
    n: {
      monoFat: 0.13, polyFat: 0.31, omega3: 0.25, cholesterol: 200,
      vitE: 1.6, vitC: 0, niacin: 3.3, vitB6: 0.2, folate: 19, vitB12: 1.4,
      calcium: 75, iron: 0.38, magnesium: 44, potassium: 310, phosphorus: 250, zinc: 1.6, selenium: 48,
    },
    raw: [0.8, 'ra'],
    portions: [['st', '1 jätteräka, tillagad (ca 12 g)', 12], ['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'jatterakor', 'tigerräkor', 'scampi', 'king prawns', 'prawns', 'vannamei', 'vannameiräkor', 'råa jätteräkor',
      'stekta räkor', 'grillade räkor',
    ],
    co2e: 15,
    note: 'Odlade varmvattenräkor, skalade och stekta, kokta eller grillade utan salt och fett. Råa jätteräkor tappar ca 20 % i vikt. Vägde du dem råa? Välj "g rå" så räknar Lagom om till tillagad vikt.',
  },
  {
    id: 'kraftor-kokta',
    name: 'Kräftor',
    cat: 'skaldjur',
    lmv: 1394,
    kcal: 71, prot: 15.6, carb: 0.2, fat: 0.8, fiber: 0, sugar: 0.2, addedSugar: 0, satFat: 0.1, salt: 2.2,
    portions: [
      ['st', '1 kräfta (ca 6 g ätbart)', 6],
      ['portion', '1 portion, 15 kräftor (ca 90 g ätbart)', 90],
      ['toast', 'kräftstjärtar på en toast (30 g)', 30],
      ['burk', '1 burk kräftstjärtar (ca 100 g avrunnen)', 100],
    ],
    density: 0.6,
    tags: ['glutenfri', 'laktosfri', 'klassiker', 'svensk'],
    syn: [
      'kraftor', 'kräfta', 'signalkräftor', 'flodkräftor', 'kräftskiva', 'dillkokta kräftor', 'kräftstjärtar', 'kraftstjartar',
      'kräftstjärt', 'kräftstjärtar i lake', 'kräftstjärtar på burk', 'crayfish tails',
    ],
    co2e: 5.0,
    note: 'Kokta kräftor, per 100 g ätlig del (stjärt och klor). En kräfta ger ca 5–8 g ätbart. Kräftstjärtar i lake har samma näringsvärde.',
  },
  {
    id: 'hummer-kokt',
    name: 'Hummer',
    cat: 'skaldjur',
    lmv: 1393,
    kcal: 85, prot: 19, carb: 0, fat: 0.9, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.2, salt: 1.2,
    portions: [
      ['halv', '½ hummer (ca 80 g ätbart)', 80],
      ['hel', '1 hummer, 500 g (ca 160 g ätbart)', 160],
      ['portion', '1 portion (100 g ätbart)', 100],
      ['st', '1 havskräfta (ca 15 g ätbart)', 15],
    ],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: [
      'hummerkött', 'hummerstjärt', 'europeisk hummer', 'amerikansk hummer', 'lobster', 'havskräfta', 'havskräftor',
      'havskraftor', 'langoustine', 'kejsarhummer', 'norway lobster',
    ],
    co2e: 10,
    note: 'Kokt, per 100 g ätlig del. Havskräftor (kejsarhummer) har nästan samma näringsvärde. Trålfångade havskräftor har högt klimatavtryck – burfångade betydligt lägre.',
  },
  {
    id: 'krabba-kokt',
    name: 'Krabba',
    cat: 'skaldjur',
    lmv: 1397,
    kcal: 125, prot: 19.7, carb: 2.2, fat: 4, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.6, salt: 0.8,
    portions: [
      ['taska', '1 krabbtaska (ca 200 g ätbart)', 200],
      ['portion', '1 portion (100 g)', 100],
      ['ben', '1 kungskrabbben (ca 60 g ätbart)', 60],
    ],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: [
      'krabbtaska', 'taskkrabba', 'krabbkött', 'krabbklor', 'krabbsmör', 'crab', 'kungskrabba', 'king crab',
      'kamtjatkakrabba', 'kungskrabbben', 'krabba på burk',
    ],
    co2e: 5.0,
    note: 'Kokt taskkrabba, vitt och mörkt kött (per 100 g ätlig del). Kungskrabba är magrare, ca 100 kcal per 100 g. Det mörka köttet (krabbsmöret) kan innehålla kadmium – ät det sparsamt (Livsmedelsverket).',
  },
  {
    id: 'blamusslor-kokta',
    name: 'Blåmusslor',
    cat: 'skaldjur',
    lmv: 1385,
    kcal: 113, prot: 18.5, carb: 2.3, fat: 3.3, fiber: 0, sugar: 0.1, addedSugar: 0, satFat: 0.5, salt: 0.7,
    portions: [['portion', '1 portion, 750 g med skal (ca 150 g ätbart)', 150], ['st', '1 mussla (ca 5 g ätbart)', 5]],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: ['blamusslor', 'blå musslor', 'musslor', 'mussla', 'moules', 'moules frites', 'musslor i vitt vin', 'kokta musslor'],
    co2e: 0.5,
    note: 'Kokta, per 100 g musselkött. 1 kg musslor med skal ger ca 200 g ätbart. Odlade musslor har mycket lågt klimatavtryck.',
  },
  {
    id: 'ostron-raa',
    name: 'Ostron',
    cat: 'skaldjur',
    lmv: 1386,
    kcal: 55, prot: 9.3, carb: 0, fat: 2.4, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.7, salt: 0.3,
    portions: [['st', '1 ostron (ca 12 g)', 12], ['sex', '6 ostron', 72], ['dussin', '12 ostron', 144]],
    tags: ['glutenfri', 'laktosfri', 'svensk'],
    syn: ['platt ostron', 'stillahavsostron', 'oyster', 'ostronbar', 'råa ostron'],
    co2e: 0.8,
    note: 'Äts råa. Råa ostron kan innehålla norovirus och bakterier – gravida och personer med nedsatt immunförsvar bör avstå.',
  },
  {
    id: 'pilgrimsmusslor',
    name: 'Pilgrimsmusslor',
    cat: 'skaldjur',
    kcal: 57, prot: 12.7, carb: 0, fat: 0.7, fiber: 0, sugar: 0, addedSugar: 0, satFat: 0.13, salt: 1.5,
    n: {
      polyFat: 0.27, omega3: 0.27, cholesterol: 17,
      vitA: 1.5, vitD: 0, vitE: 0.93, vitC: 0, niacin: 2.9, folate: 14.7, vitB12: 0.79,
      calcium: 5, iron: 0.27, magnesium: 24, potassium: 151, phosphorus: 620, zinc: 1.07, selenium: 13, iodine: 5,
    },
    raw: [0.75, 'ra'],
    portions: [['st', '1 pilgrimsmussla, stekt (ca 19 g)', 19], ['portion', '1 portion, 4 st (75 g)', 75]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['pilgrimsmussla', 'kammussla', 'kammusslor', 'scallops', 'coquilles saint-jacques', 'stekta pilgrimsmusslor'],
    co2e: 10.7,
    note: 'Stekta, beräknade från Livsmedelsverkets värden för frysta pilgrimsmusslor från butik (som ofta har tillsatt vatten och salt) och ca 25 % viktförlust. Vägde du dem råa? Välj "g rå" så räknar Lagom om till tillagad vikt.',
  },
  {
    id: 'blackfisk-attaarmad-kokt',
    name: 'Bläckfisk',
    cat: 'skaldjur',
    kcal: 137, prot: 25.2, carb: 3.1, fat: 2.2, fiber: 0, sugar: 0, satFat: 0.76, salt: 0.78,
    n: {
      monoFat: 0.5, polyFat: 0.5, omega3: 0.42, cholesterol: 198,
      vitA: 79, vitE: 2.0, vitC: 4, thiamin: 0.1, riboflavin: 0.12, niacin: 5.9, vitB6: 0.79, folate: 21, vitB12: 20,
      calcium: 62, iron: 5.1, magnesium: 49, potassium: 500, phosphorus: 266, zinc: 2.4, selenium: 89,
    },
    raw: [0.65, 'ra'],
    portions: [['portion', '1 portion (100 g)', 100]],
    tags: ['glutenfri', 'laktosfri'],
    syn: [
      'blackfisk', 'kalmar', 'squid', 'bläckfisktuber', 'tioarmad bläckfisk', 'åttaarmad bläckfisk', 'octopus', 'pulpo', 'polpo',
      'krake', 'grillad bläckfisk', 'kokt bläckfisk',
    ],
    co2e: 8.5,
    note: 'Tillagad (kokt, stekt eller grillad) kalmar eller åttaarmad bläckfisk – genomsnitt av båda. Bläckfisk krymper mycket vid tillagning, åttaarmad mest. Vägde du den rå? Välj "g rå" så räknar Lagom om till tillagad vikt.',
  },
  {
    id: 'blackfiskringar-friterade',
    name: 'Friterade bläckfiskringar',
    cat: 'skaldjur',
    lmv: 1407,
    kcal: 292, prot: 18.6, carb: 15.2, fat: 17.4, fiber: 0.2, sugar: 1, addedSugar: 0, satFat: 3.1, salt: 1.4,
    portions: [['portion', '1 portion (150 g)', 150], ['st', '1 ring', 10]],
    syn: ['calamares', 'calamari', 'friterad bläckfisk', 'bläckfiskringar', 'calamari fritti', 'panerade bläckfiskringar', 'fritto misto'],
    co2e: 5.0,
    plate: { veg: 0, carb: 0.2, protein: 0.8 },
    kostrad: { fisk: 80 },
    note: 'Panerad eller i smet, friterad i vegetabilisk olja.',
  },
  {
    id: 'skaldjursmix-fryst',
    name: 'Skaldjursmix',
    cat: 'skaldjur',
    kcal: 75, prot: 14, carb: 2, fat: 1.2, fiber: 0, sugar: 0, satFat: 0.3, salt: 1.0,
    n: {
      monoFat: 0.2, polyFat: 0.45, omega3: 0.35, cholesterol: 150,
      vitC: 3, folate: 15, vitB12: 5,
      calcium: 50, iron: 2, potassium: 200, phosphorus: 200, zinc: 1.5, selenium: 35,
    },
    portions: [['portion', '1 portion (100 g)', 100], ['forp', '1 förpackning (400 g)', 400]],
    tags: ['glutenfri', 'laktosfri'],
    syn: ['frutti di mare', 'havets frukter', 'seafood mix', 'skaldjursblandning', 'fryst skaldjursmix'],
    co2e: 6.0,
    note: 'Fryst blandning av musslor, bläckfisk och räkor. Näringsvärdet varierar med sammansättningen.',
  },
  {
    id: 'skagenrora',
    name: 'Skagenröra',
    cat: 'skaldjur',
    lmv: 2107,
    kcal: 161, prot: 12.6, carb: 1.9, fat: 11.6, fiber: 0.1, sugar: 0.7, addedSugar: 0, satFat: 1.8, salt: 1.6,
    portions: [['toast', 'på en toast skagen (60 g)', 60], ['portion', '1 portion (100 g)', 100], ['msk', '1 msk', 15]],
    tags: ['glutenfri', 'klassiker', 'svensk'],
    syn: ['skagen', 'skagen röra', 'räkröra', 'rakrora', 'toast skagen', 'räksallad'],
    co2e: 6.0,
    plate: { veg: 0, carb: 0, protein: 0.45 },
    kostrad: { fisk: 40 },
    note: 'Hemlagad: räkor med majonnäs, crème fraiche och dill, ibland med löjrom. Färdigköpt skagenröra innehåller ofta mer majonnäs och fett.',
  },
]

export const fiskSkaldjur = defineFoods([
  ...laxfiskar,
  ...vitFisk,
  ...insjofisk,
  ...sillStromming,
  ...makrillTonfisk,
  ...fiskprodukter,
  ...skaldjur,
])
