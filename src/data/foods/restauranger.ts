/**
 * Svenska restaurangkedjor och kaféer: kedjornas egna produkter ("Big Mac", "Originalburgare",
 * "Caffè latte") med kedjans officiella näringsvärden.
 *
 * Regler
 * - Bara produkter vars värden har hämtats från kedjans egen näringsinformation (webbsida eller PDF).
 *   Hitta aldrig på värden och skriv inte av tredjepartssajter (FatSecret, Matkalkyl, bloggar …).
 * - En källa per kedja (`ChainSource`): kedjans namn (blir `brand`), adressen och dagen då den
 *   hämtades. Noten skrivs härifrån: "Källa: <kedja>s näringsinformation (<adress>), hämtad
 *   <datum, t.ex. 29 september 2026>. Recept och portioner kan ändras – kontrollera hos kedjan."
 * - Skriv av värdena som kedjan anger dem – per portion (`per: 'portion'`, gäller första portionen
 *   med kedjans portionsvikt) eller per 100 g. Omräkningen till per 100 g görs här. Drycker som
 *   anges per storlek i ml: gram = ml × samma densitet som motsvarande basvara (kaffe, te och
 *   sockerfri läsk 1,0, kaffe med mjölk 1,02–1,03, sockersötad läsk 1,04, smoothie 1,06), och
 *   `density` + `liquid: true` sätts som på basvaran.
 * - Saknat värde utelämnas (okänt, visas "–") – aldrig 0 om kedjan inte anger 0.
 * - Kort namn med kedjans produktnamn, id 'lagom:<kedjans slug>-<produkt>' (kedjans slug läggs till
 *   automatiskt). Inga samlingsvärden (`avg`) och ingen `lmv`-koppling – det är specifika produkter.
 *   Generiska rader för snabbmat (t.ex. "Hamburgare med ost", "Kanelbulle") finns kvar i de andra
 *   filerna och kommer först för vardagsord i sökningen (testas i `restauranger.test.ts`). Heter
 *   produkten som en basvara ("Kanelbulle") kommer den direkt efter basvaran; ett produktnamn som
 *   söks exakt ("Big Mac", "Cheeseburgare") ger kedjans produkt först. Synonymer: kedjans gamla
 *   namn och stavningar ("bigmac"), inte vardagsord som redan är basvarornas.
 * - Kategorin som för motsvarande basvara (den styr kostråden och klimatschablonen): hamburgare,
 *   nuggets, pizza, tunnbrödsrullar och korv med bröd `snabbmat`; wraps, baguetter, smörgåsar och
 *   sallader med protein `fardigratt`; pommes frites `potatis`; bullar, muffins och croissanter
 *   `bakverk`; kaffe, te och kaffedrycker `dryck`; milkshakes `mejeri`; mjukglass och glassdesserter
 *   `glass_dessert`; läsk `lask_saft`; juice och smoothies `juice`.
 *
 * Testet (`restauranger.test.ts`) kontrollerar varje rad mot kedjans egna siffror: kJ ≈ kcal × 4,184
 * och energin ≈ 4 × protein + 4 × kolhydrater + 9 × fett + 2 × fiber (+ 7 × alkohol) inom ±12 %
 * (samma gräns som för hela databasen i `foods.test.ts`).
 *
 * Listan är tom: när filen skapades och granskades (2026-09-29) gick kedjornas webbplatser och
 * PDF:er inte att nå från byggmiljön, och inga värden läggs in utan hämtad källa. Lägg till en kedja i taget i
 * `RESTAURANT_CHAINS` när källan har hämtats.
 */
import type { Food, FoodCategory } from '../../types'
import { MONTHS, fromISODate } from '../../lib/dates'
import { defineFood, type FoodSeed } from './define'

/** Kedjans officiella näringsinformation. */
export interface ChainSource {
  /** Kort slug som inleder produkternas id: 'max' → 'lagom:max-originalburgare'. */
  slug: string
  /** Kedjans namn så som kedjan skriver det ("McDonald's", "Espresso House"). Blir `brand`. */
  chain: string
  /** Adressen till näringsinformationen (webbsida eller PDF), med https. */
  url: string
  /** Dagen då källan hämtades ('YYYY-MM-DD'). Visas som "29 september 2026" i noten. */
  fetched: string
}

/** En produkt med värdena så som kedjan anger dem. */
export interface ChainItem extends Omit<FoodSeed, 'id' | 'brand' | 'note' | 'avg' | 'lmv' | 'raw' | 'n' | 'portions' | 'cat'> {
  /** Produktens del av id:t – blir 'lagom:<kedjans slug>-<id>'. */
  id: string
  cat: FoodCategory
  /**
   * Vad värdena (kcal, prot, carb, fat, fiber, sugar, addedSugar, satFat, salt, alc, caffeine)
   * gäller: första portionen, med kedjans portionsvikt, eller 100 g.
   */
  per: 'portion' | '100g'
  /** Energi i kJ som kedjan anger den – används bara för kontrollen kJ ≈ kcal × 4,184 i testet. */
  kj?: number
  /** Koffein i mg (per portion eller per 100 g, som övriga värden). */
  caffeine?: number
  /** Portioner: [id, etikett, gram]. Den första är kedjans portion och förvald. */
  portions: Array<[string, string, number]>
  /** Tillägg efter källhänvisningen, t.ex. vad som ingår ("Utan dressing."). */
  extra?: string
}

export interface ChainMenu {
  source: ChainSource
  items: ChainItem[]
}

/**
 * Kedjorna med sina produkter. Tom tills kedjornas källor har hämtats (se filens inledning).
 *
 * @example
 * {
 *   source: { slug: 'kedjan', chain: 'Kedjan', url: 'https://kedjan.se/naringsvarden', fetched: '2026-09-29' },
 *   items: [{ id: 'burgare', name: 'Burgare', cat: 'snabbmat', per: 'portion', kj: 2092, kcal: 500, …,
 *             portions: [['st', '1 st (200 g)', 200]] }],
 * }
 */
export const RESTAURANT_CHAINS: readonly ChainMenu[] = []

/** Svensk genitiv för ett kedjenamn: "Burger Kings", men "Max", "Starbucks" och "McDonald's". */
export function genitiveSv(name: string): string {
  return /[sxz]$/i.test(name.trim()) ? name.trim() : `${name.trim()}s`
}

/** Hämtdagen i noten: '2026-09-29' → "29 september 2026" (alltid med år – noten är fast text). */
export function fetchedDateSv(fetched: string): string {
  const d = fromISODate(fetched)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** Källhänvisningen som inleder noten för kedjans produkter. */
export function chainSourceNote(source: ChainSource): string {
  return `Källa: ${genitiveSv(source.chain)} näringsinformation (${source.url}), hämtad ${fetchedDateSv(source.fetched)}. Recept och portioner kan ändras – kontrollera hos kedjan.`
}

const round = (v: number, decimals: number): number => {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

/** Faktor från kedjans enhet till per 100 g. */
export function per100Factor(item: Pick<ChainItem, 'per' | 'portions'>): number {
  if (item.per === '100g') return 1
  const grams = item.portions[0]?.[2]
  return grams && grams > 0 ? 100 / grams : Number.NaN
}

/** En kedjas produkter som livsmedel med värden per 100 g, `brand` och källhänvisning. */
export function chainFoods({ source, items }: ChainMenu): Food[] {
  return items.map((item) => {
    const k = per100Factor(item)
    const opt = (v: number | undefined, decimals: number) => (v === undefined ? undefined : round(v * k, decimals))
    const { caffeine, extra } = item
    return defineFood({
      id: `${source.slug}-${item.id}`,
      name: item.name,
      cat: item.cat,
      brand: source.chain,
      kcal: round(item.kcal * k, 0),
      prot: round(item.prot * k, 1),
      carb: round(item.carb * k, 1),
      fat: round(item.fat * k, 1),
      fiber: opt(item.fiber, 1),
      sugar: opt(item.sugar, 1),
      addedSugar: opt(item.addedSugar, 1),
      satFat: opt(item.satFat, 1),
      salt: opt(item.salt, 2),
      alc: opt(item.alc, 1),
      ...(caffeine !== undefined && { n: { caffeine: round(caffeine * k, 0) } }),
      portions: item.portions,
      density: item.density,
      liquid: item.liquid,
      tags: item.tags,
      syn: item.syn,
      co2e: item.co2e,
      plate: item.plate,
      kostrad: item.kostrad,
      note: extra ? `${chainSourceNote(source)} ${extra}` : chainSourceNote(source),
    })
  })
}

export const restauranger: Food[] = RESTAURANT_CHAINS.flatMap(chainFoods)
