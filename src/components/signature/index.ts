/**
 * Lagoms signaturgrafik – det som gör appen igenkännbar:
 * Dagsringen, Tallriken, säsongslandskapet och konfetti i skogens färger.
 */
export {
  CalorieRing,
  LAGOM_TOLERANCE,
  arcPath,
  describeRing,
  macroEnergyShares,
  mindfulLabel,
  summarizeRing,
  type CalorieRingMacros,
  type CalorieRingProps,
  type RingStatus,
  type RingSummary,
} from './CalorieRing'
export { PlateModel, describePlate, fractionWords, normalizeFractions, wedgePath, type PlateModelProps } from './PlateModel'
export {
  SeasonalHeader,
  moonLitPath,
  moonPhase,
  sceneLabel,
  type Season,
  type SeasonalHeaderProps,
  type SkyPhase,
} from './SeasonalHeader'
export { Confetti, makeConfetti, type ConfettiPiece, type ConfettiProps } from './Confetti'
