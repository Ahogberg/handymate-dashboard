-- v221: Portalens beslutskort (Varumärkeslagret yta 4, 2026-09-07)
--
-- KÖRS MANUELLT i Supabase SQL Editor FÖRE koden pushas: portalens
-- review-route INSERT:ar i portal_review och /api/portal/[token] SELECT:ar
-- portal_ata_signature_mode redan i sin första commit — utan migrationen
-- 42703:ar portalens rotanrop och hela kundportalen blir vit.
--
-- ═══ VARFÖR ═══
--
-- 1. Omdömet kunden lämnar i portalen (Hur blev det?) sparades ALDRIG —
--    PortalReviewCTA var ett rent konverteringssteg mot Google. Designen
--    (Kundportal beslut.dc.html) skiljer på lågt betyg (1–3: går till
--    hantverkaren, aldrig till Google) och högt (4–5: sparas + Google-kort).
--    Båda vägarna kräver en rad att stå på. review_request är utskicks-
--    loggen (när vi FRÅGADE), portal_review är svaret (vad kunden SA).
--
-- 2. ÄTA-godkännande i portalen: designen gör "namn + kryss" till standard
--    (bindande, ersätter signatur) och ritad signatur till ett val per firma.
--    business_config.portal_ata_signature_mode bär valet. Inga befintliga
--    rader påverkas — default 'name_checkbox' gäller alla.
--
-- ═══ KOLLA FÖRST ═══
--   ls sql | grep v22    -- v221 ska vara ledigt (Codex delar serien)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL
     OR to_regclass('public.customer') IS NULL THEN
    RAISE EXCEPTION 'v221 kräver business_config och customer';
  END IF;
  IF to_regprocedure('public.is_business_member(text)') IS NULL THEN
    RAISE EXCEPTION 'v221 kräver is_business_member(text) (sql/v101_tenant_rls_projektdomanen.sql)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. portal_review — kundens svar på "Hur blev det?"
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS portal_review (
  id TEXT PRIMARY KEY DEFAULT 'prv_' || md5(random()::text || clock_timestamp()::text),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  -- MEDVETET ingen FK mot customer: kunden kan GDPR-raderas, omdömet är
  -- hantverkarens (anonymiserat av att raden pekar på ett tomt id).
  customer_id TEXT NOT NULL,
  project_id TEXT,

  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT,

  -- Lågt betyg (≤ 3) skapar en customer_message + godkännandekort så
  -- hantverkaren hör av sig. Kolumnen gör vägen spårbar utan join.
  forwarded_to_thread BOOLEAN NOT NULL DEFAULT false,
  -- Sätts när kunden klickar "Recensera på Google" (bara ≥ 4).
  google_clicked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_review_customer
  ON portal_review(business_id, customer_id, created_at DESC);

-- RLS enligt v101-mönstret: exakt två policyer, tenant-medlemmen via
-- is_business_member och service_role (portalen skriver via service-nyckeln).
ALTER TABLE portal_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_review_tenant_member ON public.portal_review;
CREATE POLICY portal_review_tenant_member
  ON public.portal_review FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS portal_review_service_role ON public.portal_review;
CREATE POLICY portal_review_service_role
  ON public.portal_review FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.portal_review FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_review TO authenticated;
GRANT ALL ON TABLE public.portal_review TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. business_config.portal_ata_signature_mode — namn+kryss eller ritad
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS portal_ata_signature_mode TEXT NOT NULL DEFAULT 'name_checkbox';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'business_config_portal_ata_signature_mode_check'
  ) THEN
    ALTER TABLE business_config
      ADD CONSTRAINT business_config_portal_ata_signature_mode_check
      CHECK (portal_ata_signature_mode IN ('name_checkbox', 'drawn'));
  END IF;
END $$;

COMMIT;

-- ═══ VERIFIERING EFTER KÖRNING ═══

-- 1. Tabellen finns med rätt kolumner.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'portal_review'
ORDER BY ordinal_position;

-- 2. RLS-policyerna — exakt två.
SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'portal_review';

-- 3. Signeringsläget finns med default.
SELECT column_name, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'business_config'
  AND column_name = 'portal_ata_signature_mode';
