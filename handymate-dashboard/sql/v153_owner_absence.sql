-- v153: Owner Absence V1 — "Matte håller ställningarna" (Etapp Å, 2026-08-18)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Ägaren kan sätta ett frånvarofönster ("Jag är borta till fredag"). Under
-- fönstret samlas normala händelser i stället för att pusha; endast en
-- sluten lista deterministiska eskaleringsklasser (lib/absence/escalation.ts)
-- får pusha igenom. Frånvaron ger ALDRIG mer behörighet än ägaren redan gett
-- — den här migrationen lägger BARA till ett läsbart fönster, ingen
-- exekveringsväg rör den.
--
-- BESLUT
-- Ett JSONB-fält på automation_settings, samma precedent som
-- auto_approve_config (sql/autonomy_level3.sql: "ALTER TABLE
-- automation_settings ADD COLUMN IF NOT EXISTS ... JSONB"). Vald framför en
-- egen tabell: automation_settings har redan en delad läs/skriv-väg
-- (lib/automations.ts getAutomationSettings/updateAutomationSettings,
-- fail-soft till defaults om raden/tabellen saknas) — en ny tabell hade
-- krävt egen RLS-uppsättning och ett eget I/O-lager för ett enda litet
-- objekt (from/to/set_by/set_at).
--
-- Fönstret UPPHÖR AUTOMATISKT genom läs-tids-check (isAbsenceActive i
-- lib/absence/absence-window.ts jämför `to` mot `now()` vid varje läsning)
-- — ingen cron, ingen städning. Ägaren kan avsluta tidigt genom att sätta
-- `to` till "nu" (samma fält, ingen extra status-kolumn).
--
-- Form: { "from": ISO8601, "to": ISO8601, "set_by": business_users.id,
--          "set_at": ISO8601 } eller NULL (aldrig satt / ingen migration körd).

BEGIN;

ALTER TABLE automation_settings
  ADD COLUMN IF NOT EXISTS owner_absence JSONB DEFAULT NULL;

COMMIT;

-- Verifiera efteråt:
-- SELECT business_id, owner_absence FROM automation_settings
--   WHERE owner_absence IS NOT NULL;
