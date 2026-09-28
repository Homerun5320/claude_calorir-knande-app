/**
 * Alias för borttagna och sammanslagna livsmedel: varje id som Lagom någonsin haft ska gå att slå
 * upp – antingen finns livsmedlet kvar eller så pekar ett alias på en ersättare som finns.
 * Kör: npx vitest run src/data/foods
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_FOOD_FILES, BUILTIN_FOODS } from './index'
import { LEGACY_FOOD_IDS, LEGACY_FOOD_IDS_BY_FILE } from './legacy-ids'
import { FOOD_ALIASES, FOOD_ALIAS_FILES, FOOD_ALIAS_LIST, aliasAmount, canonicalFoodId, resolveFoodAlias } from './aliases'
import { LEGACY_ALIAS_PORTIONS } from './aliases/legacy-portions'
import type { FoodAlias } from '../../types'

const byId = new Map(BUILTIN_FOODS.map((f) => [f.id, f]))
const ID = /^lagom:[a-z0-9-]+$/

describe('livsmedelsalias', () => {
  it('har samma datafiler som databasen', () => {
    expect(Object.keys(FOOD_ALIAS_FILES).sort()).toEqual(Object.keys(BUILTIN_FOOD_FILES).sort())
    expect(Object.keys(LEGACY_FOOD_IDS_BY_FILE).sort()).toEqual(Object.keys(BUILTIN_FOOD_FILES).sort())
  })

  it('täcker varje tidigare id: livsmedlet finns kvar eller har ett alias till en ersättare som finns', () => {
    const missing = LEGACY_FOOD_IDS.filter((id) => {
      if (byId.has(id)) return false
      const alias = FOOD_ALIASES.get(id)
      return !alias || !byId.has(alias.to)
    })
    expect(missing).toEqual([])
  })

  it('har giltiga, unika alias utan kedjor', () => {
    const problems: string[] = []
    const seen = new Set<string>()
    for (const a of FOOD_ALIAS_LIST) {
      if (!ID.test(a.from)) problems.push(`${a.from}: ogiltigt id (skriv hela id:t med 'lagom:')`)
      if (!ID.test(a.to)) problems.push(`${a.from}: ogiltigt mål ${a.to}`)
      if (seen.has(a.from)) problems.push(`${a.from}: finns flera gånger`)
      seen.add(a.from)
      if (a.from === a.to) problems.push(`${a.from}: pekar på sig själv`)
      if (FOOD_ALIASES.has(a.to)) problems.push(`${a.from} → ${a.to}: målet är självt ett alias (peka direkt på slutmålet)`)
      if (byId.has(a.from)) problems.push(`${a.from}: livsmedlet finns kvar – aliaset används aldrig`)
      if (!byId.has(a.to)) problems.push(`${a.from} → ${a.to}: målet finns inte`)
      if (a.unit !== undefined && a.unit !== 'g-ra') problems.push(`${a.from}: okänd enhet ${String(a.unit)}`)
      if (a.unit === 'g-ra' && !byId.get(a.to)?.rawWeight) problems.push(`${a.from} → ${a.to}: unit 'g-ra' kräver rawWeight (raw) på målet`)
      if (a.scale !== undefined && !(a.scale > 0 && a.scale < 20)) problems.push(`${a.from}: orimlig scale ${a.scale}`)
      if (a.scale !== undefined && a.unit === 'g-ra') problems.push(`${a.from}: scale och unit 'g-ra' går inte att kombinera`)
      if (a.density !== undefined && !(a.density > 0.05 && a.density < 2.5)) problems.push(`${a.from}: orimlig densitet ${a.density}`)
    }
    expect(problems).toEqual([])
  })

  it('lägger varje alias i samma fil som det gamla livsmedlet låg i', () => {
    const wrong: string[] = []
    for (const [file, aliases] of Object.entries(FOOD_ALIAS_FILES)) {
      const legacy = new Set<string>(LEGACY_FOOD_IDS_BY_FILE[file as keyof typeof LEGACY_FOOD_IDS_BY_FILE])
      for (const a of aliases) if (!legacy.has(a.from)) wrong.push(`${file}: ${a.from}`)
    }
    expect(wrong).toEqual([])
  })

  it('räknar om gamla mängder i gram till rå vikt för rå rader', () => {
    const raw: FoodAlias = { from: 'lagom:x-ra', to: 'lagom:x-stekt', unit: 'g-ra' }
    const plain: FoodAlias = { from: 'lagom:y', to: 'lagom:z' }
    expect(aliasAmount(raw, 150, 'g')).toEqual({ amount: 150, unit: 'g-ra' })
    expect(aliasAmount(raw, 0.5, 'kg')).toEqual({ amount: 500, unit: 'g-ra' })
    expect(aliasAmount(raw, 1, 'portion:file')).toEqual({ amount: 1, unit: 'portion:file' })
    // Volym av den okokta varan blir "dl okokt" ("3 dl torrt ris" → 3 dl okokt ris).
    expect(aliasAmount(raw, 3, 'dl')).toEqual({ amount: 3, unit: 'dl-ra' })
    expect(aliasAmount(raw, 2, 'msk')).toEqual({ amount: 0.3, unit: 'dl-ra' })
    expect(aliasAmount(raw, 1, 'portion:dl')).toEqual({ amount: 1, unit: 'dl-ra' })
    expect(aliasAmount(plain, 3, 'dl')).toEqual({ amount: 3, unit: 'dl' })
    expect(aliasAmount(plain, 150, 'g')).toEqual({ amount: 150, unit: 'g' })
    expect(aliasAmount(undefined, 2, 'dl')).toEqual({ amount: 2, unit: 'dl' })
  })

  it('räknar om gamla mängder med skalfaktor och det gamla livsmedlets densitet', () => {
    const scaled: FoodAlias = { from: 'lagom:x-tillagad', to: 'lagom:x-torr', scale: 0.25, density: 1, portions: { tallrik: 400, portion: 'paket' } }
    expect(aliasAmount(scaled, 300, 'g')).toEqual({ amount: 75, unit: 'g' })
    expect(aliasAmount(scaled, 1, 'kg')).toEqual({ amount: 0.25, unit: 'kg' })
    expect(aliasAmount(scaled, 2, 'dl')).toEqual({ amount: 50, unit: 'g' })
    expect(aliasAmount(scaled, 1, 'portion:tallrik')).toEqual({ amount: 100, unit: 'g' })
    expect(aliasAmount(scaled, 2, 'portion:portion')).toEqual({ amount: 2, unit: 'portion:paket' })
    // Rå rad med egen densitet: "1 dl torr pärlcouscous" (0,75 g/ml) blir 75 g okokt, inte 1 dl okokt pasta.
    const dense: FoodAlias = { from: 'lagom:y-torr', to: 'lagom:y-kokt', unit: 'g-ra', density: 0.75 }
    expect(aliasAmount(dense, 1, 'dl')).toEqual({ amount: 75, unit: 'g-ra' })
    expect(aliasAmount(dense, 2, 'msk')).toEqual({ amount: 22.5, unit: 'g-ra' })
    expect(aliasAmount(dense, 60, 'g')).toEqual({ amount: 60, unit: 'g-ra' })
  })

  it('ger samma energi för tillagade snabbnudlar och tallriken korv Stroganoff med ris', () => {
    const kcal = (id: string) => byId.get(id)?.nutrients.kcal ?? Number.NaN
    // Förut: 300 g tillagade snabbnudlar à 78 kcal = 234 kcal.
    const nudlar = aliasAmount(FOOD_ALIASES.get('lagom:snabbnudlar-tillagade'), 300, 'g')
    expect(nudlar.unit).toBe('g')
    expect((nudlar.amount * kcal('lagom:snabbnudlar-okokta')) / 100).toBeCloseTo(234, -1)
    expect(aliasAmount(FOOD_ALIASES.get('lagom:snabbnudlar-tillagade'), 1, 'portion:portion')).toEqual({ amount: 1, unit: 'portion:paket' })
    // Förut: 380 g korv Stroganoff med ris à 187 kcal = 711 kcal.
    const korv = aliasAmount(FOOD_ALIASES.get('lagom:korv-stroganoff-ris'), 380, 'g')
    expect((korv.amount * kcal('lagom:korv-stroganoff')) / 100).toBeCloseTo(711, -1)
  })

  it('räknar om gamla portioner som ersättaren saknar eller som väger annorlunda', () => {
    const raw: FoodAlias = { from: 'lagom:x-ra', to: 'lagom:x-stekt', unit: 'g-ra', portions: { forp: 900, st: 'bit' } }
    const plain: FoodAlias = { from: 'lagom:y', to: 'lagom:z', portions: { skiva: 6.5, burk: 'burk-25' } }
    expect(aliasAmount(raw, 1, 'portion:forp')).toEqual({ amount: 900, unit: 'g-ra' })
    expect(aliasAmount(raw, 2, 'portion:st')).toEqual({ amount: 2, unit: 'portion:bit' })
    expect(aliasAmount(plain, 2, 'portion:skiva')).toEqual({ amount: 13, unit: 'g' })
    expect(aliasAmount(plain, 1, 'portion:burk')).toEqual({ amount: 1, unit: 'portion:burk-25' })
    // Portioner som inte finns i listan behålls.
    expect(aliasAmount(plain, 1, 'portion:glas')).toEqual({ amount: 1, unit: 'portion:glas' })
    expect(aliasAmount(plain, 1, 'portion:constructor')).toEqual({ amount: 1, unit: 'portion:constructor' })
  })

  it('har giltiga gamla portioner: bara för alias, till portioner som finns hos ersättaren', () => {
    const problems: string[] = []
    for (const [from, portions] of Object.entries(LEGACY_ALIAS_PORTIONS)) {
      const alias = FOOD_ALIASES.get(from)
      if (!alias) {
        problems.push(`${from}: inget alias`)
        continue
      }
      expect(alias.portions).toBe(portions)
      const target = byId.get(alias.to)
      for (const [id, to] of Object.entries(portions)) {
        if (typeof to === 'string' && !target?.portions.some((p) => p.id === to)) problems.push(`${from} ${id}: ${alias.to} saknar portionen ${to}`)
        if (typeof to === 'number' && !(to > 0)) problems.push(`${from} ${id}: ogiltig vikt ${to}`)
      }
    }
    expect(problems).toEqual([])
    // Exempel: en förpackning rå kycklingfilé är fortfarande 900 g rå, inte en förpackning strimlad.
    expect(aliasAmount(FOOD_ALIASES.get('lagom:kycklingfile-ra'), 1, 'portion:forp')).toEqual({ amount: 900, unit: 'g-ra' })
  })

  it('slår bara upp alias för Lagoms egna id:n', () => {
    const map = new Map<string, FoodAlias>([
      ['lagom:gammal', { from: 'lagom:gammal', to: 'lagom:ny' }],
      ['lmv:1', { from: 'lmv:1', to: 'lagom:ny' }],
    ])
    expect(resolveFoodAlias('lagom:gammal', map)?.to).toBe('lagom:ny')
    expect(resolveFoodAlias('lmv:1', map)).toBeUndefined()
    expect(canonicalFoodId('lagom:gammal', map)).toBe('lagom:ny')
    expect(canonicalFoodId('lagom:ny', map)).toBe('lagom:ny')
    expect(canonicalFoodId('custom:abc', map)).toBe('custom:abc')
  })
})
