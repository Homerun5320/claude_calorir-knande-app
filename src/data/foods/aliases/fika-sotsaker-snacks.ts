/**
 * Alias för borttagna och sammanslagna livsmedel i `../fika-sotsaker-snacks.ts` (Fika, sötsaker och snacks).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * Här finns inga råa rader – alla alias är sammanslagningar till en bredare rad eller ett
 * samlingsvärde, och mängderna behålls som de är.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const fikaSotsakerSnacksAliases: FoodAlias[] = [
  // Bullar och bakverk
  { from: 'lagom:kanelbulle-hembakad', to: 'lagom:kanelbulle-bageri' },
  { from: 'lagom:smulpaj-apple', to: 'lagom:appelpaj-mordeg' },
  { from: 'lagom:gustav-adolfsbakelse', to: 'lagom:napoleonbakelse' },
  { from: 'lagom:muffins-choklad', to: 'lagom:muffins-vanilj' },

  // Småkakor och kex – klassiska småkakor blir "Småkakor"
  { from: 'lagom:drommar', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:kolasnittar', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:havreflarn', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:hallongrottor', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:finska-pinnar', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:mandelmussla', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:kokostoppar', to: 'lagom:smakakor-blandade' },
  { from: 'lagom:digestivekex-choklad', to: 'lagom:kex-chokladkram' },

  // Choklad – samlingsvärden
  { from: 'lagom:marabou-mjolkchoklad', to: 'lagom:mjolkchoklad' },
  { from: 'lagom:marabou-mjolkchoklad-daim', to: 'lagom:mjolkchoklad' },
  { from: 'lagom:mjolkchoklad-hasselnot', to: 'lagom:mjolkchoklad' },
  { from: 'lagom:chokladbar-jordnotter', to: 'lagom:chokladbar-kola-nougat' },
  { from: 'lagom:choklad-kolafyllning', to: 'lagom:chokladbar-kola-nougat' },
  { from: 'lagom:chokladtryffel', to: 'lagom:chokladpraliner' },

  // Godis
  { from: 'lagom:losgodis-sura', to: 'lagom:losgodis-gele' },
  { from: 'lagom:losgodis-skum', to: 'lagom:losgodis-gele' },
  { from: 'lagom:ahlgrens-bilar', to: 'lagom:losgodis-gele' },
  { from: 'lagom:skumgodis-chokladdoppat', to: 'lagom:losgodis-choklad' },
  { from: 'lagom:saltlakrits', to: 'lagom:lakrits-sot' },
  { from: 'lagom:chokladkola', to: 'lagom:kola-mjuk' },
  { from: 'lagom:knack', to: 'lagom:kola-mjuk' },

  // Sirap och sylt
  { from: 'lagom:sirap-mork', to: 'lagom:sirap-ljus' },
  { from: 'lagom:lingon-rarorda', to: 'lagom:lingonsylt' },
  { from: 'lagom:hallonsylt', to: 'lagom:jordgubbssylt' },

  // Glass
  { from: 'lagom:vaniljglass', to: 'lagom:graddglass-vanilj' },
  { from: 'lagom:chokladglass', to: 'lagom:graddglass-vanilj' },
  { from: 'lagom:pinnglass-notter-kola', to: 'lagom:pinnglass-chokladoverdrag' },
  { from: 'lagom:pinnglass-sorbet-vanilj', to: 'lagom:isglass-fruktis' },

  // Snacks – chips och popcorn blir samlingsvärden
  { from: 'lagom:chips-grill', to: 'lagom:chips-lattsaltade' },
  { from: 'lagom:chips-sourcream-onion', to: 'lagom:chips-lattsaltade' },
  { from: 'lagom:chips-pressade', to: 'lagom:chips-lattsaltade' },
  { from: 'lagom:popcorn-olja-saltade', to: 'lagom:popcorn-micro' },
]
