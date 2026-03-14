# V8 — Referralprogram — Progress

## Status: Klar (väntar på SQL-migration)

## Vad som byggts

### SQL: sql/v8_referral.sql
- [x] Utökad referrals-tabell med partner-stöd (referrer_type, partner_name, commission)
- [x] Rabattspårning i v3_automation_settings (referral_discount_pending JSONB)
- [x] Reminder-spårning (referral_reminder_last_sent, referral_reminder_count)

### lib/referral/codes.ts
- [x] `generateReferralCode()` — format: BEE-4821 (3 bokstäver + 4 siffror)
- [x] `resolveReferralCode()` — hitta referrer business_id
- [x] `hasAnyReferralConverted()` — kolla om minst en referral konverterat

### lib/referral/discounts.ts
- [x] `applyNextInvoiceDiscount()` — sparar pending rabatt i v3_automation_settings
- [x] `getPendingDiscount()` / `clearPendingDiscount()` — hämta/rensa
- [x] `handleFirstPaymentReferral()` — full konverteringslogik med SMS + rabatt

### Registreringsflöde
- [x] `/registrera?ref=BEE-4821` → omdirigerar till onboarding med ref-param
- [x] `/signup?ref=BEE-4821` → samma
- [x] Step1BusinessAccount läser `ref` från URL och skickar till API
- [x] `/api/auth` (register) sparar `referred_by`, skapar referral-rad, genererar kod

### Stripe-webhook
- [x] `handleCheckoutCompleted()` kör `handleFirstPaymentReferral()`
- [x] Customer-referral: 50% rabatt + SMS
- [x] Partner-referral: 50% provision loggas

### Dashboard: /dashboard/referral
- [x] Unik länk med copy-knapp
- [x] Förifyllt SMS-meddelande
- [x] Statistik: hänvisade/aktiverade
- [x] Referral-lista med status
- [x] Pending rabatt-banner
- [x] "Så fungerar det"-sektion

### Sidebar
- [x] "Bjud in kollega" med Gift-ikon

### Morgonrapport
- [x] Månadsvis referral-påminnelse
- [x] Max 3 påminnelser om ingen konverterat
- [x] Obegränsat om positiv konvertering (förstärkning)
- [x] Påminnelsen läggs sist i meddelandet

### Partner-API
- [x] POST /api/partners/referral med Bearer-auth
- [x] PARTNER_API_KEY i .env.local.example

## Aktivering

1. Kör `sql/v8_referral.sql` i Supabase SQL Editor
2. (Valfritt) Sätt `PARTNER_API_KEY` i Vercel för leadsbyrå-integration
