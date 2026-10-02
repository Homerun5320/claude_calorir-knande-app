import { describe, expect, it } from 'vitest'
import { SLOW_READ_TITLE, slowReadText, storageBlockedCause, storageMemoryOnlyScope } from './storageTexts'

/** Det som aldrig får stå i texterna i apparna (App Store-riktlinje 2.3.10 – ingen annan plattform). */
const NOT_IN_APPS = /webbläsar|privat läge|fliken|sidan|Android|Google|Play|iPhone|Safari/i

describe('texter om lagringen', () => {
  it('blockerad lagring: webbläsarens ord på webben, appens ord i apparna', () => {
    expect(storageBlockedCause(false)).toMatch(/Webbläsaren låter inte Lagom spara.*privat läge/)
    expect(storageMemoryOnlyScope(false)).toMatch(/stänger fliken/)
    expect(storageBlockedCause(true)).toBe('Lagom kan inte spara på enheten just nu – t.ex. när lagringen är full.')
    expect(storageMemoryOnlyScope(true)).toMatch(/stänger appen/)
    for (const text of [storageBlockedCause(true), storageMemoryOnlyScope(true)]) expect(text).not.toMatch(NOT_IN_APPS)
  })

  it('långsam läsning: lugn, utan skuld på webbläsaren och utan att något är raderat', () => {
    for (const inApp of [false, true]) {
      const text = `${SLOW_READ_TITLE} ${slowReadText(inApp)}`
      expect(text).toMatch(/Inget är raderat/)
      expect(text).toMatch(/Det du ändrar innan dess sparas inte/)
      expect(text).not.toMatch(/Webbläsaren låter|privat läge|lagringen är full|fel/i)
    }
    expect(slowReadText(false)).toMatch(/ladda om sidan/)
    expect(slowReadText(true)).toMatch(/starta om appen/)
    expect(`${SLOW_READ_TITLE} ${slowReadText(true)}`).not.toMatch(NOT_IN_APPS)
  })
})
