/**
 * Inställningar → Data: visar om ändringarna sparas på enheten, och uppmanar till en
 * säkerhetskopia när webbläsaren inte låter Lagom spara (bara i minnet). Även påminnelsen om
 * säkerhetskopia (backupStatus), som kommer oftare i Safari i webbläsaren.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { StorageStatus } from './sections/DataSection'
import { BACKUP_REMINDER_DAYS, SAFARI_BACKUP_REMINDER_DAYS, backupDue, backupReminderDays } from './backupStatus'

const status = vi.hoisted(() => ({ memoryOnly: false, newer: false, inApp: false }))
vi.mock('../../hooks/useStorageStatus', () => ({
  useMemoryOnlyStorage: () => status.memoryOnly,
  useHasNewerData: () => status.newer,
}))
vi.mock('../../config/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/platform')>()
  return {
    ...actual,
    isInApp: () => status.inApp,
    storagePlace: () => (status.inApp ? 'i appen på den här enheten' : 'i den här webbläsaren'),
  }
})

function renderStatus(lastBackup: number | null = null) {
  return render(
    <MemoryRouter>
      <StorageStatus lastBackup={lastBackup} />
    </MemoryRouter>,
  )
}

describe('StorageStatus', () => {
  beforeEach(() => Object.assign(status, { memoryOnly: false, newer: false, inApp: false }))

  it('säger att allt sparas på enheten och påminner om säkerhetskopia', () => {
    renderStatus()
    expect(screen.getByRole('status')).toHaveTextContent('Sparas på enheten')
    expect(screen.getByRole('status')).toHaveTextContent('Allt du gör sparas direkt i den här webbläsaren.')
    expect(screen.getByText(/Exportera gärna en säkerhetskopia/)).toHaveTextContent(/eller webbläsarens data rensas/)
    expect(screen.queryByRole('button', { name: /Spara säkerhetskopia/ })).not.toBeInTheDocument()
  })

  it('talar om appen – inte webbläsaren – i butiksapparna', () => {
    status.inApp = true
    renderStatus()
    expect(screen.getByRole('status')).toHaveTextContent('Allt du gör sparas direkt i appen på den här enheten.')
    expect(screen.getByRole('status')).not.toHaveTextContent(/webbläsar/)
  })

  it('förklarar tydligt när ändringarna bara finns i minnet och erbjuder en säkerhetskopia', () => {
    status.memoryOnly = true
    renderStatus(Date.now())
    const box = screen.getByRole('status')
    expect(box).toHaveTextContent('Sparas inte på enheten just nu')
    expect(box).toHaveTextContent(/privat läge/)
    expect(box).toHaveTextContent(/tills du stänger fliken/)
    expect(screen.getByRole('button', { name: 'Spara säkerhetskopia nu' })).toBeInTheDocument()
  })

  it('ber om en uppdatering när datan kommer från en nyare version', () => {
    status.memoryOnly = true
    status.newer = true
    renderStatus()
    expect(screen.getByRole('status')).toHaveTextContent('Din data är från en nyare version av Lagom – uppdatera appen.')
    expect(screen.getByRole('status')).not.toHaveTextContent(/privat läge/)
  })
})

describe('påminnelse om säkerhetskopia', () => {
  const day = 86_400_000
  const now = Date.UTC(2026, 8, 28, 12)

  it('var 30:e dag som standard', () => {
    expect(backupReminderDays({ safariTab: false, persisted: false })).toBe(BACKUP_REMINDER_DAYS)
    expect(backupDue(now - 10 * day, now, true, { safariTab: false, persisted: null })).toBe(false)
    expect(backupDue(now - 31 * day, now, true, { safariTab: false, persisted: null })).toBe(true)
    // Ett antal dagar går fortfarande att ange direkt.
    expect(backupDue(now - 31 * day, now, true)).toBe(true)
    expect(backupDue(now - 3 * day, now, true, 2)).toBe(true)
  })

  it('var 7:e dag i Safari i webbläsaren när lagringen inte är beständig', () => {
    expect(SAFARI_BACKUP_REMINDER_DAYS).toBe(7)
    expect(backupReminderDays({ safariTab: true, persisted: false })).toBe(7)
    // Okänt räknas som inte beständigt.
    expect(backupReminderDays({ safariTab: true, persisted: null })).toBe(7)
    expect(backupReminderDays({ safariTab: true, persisted: true })).toBe(30)
    expect(backupDue(now - 8 * day, now, true, { safariTab: true, persisted: false })).toBe(true)
    expect(backupDue(now - 8 * day, now, true, { safariTab: true, persisted: true })).toBe(false)
    expect(backupDue(now - 6 * day, now, true, { safariTab: true, persisted: false })).toBe(false)
  })

  it('påminner aldrig utan data', () => {
    expect(backupDue(null, now, false, { safariTab: true, persisted: false })).toBe(false)
    expect(backupDue(null, now, true, { safariTab: true, persisted: false })).toBe(true)
  })
})
