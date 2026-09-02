-- v200: agentminne per kund (kundminne-revisionen 2026-09-02, gap 6).
--
-- agent_memories (sql/v21) nycklades bara på business_id: "vad vi lärt oss
-- om den här kunden" kunde aldrig sparas eller hämtas per kund. Ny nullbar
-- kolumn customer_id — NULL = företagsnivå (som i dag). Koden är fail-soft
-- tills filen körts (42703 ⇒ insert/urval utan kolumnen, som i dag).

ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_memories_customer
  ON public.agent_memories (business_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- Facit efter körning:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'agent_memories' AND column_name = 'customer_id';  → 1 rad
