# Garantin — vad varje yta säger i dag

Kartlagt 2026-09-17 på Andreas begäran: *"se över vår garanti för att
säkerställa att den säger samma överallt."*

Kompletterar §2.2 i [beslutsfilen](./grundarerbjudandet-beslut-2026-09-13.md),
som redan namngav motsättningen och rekommenderade den villkorade garantin.
Den filen listade fyra ytor som måste ändras i samma pass. **De är elva, över
två repon.** Den här filen är inventeringen, inte ett nytt beslut.

---

## 1. Antalet dagar är redan kanoniskt. Löftet är det inte.

Värt att slå fast först, eftersom det avgör hur stort arbetet är:

`STANDARD_GUARANTEE_DAYS = 30` och `FOUNDERS_GUARANTEE_DAYS = 90` ligger i
`lib/feature-gates.ts`, låsta av `tests/pricing-truth.spec.ts`, och båda
köpytorna härleder `guaranteeDays` därifrån. **Siffran är alltså redan en
sanning.**

Det som skiljer sig är *vad* garantin lovar och *på vilket villkor*. Det
finns ingen motsvarande konstant för det.

---

## 2. Två läger

### Läger A — villkorslös pengarna-tillbaka (allt som är publicerat i dag)

| Yta | Text |
|---|---|
| `handymate-landing/index.html:1009` | "30 dagars pengarna-tillbaka-garanti. **Inga frågor.**" |
| `handymate-landing/index.html:927` (FAQ) | "…provar du riskfritt: 30 dagars pengarna-tillbaka-garanti. **Inga frågor.**" |
| `handymate-landing/index.html:1014` | grundare: "låst pris för alltid, direktlinje … och **90 dagars pengarna-tillbaka-garanti**" |
| `app/dashboard/settings/billing/page.tsx:481` | "{guaranteeDays} dagars pengarna-tillbaka-garanti. **Inga frågor.** Gäller även årsavtal." |
| `lib/billing/founders-offer.ts` (filhuvud) | "90 dagars pengarna-tillbaka-garanti i stället för 30" |
| `app/partners/material/partnerdeck/page.tsx:332` | "30 dagars pengarna-tillbaka-garanti" |
| `app/partners/material/demo-manus/page.tsx:94` | "standardgarantin är 30 dagar" |
| `HANDYMATE_STRATEGIC_PLAN.md:159` | "den ordinarie 30-dagars pengarna-tillbaka-garantin" |

### Läger B — villkorad användningsgaranti

| Yta | Text | Läge |
|---|---|---|
| `docs/gtm/grundarerbjudandet-hero-v1.md` | fyra av åtta ytor på 30 dagar, beslut före dag 90, **hela året** tillbaka | Utkast, ej publicerat |
| `GET /api/min-garanti` + `/dashboard/min-garanti` | räknar kundens fyra-av-åtta | **Skarpt.** Ligger i sidomenyn som "Din användning" |
| Sales Experience-skissen | "Aktivera och använd tjänsterna … säg till före dag 90 så får ni hela året tillbaka" | Skiss |

### Och en tredje formulering, i mitten

| Yta | Text |
|---|---|
| `app/onboarding/components/Step5Activate.tsx:459` | "täckt av vår {guaranteeDays}-dagars **resultatgaranti**" |
| `app/onboarding/components/Step5Activate.tsx:499` | "Pengarna tillbaka om **garantin inte infrias**" |

Den andra raden är cirkulär: den lovar återbetalning om garantin inte
infrias, men säger aldrig vad garantin är.

### Två ytor gör redan rätt

| Yta | Text |
|---|---|
| `app/jamfor/page.tsx:500` | "täcks av **garantin som visas i köpflödet**" |
| `app/api/onboarding/chat/route.ts:26` | "täcks av **den garanti som visas i köpflödet**. Lova aldrig en gratis provperiod." |

Båda hänvisar i stället för att upprepa. Det är mönstret resten ska följa.

---

## 3. Tre fynd som inte stod i beslutsfilen

### 3.1 En skarp yta mäter ett villkor ingen har publicerat

`/dashboard/min-garanti` ligger i sidomenyn (`components/Sidebar.tsx:105`,
etikett "Din användning") och är ägar-/adminsgrindad. Den räknar fyra av åtta
ytor — villkoret i **läger B**.

Men varje publicerad garantitext tillhör **läger A**, där inget
användningsvillkor finns. En kund kan alltså öppna sidan i dag och se sig
mätt mot ett krav som inte står i något villkor de accepterat.

Det är fel ordning, men det är den ofarliga riktningen: ytan finns före
löftet, i stället för tvärtom. Regeln i `grundprogrammet.md` — *"garantin får
aldrig föregå sina bevis"* — är alltså uppfylld. Men läget kan inte stå kvar
länge, för den mätta kunden har inget villkor att läsa.

### 3.2 Ett facit låser fast motsättningen

`tests/founders-offer.spec.ts:105` kräver ordagrant
`'{guaranteeDays} dagars resultatgaranti'` i `Step5Activate`. Samtidigt säger
fakturasidan "pengarna-tillbaka-garanti. Inga frågor."

Det finns alltså ett prov som garanterar att de två ytorna säger olika saker.
Det provet måste med i samma pass — annars stoppar CI rättningen.

### 3.3 De åtta ytorna mäter användning, och utesluter uttryckligen koppling

`lib/admin/adoption.ts` rad 13: **"Setup är inte användning — push-
prenumeration och Fortnox-koppling räknas inte."**

Ytorna är: `samtal`, `beslut`, `offert`, `faktura`, `kund`, `projekt`,
`matte`, `falt`. Alla åtta är handlingar, ingen är en koppling.

Det har en direkt följd för `tasks/plan-kundvagar-steget.md`: **kopplade
kanaler är inte en del av garantivillkoret i dag, och det är ett medvetet
val.** Att lägga till dem är en ändring av villkorets innebörd, inte bara ny
spårning.

Och det behövs förmodligen inte. "Lisa tog ett samtal" kräver redan att
telefonkanalen fungerar. Kopplingarna är alltså inte ett eget kriterium — de
är förutsättningen för att kriterierna ska gå att nå. En kund som aldrig
kopplar något kan inte nå fyra av åtta, och då **faller garantin ut till
kundens fördel**. Bevisloggens verkliga värde är därför att fånga den kunden
dag sju, inte att avslå dag åttiofem.

---

## 4. Vad som ändras i samma pass när beslutet är fattat

Beslutet självt står i beslutsfilen §2.2 och är Andreas. Oavsett riktning
måste dessa röra sig tillsammans, annars finns två sanningar i produktion:

1. `handymate-landing/index.html` — tre ställen
2. `app/dashboard/settings/billing/page.tsx:481`
3. `app/onboarding/components/Step5Activate.tsx` — 459 och 499
4. `lib/billing/founders-offer.ts` filhuvud
5. `tests/founders-offer.spec.ts:105` — annars stoppar CI
6. `app/partners/material/partnerdeck/page.tsx:332`
7. `app/partners/material/demo-manus/page.tsx:94`
8. `HANDYMATE_STRATEGIC_PLAN.md:159`
9. Sales Experience-skissen (`docs/design/skisser-2026-09-14/`)
10. Villkorstexten — `handymate.se/terms` finns inte i det här repot;
    heroutkastets §11 säger att garantitexterna ska speglas i användar-
    villkoren, *"annars gäller de inte"*
11. `/dashboard/min-garanti` — behåll om läger B väljs, annars ska den bort
    eller ramas om, för då mäter den ingenting avtalat

---

## 5. Mekanismen: en sanning, med facit

Samma mönster som redan fungerar för priset. `getPlanCommercialFacts()` är
den enda källan för belopp och volymer, och `tests/pricing-truth.spec.ts`
kontrollerar dessutom att köpytorna *läser* därifrån i stället för att bära
egna tal.

Gör samma sak för garantin: en `getGuaranteeFacts(plan, foundersAvailable)` i
`lib/feature-gates.ts` bredvid dagarna, som returnerar dagar, villkor (eller
`null` för villkorslös) och den exakta meningen. Och ett facit som kräver att
varje kundyta anropar den — och som fäller varje yta som bär egen
garantitext.

Utan facitdelen glider texterna isär igen. Det är precis så det här läget
uppstod.

---

## 6. Det brådskande som ligger bredvid

Beslutsfilens §4 är fortfarande öppen och är mer akut än ordvalen:
**ingen kolumn säger vem som är grundarkund.** Verifierat 2026-09-17 —
`business_config` har inget `founding_at`, inget låst pris, ingenting.

Det finns **en betalande kund** i dag (aktiv Stripe-prenumeration, ej demo,
skapad 2026-08-09). Plats 1 av 20 är alltså tagen, och ingenstans står det
skrivet att just det företaget har livstidspris.

Ett löfte om *livstid* som inte är nedskrivet per kund är det svagaste stället
i hela konstruktionen, och det blir svårare att rätta för varje kund som
tillkommer.

---

## 7. Utfört 2026-09-17 (samma dag, efter beslutet)

**Beslut Andreas:** användningsgarantin gäller **alla kunder** när den
publiceras, inte bara grundarna. Bytet får inte ske före §10 i heroutkastet.

**Byggt:**

- `getGuaranteeFacts()` + `getFoundersBannerBody()` i `lib/feature-gates.ts`,
  med brytaren `GUARANTEE_MODEL` (`'money_back'` i dag, `'usage'` när §10 är
  uppfyllt). Användningsgarantins siffror läses ur `lib/admin/adoption.ts` —
  samma tal kunden ser i `/dashboard/min-garanti`.
- Alla kundytor i det här repot läser därifrån: `Step5Activate` (tre
  ställen, inkl. den femte formuleringen "minst 5 kundkontakter" som är
  borta), fakturasidan, partnerdeck, demo-manus. `min-garanti` räknar
  beslutsfönstret från samma konstant.
- `tests/guarantee-truth.spec.ts` (16 prov): en källa, varje yta anropar
  den, ingen yta bär egen garantitext. `founders-offer.spec.ts` och
  `pricing-truth.spec.ts` justerade — de låste tidigare fast motsättningen.
- `sql/v239_founding_customer.sql`: `founding_at`, `founding_plan`,
  `founding_interval`, `founding_price_sek` på `business_config`. **Körd i
  prod och verifierad.** Stämplas en gång av det delade betalflödet när
  checkout-sessionen bar `metadata.founders = 'true'` — avgjort i
  checkout-skaparen i det ögonblick erbjudandet visades, inte i webhooken
  efteråt. Fyndet på vägen: `handleCheckoutCompleted` skriver aldrig
  kontots status själv; det gör `updateSubscriptionData` via
  `customer.subscription.*`, som bara har prenumerationens metadata. Därför
  `founders` i båda metadata-blocken och samma hjälpare på båda vägarna.

**Inte rört, med skäl:**

- `handymate-landing/index.html` — statisk HTML, kan inte anropa
  `getGuaranteeFacts()`. Under `money_back` säger den redan det kanoniska
  ("30 dagars pengarna-tillbaka-garanti. Inga frågor."), så ingen ändring
  behövs nu. **Den blir en manuell spegel** och ska ändras i samma pass som
  brytaren. Noterat i heroutkastets §11.
- `docs/gtm/grundarerbjudandet-hero-v1.md` — det är källan till
  `'usage'`-texten, inte en kundyta.

**Kvar:**

- Andreas eget konto (**Andreas Bygg**, aktiv Stripe-prenumeration,
  `is_demo_tenant = false`) räknas av `isFoundersOfferAvailable()` som
  plats 1 av 20. Märk det som demokonto eller undanta det — annars går en
  verklig grundarplats till spillo. Inte gjort här: `is_demo_tenant` styr
  också demoåterställningen (v99), så det är ett medvetet val.
- Bytet till `'usage'`: §10-villkoren, särskilt punkt 7 (juridisk
  genomläsning). När det är gjort är bytet en rad i `feature-gates.ts` plus
  landningssidan.
