/**
 * Tallriksmodellen – Livsmedelsverkets pedagogiska modell för en lagom fördelad måltid.
 *
 * Modellen har tre delar (Livsmedelsverket, livsmedelsverket.se/tallriksmodellen, uppdaterad 2025):
 * 1. Grönsaker och rotfrukter (frukt och bär räknas hit i t.ex. frukost och mellanmål).
 * 2. Potatis, pasta, bröd eller gryn som ris, bulgur, mathavre och matkorn – gärna fullkorn.
 * 3. Kött, fisk, ägg eller baljväxter – en femtedel av tallriken.
 *
 * Två varianter:
 * - "vanlig" (för dig som rör dig lite): grönsaker och rotfrukter fyller halva tallriken.
 * - "aktiv" (för dig som rör dig mycket): grönsaksdelen och potatis-/pasta-/bröd-/grynsdelen är lika stora.
 *
 * Observera: i Tallriksmodellen räknas baljväxter till proteindelen (inte till grönsaksdelen).
 * Matfett, såser, dryck och sötsaker ingår inte i tallrikens tre delar och redovisas som "övrigt".
 */
import type { DiaryEntry, Food, FoodCategory, PlateSplit } from '../types'

export type PlateVariant = 'vanlig' | 'aktiv'

export type PlatePart = keyof PlateSplit

/** Idealfördelning (andelar av grönsaker + kolhydrater + protein). */
export const PLATE_IDEAL: Record<PlateVariant, PlateSplit> = {
  // Grönsaker hälften, protein en femtedel → kolhydratdelen 30 %.
  vanlig: { veg: 0.5, carb: 0.3, protein: 0.2 },
  // Protein en femtedel, grönsaker och kolhydrater delar lika på resten.
  aktiv: { veg: 0.4, carb: 0.4, protein: 0.2 },
}

export const PLATE_VARIANT_LABELS: Record<PlateVariant, { label: string; description: string }> = {
  vanlig: {
    label: 'Tallriksmodellen',
    description: 'Låt grönsaker och rotfrukter fylla halva tallriken.',
  },
  aktiv: {
    label: 'Tallriksmodellen – för dig som rör dig mycket',
    description: 'Grönsaksdelen och delen med potatis, pasta, bröd eller gryn är lika stora.',
  },
}

export const PLATE_PART_LABELS: Record<PlatePart, { label: string; examples: string }> = {
  veg: { label: 'Grönsaker och rotfrukter', examples: 'grönsaker, rotfrukter, frukt och bär' },
  carb: { label: 'Potatis, pasta, bröd och gryn', examples: 'potatis, pasta, ris, bröd, bulgur och matvete' },
  protein: { label: 'Kött, fisk, ägg och baljväxter', examples: 'fisk, kyckling, ägg, bönor, linser och tofu' },
}

type Split = PlateSplit & { other: number }

const VEG: Split = { veg: 1, carb: 0, protein: 0, other: 0 }
const CARB: Split = { veg: 0, carb: 1, protein: 0, other: 0 }
const PROTEIN: Split = { veg: 0, carb: 0, protein: 1, other: 0 }
const OTHER: Split = { veg: 0, carb: 0, protein: 0, other: 1 }

/**
 * Schablon per kategori. Sammansatta rätter får en typisk fördelning (Lagoms uppskattning) –
 * recept och egna livsmedel bör hellre ange `plate` utifrån ingredienserna.
 */
export const CATEGORY_PLATE: Record<FoodCategory, Split> = {
  gronsaker: VEG,
  rotfrukter: VEG,
  frukt: VEG,
  bar: VEG,
  // Tallriksmodellen: "kött, fisk, ägg eller baljväxter".
  baljvaxter: PROTEIN,
  potatis: CARB,
  spannmal: CARB,
  brod: CARB,
  pasta_ris: CARB,
  rott_kott: PROTEIN,
  chark: PROTEIN,
  fagel: PROTEIN,
  fisk: PROTEIN,
  skaldjur: PROTEIN,
  agg: PROTEIN,
  vegoprotein: PROTEIN,
  // Ost räknas som proteinkälla på tallriken (t.ex. halloumi, keso), men mjölk/fil räknas som dryck/tillbehör.
  ost: PROTEIN,
  mejeri: OTHER,
  vaxtdryck: OTHER,
  // Nötter och frön är ett eget kostråd och ingår inte i tallrikens tre delar.
  notter_fron: OTHER,
  fett_olja: OTHER,
  sas_krydda: OTHER,
  sotsaker: OTHER,
  bakverk: OTHER,
  glass_dessert: OTHER,
  snacks: OTHER,
  dryck: OTHER,
  lask_saft: OTHER,
  juice: OTHER,
  alkohol: OTHER,
  // Typisk husmanskost, t.ex. köttbullar med potatis och lingon eller en gryta med ris.
  fardigratt: { veg: 0.2, carb: 0.4, protein: 0.25, other: 0.15 },
  // Hamburgare, pizza, kebab – mycket bröd/deg, lite grönt.
  snabbmat: { veg: 0.1, carb: 0.45, protein: 0.25, other: 0.2 },
  kosttillskott: OTHER,
  ovrigt: OTHER,
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))

/**
 * Hur livsmedlets vikt fördelar sig på tallrikens delar (andelar 0–1 som summerar till 1).
 * `food.plate` används om det finns – det som inte täcks blir "övrigt" – annars kategorins schablon.
 */
export function foodPlate(food: Food): Split {
  if (food.plate) {
    const veg = clamp01(food.plate.veg)
    const carb = clamp01(food.plate.carb)
    const protein = clamp01(food.plate.protein)
    const total = veg + carb + protein
    // Skala ner om summan överstiger 1 (felaktig data).
    const k = total > 1 ? 1 / total : 1
    return { veg: veg * k, carb: carb * k, protein: protein * k, other: Math.max(0, 1 - total * k) }
  }
  return { ...CATEGORY_PLATE[food.category] }
}

export interface MealPlate {
  variant: PlateVariant
  /** Gram per del (inklusive "övrigt" som inte ingår i modellen). */
  grams: { veg: number; carb: number; protein: number; other: number }
  /** Andelar av grönsaker + kolhydrater + protein (summa 1, eller 0 om tallriken är tom). */
  fractions: PlateSplit
  /** Idealfördelningen för varianten. */
  ideal: PlateSplit
  /** 0–1: hur nära idealet måltiden är (1 = exakt enligt modellen). */
  score: number
  /** Den del som saknas mest (eller undefined om tallriken är lagom/tom). */
  focus?: PlatePart
  /** Vänligt råd på svenska. */
  advice: string
  /** true om det finns något alls att bedöma på tallriken. */
  hasPlate: boolean
}

/** Poäng för hur lik en fördelning är idealet: 1 − total variationsavstånd. */
export function plateScore(fractions: PlateSplit, ideal: PlateSplit): number {
  const d = Math.abs(fractions.veg - ideal.veg) + Math.abs(fractions.carb - ideal.carb) + Math.abs(fractions.protein - ideal.protein)
  return clamp01(1 - d / 2)
}

/** Poäng från vilken tallriken räknas som lagom. */
export const PLATE_GOOD_SCORE = 0.85

const ADD_ADVICE: Record<PlatePart, string> = {
  veg: 'Lägg till en näve grönsaker så blir tallriken mer lagom – råkost, frysta grönsaker eller en tomat räcker långt.',
  carb: 'Komplettera med potatis, fullkornspasta, bröd eller gryn så får du energi som räcker längre.',
  protein: 'Lägg till lite protein, till exempel bönor, ägg, fisk eller kyckling, så håller du dig mätt längre.',
}

const LESS_ADVICE: Record<PlatePart, string> = {
  veg: 'Mycket grönt – härligt! Lite potatis, bröd eller gryn och något proteinrikt gör måltiden mer mättande.',
  carb: 'Kolhydratdelen är stor. Byt gärna en del av den mot grönsaker så blir tallriken mer lagom.',
  protein: 'Proteindelen är stor. Byt gärna en del av den mot grönsaker eller baljväxter.',
}

/**
 * Tallriksfördelning för en måltid (eller vilka poster som helst). Bara matposter med gramvikt
 * räknas – snabbposter (kalorier utan livsmedel) saknar vikt och ingår inte.
 */
export function mealPlate(entries: readonly DiaryEntry[], variant: PlateVariant = 'vanlig'): MealPlate {
  const grams = { veg: 0, carb: 0, protein: 0, other: 0 }
  for (const e of entries) {
    if (e.kind !== 'food' || !Number.isFinite(e.grams) || e.grams <= 0) continue
    const s = foodPlate(e.food)
    grams.veg += s.veg * e.grams
    grams.carb += s.carb * e.grams
    grams.protein += s.protein * e.grams
    grams.other += s.other * e.grams
  }
  const ideal = PLATE_IDEAL[variant]
  const plateTotal = grams.veg + grams.carb + grams.protein

  if (plateTotal <= 0) {
    return {
      variant,
      grams,
      fractions: { veg: 0, carb: 0, protein: 0 },
      ideal,
      score: 0,
      hasPlate: false,
      advice:
        grams.other > 0
          ? 'Här finns inget som räknas till tallrikens tre delar – helt okej för en fika eller ett mellanmål.'
          : 'Registrera en måltid så visar vi hur tallriken ser ut.',
    }
  }

  const fractions: PlateSplit = {
    veg: grams.veg / plateTotal,
    carb: grams.carb / plateTotal,
    protein: grams.protein / plateTotal,
  }
  const score = plateScore(fractions, ideal)
  const parts: PlatePart[] = ['veg', 'carb', 'protein']

  if (score >= PLATE_GOOD_SCORE) {
    return { variant, grams, fractions, ideal, score, hasPlate: true, advice: 'Snyggt – tallriken är riktigt lagom fördelad!' }
  }

  // Största underskottet styr rådet; finns inget tydligt underskott pratar vi om överskottet.
  const deficit = parts
    .map((p) => ({ p, gap: ideal[p] - fractions[p] }))
    .sort((a, b) => b.gap - a.gap)[0]
  if (deficit.gap >= 0.1) {
    return { variant, grams, fractions, ideal, score, hasPlate: true, focus: deficit.p, advice: ADD_ADVICE[deficit.p] }
  }
  const excess = parts
    .map((p) => ({ p, gap: fractions[p] - ideal[p] }))
    .sort((a, b) => b.gap - a.gap)[0]
  return {
    variant,
    grams,
    fractions,
    ideal,
    score,
    hasPlate: true,
    focus: deficit.gap > 0 ? deficit.p : undefined,
    advice: LESS_ADVICE[excess.p],
  }
}
