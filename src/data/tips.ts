/**
 * Dagens tips – korta, vänliga och evidensbaserade råd på svenska.
 *
 * Källor: Livsmedelsverkets generella kostråd för vuxna (L 2025 nr 04), Nordiska
 * näringsrekommendationerna 2023 (NNR 2023), Livsmedelsverkets råd om D-vitamin, folsyra och fisk
 * från Östersjön, WHO:s och Folkhälsomyndighetens rekommendationer om fysisk aktivitet samt 1177.
 *
 * Tonen är "lagom": inga förbud, ingen skam, inga bantningsknep. Tips som bara passar vissa
 * delar av året har `seasons` och/eller `months` och visas då bara under den perioden
 * (t.ex. D-vitamin under mörkertiden oktober–mars).
 */
import type { ISODate } from '../types'
import type { Season } from '../lib/season'
import { swedishSeason } from '../lib/season'
import { diffDays, fromISODate } from '../lib/dates'

export type TipCategory = 'naring' | 'kostrad' | 'vanor' | 'svenskt' | 'klimat' | 'somn' | 'medveten' | 'rorelse'

export interface Tip {
  id: string
  category: TipCategory
  /** Kort rubrik. */
  title: string
  /** 1–3 meningar. */
  text: string
  /** Källa att visa i liten text, t.ex. 'Livsmedelsverket'. */
  source?: string
  /** Visas bara under dessa årstider. */
  seasons?: readonly Season[]
  /** Visas bara under dessa månader (1–12). */
  months?: readonly number[]
}

export const TIP_CATEGORIES: Record<TipCategory, { label: string; emoji: string }> = {
  naring: { label: 'Näring', emoji: '🥗' },
  kostrad: { label: 'Kostråd', emoji: '📋' },
  vanor: { label: 'Vanor', emoji: '🔁' },
  svenskt: { label: 'Svensk mat', emoji: '🇸🇪' },
  klimat: { label: 'Klimat', emoji: '🌍' },
  somn: { label: 'Sömn', emoji: '😴' },
  medveten: { label: 'Medveten ätning', emoji: '🧘' },
  rorelse: { label: 'Rörelse', emoji: '🚶' },
}

/** Mörkertiden i Sverige, då huden knappt bildar något D-vitamin. */
const DARK_MONTHS: readonly number[] = [10, 11, 12, 1, 2, 3]

export const TIPS: readonly Tip[] = [
  // --- Näring ----------------------------------------------------------------
  {
    id: 'protein-frukost',
    category: 'naring',
    title: 'Protein till frukost',
    text: 'Ett ägg, en klick kvarg eller keso på mackan gör frukosten mer mättande. Protein hjälper dig att hålla energin uppe fram till lunch.',
  },
  {
    id: 'fibrer',
    category: 'naring',
    title: 'Fibrer mättar',
    text: 'Rekommendationen är minst 25 gram fibrer om dagen för kvinnor och 35 gram för män. Fullkorn, baljväxter, grönsaker, frukt och bär är de bästa källorna.',
    source: 'NNR 2023',
  },
  {
    id: 'jarn-c-vitamin',
    category: 'naring',
    title: 'Järn och C-vitamin',
    text: 'C-vitamin ökar upptaget av järn från växter – paprika, broccoli eller en apelsin till linsgrytan gör skillnad. Te och kaffe till maten minskar upptaget, så ta dem hellre en stund efteråt.',
  },
  {
    id: 'omega-3',
    category: 'naring',
    title: 'Omega-3 från fisk och raps',
    text: 'Lax, sill, makrill och strömming innehåller omega-3-fettsyror. Rapsolja och valnötter är bra växtbaserade källor.',
  },
  {
    id: 'kalcium-vaxtbaserat',
    category: 'naring',
    title: 'Kalcium utan mejeri',
    text: 'Äter du inte mejeriprodukter? Välj växtdrycker och yoghurtalternativ som är berikade med kalcium och D-vitamin.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'b12-vegan',
    category: 'naring',
    title: 'B12 för dig som äter veganskt',
    text: 'Vitamin B12 finns nästan bara i animaliska livsmedel. Äter du veganskt behöver du berikade produkter eller ett tillskott.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'salt-kallor',
    category: 'naring',
    title: 'Saltet gömmer sig',
    text: 'Det mesta saltet kommer från bröd, ost, charkuterier och färdigmat – inte från saltkaret. Rekommendationen är högst 6 gram salt om dagen.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'jodsalt',
    category: 'naring',
    title: 'Välj salt med jod',
    text: 'När du saltar, använd jodberikat salt. Jod behövs för sköldkörteln, och i Sverige har bordssalt berikats med jod sedan 1936.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'farger',
    category: 'naring',
    title: 'Ät regnbågen',
    text: 'Grönsaker i olika färger ger olika vitaminer, mineraler och antioxidanter. Försök få med två eller tre färger på tallriken.',
  },
  {
    id: 'flytande-fett',
    category: 'naring',
    title: 'Välj flytande fetter',
    text: 'Byt gärna smör mot rapsolja eller flytande margarin i matlagningen. Det ger mer omättat fett, som är bra för hjärtat.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'folsyra',
    category: 'naring',
    title: 'Folsyra inför graviditet',
    text: 'Planerar du att bli gravid rekommenderas ett tillskott med 400 mikrogram folsyra om dagen, gärna redan innan graviditeten.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'd-vitamin-morkertid',
    category: 'naring',
    title: 'D-vitamin i mörkertid',
    text: 'Från oktober till mars står solen för lågt i Sverige för att huden ska bilda D-vitamin. Fet fisk, ägg och D-berikade mejeriprodukter, växtdrycker och matfett hjälper.',
    source: 'Livsmedelsverket',
    months: DARK_MONTHS,
  },
  {
    id: 'd-vitamin-tillskott',
    category: 'naring',
    title: 'Behöver du D-tillskott?',
    text: 'Är du 75 år eller äldre rekommenderas ett tillskott med 20 mikrogram D-vitamin om dagen. Har du mörk hud eller är sällan utomhus kan du också behöva tillskott – fråga gärna på vårdcentralen.',
    source: 'Livsmedelsverket',
    months: DARK_MONTHS,
  },
  {
    id: 'd-vitamin-fisk',
    category: 'naring',
    title: 'Fisk mot vintermörkret',
    text: 'Lax, sill, makrill och strömming hör till de bästa D-vitaminkällorna i maten. Fet fisk ett par gånger i veckan gör stor skillnad under vintern.',
    months: DARK_MONTHS,
  },

  // --- Kostråd ---------------------------------------------------------------
  {
    id: 'frukt-gront-500',
    category: 'kostrad',
    title: '500 gram grönt',
    text: 'Ät minst 500 gram grönsaker, frukt och bär om dagen, gärna mer. Det motsvarar ungefär fem nävar.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'baljvaxter',
    category: 'kostrad',
    title: 'Baljväxter ofta',
    text: 'Ät ärter, bönor och linser ofta – gärna varje dag. De ger protein, järn och fibrer och passar både som bas i rätter och som komplement till kött.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'fisk-2-3',
    category: 'kostrad',
    title: 'Fisk två till tre gånger i veckan',
    text: 'Variera mellan fet och mager fisk och skaldjur, och välj gärna miljömärkt.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'rott-kott',
    category: 'kostrad',
    title: 'Lagom med rött kött',
    text: 'Kostråden säger högst 350 gram rött kött i veckan (tillagad vikt) och så lite chark som möjligt. Det räcker gott till två eller tre middagar.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'fullkorn',
    category: 'kostrad',
    title: 'Fullkorn varje dag',
    text: 'Rekommendationen är 90 gram fullkorn om dagen. Havregrynsgröt till frukost, fullkornsbröd till lunch och fullkornspasta till middag tar dig långt.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'notter',
    category: 'kostrad',
    title: 'En liten näve nötter',
    text: '20–30 gram osaltade nötter eller frön om dagen är bra för hjärtat. Strö över gröten, salladen eller ta som mellanmål.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'mejeri',
    category: 'kostrad',
    title: 'Mejeri eller berikade alternativ',
    text: 'Livsmedelsverket rekommenderar 3,5–5 dl mejeriprodukter om dagen, gärna magra, osötade och syrade – eller berikade växtbaserade alternativ.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'mindre-sott',
    category: 'kostrad',
    title: 'Sött som får vara speciellt',
    text: 'Kostråden lyfter läsk, godis, fikabröd och snacks som sådant vi mår bra av att äta mindre av. Njut av dem ibland – de gör sig bäst när de får vara lite speciella.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'nyckelhalet',
    category: 'kostrad',
    title: 'Leta efter Nyckelhålet',
    text: 'Nyckelhålsmärkta livsmedel innehåller mer fullkorn och fibrer eller mindre socker, salt och fett än andra produkter av samma slag.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'alkohol',
    category: 'kostrad',
    title: 'Mindre alkohol är bättre',
    text: 'Det finns ingen nivå av alkohol som är helt riskfri – ju mindre desto bättre. Alkoholfria alternativ blir dessutom allt godare.',
    source: 'NNR 2023',
  },
  {
    id: 'vatten',
    category: 'kostrad',
    title: 'Vatten som törstsläckare',
    text: 'Vatten är den bästa drycken för törsten. Svenskt kranvatten håller hög kvalitet och är både billigt och har mycket lågt klimatavtryck.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'tallriksmodellen',
    category: 'kostrad',
    title: 'Tallriksmodellen',
    text: 'Ungefär två femtedelar grönsaker och rotfrukter, två femtedelar potatis, pasta, ris eller bröd och en femtedel fisk, kött, ägg eller baljväxter. Behöver du mindre energi kan grönsaksdelen vara större.',
    source: 'Livsmedelsverket',
  },
  {
    id: 'hel-frukt',
    category: 'kostrad',
    title: 'Hela frukten',
    text: 'En hel frukt mättar mer än ett glas juice och ger fibrer på köpet.',
  },
  {
    id: 'ostersjofisk',
    category: 'kostrad',
    title: 'Fet fisk från Östersjön',
    text: 'Barn, unga och den som kan bli gravid, är gravid eller ammar bör äta fet fisk från Östersjöområdet, som strömming och vildfångad lax, högst 2–3 gånger per år på grund av miljögifter. Odlad lax och fisk från andra hav går bra.',
    source: 'Livsmedelsverket',
  },

  // --- Vanor -----------------------------------------------------------------
  {
    id: 'regelbundna-maltider',
    category: 'vanor',
    title: 'Regelbundna måltider',
    text: 'Tre huvudmål och ett par mellanmål gör det lättare att undvika stark hunger – då blir det enklare att äta lagom.',
  },
  {
    id: 'veckomeny',
    category: 'vanor',
    title: 'Planera veckan',
    text: 'Skriv en enkel veckomeny och handla efter lista. Det sparar tid och pengar och minskar matsvinnet.',
  },
  {
    id: 'laga-dubbelt',
    category: 'vanor',
    title: 'Laga dubbelt',
    text: 'Laga lite mer till middagen och ta med resten som matlåda. En hemlagad lunch är ofta både godare och billigare.',
  },
  {
    id: 'mellanmal',
    category: 'vanor',
    title: 'Mellanmål som håller',
    text: 'Frukt och nötter, yoghurt med bär eller en fullkornsmacka med ägg håller dig mätt länge och ger energi till eftermiddagen.',
  },
  {
    id: 'handla-matt',
    category: 'vanor',
    title: 'Handla mätt',
    text: 'Det är lättare att hålla sig till inköpslistan när du inte är hungrig i affären.',
  },
  {
    id: 'forbered-gronsaker',
    category: 'vanor',
    title: 'Grönsaksstavar i kylen',
    text: 'Skär morötter, gurka och paprika i stavar när du kommer hem från affären – då blir de det enklaste mellanmålet.',
  },
  {
    id: 'sma-steg',
    category: 'vanor',
    title: 'En sak i taget',
    text: 'En ny vana som du håller i ett par månader gör mer skillnad än en stor förändring som tar slut efter en vecka.',
  },
  {
    id: 'dagbok-utan-krav',
    category: 'vanor',
    title: 'Dagboken är inget betyg',
    text: 'Har du missat att registrera en dag är det bara att fortsätta. Det är helheten över tid som räknas.',
  },
  {
    id: 'veckan-jamnar-ut',
    category: 'vanor',
    title: 'Veckan jämnar ut',
    text: 'En festmiddag eller ett kalas påverkar inte helheten. Det är vad du gör de flesta dagar som spelar roll.',
  },
  {
    id: 'vatten-varme',
    category: 'vanor',
    title: 'Drick mer när det är varmt',
    text: 'I sommarvärmen behöver kroppen mer vätska. Ha en vattenflaska med dig och ät vattenrika livsmedel som gurka och melon.',
    seasons: ['sommar'],
  },

  // --- Svensk mat ------------------------------------------------------------
  {
    id: 'havregrynsgrot',
    category: 'svenskt',
    title: 'Havregrynsgröt',
    text: 'Havre innehåller betaglukaner, fibrer som kan bidra till att sänka kolesterolet. Toppa gröten med bär och en näve nötter.',
  },
  {
    id: 'knackebrod',
    category: 'svenskt',
    title: 'Knäcke av fullkornsråg',
    text: 'Rågknäcke är en svensk fullkornsklassiker. Titta efter högt fiberinnehåll och välj gärna Nyckelhålsmärkt.',
  },
  {
    id: 'fika-lagom',
    category: 'svenskt',
    title: 'Fika lagom',
    text: 'Fika handlar om pausen och gemenskapen. Njut av en kanelbulle i lugn och ro – ibland är en kopp kaffe och ett samtal precis lagom.',
  },
  {
    id: 'rotfrukter',
    category: 'svenskt',
    title: 'Rotfrukternas rikedom',
    text: 'Morötter, kålrot, palsternacka och rödbetor är billiga, fiberrika och håller länge. Ugnsrosta en plåt och ha i kylen hela veckan.',
  },
  {
    id: 'sill',
    category: 'svenskt',
    title: 'Sill är fet fisk',
    text: 'Sill innehåller omega-3 och D-vitamin. Inlagd sill innehåller en del socker – god som en del av måltiden med potatis och rågbröd.',
  },
  {
    id: 'husmanskost',
    category: 'svenskt',
    title: 'Husmanskost i ny tappning',
    text: 'Klassiker som pytt i panna, kålpudding och köttbullar kan göras med mer grönsaker eller baljväxter utan att tappa sin själ.',
  },
  {
    id: 'filmjolk',
    category: 'svenskt',
    title: 'Syrat och svenskt',
    text: 'Filmjölk och yoghurt är svenska vardagsklassiker. Välj gärna osötat och smaksätt själv med bär, frukt eller müsli.',
  },
  {
    id: 'potatis',
    category: 'svenskt',
    title: 'Potatis är bra mat',
    text: 'Potatis är mättande, innehåller C-vitamin och kalium och har låg klimatpåverkan. Koka den gärna med skalet för mer fibrer.',
  },
  {
    id: 'allemansratten',
    category: 'svenskt',
    title: 'Allemansrättens skafferi',
    text: 'Allemansrätten låter dig plocka vilda bär och svamp i skog och mark. Blåbär, lingon och kantareller är gratis, lokala och nyttiga.',
    months: [7, 8, 9],
  },
  {
    id: 'svamp-saker',
    category: 'svenskt',
    title: 'Plocka svamp säkert',
    text: 'Plocka bara svampar du är helt säker på. Ta gärna med en svampkunnig vän eller visa korgen för en svampkonsulent.',
    months: [8, 9, 10],
  },
  {
    id: 'kal',
    category: 'svenskt',
    title: 'Kål – vinterns hjälte',
    text: 'Vitkål, grönkål och brysselkål är svenska vintergrönsaker fulla av C-vitamin och fibrer. Pröva rostad brysselkål eller en krämig grönkålssoppa.',
    seasons: ['host', 'vinter'],
  },
  {
    id: 'sommarbar',
    category: 'svenskt',
    title: 'Svenska sommarbär',
    text: 'Jordgubbar, hallon och blåbär innehåller mycket C-vitamin och lite energi. Frys in en del till vintern.',
    seasons: ['sommar'],
  },
  {
    id: 'varprimorer',
    category: 'svenskt',
    title: 'Vårens primörer',
    text: 'Rabarber, sparris, ramslök och rädisor är vårens första gröna – krispiga, smakrika och fulla av vitaminer.',
    months: [4, 5, 6],
  },

  // --- Klimat ----------------------------------------------------------------
  {
    id: 'sasong',
    category: 'klimat',
    title: 'Ät efter säsong',
    text: 'Svenska råvaror i säsong har ofta lägre klimatpåverkan, smakar mer och är billigare.',
  },
  {
    id: 'titta-lukta-smaka',
    category: 'klimat',
    title: 'Titta, lukta, smaka',
    text: '"Bäst före" betyder ofta bra efter. Använd sinnena innan du slänger – men respektera "sista förbrukningsdag".',
    source: 'Livsmedelsverket',
  },
  {
    id: 'vegodag',
    category: 'klimat',
    title: 'En vegodag i veckan',
    text: 'Byt kött mot bönor, linser eller tofu någon dag i veckan. Det är bra för både hälsan och klimatet – och gott.',
  },
  {
    id: 'restdag',
    category: 'klimat',
    title: 'Restdag',
    text: 'Gör en restdag i veckan: det som finns kvar i kylen blir soppa, pytt, omelett eller paj.',
  },
  {
    id: 'frysen',
    category: 'klimat',
    title: 'Frysen är din vän',
    text: 'Frys in bröd, bär och överbliven mat i portioner. Det blir mindre svinn och snabbare middagar.',
  },
  {
    id: 'kranvatten',
    category: 'klimat',
    title: 'Kranvatten före flaskvatten',
    text: 'Kranvatten har mycket lägre klimatpåverkan än buteljerat vatten och kostar nästan ingenting.',
  },
  {
    id: 'mindre-battre-kott',
    category: 'klimat',
    title: 'Mindre men bättre kött',
    text: 'Äter du kött kan du välja mindre mängd och högre kvalitet, till exempel svenskt naturbeteskött eller vilt.',
  },
  {
    id: 'miljomarkt-fisk',
    category: 'klimat',
    title: 'Välj miljömärkt fisk',
    text: 'Titta efter MSC- eller ASC-märkning när du köper fisk och skaldjur.',
  },

  // --- Sömn ------------------------------------------------------------------
  {
    id: 'somn-hunger',
    category: 'somn',
    title: 'Sömn och hunger',
    text: 'Sömnbrist kan öka hungern och suget efter energität mat. Sju till nio timmars sömn gör det lättare att äta lagom.',
  },
  {
    id: 'skarmfri-kvart',
    category: 'somn',
    title: 'En skärmfri stund',
    text: 'Lägg undan mobilen en stund innan du ska sova. Dämpat ljus hjälper kroppen att ställa in sig på natt.',
  },
  {
    id: 'koffein-kvall',
    category: 'somn',
    title: 'Koffein och sömn',
    text: 'Koffein kan påverka sömnen i många timmar. Drick gärna dagens sista kaffe tidigt på eftermiddagen.',
  },
  {
    id: 'alkohol-somn',
    category: 'somn',
    title: 'Alkohol och sömn',
    text: 'Alkohol kan göra det lättare att somna men försämrar sömnens kvalitet under natten.',
  },
  {
    id: 'dagsljus',
    category: 'somn',
    title: 'Dagsljus i mörkertid',
    text: 'Gå ut en stund mitt på dagen när det är ljust. Dagsljuset hjälper dygnsrytmen – och en lunchpromenad ger rörelse på köpet.',
    months: [11, 12, 1, 2],
  },
  {
    id: 'ljusa-natter',
    category: 'somn',
    title: 'Ljusa nätter',
    text: 'Under sommarens ljusa nätter kan mörkläggningsgardiner eller en sovmask hjälpa dig att sova gott.',
    months: [5, 6, 7],
  },

  // --- Medveten ätning -------------------------------------------------------
  {
    id: 'ata-lugnt',
    category: 'medveten',
    title: 'Ät i lugn och ro',
    text: 'Mättnadssignalerna tar en stund att nå hjärnan. Lägg ner besticken mellan tuggorna och smaka på maten.',
  },
  {
    id: 'hungerskala',
    category: 'medveten',
    title: 'Känn efter',
    text: 'Fråga dig själv före och efter måltiden: hur hungrig är jag på en skala från 1 till 5? Det hjälper dig att äta efter kroppens signaler.',
  },
  {
    id: 'inga-forbud',
    category: 'medveten',
    title: 'Ingen mat är förbjuden',
    text: 'All mat får plats i en balanserad vardag. Att tillåta sig det man tycker om minskar ofta suget.',
  },
  {
    id: 'skarmfri-maltid',
    category: 'medveten',
    title: 'Skärmfri måltid',
    text: 'Ät utan telefon eller tv ibland. Då märker du lättare när du är mätt – och maten smakar mer.',
  },
  {
    id: 'hunger-eller-sug',
    category: 'medveten',
    title: 'Hunger eller sug?',
    text: 'Hunger kommer gradvis och mättas av det mesta. Sug kommer plötsligt och vill ha något särskilt. Båda är okej att lyssna på.',
  },
  {
    id: 'snall-mot-dig',
    category: 'medveten',
    title: 'Var snäll mot dig själv',
    text: 'Hur du pratar med dig själv spelar roll. Byt "jag har misslyckats" mot "det var en dag" – och fortsätt.',
  },
  {
    id: 'njut-favoriter',
    category: 'medveten',
    title: 'Njut av favoriterna',
    text: 'Välj det du verkligen tycker om och ät det med full uppmärksamhet. Det ger mer än att äta något halvbra på autopilot.',
  },
  {
    id: 'hjalp-finns',
    category: 'medveten',
    title: 'Det finns hjälp att få',
    text: 'Om tankar på mat, vikt eller kropp tar mycket kraft finns det hjälp. Kontakta 1177 eller Frisk & Fri – Riksföreningen mot ätstörningar.',
    source: '1177',
  },

  // --- Rörelse ---------------------------------------------------------------
  {
    id: 'rorelse-150',
    category: 'rorelse',
    title: '150 minuter i veckan',
    text: 'Minst 150 minuter måttlig fysisk aktivitet i veckan rekommenderas – drygt 20 minuter om dagen. Rask promenad räknas.',
    source: 'Folkhälsomyndigheten, WHO',
  },
  {
    id: 'styrka-2',
    category: 'rorelse',
    title: 'Styrka två gånger i veckan',
    text: 'Muskelstärkande träning minst två dagar i veckan hjälper dig att behålla muskler och starka skelett, särskilt med stigande ålder.',
    source: 'Folkhälsomyndigheten, WHO',
  },
  {
    id: 'bryt-sittandet',
    category: 'rorelse',
    title: 'Bryt stillasittandet',
    text: 'Res dig och rör på dig en stund då och då. Små avbrott i sittandet är bra för kroppen, även om du tränar.',
    source: 'Folkhälsomyndigheten',
  },
  {
    id: 'promenad-efter-maten',
    category: 'rorelse',
    title: 'Promenad efter maten',
    text: 'En kort promenad efter måltiden kan dämpa blodsockertoppen och är ett skönt sätt att smälta maten.',
  },
  {
    id: 'vardagsmotion',
    category: 'rorelse',
    title: 'All rörelse räknas',
    text: 'Trapporna, cykeln till jobbet eller att kliva av bussen en hållplats tidigare – vardagsmotion gör skillnad.',
  },
  {
    id: 'friluftsliv',
    category: 'rorelse',
    title: 'Inget dåligt väder',
    text: 'Som det heter: det finns inget dåligt väder, bara dåliga kläder. En promenad i skogen ger både rörelse och återhämtning.',
  },
  {
    id: 'vila',
    category: 'rorelse',
    title: 'Vila är också träning',
    text: 'Kroppen blir starkare under återhämtningen. Varva hårda pass med lugna dagar och gott om sömn.',
  },
  {
    id: 'vintermotion',
    category: 'rorelse',
    title: 'Vinterns motion',
    text: 'Längdskidor, skridskor och snöskottning är fin vintermotion – och ute får du dessutom dagsljus.',
    seasons: ['vinter'],
  },
]

// ---------------------------------------------------------------------------
// Urval
// ---------------------------------------------------------------------------

/** Referensdag för den dagliga rotationen (en måndag). */
const EPOCH: ISODate = '2000-01-03'

/** Var n:te dag visas ett säsongstips (om något finns för perioden). */
const SEASONAL_EVERY = 4

const mod = (a: number, n: number) => ((a % n) + n) % n

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Ett steg som är relativt primt med n – ger en rotation som visar alla tips innan något upprepas. */
function strideFor(n: number): number {
  let s = Math.max(1, Math.round(n * 0.618))
  while (gcd(s, n) !== 1) s++
  return s
}

const isSeasonal = (t: Tip) => t.seasons !== undefined || t.months !== undefined

function matches(t: Tip, season: Season, month: number): boolean {
  if (t.seasons && !t.seasons.includes(season)) return false
  if (t.months && !t.months.includes(month)) return false
  return true
}

const GENERAL_TIPS = TIPS.filter((t) => !isSeasonal(t))
const SEASONAL_TIPS = TIPS.filter(isSeasonal)
const GENERAL_STRIDE = strideFor(GENERAL_TIPS.length)

/** Tips som passar en viss årstid och månad (1–12). */
export function tipsForPeriod(season: Season, month: number): Tip[] {
  return TIPS.filter((t) => matches(t, season, month))
}

/**
 * Dagens tips – samma tips hela dagen och för alla användare (deterministiskt per datum).
 *
 * Vanliga tips roteras så att alla visas innan något upprepas. Var fjärde dag visas i stället
 * ett säsongstips om något passar perioden – t.ex. D-vitamin under mörkertiden (oktober–mars),
 * bär och svamp på sensommaren och kål på hösten och vintern.
 * @param season årstid att använda (standard: härleds från datumet)
 */
export function tipForDate(date: ISODate, season?: Season): Tip {
  const day = diffDays(EPOCH, date)
  const month = fromISODate(date).getMonth() + 1
  const s = season ?? swedishSeason(date)
  if (mod(day, SEASONAL_EVERY) === 0) {
    const seasonal = SEASONAL_TIPS.filter((t) => matches(t, s, month))
    if (seasonal.length > 0) return seasonal[mod(Math.floor(day / SEASONAL_EVERY), seasonal.length)]
  }
  return GENERAL_TIPS[mod(day * GENERAL_STRIDE + 7, GENERAL_TIPS.length)]
}

/** Hämta ett tips via id. */
export function tipById(id: string): Tip | undefined {
  return TIPS.find((t) => t.id === id)
}

/** Alla tips i en kategori. */
export function tipsByCategory(category: TipCategory): Tip[] {
  return TIPS.filter((t) => t.category === category)
}
