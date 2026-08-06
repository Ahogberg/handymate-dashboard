-- v92: momsregistreringsnummer + storage-policy för logotyper
-- Kör manuellt i Supabase SQL Editor. Idempotent.
-- =============================================================================
--
-- BAKGRUND (rotorsaksanalys 2026-08-06): pilotkunden Bee hade sin logotyp
-- inlagd men den syntes aldrig på offerter. Orsaken var att fyra klient-
-- selecter mot business_config begärde `vat_number` — en kolumn som ingen
-- migration någonsin skapat. PostgREST 400:ar HELA frågan när en kolumn
-- saknas, så businessConfig blev null och logotypen föll tillbaka på
-- initialbokstaven. Företagsnamnet såg rätt ut (det kommer från en annan
-- källa), vilket gjorde felet osynligt i tre månader.
--
-- Koden är nu oberoende av den här migrationen — klientytorna använder
-- select('*') och kan inte gå sönder på en saknad kolumn. Den här filen
-- gör att momsnumret FAKTISKT kan visas i dokumentets footer, vilket
-- lib/quote-templates/data-builder.ts:264 alltid försökt läsa.
--
-- Verifiering efter körning:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'business_config' AND column_name = 'vat_number';
--   SELECT id, public FROM storage.buckets WHERE id = 'business-assets';

-- ============================================================
-- 1. Momsregistreringsnummer
-- ============================================================
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS vat_number TEXT;

COMMENT ON COLUMN business_config.vat_number IS
  'Momsregistreringsnummer (t.ex. SE556677889901). Visas i offertens och fakturans footer via data-builder (momsRegnr).';

-- ============================================================
-- 2. Storage: business-assets ska vara publik
-- ============================================================
-- sql/v48_storage_bucket_fix.sql säkrade customer-documents och project-files
-- men INTE business-assets — den bucket där logotyperna ligger. Utan publik
-- läsning returnerar logotyp-URL:en 403 och bilden blir en bruten länk i
-- kundens offert, oavsett hur rätt allt annat är.
UPDATE storage.buckets SET public = true WHERE id = 'business-assets';

DROP POLICY IF EXISTS "Public read business-assets" ON storage.objects;
CREATE POLICY "Public read business-assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'business-assets');
