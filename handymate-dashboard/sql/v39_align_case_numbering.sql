-- v39: Sammanslagen ärendenummer-räknare för deals + projects
--
-- Tidigare hade deals (deal_number, INTEGER) och projects (project_number, "P-XXXX")
-- helt separata räknare. Det ledde till att deal #1003 inte hade någon koppling till
-- projektnummer — båda startade på 1001 och drev isär.
--
-- Nu delar de samma per-företag-räknare ('project' i business_counters):
--   - Ny deal → drar nästa nummer från räknaren → deal_number = N
--   - Den dealen vinner → projekt skapas med project_number = "P-N" (samma N)
--   - Fristående projekt utan deal → drar nästa nummer från räknaren → "P-N+1"
--
-- Den här migrationen sätter räknaren till GREATEST(MAX(deal_number), MAX(project P-num))
-- per företag, så att framtida nummer hamnar över allt som redan finns och inga
-- befintliga nummer krockar.

INSERT INTO business_counters (business_id, counter_type, last_value)
SELECT
  business_id,
  'project' AS counter_type,
  GREATEST(
    COALESCE(max_deal, 1000),
    COALESCE(max_proj, 1000),
    1000
  ) AS last_value
FROM (
  SELECT
    b.business_id,
    (SELECT MAX(deal_number) FROM deal WHERE business_id = b.business_id) AS max_deal,
    (
      SELECT MAX(CAST(SUBSTRING(project_number FROM 3) AS INTEGER))
      FROM project
      WHERE business_id = b.business_id
        AND project_number ~ '^P-[0-9]+$'
    ) AS max_proj
  FROM business_config b
) seeds
ON CONFLICT (business_id, counter_type)
DO UPDATE SET last_value = GREATEST(business_counters.last_value, EXCLUDED.last_value);

-- Ny RPC: bump_counter — sätter räknaren till MINST p_min_value, men sänker den aldrig.
-- Används när ett projekt skapas direkt från en deal (project_number = deal.deal_number)
-- så att räknaren följer med utan att glida bakåt vid race conditions.
CREATE OR REPLACE FUNCTION bump_counter(
  p_business_id TEXT,
  p_counter_type TEXT,
  p_min_value INTEGER
) RETURNS INTEGER AS $$
DECLARE
  new_value INTEGER;
BEGIN
  INSERT INTO business_counters (business_id, counter_type, last_value)
  VALUES (p_business_id, p_counter_type, p_min_value)
  ON CONFLICT (business_id, counter_type)
  DO UPDATE SET last_value = GREATEST(business_counters.last_value, EXCLUDED.last_value)
  RETURNING last_value INTO new_value;
  RETURN new_value;
END;
$$ LANGUAGE plpgsql;
