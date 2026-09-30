/**
 * Rå/okokt vikt: tillagade livsmedel med `rawWeight` kan anges i "g rå", "g okokt" och "dl okokt"
 * och räknas om till tillagad vikt.
 */
import { describe, expect, it } from 'vitest'
import {
  availableUnits,
  defaultAmount,
  formatAmount,
  gramsFor,
  isRawUnit,
  rawGramsFor,
  rawWeightHint,
  unitLabel,
  type UnitFood,
} from './units'
import { describeAmount } from '../components/domain/FoodRow'
import { formatIngredientAmount, roundAmount } from '../features/recipes/recipeLogic'

const kyckling: UnitFood = { portions: [{ id: 'file', label: '1 filé (ca 95 g)', grams: 95 }], rawWeight: { factor: 0.75, kind: 'ra' } }
const ris: UnitFood = { portions: [], density: 0.8, rawWeight: { factor: 2.7, kind: 'okokt', density: 0.85 } }
const pasta: UnitFood = { portions: [], rawWeight: { factor: 2.4, kind: 'okokt' } }
const bonor: UnitFood = { portions: [], rawWeight: { factor: 2.5, kind: 'torkad' } }
const vegofars: UnitFood = { portions: [], rawWeight: { factor: 0.66, kind: 'fryst' } }
const vanlig: UnitFood = { portions: [] }

describe('enheter för rå/okokt vikt', () => {
  it('lägger "g rå" direkt efter gram och "dl okokt" när den okokta varans densitet finns', () => {
    expect(availableUnits(kyckling)).toEqual(['portion:file', 'g', 'g-ra'])
    expect(availableUnits(pasta)).toEqual(['g', 'g-ra'])
    expect(availableUnits(ris)).toEqual(['g', 'g-ra', 'dl-ra', 'dl', 'msk', 'tsk', 'krm'])
    expect(availableUnits(vanlig)).toEqual(['g'])
    // En ogiltig faktor ger inga rå-enheter.
    expect(availableUnits({ portions: [], rawWeight: { factor: 0, kind: 'ra' } })).toEqual(['g'])
  })

  it('räknar om rå vikt till tillagad vikt', () => {
    expect(gramsFor(kyckling, 150, 'g-ra')).toBeCloseTo(112.5)
    expect(gramsFor(pasta, 75, 'g-ra')).toBeCloseTo(180)
    // 1 dl okokt ris = 85 g okokt = 229,5 g kokt
    expect(gramsFor(ris, 1, 'dl-ra')).toBeCloseTo(229.5)
    expect(rawGramsFor(ris, 1, 'dl-ra')).toBeCloseTo(85)
    expect(rawGramsFor(kyckling, 150, 'g-ra')).toBe(150)
    expect(gramsFor(pasta, 1, 'dl-ra')).toBeNaN()
    expect(gramsFor(vanlig, 100, 'g-ra')).toBeNaN()
    expect(gramsFor(kyckling, -1, 'g-ra')).toBeNaN()
  })

  it('har svenska etiketter efter slaget av vara', () => {
    expect(unitLabel(kyckling, 'g-ra')).toBe('g rå')
    expect(unitLabel(pasta, 'g-ra')).toBe('g okokt')
    expect(unitLabel(bonor, 'g-ra')).toBe('g torkad')
    expect(unitLabel(vegofars, 'g-ra')).toBe('g fryst')
    expect(unitLabel(ris, 'dl-ra')).toBe('dl okokt')
    expect(unitLabel(vanlig, 'g-ra')).toBe('g rå')
    expect(isRawUnit('g-ra')).toBe(true)
    expect(isRawUnit('dl-ra')).toBe(true)
    expect(isRawUnit('g')).toBe(false)
  })

  it('har rimliga standardmängder', () => {
    expect(defaultAmount('g-ra')).toBe(100)
    expect(defaultAmount('dl-ra')).toBe(1)
  })

  it('skriver mängden begripligt med den tillagade vikten', () => {
    expect(formatAmount(kyckling, 150, 'g-ra', true)).toBe('150 g rå (113 g tillagat)')
    expect(formatAmount(kyckling, 150, 'g-ra')).toBe('150 g rå')
    expect(formatAmount(pasta, 75, 'g-ra', true)).toBe('75 g okokt (180 g tillagat)')
    expect(formatAmount(bonor, 100, 'g-ra', true)).toBe('100 g torkad (250 g tillagat)')
    expect(formatAmount(vegofars, 125, 'g-ra', true)).toBe('125 g fryst (83 g tillagat)')
    expect(formatAmount(ris, 1, 'dl-ra', true)).toBe('1 dl okokt (230 g tillagat)')
    expect(formatAmount(ris, 1.5, 'dl-ra')).toBe('1,5 dl okokt')
    // Dagboken visar alltid den tillagade vikten för rå vikt.
    expect(describeAmount(kyckling, 150, 'g-ra')).toBe('150 g rå (113 g tillagat)')
  })

  it('förklarar omräkningen med decimalkomma', () => {
    expect(rawWeightHint(kyckling)).toBe('Väg rått – Lagom räknar om till tillagad vikt (1 g rå ≈ 0,75 g tillagat).')
    expect(rawWeightHint(pasta)).toBe('Väg okokt – Lagom räknar om till tillagad vikt (1 g okokt ≈ 2,4 g tillagat).')
    expect(rawWeightHint(ris, 'dl-ra')).toBe('Mät okokt – Lagom räknar om till tillagad vikt (1 dl okokt ≈ 230 g tillagat).')
    expect(rawWeightHint(bonor)).toBe('Väg torkat – Lagom räknar om till tillagad vikt (1 g torkad ≈ 2,5 g tillagat).')
    expect(rawWeightHint(vegofars)).toBe('Väg fryst – Lagom räknar om till tillagad vikt (1 g fryst ≈ 0,66 g tillagat).')
    expect(rawWeightHint(vanlig)).toBe('')
  })

  it('visar rå vikt i recept', () => {
    expect(roundAmount(512, 'g-ra')).toBe(510)
    expect(formatIngredientAmount(kyckling, 500, 'g-ra')).toEqual({ text: '500 g rå', grams: '375 g tillagat' })
    expect(formatIngredientAmount(ris, 1.5, 'dl-ra')).toEqual({ text: '1½ dl okokt', grams: '345 g tillagat' })
    expect(formatIngredientAmount(pasta, 300, 'g-ra').text).toBe('300 g okokt')
  })
})
