/**
 * Ikoner för mat och dryck (och några närliggande tecken som används i samma listor).
 * Egna ritningar ligger på ett 24×24-rutnät: 2 px linje och en mjuk fyllning (`SOFT`) per ikon.
 */
import {
  Apple,
  Baby,
  Banana,
  Bean,
  Beef,
  Candy,
  Cherry,
  Citrus,
  ClipboardList,
  CookingPot,
  Cookie,
  Croissant,
  CupSoda,
  Cupcake,
  Droplet,
  Drumstick,
  Egg,
  EggFried,
  Globe,
  Grape,
  Hamburger,
  IceCreamBowl,
  Milk,
  Moon,
  Nut,
  Pill,
  Pizza,
  Popcorn,
  Repeat,
  Salad,
  Sandwich,
  Shrimp,
  Soup,
  Sun,
  Utensils,
  Wheat,
  Wine,
} from 'lucide-react'
import type { GlyphDef } from '../Glyph'

/** Den mjuka fyllningen som gör ikonerna duotona. */
const SOFT = { fill: 'currentColor', fillOpacity: 0.18, stroke: 'none' } as const

export const MAT: Record<string, GlyphDef> = {
  // --- Lucide ---
  '🥣': { icon: Soup },
  '🥪': { icon: Sandwich },
  '🍲': { icon: CookingPot },
  '🍎': { icon: Apple },
  '🫘': { icon: Bean },
  '🥜': { icon: Nut },
  '🥛': { icon: Milk },
  '🥚': { icon: Egg },
  '🥩': { icon: Beef },
  '🍗': { icon: Drumstick },
  '🦐': { icon: Shrimp },
  '🌾': { icon: Wheat },
  '🍬': { icon: Candy },
  '🥐': { icon: Croissant },
  '🍨': { icon: IceCreamBowl },
  '🍿': { icon: Popcorn },
  '🥤': { icon: CupSoda },
  '🍷': { icon: Wine },
  '🍔': { icon: Hamburger },
  '💊': { icon: Pill },
  '🍽️': { icon: Utensils },
  '🍕': { icon: Pizza },
  '🥗': { icon: Salad },
  '🍪': { icon: Cookie },
  '🍳': { icon: EggFried },
  '🍌': { icon: Banana },
  '🍋': { icon: Citrus },
  '🍇': { icon: Grape },
  '🍒': { icon: Cherry },
  '💧': { icon: Droplet },
  '🧁': { icon: Cupcake },
  '📋': { icon: ClipboardList },
  '🔁': { icon: Repeat },
  '🌍': { icon: Globe },
  '😴': { icon: Moon },
  '☀️': { icon: Sun },
  '🤰': { icon: Baby },

  // --- Egna ritningar ---
  // Broccoli
  '🥦': {
    draw: (
      <>
        <path d="M6.5 13.5a3.5 3.5 0 0 1 1.2-6.7 4.5 4.5 0 0 1 8.6 0 3.5 3.5 0 0 1 1.2 6.7z" {...SOFT} />
        <path d="M6.5 13.5a3.5 3.5 0 0 1 1.2-6.7 4.5 4.5 0 0 1 8.6 0 3.5 3.5 0 0 1 1.2 6.7z" />
        <path d="M9.5 13.5l1 7h3l1-7" />
      </>
    ),
  },
  // Bröd (limpa)
  '🍞': {
    draw: (
      <>
        <path d="M5 10c-1.5-1-2-3.5-.5-5C6 3.5 9 3.5 12 3.5s6 0 7.5 1.5c1.5 1.5 1 4-.5 5v8.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5z" {...SOFT} />
        <path d="M5 10c-1.5-1-2-3.5-.5-5C6 3.5 9 3.5 12 3.5s6 0 7.5 1.5c1.5 1.5 1 4-.5 5v8.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5z" />
        <path d="M9 8l1.5 3M13.5 8L15 11" />
      </>
    ),
  },
  // Pasta (spaghettikulle på tallrik)
  '🍝': {
    draw: (
      <>
        <path d="M6 14c-.5-3 1.5-5 3-4 1-3 5-3 6 0 1.5-1 3.5 1 3 4z" {...SOFT} />
        <path d="M6 14c-.5-3 1.5-5 3-4 1-3 5-3 6 0 1.5-1 3.5 1 3 4" />
        <path d="M9 12.5c1-1.5 2-1.5 3 0s2 1.5 3 0" />
        <path d="M3 14h18c0 3-3.5 5-9 5s-9-2-9-5z" />
      </>
    ),
  },
  // Ost (bit med hål)
  '🧀': {
    draw: (
      <>
        <path d="M3 18V11L21 5v13z" {...SOFT} />
        <path d="M3 18V11L21 5v13z" />
        <path d="M8 14.5h.01M13.5 12.5h.01M17 15.5h.01" />
      </>
    ),
  },
  // Korv i bröd
  '🌭': {
    draw: (
      <g transform="rotate(-30 12 12)">
        <rect x="1.5" y="8" width="21" height="8" rx="4" {...SOFT} />
        <rect x="1.5" y="8" width="21" height="8" rx="4" />
        <path d="M5.5 12l2-1.5 2 3 2-3 2 3 2-3 2 1.5" />
      </g>
    ),
  },
  // Smör
  '🧈': {
    draw: (
      <>
        <path d="M3 11h14v8H3z" {...SOFT} />
        <path d="M3 11h14v8H3zM3 11l3-4h15l-4 4M17 11v8l4-4V7" />
      </>
    ),
  },
  // Salt
  '🧂': {
    draw: (
      <>
        <path d="M7.5 9h9l1 10.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z" {...SOFT} />
        <path d="M7.5 9h9l1 10.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5z" />
        <path d="M8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
        <path d="M11 6.5h.01M13 6.5h.01M12 13.5h.01" />
      </>
    ),
  },
  // Juicepaket med sugrör
  '🧃': {
    draw: (
      <>
        <path d="M6 8h12v13H6z" {...SOFT} />
        <path d="M6 8h12v13H6zM13 8V3.5h3.5" />
        <circle cx="12" cy="15" r="2.5" />
      </>
    ),
  },
  // Pommes frites
  '🍟': {
    draw: (
      <>
        <path d="M6 11h12l-1.5 9.5h-9z" {...SOFT} />
        <path d="M6 11h12l-1.5 9.5h-9zM8.5 11V5.5M12 11V3.5M15.5 11V5.5" />
      </>
    ),
  },
  // Taco
  '🌮': {
    draw: (
      <>
        <path d="M2.5 18a9.5 9.5 0 0 1 19 0z" {...SOFT} />
        <path d="M2.5 18a9.5 9.5 0 0 1 19 0z" />
        <path d="M6.5 11c1-2.5 3-2.5 4 0M13 9.5c1-2.5 3-2.5 4 0" />
      </>
    ),
  },
  // Burrito (rullad wrap)
  '🌯': {
    draw: (
      <g transform="rotate(-35 12 12)">
        <rect x="2.5" y="7" width="17" height="10" rx="5" {...SOFT} />
        <rect x="2.5" y="7" width="17" height="10" rx="5" />
        <path d="M9 7.200v9.6" />
        <path d="M18 9.500c2.5-.8 4 .2 4 2.500s-1.5 3.3-4 2.5" />
      </g>
    ),
  },
  // Kebab i pitabröd
  '🥙': {
    draw: (
      <>
        <path d="M6 12h12l-1.8 8a1.5 1.5 0 0 1-1.5 1.2H9.3A1.5 1.5 0 0 1 7.8 20z" {...SOFT} />
        <path d="M6 12h12l-1.8 8a1.5 1.5 0 0 1-1.5 1.2H9.3A1.5 1.5 0 0 1 7.8 20z" />
        <path d="M6.5 12C5.5 9 7.5 7 9.5 8c1-3 4-3 5 0 2-1 4 1 3 4" />
      </>
    ),
  },
  // Dumpling / pirog
  '🥟': {
    draw: (
      <>
        <path d="M3 17.5C3 11.5 7 8 12 8s9 3.5 9 9.5z" {...SOFT} />
        <path d="M3 17.5C3 11.5 7 8 12 8s9 3.5 9 9.5z" />
        <path d="M8 12.5l.8 5M12 10.5v7M16 12.5l-.8 5" />
      </>
    ),
  },
  // Falafel (tre bollar)
  '🧆': {
    draw: (
      <>
        <circle cx="8" cy="15.5" r="4.5" {...SOFT} />
        <circle cx="16" cy="15.5" r="4.5" {...SOFT} />
        <circle cx="12" cy="8.5" r="4.5" {...SOFT} />
        <circle cx="8" cy="15.5" r="4.5" />
        <circle cx="16" cy="15.5" r="4.5" />
        <circle cx="12" cy="8.5" r="4.5" />
      </>
    ),
  },
  // Sushi (nigiri)
  '🍣': {
    draw: (
      <>
        <path d="M4 15a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
        <path d="M5 13c0-4 3-6.5 7-6.5S19 9 19 13z" {...SOFT} />
        <path d="M5 13c0-4 3-6.5 7-6.5S19 9 19 13" />
        <path d="M10 8l-1 5M14.5 8l-1 5" />
      </>
    ),
  },
  // Nudlar (skål med ätpinnar)
  '🍜': {
    draw: (
      <>
        <path d="M3.5 12h17a8.5 8 0 0 1-17 0z" {...SOFT} />
        <path d="M3.5 12h17a8.5 8 0 0 1-17 0z" />
        <path d="M13 8.5l5.5-5.5M15.5 9l4-4" />
        <path d="M6.5 9.5c1-1.5 2-1.5 3 0s2 1.5 3 0" />
      </>
    ),
  },
  // Paj
  '🥧': {
    draw: (
      <>
        <path d="M4 11.5c0-3.5 3.5-6 8-6s8 2.5 8 6z" {...SOFT} />
        <path d="M4 11.5c0-3.5 3.5-6 8-6s8 2.5 8 6" />
        <path d="M3 11.5h18l-1.8 8H4.8z" />
        <path d="M12 8v1.5M8.5 9.5V11M15.5 9.5V11" />
      </>
    ),
  },
  // Pannkakor
  '🥞': {
    draw: (
      <>
        <ellipse cx="12" cy="8" rx="8" ry="2.5" {...SOFT} />
        <path d="M4 8v3.5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V8M4 12v3.5c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V12" />
        <ellipse cx="12" cy="8" rx="8" ry="2.5" />
        <path d="M11 7.5h2" />
      </>
    ),
  },
  // Våffla
  '🧇': {
    draw: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4.5" {...SOFT} />
        <rect x="3" y="3" width="18" height="18" rx="4.5" />
        <path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" strokeWidth={1.6} />
      </>
    ),
  },
  // Choklad
  '🍫': {
    draw: (
      <>
        <rect x="4.5" y="7" width="15" height="14" rx="2" {...SOFT} />
        <rect x="4.5" y="7" width="15" height="14" rx="2" />
        <path d="M7 7V3.5h10V7M4.5 12h15M4.5 16.5h15M12 7v14" strokeWidth={1.7} />
      </>
    ),
  },
  // Ris (skål med risberg)
  '🍚': {
    draw: (
      <>
        <path d="M3.5 12.5h17a8.5 7.5 0 0 1-17 0z" {...SOFT} />
        <path d="M3.5 12.5h17a8.5 7.5 0 0 1-17 0z" />
        <path d="M6.5 12.5c0-3.5 2.5-5.5 5.5-5.5s5.5 2 5.5 5.5" />
        <path d="M10 10h.01M14 10h.01M12 8.5h.01" />
      </>
    ),
  },
  // Bacon
  '🥓': {
    draw: (
      <>
        <path d="M3 9c3-3 6 3 9 0s6 3 9 0v6c-3 3-6-3-9 0s-6 3-9 0z" {...SOFT} />
        <path d="M3 9c3-3 6 3 9 0s6 3 9 0v6c-3 3-6-3-9 0s-6 3-9 0z" />
        <path d="M3 12c3-3 6 3 9 0s6 3 9 0" />
      </>
    ),
  },
  // Bläckfisk
  '🦑': {
    draw: (
      <>
        <path d="M12 2c4 2.5 5.5 6.5 4.5 11h-9C6.5 8.5 8 4.5 12 2z" {...SOFT} />
        <path d="M12 2c4 2.5 5.5 6.5 4.5 11h-9C6.5 8.5 8 4.5 12 2z" />
        <path d="M10 9.500h.01M14 9.500h.01" strokeWidth={2.6} />
        <path d="M8.5 13c0 3-2.5 3-2.5 6.500M11 13c0 3-1 4-1 8M13 13c0 3 1 4 1 8M15.5 13c0 3 2.5 3 2.5 6.5" />
      </>
    ),
  },
  // Kokos
  '🥥': {
    draw: (
      <>
        <circle cx="12" cy="12" r="9" {...SOFT} />
        <circle cx="12" cy="12" r="9" />
        <path d="M9 9.5h.01M14 8.5h.01M11.5 13.5h.01" strokeWidth={2.6} />
      </>
    ),
  },
  // Päron
  '🍐': {
    draw: (
      <>
        <path d="M12 6c1.5 0 2 1.5 2 3 0 2 3.5 3 3.5 7.5 0 2.8-2.5 4.8-5.5 4.8s-5.5-2-5.5-4.8C6.5 12 10 11 10 9c0-1.5.5-3 2-3z" {...SOFT} />
        <path d="M12 6c1.5 0 2 1.5 2 3 0 2 3.5 3 3.5 7.5 0 2.8-2.5 4.8-5.5 4.8s-5.5-2-5.5-4.8C6.5 12 10 11 10 9c0-1.5.5-3 2-3z" />
        <path d="M12 6c0-1.5.5-2.5 2-3.5" />
      </>
    ),
  },
  // Apelsin
  '🍊': {
    draw: (
      <>
        <circle cx="12" cy="13.5" r="8" {...SOFT} />
        <circle cx="12" cy="13.5" r="8" />
        <path d="M12 5.5c0-1.8 1.2-3 3.5-3" />
        <path d="M12 5.5l-1.5-1" />
      </>
    ),
  },
  // Vattenmelon
  '🍉': {
    draw: (
      <>
        <path d="M2.5 8.5h19a9.5 9.5 0 0 1-19 0z" {...SOFT} />
        <path d="M2.5 8.5h19a9.5 9.5 0 0 1-19 0z" />
        <path d="M5.5 8.5a6.5 6.5 0 0 0 13 0" strokeWidth={1.5} />
        <path d="M9 12h.01M12 14h.01M15 12h.01" strokeWidth={2.4} />
      </>
    ),
  },
  // Ananas
  '🍍': {
    draw: (
      <>
        <ellipse cx="12" cy="15.5" rx="5.5" ry="6.5" {...SOFT} />
        <ellipse cx="12" cy="15.5" rx="5.5" ry="6.5" />
        <path d="M9 13.500l6 6M15 13.500l-6 6" strokeWidth={1.6} />
        <path d="M8.5 9.500L8 4l2.5 2.500L12 2l1.5 4.500L16 4l-.5 5.5" />
      </>
    ),
  },
  // Kiwi (halverad)
  '🥝': {
    draw: (
      <>
        <circle cx="12" cy="12" r="9" {...SOFT} />
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 5.5v1.5M12 17v1.5M5.5 12H7M17 12h1.5" />
      </>
    ),
  },
  // Mango
  '🥭': {
    draw: (
      <>
        <path d="M6 8c3-3 9-2 12 2 2 3 1 8-3 10-4 2-9 0-10-4-.5-3 0-6 1-8z" {...SOFT} />
        <path d="M6 8c3-3 9-2 12 2 2 3 1 8-3 10-4 2-9 0-10-4-.5-3 0-6 1-8z" />
        <path d="M12 5.5c.5-1.8 2-2.8 4-3" />
      </>
    ),
  },
  // Avokado
  '🥑': {
    draw: (
      <>
        <path d="M12 2.5c3 0 3.8 3 5 5.5 2 2 3 3.5 3 6.5 0 4-3.5 7-8 7s-8-3-8-7c0-3 1-4.5 3-6.5 1.2-2.5 2-5.5 5-5.5z" {...SOFT} />
        <path d="M12 2.5c3 0 3.8 3 5 5.5 2 2 3 3.5 3 6.5 0 4-3.5 7-8 7s-8-3-8-7c0-3 1-4.5 3-6.5 1.2-2.5 2-5.5 5-5.5z" />
        <circle cx="12" cy="14.5" r="3" />
      </>
    ),
  },
  // Tomat
  '🍅': {
    draw: (
      <>
        <circle cx="12" cy="13.5" r="8" {...SOFT} />
        <circle cx="12" cy="13.5" r="8" />
        <path d="M8 8l4 1.5L16 8M12 9.5V4.5" />
      </>
    ),
  },
  // Paprika
  '🫑': {
    draw: (
      <>
        <path d="M7 9c-1.5 3-1 8 1.5 10.5 1.5 1.3 5.5 1.3 7 0C18 17 18.5 12 17 9c-1-2-3-2.5-5-2-2 .5-4 0-5 2z" {...SOFT} />
        <path d="M7 9c-1.5 3-1 8 1.5 10.5 1.5 1.3 5.5 1.3 7 0C18 17 18.5 12 17 9c-1-2-3-2.5-5-2-2 .5-4 0-5 2z" />
        <path d="M12 7V4h2.5" />
      </>
    ),
  },
  // Majs
  '🌽': {
    draw: (
      <>
        <path d="M12 2.5c3 2 4.5 6 4.5 10 0 3-1.5 5-4.5 6.5-3-1.5-4.5-3.5-4.5-6.5 0-4 1.5-8 4.5-10z" {...SOFT} />
        <path d="M12 2.5c3 2 4.5 6 4.5 10 0 3-1.5 5-4.5 6.5-3-1.5-4.5-3.5-4.5-6.5 0-4 1.5-8 4.5-10z" />
        <path d="M12 6.5v9M9.5 10.5h5M9.5 14h5" strokeWidth={1.6} />
        <path d="M6 12.5c0 4.5 2.5 7.5 6 9 3.5-1.5 6-4.5 6-9" />
      </>
    ),
  },
  // Vitlök
  '🧄': {
    draw: (
      <>
        <path d="M12 4.5C11 7 6 8.5 6 14.5a6 5.5 0 0 0 12 0C18 8.5 13 7 12 4.5z" {...SOFT} />
        <path d="M12 4.5C11 7 6 8.5 6 14.5a6 5.5 0 0 0 12 0C18 8.5 13 7 12 4.5z" />
        <path d="M12 4.5V2.5M9.5 10c-1 3-1 6 0 9M14.5 10c1 3 1 6 0 9" />
      </>
    ),
  },
  // Svamp
  '🍄': {
    draw: (
      <>
        <path d="M3 12a9 8 0 0 1 18 0z" {...SOFT} />
        <path d="M3 12a9 8 0 0 1 18 0z" />
        <path d="M9 12v5.5a3 3 0 0 0 6 0V12" />
        <path d="M8 8.5h.01M13 7h.01M16.5 9.5h.01" />
      </>
    ),
  },
  // Sötpotatis
  '🍠': {
    draw: (
      <>
        <path d="M5 16c-1.5-4 1.5-8.5 7-9.5 4-.8 7-.5 7.5 1.5.5 3-2 8.5-7 10.5-3 1-6.5 1-7.5-2.5z" {...SOFT} />
        <path d="M5 16c-1.5-4 1.5-8.5 7-9.5 4-.8 7-.5 7.5 1.5.5 3-2 8.5-7 10.5-3 1-6.5 1-7.5-2.5z" />
        <path d="M5 16.5L3 20M10 11c1.5 0 2.5 1 3 2.5" />
      </>
    ),
  },
  // Honung
  '🍯': {
    draw: (
      <>
        <path d="M7 8h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" {...SOFT} />
        <path d="M7 8h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM6 4.5h12V8H6z" />
        <path d="M7 12.5c1.5 1.5 3 1.5 5 0s3.5-1.5 5 0" />
      </>
    ),
  },
  // Te
  '🍵': {
    draw: (
      <>
        <path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" {...SOFT} />
        <path d="M4 10h13v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 11.5h1.5a2.5 2.5 0 0 1 0 5H16.5" />
        <path d="M8 3.5c-1 1.5 1 2.5 0 4M12.5 3.5c-1 1.5 1 2.5 0 4" />
        <path d="M3 21.5h15" />
      </>
    ),
  },
  // Skål med bubbel (champagne)
  '🥂': {
    draw: (
      <>
        <g transform="rotate(12 7.5 20)">
          <path d="M5 3h5l-.6 6.5a1.9 1.9 0 0 1-3.8 0z" {...SOFT} />
          <path d="M5 3h5l-.6 6.5a1.9 1.9 0 0 1-3.8 0zM7.5 11.5V20M5 20h5" />
        </g>
        <g transform="rotate(-12 16.5 20)">
          <path d="M14 3h5l-.6 6.5a1.9 1.9 0 0 1-3.8 0z" {...SOFT} />
          <path d="M14 3h5l-.6 6.5a1.9 1.9 0 0 1-3.8 0zM16.5 11.5V20M14 20h5" />
        </g>
        <path d="M12 3h.01M12 6h.01" />
      </>
    ),
  },
  // Gryta i panna
  '🥘': {
    draw: (
      <>
        <path d="M4 11.5h16v1.5a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" {...SOFT} />
        <path d="M4 11.5h16v1.5a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6zM4 13H2M20 13h2" />
        <path d="M7 9c1-1.8 2-1.8 3 0 1-1.8 2-1.8 3 0 1-1.8 2-1.8 3 0" />
      </>
    ),
  },
  // Curry med ris
  '🍛': {
    draw: (
      <>
        <path d="M2.5 12h19c0 4.5-4 7.5-9.5 7.5S2.5 16.5 2.5 12z" {...SOFT} />
        <path d="M2.5 12h19c0 4.5-4 7.5-9.5 7.5S2.5 16.5 2.5 12z" />
        <path d="M6.5 12c0-3 2-5 5-5s5.5 1.5 5.5 5" />
        <path d="M12 7c-1-1.5 1-2.5 0-4" />
        <path d="M9.5 15.5c1.5 1 3.5 1 5 0" />
      </>
    ),
  },
  // Stjärna (höjdpunkt)
  '🌟': {
    draw: (
      <>
        <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" {...SOFT} />
        <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" />
      </>
    ),
  },
  // Blod (järn)
  '🩸': {
    draw: (
      <>
        <path d="M12 3c3.5 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0C6 10.5 8.5 7.5 12 3z" {...SOFT} fillOpacity={0.4} />
        <path d="M12 3c3.5 4.5 6 7.5 6 10.5a6 6 0 0 1-12 0C6 10.5 8.5 7.5 12 3z" />
        <path d="M12 11v5M9.5 13.5h5" />
      </>
    ),
  },
}
