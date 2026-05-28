# Onboarding + Settings + Integrations Audit — 2026-05-18

**Syfte:** Faktabaserad inventering inför strategiskt beslut om vad som krävs för pilot-värde-leverans till Christoffer (Bee Service) och nästa pilot-kunder. Inget bygge i denna leverans — bara nulägesbild.

**Scope:** `C:\Users\Gaming\handymate-dashboard\handymate-dashboard` HEAD per 2026-05-18.

**Audit utförd via Explore-agent + kompletterad manuellt** där agentens kod-läsning lämnade oklara punkter.

---

## 1. Onboarding-flödet idag

### Struktur (V2 — Claude Design-redesign)

**6 steg**, lagras som `onboarding_step` 0-5 i `business_config`. Resume-logik: GET `/api/onboarding` returnerar nuvarande steg + JSONB `onboarding_data`, UI mappar till rätt Step-komponent.

| # | Komponent | Tvingande fält | Lagring |
|---|-----------|----------------|---------|
| 0 | `Step1MeetTheTeam.tsx` | — (intro, skip efter 1.2s) | — |
| 1 | `Step2Business.tsx` | `companyName`, `trade`, `orgNumber` (11 tecken), `area`, `paymentMethod`, `paymentNumber`, `contactName`, `email`, `password` (6+), `phone` (10+ siffror) | `business_config` + auth.users |
| 2 | `Step3HowYouWork.tsx` | `specialties` (≥1), `working_hours.days` (≥1 dag) + timpris | `business_config.specialties`, `working_hours`, `hourly_rate_*`, `default_hourly_rate` |
| 3 | `Step4PhoneNumber.tsx` | Inget tvingande — `/api/onboarding/phone/reserve` auto-fetchar från 46elks | `business_config.assigned_phone_number`, `phone_setup_type`, `elks_number_id` |
| 4 | `Step5Activate.tsx` | `plan` (starter/professional/business) | Stripe `stripe_subscription_id` + `billing_plan` |
| 5 | `Step6LiveTour.tsx` | — | `welcome_tour_seen=NOW()` + `onboarding_completed_at=NOW()` |

### Migrering (gamla kunder)
- `onboarding_step >= 8` (V1-system) → satt till `10` (completed)
- `onboarding_completed_at` redan satt → `welcome_tour_seen = NOW()` (skippar Step 6)

### TD-27 / Pre-flight-validering
**Inte hittat i koden** under denna audit. Kan vara: (a) refererat i commit-meddelande men inte separat fil, (b) inkorporerat i Step 2's `orgNumber`/`email`/`password`-validering, (c) felaktig referens. Värt att gräva separat om Andreas specifikt vill veta.

### Stripe-betalning blocker?
Oklart från koden om Step 4 (`Step5Activate.tsx`) tvingar betalning för att gå vidare, eller om "trialing"-state räcker. `billing_status='trialing'` finns i schema, vilket implicerar gratis-trial möjlig — men inte verifierat.

---

## 2. Settings-sidor

`/dashboard/settings` är hub som listar sub-sidor. Klassificering är min bedömning baserat på vilka data-fält som krävs för huvudflödet.

| Route | Syfte | Klass | Värt att notera |
|-------|-------|-------|-----------------|
| `/integrations` | Fortnox, Google Cal, Gmail, widget | **Kritisk** | Fortnox är dock fortsatt valfri |
| `/phone` | 46elks, vidarekoppling, recording | **Kritisk** | `forward_phone_number` ofta tomt → flödesrisk |
| `/knowledge` | Knowledge-base | **Kritisk** | Numera även tillgänglig som tab i `/website-widget` (commit 5df9bf1a) |
| `/website-widget` | Hemsida-chatbot — nu hub för Kunskap+Boundaries | **Kritisk för chatbot, annars Nice-to-have** | Gating-logik kräver knowledge+guardrails ifyllt för aktivering |
| `/billing` | Stripe, fakturor, påminnelser | **Kritisk** | |
| `/pricing` | Timpris, ROT/RUT, VAT | **Kritisk** | |
| `/pricelist` | Produkter + prisgrupper | Power-user | |
| `/inventory` | Lagersaldo | Power-user | |
| `/job-types` | Jobbtypologier | Power-user | |
| `/lead-sources` | Leadkällor + kanaler | Nice-to-have | |
| `/quote-templates`, `-style`, `-categories`, `-texts` | Offert-config | Power-user | Kundtyp-styrning av `quote_standard_texts` planerad men ej byggd ([tasks/todo.md](todo.md)) |
| `/email-templates` | E-postmallar | Power-user | |
| `/form-templates` | Formulär-builder | Power-user | |
| `/system-health` | Admin-debug | Admin-only | PermissionGate |
| `/my-prices` | Egen prislista | Power-user | |

Navigation går via [components/Sidebar.tsx](../components/Sidebar.tsx); ingen central settings-store — varje sida hämtar egen data.

---

## 3. business_config — kolumn-inventering

Gruppat per funktion. Listan är inte komplett men täcker de viktigaste fälten för huvudflödet.

### Identitet & grundläggande
`business_id` (PK, TEXT), `business_name`, `display_name`, `contact_name`, `contact_email`, `phone_number`, `org_number`, `address`, `industry`, `logo_url`

### Onboarding-state
`onboarding_step` (0-5+), `onboarding_data` (JSONB), `onboarding_completed_at`, `welcome_tour_seen`

### Affär & tjänster
`branch`, `service_area`, `services_offered[]`, `specialties` (JSONB), `default_hourly_rate`, `hourly_rate_min`, `hourly_rate_max`, `callout_fee`, `rot_enabled`, `rut_enabled`, `default_vat_rate`, `working_hours` (JSONB), `f_skatt_registered`

### Telefoni (46elks)
`assigned_phone_number`, `forward_phone_number`, `phone_setup_type` ('keep_existing' | 'new_number'), `elks_number_id`, `call_recording_enabled`, `call_recording_consent_message`, `call_mode` (oklart var sätts — se Sektion 5)

### Fortnox
`fortnox_access_token`, `fortnox_refresh_token`, `fortnox_token_expires_at`, `fortnox_connected_at`, `fortnox_company_name`, `fortnox_auto_sync_invoices`

### Kunskap & chatbot
`knowledge_base` (JSONB), `widget_enabled`, `widget_color`, `widget_position`, `widget_bot_name`, `widget_welcome_message`, `widget_max_estimate`, `widget_collect_contact`, `widget_book_time`, `widget_give_estimates`, `widget_ask_budget`, `widget_quick_questions` (JSONB), `widget_guardrails` (JSONB — added 2026-05-18 via [sql/v15_widget_guardrails.sql](../sql/v15_widget_guardrails.sql))

### Prissättning & ekonomi
`default_payment_method`, `default_payment_days`, `bankgiro`, `plusgiro`, `bank_account_number`, `swish_number`, `invoice_prefix`, `next_invoice_number`, `invoice_footer_text`, `penalty_interest`, `reminder_fee`, `max_auto_reminders`

### Autonomy
`auto_invoice_enabled`, `auto_invoice_send`, `auto_invoice_max_amount`

### Stripe & billing
`stripe_customer_id`, `stripe_subscription_id`, `billing_plan`, `billing_status`, `trial_ends_at`, `billing_period_start`, `billing_period_end`, `subscription_plan`, `subscription_status`, `leads_addon`

### GDPR
`deletion_requested_at`, `deletion_reason`, `privacy_accepted_at`, `data_retention_days`

### Misc
`is_pilot`, `created_by_admin`, `accent_color`, `greeting_script`, `google_review_url`, `google_place_id`, `review_request_enabled`, `review_request_delay_days`

Calendar/Gmail-state ligger i separat tabell `calendar_connection` (`calendar_id`, `gmail_sync_enabled`).

---

## 4. Integrations-status per integration

| Integration | Credentials lagras | Per-business state | Setup-UI |
|-------------|-------------------|---------------------|----------|
| **Fortnox** | `business_config.fortnox_*` (OAuth tokens per business) | `connected_at`, `company_name`, `auto_sync` | `/settings/integrations` → OAuth-redirect |
| **46elks SMS/Voice** | **Globalt** via env (`46ELKS_API_USERNAME/PASSWORD`) | `assigned_phone_number`, `phone_setup_type`, `elks_number_id` | Step 3 i onboarding + `/settings/phone` för forwarding-instruktion |
| **Resend (email)** | **Globalt** via env (RESEND_API_KEY) | Ingen per-business — from-adress troligen hårdkodad eller från business_name | (Ej hittad i settings-sidor) |
| **Voice (Lisa AI)** | Anropas via Anthropic-API (global key) | `greeting_script`, `call_mode` (?), `call_recording_*` | `/settings/phone` |
| **Push (Expo)** | **Globalt** — APNS-certifikat delas via EAS-build. Per-business `push_tokens`-tabell (skapad v13) | Token per device | Mobile-app, ej dashboard |
| **Google Calendar** | OAuth per business → `calendar_connection.calendar_id` | `gmail_sync_enabled` | `/settings/integrations` |
| **Gmail** | OAuth per business → `calendar_connection` (samma tabell?) | `gmail_sync_enabled` | `/settings/integrations` |
| **Stripe** | `business_config.stripe_*` (per-business customer + subscription) | `billing_status`, `trial_ends_at` | Onboarding Step 4 + `/settings/billing` |

**Mönster:** Allt som kostar pengar per call (Anthropic, Resend, 46elks, Expo APNS) använder **globala** credentials. Per-business credentials finns för: Fortnox (kundens egna bokföring), Google/Gmail (kundens egna konto), Stripe (kundens egna betalning).

---

## 5. Minimum för pilot-värde

**Huvudflöde:** Kund ringer → Lisa svarar → Bokning skapas → SMS-bekräftelse → Hantverkare utför → Faktura skickas.

### Onboarding samlar in (steg-för-steg):

| Sak | Vart? |
|-----|-------|
| Företagsnamn, org.nr, område | Step 1 ✅ |
| Email, lösenord, telefon | Step 1 ✅ |
| Betalningsuppgifter (bankgiro/swish) | Step 1 ✅ |
| Specialiteter, arbetstider, timpris | Step 2 ✅ |
| Assigned phone number (46elks) | Step 3 ✅ |
| Stripe-betalning/trial | Step 4 ✅ |

### Huvudflödet kräver också:

| Fält | Status | Risk |
|------|--------|------|
| `assigned_phone_number` | Samlas in Step 3 | OK |
| `working_hours` | Samlas in Step 2 | OK |
| `default_hourly_rate` | Samlas in Step 2 | OK |
| `forward_phone_number` | **Inte i onboarding** — `/settings/phone` | **Blocker om `phone_setup_type='keep_existing'`** — Lisa har ingen att vidarekoppla till |
| `call_mode` | **Inte i onboarding** — oklart var sätts | **Kritisk lucka** — utan detta vet inte Lisa när hon ska svara |
| `greeting_script` | Inte i onboarding — `/settings/phone`? | Default-prompt troligen finns |
| `knowledge_base` | **Inte i onboarding** — `/settings/knowledge` eller widget-tab | Chattbot funkar inte utan, men AI-telefoni kan funka ändå |
| `widget_guardrails` | **Inte i onboarding** | Bara blocker om widget ska aktiveras (gating krävs sedan 5df9bf1a) |
| `fortnox_*` | **Inte i onboarding** — valfritt | Inte blocker — fakturor kan skickas via Handymate utan Fortnox |
| `stripe_subscription_id` | Step 4 | OK (trial räcker) |

### Identifierade gaps mellan onboarding och produkt-värde

1. **`call_mode` är ett mysterium.** Kolumnen finns i schemat, men ingen onboarding-step sätter den och inget settings-UI-fält hittades. Antingen finns det en default i koden som ingen vet om, eller så är telefoni inte korrekt konfigurerat efter onboarding.

2. **`forward_phone_number` är frivilligt** men kritiskt om hantverkaren valde `phone_setup_type='keep_existing'`. Onboarding fångar inte detta scenario som tvingande.

3. **Knowledge-base krävs INTE av onboarding** men widget-aktivering kräver det nu (gating sedan 5df9bf1a). Om Christoffer vill ha chatbot direkt efter onboarding måste han efter-uppdatera.

4. **TD-27 / pre-flight** — ej hittat i koden. Bör verifieras separat.

5. **Stripe trial vs paid** — oklart om Step 4 tillåter "skip för trial" eller tvingar kort.

---

## 6. Strategiska observationer

### Den tysta lismande risken

`call_mode` finns i schemat men ingen UI/onboarding sätter det. Antingen är defaulten OK för pilotbruk eller så är telefoni-flödet halvbrutet utan att någon har märkt det. **Verifiera detta först innan nästa pilot-onboarding** — kanske den enklaste 30-minuters utredningen som ger störst påverkan.

### Onboarding är genomtänkt, men inte komplett för värde

Step 1-5 fångar minimalt för konto + faktura, men de "AI-värde"-skapande delarna (knowledge, guardrails, greeting_script, call_mode, forward_phone) är **post-onboarding-uppgifter** som kräver att hantverkaren själv hittar in i Settings. Den hub-leverans (5df9bf1a) hjälper för widget men inte för telefoni.

### Settings är fragmenterat

15+ settings-sidor utan central översikt över "vad behöver jag fortfarande göra för att vara redo?". En enkel "Setup-progress"-vy på dashboard som listar 5-7 kritiska saker (likt activation-checklist i widget-sidan) skulle ge stort UX-värde med lite kod.

### Föreslagna nästa steg (kort, prioriterat)

1. **Verifiera `call_mode`-mysteriet** — 30 min DB-query + kod-trace
2. **Lägg `forward_phone_number`-fråga i Step 3** för `phone_setup_type='keep_existing'`-fall
3. **Dashboard setup-progress-card** — generalisera widget-aktivering-checklistan till hela onboarding-completeness
4. **TD-27 follow-up** — vad är pre-flight-validering, finns det eller är det glömt?
5. **(Senare)** Knowledge + guardrails som onboarding-steg före tour, så pilot är redo att aktivera widget direkt

---

*Audit baserad på kod-läsning per 2026-05-18. Oklara punkter explicit markerade. Inga gissningar utgivna som fakta. Beslutsunderlag — inte specifikation.*
