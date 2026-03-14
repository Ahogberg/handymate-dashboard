# V9: Partnerportal

## Status: Kod klar ✅ | SQL-migration krävs ⏳

## Vad som byggdes

### 1. SQL-migration
**Fil:** `sql/v9_partners.sql`
- `partners` tabell med bcrypt-hash, referral_code, commission-spårning
- ALTER på `referrals`: partner_id, commission_month, commission_expires_at, subscription_plan/amount

### 2. Autentisering
**Fil:** `lib/partners/auth.ts`
- `registerPartner()` — bcrypt hash, genererar P-XXX-YYYY kod
- `loginPartner()` — validerar lösenord, returnerar JWT (30 dagar via jose)
- `getPartnerFromToken()` — JWT-verifiering
- `getPartnerTokenFromRequest()` — extraherar token från cookie

### 3. Provisionlogik
**Fil:** `lib/partners/commission.ts`
- `processMonthlyCommissions()` — nattlig beräkning, 20% × 12 månader
- `markCommissionPaid()` — manuell utbetalningsmarkering
- Integrerad i agent-context cron

### 4. API-routes
| Route | Metod | Beskrivning |
|-------|-------|-------------|
| `/api/partners/register` | POST | Registrering + admin-notis via Resend |
| `/api/partners/login` | POST | Login → JWT-cookie |
| `/api/partners/logout` | POST | Rensar cookie |
| `/api/partners/me` | GET | Returnerar inloggad partner |
| `/api/partners/dashboard` | GET | Stats + referrals + provision |
| `/api/admin/partners/[id]/approve` | GET | Admin-godkännande → välkomstmail |

### 5. Sidor
| Sida | Beskrivning |
|------|-------------|
| `/partners` | Landningssida med hero, 3-stegs guide, provisionstabell, FAQ |
| `/partners/register` | Registreringsformulär, success-state |
| `/partners/login` | Inloggning |
| `/partners/dashboard` | Stats, referrallänk med kopiera, kundtabell, provisionsinfo |

### 6. Onboarding-integration
**Fil:** `app/api/auth/route.ts` (ÄNDRAD)
- P-XXX-referralkoder matchas mot partners-tabellen
- Skapar referral med partner_id koppling
- Vanliga referralkoder fungerar som förut

### 7. Nattlig cron
**Fil:** `app/api/cron/agent-context/route.ts` (ÄNDRAD)
- `processMonthlyCommissions()` körs efter context/rapport/pricing

## Verifiering
- `npx tsc --noEmit` — 0 fel ✅
- `npx next build` — ren build ✅

## Innan deploy
1. Kör `sql/v9_partners.sql` i Supabase SQL Editor
2. Testa: `/partners` → landningssida
3. Testa: `/partners/register` → registrera testpartner
4. Verifiera admin-mail skickas
5. Godkänn via admin-länk
6. Logga in och se tom dashboard
7. Registrera kund med `?ref=P-XXX-YYYY` → verifiera referral skapas
