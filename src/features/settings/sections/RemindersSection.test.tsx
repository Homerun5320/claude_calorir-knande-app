/**
 * Inställningar → Påminnelser: på webben bara en kort text om apparna. I apparna är allt avstängt
 * från början, behörigheten frågas först när en påminnelse slås på, och ett nej förklaras – valet
 * finns kvar. Bron till native-delen (`ReminderBridge`) är mockad.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MotionGlobalConfig } from 'motion/react'
import { DEFAULT_SETTINGS, useProfileStore } from '../../../stores/profileStore'
import {
  defaultReminderSettings,
  setReminderBridge,
  useReminderStore,
  type ReminderBridge,
  type ReminderPermission,
} from '../../../stores/reminderStore'
import { RemindersSection, remindersSummary } from './RemindersSection'

MotionGlobalConfig.skipAnimations = true

const mocks = vi.hoisted(() => ({
  native: false,
  initNative: vi.fn(async () => {}),
}))

vi.mock('../../../native', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../native')>()),
  isNative: () => mocks.native,
  initNative: mocks.initNative,
}))

function fakeBridge(start: ReminderPermission, answer: ReminderPermission = 'granted', platform: 'ios' | 'android' = 'ios') {
  let current = start
  const bridge = {
    platform,
    checkPermission: vi.fn(async () => current),
    requestPermission: vi.fn(async () => {
      if (current === 'prompt') current = answer
      return current
    }),
    sync: vi.fn(async () => {}),
    set: (p: ReminderPermission) => {
      current = p
    },
  } satisfies ReminderBridge & { set: (p: ReminderPermission) => void }
  setReminderBridge(bridge)
  return bridge
}

function renderSection() {
  return render(
    <MemoryRouter>
      <RemindersSection />
    </MemoryRouter>,
  )
}

const switchNamed = (name: string) => screen.getByRole('switch', { name })

beforeAll(async () => {
  await waitFor(() => expect(useReminderStore.persist.hasHydrated() && useProfileStore.persist.hasHydrated()).toBe(true))
})

beforeEach(() => {
  mocks.native = true
  useProfileStore.setState({ profile: null, settings: { ...DEFAULT_SETTINGS, onboardingDone: true } })
})

afterEach(() => {
  setReminderBridge(null)
  useReminderStore.getState().clearReminders()
  mocks.initNative.mockClear()
})

describe('på webben', () => {
  it('berättar att påminnelser finns i apparna – inga reglage', () => {
    mocks.native = false
    renderSection()
    expect(screen.getByRole('heading', { name: 'Påminnelser finns i apparna' })).toBeInTheDocument()
    expect(screen.getByText(/Webbversionen skickar inga notiser/)).toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('i apparna', () => {
  it('allt är avstängt från början och bara måltider som visas i dagboken finns med', async () => {
    fakeBridge('prompt')
    renderSection()
    expect(await screen.findByRole('switch', { name: 'Påminn om Lunch' })).toHaveAttribute('aria-checked', 'false')
    for (const name of ['Påminn om Frukost', 'Påminn om Fika', 'Påminn om Middag', 'Påminn om Mellanmål', 'Påminn om vatten', 'När fastan är klar', 'Säkerhetskopia', 'Veckans fokus']) {
      expect(switchNamed(name)).toHaveAttribute('aria-checked', 'false')
    }
    // Kvällsmat är dold i dagboken som standard.
    expect(screen.queryByRole('switch', { name: 'Påminn om Kvällsmat' })).not.toBeInTheDocument()
    expect(screen.getByText(/nämner aldrig kalorier eller vikt/)).toBeInTheDocument()
    // Ingen fråga om behörighet förrän något slås på.
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('frågar om lov första gången en påminnelse slås på – och inte igen när det är beviljat', async () => {
    const bridge = fakeBridge('prompt', 'granted')
    renderSection()
    await waitFor(() => expect(bridge.checkPermission).toHaveBeenCalled())
    expect(bridge.requestPermission).not.toHaveBeenCalled()

    fireEvent.click(switchNamed('Påminn om Lunch'))
    expect(useReminderStore.getState().meals.lunch.enabled).toBe(true)
    await waitFor(() => expect(bridge.requestPermission).toHaveBeenCalledTimes(1))
    expect(switchNamed('Påminn om Lunch')).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(switchNamed('Veckans fokus'))
    expect(useReminderStore.getState().focus).toBe(true)
    await act(async () => {})
    expect(bridge.requestPermission).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Notiser är avstängda för Lagom')).not.toBeInTheDocument()
  })

  it('ett nej förklaras och valet finns kvar (iPhone)', async () => {
    fakeBridge('prompt', 'denied')
    renderSection()
    fireEvent.click(await screen.findByRole('switch', { name: 'När fastan är klar' }))
    expect(await screen.findByText('Notiser är avstängda för Lagom')).toBeInTheDocument()
    expect(screen.getByText(/leta upp Lagom och slå på Tillåt notiser/)).toBeInTheDocument()
    expect(screen.getByText(/Dina val finns kvar här/)).toBeInTheDocument()
    expect(useReminderStore.getState().fasting).toBe(true)

    // Allt avstängt igen: ingen förklaring behövs.
    fireEvent.click(switchNamed('När fastan är klar'))
    expect(screen.queryByText('Notiser är avstängda för Lagom')).not.toBeInTheDocument()
  })

  it('Android: förklaringen pekar på Aviseringar', async () => {
    fakeBridge('denied', 'denied', 'android')
    useReminderStore.getState().setFlag('backup', true)
    renderSection()
    expect(await screen.findByText(/Appar → Lagom → Aviseringar/)).toBeInTheDocument()
  })

  it('läser behörigheten igen när appen visas på nytt (t.ex. efter telefonens inställningar)', async () => {
    const bridge = fakeBridge('denied')
    useReminderStore.getState().setFlag('focus', true)
    renderSection()
    expect(await screen.findByText('Notiser är avstängda för Lagom')).toBeInTheDocument()
    bridge.set('granted')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(screen.queryByText('Notiser är avstängda för Lagom')).not.toBeInTheDocument())
  })

  it('påslaget men aldrig frågat (t.ex. efter en återställning): knappen Tillåt notiser', async () => {
    const bridge = fakeBridge('prompt', 'granted')
    useReminderStore.getState().replaceSettings({ ...defaultReminderSettings(), backup: true })
    renderSection()
    fireEvent.click(await screen.findByRole('button', { name: 'Tillåt notiser' }))
    await waitFor(() => expect(bridge.requestPermission).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tillåt notiser' })).not.toBeInTheDocument())
  })

  it('måltidens klockslag går att ändra när påminnelsen är på', async () => {
    fakeBridge('granted')
    renderSection()
    expect(screen.queryByLabelText('Klockslag för Frukost')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('switch', { name: 'Påminn om Frukost' }))
    const field = screen.getByLabelText('Klockslag för Frukost')
    expect(field).toHaveValue('07:30')
    fireEvent.change(field, { target: { value: '06:45' } })
    expect(useReminderStore.getState().meals.frukost.time).toBe('06:45')
    // Ett tomt fält sparas inte och får tillbaka tiden när det lämnas.
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(useReminderStore.getState().meals.frukost.time).toBe('06:45')
    expect(field).toHaveValue('06:45')
  })

  it('vatten: tidsfönster och hur ofta, med tiderna utskrivna', async () => {
    fakeBridge('granted')
    renderSection()
    expect(screen.queryByRole('combobox', { name: 'Hur ofta' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('switch', { name: 'Påminn om vatten' }))
    expect(useReminderStore.getState().water.enabled).toBe(true)
    expect(screen.getByText('Kl. 09:00, 11:00, 13:00, 15:00, 17:00 och 19:00.')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Hur ofta' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Till' }), { target: { value: '18' } })
    expect(useReminderStore.getState().water).toEqual({ enabled: true, from: 9, to: 18, every: 3 })
    expect(screen.getByText('Kl. 09:00, 12:00, 15:00 och 18:00.')).toBeInTheDocument()
  })

  it('väntar på native-delen och säger till om den inte startar', async () => {
    renderSection()
    expect(screen.getByRole('status')).toHaveTextContent('Laddar påminnelserna')
    expect(await screen.findByText(/Påminnelserna gick inte att starta just nu/)).toBeInTheDocument()
    expect(mocks.initNative).toHaveBeenCalled()
  })

  it('visar reglagen så fort bron finns', async () => {
    mocks.initNative.mockImplementationOnce(async () => {
      fakeBridge('granted')
    })
    renderSection()
    expect(await screen.findByRole('switch', { name: 'Påminn om Lunch' })).toBeInTheDocument()
  })
})

describe('remindersSummary', () => {
  it('räknar påslagna påminnelser i appen och hänvisar till apparna på webben', () => {
    const meals = DEFAULT_SETTINGS.meals
    const s = defaultReminderSettings()
    expect(remindersSummary(s, meals, false)).toBe('Finns i apparna för iPhone och Android')
    expect(remindersSummary(s, meals, true)).toBe('Av')
    expect(remindersSummary({ ...s, focus: true }, meals, true)).toBe('1 påminnelse på')
    expect(remindersSummary({ ...s, focus: true, backup: true, water: { ...s.water, enabled: true } }, meals, true)).toBe('3 påminnelser på')
  })
})
