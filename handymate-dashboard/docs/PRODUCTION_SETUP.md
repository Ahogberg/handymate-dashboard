# Produktions-checklist

Manuell konfiguration som krävs utanför koden innan säljstart.

## 1. Miljövariabler i Vercel

Verifiera att dessa är satta i Vercel → Project → Settings → Environment Variables (Production):

### Obligatoriska (server-side)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

CRON_SECRET                  # Valfritt hex-värde, minst 32 tecken
PARTNER_JWT_SECRET           # Separat från CRON_SECRET (rekommenderat)

ANTHROPIC_API_KEY            # Claude för AI-agent
OPENAI_API_KEY               # Whisper för voice transcription

ELKS_API_USER                # 46elks SMS/voice
ELKS_API_PASSWORD

STRIPE_SECRET_KEY            # sk_live_...
STRIPE_WEBHOOK_SECRET        # whsec_... (från webhook-endpoint i Stripe)

RESEND_API_KEY               # För fallback-email
RESEND_DOMAIN                # handymate.se

GOOGLE_CLIENT_ID             # OAuth — kalendersynk + Gmail
GOOGLE_CLIENT_SECRET
GOOGLE_MAPS_API_KEY          # För adress-autocomplete

NEXT_PUBLIC_APP_URL          # https://app.handymate.se

HANDYMATE_LEGAL_NAME          # Köparidentitet på partnerns självfaktura (lib/partners/self-billing.ts)
HANDYMATE_ORG_NUMBER           # utan dessa fem vägrar createPayoutBatch skapa en batch
HANDYMATE_REGISTERED_ADDRESS
HANDYMATE_VAT_NUMBER
HANDYMATE_BILLING_EMAIL
```

### Valfria
```
FIRECRAWL_API_KEY            # För lead-skrapning (Hanna)
FORTNOX_CLIENT_ID            # Bokföring
FORTNOX_CLIENT_SECRET
MAPBOX_ACCESS_TOKEN          # Alternativ till Google Maps
ADMIN_EMAILS                 # Komma-separerad lista (komplement till @handymate.se)
```

## 2. Supabase Storage buckets

Skapa manuellt i Supabase Dashboard → Storage:

| Bucket | Public? | Syfte |
|--------|---------|-------|
| `customer-documents` | ❌ Nej | Dokument kopplade till kunder |
| `project-files` | ❌ Nej | Projektdokument |
| `logo` | ✅ Ja | Företagslogotyper (visas publikt på offerter/fakturor) |
| `team-avatars` | ✅ Ja | Team-medlems-profilbilder |
| `pdf` | ❌ Nej | Genererade PDF:er |

Efter skapande, kör RLS-policies enligt SQL i `sql/pilot_fixes.sql` raderna 60+.

## 3. Stripe Dashboard

### 3.1 Skapa produkter + priser

Skapa tre produkter i Stripe Dashboard → Products:

| Produkt | Månadspris | Årspris | Notes |
|---------|-----------|---------|-------|
| Handymate Starter | 2495 SEK | 24950 SEK | 1 användare, 100 samtal/mån |
| Handymate Professional | 5995 SEK | 59950 SEK | Obegränsat antal användare, 400 samtal/mån |
| Handymate Business | 11995 SEK | 119950 SEK | Obegränsat, 2000 samtal/mån |

Kopiera respektive `price_id` (börjar med `price_...`) och spara i Vercel env:
```
STRIPE_PRICE_STARTER_MONTHLY=price_...
STRIPE_PRICE_PROFESSIONAL_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
```

### 3.2 Konfigurera webhook-endpoint

1. Stripe Dashboard → Developers → Webhooks → **Add endpoint**
2. Endpoint URL: `https://app.handymate.se/api/billing/webhook`
3. Events to send:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Kopiera **Signing secret** (`whsec_...`) → spara som `STRIPE_WEBHOOK_SECRET` i Vercel

### 3.3 Testa webhook

Från Stripe CLI:
```bash
stripe trigger checkout.session.completed
```

Kolla att event loggas i Supabase `billing_event`-tabellen.

## 4. Google OAuth consent screen

**KRITISKT** innan lansering mot icke-testusers.

Google Cloud-projektet skapades 2026-08-12 under **andreas@handymate.se** (inte
under Byglo-kontot — håll ägarskapet knutet till Handymate, inte till en
annan verksamhet). Använd IAM för att lägga till fler ägare i stället för att
skapa ett nytt projekt, om det någonsin behövs igen — annars tappar alla
redan kopplade Google Calendar-konton sin koppling (nytt Client ID/Secret =
gamla refresh-tokens slutar fungera).

Google har döpt om gränssnittet (syns som separata sidor i vänstermenyn, inte
längre en enda "OAuth consent screen"-sida):

1. **Branding**: appnamn **Handymate**, logga, User support email
   **support@handymate.se**, Developer contact **support@handymate.se**,
   Application home page https://handymate.se, Privacy policy
   https://handymate.se/privacy, Terms of service https://handymate.se/terms
2. **Data Access → Add or remove scopes** — bara det appen faktiskt begär
   (se `lib/google-calendar.ts` SCOPES). Gmail-scopes ska INTE läggas till —
   Gmail-integrationen är pausad (flyttad till "kommer snart") och kräver
   dessutom Googles tyngre säkerhetsgranskning (CASA) om den någonsin
   återupplivas — lägg då till scopes och sök verifiering på nytt då, inte
   i förväg:
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/userinfo.email`
3. **Audience** → Test users: lägg till egna/pilotkunders Google-konton här
   så länge appen står på "Testing" — de slipper varningsskärmen helt.
4. **Verification Center → Submit for verification** — kalender-scopes
   räknas som "känsliga" (sensitive), inte "begränsade" (restricted), så
   det är standardgranskningen, inte CASA-revisionen. Betydligt snabbare
   än 2-4 veckor i normalfallet.

## 5. 46elks konto

1. Skapa produktionskonto på 46elks.se (inte sandbox)
2. Köp ett pool av nummer för nya kunder (typ 50 nummer på lager)
3. Konfigurera webhook-paths per nummer:
   - SMS in: `https://app.handymate.se/api/sms/incoming`
   - Voice in: `https://app.handymate.se/api/voice/incoming`
4. Sätt `ELKS_API_USER` + `ELKS_API_PASSWORD` i Vercel

## 6. Resend

1. Verifiera `handymate.se`-domänen i Resend → Domains
2. Skapa API-key med scope: `Sending access`
3. Lägg till DKIM/SPF-records i DNS enligt Resend-instruktioner

## 7. SQL-migrationer

Lista över migrationer som **MÅSTE** köras i produktion innan säljstart:

```
sql/v21_agent_memory.sql                 # Agent-minnen + pgvector
sql/v_matte_conversations.sql            # Matte chat-historik
sql/v_matte_messages_delegation.sql      # Delegation-indikator
sql/v_job_types.sql                      # Jobbtyper + specialiteter
sql/v_lead_category.sql                  # Lead-kategorier
sql/v_lead_source_channels.sql           # Egna lead-kanaler
sql/v_monthly_reviews.sql                # Månadsrapport
sql/pilot_fixes.sql                      # ROT/RUT + customer_document
```

**Tips:** Kör alla `sql/v_*.sql` i ordning för säkerhet — de är alla idempotenta (ADD COLUMN IF NOT EXISTS etc.).

Verifiera via `GET /api/debug/schema-audit` (admin-only i produktion).

## 8. Cron-jobb verifiering

Kontrollera att Vercel Cron fungerar: Vercel Dashboard → Crons → se att alla 15+ cron-jobb listade i `vercel.json` är aktiva.

Testa manuellt:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.handymate.se/api/cron/agent-context
```

## Verifierings-checklist före första betalande kund

- [ ] Alla env-variabler satta i Vercel
- [ ] Alla Supabase Storage buckets skapade
- [ ] Stripe produkter + priser skapade
- [ ] Stripe webhook-endpoint konfigurerad och testad
- [ ] Google OAuth consent screen submitted för verifiering
- [ ] 46elks produktionskonto + nummer-pool
- [ ] Resend-domän verifierad
- [ ] Alla SQL-migrationer körda (verifiera via schema-audit)
- [ ] Trial-spärr testad: skapa trial-kund, sätt `trial_ends_at` i historiken → verifiera att banner + redirect funkar
- [ ] Past_due testad: simulera failed payment via Stripe CLI → verifiera billing-banner
- [ ] End-to-end: `/api/debug/e2e-quote` + `/api/debug/e2e-invoice` returnerar alla steg OK
