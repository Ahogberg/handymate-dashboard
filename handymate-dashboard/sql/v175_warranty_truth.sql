-- v175: Garantisanningen (Fastighetspasset steg 3, grind 3)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Jobbpasset lovade "Standardgaranti 12 månader" ur en hårdkodad konstant —
-- borttaget 2026-08-27. Garantier varierar stort mellan branscher och en
-- generisk text lovar mer än företaget ansvarar för. Tabellen `warranty`
-- (sql/sprint_cd.sql) skiljer inte på VEM som ansvarar (tillverkaren,
-- företaget, en avtalspart) eller VAR uppgiften kommer ifrån, och saknar
-- koppling till projekt och installation.
--
-- BESLUT (Andreas grind 3, 2026-08-27)
-- En garanti får bara visas för kunden när den är registrerad med
--   warranty_kind  — product (produktgaranti) | workmanship (utförandegaranti)
--                    | service_agreement (serviceavtal)
--   issuer         — garantigivaren i klartext ("Nibe", "Provfirman Snickeri AB")
--   source         — product_info (produktinformationen) | contract (avtalet)
--                    | craftsman (hantverkarens egen utfästelse)
-- CHECK-villkoret nedan gör en garantityp utan garantigivare och källa omöjlig
-- att spara. Befintliga rader (0 i prod) och den gamla `warranty_type`-
-- kolumnen lever kvar orörda — rader utan warranty_kind når aldrig kundvyn.
--
-- project_id / installation_id binder garantin till det som faktiskt gjordes
-- respektive det som sitter hos kunden (v174). ON DELETE SET NULL — garantin
-- är ett löfte som överlever att raden den pekar på städas.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.warranty') IS NULL
     OR to_regclass('public.installation') IS NULL THEN
    RAISE EXCEPTION 'v175 kräver warranty (sprint_cd) och installation (v174)';
  END IF;
END $$;

ALTER TABLE public.warranty
  ADD COLUMN IF NOT EXISTS project_id TEXT
    REFERENCES public.project(project_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS installation_id TEXT
    REFERENCES public.installation(installation_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_kind TEXT,
  ADD COLUMN IF NOT EXISTS issuer TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_kind_check') THEN
    ALTER TABLE public.warranty ADD CONSTRAINT warranty_kind_check
      CHECK (warranty_kind IS NULL OR warranty_kind IN ('product', 'workmanship', 'service_agreement'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_source_check') THEN
    ALTER TABLE public.warranty ADD CONSTRAINT warranty_source_check
      CHECK (source IS NULL OR source IN ('product_info', 'contract', 'craftsman'));
  END IF;
  -- Grind 3: typ ⇒ garantigivare + källa. Aldrig ett löfte utan avsändare.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warranty_kind_needs_issuer_and_source') THEN
    ALTER TABLE public.warranty ADD CONSTRAINT warranty_kind_needs_issuer_and_source
      CHECK (warranty_kind IS NULL OR (issuer IS NOT NULL AND source IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warranty_business_project
  ON public.warranty (business_id, project_id);
CREATE INDEX IF NOT EXISTS idx_warranty_business_installation
  ON public.warranty (business_id, installation_id);

COMMENT ON COLUMN public.warranty.warranty_kind IS
  'product = produktgaranti · workmanship = utförandegaranti · service_agreement = serviceavtal. NULL = äldre rad, visas aldrig för kunden.';
COMMENT ON COLUMN public.warranty.issuer IS
  'Garantigivaren i klartext — den som faktiskt ansvarar (tillverkare, företaget, avtalspart). Krävs när warranty_kind är satt.';
COMMENT ON COLUMN public.warranty.source IS
  'product_info = produktinformationen · contract = avtalet · craftsman = hantverkarens egen utfästelse. Krävs när warranty_kind är satt.';

COMMIT;

-- Verifiera efteråt:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.warranty'::regclass AND conname LIKE 'warranty_%' ORDER BY conname;
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='warranty'
--   AND column_name IN ('project_id','installation_id','warranty_kind','issuer','source');
