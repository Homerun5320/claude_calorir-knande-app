/**
 * Ikon för en livsmedelskategori: emoji på en mjukt tonad, rundad ruta.
 *
 * `CATEGORY_META` innehåller även svenska namn för kategorierna och kan användas i filter och listor.
 * `TINT_CLASSES` delas med `MealIcon` (och får gärna användas av andra komponenter).
 */
import type { FoodCategory } from '../../types'

/** Färgtoner från designsystemet som kan användas som bakgrundston. */
export type Tint = 'gran' | 'lingon' | 'hjortron' | 'blabar' | 'mossa' | 'vinbar' | 'fjall' | 'sol' | 'neutral'

/**
 * Tailwind-klasser per ton. Skrivna i klartext så att Tailwind hittar dem vid bygget
 * (bygg aldrig klassnamn dynamiskt som `bg-${tint}-soft`).
 */
export const TINT_CLASSES: Record<Tint, { soft: string; text: string; solid: string }> = {
  gran: { soft: 'bg-gran-soft', text: 'text-gran', solid: 'bg-gran' },
  lingon: { soft: 'bg-lingon-soft', text: 'text-lingon', solid: 'bg-lingon' },
  hjortron: { soft: 'bg-hjortron-soft', text: 'text-hjortron', solid: 'bg-hjortron' },
  blabar: { soft: 'bg-blabar-soft', text: 'text-blabar', solid: 'bg-blabar' },
  mossa: { soft: 'bg-mossa-soft', text: 'text-mossa', solid: 'bg-mossa' },
  vinbar: { soft: 'bg-vinbar-soft', text: 'text-vinbar', solid: 'bg-vinbar' },
  fjall: { soft: 'bg-fjall-soft', text: 'text-fjall', solid: 'bg-fjall' },
  sol: { soft: 'bg-sol-soft', text: 'text-sol', solid: 'bg-sol' },
  neutral: { soft: 'bg-surface-2', text: 'text-ink-2', solid: 'bg-ink-3' },
}

/** CSS-variabel för en ton, för SVG och inline-stilar. */
export const TINT_VAR: Record<Tint, string> = {
  gran: 'var(--lg-gran)',
  lingon: 'var(--lg-lingon)',
  hjortron: 'var(--lg-hjortron)',
  blabar: 'var(--lg-blabar)',
  mossa: 'var(--lg-mossa)',
  vinbar: 'var(--lg-vinbar)',
  fjall: 'var(--lg-fjall)',
  sol: 'var(--lg-sol)',
  neutral: 'var(--lg-ink-3)',
}

export interface CategoryMeta {
  emoji: string
  tint: Tint
  /** Svenskt namn, t.ex. "Rotfrukter". */
  label: string
}

/** Emoji, ton och svenskt namn för varje livsmedelskategori. */
export const CATEGORY_META: Record<FoodCategory, CategoryMeta> = {
  gronsaker: { emoji: '🥦', tint: 'mossa', label: 'Grönsaker' },
  rotfrukter: { emoji: '🥕', tint: 'hjortron', label: 'Rotfrukter' },
  potatis: { emoji: '🥔', tint: 'sol', label: 'Potatis' },
  frukt: { emoji: '🍎', tint: 'lingon', label: 'Frukt' },
  bar: { emoji: '🫐', tint: 'blabar', label: 'Bär' },
  baljvaxter: { emoji: '🫘', tint: 'mossa', label: 'Baljväxter' },
  notter_fron: { emoji: '🥜', tint: 'hjortron', label: 'Nötter och frön' },
  spannmal: { emoji: '🥣', tint: 'sol', label: 'Gryn, flingor och mjöl' },
  brod: { emoji: '🍞', tint: 'hjortron', label: 'Bröd' },
  pasta_ris: { emoji: '🍝', tint: 'sol', label: 'Pasta och ris' },
  mejeri: { emoji: '🥛', tint: 'fjall', label: 'Mejeri' },
  ost: { emoji: '🧀', tint: 'sol', label: 'Ost' },
  agg: { emoji: '🥚', tint: 'sol', label: 'Ägg' },
  rott_kott: { emoji: '🥩', tint: 'lingon', label: 'Kött' },
  chark: { emoji: '🌭', tint: 'lingon', label: 'Korv och chark' },
  fagel: { emoji: '🍗', tint: 'hjortron', label: 'Fågel' },
  fisk: { emoji: '🐟', tint: 'fjall', label: 'Fisk' },
  skaldjur: { emoji: '🦐', tint: 'lingon', label: 'Skaldjur' },
  vegoprotein: { emoji: '🌱', tint: 'mossa', label: 'Vegoprotein' },
  vaxtdryck: { emoji: '🌾', tint: 'mossa', label: 'Växtdryck' },
  fett_olja: { emoji: '🧈', tint: 'sol', label: 'Matfett och olja' },
  sas_krydda: { emoji: '🧂', tint: 'neutral', label: 'Såser och kryddor' },
  sotsaker: { emoji: '🍬', tint: 'vinbar', label: 'Godis och sötsaker' },
  bakverk: { emoji: '🥐', tint: 'hjortron', label: 'Bullar och bakverk' },
  glass_dessert: { emoji: '🍨', tint: 'vinbar', label: 'Glass och dessert' },
  snacks: { emoji: '🍿', tint: 'sol', label: 'Snacks' },
  dryck: { emoji: '☕', tint: 'hjortron', label: 'Kaffe, te och vatten' },
  lask_saft: { emoji: '🥤', tint: 'vinbar', label: 'Läsk och saft' },
  juice: { emoji: '🧃', tint: 'hjortron', label: 'Juice och smoothie' },
  alkohol: { emoji: '🍷', tint: 'vinbar', label: 'Alkohol' },
  fardigratt: { emoji: '🍲', tint: 'lingon', label: 'Färdigrätter' },
  snabbmat: { emoji: '🍔', tint: 'hjortron', label: 'Snabbmat' },
  kosttillskott: { emoji: '💊', tint: 'blabar', label: 'Kosttillskott' },
  ovrigt: { emoji: '🍽️', tint: 'neutral', label: 'Övrigt' },
}

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

/** Storlek, rundning och emoji-storlek per ikonstorlek (minst 44 px för "md" och uppåt). */
export const ICON_SIZE_CLASSES: Record<IconSize, string> = {
  xs: 'h-7 w-7 rounded-[0.6rem] text-[0.95rem]',
  sm: 'h-9 w-9 rounded-xl text-lg',
  md: 'h-11 w-11 rounded-[0.9rem] text-[1.35rem]',
  lg: 'h-14 w-14 rounded-[1.1rem] text-[1.7rem]',
  xl: 'h-20 w-20 rounded-[1.5rem] text-[2.5rem]',
}

export interface CategoryIconProps {
  category: FoodCategory | undefined
  size?: IconSize
  /** Egen emoji (t.ex. från ett recept) i stället för kategorins. */
  emoji?: string
  /**
   * Läs upp kategorinamnet för skärmläsare. Standard false – ikonen är oftast dekoration
   * bredvid livsmedlets namn.
   */
  labelled?: boolean
  className?: string
}

/** Emoji på tonad rundad ruta, t.ex. 🥕 på hjortronton för rotfrukter. */
export function CategoryIcon({ category, size = 'md', emoji, labelled = false, className = '' }: CategoryIconProps) {
  const meta = CATEGORY_META[category ?? 'ovrigt'] ?? CATEGORY_META.ovrigt
  return (
    <span
      className={`inline-grid shrink-0 select-none place-items-center leading-none ${ICON_SIZE_CLASSES[size]} ${TINT_CLASSES[meta.tint].soft} ${className}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? meta.label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <span className="translate-y-[0.02em] drop-shadow-[0_1px_0_rgb(0_0_0/0.06)]">{emoji ?? meta.emoji}</span>
    </span>
  )
}
