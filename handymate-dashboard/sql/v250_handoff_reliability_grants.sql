-- v250_handoff_reliability_grants.sql — carry from the H3a review, applied to production 2026-09-15.
-- v246 revoked channel_notices and morning_report_runs from PUBLIC/anon/authenticated but not from
-- service_role, so both kept Supabase's default ALL. Every write goes through record_channel_notice /
-- claim_morning_report / finish_morning_report, and the app only ever SELECTs these tables; DELETE stays
-- for account erasure. Same shape as v244 (first_work) and v248 (handoff_*, autonomy_*). No data change.
BEGIN;
DO $g$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['channel_notices','morning_report_runs'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $g$;
COMMIT;
