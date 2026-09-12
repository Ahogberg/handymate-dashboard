-- Reviewed deployment SQL; NOT applied to production. Run before the paired app release.
-- Supabase CLI is unavailable in this workspace; register with migration tooling at deployment.
BEGIN;

-- Service-role APIs remain authoritative. Retain only the overview's safe client projection.
ALTER TABLE public.calendar_connection ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.calendar_connection FROM PUBLIC, anon, authenticated;
-- Table revocation does not remove pre-existing column grants.
DO $$
DECLARE col text;
BEGIN
  FOR col IN SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'calendar_connection'
  LOOP
    EXECUTE format('REVOKE ALL (%I) ON public.calendar_connection FROM PUBLIC, anon, authenticated', col);
  END LOOP;
END $$;
GRANT SELECT (id, business_id, gmail_sync_enabled) ON public.calendar_connection TO authenticated;
GRANT ALL ON public.calendar_connection TO service_role;

-- Legacy rows retain their original identifiers and are not assigned guessed accounts.
ALTER TABLE public.email_conversations
  ADD COLUMN IF NOT EXISTS mail_provider text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS mail_account text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE public.email_conversations DROP CONSTRAINT IF EXISTS email_conversations_gmail_message_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS email_conversations_legacy_identity
  ON public.email_conversations (business_id, gmail_message_id) WHERE mail_provider = 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS email_conversations_provider_identity
  ON public.email_conversations (business_id, mail_provider, mail_account, provider_message_id)
  WHERE mail_provider <> 'legacy';
ALTER TABLE public.email_conversations DROP CONSTRAINT IF EXISTS email_conversations_provider_identity_required;
ALTER TABLE public.email_conversations ADD CONSTRAINT email_conversations_provider_identity_required CHECK (
  mail_provider = 'legacy' OR (
    mail_provider IN ('google', 'microsoft') AND length(btrim(mail_account)) > 0
    AND provider_message_id IS NOT NULL AND length(btrim(provider_message_id)) > 0
    AND business_id IS NOT NULL
  )
);
COMMIT;
