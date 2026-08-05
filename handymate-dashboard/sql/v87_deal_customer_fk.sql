-- v87: FK för deal.customer_id (sanering 2026-08-05)
--
-- pipeline.sql deklarerade deal.customer_id TEXT helt utan REFERENCES och
-- ingen senare migration la till den — verifierat i prod via pg_constraint
-- (deal har bara business_id- och stage_id-FK). Utan FK:n avvisar PostgREST
-- alla deal→customer-embeds (PGRST200). Koden är numera oberoende av FK:n
-- (separat kundhämtning i lib/e2e-deal-flow.ts) men constrainten bör finnas
-- för datakvalitet och för att embeds ska vara möjliga framåt.
--
-- Idempotent — säker att köra flera gånger. NOT VALID gör att befintliga
-- föräldralösa rader inte blockerar; validera separat när det passar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_customer_id_fkey'
  ) THEN
    ALTER TABLE deal
      ADD CONSTRAINT deal_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Kör denna separat efteråt (låser mindre; failar om föräldralösa rader
-- finns — rensa i så fall först med queryn nedan):
-- ALTER TABLE deal VALIDATE CONSTRAINT deal_customer_id_fkey;
--
-- Hitta ev. föräldralösa rader:
-- SELECT d.id, d.customer_id FROM deal d
--   LEFT JOIN customer c ON c.customer_id = d.customer_id
--   WHERE d.customer_id IS NOT NULL AND c.customer_id IS NULL;
