/**
 * Alias för borttagna och sammanslagna livsmedel i `../mejeri-agg.ts` (Mejeri och ägg).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * Inga mejeri- eller äggrader har `rawWeight` – rått och kokt ägg har samma näringsvärden, så
 * mängderna behålls oförändrade.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const mejeriAggAliases: FoodAlias[] = [
  // Mjölk: ekologisk mjölk har samma värden, minimjölk räknas som lättmjölk.
  { from: 'lagom:mjolk-standard-3-eko', to: 'lagom:mjolk-standard-3' },
  { from: 'lagom:mjolk-mellan-1-5-eko', to: 'lagom:mjolk-mellan-1-5' },
  { from: 'lagom:mjolk-mini-0-1', to: 'lagom:mjolk-latt-0-5' },
  { from: 'lagom:mjolkdryck-laktosfri-0-5', to: 'lagom:mjolkdryck-laktosfri-1-5' },
  { from: 'lagom:getmjolk', to: 'lagom:mjolk-standard-3' },

  // Fil och yoghurt: varianter med samma värden delar rad, smaksatt blir samlingsvärde.
  { from: 'lagom:filmjolk-laktosfri-3', to: 'lagom:filmjolk-3' },
  { from: 'lagom:a-fil-3', to: 'lagom:filmjolk-3' },
  { from: 'lagom:langfil-3', to: 'lagom:filmjolk-3' },
  { from: 'lagom:filmjolk-smaksatt', to: 'lagom:yoghurt-frukt-2' },
  { from: 'lagom:yoghurt-mild-3', to: 'lagom:yoghurt-naturell-3' },
  { from: 'lagom:yoghurt-naturell-laktosfri-3', to: 'lagom:yoghurt-naturell-3' },
  { from: 'lagom:yoghurt-grekisk-10', to: 'lagom:yoghurt-turkisk-10' },
  { from: 'lagom:yoghurt-vanilj-2', to: 'lagom:yoghurt-frukt-2' },
  { from: 'lagom:yoghurt-grekisk-silad-2', to: 'lagom:yoghurt-protein-smak' },
  { from: 'lagom:yoghurt-protein-naturell', to: 'lagom:yoghurt-protein-smak' },

  // Kvarg: sockersötad och sötningsmedelssötad kvarg med smak blir ett samlingsvärde.
  { from: 'lagom:kvarg-smak-sockersotad', to: 'lagom:kvarg-vanilj-sotningsmedel' },

  // Grädde, crème fraiche och mjölkpulver.
  { from: 'lagom:vispgradde-laktosfri-36', to: 'lagom:vispgradde-40' },
  { from: 'lagom:matlagningsgradde-laktosfri-15', to: 'lagom:matlagningsgradde-15' },
  { from: 'lagom:matlagningsgradde-13', to: 'lagom:matlagningsgradde-15' },
  { from: 'lagom:smetana-20', to: 'lagom:creme-fraiche-15' },
  { from: 'lagom:mjolkpulver-helmjolk', to: 'lagom:mjolkpulver-skummjolk' },
  { from: 'lagom:kondenserad-mjolk-osotad', to: 'lagom:matlagningsgradde-15' },

  // Hårdost: lagrade ostar med 28–31 % fett blir ett samlingsvärde, edamer räknas som hushållsost.
  { from: 'lagom:prastost-31', to: 'lagom:greve-28' },
  { from: 'lagom:herrgardsost-28', to: 'lagom:greve-28' },
  { from: 'lagom:vasterbottensost-31', to: 'lagom:greve-28' },
  { from: 'lagom:svecia-28', to: 'lagom:greve-28' },
  { from: 'lagom:kryddost-28', to: 'lagom:greve-28' },
  { from: 'lagom:gouda', to: 'lagom:greve-28' },
  { from: 'lagom:emmentaler', to: 'lagom:greve-28' },
  { from: 'lagom:gruyere', to: 'lagom:greve-28' },
  { from: 'lagom:manchego', to: 'lagom:greve-28' },
  { from: 'lagom:getost-hard', to: 'lagom:greve-28' },
  { from: 'lagom:edamer', to: 'lagom:hushallsost-26' },
  { from: 'lagom:grana-padano', to: 'lagom:parmesan' },
  { from: 'lagom:pecorino-romano', to: 'lagom:parmesan' },

  // Övriga ostar.
  { from: 'lagom:camembert', to: 'lagom:brie' },
  { from: 'lagom:burrata', to: 'lagom:mozzarella-farsk' },
  { from: 'lagom:salladsost', to: 'lagom:fetaost' },
  { from: 'lagom:gorgonzola', to: 'lagom:adelost' },
  { from: 'lagom:farskost-vitlok-orter', to: 'lagom:farskost-naturell' },
  { from: 'lagom:riven-ost-pizzaost', to: 'lagom:riven-ost-gratangost' },
  { from: 'lagom:mjukost-rakor', to: 'lagom:mjukost-naturell' },
  { from: 'lagom:mjukost-skinka', to: 'lagom:mjukost-naturell' },
  { from: 'lagom:messmor-latt-2', to: 'lagom:messmor' },

  // Ägg: kokt och rått ägg har samma värden och samma portioner (1 ägg = 50 g).
  { from: 'lagom:agg-kokt', to: 'lagom:agg-ratt' },
  { from: 'lagom:ankagg', to: 'lagom:agg-ratt' },
]
