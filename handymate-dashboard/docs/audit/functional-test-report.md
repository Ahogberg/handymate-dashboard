# Handymate - Funktionell Testrapport

**Datum:** 2026-02-18
**Testmiljö:** Next.js 14.1.0 dev server (localhost:3001)
**Env-status:** Inga `.env`-filer konfigurerade lokalt (Supabase, Stripe, etc. saknas)
**TypeScript:** `tsc --noEmit` passerar utan fel

---

## Sammanfattning

| Kategori | Antal | Status |
|----------|-------|--------|
| Sidor testade | 40 | Se detaljer nedan |
| Sidor som renderar (HTTP 200) | 39 | OK |
| Sidor med serverfel (HTTP 500) | 1 | /admin/onboard |
| API-routes testade | 70+ | Se detaljer nedan |
| API-routes OK (401 auth) | ~50 | Auth fungerar korrekt |
| API-routes 404 (saknas) | 10 | Filer saknas på disk |
| API-routes 500 (serverfel) | 6 | Kraschar vid start |
| API-routes 405 (fel metod) | 4 | Saknar GET-handler |

---

## KRITISKA BUGGAR (Severity: CRITICAL)

### BUG-001: /api/fortnox/status returnerar 500 med felmeddelande exponerat
- **Route:** `GET /api/fortnox/status`
- **Fil:** `app/api/fortnox/status/route.ts:25-28`
- **Problem:** Använder `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)` direkt istället för `getServerSupabase()`. När env vars saknas kastas "supabaseUrl is required" med HTTP 500.
- **Förväntat:** Ska returnera 401 (Unauthorized) eller 503 (Service Unavailable)
- **Faktiskt:** `{"error":"supabaseUrl is required."}` med HTTP 500 - exponerar intern information

### BUG-002: /api/voice/analyze returnerar 500 - samma mönster
- **Route:** `POST /api/voice/analyze`
- **Fil:** `app/api/voice/analyze/route.ts:27`
- **Problem:** `getServerSupabase()` anropas utan att env vars finns → kraschar med 500
- **Förväntat:** Felet ska fångas graciöst, returnera 503
- **Faktiskt:** `{"error":"supabaseUrl is required."}` med HTTP 500

### BUG-003: /api/billing/checkout kraschar vid Stripe-initialisering
- **Route:** `POST /api/billing/checkout`
- **Fil:** `app/api/billing/checkout/route.ts:6`
- **Problem:** `new Stripe(process.env.STRIPE_SECRET_KEY!)` kraschar när STRIPE_SECRET_KEY saknas. Felet kastas vid module load, inte i try/catch.
- **Förväntat:** Validera env vars innan Stripe-initialisering
- **Faktiskt:** HTTP 500 med HTML error page (okatchat fel)

### BUG-004: /api/billing/portal kraschar - samma som BUG-003
- **Route:** `POST /api/billing/portal`
- **Fil:** `app/api/billing/portal/route.ts`
- **Problem:** Samma Stripe-initialiseringsfel som checkout
- **Faktiskt:** HTTP 500 med HTML error page

### BUG-005: /api/billing/webhook kraschar - samma som BUG-003
- **Route:** `POST /api/billing/webhook`
- **Fil:** `app/api/billing/webhook/route.ts`
- **Problem:** Samma Stripe-initialiseringsfel
- **Faktiskt:** HTTP 500 med HTML error page

### BUG-006: /api/auth returnerar 500 istället för 400 vid tom body
- **Route:** `POST /api/auth`
- **Fil:** `app/api/auth/route.ts`
- **Problem:** Vid tom POST-body kastas "supabaseUrl/supabaseKey required" (env vars saknas), men även med env vars borde tom body ge 400.
- **Faktiskt:** `{"error":"either NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env variables or supabaseUrl and supabaseKey are required!"}` med HTTP 500

### BUG-007: /api/voice/recording returnerar 500 vid tom POST
- **Route:** `POST /api/voice/recording`
- **Fil:** `app/api/voice/recording/route.ts`
- **Problem:** Webhook-endpoint returnerar `{"error":"Internal error"}` med HTTP 500 vid tom body. Borde validera input först.
- **Faktiskt:** HTTP 500

---

## SAKNADE API-ROUTES (Severity: HIGH)

Dessa routes refereras i CLAUDE.md eller UI men saknas som filer:

### BUG-008: /api/auth/register saknas (404)
- **Förväntat:** Separat registrerings-endpoint
- **Status:** Registrering hanteras via `POST /api/auth` med action-flagga, men separat route saknas
- **Påverkan:** Om UI pekar direkt på `/api/auth/register` får användaren 404

### BUG-009: /api/auth/logout saknas (404)
- **Förväntat:** Logout-endpoint
- **Status:** Utloggning sker via Supabase client-side `supabase.auth.signOut()`, men API-route saknas
- **Påverkan:** Låg - logout fungerar via client SDK

### BUG-010: /api/customers saknas som standalone GET-route (404)
- **Fil som saknas:** `app/api/customers/route.ts` (bara `app/api/customers/[id]/portal-link/route.ts` finns)
- **Refereras i:** `app/dashboard/documents/page.tsx:238` → `fetch('/api/customers', { headers })`
- **Påverkan:** KRITISK - Dokumentsidan kan inte ladda kundlista. `fetch('/api/customers')` returnerar 404.

### BUG-011: /api/bookings saknas (404)
- **Förväntat:** CRUD-endpoint för bokningar
- **Status:** Ingen `app/api/bookings/route.ts` finns
- **Påverkan:** Bokningsrelaterad funktionalitet via API fungerar inte

### BUG-012: /api/suggestions saknas som GET-route (404)
- **Förväntat:** Lista AI-förslag
- **Status:** Bara `app/api/suggestions/approve/route.ts` finns (POST)
- **Påverkan:** Kan inte hämta förslagslista via API (UI laddar direkt från Supabase client)

### BUG-013: /api/settings och /api/settings/knowledge saknas (404)
- **Förväntat:** Inställnings-CRUD
- **Status:** Inga route-filer finns i `app/api/settings/`
- **Påverkan:** Inställningssidorna kan inte spara via API (använder troligen direkt Supabase)

### BUG-014: /api/phone/available saknas (404)
- **Förväntat:** Lista tillgängliga telefonnummer
- **Status:** Bara `app/api/phone/provision/` och `app/api/phone/settings/` finns
- **Påverkan:** Kan inte söka efter tillgängliga nummer

### BUG-015: /api/calendar/events saknas (404)
- **Förväntat:** Kalender-events endpoint
- **Status:** Google Calendar-integration finns via `/api/google/events` men inte `/api/calendar/events`
- **Påverkan:** Om kalendersidan pekar på denna route fungerar det inte

### BUG-016: /api/assistant saknas som POST-route (404)
- **Förväntat:** Röstassistent-endpoint
- **Status:** `app/api/assistant/command/route.ts` finns men inte `app/api/assistant/route.ts`
- **Refereras i:** Assistantsidan använder `/api/assistant/command` (korrekt)
- **Påverkan:** Låg - rätt endpoint finns

---

## FEL METOD / 405-FEL (Severity: MEDIUM)

### BUG-017: GET /api/recordings returnerar 405
- **Fil:** `app/api/recordings/route.ts`
- **Problem:** Filen exporterar bara `PATCH` och `DELETE`, ingen `GET`-handler
- **Påverkan:** Kan inte hämta inspelningslista via denna route. Inspelningssidan (`/dashboard/recordings`) laddar troligen direkt från Supabase client.

### BUG-018: GET /api/pipeline/deals returnerar 405
- **Fil:** `app/api/pipeline/deals/route.ts`
- **Problem:** Saknar GET-handler, har bara POST
- **Påverkan:** Pipeline-sidan måste använda annan metod för att hämta deals

### BUG-019: GET /api/actions returnerar 405
- **Fil:** `app/api/actions/route.ts`
- **Problem:** Saknar GET-handler
- **Påverkan:** Kan inte lista actions via GET

### BUG-020: POST /api/invoices/pdf returnerar 405
- **Fil:** `app/api/invoices/pdf/route.ts`
- **Problem:** Exporterar bara GET, inte POST
- **Påverkan:** Låg om UI använder GET korrekt

### BUG-021: POST /api/google/connect returnerar 405
- **Fil:** `app/api/google/connect/route.ts`
- **Problem:** Exporterar bara GET (redirect till OAuth), POST saknas
- **Påverkan:** Låg - OAuth connect sker via GET redirect

### BUG-022: POST /api/automations returnerar 405
- **Fil:** `app/api/automations/route.ts`
- **Problem:** Saknar POST-handler
- **Påverkan:** Kan inte skapa nya automationer via denna route

---

## SIDRENDERING (Severity: LOW-MEDIUM)

### Alla sidor som renderar (HTTP 200) - 39 av 40:

| Sida | HTTP | Storlek | Status |
|------|------|---------|--------|
| `/` (Landing) | 200 | 8.7KB | OK |
| `/login` | 200 | 9.2KB | OK |
| `/signup` | 200 | 15.5KB | OK |
| `/privacy` | 200 | 20.4KB | OK |
| `/forgot-password` | 200 | - | OK |
| `/reset-password` | 200 | - | OK |
| `/dashboard` | 200 | 6.4KB | OK |
| `/dashboard/inbox` | 200 | 7.0KB | OK |
| `/dashboard/ai-inbox` | 200 | - | OK |
| `/dashboard/calls` | 200 | - | OK |
| `/dashboard/calendar` | 200 | 7.0KB | OK |
| `/dashboard/schedule` | 200 | - | OK |
| `/dashboard/customers` | 200 | 7.0KB | OK |
| `/dashboard/customers/import` | 200 | - | OK |
| `/dashboard/bookings` | 200 | - | OK |
| `/dashboard/quotes` | 200 | 7.0KB | OK |
| `/dashboard/quotes/new` | 200 | 7.6KB | OK |
| `/dashboard/invoices` | 200 | 7.0KB | OK |
| `/dashboard/invoices/new` | 200 | - | OK |
| `/dashboard/orders` | 200 | 7.0KB | OK |
| `/dashboard/orders/new` | 200 | - | OK |
| `/dashboard/assistant` | 200 | 7.0KB | OK |
| `/dashboard/recordings` | 200 | - | OK |
| `/dashboard/projects` | 200 | - | OK |
| `/dashboard/pipeline` | 200 | - | OK |
| `/dashboard/documents` | 200 | - | OK |
| `/dashboard/communication` | 200 | - | OK |
| `/dashboard/automations` | 200 | - | OK |
| `/dashboard/campaigns` | 200 | - | OK |
| `/dashboard/campaigns/new` | 200 | - | OK |
| `/dashboard/team` | 200 | - | OK |
| `/dashboard/time` | 200 | - | OK |
| `/dashboard/profile` | 200 | - | OK |
| `/dashboard/settings` | 200 | 7.0KB | OK |
| `/dashboard/settings/knowledge` | 200 | 7.7KB | OK |
| `/dashboard/settings/pricelist` | 200 | 7.7KB | OK |
| `/dashboard/settings/billing` | 200 | 7.7KB | OK |
| `/dashboard/help` | 200 | 7.0KB | OK |
| `/admin` | 200 | 6.3KB | OK |

### Sida med serverfel:

### BUG-023: /admin/onboard returnerar HTTP 500
- **Fil:** `app/admin/onboard/page.tsx`
- **Problem:** Sidan returnerar HTTP 500 med `__next_error__` och `next-error content="not-found"`. Troligtvis saknas en layout.tsx i admin-mappen som sidan förväntar sig, eller det finns en import som kraschar vid server-rendering.
- **Förväntat:** Sidan ska rendera admin-onboarding-formuläret
- **Faktiskt:** HTTP 500 med error page

---

## API-ROUTES SAMMANFATTNING

### Routes med korrekt auth-skydd (401) - FUNGERAR:

| Route | Metod | HTTP | Status |
|-------|-------|------|--------|
| `/api/suppliers` | GET | 401 | Auth OK |
| `/api/pipeline` | GET | 401 | Auth OK |
| `/api/pipeline/stages` | GET | 401 | Auth OK |
| `/api/pipeline/stats` | GET | 401 | Auth OK |
| `/api/pipeline/settings` | GET | 401 | Auth OK |
| `/api/pipeline/activity` | GET | 401 | Auth OK |
| `/api/gdpr/export` | GET | 401 | Auth OK |
| `/api/gdpr/delete` | POST | 401 | Auth OK |
| `/api/quotes` | GET | 401 | Auth OK |
| `/api/quotes` | POST | 401 | Auth OK |
| `/api/quotes/templates` | GET | 401 | Auth OK |
| `/api/quotes/generate` | POST | 401 | Auth OK |
| `/api/quotes/ai-generate` | POST | 401 | Auth OK |
| `/api/quotes/send` | POST | 401 | Auth OK |
| `/api/quotes/pdf` | POST | 401 | Auth OK |
| `/api/quotes/transcribe-voice` | POST | 401 | Auth OK |
| `/api/quotes/upload-image` | POST | 401 | Auth OK |
| `/api/invoices` | GET | 401 | Auth OK |
| `/api/invoices` | POST | 401 | Auth OK |
| `/api/invoices/send` | POST | 401 | Auth OK |
| `/api/orders` | GET | 401 | Auth OK |
| `/api/feedback` | GET | 401 | Auth OK |
| `/api/feedback` | POST | 401 | Auth OK |
| `/api/dashboard/stats` | GET | 401 | Auth OK |
| `/api/billing` | GET | 401 | Auth OK |
| `/api/billing/usage` | GET | 401 | Auth OK |
| `/api/sms/send` | POST | 401 | Auth OK |
| `/api/suggestions/approve` | POST | 401 | Auth OK |
| `/api/me` | GET | 401 | Auth OK |
| `/api/team` | GET | 401 | Auth OK |
| `/api/team/invite` | POST | 401 | Auth OK |
| `/api/schedule` | GET | 401 | Auth OK |
| `/api/time-off` | GET | 401 | Auth OK |
| `/api/time-entry` | GET | 401 | Auth OK |
| `/api/time-entry/summary` | GET | 401 | Auth OK |
| `/api/documents` | GET | 401 | Auth OK |
| `/api/documents/categories` | GET | 401 | Auth OK |
| `/api/documents/templates` | GET | 401 | Auth OK |
| `/api/projects` | GET | 401 | Auth OK |
| `/api/automations` | GET | 401 | Auth OK |
| `/api/automations/test` | POST | 401 | Auth OK |
| `/api/communication/settings` | GET | 401 | Auth OK |
| `/api/communication/rules` | GET | 401 | Auth OK |
| `/api/communication/stats` | GET | 401 | Auth OK |
| `/api/communication/log` | GET | 401 | Auth OK |
| `/api/communication/send-manual` | POST | 401 | Auth OK |
| `/api/communication/trigger` | POST | 401 | Auth OK |
| `/api/communication/evaluate` | POST | 401 | Auth OK |
| `/api/grossist` | GET | 401 | Auth OK |
| `/api/grossist/connect` | POST | 401 | Auth OK |
| `/api/grossist/sync-prices` | POST | 401 | Auth OK |
| `/api/portal-messages` | GET | 401 | Auth OK |
| `/api/google/status` | GET | 401 | Auth OK |
| `/api/google/calendars` | GET | 401 | Auth OK |
| `/api/google/sync` | POST | 401 | Auth OK |
| `/api/checklists/templates` | GET | 401 | Auth OK |

### Routes med admin-skydd (403) - FUNGERAR:

| Route | Metod | HTTP | Status |
|-------|-------|------|--------|
| `/api/admin/metrics` | GET | 403 | Admin auth OK |
| `/api/admin/create-pilot` | POST | 403 | Admin auth OK |
| `/api/admin/pilots` | GET | 403 | Admin auth OK |

### Cron-routes med CRON_SECRET-skydd:

| Route | Metod | HTTP | Status |
|-------|-------|------|--------|
| `/api/cron/check-overdue` | GET | 401 | Auth OK |
| `/api/cron/communication-check` | GET | 401 | Auth OK |
| `/api/cron/sync-calendars` | GET | timeout | Hänger - troligen fastnar vid DB-anrop |

### Speciella routes:

| Route | Metod | HTTP | Notering |
|-------|-------|------|----------|
| `/api/health` | GET | 503 | Korrekt beteende utan env vars |
| `/api/voice/incoming` | POST | 200 | Returnerar `{"hangup":"error"}` - korrekt fallback |

---

## NAVIGATIONSTEST

### Sidebar-länkar (Sidebar.tsx):
Alla sidebar-länkar pekar på existerande sidor:

| Länk | Mål | Sida finns | Status |
|------|-----|------------|--------|
| Dashboard | `/dashboard` | Ja | OK |
| Samtal | `/dashboard/calls` | Ja | OK |
| Schema | `/dashboard/schedule` | Ja | OK |
| Kunder | `/dashboard/customers` | Ja | OK |
| Pipeline | `/dashboard/pipeline` | Ja | OK |
| Jobb > Projekt | `/dashboard/projects` | Ja | OK |
| Jobb > Offerter | `/dashboard/quotes` | Ja | OK |
| Jobb > Fakturor | `/dashboard/invoices` | Ja | OK |
| Jobb > Dokument | `/dashboard/documents` | Ja | OK |
| Tid | `/dashboard/time` | Ja | OK |
| Automationer | `/dashboard/automations` | Ja | OK |
| Inställningar | `/dashboard/settings` | Ja | OK |
| Hjälp | `/dashboard/help` | Ja | OK |
| Min profil | `/dashboard/profile` | Ja | OK |
| Logga ut | onClick handler | - | OK |

---

## KODKVALITETS-OBSERVATIONER

### OBS-001: Blandning av auth-mönster
- Några routes använder `getAuthenticatedBusiness(request)` (korrekt)
- `/api/fortnox/status` använder manuell cookie-parsing + `createClient()` (inkonsistent)
- Rekommendation: Standardisera till `getAuthenticatedBusiness()` överallt

### OBS-002: /api/recordings saknar GET-handler
- Filen har bara PATCH och DELETE
- Inspelningsdata hämtas troligen direkt via Supabase client i frontend
- Rekommendation: Antingen lägg till GET eller dokumentera att client SDK används

### OBS-003: Stripe-routes kraschar vid module load
- Alla tre billing-routes (`checkout`, `portal`, `webhook`) initierar Stripe i module scope
- Om `STRIPE_SECRET_KEY` saknas kraschar hela modulen innan try/catch
- Rekommendation: Flytta Stripe-init till lazy/function scope

### OBS-004: /api/cron/sync-calendars hänger
- Route timeout:ar vid test (HTTP 000 efter 8 sekunder)
- Troligtvis väntar på DB-connection som aldrig kommer
- Rekommendation: Lägg till timeout på DB-anrop

### OBS-005: Dubbla inbox-sidor
- Både `/dashboard/inbox` och `/dashboard/ai-inbox` finns
- Sidebar pekar på `/dashboard/calls` (som inkluderar inbox)
- Rekommendation: Konsolidera eller ta bort en

### OBS-006: /api/voice/recording saknar input-validering
- Webhook-endpoint (från 46elks) försöker parsa formData utan att validera
- Vid tom POST returneras 500 istället för 400
- Rekommendation: Validera required fields före DB-operationer

---

## PRIORITERAD ÅTGÄRDSLISTA

### Prioritet 1 (Blockerare):
1. **BUG-010**: Skapa `/api/customers/route.ts` med GET-handler - dokumentsidan kraschar utan den
2. **BUG-003/004/005**: Flytta Stripe-init till lazy scope i billing-routes
3. **BUG-001**: Byt ut `createClient()` mot `getServerSupabase()` i fortnox/status

### Prioritet 2 (Hög):
4. **BUG-023**: Fixa /admin/onboard 500-error
5. **BUG-006**: Validera request body i /api/auth innan Supabase-anrop
6. **BUG-007**: Validera formData i /api/voice/recording

### Prioritet 3 (Medium):
7. **BUG-017**: Lägg till GET-handler i /api/recordings
8. **BUG-011**: Skapa /api/bookings route om den behövs
9. **BUG-018**: Lägg till GET-handler i /api/pipeline/deals
10. **OBS-004**: Fixa timeout-hantering i cron/sync-calendars

### Prioritet 4 (Låg):
11. **BUG-008/009**: Skapa auth/register och auth/logout routes (eller dokumentera att de inte behövs)
12. **BUG-012/013/014/015**: Skapa saknade routes eller uppdatera CLAUDE.md
13. Standardisera auth-mönster i alla routes

---

## TESTMETODIK

Denna rapport baseras på:
1. **Build-verifiering:** `npm run dev` startar utan fel, Next.js 14.1.0
2. **TypeScript-kompilering:** `npx tsc --noEmit` passerar utan fel
3. **HTTP-testning:** Curl-anrop med 8s timeout mot alla 40 sidor och 70+ API-routes
4. **Statisk kodanalys:** Manuell granskning av route-filer med identifierade problem
5. **Filsystems-verifiering:** Glob/ls för att bekräfta vilka route-filer som faktiskt finns

**Begränsningar:** Utan `.env`-konfiguration kunde inte fullständiga funktionella tester köras (DB-queries, Stripe, 46elks etc). Routes som kräver Supabase-anslutning returnerade förväntade 401/500 beroende på om auth-check sker före DB-anrop.
