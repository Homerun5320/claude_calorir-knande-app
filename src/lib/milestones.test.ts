/**
 * Milstolparna: beräkningen ur befintlig data, att dagar räknas totalt (aldrig i följd), att inget
 * handlar om vikt, kalorier eller förlust, att varje milstolpe firas en gång (och aldrig i klump),
 * och översikten för sidan.
 */
import milestonesSource from './milestones.ts?raw'
import celebrationSource from '../features/more/useMilestoneCelebration.ts?raw'
import pageSource from '../features/more/MilestonesPage.tsx?raw'
import {
  MAX_CELEBRATED_AT_ONCE,
  MILESTONES,
  MILESTONE_IDS,
  achievedIds,
  celebrationText,
  computeMilestones,
  formatMilestoneDate,
  milestoneById,
  milestoneOverview,
  planCelebration,
  waterGoalMl,
  type MilestoneInput,
} from './milestones'
import { addDays } from './dates'
import type { DiaryEntry, ISODate, MealId } from '../types'

const TODAY: ISODate = '2026-09-29'

function entry(date: ISODate, meal: MealId = 'lunch'): DiaryEntry {
  return { id: `e-${date}-${meal}`, kind: 'quick', date, meal, name: 'Något gott', nutrients: {}, createdAt: 1 }
}

/** Dagbok med en post på vart och ett av datumen. */
function diary(dates: readonly ISODate[], meal: MealId = 'lunch'): Record<ISODate, DiaryEntry[]> {
  return Object.fromEntries(dates.map((d) => [d, [entry(d, meal)]]))
}

const at = (date: ISODate, time = '12:00') => new Date(`${date}T${time}:00`).getTime()

function status(input: MilestoneInput, id: string, today: ISODate = TODAY) {
  const s = computeMilestones(input, today).find((m) => m.def.id === id)
  if (!s) throw new Error(`okänd milstolpe ${id}`)
  return s
}

describe('definitionerna', () => {
  it('har unika id:n i samma ordning som MILESTONE_IDS', () => {
    expect(MILESTONES.map((m) => m.id)).toEqual([...MILESTONE_IDS])
    expect(new Set(MILESTONE_IDS).size).toBe(MILESTONE_IDS.length)
    expect(milestoneById('forsta-maltiden')?.title).toBe('Första måltiden loggad')
    expect(milestoneById('okand')).toBeUndefined()
  })

  it('innehåller de efterfrågade milstolparna', () => {
    const titles = MILESTONES.map((m) => m.title)
    for (const t of [
      'Första måltiden loggad',
      'Första egna receptet',
      '10 dagar i dagboken',
      '50 dagar i dagboken',
      'Första veckoplaneringen',
      'Första egna livsmedlet',
      'Första gången du nådde ditt vattenmål',
    ]) {
      expect(titles).toContain(t)
    }
  })

  it('firar aldrig fasta – att avstå från mat ska inte belönas', () => {
    for (const m of MILESTONES) {
      expect(m.id).not.toMatch(/fast/)
      for (const text of [m.title, m.description, m.cheer]) expect(text).not.toMatch(/fasta|fastan|avstå/i)
    }
  })

  it('aldrig streaks, vikt, kalorier, underskott, "perfekta dagar" eller förlustaversion', () => {
    const forbidden = /i rad|i följd|streak|svit|tappa|förlora|missa|bryt|perfekt|underskott|under målet|över målet|vikt|kilo|\bkg\b|kcal|kalori|gå ner|bränn|lyckad|misslyck|måste|glöm inte|fortsätt|håll i/i
    for (const m of MILESTONES) {
      for (const text of [m.title, m.description, m.cheer]) expect(text, `${m.id}: ${text}`).not.toMatch(forbidden)
      expect(m.id).not.toMatch(/streak|i-rad|vikt|kg|kcal|perfekt/)
    }
  })

  it('beräkningen läser aldrig vikt eller kroppsmått och räknar aldrig dagar i följd', () => {
    // Källkoden (utan kommentarer) får inte röra kroppsbutiken, vikter eller följder av dagar.
    const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    for (const [name, source] of [
      ['milestones.ts', milestonesSource],
      ['useMilestoneCelebration.ts', celebrationSource],
      ['MilestonesPage.tsx', pageSource],
    ] as const) {
      expect(code(source), name).not.toMatch(/bodyStore|useBodyStore|weights|WeightEntry|kg\b|streak|consecutive|addDays|diffDays|kcal|deficit/i)
    }
  })
})

describe('computeMilestones', () => {
  it('ingen data → inget uppnått', () => {
    const all = computeMilestones({}, TODAY)
    expect(all).toHaveLength(MILESTONES.length)
    expect(achievedIds(all)).toEqual([])
  })

  it('första måltiden: tidigaste dagen med en post', () => {
    const s = status({ entries: { ...diary(['2026-09-20', '2026-09-12']), '2026-09-25': [] } }, 'forsta-maltiden')
    expect(s).toMatchObject({ achieved: true, date: '2026-09-12' })
  })

  it('en post för en kommande dag räknas – men datumet blir aldrig senare än idag', () => {
    expect(status({ entries: diary([addDays(TODAY, 1)]) }, 'forsta-maltiden')).toMatchObject({ achieved: true, date: TODAY })
  })

  it('dagar räknas totalt, inte i följd – luckor gör ingenting', () => {
    // Tio dagar utspridda över en månad (var tredje dag) räknas precis som tio dagar i följd.
    const spread = Array.from({ length: 10 }, (_, i) => addDays('2026-08-01', i * 3))
    const s = status({ entries: diary(spread) }, 'dagar-10')
    expect(s).toMatchObject({ achieved: true, date: spread[9] })
    const inARow = Array.from({ length: 10 }, (_, i) => addDays('2026-08-01', i))
    expect(status({ entries: diary(inARow) }, 'dagar-10').achieved).toBe(true)
    // Nio dagar räcker inte – oavsett ordning.
    expect(status({ entries: diary(spread.slice(0, 9)) }, 'dagar-10').achieved).toBe(false)
  })

  it('50 och 100 dagar: datumet är dag nummer 50 respektive 100', () => {
    const dates = Array.from({ length: 120 }, (_, i) => addDays('2026-01-01', i * 2)).filter((d) => d <= TODAY)
    expect(dates.length).toBeGreaterThanOrEqual(100)
    expect(status({ entries: diary(dates) }, 'dagar-50')).toMatchObject({ achieved: true, date: dates[49] })
    expect(status({ entries: diary(dates) }, 'dagar-100')).toMatchObject({ achieved: true, date: dates[99] })
  })

  it('kommande dagar räknas inte till antalet dagar', () => {
    const dates = [...Array.from({ length: 9 }, (_, i) => addDays(TODAY, -i)), addDays(TODAY, 1), addDays(TODAY, 2)]
    expect(status({ entries: diary(dates) }, 'dagar-10').achieved).toBe(false)
  })

  it('första fikan: en post i måltiden fika', () => {
    expect(status({ entries: diary(['2026-09-10']) }, 'forsta-fikan').achieved).toBe(false)
    expect(status({ entries: { ...diary(['2026-09-10']), ...diary(['2026-09-14'], 'fika') } }, 'forsta-fikan')).toMatchObject({
      achieved: true,
      date: '2026-09-14',
    })
  })

  it('vattenmålet: första dagen med minst målet – aldrig utan mål', () => {
    const water = { '2026-09-10': 1200, '2026-09-12': 1600, '2026-09-15': 2400 }
    expect(status({ water, waterGoalMl: 1600 }, 'forsta-vattenmalet')).toMatchObject({ achieved: true, date: '2026-09-12' })
    expect(status({ water, waterGoalMl: 2500 }, 'forsta-vattenmalet').achieved).toBe(false)
    expect(status({ water, waterGoalMl: 0 }, 'forsta-vattenmalet').achieved).toBe(false)
    expect(status({ water }, 'forsta-vattenmalet').achieved).toBe(false)
  })

  it('egna recept (inte inbyggda), livsmedel, sparade måltider och veckoplanering – datum från när de skapades', () => {
    const input: MilestoneInput = {
      recipes: {
        'r_1': { createdAt: at('2026-09-20') },
        'r_2': { createdAt: at('2026-09-05') },
        klassiker: { createdAt: at('2026-01-01'), builtin: true },
      },
      customFoods: { 'custom:1': { createdAt: at('2026-09-07') } },
      templates: [{ createdAt: at('2026-09-08') }],
      planItems: { '2026-09-30': [{ createdAt: at('2026-09-09') }] },
    }
    expect(status(input, 'forsta-receptet')).toMatchObject({ achieved: true, date: '2026-09-05' })
    expect(status(input, 'forsta-livsmedlet')).toMatchObject({ achieved: true, date: '2026-09-07' })
    expect(status(input, 'forsta-sparade-maltiden')).toMatchObject({ achieved: true, date: '2026-09-08' })
    expect(status(input, 'forsta-veckoplaneringen')).toMatchObject({ achieved: true, date: '2026-09-09' })
    // Bara inbyggda recept räknas inte.
    expect(status({ recipes: { k: { createdAt: 1, builtin: true } } }, 'forsta-receptet').achieved).toBe(false)
  })

  it('utan tidsstämpel: uppnådd men utan datum', () => {
    const s = status({ planItems: { '2026-09-30': [{}] } }, 'forsta-veckoplaneringen')
    expect(s.achieved).toBe(true)
    expect(s.date).toBeUndefined()
  })

  it('första rörelsen och första dagsreflektionen – steg och sömn räknas inte som reflektion', () => {
    expect(status({ exercise: { '2026-09-03': [{ id: 'x', date: '2026-09-03', activityId: 'promenad', name: 'Promenad', minutes: 30, kcal: 100, createdAt: 1 }] } }, 'forsta-rorelsen')).toMatchObject({
      achieved: true,
      date: '2026-09-03',
    })
    expect(status({ days: { '2026-09-02': { steps: 9000, sleepHours: 7 } } }, 'forsta-reflektionen').achieved).toBe(false)
    expect(status({ days: { '2026-09-02': { steps: 9000 }, '2026-09-04': { mood: 4 } } }, 'forsta-reflektionen')).toMatchObject({ achieved: true, date: '2026-09-04' })
    expect(status({ days: { '2026-09-06': { note: 'Skön dag' } } }, 'forsta-reflektionen').achieved).toBe(true)
    expect(status({ days: { '2026-09-06': { note: '   ' } } }, 'forsta-reflektionen').achieved).toBe(false)
  })

  it('tål skadad data utan att kasta', () => {
    const broken = {
      entries: { 'inte-ett-datum': [entry('2026-09-01')], '2026-09-02': 'text', '2026-09-03': null, '2026-02-30': [entry('2026-02-30')] },
      water: 'x',
      exercise: null,
      days: { '2026-09-02': 'glad' },
      recipes: [1, 2],
      customFoods: { a: null },
      templates: 'nej',
      planItems: { '2026-09-30': 'rad' },
      waterGoalMl: Number.NaN,
    } as unknown as MilestoneInput
    expect(() => computeMilestones(broken, TODAY)).not.toThrow()
    expect(achievedIds(computeMilestones(broken, TODAY))).toEqual([])
  })
})

describe('waterGoalMl', () => {
  it('eget mål går före det beräknade, som följer kön och graviditet/amning', () => {
    expect(waterGoalMl({ sex: 'kvinna', lifeStage: 'ingen' })).toBe(1600)
    expect(waterGoalMl({ sex: 'man', lifeStage: 'ingen' })).toBe(2000)
    expect(waterGoalMl({ sex: 'kvinna', lifeStage: 'ammar' })).toBe(2200)
    expect(waterGoalMl({ sex: 'kvinna', lifeStage: 'ingen' }, { waterMl: 2500 })).toBe(2500)
    expect(waterGoalMl({ sex: 'kvinna', lifeStage: 'ingen' }, { waterMl: Number.NaN })).toBe(1600)
    expect(waterGoalMl(null)).toBe(0)
  })
})

describe('planCelebration – firas en gång', () => {
  it('första gången (ingen lista sparad): allt uppnått markeras som sett utan firande', () => {
    expect(planCelebration(['forsta-maltiden', 'dagar-10', 'forsta-receptet'], undefined)).toEqual({
      seen: ['forsta-maltiden', 'dagar-10', 'forsta-receptet'],
      celebrate: [],
    })
    // En ny användare utan något uppnått får en tom lista – så att nästa milstolpe firas.
    expect(planCelebration([], undefined)).toEqual({ seen: [], celebrate: [] })
  })

  it('en ny milstolpe firas och sparas – nästa gång ingenting', () => {
    const first = planCelebration(['forsta-maltiden'], [])
    expect(first.seen).toEqual(['forsta-maltiden'])
    expect(first.celebrate.map((m) => m.id)).toEqual(['forsta-maltiden'])
    expect(planCelebration(['forsta-maltiden'], first.seen ?? [])).toEqual({ seen: null, celebrate: [] })
  })

  it('en firad milstolpe firas inte igen om den försvinner ur datan och kommer tillbaka', () => {
    expect(planCelebration([], ['forsta-receptet'])).toEqual({ seen: null, celebrate: [] })
    expect(planCelebration(['forsta-receptet'], ['forsta-receptet'])).toEqual({ seen: null, celebrate: [] })
  })

  it(`högst ${MAX_CELEBRATED_AT_ONCE} på en gång – fler (en import eller återställning) markeras tyst`, () => {
    const two = planCelebration(['forsta-maltiden', 'forsta-fikan'], [])
    expect(two.celebrate.map((m) => m.id)).toEqual(['forsta-maltiden', 'forsta-fikan'])
    const many = planCelebration(['forsta-maltiden', 'forsta-fikan', 'dagar-10'], [])
    expect(many).toEqual({ seen: ['forsta-maltiden', 'forsta-fikan', 'dagar-10'], celebrate: [] })
  })

  it('dolda milstolpar: markeras som sedda men firas inte', () => {
    expect(planCelebration(['forsta-maltiden'], [], { hidden: true })).toEqual({ seen: ['forsta-maltiden'], celebrate: [] })
  })

  it('behåller okända id:n (t.ex. från en nyare version) och dubbletter blir inte fler', () => {
    const plan = planCelebration(['forsta-maltiden', 'forsta-maltiden'], ['framtida-milstolpe'])
    expect(plan.seen).toEqual(['framtida-milstolpe', 'forsta-maltiden'])
    expect(plan.celebrate).toHaveLength(1)
  })
})

describe('celebrationText', () => {
  it('varm text utan siffror om mat eller vikt', () => {
    const one = celebrationText([milestoneById('forsta-maltiden')!])
    expect(one).toBe('Ny milstolpe: Första måltiden loggad. Välkommen igång!')
    const two = celebrationText([milestoneById('forsta-receptet')!, milestoneById('dagar-10')!])
    expect(two).toBe('Två nya milstolpar: Första egna receptet och 10 dagar i dagboken.')
    expect(celebrationText([milestoneById('forsta-maltiden')!, milestoneById('forsta-fikan')!])).toBe(
      'Två nya milstolpar: Första måltiden loggad och första fikan i dagboken.',
    )
    expect(celebrationText([])).toBe('')
  })
})

describe('milestoneOverview', () => {
  const statuses = computeMilestones(
    {
      entries: { ...diary(['2026-09-01', '2026-09-20']) },
      recipes: { r: { createdAt: at('2026-09-10') } },
      planItems: { '2026-09-30': [{}] },
    },
    TODAY,
  )

  it('uppnådda med senast uppnådda först och utan datum sist', () => {
    const { achieved, latest } = milestoneOverview(statuses)
    expect(achieved.map((s) => s.def.id)).toEqual(['forsta-receptet', 'forsta-maltiden', 'forsta-veckoplaneringen'])
    expect(latest?.def.id).toBe('forsta-receptet')
  })

  it('en firad milstolpe förblir uppnådd även om datan har ändrats (inget kan gå förlorat)', () => {
    const { achieved } = milestoneOverview(computeMilestones({}, TODAY), { seen: ['forsta-receptet', 'okand'] })
    expect(achieved.map((s) => [s.def.id, s.achieved, s.date])).toEqual([['forsta-receptet', true, undefined]])
  })

  it('några kommande – bara nästa antal dagar, fikan bara när måltiden finns', () => {
    const none = computeMilestones({}, TODAY)
    expect(milestoneOverview(none).upcoming.map((m) => m.id)).toEqual(['forsta-maltiden', 'forsta-vattenmalet', 'dagar-10'])
    const all = milestoneOverview(none, { upcomingLimit: 99 }).upcoming.map((m) => m.id)
    expect(all).not.toContain('dagar-50')
    expect(all).not.toContain('dagar-100')
    expect(milestoneOverview(none, { upcomingLimit: 99, fikaEnabled: false }).upcoming.map((m) => m.id)).not.toContain('forsta-fikan')
    // När 10 dagar är uppnått föreslås 50 – aldrig med ett förlopp eller antal kvar.
    const ten = computeMilestones({ entries: diary(Array.from({ length: 10 }, (_, i) => addDays('2026-09-01', i))) }, TODAY)
    const next = milestoneOverview(ten, { upcomingLimit: 99 }).upcoming.map((m) => m.id)
    expect(next).toContain('dagar-50')
    expect(next).not.toContain('dagar-100')
  })
})

describe('formatMilestoneDate', () => {
  it('"12 september", med år om det är ett annat år', () => {
    expect(formatMilestoneDate('2026-09-12', TODAY)).toBe('12 september')
    expect(formatMilestoneDate('2025-12-24', TODAY)).toBe('24 december 2025')
  })
})
