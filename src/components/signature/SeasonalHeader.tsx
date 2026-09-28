/**
 * Säsongshuvudet – ett dekorativt svenskt landskap överst på Idag-skärmen.
 *
 * Landskapet följer årstiden och tiden på dygnet:
 * - Himmel i gryning, dag, skymning eller natt. Solen står där den verkligen står
 *   (solhöjd och dagsförlopp för Stockholm via `lib/season`), månen visar rätt månfas.
 * - Vinternätter: stjärnor och ett stilla böljande norrsken. Sommarnätter: midnattssolens glöd.
 * - Fjäll med snötäcke (vinter), snörester (vår), en envis snöfläck på högsta toppen (sommar)
 *   och årets första snö (höst).
 * - Åsar, granskog, en sjö med spegling (islagd på vintern), brygga och eka.
 * - En liten faluröd stuga med vita knutar, flaggstång med vimpel och tänt fönster när det är mörkt.
 * - Björkar med musöron på våren, fulla kronor på sommaren och guld på hösten; fallande löv
 *   på hösten, snöfall på vinterdagar, flyttfåglar vår och höst, blommor i gräset.
 *
 * Tekniskt: landskapet är uppdelat i lager (SVG med samma viewBox) som rör sig med olika
 * hastighet när sidan scrollas (parallax). Återkommande animationer görs med CSS-transformer och
 * opacitet så att webbläsaren kan köra dem på kompositorn. Allt stängs av vid reducerad rörelse.
 * Alla färger härleds från designsystemets CSS-variabler med `color-mix`. I mörkt tema används en
 * egen, lägre "exponering" (tokens blandas mot svart i stället för vitt) så att landskapet blir djupt.
 */
import { useEffect, useId, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { skyPhase as computeSkyPhase, sunAltitude, sunTimes, swedishSeason, type Season, type SkyPhase } from '../../lib/season'
import type { ISODate } from '../../types'

export type { Season, SkyPhase }

export interface SeasonalHeaderProps {
  /** Dagen som visas – styr årstiden om `season` saknas. */
  date: ISODate
  /** Tidpunkt för himlen (standard: nu, uppdateras var femte minut). */
  now?: Date
  /** Tvinga en årstid. */
  season?: Season
  /** Tvinga en fas på dygnet. */
  phase?: SkyPhase
  /** Höjd i px (standard 176). */
  height?: number
  /**
   * Innehåll ovanpå landskapet, t.ex. en hälsning. Text ärver en läsbar färg: `text-ink`,
   * `text-ink-2` och `text-ink-3` justeras automatiskt mot en mörk natthimmel.
   */
  children?: ReactNode
  className?: string
  /** Klasser för innehållsytan (standard: överst, sidomarginal 1 rem). */
  contentClassName?: string
}

// ---------------------------------------------------------------------------
// Publika hjälpfunktioner
// ---------------------------------------------------------------------------

const SCENE_LABELS: Record<Season, Record<SkyPhase, string>> = {
  vinter: { natt: 'Vinternatt', gryning: 'Vintergryning', dag: 'Vinterdag', skymning: 'Vinterskymning' },
  var: { natt: 'Vårnatt', gryning: 'Vårmorgon', dag: 'Vårdag', skymning: 'Vårkväll' },
  sommar: { natt: 'Ljus sommarnatt', gryning: 'Sommarmorgon', dag: 'Sommardag', skymning: 'Sommarkväll' },
  host: { natt: 'Höstnatt', gryning: 'Höstmorgon', dag: 'Höstdag', skymning: 'Höstkväll' },
}

/** Kort svensk beskrivning av stämningen, t.ex. "Höstmorgon" eller "Ljus sommarnatt". */
export function sceneLabel(season: Season, phase: SkyPhase): string {
  return SCENE_LABELS[season][phase]
}

const SYNODIC_MONTH = 29.530588853
/** En känd nymåne: 6 januari 2000 kl. 18.14 UTC. */
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14)

/** Månfas 0–1: 0 = nymåne, 0,25 = första kvarter, 0,5 = fullmåne, 0,75 = sista kvarter. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - NEW_MOON_REF) / 86_400_000
  return (((days / SYNODIC_MONTH) % 1) + 1) % 1
}

/**
 * Den upplysta delen av månen som SVG-väg (norra halvklotet: tilltagande måne lyser från höger).
 * Ytterkanten är en halvcirkel och terminatorn en halvellips.
 */
export function moonLitPath(cx: number, cy: number, r: number, phase: number): string {
  const k = Math.cos(2 * Math.PI * phase)
  const waxing = phase < 0.5
  const crescent = k > 0
  const rx = Math.abs(k) * r
  const limbSweep = waxing ? 1 : 0
  const termSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0
  return `M${cx} ${cy - r}A${r} ${r} 0 0 ${limbSweep} ${cx} ${cy + r}A${rx.toFixed(3)} ${r} 0 0 ${termSweep} ${cx} ${cy - r}Z`
}

// ---------------------------------------------------------------------------
// Färger – allt härleds från designsystemets tokens
// ---------------------------------------------------------------------------

const tok = (name: string) => `var(--lg-${name})`
const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`
const WHITE = 'white'
const BLACK = 'black'

interface Palette {
  skyTop: string
  skyMid: string
  horizon: string
  sun: string
  moon: string
  aurora: string
  auroraTop: string
  cloud: string | null
  star: string
  fjall: string
  /** Snö på fjälltopparna (dämpad i mörkt tema så att ljus text ovanpå förblir läsbar). */
  fjallSnow: string
  snow: string
  hills: string
  farForest: string
  lakeTop: string
  lakeBottom: string
  ripple: string
  ground: string
  groundEdge: string
  spruce: string
  spruceLit: string
  treeSnow: string
  falu: string
  faluSide: string
  trim: string
  roof: string
  door: string
  glass: string
  stone: string
  wood: string
  boat: string
  bark: string
  barkMark: string
  leaves: string | null
  leaves2: string | null
  flagBlue: string
  flagYellow: string
  bird: string
  mist: string
}

/**
 * Himlens tre toner (topp, mitt, horisont). I mörkt tema blandas mot svart i stället för vitt –
 * samma stämning men med lägre "exponering", så att landskapet blir djupt i stället för grådaskigt.
 */
function skyColors(season: Season, phase: SkyPhase, dark: boolean): [string, string, string] {
  const blabar = tok('blabar')
  if (dark && phase !== 'natt') {
    if (phase === 'gryning') return [mix(blabar, 34, BLACK), mix(mix(tok('lingon'), 60, blabar), 44, BLACK), mix(tok('hjortron'), 60, BLACK)]
    if (phase === 'skymning') return [mix(mix(blabar, 70, tok('vinbar')), 32, BLACK), mix(tok('lingon'), 42, BLACK), mix(tok('hjortron'), 64, BLACK)]
    const warm = season === 'sommar' ? tok('sol') : season === 'host' ? tok('hjortron') : season === 'var' ? tok('mossa') : tok('fjall')
    return [mix(tok('fjall'), 36, BLACK), mix(tok('fjall'), 48, BLACK), mix(mix(tok('fjall'), 70, warm), 60, BLACK)]
  }
  switch (phase) {
    case 'natt':
      if (season === 'sommar') return [mix(blabar, 50, BLACK), mix(mix(tok('vinbar'), 55, blabar), 58, BLACK), mix(tok('hjortron'), 60, WHITE)]
      if (season === 'vinter') return [mix(blabar, 20, BLACK), mix(blabar, 30, BLACK), mix(mix(tok('gran'), 40, tok('fjall')), 40, BLACK)]
      return [mix(blabar, 22, BLACK), mix(blabar, 32, BLACK), mix(mix(blabar, 60, tok('fjall')), 46, BLACK)]
    case 'gryning':
      return [mix(blabar, 36, WHITE), mix(tok('lingon'), 26, WHITE), mix(tok('hjortron'), 55, tok('sol'))]
    case 'skymning':
      return [mix(mix(blabar, 70, tok('vinbar')), 48, WHITE), mix(tok('lingon'), 40, WHITE), mix(tok('hjortron'), 72, tok('lingon'))]
    default:
      if (season === 'vinter') return [mix(tok('fjall'), 46, WHITE), mix(tok('fjall'), 22, WHITE), mix(tok('fjall'), 8, WHITE)]
      if (season === 'sommar') return [mix(tok('fjall'), 66, WHITE), mix(tok('fjall'), 34, WHITE), mix(tok('sol'), 20, WHITE)]
      if (season === 'host') return [mix(tok('fjall'), 56, WHITE), mix(tok('fjall'), 28, WHITE), mix(tok('hjortron'), 18, WHITE)]
      return [mix(tok('fjall'), 58, WHITE), mix(tok('fjall'), 30, WHITE), mix(tok('mossa'), 14, WHITE)]
  }
}

/** Färgerna för en årstid, fas och ett tema. Exporteras för tester. */
export function buildPalette(season: Season, phase: SkyPhase, dark = false): Palette {
  const [skyTop, skyMid, horizon] = skyColors(season, phase, dark)
  const lightNight = season === 'sommar' && phase === 'natt'

  // Ljussättning av marken: skymning och natt blandas mot en blåaktig skugga
  // (i mörkt tema även dagtid – som en dämpad vinterdag).
  const dusk = { toward: mix(mix(tok('vinbar'), 40, tok('blabar')), 40, BLACK) }
  const blueShadow = (pct: number) => mix(tok('blabar'), pct, BLACK)
  const shadeSpec: { keep: number; toward: string } | null =
    phase === 'natt'
      ? lightNight
        ? { keep: 46, toward: blueShadow(40) }
        : { keep: 28, toward: blueShadow(24) }
      : phase === 'dag'
        ? dark
          ? { keep: 62, toward: blueShadow(28) }
          : null
        : phase === 'gryning'
          ? { keep: dark ? 54 : 76, toward: dusk.toward }
          : { keep: dark ? 48 : 66, toward: blueShadow(38) }
  const shade = (c: string, boost = 0) => (shadeSpec ? mix(c, Math.min(100, shadeSpec.keep + boost), shadeSpec.toward) : c)
  const atm = (c: string, pct: number) => mix(c, pct, horizon)
  const dimFar = (c: string, pct: number) => (dark && phase !== 'natt' ? mix(c, pct, skyMid) : c)

  const fjallBase = season === 'vinter' ? mix(tok('fjall'), 18, WHITE) : mix(mix(tok('blabar'), 45, tok('fjall')), 55, WHITE)
  const hillsBase =
    season === 'vinter'
      ? mix(WHITE, 78, tok('fjall'))
      : season === 'var'
        ? mix(tok('mossa'), 68, tok('sol'))
        : season === 'sommar'
          ? mix(tok('mossa'), 82, tok('gran'))
          : mix(tok('hjortron'), 58, tok('lingon'))
  const groundBase =
    season === 'vinter'
      ? mix(WHITE, 90, tok('fjall'))
      : season === 'var'
        ? mix(tok('mossa'), 72, tok('sol'))
        : season === 'sommar'
          ? mix(tok('mossa'), 84, tok('sol'))
          : mix(mix(tok('mossa'), 55, tok('hjortron')), 82, tok('sol'))
  const frozen = season === 'vinter'
  const leavesBase =
    season === 'var'
      ? mix(tok('mossa'), 50, tok('sol'))
      : season === 'sommar'
        ? mix(tok('mossa'), 78, tok('gran'))
        : season === 'host'
          ? mix(tok('sol'), 62, tok('hjortron'))
          : null
  const leaves2Base =
    season === 'var'
      ? mix(tok('mossa'), 70, tok('sol'))
      : season === 'sommar'
        ? mix(tok('mossa'), 92, tok('sol'))
        : season === 'host'
          ? mix(tok('hjortron'), 70, tok('lingon'))
          : null

  return {
    skyTop,
    skyMid,
    horizon,
    sun:
      phase === 'dag'
        ? mix(tok('sol'), 58, WHITE)
        : phase === 'natt'
          ? mix(tok('hjortron'), 55, tok('sol'))
          : mix(tok('sol'), 55, tok('hjortron')),
    moon: mix(WHITE, 88, tok('sol')),
    // Norrskenets gröna och violetta ton: tokens kulörton med höjd ljushet och mättnad.
    aurora: `oklch(from ${tok('gran')} 0.84 0.16 h)`,
    auroraTop: `oklch(from ${tok('vinbar')} 0.72 0.13 h)`,
    cloud: (() => {
      if (phase === 'natt') return null
      const base =
        phase === 'dag'
          ? mix(WHITE, 90, tok('fjall'))
          : phase === 'gryning'
            ? mix(mix(tok('lingon'), 40, tok('sol')), 30, WHITE)
            : mix(mix(tok('lingon'), 50, tok('vinbar')), 42, WHITE)
      return dark ? mix(base, 38, skyMid) : base
    })(),
    star: mix(WHITE, 92, tok('sol')),
    // Fjällen ligger bakom rubriken: i mörkt tema tonas de mot himlen för läsbar ljus text.
    fjall: dimFar(shade(atm(fjallBase, 70)), 40),
    fjallSnow: dimFar(shade(mix(WHITE, 92, tok('fjall')), 20), 44),
    snow: shade(mix(WHITE, 92, tok('fjall')), 20),
    hills: shade(atm(hillsBase, 74)),
    farForest: shade(atm(mix(tok('gran'), 62, BLACK), 62)),
    lakeTop: frozen ? shade(mix(WHITE, 78, tok('fjall')), 14) : shade(mix(horizon, 60, tok('fjall'))),
    lakeBottom: frozen ? shade(mix(WHITE, 60, tok('fjall')), 14) : shade(mix(skyTop, 45, mix(tok('fjall'), 60, BLACK))),
    ripple: shade(mix(horizon, 55, WHITE), 10),
    ground: shade(groundBase, frozen ? 16 : 0),
    groundEdge: shade(mix(groundBase, 70, WHITE), frozen ? 16 : 0),
    spruce: shade(mix(tok('gran'), 56, BLACK)),
    spruceLit: shade(mix(tok('gran'), 74, BLACK)),
    treeSnow: shade(mix(WHITE, 94, tok('fjall')), 22),
    falu: shade(mix(tok('lingon'), 74, BLACK)),
    faluSide: shade(mix(tok('lingon'), 56, BLACK)),
    trim: shade(mix(WHITE, 92, tok('sol')), 10),
    roof: shade(mix(tok('blabar'), 22, BLACK)),
    door: shade(mix(tok('gran'), 55, BLACK)),
    glass: shade(mix(tok('fjall'), 45, BLACK)),
    stone: shade(mix(WHITE, 55, mix(tok('blabar'), 30, BLACK))),
    wood: shade(mix(tok('hjortron'), 38, BLACK)),
    boat: shade(mix(tok('lingon'), 80, BLACK)),
    bark: shade(mix(WHITE, 92, tok('sol')), 10),
    barkMark: shade(mix(tok('gran'), 20, BLACK)),
    leaves: leavesBase && shade(leavesBase),
    leaves2: leaves2Base && shade(leaves2Base),
    flagBlue: shade(mix(tok('fjall'), 50, tok('blabar'))),
    flagYellow: shade(tok('sol'), 10),
    bird: mix(tok('blabar'), 30, BLACK),
    mist: mix(WHITE, 80, horizon),
  }
}

// ---------------------------------------------------------------------------
// Geometri (viewBox 800 × 180). Allt statiskt beräknas en gång när modulen laddas.
// ---------------------------------------------------------------------------

/**
 * Huvudmotivet ritas för x 0–800 (mitten 400 syns alltid), men scenen fortsätter ut till
 * X0…X1 så att breda behållare (upp till ≈ 980 px vid standardhöjd) inte beskär himlen.
 */
const W = 800
const X0 = -100
const X1 = 900
const H = 180
/** Bortre strandlinjen = sjöns överkant. */
const HY = 124

type Pt = readonly [number, number]

/** Deterministisk slump (mulberry32) – landskapet ser likadant ut varje gång. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const f1 = (n: number) => n.toFixed(1)

/** Mjuk kurva genom punkterna (Catmull–Rom → Bézier), stängd ned till `baseY`. */
function smoothRidge(points: readonly Pt[], baseY: number): string {
  let d = `M${points[0][0]} ${baseY}L${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${p2[0]} ${p2[1]}`
  }
  const last = points[points.length - 1]
  return `${d}L${last[0]} ${baseY}Z`
}

/** Gamla, rundade svenska fjäll – toppen mitt i bild syns även på smala skärmar. */
const FJALL_PTS: readonly Pt[] = [[X0 - 20, 96], [-60, 88], [-20, 100], [40, 94], [110, 99], [190, 79], [250, 92], [310, 86], [390, 66], [460, 88], [520, 82], [600, 71], [680, 94], [740, 86], [820, 98], [870, 84], [X1 + 20, 94]]
const FJALL_D = smoothRidge(FJALL_PTS, 128)

/** Fjällkammens höjd vid x (linjär interpolation – tillräckligt för att placera solen på kammen). */
function ridgeY(x: number): number {
  for (let i = 0; i < FJALL_PTS.length - 1; i++) {
    const [x0, y0] = FJALL_PTS[i]
    const [x1, y1] = FJALL_PTS[i + 1]
    if (x >= x0 && x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
  }
  return FJALL_PTS[FJALL_PTS.length - 1][1]
}
const HILLS_D = smoothRidge(
  [[X0 - 20, 111], [-40, 115], [70, 109], [160, 115], [250, 110], [330, 116], [420, 108], [520, 114], [600, 110], [700, 116], [820, 110], [X1 + 20, 115]],
  128,
)

/** Snögräns per årstid (y-värde; mindre = högre upp). */
const SNOWLINE: Record<Season, number> = { vinter: 118, var: 86, sommar: 72, host: 77 }

/** Klippyta ovanför snögränsen, med ojämn nederkant som snöfläckar. */
function snowClipPath(line: number): string {
  const r = rng(line * 7 + 3)
  let d = `M${X0 - 20} 0H${X1 + 20}V${line}`
  for (let x = X1 + 20, i = 0; x >= X0 - 20; x -= 13, i++) d += `L${x} ${f1(line + (i % 2 ? 3.4 : -1.6) + r() * 2)}`
  return `${d}Z`
}

/** Liten gran i fjärran: en smal triangel. */
function tinySpruce(x: number, base: number, h: number): string {
  const w = h * 0.3
  return `M${f1(x)} ${f1(base - h)}L${f1(x + w)} ${base}L${f1(x - w)} ${base}Z`
}

/** Skogsbrynet på andra sidan sjön. */
const FAR_FOREST_D = (() => {
  const r = rng(11)
  let d = `M${X0 - 10} ${HY - 1}H${X1 + 10}V${HY + 3}H${X0 - 10}Z`
  for (let x = X0 - 8; x < X1 + 8; x += 4.6 + r() * 2.6) {
    if (r() > 0.93) {
      x += 18 // en glänta
      continue
    }
    d += tinySpruce(x, HY + 0.5, 5 + r() * 7 + (x > 520 ? 2 : 0))
  }
  return d
})()

interface SpruceShape {
  left: string
  right: string
  snow: string
}

/** Stiliserad gran i två halvor (skugg- och solsida) med hängande grenvåningar. */
function spruce(x: number, base: number, h: number): SpruceShape {
  const tiers = h > 44 ? 5 : 4
  const w = h * 0.3
  const top = base - h
  const crownH = h * 0.86
  const trunk = Math.max(0.9, h * 0.035)
  const side = (dir: 1 | -1) => {
    let d = `M${f1(x)} ${f1(top)}`
    let snow = ''
    let prev: Pt = [x, top]
    for (let k = 1; k <= tiers; k++) {
      const y = top + (crownH * k) / tiers
      const wk = (w * k) / tiers
      const tip: Pt = [x + dir * wk, y]
      const notch: Pt = [x + dir * wk * 0.42, y - (crownH / tiers) * 0.14]
      d += `L${f1(tip[0])} ${f1(tip[1])}`
      snow += `M${f1(prev[0])} ${f1(prev[1] - 0.5)}L${f1(prev[0] + (tip[0] - prev[0]) * 0.8)} ${f1(prev[1] + (tip[1] - prev[1]) * 0.8 - 0.5)}`
      if (k < tiers) d += `L${f1(notch[0])} ${f1(notch[1])}`
      prev = notch
    }
    d += `L${f1(x + dir * trunk)} ${f1(top + crownH)}L${f1(x + dir * trunk)} ${base}L${f1(x)} ${base}Z`
    return { d, snow }
  }
  const l = side(-1)
  const r = side(1)
  return { left: l.d, right: r.d, snow: l.snow + r.snow }
}

/** Granskogen i förgrunden: en grupp till vänster och en tätare till höger. */
const NEAR_SPRUCES: SpruceShape[] = [
  [-86, 153, 58], [-66, 152, 44], [-44, 153, 64], [-22, 152, 50], [0, 153, 40], [22, 154, 56], [48, 153, 34],
  [812, 152, 62], [834, 153, 48], [856, 152, 70], [880, 153, 52],
  [92, 153, 40], [112, 154, 52], [132, 153, 36], [150, 154, 46], [172, 153, 34],
  [196, 154, 30], [212, 153, 38], [229, 154, 26], [244, 153, 31],
  [566, 152, 44], [584, 153, 58], [603, 152, 70], [622, 153, 52], [641, 152, 76], [661, 153, 60],
  [681, 152, 72], [702, 153, 50], [722, 152, 64], [744, 153, 48], [766, 152, 66], [790, 153, 54],
].map(([x, base, h]) => spruce(x, base, h))

const SHORE = `M${X0 - 10} 151C-40 154 20 150 60 150.6S140 154 230 152S380 149 440 151.5S560 150 640 152S760 150 820 151.4S880 153 ${X1 + 10} 151`
const NEAR_LAND_D = `${SHORE}L${X1 + 10} ${H + 1}L${X0 - 10} ${H + 1}Z`
const SHORE_EDGE_D = SHORE
const BOTTOM_BLEND_D = `M${X0 - 10} 170C-20 173 40 168 120 168.4S260 172 400 168S640 165 ${W + 10} 170S870 172 ${X1 + 10} 169L${X1 + 10} ${H + 1}L${X0 - 10} ${H + 1}Z`

interface Star {
  x: number
  y: number
  r: number
  twinkle: boolean
  delay: number
}

const STARS: Star[] = (() => {
  const r = rng(42)
  return Array.from({ length: 80 }, () => {
    const y = 4 + Math.pow(r(), 1.6) * 96 // tätare högt upp
    return { x: X0 + r() * (X1 - X0), y, r: 0.35 + r() * 0.85, twinkle: r() > 0.62, delay: -r() * 6 }
  })
})()

/**
 * Glitter i vattnet under sol eller måne: korta streck som glesnar och smalnar mot betraktaren.
 * `dx` och `w` anges i solradier.
 */
const GLITTER = (() => {
  const r = rng(23)
  const out: Array<{ y: number; dx: number; w: number; t: number; o: number; delay: number }> = []
  for (let row = 0; row < 7; row++) {
    const y = HY + 2.2 + row * 3.6 + row * row * 0.12
    const dashes = row < 2 ? 1 : 2
    for (let k = 0; k < dashes; k++) {
      out.push({
        y,
        dx: dashes === 1 ? (r() - 0.5) * 0.3 : (k ? 1 : -1) * (0.35 + r() * 0.45),
        w: (row < 2 ? 0.9 - row * 0.15 : 0.32 + r() * 0.3) * (1 - row * 0.05),
        t: 1.1 - row * 0.08,
        o: 1 - row * 0.12,
        delay: -r() * 3.6,
      })
    }
  }
  return out
})()

interface Birch {
  x: number
  base: number
  h: number
  seed: number
}
const BIRCHES: Birch[] = [
  { x: 272, base: 153, h: 34, seed: 5 },
  { x: 530, base: 151.5, h: 30, seed: 9 },
  { x: 549, base: 152, h: 22, seed: 13 },
]

/** Norrskensridå: vågig underkant, mjuk överkant. */
function auroraPath(x0: number, x1: number, base: number, amp: number, freq: number, ph: number, height: number): string {
  const bottom: Pt[] = []
  const top: Pt[] = []
  for (let x = x0; x <= x1 + 0.1; x += 20) {
    const yb = base + amp * Math.sin(x * freq + ph) + amp * 0.35 * Math.sin(x * freq * 2.7 + ph * 1.3)
    bottom.push([x, yb])
    top.push([x, yb - height - 12 * Math.sin(x * freq * 1.6 + ph + 1)])
  }
  const line = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('')
  return `${line(bottom)}${line(top.reverse()).replace(/^M/, 'L')}Z`
}

const AURORA = [
  { d: auroraPath(120, 700, 62, 10, 0.012, 0.5, 46), opacity: 0.95 },
  { d: auroraPath(260, X1 + 20, 48, 12, 0.009, 2.1, 36), opacity: 0.75 },
  { d: auroraPath(X0 - 20, 420, 38, 8, 0.015, 4, 24), opacity: 0.5 },
]

// ---------------------------------------------------------------------------
// Himlakroppar
// ---------------------------------------------------------------------------

interface Celestial {
  kind: 'sol' | 'mane' | 'midnattssol'
  x: number
  y: number
  r: number
  /** Månfas 0–1 (bara för månen). */
  phase: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Solhöjd (grader) → y i bilden. Vid 0° vilar solen på fjällkammen – som i Lagoms logotyp. */
const altitudeToY = (alt: number, x: number) => {
  const rest = ridgeY(x) + 1
  return rest - (clamp(alt, -3, 56) / 56) * (rest - 20)
}
/**
 * Dagsförlopp 0–1 (soluppgång → solnedgång) → x. Solbanan ligger i bildens högra del så att solen
 * aldrig hamnar bakom hälsningen uppe till vänster, och syns även på smala skärmar (x ≈ 216–584).
 */
const progressToX = (t: number) => 455 + clamp(t, 0, 1) * 120

const TYPICAL_NOON_ALT: Record<Season, number> = { vinter: 8, var: 30, sommar: 48, host: 24 }

function celestialFor(now: Date, phase: SkyPhase, season: Season): Celestial {
  // Midnattssolen vilar i sadeln mellan två toppar.
  if (phase === 'natt' && season === 'sommar') return { kind: 'midnattssol', x: 470, y: ridgeY(470) + 2, r: 10, phase: 0 }
  if (phase === 'natt') {
    const h = now.getHours() + now.getMinutes() / 60
    const t = clamp(((h + 24 - 18) % 24) / 12, 0, 1)
    return { kind: 'mane', x: 400 + t * 170, y: 62 - 34 * Math.sin(Math.PI * t), r: 8.5, phase: moonPhase(now) }
  }
  // Verklig solposition när den begärda fasen stämmer med klockan, annars en typisk bild.
  const real = computeSkyPhase(now) === phase
  let t: number
  let alt: number
  if (real) {
    const st = sunTimes(now)
    t =
      st.sunrise && st.sunset
        ? (now.getTime() - st.sunrise.getTime()) / (st.sunset.getTime() - st.sunrise.getTime())
        : (now.getHours() + now.getMinutes() / 60) / 24
    alt = sunAltitude(now)
  } else {
    t = phase === 'gryning' ? 0.04 : phase === 'skymning' ? 0.96 : 0.46
    alt = phase === 'dag' ? TYPICAL_NOON_ALT[season] : 1.5
  }
  if (phase === 'dag') alt = Math.max(alt, 4)
  else alt = clamp(alt, -2, 5)
  if (phase === 'gryning') t = Math.min(t, 0.12)
  if (phase === 'skymning') t = Math.max(t, 0.88)
  const x = progressToX(t)
  return { kind: 'sol', x, y: altitudeToY(alt, x), r: 11, phase: 0 }
}

// ---------------------------------------------------------------------------
// CSS för återkommande animationer (hissas till <head> och delas av alla instanser)
// ---------------------------------------------------------------------------

const CSS = `
.lsh-aurora{position:absolute;inset:0;mix-blend-mode:screen;transform-origin:50% 0;will-change:transform,opacity}
@keyframes lsh-aurora{0%{transform:translateX(-12px) skewX(-4deg) scaleY(.95);opacity:.62}50%{opacity:1}100%{transform:translateX(14px) skewX(3deg) scaleY(1.05);opacity:.8}}
.lsh-aurora-0{animation:lsh-aurora 13s ease-in-out infinite alternate}
.lsh-aurora-1{animation:lsh-aurora 17s ease-in-out -6s infinite alternate-reverse}
.lsh-aurora-2{animation:lsh-aurora 11s ease-in-out -3s infinite alternate}
@keyframes lsh-twinkle{0%,100%{opacity:1}50%{opacity:.25}}
.lsh-twinkle{animation:lsh-twinkle 4.2s ease-in-out infinite}
@keyframes lsh-drift{from{transform:translateX(-2.5%)}to{transform:translateX(2.5%)}}
.lsh-drift{animation:lsh-drift 80s ease-in-out infinite alternate;will-change:transform}
@keyframes lsh-birds{0%{transform:translateX(-62%)}78%,100%{transform:translateX(62%)}}
.lsh-birds{animation:lsh-birds 52s linear -18s infinite;will-change:transform}
@keyframes lsh-flap{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.4)}}
.lsh-flap{animation:lsh-flap .9s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes lsh-fall{from{transform:translate3d(0,-14px,0)}to{transform:translate3d(0,var(--lsh-fall),0)}}
@keyframes lsh-sway{from{transform:translateX(calc(var(--lsh-sway) * -1)) rotate(0deg)}to{transform:translateX(var(--lsh-sway)) rotate(var(--lsh-spin))}}
.lsh-fall{position:absolute;top:0;animation:lsh-fall var(--lsh-dur) linear var(--lsh-delay) infinite;will-change:transform}
.lsh-sway{display:block;animation:lsh-sway calc(var(--lsh-dur) / 3) ease-in-out var(--lsh-delay) infinite alternate}
@keyframes lsh-smoke{0%{transform:translate(0,0) scale(.5);opacity:0}25%{opacity:.34}100%{transform:translate(8px,-18px) scale(1.8);opacity:0}}
.lsh-smoke{animation:lsh-smoke 5.4s ease-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes lsh-wave{0%,100%{transform:skewY(0deg) scaleX(1)}50%{transform:skewY(5deg) scaleX(.93)}}
.lsh-flag{animation:lsh-wave 3.4s ease-in-out infinite;transform-box:fill-box;transform-origin:0% 50%}
@keyframes lsh-bob{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(.7px) rotate(1.4deg)}}
.lsh-bob{animation:lsh-bob 4.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes lsh-shimmer{0%,100%{opacity:1;transform:scaleX(1)}50%{opacity:.5;transform:scaleX(.78)}}
.lsh-shimmer{animation:lsh-shimmer 3.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.lsh-paused *{animation-play-state:paused!important}
@media (prefers-reduced-motion: reduce){.lsh-root *{animation:none!important}}
`

// ---------------------------------------------------------------------------
// Lager
// ---------------------------------------------------------------------------

const SVG_PROPS = {
  viewBox: `${X0} 0 ${X1 - X0} ${H}`,
  preserveAspectRatio: 'xMidYMax slice',
  className: 'absolute inset-0 h-full w-full',
  'aria-hidden': true,
  focusable: false,
} as const

/** Ett parallaxlager: flyttas nedåt med en andel av scrollningen, så att det känns längre bort. */
function Layer({ scrollY, factor, children }: { scrollY: MotionValue<number>; factor: number; children: ReactNode }) {
  const y = useTransform(scrollY, [0, 480], [0, 480 * factor], { clamp: true })
  return (
    <motion.div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ y }}>
      {children}
    </motion.div>
  )
}

function SkyLayer({ p, uid, cel, season, phase }: { p: Palette; uid: string; cel: Celestial; season: Season; phase: SkyPhase }) {
  const stars = phase === 'natt' && season !== 'sommar'
  const glowStrong = cel.kind !== 'sol' || phase !== 'dag'
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2={HY + 4} gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: p.skyTop }} />
          <stop offset="0.55" style={{ stopColor: p.skyMid }} />
          <stop offset="1" style={{ stopColor: p.horizon }} />
        </linearGradient>
        <radialGradient id={`glow-${uid}`}>
          <stop offset="0" style={{ stopColor: cel.kind === 'mane' ? p.moon : p.sun, stopOpacity: cel.kind === 'mane' ? 0.35 : glowStrong ? 0.75 : 0.55 }} />
          <stop offset="0.35" style={{ stopColor: cel.kind === 'mane' ? p.moon : p.sun, stopOpacity: cel.kind === 'mane' ? 0.1 : 0.28 }} />
          <stop offset="1" style={{ stopColor: cel.kind === 'mane' ? p.moon : p.sun, stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <rect x={X0 - 10} y={-10} width={X1 - X0 + 20} height={HY + 16} fill={`url(#sky-${uid})`} />

      {stars &&
        STARS.map((s, i) => (
          <circle
            key={i}
            cx={f1(s.x)}
            cy={f1(s.y)}
            r={s.r.toFixed(2)}
            className={s.twinkle ? 'lsh-twinkle' : undefined}
            style={{ fill: p.star, animationDelay: s.twinkle ? `${s.delay.toFixed(2)}s` : undefined, opacity: s.twinkle ? undefined : 0.75 }}
          />
        ))}

      {/* Sol, midnattssol eller måne – med glöd. */}
      <circle
        data-testid={`celestial-${cel.kind}`}
        cx={f1(cel.x)}
        cy={f1(cel.y)}
        r={cel.kind === 'midnattssol' ? 150 : cel.kind === 'mane' ? 42 : phase === 'dag' ? 70 : 110}
        fill={`url(#glow-${uid})`}
      />
      {cel.kind === 'mane' ? (
        <g>
          <circle cx={f1(cel.x)} cy={f1(cel.y)} r={cel.r} style={{ fill: p.moon, opacity: 0.13 }} />
          <path d={moonLitPath(Number(f1(cel.x)), Number(f1(cel.y)), cel.r, cel.phase)} style={{ fill: p.moon }} />
        </g>
      ) : (
        <circle cx={f1(cel.x)} cy={f1(cel.y)} r={cel.r} style={{ fill: p.sun }} />
      )}
    </svg>
  )
}

function AuroraLayer({ p, uid }: { p: Palette; uid: string }) {
  return (
    <>
      {AURORA.map((a, i) => (
        <div key={i} className={`lsh-aurora lsh-aurora-${i}`} data-testid="aurora">
          <svg {...SVG_PROPS}>
            <defs>
              <linearGradient id={`au-${uid}-${i}`} x1="0" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0" style={{ stopColor: p.aurora, stopOpacity: 0.9 }} />
                <stop offset="0.35" style={{ stopColor: p.aurora, stopOpacity: 0.5 }} />
                <stop offset="0.7" style={{ stopColor: p.auroraTop, stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: p.auroraTop, stopOpacity: 0 }} />
              </linearGradient>
              <filter id={`au-blur-${uid}-${i}`} x="-10%" y="-40%" width="120%" height="180%">
                <feGaussianBlur stdDeviation="2.4" />
              </filter>
              <pattern id={`au-rays-${uid}-${i}`} width="5.5" height="10" patternUnits="userSpaceOnUse">
                <rect width="1.2" height="10" style={{ fill: p.aurora }} />
              </pattern>
            </defs>
            <g style={{ opacity: a.opacity }}>
              <path d={a.d} fill={`url(#au-${uid}-${i})`} filter={`url(#au-blur-${uid}-${i})`} />
              {/* Strålar – norrskenets karaktäristiska lodräta draperier. */}
              <path d={a.d} fill={`url(#au-rays-${uid}-${i})`} style={{ opacity: 0.22 }} />
            </g>
          </svg>
        </div>
      ))}
    </>
  )
}

/** Mjuka moln av sammanfogade cirklar. */
function Cloud({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <g style={{ fill, opacity: 0.92 }} transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-22} y={-4} width={46} height={9} rx={4.5} />
      <circle cx={-10} cy={-4} r={8} />
      <circle cx={3} cy={-8} r={10.5} />
      <circle cx={15} cy={-3} r={7} />
    </g>
  )
}

function CloudLayer({ p, season }: { p: Palette; season: Season }) {
  if (!p.cloud) return null
  const many = season === 'vinter' || season === 'host'
  return (
    <div className="lsh-drift absolute inset-0">
      <svg {...SVG_PROPS}>
        <Cloud x={292} y={40} s={1} fill={p.cloud} />
        <Cloud x={548} y={26} s={0.7} fill={p.cloud} />
        {many && <Cloud x={120} y={58} s={0.85} fill={p.cloud} />}
        {many && <Cloud x={700} y={50} s={1.1} fill={p.cloud} />}
      </svg>
    </div>
  )
}

/** Flyttfåglar i plogform – de kommer på våren och drar söderut på hösten. */
function BirdLayer({ p }: { p: Palette }) {
  const birds: Pt[] = [[0, 0], [-9, 5], [-18, 10], [9, 5.5], [18, 11], [-27, 15]]
  return (
    <div className="lsh-birds absolute inset-0" style={TEXT_SAFE_MASK} data-testid="birds">
      <svg {...SVG_PROPS}>
        <g transform="translate(360 44)" fill="none" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: p.bird, opacity: 0.7 }}>
          {birds.map(([bx, by], i) => (
            <path key={i} d={`M${bx - 3} ${by - 1.4}Q${bx - 1.4} ${by - 1.8} ${bx} ${by}Q${bx + 1.4} ${by - 1.8} ${bx + 3} ${by - 1.4}`} className="lsh-flap" style={{ animationDelay: `${-i * 0.17}s` }} />
          ))}
        </g>
      </svg>
    </div>
  )
}

function FarLayer({ p, uid, season, phase, cel }: { p: Palette; uid: string; season: Season; phase: SkyPhase; cel: Celestial }) {
  const frozen = season === 'vinter'
  const farId = `far-${uid}`
  // Spegling av sol eller måne i vattnet (inte på isen).
  const reflect = !frozen && (cel.kind !== 'sol' || cel.y < ridgeY(cel.x) + 4)
  const reflectColor = cel.kind === 'mane' ? p.moon : p.sun
  // Månens spegling blir svagare ju mindre av den som är upplyst.
  const moonLight = cel.kind === 'mane' ? 0.25 + 0.75 * ((1 - Math.cos(2 * Math.PI * cel.phase)) / 2) : 1
  // Låg sol och midnattssol: hela sjön fångar ett brett, varmt sken.
  const broadGlow = !frozen && (cel.kind === 'midnattssol' || (cel.kind === 'sol' && phase !== 'dag'))
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <clipPath id={`snow-${uid}`}>
          <path d={snowClipPath(SNOWLINE[season])} />
        </clipPath>
        <clipPath id={`lake-${uid}`}>
          <rect x={X0 - 10} y={HY} width={X1 - X0 + 20} height={32} />
        </clipPath>
        <linearGradient id={`lake-g-${uid}`} x1="0" y1={HY} x2="0" y2={HY + 30} gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: p.lakeTop }} />
          <stop offset="1" style={{ stopColor: p.lakeBottom }} />
        </linearGradient>
        {/* Fjällen blir disigare mot foten – ger djup. */}
        <linearGradient id={`fjall-g-${uid}`} x1="0" y1="64" x2="0" y2="124" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: p.fjall }} />
          <stop offset="1" style={{ stopColor: mix(p.fjall, 62, p.horizon) }} />
        </linearGradient>
        <radialGradient id={`lakeglow-${uid}`}>
          <stop offset="0" style={{ stopColor: p.sun, stopOpacity: 0.45 }} />
          <stop offset="1" style={{ stopColor: p.sun, stopOpacity: 0 }} />
        </radialGradient>
        <filter id={`mist-${uid}`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <g id={farId}>
        <path d={FJALL_D} fill={`url(#fjall-g-${uid})`} />
        <path d={FJALL_D} clipPath={`url(#snow-${uid})`} style={{ fill: p.fjallSnow }} data-testid="snowcaps" />
        <path d={HILLS_D} style={{ fill: p.hills }} />
        <path d={FAR_FOREST_D} style={{ fill: p.farForest }} />
      </g>

      {/* Sjön – islagd på vintern – med spegling av stranden. */}
      <rect x={X0 - 10} y={HY} width={X1 - X0 + 20} height={32} fill={`url(#lake-g-${uid})`} data-testid={frozen ? 'lake-ice' : 'lake'} />
      <g clipPath={`url(#lake-${uid})`}>
        <use href={`#${farId}`} transform={`matrix(1 0 0 -1 0 ${HY * 2 + 1})`} style={{ opacity: frozen ? 0.1 : 0.3 }} />
      </g>
      {frozen ? (
        <g style={{ fill: p.snow, opacity: 0.7 }}>
          <ellipse cx={260} cy={132} rx={60} ry={2.2} />
          <ellipse cx={520} cy={138} rx={80} ry={2.6} />
          <ellipse cx={400} cy={145} rx={50} ry={1.8} />
        </g>
      ) : (
        <g strokeLinecap="round" style={{ stroke: p.ripple, opacity: 0.4 }}>
          <path d="M40 129H130M300 131H352M610 128H700M150 136H240M420 138H470M660 140H760M60 145H110M280 146H380" strokeWidth={0.8} />
        </g>
      )}
      {broadGlow && (
        <ellipse cx={f1(cel.x)} cy={HY + 5} rx={90} ry={7} fill={`url(#lakeglow-${uid})`} data-testid="lake-glow" />
      )}
      {reflect && (
        <g strokeLinecap="round" style={{ stroke: reflectColor }} data-testid="reflection">
          {GLITTER.map((g, i) => {
            const base = cel.kind === 'midnattssol' ? 30 : cel.kind === 'mane' ? cel.r * 0.8 : cel.r
            const half = base * g.w
            const x = cel.x + g.dx * base
            return (
              <line
                key={i}
                x1={f1(x - half)}
                x2={f1(x + half)}
                y1={f1(g.y)}
                y2={f1(g.y)}
                strokeWidth={g.t}
                className="lsh-shimmer"
                style={{ opacity: (cel.kind === 'mane' ? 0.42 * moonLight : 0.75) * g.o, animationDelay: `${g.delay}s` }}
              />
            )
          })}
        </g>
      )}
      {/* Morgondis över vattnet. */}
      {phase === 'gryning' && !frozen && (
        <g filter={`url(#mist-${uid})`} style={{ fill: p.mist, opacity: 0.55 }} data-testid="mist">
          <ellipse cx={220} cy={127} rx={150} ry={3.5} />
          <ellipse cx={560} cy={130} rx={190} ry={4} />
        </g>
      )}
    </svg>
  )
}

function BirchTree({ b, p, season }: { b: Birch; p: Palette; season: Season }) {
  const r = rng(b.seed)
  const top = b.base - b.h
  const crownY = b.base - b.h * 0.7
  const bare = season === 'vinter' || !p.leaves
  const blobs = season === 'var' ? 12 : 17
  return (
    <g>
      {/* Grenverk – syns tydligast när trädet är kalt. */}
      <g fill="none" strokeLinecap="round" style={{ stroke: p.barkMark, opacity: bare ? 0.85 : 0.5 }}>
        {[0.35, 0.5, 0.62, 0.75].map((f, i) => {
          const y = b.base - b.h * f
          const dir = i % 2 ? 1 : -1
          return <path key={f} d={`M${b.x} ${f1(y)}Q${f1(b.x + dir * 5)} ${f1(y - 5)} ${f1(b.x + dir * (7 + r() * 4))} ${f1(y - 10 - r() * 4)}`} strokeWidth={0.7} />
        })}
      </g>
      <path d={`M${b.x - 0.3} ${b.base}C${b.x - 1.2} ${f1(b.base - b.h * 0.4)} ${b.x + 0.9} ${f1(b.base - b.h * 0.7)} ${b.x} ${f1(top)}`} fill="none" strokeWidth={2.2} strokeLinecap="round" style={{ stroke: p.bark }} />
      {[0.15, 0.3, 0.48, 0.64].map((f) => (
        <path key={f} d={`M${f1(b.x - 1)} ${f1(b.base - b.h * f)}h1.6`} strokeWidth={0.8} strokeLinecap="round" style={{ stroke: p.barkMark }} />
      ))}
      {!bare &&
        Array.from({ length: blobs }, (_, i) => {
          const a = r() * Math.PI * 2
          const d = Math.sqrt(r())
          const cx = b.x + Math.cos(a) * d * b.h * 0.3
          const cy = crownY + Math.sin(a) * d * b.h * 0.34
          const rad = season === 'var' ? 1.5 + r() * 1.3 : 2.2 + r() * 2
          return <circle key={i} cx={f1(cx)} cy={f1(cy)} r={rad.toFixed(2)} style={{ fill: i % 3 ? (p.leaves ?? undefined) : (p.leaves2 ?? undefined), opacity: season === 'var' ? 0.9 : 1 }} />
        })}
    </g>
  )
}

/** Den lilla faluröda stugan med vita knutar – fönstren lyser när det är mörkt. */
function Cottage({ p, uid, lit, snowy, smoke }: { p: Palette; uid: string; lit: boolean; snowy: boolean; smoke: boolean }) {
  const glass = lit ? 'var(--lg-sol)' : p.glass
  const cross = lit ? mix(tok('hjortron'), 60, BLACK) : p.trim
  const win = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={0.4} style={{ fill: p.trim }} />
      <rect x={x + 0.9} y={y + 0.9} width={w - 1.8} height={h - 1.8} style={{ fill: glass }} />
      <path d={`M${x + w / 2} ${y + 0.9}V${y + h - 0.9}M${x + 0.9} ${y + h / 2}H${x + w - 0.9}`} strokeWidth={0.6} style={{ stroke: cross }} />
    </g>
  )
  return (
    <g data-testid="cottage" data-lit={lit}>
      {lit && (
        <g>
          <circle cx={452} cy={142} r={16} fill={`url(#win-${uid})`} />
          <circle cx={481.5} cy={142} r={14} fill={`url(#win-${uid})`} />
          <ellipse cx={466} cy={156} rx={26} ry={3.2} fill={`url(#win-${uid})`} style={{ opacity: 0.7 }} />
        </g>
      )}
      {/* Skorsten (bakom taket) och rök. */}
      <rect x={473.5} y={114.5} width={4} height={14} style={{ fill: p.stone }} />
      <rect x={473} y={113.8} width={5} height={1.6} rx={0.4} style={{ fill: snowy ? p.snow : p.trim }} />
      {smoke &&
        [0, 1, 2].map((i) => (
          <circle key={i} cx={475.5} cy={110} r={2.2} className="lsh-smoke" style={{ fill: mix(p.trim, 70, p.horizon), opacity: 0.3, animationDelay: `${-i * 1.8}s` }} />
        ))}
      {/* Långsida (skuggad) och tak. */}
      <rect x={464} y={135} width={24} height={16} style={{ fill: p.faluSide }} />
      <path d="M452 123L478 123L491 136.2L465 136.2Z" style={{ fill: p.roof }} />
      {snowy && <path d="M452.6 122.4L478.2 122.4L483 127.6L457.6 127.6Z" style={{ fill: p.snow }} />}
      {/* Gavel. */}
      <path d="M440 135L452 123L464 135V151H440Z" style={{ fill: p.falu }} />
      <path d="M438.6 136.4L452 122.6L466 136.6" fill="none" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" style={{ stroke: p.trim }} />
      {/* Knutar, sockel, dörr och fönster. */}
      <rect x={440} y={135} width={1.4} height={16} style={{ fill: p.trim }} />
      <rect x={462.6} y={135} width={1.4} height={16} style={{ fill: p.trim }} />
      <rect x={486.6} y={135.6} width={1.4} height={15.4} style={{ fill: p.trim }} />
      <rect x={439} y={150.4} width={50} height={2.2} rx={0.6} style={{ fill: p.stone }} />
      {win(448, 138.5, 8, 7)}
      {win(450.3, 126.6, 3.4, 3.6)}
      {win(478, 139, 7, 6.5)}
      <rect x={468} y={140} width={6} height={11} rx={0.4} style={{ fill: p.trim }} />
      <rect x={468.9} y={140.9} width={4.2} height={10.1} style={{ fill: p.door }} />
      {snowy && <ellipse cx={464} cy={152} rx={30} ry={2} style={{ fill: p.snow }} />}
    </g>
  )
}

/** Blommor, bär och svamp i gräset beroende på årstid. */
function Meadow({ p, season }: { p: Palette; season: Season }) {
  const r = rng(season.length * 31 + 7)
  const spots = Array.from({ length: 26 }, () => ({ x: 215 + r() * 340, y: 155 + r() * 9, k: r() }))
    .filter((s) => !(s.x > 432 && s.x < 506) && !(s.x > 294 && s.x < 350))
  if (season === 'vinter') return null
  return (
    <g data-testid="meadow">
      {spots.map((s, i) => {
        const x = f1(s.x)
        const y = f1(s.y)
        if (season === 'sommar') {
          // Prästkragar och lupiner.
          return s.k > 0.78 ? (
            <ellipse key={i} cx={x} cy={f1(s.y - 2)} rx={0.9} ry={2.6} style={{ fill: s.k > 0.9 ? tok('vinbar') : tok('blabar'), opacity: 0.85 }} />
          ) : (
            <g key={i}>
              <circle cx={x} cy={y} r={1.15} style={{ fill: p.trim }} />
              <circle cx={x} cy={y} r={0.45} style={{ fill: tok('sol') }} />
            </g>
          )
        }
        if (season === 'var') {
          // Vitsippor och blåsippor.
          return <circle key={i} cx={x} cy={y} r={0.95} style={{ fill: s.k > 0.75 ? mix(tok('blabar'), 70, WHITE) : p.trim }} />
        }
        // Höst: lingonris och en och annan flugsvamp.
        if (i === 3 || i === 11) {
          return (
            <g key={i}>
              <rect x={s.x - 0.5} y={s.y - 2.6} width={1} height={2.6} style={{ fill: p.trim }} />
              <path d={`M${f1(s.x - 2.6)} ${f1(s.y - 2.4)}Q${x} ${f1(s.y - 6)} ${f1(s.x + 2.6)} ${f1(s.y - 2.4)}Z`} style={{ fill: mix(tok('lingon'), 85, BLACK) }} />
              <circle cx={f1(s.x - 0.8)} cy={f1(s.y - 3.6)} r={0.4} style={{ fill: p.trim }} />
              <circle cx={f1(s.x + 1)} cy={f1(s.y - 3.1)} r={0.35} style={{ fill: p.trim }} />
            </g>
          )
        }
        return <circle key={i} cx={x} cy={y} r={0.8} style={{ fill: tok('lingon'), opacity: 0.9 }} />
      })}
    </g>
  )
}

function NearLayer({ p, uid, season, phase }: { p: Palette; uid: string; season: Season; phase: SkyPhase }) {
  const winter = season === 'vinter'
  const lit = phase !== 'dag'
  return (
    <svg {...SVG_PROPS}>
      <defs>
        <radialGradient id={`win-${uid}`}>
          <stop offset="0" style={{ stopColor: tok('sol'), stopOpacity: 0.55 }} />
          <stop offset="1" style={{ stopColor: tok('sol'), stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      {/* Brygga (sedd från sidan) med en förtöjd eka. */}
      <g data-testid="jetty">
        <path d="M303 146.6V152.4M316 146.6V151.6M329 146.6V151M342 146.6V150.6" strokeWidth={1.3} style={{ stroke: p.wood }} />
        {!winter && (
          <path d="M303 151.2V153.4M316 150.6V152.6M329 150.2V152M342 149.8V151.6" strokeWidth={1.3} style={{ stroke: p.wood, opacity: 0.3 }} />
        )}
        <rect x={296} y={145} width={50} height={1.8} rx={0.5} style={{ fill: p.wood }} />
        <path d="M296.5 145.3H345.5" strokeWidth={0.5} style={{ stroke: p.groundEdge, opacity: 0.5 }} />
        {winter && <rect x={296} y={144} width={50} height={1.3} rx={0.6} style={{ fill: p.snow }} />}
        {!winter && (
          <>
            <path d="M345 146.2Q350 149 354.6 147.6" fill="none" strokeWidth={0.4} style={{ stroke: p.stone }} />
            <g className="lsh-bob">
              <path d="M353 146.4L372 146.4Q370.2 150.6 363.6 150.9L359.4 150.9Q354.6 150.6 353 146.4Z" style={{ fill: p.boat }} />
              <path d="M353.4 146.8H371.6" strokeWidth={0.7} style={{ stroke: p.trim }} />
            </g>
          </>
        )}
      </g>

      {/* Stranden. */}
      <path d={NEAR_LAND_D} style={{ fill: p.ground }} />
      <path d={SHORE_EDGE_D} fill="none" strokeWidth={1.2} style={{ stroke: p.groundEdge, opacity: 0.7 }} />
      <g style={{ fill: p.stone }}>
        <ellipse cx={292} cy={152.6} rx={4.6} ry={2.4} />
        <ellipse cx={386} cy={151.2} rx={3.2} ry={1.9} />
        <ellipse cx={419} cy={152.6} rx={3.6} ry={2} />
      </g>

      {/* Flaggstång med vimpel. */}
      <g>
        <path d="M501 151.5V107.5" strokeWidth={1} strokeLinecap="round" style={{ stroke: p.trim }} />
        <circle cx={501} cy={106.8} r={1.1} style={{ fill: p.flagYellow }} />
        <g className="lsh-flag">
          <path d="M501.4 107.4C508 107.6 516 109 526 111C516 110.2 508 110.6 501.4 111.4Z" style={{ fill: p.flagBlue }} />
          <path d="M501.4 108.9C508 109.1 515 109.8 522 110.6C515 110.3 508 110.1 501.4 110Z" style={{ fill: p.flagYellow }} />
        </g>
      </g>

      <Cottage p={p} uid={uid} lit={lit} snowy={winter} smoke={winter || season === 'host'} />
      {BIRCHES.map((b) => (
        <BirchTree key={b.seed} b={b} p={p} season={season} />
      ))}

      {/* Granskogen: skuggsida, solsida och (på vintern) snö på grenarna. */}
      <g data-testid="spruces">
        {NEAR_SPRUCES.map((t, i) => (
          <g key={i}>
            <path d={t.left} style={{ fill: p.spruce }} />
            <path d={t.right} style={{ fill: p.spruceLit }} />
          </g>
        ))}
        {winter && (
          <path d={NEAR_SPRUCES.map((t) => t.snow).join('')} fill="none" strokeWidth={1.3} strokeLinecap="round" style={{ stroke: p.treeSnow }} />
        )}
      </g>

      <Meadow p={p} season={season} />
    </svg>
  )
}

/** Fallande snö eller löv som HTML-element (animeras på kompositorn). */
function Particles({ kind, height }: { kind: 'snow' | 'leaves'; height: number }) {
  const items = useMemo(() => {
    const r = rng(kind === 'snow' ? 77 : 101)
    return Array.from({ length: kind === 'snow' ? 28 : 11 }, () => {
      const dur = kind === 'snow' ? 8 + r() * 7 : 10 + r() * 7
      return {
        left: r() * 100,
        size: kind === 'snow' ? 1.6 + r() * 2.4 : 6 + r() * 4,
        dur,
        delay: -r() * dur,
        sway: 6 + r() * 18,
        spin: (r() > 0.5 ? 1 : -1) * (120 + r() * 300),
        color: ['var(--lg-hjortron)', 'var(--lg-lingon)', 'var(--lg-sol)'][Math.floor(r() * 3)],
        opacity: 0.55 + r() * 0.4,
      }
    })
  }, [kind])
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={TEXT_SAFE_MASK} data-testid={`particles-${kind}`}>
      {items.map((it, i) => (
        <span
          key={i}
          className="lsh-fall"
          style={
            {
              left: `${it.left}%`,
              '--lsh-fall': `${height + 24}px`,
              '--lsh-dur': `${it.dur.toFixed(2)}s`,
              '--lsh-delay': `${it.delay.toFixed(2)}s`,
              '--lsh-sway': `${it.sway.toFixed(1)}px`,
              '--lsh-spin': kind === 'snow' ? '0deg' : `${it.spin.toFixed(0)}deg`,
            } as CSSProperties
          }
        >
          <span className="lsh-sway">
            {kind === 'snow' ? (
              <span
                className="block rounded-full"
                style={{ width: it.size, height: it.size, opacity: it.opacity, background: mix(WHITE, 92, tok('fjall')) }}
              />
            ) : (
              <svg width={it.size} height={it.size} viewBox="0 0 10 10" style={{ display: 'block', opacity: it.opacity + 0.05 }}>
                <path d="M5 0.6C8.6 2.6 8.6 7 5 9.4C1.4 7 1.4 2.6 5 0.6Z" style={{ fill: it.color }} />
                <path d="M5 1.6V9" strokeWidth={0.6} style={{ stroke: mix(it.color, 60, BLACK) }} />
              </svg>
            )}
          </span>
        </span>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Klocka
// ---------------------------------------------------------------------------

/** Aktuell tid som uppdateras var femte minut (om ingen fast tid anges). */
function useNow(fixed?: Date): Date {
  const [tick, setTick] = useState(() => new Date())
  useEffect(() => {
    if (fixed) return
    const id = window.setInterval(() => setTick(new Date()), 5 * 60_000)
    return () => window.clearInterval(id)
  }, [fixed])
  return fixed ?? tick
}

/** Följer appens tema (klassen `dark` på <html>, som sätts av `useTheme`). */
function subscribeTheme(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => mo.disconnect()
}
const getDark = () => document.documentElement.classList.contains('dark')
const getDarkServer = () => false

function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribeTheme, getDark, getDarkServer)
}

/**
 * Rörliga detaljer (löv, snö, fåglar) tonas bort överst till vänster där hälsningen står, så att
 * inget rör sig bakom texten.
 */
const TEXT_SAFE_MASK: CSSProperties = {
  maskImage: 'radial-gradient(ellipse 95% 72% at 0% 0%, transparent 62%, black 92%)',
  WebkitMaskImage: 'radial-gradient(ellipse 95% 72% at 0% 0%, transparent 62%, black 92%)',
}

const MOTION_KEY = 'lagom-header-motion'

function readMotionPaused(): boolean {
  try {
    return localStorage.getItem(MOTION_KEY) === 'paused'
  } catch {
    return false
  }
}

/**
 * Paus för landskapets återkommande animationer (WCAG 2.2.2). Valet sparas på enheten.
 * Reducerad rörelse i systemet stänger av dem helt oavsett.
 */
function useMotionPaused(): [boolean, () => void] {
  const [paused, setPaused] = useState(readMotionPaused)
  const toggle = () => {
    setPaused((p) => {
      const next = !p
      try {
        if (next) localStorage.setItem(MOTION_KEY, 'paused')
        else localStorage.removeItem(MOTION_KEY)
      } catch {
        /* lagring kan vara blockerad – valet gäller då bara nu */
      }
      return next
    })
  }
  return [paused, toggle]
}

/** Läsbar textfärg mot mörk natthimmel – tokens skrivs över lokalt för innehållet. */
const NIGHT_INK = {
  '--lg-ink': mix(WHITE, 94, tok('sol')),
  '--lg-ink-2': 'color-mix(in srgb, white 80%, transparent)',
  '--lg-ink-3': 'color-mix(in srgb, white 64%, transparent)',
} as CSSProperties

// ---------------------------------------------------------------------------
// Komponent
// ---------------------------------------------------------------------------

/**
 * ```tsx
 * <SeasonalHeader date={date}>
 *   <p className="eyebrow">{sceneLabel(season, phase)}</p>
 *   <h1 className="font-display text-3xl text-ink">God morgon, Anna</h1>
 * </SeasonalHeader>
 * ```
 */
export function SeasonalHeader({ date, now: nowProp, season: seasonProp, phase: phaseProp, height = 176, children, className = '', contentClassName }: SeasonalHeaderProps) {
  const reduce = useReducedMotion() ?? false
  const now = useNow(nowProp)
  const season = seasonProp ?? swedishSeason(date)
  const phase = phaseProp ?? computeSkyPhase(now)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const { scrollY } = useScroll()

  const dark = useDarkTheme()
  const palette = useMemo(() => buildPalette(season, phase, dark), [season, phase, dark])
  // Himlakroppens läge ändras bara när minuten ändras.
  const minute = Math.floor(now.getTime() / 60_000)
  const cel = useMemo(() => celestialFor(new Date(minute * 60_000), phase, season), [minute, phase, season])

  const night = phase === 'natt'
  const aurora = night && season === 'vinter'
  const birds = phase === 'dag' && (season === 'var' || season === 'host')
  const particles: 'snow' | 'leaves' | null = reduce ? null : season === 'vinter' && !night ? 'snow' : season === 'host' && !night ? 'leaves' : null
  const f = (v: number) => (reduce ? 0 : v)
  const [paused, togglePaused] = useMotionPaused()

  return (
    <div
      className={`lsh-root relative isolate w-full overflow-hidden ${paused ? 'lsh-paused' : ''} ${className}`}
      style={{ height, background: palette.skyTop }}
      data-season={season}
      data-phase={phase}
      data-scene={sceneLabel(season, phase)}
    >
      <style href="lagom-seasonal-header" precedence="default">
        {CSS}
      </style>

      <Layer scrollY={scrollY} factor={f(0.5)}>
        <SkyLayer p={palette} uid={uid} cel={cel} season={season} phase={phase} />
      </Layer>
      {aurora && (
        <Layer scrollY={scrollY} factor={f(0.5)}>
          <AuroraLayer p={palette} uid={uid} />
        </Layer>
      )}
      {palette.cloud && (
        <Layer scrollY={scrollY} factor={f(0.42)}>
          <CloudLayer p={palette} season={season} />
        </Layer>
      )}
      {birds && (
        <Layer scrollY={scrollY} factor={f(0.38)}>
          <BirdLayer p={palette} />
        </Layer>
      )}
      <Layer scrollY={scrollY} factor={f(0.28)}>
        <FarLayer p={palette} uid={uid} season={season} phase={phase} cel={cel} />
      </Layer>
      <Layer scrollY={scrollY} factor={f(0.1)}>
        <NearLayer p={palette} uid={uid} season={season} phase={phase} />
      </Layer>
      {particles && <Particles kind={particles} height={height} />}

      {/* Nederkanten: en mjuk kulle i sidans bakgrundsfärg – landskapet glider in i sidan. */}
      <svg {...SVG_PROPS} className="pointer-events-none absolute inset-0 h-full w-full">
        <path d={BOTTOM_BLEND_D} style={{ fill: tok('bg') }} />
      </svg>

      {children !== undefined && (
        <div
          className={contentClassName ?? 'relative z-10 flex h-full flex-col px-4 text-ink'}
          style={{
            ...(night ? NIGHT_INK : null),
            // En mjuk skugga håller texten skarp mot norrsken och stjärnor.
            textShadow: night ? '0 1px 14px var(--lg-shadow-c)' : undefined,
            paddingTop: contentClassName ? undefined : 'calc(var(--sa-top) + 1rem)',
          }}
        >
          {children}
        </div>
      )}

      {!reduce && (
        <button
          type="button"
          onClick={togglePaused}
          aria-pressed={paused}
          aria-label="Pausa animationerna i sidhuvudet"
          title={paused ? 'Starta animationerna' : 'Pausa animationerna'}
          className="group absolute right-1 bottom-1 z-20 grid size-11 place-items-center rounded-full"
        >
          <span className="grid size-7 place-items-center rounded-full bg-surface/55 text-ink-2 opacity-70 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {paused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
          </span>
        </button>
      )}
    </div>
  )
}
