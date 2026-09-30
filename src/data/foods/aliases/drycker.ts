/**
 * Alias för borttagna och sammanslagna livsmedel i `../drycker.ts` (Drycker).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * Drycker har inga rå rader – här slås bara varianter och märkesprodukter ihop till vardagsbegrepp
 * och samlingsvärden. Portionsenheter ('portion:burk', 'portion:kopp' …) slås upp på ersättaren,
 * som därför har samma portions-id där det går.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const dryckerAliases: FoodAlias[] = [
  // Vatten
  { from: 'lagom:mineralvatten-ramlosa-naturell', to: 'lagom:vatten-kolsyrat' },

  // Kaffe: kokkaffe och americano har samma värden som bryggkaffe; flat white och cortado ingår i
  // cappuccino (egna portioner); cappuccino med havredryck ingår i latte med havredryck.
  { from: 'lagom:kaffe-kokkaffe', to: 'lagom:kaffe-bryggt' },
  { from: 'lagom:americano', to: 'lagom:kaffe-bryggt' },
  { from: 'lagom:flat-white', to: 'lagom:cappuccino-mellanmjolk' },
  { from: 'lagom:cortado', to: 'lagom:cappuccino-mellanmjolk' },
  { from: 'lagom:cappuccino-havredryck', to: 'lagom:caffe-latte-havredryck' },

  // Te: grönt te och te med en skvätt mjölk ingår i "Te".
  { from: 'lagom:te-gront-bryggt', to: 'lagom:te-svart-bryggt' },
  { from: 'lagom:te-med-mjolk', to: 'lagom:te-svart-bryggt' },

  // Chokladdrycker: vispgrädden registreras separat.
  { from: 'lagom:varm-choklad-vispgradde', to: 'lagom:chokladmjolk-pulver-mellanmjolk' },

  // Energidrycker: märken och smaker → två samlingsvärden. Portionen 'burk' är 50 cl på
  // "Energidryck" (som förut) men 33 cl på den sockerfria. Gamla burkar som var mindre eller större
  // (Red Bull 25 cl, Monster Ultra 50 cl) går till motsvarande burk via `legacy-portions.ts`
  // ('burk-25', 'burk-50'); 35,5 cl-burken ('burk-355') finns kvar.
  { from: 'lagom:energidryck-red-bull', to: 'lagom:energidryck-sockersotad' },
  { from: 'lagom:energidryck-monster-original', to: 'lagom:energidryck-sockersotad' },
  { from: 'lagom:energidryck-red-bull-sockerfri', to: 'lagom:energidryck-sockerfri' },
  { from: 'lagom:energidryck-monster-ultra', to: 'lagom:energidryck-sockerfri' },
  { from: 'lagom:energidryck-nocco-bcaa', to: 'lagom:energidryck-sockerfri' },

  // Läsk: märken och smaker → läsk med socker, sockerfri läsk, cola och sockerfri cola.
  { from: 'lagom:cola-pepsi-max', to: 'lagom:cola-coca-cola-zero' },
  { from: 'lagom:lask-apelsin', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:lask-citron', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:trocadero', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:pommac', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:sockerdricka', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:champis', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:ginger-ale', to: 'lagom:lask-sockersotad' },
  { from: 'lagom:julmust-sockerfri', to: 'lagom:lask-sockerfri' },
  { from: 'lagom:paskmust', to: 'lagom:julmust' },

  // Saft och fruktdrycker
  { from: 'lagom:flaederblomssaft-utspadd', to: 'lagom:saft-utspadd-bar' },
  { from: 'lagom:lingondricka', to: 'lagom:saft-utspadd-bar' },
  { from: 'lagom:tranbarsdryck', to: 'lagom:saftdryck-fardig' },

  // Juice och smoothie
  { from: 'lagom:appelmust', to: 'lagom:appeljuice' },
  { from: 'lagom:grapefruktjuice', to: 'lagom:apelsinjuice' },
  { from: 'lagom:ananasjuice', to: 'lagom:multivitaminjuice' },
  { from: 'lagom:smoothie-gron-fardig', to: 'lagom:smoothie-frukt-bar-fardig' },

  // Öl och cider
  { from: 'lagom:ol-veteol', to: 'lagom:ol-starkol-lager-5' },
  { from: 'lagom:ol-julol', to: 'lagom:ol-porter-stout' },
  { from: 'lagom:cider-torr', to: 'lagom:cider-sot-4-5' },

  // Vin
  { from: 'lagom:vin-vitt-halvtorrt', to: 'lagom:vin-vitt-torrt' },
  { from: 'lagom:dessertvin-sott', to: 'lagom:starkvin-portvin' },

  // Sprit: ren sprit ca 40 % har samma värden oavsett sort.
  { from: 'lagom:gin-40', to: 'lagom:vodka-40' },
  { from: 'lagom:whisky-40', to: 'lagom:vodka-40' },
  { from: 'lagom:rom-40', to: 'lagom:vodka-40' },
  { from: 'lagom:tequila-38', to: 'lagom:vodka-40' },
  { from: 'lagom:konjak-brandy-40', to: 'lagom:vodka-40' },

  // Drinkar: sprit med läsk (moscow mule, mojito) ingår i grogg.
  { from: 'lagom:drink-moscow-mule', to: 'lagom:drink-sprit-cola' },
  { from: 'lagom:drink-mojito', to: 'lagom:drink-sprit-cola' },
]
