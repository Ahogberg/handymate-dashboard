-- V39: Kalkylator-roll
-- Kör manuellt i Supabase SQL Editor

-- Uppdatera role-constraint om den finns
DO $$ BEGIN
  ALTER TABLE business_users DROP CONSTRAINT IF EXISTS business_users_role_check;
  ALTER TABLE business_users ADD CONSTRAINT business_users_role_check
    CHECK (role = ANY (ARRAY[
      'owner'::text, 'admin'::text, 'employee'::text,
      'project_manager'::text, 'kalkylator'::text
    ]));
EXCEPTION WHEN OTHERS THEN
  -- Constraint kanske inte finns — ignorera
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
