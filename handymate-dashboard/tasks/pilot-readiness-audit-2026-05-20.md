# Pilot-Readiness Audit — Bee Service Launch — 2026-05-20

**Beslut som efterfrågas:** GO / NO-GO för pilot-launch med Bee Service AB (`biz_21wswuhrbhy`) — Christoffer + Mathias + Darius som första betalande pilot.

**Audit-metod:** 4 parallella skeptiska Explore-agenter kartlade kärnflöden, stubbar, säkerhet, mobil/TestFlight, agenter, integrationer, och Bee Service-specifika risker. Jag har **filtrerat och bedömt rimligheten** — vissa agent-flaggor är överreaktioner, andra är genuint kritiska. Klassificeringen nedan är min konsoliderade bedömning, inte rå agent-output.

**Sammanfattning först:** **NO-GO i nuvarande tillstånd. 3 hårda blockerare måste fixas innan Bee Service-launch. Realistiskt: 2-4 arbetsdagar fokuserat arbete.**

---

## TL;DR — Topp-5 blockerare

| # | Blockerare | Kategori | Tid |
|---|------------|----------|-----|
| 1 | **Cross-business-läckage via body-parametrar** (5+ routes) | Säkerhet | 4-6 h |
| 2 | **`createProjectFromQuote` silent failure** — kund får SMS, inget projekt skapas | Data-integritet | 1 h |
| 3 | **Fortnox dubblett-faktura vid retry** — finansiell risk | Integration | 2-3 h |
| 4 | **Agent cost-guardrails saknas** — runaway-risk vid aktivering | Drift | 2-3 h |
| 5 | **Account deletion saknas** — App Store-blocker (men inte TestFlight) | Mobil | 4-6 h |

Blockerare #5 gäller bara om vi vill till App Store. För TestFlight-pilot med Christoffer på hans enhet är #5 inte hård blocker. **Bee Service-pilot specifikt kräver #1-#4 fixade.**

---

## 🔴 BLOCKERARE — måste fixas före pilot

### B1. Cross-business-läckage via body-parametrar (säkerhet)

**Vad:** Flera API-routes accepterar `customer_id`, `project_id`, `deal_id` från request-body utan att verifiera att de tillhör authenticated business. En pilot-kund kan koppla sin task/dokument till en annan business's project genom att skicka ID från B i body.

**Bevis (5+ routes):**
- [app/api/documents/[id]/route.ts:95-96](../app/api/documents/%5Bid%5D/route.ts) — `body.project_id`, `body.customer_id`
- [app/api/tasks/route.ts:157, 159](../app/api/tasks/route.ts)
- [app/api/field-reports/route.ts:54-55](../app/api/field-reports/route.ts)
- [app/api/allowances/route.ts:76](../app/api/allowances/route.ts)
- [app/api/form-submissions/route.ts:102](../app/api/form-submissions/route.ts)
- [app/api/supplier-invoices/route.ts:66](../app/api/supplier-invoices/route.ts)
- [app/api/projects/route.ts:221, 480](../app/api/projects/route.ts)

**Exploitable:** Ja, via `curl POST` med fabricated IDs.

**Fix:** Lägg `eq('business_id', authedBusinessId)` på en SELECT som verifierar ownership innan `.insert()/.update()`. Mönster:
```ts
const { data: owned } = await supabase
  .from('project').select('id')
  .eq('project_id', body.project_id)
  .eq('business_id', business.business_id).single()
if (!owned) return 403
```

**Estimat:** 4-6 h. Drar i samma fix-pass för alla 5+ routes.

---

### B2. `createProjectFromQuote` silent failure

**Vad:** [app/api/quotes/public/[token]/route.ts:262-270](../app/api/quotes/public/%5Btoken%5D/route.ts) anropar `createProjectFromQuote()` non-blocking. Om den failar:
- Felet swäljs i `catch { console.error(...) }`
- API returnerar `success: true`
- SMS skickas till kund att "ditt projekt är startat"
- Men projektet finns inte i `/dashboard/projects`

**Konsekvens för Bee:** Kund får bekräftelse, Christoffer ser inget projekt → manuell debug krävs, dålig pilot-upplevelse.

**Fix:** Kontrollera `result.success` från `createProjectFromQuote()`. Om false → logga med high-severity + skapa en `pending_approval` med approval_type `manual_project_create` så Christoffer ser problemet i UI istället för att det försvinner.

**Estimat:** 1 h.

---

### B3. Fortnox dubblett-faktura vid retry

**Vad:** [app/api/invoices/[id]/send-via-fortnox/route.ts](../app/api/invoices/%5Bid%5D/send-via-fortnox/route.ts) sätter `invoice.status='sent'` även när Fortnox-sync failar (rad 170-195), men returnerar `success=false`. Frontend tolkar det som "operation misslyckades", Christoffer trycker "Skicka igen" → sync körs på nytt → **dubblett-faktura i Fortnox**.

**Konsekvens:** Bee Services bokföring blir trasig. Customer support måste städa manuellt.

**Fix:** Två alternativ:
- (a) Idempotens-key på Fortnox-anropet (försök fetcha befintlig invoice från Fortnox innan create)
- (b) Inte sätta `status='sent'` förrän Fortnox-anropet lyckats helt — markera istället `fortnox_sync_pending=true`

Rekommendation: (b) är ren och låter användaren förstå state.

**Estimat:** 2-3 h.

---

### B4. Agent cost-guardrails saknas

**Vad:** Karin-cron körs söndag + onsdag 06:00 UTC (per `vercel.json`). Den itererar över `business_config` för alla aktiva businesses. Inga rate-limits, ingen max-cost-per-business-per-day, ingen budget-check. Om antalet businesses växer eller om en bugg orsakar Karin att loopa → kostnaderna kan skena.

**Risk för pilot:** Vid skala på 1 pilot är detta inte ekonomisk skena, men det är **ingen kill-switch om något går fel**. Om Karin-koden börjar generera oändliga observations pga prompt-bug → vi har inget skydd förrän vi manuellt edit:ar config.

**Fix:** Lägg minst ett av:
- Per-business per-day max-cost (kolla `agent_runs.cost_usd` summa)
- Global kill-switch i `business_config.agent_paused` som cron läser
- Max-iterationer per cron-run

**Estimat:** 2-3 h.

---

### B5. Account deletion saknas (App Store-blocker, inte TestFlight)

**Vad:** Sökning efter `deleteAccount`, `delete_account`, `account/delete` → 0 träffar. App Store-policy kräver att användare kan radera konto från appen för GDPR-compliance.

**Påverkan på Bee Service-pilot:** Om Christoffer installerar via TestFlight → inte hård blocker. Om vi vill till App Store-launch → måste fixas innan submission.

**Fix:** Backend-route `POST /api/auth/delete-account` + mobile-UI-knapp i settings + cascade-radering av business_users/business_config-rader.

**Estimat:** 4-6 h.

---

## 🟡 RISKER — kan hanteras med dokumentation/begränsning

### R1. Voice-pipeline AI är extern (Vapi), inte synlig i denna repo
[app/api/voice/incoming/route.ts](../app/api/voice/incoming/route.ts) routar bara via 46elks (connect/play/ivr). Live-AI-svar sker via Vapi-webhook ([supabase/functions/vapi-webhook](../supabase/functions/vapi-webhook/)) som finns men inte är granskad i denna audit. **Riskfaktor:** Om Vapi-config inte är aktiv för Bee Service så svarar ingen Lisa alls — bara vidarekoppling. Verifiera Vapi-status separat före pilot-Live-Ring.

### R2. ÄTA-email är stub
[app/api/ata/[id]/send/route.ts:180](../app/api/ata/%5Bid%5D/send/route.ts) — `TODO: Implement email sending when email service is ready`. SMS fungerar, email är fake-success. **Fix:** Antingen implementera (om Resend redan finns) eller dölj email-option i UI för Bee.

### R3. Permissiv RLS — `USING (true)` på 30+ tabeller
SQL-policies använder `USING (true)` så all säkerhet vilar på app-lagret. Om en route saknar `eq('business_id', ...)` → cross-business-läckage. Detta är samma underliggande risk som B1, men på tabell-nivå istället för per-route. **Mitigering för pilot:** B1-fixet täcker största hålet. Tekniskt skuld att refactora RLS senare.

### R4. Fortnox sync — ingen retry-logik, ingen rate-limit-handling
`lib/fortnox.ts` saknar exponential backoff och 429 Retry-After-tolkning. **OK för pilot om Bee begränsas till <20 invoices/customers per manuell sync.** Dokumentera detta för Christoffer.

### R5. Fortnox webhook in (betald-status) saknas
När faktura betalas i Fortnox vet Handymate inte. Bee måste manuellt markera betald i båda systemen. **Mitigering:** Dokumentera i pilot-onboarding.

### R6. Multi-user race condition (3 användare på Bee)
Ingen optimistic locking. Två användare som redigerar samma deal samtidigt → last-write-wins. **Mitigering:** Be Bee att inte arbeta parallellt på samma offert/projekt.

### R7. Webolia inte strukturerad som lead-källa
Bee fyller "Webolia" som fritext-source. Risk: inkonsistent rapportering. **Fix:** Lägg en rad i `lead_sources` manuellt i Supabase för Bee (5 min).

### R8. Karin-cron iterar utan `is_active`-filter
Om döda business-rader finns kommer Karin köra Claude-anrop mot dem. Grep visar `biz_6wunctak49` inte längre i kod men kan finnas i DB. **Verifiera:** SQL-fråga som listar businesses utan användare → arkivera dem.

### R9. UI-stubbar ("Kommer snart")
Hittat på 6+ ställen i settings/profile. Inte säkerhet, bara UX-besvikelse. **Fix för pilot:** Dölj eller markera tydligt "Under utveckling".

### R10. Widget-chat rate-limit per IP, inte per business
En illvillig kan DOS:a Bee Services widget från en IP. **Mitigering:** Mer relevant för bredare launch än pilot.

### R11. Admin impersonate saknar audit-logging
Internt missbruk omöjligt att spåra. **Fix-prio:** Före bredare launch, inte pilot.

### R12. Push-trigger för SMS/email-events saknas
Push fungerar för ATA-signering, cron-observations. Saknas för: inkommande SMS, Lisa-svar. **Påverkar inte pilot direkt** men reducerar push-värdet.

---

## 🟢 OK — verifierat fungerar

| Område | Status |
|--------|--------|
| 46elks SMS-skickning (`lib/sms-send.ts`) | Produktionsklar, signature-validering, normalisering, audit-log |
| 46elks inkommande SMS-routing (`/api/sms/incoming`) | Auto-lead + Matte/Lisa-handoff |
| 46elks voice-routing (`/api/voice/incoming`) | Tre call_handling_modes fungerar, work-hours-logik OK |
| Stripe webhook | Korrekt signatur-validering på raw body, 5 events hanteras |
| Fortnox OAuth + token-refresh | Robust auto-disconnect vid invalid_grant |
| CSV-import för leads/customers | Auto-delimiter, column-mapping, dup-detection, validering |
| Multi-user permissions | Roll-hierarchy enforced, permission-flags på rätt operationer |
| Bee Service-specifika hårdkodningar | Inga — clean separation prod/test |
| Demo-konto för App Store | Finns ([login.tsx:17-18](../../../handymate-mobile/app/(auth)/login.tsx)), kräver bara prod-skapande |
| Privacy/Terms | Inbyggt i mobile + externa URLs |
| iOS bundleId/teamId/EAS-config | Allt på plats utom app-ikon + screenshots |
| Push-arkitektur (Expo + VAPID) | Wired för ATA + cron-observations |
| Lisa-knowledge-koppling (commit f8689020) | Schema-mismatch fixad, default-template-skydd inbyggt |
| Knowledge_base i widget-chat (commit 2f293aa3) | Fungerar |
| Status-byte → autonoma actions | Approval-baserat i default, bara `auto_invoice_on_complete=true` är farlig (default false) |

---

## Bee Service-specifik launchplan (om GO efter blockerare fixade)

### Verifiera i Supabase före Live
```sql
-- Säkerhetscheck: Bee's automation-config
SELECT business_id, auto_invoice_on_complete, auto_invoice_send,
       auto_invoice_enabled, auto_approve_enabled
FROM business_config WHERE business_id = 'biz_21wswuhrbhy';
-- Förvänta: alla false eller NULL

-- Verifiera v3_automation_settings finns
SELECT business_id, call_handling_mode, work_start, work_end
FROM v3_automation_settings WHERE business_id = 'biz_21wswuhrbhy';
-- Förvänta: call_handling_mode satt (default 'agent_with_transfer')

-- Verifiera Webolia som lead_source
SELECT * FROM lead_sources WHERE business_id = 'biz_21wswuhrbhy';
-- Om saknas: INSERT manuellt

-- Verifiera Fortnox-koppling
SELECT fortnox_connected_at, fortnox_company_name, fortnox_auto_sync_invoices
FROM business_config WHERE business_id = 'biz_21wswuhrbhy';
```

### Dokumentation att ge Christoffer
- **Manuell double-entry för Fortnox-betalningar:** Om faktura betalas i Fortnox, markera även i Handymate.
- **En person per deal åt gången:** Multi-user race condition fram tills locking implementerat.
- **Max 20 invoices/customers per sync:** Undvik Fortnox rate-limit.
- **Webolia-source:** Använd den pre-skapade `lead_sources`-raden (jag skapar den inför launch).

### Live-tester före GO
1. **Live-ring-test:** Christoffer ringer sitt 46elks-nummer. Verifiera att Lisa (Vapi) svarar med knowledge_base + boundaries (vi fixade detta i f8689020).
2. **Offert-flow end-to-end:** Skapa offert → skicka till test-kund (Andreas) → signera → verifiera att projekt skapas (B2-fixet måste vara live).
3. **Fortnox-sync test:** Skicka en faktura → verifiera att den dyker upp i Bee's Fortnox-sandbox.
4. **Push end-to-end:** Trigga en ATA-signering på test-projekt → verifiera att Christoffer's TestFlight-app får push.

---

## Ärlig go/no-go-rekommendation

**NO-GO i nuvarande tillstånd.**

**Realistisk path till GO:** 2-4 fokuserade arbetsdagar:
- Dag 1: B1 (cross-business-läckage) + B2 (createProjectFromQuote) — säkerhet + data
- Dag 2: B3 (Fortnox dubblett) + B4 (cost-guardrails) — integration + drift
- Dag 3: R2 (ÄTA-email-stub), R7 (Webolia-source), R8 (Karin-filter), R9 (dölj stubbar) — risker
- Dag 4: Live-tester med Bee Service, dokumentation till Christoffer

**B5 (account deletion) är NO-GO för App Store** men **inte blockerare för TestFlight-pilot med Christoffer**. Skippas tills bredare launch.

**Bee Service-specifikt:** Deras workflow (Webolia → manuell offert → projekt → faktura → Fortnox) testas i flödet ovan. Om alla 4 live-tester går igenom → grön för Bee specifikt, även om bredare launch fortfarande behöver B5 + R3/R11.

---

## Vad jag medvetet INTE flaggat som blockerare (filtrerat från agent-output)

Agent 1 flaggade "Voice/incoming inte kopplat till AI" som BLOCKERARE — det är inte korrekt. Lisa kör via Vapi extern, vilket är medveten arkitektur. Reduced till R1.

Agent 1 flaggade time_entry FK-saknad som RISK — bekräftat, men inte pilot-blocker.

Agent 2 flaggade permissiv RLS som BLOCKERARE — reducerat till R3 eftersom B1-fixet är det praktiska skyddet. Refactora RLS är tech-debt, inte pilot-blocker.

Agent 3 flaggade "Agent-pausning ingen toggle" som BLOCKERARE — konsoliderat med B4 (cost-guardrails) eftersom de hör ihop. Toggle är en del av kill-switch.

Agent 4 flaggade "5 single points of failure" (Anthropic, 46elks, Fortnox, Stripe, OpenAI) som KRITISK — det är pilot-realitet. Vi har inga backup-services och kan inte få det innan pilot. Reducerat till accepterad pilot-risk.

---

*Audit utförd 2026-05-20 via 4 parallella Explore-agenter + kritisk filtrering. Ingen kod-ändring. Faktabaserade fynd med fil:rad-citat. Klassificeringen är min konsoliderade bedömning, inte rå agent-output.*
