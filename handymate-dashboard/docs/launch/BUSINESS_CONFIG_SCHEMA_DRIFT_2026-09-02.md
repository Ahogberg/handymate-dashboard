# Business config — skarp schemaavvikelse

**Datum:** 2026-09-02  
**Källa:** Supabase PostgREST OpenAPI med service-role, read-only  
**Status:** partnerlanen, kundsynliga fält och Google/Gmail-lagret korrigerade; 2 filbundna avvikelser återstår i kolumnkontraktet

`sql/v206_partner_self_billing_business_name.sql` verifierades 2026-09-02
som exponerad RPC i produktionens PostgREST OpenAPI. V207-fälten var vid
samma kontroll ännu inte exponerade.

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

## Korrigerat i kundsynliga dokumentvägar

- `bankgiro_number` läses nu som `business_config.bankgiro` och mappas till
  fakturans dokumentfält.
- Kundvänd telefon använder `public_phone` med `phone_number` som fallback.
- `website` läses som `website_url`.
- Den obefintliga `tagline` ersätts av det redan använda, sanna
  `service_area`-fältet.

Detta omfattar offert-PDF/preview, påminnelse-PDF, portalens fakturadokument,
byggdagboks-PDF, tidrapport och två projekt-till-faktura-vägar.

## Kvarvarande grupper

### Korrigerat — Google/Gmail läser rätt lager

- Automationsprovet, debug-mail, voice-execute och `lib/gmail-send.ts` läser
  nu den kanoniska `calendar_connection`.
- Tokenförnyelse persisteras på samma anslutningsrad före fortsatt skrivning.
- OAuth-callbackens tysta skrivning till obefintliga `business_config`-fält är
  borttagen.

### Korrigerat — Fortnox läser rätt lager

- Statusrutten läser nu tokenutgång via `getFortnoxConfig`, som hämtar
  hemligheten från `business_integration_credentials`.
- Demo-simuleringen skriver sin statusmarkör till samma lager och replay-rutten
  städar den. Ingen Fortnox-hemlighet skrivs längre till `business_config`.

Dessa får inte lösas med nya känsliga kolumner på `business_config` eller ett
mekaniskt namnbyte. Anroparna ska använda respektive integrationshelper och
behålla service-role-gränsen.

### P1 — fält utan säker direkt ersättare

- `deletion_requested_at` finns i en äldre lös SQL-fil men inte i live-schema.
  `sql/v207_gdpr_deletion_request_fields.sql` versionssätter den redan avsedda
  modellen men ska köras manuellt. Tills dess står undantaget kvar och rutten
  ska betraktas som ej verksam.

## Facitdisciplin

De 2 nuvarande avvikelserna är undantagna med **fil + tabell + kolumn**, inte
bara kolumnnamn. Därför blir testet rött om samma fantomfält kopieras till en
ny fil. Listan är storlekslåst och får bara krympa.

Snapshoten finns i `tests/fixtures/production-schema-columns.json`. När en
manuellt körd migration ändrar `business_config` ska snapshoten uppdateras från
PostgREST OpenAPI i samma leverans; repots SQL är inte ensamt bevis för vad som
verkar i produktion.

Vakten granskar nu också explicita nycklar i `.insert({ ... })`,
`.update({ ... })` och `.upsert({ ... })` via TypeScripts AST. Det stängde
ytterligare tysta fel som select-vakten inte kunde se:

- `pipeline_automation` fick tre kolumner som aldrig funnits; hela
  kompatibilitets-upserten avvisades. De felaktiga nycklarna är borttagna och
  båda kompatibilitetsskrivningarnas fel läses nu.
- demo-seedningen skrev `project.address`, vilket gjorde att resetten stannade
  på första projektet. Adressen finns redan sanningsenligt på kund/offert och
  dupliceras inte längre på projektet.
- den äldre `ai_suggestion`-kön blandade `action_data` med livefältet
  `suggested_data`, samt skrev obefintliga godkännandetidpunkter. Producenter,
  konsumenter och statusuppdatering använder nu livekontraktet
  `suggested_data` + `actioned_at`.

`getAuthenticatedBusiness` normaliserar dessutom det historiska
`contact_phone`-API:t från `public_phone`/`phone_number`, så äldre anropare inte
tappar företagets telefon trots att live-tabellen aldrig haft kolumnen.
