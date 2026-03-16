# V15 — Zero-Touch Deal-to-Delivery Autopilot

## Status: Klar (build OK, tsc OK)

## Vad som byggdes

### Koncept
När en kund accepterar en offert → AI:n förbereder ett paket (projekt, bokning, SMS, material) → allt visas i Godkännanden → hantverkaren godkänner med ett tryck.

### Nya filer
- [x] `sql/v15_autopilot.sql` — Migration (kör manuellt)
- [x] `lib/autopilot/trigger.ts` — Huvudtrigger, skapar approval-paket
- [x] `lib/autopilot/find-slot.ts` — Hittar nästa lediga bokningsslot
- [x] `lib/autopilot/generate-sms.ts` — Genererar kund-SMS via Claude Haiku

### Ändrade filer
- [x] `lib/feature-gates.ts` — Ny gate `deal_autopilot` (professional+)
- [x] `app/api/approvals/[id]/route.ts` — Nytt case `autopilot_package` i executeApprovalPayload
- [x] `app/dashboard/approvals/page.tsx` — Autopilot-kortet med expand/collapse, individuell granskning
- [x] `app/dashboard/settings/page.tsx` — Autopilot-flik under Drift med toggles
- [x] `app/api/quotes/accept/route.ts` — Hook triggerAutopilot (non-blocking)
- [x] `app/api/quotes/public/[token]/route.ts` — Hook triggerAutopilot (non-blocking)

## Flöde

1. Kund signerar offert (publik eller intern accept)
2. `triggerAutopilot()` anropas non-blocking
3. Kollar `autopilot_enabled` + feature gate
4. Hämtar/skapar projekt, hittar ledig tid, genererar SMS, extraherar material
5. Skapar EN `pending_approvals` rad med `approval_type: 'autopilot_package'`
6. Push-notis till mobilappen
7. Hantverkaren ser paketet i Godkännanden
8. "Godkänn allt" eller "Granska" för individuell hantering
9. Vid godkännande: bokning skapas, SMS skickas, material läggs i projekt

## Inställningar (under Drift → Autopilot)
- Master-toggle: Autopilot på/av
- Föreslå bokning (buffertdagar, jobblängd)
- Förbered kund-SMS
- Generera materiallista

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
- **Kör sql/v15_autopilot.sql i Supabase innan test!**
