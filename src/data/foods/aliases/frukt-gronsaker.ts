/**
 * Alias för borttagna och sammanslagna livsmedel i `../frukt-gronsaker.ts` (Frukt och grönsaker).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const fruktGronsakerAliases: FoodAlias[] = [
  // --- Frukt -------------------------------------------------------------------
  // Äpple: med och utan skal i en rad.
  { from: 'lagom:apple-skalat', to: 'lagom:apple-med-skal' },
  // Konserverad frukt: samlingsvärde för frukt på burk (ananas, persikor, fruktcocktail …).
  { from: 'lagom:ananas-konserverad-juice', to: 'lagom:fruktcocktail-sockerlag' },
  // Melon: honungsmelon, cantaloupe och galia i en rad (vattenmelon har en egen).
  { from: 'lagom:cantaloupemelon', to: 'lagom:honungsmelon' },

  // --- Bär ---------------------------------------------------------------------
  { from: 'lagom:blabar-odlade', to: 'lagom:blabar-skogs' },
  // Ovanliga bär pekar på det närmaste vanliga bäret (liknande energi och användning).
  { from: 'lagom:aronia', to: 'lagom:blabar-skogs' },
  { from: 'lagom:akerbar', to: 'lagom:hallon' },
  { from: 'lagom:havtorn', to: 'lagom:hjortron' },

  // --- Grönsaker ---------------------------------------------------------------
  // Paprika: röd, grön och gul i en rad.
  { from: 'lagom:paprika-gron', to: 'lagom:paprika-rod' },
  { from: 'lagom:paprika-gul', to: 'lagom:paprika-rod' },
  // Sallad: isbergssallad, romansallad, babyleaf och salladsmixar i en rad.
  { from: 'lagom:romansallad', to: 'lagom:sallad-blandad' },
  { from: 'lagom:isbergssallad', to: 'lagom:sallad-blandad' },
  // Spenat: färsk och fryst i en rad.
  { from: 'lagom:spenat-fryst', to: 'lagom:spenat-farsk' },
  // Vitkål: även spetskål och savoykål.
  { from: 'lagom:spetskal', to: 'lagom:vitkal' },
  { from: 'lagom:savoykal', to: 'lagom:vitkal' },
  // Sparris: grön och vit i en rad.
  { from: 'lagom:sparris-vit', to: 'lagom:sparris-gron' },
  // Lök: gul lök och rödlök i en rad.
  { from: 'lagom:lok-rod', to: 'lagom:lok-gul' },
  // Svamp: skogssvamp under kantareller, odlad svamp under champinjoner.
  { from: 'lagom:trattkantareller', to: 'lagom:kantareller' },
  { from: 'lagom:karljohansvamp', to: 'lagom:kantareller' },
  { from: 'lagom:ostronskivling', to: 'lagom:champinjoner' },
  // Majs: majskorn på burk och frysta i en rad (hel majskolv har en egen).
  { from: 'lagom:majs-farsk-fryst', to: 'lagom:majs-konserverad' },
  // Oliver: gröna och svarta i en rad.
  { from: 'lagom:oliver-svarta', to: 'lagom:oliver-grona' },
  // Inlagd gurka: samlingsvärde för ättiksgurka och smörgåsgurka.
  { from: 'lagom:smorgasgurka', to: 'lagom:attiksgurka' },
  // Pumpa: butternut och hokkaido är de vanliga matpumporna.
  { from: 'lagom:pumpa', to: 'lagom:butternutpumpa' },

  // --- Rotfrukter --------------------------------------------------------------
  // Rödbetor: råa och kokta har samma näringsvärde.
  { from: 'lagom:rodbeta-ra', to: 'lagom:rodbetor-kokta' },
  { from: 'lagom:rattika', to: 'lagom:radisor' },

  // --- Potatis -----------------------------------------------------------------
  // Potatis (kokt): vikten ändras knappt vid kokning, så rå och kokt vikt räknas lika (ingen omräkning).
  { from: 'lagom:potatis-ra', to: 'lagom:potatis-kokt-skalad' },
  { from: 'lagom:potatis-kokt-med-skal', to: 'lagom:potatis-kokt-skalad' },
  { from: 'lagom:potatismos-pulver-tillagat', to: 'lagom:potatismos-hemlagat' },

  // --- Baljväxter --------------------------------------------------------------
  // Torkade baljväxter → den kokta raden med `raw` (gram blir "g torkad").
  { from: 'lagom:bruna-bonor-torkade', to: 'lagom:bruna-bonor-kokta', unit: 'g-ra' },
  { from: 'lagom:gula-artor-torkade', to: 'lagom:gula-artor-kokta', unit: 'g-ra' },
  { from: 'lagom:kikartor-torkade', to: 'lagom:kikartor-kokta', unit: 'g-ra' },
  // Linser: gröna, bruna och röda linser i en rad.
  { from: 'lagom:linser-grona-torkade', to: 'lagom:linser-grona-kokta', unit: 'g-ra' },
  { from: 'lagom:linser-roda-torkade', to: 'lagom:linser-grona-kokta', unit: 'g-ra' },
  { from: 'lagom:linser-roda-kokta', to: 'lagom:linser-grona-kokta' },
  // Bönor (kokta): kidneybönor, svarta och vita bönor samt mungbönor i en rad (kokta mungbönor har
  // nästan samma näringsvärde som de andra bönorna: 112 kcal och 8,6 g protein per 100 g).
  { from: 'lagom:svarta-bonor-kokta', to: 'lagom:kidneybonor-kokta' },
  { from: 'lagom:vita-bonor-kokta', to: 'lagom:kidneybonor-kokta' },
  { from: 'lagom:mungbonor-kokta', to: 'lagom:kidneybonor-kokta' },
  // Mogna sojabönor har nästan samma näringsvärde som edamame.
  { from: 'lagom:sojabonor-kokta', to: 'lagom:edamame' },
]
