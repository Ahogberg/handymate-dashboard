-- v38: Koppla offerter till deals så deal_number kan visas på offerten
-- som "ärendereferens" — samma nummer som i säljtratten.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS deal_id TEXT REFERENCES deal(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_deal_id
  ON quotes(deal_id) WHERE deal_id IS NOT NULL;

COMMENT ON COLUMN quotes.deal_id IS
  'Ärendet i säljtratten som offerten hör till. Möjliggör visning av deal_number som referensnummer på offerten.';
