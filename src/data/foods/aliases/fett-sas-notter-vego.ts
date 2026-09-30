/**
 * Alias för borttagna och sammanslagna livsmedel i `../fett-sas-notter-vego.ts` (Fett, såser, nötter och vego).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * Ersättarna har samma portions-id som de gamla raderna ('portion:msk', 'portion:forp' …), så att
 * sparade portioner fortsätter att fungera.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const fettSasNotterVegoAliases: FoodAlias[] = [
  // Matfett och oljor: varianter med samma värden delar rad, matfettsblandningar går till margarin
  // med samma fetthalt.
  { from: 'lagom:smor-osaltat-82', to: 'lagom:smor-normalsaltat-82' },
  { from: 'lagom:matfettsblandning-60', to: 'lagom:margarin-bord-60' },
  { from: 'lagom:matfettsblandning-40', to: 'lagom:margarin-latt-39' },
  { from: 'lagom:rapsolja-kallpressad', to: 'lagom:rapsolja' },

  // Kalla såser och dressingar: färre, vanliga typer.
  { from: 'lagom:majonnas-vegansk', to: 'lagom:majonnas-80' },
  { from: 'lagom:aioli', to: 'lagom:majonnas-80' },
  { from: 'lagom:rhode-island-dressing', to: 'lagom:salladsdressing-fardig' },
  { from: 'lagom:caesardressing', to: 'lagom:salladsdressing-fardig' },

  // Ketchup, senap, asiatiska såser och chili.
  { from: 'lagom:ketchup-utan-socker', to: 'lagom:ketchup' },
  { from: 'lagom:senap-skansk', to: 'lagom:senap-mild-svensk' },
  { from: 'lagom:senap-fransk', to: 'lagom:senap-dijon' },
  { from: 'lagom:senap-grovkornig', to: 'lagom:senap-dijon' },
  { from: 'lagom:tamari', to: 'lagom:sojasas' },
  { from: 'lagom:ostronsas', to: 'lagom:teriyakisas' },
  { from: 'lagom:chilisas-stark-tunn', to: 'lagom:srirachasas' },
  { from: 'lagom:sambal-oelek', to: 'lagom:srirachasas' },
  { from: 'lagom:salsa-tomat', to: 'lagom:tacosas' },

  // Nötter och frön: en rad per nöt eller frö.
  { from: 'lagom:cashewnotter-rostade-saltade', to: 'lagom:cashewnotter-naturella' },
  { from: 'lagom:jordnotter-naturella', to: 'lagom:jordnotter-rostade-saltade' },
  { from: 'lagom:linfron-krossade', to: 'lagom:linfron-hela' },
  { from: 'lagom:jordnotssmor-sotat-saltat', to: 'lagom:jordnotssmor-100' },

  // Vego: samlingsvärden per typ. Torkad sojafärs anges nu blötlagd och vegofärs och vegobitar
  // stekta – gamla mängder i gram var torr respektive fryst vikt (även Quorn vägdes fryst).
  { from: 'lagom:tofu-rokt', to: 'lagom:tofu-naturell' },
  { from: 'lagom:sojaprotein-torkat', to: 'lagom:sojafars-blotlagd', unit: 'g-ra' },
  { from: 'lagom:vegofars-fryst', to: 'lagom:vegofars-stekt', unit: 'g-ra' },
  { from: 'lagom:mykoprotein-fars', to: 'lagom:sojabitar-frysta', unit: 'g-ra' },

  // Växtdrycker och växtbaserade yoghurtar: en rad per typ.
  { from: 'lagom:havredryck-ekologisk', to: 'lagom:havredryck-berikad-1-5' },
  { from: 'lagom:sojadryck-osotad', to: 'lagom:sojadryck-original' },
  { from: 'lagom:mandeldryck-osotad', to: 'lagom:mandeldryck-original' },
  { from: 'lagom:havreyoghurt-vanilj', to: 'lagom:havreyoghurt-naturell' },

  // Kosttillskott.
  { from: 'lagom:proteinpulver-vassle-isolat', to: 'lagom:proteinpulver-vassle' },
]
