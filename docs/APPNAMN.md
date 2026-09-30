# Är namnet "Lagom" ledigt?

Kontroll av appnamnet, butiksnamnen, varumärken och domäner. **Alla kontroller gjordes
2026-09-29.** Varje påstående har en källa (Kn) i [källförteckningen](#källförteckning), där
datumet också står.

> **Det här är ingen juridisk rådgivning.** Det är en genomgång av det som går att se offentligt,
> skriven för att du ska kunna fatta beslut och veta vad du själv behöver kontrollera. Vill du ha
> ett säkert besked om varumärken behövs en riktig varumärkessökning (se [avsnitt 8](#8-det-här-gör-du-själv)).

## Kort svar

| Fråga | Svar | Hur säkert |
| --- | --- | --- |
| Kan appen heta **"Lagom"** under ikonen? | **Ja.** Namnet under ikonen behöver inte vara unikt i någon av butikerna. Det är redan satt så i appen. | Säkert |
| Kan butiksnamnet vara bara **"Lagom"** i App Store? | **Troligen inte.** Det finns minst två appar som heter Lagom/LAGOM i App Store. | Ganska säkert – du får det definitiva svaret när du skapar appen i App Store Connect |
| Kan butiksnamnet vara **"Lagom – kaloriräknaren"** (22 tecken)? | **Troligen ja.** Ingen app med det namnet hittades. | Osäkert – butikerna kunde inte sökas direkt härifrån |
| Finns det ett registrerat varumärke **LAGOM** för appar eller kost i Sverige/EU? | **Inget hittades**, men varumärkesdatabaserna gick inte att söka direkt härifrån. | **Osäkert – det här måste du kontrollera själv** (gratis, cirka 30 minuter) |
| Är domänen **lagomappen.se** ledig? | **Sannolikt ja.** Den finns inte i .se-zonen. | Hög, men inte helt säker (se [avsnitt 5](#5-domäner)) |
| Är **lagom.se**, **lagom.app**, **lagom.nu** och **lagom.com** lediga? | **Nej**, de är registrerade. | Säkert (lagom.com: mycket sannolikt) |

**Rekommendation:** behåll **"Lagom"** under ikonen, använd **"Lagom – kaloriräknaren"** som
butiksnamn i både App Store och Google Play (så står det redan i [APP-STORE.md](APP-STORE.md) och
[GOOGLE-PLAY.md](GOOGLE-PLAY.md)), och **registrera lagomappen.se nu** – den matchar app-id:t
`se.lagomappen.lagom` och ger en naturlig supportadress (`support@lagomappen.se`). Gör sedan den
kostnadsfria varumärkessökningen i [avsnitt 8](#8-det-här-gör-du-själv) innan namnet sprids.

---

## 1. Så gjordes kontrollen – och vad som inte gick

- **App Store, Google Play och varumärken:** från utvecklingsmiljön spärrade nätet
  `itunes.apple.com` (iTunes Search API), `apps.apple.com`, `play.google.com`, EUIPO (eSearch),
  TMview, WIPO Global Brand Database, PRV, `rdap.iis.se` och whois. Uppgifterna om appar och
  varumärken kommer därför från **webbsökning** (sökmotorns index av butikssidorna och
  varumärkessajterna). Listorna nedan är alltså **inte fullständiga** – en app eller ett varumärke
  som sökmotorn inte har indexerat syns inte.
- **Domäner:** egna DNS-uppslag mot Google Public DNS (8.8.8.8) och Cloudflare (1.1.1.1).
  Svaret NXDOMAIN tillsammans med toppdomänens egen SOA-post (för .se:
  `catcher-in-the-rye.nic.se`) betyder att namnet **inte finns i zonen**. Ägaruppgifter (RDAP/whois)
  gick inte att hämta.
- Länkarna i [avsnitt 8](#8-det-här-gör-du-själv) är samma sökningar – du kan köra dem själv i
  webbläsaren på några minuter och få de fullständiga svaren.

## 2. App Store

### Reglerna

- Namnet i App Store får vara 2–30 tecken ([K1](#k1)). Apple kräver ett unikt namn och inga
  inklämda varumärken, appnamn eller priser i metadata (riktlinje 2.3.7, [K2](#k2)).
- I praktiken stoppar App Store Connect ett namn som redan används av en annan app ("The app
  name you entered is already being used") ([K3](#k3), [K4](#k4)). Apple dokumenterar inte exakt hur
  det fungerar mellan olika utvecklare, och det verkar gälla **per språk (lokalisering)**: att det
  finns både "Lagom" och "LAGOM" från olika utvecklare ([K5](#k5), [K6](#k6)) tyder på det.
- Den som har ett **registrerat varumärke** kan begära att Apple frigör ett namn som blockeras av en
  annan app (formuläret *App Name Dispute*, [K7](#k7)). Omvänt kan en varumärkesinnehavare använda
  samma väg mot dig.
- Namnet under ikonen (`CFBundleDisplayName`, i Lagom `Lagom`) är skilt från butiksnamnet och
  behöver inte vara unikt ([K4](#k4)).

### Appar som heter Lagom eller liknande (webbsökning 2026-09-29)

| Namn i App Store | Utvecklare | Vad det är / kategori | Källa |
| --- | --- | --- | --- |
| **Lagom** | V.S.D. Alimentos y Bebidas E.I.R.L. (Peru) | Skolmåltider för familjer: menyer, ätna måltider, saldo. Mat och dryck | [K5](#k5) |
| **LAGOM** | School Today LLC | Förskolor i Charkiv (Ukraina) | [K6](#k6) |
| Lagom · Screen Time Control | Ushaar Hoomans Private Limited | Skärmtid. I vissa länder heter den nu "Slow Time Club · Screen Limits App" | [K8](#k8) |
| Lagom - AI Interior Design | – | Inredning med AI | [K9](#k9) |
| LagomVPN — VPN without ads | LAGOM PRODUCTS LLC | VPN | [K10](#k10) |
| Lagom Terrace, Lagom Kitchen & Bar | – | Restauranger (beställning) | [K11](#k11) |
| Lagom SA | – | Kafé (finns i svenska App Store) | [K12](#k12) |
| Lagom varmt | Vasakronan | Inomhusklimat (svenska App Store) | [K13](#k13) |
| (utvecklarnamnet) Lagom | "Lagom" | Rehab at home, BitCRM, ARM APP m.fl. – inte appnamn | [K14](#k14) |

**Hittades inte** (webbsökning, osäkert): "Lagom – kaloriräknare(n)", "Lagom kalorier", "Ät
lagom", "Lagom mat" – och ingen kaloriräknare eller kostdagbok som heter Lagom ([K15](#k15)). De
svenska kaloriapparna i App Store heter bl.a. MyFitnessPal: Kaloriräknare, Lifesum: Kaloriräknare
med AI, Kaloriräknaren av fatsecret och Kaloriräknare: räkna kalorier ([K15](#k15)). Ordet
"kaloriräknare(n)" är alltså allmänt beskrivande och används av flera – det är just därför det
är "Lagom" som bär namnet.

**Slutsats App Store:** bara "Lagom" är med stor sannolikhet blockerat åtminstone i de språk
som apparna ovan använder, och kanske i svenskan. "Lagom – kaloriräknaren" (22 tecken) har
ingen känd krock. Det definitiva beskedet får du när du skapar appen i App Store Connect
([APP-STORE.md §3](APP-STORE.md#3-skapa-appen-i-app-store-connect)) – då reserveras också namnet.

## 3. Google Play

- Google Play kräver **inte** unika appnamn. Titeln får vara högst 30 tecken ([K16](#k16)), och
  titel, ikon och utvecklarnamn får inte ge sken av koppling till ett annat företag, en annan app
  eller organisation (*Impersonation*, [K17](#k17)). Förväxling kan alltså leda till klagomål, men
  inte till att namnet är "upptaget".
- Appar som heter Lagom eller liknande (webbsökning 2026-09-29):

| Namn i Google Play | Paket / utvecklare | Vad det är | Källa |
| --- | --- | --- | --- |
| **Lagom** | `com.lagom.app`, VSD Alimentos y Bebidas E.I.R.L. | Samma skolmåltidsapp som i App Store (uppdaterad 21 augusti 2025) | [K18](#k18) |
| **Lagom** | `com.makane.lagomsa` | Troligen kaféet Lagom SA | [K18](#k18) |
| Lagom: Fast VPN Proxy | `com.lagomproductsllc.lagomvpn` | VPN | [K18](#k18) |
| Lagom: Simple Money Tracker | `coin.io` | Privatekonomi, "made in Sweden by one person" | [K19](#k19) |
| Lagom Fitness | `com.trainerize.lagomfitness` | PT-app för en tränare (via Trainerize) | [K20](#k20) |
| (utvecklaren) Lagom Apps | – | – | [K14](#k14) |

**Slutsats Google Play:** ingen av dem är en kaloriräknare eller kostdagbok. Närmast i ämnet är
skolmåltidsappen (spansktalande familjer i Peru) – annan målgrupp och annan funktion.
Risken för klagomål bedöms som låg, särskilt med titeln "Lagom – kaloriräknaren" och en egen
ikon.

## 4. Varumärken

### Vad som hittades (webbsökning 2026-09-29)

| Märke | Innehavare | Varor/tjänster | Område | Källa |
| --- | --- | --- | --- | --- |
| LAGOM (reg. 6846977) | Lagom, LLC | Klass 42 m.fl.: programvara/SaaS för frakt och logistik | USA | [K21](#k21) |
| LAGOM (reg. 5531350) | Torrin Vineyard LLC | Vin | USA | [K22](#k22) |
| LAGOM (reg. 5865651) | Ross Newville m.fl. | – | USA | [K22](#k22) |
| LAGOM (ans. 97632387) | Sheng-Ta Saws Co., Ltd | – | USA | [K22](#k22) |
| Ytterligare LAGOM-märken (bl.a. kosmetik och belysning) | Olika | – | USA | [K22](#k22) |
| Lätt & Lagom® | Arla Foods | Matfett | Sverige | [K23](#k23) |

- Varumärken är **territoriella**: de amerikanska registreringarna gäller inte i Sverige. De visar
  bara att ordet är populärt som märke i helt andra branscher.
- **Inget registrerat LAGOM för appar, programvara, kost- eller hälsotjänster i Sverige eller EU
  hittades** – men EUIPO:s, TMview:s, WIPO:s och PRV:s databaser gick inte att söka härifrån, så
  det är den stora osäkerheten i den här rapporten.
- Många företag heter något med Lagom, t.ex. Lagom AB (org.nr 559387-8696, en helt annan bransch),
  och hitta.se ger 35 träffar på "Lagom AB" bara i Stockholm ([K24](#k24), [K25](#k25)). Ett företagsnamn
  är inte samma sak som ett varumärke för appar, men visar hur vanligt ordet är.

### IKEA och LAGOM

- IKEA har använt LAGOM i hållbarhetsprogrammet **Live LAGOM** i Storbritannien (tillsammans med
  miljöorganisationen Hubbub) och i en "Lagom Collection" 2019
  ([K26](#k26), [K27](#k27), [K28](#k28)).
- Någon registrering av LAGOM för IKEA (Inter IKEA Systems B.V.) hittades **inte** i
  webbsökningen – sök på innehavaren "Inter IKEA Systems" och ordet "lagom" i TMview för att vara
  säker.
- IKEA försvarar sina varumärken aktivt, ända upp till EU-domstolen (mål C-298/23 om "IKEA-PLAN",
  dom 8 september 2026 – datumet enligt sökresultatet, kontrollera det på curia.europa.eu,
  [K29](#k29)). Det målet gällde märket IKEA och dess utseende, inte ordet lagom.

### Bedömning i klartext (inte juridisk rådgivning)

1. **Risken att någon kan stoppa "Lagom" som appnamn i Sverige: låg till måttlig – preliminärt.**
   Ordet är ett vanligt svenskt ord som många använder i olika branscher, och inget märke för appar
   eller kost hittades. Det som skulle ändra bedömningen är ett registrerat LAGOM (eller något
   mycket likt) i **klass 9, 42 eller 44** som gäller i Sverige eller EU. Därför är sökningen i
   [avsnitt 8](#8-det-här-gör-du-själv) det viktigaste du gör.
2. **Att själv få ensamrätt till ordet LAGOM är svårt.** För en kaloriräknare kan "lagom" (lagom
   mycket mat) uppfattas som beskrivande, och ett beskrivande ord utan särskiljningsförmåga kan
   nekas registrering ([K30](#k30)). Ett figurmärke (ordet plus logga) är mer realistiskt men skyddar
   främst loggan. Du behöver **ingen** registrering för att lansera – den skyddar dig bara mot
   andra.
3. **IKEA:** låg risk så länge appen inte liknar IKEA (versaler "LAGOM", blått och gult,
   IKEA:s typsnitt) eller antyder en koppling. Lagoms nuvarande utseende (Fraunces, granngrönt)
   är långt från det.
4. **Arlas Lätt & Lagom®** ([K23](#k23)) är ett sammansatt märke för matfett (klass 29), inte för
   appar eller tjänster – låg risk. Använd inte "Lätt & Lagom" i marknadsföringen; i appen finns
   det bara som sökord för produkten.
5. **Om en krock ändå dyker upp efter lanseringen:** butiksnamnet och namnet under ikonen kan
   bytas i en ny version. App-id:t (`se.lagomappen.lagom`) syns inte för användarna och behöver
   inte ändras, och användarnas dagböcker påverkas inte. Det kostar främst arbete med nya texter,
   kanske en ny ikon – och det namn som användarna redan har lärt sig.

### Klasserna som berör Lagom

| Klass | Omfattar (förenklat) | Relevans för Lagom |
| --- | --- | --- |
| 9 | Nedladdningsbar programvara, appar | **Hög** – själva appen |
| 42 | Programvarutjänster, SaaS, webbappar | **Hög** – webbversionen |
| 44 | Kostrådgivning, hälso- och sjukvårdstjänster | **Hög** – kost och näring |
| 41 | Utbildning, träning, underhållning | Medel – kostråd som information |
| 35 | Reklam, företagstjänster, detaljhandel | Låg – bara om du säljer varor |

PRV förklarar klasserna och hur du väljer varor och tjänster i [K31](#k31).

## 5. Domäner

DNS-uppslag 2026-09-29 mot 8.8.8.8 och 1.1.1.1 ([K32](#k32)).

| Domän | Status | Hur säkert | Detaljer |
| --- | --- | --- | --- |
| **lagomappen.se** | **Sannolikt ledig** | Hög | NXDOMAIN från .se-zonen |
| lagom-appen.se | Sannolikt ledig | Hög | NXDOMAIN |
| lagomapp.se | Sannolikt ledig | Hög | NXDOMAIN |
| lagom-app.se | Sannolikt ledig | Hög | NXDOMAIN |
| atlagom.se | Sannolikt ledig | Hög | NXDOMAIN |
| ätlagom.se (`xn--tlagom-9ta.se`) | Sannolikt ledig | Hög | NXDOMAIN |
| lagomkalori.se, lagomkalorier.se | Sannolikt lediga | Hög | NXDOMAIN |
| lagomdagbok.se, lagomdagboken.se, lagomkost.se, lagommat.se | Sannolikt lediga | Hög | NXDOMAIN |
| lagomappen.nu, lagomappen.com, lagomappen.eu, lagomappen.app | Sannolikt lediga | Hög | NXDOMAIN i respektive zon |
| **lagom.se** | **Registrerad** | Säkert | Namnservrar hos Loopia |
| lagomhalsa.se | Registrerad | Säkert | Namnservrar hos Loopia |
| matlagom.se | Registrerad | Säkert | One.com, med e-post |
| **lagom.app** | **Registrerad** | Säkert | Namnservrar hos Namecheap (registrar-servers.com), e-postvidarebefordran |
| getlagom.app | Registrerad | Säkert | Används av anteckningsappen "Lagom Notes" ([K33](#k33)) |
| lagom-app.com | Registrerad | Säkert | Används av en AI-assistent för tidsplanering som heter Lagom ([K33](#k33)) |
| lagomapp.com | Registrerad, **troligen till salu** | Säkert registrerad | Namnservrar hos domänmarknaden Afternic |
| lagom.nu | Registrerad | Säkert | One.com |
| lagom.eu, lagom.io, lagom.health | Registrerade | Säkert | Egen e-post/namnservrar |
| lagom.com | Registrerad | Mycket sannolikt | Uppslaget gav inte NXDOMAIN utan inget svar från domänens namnservrar |

**Varför "sannolikt" och inte "säkert" ledig:** .se-zonen innehåller bara domäner som har
namnservrar ([K34](#k34)). En domän som är registrerad utan namnservrar, eller som har gått ut och är
**deaktiverad** (tas bort ur zonen i 60 dagar innan den hamnar i karantän och frisläpps,
[K35](#k35)), ger också NXDOMAIN. Kontrollera därför i Internetstiftelsens sökning
([K36](#k36)) eller hos registraren precis innan du köper – den säger direkt om namnet går att
registrera.

**Kostnad:** en .se-domän kostar ungefär 150–360 kr per år beroende på återförsäljare (t.ex.
Binero cirka 149 kr, Loopia cirka 159 kr; jämför förnyelsepriset, inte bara första året). Av det går
en grundavgift på 92 kr per år till Internetstiftelsen ([K37](#k37), [K38](#k38)). Lista över återförsäljare: [K39](#k39).

## 6. App-id:t `se.lagomappen.lagom` och domänen

- **Id:t kräver ingen domän.** Apple: omvända domännamn är bara ett bekvämt format, du behöver inte
  kontrollera domänen ([K40](#k40)). Google Play kräver bara att paketnamnet är unikt i Play
  ([K41](#k41)). Det står redan så i [NATIVE.md §1](NATIVE.md#1-att-bekräfta-innan-första-uppladdningen).
- **Men konventionen säger att den som har id:t äger domänen.** Om någon annan registrerar
  lagomappen.se senare händer inget tekniskt, men en främmande webbplats på "din" adress kan
  förvirra användare (och i värsta fall användas för bedrägerier i ditt namn). Att registrera
  lagomappen.se för några hundralappar per år tar bort den risken.
- **Domänen gör mer nytta än så:** en riktig supportadress (`support@lagomappen.se`, krävs av
  byggkontrollen via `VITE_SUPPORT_EMAIL`), webbplatsen för `VITE_API_BASE`, och om du senare vill
  att delningslänkar ska öppnas direkt i appen (Universal Links på iPhone) måste en fil ligga på en
  domän som du styr över ([K50](#k50)).
- **Väljer du en annan domän** (t.ex. lagom-appen.se) kan id:t ändå stå kvar – det syns inte för
  användarna. Vill du byta id:t måste det ske **före** första uppladdningen (listan över filer står
  i NATIVE.md §1).
- `server.hostname`, `iosScheme` och `androidScheme` påverkas inte av domänvalet och ska aldrig
  ändras.

## 7. Rekommendation och alternativ

- **Under ikonen:** `Lagom` (redan satt i `capacitor.config.ts`, `Info.plist`,
  `strings.xml` och PWA:ns `short_name`).
- **Butiksnamn:** `Lagom – kaloriräknaren` (22 tecken) i **båda** butikerna. Det ger samma namn
  överallt, bättre sökträffar än bara "Lagom" och undviker krocken i App Store. Vill du kan du först
  pröva `Lagom` i App Store Connect – går det inte, byter du direkt.
- **Domän:** `lagomappen.se` – registrera den nu, innan namnet sprids.

| # | Butiksnamn (tecken) | Känd krock i butikerna | Domän | Domänstatus | Kommentar |
| --- | --- | --- | --- | --- | --- |
| 1 | **Lagom – kaloriräknaren** (22) | Ingen hittad (osäkert) | **lagomappen.se** | Sannolikt ledig | **Rekommenderas.** Redan inskrivet i APP-STORE.md och GOOGLE-PLAY.md. |
| 2 | Lagom: kalori- och matdagbok (28) | Ingen hittad (osäkert) | lagomdagbok.se | Sannolikt ledig | Mjukare – betonar dagboken snarare än räknandet. Nära 30-gränsen. |
| 3 | Lagom – svensk matdagbok (24) | Ingen hittad (osäkert) | lagom-appen.se | Sannolikt ledig | Lyfter det svenska. Bindestreck i domäner sägs lätt fel muntligt. |
| 4 | Lagom kostdagbok (16) | Ingen hittad (osäkert) | lagomkost.se | Sannolikt ledig | Kort och sakligt. |
| 5 | Ät lagom – kaloriräknare (24) | Ingen hittad (osäkert) | atlagom.se / ätlagom.se | Sannolikt lediga | **Avråds:** en uppmaning om hur mycket man ska äta går emot Lagoms icke-dömande ton, och domäner med ä (`xn--tlagom-9ta.se`) krånglar i e-post och länkar. |
| – | Lagom (5) | **Troligen upptaget** i App Store (minst två appar heter så) | lagom.se | **Registrerad** | Fungerar under ikonen och i Google Play, men inte som enda butiksnamn i App Store. |

Undertiteln i App Store (`Svensk mat, näring & kostråd`, 28 tecken) behöver inte vara unik
([K4](#k4)).

## 8. Det här gör du själv

I ordning – de tre första är gratis och tar tillsammans under en timme.

1. **Domänen (10 min, cirka 150–360 kr/år).** Sök `lagomappen.se` i Internetstiftelsens sökning
   ([K36](#k36)) och registrera den hos en återförsäljare ([K39](#k39)). Ordna e-post
   (`support@lagomappen.se`), gärna via återförsäljarens e-post eller vidarebefordran.
2. **PRV:s Svensk varumärkesdatabas (gratis, [K42](#k42)).** Sök på `lagom` (även varianter
   där ordet ingår). Titta på gällande märken och ansökningar i klass **9, 42, 44** (och 41, 35).
   Anteckna träffar: märke, innehavare, klasser, status.
3. **TMview och WIPO (gratis).** TMview ([K43](#k43)) söker i EU-varumärken (EUIPO) och i PRV:s och
   andra länders register samtidigt: sök `lagom`, välj område **EM** (EU) och **SE**, klass 9, 42,
   44. Sök också innehavaren "Inter IKEA Systems" + "lagom". EUIPO eSearch ([K44](#k44)) och WIPO
   Global Brand Database ([K45](#k45)) visar internationella registreringar som gäller i EU eller
   Sverige.
4. **Butikerna (5 min).** Öppna i webbläsaren – de gav inget svar härifrån:
   - `https://itunes.apple.com/search?term=lagom&country=se&entity=software&limit=200` (byt `se`
     mot `us`, `gb`, `de`; sök i sidan efter `"trackName"`),
   - samma med `term=lagom+kalorir%C3%A4knaren`, `term=%C3%A4t+lagom`, `term=lagom+mat`,
   - `https://play.google.com/store/search?q=lagom&c=apps&hl=sv&gl=SE`.
5. **Osäker efter sökningen?** PRV:s *förhandsgranskning* gör en professionell likhetssökning för
   3 000 kr med svar inom sju dagar ([K46](#k46)). Alternativt ett varumärkesombud.
6. **Varumärkesansökan (frivillig, senare).** Hos PRV kostar e-ansökan 2 700 kr för en klass och
   1 000 kr för varje ytterligare klass, t.ex. klass 9 + 44 = 3 700 kr ([K47](#k47), [K48](#k48) –
   kontrollera beloppen i avgiftslistan). Ett EU-varumärke kostar 850 € för en klass, 50 € för den
   andra och 150 € för varje följande ([K49](#k49)). Räkna med att avgiften inte kommer tillbaka om
   ansökan avslås – och att ordet LAGOM ensamt kan få avslag (se [avsnitt 4](#bedömning-i-klartext-inte-juridisk-rådgivning)).
7. **App Store Connect.** När app-id:t är bekräftat ([LANSERING.md](LANSERING.md) steg 4): skapa
   appen med namnet `Lagom – kaloriräknaren` (eller pröva `Lagom` först). Då reserveras namnet.
8. **Hittar du en krock** (ett gällande LAGOM i klass 9, 42 eller 44 i SE/EU): byt butiksnamn till
   ett av alternativen ovan innan lanseringen – det är enkelt nu och mer arbete efteråt.

---

## Källförteckning

Alla källor söktes fram **2026-09-29** med webbsökning – uppgiften kommer från sökmotorns
sammanfattning av sidan, eftersom sidorna inte gick att öppna direkt från utvecklingsmiljön. Enda
undantaget är K32 (egna DNS-uppslag samma dag). Öppna länkarna själv om en uppgift är avgörande.

<a id="k1"></a>**K1.** Apple, App Store Connect Help – App information (namn 2–30 tecken):
https://developer.apple.com/help/app-store-connect/reference/app-information/app-information – 2026-09-29.

<a id="k2"></a>**K2.** Apple, App Review Guidelines, 2.3.7 (unikt namn, högst 30 tecken):
https://developer.apple.com/app-store/review/guidelines/ – 2026-09-29.

<a id="k3"></a>**K3.** Apple Developer Forums, "The App Name you entered has already been used":
https://developer.apple.com/forums/thread/91335 – 2026-09-29.

<a id="k4"></a>**K4.** PTKD Journal, "Can Two Apps Have the Same Name in the iOS App Store?" (namnet
blockeras, undertitel och namnet under ikonen behöver inte vara unika):
https://ptkd.com/journal/app-store-same-name-availability – 2026-09-29 (sekundär källa).

<a id="k5"></a>**K5.** App Store, "Lagom" (V.S.D. Alimentos y Bebidas E.I.R.L., skolmåltider, Mat och
dryck): https://apps.apple.com/us/app/lagom/id6478700686 – webbsökning 2026-09-29.

<a id="k6"></a>**K6.** App Store, "LAGOM" (School Today LLC, förskolor i Charkiv):
https://apps.apple.com/bz/app/lagom/id6460887967 – webbsökning 2026-09-29.

<a id="k7"></a>**K7.** Apple Legal, App Name Dispute:
https://www.apple.com/legal/intellectual-property/dispute-forms/app-store/app-name-dispute.html – 2026-09-29.

<a id="k8"></a>**K8.** App Store, "Lagom · Screen Time Control" (Ushaar Hoomans Private Limited):
https://apps.apple.com/us/app/lagom-screen-time-control/id6740080553 och samma app som "Slow Time
Club · Screen Limits App": https://apps.apple.com/mu/app/lagom-screen-time-control/id6740080553 –
webbsökning 2026-09-29.

<a id="k9"></a>**K9.** App Store, "Lagom - AI Interior Design":
https://apps.apple.com/us/app/lagom-ai-interior-design/id6768314003 – webbsökning 2026-09-29.

<a id="k10"></a>**K10.** App Store, "LagomVPN — VPN without ads":
https://apps.apple.com/us/app/lagomvpn-vpn-without-ads/id6670336253 och utvecklaren LAGOM PRODUCTS
LLC: https://apps.apple.com/us/developer/lagom-products-llc/id1765866104 – webbsökning 2026-09-29.

<a id="k11"></a>**K11.** App Store, "Lagom Terrace": https://apps.apple.com/us/app/lagom-terrace/id6447654204
och "Lagom Kitchen & Bar": https://apps.apple.com/us/app/lagom-kitchen-bar/id6499216527 – webbsökning 2026-09-29.

<a id="k12"></a>**K12.** App Store (Sverige), "Lagom SA": https://apps.apple.com/se/app/lagom-sa/id6450917814 –
webbsökning 2026-09-29.

<a id="k13"></a>**K13.** App Store (Sverige), "Lagom varmt" (Vasakronan):
https://apps.apple.com/se/app/lagom-varmt/id1146879466 – webbsökning 2026-09-29.

<a id="k14"></a>**K14.** Utvecklaren "Lagom" i App Store: https://apps.apple.com/by/developer/lagom/id1513149270
och "Lagom Apps" i Google Play: https://play.google.com/store/apps/dev?id=8520293642085125514 –
webbsökning 2026-09-29.

<a id="k15"></a>**K15.** Webbsökningar 2026-09-29 på "Lagom kaloriräknare app", "Ät lagom" app,
"Lagom mat" OR "Lagom kalorier" app, "Lagom" calorie tracker/food diary – inga appar med de namnen.
Svenska kaloriappar: https://apps.apple.com/se/app/myfitnesspal-kalorir%C3%A4knare/id341232718,
https://apps.apple.com/se/app/lifesum-kalorir%C3%A4knare-med-ai/id286906691,
https://apps.apple.com/se/app/kalorir%C3%A4knaren-av-fatsecret/id347184248,
https://apps.apple.com/se/app/kalorir%C3%A4knare-r%C3%A4kna-kalorier/id6444648182 – 2026-09-29.

<a id="k16"></a>**K16.** Google Play Console Help, Metadata (titel högst 30 tecken):
https://support.google.com/googleplay/android-developer/answer/9898842 – 2026-09-29.

<a id="k17"></a>**K17.** Google Play Console Help, Impersonation:
https://support.google.com/googleplay/android-developer/answer/9888374 – 2026-09-29.

<a id="k18"></a>**K18.** Google Play: "Lagom" https://play.google.com/store/apps/details?id=com.lagom.app,
"Lagom" https://play.google.com/store/apps/details?id=com.makane.lagomsa, "Lagom: Fast VPN Proxy"
https://play.google.com/store/apps/details?id=com.lagomproductsllc.lagomvpn – webbsökning 2026-09-29.

<a id="k19"></a>**K19.** Google Play, "Lagom: Simple Money Tracker":
https://play.google.com/store/apps/details?id=coin.io – webbsökning 2026-09-29.

<a id="k20"></a>**K20.** Google Play, "Lagom Fitness":
https://play.google.com/store/apps/details?id=com.trainerize.lagomfitness – webbsökning 2026-09-29.

<a id="k21"></a>**K21.** Trademarkia, LAGOM (serienr 88288416, reg. 6846977, Lagom, LLC):
https://www.trademarkia.com/lagom-88288416 – webbsökning 2026-09-29.

<a id="k22"></a>**K22.** Justia Trademarks: https://trademarks.justia.com/874/51/lagom-87451971.html (Torrin
Vineyard, vin), https://trademarks.justia.com/880/67/lagom-88067104.html (Ross Newville m.fl.),
https://trademarks.justia.com/976/32/lagom-97632387.html (Sheng-Ta Saws), och fler LAGOM-märken
(bl.a. kosmetik och belysning): https://trademarks.justia.com/868/65/lagom-86865742.html,
https://trademark.justia.com/888/10/lagom-88810744.html,
https://trademark.justia.com/983/89/lagom-98389298.html – webbsökning 2026-09-29.

<a id="k23"></a>**K23.** Arla, Lätt & Lagom®: https://www.arla.se/produkter/latt--lagom/ – webbsökning 2026-09-29.

<a id="k24"></a>**K24.** Allabolag, Lagom AB (559387-8696):
https://www.allabolag.se/foretag/lagom-ab/stockholm/uthyrning/2KIG8FCI5YIEZ – webbsökning 2026-09-29.

<a id="k25"></a>**K25.** Hitta.se, "Lagom AB Stockholm": https://www.hitta.se/lagom+ab+stockholm/f%C3%B6retag/2 –
webbsökning 2026-09-29.

<a id="k26"></a>**K26.** Hubbub, Live LAGOM: https://hubbub.org.uk/live-lagom – webbsökning 2026-09-29.

<a id="k27"></a>**K27.** IKEA UK, Live Lagom community:
https://www.ikea.com/gb/en/this-is-ikea/sustainable-everyday/ikea-live-lagom-community-pub8d845141/ –
webbsökning 2026-09-29.

<a id="k28"></a>**K28.** The Drum, "Ikea launches £0 'Lagom Collection'" (2019):
https://www.thedrum.com/news/2019/05/13/ikea-launches-0-lagom-collection-upcycle-cheat-sheet-sustainable-living –
webbsökning 2026-09-29.

<a id="k29"></a>**K29.** EU-domstolen, mål C-298/23 Inter IKEA Systems mot Algemeen Vlaams Belang, dom
8 september 2026 (datumet enligt en sökmotors sammanfattning – inte kontrollerat i domen):
https://curia.europa.eu/site/jcms/p1_1000086739 – webbsökning 2026-09-29.

<a id="k30"></a>**K30.** Varumärkeslagen (2010:1877), 2 kap. 5 § (ett märke som registreras måste ha
särskiljningsförmåga; beskrivande märken är absoluta registreringshinder), enligt webbsökning
2026-09-29: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/varumarkeslag-20101877_sfs-2010-1877/
och https://lagen.nu/2010:1877 – 2026-09-29.

<a id="k31"></a>**K31.** PRV, Välj rätt varor och tjänster för ditt varumärke:
https://www.prv.se/sv/varumarke/forbered-dig-infor-varumarkesansokan/valja-ratt-varor-och-tjanster-for-ditt-varumarke/ –
2026-09-29.

<a id="k32"></a>**K32.** Egna DNS-uppslag 2026-09-29 (NS, SOA, A, MX) mot Google Public DNS 8.8.8.8 och
Cloudflare 1.1.1.1. Upprepa själv med t.ex. `nslookup -type=NS lagomappen.se 8.8.8.8` – "Non-existent
domain"/NXDOMAIN betyder att namnet inte finns i zonen.

<a id="k33"></a>**K33.** Lagom Notes: https://getlagom.app/terms, Lagom AI-assistent:
https://www.lagom-app.com/, Lagom skärmtid: https://www.findlagom.app/ – webbsökning 2026-09-29.

<a id="k34"></a>**K34.** Internetstiftelsen, Tillgång till zonfiler för .se och .nu (zonfilen innehåller
alla delegerade domännamn):
https://internetstiftelsen.se/domaner/domannamnsbranschen/teknik/tillgang-till-zonfiler-for-se-och-nu/ –
webbsökning 2026-09-29.

<a id="k35"></a>**K35.** Registry Services (Internetstiftelsen), Hur går frisläppning av domäner till?
(utgången 10 dagar → deaktiverad och borttagen ur zonen 60 dagar → karantän 5–25 dagar):
https://support.registry.se/sv/kb/articles/hur-g-r-frisl-ppning-av-dom-ner-till och Loopia, Regler för
.se-domäner i karantän: https://support.loopia.se/wiki/regler-for-se-domaner-i-karantan/ – webbsökning 2026-09-29.

<a id="k36"></a>**K36.** Internetstiftelsen, Sök efter lediga domännamn och innehavare:
https://internetstiftelsen.se/sok-doman/ – 2026-09-29.

<a id="k37"></a>**K37.** Swivrr, Vad kostar domän 2026? (grundavgift 92 kr/år till Internetstiftelsen, cirka
150–220 kr/år hos prisvärda återförsäljare, Binero cirka 149 kr): https://www.swivrr.se/priser/vad-kostar-domain
och Sörmlands Webbyrå, Vad kostar en domän 2026?:
https://www.sormlandswebbyra.se/blogg/vad-kostar-en-doman-egentligen/ – webbsökning 2026-09-29.

<a id="k38"></a>**K38.** Loopia, detaljerad prislista för domännamn:
https://www.loopia.se/domannamn/detaljerad_prislista/ – webbsökning 2026-09-29.

<a id="k39"></a>**K39.** Internetstiftelsen, Återförsäljare av .se- och .nu-domännamn:
https://internetstiftelsen.se/domaner/registrera-ett-domannamn/aterforsaljare/ – 2026-09-29.

<a id="k40"></a>**K40.** Apple Developer Forums, "Code Signing Identifiers Explained" (omvända
domännamn kräver inte att du kontrollerar domänen): https://developer.apple.com/forums/thread/811970 –
webbsökning 2026-09-29.

<a id="k41"></a>**K41.** Android Developers, Configure the app module (application-id:t identifierar appen
unikt på enheten och i Google Play och ska aldrig ändras efter publicering):
https://developer.android.com/build/configure-app-module – webbsökning 2026-09-29.

<a id="k42"></a>**K42.** PRV, Sök i Svensk Patentdatabas, Svensk Varumärkesdatabas och Svensk Designdatabas
(gratis, utan inloggning): https://www.prv.se/sv/kunskap-och-stod/databaser/ – webbsökning 2026-09-29.

<a id="k43"></a>**K43.** TMview (EUIPO och nationella varumärkesmyndigheter): https://www.tmdn.org/tmview/ –
2026-09-29.

<a id="k44"></a>**K44.** EUIPO, Searches (eSearch plus m.fl.): https://www.euipo.europa.eu/en/search-ip –
2026-09-29.

<a id="k45"></a>**K45.** WIPO Global Brand Database: https://branddb.wipo.int/ och Madrid Monitor
(internationella registreringar): https://www3.wipo.int/madrid/monitor/en/ – 2026-09-29.

<a id="k46"></a>**K46.** PRV, Förhandsgranskning av varumärken (3 000 kr, leverans inom sju dagar):
https://www.prv.se/sv/prv-konsulttjanster/soktjanster-varumarke/forhandsgranskning-av-varumarken/ –
webbsökning 2026-09-29.

<a id="k47"></a>**K47.** PRV, Nya avgifter för varumärkesärenden (2 700 kr för en klass):
https://www.prv.se/sv/om-oss/nyheter/nya-avgifter-varumarke/ – webbsökning 2026-09-29.

<a id="k48"></a>**K48.** PRV, samlade avgifter (1 000 kr per ytterligare klass enligt webbsökningens
sammanfattning – kontrollera): https://www.prv.se/globalassets/dokument/avgifter/prv_avgiftslista.pdf –
webbsökning 2026-09-29.

<a id="k49"></a>**K49.** EUIPO, Fees and payments (850 €, 50 €, 150 €):
https://www.euipo.europa.eu/en/trade-marks/before-applying/fees-payments – webbsökning 2026-09-29.

<a id="k50"></a>**K50.** Apple Developer Documentation, Configuring an associated domain (filen
`apple-app-site-association` ska ligga på domänen via HTTPS):
https://developer.apple.com/documentation/xcode/configuring-an-associated-domain – webbsökning 2026-09-29.
