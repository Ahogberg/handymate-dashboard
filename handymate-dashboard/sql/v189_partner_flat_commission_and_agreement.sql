-- v189 — lås partnerprovisionen till den avtalade modellen (20% i 36
-- kalendermånader, 0% därefter) och lägg till loggning av att en partner
-- faktiskt accepterat en specifik avtalsversion.
--
-- Bakgrund: content/partner/partneravtal-v1.md (Bilaga 1) anger 20% i 36
-- månader som den beslutade standarden (Andreas, 2026-09-01). Den skarpa
-- motorn stod fortfarande på en äldre trappa (20/25/30% över 12 månader,
-- sedan 10% löpande, beslutad 2026-08-11, sql/v117_partner_commission_v2.sql).

BEGIN;

-- 1) Nya DEFAULTS för framtida nya partners.
ALTER TABLE public.partners
  ALTER COLUMN commission_tiers SET DEFAULT '[{"min":0,"rate":0.20}]'::jsonb,
  ALTER COLUMN base_rate_after SET DEFAULT 0,
  ALTER COLUMN ladder_months SET DEFAULT 36;

-- 2) Backfill: bara partners som fortfarande står EXAKT på den gamla
-- default-kombinationen flyttas. En partner som redan har en individuell
-- avvikelse (satt av en admin via PartnerCommissionModal) rörs inte -- det
-- är en giltig Partnerbekräftelse-nivå-avvikelse per avtalets punkt 16.3.
UPDATE public.partners
SET commission_tiers = '[{"min":0,"rate":0.20}]'::jsonb,
    base_rate_after = 0,
    ladder_months = 36
WHERE commission_tiers = '[{"min":0,"rate":0.20},{"min":6,"rate":0.25},{"min":16,"rate":0.30}]'::jsonb
  AND base_rate_after = 0.10
  AND ladder_months = 12;

-- 3) Avtalsacceptans -- samma bevismönster som offert-/ÄTA-signering
-- (signed_at/signed_by_ip/signature_data), inte den döda generiska
-- consent_log-tabellen.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS agreement_version TEXT,
  ADD COLUMN IF NOT EXISTS agreement_hash TEXT,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agreement_accepted_ip TEXT;

COMMIT;

-- Manuell kontroll efter körning: gruppera partners på de tre
-- provisionskolumnerna och räkna -- bekräfta att ingen partner med en
-- genuin egen avvikelse råkade skrivas över (de ska stå kvar i en egen grupp).
SELECT commission_tiers, base_rate_after, ladder_months, count(*)
FROM public.partners
GROUP BY 1, 2, 3
ORDER BY 4 DESC;
