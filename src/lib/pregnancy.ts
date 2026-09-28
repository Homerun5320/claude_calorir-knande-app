/**
 * Varsamma råd om mat för den som är gravid eller ammar – "Bra att veta när du är gravid".
 *
 * Reglerna följer Livsmedelsverkets sidor "Mat att undvika" för gravida och för ammande:
 * - https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/gravida/mat-att-undvika/
 *   (senast granskad av Livsmedelsverket 2026-06-15)
 * - https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/ammande/ammande-mat-att-undvika/
 *   (senast granskad av Livsmedelsverket 2026-06-23)
 *
 * VIKTIGT – årlig översyn: reglerna ses över varje år (nästa gång senast juni 2027) och när
 * Livsmedelsverket ändrar sina råd. Läs då båda sidorna i sin helhet, jämför med texterna nedan,
 * uppdatera `reviewed` och kör testerna i `pregnancy.test.ts`.
 *
 * Tonen: texterna är råd, aldrig förbud. De förklarar varför och vad som går bra i stället, och de
 * visas som "Bra att veta" – aldrig som röda varningar. Alla slutar med "Källa: Livsmedelsverket".
 *
 * Reglerna matchar på livsmedlets id, Livsmedelsverkets livsmedelsnummer, kategori och mönster i
 * namnet (inte på synonymer – då skulle t.ex. "getost" räknas som chèvre). Varma rätter där osten,
 * pålägget eller fisken har hettats upp (pizza, paj, gratäng …) flaggas inte.
 */
import type { Food, FoodCategory, Profile } from '../types'

export interface PregnancyRule {
  id: string
  test: (food: Food) => boolean
  /** Rådet, som slutar med "Källa: Livsmedelsverket". */
  text: string
  /** Livsmedelsverkets sida som rådet bygger på. */
  source: string
  /** När Livsmedelsverket senast granskade sidan (enligt sidan själv) – uppdateras vid den årliga översynen. */
  reviewed: string
}

export const PREGNANCY_SOURCE = 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/gravida/mat-att-undvika/'
export const BREASTFEEDING_SOURCE = 'https://www.livsmedelsverket.se/matvanor-halsa--miljo/kostrad/ammande/ammande-mat-att-undvika/'
/** Livsmedelsverkets granskningsdatum för sidan om gravida. */
export const PREGNANCY_REVIEWED = '2026-06-15'
/** Livsmedelsverkets granskningsdatum för sidan om ammande. */
export const BREASTFEEDING_REVIEWED = '2026-06-23'

const SOURCE_TEXT = 'Källa: Livsmedelsverket'

// ---------------------------------------------------------------------------
// Namn och ord
// ---------------------------------------------------------------------------

/** Gemener utan andra accenter än å, ä och ö ("Chèvre" → "chevre", "Paté" → "pate"). */
function plain(text: string): string {
  return text
    .toLocaleLowerCase('sv-SE')
    .normalize('NFD')
    .replace(/([aoAO])([̈̊])|[̀-ͯ]/g, (_m, base?: string, mark?: string) => (base ? base + mark : ''))
    .normalize('NFC')
}

interface Name {
  /** Hela namnet i gemener utan accenter (utom å/ä/ö). */
  text: string
  /** Orden i namnet. */
  words: string[]
}

const nameCache = new WeakMap<Food, Name>()
function nameOf(food: Food): Name {
  let n = nameCache.get(food)
  if (!n) {
    const text = plain(`${food.name}`)
    n = { text, words: text.split(/[^a-zåäö0-9]+/u).filter(Boolean) }
    nameCache.set(food, n)
  }
  return n
}

const inCategory = (food: Food, cats: readonly FoodCategory[]): boolean => cats.includes(food.category)
const hasWord = (n: Name, pred: (w: string) => boolean): boolean => n.words.some(pred)

/** Uppvärmt eller tillagat – osten, fisken eller pålägget har blivit rykande hett. */
const HEATED = /(^|\s)(stekt|stekta|friterad|friterade|grillad|grillade|gratinerad|gratinerade|ugnsbakad|ugnsbakade|värmd|varm|varma|kokt|kokta|tillagad|tillagade|inkokt)(\s|$)|pizza|paj\b|pajer|gratäng|lasagne|gryta|soppa|sås|toast|låda|pudding/u

// ---------------------------------------------------------------------------
// Matchning
// ---------------------------------------------------------------------------

/**
 * Lever och leverrätter – inte leverpastej, leverkorv eller fiskleverolja. Leverpaté räknas som
 * leverpastej (lite lever) och får i stället rådet om paté.
 */
const LIVER_LMV = new Set([1463 /* Korvkaka (med lever) */])
function isLiver(food: Food): boolean {
  if (food.id === 'lagom:kalvlever-stekt') return true
  if (food.lmvNumber !== undefined && LIVER_LMV.has(food.lmvNumber)) return true
  if (inCategory(food, ['vegoprotein']) || isPate(food)) return false
  return hasWord(nameOf(food), (w) => {
    if (!w.includes('lever')) return false
    if (w.includes('pastej') || w.includes('korv') || w.includes('tran') || w.includes('olja')) return false
    return w === 'lever' || w === 'levrar' || w.startsWith('lever') || w.endsWith('lever')
  })
}

function isFishLiverOil(food: Food): boolean {
  const n = nameOf(food)
  return hasWord(n, (w) => w === 'tran' || w.endsWith('levertran') || w.endsWith('leverolja') || w === 'levertran')
}

const isUnpasteurized = (food: Food): boolean => nameOf(food).text.includes('opastöris')

/** Mögel- och kittostar – även pastöriserade och veganska, men inte på tub eller som smältost. */
const MOLD_CHEESE =
  /(brie|camembert|gorgonzola|chevre|vacherol|taleggio|ädelost|mögelost|kittost|roquefort|stilton|cambozola|saint agur|danablu|port salut|reblochon|munster|epoisses|limburger)/u
function isMoldCheese(food: Food): boolean {
  if (!inCategory(food, ['ost', 'vegoprotein'])) return false
  const n = nameOf(food)
  if (!MOLD_CHEESE.test(n.text)) return false
  if (/(^|\s)(tub|på tub|i tub)(\s|$)|mjukost|smältost|smaltost/u.test(n.text)) return false
  return !HEATED.test(n.text)
}

/** Gravad och rökt fisk (kall- och varmrökt, böckling). */
function isCuredFish(food: Food): boolean {
  if (!inCategory(food, ['fisk'])) return false
  const n = nameOf(food)
  if (/pastej|pate|röra|sås|låda|gratäng|soppa/u.test(n.text)) return false
  return hasWord(n, (w) => /^(gravad|gravade|gravlax|gravlaxskivor|kallrökt|kallrökta|varmrökt|varmrökta|rökt|rökta|lättrökt|böckling)/u.test(w))
}

/** Skivat kokt eller rökt köttpålägg: skinka, kalkon, kyckling, kokt medvurst, mortadella, rostbiff, sylta. */
const COLD_SMOKED_OR_DRIED = /lufttork|kallrökt|parma|serrano|prosciutto|bresaola|salami|pepperoni/u
function isSlicedMeat(food: Food): boolean {
  const n = nameOf(food)
  if (hasWord(n, (w) => w === 'rå' || w === 'veg' || w === 'konserv') || COLD_DISH.test(n.text)) return false
  if (COLD_SMOKED_OR_DRIED.test(n.text) || HEATED.test(n.text.replace(/(^|\s)(kokt|kokta|tillagad|tillagade)(\s|$)/gu, ' '))) return false
  if (inCategory(food, ['chark'])) {
    if (hasWord(n, (w) => w.endsWith('skinka'))) return true
    if (/mortadella|rostbiff|pastrami/u.test(n.text)) return true
    if (hasWord(n, (w) => w.endsWith('sylta'))) return true
    if (/(kyckling|kalkon)/u.test(n.text) && /(pålägg|rökt|skivad|skivor)/u.test(n.text)) return true
    if (/medvurst|medwurst/u.test(n.text)) {
      // Rökt medvurst går bra fram till utgångsdatum (Livsmedelsverkets nr 1497 är rökt).
      const smoked = hasWord(n, (w) => w === 'rökt' || w === 'rökta')
      return !smoked && food.lmvNumber !== 1497
    }
    return false
  }
  if (inCategory(food, ['fagel'])) return n.text.includes('kalkon') && /(rökt|skivad|skivor|pålägg)/u.test(n.text)
  return false
}

function isPate(food: Food): boolean {
  const n = nameOf(food)
  if (hasWord(n, (w) => w === 'veg' || w === 'konserv' || w === 'vegansk' || w === 'vegetarisk')) return false
  return hasWord(n, (w) => (w.endsWith('pate') || w.endsWith('pastej')) && !w.includes('leverpastej'))
}

/** Torkat och kallrökt kött (toxoplasma) – inte när det ingår i en varm rätt. */
const DRIED_MEAT = /lufttork|kallrökt|bresaola|parma|serrano|prosciutto|salami|pepperoni|prickig korv|spickekorv|fenalår|jerky|biltong|suovas|landjägare|cecina/u
function isDriedMeat(food: Food): boolean {
  if (!inCategory(food, ['chark', 'rott_kott', 'fagel'])) return false
  const n = nameOf(food)
  if (HEATED.test(n.text) || COLD_DISH.test(n.text)) return false
  if (DRIED_MEAT.test(n.text)) return true
  return inCategory(food, ['rott_kott', 'chark']) && hasWord(n, (w) => w === 'torkat' || w === 'torkad' || w === 'torkade')
}

const FISH_DISHES: readonly FoodCategory[] = ['fisk', 'fardigratt', 'snabbmat']

/** Fiskar med mycket kvicksilver (utom tonfisk, som har egna regler). */
function isMercuryFish(food: Food): boolean {
  if (!inCategory(food, FISH_DISHES)) return false
  const n = nameOf(food)
  return (
    hasWord(n, (w) => w.startsWith('abborr') || w.startsWith('aborre') || w.startsWith('gädd') || w === 'gös' || w.startsWith('gösfil') || w === 'havskatt' || w === 'marulk' || w === 'svärdfisk' || w === 'ål') ||
    (n.words[0] === 'lake' && inCategory(food, ['fisk'])) ||
    (n.text.includes('hälleflundra') && !/odlad|liten|grönlands/u.test(n.text))
  )
}

/** Strömming och sill från Östersjön (dioxiner och PCB) – även surströmming och böckling. */
function isBalticHerring(food: Food): boolean {
  if (!inCategory(food, [...FISH_DISHES, 'chark'])) return false
  const n = nameOf(food)
  return n.text.includes('strömming') || n.text.includes('böckling') || n.text.includes('östersjö')
}

const FRESH_TUNA = /färsk|fryst|(^|\s)rå(\s|$)|stekt|grillad|biff|sashimi|sushi|nigiri|gulfenad|yellowfin|ahi|poke|poké/u
const CANNED_TUNA = /konserv|burk|i vatten|i olja|i lake|röra|smögenröra|pastasås|sallad/u
const isTuna = (food: Food): boolean => nameOf(food).text.includes('tonfisk') && !inCategory(food, ['sas_krydda'])
const isFreshTuna = (food: Food): boolean => isTuna(food) && FRESH_TUNA.test(nameOf(food).text) && !CANNED_TUNA.test(nameOf(food).text)
const isCannedTuna = (food: Food): boolean => isTuna(food) && !isFreshTuna(food)

function isSushi(food: Food): boolean {
  const n = nameOf(food)
  if (hasWord(n, (w) => w === 'veg' || w === 'vegansk' || w === 'vegetarisk')) return false
  return inCategory(food, ['fardigratt', 'snabbmat', 'fisk']) && /sushi|sashimi|nigiri|(^|\s)maki(\s|$)/u.test(n.text) && !isTuna(food)
}

const DRINKS: readonly FoodCategory[] = ['dryck', 'lask_saft', 'juice', 'alkohol', 'kosttillskott', 'vaxtdryck', 'mejeri']
const isDrink = (food: Food): boolean => food.liquid === true || inCategory(food, ['dryck', 'lask_saft', 'alkohol', 'kosttillskott'])

const HERBAL = /rooibos|örtte|kamomill|avkok|rotbuskte|nyponte|pepparmyntste|myntate|ingefärste|lindblomste|fläderte|fänkålste|anis/u
const isHerbalTea = (food: Food): boolean => inCategory(food, ['dryck']) && HERBAL.test(nameOf(food).text)

const CAFFEINE_WORDS = /(^|\s)(\S*kaffe|espresso|cappuccino|latte|caffe latte|macchiato|cortado|americano|te|svart te|grönt te|matcha|chai|energidryck\S*|\S*cola|mate)(\s|$)/u
function hasCaffeine(food: Food): boolean {
  if (!isDrink(food) || !inCategory(food, DRINKS)) return false
  const c = food.nutrients.caffeine
  if (c !== undefined) return c >= 5
  const n = nameOf(food)
  if (/koffeinfri|koffeinfritt|utan koffein|örtte|rooibos|kamomill/u.test(n.text)) return false
  return CAFFEINE_WORDS.test(n.text)
}

/** Drycker där alkohol kan förekomma – inte maträtter (vin i en gryta som kokat går bra). */
const ALCOHOL_DRINKS: readonly FoodCategory[] = ['alkohol', 'dryck', 'lask_saft', 'juice']
const ALCOHOL_FREE = /alkoholfri|alkoholfritt|alkoholfria/u

/** Alkohol över 0,5 volymprocent (≈ 0,4 g per 100 g). */
function isAlcoholic(food: Food): boolean {
  if (!inCategory(food, ALCOHOL_DRINKS) || ALCOHOL_FREE.test(nameOf(food).text)) return false
  const a = food.nutrients.alcohol
  if (a !== undefined) return a > 0.4
  return inCategory(food, ['alkohol'])
}

/** Alkoholfri öl, cider, vin och glögg (högst 0,5 volymprocent). */
const isAlcoholFree = (food: Food): boolean => inCategory(food, ALCOHOL_DRINKS) && ALCOHOL_FREE.test(nameOf(food).text)

/** Kalla, färdiga smörgåsar, sallader och röror med rökt/gravad fisk, mögelost eller chark. */
const COLD_DISH = /sandwich|baguette|bagel|smörgås|macka|fralla|wrap|sallad|röra|tunnbrödsrulle|ciabatta|panini/u
const RISKY_FILLING = /(^|\s|m\.\s)(rökt|kallrökt|gravad|gravlax|brie\S*|ädelost|mögelost|chevre|gorgonzola|salami|skinka|kalkon|medvurst|mortadella|chark|pastrami|rostbiff)(\s|$)/u
function isColdReadyDish(food: Food): boolean {
  if (!inCategory(food, ['brod', 'fardigratt', 'gronsaker', 'chark', 'fisk', 'fagel', 'snabbmat'])) return false
  const n = nameOf(food)
  if (!COLD_DISH.test(n.text) || HEATED.test(n.text)) return false
  return RISKY_FILLING.test(n.text) || /skinka|salami|kalkon|brieost/u.test(n.text)
}

// ---------------------------------------------------------------------------
// Reglerna
// ---------------------------------------------------------------------------

const gravid = (id: string, test: PregnancyRule['test'], text: string): PregnancyRule => ({
  id,
  test,
  text: `${text} ${SOURCE_TEXT}`,
  source: PREGNANCY_SOURCE,
  reviewed: PREGNANCY_REVIEWED,
})

const ammar = (id: string, test: PregnancyRule['test'], text: string): PregnancyRule => ({
  id,
  test,
  text: `${text} ${SOURCE_TEXT}`,
  source: BREASTFEEDING_SOURCE,
  reviewed: BREASTFEEDING_REVIEWED,
})

/** Råd när man är gravid. */
export const PREGNANCY_RULES: readonly PregnancyRule[] = [
  gravid(
    'lever',
    isLiver,
    'Lever innehåller mycket A-vitamin, som i höga doser kan skada barnet i magen. Livsmedelsverket råder gravida att undvika lever och leverrätter. Leverpastej innehåller inte så mycket lever – den kan du gärna äta, den är en bra järnkälla.',
  ),
  gravid(
    'fiskleverolja',
    isFishLiverOil,
    'Fiskleverolja (tran) innehåller mycket A-vitamin, och Livsmedelsverket råder gravida att undvika den. Fiskolja eller algolja går bra om barnmorskan eller läkaren har rekommenderat det.',
  ),
  gravid(
    'opastoriserad-mjolk',
    (f) => isUnpasteurized(f) && !inCategory(f, ['ost']),
    'Opastöriserad mjölk kan innehålla skadliga bakterier, bland annat listeria. Livsmedelsverkets råd är att inte dricka opastöriserad mjölk – det gäller alla, inte bara gravida.',
  ),
  gravid(
    'opastoriserad-farskost',
    (f) => isUnpasteurized(f) && inCategory(f, ['ost']) && /färsk|cottage|ricotta|kvarg/u.test(nameOf(f).text),
    'Färskost gjord på opastöriserad mjölk kan innehålla listeria, och Livsmedelsverket råder gravida att undvika den. Färskost i ask av pastöriserad mjölk – som cream cheese, ricotta och mascarpone – går bra.',
  ),
  gravid(
    'mogelost',
    isMoldCheese,
    'Mögel- och kittostar – som brie, camembert, gorgonzola, chèvre och ädelost – kan innehålla listeria, även när de är gjorda på pastöriserad mjölk och även i veganska varianter. Livsmedelsverket råder gravida att undvika dem. I en varm rätt som blivit rykande het (minst 70 grader) går osten bra, liksom ädelost på tub.',
  ),
  gravid(
    'gravad-rokt-fisk',
    isCuredFish,
    'Köpt gravad och rökt fisk kan innehålla listeria, som förökar sig i kylen. Titta på förpackningsdatumet och ät fisk som varit förpackad högst en vecka – eller värm den tills den är rykande het (minst 70 grader).',
  ),
  gravid(
    'palagg',
    isSlicedMeat,
    'Skivat kokt eller rökt köttpålägg – som skinka, kalkon, kokt medvurst och mortadella – kan i sällsynta fall innehålla listeria. Välj pålägg som varit förpackat högst en vecka, eller värm det tills det är rykande hett (minst 70 grader) i en varm rätt.',
  ),
  gravid(
    'pate',
    isPate,
    'Paté kan i sällsynta fall innehålla listeria. Välj paté som varit förpackad högst en vecka. Vanlig leverpastej och vegetariska pålägg går bra.',
  ),
  gravid(
    'torkat-kott',
    isDriedMeat,
    'Torkat och kallrökt kött – som salami, lufttorkad skinka och kallrökt renkött – kan innehålla parasiten toxoplasma. Frys det i minst tre dygn innan du äter det, eller ät det i en rätt som hettas upp tills den är rykande het, till exempel på en pizza.',
  ),
  gravid(
    'kall-fardig-ratt',
    (f) => isColdReadyDish(f) && !isSlicedMeat(f) && !isCuredFish(f),
    'Kalla, färdigförpackade smörgåsar, sallader och röror med rökt eller gravad fisk, mögelost, kittost eller chark kan innehålla listeria, och Livsmedelsverket råder gravida att undvika dem. En smörgås du gör själv med pålägg från en färsk förpackning går bra.',
  ),
  gravid(
    'tonfisk-farsk',
    isFreshTuna,
    'Färsk och fryst tonfisk kan innehålla mycket kvicksilver. Ät den gärna någon gång, men inte ofta – fiskar med mycket kvicksilver högst 2–3 gånger per år tillsammans. Äter du sushi ofta: välj inte tonfisk varje gång. Tonfisk på burk går bra.',
  ),
  gravid(
    'tonfisk-burk',
    isCannedTuna,
    'Tonfisk på burk går bra att äta när du är gravid – det är en mindre art som inte har förhöjda halter av kvicksilver. Det är färsk och fryst tonfisk som du bör äta mer sällan.',
  ),
  gravid(
    'sushi',
    isSushi,
    'Sushi och sashimi från restaurang och butik går bra att äta när du är gravid. Äter du sushi ofta – välj inte tonfisk varje gång, eftersom färsk tonfisk kan innehålla mycket kvicksilver.',
  ),
  gravid(
    'kvicksilver',
    isMercuryFish,
    'Gädda, abborre, gös, lake, havskatt, marulk, svärdfisk, stor hälleflundra, färsk tonfisk och ål kan innehålla mycket kvicksilver. Ät gärna fisk två–tre gånger i veckan, men av de här fiskarna tillsammans högst 2–3 gånger per år.',
  ),
  gravid(
    'dioxin',
    isBalticHerring,
    'Strömming och sill från Östersjön och Bottniska viken – även surströmming och böckling – kan innehålla dioxiner och PCB. Ät dem tillsammans högst 2–3 gånger per år. Inlagd sill och odlad lax går bra.',
  ),
  gravid(
    'koffein',
    hasCaffeine,
    'Håll dig under 200 milligram koffein per dag när du är gravid – det motsvarar två–tre koppar bryggkaffe (1,5 dl) eller fyra koppar te (2 dl). Även energidrycker och cola innehåller koffein.',
  ),
  gravid(
    'alkohol',
    isAlcoholic,
    'Livsmedelsverket råder gravida att inte dricka alkohol – det finns ingen mängd som säkert är ofarlig för barnet. Alkoholfria drycker med högst 0,5 volymprocent går bra i måttliga mängder.',
  ),
  gravid(
    'alkoholfritt',
    isAlcoholFree,
    'Alkoholfria drycker med högst 0,5 volymprocent alkohol går bra i måttliga mängder – upp till en liter i veckan, gärna utspritt. Står alkoholhalten inte på flaskan: håll dig till något enstaka glas i veckan.',
  ),
  gravid(
    'ortte',
    isHerbalTea,
    'Det finns inte tillräckligt med kunskap för att veta om rooibos, kamomillte och andra örtteer och avkok är säkra att dricka ofta när man är gravid. Var försiktig med dem – en kopp då och då går troligen bra.',
  ),
  gravid(
    'ginseng',
    (f) => nameOf(f).text.includes('ginseng'),
    'Ginsengprodukter kan påverka östrogennivåerna i kroppen och räknas som olämpliga när man är gravid.',
  ),
]

/** Råd när man ammar. */
export const BREASTFEEDING_RULES: readonly PregnancyRule[] = [
  ammar(
    'kvicksilver',
    (f) => isMercuryFish(f) || isFreshTuna(f),
    'Gädda, abborre, gös, lake, havskatt, marulk, svärdfisk, stor hälleflundra, färsk och fryst tonfisk och ål kan innehålla mycket kvicksilver. Ät gärna fisk två–tre gånger i veckan, men av de här fiskarna tillsammans högst 2–3 gånger per år när du ammar.',
  ),
  ammar(
    'tonfisk-burk',
    isCannedTuna,
    'Tonfisk på burk går bra att äta när du ammar – det är en mindre art som inte har förhöjda halter av kvicksilver. Det är färsk och fryst tonfisk som du bör äta mer sällan.',
  ),
  ammar(
    'dioxin',
    isBalticHerring,
    'Strömming och sill från Östersjön och Bottniska viken – även surströmming och böckling – kan innehålla dioxiner och PCB. Ät dem tillsammans högst 2–3 gånger per år när du ammar. Inlagd sill och odlad lax går bra.',
  ),
  ammar(
    'alkohol',
    isAlcoholic,
    'Alkohol har inga positiva effekter för amningen. Enligt forskningen innebär måttliga mängder – 1–2 glas vin eller motsvarande, 1–2 gånger i veckan – troligen inga medicinska risker för barnet.',
  ),
  ammar(
    'fankal-anis',
    (f) => inCategory(f, ['dryck']) && /fänkål|(^|\s)anis/u.test(nameOf(f).text),
    'Livsmedelsverket och EMA råder ammande att inte dricka fänkålste eller avkok på anis, och att inte ge det till barnet – det finns inte tillräckligt med forskning för att veta om det är säkert.',
  ),
  ammar(
    'ortte',
    (f) => isHerbalTea(f) && !/fänkål|(^|\s)anis/u.test(nameOf(f).text),
    'Det finns inte tillräckligt med kunskap för att veta om rooibos, kamomillte och andra örtteer och avkok är säkra att dricka ofta under amningstiden. Var försiktig med dem – en kopp då och då går troligen bra.',
  ),
  ammar(
    'ginseng',
    (f) => nameOf(f).text.includes('ginseng'),
    'Ginsengprodukter kan påverka östrogennivåerna i kroppen och räknas som olämpliga när man ammar.',
  ),
]

/**
 * Råden som gäller ett livsmedel för en livsfas – tom lista när inget gäller eller när man varken
 * är gravid eller ammar.
 */
export function pregnancyNotes(food: Food, lifeStage: Profile['lifeStage'] | undefined): PregnancyRule[] {
  const rules = lifeStage === 'gravid' ? PREGNANCY_RULES : lifeStage === 'ammar' ? BREASTFEEDING_RULES : undefined
  if (!rules) return []
  return rules.filter((r) => r.test(food))
}

/** Rubriken ovanför råden. */
export function pregnancyNoteTitle(lifeStage: Profile['lifeStage'] | undefined): string {
  return lifeStage === 'ammar' ? 'Bra att veta när du ammar' : 'Bra att veta när du är gravid'
}
