# Business config — skarp schemaavvikelse

**Datum:** 2026-09-02  
**Källa:** Supabase PostgREST OpenAPI med service-role, read-only  
**Status:** partnerlanen korrigerad; 24 filbundna avvikelser i andra lanes är karantänförda i kolumnkontraktet

## Upptäckt

Det riktiga partnerbeviset stoppade när självfakturerings-RPC:n läste
`business_config.company_name`. Live-tabellen har `business_name` men inte
`company_name`. PostgREST degraderar inte till ett tomt fält när en select
innehåller en okänd kolumn; hela frågan avvisas.

Samma skarpa schemasnapshot kopplades därför in i
`tests/column-contract.spec.ts`. Vakten kontrollerar nu även explicita
server-selecter och filter mot `business_config`, trots att tabellens
ursprungliga `CREATE TABLE` aldrig checkades in i `sql/`.

## Korrigerat i partnerlanen

- `app/api/admin/partners/commission/route.ts`: endast `business_name`.
- `app/api/partners/dashboard/route.ts`: endast `business_name`.
- `lib/partners/webhook.ts`: endast `business_name` och `subscription_plan`.
- `sql/v206_partner_self_billing_business_name.sql`: självfakturan använder
  endast `business_name`.

## Kvarvarande grupper

### P1 — integrationsuppgifter måste läsa rätt lager

- Gamla Google-/Gmailfält används i automationsprovet, debug-mail,
  voice-execute och `lib/gmail-send.ts`.
- `fortnox_token_expires_at` läses fortfarande från `business_config` i
  statusrutten, trots att v96 flyttade hemligheterna till
  `business_integration_credentials`.

Dessa får inte lösas med nya känsliga kolumner på `business_config` eller ett
mekaniskt namnbyte. Anroparna ska använda respektive integrationshelper och
behålla service-role-gränsen.

### P1 — enkla kanoniska fältbyten

- `bankgiro_number` → `bankgiro`
- `contact_phone` → `phone_number` eller `public_phone` beroende på mottagare
- `website` → `website_url`

Varje berörd PDF-/portal-/faktureringsväg behöver ett riktat rendertest efter
bytet, eftersom korrekt kolumnnamn inte ensamt bevisar korrekt avsändardata.

### P1 — fält utan säker direkt ersättare

- `tagline` finns inte på live-tabellen. Där ytan redan har `service_area` som
  fallback ska den användas uttryckligt; annars ska fältet utelämnas.
- `deletion_requested_at` finns i en äldre lös SQL-fil men inte i live-schema.
  GDPR-rutten behöver ett separat beslut: kör en reserverad migration eller
  flytta begäran till en dedikerad auditerad tabell.

## Facitdisciplin

De 24 nuvarande avvikelserna är undantagna med **fil + tabell + kolumn**, inte
bara kolumnnamn. Därför blir testet rött om samma fantomfält kopieras till en
ny fil. Listan är storlekslåst och får bara krympa.

Snapshoten finns i `tests/fixtures/production-schema-columns.json`. När en
manuellt körd migration ändrar `business_config` ska snapshoten uppdateras från
PostgREST OpenAPI i samma leverans; repots SQL är inte ensamt bevis för vad som
verkar i produktion.
