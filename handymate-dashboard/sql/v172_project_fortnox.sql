-- v172: Projekt i Fortnox projektregister (2026-08-26, steg 3 i
-- leverantorsfaktura-kedjan: "stang loopen fran var sida")
--
-- Nar ett projekt skapas i Handymate skapas det aven i Fortnox
-- (POST /projects) - samma monster som kundnumren (v169/Del 1). Da kan
-- bokforaren/Fortnox inkorg valja ratt projekt ur en lista nar en
-- leverantorsfaktura konteras, och matchningen (lib/fortnox/
-- match-supplier-invoice.ts) far en EXAKT nyckel att jamfora mot.
-- Vara kundfakturor bokfors ocksa med Project satt.
--
-- Additivt. Fortnox ProjectNumber = siffrorna i vart projektnummer
-- ("P-1042" -> "1042"). FLAGGAT Pass 3/I2: Fortnox faltformat.

ALTER TABLE project ADD COLUMN IF NOT EXISTS fortnox_project_number TEXT;
ALTER TABLE project ADD COLUMN IF NOT EXISTS fortnox_synced_at      TIMESTAMPTZ;
ALTER TABLE project ADD COLUMN IF NOT EXISTS fortnox_sync_error     TEXT;

COMMENT ON COLUMN project.fortnox_project_number IS
  'ProjectNumber i Fortnox projektregister (skapas vid projektets fodelse via lib/fortnox.ts syncProjectToFortnox, skyddsnat i 2h-cronens batchSync). NULL = ej synkad.';
COMMENT ON COLUMN project.fortnox_synced_at IS
  'Nar projektet skapades/verifierades i Fortnox.';
COMMENT ON COLUMN project.fortnox_sync_error IS
  'Senaste felet fran projektsynken (NULL = senaste forsoket lyckades).';

CREATE INDEX IF NOT EXISTS idx_project_business_fortnox_unsynced
  ON project (business_id, created_at) WHERE fortnox_project_number IS NULL;

-- Facit-verifiering EFTER:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='project' AND column_name IN ('fortnox_project_number','fortnox_synced_at','fortnox_sync_error');
--     -> 3 rader
