import { describe, expect, it } from 'vitest'
import {
  arcPath,
  areaPath,
  bandLayout,
  bandPath,
  clamp,
  decimalsForStep,
  extent,
  formatTicks,
  heatLevel,
  heatScale,
  linearPath,
  linearScale,
  monotonePath,
  monotoneTangents,
  nearestIndex,
  niceDomain,
  niceTicks,
  polarToCartesian,
  roundedBarPath,
  stepPath,
  tickStep,
  timeTicks,
  tint,
  tooltipPlacement,
  type Point,
} from './chartUtils'

/** Läs ut alla tal ur en SVG-sökväg. */
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

/** Punkt på en kubisk Bézierkurva. */
function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
  }
}

/** Tolka en sökväg från monotonePath till segment [start, c1, c2, slut]. */
function segments(d: string): Array<[Point, Point, Point, Point]> {
  const start = d.match(/^M(-?[\d.]+),(-?[\d.]+)/)
  if (!start) return []
  let cur: Point = { x: Number(start[1]), y: Number(start[2]) }
  const out: Array<[Point, Point, Point, Point]> = []
  for (const m of d.matchAll(/C(-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+) (-?[\d.]+),(-?[\d.]+)/g)) {
    const [, a, b, c, e, f, g] = m.map(Number)
    const end = { x: f, y: g }
    out.push([cur, { x: a, y: b }, { x: c, y: e }, end])
    cur = end
  }
  return out
}

describe('grundläggande', () => {
  it('clamp och extent', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(extent([3, undefined, 1, Number.NaN, 7, null])).toEqual([1, 7])
    expect(extent([])).toBeNull()
  })
})

describe('tickStep / niceDomain / niceTicks', () => {
  it('väljer steg 1, 2 eller 5 × 10ⁿ', () => {
    expect(tickStep(0, 10, 5)).toBe(2)
    expect(tickStep(0, 100, 5)).toBe(20)
    expect(tickStep(0, 2400, 4)).toBe(500)
    expect(tickStep(0, 1, 5)).toBe(0.2)
    expect(tickStep(3, 3, 5)).toBe(1)
  })

  it('utökar domänen till jämna steg', () => {
    expect(niceDomain(78.2, 81.5, 4)).toEqual([78, 82])
    expect(niceDomain(0, 1873, 4)).toEqual([0, 2000])
    expect(niceDomain(5, 5)).toEqual([4.4, 5.6])
    expect(niceDomain(0, 0)).toEqual([0, 1])
    expect(niceDomain(10, 2)).toEqual([2, 10])
  })

  it('ger axelvärden som täcker intervallet', () => {
    expect(niceTicks(78.2, 81.5, 4)).toEqual([78, 79, 80, 81, 82])
    expect(niceTicks(0, 2350, 4)).toEqual([0, 500, 1000, 1500, 2000, 2500])
    const t = niceTicks(0.13, 0.91, 4)
    expect(t[0]).toBeLessThanOrEqual(0.13)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(0.91)
  })

  it('har inget flyttalsbrus', () => {
    for (const v of niceTicks(0.1, 0.7, 6)) expect(String(v).length).toBeLessThanOrEqual(4)
    expect(niceTicks(0.1, 0.3, 2)).toEqual([0.1, 0.2, 0.3])
  })

  it('ogiltiga indata ger tom lista', () => {
    expect(niceTicks(Number.NaN, 5)).toEqual([])
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('formaterar axelvärden på svenska', () => {
    expect(decimalsForStep(0.5)).toBe(1)
    expect(decimalsForStep(0.25)).toBe(1)
    expect(decimalsForStep(0.05)).toBe(2)
    expect(decimalsForStep(500)).toBe(0)
    expect(formatTicks([0, 0.5, 1])).toEqual(['0', '0,5', '1'])
    expect(formatTicks([0, 1000, 2000])).toEqual(['0', '1 000', '2 000'])
  })
})

describe('skalor', () => {
  it('linearScale mappar och inverterar', () => {
    const s = linearScale([0, 100], [200, 0])
    expect(s(0)).toBe(200)
    expect(s(100)).toBe(0)
    expect(s(25)).toBe(150)
    expect(s.invert(150)).toBe(25)
  })

  it('linearScale med ett enda värde hamnar i mitten', () => {
    const s = linearScale([5, 5], [0, 100])
    expect(s(5)).toBe(50)
  })

  it('bandLayout begränsar stapelbredden och hittar rätt band', () => {
    const b = bandLayout(7, 350, { maxBandwidth: 24 })
    expect(b.bandwidth).toBe(24)
    expect(b.step).toBeGreaterThan(40)
    // Staplarna ligger i ordning och inom bredden.
    expect(b.x(0)).toBeGreaterThan(0)
    expect(b.x(6) + b.bandwidth).toBeLessThan(350)
    for (let i = 0; i < 7; i++) expect(b.indexAt(b.center(i))).toBe(i)
    expect(b.indexAt(-50)).toBe(0)
    expect(b.indexAt(1000)).toBe(6)
    expect(bandLayout(0, 300).indexAt(10)).toBe(-1)
  })

  it('nearestIndex hittar närmaste värde', () => {
    const xs = [0, 3, 7, 10]
    expect(nearestIndex(xs, -2)).toBe(0)
    expect(nearestIndex(xs, 4.9)).toBe(1)
    expect(nearestIndex(xs, 5.1)).toBe(2)
    expect(nearestIndex(xs, 99)).toBe(3)
    expect(nearestIndex([], 1)).toBe(-1)
  })
})

describe('monoton kubisk kurva', () => {
  const pts: Point[] = [
    { x: 0, y: 10 },
    { x: 10, y: 12 },
    { x: 20, y: 30 },
    { x: 30, y: 31 },
    { x: 40, y: 5 },
    { x: 55, y: 5 },
    { x: 60, y: 9 },
  ]

  it('går genom varje punkt', () => {
    const segs = segments(monotonePath(pts))
    expect(segs).toHaveLength(pts.length - 1)
    segs.forEach(([a, , , b], i) => {
      expect(a).toEqual(pts[i])
      expect(b).toEqual(pts[i + 1])
    })
  })

  it('svänger aldrig över eller under grannpunkterna', () => {
    for (const [a, c1, c2, b] of segments(monotonePath(pts))) {
      const lo = Math.min(a.y, b.y) - 1e-6
      const hi = Math.max(a.y, b.y) + 1e-6
      for (let t = 0; t <= 1; t += 0.05) {
        const p = bezier(a, c1, c2, b, t)
        expect(p.y).toBeGreaterThanOrEqual(lo)
        expect(p.y).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('platta tangenter i lokala extremvärden och på platåer', () => {
    const m = monotoneTangents(pts)
    expect(m[3]).toBe(0) // topp
    expect(m[5]).toBe(0) // platå/dal
    expect(m[1]).toBeGreaterThan(0)
  })

  it('hanterar få punkter', () => {
    expect(monotonePath([])).toBe('')
    expect(monotonePath([{ x: 1, y: 2 }])).toBe('M1,2')
    const two = monotonePath([
      { x: 0, y: 0 },
      { x: 30, y: 30 },
    ])
    // Med två punkter blir kurvan en rak linje (kontrollpunkterna på linjen).
    expect(numbers(two)).toEqual([0, 0, 10, 10, 20, 20, 30, 30])
  })

  it('linjär, trappsteg, yta och band', () => {
    const p = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]
    expect(linearPath(p)).toBe('M0,0L10,5')
    expect(stepPath(p)).toBe('M0,0H10V5')
    expect(areaPath(p, 20, 'linear')).toBe('M0,0L10,5L10,20L0,20Z')
    const band = bandPath(p, [
      { x: 0, y: 10 },
      { x: 10, y: 15 },
    ], 'linear')
    expect(band).toBe('M0,0L10,5L10,15L0,10Z')
  })
})

describe('former', () => {
  it('roundedBarPath rundar toppen men inte basen', () => {
    const d = roundedBarPath(0, 10, 20, 50, 6)
    expect(d.startsWith('M0,60V16A6,6')).toBe(true)
    expect(d.endsWith('V60Z')).toBe(true)
    // Radien krymps för låga staplar.
    expect(roundedBarPath(0, 58, 20, 2, 6)).toContain('A2,2')
    expect(roundedBarPath(0, 0, 0, 10, 4)).toBe('')
  })

  it('polarToCartesian: 0 = klockan 12, medurs', () => {
    const top = polarToCartesian(50, 50, 10, 0)
    expect(top.x).toBeCloseTo(50)
    expect(top.y).toBeCloseTo(40)
    const right = polarToCartesian(50, 50, 10, Math.PI / 2)
    expect(right.x).toBeCloseTo(60)
    expect(right.y).toBeCloseTo(50)
  })

  it('arcPath ritar bågar och hela varv', () => {
    expect(arcPath(50, 50, 10, 0, Math.PI / 2)).toBe('M50,40A10,10 0 0 1 60,50')
    expect(arcPath(50, 50, 10, 0, Math.PI * 1.5)).toContain(' 0 1 1 ')
    const full = arcPath(50, 50, 10, 0, Math.PI * 2)
    expect(full.match(/A/g)).toHaveLength(2)
    expect(arcPath(50, 50, 10, 1, 1)).toMatch(/^M[^A]+$/)
  })
})

describe('värmekarta', () => {
  it('heatLevel delar in i nivåer', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(-5, 100)).toBe(0)
    expect(heatLevel(1, 100)).toBe(1)
    expect(heatLevel(50, 100)).toBe(2)
    expect(heatLevel(100, 100)).toBe(4)
    expect(heatLevel(250, 100)).toBe(4)
    expect(heatLevel(10, 0)).toBe(0)
  })

  it('tint och heatScale använder tokens', () => {
    expect(tint('var(--lg-gran)', 40)).toBe('color-mix(in oklab, var(--lg-gran) 40%, var(--lg-surface-2))')
    expect(tint('var(--lg-gran)', 100)).toBe('var(--lg-gran)')
    const s = heatScale()
    expect(s).toHaveLength(5)
    expect(s[0]).toBe('var(--lg-surface-2)')
    expect(s[4]).toBe('var(--lg-gran)')
  })
})

describe('tidsaxel', () => {
  it('dagsteg för korta perioder', () => {
    const t = timeTicks('2026-09-20', '2026-09-26', 7)
    expect(t).toHaveLength(7)
    expect(t[0]).toEqual({ date: '2026-09-20', label: '20 sep' })
  })

  it('veckosteg på måndagar, med veckonummer', () => {
    const t = timeTicks('2026-09-01', '2026-09-30', 6)
    expect(t.map((x) => x.date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
    const w = timeTicks('2026-09-01', '2026-09-30', 6, { weekNumbers: true })
    expect(w.map((x) => x.label)).toEqual(['v. 37', 'v. 38', 'v. 39', 'v. 40'])
  })

  it('månadssteg med årtal vid årsskifte', () => {
    const t = timeTicks('2026-06-15', '2027-03-10', 12)
    expect(t[0]).toEqual({ date: '2026-07-01', label: 'juli' })
    expect(t.find((x) => x.date === '2027-01-01')?.label).toBe('2027')
    expect(t.length).toBeLessThanOrEqual(12)
  })

  it('kvartal när det blir trångt', () => {
    const t = timeTicks('2025-01-01', '2026-12-31', 5)
    expect(t.length).toBeLessThanOrEqual(5)
    expect(t.every((x) => x.date.endsWith('-01'))).toBe(true)
  })

  it('en enda dag', () => {
    expect(timeTicks('2026-09-26', '2026-09-26')).toEqual([{ date: '2026-09-26', label: '26 sep' }])
  })
})

describe('tooltipPlacement', () => {
  it('centrerar men håller sig inom diagrammet', () => {
    expect(tooltipPlacement(200, 400).translate).toBe('-50%')
    expect(tooltipPlacement(10, 400).translate).toBe('0')
    expect(tooltipPlacement(390, 400).translate).toBe('-100%')
  })
})
