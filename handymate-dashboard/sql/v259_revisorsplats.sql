-- v259 (2026-09-18): revisorsplatsen — en läsande roll i business_users.
--
-- Andreas beslut: firmans redovisningskonsult ska kunna bjudas in och se
-- siffrorna utan att kunna röra något. Nästan varje svensk hantverksfirma har
-- en konsult, och det är ofta DEN personen som säger "det måste gå att få ut
-- till Fortnox annars byter vi inte".
--
-- Läget före körning, kontrollerat: business_users.role har en CHECK med fem
-- värden (owner, admin, employee, project_manager, kalkylator). Rutten
-- POST /api/team/invite validerar INTE rollen i koden — den skickar
-- body.role rakt in och litar på den här constrainten. Constrainten är
-- alltså enda validering som finns, och därför den enda ändring som behövs
-- i databasen för att rollen ska kunna delas ut.
--
-- Behörigheten bor INTE här. can_*-flaggorna på raden är data som någon kan
-- bocka i; rollen är sanningen. lib/auth/lasbehorighet.ts avgör vad en
-- läsroll får göra, och lib/auth.ts nekar allt som inte är en läsning.

ALTER TABLE public.business_users DROP CONSTRAINT IF EXISTS business_users_role_check;

ALTER TABLE public.business_users
  ADD CONSTRAINT business_users_role_check
  CHECK (role = ANY (ARRAY[
    'owner'::text,
    'admin'::text,
    'employee'::text,
    'project_manager'::text,
    'kalkylator'::text,
    'revisor'::text
  ]));

COMMENT ON COLUMN public.business_users.role IS
  'owner/admin/employee/project_manager/kalkylator/revisor. revisor är en LÄSROLL — lib/auth.ts nekar allt utom GET/HEAD/OPTIONS för den, oavsett can_*-flaggor.';

-- Read-only verifiering efter körning.
SELECT pg_get_constraintdef(c.oid) AS villkor
FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
WHERE t.relname = 'business_users' AND c.conname = 'business_users_role_check';
SELECT role, count(*) AS antal FROM public.business_users GROUP BY role ORDER BY role;

-- ─────────────────────────────────────────────────────────────────────────
-- LEVANDE BEVIS, kört 2026-09-18 mot produktion på rollprovskontot:
--   INSERT med role='revisor' accepterades (bu_revprov_*, biz_rollprov_a).
--   UPDATE till role='bokforare' nekades av CHECK (check_violation).
--   Raden bar can_create_invoices = true och fick den ändå aldrig använda:
--   hasPermission() ignorerar flaggan för en läsroll och lib/auth.ts nekar
--   varje icke-läsning. Provraden städad efteråt, avgränsad på namnet.
-- DELETE FROM public.business_users WHERE name = 'ZZ-TEST revisorsprov';
