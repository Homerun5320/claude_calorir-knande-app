import { describe, expect, it, vi } from 'vitest'
import { classifyCameraError, cleanManualCode, createScanGate, setTorch, stopStream, torchSupported } from './scanner'

describe('createScanGate', () => {
  it('släpper igenom en ny kod men inte samma kod direkt igen', () => {
    const gate = createScanGate(2000)
    expect(gate.accept('7310865000637', 0)).toBe(true)
    expect(gate.accept('7310865000637', 500)).toBe(false)
    expect(gate.accept('7310865000637', 2500)).toBe(true)
  })

  it('släpper igenom en annan kod direkt', () => {
    const gate = createScanGate(2000)
    gate.accept('11111111', 0)
    expect(gate.accept('22222222', 10)).toBe(true)
  })

  it('är låst medan en produkt visas, och samma kod vilar en stund efter upplåsning', () => {
    const gate = createScanGate(2000)
    gate.accept('7310865000637', 0)
    gate.lock()
    expect(gate.locked).toBe(true)
    expect(gate.accept('22222222', 100)).toBe(false)
    gate.unlock(10_000)
    expect(gate.accept('7310865000637', 11_000)).toBe(false)
    expect(gate.accept('7310865000637', 12_500)).toBe(true)
  })

  it('kan nollställas (t.ex. vid manuell inmatning)', () => {
    const gate = createScanGate(2000)
    gate.accept('7310865000637', 0)
    gate.lock()
    gate.reset()
    expect(gate.accept('7310865000637', 1)).toBe(true)
  })
})

describe('classifyCameraError', () => {
  it('översätter getUserMedia-fel', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied')
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('nocamera')
    expect(classifyCameraError({ name: 'NotReadableError' })).toBe('busy')
    expect(classifyCameraError({ name: 'NotSupportedError' })).toBe('unsupported')
    expect(classifyCameraError(new Error('okänt'))).toBe('error')
  })
})

describe('kamerans spår', () => {
  function fakeStream(caps: Record<string, unknown> = {}) {
    const track = {
      stop: vi.fn(),
      getCapabilities: () => caps,
      applyConstraints: vi.fn(async () => undefined),
    }
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream
    return { stream, track }
  }

  it('stoppar alla spår så att kameran släpps', () => {
    const { stream, track } = fakeStream()
    stopStream(stream)
    expect(track.stop).toHaveBeenCalledOnce()
    expect(() => stopStream(null)).not.toThrow()
  })

  it('känner av och styr ficklampan', async () => {
    expect(torchSupported(fakeStream().stream)).toBe(false)
    const { stream, track } = fakeStream({ torch: true })
    expect(torchSupported(stream)).toBe(true)
    expect(await setTorch(stream, true)).toBe(true)
    expect(track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] })
  })
})

describe('cleanManualCode', () => {
  it('behåller bara siffror, högst 14', () => {
    expect(cleanManualCode('7310 8650-0063 7')).toBe('7310865000637')
    expect(cleanManualCode('1234567890123456')).toBe('12345678901234')
  })
})
