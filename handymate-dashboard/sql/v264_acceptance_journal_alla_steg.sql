-- v264: journalen får kolumner för ALLA eftersteg en accept utlöser.
--
-- Bakgrund: `finalizeAcceptedQuote` ägde tre steg (project/deal/email) medan
-- SEX andra eftersteg låg inklistrade i var och en av de tre accept-rutterna
-- — marginalögonblicksbilden, notisen, smart-kommunikationen, autopiloten,
-- projekt-AI:ns händelse och automationsmotorns event. Kopiorna hade redan
-- drivit isär: `handleProjectEvent` saknades helt i kundportalen, och de tre
-- vägarna fyrade olika event. Nu äger finalizern alla, och varje steg får en
-- egen kvittens i journalen.
--
-- VARFÖR NAMNGIVNA KOLUMNER, INTE GENERISK JSONB: RPC:erna, återhämtnings-
-- panelen (app/api/quotes/acceptance-recovery) och testerna nycklar alla på
-- namngivna tillstånd. Journalen hade 0 rader i prod 2026-09-18 — den är den
-- enda mekanismen här som ALDRIG körts skarpt. En omskrivning till jsonb hade
-- bytt ut precis den delen som saknar produktionsbevis. Kolumner i stället.
--
-- Utgående steg (email/notify/communication/events) återförsöks ALDRIG: en
-- förlorad leverantörskvittens är 'uncertain', inte en ny sändning. Interna
-- steg (project/deal/margin/autopilot/project_event) får en fastnad körning
-- frigjord efter 5 minuter, som tidigare.
BEGIN;

ALTER TABLE public.quote_acceptance_completion
  ADD COLUMN IF NOT EXISTS margin_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS notify_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS communication_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS autopilot_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS project_event_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS events_state text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS margin_claim text,
  ADD COLUMN IF NOT EXISTS notify_claim text,
  ADD COLUMN IF NOT EXISTS communication_claim text,
  ADD COLUMN IF NOT EXISTS autopilot_claim text,
  ADD COLUMN IF NOT EXISTS project_event_claim text,
  ADD COLUMN IF NOT EXISTS events_claim text,
  ADD COLUMN IF NOT EXISTS margin_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS communication_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS autopilot_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS project_event_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS events_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS margin_error text,
  ADD COLUMN IF NOT EXISTS notify_error text,
  ADD COLUMN IF NOT EXISTS communication_error text,
  ADD COLUMN IF NOT EXISTS autopilot_error text,
  ADD COLUMN IF NOT EXISTS project_event_error text,
  ADD COLUMN IF NOT EXISTS events_error text;

ALTER TABLE public.quote_acceptance_completion
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_margin_state_check,
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_notify_state_check,
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_communication_state_check,
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_autopilot_state_check,
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_project_event_state_check,
  DROP CONSTRAINT IF EXISTS quote_acceptance_completion_events_state_check;

ALTER TABLE public.quote_acceptance_completion
  ADD CONSTRAINT quote_acceptance_completion_margin_state_check
    CHECK (margin_state IN ('pending','running','done','failed','skipped')),
  ADD CONSTRAINT quote_acceptance_completion_autopilot_state_check
    CHECK (autopilot_state IN ('pending','running','done','failed','skipped')),
  ADD CONSTRAINT quote_acceptance_completion_project_event_state_check
    CHECK (project_event_state IN ('pending','running','done','failed','skipped')),
  ADD CONSTRAINT quote_acceptance_completion_notify_state_check
    CHECK (notify_state IN ('pending','running','done','failed','skipped','uncertain')),
  ADD CONSTRAINT quote_acceptance_completion_communication_state_check
    CHECK (communication_state IN ('pending','running','done','failed','skipped','uncertain')),
  ADD CONSTRAINT quote_acceptance_completion_events_state_check
    CHECK (events_state IN ('pending','running','done','failed','skipped','uncertain'));

CREATE OR REPLACE FUNCTION public.claim_quote_acceptance_step(p_business text,p_quote text,p_step text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r public.quote_acceptance_completion; state text; claimed timestamptz; token text:=gen_random_uuid()::text;
BEGIN
 IF p_step NOT IN ('project','deal','email','margin','notify','communication','autopilot','project_event','events') THEN RAISE EXCEPTION 'invalid_step'; END IF;
 PERFORM 1 FROM public.quotes WHERE business_id=p_business AND quote_id=p_quote AND status='accepted';
 IF NOT FOUND THEN RAISE EXCEPTION 'quote_not_accepted'; END IF;
 SELECT * INTO r FROM public.quote_acceptance_completion WHERE business_id=p_business AND quote_id=p_quote FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'acceptance_journal_missing'; END IF;
 state:=to_jsonb(r)->>(p_step||'_state');claimed:=(to_jsonb(r)->>(p_step||'_claimed_at'))::timestamptz;
 IF state IN ('done','skipped','uncertain') THEN RETURN NULL; END IF;
 -- Utgående steg återförsöks ALDRIG: en förlorad kvittens är osäker, inte ogjord.
 IF state='running' AND (p_step IN ('email','notify','communication','events') OR claimed>now()-interval '5 minutes') THEN RETURN NULL; END IF;
 EXECUTE format('UPDATE public.quote_acceptance_completion SET %I=$1,%I=$2,%I=now(),%I=NULL,updated_at=now() WHERE business_id=$3 AND quote_id=$4',p_step||'_state',p_step||'_claim',p_step||'_claimed_at',p_step||'_error') USING 'running',token,p_business,p_quote;
 RETURN token;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_quote_acceptance_step(p_business text,p_quote text,p_step text,p_claim text,p_state text,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE n integer;
BEGIN
 IF p_step NOT IN ('project','deal','email','margin','notify','communication','autopilot','project_event','events')
    OR p_state NOT IN ('done','failed','skipped','uncertain')
    OR (p_state='uncertain' AND p_step NOT IN ('email','notify','communication','events'))
    OR (p_step='project' AND p_state='skipped') THEN RAISE EXCEPTION 'invalid_step_result'; END IF;
 EXECUTE format('UPDATE public.quote_acceptance_completion SET %I=$1,%I=$2,updated_at=now() WHERE business_id=$3 AND quote_id=$4 AND %I=$5 AND %I=$6',p_step||'_state',p_step||'_error',p_step||'_claim',p_step||'_state') USING p_state,left(p_error,500),p_business,p_quote,p_claim,'running';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'acceptance_stale_claim'; END IF;
 RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.claim_quote_acceptance_step(text,text,text),public.finish_quote_acceptance_step(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_quote_acceptance_step(text,text,text),public.finish_quote_acceptance_step(text,text,text,text,text,text) TO service_role;
COMMIT;
