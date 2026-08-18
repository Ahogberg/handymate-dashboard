-- v149: Agentminnets härdning (Etapp U) — v122-mönstret på agent_memories
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- Inventeringens dom (2026-08-18): agent_memories var append-only rå
-- modelloutput — ingen bekräftelse, ingen supersede, ingen färskhet, inget
-- källspår. Det customer_fact (v122) gör rätt görs nu här: ett minne kan
-- ersättas (superseded_by), firmanivå-minnen kan kräva bekräftelse
-- (confirmed_at), och varje minne bär sitt ursprung.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.agent_memories') IS NULL THEN
    RAISE EXCEPTION 'v149 kräver agent_memories (sql/v21_agent_memory.sql)';
  END IF;
END $$;

-- Ersättningskedjan: nyare sanning pekar ut den gamla. Läsning filtrerar
-- ALLTID superseded_by IS NULL.
ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS superseded_by TEXT;

-- Bekräftelsegrinden: firmanivå-minnen (pattern/preference) blir sanning
-- först när ägaren godkänt kortet. Körningsobservationer (observation/fact)
-- får auto-confirmed vid skrivning — de påstår bara vad en körning såg.
ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- Källspår: varifrån minnet kom (call/chat/trigger + id) — aldrig mer
-- ospårbar text.
ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS source_id TEXT;

-- Befintliga rader: behåll som läsbara (auto-bekräftade vid migrationen —
-- de har redan använts i månader; att tyst gömma dem vore en annan lögn).
UPDATE public.agent_memories
  SET confirmed_at = created_at
  WHERE confirmed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agent_memories_active
  ON public.agent_memories (business_id, agent_id, importance_score DESC)
  WHERE superseded_by IS NULL AND confirmed_at IS NOT NULL;

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='agent_memories'
--   AND column_name IN ('superseded_by','confirmed_at','source_type','source_id');
