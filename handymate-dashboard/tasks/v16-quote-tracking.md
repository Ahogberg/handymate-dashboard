# V16 — Live offert-tracking med nudge-automation

## Status: Klar (build OK, tsc OK)

## Vad som byggdes

### Koncept
Tracking-pixel i offert-mail + tidmätning på offert-sidan → visningsstatistik i offertlistan → AI-genererad nudge-SMS i Godkännanden vid 3+ visningar.

### Nya filer
- [x] `sql/v16_quote_tracking.sql` — `quote_tracking_events` tabell + sammanfattningskolumner på `quotes`
- [x] `app/api/quotes/track/route.ts` — GET (pixel) + POST (beacon) tracking endpoint
- [x] `lib/autopilot/quote-nudge.ts` — Skapar nudge-approval med AI-genererad SMS

### Ändrade filer
- [x] `app/api/quotes/send/route.ts` — Tracking-pixel injiceras i mail-HTML + session-ID i signerings-URL
- [x] `app/quote/[token]/page.tsx` — View tracking useEffect (opened + closed med duration)
- [x] `app/dashboard/quotes/page.tsx` — Visar "Öppnad Xx", relativ tid, nudge-badge
- [x] `app/dashboard/approvals/page.tsx` — `quote_nudge` typ i TYPE_CONFIG
- [x] `app/api/approvals/[id]/route.ts` — `quote_nudge` faller igenom till `send_sms` execution

## Flöde

1. Offert skickas → mail innehåller 1x1 tracking pixel
2. Kund öppnar mail → pixel-request loggar `opened` event
3. Kund klickar på offert-länk → sidan loggar `opened` + mäter tid → `closed` vid stängning
4. `view_count`, `first_viewed_at`, `last_viewed_at`, `total_view_seconds` uppdateras
5. Vid 3+ visningar utan svar → `createQuoteNudge()` skapar approval
6. Hantverkaren ser nudge i Godkännanden med AI-genererad SMS-text
7. "Godkänn" → SMS skickas via 46elks

## Verifiering
- `npx tsc --noEmit` — 0 fel
- `npx next build` — ren build
- **Kör sql/v16_quote_tracking.sql i Supabase innan test!**
