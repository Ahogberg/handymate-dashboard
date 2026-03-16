# V16 — Swish-betalknapp i fakturor

## Status: ✅ Klar

## Vad som byggts

### Del 1 — Swish i faktura-mailet
**Två platser uppdaterade:**

1. **`lib/email-templates.ts` → `invoiceEmail()`** — nya parametrar `swishNumber`, `bankgiro`, `totalAmountNum`
   - Lila Swish-sektion med deeplink-knapp om `swishNumber` är satt
   - Proper JSON deeplink format: `swish://payment?data=...`
   - Visar Swish-nummer + fakturanummer som märkning

2. **`app/api/invoices/send/route.ts`** — inline email-HTML
   - Hämtar `swish_number` från `businessConfig`
   - Renderar Swish-sektion bara om `swish_number` finns
   - Deeplink med korrekt JSON-format

### Del 2 — QR-kod + deeplink i kundportalen
- **Fixad deeplink** — från felaktigt `swish://payment?payee=...` till korrekt `swish://payment?data={JSON}`
- **SwishQRImage-komponent** — hämtar QR via `/api/swish-qr` och visar som `<img>`
- **Lila Swish-sektion** i faktura-detaljvyn med:
  - QR-kod att skanna (desktop)
  - Swish-nummer + fakturanummer
  - Belopp i stort
  - "Öppna Swish"-knapp (deeplink, mobil)

### Del 3 — SwishQR API Route
- `GET /api/swish-qr?number=X&amount=Y&message=Z`
- Publik route (ingen auth) — används i portal
- Använder befintlig `lib/swish-qr.ts` → `generateSwishQR()`
- Returnerar base64 data URL

### Existerande funktionalitet (orörd)
- `lib/swish-qr.ts` — QR-generering (redan implementerad)
- Inställningar → Faktura → Swish-nummer (redan finns)
- "Markera som betald" med Swish-val (redan i faktura-detaljvy)
- `business_config.swish_number` (redan i DB)
- PDF-faktura med Swish QR (redan i `lib/pdf-generator.ts`)

### Villkorlig rendering
Swish-sektionen renderas **BARA** om `business.swish_number` är satt:
- I email: `${businessConfig?.swish_number ? '...' : ''}`
- I portal: `{paymentInfo.swish && (...)}`
- Ingen fallback, ingen platshållare

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
- [x] Ingen Stripe-kod rörd

## Filer
- `lib/email-templates.ts` (ändrad — Swish-sektion i invoiceEmail)
- `app/api/invoices/send/route.ts` (ändrad — Swish i inline email-HTML)
- `app/portal/[token]/page.tsx` (ändrad — QR + fixad deeplink + SwishQRImage)
- `app/api/swish-qr/route.ts` (ny — publik QR-generator)
