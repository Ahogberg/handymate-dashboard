# ARCHITECTURE.md — Handymate Dashboard

> Senast uppdaterad: 2026-03-23

## Vad är Handymate?

Handymate är en **AI-driven back office-plattform för svenska hantverkare**. Plattformen automatiserar administration, kundkommunikation, offerter, fakturor och projektledning — så att hantverkaren kan fokusera på själva hantverksarbetet.

**Vision:** Fully autonomous AI admin back office. Hantverkaren behöver bara göra jobbet — resten sköter Handymate.

---

## Tech Stack

| Lager | Teknik |
|-------|--------|
| Frontend | Next.js 14 (App Router), React 18, TailwindCSS |
| Backend | Next.js API Routes (serverless) |
| Databas | Supabase PostgreSQL + Auth + Realtime + Storage |
| AI | Anthropic Claude (Haiku för klassificering, Sonnet för agenter) |
| Telefoni/SMS | 46elks |
| Betalningar | Stripe |
| E-post | Gmail API + Resend (fallback) |
| Kalender | Google Calendar API |
| Bokföring | Fortnox API |
| Deploy | Vercel (app.handymate.se) |

---

## Autonomi-features (kärnan)

### 1. Auto-Approval Learning (`lib/auto-approve-learning.ts`)

Agenten lär sig från hantverkarens godkännandehistorik. Om samma typ av åtgärd alltid godkänns utan ändringar → systemet börjar auto-godkänna.

- Analyserar `pending_approvals` senaste 6 månader per approval_type
- 5+ godkännanden med 90%+ no-edit rate → +20 confidence boost
- 10+ med 95%+ → +30 boost
- 3+ avvisningar i rad → -50 boost (sänker confidence)
- **Aldrig auto-boost:** offerter, fakturor, paket (alltid manuell granskning)
- API: `GET /api/auto-approve/patterns`

### 2. E2E Deal Flow Engine (`lib/e2e-deal-flow.ts`)

Hela affärslivscykeln från lead till betalning — automatiskt.

```
Lead in → Kvalificering → Platsbesök → Offert → Signering → Projekt → Faktura → Betalning → Recension
```

11 steg med risknivåer:
| Steg | Auto | Risk |
|------|------|------|
| Lead kvalificerad | ✅ | Låg |
| Platsbesök föreslagen | ❌ | Medium |
| Offert genererad (AI) | ✅ | Låg |
| Offert skickad | ❌ | Hög |
| Offert signerad | ✅ | Låg |
| Projekt skapat | ✅ | Låg |
| Arbete slutfört | ❌ | Låg |
| Faktura genererad | ✅ | Låg |
| Faktura skickad | ❌ | Hög |
| Betalning mottagen | ✅ | Låg |
| Recension begärd | ✅ | Låg |

- `onDealEvent()` hook anropas av orchestratorn vid relevanta events
- Auto-steg kör rekursivt (signering → projekt → faktura i en kedja)
- SQL: `deal_flow` + `deal_flow_log` tabeller
- API: `GET/POST /api/deals/[id]/flow`

### 3. Proaktiv Kundvård (`lib/proactive-care.ts`)

Kontaktar gamla kunder baserat på jobbtyp och tid sedan senaste jobb. Varje jobbtyp har sin naturliga uppföljningscykel.

| Jobbtyp | Uppföljning | Anledning |
|---------|-------------|-----------|
| Badrum | 24 mån | Fog- och tätskiktskontroll |
| Elinstallation | 36 mån | Elbesiktning rekommenderas |
| Laddbox | 12 mån | Årlig service |
| VVS | 18 mån | VVS-kontroll |
| Värmepump | 12 mån | Årlig service (garanti) |
| Tak | 36 mån | Takinspektion |
| Fasad | 60 mån | Fasadkontroll |
| Altan | 24 mån | Oljning/behandling |
| Målning | 36 mån | Ommålning |
| Default | 18 mån | Generell uppföljning |

- Keyword-matchning mot projektnamn/beskrivning
- AI-genererade SMS via Claude Haiku
- Max 3 kontakter/dag/företag, 60 dagars dedup
- Körs dagligen via cron
- Skapar `pending_approval` med typ `proactive_care`

---

## Agent-system

### Orchestrator (`lib/agent/orchestrator.ts`)

Zero-LLM klassificering → rätt agent:

| Agent | Events |
|-------|--------|
| **Lead-agent** | lead_created, contacted, sms_received, call_missed, incoming_sms, pipeline_stage_changed |
| **Ekonomi-agent** | quote_created, quote_sent, quote_signed, invoice_created, invoice_overdue, payment_received |
| **Strategi-agent** | Eskalering från andra agenter, högvärdiga jobb (>50k) |

### 22 Agent-tools

**CRM:** get_customer, search_customers, create_customer, update_customer
**Operationer:** create_quote, get_quotes, create_invoice, check_calendar, create_booking, update_project, log_time, send_sms, send_email
**Pipeline:** qualify_lead, update_lead_status, get_lead, search_leads
**Kommunikation:** read_customer_emails
**Analytics:** get_daily_stats
**Godkännanden:** create_approval_request, check_pending_approvals
**Preferenser:** update_business_preference

### Risknivåer

| Risk | Beteende | Exempel |
|------|----------|---------|
| **low** | Auto-kör direkt | Skapa kund, logga aktivitet |
| **medium** | Auto-kör + logga | Boka tid, skicka påminnelse |
| **high** | Kräver godkännande + push-notis | Skicka offert, faktura, avboka |

---

## Pipeline & Säljtratt

### Vy-typer
- **Kanban** — klassisk drag-and-drop kolumnvy
- **Tidslinje** — 14-dagars horisontell vy med färgkodade staplar

### Ticket-kort
- **Ärende #XXXX** — sekventiellt deal-nummer (teal, tydligt)
- **Kund K-XXXX** — kundnummer med namn
- Prioritets-dot, AI-badge, lead-källa, temperatur-indikator
- Snabbknappar: Ring, SMS, Adress (Google Maps)

### Stale lead-varning
- Grön: < 24h i steget
- Gul: 24-48h
- Röd: > 48h utan åtgärd

### Pipeline-automationer (i Automationsbiblioteket)
- Pipeline: Ny lead, Kontaktad, Offert skickad/öppnad, Fakturerad, Avslutad
- Notis: Offert öppnad
- Fortnox: Synka faktura

---

## Ekonomi & Analys

### Prisstruktur (`/dashboard/settings/pricing`)
Tre flikar: **Segment**, **Avtalsformer**, **Prislistor**

| Kundtyp | Avtalsform | Prislista |
|---------|------------|-----------|
| Privatperson | Fast pris | Standardpriser |
| BRF | Ramavtal | BRF-priser |
| Fastighetsbolag | Ramavtal | Fastighets-priser |
| Företag | Löpande ARB/MAT | Företagspriser |
| Försäkring | Löpande ARB/MAT | Försäkringspriser |

Kund → Segment → Prislista auto-föreslås. AI-offert injicerar kundens prislista i prompten.

### Fakturering
- Generera faktura från projekt (arbetstid + material + övrigt)
- Swish-betalknapp i mail + kundportal (QR + deeplink)
- Manuell betalningsbekräftelse ("Markera betald via Swish")
- Fortnox-synk

### Feature gates per plan

| Feature | Bas (2 495 kr) | Pro (5 995 kr) | Enterprise (11 995 kr) |
|---------|---------------|----------------|----------------------|
| SMS/mån | 50 | 300 | 1 000 |
| Automationer | 3 aktiva | Alla 9+ | Obegränsat |
| AI-team | Bara Matte | Alla 5 | Alla 5 |
| Offertmallar | 3 | 10 | Obegränsat |
| Användare | 1 | 10 | Obegränsat |
| Leads add-on | Add-on | Add-on | Inkluderat |

### SMS-volymssspårning
- `sms_usage`-tabell med månatlig kvot
- Varning vid 80% + 100%
- Extra SMS debiteras per styck
- Upgrade-trigger vid gräns

---

## Automationer (`/dashboard/automations`)

### Bibliotek (6 kategorier)

**Leads & Nya kunder:** Svara på leads inom 30 min, kvalificera automatiskt
**Offerter:** Påminnelse dag 5, bekräftelsemail vid signering
**Fakturor & Betalning:** Påminnelse dag 1/7/14 efter förfall
**Kundrelationer:** Google-recension, reaktivering 6 mån, garantiuppföljning 12 mån
**Bokningar & Projekt:** Påminnelse 24h innan, semesternotis
**Pipeline & Säljtratt:** Auto-flytt vid skapande/kontakt/offert/faktura/betalning

### Historik-flik
Visar alla körda automationer med status och resultat.

---

## Integrationer

### 46elks (SMS + Telefoni)
- Inkommande/utgående SMS
- Vidarekoppling till hantverkarens mobil
- Webhook: `app.handymate.se/api/sms/incoming`
- Samtalshantering via Vapi

### Google (Kalender + Gmail)
- OAuth-flöde med refresh tokens
- Kalender: läs/skapa events, synka bokningar
- Gmail: skicka offert/faktura-mail, importera leads

### Fortnox (Bokföring)
- OAuth-flöde
- Synka: kunder, fakturor, artiklar
- Automatisk synk vid händelser

### Stripe (Betalning)
- Subscription management (Bas/Pro/Enterprise)
- Checkout sessions
- Webhook för plan-ändringar

---

## Sidstruktur

### Dashboard
- `/dashboard` — Översikt med KPI:er, aktivitetsfeed, insikter
- `/dashboard/pipeline` — Säljtratt (Kanban + Tidslinje)
- `/dashboard/customers` — Kundhantering med segment/prislista
- `/dashboard/quotes` — Offerter (AI-generering, ROT/RUT, signering)
- `/dashboard/invoices` — Fakturor (Swish, PDF, Fortnox)
- `/dashboard/projects/[id]` — Projekt (16 flikar, vertikal sidomeny)
- `/dashboard/bookings` — Bokningar
- `/dashboard/time` — Tidrapportering + attestering
- `/dashboard/agent` — Mitt team (5 AI-medarbetare)
- `/dashboard/approvals` — Godkännanden
- `/dashboard/marketing` — SMS-kampanjer + Leads
- `/dashboard/settings` — Inställningar (10+ sektioner)
- `/admin` — Superadmin (kundlista, plan-ändring, impersonering)

### Publika sidor
- `/portal/[token]` — Kundportal (projekt-tracker, fakturor, offerter)
- `/quote/[token]` — Offert-signering
- `/sign/report/[token]` — Fältrapport-signering
- `/site/[slug]` — Hantverkarens hemsida
- `/lead-portal/[code]` — Lead-portal

### Partner
- `/partners/dashboard` — Partnerportal (provision, webhook, API-nyckel)

---

## Cron-jobb

| Jobb | Schema | Vad det gör |
|------|--------|-------------|
| Agent Context | `0 5 * * *` (07:00 SE) | Morning report, LTV, warranty, proaktiv kundvård, pricing |
| Seasonality | `0 3 * * 1` (måndag) | Säsongskampanjer per bransch |

---

## Databas (160+ tabeller)

Huvudtabeller:
- `business_config` — Företagsinställningar, plan, integrationer
- `customers` — Kunder med segment, avtalsform, prislista
- `deals` — Pipeline-deals med deal_flow
- `quotes` / `quote_items` — Offerter
- `invoices` — Fakturor
- `projects` — Projekt med stages, foton, fältrapporter
- `time_entry` / `time_checkins` — Tidrapportering + GPS
- `pending_approvals` — Godkännanden (kärnan i approval-flödet)
- `v3_automation_rules` / `v3_automation_logs` — Automationer
- `agent_runs` / `agent_context` — Agent-körningar
- `sms_usage` — SMS-kvotspårning
- `deal_flow` / `deal_flow_log` — E2E deal flow tracking
- `seasonality_insights` / `seasonal_campaigns` — Säsongsdata

---

## AI-team (5 medarbetare)

| Namn | Roll | Beskrivning |
|------|------|-------------|
| **Matte** | Chefsassistent | Koordinerar teamet och pratar med hantverkaren |
| **Karin** | Ekonom | Håller koll på fakturor och betalningar |
| **Hanna** | Marknadschef | Sköter kampanjer och nya kunder |
| **Daniel** | Säljare | Följer upp offerter och leads |
| **Lars** | Projektledare | Koordinerar projekt och bokningar |

Avatarer: Supabase Storage (`team-avatars/`)
Bas-plan: Bara Matte. Pro+: Hela teamet.

---

## Säkerhet & Auth

- Auth per route via `getAuthenticatedBusiness()` (ingen middleware-blockering)
- Admin: `ADMIN_EMAILS` env var, impersonering med tidsbegränsad token
- RLS på alla tabeller (business_id-baserat)
- Supabase Service Role Key för admin/cron-operationer
