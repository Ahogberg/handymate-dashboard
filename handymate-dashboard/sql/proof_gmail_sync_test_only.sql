-- Isolated project eoodwyfxrdjmlqaealhj ONLY. No provider calls; fixtures rollback.
BEGIN;
DO $$
DECLARE n integer;
BEGIN
 INSERT INTO public.calendar_connection(id,business_id,business_user_id,provider,account_email,access_token,refresh_token,gmail_scope_granted,gmail_sync_enabled)
 SELECT 'gmail-proof-20260909','biz_vision_test_a',id,'google','proof@example.invalid','synthetic-access','synthetic-refresh',true,true
 FROM public.business_users WHERE business_id='biz_vision_test_a' LIMIT 1;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'missing_test_member'; END IF;
 UPDATE public.calendar_connection SET gmail_sync_started_at='2026-09-09T00:00:00Z'
 WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a' AND gmail_sync_enabled=true AND gmail_scope_granted=true AND gmail_sync_started_at IS NULL AND gmail_last_history_id IS NULL;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'anchor_claim_failed'; END IF;
 UPDATE public.calendar_connection SET gmail_last_history_id='200',gmail_last_polled_at=now()
 WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a' AND account_email='proof@example.invalid' AND refresh_token='synthetic-refresh' AND gmail_sync_enabled=true AND gmail_scope_granted=true AND gmail_last_history_id IS NULL;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'cursor_claim_failed'; END IF;
 UPDATE public.calendar_connection SET gmail_last_history_id='100'
 WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a' AND gmail_last_history_id IS NULL;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'stale_cursor_overwrote_newer'; END IF;
 UPDATE public.calendar_connection SET gmail_sync_enabled=false WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a';
 IF EXISTS(SELECT 1 FROM public.calendar_connection WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a' AND gmail_sync_enabled=true AND gmail_scope_granted=true) THEN RAISE EXCEPTION 'disabled_connection_selected'; END IF;
 IF EXISTS(SELECT 1 FROM public.calendar_connection WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_b') THEN RAISE EXCEPTION 'foreign_connection_selected'; END IF;
END $$;
ROLLBACK;
SELECT count(*)=0 AS fixture_rolled_back FROM public.calendar_connection WHERE id='gmail-proof-20260909' AND business_id='biz_vision_test_a';
