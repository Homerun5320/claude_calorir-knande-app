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

Det gäller även uppgifter om hälsa, till exempel vikt, graviditet och amning. De lämnar aldrig enheten om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.

Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort enheten eller rensar webbläsaren försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.

> **I iPhone-appen (App Store) står i stället:**
>
> Allt du fyller i och loggar – profil och mål, mat och dryck, vikt och mått, träning, fasta, recept, veckoplanering och anteckningar – sparas bara i appen på din iPhone. Lagom har inga konton och ingen server med dagböcker. Vi kan inte se, läsa eller återställa din data.
>
> Det gäller även uppgifter om hälsa, till exempel vikt, graviditet och amning. De lämnar aldrig telefonen om du inte själv exporterar dem eller skickar en säkerhetskopia till någon.
>
> Eftersom vi inte har någon kopia är det bra att spara en säkerhetskopia då och då under Inställningar → Data. Tappar du bort telefonen eller tar bort appen försvinner annars datan. Synkning mellan enheter finns inte i den här versionen – kommer den blir den frivillig, och den här policyn uppdateras först.

## Lagring på din enhet

Lagom sparar det som behövs för att appen ska fungera i enhetens lagring: IndexedDB, localStorage, sessionStorage och service workerns cache. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke till kakor.

| Vad | Var | Varför | Hur länge | Så rensar du |
| --- | --- | --- | --- | --- |
| Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering och inställningar | IndexedDB | Det är själva dagboken – appen fungerar inte utan den | Tills du raderar den | Inställningar → Data → Radera all data |
| Licens och när provperioden startade | IndexedDB | För att veta om Lagom är upplåst | Tills du tar bort den. Provperiodens startdatum finns kvar när du raderar din data, så att provperioden inte börjar om | Licensen: Inställningar → Data → Radera all data med valet Ta även bort licensen. Provperiodens startdatum: rensa webbplatsens data eller avinstallera appen |
| Spärrlistan: licens-id för licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits | localStorage (lagom-sparrlista) | Så att en återkallad licens slutar gälla även utan uppkoppling | Tills en nyare lista hämtas | Rensa webbplatsens data eller avinstallera appen |
| Tema (ljust eller mörkt) | localStorage (lagom-theme) | Så att appen startar i rätt färger utan att blinka | Tills du byter tema | Inställningar → Utseende och visning, eller rensa webbplatsens data |
| Små visningsval, till exempel dolda tips och pausad animation | localStorage | Så att appen minns dina val | Tills du ändrar dem | Rensa webbplatsens data |
| När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data | localStorage (lagom-sparad:…) | Så att flera öppna flikar med Lagom inte skriver över varandras ändringar | Tills du rensar webbplatsens data | Rensa webbplatsens data eller avinstallera appen |
| Markering att exempeldata visas | localStorage (lagom-demo) | Så att appen vet att det är exempeldata | Tills du börjar med din egen profil | Börja med din egen profil, eller Inställningar → Data → Radera all data |
| När du senast sparade en säkerhetskopia | localStorage (lagom-last-backup) | För att påminna dig om att spara en ny | Tills du raderar din data | Inställningar → Data → Radera all data |
| Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden | localStorage (lagom-error-log) | För felsökning – den skickas bara om du själv mejlar den till oss | De 20 senaste felen | Om Lagom → Felsökning → Rensa felloggen |
| Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet, om appen startats från Google Play och när appen senast laddades om efter en uppdatering | sessionStorage (lagom-korg, lagom-onboarding, lagom-twa, lagom-chunk-reload) | Så att inget försvinner om sidan laddas om – och så att appen inte laddas om gång på gång efter en uppdatering | Tills du stänger fliken eller appen | Stäng fliken eller appen |
| Appens filer, Livsmedelsverkets databas och produktbilder du har visat | Service workerns cache | Så att appen startar snabbt och fungerar utan uppkoppling | Tills en ny version ersätter filerna. Produktbilder högst 60 dagar | Rensa webbplatsens data i webbläsaren eller avinstallera appen |

Allt rensas också om du tar bort webbplatsens data i webbläsarens inställningar eller avinstallerar appen.

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom sparar det som behövs för att appen ska fungera i appens lagring på din iPhone: IndexedDB, localStorage, sessionStorage och en cache för bilder. Inget av det används för reklam eller spårning, och inget skickas till oss. All lagring är nödvändig för tjänsten du har bett om, så Lagom behöver inte fråga om samtycke.
>
> | Vad | Var | Varför | Hur länge | Så rensar du |
> | --- | --- | --- | --- | --- |
> | Dagbok, profil, mål, vikt, recept, egna och sparade livsmedel, veckoplanering och inställningar | IndexedDB | Det är själva dagboken – appen fungerar inte utan den | Tills du raderar den | Inställningar → Data → Radera all data |
> | När provperioden startade | IndexedDB | För att veta hur länge provperioden gäller. Köp i appen hämtas från App Store och sparas inte av Lagom | Tills du avinstallerar appen. Startdatumet finns kvar när du raderar din data, så att provperioden inte börjar om | Avinstallera appen |
> | Tema (ljust eller mörkt) | localStorage (lagom-theme) | Så att appen startar i rätt färger utan att blinka | Tills du byter tema | Inställningar → Utseende och visning |
> | Små visningsval, till exempel dolda tips och pausad animation | localStorage | Så att appen minns dina val | Tills du ändrar dem | Avinstallera appen |
> | När varje del av dagboken senast sparades – bara en slumpad tidsstämpel, ingen data | localStorage (lagom-sparad:…) | Så att en äldre kopia av dagboken aldrig skriver över en nyare | Tills du avinstallerar appen | Avinstallera appen |
> | Markering att exempeldata visas | localStorage (lagom-demo) | Så att appen vet att det är exempeldata | Tills du börjar med din egen profil | Börja med din egen profil, eller Inställningar → Data → Radera all data |
> | När du senast sparade en säkerhetskopia | localStorage (lagom-last-backup) | För att påminna dig om att spara en ny | Tills du raderar din data | Inställningar → Data → Radera all data |
> | Fellogg: högst 20 korta felbeskrivningar, utan livsmedel och värden | localStorage (lagom-error-log) | För felsökning – den skickas bara om du själv mejlar den till oss | De 20 senaste felen | Om Lagom → Felsökning → Rensa felloggen |
> | Korgen när du lägger till flera livsmedel, utkastet i välkomstflödet och när appen senast laddades om efter en uppdatering | sessionStorage (lagom-korg, lagom-onboarding, lagom-chunk-reload) | Så att inget försvinner om appen laddas om | Tills du stänger appen | Stäng appen |
> | Produktbilder du har visat | Appens cache | Så att bilderna visas snabbt | Tills iOS rensar cachen | Avinstallera appen |
>
> Allt rensas också om du avinstallerar appen.

## Tjänster som appen kontaktar

För att appen ska fungera kontaktar den några tjänster på internet. Varje gång det sker ser mottagaren din IP-adress – så fungerar internet. Din dagbok, ditt namn och din e-post skickas aldrig med.

- Netlify, vårt webbhotell: när du öppnar Lagom på webben eller i Google Play-appen hämtas appen därifrån, och där körs också våra serverfunktioner – för köp, för spärrlistan över återkallade licenser och för receptimport. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.
- Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).
- Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.
- Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.
- App Store och Google Play: när du köper i appen eller trycker på Återställ köp kontaktar appen butiken via din telefon.
- Stripe: när du köper en licens på webben (se ”När du köper”). _(bara webben)_
- Spärrlistan: har du aktiverat en licensnyckel hämtar appen ungefär en gång per dygn en lista över licenser som har återkallats, till exempel för att köpet har återbetalats eller bestridits. Inget om dig skickas med – kontrollen görs på enheten. _(inte i iPhone-appen)_

> **I iPhone-appen (App Store) står i stället:**
>
> - Netlify, vårt webbhotell: där körs våra serverfunktioner. iPhone-appen anropar dem bara när du hämtar ett recept från en webbadress. Netlify sparar IP-adressen en kort tid i sina loggar, och Netlify och våra funktioner använder den en kort stund för att begränsa missbruk.
> - Open Food Facts: när du söker efter livsmedel online, skannar en streckkod, öppnar en produkt från Open Food Facts som inte är sparad på enheten eller visar en produktbild skickas sökordet eller streckkoden dit, och bilden hämtas från deras server. Open Food Facts är en ideell förening i Frankrike och ansvarar själv för sin behandling – läs deras [integritetspolicy](https://world.openfoodfacts.org/privacy).
> - Livsmedelsverket: bara om du själv väljer att hämta hela databasen under Inställningar → Livsmedelsdatabas. Då anropas Livsmedelsverkets öppna API direkt från din enhet.
> - Receptimport: om du hämtar ett recept från en webbadress skickas adressen till vår serverfunktion, som hämtar receptet åt dig. Adressen sparas inte – går hämtningen inte att göra loggas bara webbplatsens namn, för felsökning.
> - App Store: när du köper i appen eller trycker på Återställ köp kontaktar appen App Store via din telefon.

## Kameran

Lagom använder kameran bara när du skannar en streckkod. Bilden analyseras direkt på enheten och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i enhetens eller webbläsarens inställningar.

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom använder kameran bara när du skannar en streckkod. Bilden analyseras direkt på telefonen och sparas inte – bara den avlästa streckkoden skickas till Open Food Facts för att hitta produkten. Du kan när som helst ta tillbaka tillståndet i telefonens Inställningar.

## När du köper

I App Store och Google Play sköter Apple respektive Google betalningen. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Apple och Google ansvarar själva för sin behandling.

På webben sköter Stripe betalningen. Stripe behandlar din e-postadress, ditt namn, land, betalkortsuppgifter (eller uppgifter för det betalsätt du väljer) och köp-id. Väljer du Klarna, Swish, Apple Pay eller Google Pay behandlar de också dina uppgifter enligt sina villkor. Vi ser köpet i Stripe – e-post, namn, land, belopp, licens och köp-id – men aldrig dina kortuppgifter. Vid köpet sparas köp-id, licenstyp och när du samtyckte till omedelbar leverans på köpet hos Stripe – vi har ingen egen databas – så att vi kan utfärda licensen, hjälpa dig om du tappar nyckeln, spärra licensen om köpet återbetalas och sköta bokföringen.

Licensnyckeln innehåller inte ditt namn eller din e-post – bara licenstyp, datum och ett köp-id som vi kan koppla till betalningen om du behöver hjälp.

Tappar du nyckeln kan du be om den igen med din e-post och ditt kvittonummer (eller köp-id). Uppgifterna skickas via vår serverfunktion till Stripe för att hitta köpet och sparas inte hos oss.

> **I iPhone-appen (App Store) står i stället:**
>
> I App Store sköter Apple betalningen. Appen får bara en bekräftelse på köpet – vilken licens och när – aldrig ditt namn, din e-post eller dina betalningsuppgifter. Apple ansvarar själv för sin behandling.

## Varför vi får behandla uppgifterna

Vi behandlar bara personuppgifter när dataskyddsförordningen (GDPR) ger stöd för det:

- Avtal (artikel 6.1 b): för att sälja och leverera licensen, hjälpa dig med köpet och ge dig de funktioner du ber om, till exempel sökning och streckkodsläsning.
- Rättslig förpliktelse (artikel 6.1 c): för att bokföra köpet enligt bokföringslagen.
- Berättigat intresse (artikel 6.1 f): för säkerhet, för att begränsa missbruk av våra serverfunktioner, för spärrlistan över återkallade licenser och för att kunna svara när du kontaktar oss. Du kan invända mot sådan behandling (se ”Dina rättigheter”).

## Hur länge vi sparar

- Bokföringsunderlag, till exempel kvitton och utbetalningsrapporter: så länge bokföringslagen kräver (7 kap. 2 §) – i dag till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades.
- Supportmejl: i 24 månader efter vår senaste kontakt, om de inte behövs längre för en pågående reklamation eller för bokföringen.
- Serverloggar hos Netlify: enligt Netlifys lagringstid för loggar.
- Anropsbegränsning: Netlify och våra funktioner använder IP-adressen bara en kort stund – några minuter – för att begränsa missbruk.
- Din dagbok: tills du själv raderar den – vi har ingen kopia.
- Köp på webben: uppgifterna om köpet finns kvar hos Stripe lika länge som bokföringsunderlaget. Stripe sparar också uppgifter enligt sina egna regler. _(bara webben)_

Apple och Google sparar uppgifter om köp i butikerna enligt sina egna regler.

> **I iPhone-appen (App Store) står i stället:**
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
