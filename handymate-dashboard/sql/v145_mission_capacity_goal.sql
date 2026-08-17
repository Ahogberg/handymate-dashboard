-- v145: Mission — kapacitetsmål som andra uppdragstypen (Goal-to-Plan V2)
--
-- KÖRS MANUELLT i Supabase SQL Editor. Kräver att v144_mission.sql är körd.
--
-- V1 var medvetet bara pengamål (goal_kr + deadline). V2 lägger till
-- kapacitetsmål ("fyll nästa veckas luckor"): målet är TIMMAR att boka,
-- inte kronor att driva in — progressen mäts mot bokade timmar/konfigurerad
-- kapacitet (lib/capacity/week-capacity.ts), aldrig mot pengar.
-- Sanningsdisciplinen består: timmar och kronor blandas ALDRIG i en siffra.
--
-- goal_kr blir nullbar; den gamla radnivå-checken ersätts av en branchad:
-- pengamål kräver goal_kr, kapacitetsmål kräver goal_hours. Befintliga
-- rader (alla 'money' via DEFAULT) förblir giltiga oförändrade.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mission') IS NULL THEN
    RAISE EXCEPTION 'v145 kräver att v144_mission.sql är körd först';
  END IF;
END $$;

ALTER TABLE public.mission
  ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'money'
    CHECK (goal_type IN ('money', 'capacity'));

ALTER TABLE public.mission
  ADD COLUMN IF NOT EXISTS goal_hours NUMERIC;

ALTER TABLE public.mission
  ALTER COLUMN goal_kr DROP NOT NULL;

ALTER TABLE public.mission
  DROP CONSTRAINT IF EXISTS mission_goal_kr_check;

ALTER TABLE public.mission
  DROP CONSTRAINT IF EXISTS mission_goal_by_type_check;

ALTER TABLE public.mission
  ADD CONSTRAINT mission_goal_by_type_check CHECK (
    (goal_type = 'money' AND goal_kr IS NOT NULL AND goal_kr > 0 AND goal_hours IS NULL)
    OR (goal_type = 'capacity' AND goal_hours IS NOT NULL AND goal_hours > 0 AND goal_kr IS NULL)
  );

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='mission'
--   AND column_name IN ('goal_type','goal_kr','goal_hours');
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.mission'::regclass AND conname LIKE 'mission_goal%';
