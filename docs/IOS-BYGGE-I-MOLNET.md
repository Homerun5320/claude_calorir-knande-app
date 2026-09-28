# iOS-bygge i molnet – utan egen Mac

En iPhone-app måste byggas, signeras och laddas upp med Apples verktyg (Xcode), som bara finns
på macOS. Du har ingen Mac, så bygget görs på en Mac i molnet. Det här dokumentet jämför de två
vanligaste gratisalternativen, **Codemagic** och **GitHub Actions**, och rekommenderar ett
upplägg.

> **Läget:** Capacitor (som gör iPhone-appen av Lagom) är ännu inte installerat. Själva
> byggfilerna (`codemagic.yaml` eller `.github/workflows/ios.yml`) skrivs när Capacitor och
> köp-i-appen-tillägget är på plats. Det här är planen och förberedelserna.
>
> Priser och gratisnivåer ändras ofta – siffrorna nedan gällde hösten 2026. Kontrollera
> alltid på tjänstens prissida innan du väljer.

## Rekommendation i korthet

**Börja med Codemagic, gratisnivån.** Den har 500 byggminuter i månaden på Mac-datorer med
Apple-processor, sköter signeringen åt dig med en App Store Connect API-nyckel och laddar upp
till TestFlight med ett par klick. Ett Lagom-bygge tar ungefär 10–15 minuter, så gratisnivån
räcker till 30–50 byggen i månaden – mer än nog för en app i version 1.

**Byt till (eller komplettera med) GitHub Actions** om repot blir publikt (då är
macOS-byggen gratis utan gräns) eller om du vill ha allt på ett ställe och har GitHub Pro via
Student Developer Pack.

## Jämförelse

| | **Codemagic** (gratisnivå) | **GitHub Actions** (macOS-runner) |
| --- | --- | --- |
| Gratis byggtid | 500 minuter/månad på macOS (Apple M2) för personliga konton | Publikt repo: gratis. Privat repo: 2 000 minuter/månad (GitHub Free) eller 3 000 (GitHub Pro, ingår i Student Developer Pack) – men **macOS-minuter räknas tio gånger**, alltså ungefär 200 respektive 300 macOS-minuter |
| Byggen per månad (ca 12 min/bygge) | ca 40 | Privat repo: ca 15 (Free) eller 25 (Pro). Publikt: obegränsat |
| Signering | **Automatisk** – Codemagic hämtar eller skapar certifikat och provisioneringsprofil med din API-nyckel | Du ställer in det själv: Xcodes automatiska signering med API-nyckeln (`xcodebuild -allowProvisioningUpdates -authenticationKey…`) eller fastlane |
| Uppladdning till TestFlight | Inbyggd (`submit_to_testflight: true`) | Eget steg: `xcrun altool --upload-app` eller fastlane `upload_to_testflight` |
| Inställning | Webbgränssnitt + en `codemagic.yaml`; färdig guide för Capacitor | Bara YAML – mer att skriva och felsöka |
| Hemligheter | Lagras krypterat i Codemagic (*Team integrations*, *Environment variables*) | Lagras krypterat i GitHub (*Settings → Secrets and variables → Actions*) |
| Kräver kort? | Nej för gratisnivån | Nej för de inkluderade minuterna |
| Nackdel | Ännu en tjänst att hålla koll på; kö vid hög belastning | Få macOS-minuter i privata repon; signeringen är krånglig första gången |

Båda använder samma **App Store Connect API-nyckel** och samma kommandon för webbdelen, så det
går att byta senare utan att ändra appen.

## Det här behövs oavsett tjänst

1. **Apple Developer Program** (individkonto, 99 USD per år) – se [APP-STORE.md](APP-STORE.md#2-konto-och-avtal).
2. **Ett Bundle ID** (*developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → +*),
   t.ex. `se.<dittnamn>.lagom`. Kryssa i förmågan **In-App Purchase**. Samma id används i
   Capacitor (`capacitor.config.ts` → `appId`) och i App Store Connect.
3. **Appen i App Store Connect** (se [APP-STORE.md](APP-STORE.md#3-skapa-appen-i-app-store-connect)) –
   den måste finnas innan det första bygget kan laddas upp.
4. **En App Store Connect API-nyckel** – molnbygget loggar in med den i stället för ditt
   lösenord:
   1. *App Store Connect → Användare och åtkomst → Integrationer → App Store Connect API*.
      Första gången trycker kontohavaren (du) på *Begär åtkomst*; det godkänns oftast direkt.
   2. Under *Teamnycklar*: tryck på **+**, namnge nyckeln `Molnbygge` och välj rollen
      **App Manager**.
   3. **Ladda ned `.p8`-filen – det går bara en gång.** Anteckna *Key ID* och *Issuer ID*
      (visas överst på sidan).
   4. Spara filen och id:na i din lösenordshanterare. Filen får **aldrig** checkas in i Git
      eller skickas i mejl. Läcker den: återkalla nyckeln på samma sida och skapa en ny.
5. **Webbdelen för appen** byggs i molnet med samma kommandon som lokalt:

   ```sh
   npm ci
   npx vite build        # med VITE_DISTRIBUTION=appstore m.fl., se APP-STORE.md avsnitt 11 → dist-native/
   npx cap sync ios
   ```

   Miljövariablerna (`VITE_DISTRIBUTION`, `VITE_API_BASE`, `VITE_SELLER_*`,
   `VITE_SUPPORT_EMAIL`, `VITE_LICENSE_PUBLIC_KEY`) läggs in som variabler i molntjänsten – de
   är inte hemliga (de hamnar i appen), men hemliga nycklar hör aldrig hemma i `VITE_`-variabler.
   Butiksbygget hamnar i `dist-native/` – när Capacitor installeras ska `webDir` i
   `capacitor.config.ts` därför vara `dist-native`, annars kopieras fel bygge in i appen.

## Codemagic – steg för steg

1. **Konto:** codemagic.io → *Sign up* med ditt GitHub-konto. Välj den personliga (gratis)
   planen.
2. **Lägg till appen:** *Add application* → GitHub → välj Lagom-repot → projekttyp
   *Ionic Capacitor App*.
3. **Koppla Apple:** *Teams → Personal Account → Integrations → Developer Portal → Connect*.
   Ange ett namn (t.ex. `Lagom`), *Issuer ID*, *Key ID* och ladda upp `.p8`-filen.
4. **Signering:** under *Code signing identities* kan Codemagic skapa ett distributionscertifikat
   åt dig (*Generate certificate*). Ladda ned det och spara det i lösenordshanteraren – det
   behövs om du byter tjänst.
5. **Byggfilen** `codemagic.yaml` läggs i repots rot när Capacitor är installerat. En skiss av
   vad den kommer att innehålla (inte en färdig fil):

   ```yaml
   # SKISS – den riktiga filen skrivs när Capacitor är installerat.
   workflows:
     ios-testflight:
       name: iPhone → TestFlight
       max_build_duration: 45
       instance_type: mac_mini_m2
       integrations:
         app_store_connect: Lagom          # namnet från steg 3
       environment:
         ios_signing:
           distribution_type: app_store
           bundle_identifier: se.<dittnamn>.lagom
         node: 22
         vars:
           VITE_DISTRIBUTION: appstore
           # … övriga VITE_-variabler
       scripts:
         - npm ci
         - npx vite build
         - npx cap sync ios
         - xcode-project use-profiles
         # Byggnumret ökar automatiskt (agvtool måste köras i mappen med Xcode-projektet).
         - cd ios/App && agvtool new-version -all $(($BUILD_NUMBER + 1))
         # Med CocoaPods: --workspace "ios/App/App.xcworkspace" i stället för --project.
         - xcode-project build-ipa --project "ios/App/App.xcodeproj" --scheme "App"
       artifacts:
         - build/ios/ipa/*.ipa
       publishing:
         app_store_connect:
           auth: integration
           submit_to_testflight: true
   ```

6. **Starta ett bygge** (*Start new build*). Efter 10–15 minuter ligger appen i TestFlight.
   Första gången behandlar Apple bygget en stund (upp till en timme) innan det går att testa.

## GitHub Actions – steg för steg

1. **Hemligheter** (*repot → Settings → Secrets and variables → Actions → New repository secret*):
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID` och
   `APP_STORE_CONNECT_KEY` (innehållet i `.p8`-filen). VITE-variablerna läggs under *Variables*.
2. **Byggfilen** `.github/workflows/ios.yml` skrivs när Capacitor är installerat. Den kör på
   `runs-on: macos-15` (eller senare), bygger webbdelen som ovan och sedan:
   - `xcodebuild archive … -allowProvisioningUpdates -authenticationKeyPath … -authenticationKeyID … -authenticationKeyIssuerID …`
     – Xcode skapar själv certifikat och profil i Apples moln med API-nyckeln,
   - `xcodebuild -exportArchive` med `method = app-store-connect`,
   - uppladdning med `xcrun altool --upload-app --apiKey … --apiIssuer …` (eller fastlane).
3. **Minuterna:** kör iOS-bygget bara när du ber om det (`workflow_dispatch`) eller vid en
   versionstagg – inte vid varje push – så räcker de gratis minuterna längre. Den vanliga
   kontrollen (`.github/workflows/ci.yml`) körs på Linux och kostar inga macOS-minuter.
4. **Push av byggfiler:** att pusha ändringar i `.github/workflows/` kräver en token med
   behörigheten `workflow`.

## TestFlight – testa på din iPhone

1. Installera appen **TestFlight** från App Store på din iPhone.
2. *App Store Connect → din app → TestFlight → Interna testare*: lägg till dig själv (och upp
   till 100 personer i ditt team). Interna test kräver ingen granskning.
3. Vill du låta vänner testa: *Externa testare* → skapa en grupp → dela den publika länken.
   Det första bygget till externa testare granskas kort av Apple.
4. **Köp i TestFlight** dras aldrig på riktigt – de görs i Apples testmiljö (sandbox).
5. Testa särskilt: exempeldata, egen profil, sökning och streckkodsläsaren, köp, Återställ köp,
   export och radering av data, och att appen fungerar utan uppkoppling.

## Felsökning utan Mac

- De flesta fel syns redan i webbversionen: kör `npm run dev` och använd webbläsarens
  utvecklarverktyg (Chrome eller Edge, gärna i mobilläge).
- Fel i iPhone-appen sparas i den lokala felloggen: *Om Lagom → Felsökning → Kopiera felrapport*
  på telefonen (inga livsmedel eller värden sparas i loggen).
- Byggfel: läs loggen i Codemagic eller GitHub Actions – oftast är det signeringen (fel Bundle ID,
  nyckeln saknar rollen App Manager) eller ett byggnummer som inte har ökat.
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
