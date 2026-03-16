# V15 — Voice API Routes

## Status: ✅ Klar

## Vad som byggts

### POST /api/voice/process
Tar emot ljudfil → transkriberar → analyserar → returnerar actions.

**Flöde:**
1. Auth via `getAuthenticatedBusiness()`
2. Whisper transkribering (`whisper-1`, språk: `sv`)
3. Claude Haiku analys — identifierar actions med confidence-score
4. Filtrerar bort actions med confidence < 0.7
5. Returnerar `{ transcript, actions[] }`

**Action-typer:** time_report, work_log, material, invoice, quote, note, sms, calendar

### POST /api/voice/execute
Tar emot godkänd action → skapar i databasen.

**Stödjda actions:**
- `time_report` → `time_entry` (duration_minutes, work_date, customer lookup)
- `work_log` → `project_log` (work_performed, projekt via ilike-sökning)
- `material` → `project_log` (materials_used-fält)
- `invoice` → `quotes` (status: draft, för konvertering till faktura)
- `quote` → `quotes` (med total, vat_rate, valid_until)
- `note` → `project_log` (work_performed + description)
- `sms` → 46elks API (hitta kund → skicka SMS)
- `calendar` → Google Calendar (createGoogleEvent)

**Hjälpfunktion:** `findOrCreateCustomer()` — söker med ilike, skapar ny om ej hittad

## Anpassningar från spec
- Tabellen heter `customer` (singular), PK `customer_id`, telefon `phone_number`
- `time_entry` med `time_entry_id`, `duration_minutes` (inte hours), `work_date`
- `project` med `project_id` (inte `id`)
- `project_log` med `order_id` (FK till projekt), `work_performed` (inte `entry`)
- `quotes` med `quote_id` (inte auto-PK)
- Ingen `notes`-tabell — använder `project_log` istället
- SMS via 46elks (inte abstrakt `sendSMS`)
- Calendar via `createGoogleEvent()` från `lib/google-calendar.ts`

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `app/api/voice/process/route.ts` (ny)
- `app/api/voice/execute/route.ts` (ny)
