-- Company Goals #11 (Business Twin backlog) — ett omsättningsmål bredvid
-- det redan existerande margin_target_percent, som idag är oläst av all
-- agent-logik. Nullable, ingen default: ett osatt mål ska aldrig visas som
-- 0 kr — det är skillnaden mellan "inget mål satt" och "mål är 0 kr".
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS revenue_target_annual_sek numeric;

COMMENT ON COLUMN business_config.revenue_target_annual_sek IS
  'Ägarens årsomsättningsmål i SEK, satt frivilligt i Inställningar. Null = inget mål satt.';
