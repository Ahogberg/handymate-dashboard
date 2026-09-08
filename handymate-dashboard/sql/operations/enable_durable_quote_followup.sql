-- RELEASE STEP, NOT RUN BY THE MIGRATION.
-- Run only after migration, reviewed code, green gates, and preview proof.
-- Enabling this job prepares review cards only. It cannot send messages.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron;
UPDATE public.agent_followup_runner SET enabled=true WHERE singleton;
SELECT cron.schedule('handymate-durable-quote-followup','* * * * *','SELECT public.run_agent_followups(50)');
SELECT public.run_agent_followups(50);
COMMIT;
SELECT enabled,last_tick_at,last_error FROM public.agent_followup_runner;
SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='handymate-durable-quote-followup';
-- After the next minute, verify another last_tick_at and a successful cron.job_run_details row.
-- Only then set DURABLE_QUOTE_FOLLOWUP_ENABLED=true in the matching app environment.
