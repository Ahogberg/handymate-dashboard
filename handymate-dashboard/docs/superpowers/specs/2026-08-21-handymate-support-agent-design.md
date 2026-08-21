# Handymate Support-agenten — Design

## Bakgrund

Andreas vill bygga support i världsklass för Handymates egna kunder
(hantverkarna) — AI först, människa i andra hand, med målet att hålla
extremt höga Google-betyg. Ursprungsfrågan var om Matte (som redan är
"på hantverkarens sida") kunde tränas på Handymate-supportfrågor också,
eller om det skapar en konstig dynamik.

Svaret som styr hela designen: **beror på ämnet.** Produktfrågor/how-to
har ingen intressekonflikt — Matte kan svara direkt, med full kontext om
företaget, vilket är en verklig fördel mot konkurrenter. Konto/fakturering/
uppsägning/klagomål är en annan sak: Mattes hela värde bygger på att vara
"på din sida", och den rollen kolliderar med att samtidigt försvara
Handymates prissättning eller neka en refund. Lösningen är inte en ny
chatt, utan en ny röst inom SAMMA chatt, som kopplas in bara när det
faktiskt behövs.

Research innan design visade att mycket redan finns:

- **`/admin`** (`app/admin/page.tsx`) har redan en KPI-översikt (aktiva
  företag, MRR, churn, plandistribution, signups) — det Andreas kallade
  "en dashboard som partnerportalen fast för hela Handymate" finns
  till stor del redan. Denna spec lägger BARA till en ny flik där för
  supportkön; KPI-vyn i övrigt rörs inte.
- **Matte är redan en multi-agent-orkestrator.** `lib/agent/capabilities.ts`
  definierar `AgentId = 'matte' | 'lars' | 'karin' | 'daniel' | 'hanna' |
  'lisa'`, med ett fungerande `handoff_to_agent`-verktyg
  (`app/api/matte/chat/route.ts:368-389`), en handoff-exekverare
  (`lib/agent/handoff.ts:141` `executeHandoff`) som skriver till
  `agent_threads`/`agent_handoffs` och genererar en naturlig
  övergångsmening (`buildHandoffAnnouncement`, rad 236), samt
  per-agent verktygsbegränsning (`lib/agents/personalities.ts`,
  `getAgentTools`). **Support byggs som en SJUNDE agent i detta redan
  befintliga system — ingen ny klassificerare, ingen ny chatt-arkitektur.**
  Mattes egen resonemangsförmåga (samma mekanism som redan avgör när
  den ska lämna över till Lars/Karin/Daniel) lär sig när den ska lämna
  över till Support, via en utökad `out_of_scope`-lista.
- **Meddelanden lagras redan** i `thread_message` (en rad per
  konversationsmeddelande, med `agent`-fält) — Support behöver INGEN
  egen meddelandetabell, bara en lätt spårningsrad ovanpå.
- **Push-notiser** går via `sendApprovalPush()`
  (`lib/notifications/approval-push.ts:270`), manuellt kopplad in per
  call-site (inte en DB-trigger). Ingen befintlig mekanism notifierar
  Handymates EGET team (bara enskilda businesses ägare om sina egna
  `pending_approvals`) — det är den enda genuint nya notifieringsbiten.
- **Recensions-SMS-mönstret** (`app/api/cron/review-requests/route.ts`,
  `lib/notifications/review-request-message.ts`) pekar idag mot
  `business_config.google_place_id` — samma konstruktion
  (`https://search.google.com/local/writereview?placeid=...`) återanvänds
  för Handymates egen recension, bara med ett nytt, hårdkodat placeId
  istället för att slå upp en per-business-rad.

## Beslut

1. **Support är agent nummer sju**, inte en separat produkt. Samma
   trådar, samma handoff-mekanism, samma verktygsbegränsningsmönster
   som Lars/Karin/Daniel/Hanna/Lisa.
2. **Eskalering till Support, v1: fast, deterministisk lista.** Matte
   (eller vilken agent hantverkaren råkar prata med) lämnar över till
   Support när: hantverkaren uttryckligen ber om en människa, ELLER
   ämnet är ett av: uppsägning/nedgradering av abonnemang,
   refund-förfrågan, GDPR/juridiskt klagomål, en bugg med bekräftad
   pengapåverkan. Allt annat kontospecifikt (fakturafrågor om SIN EGEN
   Handymate-räkning, "vad kostar min plan") försöker Support lösa
   själv INNAN den eskalerar vidare till en människa.
3. **Support har full läsåtkomst till kontots Handymate-prenumeration/
   fakturering, noll skrivrätt.** Refund och uppsägning går ALDRIG via
   det befintliga `create_approval_request`/`pending_approvals` —
   den kön läses redan av hantverkarens EGEN business-facing sida
   (`app/dashboard/approvals/page.tsx`), och en rad om att godkänna sin
   egen refund där vore bakvänd (det är Handymate som ska granska, inte
   hantverkaren). Refund/uppsägning går via SAMMA nya `support_ticket`-
   spårning och notis som alla andra eskaleringar — se punkt 5.
4. **Support bryter medvetet mot "alltid Mattes ansikte"-regeln.**
   Idag visas Mattes porträtt på alla svar oavsett vilken specialist
   som egentligen svarade (`components/MatteChatModal.tsx:401`,
   uttryckligen avsiktligt). Support är det EN deliberata undantaget:
   eget avatar/namn + en tydlig skiljelinje i tråden när den kopplas
   in. Anledningen är specifik för just den här agenten — alla andra
   specialister är otvetydigt "ditt team"; Support representerar
   Handymate självt, och den skillnaden måste synas, inte gömmas i en
   fotnot.
5. **Eskalering pushar direkt till er, alltid.** Ni är två personer —
   ingen SLA-motor, bara en omedelbar push/SMS när något landar i kön.
6. **Ni svarar i `/admin`, svaret landar i samma chattråd.** Sluten
   loop, en historik.
7. **Recension bara efter bekräftat nöjd.** En snabb tumme upp/ner vid
   stängt ärende; bara positiv triggar recensionslänken.

## Datamodell

**Ny tabell `support_ticket`** — en lätt spårningsrad, INTE
konversationsinnehållet (det ligger redan i `thread_message`):

```sql
CREATE TABLE support_ticket (
  id TEXT PRIMARY KEY,                    -- 'stkt_' + random
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  thread_id TEXT NOT NULL REFERENCES agent_threads(id),
  category TEXT NOT NULL,                 -- 'cancellation'|'refund'|'gdpr'|'bug_financial'|'human_requested'|'other'
  status TEXT NOT NULL DEFAULT 'escalated'
    CHECK (status IN ('escalated', 'in_progress', 'resolved')),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  satisfaction TEXT CHECK (satisfaction IN ('positive', 'negative')),
  resolved_by TEXT                        -- @handymate.se-mejl som stängde ärendet
);
CREATE INDEX idx_support_ticket_status ON support_ticket(status, escalated_at);
```

`thread_id` pekar in i den befintliga `agent_threads`/`thread_message`-
infrastrukturen — hela konversationen (före, under och efter eskalering)
finns redan där. Ingen `support_message`-tabell behövs.

## Arkitektur

**1. Agentdefinition** (`lib/agent/capabilities.ts`) — lägg till
`'support'` i `AgentId`-unionen och en `AGENT_CAPABILITIES.support`-post:

```ts
support: {
  id: 'support',
  name: 'Handymate Support',
  domain: 'Handymates egen support — konto, fakturering, uppsägning, klagomål på plattformen.',
  expertise: [
    'Frågor om din Handymate-prenumeration och fakturering',
    'Uppsägning eller nedgradering',
    'Refund-förfrågningar (skapar en begäran, beslutar aldrig själv)',
    'Klagomål och buggar som påverkat dig ekonomiskt',
  ],
  out_of_scope: [
    'Allt som rör DINA kunder/offerter/fakturor — Matte och teamet äger det',
  ],
  handoff_targets: ['matte'],   // bara tillbaka till Matte, aldrig sidledes till Lars/Karin/etc.
},
```

**Alla övriga agenters `handoff_targets`-listor utökas med `'support'`**
(Lars/Karin/Daniel/Hanna/Lisa i samma fil) — annars kan en hantverkare
som redan pratar med t.ex. Lars om ett projekt inte eskalera direkt om
de mitt i samtalet frågar om sitt Handymate-konto (se Edge-fall).

**2. Mattes eskaleringsregler** — `AGENT_CAPABILITIES.matte.out_of_scope`
utökas med en rad: `'Frågor om ditt Handymate-konto, fakturering,
uppsägning eller klagomål på plattformen — Support äger'`. Samma
mekanism som redan får Matte att lämna över till Lars vid projektfrågor
gör jobbet — ingen ny klassificeringskod.

**3. Verktygsscope** (`lib/agents/personalities.ts`) — ny post i
`AGENT_PERSONALITIES.support` med en snäv `allowedTools`-array (inte
`'all'`):

- `get_account_billing_status` (**nytt verktyg** — se nedan)
- `escalate_to_handymate_team` (**nytt verktyg** — se nedan, ENDA vägen
  för alla eskaleringar: refund, uppsägning, GDPR-klagomål, allvarlig
  bugg)
- `handoff_to_agent` (koordinationsverktyg, redan tillgängligt alla agenter)

`create_approval_request` ingår MEDVETET INTE i Supports verktygslista
— den kön är hantverkarens egen (se Beslut punkt 3).

**4. Nytt verktyg `get_account_billing_status`** — läggs till i
`lib/tool-definitions.ts` + `lib/tool-router.ts` (samma
tvåfilersmönster CLAUDE.md redan kräver för nya verktyg). Läser i v1
ENDAST `business_config.subscription_plan/subscription_status/
trial_ends_at` — samma källa `/admin`s MRR-beräkning redan använder
(`app/api/admin/metrics/route.ts`), inte en ny, egen sanningskälla.
Live Stripe-uppslag (faktiska debiteringar, kommande förnyelse) är
explicit UTANFÖR v1 — se Utanför scope. **Rent läsande** — inga
skrivvägar.

**5. Nytt verktyg `escalate_to_handymate_team`** — DEN ENDA vägen för
varje eskalering, oavsett kategori (`refund`, `cancellation`, `gdpr`,
`bug_financial`, `human_requested`). Skapar en `support_ticket`-rad
(`status='escalated'`, kategori från verktygets input, `thread_id`
från konversationen) och anropar notifieringshjälparen (punkt 6). Ingen
gren mot `pending_approvals` — refund/uppsägning granskas och utförs
manuellt av er i admin-kön (nästa avsnitt), inte via ett
godkännande-klick i ett system byggt för hantverkarens egna beslut.

**6. Ny notifieringshjälpare** — `notifyHandymateSupportTeam()` i
`lib/notifications/`, återanvänder samma push-infrastruktur som
`sendApprovalPush()` (`/api/push/send`) men med en FAST
mottagarlista för v1 (miljövariabel eller hårdkodad
`['andreas@handymate.se', 'christoffer@handymate.se']`-array — matchar
exakt samma "hårdkodad mottagare"-mönster som redan finns i
`app/api/cron/driftlarm/route.ts:348`, bara push istället för
mejl-digest). En generell "slå upp alla @handymate.se-mejl"-lösning är
uttryckligen UTANFÖR scope — två hårdkodade mottagare räcker för ett
team på två.

**7. UI-avatar-undantaget** (`components/MatteChatModal.tsx`) — där
komponenten idag alltid renderar Mattes porträtt (rad ~401), läggs ett
villkor till: `agent === 'support'` renderar istället en egen
Support-ikon/namn-header ("🎧 Handymate Support") ovanpå bubblan. Kräver
en ny avatarbild eller — för v1 — en enkel ikon (lucide-react
`Headset`), inget nytt bilduppladdningsflöde. Skiljelinjen i tråden
själv kommer redan gratis från `buildHandoffAnnouncement()` (ingen
ändring där — texten "Det där är inget jag hanterar bäst — jag lämnar
över till Handymate Support" fungerar oförändrad).

## Admin — supportkön

**Ny flik i `/admin`** (`app/admin/page.tsx`, samma
`isAdmin()`-inloggningsgrind som redan gäller resten av sidan — inget
nytt auth-system). Visar `support_ticket`-rader där `status !=
'resolved'`, sorterat äldst-eskalerad-först, med kategori-badge (så
`refund`/`cancellation`-ärenden syns tydligt som kräver en faktisk
åtgärd från er, inte bara ett svar).

**Ärendevy:** klick på en rad öppnar tråden — samma `thread_message`-
historik som redan renderas i Matte-chatten, återanvänd read-only, plus
en svarsruta. Att skicka ett svar där:
1. Infogar en ny `thread_message`-rad (`role='assistant'`,
   `agent='support'`) med businessId+threadId från ärendet — INGEN
   Claude-runda körs, det är en ren människoskriven rad genom samma
   lagringsfunktion (`saveThreadMessage`) som redan finns.
2. Sätter `support_ticket.status='in_progress'` vid första svaret.
3. En explicit "Markera löst"-knapp sätter `status='resolved'`,
   `resolved_at`, `resolved_by` — och triggar nöjdhetsfrågan (nästa
   avsnitt).

## Nöjdhetsfråga + recension

Vid `status='resolved'`: nästa gång hantverkaren är i chatten (eller
direkt, om de fortfarande är i tråden) visas en enkel tumme upp/ner:
"Löste vi det åt dig?". Positivt svar → samma
`buildReviewRequestMessage()`-mönster som redan används för
hantverkarnas egna kunder, men pekat mot en NY, hårdkodad Handymate-
egen Google-recensionslänk (env-variabel `HANDYMATE_GOOGLE_REVIEW_URL`
— inget nytt konfig-system, ingen `app_config`-tabell; ett enda
konstantvärde motiverar inte det). Negativt svar → ingen recensionslänk,
bara en tack-text; själva ärendet är redan `resolved` (öppnar inte ett
nytt).

## Testning

- Facit: `canHandoff('matte', 'support')` tillåten,
  `canHandoff('support', 'lars')` NEKAD (support får bara handoff
  tillbaka till matte — `handoff_targets: ['matte']`).
- Facit: `getAgentTools('support')` returnerar exakt den snäva listan,
  inte `'all'`.
- Facit: `get_account_billing_status` är rent läsande — grep efter att
  ingen `.update()`/`.insert()` finns i verktygets implementation.
- Facit: `escalate_to_handymate_team` skapar `support_ticket` med
  korrekt `category` (alla fem: refund/cancellation/gdpr/bug_financial/
  human_requested), och anropar `notifyHandymateSupportTeam()` — mockat
  push-anrop verifieras.
- Facit: Support-agentens verktygslista (`getAgentTools('support')`)
  innehåller INTE `create_approval_request` — regressionsskydd mot att
  någon av misstag lägger tillbaka den kopplingen.
- UI-facit: `MatteChatModal` renderar Support-header när
  `message.agent === 'support'`, Mattes porträtt annars (regressionsskydd
  mot att undantaget läcker till andra agenter).
- Manuellt: en riktig eskalering end-to-end (chatta fram en uppsägning,
  verifiera push landar, svara i `/admin`, verifiera svaret syns i
  chatten, markera löst, verifiera nöjdhetsfrågan dyker upp).

## Edge-fall

- Hantverkare ber om människa MEDAN de redan pratar med en specialist
  (t.ex. Lars) — handoff sker direkt till Support (Lars har
  `handoff_targets` som inte inkluderar support idag; lägg till
  `'support'` i ALLA agenters `handoff_targets`-listor, inte bara
  Mattes, så eskalering fungerar oavsett vem hantverkaren råkar prata
  med).
- Samma tråd eskalerar flera gånger (t.ex. löst, men samma
  hantverkare kommer tillbaka med samma problem) — ny `support_ticket`-
  rad varje eskalering, inte en återöppning av den gamla; historiken i
  `thread_message` är ändå sammanhängande.
- En refund-begäran avslås efter granskning — `support_ticket`
  markeras ändå `resolved` av er (avslag är också ett svar, bara inte
  det hantverkaren ville ha); nöjdhetsfrågan går ut som vanligt och kan
  helt rimligt besvaras negativt.
- Företag utan aktiv Handymate-prenumeration (t.ex. redan uppsagt) som
  ändå skriver i chatten — `get_account_billing_status` returnerar det
  faktiska läget ärligt, ingen särskild felhantering behövs.

## Utanför scope (v1)

- Email/telefon som egen supportkanal — allt går via Matte-chatten.
- Känsloläges-/sentimentdetektion utöver den fasta kategorilistan.
- SLA-timers eller automatisk eskalering-av-eskalering.
- Generell "alla @handymate.se-mejl"-mottagarlista — två hårdkodade
  mottagare.
- Nytt konfigurationssystem för Handymates egna app-inställningar —
  en enda miljövariabel för recensionslänken räcker.
- Ändringar av den befintliga KPI-vyn i `/admin` — bara en ny flik
  läggs till.
- Live Stripe-uppslag i `get_account_billing_status` — `business_config`
  räcker för v1, samma källa `/admin`s MRR redan litar på.
