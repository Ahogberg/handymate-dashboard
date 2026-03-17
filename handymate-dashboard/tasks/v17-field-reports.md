# V17 — Kundsignering av fältrapporter

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL (`sql/v17_field_reports.sql`)
- `field_reports` — fältrapporter med signature_token, status (draft/sent/signed/rejected)
- `field_report_photos` — foton kopplade till rapporter
- Auto-genererade rapport-nummer (FR-2026-001)
- RLS + index

### Del 2 — Fältrapporter i projektvyn
- Ny flik "Fältrapporter" i `app/dashboard/projects/[id]/page.tsx`
- Lista med statusbadges (Signerad/Skickad/Invändning/Utkast)
- "Kopiera länk"-knapp för signeringslänk
- Modal: rubrik, utfört arbete, material → skapa och skicka

### Del 3 — Publik signeringssida (`app/sign/report/[token]/page.tsx`)
- Ingen inloggning krävs
- Visar: företagsinfo, rubrik, utfört arbete, material, foton, F-skatt-badge
- Signeringsformulär: namn + valfri kommentar
- "Jag godkänner arbetet" eller "Jag har invändningar"
- Redan-signerad/invändning-skickad bekräftelsesidor

### Del 4 — API Routes
- `GET/POST /api/field-reports` — lista/skapa (authed)
- `GET /api/field-reports/public?token=X` — hämta via token (publik)
- `POST /api/field-reports/[id]/sign` — signera/avvisa via token (publik)
  - Vid signering: SMS till hantverkare + push-notis + pending_approval "Skapa faktura?"
  - Vid avvisning: SMS till hantverkare med kundens kommentar

### Del 5 — Godkännanden
- `create_invoice_from_report` tillagd i TYPE_CONFIG
- Skapas automatiskt vid signering → "Skapa faktura?"

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
- [x] `/sign/report/[token]` syns som dynamisk route

## Filer
- `sql/v17_field_reports.sql` (ny)
- `app/api/field-reports/route.ts` (ny)
- `app/api/field-reports/public/route.ts` (ny)
- `app/api/field-reports/[id]/sign/route.ts` (ny)
- `app/sign/report/[token]/page.tsx` (ny)
- `app/dashboard/projects/[id]/page.tsx` (ändrad — field_reports tab)
- `app/dashboard/approvals/page.tsx` (ändrad — create_invoice_from_report typ)
