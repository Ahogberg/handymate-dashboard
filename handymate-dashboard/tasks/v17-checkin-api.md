# V17 — GPS Check-in + Attestering

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL (`sql/v17_checkin.sql`)
- `time_checkins` — GPS-incheckning per anställd
  - lat/lng in + ut, duration_minutes, status (active/completed/approved/rejected)
  - Index på business_id, user_id, status, checked_in_at
  - RLS: service_role + auth.uid()

### Del 2 — API Routes
- **`POST /api/checkin`** — Checka in med GPS + projekt (blockerar dubbletter)
- **`GET /api/checkin`** — Hämta aktiv incheckning
- **`POST /api/checkin/checkout`** — Checka ut → beräkna duration → skapa pending_approval
- **`POST /api/checkin/approve`** — Attestera/avvisa → skapar time_entry vid godkännande

### Del 3 — Godkännanden
- `time_attestation` tillagd i TYPE_CONFIG (sky-blå tema)
- Specialkort: användarinitialer, in/ut-tider, duration, GPS-badge, projekt
- `executeApprovalPayload`: skapar `time_entry` automatiskt vid godkännande

### Del 4 — Attesterings-översikt (`app/dashboard/time/attestation/page.tsx`)
- Veckovis vy med navigering (föregående/nästa vecka)
- Sektioner: Oattesterade, Attesterade, Avvisade
- "Attestera alla"-knapp för batch-godkännande
- Per rad: användaravatar, datum, duration, projekt, GPS-ikon
- Sidebar-länk under Planering → Attestering

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build

## Filer
- `sql/v17_checkin.sql` (ny)
- `app/api/checkin/route.ts` (ny)
- `app/api/checkin/checkout/route.ts` (ny)
- `app/api/checkin/approve/route.ts` (ny)
- `app/dashboard/time/attestation/page.tsx` (ny)
- `app/dashboard/approvals/page.tsx` (ändrad — time_attestation typ + rendering)
- `app/api/approvals/[id]/route.ts` (ändrad — time_attestation execution)
- `components/Sidebar.tsx` (ändrad — Attestering-länk)
