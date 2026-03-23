-- V27b: Migrera deals till rätt steg baserat på kopplad offert/faktura
-- Kör manuellt i Supabase SQL Editor EFTER v27

-- 1. Deals med betald faktura → Betalad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'betalad' LIMIT 1
)
WHERE invoice_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM invoice
  WHERE invoice.invoice_id = deal.invoice_id
  AND invoice.status = 'paid'
)
AND EXISTS (
  SELECT 1 FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'betalad'
);

-- 2. Deals med faktura (ej betald) → Fakturerad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'fakturerad' LIMIT 1
)
WHERE invoice_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM invoice
  WHERE invoice.invoice_id = deal.invoice_id
  AND invoice.status != 'paid'
)
AND EXISTS (
  SELECT 1 FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'fakturerad'
);

-- 3. Deals med accepterad offert → Offert accepterad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'offert_accepterad' LIMIT 1
)
WHERE quote_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM quotes
  WHERE quotes.quote_id = deal.quote_id
  AND quotes.status = 'accepted'
)
AND invoice_id IS NULL
AND EXISTS (
  SELECT 1 FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'offert_accepterad'
);

-- 4. Deals med skickad offert → Offert skickad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'offert_skickad' LIMIT 1
)
WHERE quote_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM quotes
  WHERE quotes.quote_id = deal.quote_id
  AND quotes.status = 'sent'
)
AND invoice_id IS NULL
AND EXISTS (
  SELECT 1 FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'offert_skickad'
);

-- 5. Deals med status 'lost' → Förlorad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'forlorad' LIMIT 1
)
WHERE status = 'lost'
AND EXISTS (
  SELECT 1 FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'forlorad'
);
