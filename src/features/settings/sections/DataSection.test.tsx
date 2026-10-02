/**
 * Inställningar → Data: export med riktigt utfall, texter som stämmer för webben och apparna,
 * flytt till ny enhet och import från andra appar (med betalväggen).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../../components/ui'
import { DialogHost } from '../../../components/ui/Dialog'
import { clearDemoFlag, setDemoFlag } from '../../../lib/demoFlag'
import { useBodyStore } from '../../../stores/bodyStore'
import { useDiaryStore } from '../../../stores/diaryStore'
import { useLicenseStore } from '../../../stores/licenseStore'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import { readLastBackup } from '../backupStatus'
import type { SaveOutcome } from '../../../lib/backup'

MotionGlobalConfig.skipAnimations = true

const m = vi.hoisted(() => ({
  saveBackup: vi.fn<() => Promise<SaveOutcome>>(),
  saveFile: vi.fn<(name: string, content: string, mime?: string) => Promise<SaveOutcome>>(),
  wipeAndReset: vi.fn<(opts?: { removeLicense?: boolean; keepOwnCopies?: boolean }) => Promise<void>>(async () => {}),
  flags: {
    inApp: false,
    sellsOnWeb: true,
    allowsKey: true,
    native: false,
    distribution: 'web' as 'web' | 'appstore' | 'play',
    canLog: true,
    demo: false,
    ios: false,
  },
}))

vi.mock('../../../lib/backup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/backup')>()),
  saveBackup: m.saveBackup,
  saveFile: m.saveFile,
}))

vi.mock('../wipe', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../wipe')>()),
  wipeAndReset: m.wipeAndReset,
}))

vi.mock('../../../config/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/platform')>()
  return {
    ...actual,
    get DISTRIBUTION() {
      return m.flags.distribution
    },
    isInApp: () => m.flags.inApp,
    isNativeApp: () => m.flags.native,
    isTwa: () => false,
    isIosDevice: () => m.flags.ios,
    sellsOnWeb: () => m.flags.sellsOnWeb,
    allowsLicenseKeyEntry: () => m.flags.allowsKey,
    storagePlace: () => (m.flags.inApp ? 'i appen på den här enheten' : 'i den här webbläsaren'),
  }
})

vi.mock('../../../hooks/useAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useAccess')>()),
  currentAccess: () => ({
    status: m.flags.canLog ? { kind: 'prov', daysLeft: 5, endsAt: Date.now() + 5 * 86_400_000 } : { kind: 'utgangen', endedAt: Date.now(), licenseExpired: false },
    canLog: m.flags.canLog,
    checking: false,
    demo: m.flags.demo,
  }),
}))

const { DataSection } = await import('./DataSection')

const lastToast = () => useToastStore.getState().toasts.at(-1)
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: 'Exportera (JSON)' }))

function renderSection() {
  return render(
    <MemoryRouter>
      <DataSection />
      <DialogHost />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await waitFor(() => expect([useDiaryStore, useBodyStore, useLicenseStore, useProfileStore].every((s) => s.persist.hasHydrated())).toBe(true))
})

beforeEach(() => {
  Object.assign(m.flags, { inApp: false, sellsOnWeb: true, allowsKey: true, native: false, distribution: 'web', canLog: true, demo: false, ios: false })
  m.saveBackup.mockReset()
  m.saveFile.mockReset()
  m.wipeAndReset.mockClear()
  clearDemoFlag()
  localStorage.clear()
  useToastStore.setState({ toasts: [] })
  useDiaryStore.getState().clearDiary()
  useBodyStore.getState().clearBody()
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
  useLicenseStore.setState({ trialStartedAt: new Date(2026, 8, 1, 12).getTime(), licenseKey: null, activatedAt: null })
})

describe('export', () => {
  it('avbruten delning: ingen notis och "senaste säkerhetskopian" ändras inte', async () => {
    m.saveBackup.mockResolvedValue('cancelled')
    renderSection()
    clickSave()
    await waitFor(() => expect(m.saveBackup).toHaveBeenCalledTimes(1))
    await act(async () => {})
    expect(readLastBackup()).toBeNull()
    expect(lastToast()).toBeUndefined()
  })

  it('delad kopia räknas som sparad och påminner om Spara i Filer på iPhone', async () => {
    m.flags.ios = true
    m.saveBackup.mockResolvedValue('shared')
    renderSection()
    clickSave()
    await waitFor(() => expect(lastToast()?.message).toBe('Delad – välj Spara i Filer för att behålla den'))
    expect(readLastBackup()).not.toBeNull()
  })

  it('på Android nämns inte "Spara i Filer" (det heter så bara på iPhone)', async () => {
    m.saveBackup.mockResolvedValue('shared')
    renderSection()
    clickSave()
    await waitFor(() => expect(lastToast()?.message).toBe('Delad – spara filen där du hittar den igen, t.ex. i Filer eller Google Drive'))
  })

  it('nedladdad kopia', async () => {
    m.saveBackup.mockResolvedValue('saved')
    renderSection()
    clickSave()
    await waitFor(() => expect(lastToast()?.message).toMatch(/^Säkerhetskopian är sparad/))
    expect(readLastBackup()).not.toBeNull()
  })

  it('misslyckad kopia visar ett fel', async () => {
    m.saveBackup.mockResolvedValue('failed')
    renderSection()
    clickSave()
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error' }))
    expect(readLastBackup()).toBeNull()
  })

  it('CSV-exporten använder samma utfall', async () => {
    useDiaryStore.getState().addEntry({ kind: 'quick', date: '2026-09-20', meal: 'lunch', name: 'Soppa', nutrients: { kcal: 300 } })
    m.saveFile.mockResolvedValue('cancelled')
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Exportera dagbok som CSV' }))
    await waitFor(() => expect(m.saveFile).toHaveBeenCalledTimes(1))
    expect(m.saveFile.mock.calls[0][0]).toMatch(/^lagom-dagbok-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(m.saveFile.mock.calls[0][2]).toBe('text/csv')
    await act(async () => {})
    expect(lastToast()).toBeUndefined()

    m.saveFile.mockResolvedValue('saved')
    fireEvent.click(screen.getByRole('button', { name: 'Exportera dagbok som CSV' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Dagboken är exporterad som CSV'))
  })
})

describe('texter om data och lagring', () => {
  it('på webben: webbläsaren, Open Food Facts, Netlify, Stripe och länk till integritetspolicyn', async () => {
    renderSection()
    const privacy = screen.getByRole('heading', { name: 'Din data är din' }).closest('section') as HTMLElement
    expect(privacy).toHaveTextContent(
      'Din dagbok sparas bara i den här webbläsaren. Sökord och streckkoder skickas till Open Food Facts, produktbilder hämtas därifrån och vårt webbhotell Netlify ser din IP-adress när appen laddas. Läs mer i integritetspolicyn.',
    )
    expect(within(privacy).getByRole('link', { name: 'integritetspolicyn' })).toHaveAttribute('href', '/integritet')
    expect(privacy).toHaveTextContent(/Stripe/)
    expect(privacy).toHaveTextContent('Du kan när som helst ta med dig all data (export) eller radera den.')
    expect(privacy).not.toHaveTextContent(/GDPR/)
    expect(await screen.findByText('Skydd mot automatisk rensning')).toBeInTheDocument()
  })

  it('i iPhone-appen: ingen Stripe, inga webbläsartexter och bara App Store', () => {
    Object.assign(m.flags, { inApp: true, sellsOnWeb: false, allowsKey: false, native: true, distribution: 'appstore' })
    renderSection()
    const privacy = screen.getByRole('heading', { name: 'Din data är din' }).closest('section') as HTMLElement
    expect(privacy).toHaveTextContent('Din dagbok sparas bara i appen på den här enheten.')
    expect(privacy).toHaveTextContent('Köp sköts av App Store.')
    expect(privacy).not.toHaveTextContent(/Stripe|Google Play/)
    expect(screen.queryByText('Skydd mot automatisk rensning')).not.toBeInTheDocument()
    expect(screen.queryByText(/Använt utrymme|Webbläsaren visar inte/)).not.toBeInTheDocument()
    expect(screen.queryByText(/webbläsare/i)).not.toBeInTheDocument()
  })

  it('i Google Play-bygget nämns Google Play', () => {
    Object.assign(m.flags, { inApp: true, sellsOnWeb: false, distribution: 'play' })
    renderSection()
    expect(screen.getByText('Köp sköts av Google Play.')).toBeInTheDocument()
  })
})

describe('framstegsbilder', () => {
  it('säger att bilderna inte ingår i säkerhetskopian men raderas med all data – bara när de är på', () => {
    const { unmount } = renderSection()
    expect(screen.queryByText(/Framstegsbilder ingår inte/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Tar bort allt från den här enheten\./)).toBeInTheDocument()
    unmount()

    useProfileStore.setState((s) => ({ settings: { ...s.settings, progressPhotos: true } }))
    renderSection()
    expect(screen.getByText('Framstegsbilder ingår inte – de finns bara i den här webbläsaren.')).toBeInTheDocument()
    expect(screen.getByText(/^Tar bort allt från den här enheten, även framstegsbilderna\./)).toBeInTheDocument()
  })
})

describe('byta telefon eller flytta till appen', () => {
  it('förklarar flytten med säkerhetskopia', () => {
    renderSection()
    const card = screen.getByRole('heading', { name: 'Byta telefon eller flytta till appen' }).closest('section') as HTMLElement
    expect(card).toHaveTextContent(
      'Din data finns i den här webbläsaren och flyttar inte med automatiskt. Spara en säkerhetskopia här, öppna Lagom på den nya enheten eller i appen och välj Återställ från säkerhetskopia.',
    )
    expect(card).not.toHaveTextContent(/licensnyckel/i)
    expect(within(card).getByRole('button', { name: 'Spara säkerhetskopia' })).toBeInTheDocument()
  })

  it('på webben med en licensnyckel: ber om ett mejl innan man byter till iPhone-appen', () => {
    useLicenseStore.setState({ licenseKey: 'webbnyckel' })
    renderSection()
    const card = screen.getByRole('heading', { name: 'Byta telefon eller flytta till appen' }).closest('section') as HTMLElement
    expect(card).toHaveTextContent('Har du en licensnyckel och vill använda Lagom i iPhone-appen? Mejla oss innan du byter, så hjälper vi dig.')
  })

  it('i App Store-bygget nämns aldrig webbköp (Apples riktlinjer 3.1.1 och 3.1.3)', () => {
    Object.assign(m.flags, { inApp: true, sellsOnWeb: false, allowsKey: false, native: true, distribution: 'appstore' })
    useLicenseStore.setState({ licenseKey: 'webbnyckel' })
    renderSection()
    const card = screen.getByRole('heading', { name: 'Byta telefon eller flytta till appen' }).closest('section') as HTMLElement
    expect(card).toHaveTextContent('Din data finns i appen på den här enheten')
    expect(card).not.toHaveTextContent(/webben|licensnyckel|licens/i)
  })
})

describe('import av säkerhetskopia', () => {
  const backupFile = () =>
    new File(
      [
        JSON.stringify({
          format: 'lagom-backup',
          version: 1,
          exportedAt: '2026-09-20T10:00:00.000Z',
          app: 'Lagom',
          data: {
            profile: { profile: null, settings: {} },
            diary: { entries: { '2026-09-19': [{ id: 'q1', kind: 'quick', date: '2026-09-19', meal: 'lunch', name: 'Min lunch', nutrients: { kcal: 500 }, createdAt: 1 }] }, water: {}, exercise: {}, days: {} },
            food: {},
            body: { weights: [], measurements: [] },
          },
        }),
      ],
      'lagom-sakerhetskopia.json',
      { type: 'application/json' },
    )

  async function chooseBackup(container: HTMLElement) {
    const input = container.querySelector('input[accept="application/json,.json"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { files: [backupFile()] } })
    })
  }

  it('med exempeldata går kopian inte att slå ihop med exemplet – den ersätter det', async () => {
    localStorage.setItem('lagom-demo', '1')
    useDiaryStore.getState().addEntry({ kind: 'quick', date: '2026-09-18', meal: 'middag', name: 'Exempelmiddag', nutrients: { kcal: 600 } })
    const { container } = renderSection()
    await chooseBackup(container)
    const sheet = await screen.findByRole('dialog', { name: 'Importera säkerhetskopia' })
    expect(within(sheet).queryByRole('button', { name: 'Slå ihop med min data' })).not.toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Ersätt exempeldatan' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Säkerhetskopian är återställd'))
    expect(Object.keys(useDiaryStore.getState().entries)).toEqual(['2026-09-19'])
    expect(localStorage.getItem('lagom-demo')).toBeNull()
  })

  it('utan exempeldata finns båda valen', async () => {
    const { container } = renderSection()
    await chooseBackup(container)
    const sheet = await screen.findByRole('dialog', { name: 'Importera säkerhetskopia' })
    expect(within(sheet).getByRole('button', { name: 'Slå ihop med min data' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Ersätt allt' })).toBeInTheDocument()
  })
})

describe('byt från annan app', () => {
  const MFP = [
    'Date,Meal,Calories,Fat (g),Carbohydrates (g),Protein (g)',
    '2026-08-30,Lunch,650,20,70,40',
    '2026-08-31,Dinner,700,25,60,45',
    '2026-09-02,Lunch,600,18,65,38',
  ].join('\n')

  async function chooseFile(content: string, name = 'Nutrition-Summary.csv') {
    const input = screen.getByTestId('annan-app-fil') as HTMLInputElement
    expect(input).toHaveAttribute('accept', '.csv,.zip,text/csv,application/zip')
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File([content], name, { type: 'text/csv' })] } })
    })
  }

  it('visar en förhandsvisning och importerar', async () => {
    renderSection()
    await chooseFile(MFP)
    const sheet = await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })
    expect(within(sheet).getByText('3 dagar · 3 måltider')).toBeInTheDocument()
    expect(within(sheet).getByText('0 vägningar')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Importerat: 3 måltider.'))
    expect(useDiaryStore.getState().entries['2026-08-30'][0]).toMatchObject({ kind: 'quick', meal: 'lunch', note: 'Importerat från MyFitnessPal – Lunch' })

    // Samma fil igen: inga dubbletter.
    await chooseFile(MFP)
    const again = await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })
    fireEvent.click(within(again).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Inget nytt att importera – allt fanns redan.'))
    expect(Object.values(useDiaryStore.getState().entries).flat()).toHaveLength(3)
  })

  it('en nyare export uppdaterar redan importerade måltider', async () => {
    renderSection()
    await chooseFile(MFP)
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Importerat: 3 måltider.'))
    await chooseFile(MFP.replace('2026-09-02,Lunch,600,18,65,38', '2026-09-02,Lunch,750,22,80,45'))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(lastToast()?.message).toBe('1 måltid fick nya värden från filen. 2 poster fanns redan och hoppades över.'))
    const day = useDiaryStore.getState().entries['2026-09-02']
    expect(day).toHaveLength(1)
    expect(day[0].kind === 'quick' && day[0].nutrients.kcal).toBe(750)
  })

  it('betalväggen: dagar från provperiodens start kräver en licens', async () => {
    m.flags.canLog = false
    renderSection()
    await chooseFile(MFP)
    const sheet = await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })
    expect(within(sheet).getByText('1 dag efter provperiodens start hoppas över – de kräver en licens.', { exact: false })).toBeInTheDocument()
    expect(within(sheet).getByText('2 dagar · 2 måltider')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(lastToast()?.message).toBe('Importerat: 2 måltider. 1 dag efter provperiodens start hoppades över – de kräver en licens.'))
    expect(useDiaryStore.getState().entries['2026-09-02']).toBeUndefined()
  })

  it('vikt före provstarten importeras alltid – exempeldata går inte att importera till', async () => {
    m.flags.canLog = false
    renderSection()
    await chooseFile('Datum;Vikt\n2026-08-20;75,5\n2026-09-05;74,9\n', 'vikt.csv')
    const sheet = await screen.findByRole('dialog', { name: 'Importera från annan app' })
    expect(within(sheet).getByText('1 vägning')).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Importera' }))
    await waitFor(() => expect(useBodyStore.getState().weights.map((w) => w.date)).toEqual(['2026-08-20']))
  })

  it('exempeldata är skrivskyddad', async () => {
    Object.assign(m.flags, { canLog: false, demo: true })
    useLicenseStore.setState({ trialStartedAt: null })
    renderSection()
    await chooseFile(MFP)
    const sheet = await screen.findByRole('dialog', { name: 'Importera från MyFitnessPal' })
    expect(within(sheet).getByText(/Exempeldatan är skrivskyddad/)).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Importera' })).toBeDisabled()
    // Sammanfattningen visar vad filen innehåller – inte "0 dagar · 0 måltider".
    expect(sheet).not.toHaveTextContent('0 dagar')
    expect(within(sheet).getByRole('button', { name: 'Skapa min egen profil' })).toBeInTheDocument()
  })

  it('ger ett begripligt fel för filer som inte går att använda', async () => {
    renderSection()
    await chooseFile('Namn,Ålder\nAnna,30\n', 'personer.csv')
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', message: 'Hittade ingen datumkolumn (Date eller Datum) i filen.' }))
  })
})

describe('rensa exempeldata', () => {
  it('lämnar användarens egen kopia och bilder kvar (keepOwnCopies) – bara "Radera all data" tar allt', async () => {
    setDemoFlag()
    renderSection()
    fireEvent.click(screen.getByRole('button', { name: 'Rensa exempeldata' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rensa och börja om' }))
    await waitFor(() => expect(m.wipeAndReset).toHaveBeenCalledTimes(1))
    expect(m.wipeAndReset).toHaveBeenCalledWith({ keepOwnCopies: true })
  })
})
