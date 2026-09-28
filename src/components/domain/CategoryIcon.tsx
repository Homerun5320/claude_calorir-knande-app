/**
 * Ikon för en livsmedelskategori: emoji på en mjukt tonad, rundad ruta.
 *
 * Med `name` väljs emojin efter vad maten heter när kategorin är för grov – "Smörgås, grovt bröd
 * med smör och ost" ligger bland färdigrätterna men ska visa 🥪, inte 🍲 (`foodEmoji`).
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
  // Solgult syns knappt mot sol-soft – ikoner i den tonen använder textvarianten (mörkare bärnsten).
  sol: { soft: 'bg-sol-soft', text: 'text-(--lg-sol-text)', solid: 'bg-sol' },
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

/**
 * Emoji efter namnets huvudord. I svenska sammansättningar står huvudordet sist ("kycklinggryta",
 * "räksmörgås", "blåbärspaj") och i "X med Y" är X huvudordet ("Smulpaj med äpple"), så reglerna
 * matchar slutet av ledet före första kommat och före "med"/"i"/"och". Korta ord som lätt ingår i
 * andra ord kräver ett helt ord eller en känd sammansättning. Ordningen spelar roll: rätter före
 * råvaror. Det tredje fältet är kategorier där regeln inte gäller (en "tekaka" är bröd, inte kaka).
 */
type EmojiRule = readonly [RegExp, string, (readonly FoodCategory[])?]

/** Rätter som ofta står först i namnet: "Pizza vesuvio", "Kebab i pitabröd". */
const LEAD_DISH = /^(pizza|sushi|tacos?|burrito|hamburgare|cheeseburgare|lasagne|pad thai|ramen|kebab|nachos)(?=\s|$)/

const BREAD = /(bröd|knäckebröd|fralla|frallor|baguette|ciabatta|tunnbröd|pitabröd)$/

const NAME_EMOJI: readonly EmojiRule[] = [
  [/(smörgås|smörgåsar|smörgåstårta|macka|mackor|toast|(?<!glas)sandwich|landgång)$/, '🥪'],
  [/(pizza|pizzor)$/, '🍕'],
  [/(hamburgare|burgare)$/, '🍔'],
  [/(pommes frites|pommes)$/, '🍟'],
  [/(korv|korvar|hotdog)$/, '🌭'],
  [/(tacos?|nachos)$/, '🌮'],
  [/(burritos?|wrap|wraps)$/, '🌯'],
  [/kebab$/, '🥙'],
  [/(pirog|piroger|dumplings|dumpling)$/, '🥟'],
  [/falafel$/, '🧆'],
  [/sushi$/, '🍣'],
  [/(nudlar|ramen|nudelsoppa|pad thai)$/, '🍜'],
  [/(gröt|välling|müsli|granola)$/, '🥣'],
  [/(sallad|sallader)$/, '🥗'],
  [/(soppa|soppor)$/, '🍲', ['glass_dessert']],
  [/(gryta|grytor|curry|stuvning)$/, '🍲'],
  [/(paj|pajer)$/, '🥧'],
  [/(pannkaka|pannkakor|plättar|crêpe|crêpes)$/, '🥞'],
  [/(våffla|våfflor)$/, '🧇'],
  // "Kaka" är tårta i bakverk men bröd i Hönökaka och en rätt i äggakaka/kroppkakor.
  [/(tårta|tårtor|bakelse|cheesecake|(?<!peppar|små)kaka)$/, '🍰', ['brod', 'spannmal', 'snacks', 'fardigratt']],
  [/(kakor|kex|cookie|cookies|pepparkaka|småkaka)$/, '🍪', ['brod', 'spannmal', 'fardigratt']],
  [/(choklad|praliner)$/, '🍫'],
  [/(glass|sorbet)$/, '🍨'],
  [/(lasagne|spaghetti|pasta|makaroner|penne|tagliatelle|gnocchi)$/, '🍝', ['sas_krydda']],
  [/(risotto|(?:^|\s|jasmin|basmati|fullkorns|parboiled|rå|vit)ris)$/, '🍚', ['spannmal', 'glass_dessert']],
  [/(omelett|äggröra|stekt ägg|pocherat ägg)$/, '🍳'],
  [/(?<![lr])ägg$/, '🥚'],
  [/(bacon|fläsk)$/, '🥓'],
  [/(kyckling|kycklingfilé|kycklinglår|kycklingbröst|grillkyckling|kalkon)$/, '🍗'],
  [/bläckfisk$/, '🦑'],
  [/((?:^|\s|grav|kall)lax|torsk|sej|sill|strömming|makrill|tonfisk|fisk|fiskpinnar|fiskbullar|abborre|gös|rödspätta|kolja)$/, '🐟'],
  [/(räkor|räka|kräftor|hummer|(?<!mandel)musslor)$/, '🦐'],
  [/(köttbullar|vegobullar)$/, '🧆'],
  [/(köttfärslimpa)$/, '🍲'],
  [/(biff|entrecôte|oxfilé|fläskfilé|kotlett|kött|köttfärs|nötfärs|fläskkarré|revbensspjäll)$/, '🥩', ['vegoprotein']],
  [/((?<![kr])ost|brie|halloumi|mozzarella|parmesan|cheddar)$/, '🧀'],
  [/(?:^|\s)(smör|bregott)$/, '🧈'],
  [/(kokosmjölk|kokosgrädde)$/, '🥥'],
  [/(mjölk|filmjölk|kefir)$/, '🥛'],
  [/croissant$/, '🥐'],
  [BREAD, '🍞', ['bakverk', 'sotsaker']],
  [/(banan|bananer)$/, '🍌'],
  [/(äpple|äpplen)$/, '🍎'],
  [/päron$/, '🍐'],
  [/(apelsin|apelsiner|clementin|clementiner|mandarin)$/, '🍊'],
  [/(citron|lime)$/, '🍋'],
  [/(vindruvor|druvor)$/, '🍇'],
  [/(jordgubbar|jordgubbe)$/, '🍓'],
  [/körsbär$/, '🍒'],
  [/melon$/, '🍉'],
  [/ananas$/, '🍍'],
  [/kiwi$/, '🥝'],
  [/mango$/, '🥭'],
  [/avokado$/, '🥑'],
  [/(tomat|tomater)$/, '🍅'],
  [/gurka$/, '🥒'],
  [/paprika$/, '🫑'],
  [/majs$/, '🌽'],
  [/(morot|morötter)$/, '🥕'],
  [/broccoli$/, '🥦'],
  [/vitlök$/, '🧄', ['ost', 'mejeri', 'sas_krydda']],
  [/lök$/, '🧅', ['ost', 'mejeri', 'sas_krydda']],
  [/(svamp|champinjoner|kantareller)$/, '🍄'],
  [/(bönor|linser|kikärter)$/, '🫘'],
  [/sötpotatis$/, '🍠'],
  [/(potatis|potatismos|klyftpotatis)$/, '🥔'],
  [/(nötter|jordnötter|cashewnötter|mandlar)$/, '🥜'],
  [/popcorn$/, '🍿'],
  [/honung$/, '🍯'],
  [/(kaffe|latte|cappuccino|espresso)$/, '☕'],
  [/(?:^|\s)(te|grönt te|örtte)$/, '🍵'],
  [/(?:^|\s)(vatten|kranvatten|mineralvatten)$/, '💧'],
  [/juice$/, '🧃'],
  [/(smoothie|(?<!f)läsk|saft|lemonad)$/, '🥤'],
  [/(?:^|\s|lätt|folk|stark|mellan)öl$/, '🍺'],
  [/(?:^|\s|röd|vit|rosé)vin$/, '🍷'],
  [/(champagne|cava|prosecco|mousserande vin)$/, '🥂'],
]

/**
 * Ord som skiljer huvudordet från tillbehör och beskrivning – även Livsmedelsverkets förkortningar
 * "m." (med), "u." (utan) och "el." (eller): "Pannkaka tunn m. vatten" → "pannkaka tunn".
 */
const FILLING_SPLIT = /\s+(?:med|m\.|i|och|på|utan|u\.|el\.|till)\s+/i

function nameRule(subject: string, category: FoodCategory | undefined): string | undefined {
  for (const [re, emoji, not] of NAME_EMOJI) {
    if (re.test(subject) && !(category && not?.includes(category))) return emoji
  }
  return undefined
}

/**
 * Emoji för ett livsmedel: efter namnet om det känns igen, annars kategorins.
 * `foodEmoji('Smörgås, grovt bröd med smör och ost', 'fardigratt')` → '🥪'.
 *
 * Huvudordet står först i Livsmedelsverkets namn utan kommatecken ("Köttbullar nöt stekta",
 * "Ärtsoppa fläsk tillagad konserv.") men ofta sist i Lagoms ("Grovt bröd", "Stekt ägg"). Därför
 * provas först det första ordet och de två första ("Hårt bröd …", "Mörk choklad …") och till sist
 * hela namnet. Längre början provas inte – där kommer beskrivningar ("Yoghurt mild honung").
 */
export function foodEmoji(name: string | undefined, category: FoodCategory | undefined): string {
  const meta = CATEGORY_META[category ?? 'ovrigt'] ?? CATEGORY_META.ovrigt
  if (!name) return meta.emoji
  const head = name.split(/[,(]/)[0].trim().toLocaleLowerCase('sv-SE')
  // "Pizza vesuvio" → "pizza"; "Smulpaj med äpple" → "smulpaj".
  const [subject, filling] = (LEAD_DISH.exec(head)?.[1] ?? head).split(FILLING_SPLIT)
  // Bröd med pålägg är en smörgås ("Fralla med ost", "Baguette med kyckling") – men "Grovt bröd
  // med frön" i brödhyllan är fortfarande bröd, och "Wienerbröd m. vaniljkräm" ett bakverk.
  if (filling !== undefined && category !== 'brod' && category !== 'bakverk' && BREAD.test(subject)) return '🥪'
  // "köttbullar" → "köttbullar nöt" → hela "köttbullar nöt stekta".
  const words = subject.split(/\s+/)
  for (let n = 1; n < Math.min(3, words.length); n++) {
    const hit = nameRule(words.slice(0, n).join(' ').replace(/[.]+$/, ''), category)
    if (hit) return hit
  }
  return nameRule(subject.replace(/[.]+$/, ''), category) ?? meta.emoji
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
  /** Livsmedlets namn – ger en träffsäkrare emoji när kategorin är grov (se `foodEmoji`). */
  name?: string
  /**
   * Läs upp kategorinamnet för skärmläsare. Standard false – ikonen är oftast dekoration
   * bredvid livsmedlets namn.
   */
  labelled?: boolean
  className?: string
}

/** Emoji-glyfen – delas med MealIcon så att båda ser likadana ut. */
export const EMOJI_CLASS = 'translate-y-[0.02em] drop-shadow-[0_1px_0_rgb(0_0_0/0.06)]'

/** Emoji på tonad rundad ruta, t.ex. 🥕 på hjortronton för rotfrukter. */
export function CategoryIcon({ category, size = 'md', emoji, name, labelled = false, className = '' }: CategoryIconProps) {
  const meta = CATEGORY_META[category ?? 'ovrigt'] ?? CATEGORY_META.ovrigt
  return (
    <span
      className={`inline-grid shrink-0 select-none place-items-center leading-none ${ICON_SIZE_CLASSES[size]} ${TINT_CLASSES[meta.tint].soft} ${className}`}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? meta.label : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      <span className={EMOJI_CLASS}>{emoji ?? foodEmoji(name, category)}</span>
    </span>
  )
}
