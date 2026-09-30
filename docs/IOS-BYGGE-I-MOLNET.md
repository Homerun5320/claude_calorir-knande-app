# iOS-bygge i molnet – utan egen Mac

En iPhone-app måste byggas, signeras och laddas upp med Apples verktyg (Xcode), som bara finns
på macOS. Du har ingen Mac, så bygget görs på en Mac i molnet. Det här dokumentet jämför de två
gratisalternativen, **Codemagic** och **GitHub Actions**, och beskriver båda steg för steg. Båda
är färdiga i repot:

| Tjänst | Fil | Arbetsflöde |
| --- | --- | --- |
| GitHub Actions | `.github/workflows/release.yml` | *Butiksbyggen*, jobbet **iPhone** (och Android) |
| Codemagic | `codemagic.yaml` | `ios-testflight` (och `android-play`) |

Båda gör samma sak: bygger webbdelen skarpt (`npm run build:ios`), hämtar – eller skapar första
gången – distributionscertifikatet och en App Store-profil via **App Store Connect API-nyckeln**,
arkiverar med Xcode 26, kontrollerar version, byggnummer och HealthKit i den färdiga IPA:n och
laddar upp till **TestFlight**. De använder samma signeringsverktyg (Codemagics öppna
`codemagic-cli-tools`) och samma privata certifikatnyckel, så du kan byta tjänst utan att skapa
nya certifikat.

Kontrollbygget för simulatorn utan signering finns i `.github/workflows/native.yml` (körs på
begäran). Allt om projektet: [NATIVE.md](NATIVE.md).

> Priser och gratisnivåer ändras ofta – siffrorna nedan gällde hösten 2026. Kontrollera
> alltid på tjänstens prissida innan du väljer.

## Rekommendation i korthet

- **iPhone: Codemagic, gratisnivån**, så länge repot är privat. 500 byggminuter i månaden på Mac
  mini M2; ett Lagom-bygge tar ungefär 12–20 minuter, alltså 25–40 byggen i månaden.
- **Android: GitHub Actions** (`release.yml`). Det körs på Linux och kostar bara vanliga minuter.
- **Är repot publikt** (eller blir det): kör allt i GitHub Actions – macOS-minuterna är då gratis.

Använd **en tjänst per app**. Taggar du en version (`v1.0.0`) startar både `release.yml` och
Codemagics `ios-testflight` – `release.yml` bygger bara iPhone-appen om Apple-hemligheterna finns
i GitHub, så lägg dem bara på ett ställe.

## Jämförelse

| | **Codemagic** (gratisnivå) | **GitHub Actions** (macOS-maskin) |
| --- | --- | --- |
| Gratis byggtid | 500 minuter/månad på macOS (Mac mini M2) för personliga konton (inte team) | Publikt repo: gratis. Privat repo: 2 000 minuter/månad (GitHub Free) eller 3 000 (GitHub Pro, ingår i Student Developer Pack) – men **macOS-minuter räknas tio gånger**, alltså ungefär 200 respektive 300 macOS-minuter |
| iPhone-byggen per månad (ca 15 min/bygge) | ca 30 | Privat repo: ca 13 (Free) eller 20 (Pro). Publikt: obegränsat |
| Android-byggen | På samma Mac-minuter (Linux kräver betalning) | Linux – räcker till hundratals byggen |
| Signering | Automatisk via API-nyckeln (`app-store-connect fetch-signing-files --create`) | Samma verktyg och samma nyckel, installeras i bygget |
| Uppladdning till TestFlight | Inbyggd (`publishing: app_store_connect`) | `app-store-connect publish` i bygget |
| Hemligheter | Krypterat i Codemagic (*Integrations*, *Environment variables*) | Krypterat i GitHub (*Settings → Secrets and variables → Actions*) |
| Kräver kort? | Nej för gratisnivån | Nej för de inkluderade minuterna |
| Nackdel | Ännu en tjänst; kö vid hög belastning | Få macOS-minuter i privata repon |

### Varför inte Xcodes egen molnsignering?

Xcode kan signera själv med API-nyckeln (`xcodebuild -allowProvisioningUpdates
-authenticationKey…`), men då behövs ett **utvecklingscertifikat med privat nyckel på maskinen**
när appen arkiveras – och molnets maskiner är nya varje gång, så det misslyckas eller skapar ett
nytt certifikat per bygge. Distributionssigneringen kräver dessutom en API-nyckel med rollen
**Admin**. Med `fetch-signing-files` räcker rollen **App Manager**, och samma
distributionscertifikat används varje gång.

## Det här behövs oavsett tjänst

1. **Apple Developer Program** (individkonto, 99 USD per år) – se [APP-STORE.md](APP-STORE.md#2-konto-och-avtal).
2. **Bundle ID** (*developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → + →
   App IDs → App*): beskrivning `Lagom`, *Explicit* `se.lagomappen.lagom` (bekräfta det först,
   [NATIVE.md §1](NATIVE.md#1-att-bekräfta-innan-första-uppladdningen)). Kryssa i
   **HealthKit** (under *Capabilities*; *In-App Purchase* är alltid påslaget). Inget annat – inte
   *Push Notifications* (påminnelserna är lokala).
3. **Appen i App Store Connect** (se [APP-STORE.md §3](APP-STORE.md#3-skapa-appen-i-app-store-connect)) –
   den måste finnas innan det första bygget kan laddas upp. Anteckna appens **Apple ID** (siffror,
   under *Appinformation*) – Codemagic använder det för byggnumret.
4. **App Store Connect API-nyckel** – molnbygget loggar in med den i stället för ditt lösenord:
   1. *App Store Connect → Användare och åtkomst → Integrationer → App Store Connect API*.
      Första gången trycker kontohavaren (du) på *Begär åtkomst*; det godkänns oftast direkt.
   2. Under *Teamnycklar*: tryck på **+**, namnge nyckeln `Molnbygge` och välj rollen
      **App Manager**.
   3. **Ladda ned `.p8`-filen – det går bara en gång.** Anteckna *Key ID* och *Issuer ID*
      (visas överst på sidan).
   4. Spara filen och id:na i din lösenordshanterare. Filen får **aldrig** checkas in i Git
      eller skickas i mejl. Läcker den: återkalla nyckeln på samma sida och skapa en ny.
5. **Certifikatnyckeln** – en privat RSA-nyckel som distributionscertifikatet skapas från. Samma
   nyckel i båda tjänsterna ger samma certifikat. Skapa den en gång, i en mapp **utanför** repot
   (t.ex. `Dokument/lagom-nycklar`), med Git Bash på Windows eller Terminal:

   ```sh
   ssh-keygen -t rsa -b 2048 -m PEM -f lagom_ios_distribution_key -q -N ""
   ```

   Filen `lagom_ios_distribution_key` (börjar med `-----BEGIN RSA PRIVATE KEY-----`) är hemlig –
   spara den i lösenordshanteraren. `lagom_ios_distribution_key.pub` behövs inte och kan tas bort.
   Första bygget skapar certifikatet *Apple Distribution* i ditt konto (Apple tillåter högst tre).
6. **Webbdelens variabler** – samma värden som i Netlifys produktion (de byggs in i appen och är
   inte hemliga): `VITE_API_BASE`, `VITE_COMMERCE_MODE` (`live`), `VITE_LICENSE_PUBLIC_KEYS`,
   `VITE_SELLER_NAME`, `VITE_SELLER_ORGNR`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE`,
   `VITE_SELLER_VAT` och `VITE_SUPPORT_EMAIL`. Hemliga nycklar hör aldrig hemma i
   `VITE_`-variabler.

## Codemagic – steg för steg

1. **Konto:** codemagic.io → *Sign up* med ditt GitHub-konto. Använd det personliga kontot – de
   gratis minuterna gäller inte för team.
2. **Lägg till appen:** *Add application* → GitHub → välj Lagom-repot. Codemagic hittar
   `codemagic.yaml` själv (projekttypen spelar ingen roll när filen finns).
3. **Koppla Apple:** *Personal Account → Integrations → Developer Portal → Connect / Manage keys →
   Add key*. Namnet måste vara exakt **`Lagom`** (det står i `codemagic.yaml`). Ange *Issuer ID*,
   *Key ID* och ladda upp `.p8`-filen.
4. **Variabler** (*appen → Environment variables*), i grupper:

   | Grupp | Variabel | Hemlig? |
   | --- | --- | --- |
   | `lagom_bygge` | `VITE_API_BASE`, `VITE_COMMERCE_MODE` (`live`), `VITE_LICENSE_PUBLIC_KEYS`, `VITE_SELLER_NAME`, `VITE_SELLER_ORGNR`, `VITE_SELLER_ADDRESS`, `VITE_SELLER_PHONE`, `VITE_SELLER_VAT`, `VITE_SUPPORT_EMAIL`; valfritt `LAGOM_BUILD_NUMBER_OFFSET` | Nej |
   | `app_store` | `CERTIFICATE_PRIVATE_KEY` – hela innehållet i `lagom_ios_distribution_key` | **Ja** |
   | `app_store` | `APP_STORE_APPLE_ID` – appens Apple ID (siffror) | Nej |
   | `app_store` | valfritt `LAGOM_INTERN_TESTFLIGHT` = `true` – byggena blir bara för intern test och kan inte skickas in | Nej |

5. **Starta ett bygge:** *Start new build* → arbetsflödet **iPhone → TestFlight**, eller tagga en
   version (`git tag v1.0.0 && git push origin v1.0.0` – taggen måste vara `v` + versionen i
   `package.json`). Efter 15–20 minuter är bygget uppladdat; Apple behandlar det sedan en stund
   (upp till en timme) innan det syns i TestFlight.
6. **Android i Codemagic** (om du inte använder GitHub Actions för Android): ladda upp
   uppladdningsnyckeln under *Personal Account → codemagic.yaml settings → Code signing identities
   → Android keystores* med referensnamnet `lagom_upload`, lägg tjänstkontots JSON som den hemliga
   variabeln `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` i gruppen `google_play`, och starta
   **Android → Google Play (intern test)** för hand. Se [GOOGLE-PLAY.md §10–11](GOOGLE-PLAY.md#10-bygga-och-ladda-upp-appen).

Byggnumret blir App Store Connects senaste + 1 (med `APP_STORE_APPLE_ID`), annars Codemagics
räknare plus `LAGOM_BUILD_NUMBER_OFFSET`.

## GitHub Actions – steg för steg

1. **Hemligheter** (*repot → Settings → Secrets and variables → Actions → Secrets → New
   repository secret*):

   | Hemlighet | Värde |
   | --- | --- |
   | `APP_STORE_CONNECT_ISSUER_ID` | *Issuer ID* |
   | `APP_STORE_CONNECT_KEY_IDENTIFIER` | *Key ID* |
   | `APP_STORE_CONNECT_PRIVATE_KEY` | Hela innehållet i `.p8`-filen (med `-----BEGIN PRIVATE KEY-----`) |
   | `CERTIFICATE_PRIVATE_KEY` | Hela innehållet i `lagom_ios_distribution_key` |

2. **Variabler** (*samma sida → Variables*): webbdelens variabler (punkt 6 ovan). Valfritt
   `LAGOM_BUILD_NUMBER_OFFSET` (heltal som läggs till körningens nummer – höj det om du har laddat
   upp byggen med högre nummer från Codemagic).
3. **Kör:** *Actions → Butiksbyggen → Run workflow* (välj `iphone` eller `alla`; *Bara intern test
   i TestFlight* gör bygget ogiltigt för inskickning), eller tagga en version. Första jobbet
   (*Förutsättningar*, Linux) kontrollerar hemligheterna, variablerna och versionen innan
   macOS-maskinen startas; saknas Apple-hemligheterna hoppas iPhone-appen över med en förklaring.
4. **Resultatet:** den signerade IPA:n under körningens *Artifacts* (30 dagar), uppladdningen till
   TestFlight och en sammanfattning med version och byggnummer. Misslyckas bygget sparas Xcodes
   loggar som artefakt.
5. **Minuterna:** iPhone-bygget körs bara vid taggar och för hand – aldrig vid pull requests. Den
   vanliga kontrollen (`ci.yml`) och Android-kontrollen (`native.yml`) körs på Linux.
6. **Push av byggfiler:** att pusha ändringar i `.github/workflows/` kräver en token med
   behörigheten `workflow`.

## TestFlight – testa på din iPhone

1. Installera appen **TestFlight** från App Store på din iPhone.
2. *App Store Connect → din app → TestFlight → Interna testare*: skapa en grupp, lägg till dig
   själv (och upp till 100 personer i ditt team) och slå på automatisk distribution. Interna test
   kräver ingen granskning.
3. Vill du låta vänner testa: *Externa testare* → skapa en grupp → dela den publika länken.
   Det första bygget till externa testare granskas kort av Apple.
4. **Köp i TestFlight** dras aldrig på riktigt – de görs i Apples testmiljö med testarens eget
   Apple-ID (se [APP-STORE.md §6](APP-STORE.md#testa-köpen-testflight-och-sandlådan)).
5. Testa särskilt: exempeldata, egen profil och provperioden ("Starta 14 dagar gratis" – köpet
   `prov14`; avbryt en gång först), sökning och streckkodsläsaren (också med nekad kamera), köp,
   Återställ köp efter ominstallation (provperioden ska komma tillbaka, inte börja om), ett år som
   köps i förväg, Apple Hälsa (koppla, neka, koppla bort), påminnelser (tillåt och neka notiser),
   export via delningsbladet, ett långt tryck på en produktbild (ingen meny), radering av data,
   och att appen – och köpen – fungerar utan uppkoppling.

## Efter första lyckade bygget

- **Package.resolved:** bygget sparar `Package.resolved` (vilka versioner av Swift-paketen som
  användes) som artefakt. Checka in den som
  `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`, så används
  samma versioner varje gång.
- Kontrollera i App Store Connect att bygget har rätt version och att inga mejl om saknade
  integritetsuppgifter (ITMS-91053) har kommit – se [NATIVE.md §8](NATIVE.md#8-integritet-app-privacy-och-data-safety).

## Felsökning utan Mac

- De flesta fel syns redan i webbversionen: kör `npm run dev` och använd webbläsarens
  utvecklarverktyg (Chrome eller Edge, gärna i mobilläge).
- Fel i iPhone-appen sparas i den lokala felloggen: *Om Lagom → Felsökning → Kopiera felrapport*
  på telefonen (inga livsmedel eller värden sparas i loggen).
- Vanliga byggfel:

  | Felet | Orsak och åtgärd |
  | --- | --- |
  | *Förutsättningar* stoppar bygget | Läs sammanfattningen – en variabel saknas, `VITE_COMMERCE_MODE` är inte `live`, eller taggen stämmer inte med `package.json`. |
  | `There is a problem with the request entity – You already have a current Distribution certificate` | Apple tillåter högst tre distributionscertifikat. Återkalla ett gammalt under *Certificates* på developer.apple.com (inte ett som en publicerad app behöver för något annat – för Lagom finns bara det här). |
  | `Unauthorized` / `NOT_AUTHORIZED` | Fel *Issuer ID*/*Key ID*, en ofullständig `.p8`, eller en nyckel utan rollen App Manager. |
  | *HealthKit saknas i appens behörigheter* | HealthKit är inte påslaget för Bundle ID:t. Slå på det; nästa bygge skapar en ny profil. |
  | *iPhone-widgeten: halvvägs påslagen* | Projektfilen, `App.entitlements` och `WIDGET_IOS_READY` ska vara på eller av tillsammans. Återställ filerna eller slå på allt med `node scripts/ios-widget.mjs enable` ([WIDGET.md §8](WIDGET.md#8-iphone--planen)). |
  | `Provisioning profile … doesn't include the com.apple.security.application-groups entitlement` (bara med widgeten på) | App Group saknas för appens eller widgetens Bundle ID. På developer.apple.com: skapa gruppen `group.se.lagomappen.lagom` och slå på *App Groups* med den för både `se.lagomappen.lagom` och `se.lagomappen.lagom.widget` (skapas bygget automatiskt utan förmågor – slå då på dem). Nästa bygge skapar nya profiler. |
  | `The bundle version must be higher than the previously uploaded version` | Byggnumret har redan använts – höj `LAGOM_BUILD_NUMBER_OFFSET`. |
  | `No suitable application records were found` | Appen finns inte i App Store Connect, eller Bundle ID:t skiljer sig. |
  | Swift-paket går inte att hämta | Tillfälligt fel hos GitHub – kör igen. |

- Behövs en riktig Mac någon gång (t.ex. för att titta i Xcodes felsökare): låna en hos en
  kompis eller i skolans datorsal, eller hyr en timvis (t.ex. MacinCloud). AWS EC2 Mac är dyrt
  för en student – den debiteras minst ett dygn i taget.

## Kostnader

| Post | Kostnad |
| --- | --- |
| Apple Developer Program | 99 USD per år (tas ut i kronor) |
| Codemagic, gratisnivån | 0 kr (500 macOS-minuter per månad) |
| GitHub Actions | 0 kr för publika repon; för privata repon ingår minuterna ovan |
| Hyrd Mac vid behov | Från någon hundralapp per månad – bara om det verkligen behövs |
