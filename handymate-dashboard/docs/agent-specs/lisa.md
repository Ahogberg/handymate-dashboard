# Lisa — Kundservice

Verklig och autonom — men INTE på det sätt namnet "svarar i telefon"
antyder. Läs "Vad Lisa faktiskt gör" innan ni beskriver henne utåt.

## Käll-kod

- `app/api/voice/incoming/route.ts` — 46elks-webhook, samtalsrouting.
- `app/api/voice/greeting/route.ts` — det statiska röstmeddelandet.
- `app/api/voice/missed/route.ts` — missat-samtal-hantering.
- `app/api/voice/analyze/route.ts` — den ASYNKRONA efteranalysen (Haiku).
- `app/api/sms/incoming/route.ts` — DÄR Lisas riktiga agentloop faktiskt
  körs (kundens svar på catch-SMS:et).
- `lib/voice/retention.ts`, `lib/voice/analysis-scope.ts`,
  `lib/voice/call-outcome.ts`, `lib/outbound/sms-gate.ts`.

## Vad Lisa faktiskt gör (verifierat, inte antaget)

1. Samtal kommer in → 46elks-webhook → routning på `call_handling_mode`.
   Utanför kontorstid (eller om ingen kopplar upp) → **ett statiskt,
   icke-konversationellt röstmeddelande** spelas upp ("Vi kan tyvärr inte
   svara just nu. Lämna ett meddelande…") — läser bara företagsnamnet,
   ingen kunskapsbas, ingen kundhistorik, ingen levande LLM-tur.
2. Vid lagt på → en mall-baserad catch-SMS skickas OMEDELBART (seedad
   systemregel "Missat samtal", `requires_approval: false`) — **detta är
   inte ett LLM-anrop**, det är en fast mall.
3. **Om kunden svarar på den SMS:en** — DÅ startar Lisas riktiga,
   autonoma agentloop (`app/api/sms/incoming/route.ts` → `/api/agent/
   trigger` med `trigger_type: 'incoming_sms'`). Det är HÄR "Lisa missar
   aldrig ett jobb" faktiskt sker — via SMS-tråden, inte samtalet.
4. Om samtalet spelades in och transkriberades: en HELT SEPARAT,
   asynkron analyspipeline (`/api/voice/analyze`, Haiku, köra via cron/
   bakgrundsjobb) läser transkriptet och skapar förslagskort — det är
   INTE Lisa som agerar i realtid, det är en efterhandsanalys som råkar
   visas med hennes namn/avatar i UI:t.

**Bekräftad konsekvens**: `trigger_type: 'phone_call'` skrivs ALDRIG av
riktig samtalskod — bara av demo-seed-data. Dashboardens "Lisa – samtal &
SMS besvarade"-ruta (`app/api/dashboard/team-activity/route.ts`) räknar
`agent_id='lisa' AND trigger_type='phone_call'`-rader, vilket i skarpt läge
alltid blir 0 för den delen. Bara `incoming_sms`-raderna speglar hennes
verkliga aktivitet.

## Jobbspec

**Källa** (SMS-agentloopen): `business_config`, `knowledge_base`,
`v3_automation_settings`, `agent_context`, `ai_learned_preferences`,
kundens kommunikationshistorik (`get_communication_trail`, skrivskyddat).
Hon har INGET `customer_fact`-verktyg (varken läs eller skriv).

**Triggas**: kund svarar på catch-SMS (levande) ELLER en inspelning
transkriberas (asynkron analys, separat pipeline).

**Filtrerar bort**: analyspipelinen tillåter bara sex förslagstyper
(`quote | follow_up | callback | reminder | reschedule | customer_fact`)
— exakt de typer hennes egna live-verktyg INTE kan göra, så de två
systemen kan aldrig agera på samma sak dubbelt.

**Output** (live SMS-loop): `create_customer`/`update_customer`,
`create_booking`, `send_sms`, `send_email`, `book_site_visit`,
`create_approval_request`. Hon har INGEN `create_quote`-behörighet.

**Kräver godkännande**:
- Levande SMS-svar (`triggerSource: 'user'`): skickas DIREKT, inget
  mänskligt godkännande — produktregeln är att en pågående kundkontakt
  räknas som användarinitierad, inte autonom.
- Analyspipelinens förslag: ALLTID godkännande-gated, oavsett
  triggerkälla — `customer_fact`/offert-utkast materialiseras aldrig
  förrän en människa godkänt.
- Nattblock 21:00–08:00 för SMS oavsett godkännandestatus.
- STOPP/opt-out gäller identiskt med alla andra utskickskanaler — ingen
  genväg hittad för Lisa.

**Mått som räknas**: `agent_runs` (samma operativa telemetri som Matte).
`deriveCallOutcome` (`lib/voice/call-outcome.ts`) visar klar/väntande/
misslyckad-fördelning per inspelning — men det är rent presentations-
lager, ingen ny AI-bedömning. Ingen bokningsgrad/konverteringsgrad hittad
som färdig siffra.

**Skriver tillbaka till minnet**: delade `agent_memories` för SMS-loopen
(se matte.md). Ingen minnesskrivning hittad från analyspipelinen direkt —
den skapar bara förslagskort.

## Inspelningsradering ("gallring")

AV som standard, dubbelt spärrat:
- Kräver `CALL_RETENTION_ENABLED=true` (saknas i `.env.local.example`).
- Kräver PER FÖRETAG en fullständig, giltig policy
  (`business_preferences.call_retention_policy` med `enabled`,
  `transcript_days`, `legal_review_ref`, `provider_deletion_ref`) — ofull-
  ständig eller trasig konfiguration startar aldrig radering.
- Körs på schema (cron, `maintenance`-jobbet), inte direkt efter samtalet.
