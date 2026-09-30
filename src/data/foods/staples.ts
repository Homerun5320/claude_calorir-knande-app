/**
 * Basvaror per vardagligt sökord – "det mest grundläggande kommer alltid först".
 *
 * När hela sökningen är ett av orden nedan (efter normalisering i `lib/search`, även utan å/ä/ö och
 * i böjd form: "kycklingar", "tomater", "bullar") visas livsmedlen i listan först, i angiven
 * ordning – före sammansatta rätter och oavsett personlig användning. Övriga träffar följer efter.
 *
 * Ordningen: det vanligaste och mest grundläggande först (tillagat, naturellt och samlingsvärden
 * före varianter). Id:n måste finnas i `BUILTIN_FOODS` – kontrolleras i `staples.test.ts`.
 *
 * Modulen är liten och importerar ingen livsmedelsdata, så att sökningen kan använda den direkt.
 */

const KYCKLING = [
  'lagom:kycklingfile-stekt',
  'lagom:kycklinglarfile-stekt',
  'lagom:grillkyckling-med-skinn',
  'lagom:kycklingfars-stekt',
  'lagom:kycklinglar-ugnsstekta',
  'lagom:kycklingvingar-ugnsstekta',
  'lagom:kycklingschnitzel',
  'lagom:pulled-chicken',
  'lagom:kycklingkottbullar-fardiga',
  'lagom:kycklingkorv',
  'lagom:kycklingpalagg',
]

const NOT = [
  'lagom:notfars-12-stekt',
  'lagom:ryggbiff-stekt',
  'lagom:notkott-grytbitar-kokt',
  'lagom:entrecote-stekt',
  'lagom:notfars-5-stekt',
  'lagom:blandfars-stekt',
  'lagom:rostbiff-palagg',
  'lagom:oxbringa-rimmad-kokt',
]

const FLASK = [
  'lagom:flaskfile-stekt',
  'lagom:flaskkotlett-stekt',
  'lagom:flaskfars-stekt',
  'lagom:flaskkarre-stekt',
  'lagom:kassler',
  'lagom:bacon-stekt',
  'lagom:sidflask-rimmat-stekt',
  'lagom:flaskytterfile-stekt',
  'lagom:revbensspjall-ugnsstekta',
  'lagom:pulled-pork-bbq',
  'lagom:skinka-rokt-palagg',
]

const MJOLK = [
  'lagom:mjolk-standard-3',
  'lagom:mjolk-mellan-1-5',
  'lagom:mjolk-latt-0-5',
  'lagom:mjolkdryck-laktosfri-1-5',
  'lagom:mjolkdryck-laktosfri-3',
  'lagom:mjolk-ohomogeniserad-4',
]

const FIL = ['lagom:filmjolk-3', 'lagom:filmjolk-1-5', 'lagom:filmjolk-0-5', 'lagom:karnmjolk-0-5', 'lagom:kefir-naturell']

const AGG = [
  'lagom:agg-ratt',
  'lagom:agg-stekt',
  'lagom:aggrora',
  'lagom:omelett-naturell',
  'lagom:aggula-ra',
  'lagom:aggvita-ra',
  'lagom:vaktelagg',
]

/**
 * Sökord (gemener, med å/ä/ö) → livsmedels-id i prioritetsordning. Böjningsformer och stavning
 * utan å/ä/ö hanteras av sökningen – lägg bara till ett ord här när det betyder något annat.
 */
export const STAPLE_FOODS: Readonly<Record<string, readonly string[]>> = {
  // Kött och fågel
  kyckling: KYCKLING,
  kött: [
    'lagom:notfars-12-stekt',
    'lagom:blandfars-stekt',
    'lagom:ryggbiff-stekt',
    'lagom:notkott-grytbitar-kokt',
    'lagom:entrecote-stekt',
    'lagom:flaskfile-stekt',
    'lagom:flaskkotlett-stekt',
    'lagom:kalvfile-stekt',
    'lagom:lammstek-ugnsstekt',
    'lagom:algstek-ugnsstekt',
  ],
  nöt: NOT,
  nötkött: NOT,
  färs: [
    'lagom:notfars-12-stekt',
    'lagom:blandfars-stekt',
    'lagom:flaskfars-stekt',
    'lagom:kycklingfars-stekt',
    'lagom:notfars-5-stekt',
    'lagom:lammfars-stekt',
    'lagom:kalvfars-stekt',
    'lagom:algfars-stekt',
    'lagom:vegofars-stekt',
    'lagom:sojafars-blotlagd',
  ],
  köttfärs: ['lagom:notfars-12-stekt', 'lagom:blandfars-stekt', 'lagom:notfars-5-stekt', 'lagom:flaskfars-stekt'],
  gris: FLASK,
  fläsk: FLASK,
  lamm: ['lagom:lammstek-ugnsstekt', 'lagom:lammkotlett-stekt', 'lagom:lammfars-stekt'],
  kalkon: ['lagom:kalkonfile-stekt', 'lagom:kycklingpalagg'],
  korv: [
    'lagom:falukorv',
    'lagom:grillkorv',
    'lagom:varmkorv-wienerkorv',
    'lagom:prinskorv',
    'lagom:falukorv-latt',
    'lagom:kycklingkorv',
    'lagom:chorizo-matlagning',
    'lagom:isterband',
    'lagom:salami',
    'lagom:vegokorv',
  ],
  pålägg: [
    'lagom:skinka-rokt-palagg',
    'lagom:kycklingpalagg',
    'lagom:rostbiff-palagg',
    'lagom:leverpastej',
    'lagom:salami',
    'lagom:hushallsost-26',
    'lagom:kaviar-smorgas',
    'lagom:medwurst',
    'lagom:lufttorkad-skinka',
  ],

  // Fisk och skaldjur
  fisk: [
    'lagom:torsk-kokt',
    'lagom:lax-odlad-ugnsbakad',
    'lagom:sej-ugnsbakad',
    'lagom:fiskfile-panerad-fryst',
    'lagom:fiskpinnar-frysta',
    'lagom:makrill',
    'lagom:tonfisk-vatten',
    'lagom:sill-inlagd',
    'lagom:regnbage-roding',
    'lagom:insjofisk',
    'lagom:stromming',
  ],
  lax: ['lagom:lax-odlad-ugnsbakad', 'lagom:lax-varmrokt', 'lagom:lax-kallrokt', 'lagom:lax-gravad', 'lagom:lax-konserv-rosa'],
  torsk: ['lagom:torsk-kokt', 'lagom:fiskfile-panerad-fryst'],
  räkor: ['lagom:rakor-kokta-skalade', 'lagom:jatterakor'],

  // Mejeri och ägg
  ägg: AGG,
  // "ägg" utan å/ä/ö (korta ord viks inte automatiskt, se `lib/search`).
  agg: AGG,
  mjölk: MJOLK,
  fil: FIL,
  filmjölk: FIL,
  yoghurt: [
    'lagom:yoghurt-naturell-3',
    'lagom:yoghurt-naturell-0-5',
    'lagom:yoghurt-turkisk-10',
    'lagom:yoghurt-frukt-2',
    'lagom:yoghurt-frukt-latt',
    'lagom:yoghurt-protein-smak',
    'lagom:drickyoghurt-smak',
  ],
  kvarg: ['lagom:kvarg-naturell', 'lagom:kvarg-vanilj-sotningsmedel', 'lagom:kvarg-10', 'lagom:skyr-naturell'],
  ost: [
    'lagom:hushallsost-26',
    'lagom:greve-28',
    'lagom:hushallsost-latt-17',
    'lagom:hardost-10',
    'lagom:riven-ost-gratangost',
    'lagom:cheddar',
    'lagom:parmesan',
    'lagom:mozzarella-farsk',
    'lagom:fetaost',
    'lagom:halloumi',
    'lagom:farskost-naturell',
    'lagom:mjukost-naturell',
    'lagom:brie',
    'lagom:cottage-cheese-4',
  ],
  smör: ['lagom:smor-normalsaltat-82', 'lagom:bregott-normalsaltat-75', 'lagom:margarin-bord-60', 'lagom:margarin-latt-39', 'lagom:ghee-skirat-smor'],
  grädde: [
    'lagom:vispgradde-40',
    'lagom:matlagningsgradde-15',
    'lagom:mellangradde-27',
    'lagom:kaffegradde-12',
    'lagom:graddfil-12',
    'lagom:creme-fraiche-34',
    'lagom:havregradde-matlagning-13',
  ],

  // Bröd, gryn, pasta, ris och potatis
  bröd: [
    'lagom:fullkornsbrod',
    'lagom:formfranska',
    'lagom:ragbrod-fullkorn',
    'lagom:grovt-brod-froer',
    'lagom:limpa-sirap',
    'lagom:surdegsbrod-vete',
    'lagom:knackebrod-wasa-husman',
    'lagom:fralla-ljus',
    'lagom:fralla-grov',
    'lagom:baguette',
    'lagom:tunnbrod-mjukt',
  ],
  knäckebröd: ['lagom:knackebrod-wasa-husman', 'lagom:knackebrod-wasa-frukost', 'lagom:froknacke-hembakat', 'lagom:knackebrod-glutenfritt'],
  gröt: [
    'lagom:havregrynsgrot-vatten',
    'lagom:havregrynsgrot-mellanmjolk',
    'lagom:snabbgrot',
    'lagom:overnight-oats',
    'lagom:risgrynsgrot-mellanmjolk',
    'lagom:mannagrynsgrot-mellanmjolk',
  ],
  havregryn: ['lagom:havregryn', 'lagom:havregrynsgrot-vatten', 'lagom:havregrynsgrot-mellanmjolk', 'lagom:overnight-oats'],
  flingor: ['lagom:havrefras', 'lagom:cornflakes', 'lagom:puffat-vete-sotat', 'lagom:ragflingor', 'lagom:musli-sotad', 'lagom:granola'],
  pasta: [
    'lagom:pasta-vete-kokt',
    'lagom:pasta-fullkorn-kokt',
    'lagom:pasta-farsk-agg-kokt',
    'lagom:pasta-glutenfri-kokt',
    'lagom:pasta-roda-linser-kokt',
    'lagom:tortellini',
  ],
  ris: ['lagom:ris-langkornigt-kokt', 'lagom:ris-fullkorn-kokt', 'lagom:ris-grotris-torrt'],
  potatis: [
    'lagom:potatis-kokt-skalad',
    'lagom:farskpotatis-kokt',
    'lagom:bakpotatis',
    'lagom:potatismos-hemlagat',
    'lagom:klyftpotatis-ugnsbakad',
    'lagom:potatis-stekt',
    'lagom:pommes-frites-ugnsbakade',
    'lagom:hasselbackspotatis',
    'lagom:sotpotatis',
  ],

  // Baljväxter och vego
  bönor: [
    'lagom:kidneybonor-kokta',
    'lagom:bruna-bonor-kokta',
    'lagom:vita-bonor-tomatsas',
    'lagom:bondbonor',
    'lagom:edamame',
    'lagom:bruna-bonor-stuvade',
  ],
  linser: ['lagom:linser-grona-kokta'],
  kikärtor: ['lagom:kikartor-kokta', 'lagom:hummus-naturell'],
  tofu: ['lagom:tofu-naturell', 'lagom:tofu-silken'],
  havredryck: ['lagom:havredryck-berikad-1-5', 'lagom:havredryck-barista-3'],

  // Frukt, bär och grönt
  frukt: ['lagom:apple-med-skal', 'lagom:banan', 'lagom:apelsin', 'lagom:paron', 'lagom:clementin', 'lagom:vindruvor', 'lagom:kiwi'],
  äpple: ['lagom:apple-med-skal', 'lagom:appelmos-osotat', 'lagom:appelmos-sotat', 'lagom:appeljuice'],
  banan: ['lagom:banan'],
  apelsin: ['lagom:apelsin', 'lagom:apelsinjuice'],
  bär: [
    'lagom:blabar-skogs',
    'lagom:hallon',
    'lagom:jordgubbar',
    'lagom:lingon',
    'lagom:barmix-fryst',
    'lagom:vinbar-svarta',
    'lagom:vinbar-roda',
    'lagom:bjornbar',
    'lagom:krusbar',
    'lagom:hjortron',
  ],
  grönsaker: [
    'lagom:broccoli',
    'lagom:morot',
    'lagom:tomat',
    'lagom:gurka',
    'lagom:sallad-blandad',
    'lagom:paprika-rod',
    'lagom:gronsaker-frysta',
  ],
  tomat: ['lagom:tomat', 'lagom:korsbarstomat', 'lagom:krossade-tomater', 'lagom:soltorkade-tomater-olja', 'lagom:tomatpure'],
  gurka: ['lagom:gurka', 'lagom:attiksgurka', 'lagom:pressgurka'],
  sallad: ['lagom:sallad-blandad', 'lagom:blandsallad', 'lagom:ruccola', 'lagom:spenat-farsk'],
  morot: ['lagom:morot'],
  lök: ['lagom:lok-gul', 'lagom:purjolok', 'lagom:salladslok', 'lagom:vitlok', 'lagom:schalottenlok', 'lagom:rostad-lok'],
  broccoli: ['lagom:broccoli'],
  avokado: ['lagom:avokado', 'lagom:guacamole'],
  nötter: [
    'lagom:notmix-naturell',
    'lagom:mandel-naturell',
    'lagom:cashewnotter-naturella',
    'lagom:jordnotter-rostade-saltade',
    'lagom:hasselnotter',
    'lagom:valnotter',
    'lagom:pistagenotter-rostade-saltade',
    'lagom:studentskagg',
  ],

  // Drycker
  kaffe: [
    'lagom:kaffe-bryggt',
    'lagom:kaffe-med-mjolk',
    'lagom:espresso',
    'lagom:caffe-latte-mellanmjolk',
    'lagom:cappuccino-mellanmjolk',
    'lagom:snabbkaffe-tillrett',
    'lagom:kaffe-koffeinfritt',
    'lagom:kaffe-med-havredryck',
  ],
  te: ['lagom:te-svart-bryggt', 'lagom:orte-bryggt', 'lagom:chai-latte-mellanmjolk', 'lagom:matcha-latte-mellanmjolk', 'lagom:iste-sotat'],
  juice: ['lagom:apelsinjuice', 'lagom:appeljuice', 'lagom:multivitaminjuice', 'lagom:tomatjuice'],
  öl: ['lagom:ol-starkol-lager-5', 'lagom:ol-folkol-3-5', 'lagom:ol-lattol-2-2', 'lagom:ol-alkoholfri', 'lagom:ol-ipa-6-5', 'lagom:ol-porter-stout'],
  vin: [
    'lagom:vin-rott',
    'lagom:vin-vitt-torrt',
    'lagom:vin-rose',
    'lagom:vin-mousserande-torrt',
    'lagom:vin-alkoholfritt',
    'lagom:glogg-vinglogg',
    'lagom:starkvin-portvin',
  ],
  läsk: ['lagom:lask-sockersotad', 'lagom:lask-sockerfri', 'lagom:cola-coca-cola-original', 'lagom:cola-coca-cola-zero'],

  // Sött och fika
  choklad: [
    'lagom:mjolkchoklad',
    'lagom:mork-choklad-70',
    'lagom:chokladbar-kola-nougat',
    'lagom:kexchoklad',
    'lagom:vit-choklad',
    'lagom:mork-choklad-blockchoklad',
    'lagom:losgodis-choklad',
    'lagom:chokladmjolk-pulver-mellanmjolk',
  ],
  godis: [
    'lagom:losgodis-blandat',
    'lagom:losgodis-gele',
    'lagom:losgodis-choklad',
    'lagom:lakrits-sot',
    'lagom:kola-mjuk',
    'lagom:naturgodis',
  ],
  glass: [
    'lagom:graddglass-vanilj',
    'lagom:glass-latt',
    'lagom:pinnglass-chokladoverdrag',
    'lagom:glasstrut-choklad-notter',
    'lagom:mjukglass',
    'lagom:isglass-fruktis',
    'lagom:glass-vegansk-havre',
    'lagom:sorbet',
  ],
  bulle: [
    'lagom:kanelbulle-bageri',
    'lagom:kardemummabulle-bageri',
    'lagom:vaniljbulle',
    'lagom:minibulle-kanel-forpackad',
    'lagom:semla',
    'lagom:lussekatt',
  ],
  kaka: [
    'lagom:smakakor-blandade',
    'lagom:cookies-chokladbitar',
    'lagom:kladdkaka',
    'lagom:sockerkaka',
    'lagom:chokladboll',
    'lagom:karleksmums',
    'lagom:mjuk-pepparkaka',
    'lagom:pepparkakor',
    'lagom:mariekex',
  ],
}
