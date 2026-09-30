<!-- Genereras från src/features/legal/legalContent.ts – ändra texten där och kör: npx vitest run src/features/legal -u -->

# Integritetspolicy för Lagom

**Version 2026-10-01** · gäller från 1 oktober 2026

> **Utkast – ska ses över av ägaren.** Texten är skriven för att stämma med hur Lagom fungerar i version 1.0: dagboken finns bara på enheten, det finns inga konton, ingen reklam och ingen analys. Den är inte granskad av en jurist.

### Att fylla i av ägaren

- [ ] **Företagsnamn** – för enskild firma ditt namn eller det registrerade firmanamnet → `VITE_SELLER_NAME`
- [ ] **Organisationsnummer** (frivilligt) – för enskild firma samma som ditt personnummer → `VITE_SELLER_ORGNR`. Sätter du det visas det i appen, i villkoren och på varje kvitto. Lämnar du det tomt utelämnas det överallt, och bygget ger bara en varning. Distansavtalslagen (2 kap. 2 §) kräver namn, adress, telefon och e-post; e-handelslagen (8 §) kräver registreringsnummer om firman finns i handelsregistret. Fråga Verksamt eller en jurist vad som gäller för just din firma (se ”Låt en jurist granska”).
- [ ] **Postadress** → `VITE_SELLER_ADDRESS`
- [ ] **Telefon** → `VITE_SELLER_PHONE`
- [ ] **Momsregistreringsnummer** (om firman är momsregistrerad) → `VITE_SELLER_VAT`
- [ ] **E-post för support** – en riktig adress som du läser → `VITE_SUPPORT_EMAIL`

Variablerna sätts i Netlify (Site configuration → Environment variables). Appen visar dem automatiskt, och när sajten byggs fylls platshållarna i de fristående sidorna i ([Företagsnamn], [Org.nr], [Adress], [Telefon], [Momsreg.nr], [E-post]). Här i docs står platshållarna kvar. Saknas en obligatorisk uppgift visar appen ”[fylls i av ägaren]”, och bygget för butikerna och för skarpa webbköp stoppas. Organisationsnumret och momsregistreringsnumret är frivilliga – saknas de tas de bort ur texten.

- [ ] Lägg in adressen till den publicerade sidan – till exempel `https://<din domän>/integritet/` – i **App Store Connect** (App Privacy → Privacy Policy URL), i **Play Console** (Policy → App content → Privacy policy) och i **Stripe** (Settings → Business → Public details).
- [ ] Kontrollera hur länge Netlify sparar loggar i din plan.
- [ ] Använd en e-posttjänst för supporten som har ett personuppgiftsbiträdesavtal, och spara Netlifys och Stripes avtal (DPA).
- [ ] Svara i App Privacy (App Store Connect) och Data safety (Play Console) så att svaren stämmer med policyn.
- [ ] Gå igenom punkterna märkta **Till ägaren** nedan.

### Låt en jurist granska

Policyn är ett juridiskt dokument. Be gärna om en engångsgranskning – till exempel hos en juristbyrå för småföretag – särskilt av:

- rättslig grund och lagringstider (bokföring, support och loggar),
- Stripes roll – både personuppgiftsbiträde och självständigt ansvarig – och överföringarna till USA (EU–US Data Privacy Framework har överklagats; standardavtalsklausulerna är reserven),
- texten om barn och unga: Lagom är gjord för vuxna och går bara att använda från 18 år (räknat på födelseåret),
- om ditt organisationsnummer (= personnumret för enskild firma) måste visas – distansavtalslagen (2 kap. 2 §) och e-handelslagen (8 §) kräver identitet och kontaktuppgifter, men om personnumret måste stå med för en enskild firma som inte finns i handelsregistret är inte kontrollerat,
- att provperiodens startdatum finns kvar på enheten när användaren raderar sin data (så att provperioden inte börjar om) – är det nödvändig lagring enligt LEK 9 kap. 28 §?

### Ingen samtyckesbanner behövs – så länge det förblir så

All lagring på enheten (tabellen under ”Lagring på din enhet”) är nödvändig för tjänsten användaren själv har begärt. Därför krävs inget samtycke enligt lagen om elektronisk kommunikation (LEK 9 kap. 28 §), och ingen cookie-banner behövs. **Lägger ni till analysverktyg, reklam eller andra tredjepartsskript krävs samtycke först** – och policyn, App Privacy och Data safety ska uppdateras innan ändringen publiceras.

### Appen och den publicerade sidan

- I appen finns policyn på sidan Integritetspolicy (`#/integritet`). I apparna från App Store och Google Play visas inte det som bara gäller köp på webben (Stripe) – Apple tillåter inga hänvisningar till andra köpsätt i appen. Den publicerade sidan innehåller allt.
- I iPhone-appen nämns bara iPhone och App Store (Apples riktlinje 2.3.10). Där ett avsnitt har en egen iPhone-text står den nedan under _I iPhone-appen (App Store) står i stället_.
- Det som bara gäller webben är märkt _(bara webben)_ nedan, och det som bara gäller licensnycklar _(inte i iPhone-appen)_.

---

## Vem ansvarar för dina uppgifter

Lagom är en svensk kalori- och näringsdagbok. Den här policyn gäller Lagom på webben och i App Store och Google Play. Den förklarar vilka uppgifter som behandlas, varför, och vad du själv kan göra.

Personuppgiftsansvarig är [Företagsnamn] (enskild firma, organisationsnummer [Org.nr]), [Adress]. Du når oss på [E-post].

Kort sagt: din dagbok stannar på din enhet. Vi behandlar bara de uppgifter som behövs när du köper en licens, när du kontaktar oss och när appen hämtas från vår server eller anropar våra serverfunktioner, till exempel vid receptimport.

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom är en svensk kalori- och näringsdagbok. Den här policyn gäller Lagom för iPhone. Den förklarar vilka uppgifter som behandlas, varför, och vad du själv kan göra.
>
> Personuppgiftsansvarig är [Företagsnamn] (enskild firma, organisationsnummer [Org.nr]), [Adress]. Du når oss på [E-post].
>
> Kort sagt: din dagbok stannar på din iPhone. Vi behandlar bara de uppgifter som behövs när du kontaktar oss och när appen anropar våra serverfunktioner, till exempel vid receptimport.

## Din dagbok finns bara på din enhet

Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara på din enhet, i webbläsaren eller i appen. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.

Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig enheten om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.

Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna på din enhet. Lagom använder dem bara för att, på enheten, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.

Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara på din enhet – nedskalade och utan platsuppgifter eller annan information från bildfilen – och följer aldrig med i säkerhetskopian, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.

Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort enheten eller rensar webbläsaren försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.

I apparna för iPhone och Android sparar Lagom dessutom en automatisk kopia av dagboken i appens egen mapp på telefonen, så att inget försvinner om telefonen rensar appens lagring. Kopian lämnar inte telefonen genom Lagom, och på iPhone följer den inte med i telefonens säkerhetskopia. På iPhone kan telefonens egen säkerhetskopia (iCloud eller en dator) ta med appens övriga data, som allt annat på telefonen – den sköts av Apple och ditt Apple-konto, inte av oss. På Android följer appens data inte med i Googles säkerhetskopia i molnet, men kan flyttas med när du för över allt direkt till en ny telefon.

I Android-appen kan du lägga till en widget på hemskärmen. Den visar en kort sammanfattning av dagen – hur mycket energi du har kvar (inte i medvetet läge), antal loggade måltider, vatten och en pågående fasta – men aldrig vad du har ätit. Sammanfattningen sparas bara i appen på telefonen och skickas inte till oss, men på hemskärmen kan den läsas av alla som ser skärmen. Du tar bort widgeten från hemskärmen som andra widgetar.

> **I iPhone-appen (App Store) står i stället:**
>
> Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din iPhone. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.
>
> Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.
>
> Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna i appen på din iPhone. Lagom använder dem bara för att, på telefonen, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.
>
> Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara i appen på din iPhone – nedskalade och utan platsuppgifter eller annan information från bildfilen – i en mapp som inte följer med i telefonens säkerhetskopia, och aldrig i Lagoms säkerhetskopia, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.
>
> Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.
>
> Lagom sparar dessutom en automatisk kopia av dagboken i appens egen mapp på din iPhone, så att inget försvinner om iOS rensar appens lagring. Kopian lämnar inte telefonen genom Lagom och följer inte med i telefonens säkerhetskopia. Din iPhones egen säkerhetskopia (iCloud eller en dator) kan ta med appens övriga data, som allt annat på telefonen – den sköts av Apple och ditt Apple-konto, inte av oss.

> **I Google Play-appen står i stället:**
>
> Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din telefon. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.
>
> Det gäller även uppgifter om hälsa, till exempel vikt, graviditet, amning och allergier eller intoleranser som du markerar. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.
>
> Allergier och intoleranser som du markerar under Inställningar → Allergier och överkänslighet sparas bara bland inställningarna i appen på din telefon. Lagom använder dem bara för att, på telefonen, flagga produkter från Open Food Facts som innehåller något av det du har markerat. De skickas aldrig till Open Food Facts eller till oss – sökningar och streckkoder skickas som vanligt, utan uppgifter om dina allergier.
>
> Framstegsbilder är avstängda tills du själv slår på dem. Bilderna sparas då bara i appen på din telefon – nedskalade och utan platsuppgifter eller annan information från bildfilen – och följer aldrig med i säkerhetskopian, den automatiska kopian eller till oss. Du kan radera en bild eller alla när du vill.
>
> Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.
>
> Lagom sparar dessutom en automatisk kopia av dagboken i appens egen mapp på telefonen, så att inget försvinner om telefonen rensar appens lagring. Kopian lämnar inte telefonen genom Lagom. Appens data följer inte med i Googles säkerhetskopia i molnet, men kan flyttas med när du för över allt direkt till en ny telefon.
>
> Du kan lägga till en widget på hemskärmen. Den visar en kort sammanfattning av dagen – hur mycket energi du har kvar (inte i medvetet läge), antal loggade måltider, vatten och en pågående fasta – men aldrig vad du har ätit. Sammanfattningen sparas bara i appen på telefonen och skickas inte till oss, men på hemskärmen kan den läsas av alla som ser skärmen. Du tar bort widgeten från hemskärmen som andra widgetar.

## Lagring på din enhet

Lagom sparar det som behövs för att appen ska fungera i enhetens lagring: IndexedDB, localStorage, sessionStorage och service workerns cache. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke till kakor.

| Vad | Var | Varför | Hur länge | Så rensar du |
| --- | --- | --- | --- | --- |
| Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar | IndexedDB | Det är själva dagboken – appen fungerar inte utan den | Tills du raderar den | Inställningar → Data → Radera all data |
| Allergier och intoleranser som du markerar (uppgifter om hälsa) | IndexedDB (lagom-profile, bland inställningarna) | För att varsamt flagga produkter från Open Food Facts som innehåller det du har markerat – det räknas fram på enheten | Tills du avmarkerar dem eller raderar all data | Inställningar → Allergier och överkänslighet, eller Inställningar → Data → Radera all data |
| Licens och när provperioden startade | IndexedDB | För att veta om Lagom är upplåst | Tills du tar bort den. Provperiodens startdatum finns kvar när du raderar din data, så att provperioden inte börjar om | Licensen: Inställningar → Data → Radera all data med valet Ta även bort licensen. Provperiodens startdatum: rensa webbplatsens data eller avinstallera appen |
| Spärrlistan: licens-id för licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits | localStorage (lagom-sparrlista) | Så att en återkallad licens slutar gälla även utan uppkoppling | Tills en nyare lista hämtas | Rensa webbplatsens data eller avinstallera appen |
| Köp i appen som gäller: vilken licens (eller provperiod), köpdatum och slutdatum – bara i apparna | localStorage (lagom-butikskop) | Så att Lagom är upplåst även när butiken inte svarar, till exempel utan uppkoppling | Tills butiken svarar med nya uppgifter – ett återbetalt köp försvinner då även här | Avinstallera appen |
| Tema (ljust eller mörkt) | localStorage (lagom-theme) | Så att appen startar i rätt färger utan att blinka | Tills du byter tema | Inställningar → Utseende och visning, eller rensa webbplatsens data |
| Små visningsval, till exempel dolda tips och pausad animation | localStorage | Så att appen minns dina val | Tills du ändrar dem | Rensa webbplatsens data |
| När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data | localStorage (lagom-sparad:…) | Så att flera öppna flikar med Lagom inte skriver över varandras ändringar | Tills du rensar webbplatsens data | Rensa webbplatsens data eller avinstallera appen |
| Markering att exempeldata visas | localStorage (lagom-demo) | Så att appen vet att det är exempeldata | Tills du börjar med din egen profil | Börja med din egen profil, eller Inställningar → Data → Radera all data |
| När du senast sparade en säkerhetskopia | localStorage (lagom-last-backup) | För att påminna dig om att spara en ny | Tills du raderar din data | Inställningar → Data → Radera all data |
| Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden | localStorage (lagom-error-log) | För felsökning – den skickas bara om du själv mejlar den till oss | De 20 senaste felen | Om Lagom → Felsökning → Rensa felloggen |
| Kopplingen till Apple Hälsa eller Health Connect: vad du har valt att hämta och skicka, när den senast synkade och en liten logg (id för hämtade vikter samt de senaste dagarnas ifyllda steg och skickade summor), så att inget hämtas eller skickas två gånger | localStorage (lagom-health) | Så att kopplingen fungerar utan dubbletter – bara i apparna och bara om du slår på den | Tills du kopplar från, raderar din data eller avinstallerar appen. Loggen sparar bara de senaste dagarna (hämtade vikter högst 400 dagar) | Inställningar → Data → Radera all data, eller avinstallera appen |
| Automatisk kopia av dagboken, med samma innehåll som en säkerhetskopia – bara i apparna | En fil i appens egen mapp på telefonen (lagom-spegling.json) – på iPhone utanför telefonens säkerhetskopia | Så att dagboken inte försvinner om telefonen rensar appens lagring | Uppdateras högst fem minuter efter en ändring och när du lämnar appen. Finns tills du raderar din data eller avinstallerar appen | Inställningar → Data → Radera all data, eller avinstallera appen |
| Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder | På webben: IndexedDB-databasen lagom-bilder, skild från dagboken. I apparna: filer i appens egen mapp på telefonen (mappen framsteg) – på iPhone utanför telefonens säkerhetskopia | Så att du kan se och jämföra dina bilder över tid. De följer inte med i säkerhetskopian eller i den automatiska kopian, och skickas aldrig till oss | Tills du raderar dem | Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller rensa webbplatsens data eller avinstallera appen |
| Den senaste filen du har exporterat eller delat (säkerhetskopia, CSV eller ett delat recept eller en delad måltid) – bara i apparna | Appens cache (mappen delning) | Så att filen kan sparas eller delas med telefonens delningsblad | Tills nästa export, tills du raderar din data eller tills telefonen rensar cachen | Inställningar → Data → Radera all data, eller avinstallera appen |
| Påminnelser du själv har slagit på (text och klockslag) – bara i apparna | Telefonens notissystem | Så att påminnelsen kan visas i tid, även när appen är stängd | Tills du stänger av påminnelsen | Inställningar → Påminnelser, eller Inställningar → Data → Radera all data |
| Sammanfattning för widgeten på hemskärmen, för i dag och de sex följande dagarna: hur mycket energi du har ätit och har kvar av dagsmålet (inte i medvetet läge), antal loggade måltider, vatten och en pågående fasta. Inga livsmedel, måltidsnamn eller exempeldata – bara i Android-appen | Appens egen lagring på telefonen (SharedPreferences-filen lagom-widget), som inte följer med i Googles säkerhetskopia i molnet | Så att widgeten kan visa dagens siffror även när appen är stängd. Den sparas även om du inte har lagt till widgeten, men syns bara om du själv lägger till den på hemskärmen – och då för alla som ser skärmen | Skrivs över när något ändras i appen. Finns tills du raderar din data eller avinstallerar appen | Inställningar → Data → Radera all data, eller avinstallera appen |
| Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet, om appen startats från Google Play och när appen senast laddades om efter en uppdatering | sessionStorage (lagom-korg, lagom-onboarding, lagom-twa, lagom-chunk-reload) | Så att inget försvinner om sidan laddas om – och så att appen inte laddas om gång på gång efter en uppdatering | Tills du stänger fliken eller appen | Stäng fliken eller appen |
| Appens filer, Livsmedelsverkets databas och produktbilder du har visat (på webben – apparna har sina filer med sig) | Service workerns cache | Så att appen startar snabbt och fungerar utan uppkoppling | Tills en ny version ersätter filerna. Produktbilder högst 60 dagar | Rensa webbplatsens data i webbläsaren eller avinstallera appen |

Allt rensas också om du tar bort webbplatsens data i webbläsarens inställningar eller avinstallerar appen.

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom sparar det som behövs för att appen ska fungera i appens lagring på din iPhone: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.
>
> | Vad | Var | Varför | Hur länge | Så rensar du |
> | --- | --- | --- | --- | --- |
> | Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar | IndexedDB | Det är själva dagboken – appen fungerar inte utan den | Tills du raderar den | Inställningar → Data → Radera all data |
> | Allergier och intoleranser som du markerar (uppgifter om hälsa) | IndexedDB (lagom-profile, bland inställningarna) | För att varsamt flagga produkter från Open Food Facts som innehåller det du har markerat – det räknas fram på enheten | Tills du avmarkerar dem eller raderar all data | Inställningar → Allergier och överkänslighet, eller Inställningar → Data → Radera all data |
> | Köp i App Store som gäller: vilken licens eller provperiod, köpdatum och slutdatum | localStorage (lagom-butikskop) | Så att Lagom är upplåst även när App Store inte svarar, till exempel utan uppkoppling | Tills App Store svarar med nya uppgifter – ett återbetalt köp försvinner då även här | Avinstallera appen |
> | Tema (ljust eller mörkt) | localStorage (lagom-theme) | Så att appen startar i rätt färger utan att blinka | Tills du byter tema | Inställningar → Utseende och visning |
> | Små visningsval, till exempel dolda tips och pausad animation | localStorage | Så att appen minns dina val | Tills du ändrar dem | Avinstallera appen |
> | När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data | localStorage (lagom-sparad:…) | Så att en äldre kopia av dagboken aldrig skriver över en nyare | Tills du avinstallerar appen | Avinstallera appen |
> | Markering att exempeldata visas | localStorage (lagom-demo) | Så att appen vet att det är exempeldata | Tills du börjar med din egen profil | Börja med din egen profil, eller Inställningar → Data → Radera all data |
> | När du senast sparade en säkerhetskopia | localStorage (lagom-last-backup) | För att påminna dig om att spara en ny | Tills du raderar din data | Inställningar → Data → Radera all data |
> | Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden | localStorage (lagom-error-log) | För felsökning – den skickas bara om du själv mejlar den till oss | De 20 senaste felen | Om Lagom → Felsökning → Rensa felloggen |
> | Kopplingen till Apple Hälsa: vad du har valt att hämta och skicka, när den senast synkade och en liten logg (id för hämtade vikter samt de senaste dagarnas ifyllda steg och skickade summor), så att inget hämtas eller skickas två gånger | localStorage (lagom-health) | Så att kopplingen fungerar utan dubbletter – bara om du slår på den | Tills du kopplar från, raderar din data eller avinstallerar appen. Loggen sparar bara de senaste dagarna (hämtade vikter högst 400 dagar) | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Automatisk kopia av dagboken, med samma innehåll som en säkerhetskopia | En fil i appens egen mapp på din iPhone (lagom-spegling.json), som inte följer med i telefonens säkerhetskopia | Så att dagboken inte försvinner om iOS rensar appens lagring | Uppdateras högst fem minuter efter en ändring och när du lämnar appen. Finns tills du raderar din data eller avinstallerar appen | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder | Filer i appens egen mapp på din iPhone (mappen framsteg), som inte följer med i telefonens säkerhetskopia | Så att du kan se och jämföra dina bilder över tid. De följer inte med i Lagoms säkerhetskopia, i den automatiska kopian eller till iCloud, och skickas aldrig till oss | Tills du raderar dem eller avinstallerar appen | Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller avinstallera appen |
> | Den senaste filen du har exporterat eller delat (säkerhetskopia, CSV eller ett delat recept eller en delad måltid) | Appens cache (mappen delning) | Så att filen kan sparas eller delas, till exempel med Spara i Filer | Tills nästa export, tills du raderar din data eller tills iOS rensar cachen | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Påminnelser du själv har slagit på (text och klockslag) | Telefonens notissystem | Så att påminnelsen kan visas i tid, även när appen är stängd | Tills du stänger av påminnelsen | Inställningar → Påminnelser, eller Inställningar → Data → Radera all data |
> | Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet och när appen senast laddades om efter en uppdatering | sessionStorage (lagom-korg, lagom-onboarding, lagom-chunk-reload) | Så att inget försvinner om appen laddas om | Tills du stänger appen | Stäng appen |
> | Produktbilder du har visat | Appens cache | Så att bilderna visas snabbt | Tills iOS rensar cachen | Avinstallera appen |
>
> Allt rensas också om du avinstallerar appen.

> **I Google Play-appen står i stället:**
>
> Lagom sparar det som behövs för att appen ska fungera i appens lagring på telefonen: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.
>
> | Vad | Var | Varför | Hur länge | Så rensar du |
> | --- | --- | --- | --- | --- |
> | Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering, påminnelser och inställningar | IndexedDB | Det är själva dagboken – appen fungerar inte utan den | Tills du raderar den | Inställningar → Data → Radera all data |
> | Allergier och intoleranser som du markerar (uppgifter om hälsa) | IndexedDB (lagom-profile, bland inställningarna) | För att varsamt flagga produkter från Open Food Facts som innehåller det du har markerat – det räknas fram på enheten | Tills du avmarkerar dem eller raderar all data | Inställningar → Allergier och överkänslighet, eller Inställningar → Data → Radera all data |
> | Licens och när provperioden startade | IndexedDB | För att veta om Lagom är upplåst | Tills du tar bort den. Provperiodens startdatum finns kvar när du raderar din data, så att provperioden inte börjar om | Licensen: Inställningar → Data → Radera all data med valet Ta även bort licensen. Provperiodens startdatum: avinstallera appen |
> | Spärrlistan: licens-id för licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits | localStorage (lagom-sparrlista) | Så att en återkallad licens slutar gälla även utan uppkoppling | Tills en nyare lista hämtas | Avinstallera appen |
> | Köp i appen som gäller: vilken licens (eller provperiod), köpdatum och slutdatum – bara i apparna | localStorage (lagom-butikskop) | Så att Lagom är upplåst även när butiken inte svarar, till exempel utan uppkoppling | Tills butiken svarar med nya uppgifter – ett återbetalt köp försvinner då även här | Avinstallera appen |
> | Tema (ljust eller mörkt) | localStorage (lagom-theme) | Så att appen startar i rätt färger utan att blinka | Tills du byter tema | Inställningar → Utseende och visning |
> | Små visningsval, till exempel dolda tips och pausad animation | localStorage | Så att appen minns dina val | Tills du ändrar dem | Avinstallera appen |
> | När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data | localStorage (lagom-sparad:…) | Så att en äldre kopia av dagboken aldrig skriver över en nyare | Tills du avinstallerar appen | Avinstallera appen |
> | Markering att exempeldata visas | localStorage (lagom-demo) | Så att appen vet att det är exempeldata | Tills du börjar med din egen profil | Börja med din egen profil, eller Inställningar → Data → Radera all data |
> | När du senast sparade en säkerhetskopia | localStorage (lagom-last-backup) | För att påminna dig om att spara en ny | Tills du raderar din data | Inställningar → Data → Radera all data |
> | Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden | localStorage (lagom-error-log) | För felsökning – den skickas bara om du själv mejlar den till oss | De 20 senaste felen | Om Lagom → Felsökning → Rensa felloggen |
> | Kopplingen till Apple Hälsa eller Health Connect: vad du har valt att hämta och skicka, när den senast synkade och en liten logg (id för hämtade vikter samt de senaste dagarnas ifyllda steg och skickade summor), så att inget hämtas eller skickas två gånger | localStorage (lagom-health) | Så att kopplingen fungerar utan dubbletter – bara i apparna och bara om du slår på den | Tills du kopplar från, raderar din data eller avinstallerar appen. Loggen sparar bara de senaste dagarna (hämtade vikter högst 400 dagar) | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Automatisk kopia av dagboken, med samma innehåll som en säkerhetskopia – bara i apparna | En fil i appens egen mapp på telefonen (lagom-spegling.json) – på iPhone utanför telefonens säkerhetskopia | Så att dagboken inte försvinner om telefonen rensar appens lagring | Uppdateras högst fem minuter efter en ändring och när du lämnar appen. Finns tills du raderar din data eller avinstallerar appen | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Framstegsbilder som du själv har tagit eller valt – nedskalade och utan platsuppgifter eller annan information från bildfilen. Bara om du slår på framstegsbilder | Filer i appens egen mapp på telefonen (mappen framsteg). När du tar en bild med kameran skriver kameraappen först en tillfällig originalbild – med de platsuppgifter kameran eventuellt lägger till – i appens mapp på telefonens lagringsutrymme. Den tas bort så snart bilden har skalats ned, och annars nästa gång du öppnar appen eller Framstegsbilder, eller raderar all data | Så att du kan se och jämföra dina bilder över tid. De följer inte med i säkerhetskopian, i den automatiska kopian eller i Googles säkerhetskopia i molnet, och skickas aldrig till oss. De kan flyttas med när du för över allt direkt till en ny telefon | Tills du raderar dem eller avinstallerar appen | Vikt & mått → Framstegsbilder → Radera alla bilder (eller en bild i taget), Inställningar → Data → Radera all data, eller avinstallera appen |
> | Den senaste filen du har exporterat eller delat (säkerhetskopia, CSV eller ett delat recept eller en delad måltid) – bara i apparna | Appens cache (mappen delning) | Så att filen kan sparas eller delas med telefonens delningsblad | Tills nästa export, tills du raderar din data eller tills telefonen rensar cachen | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Påminnelser du själv har slagit på (text och klockslag) – bara i apparna | Telefonens notissystem | Så att påminnelsen kan visas i tid, även när appen är stängd | Tills du stänger av påminnelsen | Inställningar → Påminnelser, eller Inställningar → Data → Radera all data |
> | Sammanfattning för widgeten på hemskärmen, för i dag och de sex följande dagarna: hur mycket energi du har ätit och har kvar av dagsmålet (inte i medvetet läge), antal loggade måltider, vatten och en pågående fasta. Inga livsmedel, måltidsnamn eller exempeldata | Appens egen lagring på telefonen (SharedPreferences-filen lagom-widget), som inte följer med i Googles säkerhetskopia i molnet | Så att widgeten kan visa dagens siffror även när appen är stängd. Den sparas även om du inte har lagt till widgeten, men syns bara om du själv lägger till den på hemskärmen – och då för alla som ser skärmen | Skrivs över när något ändras i appen. Finns tills du raderar din data eller avinstallerar appen | Inställningar → Data → Radera all data, eller avinstallera appen |
> | Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet och när appen senast laddades om efter en uppdatering | sessionStorage (lagom-korg, lagom-onboarding, lagom-chunk-reload) | Så att inget försvinner om appen laddas om | Tills du stänger appen | Stäng appen |
> | Produktbilder du har visat | Appens cache | Så att bilderna visas snabbt | Tills Android rensar cachen | Avinstallera appen |
>
> Allt rensas också om du avinstallerar appen.

> **Till ägaren:** Hemskärmswidgeten i Android-appen (raden om lagom-widget och stycket under ”Din dagbok finns bara på din enhet”) beskriver exakt vad src/lib/widgetSummary.ts skickar till widgeten: energi kvar och ätit (inte i medvetet läge), antal loggade måltider, vatten och en pågående fasta – inga livsmedel och aldrig exempeldata. Ändras det som widgeten visar måste raden, stycket, docs/WIDGET.md §5 och supportsidan ses över först. Raden och stycket får inte finnas i iPhone-appens text förrän iPhone-widgeten finns (WIDGET_IOS_READY i src/native/widget.ts).

## Tjänster som appen kontaktar

För att appen ska fungera kontaktar den några tjänster på internet. Varje gång det sker ser mottagaren din IP-adress – så fungerar internet. Din dagbok, ditt namn och din e-post skickas aldrig med.

- Netlify, vårt webbhotell: när du öppnar Lagom på webben hämtas appen därifrån, och där körs också våra serverfunktioner – för köp på webben, för spärrlistan över återkallade licenser och för receptimport. Apparna för iPhone och Android har sina filer med sig och anropar bara serverfunktionerna. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.
- Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).
- Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.
- Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.
- App Store och Google Play: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen butiken via din telefon.
- Stripe: när du köper en licens på webben (se ”När du köper”). _(bara webben)_
- Spärrlistan: har du aktiverat en licensnyckel hämtar appen ungefär en gång per dygn en lista över licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits. Inget om dig skickas med – kontrollen görs på enheten. _(inte i iPhone-appen)_

> **I iPhone-appen (App Store) står i stället:**
>
> - Netlify, vårt webbhotell: där körs våra serverfunktioner. iPhone-appen anropar dem bara när du hämtar ett recept från en webbadress. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.
> - Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).
> - Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.
> - Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.
> - App Store: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen App Store via din telefon.

> **I Google Play-appen står i stället:**
>
> - Netlify, vårt webbhotell: där körs våra serverfunktioner – för spärrlistan över återkallade licenser och för receptimport. Android-appen har sina filer med sig och anropar bara serverfunktionerna. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.
> - Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).
> - Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.
> - Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.
> - Google Play: när du köper i appen, trycker på Återställ köp eller öppnar appen (för att se vilka köp som gäller) kontaktar appen Google Play via din telefon.

## Dela recept och sparade måltider

Du kan dela ett eget recept eller en sparad måltid som länk eller fil. Då följer bara det du har valt med: namn, ingredienser eller livsmedel och mängder och – för recept – portioner, emoji, tid, märkningar, instruktioner och länk till källan. För livsmedel som inte finns i Lagoms egen lista (egna livsmedel och produkter från Open Food Facts eller Livsmedelsverket) följer även märke, kategori, näringsvärden per 100 g och portioner med. Ingenting ur din dagbok, din profil, dina mål eller dina allergiinställningar följer med, och inte heller uppgifter om allergener.

Receptet ligger i själva länken, efter tecknet #. Den delen skickas inte till Lagoms webbplats när länken öppnas – webbplatsen tar bara emot en vanlig sidvisning. Länken går däremot genom den app du själv skickar den med, till exempel e-post eller en meddelandeapp, och alla som har länken kan se innehållet. Detsamma gäller en fil som du delar.

Det som delas med dig visas först på skärmen. Det sparas bland dina recept, sparade måltider och egna livsmedel på enheten bara om du väljer Spara.

## Kameran

Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på enheten och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i enhetens eller webbläsarens inställningar.

I apparna används telefonens egen streckkodsläsare: Apples inbyggda bildanalys på iPhone och den öppna läsaren ZXing, som ingår i appen, på Android. Båda läser koden på telefonen och skickar ingenting vidare.

Du kan också fylla i ett eget livsmedel från förpackningen genom att läsa av näringsdeklarationen med telefonens egen textigenkänning (till exempel Skanna text på iPhone) eller klistra in texten. Textigenkänningen är telefonens egen funktion och ingen del av Lagom – Lagom får bara texten, som tolkas direkt på enheten och inte sparas. Bara de värden du själv väljer att spara hamnar i det egna livsmedlet.

Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara på din enhet (se ”Din dagbok finns bara på din enhet”).

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på telefonen med Apples inbyggda bildanalys och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens Inställningar.
>
> Du kan också fylla i ett eget livsmedel från förpackningen genom att välja Skanna text i textrutan eller klistra in texten från näringsdeklarationen. Textigenkänningen sköts av din iPhone och Lagom får bara texten, som tolkas direkt på telefonen och inte sparas – bara de värden du själv väljer att spara hamnar i det egna livsmedlet.
>
> Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara i appen på din iPhone (se ”Din dagbok finns bara på din enhet”).

> **I Google Play-appen står i stället:**
>
> Lagom använder kameran när du skannar en streckkod. Bilden analyseras direkt på telefonen med den öppna läsaren ZXing, som ingår i appen, och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens inställningar.
>
> Du kan också fylla i ett eget livsmedel från förpackningen genom att kopiera texten i näringsdeklarationen med telefonens textigenkänning och klistra in den. Textigenkänningen är telefonens egen funktion och ingen del av Lagom – Lagom får bara texten, som tolkas direkt på telefonen och inte sparas. Bara de värden du själv väljer att spara hamnar i det egna livsmedlet.
>
> Har du slagit på framstegsbilder kan du också ta en bild med kameran eller välja en bild. Bara den bild du själv tar eller väljer används – den skalas ned, rensas från platsuppgifter och annan information från bildfilen och sparas bara i appen på din telefon (se ”Din dagbok finns bara på din enhet”).

> **Till ägaren:** Android-appen läser streckkoder med ZXing (src/native/barcode.ts, ANDROID_SCANNING_LIBRARY). Byter ni till Google ML Kit skickar det enligt Googles redovisning driftdata till Google (enhet, app, identifierare, prestanda och felkoder) – då måste texten här, Data safety och frågan om samtycke (LEK 9 kap. 28 §) ses över först. ”Fyll i från förpackningen” (src/lib/nutritionLabel.ts, features/add/LabelTextImport.tsx) har ingen egen kamera- eller OCR-kod och lagrar ingenting (därför ingen rad i lagringstabellen): telefonens textigenkänning ger bara text. Byggs en egen textigenkänning med kameran in (t.ex. ett nytt tillägg) måste texten här, Info.plist, PrivacyInfo.xcprivacy och Data safety ses över först.

## Mikrofonen och röstsökning

Röstsökningen är valfri. I webbläsare som kan tolka tal direkt på enheten (till exempel nyare versioner av Chrome) finns en mikrofonknapp i sökfältet. Webbläsaren frågar om lov att använda mikrofonen först när du trycker på knappen.

Rösten tolkas helt på din enhet av webbläsarens inbyggda taligenkänning: Lagom kräver igenkänning på enheten och använder aldrig en taltjänst på nätet. Ljudet skickas inte till Lagom eller någon annan, och ingenting sparas. Den tolkade texten hamnar i sökfältet och används som om du hade skrivit den – en sökning i Open Food Facts görs bara om du själv trycker på Sök i Open Food Facts.

Saknar enheten svensk taligenkänning kan du välja att låta webbläsaren hämta den en gång. Nedladdningen sköts av webbläsaren (i Chrome från Google), och Lagom skickar inga uppgifter i samband med den. Röstsökningen finns inte i Safari, i andra webbläsare på iPhone och iPad eller i apparna.

> **I iPhone-appen (App Store) står i stället:**
>
> Rubrik: Mikrofonen
>
> Lagom använder inte mikrofonen i appen på din iPhone – där finns ingen röstsökning.

> **I Google Play-appen står i stället:**
>
> Rubrik: Mikrofonen
>
> Lagom använder inte mikrofonen i appen på din telefon – där finns ingen röstsökning.

> **Till ägaren:** Röstsökningen (src/lib/voiceSearch.ts) lagrar ingenting och har därför ingen rad i lagringstabellen. Den kräver microphone=(self) i Permissions-Policy (netlify.toml). Den får bara använda taligenkänning på enheten (processLocally) – tillåts någon gång en reserv till en taltjänst på nätet (t.ex. webkitSpeechRecognition, som i Chrome skickar ljudet till Google) måste texten här, mottagarna och frågan om samtycke ses över först.

## Apple Hälsa och Health Connect

I apparna för iPhone och Android kan du koppla Lagom till Apple Hälsa (iPhone) eller Health Connect (Android). Kopplingen är avstängd från början, och du väljer själv vad Lagom får läsa och skriva – telefonen frågar om lov för varje datatyp.

Lagom kan läsa din vikt (nya vägningar hamnar i viktkurvan) och dina steg (fylls i under Träning). Lagom kan skriva energi från det du äter och dricker, vatten och vikter som du loggar i Lagom. Mat och vatten skickas dagen efter, när dagen är avslutad.

Allt läses och skrivs direkt på telefonen. Uppgifterna från Apple Hälsa och Health Connect skickas aldrig till oss eller någon annan, används inte för reklam eller marknadsföring och delas inte vidare. Det som hämtas sparas i din dagbok på telefonen, som allt annat du loggar. Det Lagom har skickat till Apple Hälsa eller Health Connect finns kvar där om du kopplar från – där kan du ta bort det.

Lagoms användning av uppgifter från Health Connect följer Health Connects behörighetspolicy, inklusive kraven på begränsad användning.

Du kan när som helst stänga av kopplingen i Lagom (Inställningar → Apple Hälsa eller Health Connect) och ta tillbaka behörigheterna i Hälsa-appen (din profilbild → Appar → Lagom) eller i Health Connect (Appbehörigheter → Lagom).

> **I iPhone-appen (App Store) står i stället:**
>
> Rubrik: Apple Hälsa
>
> Du kan koppla Lagom till Apple Hälsa. Kopplingen är avstängd från början, och du väljer själv vad Lagom får läsa och skriva – din iPhone frågar om lov för varje datatyp.
>
> Lagom kan läsa din vikt (nya vägningar hamnar i viktkurvan) och dina steg (fylls i under Träning). Lagom kan skriva energi från det du äter och dricker, vatten och vikter som du loggar i Lagom. Mat och vatten skickas dagen efter, när dagen är avslutad.
>
> Allt läses och skrivs direkt på din iPhone. Uppgifterna från Apple Hälsa skickas aldrig till oss eller någon annan, används inte för reklam eller marknadsföring och delas inte vidare. Det som hämtas sparas i din dagbok på telefonen, som allt annat du loggar. Det Lagom har skickat till Apple Hälsa finns kvar där om du kopplar från – du tar bort det i Hälsa-appen.
>
> Du kan när som helst stänga av kopplingen i Lagom (Inställningar → Apple Hälsa) och ta tillbaka behörigheterna i Hälsa-appen: tryck på din profilbild och välj Appar → Lagom.

> **Till ägaren:** Google granskar texten i Health Connect-deklarationen (Play Console → Appinnehåll → Hälsoappar). Datatyperna här ska stämma med AndroidManifest.xml, Info.plist och motiveringarna i docs/NATIVE.md §6. Ändras de i src/native/health.ts måste policyn uppdateras först.

## Påminnelser

I apparna för iPhone och Android kan du slå på påminnelser, till exempel om måltider, vatten eller säkerhetskopian. Allt är avstängt från början, och telefonen frågar om lov att visa notiser först när du slår på en påminnelse.

Påminnelserna schemaläggs i telefonens eget notissystem och visas av telefonen, även när appen är stängd. Inget skickas via internet, och texterna nämner aldrig kalorier eller vikt. Du stänger av dem under Inställningar → Påminnelser eller i telefonens inställningar för notiser.

> **I iPhone-appen (App Store) står i stället:**
>
> Du kan slå på påminnelser, till exempel om måltider, vatten eller säkerhetskopian. Allt är avstängt från början, och din iPhone frågar om lov att visa notiser först när du slår på en påminnelse.
>
> Påminnelserna schemaläggs i telefonens eget notissystem och visas av telefonen, även när appen är stängd. Inget skickas via internet, och texterna nämner aldrig kalorier eller vikt. Du stänger av dem under Inställningar → Påminnelser eller under Inställningar → Notiser på din iPhone.

## När du köper

I App Store och Google Play sköter Apple respektive Google betalningen. Köpet görs i butikens eget köpfönster, direkt mellan telefonen och butiken – det går inte via oss eller någon annan tjänst. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Bekräftelsen hämtas från butiken när appen startar, och den senast hämtade (vilken licens, köpdatum och slutdatum) sparas bara på telefonen, så att Lagom fungerar även utan uppkoppling. I iPhone-appen startas provperioden med ett gratis köp i App Store på samma sätt. Apple och Google ansvarar själva för sin behandling.

På webben sköter Stripe betalningen. Stripe behandlar din e-postadress, ditt namn, land, betalkortsuppgifter (eller uppgifter för det betalsätt du väljer) och köp-id. Väljer du Klarna, Swish, Apple Pay eller Google Pay behandlar de också dina uppgifter enligt sina villkor. Vi ser köpet i Stripe – e-post, namn, land, belopp, licens och köp-id – men aldrig dina kortuppgifter. Vid köpet sparas köp-id, licenstyp och när du samtyckte till omedelbar leverans på köpet hos Stripe – vi har ingen egen databas – så att vi kan utfärda licensen, hjälpa dig om du tappar nyckeln, spärra licensen om köpet återbetalas och sköta bokföringen.

Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.

Tappar du nyckeln kan du be om den igen med din e-post och ditt kvittonummer (eller köp-id). Uppgifterna skickas via vår serverfunktion till Stripe för att hitta köpet och sparas inte hos oss.

> **I iPhone-appen (App Store) står i stället:**
>
> I App Store sköter Apple betalningen. Köpet görs i App Stores eget köpfönster, direkt mellan telefonen och Apple – det går inte via oss eller någon annan tjänst. Appen får bara en bekräftelse på köpet – vilken licens eller provperiod och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Provperioden startas på samma sätt, med ett gratis köp i App Store. Bekräftelsen hämtas från App Store när appen startar, och den senast hämtade (vilken licens eller provperiod, köpdatum och slutdatum) sparas bara på telefonen, så att Lagom fungerar även utan uppkoppling. Apple ansvarar själv för sin behandling.

## Varför vi får behandla uppgifterna

Vi behandlar bara personuppgifter när dataskyddsförordningen (GDPR) ger stöd för det:

- Avtal (artikel 6.1 b): för att sälja och leverera licensen, hjälpa dig med köpet och ge dig de funktioner du ber om, till exempel sökning och streckkodsläsning.
- Rättslig förpliktelse (artikel 6.1 c): för att bokföra köpet enligt bokföringslagen.
- Berättigat intresse (artikel 6.1 f): för säkerhet, för att begränsa missbruk av våra serverfunktioner, för spärrlistan över återkallade licenser och för att kunna svara när du kontaktar oss. Du kan invända mot sådan behandling (se ”Dina rättigheter”).

> **I iPhone-appen (App Store) står i stället:**
>
> - Avtal (artikel 6.1 b): för att ge dig de funktioner du ber om, till exempel sökning, streckkodsläsning och receptimport, och för att hjälpa dig med köp i appen.
> - Rättslig förpliktelse (artikel 6.1 c): för att bokföra försäljningen i App Store enligt bokföringslagen.
> - Berättigat intresse (artikel 6.1 f): för säkerhet, för att begränsa missbruk av våra serverfunktioner och för att kunna svara när du kontaktar oss. Du kan invända mot sådan behandling (se ”Dina rättigheter”).

## Hur länge vi sparar

- Bokföringsunderlag, till exempel kvitton och utbetalningsrapporter: så länge bokföringslagen kräver (7 kap. 2 §) – i dag till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades.
- Supportmejl: i 24 månader efter vår senaste kontakt, om de inte behövs längre för en pågående reklamation eller för bokföringen.
- Serverloggar hos Netlify: enligt Netlifys lagringstid för loggar.
- Anropsbegränsning: Netlify och våra funktioner använder IP-adressen bara en kort stund – några minuter – för att begränsa missbruk.
- Din dagbok: tills du själv raderar den – vi har ingen kopia.
- Uppgifter från Apple Hälsa eller Health Connect: bara på telefonen, i din dagbok, tills du raderar dem.
- Köp på webben: uppgifterna om köpet finns kvar hos Stripe lika länge som bokföringsunderlaget. Stripe sparar också uppgifter enligt sina egna regler. _(bara webben)_

Apple och Google sparar uppgifter om köp i butikerna enligt sina egna regler.

> **I iPhone-appen (App Store) står i stället:**
>
> - Bokföringsunderlag, till exempel kvitton och utbetalningsrapporter: så länge bokföringslagen kräver (7 kap. 2 §) – i dag till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades.
> - Supportmejl: i 24 månader efter vår senaste kontakt, om de inte behövs längre för en pågående reklamation eller för bokföringen.
> - Serverloggar hos Netlify: enligt Netlifys lagringstid för loggar.
> - Anropsbegränsning: Netlify och våra funktioner använder IP-adressen bara en kort stund – några minuter – för att begränsa missbruk.
> - Din dagbok: tills du själv raderar den – vi har ingen kopia.
> - Uppgifter från Apple Hälsa: bara på din iPhone, i din dagbok, tills du raderar dem.
>
> Apple sparar uppgifter om köp i App Store enligt sina egna regler.

> **Till ägaren:** Kontrollera hur länge loggar sparas i din Netlify-plan och skriv gärna in tiden här.

## Mottagare och överföringar utanför EU

Vi säljer aldrig uppgifter och lämnar inte ut dem till någon annan, om vi inte måste enligt lag. De här tar emot uppgifter för vår räkning som personuppgiftsbiträden:

- Netlify, Inc. (USA) – webbhotell och serverfunktioner.
- Vår e-posttjänst – när du mejlar oss.
- Stripe (Stripe Payments Europe Ltd, Irland) – betalningar på webben. Stripe är vårt personuppgiftsbiträde för själva betalningen, men självständigt personuppgiftsansvarig för till exempel bedrägerikontroll och lagkrav. _(bara webben)_

Våra biträden kan föra över uppgifter till USA. Det sker med stöd av EU–US Data Privacy Framework (för certifierade företag) och EU-kommissionens standardavtalsklausuler.

Apple, Google, Open Food Facts och Livsmedelsverket är själva ansvariga för den behandling de gör när du använder deras tjänster.

> **I iPhone-appen (App Store) står i stället:**
>
> Våra biträden kan föra över uppgifter till USA. Det sker med stöd av EU–US Data Privacy Framework (för certifierade företag) och EU-kommissionens standardavtalsklausuler.
>
> Apple, Open Food Facts och Livsmedelsverket är själva ansvariga för den behandling de gör när du använder deras tjänster.

> **Till ägaren:** Kontrollera att e-posttjänsten du använder för support har ett personuppgiftsbiträdesavtal (ett privat gratiskonto har det oftast inte) och skriv gärna in dess namn. Netlifys och Stripes avtal (DPA) ingår i deras villkor – spara en kopia. Väljer du RevenueCat för köpen i appen blir RevenueCat också ett biträde – lägg då till det här, i registerförteckningen och i App Privacy/Data safety före inskickningen.

## Barn och unga

Lagom är gjord för vuxna, 18 år och äldre, och går inte att använda om du är yngre. Funderar du på mat och vikt – prata gärna med en vuxen, skolsköterskan eller [1177](https://www.1177.se).

Vi samlar inte in uppgifter om barn. Din dagbok stannar på enheten oavsett ålder – vi får inga uppgifter om dig när du använder appen.

## Ingen reklam, ingen spårning

Lagom visar ingen reklam och innehåller inga analysverktyg, spårningspixlar, reklam-id eller andra tredjepartsskript. Vi bygger inga profiler om dig, fattar inga automatiska beslut och säljer aldrig uppgifter.

Skulle vi någon gång vilja lägga till något sådant frågar vi om ditt samtycke först och uppdaterar den här policyn.

## Dina rättigheter

Du har rätt att:

- Få veta vilka uppgifter vi har om dig och få en kopia (registerutdrag).
- Få felaktiga uppgifter rättade.
- Få uppgifter raderade – bokföringsunderlag måste vi dock spara så länge lagen kräver.
- Få ut dina uppgifter i ett maskinläsbart format (dataportabilitet). Din dagbok exporterar du själv under Inställningar → Data.
- Invända mot behandling som bygger på vårt berättigade intresse, och begära att behandlingen begränsas.

Din dagbok raderar du själv under Inställningar → Data – vi har ingen kopia. För uppgifter om köp och support: mejla [E-post]. Vi svarar inom en månad.

Tycker du att vi behandlar uppgifter fel kan du klaga hos Integritetsskyddsmyndigheten (IMY), [imy.se](https://www.imy.se).

## Ändringar i policyn

Vi uppdaterar policyn när Lagom ändras, till exempel om en ny tjänst kopplas in. Datumet överst visar vilken version som gäller. Om större ändringar berättar vi i appen innan de börjar gälla.

## Kontakt

Frågor om integritet och dina uppgifter: [E-post].

Post: [Företagsnamn], [Adress].

Läs också [köp- och användarvillkoren](KOPVILLKOR.md).
