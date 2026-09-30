/**
 * Referensvärden för vuxna enligt Nordiska näringsrekommendationerna 2023 (NNR 2023),
 * kompletterade med EFSA:s värden där NNR 2023 saknar ett eget värde (t.ex. koffein, övre gränser).
 *
 * Begrepp (som i NNR 2023):
 * - RI (rekommenderat intag) täcker behovet hos 97,5 % av friska personer i gruppen.
 * - AI (adekvat intag) används när underlaget är för osäkert för ett RI.
 * - UL (övre gräns för säkert intag) – långvarigt intag över nivån kan ge risk för skadliga effekter.
 * - "max" är en rekommenderad högsta nivå av hälsoskäl (t.ex. salt ≤ 6 g, mättat fett < 10 E%).
 *
 * Värdena är genomsnittliga dagliga intag över tid (en vecka eller mer) – inte krav för varje enskild dag.
 *
 * Källor (verifierade 2026-09):
 * - NNR 2023: Blomhoff R. m.fl., Nordic Nutrition Recommendations 2023, Nordiska ministerrådet
 *   (pub.norden.org/nord2023-003), kapitlen per näringsämne.
 * - Livsmedelsverket: "Referensvärden för energi och näringsämnen – en sammanfattning av NNR 2023" samt
 *   näringsämnessidorna på livsmedelsverket.se.
 * - Livsmedelsverket L 2025 nr 04: "Livsmedelsverkets generella kostråd för den vuxna befolkningen" (april 2025).
 * - EFSA: Dietary Reference Values (2013–2017), UL-yttranden för vitamin B6 (2023), selen (2023),
 *   vitamin D (2023), järn (2024), vitamin E (2024) och vitamin A (2024) samt koffein (2015).
 *
 * Åldersgränser: NNR 2023 anger vuxenvärden i åldersgrupper. Lagom använder de brytpunkter där något
 * värde i appen faktiskt ändras: 18–24 år (kalcium), 25–50, 51–64 (järn efter klimakteriet),
 * 65–74 (proteinmål för äldre) och 75+ (vitamin D).
 */
import type { DietType, DiaryEntry, ISODate, LifeStage, NutrientKey, Nutrients, Sex } from '../types'
import { NUTRIENTS, NUTRIENT_KEYS, saltFromSodiumMg } from './nutrients'
import { entryNutrients } from './diary'

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/** Typ av referensvärde. */
export type ReferenceKind = 'ri' | 'ai' | 'max'

export interface ReferenceValue {
  key: NutrientKey
  /** Rekommenderat (RI) eller adekvat (AI) intag per dag. */
  ri?: number
  /** Övre gräns för säkert intag (UL) per dag. */
  ul?: number
  /** Rekommenderad högsta nivå per dag (t.ex. salt 6 g). Kan kombineras med `ri` för intervall (t.ex. fleromättat fett 5–10 E%). */
  max?: number
  /** Enhet, samma som i `NUTRIENTS[key].unit`. */
  unit: string
  kind: ReferenceKind
  /** Förklaring på svenska (visas i UI). */
  note?: string
  /** Källa – visas som liten text i UI. */
  source: string
}

export type ReferenceMap = Partial<Record<NutrientKey, ReferenceValue>>

export interface ReferenceProfile {
  sex: Sex
  /** Ålder i hela år. Värdena gäller vuxna (18+); yngre får 18–24-årsvärden. */
  age: number
  lifeStage: LifeStage
  /** Kroppsvikt – behövs för proteinbehovet (g/kg). */
  weightKg?: number
  /** Energiintag/energimål – behövs för värden i energiprocent (E%). Utan värde används NNR:s referensenergi. */
  kcal?: number
}

/** Åldersgrupp för vuxna (se modulkommentaren). */
export type AgeBand = '18–24' | '25–50' | '51–64' | '65–74' | '75+'

// ---------------------------------------------------------------------------
// Källtexter
// ---------------------------------------------------------------------------

const SRC = {
  nnr: 'NNR 2023',
  nnrLmv: 'NNR 2023 (Livsmedelsverket)',
  kostrad: 'Livsmedelsverkets kostråd 2025 (NNR 2023)',
  efsa: 'EFSA',
  efsaCaffeine: 'EFSA 2015 (koffein)',
} as const

// ---------------------------------------------------------------------------
// Grundvärden
// ---------------------------------------------------------------------------

/**
 * Referensenergi för normalaktiva vuxna (PAL 1,6) enligt Livsmedelsverkets sammanfattning av NNR 2023:
 * kvinnor 9 MJ (≈ 2 150 kcal), män 11,3 MJ (≈ 2 700 kcal). Används för E%-värden när inget energiintag anges.
 */
export const REFERENCE_KCAL: Record<Sex, number> = { kvinna: 2150, man: 2700 }

/** Vuxna åldersgrupper i ordning. */
export const AGE_BANDS: readonly AgeBand[] = ['18–24', '25–50', '51–64', '65–74', '75+']

export function ageBand(age: number): AgeBand {
  if (age < 25) return '18–24'
  if (age < 51) return '25–50'
  if (age < 65) return '51–64'
  if (age < 75) return '65–74'
  return '75+'
}

/** Referensvärdena gäller vuxna. Under 18 år kan behoven skilja sig (visa en hänvisning i UI). */
export function isAdultReference(age: number): boolean {
  return age >= 18
}

type LifeStageValues = { ingen: number; gravid?: number; ammar?: number }

/** Välj värde för livsstadiet (gravid/ammar gäller bara kvinnor). */
function pick(v: LifeStageValues, sex: Sex, lifeStage: LifeStage): number {
  if (sex !== 'kvinna' || lifeStage === 'ingen') return v.ingen
  return v[lifeStage] ?? v.ingen
}

function unitOf(key: NutrientKey): string {
  return NUTRIENTS[key].unit
}

/** Avrunda till rimlig precision för visning och jämförelse. */
function round(v: number, decimals = 1): number {
  const f = 10 ** decimals
  return Math.round(v * f) / f
}

// ---------------------------------------------------------------------------
// Referensvärden
// ---------------------------------------------------------------------------

/**
 * Alla referensvärden som gäller för en person. Nycklar utan värde i NNR 2023 (t.ex. kolesterol,
 * sockerarter totalt) utelämnas. Makronäringsämnenas energiintervall (protein 10–20 E%, kolhydrater
 * 45–60 E%, fett 25–40 E%) hanteras av dagsmålen i `energy.ts`.
 */
export function referenceIntakes(p: ReferenceProfile): ReferenceMap {
  const { sex, lifeStage } = p
  const age = Math.max(18, p.age)
  const band = ageBand(age)
  const woman = sex === 'kvinna'
  const stage: LifeStage = woman ? lifeStage : 'ingen'
  const pregnant = stage === 'gravid'
  const lactating = stage === 'ammar'
  const kcal = p.kcal && p.kcal > 0 ? p.kcal : REFERENCE_KCAL[sex]
  const byStage = (v: LifeStageValues) => pick(v, sex, stage)
  const bySex = (f: number, m: number, extra?: { gravid?: number; ammar?: number }) =>
    woman ? byStage({ ingen: f, ...extra }) : m

  const out: ReferenceMap = {}
  const put = (r: Omit<ReferenceValue, 'unit'>) => {
    out[r.key] = { ...r, unit: unitOf(r.key) }
  }

  // --- Makro och fett -------------------------------------------------------

  // Protein: RI 0,83 g/kg kroppsvikt (NNR 2023). För 65+ anger NNR 2023 ca 1,2 g/kg (≈ 18 E%) som
  // planeringsmål för att motverka minskad fysisk funktion. Tillägg vid graviditet (+9 g, andra
  // trimestern) och amning (+19 g) enligt EFSA 2012.
  if (p.weightKg && p.weightKg > 0) {
    const perKg = age >= 65 ? 1.2 : 0.83
    const extra = pregnant ? 9 : lactating ? 19 : 0
    put({
      key: 'protein',
      kind: 'ri',
      ri: round(p.weightKg * perKg + extra, 0),
      note:
        (age >= 65
          ? '1,2 g per kg kroppsvikt – NNR 2023:s mål för äldre för att bevara muskler och styrka.'
          : '0,83 g per kg kroppsvikt. Mer protein än så är helt okej, 10–20 E % är ett bra intervall.') +
        (pregnant
          ? ' Under graviditeten tillkommer ca 9 g/dag (upp till 28 g/dag sista trimestern).'
          : lactating
            ? ' Vid amning tillkommer ca 19 g/dag.'
            : ''),
      source: extra ? `${SRC.nnr} + EFSA 2012` : SRC.nnr,
    })
  }

  // Kostfiber: minst 3 g/MJ, motsvarar minst 25 g/dag för kvinnor och 35 g/dag för män (NNR 2023).
  put({
    key: 'fiber',
    kind: 'ri',
    ri: woman ? 25 : 35,
    note: 'Minst 3 g per megajoule. Fullkorn, baljväxter, grönsaker, frukt, bär och nötter är bästa källorna.',
    source: SRC.nnr,
  })

  // Fullkorn: 90 g/dag för alla vuxna (Livsmedelsverkets kostråd april 2025; tidigare 70 g för kvinnor).
  put({
    key: 'wholegrain',
    kind: 'ri',
    ri: 90,
    note: 'Livsmedelsverket rekommenderar 90 g fullkorn per dag – t.ex. havregryn, fullkornsbröd och knäckebröd.',
    source: SRC.kostrad,
  })

  // Mättat fett: under 10 E% (NNR 2023).
  put({
    key: 'satFat',
    kind: 'max',
    max: round((kcal * 0.1) / 9),
    note: 'Högst 10 % av energin. Byt gärna smör och grädde mot rapsolja och flytande margarin.',
    source: SRC.nnr,
  })

  // Enkelomättat fett: 10–20 E% (NNR 2023).
  put({
    key: 'monoFat',
    kind: 'ri',
    ri: round((kcal * 0.1) / 9),
    max: round((kcal * 0.2) / 9),
    note: '10–20 % av energin. Finns i rapsolja, olivolja, nötter och avokado.',
    source: SRC.nnr,
  })

  // Fleromättat fett (cis): 5–10 E%, varav omega-3 minst 1 E% (NNR 2023).
  put({
    key: 'polyFat',
    kind: 'ri',
    ri: round((kcal * 0.05) / 9),
    max: round((kcal * 0.1) / 9),
    note: '5–10 % av energin, varav minst 1 % omega-3.',
    source: SRC.nnr,
  })
  put({
    key: 'omega3',
    kind: 'ri',
    ri: round((kcal * 0.01) / 9, 2),
    note: 'Minst 1 % av energin. Fet fisk (lax, sill, makrill), rapsolja och valnötter är bra källor.',
    source: SRC.nnr,
  })

  // Tillsatt socker: NNR 2023 anger fritt socker < 10 E%. Lagom använder tillsatt socker som närmevärde
  // (fritt socker inkluderar även socker i juice och honung).
  put({
    key: 'addedSugar',
    kind: 'max',
    max: round((kcal * 0.1) / 4),
    note: 'Högst 10 % av energin från fritt socker – gärna betydligt mindre. Läsk, godis och bakverk står för det mesta.',
    source: SRC.nnr,
  })

  // Salt: högst 6 g/dag (Livsmedelsverket). NNR 2023 anger natrium högst 2,3 g/dag (≈ 5,75 g salt).
  put({
    key: 'salt',
    kind: 'max',
    max: 6,
    note: 'Högst 6 g salt per dag (ca 1 tesked) – inklusive saltet i bröd, ost, chark och färdigmat. Välj jodberikat salt.',
    source: 'Livsmedelsverket / NNR 2023',
  })
  put({
    key: 'sodium',
    kind: 'max',
    max: 2300,
    note: 'Högst 2,3 g natrium per dag, vilket motsvarar knappt 6 g salt.',
    source: SRC.nnr,
  })

  // Alkohol: NNR 2023 – ingen säker nivå; drick så lite som möjligt. Avstå helt vid graviditet och amning.
  put({
    key: 'alcohol',
    kind: 'max',
    max: 0,
    note:
      pregnant || lactating
        ? 'Avstå helt från alkohol när du är gravid eller ammar.'
        : 'Det finns ingen säker nivå. Ju mindre alkohol, desto bättre för hälsan.',
    source: SRC.nnr,
  })

  // Koffein: EFSA 2015 – upp till 400 mg/dag är säkert för friska vuxna, 200 mg vid graviditet och amning.
  put({
    key: 'caffeine',
    kind: 'max',
    max: pregnant || lactating ? 200 : 400,
    note:
      pregnant || lactating
        ? 'Högst 200 mg per dag när du är gravid eller ammar (ca 2 koppar bryggkaffe).'
        : 'Upp till 400 mg per dag bedöms säkert (ca 4 koppar bryggkaffe). Högst 200 mg åt gången.',
    source: SRC.efsaCaffeine,
  })

  // --- Vitaminer ------------------------------------------------------------

  // Vitamin A (RE): RI 700 kvinnor / 800 män (NNR 2023). Gravid 800, ammande 1 100 RE (NNR 2023:s
  // bakgrundsartikel). UL 3 000 µg gäller förformat retinol (EFSA 2024) – inte betakaroten – och sätts
  // därför inte som UL här eftersom appens värde är retinolekvivalenter totalt.
  put({
    key: 'vitA',
    kind: 'ri',
    ri: bySex(700, 800, { gravid: 800, ammar: 1100 }),
    note:
      'Retinolekvivalenter. Övre gränsen 3 000 µg/dag gäller retinol (t.ex. lever och tillskott), inte betakaroten från grönsaker.' +
      // Livsmedelsverkets råd till gravida: undvik lever och leverrätter. Leverpastej och leverkorv
      // innehåller mindre lever och går bra att äta.
      (pregnant ? ' Undvik lever och leverrätter under graviditeten – leverpastej och leverkorv går bra.' : ''),
    source: SRC.nnr,
  })

  // Vitamin D: RI 10 µg (18–74 år), 20 µg från 75 år (NNR 2023). UL 100 µg (EFSA 2023, NNR 2023).
  put({
    key: 'vitD',
    kind: 'ri',
    ri: band === '75+' ? 20 : 10,
    ul: 100,
    note:
      band === '75+'
        ? 'Från 75 år rekommenderas 20 µg per dag eftersom huden bildar mindre D-vitamin.'
        : 'Solen räcker inte vinterhalvåret i Sverige. Fet fisk, berikade mejeriprodukter och matfett hjälper. Den som sällan är ute behöver 20 µg.',
    source: SRC.nnr,
  })

  // Vitamin E (α-TE): AI 10 kvinnor / 11 män (NNR 2023), ammande 11 (NNR 2012). UL 300 mg (EFSA 2024).
  put({
    key: 'vitE',
    kind: 'ai',
    ri: bySex(10, 11, { ammar: 11 }),
    ul: 300,
    note: 'Finns i vegetabiliska oljor, nötter, frön och fullkorn.',
    source: SRC.nnr,
  })

  // Vitamin K: AI 65 µg kvinnor / 75 µg män (1 µg/kg kroppsvikt, NNR 2023).
  put({
    key: 'vitK',
    kind: 'ai',
    ri: bySex(65, 75),
    note: 'Gröna bladgrönsaker och kål är rika källor.',
    source: SRC.nnr,
  })

  // Vitamin C: RI 95 kvinnor / 110 män; gravid 105, ammande 155 (NNR 2023).
  put({
    key: 'vitC',
    kind: 'ri',
    ri: bySex(95, 110, { gravid: 105, ammar: 155 }),
    note: 'Rökare behöver ca 40 mg extra per dag. Paprika, kål, citrusfrukter, kiwi och bär är bra källor.',
    source: SRC.nnrLmv,
  })

  // Tiamin: RI 0,1 mg/MJ → 0,9 mg kvinnor / 1,1 mg män (NNR 2023). Gravid/ammande: samma mg/MJ
  // på det ökade energibehovet (≈ +1,3 respektive +2,1 MJ) → 1,0 / 1,1 mg.
  put({
    key: 'thiamin',
    kind: 'ri',
    ri: bySex(0.9, 1.1, { gravid: 1.0, ammar: 1.1 }),
    note: 'Fullkorn, fläskkött, baljväxter och potatis bidrar mest.',
    source: SRC.nnr,
  })

  // Riboflavin: RI 1,6 mg för både kvinnor och män (NNR 2023). Gravid 1,9, ammande 2,0 (EFSA 2017).
  put({
    key: 'riboflavin',
    kind: 'ri',
    ri: bySex(1.6, 1.6, { gravid: 1.9, ammar: 2.0 }),
    note: 'Mjölkprodukter, ägg, kött och fullkorn är viktiga källor.',
    source: pregnant || lactating ? `${SRC.nnr} + EFSA 2017` : SRC.nnr,
  })

  // Niacin (NE): RI 1,6 NE/MJ → 14 kvinnor / 18 män (NNR 2023). Gravid/ammande enligt energitillägget → 16 / 17.
  put({
    key: 'niacin',
    kind: 'ri',
    ri: bySex(14, 18, { gravid: 16, ammar: 17 }),
    note: 'Niacinekvivalenter. Kött, fisk, fågel, fullkorn och baljväxter.',
    source: SRC.nnr,
  })

  // Vitamin B6: RI 1,4 kvinnor / 1,6 män (NNR 2023). Gravid 1,8, ammande 1,7 (EFSA 2016). UL 12 mg (EFSA 2023).
  put({
    key: 'vitB6',
    kind: 'ri',
    ri: bySex(1.4, 1.6, { gravid: 1.8, ammar: 1.7 }),
    ul: 12,
    note: 'Övre gränsen 12 mg per dag nås i praktiken bara med kosttillskott.',
    source: pregnant || lactating ? `${SRC.nnr} + EFSA 2016` : SRC.nnr,
  })

  // Folat (DFE): RI 330 µg (NNR 2023). Gravid AI 600, ammande 500 (NNR 2023). Övre gränsen 1 000 µg
  // gäller syntetisk folsyra och sätts därför inte som UL för totalt folat.
  put({
    key: 'folate',
    kind: pregnant ? 'ai' : 'ri',
    ri: byStage({ ingen: 330, gravid: 600, ammar: 500 }),
    note:
      woman && age < 50
        ? 'Kan du bli gravid inom några månader rekommenderar Livsmedelsverket dessutom ett tillskott med 400 µg folsyra per dag, fram till graviditetsvecka 12.'
        : 'Gröna bladgrönsaker, baljväxter, fullkorn och frukt är bra källor.',
    source: SRC.nnr,
  })

  // Vitamin B12: AI 4 µg; gravid 4,5, ammande 5,5 µg (NNR 2023, Livsmedelsverket).
  put({
    key: 'vitB12',
    kind: 'ai',
    ri: byStage({ ingen: 4, gravid: 4.5, ammar: 5.5 }),
    note: 'Finns nästan bara i animaliska livsmedel – äter du veganskt behöver du tillskott eller berikade produkter.',
    source: SRC.nnrLmv,
  })

  // --- Mineraler ------------------------------------------------------------

  // Kalcium: RI 1 000 mg 18–24 år, 950 mg från 25 år, även gravida och ammande (NNR 2023). UL 2 500 mg.
  put({
    key: 'calcium',
    kind: 'ri',
    ri: band === '18–24' ? 1000 : 950,
    ul: 2500,
    note: 'Mjölk, fil, yoghurt, ost och berikade växtdrycker är de största källorna.',
    source: SRC.nnrLmv,
  })

  // Fosfor: AI 520 mg (NNR 2023, EFSA:s AI skalad mot kalcium-RI).
  put({ key: 'phosphorus', kind: 'ai', ri: 520, note: 'De flesta får i sig gott om fosfor.', source: SRC.nnr })

  // Magnesium: AI 300 kvinnor / 350 män (NNR 2023). UL 250 mg gäller endast tillskott → inget UL här.
  put({
    key: 'magnesium',
    kind: 'ai',
    ri: bySex(300, 350),
    note: 'Fullkorn, nötter, frön och baljväxter. Övre gränsen 250 mg gäller bara kosttillskott.',
    source: SRC.nnr,
  })

  // Kalium: AI 3 500 mg för kvinnor och män, även vid graviditet och amning (NNR 2023).
  put({
    key: 'potassium',
    kind: 'ai',
    ri: 3500,
    note: 'Grönsaker, frukt, potatis, baljväxter och mjölkprodukter.',
    source: SRC.nnr,
  })

  // Järn: RI 15 mg för kvinnor före klimakteriet, 9 mg för män och kvinnor efter klimakteriet
  // (NNR 2023, Livsmedelsverket). Lagom använder 51 år som närmevärde för klimakteriet.
  // EFSA 2024: "säker intagsnivå" 40 mg/dag för vuxna inkl. gravida och ammande (inget UL fastställt).
  const ironFertile = woman && (age < 51 || stage !== 'ingen')
  put({
    key: 'iron',
    kind: 'ri',
    ri: ironFertile ? 15 : 9,
    ul: 40,
    note: pregnant
      ? 'Järnbehovet ökar kraftigt under graviditeten. Barnmorskan följer ditt blodvärde och ger råd om tillskott.'
      : ironFertile
        ? 'Menstruationen gör att behovet är större fram till klimakteriet. C-vitamin i samma måltid ökar upptaget.'
        : 'Kött, fullkorn, baljväxter och gröna grönsaker. C-vitamin i samma måltid ökar upptaget.',
    source: SRC.nnrLmv,
  })

  // Zink: RI 10 kvinnor / 13 män vid måttligt fytatintag (600 mg/dag) (NNR 2023). UL 25 mg.
  // Gravid/ammande: NNR-värdet + EFSA:s tillägg (+1,6 / +2,9 mg) → 12 / 13 mg.
  put({
    key: 'zinc',
    kind: 'ri',
    ri: bySex(10, 13, { gravid: 12, ammar: 13 }),
    ul: 25,
    note: 'Växtbaserad kost med mycket fytat (fullkorn, baljväxter) ökar behovet något.',
    source: pregnant || lactating ? `${SRC.nnr} + EFSA 2014` : SRC.nnr,
  })

  // Selen: AI 75 µg kvinnor / 90 µg män (NNR 2023). Ammande 85 µg (EFSA 2014). UL 255 µg (EFSA 2023, NNR 2023).
  put({
    key: 'selenium',
    kind: 'ai',
    ri: bySex(75, 90, { ammar: 85 }),
    ul: 255,
    note: 'Fisk, skaldjur, ägg, kött och mejeriprodukter. Svensk jord är selenfattig.',
    source: SRC.nnr,
  })

  // Jod: AI 150 µg; gravid och ammande 200 µg (NNR 2023). UL 600 µg.
  put({
    key: 'iodine',
    kind: 'ai',
    ri: byStage({ ingen: 150, gravid: 200, ammar: 200 }),
    ul: 600,
    note: 'Välj jodberikat salt när du saltar. Fisk, skaldjur, mejeriprodukter och ägg bidrar också.',
    source: SRC.nnr,
  })

  return out
}

// ---------------------------------------------------------------------------
// Status mot referensvärde
// ---------------------------------------------------------------------------

export type NutrientStatus = 'okant' | 'lagt' | 'nara' | 'uppnatt' | 'over_max' | 'over_ul'

/** Designtokens (se index.css) som får användas för statusfärger. */
export type StatusTone = 'mossa' | 'sol' | 'hjortron' | 'lingon' | 'ink-3'

/**
 * Svenska etiketter och färg-token för varje status. Tonen är medvetet mjuk: "Lågt" är gult/orange,
 * inte rött – bara över den övre säkerhetsgränsen (UL) används lingonrött.
 */
export const STATUS_LABELS: Record<NutrientStatus, { label: string; short: string; tone: StatusTone; description: string }> = {
  okant: {
    label: 'Okänt',
    short: '–',
    tone: 'ink-3',
    description: 'Värde saknas för flera livsmedel du ätit.',
  },
  lagt: {
    label: 'Lågt',
    short: 'Lågt',
    tone: 'hjortron',
    description: 'Under 80 % av rekommendationen i genomsnitt.',
  },
  nara: {
    label: 'Nästan',
    short: 'Nästan',
    tone: 'sol',
    description: 'Mellan 80 och 100 % av rekommendationen.',
  },
  uppnatt: {
    label: 'Uppnått',
    short: 'Bra',
    tone: 'mossa',
    description: 'Du når rekommendationen.',
  },
  over_max: {
    label: 'Över rekommendationen',
    short: 'Över',
    tone: 'hjortron',
    description: 'Mer än den rekommenderade högsta nivån – ett genomsnitt över veckan är det som räknas.',
  },
  over_ul: {
    label: 'Över övre gränsen',
    short: 'Över UL',
    tone: 'lingon',
    description: 'Över den övre gränsen för säkert intag. Oftast beror det på kosttillskott – prata gärna med vården.',
  },
}

/** Andel av rekommendationen under vilken intaget räknas som lågt. */
export const LOW_THRESHOLD = 0.8

/**
 * Status för ett (genomsnittligt dagligt) intag jämfört med referensvärdet.
 * - Okänt värde eller saknad referens → 'okant'.
 * - Över UL → 'over_ul' (går före allt annat).
 * - Över `max` → 'over_max'.
 * - Med `ri`: < 80 % → 'lagt', 80–99 % → 'nara', annars 'uppnatt'.
 * - Enbart `max` och intaget under → 'uppnatt'.
 */
export function nutrientStatus(value: number | undefined, ref: ReferenceValue | undefined): NutrientStatus {
  if (value === undefined || !Number.isFinite(value) || !ref) return 'okant'
  if (ref.ul !== undefined && value > ref.ul) return 'over_ul'
  if (ref.max !== undefined && value > ref.max) return 'over_max'
  if (ref.ri !== undefined && ref.ri > 0) {
    const ratio = value / ref.ri
    if (ratio < LOW_THRESHOLD) return 'lagt'
    if (ratio < 1) return 'nara'
    return 'uppnatt'
  }
  return 'uppnatt'
}

/**
 * Intaget i procent av referensvärdet (RI/AI, annars max). `undefined` om värdet är okänt
 * eller om referensen saknar ett positivt jämförelsevärde (t.ex. alkohol där max är 0).
 */
export function percentOfReference(value: number | undefined, ref: ReferenceValue | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || !ref) return undefined
  const base = ref.ri !== undefined && ref.ri > 0 ? ref.ri : ref.max
  if (base === undefined || base <= 0) return undefined
  return (value / base) * 100
}

// ---------------------------------------------------------------------------
// Period: genomsnitt och täckningsgrad
// ---------------------------------------------------------------------------

export interface PeriodAverages {
  /** Genomsnittligt intag per loggad dag. Ett ämne saknas om det är okänt i alla poster. */
  averages: Nutrients
  /** Antal dagar i perioden som har minst en post. */
  loggedDays: number
  /**
   * Andel (0–1) av periodens energi som kommer från poster där ämnet är känt. Låg täckning betyder att
   * genomsnittet sannolikt är för lågt (okända värden räknas inte som noll).
   */
  coverage: Partial<Record<NutrientKey, number>>
}

/**
 * Genomsnittligt dagligt intag över de dagar i `dates` som har registreringar. Oregistrerade dagar
 * räknas inte (de skulle annars dra ner snittet). Salt härleds från natrium om det saknas.
 */
export function periodAverages(entriesByDate: Record<ISODate, readonly DiaryEntry[] | undefined>, dates: readonly ISODate[]): PeriodAverages {
  const sums: Nutrients = {}
  const knownKcal: Partial<Record<NutrientKey, number>> = {}
  let totalKcal = 0
  let loggedDays = 0
  for (const date of new Set(dates)) {
    const list = entriesByDate[date]
    if (!list || list.length === 0) continue
    loggedDays++
    for (const entry of list) {
      const n = { ...entryNutrients(entry) }
      if (n.salt === undefined && n.sodium !== undefined) n.salt = saltFromSodiumMg(n.sodium)
      const kcal = n.kcal ?? 0
      totalKcal += kcal
      for (const key of NUTRIENT_KEYS) {
        const v = n[key]
        if (v === undefined || !Number.isFinite(v)) continue
        sums[key] = (sums[key] ?? 0) + v
        knownKcal[key] = (knownKcal[key] ?? 0) + kcal
      }
    }
  }
  const averages: Nutrients = {}
  const coverage: Partial<Record<NutrientKey, number>> = {}
  if (loggedDays > 0) {
    for (const key of NUTRIENT_KEYS) {
      const s = sums[key]
      if (s === undefined) continue
      averages[key] = s / loggedDays
      coverage[key] = totalKcal > 0 ? Math.min(1, (knownKcal[key] ?? 0) / totalKcal) : 1
    }
  }
  return { averages, loggedDays, coverage }
}

// ---------------------------------------------------------------------------
// Näringsämnen att hålla koll på
// ---------------------------------------------------------------------------

export interface WatchItem {
  key: NutrientKey
  status: NutrientStatus
  /** Procent av rekommendationen (om känt). */
  percent?: number
  /** Varför ämnet lyfts fram – kort och vänlig svensk text. */
  reason: string
  /** 1 = viktigast. */
  priority: 1 | 2 | 3
}

export interface WatchInput {
  sex: Sex
  age: number
  lifeStage: LifeStage
  diet?: DietType
  /** Genomsnittligt dagligt intag för perioden (se `periodAverages`). */
  averages: Nutrients
  /** Täckningsgrad per ämne (0–1). Under 50 % räknas värdet som osäkert. */
  coverage?: Partial<Record<NutrientKey, number>>
  /** Referensvärden – beräknas från profilen om de saknas. */
  refs?: ReferenceMap
  weightKg?: number
  kcal?: number
}

/** Minsta täckningsgrad för att ett lågt värde ska tolkas som verkligt lågt. */
export const MIN_COVERAGE = 0.5

/**
 * Näringsämnen som är extra viktiga att hålla koll på för en period, sorterade efter prioritet.
 *
 * Tar med ämnen som är kända riskområden i Sverige (vitamin D, jod), för gruppen (järn och folat för
 * kvinnor i fertil ålder, B12/kalcium/selen/jod vid vegankost, vitamin D från 75 år) samt alla ämnen
 * som ligger lågt eller över UL. Ämnen som uppnås tas inte med – förutom B12 vid vegankost, där
 * tillskott rekommenderas oavsett.
 */
/** Gemen första bokstav men behåll resten ("Vitamin C" → "vitamin C", inte "vitamin c"). */
function lowerFirst(name: string): string {
  return name.charAt(0).toLocaleLowerCase('sv-SE') + name.slice(1)
}

export function nutrientsToWatch(input: WatchInput): WatchItem[] {
  const { sex, age, lifeStage, diet, averages, coverage } = input
  const refs = input.refs ?? referenceIntakes({ sex, age, lifeStage, weightKg: input.weightKg, kcal: input.kcal })
  const woman = sex === 'kvinna'
  const stage: LifeStage = woman ? lifeStage : 'ingen'
  const vegan = diet === 'vegan'
  const vegetarian = diet === 'vegetarian' || vegan

  /** Grupprelevanta ämnen med prioritet och förklaring. */
  const special = new Map<NutrientKey, { priority: 1 | 2 | 3; reason: string; always?: boolean }>()
  special.set('vitD', {
    priority: age >= 75 ? 1 : 2,
    reason:
      age >= 75
        ? 'Från 75 år är behovet dubbelt så stort. Tillskott kan behövas – fråga gärna vården.'
        : 'Solen räcker inte under vinterhalvåret i Sverige. Fet fisk och D-berikade mejeriprodukter och matfett hjälper.',
  })
  special.set('iodine', {
    priority: vegan || stage !== 'ingen' ? 1 : 3,
    reason: vegan
      ? 'Vegansk kost ger lite jod. Använd jodberikat salt och välj jodberikade växtdrycker.'
      : 'Välj jodberikat salt när du saltar – flingsalt och havssalt saknar oftast jod.',
  })
  if (woman && (age < 51 || stage !== 'ingen')) {
    special.set('iron', {
      priority: stage === 'gravid' ? 1 : 2,
      reason: 'Kvinnor i fertil ålder har större järnbehov. Kombinera järnrik mat med C-vitamin, t.ex. paprika eller apelsin.',
    })
  }
  if (woman && (age < 50 || stage === 'gravid')) {
    special.set('folate', {
      priority: stage === 'gravid' ? 1 : 2,
      reason:
        stage === 'gravid'
          ? 'Folat är extra viktigt under graviditeten. Livsmedelsverket rekommenderar ett tillskott med 400 µg folsyra per dag fram till vecka 12.'
          : 'Viktigt för dig som kan bli gravid – ät gärna gröna bladgrönsaker, baljväxter och fullkorn. Kan du bli gravid inom några månader rekommenderas även 400 µg folsyratillskott per dag.',
    })
  }
  if (vegan) {
    special.set('vitB12', {
      priority: 1,
      always: true,
      reason: 'B12 finns nästan bara i animaliska livsmedel. Vid vegansk kost behövs tillskott eller berikade produkter varje dag.',
    })
    special.set('calcium', {
      priority: 2,
      reason: 'Välj kalciumberikade växtdrycker och växtbaserade yoghurtar – ekologiska varianter är ofta inte berikade.',
    })
    special.set('selenium', {
      priority: 3,
      reason: 'Selen kommer mest från fisk, ägg och mejeri. Paranötter är en växtbaserad källa (1–2 st räcker).',
    })
    special.set('zinc', {
      priority: 3,
      reason: 'Vid växtbaserad kost tas zink upp sämre. Surdegsbröd, blötlagda bönor och nötter hjälper.',
    })
  } else if (vegetarian) {
    special.set('vitB12', {
      priority: 2,
      reason: 'Som vegetarian får du B12 främst från mejeriprodukter och ägg – se till att äta dem regelbundet.',
    })
  }
  if (age >= 65) {
    special.set('protein', {
      priority: 2,
      reason: 'Med åren behövs mer protein för att behålla muskler och styrka. Fördela det gärna över dagens måltider.',
    })
  }

  const items: WatchItem[] = []
  for (const key of NUTRIENT_KEYS) {
    const ref = refs[key]
    if (!ref) continue
    const value = averages[key]
    const cov = coverage?.[key]
    const uncertain = value === undefined || (cov !== undefined && cov < MIN_COVERAGE)
    let status = nutrientStatus(value, ref)
    // Osäkert lågt värde (många livsmedel saknar värdet) visas som okänt i stället för lågt.
    if (uncertain && (status === 'lagt' || status === 'nara')) status = 'okant'
    const percent = percentOfReference(value, ref)
    const s = special.get(key)

    if (status === 'over_ul') {
      items.push({
        key,
        status,
        percent,
        priority: 1,
        reason: `${NUTRIENTS[key].name} ligger över den övre gränsen för säkert intag. Det beror oftast på kosttillskott eller berikade produkter.`,
      })
      continue
    }
    if (s) {
      const relevant = s.always || status === 'lagt' || status === 'nara' || status === 'okant'
      if (relevant) {
        const unknownNote = status === 'okant' ? ' Många av livsmedlen du ätit saknar värde, så vi kan inte säga säkert.' : ''
        items.push({ key, status, percent, priority: s.priority, reason: s.reason + unknownNote })
      }
      continue
    }
    // Övriga ämnen lyfts bara när de är tydligt låga och värdet är tillförlitligt. Ämnen med
    // adekvat intag (AI – t.ex. kalium, magnesium, selen, vitamin E och K) tas inte med: ett intag
    // under AI betyder inte att det är för lågt (NNR 2023, EFSA), så "Lågt" vore att överdriva.
    if (status === 'lagt' && ref.kind === 'ri' && !uncertain) {
      items.push({
        key,
        status,
        percent,
        priority: 3,
        reason: `Du får i genomsnitt ${percent !== undefined ? Math.round(percent) : '–'} % av rekommendationen för ${lowerFirst(NUTRIENTS[key].name)}.`,
      })
    }
  }

  return items.sort((a, b) => a.priority - b.priority || (a.percent ?? 0) - (b.percent ?? 0))
}
