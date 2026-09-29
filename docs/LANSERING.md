# Lansering i App Store och Google Play – sammanfattning

Den fullständiga lanseringslistan finns som en levande sida:
**[Lagoms lanseringslista](https://claude.ai/artifact/7ysdpNCMhY6366LEWtjGXE)** – 178 punkter i
13 avsnitt (konton, juridik, betalning, appskal, iPhone, Android, butiksmaterial …), granskade mot
Apples och Googles regler och svensk lag. Bocka av där när något är klart; bockarna syns för
Claude. Det här dokumentet är en kort sammanfattning av läget och vad som återstår för dig.

## Beslut som är fattade (2026-09-28)

| Fråga | Beslut |
| --- | --- |
| Appskal | **Capacitor 8** för båda butikerna ([NATIVE.md](NATIVE.md)) |
| Betalning i apparna | Bara köp i appen: Apple In-App Purchase och Google Play Billing |
| Produkter | `livstid` (engångsköp, 699 kr), `ar` (ett år utan automatisk förnyelse, 349 kr), `prov14` (gratis provperiod, bara App Store – iPhone-appen startar provperioden med det köpet, riktlinje 3.1.1) |
| Enheter och land | Bara iPhone (ingen iPad) och Android; bara Sverige |
| Målgrupp | Vuxna, 18 år och äldre |
| Företag | Enskild firma – individkonto hos Apple, personligt konto hos Google |
| Native-funktioner i v1 | Export/delning, lokala påminnelser, streckkodsläsare, Apple Hälsa och Health Connect, haptik, statusfält/tangentbord/startskärm, Androids bakåtknapp, integritetsmanifest |
| Bygge utan Mac | I molnet: GitHub Actions (`release.yml`) och/eller Codemagic (`codemagic.yaml`) |

## Klart i repot

- Projekten `ios/` och `android/`, ikoner, startskärmar, behörigheter och integritetsmanifest.
- Funktionerna i `src/native/`: köp (StoreKit 2 och Play Billing), export och delning,
  påminnelser, streckkodsläsare, Hälsa, haptik, statusfält, tangentbord och bakåtknapp.
- Molnbyggen: kontrollbygget (`native.yml`) och signerade butiksbyggen med uppladdning till
  TestFlight och Google Play (`release.yml`, `codemagic.yaml`) – [NATIVE.md §9](NATIVE.md#9-molnbyggen-kontroll-signering-och-uppladdning).
- Butiksdokumenten med texter, formulärsvar och checklistor: [APP-STORE.md](APP-STORE.md),
  [GOOGLE-PLAY.md](GOOGLE-PLAY.md), [IOS-BYGGE-I-MOLNET.md](IOS-BYGGE-I-MOLNET.md).

## Kvar för dig – i ordning

Steg för steg med alla detaljer: [NATIVE.md §10](NATIVE.md#10-steg-för-steg-för-ägaren-utan-mac).

1. **Företaget:** registrera den enskilda firman (F-skatt, moms) och bestäm vilken adress och vilket
   telefonnummer som ska visas offentligt (DSA, köpvillkoren).
2. **Namn och domän:** gör varumärkessökningen för "Lagom" och skaffa egen domän och supportadress
   före lanseringen – ursprunget och adresserna går inte att byta efteråt. Underlag:
   [APPNAMN.md](APPNAMN.md) (kontrollerat 2026-09-29). Slutsatsen: "Lagom" under ikonen går bra,
   men bara "Lagom" som butiksnamn är troligen upptaget i App Store – använd
   `Lagom – kaloriräknaren` i båda butikerna. Domänen lagomappen.se är sannolikt ledig och matchar
   app-id:t – registrera den nu (supportadress `support@lagomappen.se`). Inget varumärke LAGOM för
   appar eller kost hittades, men registren gick inte att söka därifrån – gör den kostnadsfria
   sökningen hos PRV och i TMview själv ([APPNAMN.md §8](APPNAMN.md#8-det-här-gör-du-själv)).
3. **Konton:** Apple Developer Program (99 USD/år) med Paid Apps Agreement, bank, W-8BEN,
   DSA-status och Small Business Program; Google Play Console (25 USD) med betalningsprofil och
   DSA-status.
4. **Bekräfta app-id:t** `se.lagomappen.lagom` – det kan aldrig ändras efter första uppladdningen.
5. **Nycklar och hemligheter:** Bundle ID med HealthKit, App Store Connect API-nyckel,
   certifikatnyckel, uppladdningsnyckel för Google Play (säkerhetskopierad på två ställen) och
   eventuellt ett tjänstekonto – inlagda i GitHub eller Codemagic.
6. **Produkterna** `livstid`, `ar` och `prov14` i App Store Connect (alla tre skickas in med
   appversionen – iPhone-appen köper `prov14` när provperioden startas), och `livstid` och `ar` i
   Play Console (efter första uppladdningen till intern testning).
7. **Första byggena och testet:** TestFlight och intern testning. Prova köp (sandlådan och
   licenstestare): provperioden med "Starta 14 dagar gratis" på iPhone, `ar` och `livstid`, ett
   avbrutet köp, Återställ köp efter ominstallation, förnyelse i förväg, flygplansläge och i Play
   en återbetalning med och utan återkallad rätt ([GOOGLE-PLAY.md §7](GOOGLE-PLAY.md#återbetalningar-och-återkallade-köp)
   – Voided Purchases API behövs inte) – och Apple Hälsa/Health Connect, påminnelser,
   streckkodsläsaren, "Fyll i från förpackningen" (Skanna text på iPhone, kamerans
   textigenkänning på Android), export och radering på riktiga telefoner. **Köpen måste fungera här innan något skickas in för granskning**
   (`NATIVE_PURCHASES_READY` sätts annars till false). Molnbyggena laddar bara upp till TestFlight
   och intern testning – själva inskickningen gör du för hand.
8. **Streckkodsläsaren på Android:** läser nu med ZXing, och ML Kits startprovider är borttagen
   (inget skickas till Google). Prova den i svagt ljus på en riktig telefon; vill du hellre ha ML
   Kit krävs ändrad Data safety och integritetspolicy –
   [GOOGLE-PLAY.md §8](GOOGLE-PLAY.md#datasäkerhet-data-safety).
9. **Integritetspolicy och villkor:** policyn är uppdaterad för Apple Hälsa, Health Connect,
   påminnelser, den automatiska kopian, de sparade köpen och köp i apparna (med en egen text för
   Google Play-appen, som Health Connect också visar i appen) – publicera den nya versionen på
   webbplatsen före inskickningen, och låt gärna en jurist läsa policy, villkor och ångerrätt.
   Lagom Moln får inte slås på i apparna (byggkontrollen stoppar det) förrän du har godkänt det
   och allt i [BACKEND.md](BACKEND.md) är uppdaterat.
10. **Googles slutna test:** minst 12 testare i 14 dagar i följd – starta så tidigt som möjligt;
    den bestämmer när Android-appen kan släppas.
11. **Formulären:** App Privacy, åldersklassning, MDR (Nej) och exportfrågorna i App Store Connect;
    Data safety, Health apps-deklarationen, IARC, målgrupp 18+ och appåtkomst i Play Console.
12. **Butiksmaterial:** texter, ikon och skärmdumpar från butiksbygget.
13. **Skicka in** i App Store och ansök om produktion i Google Play.

## Efter lanseringen

- **Dagbokens lagring:** i dag skrivs hela dagboken om vid varje ändring. Det går snabbt de första
  månaderna men blir märkbart trögt på en mellanklasstelefon efter ungefär ett år (0,25 s per
  tryck, 0,45 s efter två år). Dela upp den i en nyckel per månad inom ungefär ett halvår efter
  lanseringen, i två appversioner (läsare först, skrivare sedan), och mät först på en riktig iPhone
  och en mellanklass-Android – underlag och plan i [LAGRING.md](LAGRING.md).

## Ungefärlig tidsplan

| Vecka | Vad |
| --- | --- |
| 1 | Konton, företagsuppgifter, app-id, nycklar och hemligheter |
| 2 | Första byggena, produkterna, TestFlight och intern testning, köp och native-funktioner testade |
| 2–4 | Googles slutna test (14 dagar), formulär och butiksmaterial, integritetspolicyn |
| 4–5 | Inskickning till App Store, ansökan om produktion i Google Play |
