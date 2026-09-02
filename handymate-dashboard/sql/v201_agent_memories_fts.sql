-- v201: relevanssökning i agentminnet (2026-09-02, förstärkning 2).
--
-- agent_memories hämtades som "topp fem på viktighet" oavsett fråga.
-- Embedding-kolumnen (v21) fylldes aldrig och vektorsökningen dödades som
-- död kod i Etapp U. Postgres fulltext med svensk ordbok ger relevans utan
-- extern leverantör: en genererad tsvector-kolumn + GIN-index. Koden är
-- fail-soft (42703 ⇒ dagens viktighetsfråga) tills filen körts.

ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('swedish', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_agent_memories_content_tsv
  ON public.agent_memories USING GIN (content_tsv);

-- Facit efter körning:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'agent_memories' AND column_name = 'content_tsv';  → 1 rad
--   SELECT count(*) FROM agent_memories WHERE content_tsv @@ websearch_to_tsquery('swedish', 'offert');
