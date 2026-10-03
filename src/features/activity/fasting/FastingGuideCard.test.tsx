/**
 * "Så fungerar fasta i Lagom": texten ska stämma med koden. Webben och de båda apparna (påminnelse
 * och widget finns bara i apparna, widgeten bara i Android-appen och aldrig med plattformsnamn i
 * iPhone-appen), Lagom Moln-tillägget, att fastan ingår i säkerhetskopian och att den inte påverkar
 * dagsmålet.
 */
import { cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { createBackup } from '../../../lib/backup'
import { useFastingStore } from '../../../stores/fastingStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import { useTargets } from '../../../hooks/useTargets'
import type { Profile } from '../../../types'
import { BANNED_FASTING_WORDS } from '../fastingTestUtils'
import { FastingGuideCard } from './FastingGuideCard'
import remindersSource from '../../settings/sections/RemindersSection.tsx?raw'
import widgetSource from '../../../lib/widgetSummary.ts?raw'

const PROFILE: Profile = {
  sex: 'kvinna',
  birthYear: 1990,
  heightCm: 168,
  startWeightKg: 70,
  activityLevel: 'latt',
  goal: 'behalla',
  weeklyRateKg: 0.5,
  lifeStage: 'ingen',
  diet: 'allatare',
  macroPreset: 'nnr',
  createdAt: 0,
}

/** Öppnar varje fråga (som ett tangentbordstryck eller klick gör) så att all text syns. */
function openAll(card: HTMLElement) {
  for (const summary of card.querySelectorAll('summary')) fireEvent.click(summary)
}

/** Renderar en ny kopia av guiden som om Capacitor körde appen på `platform` (modulerna läser plattformen när de laddas). */
async function renderInApp(platform: 'ios' | 'android', opts: { cloud?: boolean } = {}) {
  vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => platform })
  vi.resetModules()
  if (opts.cloud) vi.doMock('../../../config/cloud', () => ({ CLOUD_ENABLED: true }))
  const { FastingGuideCard: Fresh } = (await import('./FastingGuideCard')) as { FastingGuideCard: ComponentType }
  render(<Fresh />)
  return screen.getByRole('region', { name: 'Så fungerar fasta i Lagom' })
}

beforeAll(async () => {
  await waitFor(() => expect([useProfileStore, useFastingStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  useFastingStore.getState().clearFasting()
  useProfileStore.setState({ profile: { ...PROFILE }, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.doUnmock('../../../config/cloud')
  vi.resetModules()
})

describe('FastingGuideCard', () => {
  it('webben: fyra frågor, ingen påminnelse eller widget, lagring "i den här webbläsaren"', () => {
    render(<FastingGuideCard />)
    const card = screen.getByRole('region', { name: 'Så fungerar fasta i Lagom' })
    expect([...card.querySelectorAll('summary')].map((s) => s.textContent)).toEqual([
      'Vad är periodisk fasta?',
      'Så startar och avslutar du',
      'Vad sparas?',
      'Påverkar fastan mitt dagsmål?',
    ])
    expect([...card.querySelectorAll('details')].every((d) => !d.open)).toBe(true)
    openAll(card)
    expect([...card.querySelectorAll('details')].every((d) => d.open)).toBe(true)
    expect(card).toHaveTextContent('Allt sparas i den här webbläsaren, tillsammans med resten av din data, och inget skickas någonstans.')
    expect(card).not.toHaveTextContent(/widget|notis|Moln/)
    expect(card).not.toHaveTextContent(/Android|iPhone|Google|Apple/)
  })

  it('Android-appen: påminnelse och widget, lagring "i appen på den här enheten"', async () => {
    const card = await renderInApp('android')
    expect([...card.querySelectorAll('summary')].map((s) => s.textContent)).toContain('Påminnelse och widget')
    openAll(card)
    expect(card).toHaveTextContent('Allt sparas i appen på den här enheten')
    expect(card).toHaveTextContent(/Slå på När fastan är klar under Inställningar → Påminnelser, så får du en notis när målet nås\./)
    expect(card).toHaveTextContent('Lägger du till Lagoms widget på hemskärmen kan den också visa en pågående fasta, om widgeten är tillräckligt stor.')
    // Plattformsnamn nämns inte i texten (App Store-riktlinje 2.3.10 gäller iPhone-appen, och Android-appen behöver dem inte).
    expect(card).not.toHaveTextContent(/Android|iPhone|Apple|Google/)
  })

  it('iPhone-appen: bara påminnelsen – hemskärmswidgeten är avstängd där och nämns inte', async () => {
    const card = await renderInApp('ios')
    expect([...card.querySelectorAll('summary')].map((s) => s.textContent)).toContain('Påminnelse')
    expect([...card.querySelectorAll('summary')].map((s) => s.textContent)).not.toContain('Påminnelse och widget')
    openAll(card)
    expect(card).toHaveTextContent(/När fastan är klar/)
    expect(card).not.toHaveTextContent(/widget/i)
    expect(card).not.toHaveTextContent(/Android|Google|Health Connect/)
  })

  it('om Lagom Moln är påslaget i bygget står det att fastorna följer med dit när man själv slår på det', async () => {
    const card = await renderInApp('android', { cloud: true })
    openAll(card)
    expect(card).toHaveTextContent('och inget skickas någonstans om du inte själv slår på Lagom Moln.')
  })

  it('texten är lugn och sann: inga löften, inget beröm, inga energisiffror, säkerhetsraden alltid synlig', () => {
    render(<FastingGuideCard />)
    const card = screen.getByRole('region', { name: 'Så fungerar fasta i Lagom' })
    openAll(card)
    expect(card.textContent).not.toMatch(BANNED_FASTING_WORDS)
    expect(card.textContent).not.toMatch(/kcal|kalori/i)
    expect(card).toHaveTextContent(/det är inget misslyckande/)
    // Säkerhetsraden ligger utanför de hopfällbara frågorna och syns alltså även stängd.
    const safety = within(card).getByText(/Fasta passar inte alla\./).closest('p')!
    expect(safety.closest('details')).toBeNull()
    expect(safety).toHaveTextContent(/gravid eller ammar, är under 18 år, har diabetes och tar blodsockersänkande läkemedel \(t\.ex\. insulin\), eller har eller har haft en ätstörning/)
  })
})

describe('guiden mot koden', () => {
  it('fastan ingår i säkerhetskopian (och därmed i "Radera all data", som tömmer samma butik)', () => {
    const active = { start: Date.now() - 3_600_000, targetHours: 16, protocol: '16:8' }
    useFastingStore.setState({ active, history: [{ id: 'f1', start: 1, end: 2 * 3_600_000, targetHours: 16, protocol: '16:8' }] })
    const backup = createBackup()
    expect(backup.data.fasting.active).toEqual(active)
    expect(backup.data.fasting.history).toHaveLength(1)
  })

  it('fastan påverkar inte dagsmålet', () => {
    const today = '2026-09-30'
    const before = renderHook(() => useTargets(today)).result.current.targets
    useFastingStore.setState({ active: { start: Date.now() - 20 * 3_600_000, targetHours: 16, protocol: '16:8' } })
    const during = renderHook(() => useTargets(today)).result.current.targets
    expect(during).toEqual(before)
  })

  it('påminnelsens namn och widgetens text finns kvar i koden som guiden hänvisar till', () => {
    expect(remindersSource).toContain('label="När fastan är klar"')
    expect(widgetSource).toContain("fasting: 'Fasta pågår'")
  })
})
