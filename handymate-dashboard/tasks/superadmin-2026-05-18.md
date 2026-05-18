# Superadmin Impersonation — 2026-05-18

Två-mode-impersonation för utvecklare så Andreas (och senare team) kan
felsöka pilot-kunders konton utan att kontakta dem direkt.

## Sprintens commits

| Commit | Innehåll |
|---|---|
| `29a6c403` | SQL för admin_impersonation_log (markerad som v2-feature, ej obligatorisk v1) |
| `5f67face` | lib/auth/superadmin.ts + getAuthenticatedBusiness impersonation-stöd |
| `96d3089d` | READ-only API-route + email-fallback i isSuperAdmin |
| `dc6b1b57` | UI — knappar "👁️ Visa som" + "🔓 Logga in som" + banner-uppdatering |
| (denna)    | tasks-doc + setup-instruktioner |

## Två modes — när du använder vilket

### 👁️ Visa som (READ-only, default)

**När**: 90% av felsökning. Du behöver SE deras dashboard, se deras data,
förstå vad de ser i UI.

**Hur**:
1. Gå till `/admin`
2. Hitta business → klicka "👁️ Visa som"
3. Redirect till `/dashboard` — du ser deras data
4. Röd banner högst upp: "👁️ READ-only — du visar X:s dashboard" + Avsluta-knapp
5. När klar, klicka "Avsluta" → tillbaka till `/admin`

**Vad fungerar**: Alla READ-endpoints returnerar target businessens data
(`getAuthenticatedBusiness` läser `hm_impersonate`-cookie + returnerar target
med `_impersonation`-flag).

**Vad fungerar INTE**:
- Fortnox-OAuth (kräver target-user-session, inte bara cookie)
- Skicka SMS / faktura (sessionen är fortfarande din egen)
- Vissa skriv-endpoints som filtrerar på `auth.uid()`

**Säkerhet**: Du är fortfarande dig själv för Supabase. Misstag begränsade.

### 🔓 Logga in som (magic-link, opt-in)

**När**: När du måste AGERA som target — slutföra Fortnox-OAuth, skicka
test-SMS, testa en specifik workflow där sessionen måste vara target's.

**Hur**:
1. Gå till `/admin`
2. Hitta business → klicka "🔓 Logga in som"
3. `window.confirm`-varning förklarar att alla actions blir verkliga
4. Bekräfta → backend genererar one-time-token → redirect till
   `/api/admin/impersonate/verify` → Supabase Admin API magic-link →
   du loggas in som target user
5. 2h session — du ÄR target. Banner visas INTE (TD v2)
6. Logga ut manuellt när klar, eller vänta på 2h auto-expiry

**Vad fungerar**: ALLT target user kan göra.

**Säkerhet**: Skriv-actions går mot target's data på riktigt. **Ingen visuell
påminnelse** att du är i impersonation-mode (du ser deras UI som om du vore de).
Audit-trail i `admin_audit_log` med `action='impersonate_start'`.

## Setup-instruktioner (KRÄVS innan något fungerar)

### Steg 1 — Aktivera Andreas som admin

**Enklast**: Lägg till i Vercel production env-variabel:
```
ADMIN_EMAILS=andreas@byglo.se
```

Efter Vercel re-deploy är detta aktivt. Verifiering:
```sql
-- Inget att verifiera i DB — env-var räcker
-- Testa: gå till app.handymate.se/admin → om du ser dashboard = klart
```

**Alternativt** (kräver SQL): sätt `is_superadmin` i `app_metadata`:
```sql
UPDATE auth.users
SET raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_superadmin": true}'::jsonb
WHERE email = 'andreas@byglo.se';
```

### Steg 2 — Skapa impersonation_tokens-tabell (för magic-link)

Kör `sql/v3_superadmin.sql` i Supabase SQL Editor.

Minst `impersonation_tokens`-blocket måste köras för att magic-link ska
fungera. `admin_impersonation_log`-blocket är v2-feature (valfri).

Verifiering:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name = 'impersonation_tokens';
-- → 1 rad
```

### Steg 3 — Testa

1. Logga in på app.handymate.se som andreas@byglo.se
2. Gå till `/admin`
3. Hitta "Bee Service AB" (biz_21wswuhrbhy)
4. Klicka "👁️ Visa som" — du bör se Bee Services dashboard med röd banner
5. Klicka "Avsluta" — tillbaka till `/admin`
6. Klicka "🔓 Logga in som" → bekräfta varningen — du bör logga in
   som Christoffer på riktigt

## Architecture-beslut

### Varför två modes parallellt?

READ-only räcker för 90% av felsökning och är säkrast (admin kan inte göra
skador). Magic-link är overkill för "klicka runt och se data" men nödvändigt
för OAuth-flöden och write-actions.

Genom att ha båda får vi:
- Default till säker — Andreas klickar "Visa som" och kan göra fel utan
  att skada Christoffers data
- Opt-in till kraftfull — Andreas väljer aktivt magic-link när han VET
  att han behöver agera som target

### Varför admin-detection via email + app_metadata?

Tre lager (i prioritetsordning):
1. `app_metadata.is_superadmin === true` (säkrast — service_role-skyddat,
   kan inte manipuleras från UI)
2. Email slutar på `@handymate.se` (för framtida team)
3. Email i `ADMIN_EMAILS` env-var (för current state)

Pragmatik: vi har inte bytte till @handymate.se-mail ännu, så vi behöver
env-fallback. Men prefer app_metadata för production team-onboarding.

### Varför admin_audit_log och inte ny tabell?

`admin_audit_log` finns redan och loggas av befintlig admin-infrastruktur.
Att skapa parallell `admin_impersonation_log` skulle fragmentera audit-trail.

`admin_impersonation_log`-tabellen i `sql/v3_superadmin.sql` finns
förberedd som v2-feature om vi vill ha bättre detaljerad impersonation-vy
med computed duration, IP/UA, reason-fält. Inte obligatorisk v1.

## Begränsningar i v1 (TDs att åtgärda om relevanta)

### TD-50: Ingen banner i magic-link-mode

**Problem**: När du loggar in via magic-link blir du target user i
Supabase-sessionen. `impersonate_business_name`-cookien sätts inte (det
finns ingen mekanism för det i magic-link-flödet), så `ImpersonationBanner`
visas inte. Risk: du glömmer att du är impersonating och gör destruktiva
actions.

**Mitigation**: Verify-route sätter `handymate_impersonating=true` +
`handymate_admin_id`-cookies (httpOnly). En framtida v2 kan exponera dessa
till banner via en server-side endpoint eller via custom claim i JWT.

**Pilot-värde**: medium. Andreas vet att han triggade magic-link, men
glömskerisken är reell över 2h-session.

### TD-51: Ingen skriv-skydd för READ-only API-routes

**Problem**: `AuthenticatedBusiness._impersonation`-flaggan finns men inga
API-routes kollar den. Andreas kan teoretiskt skicka POST-requests till
write-endpoints i READ-only-mode och de kommer fungera.

**Mitigation v1**: UI-banner + Andreas-disciplin. Andreas använder främst
GET-endpoints i READ-only-mode och flyttar till magic-link när han behöver
skriva.

**v2-implementation**: Lägg till `assertReadOnly(business)` helper som
write-endpoints kan anropa för 403 om `_impersonation` är satt. Implementeras
först på destructive endpoints (delete-routes, send-invoice, send-sms).

**Pilot-värde**: medium. Inget akut, men säkrare för team-onboarding.

### TD-52: Magic-link-token har 5 min livslängd — kan vara för kort

**Problem**: Mellan POST `/api/admin/impersonate/[businessId]` och klick på
`impersonationUrl` har du 5 minuter. Om Andreas multitaskar kan token
expire.

**Mitigation**: I praktiken klickar Andreas direkt efter "Logga in som"-
varningen, så 5 min är fine. Om problem: höj till 15 min i
`app/api/admin/impersonate/[businessId]/route.ts:74`.

### TD-53: Audit-trail har inte device fingerprint

**Problem**: `admin_audit_log.details` innehåller `admin_email` + `admin_ip` +
`admin_user_agent` men ingen device-fingerprint. Om Andreas session läcker
(t.ex. laptop stulen) kan attacker logga in som vilken kund som helst.

**Mitigation v1**: Vercel + Supabase har egna audit-systems. Acceptabel risk.

**v2-implementation**: Lägg till device fingerprint via Vercel Edge / Supabase
RLS-policy som spårar session_id per admin-action.

## Verifiering efter setup

Efter Vercel-env-vars + SQL körd, paste:a i Andreas browser-console:

```js
// 1. Kolla att admin-vyn fungerar
const r = await fetch('/admin')
console.log('admin status:', r.status) // bör vara 200, inte 403

// 2. Kolla att READ-only API fungerar
const r2 = await fetch('/api/admin/impersonate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ business_id: 'biz_21wswuhrbhy' })
})
console.log('impersonate status:', r2.status) // bör vara 200
console.log('impersonate body:', await r2.json())

// 3. Kolla att target's data syns
const r3 = await fetch('/api/customers')
console.log('customers count:', (await r3.json()).customers?.length)
// Bör vara ~50 (Bee Services kunder), inte din egen kund-count

// 4. Avsluta impersonation
await fetch('/api/admin/impersonate', { method: 'DELETE' })
```

## Säkerhetsövervägningar

- **CRON_SECRET / SUPABASE_SERVICE_ROLE_KEY**: ingen ändring — admin-routes
  använder service-role internt men authentication-gate ovanpå.
- **Cookie-säkerhet**: `hm_impersonate` är httpOnly+secure+sameSite-lax.
  Cookie-injection från icke-admin är ofarlig (server verifierar admin-
  status innan respekterar cookien).
- **GDPR**: dokumentera i kund-avtal/integritetspolicyn att Handymate-
  utvecklare har möjlighet att impersonera för supportändamål. Audit-
  trail finns i `admin_audit_log`.
- **Privilege-escalation**: `is_superadmin` i `app_metadata` kan ENDAST
  sättas via service_role. Inte via UI, inte via JS-klient. Säkrare än
  email-fallback om vi byter till det.

## Nästa steg

1. Andreas sätter `ADMIN_EMAILS=andreas@byglo.se` i Vercel production env
2. Andreas kör `sql/v3_superadmin.sql` impersonation_tokens-blocket i Supabase
3. Vercel deploy klar (~2 min efter env-set)
4. Andreas testar på Bee Service AB via `/admin`
5. När magic-link funkar — Andreas testar Fortnox-OAuth som Christoffer
   utan att behöva ringa honom
