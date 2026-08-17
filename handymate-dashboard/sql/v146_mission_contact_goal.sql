-- v146: Mission — kontaktmål som tredje uppdragstypen (Goal-to-Plan V2, Etapp I)
--
-- KÖRS MANUELLT i Supabase SQL Editor. Kräver v144 + v145.
--
-- Kontaktmål: "nå N kunder före deadline" — målet är ett ANTAL kunder,
-- inte kronor eller timmar. Segment-agnostiskt (vilka kunder bestäms av
-- planstegen ur portföljen), kanal-agnostiskt (SMS/mejl räknas lika via
-- kommunikationsspåret). Sanningsdisciplinen består: antal, kronor och
-- timmar blandas aldrig i en siffra.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mission') IS NULL THEN
    RAISE EXCEPTION 'v146 kräver v144_mission.sql';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mission' AND column_name='goal_type'
  ) THEN
    RAISE EXCEPTION 'v146 kräver v145_mission_capacity_goal.sql';
  END IF;
END $$;

ALTER TABLE public.mission
  ADD COLUMN IF NOT EXISTS goal_count INTEGER;

ALTER TABLE public.mission
  DROP CONSTRAINT IF EXISTS mission_goal_type_check;

-- v145:s inline-CHECK på goal_type hette default-genererat namn — leta upp
-- och släpp den oavsett namn, ersätt med en named constraint.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.mission'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%goal_type%'
      AND conname <> 'mission_goal_by_type_check'
  LOOP
    EXECUTE format('ALTER TABLE public.mission DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.mission
  ADD CONSTRAINT mission_goal_type_check
  CHECK (goal_type IN ('money', 'capacity', 'contact'));

ALTER TABLE public.mission
  DROP CONSTRAINT IF EXISTS mission_goal_by_type_check;

ALTER TABLE public.mission
  ADD CONSTRAINT mission_goal_by_type_check CHECK (
    (goal_type = 'money'    AND goal_kr IS NOT NULL AND goal_kr > 0
       AND goal_hours IS NULL AND goal_count IS NULL)
    OR (goal_type = 'capacity' AND goal_hours IS NOT NULL AND goal_hours > 0
       AND goal_kr IS NULL AND goal_count IS NULL)
    OR (goal_type = 'contact'  AND goal_count IS NOT NULL AND goal_count > 0
       AND goal_kr IS NULL AND goal_hours IS NULL)
  );

COMMIT;

-- Verifiera efteråt:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.mission'::regclass AND contype='c';
