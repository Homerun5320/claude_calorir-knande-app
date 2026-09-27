/**
 * Ikon för en måltid (frukost, lunch, fika …) – lucide-ikon eller emoji på tonad bakgrund.
 */
import { Apple, Coffee, MoonStar, Salad, Sunrise, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { MealId } from '../../types'
import { MEAL_EMOJI } from '../../lib/meals'
import { EMOJI_CLASS, ICON_SIZE_CLASSES, TINT_CLASSES, type IconSize, type Tint } from './CategoryIcon'

export interface MealMeta {
  icon: LucideIcon
  tint: Tint
  emoji: string
}

/** Ikon och ton per måltid. Emoji hämtas från `lib/meals` så att de är samma i hela appen. */
export const MEAL_META: Record<MealId, MealMeta> = {
  frukost: { icon: Sunrise, tint: 'sol', emoji: MEAL_EMOJI.frukost },
  lunch: { icon: Salad, tint: 'mossa', emoji: MEAL_EMOJI.lunch },
  fika: { icon: Coffee, tint: 'hjortron', emoji: MEAL_EMOJI.fika },
  middag: { icon: UtensilsCrossed, tint: 'gran', emoji: MEAL_EMOJI.middag },
  kvallsmat: { icon: MoonStar, tint: 'blabar', emoji: MEAL_EMOJI.kvallsmat },
  mellanmal: { icon: Apple, tint: 'lingon', emoji: MEAL_EMOJI.mellanmal },
}

const LUCIDE_SIZE: Record<IconSize, string> = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-[1.1rem] w-[1.1rem]',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-9 w-9',
}

export interface MealIconProps {
  meal: MealId
  size?: IconSize
  /** 'icon' (lucide, standard) eller 'emoji'. */
  variant?: 'icon' | 'emoji'
  /** Namn att läsa upp för skärmläsare. Utan namn räknas ikonen som dekoration. */
  label?: string
  className?: string
}

export function MealIcon({ meal, size = 'sm', variant = 'icon', label, className = '' }: MealIconProps) {
  const meta = MEAL_META[meal] ?? MEAL_META.mellanmal
  const tint = TINT_CLASSES[meta.tint]
  const Icon = meta.icon
  return (
    <span
      className={`inline-grid shrink-0 select-none place-items-center leading-none ${ICON_SIZE_CLASSES[size]} ${tint.soft} ${tint.text} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {variant === 'emoji' ? <span className={EMOJI_CLASS}>{meta.emoji}</span> : <Icon className={LUCIDE_SIZE[size]} strokeWidth={2.2} aria-hidden="true" />}
    </span>
  )
}
