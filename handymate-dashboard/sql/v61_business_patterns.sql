-- v61: business_patterns — Fas 1a (Pattern-extraction v0)
--
-- Per tasks/roadmap-learning-ai.md Fas 1 + tasks/fas1-pattern-extraction-design.md.
-- En rad per (business_id, pattern_key). Calculators (Tier A: approve_rate,
-- deal_cycle, ata_frequency) skriver/uppdaterar rad per körning i dagligt
-- cron-pass kl 05:00 UTC.
--
-- Designprinciper (icke-förhandlingsbara):
--   1. Epistemic hygien: sample_size bestämmer confidence + is_stale.
--      Calculator skriver rad ÄVEN om current_n < min_n för preliminary —
--      sätter is_stale=true istället för att hoppa över. Sample-size-
--      progressionen bevaras + UI/Fas 2 visar "Bygger underlag (X av Y)".
--   2. Per-business isolation: lärandet är per-konto. Bee:s mönster
--      påverkar inte andra businesses.
--   3. Atomic update: per-pattern-rad → omräkning av ett mönster rör inte
--      andra (vs JSONB-blob på business_config där hela blob skrivs varje
--      gång).
--   4. Migration-stabilitet: lägga till nytt pattern kräver ingen ALTER.
--
-- Per-business override av sample-thresholds (Andreas-tillägg B 2026-05-30)
-- är DESIGNAT men inte byggt i Fas 1a — calculators läser globala defaults
-- från lib/patterns/sample-thresholds.ts. business_patterns_config-tabell
-- aktiveras när 3+ pilotkunder med olika hantverkar-profiler finns (TD).

CREATE TABLE IF NOT EXISTS business_patterns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,

  -- Unik nyckel per mönster, t.ex. 'approve_rate', 'deal_cycle',
  -- 'ata_frequency'. Definieras i lib/patterns/types.ts (PatternKey-enum).
  pattern_key TEXT NOT NULL,

  -- Pattern-specifik value-struktur (JSONB). Per-pattern TypeScript-typer
  -- garanterar schema-konsistens; SQL har medvetet ingen strikt struktur
  -- eftersom calculators kan utöka över tid utan ALTER.
  value JSONB NOT NULL DEFAULT '{}',

  -- Antal observationer som ligger till grund för beräkningen i value.
  -- 0 är giltigt (calculator har räknat men hittat noll giltiga samples).
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK (sample_size >= 0),

  -- Confidence-nivå mappad från sample_size + per-pattern-trösklar
  -- (lib/patterns/sample-thresholds.ts). Calculator beräknar denna mot
  -- pattern-specifika min N-trösklar.
  confidence TEXT NOT NULL DEFAULT 'preliminary'
    CHECK (confidence IN ('preliminary', 'medium', 'high')),

  -- is_stale = true när current sample_size < min N för preliminary
  -- (definierad per pattern). UI visar "Bygger underlag (X av Y)" och
  -- hoppar över value-baserade uttalanden tills tröskeln nås.
  -- Calculators sätter denna varje körning baserat på aktuell sample_size.
  is_stale BOOLEAN NOT NULL DEFAULT false,

  -- Data-fönster som ligger till grund för beräkningen. Per-pattern policy
  -- (t.ex. approve_rate: senaste 30d, deal_cycle: 90d, ata_frequency:
  -- 12 mån). Definieras i sample-thresholds-helpern.
  data_window_start TIMESTAMPTZ,
  data_window_end TIMESTAMPTZ,

  -- Pattern-specifik metadata. Exempel:
  --   approve_rate: { per_agent_counts: { karin: {approved: 3, rejected: 1}, ... } }
  --   deal_cycle:  { excluded_outliers: 2, reason: "cycle < 1 day" }
  --   ata_frequency: { project_type_breakdown: {...} }
  --
  -- Andreas-tillägg 2026-05-30: outlier-filter-logging. Calculators kan
  -- ange exclusion criteria + räkna bort osäkra samples. metadata logger
  -- antalet exkluderade så vi kan auditera om filtreringen är rimlig.
  metadata JSONB NOT NULL DEFAULT '{}',

  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (business_id, pattern_key)
);

CREATE INDEX IF NOT EXISTS idx_business_patterns_business
  ON business_patterns(business_id);

CREATE INDEX IF NOT EXISTS idx_business_patterns_calculated
  ON business_patterns(last_calculated_at DESC);

-- För Fas 2-frågor som filtrerar på "ge mig pattern X för business Y
-- där det inte är stale". Cluster på (business_id, is_stale) accelererar
-- den vanligaste UI-frågan.
CREATE INDEX IF NOT EXISTS idx_business_patterns_active
  ON business_patterns(business_id, pattern_key)
  WHERE is_stale = false;

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE business_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owns patterns" ON business_patterns;
CREATE POLICY "Business owns patterns"
  ON business_patterns FOR ALL
  USING (business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Service role full access on business_patterns"
  ON business_patterns;
CREATE POLICY "Service role full access on business_patterns"
  ON business_patterns FOR ALL
  USING (true) WITH CHECK (true);

ALTER POLICY "Service role full access on business_patterns"
  ON business_patterns
  TO service_role;

COMMENT ON TABLE business_patterns IS
  'Pattern-extraction v0 (Fas 1a, 2026-05-30). En rad per (business, pattern_key). Calculators skriver dagligen via cron 05:00 UTC. is_stale=true tills sample-size-tröskel nåtts per pattern.';

COMMENT ON COLUMN business_patterns.is_stale IS
  'True = sample_size < min N för preliminary. UI visar "Bygger underlag (X av Y)" istället för value-baserat uttalande. Bevarar sample-size-progressionen.';

COMMENT ON COLUMN business_patterns.metadata IS
  'Pattern-specifik metadata inkl. exkluderade outliers, breakdown per kategori, beräknings-detaljer. Audit-spår för calculator-beslut.';

-- Verifiering (kör efter ALTER):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'business_patterns'
-- ORDER BY ordinal_position;
