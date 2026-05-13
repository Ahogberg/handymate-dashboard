-- ============================================================
-- Agent-observations (Väg 1 — Karin v1, övriga agenter följer)
-- Centraliserad tabell där agenter sparar "riktiga anställda"-
-- observationer: insikter med suggestion, confidence och data-basis.
-- Skild från agent_memories (v21) som lagrar kort interaktions-
-- minnen utan struktur-krav.
--
-- Kör manuellt i Supabase SQL Editor.
-- OBS: pgvector ska redan vara aktiverat via sql/v21_agent_memory.sql.
-- ============================================================

-- 1. Säkerställ pgvector (idempotent — redan på i prod via v21)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Observation-tabellen
CREATE TABLE IF NOT EXISTS business_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  -- 'karin' v1, övriga (matte/daniel/lars/hanna/lisa) följer när
  -- prompten är validerad mot Christoffer-feedback.

  knowledge_type TEXT NOT NULL CHECK (knowledge_type IN ('insight', 'pattern', 'anomaly', 'recommendation')),
  -- insight: faktum agenten upptäckt (typ "kassaflödet sjönk 12% senaste 30d")
  -- pattern: återkommande beteende (typ "BRF-kunder betalar 8d senare än privatkunder")
  -- anomaly: avvikelse värd att kolla (typ "FV-2026-021 är 3x större än snitt")
  -- recommendation: konkret action-förslag (typ "skicka påminnelse till X innan helg")

  title TEXT NOT NULL,
  -- Max 80 tecken, kort rubrik för display i TeamObservationsCard.

  observation TEXT NOT NULL,
  -- Vad agenten såg, i klartext. 2-4 meningar.

  suggestion TEXT,
  -- Konkret förslag på åtgärd. NULL om observationen bara är information.

  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  -- Hur säker agenten är på slutsatsen. <0.5 = "kanske", 0.5-0.8 = trolig,
  -- >0.8 = säker. UI kan visa detta som visuell osäkerhet/cert.

  data_basis JSONB DEFAULT '{}'::JSONB,
  -- Vilka tidsperioder, rader, IDs som ligger till grund.
  -- T.ex. { "period_days": 90, "invoice_ids": [...], "metric": "avg_dso_brf" }
  -- Används för (a) debugging av agentens slutsats, (b) framtida
  -- "förklara hur du kom fram till detta"-flöde.

  embedding vector(1536),
  -- För similarity-search: hitta tidigare liknande observationer så
  -- agenten inte upprepar samma insikt vecka efter vecka. Tomma v1
  -- (cron embeddar inte ännu), men kolumnen finns för framtida pipeline.

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'resolved', 'expired')),
  -- active: visa i UI, kan inte upprepas av cron
  -- dismissed: hantverkaren tryckte "OK, jag har sett detta"
  -- resolved: agenten själv märkte att observationen åtgärdades
  --   (t.ex. faktura nu betald, problemet borta)
  -- expired: gammal observation, > 30d, ej längre relevant

  related_approval_id TEXT,
  -- Om observationen ledde till en pending_approval-rad (t.ex. Karin
  -- föreslår "skicka påminnelse till X" → approval skapas → ID lagras
  -- här så vi kan länka tillbaka).

  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT,
  -- Hantverkar-namn eller 'system' om auto-dismissad

  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_business_knowledge_business
  ON business_knowledge(business_id, agent_id, status);

CREATE INDEX IF NOT EXISTS idx_business_knowledge_created
  ON business_knowledge(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_knowledge_active
  ON business_knowledge(business_id, agent_id)
  WHERE status = 'active';

-- IVFFlat på embedding-kolumnen för similarity-search.
-- KOMMENTERAD UT: pgvector kräver att tabellen har minst 1 rad innan
-- IVFFlat-indexet skapas (annars failas CREATE INDEX). Skapa
-- manuellt efter första observation seedats:
--
--   CREATE INDEX ON business_knowledge USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 3. RLS — service_role kan skriva, hantverkaren kan läsa egen
ALTER TABLE business_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service business_knowledge" ON business_knowledge;
CREATE POLICY "Service business_knowledge"
  ON business_knowledge FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "User business_knowledge" ON business_knowledge;
CREATE POLICY "User business_knowledge"
  ON business_knowledge FOR ALL
  USING (
    business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
  );

-- 4. Auto-expire gamla observationer (cron-vänlig — kör som del av
-- /api/cron/maintenance eller separat job senare)
--
-- UPDATE business_knowledge
-- SET status = 'expired'
-- WHERE status = 'active' AND created_at < NOW() - INTERVAL '30 days';
