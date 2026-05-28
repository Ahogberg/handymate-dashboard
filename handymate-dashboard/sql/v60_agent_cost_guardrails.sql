-- v60: Agent cost-guardrails (Steg 7, 2026-05-29)
--
-- Två säkerhetslager för agent-cron:
--   1. agents_globally_paused — kill-switch per business. true → all
--      agent-observation-cron hoppar över businessen utan kod-deploy.
--   2. agent_cost_cap_usd_daily — max USD som agent-cron får kosta
--      per business per dygn. Cron summerar dagens agent_runs.estimated_cost
--      och hoppar över businessen om summan redan överstiger cap.
--
-- Default: paused=false, cap=5.00 USD. Befintliga businesses fortsätter
-- fungera men har ekonomisk gräns ifall en agent springer iväg.
--
-- Pilot-användning (Bee Service biz_21wswuhrbhy):
--   - Om Karin/Daniel/Lisa beter sig oväntat imorgon 06:00 UTC:
--     UPDATE business_config SET agents_globally_paused = true
--       WHERE business_id = 'biz_21wswuhrbhy';
--   - Stoppar all observation-cron utan att rolla tillbaka kod.
--
-- För test (Steg 7 manuell test): sätt cap=0.01 → en run kostar ~0.05
-- USD → andra körningen samma dygn ska skippas av cost-cap.

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS agents_globally_paused BOOLEAN DEFAULT false;

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS agent_cost_cap_usd_daily DECIMAL(10, 4) DEFAULT 5.0000;

COMMENT ON COLUMN business_config.agents_globally_paused IS
  'Kill-switch: när true hoppar all agent-observation-cron (Karin/Daniel/Lars/Hanna/Lisa) över businessen. Pilot-säkerhet.';

COMMENT ON COLUMN business_config.agent_cost_cap_usd_daily IS
  'Max USD som agent-cron får kosta per business per dygn. Cron summerar dagens agent_runs.estimated_cost och skippar om över cap. Default 5.00 USD.';

-- Verifiering (kör efter ALTER):
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'business_config'
--   AND column_name IN ('agents_globally_paused', 'agent_cost_cap_usd_daily');
