-- Sekventiella deal-nummer per företag
ALTER TABLE deal
  ADD COLUMN IF NOT EXISTS deal_number INTEGER;

-- Backfill: ge befintliga deals nummer baserat på created_at
WITH numbered AS (
  SELECT id, business_id,
    ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY created_at) + 1000 AS num
  FROM deal
  WHERE deal_number IS NULL
)
UPDATE deal
SET deal_number = numbered.num
FROM numbered
WHERE deal.id = numbered.id;

-- Index för snabb lookup
CREATE INDEX IF NOT EXISTS idx_deal_business_number
  ON deal(business_id, deal_number);
