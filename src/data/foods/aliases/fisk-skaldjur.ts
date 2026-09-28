/**
 * Alias för borttagna och sammanslagna livsmedel i `../fisk-skaldjur.ts` (Fisk och skaldjur).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const fiskSkaldjurAliases: FoodAlias[] = [
  // Lax och andra laxfiskar – rå fisk blir tillagad fisk med enheten "g rå".
  { from: 'lagom:lax-odlad-ra', to: 'lagom:lax-odlad-ugnsbakad', unit: 'g-ra' },
  { from: 'lagom:lax-vild-ra', to: 'lagom:lax-odlad-ugnsbakad', unit: 'g-ra' },
  { from: 'lagom:lax-odlad-stekt', to: 'lagom:lax-odlad-ugnsbakad' },
  { from: 'lagom:regnbage-odlad-ra', to: 'lagom:regnbage-roding', unit: 'g-ra' },
  { from: 'lagom:roding-odlad-ra', to: 'lagom:regnbage-roding', unit: 'g-ra' },
  { from: 'lagom:regnbage-varmrokt', to: 'lagom:lax-varmrokt' },
  { from: 'lagom:sik-ra', to: 'lagom:insjofisk', unit: 'g-ra' },
  { from: 'lagom:sik-varmrokt', to: 'lagom:insjofisk' },
  { from: 'lagom:laxrom', to: 'lagom:lojrom' },

  // Vit fisk: torsk och andra magra arter delar rad, alaska pollock räknas som sej.
  { from: 'lagom:torsk-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:torsk-stekt', to: 'lagom:torsk-kokt' },
  { from: 'lagom:kolja-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:kummel-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:langa-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:rodspatta-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:piggvar-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:sjotunga-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:marulk-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:havskatt-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:pangasius-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:tilapia-ra', to: 'lagom:torsk-kokt', unit: 'g-ra' },
  { from: 'lagom:sej-ra', to: 'lagom:sej-ugnsbakad', unit: 'g-ra' },
  { from: 'lagom:alaska-pollock-ra', to: 'lagom:sej-ugnsbakad', unit: 'g-ra' },
  { from: 'lagom:torsk-panerad-stekt', to: 'lagom:fiskfile-panerad-fryst' },
  { from: 'lagom:torsk-friterad', to: 'lagom:fiskfile-panerad-fryst' },
  { from: 'lagom:halleflundra-ra', to: 'lagom:halleflundra', unit: 'g-ra' },
  { from: 'lagom:blahalleflundra-ra', to: 'lagom:halleflundra', unit: 'g-ra' },
  { from: 'lagom:havsabborre-odlad-ra', to: 'lagom:havsabborre', unit: 'g-ra' },

  // Insjöfisk
  { from: 'lagom:abborre-ra', to: 'lagom:insjofisk', unit: 'g-ra' },
  { from: 'lagom:gos-ra', to: 'lagom:insjofisk', unit: 'g-ra' },
  { from: 'lagom:gadda-ra', to: 'lagom:insjofisk', unit: 'g-ra' },

  // Sill och strömming (samma art – strömming är sill från Östersjön)
  { from: 'lagom:stromming-ra', to: 'lagom:stromming', unit: 'g-ra' },
  { from: 'lagom:sill-ra', to: 'lagom:stromming', unit: 'g-ra' },
  { from: 'lagom:stromming-stekt-inlagd', to: 'lagom:stromming-stekt' },
  { from: 'lagom:matjessill', to: 'lagom:sill-inlagd' },
  { from: 'lagom:loksill', to: 'lagom:sill-inlagd' },
  { from: 'lagom:sill-gradfilssas', to: 'lagom:senapssill' },
  { from: 'lagom:sardeller-olja', to: 'lagom:ansjovis-skarpsill' },

  // Makrill och tonfisk
  { from: 'lagom:makrill-ra', to: 'lagom:makrill', unit: 'g-ra' },
  { from: 'lagom:tonfisk-farsk', to: 'lagom:farsk-tonfisk', unit: 'g-ra' },

  // Beredda fiskprodukter och rom
  { from: 'lagom:fiskbullar-dillsas', to: 'lagom:fiskbullar-hummersas' },
  { from: 'lagom:fiskbullar-buljong', to: 'lagom:fiskbullar-hummersas' },
  { from: 'lagom:torskrom-kokt', to: 'lagom:lojrom' },

  // Skaldjur
  { from: 'lagom:rakor-kokta-med-skal', to: 'lagom:rakor-kokta-skalade' },
  { from: 'lagom:rakor-i-lake', to: 'lagom:rakor-kokta-skalade' },
  { from: 'lagom:jatterakor-raa', to: 'lagom:jatterakor', unit: 'g-ra' },
  { from: 'lagom:kraftstjartar-lake', to: 'lagom:kraftor-kokta' },
  { from: 'lagom:havskraftor-kokta', to: 'lagom:hummer-kokt' },
  { from: 'lagom:kungskrabba-kokt', to: 'lagom:krabba-kokt' },
  { from: 'lagom:pilgrimsmusslor-raa', to: 'lagom:pilgrimsmusslor', unit: 'g-ra' },
  { from: 'lagom:blackfisk-kalmar-ra', to: 'lagom:blackfisk-attaarmad-kokt', unit: 'g-ra' },
]
