# V14 — Partnerportal-förbättringar

## Status: ✅ Klar

## Vad som byggts

### Del 1 — SQL Migration (`sql/v14_partners.sql`)
- `webhook_url`, `webhook_secret`, `api_key` på `partners`-tabellen
- `total_referred`, `total_converted` kolumner
- `webhook_events` JSONB för att välja vilka events som triggar webhook
- Ny `partner_events`-tabell med tidslinje-events (referral_clicked, trial_started, converted, plan_upgraded, churned, etc.)
- Index + RLS-policies

### Del 2 — Dashboard (`app/partners/dashboard/page.tsx`)
- Komplett ombyggd dashboard med:
  - 4 stat-kort: Hänvisade företag, Aktiva kunder, Intjänat totalt, Nästa utbetalning
  - Referrallänk med Kopiera + Dela-knappar
  - API-nyckel med visa/dölj (ögon-ikon) + kopiera
  - Lista över hänvisade företag med statusbadges (Trial/Aktiv/Avslutad/Klar)
  - Provision per företag: X kr/mån × Y mån = Z kr
  - Expanderbar tidslinje per företag
  - Webhook-inställningar med konfigurera-knapp
  - Dela-modal (e-post, WhatsApp, SMS, kopiera)

### Del 3 — API-nyckel & referral-länk
- API-nyckel visas/döljs med Eye/EyeOff ikoner
- Kopiera till clipboard med feedback
- Referral-URL genereras från partner.referral_code

### Del 4 — Konverteringsstatistik
- Dashboard API (`app/api/partners/dashboard/route.ts`) returnerar:
  - `total_earned` per referral (monthly_commission × months)
  - `next_payout_sek` (summa av aktiva månatliga provisioner)
  - `events` och `events_by_business` för tidslinje
  - `subscription_status` per referral

### Del 5 — Webhook-konfiguration
- Modal med URL-fält, eventval (checkboxes), secret, Testa/Spara-knappar
- API: `PUT /api/partners/webhook` (spara), `POST /api/partners/webhook` (test)
- Validerar URL-format
- Test-webhook skickar payload med HMAC-signatur

### Del 6 — Webhook-notifikation vid konvertering
- `lib/partners/webhook.ts` — `notifyPartnerWebhook(businessId, eventType)`
  - Hittar partner via `referred_by` i `business_config`
  - Loggar event i `partner_events`
  - Signerar payload med HMAC-SHA256
  - Skickar POST med `X-Handymate-Signature` header
- Integrerat i:
  - `app/api/auth/route.ts` → `trial_started`
  - `app/api/billing/webhook/route.ts` → `converted` (checkout completed)
  - `app/api/billing/webhook/route.ts` → `churned` (subscription deleted)

### Del 7 — Per-lead tidslinje
- Expanderbar per hänvisat företag med:
  - Registreringsdatum
  - Trial-start
  - Konverteringsdatum + plan
  - Provision startade
  - X månader aktiva — Y kr intjänat
  - Dynamiska events från `partner_events`-tabellen
  - Status-meddelanden vid churn/klar

## Bonus: Fixat build-fel
- Pre-existing route conflict: `app/api/portal/[code]` vs `[token]`
- Flyttat lead source portal API till `app/api/lead-portal/[code]`
- Uppdaterat `app/lead-portal/[code]/page.tsx` att använda ny API-path

## Verifiering
- [x] `npx tsc --noEmit` — 0 fel
- [x] `npx next build` — ren build
- [x] Alla nya filer kompilerar korrekt

## Filer som ändrats/skapats
- `sql/v14_partners.sql` (ny)
- `app/partners/dashboard/page.tsx` (omskriven)
- `app/api/partners/dashboard/route.ts` (omskriven)
- `app/api/partners/webhook/route.ts` (ny)
- `lib/partners/webhook.ts` (ny)
- `app/api/auth/route.ts` (webhook-notis tillagd)
- `app/api/billing/webhook/route.ts` (webhook-notis tillagd)
- `app/api/lead-portal/[code]/route.ts` (flyttad från api/portal/[code])
- `app/lead-portal/[code]/page.tsx` (API-path uppdaterad)
