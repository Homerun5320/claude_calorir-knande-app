<!-- Genereras från src/features/legal/legalContent.ts – ändra texten där och kör: npx vitest run src/features/legal -u -->

# Köp- och användarvillkor för Lagom

**Version 2026-10-01** · gäller från 1 oktober 2026

> **Utkast – ska ses över av ägaren.** Villkoren är skrivna för att stämma med hur köpet och appen fungerar i version 1.0. De är inte granskade av en jurist.

### Beslut som texten bygger på (2026-09-28)

- Säljaren är en enskild firma. Lansering bara i Sverige; Lagom är gjord för vuxna (18 år och äldre).
- Priser på webben: Årslicens 349 kr och Livstidslicens 699 kr inklusive 25 % moms (`src/config/commerce.ts`). I butikerna sätts priset i App Store Connect och Play Console.
- Livstid betyder för alltid. Felrättningar ingår – nya funktioner utlovas inte.
- I apparna från App Store och Google Play görs köpet bara som köp i appen, och köp återställs med Återställ köp. I App Store-appen kan inga licensnycklar aktiveras.
- Provperioden (14 dagar) startar först när den egna profilen skapas.
- Licenser från återbetalda webbköp spärras (spärrlista).

### Att fylla i av ägaren

- [ ] **Företagsnamn** – för enskild firma ditt namn eller det registrerade firmanamnet → `VITE_SELLER_NAME`
- [ ] **Organisationsnummer** (frivilligt) – för enskild firma samma som ditt personnummer → `VITE_SELLER_ORGNR`. Sätter du det visas det i appen, i villkoren och på varje kvitto. Lämnar du det tomt utelämnas det överallt, och bygget ger bara en varning. Distansavtalslagen (2 kap. 2 §) kräver namn, adress, telefon och e-post; e-handelslagen (8 §) kräver registreringsnummer om firman finns i handelsregistret. Fråga Verksamt eller en jurist vad som gäller för just din firma (se ”Låt en jurist granska”).
- [ ] **Postadress** → `VITE_SELLER_ADDRESS`
- [ ] **Telefon** → `VITE_SELLER_PHONE`
- [ ] **Momsregistreringsnummer** (om firman är momsregistrerad) → `VITE_SELLER_VAT`
- [ ] **E-post för support** – en riktig adress som du läser → `VITE_SUPPORT_EMAIL`

Variablerna sätts i Netlify (Site configuration → Environment variables). Appen visar dem automatiskt, och när sajten byggs fylls platshållarna i de fristående sidorna i ([Företagsnamn], [Org.nr], [Adress], [Telefon], [Momsreg.nr], [E-post]). Här i docs står platshållarna kvar. Saknas en obligatorisk uppgift visar appen ”[fylls i av ägaren]”, och bygget för butikerna och för skarpa webbköp stoppas. Organisationsnumret och momsregistreringsnumret är frivilliga – saknas de tas de bort ur texten.

- [ ] Ta reda på om firman ska vara momsregistrerad eller momsbefriad (fråga Skatteverket). Texterna förutsätter 25 % moms – se **Till ägaren** under ”Pris och betalning”. Utan momsregistrering finns inget momsregistreringsnummer att fylla i.
- [ ] Sätt `VITE_TERMS_URL` till `https://<din domän>/villkor/`, så att köpsidan och Stripe länkar till villkoren.
- [ ] Välj Apples standard-EULA i App Store Connect (se docs/ANVANDARVILLKOR.md).
- [ ] Gå igenom punkterna märkta **Till ägaren** nedan (livstid, svarstid och ARN).

### Låt en jurist granska

- Ångerrätten för digitalt innehåll (samtycke och bekräftelse på varaktigt medium) och den nya ångerfunktionen för avtal online som EU-direktiv 2023/2673 kräver från 19 juni 2026 – det är inte kontrollerat hur den ska se ut när ångerrätten redan har upphört.
- Ansvarsbegränsningen – den får inte inskränka tvingande konsumentregler.
- Definitionen av livstid.
- Informationen enligt e-handelslagen 10 § (stegen, arkivering, rätta inmatningsfel, språk) och säljaruppgifterna före köpet (distansavtalslagen 2 kap. 2 §).
- Köp av minderåriga (föräldrabalken 9 kap.).

### Appen och den publicerade sidan

I appen finns villkoren på sidan Köp- och användarvillkor (`#/villkor`). I apparna från App Store och Google Play visas inte avsnitten som bara gäller köp på webben (pris i kronor, Stripe, ångerrätt vid webbköp) – där sköter butiken köpet. I iPhone-appen nämns bara iPhone och App Store; de texterna står nedan under _I iPhone-appen (App Store) står i stället_. Den publicerade sidan innehåller allt.

---

## Säljare

Lagom säljs av [Företagsnamn] (enskild firma, organisationsnummer [Org.nr]).

Adress: [Adress]. Telefon: [Telefon]. E-post: [E-post]. Momsregistreringsnummer: [Momsreg.nr].

Villkoren gäller när du köper en licens och när du använder Lagom. Hur vi hanterar personuppgifter står i [integritetspolicyn](INTEGRITETSPOLICY.md).

## Vad du köper

En personlig licens som låser upp allt i Lagom – inga tillägg och ingen reklam. Det finns två licenser:

- Årslicens: gäller i 365 dagar från köpet och förnyas inte automatiskt – inget dras igen. När året är slut väljer du själv om du vill köpa en ny.
- Livstidslicens: ett engångsköp utan årsavgift som gäller för alltid (se ”Livstidslicensen”).

Licensen är personlig. Du får använda den på dina egna enheter men inte dela den med andra eller sälja den vidare.

Din data låses aldrig: även utan giltig licens kan du se, exportera och radera allt.

## Pris och betalning

_Gäller köp på Lagoms webbplats – visas inte i butiksapparna._

Årslicensen kostar 349 kr och livstidslicensen 699 kr. Priserna är i svenska kronor inklusive 25 % moms, och inga andra avgifter tillkommer.

Betalningen sköts av Stripe. Du betalar med kort eller något av de andra betalsätt som visas hos Stripe. Vi ser eller sparar aldrig dina kortuppgifter.

> **Till ägaren:** Hela köpflödet (den här texten, köpsidan och kvittot) räknar med att firman är momsregistrerad och tar ut 25 % moms. En enskild firma med liten omsättning kan i stället vara momsbefriad (omsättningsgränsen var 120 000 kr per år när reglerna ändrades 2025 – kontrollera hos Skatteverket). Är firman momsbefriad får du inte ta ut moms, och texterna om moms här, på köpsidan och på kvittot måste ändras före lansering. Vid köp i App Store och Google Play sköter butiken momsen.

## Så går köpet till

_Gäller köp på Lagoms webbplats – visas inte i butiksapparna._

Så här köper du en licens på webben:

1. Välj licens under Lagom Premium.
2. Läs sammanfattningen och köpvillkoren och kryssa i att du vill ha licensen levererad direkt (och att ångerrätten då upphör).
3. Betala hos Stripe, där du också godkänner köpvillkoren. Innan du betalar kan du se och rätta dina uppgifter, till exempel e-post och kortnummer – eller gå tillbaka och välja en annan licens.
4. När betalningen är klar visas licensnyckeln, och den aktiveras på enheten.

Avtalet ingås på svenska. Köpet sparas hos Stripe och i vår bokföring. En bekräftelse med kvitto, de viktigaste villkoren och villkorens version skickas till den e-post du anger hos Stripe, och hela villkoren finns alltid på den här sidan med versionsdatum.

## Leverans och ångerrätt

_Gäller köp på Lagoms webbplats – visas inte i butiksapparna._

Licensen levereras direkt när betalningen är klar.

Vid köp på distans har du normalt 14 dagars ångerrätt. För digitalt innehåll som levereras direkt upphör ångerrätten när leveransen har påbörjats, om du uttryckligen har samtyckt till det och bekräftat att ångerrätten därmed upphör (2 kap. 11 § lagen om distansavtal och avtal utanför affärslokaler). Det gör du i rutan före betalningen, och en bekräftelse skickas till din e-post.

Din rätt att reklamera fel påverkas inte (se ”Fel och reklamation”).

## Funktion och kompatibilitet

Lagom fungerar i aktuella versioner av Safari, Chrome, Edge och Firefox, som installerad webbapp och som app från App Store (iPhone) och Google Play. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.

Din data sparas i den webbläsare eller app där du använder Lagom och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).

Köp i App Store eller Google Play följer ditt Apple- eller Google-konto – på en ny enhet trycker du på Återställ köp.

En licensnyckel från ett köp på webben klistrar du in under Inställningar → Licens på varje enhet där du vill använda den.

> **I iPhone-appen (App Store) står i stället:**
>
> Lagom fungerar på iPhone med en aktuell version av iOS. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.
>
> Din data sparas i appen på din iPhone och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).
>
> Köp i App Store följer ditt Apple-konto – på en ny iPhone trycker du på Återställ köp.

> **I Google Play-appen står i stället:**
>
> Lagom fungerar på Android-telefoner med en aktuell version av Android. Appen fungerar utan uppkoppling; sökning online, streckkoder, köp och receptimport kräver uppkoppling.
>
> Din data sparas i appen på din telefon och synkas inte mellan enheter. Du flyttar den med en säkerhetskopia (Inställningar → Data).
>
> Köp i Google Play följer ditt Google-konto – på en ny telefon trycker du på Återställ köp. Har du en licensnyckel klistrar du in den under Inställningar → Licens.

> **Till ägaren:** Skriv gärna in lägsta iOS- och Android-version när apparna är byggda (i iPhone-appen står i dag ”en aktuell version av iOS”).

## Fel och reklamation

Om Lagom inte fungerar som vi har lovat har du rätt att reklamera enligt konsumentköplagen (2022:260), som också gäller digitalt innehåll. Kontakta oss på [E-post] och beskriv felet inom skälig tid efter att du märkt det – inom två månader räknas alltid som i tid.

I första hand rättar vi felet. Går det inte har du rätt till prisavdrag eller att häva köpet och få pengarna tillbaka.

Har du köpt i App Store eller Google Play kan du också begära återbetalning hos butiken enligt dess villkor.

> **I iPhone-appen (App Store) står i stället:**
>
> Om Lagom inte fungerar som vi har lovat har du rätt att reklamera enligt konsumentköplagen (2022:260), som också gäller digitalt innehåll. Kontakta oss på [E-post] och beskriv felet inom skälig tid efter att du märkt det – inom två månader räknas alltid som i tid.
>
> I första hand rättar vi felet. Går det inte har du rätt till prisavdrag eller att häva köpet och få pengarna tillbaka.
>
> Har du köpt i App Store kan du också begära återbetalning hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com).

## Uppdateringar och support

Vi ger ut de uppdateringar som behövs för att Lagom ska fortsätta fungera som utlovat, även säkerhetsuppdateringar, under den tid du rimligen kan förvänta dig. Felrättningar ingår i båda licenserna medan licensen gäller – för livstidslicensen så länge vi ger ut Lagom. Nya funktioner kan komma, men de ingår inte i det du köper och utlovas inte.

Support ges på svenska via e-post: [E-post]. Vi svarar så snart vi kan, normalt inom några arbetsdagar.

> **Till ägaren:** Bekräfta svarstiden för supporten.

## Livstidslicensen

Livstidslicensen gäller för alltid – ingen tidsgräns och ingen årsavgift. Felrättningar ingår så länge vi ger ut Lagom; nya funktioner kan komma men utlovas inte. Om Lagom läggs ned fortsätter din version att fungera på din enhet så länge enheten stöder den.

Du betalar en gång, och du kan alltid exportera din data.

> **Till ägaren:** Ägaren ska bekräfta definitionen av livstid före lansering (beslut 2026-09-28: för alltid, felrättningar ingår, inga löften om nya funktioner). Texten är avsiktligt försiktig och är samma som i köparket och på kvittot (LIFETIME_PROMISE i src/config/commerce.ts) – lova inte mer i butikstexter eller i Stripe.

## Provperioden

De första 14 dagarna är gratis och allt är öppet. Inget kort behövs, och inget dras automatiskt när provperioden tar slut.

Provperioden startar när du skapar din egen profil – inte när du tittar på exempeldata. Den gäller en gång per enhet och börjar inte om om du raderar din data. I iPhone-appen startas den i stället med ett gratis köp i App Store och följer ditt Apple-konto.

Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.

> **I iPhone-appen (App Store) står i stället:**
>
> De första 14 dagarna är gratis och allt är öppet. Inget dras automatiskt när provperioden tar slut.
>
> Du startar provperioden med ett gratis köp i App Store när du har skapat din egen profil – att titta på exempeldata startar ingen provperiod. Provperioden följer ditt Apple-konto, gäller en gång och börjar inte om om du raderar din data eller installerar om appen.
>
> Efter provperioden kan du fortfarande se, exportera och radera allt – att logga nytt kräver ett köp.

## Köp i App Store och Google Play

Köper du Lagom i App Store eller Google Play sköter butiken betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i butiken. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com) eller i Google Play.

Köpet följer ditt Apple- eller Google-konto. På en ny telefon trycker du på Återställ köp i Lagom.

Köper du en ny årslicens i App Store innan den förra har gått ut börjar det nya året när det förra slutar. I Google Play kan en ny årslicens köpas när den förra har gått ut.

För köp i App Store gäller även Apples [standardvillkor för appar](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/). Din rätt att reklamera enligt konsumentköplagen påverkas inte.

> **I iPhone-appen (App Store) står i stället:**
>
> Rubrik: Köp i App Store
>
> Köper du Lagom i App Store sköter Apple betalningen, kvittot och eventuell återbetalning enligt sina villkor, och priset visas i App Store. Återbetalning begär du hos Apple på [reportaproblem.apple.com](https://reportaproblem.apple.com).
>
> Köpet följer ditt Apple-konto. På en ny iPhone trycker du på Återställ köp i Lagom.
>
> Köper du en ny årslicens innan den förra har gått ut börjar det nya året när det förra slutar – inga betalda dagar går förlorade.
>
> För köp i App Store gäller även Apples [standardvillkor för appar](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/). Din rätt att reklamera enligt konsumentköplagen påverkas inte.

## Användarvillkor

Villkoren gäller all användning av Lagom, även under provperioden och utan köp.

- Rätt att använda appen: du får använda Lagom för ditt eget, privata bruk. Du får inte kopiera, sälja eller sprida appen eller licensnycklar, kringgå licenskontrollen eller använda appen på ett sätt som skadar den eller andra.
- Inte medicinsk rådgivning: Lagom ger allmän information om mat och näring och är inte en medicinteknisk produkt. Mål och beräkningar är uppskattningar och ersätter inte råd från vården. Rådgör med vården om du har en sjukdom, är gravid eller ammar, eller funderar på att ändra din vikt – kontakta [1177](https://www.1177.se) vid frågor om hälsa. Tänker du mycket på mat och vikt finns stöd hos [Frisk & Fri](https://www.friskfri.se).
- Innehåll från andra: näringsvärden kommer från Livsmedelsverket, Open Food Facts och andra källor och kan innehålla fel. Jämför gärna med förpackningen.
- Din data: du ansvarar själv för din dagbok och för att spara säkerhetskopior. Vi har ingen kopia och kan inte återställa data som försvunnit från din enhet.
- Ansvarsbegränsning: i den utsträckning lagen tillåter ansvarar vi inte för indirekta skador, till exempel förlorad data eller beslut du fattar utifrån appens uppskattningar. Begränsningen inskränker aldrig dina rättigheter enligt tvingande konsumentlagstiftning.

> **I iPhone-appen (App Store) står i stället:**
>
> - Rätt att använda appen: du får använda Lagom för ditt eget, privata bruk. Du får inte kopiera, sälja eller sprida appen, kringgå licenskontrollen eller använda appen på ett sätt som skadar den eller andra.
> - Inte medicinsk rådgivning: Lagom ger allmän information om mat och näring och är inte en medicinteknisk produkt. Mål och beräkningar är uppskattningar och ersätter inte råd från vården. Rådgör med vården om du har en sjukdom, är gravid eller ammar, eller funderar på att ändra din vikt – kontakta [1177](https://www.1177.se) vid frågor om hälsa. Tänker du mycket på mat och vikt finns stöd hos [Frisk & Fri](https://www.friskfri.se).
> - Innehåll från andra: näringsvärden kommer från Livsmedelsverket, Open Food Facts och andra källor och kan innehålla fel. Jämför gärna med förpackningen.
> - Din data: du ansvarar själv för din dagbok och för att spara säkerhetskopior. Vi har ingen kopia och kan inte återställa data som försvunnit från din enhet.
> - Ansvarsbegränsning: i den utsträckning lagen tillåter ansvarar vi inte för indirekta skador, till exempel förlorad data eller beslut du fattar utifrån appens uppskattningar. Begränsningen inskränker aldrig dina rättigheter enligt tvingande konsumentlagstiftning.

## Minderåriga

Lagom är gjord för vuxna, 18 år och äldre, och går inte att använda om du är yngre. Funderar du på mat och vikt – prata gärna med en vuxen, skolsköterskan eller [1177](https://www.1177.se).

Lagom föreslår aldrig viktnedgång (kaloriunderskott) för den som kan vara under 18 år.

## Tvister

Är du inte nöjd – kontakta oss först på [E-post], så försöker vi lösa det.

Blir vi inte överens kan du vända dig till Allmänna reklamationsnämnden (ARN), [www.arn.se](https://www.arn.se). Vi medverkar i ARN:s handläggning.

Svensk lag gäller. En tvist kan också prövas av allmän domstol.

> **Till ägaren:** Du måste informera om ARN (lagen om alternativ tvistlösning i konsumentförhållanden). Att följa ARN:s rekommendationer är frivilligt men förtroendeingivande – bekräfta att du medverkar.

## Ändringar i villkoren

Villkoren har ett versionsdatum överst. Ändrar vi dem gäller den nya versionen för nya köp och för användning efter att ändringen börjat gälla – om större ändringar berättar vi i appen i förväg. En ändring gäller aldrig till din nackdel för en licens du redan har köpt.
