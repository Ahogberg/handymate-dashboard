-- v209: kolumner som deklarerats i sql/ men aldrig körts mot produktionen
--
-- BAKGRUND (2026-09-02): en genomgång av alla 352 filer i sql/ mot det skarpa
-- schemat (information_schema) visade att tre migrationer aldrig kördes.
-- Koden räknade med kolumnerna ändå. Eftersom PostgREST underkänner HELA
-- selecten när EN kolumn är okänd blir en saknad kolumn inte ett tomt fält
-- utan ett 42703 som fäller hela rutten.
--
-- Körd mot produktion 2026-09-02 och verifierad med information_schema efteråt.
--
-- 1. sql/v135_business_registered_address.sql — Bolagsverket-adressen.
--    Vitlistad i app/api/onboarding/route.ts men gick inte att spara.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_city text;
COMMENT ON COLUMN business_config.address_street IS
  'Gatuadress, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';
COMMENT ON COLUMN business_config.address_postal_code IS
  'Postnummer, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';
COMMENT ON COLUMN business_config.address_city IS
  'Postort, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';

-- 2. sql/add_quote_lost_reason.sql — anledningen när en kund tackar nej.
--    app/api/quotes/public/[token]/route.ts skrev den best-effort och loggade
--    "lost_reason ej sparat (kör add_quote_lost_reason.sql)". Nu sparas den.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lost_reason TEXT;

-- 3. sql/lead_intelligence.sql — analysen bakom /api/analytics/win-loss och
--    /api/analytics/speed-to-lead. Båda rutterna gav 42703 innan detta.
--
--    OBS: filens rad `ADD COLUMN ... loss_reason TEXT` är MEDVETET utelämnad.
--    deal.lost_reason finns redan och är ifylld på 22 av 97 rader, och hela
--    skrivvägen använder det namnet. En ny, tom loss_reason hade fått
--    win-loss-rapporten att SE ut som att den fungerar medan den visade
--    "Okänd" på varje förlorad affär — värre än det hårda felet, för det
--    hade ingen upptäckt. Läsaren rättades i stället:
--    app/api/analytics/win-loss/route.ts läser nu lost_reason.
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_score_factors JSONB;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_reasoning TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS suggested_action TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS estimated_value NUMERIC;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS loss_reason_detail TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS won_value NUMERIC;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lost_value NUMERIC;
CREATE INDEX IF NOT EXISTS idx_deal_business_created ON deal (business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deal_business_stage ON deal (business_id, stage_id);
