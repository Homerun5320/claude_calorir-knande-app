import { isAbort, shareOrCopy } from './share'

describe('shareOrCopy', () => {
  it('använder Web Share när det finns', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    await expect(shareOrCopy('Titel', 'Text', { share, clipboard: { writeText } })).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Titel', text: 'Text' })
    expect(writeText).not.toHaveBeenCalled()
  })

  it('rapporterar avbrott utan att kopiera', async () => {
    const abort = Object.assign(new Error('avbrutet'), { name: 'AbortError' })
    const writeText = vi.fn()
    await expect(shareOrCopy('T', 'x', { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText } })).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('faller tillbaka på urklipp', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    await expect(shareOrCopy('T', 'Hej', { clipboard: { writeText } })).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('Hej')
    // Även när delning finns men inte stöder datan.
    await expect(shareOrCopy('T', 'Hej', { share: vi.fn(), canShare: () => false, clipboard: { writeText } })).resolves.toBe('copied')
    // Och när delningen misslyckas av annat skäl.
    await expect(shareOrCopy('T', 'Hej', { share: vi.fn().mockRejectedValue(new Error('nej')), clipboard: { writeText } })).resolves.toBe('copied')
  })

  it('misslyckas vänligt utan delning och urklipp', async () => {
    await expect(shareOrCopy('T', 'x', {})).resolves.toBe('failed')
    await expect(shareOrCopy('T', 'x', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('nej')) } })).resolves.toBe('failed')
  })
})

describe('isAbort', () => {
  it('känner igen en stängd delningsdialog', () => {
    expect(isAbort(new DOMException('Avbrutet', 'AbortError'))).toBe(true)
    expect(isAbort(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true)
    expect(isAbort(new DOMException('Nej', 'NotAllowedError'))).toBe(false)
    expect(isAbort(null)).toBe(false)
    expect(isAbort('AbortError')).toBe(false)
  })
})
