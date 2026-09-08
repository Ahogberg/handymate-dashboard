-- Pause preparation. Existing approval send claims must still recheck business pause and source.
UPDATE public.agent_followup_runner SET enabled=false WHERE singleton;
SELECT enabled,last_tick_at FROM public.agent_followup_runner;
-- No rows, decisions or audit history are deleted.
