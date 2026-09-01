# Matte — Chefsassistent

Den enda agenten hantverkaren pratar med direkt. Också namnet på den delade
autonoma bakänden hela teamet kör på.

## Käll-kod

- `app/api/matte/chat/route.ts` (1655 rader) — den LEVANDE chattytan, den
  `MatteChatModal.tsx`/`Jobbkompisen.tsx` faktiskt anropar.
- `app/api/agent/trigger/route.ts` (676 rader) — delad autonom bakände för
  HELA teamet (Matte + Karin/Daniel/Lars/Hanna/Lisa), inte Matte-specifik.
  Egen kommentar: "Central AI agent endpoint — handles ALL inbound triggers."
- `app/api/agent/trigger/system-prompt.ts` (444 rader) — bas-prompten delad
  av alla agenter på trigger-vägen.
- `app/api/agent/trigger/tool-definitions.ts` + `tool-router.ts` (830 +
  4020 rader) — 49 verktyg (inte ~22, se README:s luckor).
- `lib/agents/personalities.ts` — routningstabell + legacy delegerings-suffix.
- `lib/agent/capabilities.ts`, `lib/agent/orchestration.ts`,
  `lib/agent/handoff.ts` — det RIKTIGA handoff-systemet den levande ytan
  använder.
- `lib/agents/memory.ts` — `agent_memories`, tvärs-konversationsminnet.

## Jobbspec

**Två strukturellt olika ingångar — de är INTE samma kodväg:**

1. **`/api/matte/chat`** — egen Claude-loop via rå `fetch` (inte SDK, inte
   `tool-definitions.ts` direkt utan en handplockad delmängd,
   `CURATED_TOOL_NAMES`). Kan handoffa till Karin/Daniel/Lars/Hanna/Lisa/
   Support upp till 3 steg per anrop (`handoff_to_agent`-verktyget), tar
   sedan tillbaka och sammanfattar. Persisteras i `thread`/`thread_message`.
2. **`/api/agent/trigger`** — den delade bakänden. Triggas av: dashboard-
   chatt (`manual`), 46elks-webhooks (`phone_call`/`incoming_sms`), cron
   (fakturapåminnelser, kommunikationskontroll, Gmail-lead-import,
   offert-uppföljning), och agent-till-agent-handoff.

**Källa**: `customer`, `quotes`, `invoice`, `booking`, `project`, `leads`,
`business_config`, `pending_approvals`, `agent_context` (nattlig analys),
`ai_learned_preferences`, plus Google Calendar/Gmail/Fortnox/46elks via
respektive verktyg. Modellval: `claude-sonnet-4-6` vid levande kundkontakt
(telefon/SMS), `claude-haiku-4-5` annars (cron, manuellt, etc.).

**Triggas**: hantverkaren skriver i chatten (levande), ELLER ett av ~41
cron-jobb, ELLER ett inkommande 46elks-webhook, ELLER en kollega-agent
handoffar en uppgift.

**Filtrerar bort**: `/api/matte/chat` exponerar bara en kuraterad
verktygsdelmängd (inte alla 49); routning till rätt kollega sker prefix-
baserat (`invoice_*`→Karin, `quote_*`/`lead_*`→Daniel, osv, se README).

**Output**: chattsvar, offerter/fakturor/bokningar skapade, SMS/mejl
skickade, kalenderhändelser, Fortnox-synk, `pending_approvals`-kort,
`agent_messages` till kollegor, `mission`-bekräftelser (Goal-to-Plan).

**Kräver godkännande** — VIKTIG NYANS, verifierad i koden, inte antagen:

- `require_approval_send_quote/invoice/create_booking`
  (Automationsinställningar) är **bara text i systemprompten**
  (`system-prompt.ts:288-296`) — `create_quote`/`create_invoice`/
  `create_booking` i `tool-router.ts` skriver **ovillkorligt** till
  databasen, oavsett vad hantverkaren kryssat i. Ingen kodkontroll av dessa
  tre flaggor hittades.
- Det som FAKTISKT kod-styr godkännande är `shouldQueueForApproval`
  (`lib/autonomy/agent-gating.ts`) — baserat på `triggerSource`: `'user'`
  (levande dashboard-/telefon-/SMS-kontakt) skickar direkt, `'system'`
  (cron, autonom automation, handoff) köas alltid om inte "förtjänat
  förtroende" gäller.
- `send_quote` har ingen intern exekverare (`INTERNAL_EXEC_TYPES`
  innehåller bara `send_sms`/`send_invoice`/`create_booking`) och tvingas
  därför alltid till `high`-risk → mänskligt godkännande i praktiken —
  offertutskick är alltså räddat trots ovanstående.
- **Praktisk konsekvens**: en bokning skapad direkt (inte via
  `create_approval_request`) kan gå igenom utan godkännande trots att
  inställningen säger motsatsen. Värt en medveten bedömning — antingen
  koda in flaggkontrollen i `tool-router.ts` eller dokumentera tydligt att
  inställningen bara är en instruktion till modellen.

**Mått som räknas**: `agent_runs` (tokens, kostnad, tid, status) — ren
drifttelemetri. `ask-coverage.ts` mäter mekaniskt "fanns verktyget/krävdes
godkännande/exekverades" men **utesluter medvetet** "förstod frågan rätt".
**Inget kvalitetsmått finns för Mattes svar** — ingen tumme upp/ner, ingen
koppling mellan en Matte-skapad offert och om den faktiskt accepterades.

**Skriver tillbaka till minnet**: `agent_memories` — efter varje
trigger-körning och chattur extraherar en Haiku-modell EN mening
("vad lärde vi oss"), klassificerar den (observation/mönster/preferens/
fakta), PII-rensar, dedupar mot tidigare minnen (Jaccard-överlapp, tröskel
0.6). `observation`/`fakta` bekräftas automatiskt; `mönster`/`preferens`
kräver mänskligt godkännande innan de litas på. Läses tillbaka med
90-dagars halveringstid, topp-5 injiceras i nästa prompt.

## Kända luckor / observationer

- **Två parallella chatt-implementationer**: `/api/matte/conversations/[id]/
  messages` relayerar till `/api/agent/trigger` men ingen dashboard-UI
  hittades som anropar den — troligen dödkod eller en extern-API-yta.
- **Två parallella delegeringssystem**: ett gammalt textmarkör-system
  (`[DELEGATED:agent_id]` i `personalities.ts`) som bara tolkas av den
  ovanstående (troligen oanvända) ytan, vid sidan av det riktiga
  verktygsbaserade handoff-systemet den levande ytan faktiskt kör.
- Bas-systemprompten (`system-prompt.ts`) nämner knappt kollegorna —
  delegerings-/expertisgränser beskrivs i stället i chattytans EGEN
  promptbyggare (`buildAgentSystemPrompt`), en annan fil.
