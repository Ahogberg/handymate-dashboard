# Fortnox-scope-audit (2026-06-03)

**Mål:** identifiera vilka Fortnox-scopes vi FAKTISKT använder i koden, så vi kan slimma OAuth-requesten till minimum.

**Strategiskt val (Andreas):** Handymate är hantverkar-OS som SYNKAR fakturor till bokföringssystem. Inte CRM. Inte tids-redskap för Fortnox-sidan. Bara: skapa faktura i Fortnox + synka betalningsstatus tillbaka.

**Format:** audit + rekommendation. INGEN kod-ändring i denna leverans.

---

## A. Scope-tabell — används? → use case → essentiell?

| Scope | Används i kod | Var | Use case | Essentiell för pilot? |
|-------|---------------|-----|----------|----------------------|
| `invoice` | ✅ JA | `lib/fortnox.ts:590, 606` | POST `/invoices` skapa, GET `/invoices/{id}` status-läsning | **JA — KÄRNAN** |
| `customer` | ✅ JA | `lib/fortnox.ts:398, 418, 440` | GET `/customers` lista, POST `/customers` skapa, PUT `/customers/{id}` uppdatera | **JA — krävs innan invoice** |
| `companyinformation` | ✅ JA | `lib/fortnox.ts:359` | GET `/companyinformation` vid OAuth-callback (visa "Kopplad till FÖRETAGSNAMN") | **JA — UX-bekräftelse** |
| `bookkeeping` | ⚠️ DEAD CODE | `lib/fortnox.ts:733` (`bookFortnoxInvoice`) | PUT `/invoices/{id}/bookkeep` — manuellt bokföra faktura | **NEJ — Fortnox bokför automatiskt vid betalning** |
| `payment` | ⚠️ DEAD CODE | `lib/fortnox.ts:757` (`registerFortnoxPayment`) | POST `/invoicepayments` — registrera betalning från bank-API | **NEJ — saknar bank-integration** |
| `offer` | ⚠️ DEAD CODE | `lib/fortnox.ts:802` (`syncQuoteToFortnox`) | POST `/offers` — sync offert till Fortnox | **NEJ — Christoffer skickar offert från Handymate, Fortnox behöver ej se den** |
| `article` | ❌ EJ ANVÄND | — | Skulle kunna importera Fortnox-artikellistor till Handymate | **NEJ — Handymate har eget material-bibliotek (v3_materials)** |
| `order` | ❌ EJ ANVÄND | — | Skulle kunna sync orderhuvuden | **NEJ — vi har inte order-koncept i Handymate** |
| `project` | ❌ EJ ANVÄND | — | Skulle kunna sync project-id mellan systemen | **NEJ — Handymate äger projekt-data, Fortnox-projekt är frikopplat** |
| `price` | ❌ EJ ANVÄND | — | Skulle kunna läsa Fortnox-prislistor | **NEJ — Handymate har egen price_list-tabell** |
| `time` | ❌ EJ ANVÄND | — | Skulle kunna sync time_entry till Fortnox | **NEJ — strategiskt val: tidredovisning bor i Handymate** |
| `settings` | ❌ EJ ANVÄND | — | Skulle kunna läsa kontonummer / skattesatser | **NEJ — vi hårdkodar 25% moms i Handymate, Fortnox väljer konto vid POST** |

### Sammanfattning

- **3 scopes är faktiskt aktiva i kod** (`invoice`, `customer`, `companyinformation`)
- **3 scopes är dead-code** (`bookkeeping`, `payment`, `offer`) — funktioner finns men anropas aldrig från pilot-flöden
- **6 scopes är helt oanvända** (`article`, `order`, `project`, `price`, `time`, `settings`)

---

## B. Rekommenderad minimal scope-lista för pilot

```
invoice customer companyinformation
```

Tre scopes. Räcker för:
1. ✅ Skapa faktura i Fortnox från Handymate (POST `/invoices`)
2. ✅ Skapa/uppdatera kund i Fortnox innan faktura (POST/PUT `/customers`)
3. ✅ Synka betalningsstatus tillbaka (GET `/invoices/{id}` läser `Balance` + `Sent`)
4. ✅ Visa "Kopplad till FÖRETAGSNAMN" i settings-UI (GET `/companyinformation`)

### Notera: betalnings-synk fungerar med BARA `invoice`

Cron-jobbet `syncFortnoxPaymentsForBusiness()` (var 2h) gör **GET `/invoices/{id}`** och läser `Balance`/`DueDate`-fält ur invoice-responsen. Det är `invoice`-scope, inte `payment`-scope. Vi behöver inte `payment` för att veta att en faktura är betald — vi behöver `payment` bara om vi vill **registrera** en betalning från utsidan in i Fortnox (vilket vi inte gör).

---

## C. Vad vi tappar med slimning

### Förlorade befintliga funktioner

Inga aktiva pilot-flöden. Tre dead-code-paths blir oanropbara om vi tar bort scopes:

| Funktion | Scope-krav | Status i pilot | Konsekvens av slimning |
|----------|-----------|---------------|------------------------|
| `bookFortnoxInvoice()` | `bookkeeping` | Ej anropad | Funktion blir 401-failande om någon framtida call gör det. Bygg + lägg till scope när dags. |
| `registerFortnoxPayment()` | `payment` | Ej anropad | Samma — bygg när bank-integration är på roadmappen. |
| `syncQuoteToFortnox()` | `offer` | Ej anropad | Samma — bygg när Christoffer vill ha offerter i Fortnox också. |

**Ingen befintlig användarvärd-skapande feature går sönder.**

### Förlorade framtida features

Strategiskt val (Andreas): Handymate äger material/pris/tid/projekt-data. Att synka det till Fortnox vore duplicerande arbete utan användarvärde. Christoffer behöver inte se projekt-IDn eller materials i Fortnox.

**Sannolika framtida scope-utvidgningar (lägg till när behov uppstår):**

- `bookkeeping` — om vi vill bygga "Mark som bokförd"-UI för Christoffer
- `payment` — om vi integrerar med bank-API:er (Swedbank, SEB) och vill pusha betalningar
- `offer` — om Christoffer vill se Fortnox-rapport över offerter (osannolikt)

Var och en av dessa kräver re-OAuth (användaren måste re-godkänna med nya scopes), så slimning nu betyder en re-koppling per framtida utvidgning. Det är acceptabel friktion för en feature som faktiskt levereras.

---

## D. Fortnox-licenser Christoffer behöver efter slimning

### Idag (med 12-scope-requesten)

Christoffer behöver:
- **Bokföring + Fakturering + Integrationslicens** — bas
- **Offert & order** — för `offer`/`order`-scopes
- **Tidredovisning** — för `time`-scope
- **Anläggningsregister?** — ev. för `article`-scope (oklart om alltid krävs)

Den här konstellationen kostar märkbart mer per månad än bas-paketet.

### Efter slimning till 3 scopes

Christoffer behöver:
- **Fakturering** — för `invoice`-scope (~99 kr/mån i Fortnox idag)
- **Integrationslicens** — för API-access (~99 kr/mån)
- (Eventuellt **Bokföring** om han vill bokföra själv — det är hans eget val, inte Handymate-krav)

**Förhoppning bekräftad:** "Offert & order" + "Tidredovisning" kan tas bort.

---

## E. Filer som behöver uppdateras

### Primär ändring (en rad)

**Fil:** `app/api/integrations/fortnox/connect/route.ts:8`

```typescript
// Idag:
const FORTNOX_SCOPES = 'invoice customer article payment bookkeeping settings companyinformation offer order project price time'

// Efter slimning:
const FORTNOX_SCOPES = 'invoice customer companyinformation'
```

### Sekundär (städa dead-code-functions)

Inte krävs för slimning — funktionerna kan ligga kvar och bli 401-failande om de nånsin kallas. Men för städning:

- `lib/fortnox.ts:733` (`bookFortnoxInvoice`) — markera deprecated eller ta bort
- `lib/fortnox.ts:757` (`registerFortnoxPayment`) — markera deprecated eller ta bort
- `lib/fortnox.ts:802` (`syncQuoteToFortnox`) — markera deprecated eller ta bort
- `lib/fortnox.ts:440` (`updateFortnoxCustomer`) — KVAR (`customer`-scope finns, framtida feature kan använda)

### Re-OAuth krävs för Bee

Christoffer måste **koppla från och koppla på Fortnox igen** efter att scopet ändras. Befintlig token är giltig för gamla 12 scopes och kommer fortsätta fungera tills den utgår eller refreshas — så ingen omedelbar incident, men nästa onboarding av pilot bygger på det smala scopet.

**Plan:**
1. Slimma `FORTNOX_SCOPES` i kod
2. Deploy
3. Säg till Christoffer: "Koppla från i Inställningar → Integrationer → Fortnox, sen koppla på igen — vi har slimmat behörigheten."
4. Verifiera att han inte ser dialog som varnar om dropad scope (Fortnox brukar visa "denna app vill nu ha färre rättigheter")

---

## F. Rekommendation

**Slimma till `invoice customer companyinformation`.**

- Bevarar 100% av pilot-funktionalitet.
- Sparar Christoffer licenspengar (kan dropp "Offert & order" + "Tidredovisning" från Fortnox-paketet).
- Tydligare strategiskt budskap: "Handymate äger arbetet, Fortnox äger bokföringen."
- Framtida scope-utvidgningar är 1-rads-ändringar + re-OAuth när faktisk feature behövs.

### Inte krävt för slimning, men värt att överväga

- **Städ bort `app/api/fortnox/*`-route-tree** (legacy med begränsad scope). Allt är duplicerat under `/api/integrations/fortnox/*`. Identifiera vilka frontend-komponenter som fortfarande kallar gamla routes och migrera dem, sen radera. Reducerar kognitiv börda.
- **Markera dead-code-functions som `@deprecated`** så framtida-Andreas vet att de kräver scope-utvidgning innan användning.

Båda kan vara separata commits efter slimningen, inte blocking.

---

## G. Beslut Andreas

- [ ] Slimma till 3 scopes (`invoice customer companyinformation`)?
- [ ] Vänta och slimma efter pilot-fas?
- [ ] Slimma till annan kombination — vilken?

Säg till så bygger jag slimning-commiten (en rad + kort commit-message). Re-OAuth-instruktion till Christoffer hanteras separat.
