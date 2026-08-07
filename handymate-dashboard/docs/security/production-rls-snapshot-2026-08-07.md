# Produktionssnapshot: RLS, grants och constraints

**Projekt:** Handymate (`pktaqedooyzgvzwipslu`)

**Miljö:** `main` / Production

**Snapshot:** 2026-08-07 11:14:37 UTC

**Metod:** Read-only `SELECT` i Supabase SQL Editor med rollen `postgres`. Ingen migration kördes.

## Omfattning

Snapshoten täcker tabellerna som N2 räknar pengar ur samt `business_config`, där
integrationsuppgifter lagras:

- `project`
- `project_change`
- `project_material`
- `time_entry`
- `supplier_invoices`
- `business_config`

## Faktiskt policytillstånd

RLS är aktiverat men inte tvingat (`FORCE ROW LEVEL SECURITY = false`) på samtliga sex
tabeller. Alla policyer nedan är `PERMISSIVE`.

| Tabell | Policy | Roller | Kommando | USING | WITH CHECK |
|---|---|---|---|---|---|
| `business_config` | `Service role full access` | `public` | `ALL` | `true` | `true` |
| `project` | `project_all` | `public` | `ALL` | `true` | `true` |
| `project_change` | `change_all` | `public` | `ALL` | `true` | `true` |
| `project_material` | `project_material_all` | `public` | `ALL` | `true` | `true` |
| `supplier_invoices` | `supplier_invoices_all` | `public` | `ALL` | `true` | `true` |
| `time_entry` | `time_entry_all` | `public` | `ALL` | `true` | `true` |
| `time_entry` | `time_entry_delete` | `public` | `DELETE` | `true` | — |
| `time_entry` | `time_entry_insert` | `public` | `INSERT` | — | `true` |
| `time_entry` | `time_entry_select` | `public` | `SELECT` | `true` | — |
| `time_entry` | `time_entry_update` | `public` | `UPDATE` | `true` | — |

`public` omfattar `anon` och `authenticated`. RLS är därför aktivt i namn men ger ingen
tenant-isolering på någon av tabellerna.

## Faktiska grants

`anon` och `authenticated` har följande tabellprivilegier på samtliga sex tabeller:

`DELETE`, `INSERT`, `REFERENCES`, `SELECT`, `TRIGGER`, `TRUNCATE`, `UPDATE`.

Alla är `grantable=NO`. `service_role` har motsvarande privilegier och `postgres` har dem med
`grantable=YES`.

### Credential-kolumner i `business_config`

Följande produktionskolumner identifierades utan att läsa deras värden:

- `fortnox_access_token`
- `fortnox_refresh_token`
- `fortnox_token_expires_at`
- `website_api_key`

Varje kolumn har `SELECT`, `INSERT`, `UPDATE` och `REFERENCES` för både `anon` och
`authenticated`. Tillsammans med policyn `Service role full access TO public USING (true)`
innebär det att webbläsarroller kan läsa integrationsuppgifter i `business_config`.

## Faktiska constraints

Väsentliga fynd:

- `project` har verifierad PK på `project_id`, FK från `customer_id` till
  `customer(customer_id) ON DELETE SET NULL` samt FK för aktuellt workflow-steg.
- `project_change` har endast PK på `change_id`. Det finns ingen FK till `project` eller
  `business_config`.
- `project_material` har PK på `material_id` och produkt-FK:n till grossist/leverantör, men
  ingen FK till `project` eller `business_config`.
- `supplier_invoices` har verifierad FK till `business_config(business_id) ON DELETE CASCADE`
  och till `project(project_id) ON DELETE SET NULL`.
- `time_entry` har verifierade FK:n till `business_config`, `project`, `customer`, `invoice`,
  `booking`, `business_users` och `work_type` samt sina CHECK-/UNIQUE-constraints.
- `business_config` har PK på `business_id`, två UNIQUE-constraints och elva verifierade
  CHECK-constraints. Credential-kolumnerna skyddas inte av separata grants eller vyer.

## Slutsats före härdning

Produktionens fem ekonomitabeller är inte tenant-isolerade för `anon` eller `authenticated`.
`business_config` exponerar dessutom credential-kolumner för samma roller. Repots tidigare
migrationsfiler beskriver alltså inte ett säkert produktionstillstånd.

## Read-only-frågor

Snapshoten byggdes från:

- `pg_policies` tillsammans med `pg_class.relrowsecurity` och `relforcerowsecurity`
- `information_schema.table_privileges` och `column_privileges`
- `pg_constraint` med `pg_get_constraintdef(...)`

Alla frågor var `SELECT`. Värden ur credential-kolumnerna hämtades aldrig.
