# Pilot Fix-Plan — Bee Service Launch

> ⚠️ **2026-05-30 status-uppdatering:** Steg 4 (Fortnox dubblett-fix) är kod-färdig och deployad (`af725917`) men **blockerad externt** av Fortnox-licens-fråga. Se [fortnox-license-blocker.md](fortnox-license-blocker.md). Pilot-pitch till Christoffer justeras: "Fortnox-sync kommer när licens-frågan är löst — du fortsätter manuellt tills dess."

**Källor:** [tasks/pilot-readiness-audit-2026-05-20.md](pilot-readiness-audit-2026-05-20.md) (A1) + [tasks/audit-2-automations-agents-2026-05-20.md](audit-2-automations-agents-2026-05-20.md) (A2).

**Mål:** Konkret fix-sekvens innan Bee Service-launch. Tre hinkar enligt Andreas prioritering.

**Tidsbudget:** **12-16 h fokuserat arbete = ~2 arbetsdagar** för MÅSTE + BÖR. Plus 1 h manuell config + dokumentation till Christoffer.

---

## Översikt — kallkalkyl

| Hink | Items | Estimat | Definition of done |
|------|-------|---------|--------------------|
| 🔴 **MÅSTE** | A1-B2, A2-B3, A1-B1, A1-B3 | **8-11 h** | Säkerhet, data, finans säkert för Bee |
| 🟡 **BÖR** | A2-B2, A2-B4, A1-B4 | **4-5 h** | Billiga vinster, höjer värdet |
| 🟢 **VÄNTA** | A1-B5, A2-B1, A2-B5, R1-R12 | **0 h kod, ~1 h dokumentation** | Acceptera + dokumentera |

---

## 🔴 MÅSTE — innan launch

Ordning vald för **risk-reduktion först + snabba wins först + säkerhets-pass i sammanhängande block**.

### Steg 1 — A1-B2: createProjectFromQuote silent failure (1 h)

**Vad:** Kund signerar offert → `createProjectFromQuote()` failar tyst → kund får SMS "projekt startat" men inget projekt finns. Christoffer ser inte problemet, kund får skadad upplevelse.

**Fix:**
- I [app/api/quotes/public/[token]/route.ts:262-270](../app/api/quotes/public/%5Btoken%5D/route.ts) kontrollera `result.success`
- Om `false`: skapa `pending_approval` med `approval_type='manual_project_create'` + log med high-severity
- Behåll non-blocking (returnera success även om projekt-creation failar — annars failas kund-signering)

**Definition of done:**
- [ ] `result.success === false` triggar pending_approval-rad med projekt-detaljer i payload
- [ ] Console-error loggas (för Vercel logs)
- [ ] Manuellt test: simulera fel (t.ex. tom items-array) → verifiera approval skapas + Christoffer ser den i `/dashboard/approvals`
- [ ] `npx tsc --noEmit` + `npx next build` exit 0

**Beroenden:** Inga.

**Varför först:** Trivial change, hög Bee-pilot-impact (Christoffer är pilotkund med riktiga signed offerts).

---

### Steg 2 — A2-B3: `is_active`-filter i alla 4 cron-agenter (1 h)

**Vad:** Cron-route + 4 customer-queries saknar `eq('is_active', true)`. Risk: agenter kör mot döda konton (Hanna värst — "väck döda kunder"-suggestions).

**Fix (5 ställen):**
- [app/api/cron/agent-observations/[agent]/route.ts:54](../app/api/cron/agent-observations) — lägg `.eq('is_active', true)` på business_config-select
- [lib/agents/karin/observation-prompt.ts:179](../lib/agents/karin/observation-prompt.ts) — customer-query
- [lib/agents/daniel/observation-prompt.ts:187](../lib/agents/daniel/observation-prompt.ts) — customer-query
- [lib/agents/lars/observation-prompt.ts:187](../lib/agents/lars/observation-prompt.ts) — customer-query
- [lib/agents/hanna/observation-prompt.ts:147](../lib/agents/hanna/observation-prompt.ts) — customer-query

**Verifiera först:** Finns `is_active`-kolumn på `business_config` och `customer`? Om inte → SQL-migration för att lägga till (default `true`).

**Definition of done:**
- [ ] SQL kontroll: `is_active`-kolumn finns på båda tabellerna eller migration skriven
- [ ] 5 `.eq('is_active', true)` tillagda
- [ ] Manuellt test: skapa en test-customer med `is_active=false` → kör agent → verifiera att den inte inkluderas i observations
- [ ] `npx tsc --noEmit` + `npx next build` exit 0

**Beroenden:** Verifiera `is_active`-kolumn finns (5 min SQL-check).

**Varför andra:** Snabb fix, applicerar även om agenter förblir pausade (förbereder framtida aktivering). Bör göras innan A1-B4 (cost-guardrails) eftersom utan B3 räknas döda-konto-iterationer fortfarande mot cost-cap.

---

### Steg 3 — A1-B1: Cross-business-läckage via body-parametrar (4-6 h) — JUSTERAD 2026-05-20

**Vad:** Auditen listade 7 routes. **INNAN fix:** fullständig sweep efter ALLA routes som tar ägar-IDs (customer_id, project_id, deal_id, quote_id, invoice_id, booking_id, etc.) från request-body utan ownership-check.

**Justering (per Andreas):** Lärdom från TD-71/TD-77 — känslig data läcker via fler vägar än uppenbart (vi fann 4-5 endpoints var, inte 1). Den här auditen flaggade 7 routes, men det är troligen ofullständigt. **Steg 3a: dispatcha Explore-agent som söker efter samma mönster över hela `app/api/`. Rapportera fullständig lista innan fix.**

**Steg 3a — Fullständig sweep (1 h):**
- Explore-agent grep:ar efter: `body.customer_id`, `body.project_id`, `body.deal_id`, `body.quote_id`, `body.invoice_id`, `body.booking_id`, `body.lead_id`, `body.recording_id`, etc.
- För varje träff: verifiera om route har ownership-check eller saknar
- Rapportera komplett lista med fil:rad och status

**Steg 3b — Fix-pass över alla träffar (3-5 h beroende på antal):**

Initial lista från audit (kan utökas av sweep):

| Route | Vilka body-fält |
|-------|-----------------|
| [app/api/documents/[id]/route.ts:95-96](../app/api/documents/%5Bid%5D/route.ts) | `project_id`, `customer_id` |
| [app/api/tasks/route.ts:157, 159](../app/api/tasks/route.ts) | `customer_id`, `project_id` |
| [app/api/field-reports/route.ts:54-55](../app/api/field-reports/route.ts) | `customer_id`, `project_id` |
| [app/api/allowances/route.ts:76](../app/api/allowances/route.ts) | `project_id` |
| [app/api/form-submissions/route.ts:102](../app/api/form-submissions/route.ts) | `customer_id`, `project_id` |
| [app/api/supplier-invoices/route.ts:66](../app/api/supplier-invoices/route.ts) | `project_id` |
| [app/api/projects/route.ts:221, 480](../app/api/projects/route.ts) | `customer_id`, `deal_id` |
| **+ ev. fler från sweep** | |

**Pattern att lägga till före INSERT/UPDATE:**
```ts
if (body.project_id) {
  const { data: owned } = await supabase
    .from('project').select('id')
    .eq('project_id', body.project_id)
    .eq('business_id', business.business_id).single()
  if (!owned) return NextResponse.json({ error: 'Project not found or not owned' }, { status: 403 })
}
// Samma för customer_id, deal_id
```

**Extrahera helper:** Skapa `lib/auth/verify-ownership.ts` med `verifyOwnership(supabase, businessId, table, idField, idValue)` så ingen duplicering över 5+ routes.

**Definition of done:**
- [ ] Helper-funktion skapad och unit-testad (eller åtminstone manuellt verifierad)
- [ ] Alla 5+ routes använder helpern
- [ ] Manuellt test per route: `curl POST` med fabricated `project_id` från annan business → får 403
- [ ] `npx tsc --noEmit` + `npx next build` exit 0
- [ ] Lägg till lessons.md-rad om mönstret (för att hindra framtida regression)

**Beroenden:** Inga.

**Varför tredje:** Större jobb, kräver fokuserat block. Bör göras efter snabba wins (B2, A2-B3) så momentum byggs upp.

---

### Steg 4 — A1-B3: Fortnox dubblett-faktura vid retry (2-3 h)

> ⚠️ **EXTERN BLOCKERARE (2026-05-30):** Fortnox-OAuth kräver licens vi inte har än. Fix-koden är levererad (`af725917`, v58_invoice_fortnox_sync_status.sql) men kan inte testas/aktiveras förrän licens-frågan löst. Se [fortnox-license-blocker.md](fortnox-license-blocker.md). Klassificeras nu som **blockerad-externt** snarare än BLOCKERARE — pilot kan launcha utan Fortnox-sync.

**Vad:** `/api/invoices/[id]/send-via-fortnox` sätter `invoice.status='sent'` även när Fortnox-sync failar, men returnerar `success=false`. Användaren trycker "Skicka igen" → dubblett i Fortnox.

**Fix (valda alternativ b från audit):**
- Introducera `invoice.fortnox_sync_status` enum (`pending`, `synced`, `failed`) eller utöka befintlig `fortnox_sync_error`-kolumn med en status-kolumn
- Sätt `status='sent'` ENDAST när Fortnox-sync lyckats helt
- Om sync failar: behåll `status='draft'` eller `'sending'` så användaren kan trycka igen utan att skapa dubblett

**Edge-case att hantera:**
- Vad om sync lyckades men nätverket dog innan response? → idempotens-key på Fortnox-anropet (kontrollera om invoice redan finns i Fortnox innan create)

**Definition of done:**
- [ ] `invoice.status='sent'` sätts bara vid Fortnox-success
- [ ] Manuellt test mot Fortnox-sandbox: simulera nätverksfel mid-sync → verifiera att retry inte skapar dubblett
- [ ] API returnerar konsekvent `success`-flagga (true om allt lyckats, false om något felade)
- [ ] `npx tsc --noEmit` + `npx next build` exit 0

**Beroenden:** Kräver test mot Fortnox-sandbox (Bee Service's sandbox eller separat dev-sandbox). **Andreas ordnar sandbox-access parallellt.**

**Varför sist i MÅSTE:** Kräver mest test-tid + extern dependency (Fortnox-sandbox-access).

**Justering (per Andreas):** Om sandbox INTE är redo vid Steg 4 → bygg fixen ändå men markera commit + PR-beskrivning som "**otestad mot sandbox — verifiering krävs**" tills Andreas bekräftar mot sandbox. Bygget kan gå vidare men launch-checklist har en kvarstående ✓ tills sandbox-test gjorts.

---

**MÅSTE totalt:** 8-11 h. Bör fördelas över 1.5 arbetsdagar med test-time inkluderat.

---

## 🟡 BÖR — höjer värdet billigt

Ordning vald för **snabbast fix först → cost-impact sist**.

### Steg 5 — A2-B2: `lead_received` seed-rule (30 min) — JUSTERAD 2026-05-20

**Vad:** `fireEvent('lead_received', ...)` avfyras från lead-portal men har ingen rule → dead-letter. Email-forwarding-bygget skapar också leads via samma event-väg → behöver lead_received-rule för att triggas korrekt.

**Justering (per Andreas):** Inte längre villkorad på lead-portal-användning. Buntas med email-forwarding-bygget — när email-forwarding går live skapar det leads som (efter granskning) ska trigga automation. Kräver att lead_received dead-letter är fixad.

**Fix:**
- Lägg seed-rule i [sql/v3_seed_rules.sql](../sql/v3_seed_rules.sql):
  ```sql
  ('Ny lead från leverantörsportal/email', 'event', 'lead_received',
   'send_sms', '{"template": "Tack för din förfrågan! Vi återkommer inom kort."}',
   true, false, false)
  ```
- ALT: `action: notify_owner` om vi vill att Christoffer först ska se den innan SMS skickas (säkrare default för pilot)

**Definition of done:**
- [ ] Seed-rule tillagd i SQL-fil
- [ ] Andreas kör SQL-migration i Supabase
- [ ] Manuellt test: POST mot lead-portal eller simulerat email-forward → SMS/notis skickas
- [ ] Verifierat att rule triggas för båda källor (portal + email-forwarding)

**Beroenden:** Email-forwarding-bygget (parallell tråd). Kan implementeras innan email-forwarding men måste verifieras tillsammans när email-forwarding går live.

---

### Steg 6 — A2-B4: Sonnet → Haiku cost-leak (1 h)

**Vad:** 3 ställen kör Sonnet där Haiku räcker. 10× cost-multiplier.

**Fix (3 ställen):**
- [lib/communication-ai.ts:239](../lib/communication-ai.ts) — SMS-evaluation per SMS-svar
- [lib/ai.ts:50](../lib/ai.ts) — Insights-extraction
- [app/api/voice/analyze/route.ts:216](../app/api/voice/analyze/route.ts) — Post-call analys

**Demand-elegance-fråga:** Borde vi centralisera modell-val? **Föreslag:** Ja — skapa `lib/ai/get-model.ts` med:
```ts
export function getClaudeModel(taskType: 'live-customer' | 'background' | 'extraction'): string {
  return taskType === 'live-customer'
    ? 'claude-sonnet-4-6'
    : 'claude-haiku-4-5-20251001'
}
```
Använd överallt. Hindrar framtida cost-läckor.

**Definition of done:**
- [ ] Helper skapad eller direkt-ändring på 3 ställen
- [ ] Grep för `claude-sonnet-4-6` — verifiera bara live-customer-paths (agent-trigger phone_call/incoming_sms) använder den
- [ ] `npx tsc --noEmit` + `npx next build` exit 0
- [ ] Inga manuella tester behövs (Claude-API är samma interface för båda modellerna)

**Beroenden:** Inga.

---

### Steg 7 — A1-B4: Agent cost-guardrails (2-3 h)

**Vad:** Karin-cron itererar businesses utan max-cost-per-day, ingen kill-switch om något går loose.

**Fix:**
1. **Per-business per-day cost-cap:** Lägg `agent_cost_cap_usd_daily` i `business_config` (default $5). Cron-route summar `agent_runs.cost_usd` för dagen, skippar om cap nådd.
2. **Global kill-switch:** Lägg `agents_globally_paused` i `business_config` (default `false` per-business; eller en global env-var). Cron läser och respekterar.
3. **Max-iterationer per cron-run:** Begränsa till t.ex. 50 businesses per körning, sortera efter senast-aktiv.

**Definition of done:**
- [ ] SQL-migration för 2 nya kolumner
- [ ] Cron-route läser + respekterar cap + pause-flag
- [ ] Manuellt test: sätt `agent_cost_cap_usd_daily=0.01` → kör Karin → verifiera att den skippar
- [ ] Lägg admin-UI eller dokumenterad SQL för att aktivera kill-switch manuellt

**Beroenden:** A2-B3 (is_active-filter) — annars räknas döda-konto-iterationer mot cap.

**Varför sist i BÖR:** Kräver mest design-tänk + SQL-migration. Inte kritisk för Bee-pilot eftersom agenter är pausade — men måste finnas innan agenter slås på.

---

**BÖR totalt:** 4-5 h. Bör fördelas över 0.5-1 arbetsdag.

---

## 🟢 VÄNTA — dokumentera och acceptera

Ingen kod, ~1 h dokumentations-arbete.

### A1-B5: Account deletion saknas (App Store-blocker, inte TestFlight)

**Acceptance-strategi:** Bee Service installerar via TestFlight på Christoffer's enhet. Account deletion krävs för App Store-submission, inte TestFlight-distribution.

**Backlog-item:** "Implementera account deletion + GDPR-cascade-radering inför App Store-submission" — 4-6 h, kan göras parallellt med annan utveckling.

**Dokumentera:** Skriv en kort intern note "TestFlight-only för Bee, App Store-launch kräver account-deletion-feature".

---

### A2-B1: Vapi-assistant statisk → Lisa svarar inte med Bee's knowledge live

**Acceptance-strategi för Bee specifikt:** **Manuell Vapi-setup för Bee** (30 min utanför kodbas):
1. Logga in i Vapi-dashboard
2. Skapa eller hitta Bee Service's assistant
3. Kopiera Bee's knowledge_base från Handymate (manuellt eller via SQL-query)
4. Bygg en statisk system-prompt med Bee's tjänster, FAQ, policies, emergency_situations
5. Spara i Vapi-assistant

**Dokumentera till Christoffer:** "Om du ändrar något i Kunskap-tabben behöver vi manuellt uppdatera Vapi-prompten. Säg till så fixar vi." Detta är acceptabel tech-debt för EN pilot. För 10+ businesses behövs B1-fixet (`/api/vapi/assistant/sync`-route).

**Backlog-item:** "Bygg dynamisk Vapi-prompt-sync (POST till Vapi API när knowledge_base ändras)" — 4-8 h, prioriteras inför 2-3:e pilotkund.

---

### A2-B5: Quote-lifecycle dead-letter på V3-nivå (dual-path)

**Acceptance-strategi:** Threshold-cron + smart-communication hanterar quote-flödet parallellt. Allt funktionellt fungerar — bara intern arkitektur-skuld. Bee märker ingen skillnad.

**Backlog-item:** "Konsolidera smart-communication-rules till V3-seed-rules för enhetlig event-driven arkitektur" — 2-3 h, kan göras när vi ändå rör automation-engine.

---

### Alla R:n från båda audits — pilot-dokumentation

Sammanställ EN kort dokumentation till Christoffer som täcker:

1. **(A1-R4 + R5)** Fortnox: "Max 20 invoices/customers per sync. Markera faktura betald i Handymate även om du markerar i Fortnox."
2. **(A1-R6)** Multi-user: "En person per deal åt gången — vi har inte konfliktdetection än."
3. **(A1-R7)** Webolia-source: "Vi skapar en lead_sources-rad för dig manuellt i Supabase före launch."
4. **(A1-R10)** Widget-chat: "Rate-limit per IP, inte per din business. Om någon spammar din widget från en IP får de rate-limited efter 50 anrop/dag."
5. **(A1-R11)** Admin impersonate: ej användarrelevant.
6. **(A2-R1 + R2)** Matte/Lisa: "Matte är osynlig orchestrator, ingen chat-UI. Lisa kan inte boka/SMS LIVE under samtal — bara EFTER samtal via analys-flödet."
7. **(A2-R4)** Invoice-sent fires inte event: intern teknisk skuld, ej användarrelevant.
8. **(A2-R7)** Invoice-overdue via threshold-cron, inte event: intern, ej användarrelevant.
9. **(Karin/Daniel/Hanna pausade)** Berätta varför + planerad aktivering efter B3-fix.

**Spara som:** `tasks/pilot-onboarding-doc-bee-service.md` — kort PDF-vänlig version att skicka till Christoffer.

---

## Sammanställd ordning + timeline

### Dag 1 (5-6 h fokuserat)
1. **Steg 1: A1-B2 createProjectFromQuote** (1 h) — kvitto: tsc/build + manuellt test
2. **Steg 2: A2-B3 is_active-filter** (1 h) — kvitto: tsc/build + verifiering
3. **Steg 3: A1-B1 cross-business-läckage** (4-6 h) — sittpass över alla 5+ routes med shared helper. Kvitto: tsc/build + curl-test per route.

### Dag 2 (4-5 h fokuserat)
4. **Steg 4: A1-B3 Fortnox dubblett** (2-3 h) — kräver sandbox-test
5. **Steg 5: A2-B2 lead_received seed-rule** (30 min) — efter Christoffer-bekräftelse
6. **Steg 6: A2-B4 Sonnet → Haiku** (1 h) — direkt-ändring + grep-verifiering
7. **Steg 7: A1-B4 cost-guardrails** (2-3 h) — kan slidas till dag 3 om Dag 2 hinner inte

### Dag 3 (1-2 h administration)
- Manuell Vapi-setup för Bee (30 min)
- Skriv `pilot-onboarding-doc-bee-service.md` (30 min)
- Live-tester:
  - Live-ring-test (Christoffer ringer 46elks-numret) — verifiera Vapi svarar med korrekt prompt
  - End-to-end offert-flow (skicka → signera → projekt skapas)
  - Fortnox-sync med test-invoice
  - Push-notis när ATA signeras
- Verifiera SQL-state i Supabase:
  ```sql
  -- Säkerhetscheck
  SELECT business_id, auto_invoice_on_complete, auto_approve_enabled, is_active
  FROM business_config WHERE business_id = 'biz_21wswuhrbhy';

  -- Verifiera v3_automation_settings
  SELECT business_id, call_handling_mode, work_start, work_end
  FROM v3_automation_settings WHERE business_id = 'biz_21wswuhrbhy';

  -- Lead-source för Webolia
  INSERT INTO lead_sources (business_id, name, source_type)
  VALUES ('biz_21wswuhrbhy', 'Webolia Bygg & Snickeri', 'manual')
  ON CONFLICT DO NOTHING;
  ```

---

## Definition of pilot-launch-ready

Pilot är launchbar för Bee Service när:

- [ ] Alla MÅSTE-items klara med definition-of-done uppfyllda
- [ ] BÖR-items klara (eller medvetet bortprioriterade med backlog-item)
- [ ] Vapi-assistant manuellt setupad för Bee
- [ ] Dokumentation skickad till Christoffer (acceptance av begränsningar)
- [ ] Live-tester passerade (ring, offert, Fortnox, push)
- [ ] SQL-state i Supabase verifierad (auto-invoice off, call_handling_mode satt, lead_source för Webolia)
- [ ] Backlog-items dokumenterade för framtida arbete (account deletion, dynamic Vapi sync, V3-konsolidering)

---

## Vad jag medvetet INTE inkluderade

- **Agent-aktivering:** Agenterna (Karin/Daniel/Lars/Hanna) förblir pausade efter pilot-launch. B3 + B4 förbereder dem för aktivering, men beslutet att slå på dem är **separat från pilot-launch**. Rekommendation: aktivera en agent åt gången (Lars först — bäst prompt-kvalitet, använder ny compute-economics-helper) efter att Bee använt plattformen i 1-2 veckor.
- **App Store-submission:** A1-B5 + andra mobil-blockers är framtida arbete, inte pilot-launch-blocker (TestFlight räcker för Bee).
- **Tech-debt cleanup:** RLS-refactor, memory-vector-search, dual-path-konsolidering — allt backlog.

---

*Plan baserad på två audits från 2026-05-20. Estimat är "fokuserat arbete" — verklig kalendertid kan vara längre p.g.a. avbrott, code-review, etc. Justera ordning om beroenden ändras (t.ex. Christoffer säger att lead-portal inte används → A2-B2 hoppas över).*
