# Grundarerbjudandet — beslutet som gäller

**Beslut: Andreas 2026-09-13. Livstid, inte tre år.**
Det här dokumentet avgör motsättningen mellan `docs/strategy/LAUNCH_OFFER_STRATEGY.md`,
`docs/gtm/grundarerbjudandet-hero-v1.md` och koden. **Vid konflikt gäller den här filen.**

---

## 1. Prislåset: livstid

> Grundarkunder låser sitt pris på **Core-paketet** för alltid, så länge årsavtalet
> löper utan avbrott.

Tre skäl, i den ordning de väger:

1. **Koden har redan sagt livstid sedan 2026-08-19.** `lib/billing/founders-offer.ts`
   bär beslutet i filhuvudet ("låser sitt pris för alltid"), och
   `tests/founders-offer.spec.ts` låser bannertexten ordagrant. Strategidokumentets
   §8 `Founding Core Price Protection: up to 3 years` är alltså inte ett alternativ
   som övervägs — det är en **avvikelse från skarp kod**, skriven tre veckor senare.
2. Det kostar noll i dag. De första kunderna är värda mer som referenser än som
   intäkt, och prishöjningen efter dem är äkta knapphet: ni kan inte flytta in hur
   många som helst manuellt.
3. "Tre år" inbjuder till en förhandling år tre. "För alltid" gör det inte.

**Gränsen som gör livstid möjlig — och som MÅSTE stå i avtalet:**
låset gäller **Core**. Accounting, Pay, Payroll, Supply, Capital, Insurance och
Marketplace har sin egen prissättning. Den gränsen är strategidokumentets §8
"Critical boundary" och den är det enda som skiljer ett hållbart löfte från att
ge bort varje framtida produkt gratis.

---

## 2. Tre motsättningar som måste stängas innan hero publiceras

Upptäckta när beslutet skulle skrivas ned. Alla tre är fall där två ytor lovar
olika saker till samma kund.

### 2.1 Antal platser: 20 i koden, 15 i heroutkastet

`FOUNDERS_SEATS = 20` i `lib/billing/founders-offer.ts` är **grinden som
faktiskt delar ut villkoren**. Heroutkastet säger 15 på tre ställen, inklusive
räknaren "Plats 1 av 15".

Säger sidan 15 medan grinden ger grundarvillkor till kund 16–20 är löftet falskt
i den riktning som är dyrast: fem kunder får ett pris de inte skulle ha fått, och
knappheten var påhittad.

**Rekommendation: 20.** Siffran är redan skarp, redan facit-låst, och tjugo
manuella inflyttningar är fortfarande äkta knapphet. Väljer du 15 måste
konstanten och facit ändras i samma pass — inte bara texten.

**Mätt 2026-09-13: 1 plats av 20 är tagen** (verklig Stripe-prenumeration,
`subscription_status = 'active'`, ej demokonto — samma villkor som grinden
räknar). Räknaren i heron får bara visa ett tal om det kommer därifrån.

### 2.2 Garantin: 90 dagars pengarna-tillbaka i koden, användningsgaranti i utkastet

Koden och fakturasidan lovar i dag **90 dagars pengarna-tillbaka**. Heroutkastet
ersätter det med den villkorade användningsgarantin: fyra av åtta ytor på 30
dagar, beslut före dag 90, **hela året** tillbaka.

Båda kan inte annonseras. Kunden som läser landningssidan och sedan loggar in ska
inte mötas av ett annat löfte.

**Rekommendation: den villkorade garantin**, av Hormozis skäl — den filtrerar,
den är prövbar, och "hela året" märks på ett sätt "30 dagar" inte gör. Men då
måste samma pass ändra `lib/billing/founders-offer.ts`, bannertexten,
fakturasidan och `tests/founders-offer.spec.ts`. Ändras bara landningssidan har
vi två sanningar i produktionen, vilket är sämre än den svagare garantin.

### 2.3 Accounting: gratis i 12 månader (strategin) eller halva priset för alltid (utkastet)

**Rekommendation: halva listpriset för alltid (utkastets alternativ B), inte det
daterade löftet (A).**

Skälet är inte marknadsföring, det är vad Financial Kernel-granskningen visar.
A lovar GA före 30 juni 2027. Samma granskning (`FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md`)
har omvänd byggmoms och kontantmetoden som **BLOCKER** för den svenska
kontopaketet, och orkestreringen kräver en **namngiven, kontrakterad revisor**
före första konteringsregeln, med månaders ledtid. Ett datum satt i dag är alltså
ett löfte om något vars ledtid vi inte äger.

B lovar bara något vi kontrollerar fullt ut: vårt eget pris. Den kan dessutom
uppgraderas till A den dag revisorn är kontrakterad och ett GA-datum finns —
motsatt väg går inte.

---

## 3. Publiceringsvillkoren i heroutkastets §9

| Villkor | Läge |
|---|---|
| Kunden kan se sitt eget användningsmått | **KLART 2026-09-13.** `GET /api/min-garanti` + `/dashboard/min-garanti`, ägar-/adminsgrindad, räknar med exakt samma `computeAdoption` som admin. Facit i `tests/adoption.spec.ts` |
| Platsräknaren visar verkligt antal eller ingen siffra | Kvar. Grinden ger bara en boolean till klienten (avsiktligt, `founders-offer.ts`) — vill heron visa "plats N av 20" måste talet exponeras medvetet, annars skriv ingen siffra |
| Exponeringen är ett medvetet beslut | Kvar hos Andreas. Med 20 platser à 59 950 kr är värsta utfallet omkring 1,2 Mkr, inte 900 000 kr som utkastet räknade på 15 |

---

## 4. Fyndet som ingen hade sett: ingen vet vem som är grundarkund

`isFoundersOfferAvailable()` räknar platser vid köptillfället och returnerar en
boolean. Den läses i `app/api/billing/route.ts` och `app/api/onboarding/route.ts`
— och **ingenting skrivs**. Grundarstatus är alltså ett ögonblick som passerar:
inget fält säger att just den här kunden fick livstidspris.

`is_pilot` är inte svaret; den markerar de tre piloterna (Bee Service, Nordström
El, Elexperten), inte grundarkunderna.

Om tolv månader, när en kund hävdar sitt låsta pris, finns inget att kontrollera
mot annat än Stripe-historik och gissningar. Ett löfte om **livstid** som inte är
nedskrivet per kund är det svagaste stället i hela konstruktionen.

**Rekommendation:** en kolumn, stämplad av betalflödet när erbjudandet var
tillgängligt vid köpet — `founding_at timestamptz` på `business_config`, plus
det låsta priset i öre. Litet, men det ska göras **före** första riktiga
grundarkunden, inte efter. Det är ett eget paket och står inte i den här filen
som klart.

---

## 5. Vad som INTE ändras

Heroutkastets två garantier, värdeekvationsresonemanget, "garantera nämnaren inte
täljaren" och regeln att garantin aldrig får föregå sina bevis står oförändrade.
Den här filen avgör tre öppna val och rättar en avvikelse — den skriver inte om
erbjudandet.
