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
| V4 | Pipeline + Proaktiv | Självgående säljtratt, pipeline_stages, insights-motor, nattlig analys | ✅ Klar |
| V5 | Kontextmotor | agent_context, per-företags-inlärning, prediktiv schemaläggning | ✅ Klar |
| V6 | Subagenter | Multi-agent-arkitektur, Cowork-integration, dokumentflöde | ✅ Klar |
| V7 | Full autonomi | Prissättningsintelligens, leverantörskommunikation, Fortnox-djup | ✅ Klar |
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
| V25 | Partnerportal | Webhook, API-nyckel, provision, tidslinje per hänvisning | ✅ Klar |
| V26 | Komplett offertflöde | Skicka-modal, Gmail API, sign_token, kundvy, progress-indikator | ✅ Klar |
| V27 | Säsongsint. + Dispatch | Branschanpassade kampanjer (8 branscher), smart dispatch med skills-matchning | ✅ Klar |
| V28 | Pipeline-refaktor | 6 låsta steg, DealTimeline, automations-handlers, quote_accepted-bug fixad | ✅ Klar |
| V29 | Analys & Ekonomi | P&L-widget, Analys-sida, kostnadsinställningar i business_config | ✅ Klar |
| V30 | Multi-foto offert | Flera foton per offert, fritext-komplement, confidence-badges | ✅ Klar |
| V31 | Lönsamhetslarm | Realtidsvarningar vid 70%/100% budget, Karin-tool, push-notiser | ✅ Klar |
| V32 | Guldmotorn Sprint 1 | Matte resolver + intent-agent + action-executor, SMS + Gmail hooks | ✅ Klar |
| V33 | Guldmotorn Sprint 2 | Kalender-slots, Gmail-bilagor → photo-to-quote, approval-execution | ✅ Klar |
| V34 | Agent-arkitektur | Intelligent routing, morning brief API, MorningBriefWidget | ✅ Klar |
| V35 | Dashboard UI | Pill-brief med foton, 4 KPI-kort, ny widget-hierarki | ✅ Klar |
| V36 | Stripe Elements | Inbyggt betalformulär, billing_plan-tabell, telefon-reservering, dashboard-skydd | ✅ Klar |

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
| `proactive_care_enabled` | `true` | Ja | Proaktiv kundvård baserat på jobbtyp-lifecycle |
| `warranty_followup_enabled` | `true` | Ja | Garantiuppföljning efter 12 månader |

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
> Namnkonvention: `snake_case`, `substantiv_particip` (`quote_sent`, `payment_received`), alltid på engelska.
>
> Listan nedan är **automationsmotorns** event (`fireEvent()` i `lib/automation-engine.ts`).
> Financial Kernels durabla ekonomiska event är ett eget kontrakt med egen tabell och
> egen katalog — se avsnittet *Financial Kernel — kontrakt* längst ned. De två listorna
> får inte dela namn, och kernel-event får aldrig gå genom `fireEvent()`.

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
| `quote_sent` | Offert skickas till kund | `{ quote_id, lead_id, amount }` | ✅ |
| `quote_opened` | Kund öppnar offertlänken | `{ quote_id, lead_id, opened_at }` | ✅ |
| `quote_signed` | Kund signerar offert digitalt | `{ quote_id, lead_id }` | ✅ |
| `quote_expired` | Offert går ut utan svar | `{ quote_id, lead_id, days_sent }` | ❌ |
| `invoice_created` | Ny faktura skapas | `{ invoice_id, lead_id, amount }` | ✅ |
| `invoice_sent` | Faktura skickas till kund | `{ invoice_id, lead_id }` | ✅ |
| `invoice_overdue` | Faktura förfallen (körs av cron) | `{ invoice_id, days_overdue }` | ✅ |
| `payment_received` | Betalning registreras | `{ invoice_id, amount, method }` | ✅ |
| `booking_created` | Ny bokning skapas | `{ booking_id, lead_id, date }` | ❌ |
| `booking_reminder` | 24h innan ett jobb | `{ booking_id, lead_id, date }` | ❌ |
| `job_completed` | Jobb markeras som avslutat | `{ lead_id, invoice_id }` | ✅ |
| `pipeline_stage_changed` | Lead byter steg i pipeline | `{ lead_id, from_key, to_key }` | ✅ |
| `customer_reactivation` | 6+ månader sedan senaste jobb | `{ lead_id, months_inactive }` | ✅ |
| `deal_flow_advanced` | E2E deal flow avancerar ett steg | `{ deal_id, completed_step, next_step }` | ✅ |
| `proactive_care_triggered` | Proaktiv kundvård triggas | `{ customer_id, job_type, months_since }` | ✅ |

---

## 5. Pipeline — säljtrattens steg

> **Designprincip:** Pipeline är ett säljverktyg, inte ett projektverktyg.
> Tratten slutar när affären är vunnen. Allt efter — platsbesök, jobb, faktura, betalning —
> lever i respektive modul och visas i deal-detaljvyns tidslinje, inte som pipeline-steg.

> Automationer refererar alltid till `stage_id` (internt ID), aldrig till `label`.
> `label` kan visas annorlunda i UI men ändrar aldrig automation-beteende.
> Stegen är **globalt låsta** — hantverkaren kan inte lägga till, ta bort eller byta ID.

### 5.1 Stegdefinition (V28)

| stage_id | Default label | Order | Auto-trigger | Terminal |
|----------|--------------|-------|--------------|----------|
| `new_inquiry` | Ny förfrågan | 1 | `event: lead_created` | false |
| `contacted` | Kontaktad | 2 | `event: contacted` | false |
| `quote_sent` | Offert skickad | 3 | `event: quote_sent` | false |
| `quote_accepted` | Offert accepterad | 4 | `event: quote_signed` (automatisk) | false |
| `won` | Vunnen | 5 | Automatisk vid `quote_accepted` → projekt skapat | true |
| `lost` | Förlorad | 6 | Manuell (hantverkaren) | true |

### 5.2 Implementation

Stegen definieras i `lib/pipeline/stages.ts` som en låst konstant:

```typescript
export const PIPELINE_STAGES = [
  { id: 'new_inquiry',     label: 'Ny förfrågan',      color: 'gray',  isTerminal: false },
  { id: 'contacted',       label: 'Kontaktad',          color: 'teal',  isTerminal: false },
  { id: 'quote_sent',      label: 'Offert skickad',     color: 'teal',  isTerminal: false },
  { id: 'quote_accepted',  label: 'Offert accepterad',  color: 'teal',  isTerminal: false },
  { id: 'won',             label: 'Vunnen',             color: 'green', isTerminal: true  },
  { id: 'lost',            label: 'Förlorad',           color: 'red',   isTerminal: true  },
] as const;
```

### 5.3 Tillåtna övergångar

```typescript
const VALID_TRANSITIONS: Record<PipelineStageId, PipelineStageId[]> = {
  new_inquiry:    ['contacted', 'lost'],
  contacted:      ['quote_sent', 'lost'],
  quote_sent:     ['quote_accepted', 'lost'],
  quote_accepted: ['won', 'lost'],
  won:            [],
  lost:           [],
};
```

### 5.4 Vy-typer (V28)
- **Kanban** — drag-and-drop kolumnvy med deal-kort
- **Tidslinje** — 14-dagars horisontell vy med färgkodade staplar + stale lead-varning

### 5.5 Ticket-kort
- **Ärende #XXXX** — sekventiellt deal-nummer (teal, text-xs font-semibold)
- **Kund K-XXXX** — kundnummer med namn
- Prioritets-dot, AI-badge, lead-källa, temperatur-indikator
- Snabbknappar: Ring, SMS, Adress (Google Maps)

### 5.6 Automatisk projekt-skapelse (quote_accepted → won)

När kund signerar offert digitalt:
1. `quote_signed`-event → deal till `quote_accepted`
2. Automation skapar projekt med kunddata, adress, offertbelopp
3. Deal till `won`
4. Bekräftelse-SMS till kund
5. Notis: "🎉 Affär vunnen! Projekt skapat i Jobb-modulen."

### 5.7 Platsbesök — inte ett pipeline-steg

Platsbesök = kalenderhändelse kopplad till dealen, visas som punkt på deal-kortet:
- 🟢 Genomfört — 🟡 Bokat — ⚫ Inte bokat

---

## 6. Datamodellkontrakt

### 6.1 Tabellägande

| Tabell | Domän | Source of truth för |
|--------|-------|---------------------|
| `leads` / `deals` | Core | Lead/deal-status, pipeline_stage, kontaktinfo |
| `automation_settings` | Automation | Alla standardvärden och globala regler per företag |
| `v3_automation_rules` | Automation | Enskilda regler — trigger, action, parametrar |
| `v3_automation_logs` | Automation | Allt agenten gjort — audit trail, **aldrig radera** |
| `business_config` | Core | Företagsinfo, plan, integrationer |
| `quotes` / `quote_items` | Commerce | Offertdata, status, sign_token, ROT-info |
| `invoices` | Commerce | Fakturadata, betalstatus, förfallodatum |
| `projects` | Operations | Projekt med stages, foton, fältrapporter |
| `time_entry` / `time_checkins` | Operations | Tidrapportering, GPS check-in |
| `bookings` | Operations | Bokningar, Google Calendar sync |
| `pending_approvals` | Agent | Godkännanden — kärnan i approval-flödet |
| `agent_context` | Agent | Tolkad företagsstatus — uppdateras nattligen |
| `agent_runs` | Agent | Varje agentkörning med tools, tokens, duration |
| `agent_memories` | Agent | pgvector persistent memory |
| `learning_events` | Agent | Råa inlärningshändelser — accept/reject/edit |
| `business_preferences` | Agent | Tolkade preferenser — ton, prissättning, SMS-längd |
| `deal_flow` / `deal_flow_log` | E2E | Deal flow tracking per steg |
| `sms_usage` | Billing | SMS-kvotspårning per månad |
| `customer_segments` | Pricing | Kundtyper (Privatperson, BRF, etc.) |
| `price_lists` | Pricing | Prislistor per segment + avtalsform |

---

## 7. Telefoniarkitektur

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

---

## 8. Autonomi-features (V29)

> Dessa tre features är kärnan i Handymates vision om full autonomi.

### 8.1 Auto-Approval Learning (`lib/auto-approve-learning.ts`)

Agenten lär sig från hantverkarens godkännandehistorik. Om samma typ av åtgärd alltid godkänns utan ändringar → systemet börjar auto-godkänna.

**Algoritm:**
- Analyserar `pending_approvals` senaste 6 månader per `approval_type`
- Räknar: total, godkända, godkända utan edit, avvisade, editerade, konsekutiva
- Boost-regler:
  - 5+ godkännanden med 90%+ no-edit rate → **+20 confidence boost**
  - 10+ godkännanden med 95%+ no-edit rate → **+30 confidence boost**
  - 3+ avvisningar i rad → **-50 confidence boost**
- **Aldrig boost:** `send_quote`, `send_invoice`, `autopilot_package`, `seasonal_campaign`

**Integration:** Hookad in i `lib/auto-approve.ts` → `tryAutoApprove()`:
1. AI ger en base confidence (t.ex. 70%)
2. Om under tröskeln → hämta `getLearnedConfidence()`
3. Adderar boost (70% + 20 = 90%)
4. Om >= tröskeln → auto-godkänn utan att fråga hantverkaren

**API:** `GET /api/auto-approve/patterns` — alla inlärda mönster per typ (för dashboard)

### 8.2 E2E Deal Flow Engine (`lib/e2e-deal-flow.ts`)

Hela affärslivscykeln automatiserad: lead → betalning → recension.

**11 steg:**

| # | Steg | Auto | Risk | Vad händer |
|---|------|------|------|------------|
| 1 | Lead kvalificerad | ✅ | Låg | AI kvalificerar, sätter temperatur |
| 2 | Platsbesök föreslagen | ❌ | Medium | Föreslår tid, skapar godkännande |
| 3 | Offert genererad | ✅ | Låg | AI genererar offert-utkast |
| 4 | Offert skickad | ❌ | Hög | Alltid manuellt godkännande |
| 5 | Offert signerad | ✅ | Låg | Kunden signerar → trigger |
| 6 | Projekt skapat | ✅ | Låg | Auto från signerad offert |
| 7 | Arbete slutfört | ❌ | Låg | Hantverkaren markerar |
| 8 | Faktura genererad | ✅ | Låg | Auto från projekt (tid + material) |
| 9 | Faktura skickad | ❌ | Hög | Alltid manuellt godkännande |
| 10 | Betalning mottagen | ✅ | Låg | Detekteras automatiskt |
| 11 | Recension begärd | ✅ | Låg | Auto-SMS efter betalning |

**Nyckelmekanismer:**
- `advanceDealFlow()` — rekursivt kör auto-steg i kedja
- `onDealEvent()` — hook som orchestratorn anropar vid events
- Side effects: pipeline-flytt, projekt-skapande, nurture-enrollments
- SQL: `deal_flow` + `deal_flow_log` tabeller
- API: `GET/POST /api/deals/[id]/flow`

### 8.3 Proaktiv Kundvård (`lib/proactive-care.ts`)

Kontaktar gamla kunder baserat på jobbtyp och tid sedan senaste jobb.

**Jobbtyp-lifecycle:**

| Jobbtyp | Uppföljning | Anledning |
|---------|-------------|-----------|
| Badrum | 24 mån | Fog- och tätskiktskontroll |
| Elinstallation | 36 mån | Elbesiktning rekommenderas |
| Laddbox | 12 mån | Årlig service |
| VVS | 18 mån | VVS-kontroll |
| Värmepump | 12 mån | Årlig service (garanti) |
| Varmvattenberedare | 12 mån | Förlänger livslängden |
| Golvvärme | 24 mån | Bör kontrolleras |
| Tak | 36 mån | Takinspektion |
| Fasad | 60 mån | Fasadkontroll |
| Altan | 24 mån | Oljning/behandling |
| Målning | 36 mån | Ommålning |
| Default | 18 mån | Generell uppföljning |

**Mekanismer:**
- Keyword-matchning mot projektnamn/beskrivning (med sv-normalisering)
- AI-genererade SMS via Claude Haiku (fallback till template)
- Max 3 kontakter/dag/företag, 60 dagars dedup
- Körs dagligen via cron (efter warranty followups)
- Skapar `pending_approval` med typ `proactive_care`, risk `medium`
- Approval-typ i `app/api/approvals/[id]/route.ts` skickar SMS vid godkännande

---

## 9. Ekonomi & Prisstruktur (V14)

### 9.1 Tre-nivåers prissystem

```
SEGMENT (kundtyp)          AVTALSFORM              PRISLISTA
─────────────────          ──────────              ─────────
Privatperson           →   Fast pris           →   Standardpriser
BRF                    →   Ramavtal            →   BRF-priser
Fastighetsbolag        →   Ramavtal            →   Fastighets-priser
Företag/Kontor         →   Löpande ARB/MAT     →   Företagspriser
Försäkringsärende      →   Löpande ARB/MAT     →   Försäkringspriser
```

- Kund → Segment → Prislista auto-föreslås
- AI-offert injicerar kundens prislista i prompten
- Inställningar → Prisstruktur (3 flikar: Segment, Avtalsformer, Prislistor)

### 9.2 Feature gates per plan

| Feature | Bas (2 495 kr) | Pro (5 995 kr) | Enterprise (11 995 kr) |
|---------|---------------|----------------|----------------------|
| SMS/mån | 50 | 300 | 1 000 |
| Extra SMS-pris | 0.89 kr | 0.79 kr | 0.69 kr |
| Automationer | 3 aktiva | Alla 9+ custom | Obegränsat |
| AI-team | Bara Matte | Alla 5 | Alla 5 |
| Offertmallar | 3 | 10 | Obegränsat |
| Användare | 1 | 10 | Obegränsat |
| Leads add-on | Add-on | Add-on | Inkluderat |
| Agent memory | ❌ | ✅ | ✅ |

### 9.3 SMS-volymssspårning (`sms_usage`)
- Månatlig kvot per plan, extra debiteras per SMS
- Varning vid 80%, blockering vid hårt tak
- Månadsvis reset via cron
- Upgrade-trigger vid gräns

---

## 10. Automationsbiblioteket (V23)

### 10.1 Kategorier

| Slug | Label | Ikon |
|------|-------|------|
| `leads` | Leads & Kontakt | Phone |
| `quotes` | Offerter | FileText |
| `invoices` | Fakturor & Betalning | Receipt |
| `bookings` | Bokningar & Projekt | Calendar |
| `customers` | Kundvård | Users |
| `pipeline` | Pipeline & Säljtratt | GitBranch |

### 10.2 Alla templates

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
| `pipeline_new_lead` | Pipeline | Flytta till 'Ny lead' vid skapande |
| `pipeline_contacted` | Pipeline | Flytta vid utgående SMS/samtal |
| `pipeline_quote_sent` | Pipeline | Flytta vid offert skickad |
| `pipeline_quote_opened` | Pipeline | Flytta + push-notis vid öppning |
| `pipeline_invoiced` | Pipeline | Flytta vid faktura skapad |
| `pipeline_closed` | Pipeline | Markera avslutad vid betalning |
| `notify_quote_opened` | Pipeline | Push-notis vid offert öppnad |
| `fortnox_sync_invoice` | Pipeline | Synka faktura till Fortnox |

---

## 11. Backoffice-teamet (V21)

| Agent | Roll | Beskrivning | Triggers |
|-------|------|-------------|----------|
| **Matte** | Chefsassistent | Koordinerar teamet och pratar med dig | manual, phone_call, incoming_sms, morning_report |
| **Karin** | Ekonom | Håller koll på fakturor och betalningar | invoice_overdue, payment_received |
| **Hanna** | Marknadschef | Sköter kampanjer och nya kunder | customer_inactive, job_completed |
| **Daniel** | Säljare | Följer upp offerter och leads | lead_created, quote_sent, quote_opened |
| **Lars** | Projektledare | Koordinerar projekt och bokningar | booking_created, job_completed |

Avatarer: Supabase Storage (`team-avatars/`)
Bas-plan: Bara Matte. Pro+: Hela teamet.

### Persistent Memory (agent_memories)
- pgvector 1536-dimensional embeddings
- Top-5 relevanta minnen injiceras i systemprompt

### Inter-agent kommunikation (agent_messages)
- `send_agent_message(to, type, content)` tool
- Typer: request, insight, alert, handoff

---

## 12. Integrationer

| Tjänst | Användning | Miljövariabel |
|--------|-----------|---------------|
| Supabase | Databas + auth + storage + realtime | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 46elks | Telefoni + SMS | `ELKS_API_USER`, `ELKS_API_PASSWORD` |
| Vapi | Röst-agent | `VAPI_API_KEY` |
| Anthropic Claude | Haiku (snabba) + Sonnet (agent) | `ANTHROPIC_API_KEY` |
| Google Calendar/Gmail | Kalender + e-post OAuth | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Resend | E-post fallback | `RESEND_API_KEY` |
| Google Maps | Distance Matrix (ETA) | `GOOGLE_MAPS_API_KEY` |
| OpenAI | Whisper transkribering | `OPENAI_API_KEY` |
| Stripe | Betalning + prenumerationer | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Fortnox | Bokföring + faktura-synk | `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET` |

---

## 13. Cron-jobb

| Jobb | Schema | Vad det gör |
|------|--------|-------------|
| Agent Context | `0 5 * * *` (07:00 SE) | Morning report, LTV, warranty, proaktiv kundvård, pricing intelligence |
| Seasonality | `0 3 * * 1` (måndag) | Säsongskampanjer per bransch (8 branscher) |

---

## 14. Superadmin (`/admin`)

- Åtkomst: `ADMIN_EMAILS` env var
- Kundlista med inline plan-ändring (dropdown)
- Leads add-on toggle
- Impersonering med tidsbegränsad token + röd banner
- "Sätt Enterprise + alla add-ons" snabbknapp
- MRR-beräkning, SMS-statistik, plan-fördelning

---

## 15. SQL-migrationer

| Fil | Innehåll |
|-----|----------|
| `v14_lead_sources.sql` | Lead-källor + leverantörsportal |
| `v14_pricing_structure.sql` | Segment, avtalsformer, price_lists_v2 |
| `v14_partners.sql` | Partner-portal, webhook, API-nyckel |
| `v14_consolidate_plans.sql` | Unified subscription_plan |
| `v15_autopilot.sql` | Autopilot-inställningar |
| `v16_quote_tracking.sql` | Quote tracking events |
| `v16_seasonality.sql` | Säsongsintelligens |
| `v16_project_tracker.sql` | Kundportal projekt-tracker |
| `v16_swish.sql` | Swish-betalning (paid_via, paid_at) |
| `v17_checkin.sql` | GPS check-in/out med attestering |
| `v17_dispatch.sql` | Smart dispatch — skills + tilldelning |
| `v17_field_reports.sql` | Fältrapporter + kundsignering |
| `v17_inventory.sql` | Servicebil-lager |
| `v17_deal_flow.sql` | E2E deal flow tracking |
| `v20_customer_ltv.sql` | Kundlivstidsvärde |
| `v20_neighbour_campaigns.sql` | Granneffekt-kampanjer |
| `v20_supplier_intelligence.sql` | Leverantörsintelligens |
| `v21_agent_memory.sql` | pgvector agent_memories + agent_messages |
| `v21_agent_specialization.sql` | agent_id på agent_runs |
| `v22_sms_usage.sql` | SMS-kvotspårning |

---

## 16. Verifieringschecklista

```bash
npx tsc --noEmit                          # 0 TypeScript-fel
npx next build                            # Ren build
```

---

*Handymate är inte en app. Det är en anställd.*
**Hantverkaren sköter hantverket. Handymate sköter resten.**

---

## Ekonomiinställningar (V29)

### Ekonomi-kolumner i business_config

| Fält | Typ | Beskrivning |
|------|-----|-------------|
| `pricing_settings->>'hourly_rate'` | JSONB | Timkostnad kr/h (default 650) |
| `overhead_monthly_sek` | numeric | Månatlig overhead kr |
| `margin_target_percent` | numeric | Marginalmål % (default 50) |

Dessa används av `/api/analytics/economics` och `MorningBriefWidget`.

### Analys & Ekonomi-sidan

URL: `/dashboard/analytics`
Två sektioner: Ekonomiöversikt (överst) + Försäljningsinsikter (nedanför)
Morning brief-widget visar komprimerad ekonomisammanfattning på dashboarden.

---

## Guldmotorn — Mattes konversationsintelligens (V32–V33)

### Arkitektur

```
Signal (SMS/Gmail)
      ↓
lib/matte/resolver.ts        — Identifiera kund/lead, hämta projekt/deals/fakturor/historik
      ↓
lib/matte/intent-agent.ts    — Claude Sonnet analyserar intent + beslutar actions + suggestedAgent
      ↓
lib/matte/action-executor.ts — Autonoma actions direkt, komplexa → pending_approvals
      ↓
lib/matte/calendar-slots.ts  — Lediga tider från Google Calendar (14 dagar, 3 slots)
```

### Signal-kanaler

| Kanal | Hook | Status |
|-------|------|--------|
| SMS | `app/api/sms/incoming/route.ts` | ✅ Live |
| Gmail | `lib/gmail/processor.ts` → `processInboundEmail()` | ✅ Live |
| Samtal | Sprint 3 — väntar på röstbeslut | ⏳ Pausad |

### Intent-typer

`material_change`, `reschedule_request`, `new_booking_request`, `quote_request`,
`quote_addition`, `invoice_question`, `payment_confirmation`, `general_question`,
`complaint`, `confirmation`, `cancellation`, `new_contact`, `call_followup`, `unclear`

### Autonomiregler

Direkt (autonomous: true): svara på frågor, uppdatera projektanteckningar,
materialändringar, tacka för betalning, skapa lead från okänd kontakt.

Approval (autonomous: false): boka/omboka tider, skicka offert/prisuppgift,
ÄTA-tillägg, flytta deal-stage, allt med pengar.

### Approval-typer (Matte-specifika)

`propose_booking_times`, `create_quote_draft`, `create_ata_draft`,
`send_matte_customer_reply` — hanteras i `app/api/approvals/[id]/route.ts`

### Databas

`project_events` — tidslinje-events per projekt (material_change, note, etc.)
Index: `idx_leads_phone_business`, `idx_leads_email_business`, `idx_customer_phone_business`

---

## Agent-arkitektur (V34)

### Routing

Matte är orkestratorn. `incoming_sms` går inte längre direkt till Lisa —
Matte resolver + intent-agent bestämmer vem som äger ärendet.

```typescript
// lib/matte/agent-router.ts
routeToAgentWithContext(decision.suggestedAgent, signal, entity, decision, businessId, supabase)
```

| Intent | Agent |
|--------|-------|
| new_contact, general_question, unclear, complaint | Lisa |
| quote_request, quote_addition, cancellation | Daniel |
| reschedule_request, new_booking_request, material_change | Lars |
| invoice_question, payment_confirmation | Karin |
| Hantverkaren direkt (manual) | Matte |

### Morning Brief

Genereras kl 06:00 UTC via cron (`app/api/cron/morning-brief`).
Cachas i `business_preferences.morning_brief_latest`.
Hämtas via `GET /api/morning-brief`.

Varje `AgentBrief`: `{ agentId, quote, badge, badgeType, details[] }`

### MorningBriefWidget

`components/dashboard/MorningBriefWidget.tsx`
Pill-rad med agent-foton från Supabase Storage bucket `team-avatars`.
Filnamn: `Matte.png`, `Karin.png`, `Daniel.png`, `Lars.png`, `Hanna.png`
Klick på agent → expanderar detaljpanel med agentens brief.

---

## Stripe & Billing (V36)

### Tabeller

`billing_plan` — plan-definitioner med Stripe Price IDs:

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| `plan_id` | TEXT PK | 'starter', 'professional', 'business' |
| `name` | TEXT | Visningsnamn |
| `price_sek` | INTEGER | Månadspris |
| `stripe_price_id` | TEXT | Stripe Price ID |

### Betalningsflöde (Stripe Elements)

```
Onboarding steg 2 (Betalning)
  → POST /api/billing/setup-intent
  → Stripe Elements CardElement
  → stripe.confirmCardSetup()
  → POST /api/billing/confirm → subscription_status + telefon-provisionering
```

### Kolumner i business_config (betalning)

| Kolumn | Typ | Beskrivning |
|--------|-----|-------------|
| `subscription_status` | TEXT | `inactive`, `trial`, `trialing`, `active` |
| `subscription_plan` | TEXT | `starter`, `professional`, `business` |
| `trial_ends_at` | TIMESTAMPTZ | +30 dagar från betalning |
| `stripe_customer_id` | TEXT | Stripe customer ID |
| `is_pilot` | BOOLEAN | Grandfatherade konton — aldrig låsas ute |

### Dashboard-skydd

```typescript
const hasAccess = config?.is_pilot ||
  config?.subscription_status === 'active' ||
  config?.subscription_status === 'trial' ||
  (config?.subscription_status === 'trialing' &&
   config?.trial_ends_at && new Date(config.trial_ends_at) > new Date())
```

### Onboarding-flöde (V36)

```
0: Företag    — namn, bransch, logga, org-nr
1: Telefon    — reserverat nummer, sparar personal_phone + call_mode
2: Betalning  — planväljare + Stripe Elements, provisionerar telefon
3: Kunder     — CSV-import eller manuellt
4: SMS        — reaktiveringskampanj
```

### Billing-endpoints

```
app/api/billing/
├── checkout/       — Stripe Checkout Session (redirect)
├── setup-intent/   — SetupIntent för Elements
├── confirm/        — Bekräftar kort + provisionerar telefon
├── portal/         — Stripe Customer Portal
├── webhook/        — Stripe webhooks
├── leads-addon/    — Leads add-on upgrade
├── route.ts        — Billing overview
└── usage/          — SMS/samtal-förbrukning
```

---

## SQL-migrationer V28–V36

| Fil | Innehåll |
|-----|----------|
| `sql/v28_pipeline_locked.sql` | 6 låsta pipeline-steg, deal_automation_tasks, won_at/lost_at |
| `sql/v29_economics_settings.sql` | overhead_monthly_sek, margin_target_percent |
| `sql/v29b_economics_fix.sql` | Fix: läs från business_config istf business_preferences |
| `sql/v32_matte_intelligence.sql` | project_events-tabell, resolver-index |
| `sql/v33_sprint2.sql` | attachment_count på email_conversations, booking-index |
| `sql/v34_agent_architecture.sql` | routed_agent på pending_approvals, invoice/quotes/leads-index |
| `sql/v36_stripe_elements.sql` | is_pilot-kolumn, subscription_status default, pilot-konton |

## Team- och kalenderstart (2026-09-13)
Efter onboarding återanvänds KomIgangRail. `planning_team_start` och
`planning_calendar_start` i business_preferences är användarbekräftelser,
inte bevis på verifierad arbetstid eller aktuell beläggning. Skrivning går
via ägar-/adminskyddad `/api/onboarding/planning-start`, med serverhärlett
företag och jämförelse mot det underlag användaren fick se. Teamet måste
vara bekräftat före kalendern. Kalenderbekräftelsen namnger en specifik
nästa vecka; startsteget är en engångsuppgift, ingen veckovis checklista.
Dessa uppgifter läggs bara till i webbrailen, inte i livscykelutskicken.
Den nya 70-procentsgrinden aktiveras inte av startbekräftelserna.

---

## Financial Kernel — kontrakt (Paket C0, 2026-09-13)

> **Status:** kontrakt, ingen kod med beteende. Detta avsnitt är den kanoniska källan för
> Financial Kernels eventnamn, kuvert, flaggor och modulägande. Blueprinten
> `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md` förklarar *varför*; om den och detta
> avsnitt skiljer sig i ett **namn** vinner detta avsnitt, i **domänregler** vinner blueprinten.
> Exekveringsordning och paketägande: `docs/strategy/FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md`.
> Paketstatus och handoff: `docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md`.
>
> **Grindas av CI:** `tests/financial-kernel-event-contract.spec.ts` läser tabellen i FK.1 och
> failar när ett eventnamn finns i kernel-kod, i `lib/financial-kernel/events/catalog.ts`
> eller i en migration utan att stå här. Lägg till raden först, koda sedan.

### FK.0 Fyra regler som gäller allt nedan

1. **Ett ekonomiskt event, många projektioner.** Fakturastatus, `paid_amount`, bokföring och
   avstämning är projektioner av samma event — aldrig oberoende slutsatser.
2. **Kernel-event går aldrig genom `fireEvent()`.** De persisteras i `financial_events`
   (FK.2). Automationsmotorn nås bara via bryggan (FK.3).
3. **Ingen toleranskonstant i kernel-vägen.** `TOLERANCE_KR = 1` i
   `lib/invoices/payment-decision.ts` är legacy och stannar där. En differens inom
   landspaketets avrundningspolicy blir en explicit bokföringsrad, en utanför blir ett
   avstämningsundantag.
4. **Fyra beslut är ägarens, inte implementerarens** (blueprint §38: merchant-of-record,
   Pay-före-Ledger, momsdeklaration fil/producera, cut-over-räkenskapsår). Den som stöter på
   ett av dem stannar och säger det. Ingen "bekväm default".

### FK.1 Kanonisk eventkatalog

Alla event: `snake_case`, `substantiv_particip`, engelska. `Finns` är ❌ på samtliga rader
tills paketet som inför eventet mergas — då byts markeringen i **samma PR**. Kolumnen
*Paket* pekar på orkestreringsdokumentets paket som äger första implementationen.

Belopp i payload är alltid **minor units** (öre) som **decimalsträng av ett heltal** (`"1250000"`),
aldrig ett JSON-tal och aldrig `number` med decimaler, och alltid med `currency`. Ändrat
2026-09-14 (C4): ett JSON-tal tappar siffror över 2^53 genom PostgREST och `JSON.parse`, och
kerneln har regeln att aldrig läsa ett belopp som `number`; strängen gör payloaden konsekvent
med spegelkolumnen `amount_minor` och varje RPC-retur. Konsumenter parsar med `money(BigInt(s), currency)`. Fält märkta † är obligatoriska från dag ett därför att det svenska
landspaketet inte kan fyllas på i efterhand utan migration (blueprint §15.1–15.2).
Källan för †-fälten från C4: `invoice.vat_regime` (default `'standard'`) och
`business_config.accounting_method` (default `'accrual'`), båda införda i C4 som minsta möjliga
datamodelländring; evidens för köparstatus och UI för regimval är C9.

**Fordran (kommersiell)**

| Event | Triggas när | Primär payload | Paket | Finns |
|-------|-------------|----------------|-------|-------|
| `invoice_issued` | En faktura får sitt nummer och ställs ut (skickas eller importeras redan utställd). Inte när ett utkast skapas — det är automationsmotorns `invoice_created`. | `{ invoice_id, invoice_number, customer_id, project_id?, currency, total_minor, vat_regime†: 'standard'\|'reverse_charge_construction', accounting_method†: 'accrual'\|'cash', issued_date, due_date, tax_reduction?: 'rot'\|'rut' }` | C4 | ❌ |
| `invoice_credited` | En kreditfaktura ställs ut mot en faktura. | `{ invoice_id, credit_invoice_id, currency, amount_minor, issued_date }` | C4 | ❌ |
| `receivable_created` | En fordranskomponent skapas. En ROT/RUT-faktura ger två: kundens del och Skatteverkets. | `{ receivable_id, invoice_id, component: 'customer'\|'tax_authority', owner: 'business'\|'factor', currency, amount_minor, due_date }` | C4 | ❌ |
| `receivable_adjusted` | Komponentens belopp eller ägare ändras utan betalning. Täcker kredit, avskrivning, påminnelseavgift, ränta, avrundning, ägarbyte (factoring) och omklassning mellan komponenter (Skatteverket betalar mindre än begärt: resten flyttar till kunden). Omklassning ger två event, ett per komponent. | `{ receivable_id, reason: 'credit'\|'write_off'\|'dunning_fee'\|'interest'\|'rounding'\|'ownership_transfer'\|'reclassification', delta_minor?, owner_after?, from_component?, to_component? }` | C4 / C14 | ❌ |
| `receivable_settled` | En komponent är fullt allokerad, eller nollställd av en **avrundningsjustering** på en komponent som har allokering (golden path 36). Kredit, avskrivning och omklassning nollställer utan detta event: komponenten blir `closed`, inte `settled`, och bryggan tiger (golden path 10). | `{ receivable_id, invoice_id, component, settled_at }` | C4 | ❌ |

**Pay (pengarörelse)** — gäller *alla* betalningar, även manuell "markera betald" (`provider: 'manual'`) och Fortnox-import (`provider: 'fortnox'`). Det finns ingen sidoväg där en betalning uppdaterar en faktura utan att bli ett `payment_settled` (blueprint §18.2).

| Event | Triggas när | Primär payload | Paket | Finns |
|-------|-------------|----------------|-------|-------|
| `payment_intent_created` | En betalningsavsikt skapas (Pay-länk, Swish-QR, kortsession). | `{ payment_intent_id, invoice_id?, receivable_ids[], currency, amount_minor, provider, method }` | C7 | ❌ |
| `payment_initiated` | En betalning existerar hos leverantören eller registreras manuellt. Tillstånd `created → pending`. `provider` är `'manual'`, `'fortnox'`, `'skatteverket'` (ROT/RUT-utbetalning) eller en PSP-identifierare (C7). | `{ payment_id, payment_intent_id?, provider, provider_ref?, direction: 'inbound'\|'outbound', currency, amount_minor }` | C4 (manual/fortnox/skatteverket), C7 | ❌ |
| `payment_authorized` | Leverantören har reserverat beloppet. Tillstånd `→ authorized`. | `{ payment_id, provider_ref }` | C7 | ❌ |
| `payment_processing_started` | Leverantören bearbetar/kapar betalningen. Tillstånd `→ processing`. | `{ payment_id, provider_ref }` | C7 | ❌ |
| `payment_settled` | Pengarna är faktiskt mottagna eller (för manuell/Fortnox) registrerade som mottagna. Tillstånd `→ settled`. | `{ payment_id, currency, amount_minor, fee_minor?, settled_at, evidence: 'provider'\|'manual'\|'fortnox'\|'bank' }` | C4, C7 | ❌ |
| `payment_failed` | Betalningen misslyckades slutgiltigt. | `{ payment_id, reason_code, provider_reason? }` | C7 | ❌ |
| `payment_cancelled` | Betalningen avbröts före settlement. | `{ payment_id, cancelled_by: 'customer'\|'business'\|'provider'\|'system' }` | C7 | ❌ |
| `payment_refunded` | Hel eller delvis återbetalning är genomförd. `partial` avgör tillstånd `partially_refunded` / `refunded`. | `{ payment_id, refund_id, currency, amount_minor, partial: boolean, authorized_by }` | C7 | ❌ |
| `payment_disputed` | Chargeback/tvist öppnad hos leverantören. | `{ payment_id, dispute_id, currency, amount_minor, provider_ref }` | C7 | ❌ |
| `payout_created` | Leverantören har skapat en utbetalning till företagets bankkonto. | `{ payout_id, provider, currency, amount_minor, fee_minor?, payment_ids[] }` | C7 | ❌ |
| `payout_settled` | Utbetalningen har nått banken. | `{ payout_id, banked_at, bank_transaction_id? }` | C7 / C11 | ❌ |

**Allokering och avstämning**

| Event | Triggas när | Primär payload | Paket | Finns |
|-------|-------------|----------------|-------|-------|
| `payment_allocated` | En settlad betalning knyts till en fordranskomponent. Summan av allokeringar får aldrig överstiga betalningen. | `{ allocation_id, payment_id, receivable_id, currency, amount_minor }` | C4 | ❌ |
| `payment_allocation_reversed` | En allokering backas (felallokering, kredit, återbetalning). | `{ allocation_id, reason }` | C4 | ❌ |
| `bank_transaction_imported` | En banktransaktion (eller leverantörs-utbetalningsrad) är importerad som bevis. | `{ bank_transaction_id, source: 'bank'\|'provider'\|'manual', currency, amount_minor, banked_at, external_ref }` | C11 | ❌ |
| `reconciliation_matched` | Matcharen har knutit en banktransaktion till en betalning, utbetalning eller leverantörsbetalning. | `{ match_id, bank_transaction_id, matched_type: 'payment'\|'payout'\|'supplier_payment', matched_id, currency, amount_minor, partial: boolean }` | C11 | ❌ |
| `reconciliation_unmatched` | Matcharen lämnade en banktransaktion utan match och öppnade ett undantag. | `{ bank_transaction_id, exception_id, reason }` | C11 | ❌ |
| `reconciliation_reversed` | En match backas. | `{ match_id, reason }` | C11 | ❌ |

**Ledger (bokföring) och shadow**

| Event | Triggas när | Primär payload | Paket | Finns |
|-------|-------------|----------------|-------|-------|
| `journal_entry_posted` | En verifikation är atomärt bokförd med balanserade rader. Verifikationsnumret tilldelas i samma transaktion (blueprint §36.1). | `{ journal_entry_id, journal_type, voucher_series, voucher_number, effective_date, period_id, rule_id, rule_version, source_event_id }` | C8 | ❌ |
| `journal_entry_reversed` | En verifikation vänds med en ny verifikation. Bokförd historik ändras aldrig på plats. | `{ journal_entry_id, reversal_entry_id, reason }` | C8 | ❌ |
| `period_locked` | En räkenskapsperiod låses för bokföring. | `{ period_id, fiscal_year_id, locked_by }` | C8 | ❌ |
| `period_unlocked` | En låst period öppnas igen (privilegierad, alltid auditerad). | `{ period_id, fiscal_year_id, unlocked_by, reason }` | C8 | ❌ |
| `payment_divergence_detected` | Shadow-jämförelsen ser att kernelns betalningstillstånd skiljer sig från referensen. `phase` är obligatorisk: en S1-grön period är inte bevis (blueprint §20.1). | `{ divergence_id, comparison_run_id, phase†: 'S1'\|'S2', invoice_id?, payment_id?, severity }` | C6 | ❌ |
| `accounting_divergence_detected` | Shadow-jämförelsen ser att bokförings- eller aggregatstillstånd skiljer sig från referensen. | `{ divergence_id, comparison_run_id, phase†: 'S1'\|'S2', level: 1\|2\|3\|4, severity }` | C12 | ❌ |

**Leverantör / AP**

| Event | Triggas när | Primär payload | Paket | Finns |
|-------|-------------|----------------|-------|-------|
| `supplier_invoice_approved` | En leverantörsfaktura är attesterad och blir en skuld. | `{ supplier_invoice_id, supplier_id, currency, amount_minor, vat_regime†, due_date }` | C9 | ❌ |
| `payable_created` | Skuldposten skapas. | `{ payable_id, supplier_invoice_id, currency, amount_minor, due_date }` | C9 | ❌ |
| `supplier_payment_settled` | En utgående betalning till leverantör är genomförd. Är ett `payment_settled` med `direction: 'outbound'` i Pay; detta event är projektionen mot skulden. | `{ payment_id, supplier_invoice_id, currency, amount_minor, settled_at }` | C9 / C11 | ❌ |
| `payable_settled` | Skuldposten är fullt betald. | `{ payable_id, supplier_invoice_id, settled_at }` | C9 | ❌ |

**Reserverade namn — inte kanoniska.** Får inte förekomma i kod förrän de flyttats upp i en
tabell ovan i samma PR som inför dem: `opening_balance_posted`, `cutover_recorded`,
`vat_return_prepared`, `receivable_written_off`, `shadow_phase_flipped`. De finns här bara så att
nästa paket inte hittar på ett annat namn för samma sak.

### FK.2 Kuvert, nycklar och tid

Tabellen heter `financial_events` (införs i Paket C2, inte tidigare). Alla event delar kuvertet
i blueprint §7. Bindande fältregler:

| Fält | Regel |
|------|-------|
| `schema_version` | Heltal per `event_type`, startar på `1`. Höjs bara när payloadens form ändras bakåtinkompatibelt; konsumenter måste kunna läsa alla versioner som finns i tabellen. |
| `business_id` | Från autentiserad session eller betrodd mappning (webhook → `provider_ref` → business). Aldrig från klientpayload. |
| `idempotency_key` | `UNIQUE (business_id, idempotency_key)`. Format `<domän>:<källa>:<id>[:<diskriminator>]`, t.ex. `provider_event:stripe:evt_123`, `allocation:pay_1:rec_2:12500`, `fortnox_import:<biz>:<doc>:<version>`. Samma nyckel fem gånger = ett event. |
| `correlation_id` | En per ekonomisk kedja: `fin_invoice_<invoice_id>`, `fin_supplier_invoice_<id>`, `fin_payment_<payment_id>` (betalning utan faktura), `fin_bank_<bank_transaction_id>`, `fin_journal_<journal_entry_id>` (manuell verifikation). Rotobjektet bestämmer prefixet. |
| `causation_id` | `event_id` för eventet som orsakade detta. `NULL` bara för rotevent i kedjan. |
| `occurred_at` | När det hände i källsystemet. `effective_date` är bokföringsdatum enligt landspaketet. `created_at` är när Handymate persisterade raden. De tre är aldrig samma fält (blueprint §26). |
| `actor` | `system \| user \| provider \| import \| agent`. En agent som skapar ett ekonomiskt event är `agent` med `actor_id` = agentens id, aldrig `system`. |
| `amount` / `currency` | Speglar payloadens huvudbelopp för index/sök. Källan är payloaden. |

Atomära skrivningar går via Postgres-RPC, aldrig via flera klientanrop (blueprint §6):
`record_payment_settlement`, `allocate_payment`, `post_journal_entry`, `record_provider_event`.
Varje RPC validerar tenant + tillstånd, skriver objektet, skriver eventet/outboxraden och
returnerar resultatet i **en** transaktion. Namnen är reserverade här så att paketen C2–C8 inte
döper dem olika.

### FK.3 Bryggan till automationsmotorn — bindande

`payment_received` (§4) behåller sin nuvarande betydelse: *kunden har gjort sitt*. Bryggan
`lib/financial-kernel/events/bridge-automation.ts` är det **enda** stället i kernel-kod som får
anropa `fireEvent()`, och den får bara skicka namn ur tabellen i §4.

```text
receivable_settled { component: 'customer' }   → fireEvent('payment_received')   ✅
receivable_settled { component: 'tax_authority' } → ingenting                     ✅ (inget andra tack-SMS när Skatteverket betalar)
payment_settled                                  → ingenting                     ✅ (pengar ≠ kunden klar; allokering avgör)
```

Detta är blueprint §18.5 och golden path 34, inte en försiktighetsnot. Legacy-övergångarna
`to_paid` och `to_customer_paid` i `payment-decision.ts` motsvarar exakt "kundkomponenten
settlad"; `settled` motsvarar "skattekomponenten settlad" och avfyrar inget.

C5b: bryggan producerar bara durabla intents, aldrig utskick. Fasad och cron delar
`effects/sweep.ts` för claim → run → finish. Ett betalningskommando som avslutade
kundfordran äger hela uppföljningsbeslutet, även bortval utan intent-rad. Historiska
settlement-event för återöppnade fordringar kvitteras utan nya intents. Bryggans
belopp bygger på aktiva allokeringar till fakturan, även utan fakturans correlation-id.
Okända och uttömda utskick kräver superadminbeslut med skäl; ingen automatisk retry.

### FK.4 Feature-flaggor och daterad fas — per företag

Alla flaggor är `BOOLEAN NOT NULL DEFAULT false`. Default = dagens beteende, alltid. Ingen
flagga införs före paketet som läser den.

| Kolumn | Betyder | Läses av | Införs i |
|--------|---------|----------|----------|
| `financial_kernel_enabled` | Kernel skriver `financial_events` och fordrans-/allokeringsobjekt för företaget. Infrastruktur, inte en produkt. | C4, C5 | C4 |
| `financial_kernel_rollout` (historik) | Senaste daterade fasen är `off`, `S1` eller reserverad `S2`. Ersätter de tidigare föreslagna kolumnerna `shadow_payments_enabled`/`shadow_payment_phase`. Endast `set_financial_kernel_phase` skriver dispatchflaggan; aktör och skäl krävs. S1 bevisar synken, inte oberoende ekonomisk korrekthet. S2 nekas tills separat beslut. | C6, C12 | C6 |
| `handymate_pay_enabled` | Kunden kan ta betalt via Handymate Pay. Produkträttighet. | C7 | C7 |
| `handymate_ledger_enabled` | Kunden ser bokföring/Ledger-ytor. Produkträttighet — grindar UI, aldrig kernelns korrekthet (blueprint §35.5). | C10 | C10 |
| `shadow_accounting_enabled` | Ledger körs i skuggan mot Fortnox-referens. | C12 | C12 |
| `auto_post_accounting_enabled` | Deterministiska bokföringsregler får bokföra utan mänskligt godkännande inom policy. | C8, C9 | C9 |
| `bank_reconciliation_enabled` | Bank-/avstämningsytor synliga för kunden. Produkträttighet. | C11 | C11 |
| `auto_reconcile_enabled` | Matcharen får bekräfta matchningar inom policy utan granskning. | C11 | C11 |

**Skuggningens räckvidd (beslut 2026-09-12, shadow-arkitekturen §21.6):** Fortnox-scopen
(`FORTNOX_SCOPES` i `app/api/integrations/fortnox/connect/route.ts`) saknar `bookkeeping`, så
jämförelsen når bara **nivå 1** (faktura, leverantörsfaktura, betalning, saldon). Nivå 2–4 i
`accounting_divergence_detected.level` persisteras som `unsupported` med orsak, aldrig som
gröna. Scopen läggs inte tillbaka (kräver ny OAuth per kund). Momsen och verifikatnivån får
därför sitt facit från den manuella regelboksrundan (roadmap §21.2), inte från skuggningen.

Utrullningsordning per företag (aldrig big bang):
`legacy → kernel shadow (S1) → S2 → kernel kanonisk + legacy-projektion → Pay live → Ledger shadow → Ledger kanonisk med Fortnox-skugga → Handymate-only`.

### FK.5 Modulägande

Mappar och vem som äger dem. En primitiv har en implementationsägare (Codex) och flera
granskare (Claude). Två agenter bygger aldrig konkurrerande versioner av samma primitiv.

| Mapp | Innehåll | Får aldrig |
|------|----------|------------|
| `lib/financial-kernel/` | `money.ts`, `events/` (catalog, types, publish, consume, outbox, bridge-automation), `receivables/`, `allocations/`, `audit/`, `integrity/` | importera från `lib/payments/providers/*` eller `lib/ledger/country-packs/*` |
| `lib/payments/` | tjänst, tillståndsmaskin, intents, refunds, payouts, `providers/<provider>/adapter.ts` | skriva till journaler; läcka leverantörsspecifik status utanför `providers/` |
| `lib/ledger/` | posting engine, journals, periods, reports, reversals, `country-packs/se/` | läsa leverantörsobjekt direkt; ha en toleranskonstant |
| `lib/reconciliation/` | service, matcher, projections | ändra betalnings- eller fordranstillstånd utan att gå via kernelns RPC |
| `app/api/payments/`, `app/api/accounting/`, `app/api/reconciliation/`, `app/api/webhooks/payments/[provider]/` | HTTP-ytor | innehålla domänlogik |

Legacy-filer som blir fasad, inte ersätts: `lib/invoices/apply-payment.ts` (C5),
`lib/invoices/payment-decision.ts` (behålls oförändrad för icke-kernel-företag),
`lib/fortnox/sync-payments.ts` (blir referensadapter i S2).

### FK.6 Vad Paket C0 uttryckligen inte gjorde

Ingen tabell, ingen RPC, ingen flagga, ingen Money-klass, inget beteende. Nästa paket är C1
(Money) — se `docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md` för Codex-briefen.

## Fortnox inkommande fakturasynk (2026-09-14)

`syncInvoicesFromFortnox` används av Synka nu, Hämta historik och cron. Importtjänsten läser fakturadetaljer, uppdaterar endast Fortnox-ägda ekonomifält och bevarar lokala jobbkopplingar, interna anteckningar och påminnelsehistorik. Befintliga betalningsövergångar fortsätter via applyInvoicePayment. Oavslutade utgående överföringar blockeras för avstämning i stället för att importeras som dubbletter. Utkast blir inte förfallna/betalda bara på saldo 0.

OAuth förnyas inom fem minuter före utgång, med ett databaslås per företag. Företagsnamnet uppdateras separat från tokenparet; CompanyInformation läses från Fortnox-svaret. `20260914072732_fortnox_sync_locks.sql` krävs före driftsättning; tillför service-only lås och unikt företag/dokumentnummer. Migrationen är ännu INTE körd i produktion (automatisk godkännandegranskning stoppade den).

Avgränsning: SEK-standardfakturor. Kredit-/kontantfakturor, annan valuta och återöppnad/makulerad redan betald faktura ger ett synligt avstämningsfel; ingen tyst omskrivning av betalningshistorik. Hämtningen omfattar senaste året, alla öppna och alla redan lokalt kopplade dokument. Sidtak/tidsgräns ger fel, aldrig falskt komplett synk. Kundimport finns fortsatt som Hämta historik; nya fakturor utan lokalt kundnummer importeras okopplade. Full liveacceptans återstår efter migration, deploy och återanslutning.

### Customer Value V1 — arbetsbevis, separata från Financial Kernel

`value_events` är append-only med tenant-isolerad medlemsläsning och service-role-RPC-skrivning.
V1 tillåter `opportunity_identified`, `opportunity_acted`, `opportunity_dismissed`,
`time_measured` och `time_estimated`. Kernelns pengastadier får inte skrivas av V1.
Kortens skapande/beslut och automationsloggens lyckade resultat fångas av SQL-triggers
som anropar samma producenter/RPC i källskrivningens transaktion. Inga utskick sker där.
Identifierad kortuppskattning fryses; belopp serialiseras som öressträngar, aldrig tidsvärde i kronor.
Godkänt (`opportunity_acted`) betyder ett fattat beslut, inte en bevisad leverans.
`time_measured` mäter ledtid för en direktlänkad kedja, **inte sparad arbetstid**.
Saknade tidsstämplar ger separat schablon med underlag; historiska syntetiska sent_at mäts inte.
Metod 3 läser kortkohort och beslut ur händelser. V1 behåller tenant-grindade uppslag för
levande fakturareferenser och fakturornas belopp; V2 övertar pengastadierna senare.
`VALUE_EVENTS_ENABLED` är server-only och av som standard; ägare/admin kan jämföra
`/api/value/ledger?method=2` och `?method=3` efter v241 + explicit historikinläsning.

## Kundvärde V2/V3 och första jobbet (2026-09-14)

Byggs enligt Andreas uttryckliga beställning före pilot, med separata aktiveringsgrindar. Acceptans och avvikelser: `../docs/strategy/CUSTOMER_JOURNEY_V2_V3_ACCEPTANCE.md`.

- **V2 konsumerar, producerar inga finansiella kommandon.** C3-konsumenten `value-ledger` använder `record_value_money_event(business_id,event_id)` (v243). Den skriver enbart till `value_events`. Där betyder `invoice_issued` utfärdat belopp och `payment_received` en historisk kundavräkningskontrollpunkt. Dessa är värdeloggens namn, inte nya namn i FK.1 eller anrop till automationsmotorns likalydande event.
- `money_state_observed` är en append-only observation av fakturans aktuella nettobelopp och kundallokeringar, med kanoniskt event-id och finansiell sekvens. `customer_settled` är ett booleskt fält i observationens JSON, inget eventnamn. Läsaren tar senaste observation per faktura; den summerar aldrig kumulativa kontrollpunkter. Krediter och återföringar observeras genom befintliga fordrans-/allokeringshändelser. Nya ännu omappade refund/dispute/invoice-credit-händelser haltar läsningen tills en granskat mappning finns.
- `VALUE_KERNEL_EVENTS_ENABLED` styr konsumtion och byte av pengakälla för kernel-aktiverade företag. Andra företag behåller fakturaprojektionen. En aktiverad läsare vägrar inaktuellt, haltat eller saknat underlag. V3 kräver dessutom `VALUE_IMPACT_ENABLED`, `VALUE_EVENTS_ENABLED` och företagets kernel-flagga. Webb och native använder samma `/api/dashboard/impact`, utan lokal beloppshärledning.
- `first_work` (v244) lagrar en företagsbunden länk till första offerten och serverstämplad start/förberedelse/första registrerade utskick. Ingen ny kundtext kopieras. `FIRST_WORK_ENABLED` aktiverar flödet. Databasens unika länk hindrar dubbla offerter efter återförsök. Raderad offert rensar länken och utskickstiden. Förfluten tid inkluderar pauser och påstås inte vara sparad arbetstid eller bevis på mottagen kommunikation.
- Nästa steg och bevakningsstatus återanvänder offertens befintliga handoff-kontrakt. Inga behörigheter att skicka eller följa upp utökas av denna leverans.
