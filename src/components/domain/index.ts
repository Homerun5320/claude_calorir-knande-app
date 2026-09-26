/**
 * Domänkomponenter för Lagom – presentationella byggstenar för mat, makron, datum och vatten.
 */
export { EnergyValue, useEnergyUnit, useEnergyFormatter } from './EnergyValue'
export type { EnergyValueProps, EnergyUnit } from './EnergyValue'
export { MacroBars, MACRO_META, remainingText } from './MacroBars'
export type { MacroBarsProps, MacroTargets, MacroKey, MacroMeta } from './MacroBars'
export { NutrientTable, NUTRIENT_GROUP_LABELS, referenceStatus, referencePercent } from './NutrientTable'
export type { NutrientTableProps, NutrientReference, NutrientTableGroupId } from './NutrientTable'
export { DateNavigator, useSwipe } from './DateNavigator'
export type { DateNavigatorProps, SwipeOptions, SwipeHandlers } from './DateNavigator'
export { CategoryIcon, CATEGORY_META, TINT_CLASSES, TINT_VAR, ICON_SIZE_CLASSES } from './CategoryIcon'
export type { CategoryIconProps, CategoryMeta, Tint, IconSize } from './CategoryIcon'
export { MealIcon, MEAL_META } from './MealIcon'
export type { MealIconProps, MealMeta } from './MealIcon'
export { FoodRow, entryToRow, foodToRow, describeAmount } from './FoodRow'
export type { FoodRowProps, FoodRowData, FoodRowMacros } from './FoodRow'
export { WaterGlasses, formatLiters } from './WaterGlasses'
export type { WaterGlassesProps } from './WaterGlasses'
