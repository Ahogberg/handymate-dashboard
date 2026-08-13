-- "Visa varför"-utrullning, Fall 4 (docs/design/SYNLIG-INTELLIGENS.md,
-- 2026-08-13) — dispatch_suggestion (lib/dispatch.ts) bygger redan rikt
-- resonemang (reasons/score/alternatives/beläggning/certifikat) som
-- renderas korrekt på godkännandekortet men kastas när kortet hanteras.
-- Sparas nu vid källan (ett ögonblicksbeslut — kan inte räknas om senare
-- utan att ge ett annat, missvisande svar). Nullable, ingen default:
-- historiska tilldelningar hade aldrig detta sparat.
ALTER TABLE booking ADD COLUMN IF NOT EXISTS dispatch_reasoning JSONB;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS dispatch_reasoning JSONB;
