# ARCHITECTURE.md — Handymate
## AI Autonomous Back Office Admin
### Sanningskälla för alla terminaler och sprints

> **Detta dokument är obligatorisk läsning för varje Claude Code-terminal.**
> Inga standardvärden, eventnamn, tabellstrukturer eller antaganden får avvika från vad som definieras här.
> Om något saknas — uppdatera dokumentet först, implementera sedan.

---

## 1. Vision

Handymate är inte en app med AI-funktioner. **Handymate är en AI med applikationsfunktioner.**

Agenten är navet. Databasen, API:erna och UI:t är verktyg som agenten använder.
Hantverkaren hanterar det faktiska hantverket — allt administrativt sköts av systemet.

### Vad agenten äger
- All inkommande kommunikation — samtal, SMS, e-post
- Hela säljtratten — från lead till avslutat jobb
- Alla offerter — generera, skicka, följa upp, signera
- Alla fakturor — skapa, skicka, påminna, eskalera
- Kalenderoptimering — föreslå, boka, skydda mot konflikter
- Kundrelationer — reaktivering, uppföljning, NPS
- Bokföringsunderlag — exportera, kategorisera, spara

### Vad hantverkaren äger
- Det faktiska hantverket
- Godkännande av ovanliga eller högrisk-beslut
- Justering av regler när preferenser förändras
- Prissättningsstrategi på övergripande nivå

---

## 2. Versionsroadmap

| Version | Namn | Kärna | Status |
|---------|------|-------|--------|
| V1 | MVP | AI Job Estimator, Instant Quote via foto, grundläggande agent | ✅ Klar |
| V2 | Onboarding + Dashboard | Approval-flöde, push-notiser, Google Calendar/Gmail, tidrapportering | ✅ Klar |
| V3 | Automation Engine | Regelmotor (automation_rules/settings/logs), 9 systemregler, event-hooks | ✅ Klar |
| V4 | Pipeline + Proaktiv | Självgående säljtratt, pipeline_stages, insights-motor, nattlig analys | 🔄 Pågår |
| V5 | Kontextmotor | agent_context, per-företags-inlärning, prediktiv schemaläggning | ✅ Klar |
| V6 | Subagenter | Multi-agent-arkitektur, Cowork-integration, dokumentflöde | ✅ Klar |
| V7 | Full autonomi | Prissättningsintelligens, leverantörskommunikation, Fortnox-djup | 🔄 Pågår |
| V14 | Prisstruktur | Segment, avtalsformer, prislistor per kundtyp (price_lists_v2) | ✅ Klar |
| V15 | Autopilot | Zero-touch deal-to-delivery, godkännandepaket | ✅ Klar |
| V16 | Quote Tracking | Pixel-tracking, offert-visningar, AI-nudge SMS | ✅ Klar |
| V17 | Lager & Roller | Servicebil-lager, rollhantering (admin/PM/personal), GPS check-in | ✅ Klar |
| V18 | AI-intelligens | Mänskligt språk i loggen, morgonrapport push/popup | ✅ Klar |
| V19 | Leads Outbound | Handymate Leads, DR.se brevutskick, kvothantering | ✅ Klar |
| V20 | Granneffekt + LTV | Neighbour campaigns, kundlivstidsvärde, VIP-reaktivering | ✅ Klar |
| V21 | Agent-team | 5 specialiserade agenter, persistent memory, inter-agent kommunikation | ✅ Klar |
| V23 | Automationer | Automationsbibliotek, bekräftelsemail, jobbrapport, garantiuppföljning | ✅ Klar |
| V24 | Dokument & Debug | ensureBucket(), debug-endpoints, E2E-test, Gmail OAuth-fix | ✅ Klar |

---

## 3. Standardvärden — det gemensamma antagandelagret

> ⚠️ **KRITISK REGEL:** Dessa värden får ALDRIG hårdkodas i React-komponenter, API-routes eller agent-prompts.
> De lever i `automation_settings` per företag, seedade vid onboarding.
> Alla terminaler refererar dit — aldrig egna konstanter.

### 3.1 Automation & timing

| Nyckel | Defaultvärde | Justerbart | Beskrivning |
|--------|-------------|------------|-------------|
| `lead_response_target_minutes` | `30` | Ja | Max tid innan svar på ny lead |
| `lead_escalation_hours` | `24` | Ja | Eskalera obesvarad lead till hantverkaren |
| `quote_followup_day_1` | `5` | Ja | Dag 5: första offertuppföljning via SMS |
| `quote_followup_day_2` | `10` | Ja | Dag 10: andra uppföljning + ring-påminnelse |
| `invoice_reminder_day_1` | `1` | Ja | Dag 1 efter förfall: första påminnelse |
| `invoice_escalation_day` | `7` | Ja | Dag 7: striktare påminnelse, kräv godkännande |
| `invoice_critical_day` | `14` | Ja | Dag 14: eskalera till hantverkaren direkt |
| `customer_reactivation_months` | `6` | Ja | Månader inaktiv innan reaktiverings-SMS |
| `booking_reminder_hours` | `24` | Ja | Timmar innan jobb: påminnelse till kund |
| `work_start` | `07:00` | Ja | Arbetstid start |
| `work_end` | `17:00` | Ja | Arbetstid slut |
| `work_days` | `mon-fri` | Ja | Arbetsdagar |
| `night_mode_enabled` | `true` | Ja | Kö meddelanden utanför arbetstid |
| `min_job_value_sek` | `0` | Ja | Minsta jobbvärde — avvisa artigt under detta |
| `max_distance_km` | `null` | Ja | Maxavstånd för jobb (null = obegränsat) |

### 3.2 Moms och ROT

| Nyckel | Värde | Beskrivning |
|--------|-------|-------------|
| `vat_rate` | `0.25` | Moms 25% — aldrig justerbar |
| `rot_deduction_rate` | `0.30` | ROT-avdrag 30% på arbetskostnad |
| `rot_max_per_person_year` | `75000` | Skatteverkets maxbelopp per person och år (kr) |
| `rut_deduction_rate` | `0.50` | RUT-avdrag 50% på arbetskostnad |

---

## 4. Eventkontrakt — fullständig lista

> ⚠️ **KRITISK REGEL:** Inga event får uppfinnas lokalt av en terminal.
> Nya event läggs till i denna lista FÖRST, sedan implementeras de.
> Namnkonvention: `snake_case`, `verb_substantiv`, alltid på engelska.

| Event | Triggas när | Primär payload | Finns |
|-------|-------------|----------------|-------|
| `lead_created` | Ny lead skapas (samtal, SMS, Gmail, manuellt) | `{ lead_id, source, business_id }` | ✅ |
| `lead_updated` | Lead-data uppdateras (ej stage) | `{ lead_id, changed_fields }` | ❌ |
| `contacted` | Utgående SMS eller samtal till lead/kund | `{ lead_id, method: sms\|call }` | ❌ |
| `call_missed` | Inkommande samtal besvaras ej | `{ from, business_id }` | ✅ |
| `call_completed` | Inkommande samtal avslutat av agent | `{ from, duration, transcript }` | ❌ |
| `sms_received` | Inkommande SMS | `{ from, body, business_id }` | ✅ |
| `sms_sent` | Utgående SMS skickat | `{ to, body, lead_id }` | ❌ |
| `quote_created` | Offert skapas (ej skickad ännu) | `{ quote_id, lead_id }` | ❌ |
| `quote_sent` | Offert skickas till kund | `{ quote_id, lead_id, amount }` | ❌ **SAKNAS** |
| `quote_opened` | Kund öppnar offertlänken | `{ quote_id, lead_id, opened_at }` | ⚠️ Delvis |
| `quote_signed` | Kund signerar offert digitalt | `{ quote_id, lead_id }` | ✅ |
| `quote_expired` | Offert går ut utan svar | `{ quote_id, lead_id, days_sent }` | ❌ |
| `invoice_created` | Ny faktura skapas | `{ invoice_id, lead_id, amount }` | ✅ |
| `invoice_sent` | Faktura skickas till kund | `{ invoice_id, lead_id }` | ❌ |
| `invoice_overdue` | Faktura förfallen (körs av cron) | `{ invoice_id, days_overdue }` | ❌ |
| `payment_received` | Betalning registreras | `{ invoice_id, amount, method }` | ✅ |
| `booking_created` | Ny bokning skapas | `{ booking_id, lead_id, date }` | ❌ |
| `booking_reminder` | 24h innan ett jobb | `{ booking_id, lead_id, date }` | ❌ |
| `job_completed` | Jobb markeras som avslutat | `{ lead_id, invoice_id }` | ❌ |
| `pipeline_stage_changed` | Lead byter steg i pipeline | `{ lead_id, from_key, to_key }` | ❌ |
| `customer_reactivation` | 6+ månader sedan senaste jobb | `{ lead_id, months_inactive }` | ❌ |

---

## 5. Pipeline — säljtrattens steg

> Automationer refererar alltid till `key`, aldrig till `label`.
> `label` kan bytas av hantverkaren i UI utan att automationer påverkas.

| key | Default label | Order | Auto-trigger | is_system |
|-----|--------------|-------|--------------|-----------|
| `new_lead` | Ny lead | 1 | `event: lead_created` | true |
| `contacted` | Kontaktad | 2 | `event: contacted` | true |
| `quote_sent` | Offert skickad | 3 | `event: quote_sent` | true |
| `quote_opened` | Offert öppnad | 4 | `event: quote_opened` | true |
| `active_job` | Pågående jobb | 5 | `event: quote_signed` | true |
| `invoiced` | Fakturerad | 6 | `event: invoice_created` | true |
| `completed` | Avslutat | 7 | `event: payment_received` | true |
| `lost` | Ej aktuell | 8 | Manuell (hantverkaren) | true |

### Skyddade övergångar
En automation får **aldrig** flytta ett lead bakåt (lägre `order`).
Bara hantverkaren kan flytta bakåt manuellt.
Om `update_status`-actionen försöker flytta bakåt returnerar den `status: skipped` med förklaring i `automation_logs`.

### Manuellt "Ej aktuell"-flöde
När hantverkaren markerar ett lead som ej aktuellt:
1. Modal öppnas med orsak-dropdown: `Kunden valde annan / Kunden avvaktade / Priset passade inte / Annat`
2. Valfritt avslutsmeddelande till kunden
3. Om meddelande skrivs: `create_approval` — hantverkaren godkänner innan SMS skickas
4. Orsaken sparas i `leads.lost_reason TEXT` för framtida analys

---

## 6. Datamodellkontrakt

> ⚠️ **KRITISK REGEL:** Varje tabell äger sin data exklusivt.
> Ingen terminal skriver till en tabell den inte äger.

### 6.1 Tabellägande

| Tabell | Domän | Source of truth för |
|--------|-------|---------------------|
| `leads` | Core | Lead-status, pipeline_stage_key, lost_reason, kontaktinfo |
| `pipeline_stages` | Core | Stegdefinitioner — key, label, order per företag |
| `automation_settings` | Automation | Alla standardvärden och globala regler per företag |
| `automation_rules` | Automation | Enskilda regler — trigger, action, parametrar |
| `automation_logs` | Automation | Allt agenten gjort — audit trail, **aldrig radera** |
| `business_config` | Core | Företagsinfo, personal_phone, publikt 46elks-nummer |
| `quotes` | Commerce | Offertdata, status, sign_token, ROT-info |
| `invoices` | Commerce | Fakturadr, betalstatus, förfallodatum |
| `time_entries` | Operations | Tidrapportering, fakturerbar tid, kund |
| `bookings` | Operations | Bokningar, Google Calendar sync |
| `sms_conversations` | Comms | Alla SMS in/ut, matchad lead/kund |
| `agent_context` | Agent | Tolkad företagsstatus — uppdateras nattligen av Claude ✅ |
| `learning_events` | Agent | Råa inlärningshändelser — accept/reject/edit per approval ✅ |
| `business_preferences` | Agent | Tolkade preferenser — ton, prissättning, SMS-längd ✅ |

### 6.2 Kritiska fält att aldrig blanda ihop

| Fält | Tabell | Typ | Regel |
|------|--------|-----|-------|
| `pipeline_stage_key` | `leads` | TEXT | Refererar alltid till `pipeline_stages.key` — ALDRIG `label` |
| `personal_phone` | `business_config` | TEXT | Hantverkarens privata nummer — **aldrig exponerat utåt mot kunder** |
| `public_phone` | `business_config` | TEXT | 46elks-numret — detta är företagets publika nummer |
| `is_system` | `automation_rules` / `pipeline_stages` | BOOLEAN | `true` = kan ej raderas, bara av/på eller byta label |
| `requires_approval` | `automation_rules` | BOOLEAN | `true` = skapar `pending_approval` istället för direkt action |
| `lost_reason` | `leads` | TEXT | Orsak till Ej aktuell — för analys, används ej i automationer |

---

## 7. Telefoniarkitektur

> ⚠️ **Rätt riktning:** Handymates nummer är det publika företagsnumret.
> Hantverkarens privata nummer är **aldrig** exponerat utåt mot kunder.

### Rätt flöde
```
Kund ringer Handymates publika nummer (business_config.public_phone)
  → Vapi-agent svarar alltid
  → Agenten hanterar ärendet (kvalificerar, bokar, svarar)
  → Om kunden måste prata med hantverkaren live:
      agenten säger "ett ögonblick" + connect(personal_phone)
  → Om hantverkaren inte svarar: agenten tar meddelande, skapar lead
  → fireEvent("call_completed") eller fireEvent("call_missed")
```

### Fel flöde — används inte i Handymate
```
**21*+46XXXXXXXXX#  ← vidarekoppling privat → Handymate
```
Detta är INTE Handymates modell. Avaktivera med `##21#`.

### Onboarding steg 3 — Telefon (ska byggas om i V5)
**Nuvarande:** Visar vidarekopplingskod som primärt flöde. ❌ Fel.

**Ska vara:**
- Rubrik: "Ditt nya företagsnummer"
- Visar `public_phone` prominent
- Text: "Använd detta nummer på visitkort, hemsida och offerter. Kunder ringer hit — agenten svarar alltid."
- Fält: "Ditt privata mobilnummer" → sparas i `business_config.personal_phone`
- Sekundärt, kollapsbart: "Har du ett gammalt nummer? Aktivera vidarekoppling" med `**21*`-koden som option

### Transfer-implementation (46elks)
```typescript
// I Vapi action handler — vid live-transfer:
if (agentDecidesTransfer) {
  await call46elks({
    action: 'connect',
    to: businessConfig.personal_phone,
    timeout: 20, // sekunder innan fallback
    fallback: 'voicemail'
  })
  await fireEvent('call_transferred', businessId, { lead_id, to: personal_phone })
}
```

---

## 8. Agentens minneslager

### 8.1 Alltid i system prompt (injiceras per anrop)
| Data | Källa | Uppdateras |
|------|-------|------------|
| `automation_settings` | `automation_settings`-tabell | Vid varje förändring |
| `pipeline_stage` för aktiv lead | `leads.pipeline_stage_key → pipeline_stages.label` | Per konversation |
| Öppna leads (antal) | `agent_context` (V5) / direkt query | Nattligen / per anrop |
| Aktiva jobb idag | `bookings JOIN business_config` | Per anrop |
| Väntande approvals | `pending_approvals COUNT` | Per anrop |

### 8.2 Slår upp vid behov (via tools)
- Kundhistorik — tidigare jobb, betalningsbeteende
- Offertdetaljer — rader, belopp, ROT-info
- Kalenderdata — lediga tider, konflikter
- SMS-historik — konversationstråd med kund

### 8.3 Läser aldrig direkt
- Personnummer — hanteras bara av ROT-beräkningslogiken
- Löneunderlag — exporteras men läses inte av agenten
- Råa betaldata — agenten ser status, inte kontonummer
- `learning_events`-rådata — agenten läser tolkade preferenser, inte råloggar

---

## 9. Regler för parallell terminaldrift

> ⚠️ **KRITISK REGEL:** Terminaler som jobbar parallellt får **inte** röra varandras territorium.

### Pågående — V7
| Terminal | Äger | Får inte röra |
|----------|------|---------------|
| T1 — Prissättningsintelligens | Dynamisk prissättning, marginanalys, konkurrentjämförelse | Subagenter, databas |
| T2 — Fortnox-djup | Bokföring, SIE-export, kontoplan, momsrapport | Agent-logik, UI |

### Klara — V4 + V5 + V6
| Sprint | Status |
|--------|--------|
| V4 Pipeline + UI-sprint | ✅ Klar |
| V5 T1 — Insights-motor | ✅ Klar |
| V5 T2 — Per-företags-inlärning | ✅ Klar |
| V6 — Subagent-arkitektur (Orchestrator + Lead/Ekonomi/Strategi) | ✅ Klar |

---

## 10. Verifieringschecklista — efter varje sprint

> Ingen ny sprint startar på ej verifierad grund.

### 10.1 Teknisk verifiering (alltid)
```bash
npx tsc --noEmit                          # 0 TypeScript-fel
npx next build                            # Ren build

# Inga hårdkodade statussträngar:
grep -r "Vunnen\|Förlorad\|Förhandling\|Offert skickad\|Ny lead" app/ components/

# Inga hårdkodade standardvärden (ska referera automation_settings):
grep -r "days: 5\|days: 30\|minutes: 30\|months: 6" app/ lib/

# Alla fireEvent()-anrop är awaited:
grep -r "fireEvent(" app/ | grep -v "await"
```

### 10.2 Funktionell verifiering (per sprint)
- **V4 Pipeline:** Skicka testoffert → lead flyttas till `quote_sent` i Kanban automatiskt
- **V4 Pipeline:** Signera offert → lead flyttas till `active_job` automatiskt
- **V4 Pipeline:** `grep -r "Vunnen\|Förlorad\|Förhandling" app/ components/` → 0 träffar
- **V5 Insights:** Morgonrapport genereras 07:00 med korrekt data
- **V5 Onboarding:** Steg 3 visar `public_phone`, samlar in `personal_phone`, ingen vidarekopplingskod primärt
- **V6 Transfer:** Inkommande samtal → agent svarar → transfer till `personal_phone` fungerar

---

## 11. Stack-referens

Se sektion 17 för komplett lista med alla miljövariabler.

> **Arkitekturprincip:** Next.js (Vercel) är primär runtime för ALL agent-logik.
> Supabase Edge Functions används bara som sekundära webhook-mottagare.
> Denna gräns får aldrig suddas ut.

---

## 12. Automationsbiblioteket

> Inställningar → Automationer visar alla regler som ett bibliotek med 6 kategorier.
> Varje template matchas mot befintlig `automation_rules` via `matchRuleNames[]`.

### 12.1 Kategorier (CATEGORIES[])

| Slug | Label | Ikon |
|------|-------|------|
| `leads` | Leads & Kontakt | Phone |
| `quotes` | Offerter | FileText |
| `invoices` | Fakturor & Betalning | Receipt |
| `bookings` | Bokningar & Projekt | Calendar |
| `customers` | Kundvård | Users |
| `marketing` | Marknadsföring | Megaphone |

### 12.2 Alla templates (TEMPLATES[])

| Rule Name | Kategori | Beskrivning |
|-----------|----------|-------------|
| `lead_response` | Leads | Bekräftelse-SMS vid ny lead |
| `missed_call_response` | Leads | SMS vid missat samtal |
| `lead_qualification` | Leads | AI kvalificerar och prioriterar |
| `quote_followup_day1` | Offerter | Uppföljning dag 5 |
| `quote_followup_day2` | Offerter | Andra uppföljning dag 10 |
| `quote_signed_confirmation` | Offerter | Bekräftelsemail vid signering |
| `invoice_reminder_day1` | Fakturor | Påminnelse dag 1 |
| `invoice_reminder_day2` | Fakturor | Eskalering dag 7 |
| `booking_reminder` | Bokningar | 24h-påminnelse |
| `on_my_way_sms` | Bokningar | "På väg"-SMS med ETA |
| `job_report_followup` | Bokningar | Jobbrapport PDF |
| `warranty_followup` | Bokningar | Garantiuppföljning 12 mån |
| `customer_reactivation` | Kundvård | Reaktivering efter 6 mån |
| `review_request` | Kundvård | Google Reviews-förfrågan |
| `birthday_greeting` | Kundvård | Födelsedagshälsning |
| `seasonal_campaign` | Marknadsföring | Säsongskampanjer |
| `neighbour_campaign` | Marknadsföring | Granneffekt-utskick |

---

## 13. Backoffice-teamet (V21)

> 5 specialiserade AI-agenter med egna systemprompts och tool-subsets.

| Agent | Roll | Triggers | Tools |
|-------|------|----------|-------|
| **Matte** | Chefsassistent (orchestrator) | manual, phone_call, incoming_sms, morning_report | alla |
| **Karin** | Ekonom | invoice_overdue, payment_received, invoice_created | invoices, reminders, stats |
| **Hanna** | Marknadschef | customer_inactive, job_completed, leads_batch_ready | campaigns, SMS, segmentation |
| **Daniel** | Säljare | lead_created, quote_sent, quote_opened, quote_expired | leads, quotes, pipeline |
| **Lars** | Projektledare | booking_created, job_completed, work_order_created | bookings, projects, dispatch |

### 13.1 Routing
`lib/agents/personalities.ts` → `routeToAgent(triggerType, eventName)` väljer agent automatiskt.
`agent_runs.agent_id` sparar vilken agent som körde.

### 13.2 Persistent Memory (agent_memories)
- pgvector med 1536-dimensional embeddings
- Cosine similarity search för relevanta minnen
- Top-5 injiceras i systemprompt per körning

### 13.3 Inter-agent kommunikation (agent_messages)
- `send_agent_message(to, type, content)` tool
- `get_agent_messages(agent_id)` tool
- Typer: request, insight, alert, handoff

---

## 14. Handymate Mobile

> Separat React Native-repo. Kommunicerar via dessa API-endpoints.

| Endpoint | Funktion |
|----------|----------|
| `POST /api/matte/chat` | Chat med Matte via Claude Haiku. `{messages, context}` → `{reply, action?}` |
| `POST /api/matte/transcribe` | Röst → text via OpenAI Whisper. FormData `audio` → `{text}` |
| `POST /api/sms/on-my-way` | "På väg"-SMS med GPS + Google Maps ETA |
| `GET /api/quotes/pdf` | PDF-generering av offert |
| `POST /api/debug/sms` | Test-SMS med diagnostik |
| `POST /api/debug/mail` | Test-mail med Gmail/Resend diagnostik |
| `POST /api/debug/e2e-quote` | E2E-test av hela offertflödet |

---

## 15. Dokumenthantering

### 15.1 Storage buckets (Supabase)

| Bucket | Användning | Auto-skapas via |
|--------|-----------|-----------------|
| `customer-documents` | Kundkorts-filer, deal-bilagor | `ensureBucket()` |
| `project-files` | Projektdokument, ritningar | `ensureBucket()` |
| `business-assets` | Företagsloggor | `ensureBucket()` |
| `quote-images` | AI-genererade offertbilder | fallback |

### 15.2 ensureBucket()
`lib/storage.ts` — kollar om bucket finns, skapar om den saknas.
Anropas i alla upload-routes innan `supabase.storage.upload()`.

---

## 16. Nya SQL-migrationer (V14–V24)

| Fil | Innehåll |
|-----|----------|
| `v14_lead_sources.sql` | Lead-källor + leverantörsportal |
| `v14_pricing_structure.sql` | Segment, avtalsformer, price_lists_v2 |
| `v15_autopilot.sql` | Autopilot-inställningar + paket i approvals |
| `v16_quote_tracking.sql` | quote_tracking_events + view_count på quotes |
| `v17_inventory.sql` | Lagerplatser, artiklar, rörelser |
| `v17_roles.sql` | Rollhantering på business_users |
| `v17_checkin.sql` | GPS check-in/out med attestering |
| `v17_dispatch.sql` | Smart dispatch — skills + tilldelning |
| `v18_quote_ux.sql` | Kundspecifika betalningsvillkor |
| `v18_morning_report.sql` | morning_report_sms_enabled |
| `v19_leads_outbound.sql` | Outbound-leads + kvothantering |
| `v20_neighbour_campaigns.sql` | Granneffekt-kampanjer |
| `v20_customer_ltv.sql` | Kundlivstidsvärde-kolumner |
| `v21_agent_specialization.sql` | agent_id på agent_runs + automation |
| `v21_agent_memory.sql` | pgvector agent_memories + agent_messages |
| `v23_quote_signed_email.sql` | Toggle för bekräftelsemail |
| `v23_job_report.sql` | Jobbrapport-automation toggle |
| `v23_review_requests.sql` | Komplettera review_request |
| `v24_documents_fix.sql` | customer_document + project_document fix |

---

## 17. Stack-referens (utökad)

| Tjänst | Användning | Miljövariabel |
|--------|-----------|---------------|
| Next.js (Vercel) | Primär runtime — ALL agent-logik | — |
| Supabase | Databas + auth + storage | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 46elks | Telefoni + SMS | `ELKS_API_USER`, `ELKS_API_PASSWORD` |
| Vapi | Röst-agent | `VAPI_API_KEY` |
| Anthropic Claude | Haiku (snabba) + Sonnet (agent) | `ANTHROPIC_API_KEY` |
| Google Calendar/Gmail | Kalender + e-post OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Resend | E-post fallback | `RESEND_API_KEY`, `RESEND_DOMAIN` |
| Google Maps | Distance Matrix (ETA) | `GOOGLE_MAPS_API_KEY` |
| OpenAI | Whisper transkribering | `OPENAI_API_KEY` |
| DR.se | Fysiska brevutskick (mock) | — |
| Stripe | Betalning + prenumerationer | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |

---

*Handymate är inte en app. Det är en anställd.*
**Hantverkaren sköter hantverket. Handymate sköter resten.**
