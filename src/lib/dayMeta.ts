/**
 * Skalor för dagens mående (1–5) – delas av kvällsreflektionen på Idag och dagboken
 * så att samma värde alltid betyder samma sak.
 */

export type ScaleKey = 'mood' | 'energy' | 'hunger'

export interface ScaleDef {
  key: ScaleKey
  label: string
  /** Fem alternativ, index 0 = värde 1. */
  options: ReadonlyArray<{ emoji: string; word: string }>
}

export const DAY_SCALES: readonly ScaleDef[] = [
  {
    key: 'mood',
    label: 'Humör',
    options: [
      { emoji: '😞', word: 'Tungt' },
      { emoji: '😕', word: 'Sådär' },
      { emoji: '😐', word: 'Okej' },
      { emoji: '🙂', word: 'Bra' },
      { emoji: '😄', word: 'Toppen' },
    ],
  },
  {
    key: 'energy',
    label: 'Energi',
    options: [
      { emoji: '🪫', word: 'Helt slut' },
      { emoji: '😴', word: 'Trött' },
      { emoji: '😐', word: 'Okej' },
      { emoji: '🙂', word: 'Pigg' },
      { emoji: '⚡', word: 'Full av energi' },
    ],
  },
  {
    key: 'hunger',
    label: 'Hunger',
    options: [
      { emoji: '😌', word: 'Knappt hungrig' },
      { emoji: '🙂', word: 'Lite hungrig' },
      { emoji: '😊', word: 'Lagom' },
      { emoji: '😋', word: 'Ganska hungrig' },
      { emoji: '🍽️', word: 'Mycket hungrig' },
    ],
  },
]
