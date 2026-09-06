-- Kundunderlag och förberedelser. Kör före aktivering; inga befintliga data ändras.
BEGIN;
CREATE TABLE IF NOT EXISTS public.customer_preparation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id text NOT NULL REFERENCES public.business_config(business_id),
  customer_id text NOT NULL REFERENCES public.customer(customer_id),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  template text NOT NULL CHECK (template IN ('charging','start')),
  context text NOT NULL CHECK (length(context) BETWEEN 1 AND 600),
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','submitted','reviewed','cancelled')),
  answers jsonb NOT NULL DEFAULT '{}',
  images jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  submitted_at timestamptz,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS customer_preparation_customer ON public.customer_preparation(business_id, customer_id, created_at DESC);
ALTER TABLE public.customer_preparation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_preparation FROM anon, authenticated;
GRANT ALL ON public.customer_preparation TO service_role;
-- API: aktiv owner/admin + business_id för företag; separat token för kund.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-preparation', 'customer-preparation', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Existing permissive storage policies must not grant access to this bucket.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'customer_preparation_service_only') THEN
    CREATE POLICY customer_preparation_service_only ON storage.objects
      AS RESTRICTIVE FOR ALL TO anon, authenticated
      USING (bucket_id <> 'customer-preparation')
      WITH CHECK (bucket_id <> 'customer-preparation');
  END IF;
END $$;
COMMIT;
