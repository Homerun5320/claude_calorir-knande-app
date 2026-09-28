/**
 * Alias för borttagna och sammanslagna livsmedel i `../kott-fagel-chark.ts` (Kött, fågel och chark).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const kottFagelCharkAliases: FoodAlias[] = [
  // --- Nötkött och kalv ------------------------------------------------------
  // Nötfärs: en rad för vanlig färs (ca 10–12 %) och en för mager (5 %), båda stekta.
  { from: 'lagom:notfars-5-ra', to: 'lagom:notfars-5-stekt', unit: 'g-ra' },
  { from: 'lagom:notfars-10-ra', to: 'lagom:notfars-12-stekt', unit: 'g-ra' },
  { from: 'lagom:notfars-10-stekt', to: 'lagom:notfars-12-stekt' },
  { from: 'lagom:notfars-12-ra', to: 'lagom:notfars-12-stekt', unit: 'g-ra' },
  { from: 'lagom:notfars-15-20-ra', to: 'lagom:notfars-12-stekt', unit: 'g-ra' },
  { from: 'lagom:notfars-15-20-stekt', to: 'lagom:notfars-12-stekt' },
  { from: 'lagom:entrecote-ra', to: 'lagom:entrecote-stekt', unit: 'g-ra' },
  // Biff: ryggbiff, oxfilé och innanlår (lövbiff, nötstek) i en rad.
  { from: 'lagom:ryggbiff-ra', to: 'lagom:ryggbiff-stekt', unit: 'g-ra' },
  { from: 'lagom:oxfile-ra', to: 'lagom:ryggbiff-stekt', unit: 'g-ra' },
  { from: 'lagom:oxfile-stekt', to: 'lagom:ryggbiff-stekt' },
  { from: 'lagom:notkott-innanlar-ra', to: 'lagom:ryggbiff-stekt', unit: 'g-ra' },
  { from: 'lagom:notstek-innanlar-ugnsstekt', to: 'lagom:ryggbiff-stekt' },
  // Grytbitar av nöt: grytbitar och högrev, kokta eller långkokta.
  { from: 'lagom:hogrev-ra', to: 'lagom:notkott-grytbitar-kokt', unit: 'g-ra' },
  { from: 'lagom:hogrev-langkokt', to: 'lagom:notkott-grytbitar-kokt' },
  { from: 'lagom:notkott-grytbitar-ra', to: 'lagom:notkott-grytbitar-kokt', unit: 'g-ra' },
  { from: 'lagom:lever-not-ra', to: 'lagom:kalvlever-stekt', unit: 'g-ra' },
  { from: 'lagom:kalvfile-ra', to: 'lagom:kalvfile-stekt', unit: 'g-ra' },
  { from: 'lagom:kalvfars-ra', to: 'lagom:kalvfars-stekt', unit: 'g-ra' },

  // --- Blandfärs och fläskkött ----------------------------------------------
  { from: 'lagom:blandfars-ra', to: 'lagom:blandfars-stekt', unit: 'g-ra' },
  { from: 'lagom:hamburgerbiff-fryst', to: 'lagom:hamburgerbiff', unit: 'g-ra' },
  { from: 'lagom:flaskfars-ra', to: 'lagom:flaskfars-stekt', unit: 'g-ra' },
  { from: 'lagom:flaskfile-ra', to: 'lagom:flaskfile-stekt', unit: 'g-ra' },
  { from: 'lagom:flaskytterfile-ra', to: 'lagom:flaskytterfile-stekt', unit: 'g-ra' },
  { from: 'lagom:flaskkarre-ra', to: 'lagom:flaskkarre-stekt', unit: 'g-ra' },
  { from: 'lagom:flaskkotlett-ra', to: 'lagom:flaskkotlett-stekt', unit: 'g-ra' },
  // Sidfläsk (stekt fläsk): färskt och rimmat sidfläsk i en rad.
  { from: 'lagom:sidflask-farskt-ratt', to: 'lagom:sidflask-rimmat-stekt', unit: 'g-ra' },
  { from: 'lagom:sidflask-farskt-stekt', to: 'lagom:sidflask-rimmat-stekt' },
  { from: 'lagom:flaskbog-langkokt', to: 'lagom:pulled-pork-bbq' },

  // --- Lamm ------------------------------------------------------------------
  { from: 'lagom:lammfars-ra', to: 'lagom:lammfars-stekt', unit: 'g-ra' },
  { from: 'lagom:lammkotlett-ra', to: 'lagom:lammkotlett-stekt', unit: 'g-ra' },
  { from: 'lagom:lammstek-ra', to: 'lagom:lammstek-ugnsstekt', unit: 'g-ra' },

  // --- Vilt och ren ----------------------------------------------------------
  // Viltkött: älg, rådjur, hjort, vildsvin och ren har nästan samma näringsvärden.
  { from: 'lagom:algstek-ra', to: 'lagom:algstek-ugnsstekt', unit: 'g-ra' },
  { from: 'lagom:radjur-ra', to: 'lagom:algstek-ugnsstekt', unit: 'g-ra' },
  { from: 'lagom:radjur-stekt', to: 'lagom:algstek-ugnsstekt' },
  { from: 'lagom:hjort-ra', to: 'lagom:algstek-ugnsstekt', unit: 'g-ra' },
  { from: 'lagom:renkott-ra', to: 'lagom:algstek-ugnsstekt', unit: 'g-ra' },
  { from: 'lagom:vildsvin-ra', to: 'lagom:algstek-ugnsstekt', unit: 'g-ra' },
  { from: 'lagom:algfars-ra', to: 'lagom:algfars-stekt', unit: 'g-ra' },
  { from: 'lagom:viltfars-ra', to: 'lagom:algfars-stekt', unit: 'g-ra' },
  { from: 'lagom:renskav-ra', to: 'lagom:renskav', unit: 'g-ra' },

  // --- Fågel -----------------------------------------------------------------
  { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' },
  { from: 'lagom:kycklingfile-strimlad-fardig', to: 'lagom:kycklingfile-stekt' },
  { from: 'lagom:kycklinglarfile-ra', to: 'lagom:kycklinglarfile-stekt', unit: 'g-ra' },
  { from: 'lagom:kyckling-hel-ra', to: 'lagom:grillkyckling-med-skinn', unit: 'g-ra' },
  { from: 'lagom:grillkyckling-utan-skinn', to: 'lagom:grillkyckling-med-skinn' },
  { from: 'lagom:kycklingklubbor-ugnsstekta', to: 'lagom:kycklinglar-ugnsstekta' },
  { from: 'lagom:kycklingfars-ra', to: 'lagom:kycklingfars-stekt', unit: 'g-ra' },
  { from: 'lagom:kalkonfile-ra', to: 'lagom:kalkonfile-stekt', unit: 'g-ra' },
  { from: 'lagom:anka-ugnsstekt', to: 'lagom:ankbrost-stekt' },

  // --- Charkuterier ----------------------------------------------------------
  { from: 'lagom:bacon-ratt', to: 'lagom:bacon-stekt', unit: 'g-ra' },
  { from: 'lagom:sidflask-rimmat-ratt', to: 'lagom:sidflask-rimmat-stekt', unit: 'g-ra' },
  { from: 'lagom:julskinka-griljerad', to: 'lagom:julskinka-kokt' },
  { from: 'lagom:skinka-kokt-palagg', to: 'lagom:skinka-rokt-palagg' },
  { from: 'lagom:pastrami-palagg', to: 'lagom:rostbiff-palagg' },
  { from: 'lagom:kalkonpalagg', to: 'lagom:kycklingpalagg' },
  { from: 'lagom:falukorv-stekt', to: 'lagom:falukorv' },
  { from: 'lagom:chorizo-lufttorkad', to: 'lagom:salami' },
  { from: 'lagom:pepperoni', to: 'lagom:salami' },
  { from: 'lagom:salsiccia-ra', to: 'lagom:salsiccia', unit: 'g-ra' },

  // --- Köttbullar ------------------------------------------------------------
  { from: 'lagom:kottbullar-hemlagade', to: 'lagom:kottbullar-fardiga' },
  { from: 'lagom:frikadeller-kokta', to: 'lagom:kottbullar-fardiga' },
]
