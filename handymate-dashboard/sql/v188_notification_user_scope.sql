-- v188 — personscope för riktade notifikationer
--
-- KÖRS MANUELLT i Supabase SQL Editor. Körs aldrig programmatiskt.
--
-- notification.user_id = NULL är en avsiktlig företagsbroadcast och syns
-- för alla medlemmar i rätt tenant. En satt user_id är däremot privat för
-- exakt den auth-användaren. API:t använder service_role, så samma regel
-- finns även där; RLS är den oberoende spärren för direkta klientläsningar.

BEGIN;

ALTER TABLE public.notification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_tenant_member ON public.notification;
DROP POLICY IF EXISTS notification_service_role ON public.notification;
DROP POLICY IF EXISTS notification_member_select ON public.notification;
DROP POLICY IF EXISTS notification_member_insert ON public.notification;
DROP POLICY IF EXISTS notification_member_update ON public.notification;
DROP POLICY IF EXISTS notification_member_delete ON public.notification;

CREATE POLICY notification_member_select
  ON public.notification
  FOR SELECT
  TO authenticated
  USING (
    public.is_business_member(business_id)
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY notification_member_insert
  ON public.notification
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_business_member(business_id)
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY notification_member_update
  ON public.notification
  FOR UPDATE
  TO authenticated
  USING (
    public.is_business_member(business_id)
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  )
  WITH CHECK (
    public.is_business_member(business_id)
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY notification_member_delete
  ON public.notification
  FOR DELETE
  TO authenticated
  USING (
    public.is_business_member(business_id)
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );

CREATE POLICY notification_service_role
  ON public.notification
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.notification FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification TO authenticated;
GRANT ALL ON TABLE public.notification TO service_role;

COMMIT;

-- Manuell kontroll efter körning:
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notification'
ORDER BY policyname;
