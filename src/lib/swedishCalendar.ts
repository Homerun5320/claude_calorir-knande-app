/**
 * Svensk matkalender – matdagar, högtider, traditioner och säsongsstarter.
 *
 * Alla datum räknas fram per år (inga hårdkodade årtal):
 * - Påskdagen beräknas med den anonyma gregorianska algoritmen (Meeus/Jones/Butcher).
 *   Skärtorsdag, långfredag, påskafton och fettisdagen (47 dagar före påskdagen) räknas därifrån.
 * - Midsommarafton är fredagen mellan 19 och 25 juni, alla helgons dag lördagen mellan
 *   31 oktober och 6 november (båda sedan 1953).
 * - Surströmmingspremiären är tredje torsdagen i augusti, hummerpremiären första måndagen efter
 *   den 20 september, Äggets dag andra fredagen i oktober, Vasaloppet första söndagen i mars,
 *   mors dag sista söndagen i maj och fars dag andra söndagen i november.
 * - Prinsesstårtans vecka är sista hela veckan (måndag–söndag) i september.
 *
 * Datum och fakta är kontrollerade mot bl.a. Institutet för språk och folkminnen (Isof),
 * Nordiska museet, temadagar.se, Svensk Potatis, Riksförbundet Svensk Trädgård, Sveriges
 * Bagare & Konditorer och Länsstyrelsen Västra Götaland (verifierat september 2026).
 *
 * Tonen är varm och "lagom": tipsen handlar om att njuta, aldrig om att kompensera eller skämmas.
 */
import type { ISODate } from '../types'
import { addDays, diffDays, fromISODate, toISODate, weekdayIndex } from './dates'

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------

/**
 * - `matdag` – temadag för en maträtt eller ett livsmedel (t.ex. Kanelbullens dag)
 * - `hogtid` – helgdag eller stor högtid (t.ex. julafton, påskdagen)
 * - `tradition` – sed eller återkommande firande (t.ex. Lucia, fredagsmys)
 * - `sasong` – start på en råvarusäsong eller ett säsongsfiske (t.ex. hummerpremiären)
 */
export type FoodDayKind = 'matdag' | 'hogtid' | 'tradition' | 'sasong'

export interface FoodDay {
  /** Unikt per förekomst: `${key}@${date}` – stabilt och lämpligt som React-nyckel. */
  id: string
  /** Stabil nyckel som är densamma varje år, t.ex. 'kanelbullens-dag'. */
  key: string
  /** Dagen (eller första dagen för en period). */
  date: ISODate
  /** Sista dagen för perioder som varar flera dagar (t.ex. Prinsesstårtans vecka). */
  endDate?: ISODate
  name: string
  /**
   * Emoji som visar dagens mat eller tradition (🍰 för prinsesstårta, 🎿 för Vasaloppet). Finns
   * ingen egen emoji väljs något som hör till dagen (🌲 för lingonen i barrskogen) – aldrig en
   * symbol som kan läsas som en statusmarkering eller varning, som 🔴.
   */
  emoji: string
  kind: FoodDayKind
  /** 2–3 varma meningar med en rolig fakta. */
  description: string
  /** Sökord för typiska livsmedel, att använda mot livsmedelssöket (t.ex. ['kanelbulle']). */
  foods: string[]
  /** Vänligt "lagom"-tips – aldrig skuldbeläggande. */
  tip?: string
  /** Veckotradition (torsdag, fredag, lördag) – returneras bara av `foodDayFor`. */
  weekly?: boolean
  /** Datumet är ungefärligt (säsonger och traditioner utan fast datum). Visa gärna "ca". */
  approximate?: boolean
  /** Landsdel där traditionen är starkast, t.ex. 'Skåne'. */
  region?: string
  /** Allmän helgdag (röd dag i almanackan). */
  redDay?: boolean
}

export const FOOD_DAY_KIND_LABELS: Record<FoodDayKind, string> = {
  matdag: 'Matdag',
  hogtid: 'Högtid',
  tradition: 'Tradition',
  sasong: 'Säsong',
}

/** Sorteringsordning när flera händelser infaller samma dag (lägre först). */
const KIND_PRIORITY: Record<FoodDayKind, number> = { hogtid: 0, matdag: 1, tradition: 2, sasong: 3 }

// ---------------------------------------------------------------------------
// Datumhjälp
// ---------------------------------------------------------------------------

/** Veckodag som index, måndag = 0 … söndag = 6 (som i `dates.ts`). */
export const WEEKDAY = { mandag: 0, tisdag: 1, onsdag: 2, torsdag: 3, fredag: 4, lordag: 5, sondag: 6 } as const

/** År, månad (1–12) och dag → ISODate. Överskjutande dagar/månader rullar över som i `Date`. */
function ymd(year: number, month: number, day: number): ISODate {
  return toISODate(new Date(year, month - 1, day))
}

/** Första datum på eller efter `date` som är veckodagen `weekday` (måndag = 0). */
export function weekdayOnOrAfter(date: ISODate, weekday: number): ISODate {
  return addDays(date, (weekday - weekdayIndex(date) + 7) % 7)
}

/** N:te (1-baserat) veckodagen i en månad, t.ex. tredje torsdagen i augusti. */
export function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): ISODate {
  return addDays(weekdayOnOrAfter(ymd(year, month, 1), weekday), 7 * (n - 1))
}

/** Sista veckodagen `weekday` i en månad, t.ex. sista söndagen i maj. */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): ISODate {
  const last = ymd(year, month + 1, 0)
  return addDays(last, -((weekdayIndex(last) - weekday + 7) % 7))
}

/**
 * Påskdagen enligt den anonyma gregorianska algoritmen (Meeus/Jones/Butcher).
 * Gäller för alla år i den gregorianska kalendern (i Sverige sedan 1753).
 */
export function easterSunday(year: number): ISODate {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(year, month, day)
}

/** Fettisdagen (semmeldagen): tisdagen 47 dagar före påskdagen. Infaller mellan 3 februari och 9 mars. */
export function fatTuesday(year: number): ISODate {
  return addDays(easterSunday(year), -47)
}

/** Midsommarafton: fredagen mellan 19 och 25 juni. */
export function midsummerEve(year: number): ISODate {
  return weekdayOnOrAfter(ymd(year, 6, 19), WEEKDAY.fredag)
}

/** Alla helgons dag: lördagen mellan 31 oktober och 6 november. */
export function allSaintsDay(year: number): ISODate {
  return weekdayOnOrAfter(ymd(year, 10, 31), WEEKDAY.lordag)
}

/** Första advent: fjärde söndagen före juldagen, dvs. söndagen mellan 27 november och 3 december. */
export function firstAdvent(year: number): ISODate {
  return weekdayOnOrAfter(ymd(year, 11, 27), WEEKDAY.sondag)
}

/** Mors dag i Sverige: sista söndagen i maj. */
export function mothersDay(year: number): ISODate {
  return lastWeekdayOfMonth(year, 5, WEEKDAY.sondag)
}

/** Fars dag i Sverige: andra söndagen i november. */
export function fathersDay(year: number): ISODate {
  return nthWeekdayOfMonth(year, 11, WEEKDAY.sondag, 2)
}

/** Surströmmingspremiären: tredje torsdagen i augusti. */
export function surstrommingPremiere(year: number): ISODate {
  return nthWeekdayOfMonth(year, 8, WEEKDAY.torsdag, 3)
}

/** Hummerpremiären på västkusten: första måndagen efter den 20 september (kl. 07.00). */
export function lobsterPremiere(year: number): ISODate {
  return weekdayOnOrAfter(ymd(year, 9, 21), WEEKDAY.mandag)
}

/** Vasaloppet: första söndagen i mars. */
export function vasaloppet(year: number): ISODate {
  return nthWeekdayOfMonth(year, 3, WEEKDAY.sondag, 1)
}

/** Äggets dag (World Egg Day): andra fredagen i oktober. */
export function worldEggDay(year: number): ISODate {
  return nthWeekdayOfMonth(year, 10, WEEKDAY.fredag, 2)
}

/** Prinsesstårtans vecka: sista hela veckan (måndag–söndag) i september. */
export function princessCakeWeek(year: number): { start: ISODate; end: ISODate } {
  const end = lastWeekdayOfMonth(year, 9, WEEKDAY.sondag)
  return { start: addDays(end, -6), end }
}

// ---------------------------------------------------------------------------
// Kalenderns innehåll
// ---------------------------------------------------------------------------

interface FoodDayTemplate extends Omit<FoodDay, 'id' | 'date' | 'endDate' | 'weekly'> {
  date: (year: number) => ISODate
  endDate?: (year: number) => ISODate
}

const fixed = (month: number, day: number) => (year: number) => ymd(year, month, day)

const TEMPLATES: readonly FoodDayTemplate[] = [
  // --- Januari ---------------------------------------------------------------
  {
    key: 'nyarsdagen',
    name: 'Nyårsdagen',
    emoji: '🌅',
    kind: 'hogtid',
    redDay: true,
    date: fixed(1, 1),
    description:
      'Årets första dag är för många en lugn dag med sen frukost eller brunch. Många nyårslöften handlar om mat – men små, konkreta vanor brukar hålla mycket längre än stora förbud.',
    foods: ['ägg', 'bröd', 'yoghurt', 'juice'],
    tip: 'Börja året med en vana i stället för en diet – till exempel en extra grönsak till lunchen eller en promenad efter maten.',
  },
  {
    key: 'trettondedag-jul',
    name: 'Trettondedag jul',
    emoji: '⭐',
    kind: 'hogtid',
    redDay: true,
    date: fixed(1, 6),
    description:
      'Trettondedagen firas till minne av de vise männen som enligt berättelsen kom med gåvor till Jesusbarnet. För många är det också sista chansen att ta vara på julens rester innan vardagen tar vid.',
    foods: ['julskinka', 'pepparkaka', 'rödkål'],
    tip: 'Julskinka i en pytt eller omelett är en god och klimatsmart vardagsrätt – mat som äts upp är aldrig svinn.',
  },
  {
    key: 'tjugondag-knut',
    name: 'Tjugondag Knut',
    emoji: '🎄',
    kind: 'tradition',
    date: fixed(1, 13),
    description:
      'Tjugondag Knut – den tjugonde dagen i julen räknat från juldagen – är dagen då julen dansas ut. Förr hängde godis, äpplen och pepparkakor i granen, och på julgransplundringen fick barnen "plundra" den.',
    foods: ['pepparkaka', 'äpple', 'godis'],
    tip: 'Bjud på äppelbitar och clementiner vid julgransplundringen – det blir färgglatt och uppskattat av både stora och små.',
  },
  // --- Februari --------------------------------------------------------------
  {
    key: 'alla-hjartans-dag',
    name: 'Alla hjärtans dag',
    emoji: '❤️',
    kind: 'tradition',
    date: fixed(2, 14),
    description:
      'Alla hjärtans dag slog igenom på bred front i Sverige under 1990-talet. I dag firas dagen med blommor, choklad och middagar – för både kärlek och vänskap.',
    foods: ['choklad', 'jordgubbar', 'bubbel'],
    tip: 'Mörk choklad med hög kakaohalt är en god liten lyx. En fin kväll handlar mer om sällskapet än om vad som står på bordet.',
  },
  {
    key: 'knackebrodets-dag',
    name: 'Knäckebrödets dag',
    emoji: '🫓',
    kind: 'matdag',
    date: fixed(2, 19),
    description:
      'Förr bakades knäckebröd som runda kakor med hål i mitten, så att de kunde hängas på stänger under taket och torka – då höll brödet i månader. Knäckebrödsakademin startade temadagen 2018.',
    foods: ['knäckebröd', 'keso', 'ägg', 'ost'],
    tip: 'Välj gärna knäckebröd av fullkornsråg – fibrerna mättar länge. Toppa med något proteinrikt som ägg, keso eller hummus.',
  },
  {
    key: 'fettisdagen',
    name: 'Fettisdagen',
    emoji: '🧁',
    kind: 'matdag',
    date: fatTuesday,
    description:
      'Fettisdagen var förr sista festdagen före fastan inför påsk, då man åt sig mätt på fet och god mat. I dag är det semlans stora dag – ungefär sex miljoner semlor säljs bara på fettisdagen.',
    foods: ['semla', 'mandelmassa', 'vispgrädde', 'hetvägg'],
    tip: 'Njut av din semla i lugn och ro, gärna tillsammans med någon. En semla är en tradition, inte ett snedsteg.',
  },
  // --- Mars ------------------------------------------------------------------
  {
    key: 'vasaloppet',
    name: 'Vasaloppet',
    emoji: '🎿',
    kind: 'tradition',
    region: 'Dalarna',
    date: vasaloppet,
    description:
      'Varje år första söndagen i mars åker tusentals skidåkare de nio milen från Sälen till Mora. Vid kontrollerna längs spåret serveras tiotusentals liter blåbärssoppa, grönsaksbuljong och bullar.',
    foods: ['blåbärssoppa', 'bulle', 'havregrynsgröt'],
    tip: 'Blåbärssoppa ger snabb energi under långa pass. En vanlig dag är hela blåbär ett fiberrikt och lika gott alternativ.',
  },
  {
    key: 'vaffeldagen',
    name: 'Våffeldagen',
    emoji: '🧇',
    kind: 'matdag',
    date: fixed(3, 25),
    description:
      'Våffeldagen är egentligen Vårfrudagen, Marie bebådelsedag. När "vårfrudagen" uttalades snabbt blev det "vaffeldagen" – och av en språklig slump började vi äta våfflor den 25 mars.',
    foods: ['våffla', 'sylt', 'vispgrädde', 'hjortronsylt'],
    tip: 'Toppa våfflan med färska eller frysta bär och en klick kvarg eller yoghurt – den blir både fräsch och mer mättande.',
  },
  // --- Påsk ------------------------------------------------------------------
  {
    key: 'skartorsdagen',
    name: 'Skärtorsdagen',
    emoji: '🧹',
    kind: 'tradition',
    date: (y) => addDays(easterSunday(y), -3),
    description:
      'På skärtorsdagen klär barn ut sig till påskkärringar och går runt och önskar glad påsk, ofta mot en godisbit. Enligt gammal folktro flög häxorna till Blåkulla just denna natt.',
    foods: ['godis', 'påskägg'],
    tip: 'Påskhelgen är lång – regelbundna måltider gör det lättare att njuta av godiset utan att vara sugen hela tiden.',
  },
  {
    key: 'langfredagen',
    name: 'Långfredagen',
    emoji: '🕯️',
    kind: 'hogtid',
    redDay: true,
    date: (y) => addDays(easterSunday(y), -2),
    description:
      'Långfredagen var länge en av årets mest stillsamma dagar, då nöjen var förbjudna och många fastade. Fisk var vanlig mat, och på många håll lever traditionen med en enkel fiskrätt kvar.',
    foods: ['lax', 'torsk', 'sill', 'potatis'],
    tip: 'Passa på med en lugn promenad och en enkel fiskrätt – fisk två till tre gånger i veckan är ett av Livsmedelsverkets kostråd.',
  },
  {
    key: 'paskafton',
    name: 'Påskafton',
    emoji: '🐣',
    kind: 'hogtid',
    date: (y) => addDays(easterSunday(y), -1),
    description:
      'Påskafton är den stora festdagen med påskbord: ägg, sill, lax, Janssons frestelse och ofta lamm – och godisfyllda påskägg. Påskmust är i princip samma dryck som julmust, bara med ny etikett.',
    foods: ['ägg', 'sill', 'lax', 'janssons frestelse', 'påskmust', 'godis'],
    tip: 'Börja gärna påskbordet med ägg och fisk – protein mättar – och ta sedan lagom av det du längtat mest efter.',
  },
  {
    key: 'paskdagen',
    name: 'Påskdagen',
    emoji: '🌷',
    kind: 'hogtid',
    redDay: true,
    date: easterSunday,
    description:
      'Påskdagen är kyrkans största högtid. Den infaller första söndagen efter första fullmånen efter vårdagjämningen – därför kan den hamna var som helst mellan 22 mars och 25 april.',
    foods: ['lammstek', 'potatis', 'ägg'],
    tip: 'Rester från påskbordet – ägg, lax och potatis – blir en snabb och god lunch på annandagen.',
  },
  // --- April–juni ------------------------------------------------------------
  {
    key: 'valborg',
    name: 'Valborgsmässoafton',
    emoji: '🔥',
    kind: 'tradition',
    date: fixed(4, 30),
    description:
      'På valborg tänds majbrasor över hela landet och körer sjunger in våren. I studentstäderna Uppsala och Lund firas dagen med sillunch och picknick i parkerna.',
    foods: ['sill', 'grillkorv', 'potatis'],
    tip: 'Ta med en filt, en termos och något gott till brasan – en grillad korv, en macka eller lite frukt räcker långt.',
  },
  {
    key: 'chokladbollens-dag',
    name: 'Chokladbollens dag',
    emoji: '🥥',
    kind: 'matdag',
    date: fixed(5, 11),
    description:
      'Chokladbollen är en av få fikaklassiker som inte ska gräddas – havregryn, smör, socker, kakao och en skvätt kaffe, rullat i pärlsocker eller kokos. Ingen vet säkert vem som hittade på dagen, men den firas i bagerier och kök över hela landet.',
    foods: ['chokladboll', 'kaffe'],
    tip: 'Havregrynen ger chokladbollen både tuggmotstånd och lite fibrer. Rulla små bollar, så räcker satsen till fler.',
  },
  {
    key: 'sparrissasong',
    name: 'Svensk sparris',
    emoji: '🌱',
    kind: 'sasong',
    approximate: true,
    date: fixed(5, 20),
    description:
      'Från slutet av maj till midsommar är det säsong för svensk sparris – både den gröna och den vita. Sparrisen skördas för hand och växer så snabbt att den kan behöva plockas varje dag.',
    foods: ['sparris', 'färskpotatis', 'ägg'],
    tip: 'Ugnsrosta sparrisen med lite rapsolja och flingsalt – god som tillbehör eller i en sallad med ägg.',
  },
  {
    key: 'mors-dag',
    name: 'Mors dag',
    emoji: '💐',
    kind: 'tradition',
    date: mothersDay,
    description:
      'I Sverige firas mors dag sista söndagen i maj – några veckor senare än i många andra länder, som firar andra söndagen i maj. Frukost på sängen, blommor och tårta hör till traditionen.',
    foods: ['jordgubbar', 'yoghurt', 'bröd', 'tårta'],
    tip: 'Frukost på sängen blir extra god med färska bär, yoghurt och nybakat bröd.',
  },
  {
    key: 'nationaldagen',
    name: 'Sveriges nationaldag',
    emoji: '🇸🇪',
    kind: 'hogtid',
    redDay: true,
    date: fixed(6, 6),
    description:
      'Nationaldagen firas till minne av att Gustav Vasa valdes till kung den 6 juni 1523 och att en ny regeringsform antogs samma datum 1809. Dagen blev röd dag först 2005.',
    foods: ['sparris', 'rädisor', 'färskpotatis', 'jordgubbar'],
    tip: 'Packa en picknick med säsongens primörer – rädisor, sparris och färskpotatis är i sin bästa tid.',
  },
  {
    key: 'jordgubbssasong',
    name: 'Svenska jordgubbar',
    emoji: '🍓',
    kind: 'sasong',
    approximate: true,
    date: fixed(6, 15),
    description:
      'Runt mitten av juni börjar de svenska frilandsjordgubbarna mogna, lagom till midsommar. Många menar att de ljusa sommarnätterna, som låter bären mogna långsamt, gör dem extra söta.',
    foods: ['jordgubbar'],
    tip: 'Jordgubbar innehåller mycket C-vitamin och lite energi. Ät dem som de är, med filmjölk eller i en sallad.',
  },
  {
    key: 'midsommarafton',
    name: 'Midsommarafton',
    emoji: '🌼',
    kind: 'hogtid',
    date: midsummerEve,
    description:
      'Midsommarafton är för många årets viktigaste högtid, med blomsterkransar och dans till Små grodorna kring midsommarstången. På bordet står sill, färskpotatis med dill, gräddfil och gräslök – och till sist jordgubbar.',
    foods: ['sill', 'färskpotatis', 'gräddfil', 'lax', 'jordgubbar', 'snaps'],
    tip: 'Fyll tallriken med färskpotatis, sill och sommarens grönsaker och njut av jordgubbarna. Ett glas vatten mellan skålarna gör dagen efter skönare.',
  },
  // --- Juli–augusti ----------------------------------------------------------
  {
    key: 'blabarssasong',
    name: 'Blåbärstid',
    emoji: '🫐',
    kind: 'sasong',
    approximate: true,
    date: fixed(7, 15),
    description:
      'I juli mognar blåbären i skogarna, och tack vare allemansrätten får alla plocka vilda bär. Skogsblåbär är blå rakt igenom – det är därför de färgar fingrarna.',
    foods: ['blåbär'],
    tip: 'Frys in blåbären i portioner – de är lika goda i gröten en mörk novembermorgon.',
  },
  {
    key: 'kantarellsasong',
    name: 'Kantarellsäsong',
    emoji: '🍄',
    kind: 'sasong',
    approximate: true,
    date: fixed(7, 20),
    description:
      'Från juli och en bit in på hösten lyser kantarellerna gula i skogen. Svampplockning är en folkrörelse i Sverige – men plocka bara svampar du är helt säker på.',
    foods: ['kantareller', 'smör', 'rostat bröd'],
    tip: 'En svamptoast på grovt bröd är höstens bästa lunch. Stek svampen torr först så blir den godare.',
  },
  {
    key: 'kraftpremiar',
    name: 'Kräftpremiären',
    emoji: '🦞',
    kind: 'tradition',
    approximate: true,
    date: fixed(8, 8),
    description:
      'Förr fick flodkräftor inte fiskas förrän i början av augusti, och premiären blev en fest. I dag finns inget fast datum, men augusti är fortfarande kräftskivornas månad – med lyktor, hattar och snapsvisor.',
    foods: ['kräftor', 'västerbottenpaj', 'knäckebröd', 'snaps'],
    tip: 'Kräftor är magra och proteinrika. Låt skalandet ta tid – det hör till mysigheten, och mättnadskänslan hinner ikapp.',
  },
  {
    key: 'surstrommingspremiar',
    name: 'Surströmmingspremiären',
    emoji: '🐟',
    kind: 'tradition',
    region: 'Norrland',
    date: surstrommingPremiere,
    description:
      'Under många år fick årets surströmming inte säljas före tredje torsdagen i augusti. Regeln försvann 1998 men premiären lever kvar – helst utomhus, i tunnbröd med mandelpotatis, rödlök och gräddfil.',
    foods: ['surströmming', 'tunnbröd', 'mandelpotatis', 'rödlök', 'gräddfil'],
    tip: 'Surströmming är salt, så drick gärna vatten till och låt resten av dagens mat vara lite mindre salt.',
  },
  {
    key: 'lingonsasong',
    name: 'Lingonsäsong',
    emoji: '🌲',
    kind: 'sasong',
    approximate: true,
    date: fixed(8, 25),
    description:
      'I slutet av augusti börjar lingonen mogna i barrskogen. Lingon innehåller naturligt bensoesyra, och därför kunde man förr förvara rårörda lingon länge utan kylskåp.',
    foods: ['lingon', 'lingonsylt'],
    tip: 'Rör lingonen med lite mindre socker än receptet säger – syrligheten passar perfekt till gröt, pannkakor och viltgrytor.',
  },
  // --- September–oktober -----------------------------------------------------
  {
    key: 'hummerpremiar',
    name: 'Hummerpremiären',
    emoji: '🦞',
    kind: 'sasong',
    region: 'Västkusten',
    date: lobsterPremiere,
    description:
      'Klockan sju på morgonen den första måndagen efter den 20 september går startskottet för hummerfisket på västkusten. Fisket är noga reglerat – för små humrar och honor med rom ska tillbaka i havet.',
    foods: ['hummer', 'räkor'],
    tip: 'Hummer är mager och proteinrik. Servera den med en krispig sallad och gott bröd så blir det en festmåltid.',
  },
  {
    key: 'applets-dag',
    name: 'Äpplets dag',
    emoji: '🍎',
    kind: 'matdag',
    date: fixed(9, 25),
    description:
      'Äpplets dag har firats i Sverige sedan 2016 på initiativ av Riksförbundet Svensk Trädgård, inspirerad av engelska Apple Day. I svenska trädgårdar växer hundratals äppelsorter – från Aroma till Ingrid Marie.',
    foods: ['äpple', 'äppelmos', 'äppelkaka'],
    tip: 'Ta vara på fallfrukten: äppelmos, äppelkaka och must är goda och klimatsmarta sätt att minska svinnet.',
  },
  {
    key: 'prinsesstartans-vecka',
    name: 'Prinsesstårtans vecka',
    emoji: '🍰',
    kind: 'matdag',
    date: (y) => princessCakeWeek(y).start,
    endDate: (y) => princessCakeWeek(y).end,
    description:
      'Prinsesstårtan hette från början "grön tårta" i Prinsessornas kokbok från 1929 och fick sitt namn för att prinsessorna Margaretha, Märtha och Astrid tyckte så mycket om den. Under veckan skänker konditorier en del av intäkterna till Kronprinsessan Victorias fond.',
    foods: ['prinsesstårta'],
    tip: 'Köp en bit på ditt lokala konditori och njut av den till kaffet – då gör tårtan nytta för fler än dig.',
  },
  {
    key: 'kaffets-dag',
    name: 'Kaffets dag',
    emoji: '☕',
    kind: 'matdag',
    date: fixed(9, 29),
    description:
      'Svenskarna hör till världens mest kaffedrickande folk, och ordet "fika" kommer troligen från "kaffi" med stavelserna omkastade. Kaffets dag firas i Sverige den 29 september, den internationella kaffedagen den 1 oktober.',
    foods: ['kaffe', 'mjölk', 'kanelbulle'],
    tip: 'Upp till omkring 400 mg koffein om dagen – ungefär fyra koppar bryggkaffe – bedöms som säkert för de flesta vuxna. Vid graviditet gäller en lägre gräns.',
  },
  {
    key: 'matsvinnsdagen',
    name: 'Dagen mot matsvinn',
    emoji: '♻️',
    kind: 'matdag',
    date: fixed(9, 29),
    description:
      'Sedan 2020 uppmärksammar FN den 29 september som internationell dag för medvetenhet om matsvinn. En stor del av svinnet uppstår i hemmen – och där är det också lättast att göra skillnad.',
    foods: ['matlåda', 'pytt i panna', 'soppa'],
    tip: '"Bäst före" betyder ofta bra efter – titta, lukta och smaka innan du slänger. "Sista förbrukningsdag" ska däremot tas på allvar.',
  },
  {
    key: 'kanelbullens-dag',
    name: 'Kanelbullens dag',
    emoji: '🥐',
    kind: 'matdag',
    date: fixed(10, 4),
    description:
      'Kanelbullens dag instiftades 1999 av Hembakningsrådet, som då fyllde 40 år. Datumet valdes för att inte krocka med andra höstfester som kräftskivor, surströmming och gåsamiddagar.',
    foods: ['kanelbulle', 'kardemummabulle', 'kaffe', 'mjölk'],
    tip: 'En kanelbulle i gott sällskap är fika när den är som bäst. Bakar du själv kan du byta en del av mjölet mot fullkorn.',
  },
  {
    key: 'aggets-dag',
    name: 'Äggets dag',
    emoji: '🥚',
    kind: 'matdag',
    date: worldEggDay,
    description:
      'Äggets dag, World Egg Day, instiftades 1996 och firas över hela världen andra fredagen i oktober. I Sverige äter vi drygt 200 ägg per person och år.',
    foods: ['ägg', 'äggröra', 'omelett'],
    tip: 'Ett ägg ger omkring 6–7 gram protein av hög kvalitet – ett enkelt sätt att göra frukosten mer mättande.',
  },
  {
    key: 'rakmackans-dag',
    name: 'Räkmackans dag',
    emoji: '🦐',
    kind: 'matdag',
    date: fixed(10, 14),
    description:
      'Räkmackan med räkor, ägg, majonnäs, sallad och dill är en svensk klassiker. Att "glida in på en räkmacka" betyder att få något serverat utan ansträngning.',
    foods: ['räksmörgås', 'räkor', 'ägg'],
    tip: 'Räkor är magra och proteinrika – en räkmacka på grovt bröd med mycket sallad blir en mättande lunch.',
  },
  {
    key: 'varldslivsmedelsdagen',
    name: 'Världslivsmedelsdagen',
    emoji: '🌍',
    kind: 'matdag',
    date: fixed(10, 16),
    description:
      'Den 16 oktober 1945 bildades FN:s livsmedels- och jordbruksorganisation FAO, och dagen uppmärksammas nu som Världslivsmedelsdagen. Temat är att alla ska ha tillgång till tillräckligt med näringsrik mat.',
    foods: ['bönor', 'linser', 'havregryn'],
    tip: 'Planera veckans middagar och handla efter lista – det minskar svinnet och sparar pengar.',
  },
  {
    key: 'potatisens-dag',
    name: 'Potatisens dag',
    emoji: '🥔',
    kind: 'matdag',
    date: fixed(10, 26),
    description:
      'Potatisen kom till Sverige under 1600-talet men blev vanlig först på 1700-talet – Jonas Alströmer i Alingsås brukar lyftas fram som pionjär. Dagen firas när skörden är bärgad och utbudet som bäst.',
    foods: ['potatis', 'potatismos', 'potatissallad'],
    tip: 'Potatis är mättande och klimatsmart. Kokt potatis som fått kallna innehåller mer resistent stärkelse, som fungerar ungefär som fibrer.',
  },
  // --- November–december -----------------------------------------------------
  {
    key: 'alla-helgons-dag',
    name: 'Alla helgons dag',
    emoji: '🕯️',
    kind: 'hogtid',
    redDay: true,
    date: allSaintsDay,
    description:
      'Under allhelgonahelgen tänds ljus på gravar över hela landet till minne av dem som gått bort. Många samlas sedan kring en varm middag, och på senare år har även halloweenpumpor blivit vanliga.',
    foods: ['pumpa', 'soppa', 'rotfrukter'],
    tip: 'Pumpan du gröpt ur blir god soppa, och rostade pumpakärnor är ett krispigt tilltugg med mycket fibrer.',
  },
  {
    key: 'gustav-adolfsdagen',
    name: 'Gustav Adolfsdagen',
    emoji: '👑',
    kind: 'tradition',
    region: 'Göteborg',
    date: fixed(11, 6),
    description:
      'Den 6 november 1632 stupade Gustav II Adolf i slaget vid Lützen, och dagen är i dag flaggdag. Särskilt i Göteborg – staden som kungen grundade – äter man Gustav Adolfsbakelse med kungens profil i choklad eller marsipan.',
    foods: ['bakelse', 'kaffe'],
    tip: 'Ät bakelsen till fikat tillsammans med någon – traditioner smakar bäst när de delas.',
  },
  {
    key: 'kladdkakans-dag',
    name: 'Kladdkakans dag',
    emoji: '🍫',
    kind: 'matdag',
    date: fixed(11, 7),
    description:
      'Kladdkakan dök upp i svenska receptsamlingar på 1970-talet och är i dag en av landets mest bakade kakor. Temadagen föddes i sociala medier och har firats den 7 november sedan 2007.',
    foods: ['kladdkaka', 'vispgrädde', 'hallon'],
    tip: 'Servera kladdkakan med bär – hallon eller lingon ger en frisk kontrast till chokladen.',
  },
  {
    key: 'martensafton',
    name: 'Mårtensafton',
    emoji: '🪿',
    kind: 'tradition',
    region: 'Skåne',
    date: fixed(11, 10),
    description:
      'Mårtensafton firas till minne av Sankt Martin. Enligt legenden gömde han sig bland gäss för att slippa bli biskop, men gässen kacklade och avslöjade honom. Gåsamiddagen med svartsoppa, gåsstek och skånsk äppelkaka är särskilt populär i Skåne.',
    foods: ['gås', 'svartsoppa', 'rödkål', 'äppelkaka'],
    tip: 'Gåsamiddagen är mäktig – ta gärna rikligt av rödkålen och de bakade äpplena, och låt måltiden ta tid.',
  },
  {
    key: 'fars-dag',
    name: 'Fars dag',
    emoji: '💙',
    kind: 'tradition',
    date: fathersDay,
    description:
      'Fars dag firas i Sverige andra söndagen i november, liksom i Norge och Finland. Frukost på sängen, en favoritmiddag eller en tårta är vanliga sätt att fira.',
    foods: ['tårta', 'kaffe'],
    tip: 'Laga en favoriträtt tillsammans – att laga mat ihop är ett av de finaste sätten att umgås.',
  },
  {
    key: 'forsta-advent',
    name: 'Första advent',
    emoji: '🕯️',
    kind: 'tradition',
    date: firstAdvent,
    description:
      'På första advent tänds det första ljuset i adventsljusstaken och stjärnan tas fram i fönstret. Det är också startskottet för glögg, pepparkakor och adventsfika.',
    foods: ['glögg', 'pepparkaka', 'lussekatt', 'clementin'],
    tip: 'Bjud på clementiner och nötter tillsammans med pepparkakorna – det blir ett färgglatt och lagom adventsfika.',
  },
  {
    key: 'pepparkakans-dag',
    name: 'Pepparkakans dag',
    emoji: '🍪',
    kind: 'matdag',
    date: fixed(12, 9),
    description:
      'Pepparkakans dag har firats på Annas namnsdag sedan 1996. Pepparkakor bakades redan i medeltidens kloster, där kryddorna ansågs vara bra för magen – och än i dag sägs det att man blir snäll av pepparkakor.',
    foods: ['pepparkaka', 'glögg'],
    tip: 'Baka tillsammans – att forma och dekorera pepparkakor är minst lika roligt som att äta dem.',
  },
  {
    key: 'lucia',
    name: 'Lucia',
    emoji: '🌟',
    kind: 'tradition',
    date: fixed(12, 13),
    description:
      'Lucia bringar ljus i mörkret med luciatåg, sång, lussekatter, pepparkakor och glögg. Enligt den gamla kalendern var natten mot den 13 december årets längsta, och då skulle man äta rikligt för att klara mörkret.',
    foods: ['lussekatt', 'pepparkaka', 'glögg', 'kaffe'],
    tip: 'Saffran ger lussekatten dess gyllene färg. En lussekatt och en varm kopp kaffe eller te är en härlig start på luciamorgonen.',
  },
  {
    key: 'julafton',
    name: 'Julafton',
    emoji: '🎄',
    kind: 'hogtid',
    date: fixed(12, 24),
    description:
      'Julafton är den svenska julens huvuddag, med julbord: skinka, sill, köttbullar, prinskorv, revbensspjäll, Janssons frestelse, rödkål och risgrynsgröt – och julmust. Klockan 15 samlas många framför Kalle Anka, en tradition sedan 1960.',
    foods: ['julskinka', 'sill', 'köttbullar', 'prinskorv', 'janssons frestelse', 'rödkål', 'risgrynsgröt', 'julmust'],
    tip: 'Ta en runda runt julbordet först och välj det du längtar mest efter. Ingen enskild dag avgör något – det är vardagen som räknas.',
  },
  {
    key: 'nyarsafton',
    name: 'Nyårsafton',
    emoji: '🥂',
    kind: 'hogtid',
    date: fixed(12, 31),
    description:
      'Nyårsafton firas med festmiddag, tolvslag och fyrverkerier. Sedan slutet av 1800-talet läses dikten "Nyårsklockan" upp på Skansen vid tolvslaget.',
    foods: ['räkor', 'hummer', 'oxfilé', 'bubbel'],
    tip: 'Ät ordentligt under kvällen och drick gärna vatten mellan glasen – så mår du bättre på nyårsdagen.',
  },
]

// ---------------------------------------------------------------------------
// Veckotraditioner
// ---------------------------------------------------------------------------

export interface WeeklyFoodTradition extends Omit<FoodDay, 'id' | 'date' | 'endDate' | 'weekly' | 'kind'> {
  /** Veckodag, måndag = 0 … söndag = 6. */
  weekday: number
}

/** Svenska veckotraditioner kring mat. Visas via `foodDayFor` den aktuella veckodagen. */
export const WEEKLY_FOOD_TRADITIONS: readonly WeeklyFoodTradition[] = [
  {
    key: 'artsoppa-torsdag',
    weekday: WEEKDAY.torsdag,
    name: 'Ärtsoppa och pannkakor',
    emoji: '🥣',
    description:
      'Ärtsoppa på torsdagar är en tradition från katolsk tid, då man åt en stadig måltid inför fredagens fasta. Än i dag serveras ärtsoppa med pannkakor i skolor, på lunchrestauranger och inom Försvarsmakten.',
    foods: ['ärtsoppa', 'pannkaka', 'sylt', 'senap'],
    tip: 'Gula ärtor är baljväxter, fulla av protein och fibrer och med låg klimatpåverkan. Kostråden säger: ät baljväxter ofta.',
  },
  {
    key: 'fredagsmys',
    weekday: WEEKDAY.fredag,
    name: 'Fredagsmys',
    emoji: '🌮',
    description:
      'Fredagsmys är det svenska ordet för en lugn och mysig fredagskväll hemma, ofta med tacos framför tv:n. Ordet blev rikskänt genom en reklamfilm för chips i mitten av 2000-talet.',
    foods: ['tacos', 'tortilla', 'nötfärs', 'bönor', 'chips'],
    tip: 'Bygg tacon som en tallriksmodell: mycket grönsaker, bönor eller färs och lagom med tillbehör – och njut av myset.',
  },
  {
    key: 'lordagsgodis',
    weekday: WEEKDAY.lordag,
    name: 'Lördagsgodis',
    emoji: '🍬',
    description:
      'Lördagsgodis är en svensk tradition sedan 1950-talet. Efter forskning om socker och karies rådde dåvarande Medicinalstyrelsen att äta godis vid ett tillfälle i veckan i stället för lite varje dag – för tändernas skull.',
    foods: ['godis', 'lösgodis', 'choklad'],
    tip: 'Plocka det du verkligen gillar och njut av det i lugn och ro – det är hela idén med lördagsgodis. Ett glas vatten efteråt är snällt mot tänderna.',
  },
]

// ---------------------------------------------------------------------------
// Publikt API
// ---------------------------------------------------------------------------

const yearCache = new Map<number, FoodDay[]>()

function compareDays(a: FoodDay, b: FoodDay): number {
  return a.date.localeCompare(b.date) || KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.name.localeCompare(b.name, 'sv')
}

function materialize(t: FoodDayTemplate, year: number): FoodDay {
  const { date, endDate, ...rest } = t
  const d = date(year)
  const day: FoodDay = { ...rest, id: `${t.key}@${d}`, date: d, foods: [...t.foods] }
  if (endDate) day.endDate = endDate(year)
  return day
}

/**
 * Alla matdagar, högtider, traditioner och säsongsstarter under ett år, sorterade på datum.
 * Veckotraditionerna (torsdag, fredag, lördag) ingår inte – de hämtas med `foodDayFor`.
 * Returnerar en ny array varje gång (resultatet cachas internt per år).
 */
export function foodDaysForYear(year: number): FoodDay[] {
  let list = yearCache.get(year)
  if (!list) {
    list = TEMPLATES.map((t) => materialize(t, year)).sort(compareDays)
    yearCache.set(year, list)
  }
  return list.map((d) => ({ ...d, foods: [...d.foods] }))
}

/** Veckotraditionen för ett datum (om någon), som `FoodDay` med `weekly: true`. */
export function weeklyFoodDayFor(date: ISODate): FoodDay | undefined {
  const w = weekdayIndex(date)
  const t = WEEKLY_FOOD_TRADITIONS.find((x) => x.weekday === w)
  if (!t) return undefined
  const { weekday: _weekday, ...rest } = t
  return { ...rest, id: `${t.key}@${date}`, date, kind: 'tradition', weekly: true, foods: [...t.foods] }
}

function inRange(day: FoodDay, date: ISODate): boolean {
  return day.date === date || (day.endDate !== undefined && day.date <= date && date <= day.endDate)
}

/**
 * Alla händelser som infaller ett visst datum, inklusive perioder (t.ex. Prinsesstårtans vecka)
 * och veckotraditioner. Veckotraditionen utelämnas om dagen redan är en högtid
 * (ingen "ärtsoppetorsdag" på skärtorsdagen eller julafton).
 * Sortering: högtider först, sedan matdagar, traditioner, säsonger och sist veckotraditionen.
 */
export function foodDayFor(date: ISODate): FoodDay[] {
  const year = fromISODate(date).getFullYear()
  const events = foodDaysForYear(year).filter((d) => inRange(d, date))
  events.sort((a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind])
  if (!events.some((e) => e.kind === 'hogtid')) {
    const weekly = weeklyFoodDayFor(date)
    if (weekly) events.push(weekly)
  }
  return events
}

/**
 * De `count` närmaste kommande händelserna från och med `from` (veckotraditioner exkluderade).
 * Perioder som pågår (t.ex. Prinsesstårtans vecka) räknas som kommande tills de är slut.
 */
export function upcomingFoodDays(from: ISODate, count = 5): FoodDay[] {
  if (count <= 0) return []
  const startYear = fromISODate(from).getFullYear()
  const out: FoodDay[] = []
  for (let y = startYear; y <= startYear + 2 && out.length < count; y++) {
    for (const d of foodDaysForYear(y)) {
      if ((d.endDate ?? d.date) >= from) out.push(d)
      if (out.length >= count) break
    }
  }
  return out
}

/** Händelser (utan veckotraditioner) som börjar eller pågår en viss månad (1–12). */
export function foodDaysInMonth(year: number, month: number): FoodDay[] {
  const first = ymd(year, month, 1)
  const last = ymd(year, month + 1, 0)
  return foodDaysForYear(year).filter((d) => d.date <= last && (d.endDate ?? d.date) >= first)
}

/** Nästa förekomst (från och med `from`) av en händelse med given nyckel, t.ex. 'fettisdagen'. */
export function nextFoodDay(key: string, from: ISODate): FoodDay | undefined {
  const startYear = fromISODate(from).getFullYear()
  for (let y = startYear; y <= startYear + 1; y++) {
    const hit = foodDaysForYear(y).find((d) => d.key === key && (d.endDate ?? d.date) >= from)
    if (hit) return hit
  }
  return undefined
}

/**
 * Nedräkning på svenska: "Idag", "Imorgon", "Om 5 dagar", "Om 3 veckor", "Om 2 månader",
 * "Pågår" (för perioder som redan börjat) eller "Har varit" för passerade datum.
 */
export function foodDayCountdown(day: Pick<FoodDay, 'date' | 'endDate'>, today: ISODate): string {
  const n = diffDays(today, day.date)
  if (n === 0) return 'Idag'
  if (n < 0) return day.endDate && day.endDate >= today ? 'Pågår' : 'Har varit'
  if (n === 1) return 'Imorgon'
  if (n < 14) return `Om ${n} dagar`
  if (n < 60) return `Om ${Math.round(n / 7)} veckor`
  const months = Math.round(n / 30.44)
  return months === 1 ? 'Om en månad' : `Om ${months} månader`
}
