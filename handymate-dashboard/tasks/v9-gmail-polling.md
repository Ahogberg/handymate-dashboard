# V9: Gmail Polling — Löpande mailkontakt

## Status: Kod klar ✅ | SQL-migration krävs ⏳

## Arkitektur

Polling-baserad approach — ingen Google Cloud Pub/Sub. Gmail API pollas via cron-jobb.
Första körningen hämtar senaste 10 mail (newer_than:1d). Efterföljande körningar
använder Gmail History API (incremental — bara nya meddelanden sedan senaste poll).

## Vad som byggdes

### 1. SQL-migration
**Fil:** `sql/v9_gmail_polling.sql`
- `email_conversations` tabell med index
- Nya kolumner på `calendar_connection`: gmail_last_polled_at, gmail_last_history_id

### 2. Polling-motor
**Fil:** `lib/gmail/poller.ts`
- `pollGmailForBusiness(connection)` — pollar Gmail för ett företag:
  - Refreshar OAuth-token vid behov
  - Inkrementell hämtning via History API (messageAdded)
  - Fallback till full fetch vid expired historyId
  - Processar varje mail via processInboundEmail()
  - Uppdaterar gmail_last_polled_at + gmail_last_history_id
- `pollAllBusinesses()` — sekventiell polling av alla anslutna företag
  - Hämtar alla calendar_connection med gmail_scope_granted=true
  - Kör sekventiellt för att hålla sig inom Gmail API-kvoter

### 3. Mailbearbetning
**Fil:** `lib/gmail/processor.ts`
- `processInboundEmail()`:
  1. Filtrerar bort outbound (mail från hantverkaren)
  2. Dedup via gmail_message_id (UNIQUE constraint)
  3. Matchar avsändare: email → customer, namn → customer, email → lead
  4. Sparar i email_conversations
  5. Triggar `fireEvent('email_received')` med customer/lead-info
- `processMailBatch()` — batch-variant

### 4. Cron-route
**Fil:** `app/api/cron/gmail-poll/route.ts`
- GET /api/cron/gmail-poll — auth via CRON_SECRET
- Anropar pollAllBusinesses()
- maxDuration: 60s

### 5. Agent-routing
**Fil:** `lib/agent/orchestrator.ts`
- `email_received: 'lead'` — lead-agenten hanterar inkommande mail
- `gmail_lead_imported: 'lead'` — explicit routing

### 6. E-post-vy i Samtal
**Fil:** `app/dashboard/email/page.tsx` (NY)
- Listar email_conversations med status-filter (Alla/Nya/Lästa/Besvarade)
- Expanderbar — klick visar fullständigt mailinnehåll
- Matchningsbadges, AI-hanterad badge, länk till kundprofil

**Fil:** `app/dashboard/calls/page.tsx` (ÄNDRAD)
- Ny flik "E-post" i Samtal-vyn

### 7. Vercel cron
**Fil:** `vercel.json` (ÄNDRAD)
- `*/1 * * * *` — var minut (kräver betald plan)
- OBS: Hobby-planen tillåter max en körning per dag.
  Om hobby-plan används, byt till `0 8 * * *` eller använd extern cron-tjänst
  (t.ex. cron-job.org) som anropar endpointen med CRON_SECRET.

## Verifiering
- `npx tsc --noEmit` — 0 fel ✅
- `npx next build` — ren build ✅

## Innan deploy

1. Kör `sql/v9_gmail_polling.sql` i Supabase SQL Editor
2. Om hobby-plan: ändra cron-schema i vercel.json ELLER
   konfigurera extern cron-tjänst
3. Testa manuellt:
   ```bash
   curl -X GET https://app.handymate.se/api/cron/gmail-poll \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
4. Skicka testmail → verifiera i email_conversations + Samtal → E-post

## Filer — sammanfattning

| Fil | Åtgärd |
|-----|--------|
| `sql/v9_gmail_polling.sql` | NY — tabell + kolumner |
| `lib/gmail/poller.ts` | NY — polling-motor |
| `lib/gmail/processor.ts` | NY — processInboundEmail |
| `app/api/cron/gmail-poll/route.ts` | NY — cron-route |
| `app/dashboard/email/page.tsx` | NY — E-post inbox UI |
| `app/dashboard/calls/page.tsx` | ÄNDRAD — ny E-post-flik |
| `lib/agent/orchestrator.ts` | ÄNDRAD — email_received routing |
| `vercel.json` | ÄNDRAD — gmail-poll cron |

**Borttaget (ersatt):**
- `sql/v9_gmail_pubsub.sql`
- `lib/gmail/pubsub.ts`
- `app/api/gmail/webhook/route.ts`
- Pub/Sub-ändringar i OAuth callback och gmail-lead-import cron
- `GMAIL_PUBSUB_TOPIC` env-variabel
