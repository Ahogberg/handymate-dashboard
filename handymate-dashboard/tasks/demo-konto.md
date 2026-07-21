# Demo-trygghet — riggat demokonto för säljdemos

Branch: `feat/demo-trygghet`

## Syfte

Christoffer (säljare) ska kunna återställa demokontot med en knapp precis
innan varje kunddemo, så att demon alltid visar färsk, realistisk, levande
data — oavsett när den körs. Alla datum sätts RELATIVT NU vid varje
återställning (t.ex. "offert skickad 6 dagar sedan" är alltid sant, oavsett
vilket datum det faktiskt är).

## Så riggar Andreas det (en gång)

1. **Skapa demokontot** — vanlig signup på app.handymate.se, precis som en
   riktig kund. Fyll i onboarding normalt (bransch, priser etc.) — och se
   särskilt till att fylla i **"Ditt privata mobilnummer"** i
   Inställningar → Telefoni (`personal_phone`). Det är numret alla
   demo-kunder får, se nedan.
2. **Sätt `DEMO_BUSINESS_ID`** i Vercel → Project Settings → Environment
   Variables, värdet = `business_id` för kontot som skapades i steg 1
   (finns t.ex. i Supabase Table Editor → `business_config`). Redeploy.
3. **Logga in på demokontot** → gå till `/dashboard/demo` (direkt-URL, ligger
   inte i sidomenyn) → tryck **"Återställ demon"**.

Kör om steg 3 inför varje demo — tar någon sekund, raderar gårdagens
demo-data och skapar ny.

## Säkerhetsmodell

Resetten är destruktiv (delete → insert) så den skyddas av två lager:

1. **Inloggning** — `getAuthenticatedBusiness()`, som alla andra API-routes.
2. **Hård grind** — `app/api/admin/demo-reset/route.ts` kräver att
   `business.business_id === process.env.DEMO_BUSINESS_ID`. Är env-varn inte
   satt svarar routen **alltid 403**, oavsett vem som är inloggad.

Det gör det omöjligt att av misstag (eller avsiktligt) radera en riktig
kunds data — resetten kan bara någonsin köras inloggad på själva
demokontot, och bara mot det. UI-sidan `/dashboard/demo` ligger inte i
`Sidebar`/`NavItem` men behöver inte gömmas — API:t vägrar ändå för alla
andra konton och visar en tydlig varningsruta ("Det här är inte
demokontot.") om man av misstag hamnar där inloggad på fel konto.

`resetDemoAccount()` i `lib/demo/seed-demo-account.ts` rör **aldrig**
`business_config`, `business_users`, `business_preferences` eller `auth` —
den läser bara `personal_phone`/`business_name`/`contact_name` (read-only)
och skriver bara till de tabeller den själv seedar (se lista nedan).

## Alla kund-telefonnummer = ägarens egna mobilnummer

Alla 6 demokunder får **samma telefonnummer**: demokontots
`business_config.personal_phone`, läst vid varje reset. Det betyder att om
ett godkännande-kort (t.ex. "skicka SMS till kund") godkänns live under
demon, landar SMS:et i **presentatörens egen telefon** — inget riskerar att
gå till en riktig person. E-postadresser följer mönstret
`demo+<n>@handymate.se`.

Om `personal_phone` inte är ifyllt på demokontot vägrar reset-knappen med
ett tydligt felmeddelande istället för att seeda kunder utan nummer (SMS-
godkännanden skulle då vara obrukbara i demon).

## Vad som seedas

Allt raderas och återskapas i beroendeordning
(`pending_approvals → agent_runs → pipeline_activity → quote_items →
invoice → project → quotes → deal → customer`), filtrerat på demokontots
`business_id` i varje tabell:

| Tabell | Antal | Innehåll |
|---|---|---|
| `customer` | 6 | Blandat privat/BRF/företag, svenska namn, alla tel = ägarens `personal_phone` |
| `deal` | 4 | Olika pipeline-steg: ny förfrågan (akut takläckage), kontaktad (eldragning garage), offert skickad (altanbygge), offert accepterad (badrumsrenovering) — värden exkl. moms enligt spec |
| `quotes` + `quote_items` | 3 | Skickad (obesvarad 6 dagar), accepterad (med ROT), utkast (med tillval) — totaler beräknade via riktiga `calculateQuoteTotals()` |
| `invoice` | 3 | Betald, skickad (ej förfallen), förfallen 8 dagar |
| `project` | 2 | Pågående (kopplat till accepterade offerten, 35 % klart), nyligen avslutat |
| `pending_approvals` | 3 | Daniels offertuppföljning, Lisas svar på missat samtal, Karins fakturapåminnelse — payload verifierad mot riktig kod (se nedan) |
| `agent_runs` | 3 | Enkla Lisa-rader "igår kväll" så bevisbandet/teamsummeringen har siffror |

Pipeline-stegen (`pipeline_stage`) seedas INTE om (rörs inte) — de antas
redan finnas från kontots vanliga onboarding (`ensureDefaultStages()`
anropas defensivt som no-op-säkerhet).

## Pending_approvals — verifierad mot riktig kod

Payload-formen är kopierad exakt från de faktiska skaparna så att
Godkänn-knappen kör på riktigt i demon (inte bara en attrapp):

- **Daniel — offertuppföljning** (`quote_nudge`): fält (`agent_id`,
  `quote_id`, `to`, `message`, `customer_name`, `view_count`) och
  titel/beskrivnings-format kopierade från
  `lib/autopilot/quote-nudge.ts:84-103`.
- **Karin — fakturapåminnelse** (`invoice_reminder`): `payload.delivery`
  matchar `ReminderDeliveryInput`-interfacet i
  `lib/invoice-reminder-send.ts:25-48` fält-för-fält, och är byggd enligt
  samma mönster som `deliveryInput` i
  `app/api/cron/send-reminders/route.ts:342-360`. Godkänn kör
  `deliverInvoiceReminder()` på riktigt (SMS + eventuell avgift/ränta på
  fakturan).
- **Lisa — svar på missat samtal** (`send_sms`): generisk
  `send_sms`-approval (`to` + `message` + `customer_id`), samma
  SMS-mall-text som v3-systemregeln "Svar på missat samtal" i
  `lib/seed-defaults.ts:74-81` (i produktion `requires_approval: false` och
  skickas alltså direkt där — i demon köad manuellt så Christoffer kan visa
  godkänn-flödet). Exekveras via det generiska `send_sms`-caset i
  `app/api/approvals/[id]/route.ts:422-441`.

## Medvetna avsteg från produktionsbeteende

- **`deal.value` synkas INTE upp mot `quote.total`** (som
  `POST /api/quotes` annars gör) när en offert kopplas till en affär. Detta
  är avsiktligt — spec:en angav exakta pipeline-värden **exklusive moms**
  (185 000 / 95 000 / 28 000 / 15 000 kr), medan `quote.total` inkluderar
  moms. Verksamhetsöversiktens siffror ska matcha spec:en, inte
  moms-inkl.-beloppet.
- **Fakturanummer** använder ett eget `-D01`/`-D02`/`-D03`-mönster istället
  för att läsa/skriva `business_config.next_invoice_number` — enligt regeln
  att aldrig röra `business_config` skulle annars framtida riktiga fakturor
  under demon riskera nummerkollision om räknaren inte synkades.

## Verifiering

- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` — 0 fel i de nya filerna.
- `npx next build` — ren (bortsett från känd `/api/cron/fortnox-sync`-artefakt).
