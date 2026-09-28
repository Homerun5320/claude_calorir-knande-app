/**
 * Alias för borttagna och sammanslagna livsmedel i `../fardigratter-snabbmat.ts` (Färdigrätter och snabbmat).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * Här finns inga råa rader – alla alias är sammanslagningar av nästan likadana rätter, eller tallrikar
 * med tillbehör som nu räknas som rätten plus tillbehören var för sig (portionen följer ersättaren).
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const fardigratterSnabbmatAliases: FoodAlias[] = [
  // Husmanskost
  { from: 'lagom:pytt-i-panna-agg-rodbetor', to: 'lagom:pytt-i-panna' },
  { from: 'lagom:raggmunk-flask-lingon', to: 'lagom:raggmunk' },
  { from: 'lagom:kaldolmar-potatis-grasas', to: 'lagom:kaldolmar' },
  { from: 'lagom:kalpudding-potatis-grasas', to: 'lagom:kaldolmar' },
  // Tallriken med ris har lägre energi per gram än rätten – gamla gram räknas om så att energin
  // blir densamma (187/253 kcal per 100 g). "1 portion" blir en portion korv Stroganoff.
  { from: 'lagom:korv-stroganoff-ris', to: 'lagom:korv-stroganoff', scale: 187 / 253 },
  { from: 'lagom:ugnskorv-potatismos', to: 'lagom:falukorv-potatismos' },
  { from: 'lagom:aggakaka-flask-lingon', to: 'lagom:flaskpannkaka' },
  { from: 'lagom:palt', to: 'lagom:kroppkakor' },
  // Fisk
  { from: 'lagom:panerad-fisk-potatis-remoulad', to: 'lagom:fiskpinnar-potatismos-remoulad' },
  { from: 'lagom:gravlax-hovmastarsas-potatis', to: 'lagom:lax-potatis-hollandaise' },
  { from: 'lagom:surstrommingsklamma', to: 'lagom:sill-potatis-graddfil' },
  // Kycklinggrytor med ris
  { from: 'lagom:kyckling-currysas-ris', to: 'lagom:kycklinggryta-gradde-ris' },
  { from: 'lagom:thaigryta-kyckling-ris', to: 'lagom:kycklinggryta-gradde-ris' },
  { from: 'lagom:tikka-masala-ris', to: 'lagom:kycklinggryta-gradde-ris' },
  // Soppor och sallader
  { from: 'lagom:nasselsoppa-agg', to: 'lagom:gronsakssoppa' },
  { from: 'lagom:potatissallad-vinagrett', to: 'lagom:potatissallad-majonnas' },
  // Vegetariskt
  { from: 'lagom:linsgryta-kokos', to: 'lagom:dal-linsgryta' },
  { from: 'lagom:linsgryta-ris', to: 'lagom:dal-linsgryta' },
  // Gröt – risgrynsgröten finns i brod-spannmal.ts
  { from: 'lagom:risgrynsgrot-mjolk-socker', to: 'lagom:risgrynsgrot-mellanmjolk' },
  // Pizza
  { from: 'lagom:pizza-capricciosa', to: 'lagom:pizza-vesuvio' },
  { from: 'lagom:pizza-hawaii', to: 'lagom:pizza-vesuvio' },
  { from: 'lagom:pizza-calzone', to: 'lagom:pizza-vesuvio' },
  // Kebab, hamburgare och korv
  { from: 'lagom:kebabrulle', to: 'lagom:kebab-pitabrod' },
  { from: 'lagom:hamburgare-enkel', to: 'lagom:cheeseburgare' },
  { from: 'lagom:hamburgare-restaurang-ost', to: 'lagom:dubbel-hamburgare-ost-dressing' },
  { from: 'lagom:korv-med-brod-grillkorv', to: 'lagom:varmkorv-med-brod' },
  // Kyckling: friterade vingar med sås (buffalo wings) har ungefär samma energi som kycklingvingar.
  { from: 'lagom:kycklingvingar-friterade', to: 'lagom:kycklingvingar-ugnsstekta' },
]
