/**
 * Svenska klassiker – inbyggda recept i Lagom.
 *
 * Recepten skrivs kompakt: ingredienserna pekar på Lagoms kurerade livsmedel ('lagom:*') med mängd
 * och svenskt köksmått. `loadBuiltinRecipes(foods)` gör om dem till vanliga `Recipe`-objekt med
 * ögonblicksbilder av livsmedlen och uträknad vikt i gram – samma format som användarens egna recept.
 *
 * Principer
 * - Mängderna följer typiska svenska husmansrecept (Livsmedelsverkets och klassiska kokböckers nivå).
 * - `cookedWeightG` anges där vikten ändras tydligt vid tillagning (vatten kokar bort, ris och pasta
 *   suger upp vatten, bröd bakas) – då blir näringen per portion och per 100 g rätt.
 * - Ingredienser som saknar näringsvärde av betydelse eller inte finns i databasen (jäst, bakpulver,
 *   lagerblad, kryddpeppar …) står i `extras` och visas som "Du behöver även" i instruktionerna.
 */
import type { Food, FoodTag, Recipe, RecipeIngredient, UnitKey } from '../types'
import { gramsFor } from '../lib/units'
import { aliasAmount, resolveFoodAlias } from './foods/aliases'

/** Prefix för inbyggda recept: 'klassiker-kottbullar'. */
export const BUILTIN_RECIPE_PREFIX = 'klassiker-'

/** Rad i instruktionerna som listar ingredienser utan (betydande) näringsvärde. */
export const EXTRAS_PREFIX = 'Du behöver även:'

/** Fast tidsstämpel för de inbyggda recepten (1 januari 2026). */
const BUILTIN_TIMESTAMP = Date.UTC(2026, 0, 1)

export type BuiltinRecipeGroup = 'husman' | 'vardag' | 'fisk' | 'vego' | 'fika' | 'hogtid'

export const BUILTIN_RECIPE_GROUPS: Record<BuiltinRecipeGroup, string> = {
  husman: 'Husmanskost',
  vardag: 'Vardag',
  fisk: 'Fisk och skaldjur',
  vego: 'Vegetariskt',
  fika: 'Fika och bak',
  hogtid: 'Högtider',
}

/** Kompakt receptdefinition. */
export interface BuiltinRecipeSeed {
  /** Slug – receptets id blir `klassiker-<id>`. */
  id: string
  name: string
  emoji: string
  servings: number
  prepMinutes: number
  tags: FoodTag[]
  group: BuiltinRecipeGroup
  /** En mening om rätten. */
  intro: string
  /** Vad en "portion" är, t.ex. ['bulle', 'bullar'] – standard portion/portioner. */
  servingNoun?: [one: string, many: string]
  /** [livsmedels-id, mängd, enhet] */
  ingredients: Array<[foodId: string, amount: number, unit: UnitKey]>
  /** Vikt efter tillagning för hela receptet (g). */
  cookedWeightG?: number
  /** Ingredienser som inte räknas (saknar näringsvärde av betydelse). */
  extras?: string[]
  /** Korta steg. */
  instructions: string[]
}

const st = 'portion:st' as const

export const BUILTIN_RECIPE_SEEDS: readonly BuiltinRecipeSeed[] = [
  // -------------------------------------------------------------------------
  // Husmanskost
  // -------------------------------------------------------------------------
  {
    id: 'kottbullar',
    name: 'Köttbullar',
    emoji: '🧆',
    servings: 4,
    prepMinutes: 45,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Mormors köttbullar – saftiga tack vare ströbröd som svällt i mjölk.',
    ingredients: [
      ['lagom:blandfars-stekt', 500, 'g-ra'],
      ['lagom:strobrod', 0.75, 'dl'],
      ['lagom:mjolk-standard-3', 1.5, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:lok-gul', 0.5, st],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
    ],
    cookedWeightG: 680,
    instructions: [
      'Blanda ströbröd och mjölk och låt svälla i 10 minuter.',
      'Finhacka löken och fräs den mjuk i lite smör.',
      'Rör ner färs, ägg, lök, salt och peppar i ströbrödsblandningen till en jämn smet.',
      'Rulla bullar med fuktade händer, ungefär 3 cm stora.',
      'Stek bullarna i smör i omgångar, ca 8 minuter tills de är genomstekta.',
      'Servera med potatismos, gräddsås, pressgurka och rårörda lingon.',
    ],
  },
  {
    id: 'pannkakor',
    name: 'Pannkakor',
    emoji: '🥞',
    servings: 4,
    prepMinutes: 30,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'husman',
    intro: 'Tunna pannkakor – torsdagens självklara efterrätt till ärtsoppan.',
    ingredients: [
      ['lagom:vetemjol', 2.5, 'dl'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:mjolk-standard-3', 6, 'dl'],
      ['lagom:agg-ratt', 3, st],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
    ],
    cookedWeightG: 880,
    instructions: [
      'Vispa mjöl, salt och hälften av mjölken till en slät smet.',
      'Vispa i resten av mjölken och äggen. Låt smeten vila en stund.',
      'Smält smöret i stekpannan och häll ner det i smeten.',
      'Stek tunna pannkakor på medelvärme, ca 1 minut per sida.',
      'Servera med sylt och gärna vispad grädde.',
    ],
  },
  {
    id: 'artsoppa',
    name: 'Ärtsoppa med fläsk',
    emoji: '🫛',
    servings: 6,
    prepMinutes: 150,
    tags: ['klassiker', 'svensk', 'glutenfri', 'laktosfri'],
    group: 'husman',
    intro: 'Torsdagsklassikern – mättande, billig och full av fibrer från de gula ärtorna.',
    ingredients: [
      ['lagom:gula-artor-kokta', 5, 'dl-ra'],
      ['lagom:vatten-kranvatten', 15, 'dl'],
      ['lagom:sidflask-rimmat-stekt', 300, 'g-ra'],
      ['lagom:lok-gul', 1, st],
      ['lagom:salt-jodberikat', 1, 'tsk'],
    ],
    cookedWeightG: 2300,
    extras: ['1 tsk torkad timjan', '1 tsk torkad mejram'],
    instructions: [
      'Blötlägg ärtorna i rikligt med kallt vatten över natten. Häll av blötläggningsvattnet.',
      'Koka upp ärtorna i nytt vatten och skumma väl.',
      'Lägg i fläsket i en bit, hackad lök, timjan och mejram.',
      'Låt sjuda under lock i ca 1½–2 timmar tills ärtorna är mjuka.',
      'Ta upp fläsket, skär i bitar och lägg tillbaka. Smaka av med salt.',
      'Servera med senap – och pannkakor till efterrätt.',
    ],
  },
  {
    id: 'pyttipanna',
    name: 'Pyttipanna',
    emoji: '🍳',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Smått i kantiga tärningar – det bästa sättet att ta vara på kokt potatis.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 800, 'g'],
      ['lagom:falukorv', 300, 'g'],
      ['lagom:lok-gul', 2, st],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
      ['lagom:agg-ratt', 4, st],
      ['lagom:rodbetor-inlagda', 4, 'portion:portion'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
    ],
    cookedWeightG: 1550,
    instructions: [
      'Skär potatis och korv i små tärningar och hacka löken.',
      'Stek potatisen gyllene i hälften av smöret. Lägg åt sidan.',
      'Fräs lök och korv i resten av smöret och blanda med potatisen.',
      'Smaka av med salt och peppar.',
      'Stek äggen och servera ovanpå pyttan med inlagda rödbetor.',
    ],
  },
  {
    id: 'kalops',
    name: 'Kalops',
    emoji: '🥘',
    servings: 6,
    prepMinutes: 135,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Långkokt nötgryta med kryddpeppar och lagerblad – husmanskost när den är som bäst.',
    ingredients: [
      ['lagom:notkott-grytbitar-kokt', 1000, 'g-ra'],
      ['lagom:vetemjol', 3, 'msk'],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
      ['lagom:lok-gul', 3, st],
      ['lagom:morot', 3, st],
      ['lagom:vatten-kranvatten', 6, 'dl'],
      ['lagom:salt-jodberikat', 2, 'tsk'],
      ['lagom:potatis-kokt-skalad', 900, 'g'],
      ['lagom:rodbetor-inlagda', 6, 'portion:portion'],
    ],
    cookedWeightG: 2900,
    extras: ['10 kryddpepparkorn', '3 lagerblad'],
    instructions: [
      'Skär köttet i stora tärningar och vänd dem i mjöl.',
      'Bryn köttet i smör i omgångar och lägg i en gryta.',
      'Skala och skär lök och morötter i klyftor och lägg i grytan.',
      'Häll på vatten, salt, kryddpeppar och lagerblad.',
      'Låt sjuda under lock i ca 1½–2 timmar tills köttet är mört.',
      'Servera med kokt potatis och inlagda rödbetor.',
    ],
  },
  {
    id: 'raggmunk',
    name: 'Raggmunk med fläsk',
    emoji: '🥓',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Frasiga potatisplättar med stekt fläsk och rårörda lingon.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 800, 'g'],
      ['lagom:vetemjol', 2, 'dl'],
      ['lagom:mjolk-standard-3', 4, 'dl'],
      ['lagom:agg-ratt', 2, st],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:smor-normalsaltat-82', 4, 'msk'],
      ['lagom:sidflask-rimmat-stekt', 300, 'g-ra'],
      ['lagom:lingonsylt', 4, 'portion:portion'],
    ],
    cookedWeightG: 1500,
    instructions: [
      'Vispa en smet av mjöl, mjölk, ägg och salt.',
      'Skala och riv potatisen grovt och blanda ner i smeten direkt.',
      'Stek fläsket knaprigt och håll det varmt.',
      'Klicka ut smet i smör i stekpannan och platta till.',
      'Stek raggmunkarna krispiga, ca 3 minuter per sida.',
      'Servera med fläsket och rårörda lingon.',
    ],
  },
  {
    id: 'kaldolmar',
    name: 'Kåldolmar',
    emoji: '🥬',
    servings: 6,
    prepMinutes: 120,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Kålrullar med sirapsglans – en klassiker med rötter i Karl XII:s tid.',
    ingredients: [
      ['lagom:vitkal', 1000, 'g'],
      ['lagom:blandfars-stekt', 500, 'g-ra'],
      ['lagom:ris-grotris-torrt', 1, 'dl'],
      ['lagom:mjolk-standard-3', 1, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:salt-jodberikat', 1.5, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
      ['lagom:sirap-ljus', 3, 'msk'],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
    ],
    cookedWeightG: 1500,
    instructions: [
      'Koka riset i 2 dl vatten och låt svalna.',
      'Förväll kålhuvudet i saltat vatten och lossa bladen ett i taget.',
      'Blanda färs, ris, mjölk, ägg, salt och peppar.',
      'Lägg en klick fyllning på varje blad och rulla ihop till paket.',
      'Lägg dolmarna i en smord form, ringla över sirap och smörklickar.',
      'Baka i 200 °C i ca 45 minuter. Servera med potatis, gräddsås och lingon.',
    ],
  },
  {
    id: 'wallenbergare',
    name: 'Wallenbergare',
    emoji: '🥩',
    servings: 4,
    prepMinutes: 45,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Krämiga kalvfärsbiffar med grädde och äggulor, serverade med mos och ärtor.',
    ingredients: [
      ['lagom:kalvfars-stekt', 500, 'g-ra'],
      ['lagom:aggula-ra', 4, st],
      ['lagom:vispgradde-40', 2, 'dl'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
      ['lagom:strobrod', 1, 'dl'],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
      ['lagom:potatismos-hemlagat', 600, 'g'],
      ['lagom:arter-grona-frysta', 4, 'dl'],
      ['lagom:lingonsylt', 4, 'portion:portion'],
    ],
    cookedWeightG: 1680,
    instructions: [
      'Håll färs och grädde kalla. Blanda färs, äggulor, salt och peppar.',
      'Arbeta in den kalla grädden lite i taget till en luftig smet.',
      'Forma fyra stora biffar och vänd dem i ströbröd.',
      'Stek biffarna i smör på medelvärme, ca 4 minuter per sida.',
      'Servera med potatismos, gröna ärtor, lingon och gärna skirat smör.',
    ],
  },
  {
    id: 'biff-a-la-lindstrom',
    name: 'Biff à la Lindström',
    emoji: '🥩',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Rosa biffar med rödbetor och kapris – uppkallade efter Henrik Lindström.',
    ingredients: [
      ['lagom:notfars-12-stekt', 500, 'g-ra'],
      ['lagom:rodbetor-inlagda', 100, 'g'],
      ['lagom:kapris', 2, 'msk'],
      ['lagom:lok-gul', 0.5, st],
      ['lagom:agg-ratt', 1, st],
      ['lagom:mjolk-standard-3', 0.5, 'dl'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
      ['lagom:potatis-kokt-skalad', 800, 'g'],
    ],
    cookedWeightG: 1450,
    instructions: [
      'Finhacka rödbetor, kapris och lök.',
      'Blanda färs, ägg, mjölk, salt och peppar. Vänd ner det hackade.',
      'Forma åtta biffar.',
      'Stek biffarna i smör, ca 3–4 minuter per sida.',
      'Servera med kokt potatis och gärna en enkel sallad.',
    ],
  },
  {
    id: 'kroppkakor',
    name: 'Kroppkakor',
    emoji: '🥟',
    servings: 4,
    prepMinutes: 90,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Öländska potatisbollar fyllda med fläsk och lök – serveras med smör och lingon.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 1000, 'g'],
      ['lagom:vetemjol', 3, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:sidflask-rimmat-stekt', 200, 'g-ra'],
      ['lagom:lok-gul', 1, st],
      ['lagom:smor-normalsaltat-82', 50, 'g'],
      ['lagom:lingonsylt', 4, 'portion:portion'],
    ],
    extras: ['1 tsk malen kryddpeppar'],
    instructions: [
      'Mosa den kalla kokta potatisen och arbeta ihop med mjöl, ägg och salt till en deg.',
      'Tärna fläsket och löken fint, fräs och krydda med kryddpeppar.',
      'Forma degen till bollar, gör en grop och fyll med fläsk. Nyp ihop.',
      'Sjud kroppkakorna i saltat vatten i ca 10 minuter efter att de flutit upp.',
      'Servera med smält smör och rårörda lingon.',
    ],
  },
  {
    id: 'ugnspannkaka',
    name: 'Ugnspannkaka med bacon',
    emoji: '🥧',
    servings: 4,
    prepMinutes: 45,
    tags: ['klassiker', 'svensk'],
    group: 'husman',
    intro: 'Tjock pannkaka i långpanna med knaprigt bacon och lingonsylt.',
    ingredients: [
      ['lagom:bacon-stekt', 1, 'portion:forp'],
      ['lagom:vetemjol', 2.5, 'dl'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:mjolk-standard-3', 6, 'dl'],
      ['lagom:agg-ratt', 3, st],
      ['lagom:smor-normalsaltat-82', 1, 'msk'],
      ['lagom:lingonsylt', 4, 'portion:portion'],
    ],
    cookedWeightG: 1050,
    instructions: [
      'Sätt ugnen på 225 °C. Stek baconet knaprigt i bitar.',
      'Vispa mjöl, salt och hälften av mjölken slätt. Vispa i resten av mjölken och äggen.',
      'Smörj en långpanna och fördela baconet i den.',
      'Häll över smeten och grädda i mitten av ugnen i ca 25 minuter.',
      'Skär i bitar och servera med lingonsylt.',
    ],
  },
  {
    id: 'rotmos',
    name: 'Rotmos',
    emoji: '🥕',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker', 'svensk', 'vegetarisk', 'glutenfri'],
    group: 'husman',
    intro: 'Kålrot, potatis och morot – ett gyllene mos till fläsklägg eller korv.',
    ingredients: [
      ['lagom:kalrot', 600, 'g'],
      ['lagom:potatis-kokt-skalad', 400, 'g'],
      ['lagom:morot', 2, st],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
      ['lagom:mjolk-standard-3', 1, 'dl'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
    ],
    cookedWeightG: 1200,
    extras: ['vitpeppar', 'en nypa malen kryddpeppar'],
    instructions: [
      'Skala och tärna kålrot, potatis och morötter.',
      'Koka kålroten i lätt saltat vatten i 10 minuter, lägg sedan i potatis och morot.',
      'Koka tills allt är mjukt, ca 20 minuter. Häll av men spara lite spad.',
      'Mosa med smör och varm mjölk (eller spad). Smaka av med salt och kryddor.',
    ],
  },
  // -------------------------------------------------------------------------
  // Vardag
  // -------------------------------------------------------------------------
  {
    id: 'korv-stroganoff',
    name: 'Korv Stroganoff',
    emoji: '🌭',
    servings: 4,
    prepMinutes: 30,
    tags: ['klassiker', 'svensk'],
    group: 'vardag',
    intro: 'Falukorv i krämig tomatsås – barnfamiljernas favorit på 30 minuter.',
    ingredients: [
      ['lagom:falukorv', 500, 'g'],
      ['lagom:lok-gul', 1, st],
      ['lagom:rapsolja', 1, 'msk'],
      ['lagom:tomatpure', 2, 'msk'],
      ['lagom:matlagningsgradde-15', 1, 'portion:forp'],
      ['lagom:senap-dijon', 1, 'msk'],
      ['lagom:ris-langkornigt-kokt', 3, 'dl-ra'],
    ],
    cookedWeightG: 1600,
    instructions: [
      'Koka riset enligt anvisningen på förpackningen.',
      'Skär korven i strimlor och hacka löken.',
      'Fräs lök och korv i oljan tills korven fått färg.',
      'Rör ner tomatpuré, grädde och senap. Låt sjuda i 5 minuter.',
      'Servera med riset.',
    ],
  },
  {
    id: 'flygande-jacob',
    name: 'Flygande Jacob',
    emoji: '🍌',
    servings: 6,
    prepMinutes: 50,
    tags: ['klassiker', 'svensk'],
    group: 'vardag',
    intro: 'Kyckling, banan, bacon och jordnötter i gräddig chilisås – en älskad 70-talsrätt.',
    ingredients: [
      ['lagom:grillkyckling-med-skinn', 1, 'portion:hel'],
      ['lagom:vispgradde-40', 3, 'dl'],
      ['lagom:sweet-chilisas', 1, 'dl'],
      ['lagom:banan', 3, st],
      ['lagom:bacon-stekt', 1, 'portion:forp'],
      ['lagom:jordnotter-rostade-saltade', 1, 'dl'],
      ['lagom:ris-langkornigt-kokt', 4, 'dl-ra'],
    ],
    cookedWeightG: 2400,
    instructions: [
      'Sätt ugnen på 225 °C. Koka riset.',
      'Plocka kycklingköttet i bitar och lägg i en smord ugnsform.',
      'Vispa grädden lätt och blanda med chilisåsen. Häll över kycklingen.',
      'Skiva bananerna och lägg över. Stek baconet knaprigt och strö över.',
      'Gratinera i ca 20 minuter. Strö över hackade jordnötter och servera med ris.',
    ],
  },
  {
    id: 'kottfarssas',
    name: 'Köttfärssås med spagetti',
    emoji: '🍝',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker'],
    group: 'vardag',
    intro: 'Veckans trygga middag – gärna med extra morot i såsen.',
    ingredients: [
      ['lagom:notfars-12-stekt', 500, 'g-ra'],
      ['lagom:lok-gul', 1, st],
      ['lagom:morot', 1, st],
      ['lagom:vitlok', 2, 'portion:klyfta'],
      ['lagom:rapsolja', 1, 'msk'],
      ['lagom:krossade-tomater', 1, 'portion:forp'],
      ['lagom:tomatpure', 2, 'msk'],
      ['lagom:buljongtarning', 1, 'portion:tarning'],
      ['lagom:oregano-torkad', 1, 'tsk'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:pasta-vete-kokt', 350, 'g-ra'],
    ],
    cookedWeightG: 1850,
    instructions: [
      'Hacka lök och vitlök och riv moroten.',
      'Bryn färsen i oljan tillsammans med lök, vitlök och morot.',
      'Tillsätt krossade tomater, tomatpuré, buljong och oregano.',
      'Låt sjuda i minst 15 minuter. Smaka av med salt och peppar.',
      'Koka spagettin och servera med såsen.',
    ],
  },
  {
    id: 'lasagne',
    name: 'Lasagne',
    emoji: '🧀',
    servings: 6,
    prepMinutes: 90,
    tags: ['klassiker'],
    group: 'vardag',
    intro: 'Köttfärssås, krämig vitsås och gratinerad ost i lager på lager.',
    ingredients: [
      ['lagom:notfars-12-stekt', 500, 'g-ra'],
      ['lagom:lok-gul', 1, st],
      ['lagom:vitlok', 2, 'portion:klyfta'],
      ['lagom:rapsolja', 1, 'msk'],
      ['lagom:krossade-tomater', 1, 'portion:forp'],
      ['lagom:tomatpure', 2, 'msk'],
      ['lagom:oregano-torkad', 1, 'tsk'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
      ['lagom:vetemjol', 3, 'msk'],
      ['lagom:mjolk-standard-3', 6, 'dl'],
      ['lagom:pasta-vete-kokt', 12, st],
      ['lagom:riven-ost-gratangost', 150, 'g'],
    ],
    cookedWeightG: 2000,
    extras: ['en nypa riven muskotnöt'],
    instructions: [
      'Gör en köttfärssås: bryn färs, lök och vitlök, tillsätt tomater, puré och oregano och låt sjuda.',
      'Gör vitsåsen: smält smöret, vispa i mjölet och späd med mjölken. Koka i 5 minuter och krydda med salt och muskot.',
      'Varva köttfärssås, lasagneplattor och vitsås i en ugnsform. Avsluta med vitsås.',
      'Strö över osten och grädda i 200 °C i ca 40 minuter.',
      'Låt lasagnen vila 10 minuter innan du skär den.',
    ],
  },
  {
    id: 'fredagstacos',
    name: 'Fredagstacos',
    emoji: '🌮',
    servings: 4,
    prepMinutes: 30,
    tags: ['klassiker'],
    group: 'vardag',
    intro: 'Sveriges mest älskade fredagsmys – bygg din egen taco vid bordet.',
    ingredients: [
      ['lagom:notfars-12-stekt', 500, 'g-ra'],
      ['lagom:tacokryddmix', 1, 'portion:pase'],
      ['lagom:vatten-kranvatten', 1, 'dl'],
      ['lagom:tortilla-vete', 8, st],
      ['lagom:sallad-blandad', 150, 'g'],
      ['lagom:tomat', 2, st],
      ['lagom:gurka', 0.5, 'portion:hel'],
      ['lagom:majs-konserverad', 1, 'portion:burk'],
      ['lagom:riven-ost-gratangost', 100, 'g'],
      ['lagom:graddfil-12', 2, 'dl'],
      ['lagom:tacosas', 1, 'dl'],
    ],
    cookedWeightG: 1800,
    instructions: [
      'Bryn färsen, tillsätt kryddmix och vatten och låt puttra i 5 minuter.',
      'Strimla salladen och tärna tomat och gurka.',
      'Värm tortillabröden.',
      'Ställ fram allt på bordet och låt var och en bygga sina tacos.',
    ],
  },
  {
    id: 'havregrynsgrot',
    name: 'Havregrynsgröt',
    emoji: '🥣',
    servings: 1,
    prepMinutes: 5,
    tags: ['klassiker', 'svensk', 'vegetarisk', 'fullkorn'],
    group: 'vardag',
    intro: 'Frukosten som håller dig mätt länge – fullkorn och fibrer för några kronor.',
    ingredients: [
      ['lagom:havregryn', 1, 'dl'],
      ['lagom:vatten-kranvatten', 2, 'dl'],
      ['lagom:salt-jodberikat', 1, 'krm'],
      ['lagom:mjolk-mellan-1-5', 1, 'dl'],
      ['lagom:lingonsylt', 1, 'portion:klick'],
    ],
    cookedWeightG: 340,
    instructions: [
      'Koka upp vatten och salt.',
      'Rör ner havregrynen och låt koka i 3–5 minuter under omrörning.',
      'Servera med kall mjölk och en klick sylt – eller färska bär.',
    ],
  },
  // -------------------------------------------------------------------------
  // Fisk och skaldjur
  // -------------------------------------------------------------------------
  {
    id: 'janssons-frestelse',
    name: 'Janssons frestelse',
    emoji: '🥔',
    servings: 6,
    prepMinutes: 75,
    tags: ['klassiker', 'svensk'],
    group: 'hogtid',
    intro: 'Julbordets drottning: potatis, lök och ansjovis i grädde.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 1000, 'g'],
      ['lagom:lok-gul', 2, st],
      ['lagom:ansjovis-skarpsill', 1, 'portion:burk'],
      ['lagom:vispgradde-40', 3, 'dl'],
      ['lagom:strobrod', 2, 'msk'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
    ],
    cookedWeightG: 1450,
    instructions: [
      'Sätt ugnen på 225 °C. Skala potatisen och skär den i tunna stavar.',
      'Skiva löken tunt och fräs den mjuk i lite smör.',
      'Varva potatis, lök och ansjovis i en smord form. Avsluta med potatis.',
      'Häll över lite av ansjovisspadet och hälften av grädden.',
      'Strö över ströbröd och klicka smör. Grädda i ca 30 minuter.',
      'Häll på resten av grädden och grädda ytterligare 20–30 minuter tills potatisen är mjuk.',
    ],
  },
  {
    id: 'laxpudding',
    name: 'Laxpudding',
    emoji: '🐟',
    servings: 4,
    prepMinutes: 75,
    tags: ['klassiker', 'svensk', 'glutenfri'],
    group: 'fisk',
    intro: 'Potatis, gravad lax och dill under en krämig äggstanning – med skirat smör.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 800, 'g'],
      ['lagom:lax-gravad', 250, 'g'],
      ['lagom:lok-gul', 1, st],
      ['lagom:dill-farsk', 1, 'portion:knippe'],
      ['lagom:agg-ratt', 3, st],
      ['lagom:mjolk-standard-3', 4, 'dl'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:smor-normalsaltat-82', 5, 'msk'],
    ],
    cookedWeightG: 1600,
    instructions: [
      'Sätt ugnen på 200 °C. Skala och skiva potatisen tunt och förväll den i 5 minuter.',
      'Skiva laxen, hacka lök och dill.',
      'Varva potatis, lax, lök och dill i en smord form. Börja och sluta med potatis.',
      'Vispa ägg, mjölk och salt och häll över.',
      'Grädda i ca 45 minuter tills äggstanningen stelnat.',
      'Servera med skirat smör.',
    ],
  },
  {
    id: 'fiskgratang',
    name: 'Fiskgratäng med potatismos',
    emoji: '🐟',
    servings: 4,
    prepMinutes: 50,
    tags: ['klassiker', 'svensk'],
    group: 'fisk',
    intro: 'Vit fisk och räkor i dillsås under en krispig moskant.',
    ingredients: [
      ['lagom:torsk-kokt', 500, 'g-ra'],
      ['lagom:rakor-kokta-skalade', 100, 'g'],
      ['lagom:matlagningsgradde-15', 1, 'portion:forp'],
      ['lagom:fond-koncentrerad', 1, 'msk'],
      ['lagom:dill-farsk', 10, 'g'],
      ['lagom:potatis-kokt-skalad', 800, 'g'],
      ['lagom:mjolk-standard-3', 1.5, 'dl'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
      ['lagom:riven-ost-gratangost', 40, 'g'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
    ],
    cookedWeightG: 1700,
    instructions: [
      'Koka potatisen och mosa den med varm mjölk och smör. Smaka av med salt.',
      'Sätt ugnen på 225 °C. Lägg fisken i en smord form och salta lätt.',
      'Blanda grädde, fond och hackad dill och häll över fisken. Strö över räkorna.',
      'Spritsa eller klicka moset runt kanten och strö över osten.',
      'Gratinera i ca 20 minuter tills fisken är genomkokt.',
    ],
  },
  {
    id: 'stekt-stromming',
    name: 'Stekt strömming med potatismos',
    emoji: '🐟',
    servings: 4,
    prepMinutes: 40,
    tags: ['klassiker', 'svensk'],
    group: 'fisk',
    intro: 'Strömmingsflundror i rågmjöl – billig, med lågt klimatavtryck och full av omega-3.',
    ingredients: [
      ['lagom:stromming', 600, 'g-ra'],
      ['lagom:dill-farsk', 10, 'g'],
      ['lagom:ragmjol-fullkorn', 1, 'dl'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:smor-normalsaltat-82', 3, 'msk'],
      ['lagom:potatismos-hemlagat', 4, 'portion:portion'],
      ['lagom:lingonsylt', 4, 'portion:portion'],
    ],
    cookedWeightG: 1500,
    instructions: [
      'Salta strömmingsfiléerna och lägg ihop dem två och två med dill emellan.',
      'Vänd flundrorna i rågmjöl.',
      'Stek i smör på medelvärme, ca 3 minuter per sida.',
      'Servera med potatismos och rårörda lingon.',
    ],
  },
  {
    id: 'toast-skagen',
    name: 'Toast Skagen',
    emoji: '🦐',
    servings: 4,
    prepMinutes: 20,
    tags: ['klassiker', 'svensk'],
    group: 'fisk',
    intro: 'Tore Wretmans räkröra på smörstekt toast, toppad med löjrom.',
    ingredients: [
      ['lagom:rakor-kokta-skalade', 400, 'g'],
      ['lagom:majonnas-80', 1, 'dl'],
      ['lagom:creme-fraiche-34', 1, 'dl'],
      ['lagom:dill-farsk', 15, 'g'],
      ['lagom:lok-gul', 0.5, st],
      ['lagom:citron', 0.5, st],
      ['lagom:formfranska', 4, 'portion:skiva'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
      ['lagom:lojrom', 60, 'g'],
    ],
    instructions: [
      'Grovhacka räkorna och finhacka dill och rödlök.',
      'Blanda majonnäs, crème fraiche, dill, lök och lite citronsaft. Vänd ner räkorna.',
      'Stek brödskivorna gyllene i smör.',
      'Toppa brödet med röran och en klick löjrom. Garnera med dill och citron.',
    ],
  },
  // -------------------------------------------------------------------------
  // Vegetariskt
  // -------------------------------------------------------------------------
  {
    id: 'linssoppa',
    name: 'Linssoppa med kokos',
    emoji: '🍲',
    servings: 4,
    prepMinutes: 35,
    tags: ['vegan', 'vegetarisk', 'laktosfri'],
    group: 'vego',
    intro: 'Röda linser, tomat och kokos – värmande, proteinrik och med lågt klimatavtryck.',
    ingredients: [
      ['lagom:linser-grona-kokta', 2, 'dl-ra'],
      ['lagom:lok-gul', 1, st],
      ['lagom:vitlok', 2, 'portion:klyfta'],
      ['lagom:morot', 2, st],
      ['lagom:rapsolja', 1, 'msk'],
      ['lagom:currypulver', 1, 'tsk'],
      ['lagom:krossade-tomater', 1, 'portion:forp'],
      ['lagom:kokosmjolk-burk', 1, 'portion:liten-burk'],
      ['lagom:vatten-kranvatten', 8, 'dl'],
      ['lagom:buljongtarning', 1, 'portion:tarning'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
    ],
    cookedWeightG: 1650,
    instructions: [
      'Hacka lök och vitlök och tärna morötterna.',
      'Fräs lök, vitlök, morot och curry i oljan några minuter.',
      'Tillsätt sköljda linser, tomater, kokosmjölk, vatten och buljong.',
      'Låt sjuda i ca 20 minuter tills linserna är mjuka.',
      'Mixa gärna soppan slät och smaka av med salt.',
    ],
  },
  {
    id: 'bonbiffar',
    name: 'Bönbiffar',
    emoji: '🫘',
    servings: 4,
    prepMinutes: 30,
    tags: ['vegetarisk'],
    group: 'vego',
    intro: 'Krispiga biffar av kikärtor och vita bönor – gott med tzatziki och sallad.',
    ingredients: [
      ['lagom:kikartor-kokta', 1, 'portion:burk'],
      ['lagom:kidneybonor-kokta', 1, 'portion:burk'],
      ['lagom:lok-gul', 1, st],
      ['lagom:vitlok', 1, 'portion:klyfta'],
      ['lagom:havregryn', 1, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:paprikapulver', 1, 'tsk'],
      ['lagom:salt-jodberikat', 1, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
      ['lagom:rapsolja', 3, 'msk'],
    ],
    cookedWeightG: 620,
    instructions: [
      'Skölj och låt bönor och kikärtor rinna av ordentligt.',
      'Mixa dem grovt med lök, vitlök, havregryn, ägg och kryddor.',
      'Låt smeten vila 10 minuter så att havregrynen sväller.',
      'Forma åtta biffar och stek dem gyllene i olja, ca 4 minuter per sida.',
    ],
  },
  {
    id: 'vegetarisk-pytt',
    name: 'Vegetarisk pytt med halloumi',
    emoji: '🌱',
    servings: 4,
    prepMinutes: 35,
    tags: ['vegetarisk', 'glutenfri'],
    group: 'vego',
    intro: 'Pyttipanna i ny tappning med halloumi, paprika och stekt ägg.',
    ingredients: [
      ['lagom:potatis-kokt-skalad', 700, 'g'],
      ['lagom:halloumi', 1, 'portion:forp'],
      ['lagom:lok-gul', 1, st],
      ['lagom:paprika-rod', 1, st],
      ['lagom:morot', 1, st],
      ['lagom:rapsolja', 3, 'msk'],
      ['lagom:agg-ratt', 4, st],
      ['lagom:rodbetor-inlagda', 4, 'portion:portion'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:svartpeppar-malen', 1, 'krm'],
    ],
    cookedWeightG: 1500,
    instructions: [
      'Tärna potatis, halloumi, lök, paprika och morot.',
      'Stek potatis och morot gyllene i hälften av oljan.',
      'Tillsätt lök, paprika och halloumi och stek tills osten fått färg.',
      'Smaka av med salt och peppar. Servera med stekt ägg och inlagda rödbetor.',
    ],
  },
  // -------------------------------------------------------------------------
  // Fika och bak
  // -------------------------------------------------------------------------
  {
    id: 'kanelbullar',
    name: 'Kanelbullar',
    emoji: '🥐',
    servings: 40,
    prepMinutes: 120,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'fika',
    intro: 'Den klassiska degen med kardemumma och en smörig kanelfyllning.',
    servingNoun: ['bulle', 'bullar'],
    ingredients: [
      ['lagom:mjolk-standard-3', 5, 'dl'],
      ['lagom:smor-normalsaltat-82', 250, 'g'],
      ['lagom:strosocker', 2, 'dl'],
      ['lagom:kardemumma-malen', 1, 'tsk'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:vetemjol', 13, 'dl'],
      ['lagom:kanel-malen', 1, 'msk'],
      ['lagom:agg-ratt', 1, st],
    ],
    cookedWeightG: 1550,
    extras: ['50 g jäst', 'pärlsocker till garnering'],
    instructions: [
      'Smält 150 g av smöret, häll i mjölken och värm till fingervarmt (37 °C).',
      'Smula jästen i en bunke och rör ut den med lite av degspadet.',
      'Tillsätt resten av spadet, 1 dl socker, kardemumma, salt och nästan allt mjöl. Knåda i 10 minuter.',
      'Låt degen jäsa under bakduk i ca 30 minuter.',
      'Rör ihop fyllningen av resten av smöret (100 g, rumsvarmt), 1 dl socker och kanel.',
      'Kavla ut degen, bred på fyllningen, rulla ihop och skär i ca 40 bitar. Lägg i formar.',
      'Låt jäsa 30 minuter, pensla med ägg och strö över pärlsocker.',
      'Grädda i 225 °C i 5–8 minuter.',
    ],
  },
  {
    id: 'kladdkaka',
    name: 'Kladdkaka',
    emoji: '🍫',
    servings: 10,
    prepMinutes: 30,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'fika',
    intro: 'Seg chokladkaka som är klar på en halvtimme – gott med grädde och bär.',
    servingNoun: ['bit', 'bitar'],
    ingredients: [
      ['lagom:smor-normalsaltat-82', 100, 'g'],
      ['lagom:agg-ratt', 2, st],
      ['lagom:strosocker', 2.5, 'dl'],
      ['lagom:vetemjol', 1.5, 'dl'],
      ['lagom:kakao-pulver', 4, 'msk'],
      ['lagom:vaniljsocker', 1, 'tsk'],
      ['lagom:salt-jodberikat', 1, 'krm'],
    ],
    cookedWeightG: 520,
    instructions: [
      'Sätt ugnen på 175 °C. Smörj och bröa en form med löstagbar kant.',
      'Smält smöret.',
      'Rör ihop socker, mjöl, kakao, vaniljsocker och salt.',
      'Rör ner smöret och äggen till en jämn smet utan att vispa.',
      'Grädda i nedre delen av ugnen i ca 15 minuter – kakan ska vara kladdig i mitten.',
    ],
  },
  {
    id: 'sockerkaka',
    name: 'Sockerkaka',
    emoji: '🍰',
    servings: 12,
    prepMinutes: 60,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'fika',
    intro: 'Luftig, smörig och enkel – fikats grundrecept sedan 1800-talet.',
    servingNoun: ['bit', 'bitar'],
    ingredients: [
      ['lagom:agg-ratt', 3, st],
      ['lagom:strosocker', 3, 'dl'],
      ['lagom:vetemjol', 3, 'dl'],
      ['lagom:vaniljsocker', 2, 'tsk'],
      ['lagom:smor-normalsaltat-82', 75, 'g'],
      ['lagom:mjolk-standard-3', 1, 'dl'],
    ],
    cookedWeightG: 690,
    extras: ['2 tsk bakpulver'],
    instructions: [
      'Sätt ugnen på 175 °C. Smörj och bröa en sockerkaksform.',
      'Vispa ägg och socker pösigt, ca 5 minuter.',
      'Smält smöret och blanda med mjölken.',
      'Blanda mjöl, bakpulver och vaniljsocker och vänd ner i äggsmeten växelvis med smörmjölken.',
      'Häll i formen och grädda i nedre delen av ugnen i ca 40 minuter.',
    ],
  },
  {
    id: 'chokladbollar',
    name: 'Chokladbollar',
    emoji: '🥥',
    servings: 20,
    prepMinutes: 15,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'fika',
    intro: 'Havregryn, kakao och smör – rullas i kokos. Klart på en kvart.',
    servingNoun: ['boll', 'bollar'],
    ingredients: [
      ['lagom:smor-normalsaltat-82', 100, 'g'],
      ['lagom:strosocker', 1, 'dl'],
      ['lagom:vaniljsocker', 1, 'tsk'],
      ['lagom:kakao-pulver', 3, 'msk'],
      ['lagom:havregryn', 3, 'dl'],
      ['lagom:kaffe-bryggt', 2, 'msk'],
      ['lagom:kokos-riven', 0.5, 'dl'],
    ],
    instructions: [
      'Rör smöret mjukt tillsammans med socker och vaniljsocker.',
      'Tillsätt kakao, havregryn och kallt kaffe och blanda väl.',
      'Rulla till ca 20 bollar och rulla dem i kokos.',
      'Ställ kallt en stund innan servering.',
    ],
  },
  // -------------------------------------------------------------------------
  // Högtider
  // -------------------------------------------------------------------------
  {
    id: 'semlor',
    name: 'Semlor',
    emoji: '🧁',
    servings: 12,
    prepMinutes: 120,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'hogtid',
    intro: 'Kardemummabullar med mandelmassa och vispgrädde – fettisdagens höjdpunkt.',
    servingNoun: ['semla', 'semlor'],
    ingredients: [
      ['lagom:mjolk-standard-3', 3, 'dl'],
      ['lagom:smor-normalsaltat-82', 75, 'g'],
      ['lagom:strosocker', 0.5, 'dl'],
      ['lagom:kardemumma-malen', 1, 'tsk'],
      ['lagom:salt-jodberikat', 1, 'krm'],
      ['lagom:vetemjol', 8, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:mandelmassa', 1, 'portion:forp'],
      ['lagom:vispgradde-40', 3, 'dl'],
      ['lagom:florsocker', 1, 'msk'],
    ],
    cookedWeightG: 1350,
    extras: ['25 g jäst'],
    instructions: [
      'Smält smöret, tillsätt 2½ dl av mjölken och värm till 37 °C. Rör ut jästen i lite av spadet.',
      'Blanda i socker, kardemumma, salt och mjöl och knåda till en smidig deg. Jäs i 30 minuter.',
      'Forma 12 runda bullar, låt jäsa 30 minuter och pensla med ägg.',
      'Grädda i 225 °C i ca 8 minuter. Låt svalna under bakduk.',
      'Skär av locken och gröp ur bullarna. Blanda inkråmet med riven mandelmassa och resten av mjölken.',
      'Fyll bullarna, spritsa på vispad grädde, lägg på locken och pudra med florsocker.',
    ],
  },
  {
    id: 'pepparkakor',
    name: 'Pepparkakor',
    emoji: '🍪',
    servings: 120,
    prepMinutes: 90,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'hogtid',
    intro: 'Tunna, kryddiga kakor som doftar jul – degen görs gärna dagen innan.',
    servingNoun: ['kaka', 'kakor'],
    ingredients: [
      ['lagom:smor-normalsaltat-82', 150, 'g'],
      ['lagom:strosocker', 3, 'dl'],
      ['lagom:sirap-ljus', 1, 'dl'],
      ['lagom:vatten-kranvatten', 1, 'dl'],
      ['lagom:kanel-malen', 1, 'msk'],
      ['lagom:vetemjol', 9, 'dl'],
    ],
    cookedWeightG: 1050,
    extras: ['1 msk malen ingefära', '1 msk malen nejlika', '2 tsk bikarbonat'],
    instructions: [
      'Koka upp smör, socker, sirap och vatten. Rör tills smöret smält och låt svalna.',
      'Blanda kryddor och bikarbonat med mjölet och arbeta ihop med sirapsblandningen.',
      'Låt degen vila kallt över natten.',
      'Kavla ut degen tunt på mjölat bakbord och ta ut kakor.',
      'Grädda i 200 °C i ca 5 minuter.',
    ],
  },
  {
    id: 'lussekatter',
    name: 'Lussekatter',
    emoji: '🌟',
    servings: 30,
    prepMinutes: 120,
    tags: ['klassiker', 'svensk', 'vegetarisk'],
    group: 'hogtid',
    intro: 'Saftiga saffransbullar med kvarg – bakas till Lucia den 13 december.',
    servingNoun: ['lussekatt', 'lussekatter'],
    ingredients: [
      ['lagom:saffran', 2, 'portion:pase'],
      ['lagom:mjolk-standard-3', 5, 'dl'],
      ['lagom:smor-normalsaltat-82', 175, 'g'],
      ['lagom:kvarg-naturell', 250, 'g'],
      ['lagom:strosocker', 1.5, 'dl'],
      ['lagom:salt-jodberikat', 0.5, 'tsk'],
      ['lagom:vetemjol', 14, 'dl'],
      ['lagom:agg-ratt', 1, st],
      ['lagom:russin', 40, 'g'],
    ],
    cookedWeightG: 1800,
    extras: ['50 g jäst'],
    instructions: [
      'Mortla saffranet med en sockerbit. Smält smöret, tillsätt mjölken och värm till 37 °C.',
      'Rör ut jästen i lite degspad och blanda i resten av spadet, saffran, kvarg, socker och salt.',
      'Arbeta in nästan allt mjöl och knåda till en blank deg. Jäs i 45 minuter.',
      'Forma degen till S-formade lussekatter och tryck i russin.',
      'Låt jäsa 30 minuter, pensla med ägg och grädda i 225 °C i 5–7 minuter.',
    ],
  },
  {
    id: 'sill-och-potatis',
    name: 'Sill och färskpotatis',
    emoji: '🥔',
    servings: 4,
    prepMinutes: 30,
    tags: ['klassiker', 'svensk', 'glutenfri'],
    group: 'hogtid',
    intro: 'Midsommarbordets hjärta: inlagd sill, nykokt färskpotatis, gräddfil och gräslök.',
    ingredients: [
      ['lagom:farskpotatis-kokt', 800, 'g'],
      ['lagom:smor-normalsaltat-82', 2, 'msk'],
      ['lagom:dill-farsk', 10, 'g'],
      ['lagom:sill-inlagd', 4, 'portion:portion'],
      ['lagom:graddfil-12', 2, 'dl'],
      ['lagom:graslok', 0.5, 'portion:knippe'],
      ['lagom:agg-ratt', 2, st],
    ],
    instructions: [
      'Koka färskpotatisen med dillkronor i saltat vatten, ca 15 minuter.',
      'Vänd potatisen i en klick smör och hackad dill.',
      'Halvera de kokta äggen och finhacka gräslöken.',
      'Servera sillen med potatisen, gräddfil, gräslök och ägghalvor.',
    ],
  },
  {
    id: 'ris-a-la-malta',
    name: 'Ris à la Malta',
    emoji: '🍊',
    servings: 6,
    prepMinutes: 30,
    tags: ['klassiker', 'svensk', 'vegetarisk', 'glutenfri'],
    group: 'hogtid',
    intro: 'Kall risgrynsgröt med vispad grädde och apelsin – julens efterrätt.',
    ingredients: [
      ['lagom:ris-grotris-torrt', 1, 'dl'],
      ['lagom:vatten-kranvatten', 2, 'dl'],
      ['lagom:mjolk-standard-3', 5, 'dl'],
      ['lagom:salt-jodberikat', 1, 'krm'],
      ['lagom:vispgradde-40', 2, 'dl'],
      ['lagom:strosocker', 1, 'msk'],
      ['lagom:vaniljsocker', 1, 'tsk'],
      ['lagom:apelsin', 2, st],
    ],
    cookedWeightG: 1150,
    instructions: [
      'Koka riset i vatten och salt i 10 minuter.',
      'Tillsätt mjölken och låt gröten sjuda under lock i ca 40 minuter. Rör då och då.',
      'Låt gröten kallna helt.',
      'Vispa grädden med socker och vaniljsocker och vänd ner i gröten.',
      'Servera med apelsinbitar eller en god bärsås.',
    ],
  },
]

// ---------------------------------------------------------------------------
// Uppslag
// ---------------------------------------------------------------------------

const SEED_BY_ID = new Map(BUILTIN_RECIPE_SEEDS.map((s) => [`${BUILTIN_RECIPE_PREFIX}${s.id}`, s]))

/** true för id:n på inbyggda recept ('klassiker-…'). */
export function isBuiltinRecipeId(id: string): boolean {
  return id.startsWith(BUILTIN_RECIPE_PREFIX)
}

/** Extra information om ett inbyggt recept (grupp, ingress, portionsord). */
export function builtinRecipeInfo(
  id: string,
): { group: BuiltinRecipeGroup; intro: string; servingNoun?: [string, string] } | undefined {
  const seed = SEED_BY_ID.get(id)
  if (!seed) return undefined
  return { group: seed.group, intro: seed.intro, servingNoun: seed.servingNoun }
}

/** Instruktionstext: ev. rad med "Du behöver även: …" och därefter ett steg per rad. */
function instructionsText(seed: BuiltinRecipeSeed): string {
  const lines: string[] = []
  if (seed.extras && seed.extras.length > 0) lines.push(`${EXTRAS_PREFIX} ${seed.extras.join(', ')}.`)
  lines.push(...seed.instructions)
  return lines.join('\n')
}

const cache = new WeakMap<readonly Food[], Recipe[]>()

/**
 * Livsmedel, mängd och enhet för en ingrediens i en receptdefinition. Finns livsmedlet inte längre
 * följs dess alias till ersättaren; ersätts en rå rad av den tillagade (`unit: 'g-ra'`) blir
 * mängden i gram rå vikt ('g' → 'g-ra', 'kg' → 'g-ra' × 1000). undefined om inget hittas.
 */
export function resolveSeedIngredient(
  byId: ReadonlyMap<string, Food>,
  foodId: string,
  amount: number,
  unit: UnitKey,
): { food: Food; amount: number; unit: UnitKey } | undefined {
  const direct = byId.get(foodId)
  if (direct) return { food: direct, amount, unit }
  const alias = resolveFoodAlias(foodId)
  const target = alias ? byId.get(alias.to) : undefined
  return target ? { food: target, ...aliasAmount(alias, amount, unit) } : undefined
}

/**
 * Gör om receptdefinitionerna till `Recipe`-objekt med ögonblicksbilder av livsmedlen. Id:n som
 * slagits ihop följer sitt alias (`resolveSeedIngredient`).
 * Ingredienser vars livsmedel saknas (eller vars mängd inte kan räknas om till gram) hoppas över
 * med en varning i konsolen. Resultatet memoiseras per livsmedelslista.
 */
export function loadBuiltinRecipes(foods: readonly Food[]): Recipe[] {
  const hit = cache.get(foods)
  if (hit) return hit
  const byId = new Map<string, Food>()
  for (const f of foods) if (!byId.has(f.id)) byId.set(f.id, f)

  const recipes: Recipe[] = []
  for (const seed of BUILTIN_RECIPE_SEEDS) {
    const id = `${BUILTIN_RECIPE_PREFIX}${seed.id}`
    const ingredients: RecipeIngredient[] = []
    seed.ingredients.forEach(([foodId, seedAmount, seedUnit], index) => {
      const resolved = resolveSeedIngredient(byId, foodId, seedAmount, seedUnit)
      if (!resolved) {
        console.warn(`Recept "${seed.name}": livsmedlet ${foodId} saknas och hoppas över.`)
        return
      }
      const { food, amount, unit } = resolved
      const grams = gramsFor(food, amount, unit)
      if (!Number.isFinite(grams) || grams <= 0) {
        console.warn(`Recept "${seed.name}": ${amount} ${unit} ${food.name} kan inte räknas om till gram.`)
        return
      }
      ingredients.push({ id: `${id}-${index + 1}`, food, amount, unit, grams: Math.round(grams * 10) / 10 })
    })
    if (ingredients.length === 0) continue
    recipes.push({
      id,
      name: seed.name,
      emoji: seed.emoji,
      servings: seed.servings,
      prepMinutes: seed.prepMinutes,
      tags: [...seed.tags],
      ingredients,
      cookedWeightG: seed.cookedWeightG,
      instructions: instructionsText(seed),
      builtin: true,
      createdAt: BUILTIN_TIMESTAMP,
      updatedAt: BUILTIN_TIMESTAMP,
    })
  }
  cache.set(foods, recipes)
  return recipes
}
