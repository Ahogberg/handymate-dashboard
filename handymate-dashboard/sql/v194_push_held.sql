-- v194: Tyst tid för push (2026-09-02).
--
-- push_held — pushar av klasserna hant/teamuppdatering som skapas under
-- tyst tid (21:00–07:00 svensk tid, lib/notifications/tyst-tid.ts) hålls
-- här av sendApprovalPush i stället för att skickas. /api/cron/push-morgon
-- släpper dem som EN morgonsammanfattning per mottagare och stämplar
-- released_at + release_outcome. Klassen beslut hålls aldrig.
--
-- service_role-only, samma låsning som v191 (RLS på, inga policyer, inga
-- grants till anon/authenticated). Koden är fail-open tills filen körts:
-- saknad tabell → pushen skickas direkt, som idag.
--
-- Det partiella unika indexet gör hållningen idempotent: samma händelse
-- (dedupe-nyckel) hålls högst en gång tills den släppts.

CREATE TABLE IF NOT EXISTS public.push_held (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  target_user_id text,
  approval_type text NOT NULL,
  push_class text NOT NULL,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '/dashboard',
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  release_outcome text CHECK (release_outcome IN ('skickad', 'utgangen', 'ingen_mottagare', 'misslyckad'))
);

CREATE UNIQUE INDEX IF NOT EXISTS push_held_open_dedupe_idx
  ON public.push_held (business_id, dedupe_key)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS push_held_open_idx
  ON public.push_held (created_at)
  WHERE released_at IS NULL;

ALTER TABLE public.push_held ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_held FROM anon, authenticated, PUBLIC;

-- Facit efter körning:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'push_held';  → true
--   SELECT indexname FROM pg_indexes WHERE tablename = 'push_held';
--   → push_held_pkey, push_held_open_dedupe_idx, push_held_open_idx
--   SELECT grantee FROM information_schema.role_table_grants
--    WHERE table_name = 'push_held' AND grantee IN ('anon','authenticated');  → 0 rader
