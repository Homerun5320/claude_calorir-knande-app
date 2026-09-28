/**
 * Alias för borttagna och sammanslagna livsmedel i `../brod-spannmal.ts` (Bröd och spannmål).
 *
 * En rad per gammalt id som inte längre finns: { from: gammalt id, to: ersättarens id }. Ersätts en
 * rå/okokt rad av den tillagade raden (som har `rawWeight`), ange `unit: 'g-ra'` så att gamla
 * mängder i gram tolkas som rå vikt. Båda id:na skrivs fullständigt med prefixet 'lagom:'.
 *
 * @example { from: 'lagom:kycklingfile-ra', to: 'lagom:kycklingfile-stekt', unit: 'g-ra' }
 */
import type { FoodAlias } from '../../../types'

export const brodSpannmalAliases: FoodAlias[] = [
  // --- Knäckebröd, skorpor och mjuka kakor -----------------------------------
  // Knäckebröd: samlingsvärde för rågknäckebröd. Id:t 'knackebrod-wasa-husman' behålls för
  // samlingsposten eftersom exempeldatan (demo.ts) använder det.
  { from: 'lagom:knackebrod-rag-fullkorn', to: 'lagom:knackebrod-wasa-husman' },
  { from: 'lagom:knackebrod-wasa-sport', to: 'lagom:knackebrod-wasa-husman' },
  { from: 'lagom:knackebrod-leksands-runda', to: 'lagom:knackebrod-wasa-husman' },
  { from: 'lagom:knackebrod-rag-brungraddat', to: 'lagom:knackebrod-wasa-husman' },
  { from: 'lagom:knackebrod-finn-crisp-original', to: 'lagom:knackebrod-wasa-husman' },
  // Skorpor: grova skorpor och rostade småbröd (Krisprolls) i en rad.
  { from: 'lagom:skorpor-fullkorn', to: 'lagom:skorpor-vete' },
  { from: 'lagom:skorpor-smabrod-rostade', to: 'lagom:skorpor-vete' },
  { from: 'lagom:tekaka', to: 'lagom:honokaka' },
  // Polarkaka: samma värden som mjukt tunnbröd (portionen "1 kaka" finns som "1 rund mjuk kaka").
  { from: 'lagom:polarkaka-mjuk', to: 'lagom:tunnbrod-mjukt' },

  // --- Matbröd ---------------------------------------------------------------
  { from: 'lagom:formfranska-rostad', to: 'lagom:formfranska' },
  { from: 'lagom:formbrod-fullkorn', to: 'lagom:fullkornsbrod' },
  { from: 'lagom:grovt-brod-lingon', to: 'lagom:fullkornsbrod' },
  // Rågbröd: danskt rågbröd, rågsurdeg och rågkusar i en rad.
  { from: 'lagom:ragbrod-danskt', to: 'lagom:ragbrod-fullkorn' },
  { from: 'lagom:surdegsbrod-rag', to: 'lagom:ragbrod-fullkorn' },
  { from: 'lagom:ragkusar', to: 'lagom:ragbrod-fullkorn' },
  { from: 'lagom:tortilla-fullkorn', to: 'lagom:tortilla-vete' },

  // --- Gryn, flingor, müsli --------------------------------------------------
  { from: 'lagom:fiberhavregryn', to: 'lagom:havregryn' },
  // Cornflakes (samlingsvärde): även risflingor och ris- och veteflingor.
  { from: 'lagom:puffat-ris-flingor', to: 'lagom:cornflakes' },
  { from: 'lagom:flingor-ris-vete', to: 'lagom:cornflakes' },
  // Sötade flingor (samlingsvärde): Kalaspuffar, Frosties, Coco Pops …
  { from: 'lagom:majsflingor-sockrade', to: 'lagom:puffat-vete-sotat' },
  { from: 'lagom:chokladflingor', to: 'lagom:puffat-vete-sotat' },
  // Fullkornsflingor (samlingsvärde): Havrefras, havreflakes, Weetabix, All-Bran.
  { from: 'lagom:havreflakes', to: 'lagom:havrefras' },
  { from: 'lagom:vetekakor-fullkorn', to: 'lagom:havrefras' },
  { from: 'lagom:fiberflingor-vetekli', to: 'lagom:havrefras' },
  { from: 'lagom:musli-osotad', to: 'lagom:musli-sotad' },

  // --- Mjöl ------------------------------------------------------------------
  { from: 'lagom:vetemjol-special', to: 'lagom:vetemjol' },
  { from: 'lagom:dinkelmjol-fullkorn', to: 'lagom:dinkelmjol-siktat' },

  // --- Pasta och nudlar (torr vara → kokt rad med "g okokt") -----------------
  { from: 'lagom:pasta-vete-torr', to: 'lagom:pasta-vete-kokt', unit: 'g-ra' },
  { from: 'lagom:makaroner-torra', to: 'lagom:pasta-vete-kokt', unit: 'g-ra' },
  { from: 'lagom:makaroner-kokta', to: 'lagom:pasta-vete-kokt' },
  { from: 'lagom:lasagneplattor-torra', to: 'lagom:pasta-vete-kokt', unit: 'g-ra' },
  { from: 'lagom:pasta-fullkorn-torr', to: 'lagom:pasta-fullkorn-kokt', unit: 'g-ra' },
  { from: 'lagom:pasta-glutenfri-torr', to: 'lagom:pasta-glutenfri-kokt', unit: 'g-ra' },
  { from: 'lagom:pasta-farsk-agg-okokt', to: 'lagom:pasta-farsk-agg-kokt', unit: 'g-ra' },
  { from: 'lagom:tortellini-ost-okokt', to: 'lagom:tortellini', unit: 'g-ra' },
  { from: 'lagom:pasta-roda-linser-torr', to: 'lagom:pasta-roda-linser-kokt', unit: 'g-ra' },
  // Nudlar: äggnudlar och risnudlar i en rad.
  { from: 'lagom:aggnudlar-torra', to: 'lagom:aggnudlar-kokta', unit: 'g-ra' },
  { from: 'lagom:risnudlar-torra', to: 'lagom:aggnudlar-kokta', unit: 'g-ra' },
  { from: 'lagom:risnudlar-kokta', to: 'lagom:aggnudlar-kokta' },
  // Snabbnudlar anges som de säljs (torra, per paket). Den gamla raden gällde tillagade nudlar med
  // vattnet (1 paket på 85 g blev 485 g), så gamla gram och dl räknas om till torr vikt och
  // "1 portion" blir "1 paket".
  { from: 'lagom:snabbnudlar-tillagade', to: 'lagom:snabbnudlar-okokta', scale: 85 / 485, density: 1 },

  // --- Ris (torrt → kokt rad med "g okokt") ----------------------------------
  // Vitt ris: långkornigt, jasmin, basmati, parboiled, arborio och vildris i en rad.
  { from: 'lagom:ris-langkornigt-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:ris-jasmin-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:ris-jasmin-kokt', to: 'lagom:ris-langkornigt-kokt' },
  { from: 'lagom:ris-basmati-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:ris-basmati-kokt', to: 'lagom:ris-langkornigt-kokt' },
  { from: 'lagom:ris-parboiled-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:ris-parboiled-kokt', to: 'lagom:ris-langkornigt-kokt' },
  { from: 'lagom:ris-arborio-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:ris-arborio-kokt', to: 'lagom:ris-langkornigt-kokt' },
  { from: 'lagom:vildris-torrt', to: 'lagom:ris-langkornigt-kokt', unit: 'g-ra' },
  { from: 'lagom:vildris-kokt', to: 'lagom:ris-langkornigt-kokt' },
  { from: 'lagom:ris-fullkorn-torrt', to: 'lagom:ris-fullkorn-kokt', unit: 'g-ra' },

  // --- Övriga gryn (torra → kokt rad med "g okokt") --------------------------
  { from: 'lagom:bulgur-torr', to: 'lagom:bulgur-kokt', unit: 'g-ra' },
  { from: 'lagom:couscous-torr', to: 'lagom:couscous-tillagad', unit: 'g-ra' },
  // Pärlcouscous är pasta – kokt pärlcouscous har ungefär samma energi som kokt pasta (couscous är
  // vattnigare). Gamla volymer räknas med pärlcouscousens egen densitet.
  { from: 'lagom:parlcouscous-torr', to: 'lagom:pasta-vete-kokt', unit: 'g-ra', density: 0.75 },
  { from: 'lagom:parlcouscous-kokt', to: 'lagom:pasta-vete-kokt', density: 0.7 },
  { from: 'lagom:quinoa-torr', to: 'lagom:quinoa-kokt', unit: 'g-ra' },
  { from: 'lagom:matvete-torrt', to: 'lagom:matvete-kokt', unit: 'g-ra' },
  { from: 'lagom:korngryn-torra', to: 'lagom:korngryn-kokta', unit: 'g-ra' },
  { from: 'lagom:hirs-torr', to: 'lagom:hirs-kokt', unit: 'g-ra' },
  { from: 'lagom:bovete-torrt', to: 'lagom:bovete-kokt', unit: 'g-ra' },
  { from: 'lagom:polenta-torr', to: 'lagom:polenta-kokt', unit: 'g-ra' },
]
