# Registerförteckning (artikel 30 GDPR)

> **Utkast – ska ses över av ägaren.** Förteckningen beskriver de personuppgifter som Lagom (du som företag) behandlar. Köpen behandlas löpande, så undantaget i artikel 30.5 för företag med färre än 250 anställda gäller inte – förteckningen behövs. Den ska inte publiceras, men ska kunna visas för Integritetsskyddsmyndigheten (IMY) om de frågar. Uppdatera den när något ändras och skriv datumet nedan.

- **Personuppgiftsansvarig:** [Företagsnamn], enskild firma, org.nr [Org.nr], [Adress], [E-post]
- **Dataskyddsombud:** inget (krävs inte för den här verksamheten)
- **Senast uppdaterad:** 2026-09-28

## Det här ingår inte

- **Dagboken i appen.** Allt användaren loggar (mat, vikt, hälsa, recept, profil) sparas bara på användarens enhet. Du tar aldrig emot det, så det ingår inte här. Så länge det inte finns någon server med dagböcker ska det förbli så.
- **Anrop direkt från enheten till Open Food Facts och Livsmedelsverket.** De beskrivs i integritetspolicyn. Du tar inte emot uppgifterna, men appens kod gör att de skickas – därför står de i policyn.
- **Lagom Moln (synk)** är avstängt i version 1.0. Slås det på behövs en ny rad här, en konsekvensbedömning (DPIA) och uttryckligt samtycke för hälsouppgifter innan start.

---

## 1. Köp på webben

| Fält | Beskrivning |
| --- | --- |
| Ändamål | Sälja licenser på webben, ta betalt, skicka kvitto och bekräftelse och bokföra köpet. |
| Rättslig grund | Avtal (art. 6.1 b). Rättslig förpliktelse – bokföringslagen (art. 6.1 c). |
| Registrerade | Köpare på webben. |
| Uppgifter | E-post, namn, land (och adress om den behövs för kvitto eller moms), köp-id, licenstyp, belopp och moms, tidpunkt, samtycke till omedelbar leverans och när det gavs. Betalkortsuppgifter hanteras bara av Stripe. Stripe ser också IP-adressen (bedrägerikontroll). |
| Mottagare | Stripe (Stripe Payments Europe Ltd, Irland) – personuppgiftsbiträde för betalningen, självständigt ansvarig för bland annat bedrägerikontroll och lagkrav. Netlify (serverfunktionerna create-checkout, verify-purchase och stripe-webhook) – biträde. Redovisningsbyrå eller bokföringsprogram: [fylls i av ägaren]. |
| Överföring utanför EU | USA (Stripe, Inc. och Netlify, Inc.) – EU–US Data Privacy Framework och EU-kommissionens standardavtalsklausuler. |
| Lagringstid | Bokföringsunderlag så länge bokföringslagen kräver (7 kap. 2 §): till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Köpet i Stripe lika länge. |
| Säkerhetsåtgärder | HTTPS. Stripes hemliga nycklar bara som hemligheter i Netlify, aldrig i `VITE_`-variabler (byggkontrollen stoppar det). En begränsad Stripe-nyckel med minsta möjliga behörighet. Tvåstegsverifiering på Stripe- och Netlify-kontona. Inga kortuppgifter hos oss. |

## 2. Licensutfärdande och verifiering

Omfattar utfärdande av licensnyckeln, spärrlistan för återbetalda köp och ”Hämta min licensnyckel igen”.

| Fält | Beskrivning |
| --- | --- |
| Ändamål | Utfärda en signerad licensnyckel efter betalt köp, kontrollera att köpet är betalt, spärra licenser från återbetalda eller bestridda köp och skicka nyckeln igen till den som tappat den. |
| Rättslig grund | Avtal (art. 6.1 b). Spärrlistan: berättigat intresse av att förhindra missbruk (art. 6.1 f). |
| Registrerade | Köpare på webben. |
| Uppgifter | Köp-id (Stripe-sessionens id), licenstyp och utfärdandedatum – inget namn eller e-post i nyckeln. ”Hämta nyckeln igen”: e-post och kvittonummer, som jämförs med köpet i Stripe och inte sparas. Spärrlistan innehåller bara licens-id, inga namn eller e-postadresser. |
| Mottagare | Netlify (serverfunktionerna) – biträde. Stripe (licensen sparas som metadata på betalningen) – biträde. |
| Överföring utanför EU | USA (Netlify, Stripe) – EU–US Data Privacy Framework och standardavtalsklausuler. |
| Lagringstid | Licens och köp-id i Stripe lika länge som köpet (se 1). Spärrlistan omfattar återbetalda och bestridda livstidsköp utan tidsgräns och årslicenser från köp de senaste 400 dagarna (köp-id, inga namn eller e-postadresser). |
| Säkerhetsåtgärder | Licenser och spärrlistan signeras med ECDSA P-256; den privata nyckeln finns bara som hemlighet i Netlify. Anropsbegränsning. Samma svar och svarstid vid fel e-post och fel kvittonummer, så att ingen kan ta reda på vem som har köpt. |

## 3. Support via e-post

| Fält | Beskrivning |
| --- | --- |
| Ändamål | Svara på frågor, hjälpa till med licenser, hantera reklamationer och felrapporter. |
| Rättslig grund | Avtal (art. 6.1 b) för frågor om köp och reklamationer. Berättigat intresse (art. 6.1 f) för övriga frågor. |
| Registrerade | Användare och köpare som mejlar. |
| Uppgifter | E-postadress, namn, meddelandet, köp-id eller kvittonummer. Felrapporter som användaren själv bifogar (appversion, plattform och felmeddelanden utan livsmedel och värden). Skriver någon om sin hälsa blir det en känslig uppgift (art. 9) – använd den bara för att svara och radera enligt lagringstiden. |
| Mottagare | E-posttjänsten: [fylls i av ägaren] – ska vara ett personuppgiftsbiträde med avtal. |
| Överföring utanför EU | Beror på e-posttjänsten: [fylls i av ägaren]. |
| Lagringstid | 24 månader efter senaste kontakten, längre bara om mejlet behövs för en pågående reklamation eller för bokföringen. |
| Säkerhetsåtgärder | En separat supportadress med tvåstegsverifiering. Rensa gamla mejl regelbundet (sätt en återkommande påminnelse). Vidarebefordra aldrig hälsouppgifter. |

## 4. Serverloggar och anropsbegränsning

| Fält | Beskrivning |
| --- | --- |
| Ändamål | Drift, säkerhet och felsökning av webbplatsen och serverfunktionerna. Begränsa missbruk (för många anrop). Receptimport: hämta ett recept från en webbadress åt användaren. |
| Rättslig grund | Berättigat intresse (art. 6.1 f). Receptimporten: avtal – funktionen användaren ber om (art. 6.1 b). |
| Registrerade | Alla som besöker webbplatsen eller vars app anropar serverfunktionerna. |
| Uppgifter | IP-adress, tidpunkt, begärd adress och webbläsarens användaragent i Netlifys loggar. Funktionsloggarna innehåller köp-id (Stripe-sessionens id), licenstyp och belopp vid köp, spärrar och fel – inga namn, e-postadresser eller IP-adresser. Anropsbegränsningen håller IP-adressen i minnet. Receptimporten tar emot webbadressen till receptet, som inte sparas; misslyckas hämtningen loggas bara webbplatsens namn. |
| Mottagare | Netlify – biträde. |
| Överföring utanför EU | USA (Netlify) – EU–US Data Privacy Framework och standardavtalsklausuler. |
| Lagringstid | Netlifys loggar: enligt Netlifys lagringstid, [fylls i av ägaren]. Anropsbegränsningen: några minuter i minnet. |
| Säkerhetsåtgärder | HTTPS, säkerhetshuvuden (bland annat Content-Security-Policy), inga namn, e-postadresser eller IP-adresser i loggmeddelanden, skydd mot anrop till interna adresser i receptimporten. |

---

## Låt en jurist granska

- Rättslig grund för känsliga uppgifter som användare själva skriver i supportmejl (art. 9).
- Stripes dubbla roll (biträde och självständigt ansvarig) och överföringarna till USA.
- Lagringstiden för bokföringsunderlag – bekräfta den gärna med en redovisningskonsult.
