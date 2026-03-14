# V7 Fortnox Deep Integration — Progress

## Status: Klar (väntar på credentials + SQL)

## Vad som byggts

### Utökat lib/fortnox.ts
- [x] `bookFortnoxInvoice()` — bokför faktura i Fortnox
- [x] `registerFortnoxPayment()` — registrera betalning
- [x] `createFortnoxOffer()` — skapa offert i Fortnox
- [x] `syncQuoteToFortnox()` — synka Handymate-offert → Fortnox offer
- [x] `getFortnoxStatus()` — status + synkstatistik
- [x] Alla funktioner returnerar `{ skipped: true }` om Fortnox ej anslutet

### Ny fil: lib/fortnox/sync.ts
- [x] `syncCustomerWithTracking()` — synk + fortnox_sync tabell
- [x] `syncInvoiceWithTracking()` — synk + fortnox_sync tabell
- [x] `syncQuoteWithTracking()` — synk + fortnox_sync tabell
- [x] `syncPaymentWithTracking()` — betalning + fortnox_sync tabell
- [x] `batchSync()` — batch-synka alla osynkade entiteter

### Automation-engine
- [x] Ny action: `sync_to_fortnox` med stöd för customer/invoice/quote/payment
- [x] Graceful skip om Fortnox ej anslutet

### Agent-tools (tool-definitions + tool-router)
- [x] `check_fortnox_status` — kontrollera Fortnox-koppling
- [x] `trigger_fortnox_sync` — synka enskild entitet
- [x] Ekonomi-agenten har tillgång till båda verktygen

### SQL: sql/v7_fortnox.sql
- [x] fortnox_sync tabell med RLS
- [x] fortnox_company_name kolumn i business_config
- [x] fortnox_offer_number + fortnox_synced_at i quote-tabell
- [x] Seed automation rules (is_active: false)

### .env.local.example
- [x] Fortnox-variabler med kommentar

## Aktivering (när Fortnox Developer Portal-konto finns)

1. Fyll i `FORTNOX_CLIENT_ID`, `FORTNOX_CLIENT_SECRET`, `FORTNOX_REDIRECT_URI` i Vercel
2. Kör `sql/v7_fortnox.sql` i Supabase SQL Editor
3. Aktivera automation rules: `UPDATE v3_automation_rules SET is_active = true WHERE name LIKE 'Fortnox:%'`
4. Koppla Fortnox under Inställningar i dashboarden
