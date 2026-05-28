# Audit 2 — Automationer & AI-agenter — 2026-05-20

**Beslut som efterfrågas:** Fungerar AI:n? Är agenterna redo att aktiveras för Bee Service-pilot, eller bör de förbli pausade tills bevisat värde?

**Audit-metod:** 4 parallella skeptiska Explore-agenter granskade event-driven automations, Matte-orchestrator, Lisa/Vapi-integration, och cron-agenterna (Karin/Daniel/Lars/Hanna). Jag har **filtrerat och bedömt** — vissa agent-flaggor är överreaktioner, andra är genuint kritiska. Klassificering nedan är min konsoliderade bedömning.

**TL;DR:** **NO-GO för agent-aktivering i nuvarande tillstånd.** Lisa fungerar för voicemail/transfer men inte som "smart AI som svarar" — Vapi-assistanten är **statisk**, inte uppdaterad med Bee's faktiska knowledge under samtal. Plus 4 andra blockerare som måste fixas (~1-2 dagars arbete). **Värdepropositionen "AI-driven back-office" är delvis fortfarande pappers-produkt.**

---

## TL;DR — Topp-5 blockerare för AI-värde

| # | Blockerare | Var | Tid |
|---|------------|-----|-----|
| 1 | **Vapi-assistant är STATISK** — Lisa svarar inte med Bee's knowledge_base live under samtal, bara post-call | Vapi-dashboard + webhook-arkitektur | 4-8 h (manuell Vapi-setup + ev. dynamic-prompt-mekanism) |
| 2 | **`lead_received` dead-letter** — externa leads från lead-portal triggar INGEN automation | `sql/v3_seed_rules.sql` saknar rule | 30 min |
| 3 | **`is_active`-filter saknas i alla 4 cron-agenter + cron-loop** — kör mot döda konton | `/api/cron/agent-observations/[agent]/route.ts:54` + 4 customer-queries | 1 h |
| 4 | **Sonnet-cost-läckor** — 3+ ställen använder Sonnet där Haiku räcker (10× cost-multiplier) | `lib/communication-ai.ts:239`, `lib/ai.ts:50`, `voice/analyze:216` | 1 h |
| 5 | **Quote-lifecycle dead-letter på V3** — `quote_sent/opened/signed/accepted` har ingen seed-rule. Smart-communication-rules hanterar parallellt men dual-path inkonsekvent | `sql/v3_seed_rules.sql` | 2-3 h |

Plus 8 risker (R1-R8) som hanteras med dokumentation/begränsning.

---

## 🔴 BLOCKERARE — måste fixas före agent-aktivering

### B1. Vapi-assistant är STATISK — Lisa svarar inte med dynamisk knowledge

**Vad:** [supabase/functions/vapi-webhook/index.ts](../supabase/functions/vapi-webhook/index.ts) triggas EFTER samtal är avslutat (`call.completed`-event). Under själva samtalet kör Vapi en assistant som skapades **manuellt en gång i Vapi-dashboard** — Handymate har **ingen mekanism för att uppdatera Vapi-prompten dynamiskt per samtal**.

**Konsekvenser:**
- Mitt f8689020-fix (knowledge_base → Lisa) har **bara effekt POST-call** för agent-analys
- Live-samtal: Lisa svarar enligt vad som ligger i Vapi-dashboard, **inte enligt Bee's faktiska knowledge**
- Christoffer fyller FAQ + tjänster + policy i Handymate → Lisa kan inte använda dem live
- Om Vapi-assistant inte explicit setupats för Bee → defaultsvar för "kunder" finns inte alls

**Bevis:**
- Ingen `vapi_assistant_id`, `vapi_phone_number_id` eller `vapi_credentials`-kolumn på `business_config`
- Inget code-path som POST:ar uppdaterad prompt till Vapi API
- Webhook är `end-of-call-report`-only

**Pilot-impact:** **Hela "AI svarar i telefonen"-värdepropositionen är inte sant live.** Lisa fungerar som voicemail + transfer, vilket är 46elks-funktionalitet — inte AI.

**Fix-alternativ:**
- (a) **Pilot-acceptabelt:** Setupa Vapi-assistant manuellt för Bee med rätt prompt + dokumentera att den måste uppdateras manuellt vid knowledge-change. **NO-GO för "vi marknadsför AI"**.
- (b) **Rätt fix:** Bygg en `/api/vapi/assistant/sync`-route som POST:ar uppdaterad prompt till Vapi när knowledge_base ändras. Trigger via webhook eller cron. ~4-8 h.

**Estimat:** 4-8 h för fix (b). 30 min för (a) workaround.

---

### B2. `lead_received` dead-letter

**Vad:** [app/api/lead-portal/[code]/route.ts:188](../app/api/lead-portal/%5Bcode%5D/route.ts) avfyrar `fireEvent('lead_received', ...)`. Inget rule i `sql/v3_seed_rules.sql` matchar det → ingen action.

**Konsekvens:** Om Bee Service skickar leads via lead-portal (extern leverantörs-källa) → **ingen SMS-bekräftelse till kund, ingen klassificering, ingen notis till Christoffer**.

**Tidigare audit (portal-audit-2026-05-12) nämnde detta som dead-letter** — bekräftat att det INTE är fixat.

**Påverkar Bee?** **Beroende** på om Bee använder lead-portal eller bara manuell deal-creation för Webolia. Tidigare audit indikerade att Webolia är fritext-source. Verifiera med Christoffer.

**Fix:** Lägg seed-rule i `sql/v3_seed_rules.sql`:
```sql
('Ny lead från leverantörsportal', 'event', 'lead_received',
 'send_sms', '{"template": "..."}', true, false)
```

**Estimat:** 30 min.

---

### B3. `is_active`-filter saknas i alla 4 cron-agenter

**Vad:** Cron-route [/api/cron/agent-observations/[agent]/route.ts:54](../app/api/cron/agent-observations) gör `SELECT business_id, business_name FROM business_config` **utan `WHERE is_active = true`**.

**Plus:** Karin/Daniel/Lars/Hanna läser `customer`-rader utan `is_active`-filter (rad 175-187 i respektive observation-prompt.ts).

**Konsekvens:**
- Agenter kör mot pausade/test-businesses → kostnad + brus
- Observations skapas från döda kunder
- Hanna's reaktiverings-kandidater inkluderar **döda kunder** → "väck döda kunder"-suggestions
- Karin's BRF-stats kan bli skev av historiska döda kontodata

**Tidigare audit (pilot-readiness-audit-2026-05-20) flaggade detta för Karin** — nu bekräftat att **alla 4 har samma bug**.

**Fix:** Lägg `.eq('is_active', true)` på 5 ställen (1 i cron-route, 4 i customer-queries).

**Estimat:** 1 h.

---

### B4. Sonnet-cost-läckor — 10× cost-multiplier

**Vad:** [app/api/agent/trigger/route.ts](../app/api/agent/trigger/route.ts) routar Haiku för background-tasks (korrekt), men **3+ andra ställen kör Sonnet manuellt** där Haiku räcker:

| Fil | Användning | Påverkan |
|-----|-----------|----------|
| [lib/communication-ai.ts:239](../lib/communication-ai.ts) | SMS-evaluation per SMS-svar | 100 SMS/dag × 10× cost = **stort** |
| [lib/ai.ts:50](../lib/ai.ts) | Insights-extraction | Background-task, Haiku räcker |
| [app/api/voice/analyze/route.ts:216](../app/api/voice/analyze/route.ts) | Post-call analys (transkript → förslag) | Per samtal × 10× cost |

**Konsekvens för pilot:** Inte synligt på Bee-skala men aggregerar fort vid skala. Och: indikerar att model-routing inte är konsekvent över kodbasen.

**Fix:** Byta `claude-sonnet-4-6` → `claude-haiku-4-5-20251001` på 3 ställen. Eller centralisera modell-val i en `getModel(taskType)`-helper.

**Estimat:** 1 h.

---

### B5. Quote-lifecycle dead-letter på V3-nivå (dual-path)

**Vad:** Events `quote_sent`, `quote_opened`, `quote_signed`, `quote_accepted` avfyras men har **inga matching seed-rules**. Smart-communication-systemet (parallell legacy-path) hanterar dem.

**Konsekvens:**
- Två separata system att underhålla (V3-engine + smart-communication)
- Offert-uppföljningar fungerar via THRESHOLD-cron (dag 5, dag 10) men inte event-driven → fördröjning upp till 24 h
- Pipeline-flytt (deal → vunnen) sker via hårdkodat code, inte via rules-engine

**Påverkar Bee?** Allt fungerar fortfarande via threshold-cron + smart-communication, men det är inte "automationer" i marknadsförings-mening — det är hårdkodade workflows.

**Fix:** Lägg seed-rules för `quote_sent`, `quote_opened`, `quote_signed` i `v3_seed_rules.sql` så event-flödet matchar threshold-flödet. Migrera smart-communication-logic till seed-rules. **Större jobb** — 2-3 h.

**Estimat:** 2-3 h.

---

## 🟡 RISKER — kan hanteras

### R1. Matte's UI saknas
Matte är backend-orchestrator (per design). Ingen frontend-chat på dashboard. Mobile har en Matte-skärm. **Inte blockerare för pilot** om designintent är "Matte är osynlig orchestrator".

### R2. Lisa kan inte ringa tools UNDER samtal
Boka tid, skicka SMS, eskalera är POST-call (efter `call.completed`). Detta är arkitekturbegränsning (Vapi closed-loop). **Mitigering:** Setta förväntan med Christoffer — Lisa eskalerar via 46elks-transfer, inte via tool-call.

### R3. Matte-trigger-array missmatch
`triggers: ['manual', 'phone_call', 'incoming_sms', 'morning_report']` i Matte's personality, men `routeToAgent('incoming_sms')` → Lisa. Dokumentation/funktionalitet-divergens. **Inte funktionell bug**, bara förvirrande.

### R4. invoice_sent fires inte i `/api/invoices/send`
Bara `triggerEventCommunication`-anrop. Dual-path inkonsekvent. Eskaleringar fungerar via threshold-cron.

### R5. Sväljda errors i agent-flödet
`catch { /* non-blocking */ }` på rad 250, 306 i `/api/agent/trigger/route.ts`. Om Supabase är nere → agent körs med tom context utan loggning. **Inte pilot-blocker** men gör debugging svår.

### R6. Memory-system är importance-based, inte vector-search
Räcker för pilot, men relevanta minnen kan missas för nische-frågor. Tech-debt för senare.

### R7. check-overdue cron updaterar bara status, fires inte event
`invoice_overdue` skulle kunna fireas men görs inte. Konsekvens: invoice-eskaleringar fungerar via threshold-cron (rule #6, #7) som pollar `days_overdue >= 1`. Inkonsekvent men fungerande.

### R8. Hanna's 180d-fönster + döda konto-bugg
180d är längre tidsfönster än andra agenter. Bug B3 är värre här — många historiska kunder blir reaktiverings-kandidater inkl. döda.

---

## 🟢 OK — verifierat fungerar

| Område | Status |
|--------|--------|
| Matte's 6 tools (`send_sms`, `send_email`, `create_booking`, `search_customers`, `check_calendar`, `create_approval_request`) | Alla implementerade i `lib/tool-router.ts`. Inga stubbar/mocks. 46elks/Gmail/Calendar-integrationer fungerar. |
| Prompt-caching (`cache_control: ephemeral`) | Implementerat i `agent/trigger/route.ts:343-351`. ~90% rabatt på cache-hits. |
| Context-trimning | Behåller initial + senaste 4 tool-svar (rad 357-364). |
| Agent-prompts | Specifika, hypotes-drivna. Personligheter (Matte/Karin/Daniel/Lars/Hanna/Lisa) är personliga, inte generic. |
| SMS-svar från Lisa | Vettiga svenska meddelanden (verifierat via prompt-läsning). Slutar med svarsnummer + företagsnamn per regel. |
| Karin/Daniel/Lars/Hanna prompt-kvalitet | Hypotes-driven, konkreta fokusområden. Inte "tänk noga"-generic. |
| Lars använder ny compute-economics-helper | Bekräftat — inte gammal stale snapshot-data. |
| 3-nivåer-fallback (< 5 / 5-9 / 10+) | Alla 4 cron-agenter implementerar samma pattern. Early-stage dedup-skydd. |
| Cost per cron-körning | ~$0.02 per agent × business. Bee-pilot: ~$0.16/vecka för alla 4 agenter (negligible). |
| Approval-flöde för observations | Observations med suggestion → pending_approval skapas → push till Christoffer. Inte autonomt. |
| Vapi-webhook deployad | `supabase/functions/vapi-webhook/index.ts` fungerar för POST-call-analys. Loggning OK. |
| Threshold-cron (faktura-påminnelse dag 1, eskalering dag 7) | Verifierat fungerande. `handleSendSms` + `handleCreateApproval` är inte stubbar. |
| Notify_owner-action | Push till Christoffer fungerar. |
| Matte handoff `[DELEGATED:agent_id]` | Implementerat i route.ts. Test finns i `/api/agent/test-handoff/`. |
| SMS-action handlers | 46elks API-anrop direkt, inte stubbar. Nattspärr inbyggd. |
| Email-action handlers | Gmail + Resend-fallback fungerar. |

---

## Värdeproposition vs verklighet — ärlig läsning

Pilot säljs som **"5995 kr/mån för AI-driven back-office"**. Vad får Bee Service faktiskt idag?

| Vad de förväntar | Vad de får | Status |
|------------------|------------|--------|
| Lisa svarar i telefon som hennes egen anställd | Vapi-statisk default + transfer till Christoffer | 🔴 **Inte sant utan B1-fix** |
| AI klassificerar inkommande SMS | Lisa svarar med Claude (smart, men direkt — ingen mänsklig review) | 🟡 Fungerar men risk för olämpligt svar |
| Karin analyserar ekonomin söndagar | Karin pausad. Vid aktivering: bra prompts men buggad iteration (B3) | 🟡 Pilot-ready efter B3 |
| Daniel följer upp leads/offerter | Threshold-cron skickar dag 5-SMS + dag 10-approval. Bra prompts vid aktivering. | 🟡 Threshold fungerar; event-driven dead-letter |
| Lars håller koll på projekt-marginal | Vid aktivering: bäst prompt-kvalitet, använder ny compute-economics-helper. | 🟢 Pilot-ready efter B3 |
| Hanna kör marketing/reaktivering | Vid aktivering: 180d-fönster + döda-konto-bugg = "väck döda kunder"-risk | 🔴 INTE pilot-ready förrän B3 |
| Matte koordinerar allt | Backend-orchestrator, ingen frontend-chat. Tool-handoff fungerar. | 🟡 Designintent oklart för Christoffer |
| Automationer triggas vid events | 16 av 17 events är dead-letter eller dual-path | 🔴 "Event-driven"-marknadsföring är inte sant |
| Offert-uppföljning | THRESHOLD-cron (dag 5, dag 10) fungerar via polling | 🟡 Funkar men inte event-driven |
| Faktura-påminnelse | Dag 1 + Dag 7 via threshold-cron | 🟢 Fungerar |

---

## Pilot-aktivering: vad är säkert nu

**Säkert att aktivera idag (utan agenter):**
- Inkommande SMS-routing till Lisa-svar (Claude direkt)
- Threshold-cron för offert/faktura-uppföljning
- Voice-routing via 46elks (vidarekoppling med call_handling_mode)
- Approval-baserade flows (alla automations som triggar `create_approval`)

**INTE säkert utan fix:**
- Lisa som AI-telefonsvarare (B1 — statisk Vapi)
- Karin/Daniel/Hanna cron-aktivering (B3 — döda-konto-bugg)
- "Vi har event-driven automation" som marknadsbudskap (B2 + B5)

**Bör pausa förbli pausade:**
- Hanna tills B3 fixat (`väck döda kunder`-risk)
- Andra cron-agenter tills B3 fixat (mindre allvarligt men samma princip)
- Vapi-aktivering tills B1 löst eller manuell setup gjord för Bee

---

## Ärlig go/no-go för "fungerar AI:n?"

**NO-GO för "AI svarar i telefonen"-värdet utan B1.**

**NO-GO för agent-aktivering utan B3.**

**Path till GO för agenter (Karin/Daniel/Lars/Hanna):** ~1.5 h (B3 + B4) → kan slås på med konfidens.

**Path till GO för Lisa-som-AI:** ~4-8 h (B1 fix) eller 30 min manuell Vapi-setup för Bee specifikt med dokumenterad begränsning ("uppdatera Vapi-prompt manuellt vid knowledge-change").

**Path till GO för "event-driven automation":** ~3-4 h (B2 + B5) — eller acceptera dual-path-arkitektur som "intern teknisk skuld, inte synligt för Bee".

**Sammantaget rekommendation:** Fixa B1, B3, B4 (5-10 h) innan pilot-launch. B2/B5 kan vänta eller hanteras via dokumentation. R1-R8 är acceptabla pilot-risker.

---

## Bonus-fynd värda att flagga separat

1. **`call_transferred` event firas men har ingen rule** — borde åtminstone loggas eller utlösa SMS till kunden ("Vi försökte koppla dig, ringer tillbaka").
2. **`contacted` event firas från `sms/send`** — finns inte i någon rule. Borde kunna driva pipeline-state-changes.
3. **`payment_received` dead-letter** — när faktura betalas (via Fortnox-sync), inget event-flöde. Borde kunna trigga "tack-SMS" eller review-request.

Dessa är inte blockerare men är låg-hängande frukt för "mer AI för pengarna".

---

*Audit utförd 2026-05-20 via 4 parallella Explore-agenter + kritisk filtrering. Klassificeringen är min konsoliderade bedömning, inte rå agent-output. Ingen kod-ändring.*
