-- v211_kontoradering.sql
--
-- Kontoradering i appen (Apple 5.1.1(v) + Google Play), beslut Andreas
-- 2026-09-04 (tasks/plan-kontoradering.md).
--
-- Lägger ENDAST till två kolumner på business_config för mjuk radering av
-- firman. Ingen DELETE, ingen DROP, inga defaults, inga destruktiva satser.
--
-- VARFÖR MJUK RADERING: business_config har inget deleted_at idag
-- (verifierat mot information_schema 2026-09-04). `invoice` har
-- ON DELETE CASCADE mot business_config — en hård DELETE FROM business_config
-- skulle alltså radera fakturorna, precis det bokföringslagen förbjuder
-- (7 års sparkrav). 26 andra tabeller har NO ACTION mot business_config och
-- skulle få en DELETE att misslyckas med FK-fel ändå. Raden ligger därför
-- kvar — bara döden stämplas — medan persondata och inloggningar raderas
-- separat (app/api/account/delete/route.ts, lib/account/radera.ts).
--
-- KÖRS INTE HÄR. Enligt CLAUDE.md/Handymate-specifikt: skapas som granskningsbar
-- fil i sql/, körs via Supabase MCP FÖRST när Andreas skriver "kör" i chatten,
-- och verifieras då direkt med en SELECT.

alter table business_config add column if not exists deleted_at timestamptz;
alter table business_config add column if not exists deleted_by text;

create index if not exists idx_business_config_deleted
  on business_config(deleted_at)
  where deleted_at is not null;
