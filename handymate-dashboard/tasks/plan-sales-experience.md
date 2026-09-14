# Sales Experience — vad som finns, vad som saknas, i byggordning

Kartlagt 2026-09-14 mot `main` efter lansering. Skissen ligger i repot:
`docs/design/skisser-2026-09-14/sales-experience.dc.html` (18 steg, fem
business case-modeller, ~2 200 rader).

Den här listan är inte en prioritering — ordningen i
`tasks/efter-lansering.md` gäller över den. Det här är vad bygget faktiskt
kräver när det väl ska göras, och vad som måste rättas innan en kund ser
sidan.

---

## Läget i en mening

**Överlämningen är redan byggd och ligger i produktion. Säljsidan finns
bara som skiss.** Det omvända mot vad man skulle gissa.

Jag bedömde först att kopplingen till onboardingen var den svåra biten som
saknades — att caset behövde en egen identitet med en token i säljarens
länk, eftersom kontot inte finns när genomgången görs. Det är precis vad
`sql/v231_sales_case.sql` gör, och den kördes 2026-09-12. Tabellen finns i
produktionsdatabasen med 14 kolumner. Bedömningen var fel; det som återstår
är mindre än det ser ut.

---

## 1. Det som finns

| Del | Var | Status |
|---|---|---|
| `sales_case`-tabellen | `sql/v231_sales_case.sql` | **Körd i prod** (verifierad 2026-09-14). RLS på, medvetet utan policyer — all åtkomst går genom API-rutterna |
| Ren logik: förifyllning, TTL, SNI→bransch | `lib/sales/sales-case.ts` (233 rader) | Klar. Ingen I/O, defensiv tolkning, allt valfritt |
| Skapa case | `POST /api/sales-case` | Klar. Kräver inloggad session, returnerar `token`, `url`, `onboardingUrl` |
| Läsa case | `GET /api/sales-case/[token]` | Klar. Publik — token är legitimationen, uuid, 90 dagars TTL |
| Onboardingen läser `?case=` | `app/onboarding/page.tsx:161-180, 289-293, 617-644` | Klar. Förifyller, städar bort parametern, kontots egna data vinner alltid |
| Facit för överlämningen | `tests/salj-case-overlamning.spec.ts` | Klar. Vaktar fyra saker, bl.a. att caset aldrig hoppar ett steg |
| Bolagsverket-uppslag | `lib/bolagsverket/client.ts`, `POST /api/onboarding/bolagsverket-lookup` | Finns och används av `Step2Business`. Returnerar namn, bolagsform, adress, SNI |
| Grundarerbjudandet | `lib/billing/founders-offer.ts` | Klar. Serverhärledd boolean, räknar bara aktiva Stripe-prenumerationer |
| Kanoniska planfakta | `getPlanCommercialFacts` i `lib/feature-gates.ts` | Klar, med facit i `tests/pricing-truth.spec.ts` |

Skissen behöver alltså inte uppfinna överlämningen. Den behöver anropa
`POST /api/sales-case` med sin `casePayload()` och använda `onboardingUrl`
som CTA.

---

## 2. Gränsen som redan är dragen

`lib/sales/sales-case.ts` skriver ut den, och `tests/salj-case-overlamning.spec.ts`
vaktar den:

> Caset FÖRIFYLLER fält. Det hoppar aldrig över ett steg. Step2Business
> skapar fortfarande kontot, StepGenomgang kör fortfarande genomgången av
> kundens egna siffror, Step5Activate tar fortfarande betalningen.

Det avgör frågan om de två genomgångarna. Säljgenomgången är **vår bild av
kunden**, byggd på externa och självrapporterade siffror. `StepGenomgang` är
**kundens egen data ur deras eget system**. Beslutet 2026-09-02
(`tasks/plan-genomgang-fore-betalning.md`) står fast: kunden betalar för
något de själva sett i sina egna siffror.

Båda överlever alltså. Men de får inte kännas som en repris. **När en
`sales_case` finns bör `StepGenomgang` byta ramning** — från "här är vad
teamet hittade i din firma" till något i stil med "det här sa ni i mötet,
här är era riktiga siffror". Då blir steget beviset för säljpåståendet i
stället för en upprepning av det, och skillnaden mellan vad kunden trodde
och vad datan visar blir synlig. Det är den enda platsen där den
skillnaden kan synas.

Det är ett ändringsförslag, inte ett beslut. Avgörs av Andreas.

---

## 3. Sakfel i skissen — rättas innan en kund ser den

### 3.1 Priset

**Kanonisk källa: `getPlanCommercialFacts()` i `lib/feature-gates.ts`.
Firman 5 995 kr/mån, 59 950 kr/år. Storfirman 11 995 kr/mån, 119 950 kr/år.**
Låst av `tests/pricing-truth.spec.ts`. Beslut Andreas 2026-09-14: alla ytor
håller sig till de siffrorna.

Skissen har 5 990 / 11 990 (`pkgMonthlyN` i canvas-skriptet). Drift finns på
två ställen till i repot:

- `sql/v100_cogs_matare.sql:98` — kommentar säger "5 990 kr/mån"
- `tests/salj-case-overlamning.spec.ts:66` — fixturen har `monthly: '5 990'`

Båda är kommentarer respektive testdata utan effekt på en kund, men de är
hur en felaktig siffra överlever. Rätta dem när säljsidan byggs.

Säljsidan ska **inte** bära egna belopp. Den ska läsa `getPlanCommercialFacts()`
som `Step5Activate` och billing-sidan redan gör — det är precis vad
`pricing-truth.spec.ts` kontrollerar för dessa två filer, och säljsidan bör
läggas till i den listan.

### 3.2 Grundarerbjudandet säger fel saker

Skissen presenterar `5990 × 10 / 12 ≈ 4 992 kr/mån` under rubriken
"Grundarpris · endast de 20 första kunderna". Men det är årsrabatten
"betala för 10, få 12" (`YEARLY_MONTHS_FREE = 2`, `lib/feature-gates.ts:421`)
som **varje** Firman- och Storfirman-kund får, grundare eller ej. En vanlig
årsrabatt framställd som en knapp resurs.

Repots faktiska grundarvillkor (`lib/billing/founders-offer.ts`):

1. Pris låst för alltid
2. 90 dagars pengarna-tillbaka i stället för 30 (`FOUNDERS_GUARANTEE_DAYS`
   mot `STANDARD_GUARANTEE_DAYS`, båda låsta i `pricing-truth.spec.ts`)
3. Direktlinje till grundaren under hela första året

Skissen tappar punkt 3 och lägger till en fjärde som inte finns någonstans i
koden: **"Bokföringen till halva priset, för alltid, när den släpps."**

Den punkten är det dyraste löftet i hela flödet. Bokföringen kan enligt
`docs/strategy/FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md` §21 inte ens
skuggas förbi nivå 1 mot nuvarande OAuth-grant, och `§21.6` gör det manuella
regelbokspåret till ett villkor. Halva priset för evigt på den produkten är
ett åtagande som överlever nuvarande prismodell.

**Gör det gärna — men som ett eget beslut med ett datum, inte som en punkt i
en bullet-lista.** Skrivs i så fall in i `founders-offer.ts` så de två
listorna säger samma sak.

### 3.3 Platsräknaren krockar med en uttalad regel

`lib/billing/founders-offer.ts` i sitt eget filhuvud:

> Serverhärledd — klienten får ALDRIG antalet platser kvar, bara en boolean.
> Ingen offentlig räknare i V1 (varken "X kvar" eller "platserna är slut").
> […] aldrig en påhittad räknare

Skissen har en `slotsTaken`-prop (default 2) som går hela vägen genom
`renderVals`. Den renderas inte i dag — noll förekomster av `{{ slotsTaken }}`
i markupen — men den finns bara för att renderas.

**Ta bort propen, eller ändra regeln medvetet.** Lämna den inte laddad.

Relaterat: avslutssidan visar "Grundarpris · en av 20 platser" *innan*
platsen är reserverad, och `isFoundersOfferAvailable()` räknar bara konton
med `stripe_subscription_id IS NOT NULL` och `subscription_status = 'active'`.
En säljare kan alltså lova plats 21 ett grundarpris. Säljsidan bör anropa
grindens boolean innan den visar erbjudandet.

### 3.4 Död ROI-gren som skulle riva ärlighetsräcket

Varje `CASE[*].calc()` returnerar `gain`, `gainLead`, `gainUnit` och `bars`.
Inget av det renderas. Och de bygger på antagandenycklar som inte finns i
någon `asm`-lista:

| Modell | Använder | Finns i `asm` |
|---|---|---|
| `tid` | `a.pct` | nej |
| `pengar` | `a.days` | nej |
| `affarer` | `a.win`, `a.lift` | nej |
| `kontroll` | `a.catch` | nej |
| `beroende` | `a.del` | nej |

`asmVals()` sätter bara nycklar som modellens `asm` deklarerar, så alla blir
`undefined`. `gain` blir `NaN` och etiketten läser *"Om undefined % av den
tiden"*.

Ofarligt i dag. Men det är exakt det besparingslöfte resten av flödet
vägrar göra, och det ligger där och ser färdigt ut. **Antingen riktiga
antaganden som kunden själv klickar fram — som `rate` redan är — eller bort
med dem.** Ett halvfärdigt `gain` som någon kopplar in är hur "Möjlig
förbättring: 340 000 kr" hamnar framför en kund utan att någon bestämt det.

### 3.5 Företagsprofilens bokslut

Skissen visar tre års omsättning, resultat och vinstmarginal under en bock
som säger "Hämtat från Bolagsverket", plus "Bolagsverket säger
{registeredEmployees}" under antalsreglaget.

`parseOrganisationResponse()` i `lib/bolagsverket/client.ts` returnerar i dag
exakt fyra fält: `name`, `companyForm`, `address`, `sniCode`. Inga bokslut,
inget anställningsantal.

API-access hos Bolagsverket är ansökt (Andreas 2026-09-14). När den landar
krävs:

1. En andra endpoint mot årsredovisningsdata, med egen parse
2. Utökad `BolagsverketCompany` med bokslutsraderna och antal anställda
3. En explicit tom-väg: en nystartad firma eller ett bolag utan publicerade
   bokslut ska ge en ärlig tom ruta, aldrig en tom graf som ser trasig ut
4. Fail-soft precis som i dag — `lookupCompany` kastar aldrig, och
   `not_configured` får aldrig stoppa genomgången

Tills dess: **ta bort bokslutsgrafen ur skissen eller märk den som
platshållare.** Bocken "Hämtat från Bolagsverket" över data vi inte hämtar
är den sortens påstående resten av flödet är noga med att undvika.

### 3.6 "Vi jobbar gratis tills ni är det"

Skissen: *"Igång inom en vecka. Inte igång på sju dagar? Vi jobbar gratis
tills ni är det."*

Jag hittar ingen motsvarighet någonstans i repot. Ingen definition av
"igång", ingen mätning, ingen som äger kostnaden. Antingen definieras det
och skrivs in bredvid garantidagarna i `feature-gates.ts`, eller så tas det
bort.

---

## 4. Det som saknas i kod

### 4.1 `/case/[token]` finns inte — kundens personliga länk är 404

`byggCaseLank()` returnerar `${APP_URL}/case/${token}`, och
`POST /api/sales-case` skickar tillbaka den som `url`. Men `app/case/`
finns inte. Rutten är aldrig byggd.

Det är den enskilt största luckan: säljaren får en länk att skicka, och
kunden som klickar får en 404.

Skissens modal länkar i dag till `Personligt Case.dc.html` — en designfil,
inte en rutt. Den sidan behöver byggas mot `GET /api/sales-case/[token]`,
med utgången länk och okänd token som egna ärliga vyer.

### 4.2 Säljsidan har ingen rutt alls

Skissen är en designkanvas. Var den ska bo är obestämt. `POST /api/sales-case`
kräver redan en **inloggad session med ett företag** och skriver
`created_by_business_id` — kommentaren i v231 säger att det är förberedelse
för partnerportalen, där en partner ska se sina egna case och ingen annans.

Det pekar mot att säljsidan bor bakom inloggning, inte på `/admin` (som är
domängrindat till `@handymate.se` sedan 2026-09-13). Men det är inte
beslutat. **Öppen fråga till Andreas:** egen rutt bakom vanlig inloggning,
adminytan, eller partnerportalen?

### 4.3 Stegremsan i skissens sista skärm ljuger

Skissen visar fem steg: Företaget · Jobbflöde · Team · Första jobbet · Bjud
in personalen. Den riktiga onboardingen har nio, i en annan form:
Step1MeetTheTeam · Step2Business · Step3HowYouWork · Step4PhoneNumber ·
StepImportData · StepGenomgang · Step5Activate · StepProductRegister ·
Step6LiveTour.

`onbSteps` måste peka på verkligheten innan en kund ser den. Annars bryts
löftet på nästa skärm.

### 4.4 `knownFacts` lovar åtta förifyllda fält

Skissen listar åtta saker som redan är kända. `prefillFranCase()` sätter i
dag: `companyName`, `orgNumber`, `companyForm`, `addressStreet`,
`addressPostalCode`, `addressCity`, `trade`, `area` — plus `extras` (mål,
citat, fokus, paket, personer, jobb/månad, mötesdatum).

Antal personer och jobb/månad hamnar alltså i `extras`, inte i formuläret.
Vill skissen påstå att de är förifyllda måste de ha en destination i
`OnboardingFormData`, eller så ska påståendet tonas ned. Ett löfte som
nästa skärm bryter är värre än inget löfte.

Notera också: `prefillFranCase` sätter **aldrig** e-post eller lösenord, med
ett uttryckligt skäl i koden — prospektets e-post är dit länken skickades,
inte nödvändigtvis den som ska äga kontot. Den gränsen ska stå kvar.

---

## 5. Byggordning

1. **Rätta sakfelen i skissen** (3.1–3.6). Kostar ingen kod, och allt nedan
   bygger på att siffrorna och löftena stämmer.
2. **`/case/[token]`** (4.1). Utan den fungerar inte det som redan är byggt.
   Minsta möjliga: läs caset, visa genomgången, CTA till `onboardingUrl`.
3. **Bestäm var säljsidan bor** (4.2), bygg den mot `POST /api/sales-case`.
   Låt den läsa `getPlanCommercialFacts()` och grundargrindens boolean —
   inga egna belopp, ingen egen räknare.
4. **Stegremsan och `knownFacts`** (4.3–4.4) mot den riktiga onboardingen.
5. **`StepGenomgang` byter ramning när ett case finns** (avsnitt 2) — om
   Andreas vill det.
6. **Bokslutsdatan** (3.5) när Bolagsverket-accessen landar.
7. **Riktiga kundfall** ersätter `proofCards`. Skissen listar själv vad som
   krävs: firmatyp, storlek, ort, siffra före/efter, tidsrymd, ett citat.

Punkt 1 och 2 är de enda som behöver göras innan en säljare kan använda
flödet skarpt.

---

## 6. Att inte göra

- **Låt aldrig caset hoppa ett steg.** Särskilt inte betalningen eller
  `StepGenomgang`. `tests/salj-case-overlamning.spec.ts` vaktar det.
- **Rendera aldrig en platsräknare.** Boolean, inget annat.
- **Koppla aldrig in `gain`/`bars`** utan antaganden kunden själv valt.
- **Visa aldrig ett grundarpris** utan att först fråga grindens boolean.
- **Bär aldrig egna planbelopp i en kundyta.** `getPlanCommercialFacts()`
  är den enda sanningen, och `pricing-truth.spec.ts` är dess facit.

---

## Vad skissen gör bra, och som inte ska förhandlas bort

Värt att skriva ned, eftersom det är lätt att tappa i en ombyggnad:

- **Ärlighetsraderna.** "Illustrativa scenarier — inte uppmätta resultat" på
  både lösningen och målbilden. "Bevis · platshållare" med exakt vad som
  krävs för att byta ut dem. "Funktionerna märkta PÅ VÄG ingår inte i det ni
  köper idag" på tre ställen. "Inget når en kund utan ert OK."
- **`pengar`-modellens not:** *"Två effekter, räknade separat […] De läggs
  inte ihop."* Att vägra summera bundet kapital med sparad tid är en
  stringens som är värd att bevara ordagrant.
- **Business caset argumenterar från kundens siffror.** Två svar från kunden
  × ett antagande de själva klickar fram, med formeln utskriven under.
- **Diagnosen härleds ur smärtan.** Fem modeller med fem olika enheter —
  timmar, bundet kapital, offertvolym, avvikelse, ägartimmar. Inte en
  kalkylator med utbytta etiketter.
