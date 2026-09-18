-- v261_leveranskvitto.sql — Spår 2: "Skickat" blir "Levererat".
--
-- Före detta betydde status='sent' i sms_log bara att 46elks svarade HTTP 200,
-- och e-post loggades utan operatörens leveransbesked överhuvudtaget. Ett SMS
-- till ett dött nummer och ett mejl som studsade såg exakt likadana ut som ett
-- som kom fram. lib/outbound/status.ts sa det rakt ut: "Leveransbesked saknas".
--
-- Leverans är ett SEPARAT faktum från sändning. Status-maskinen
-- (sent|failed|unknown på outbound_intents, sent|failed på sms_log) rörs inte
-- av den här migrationen — leveransbeskedet får egna kolumner, så ett sent
-- levererat kvitto aldrig kan skriva om historien om vad vi försökte göra.
BEGIN;

-- ── 1. sms_log: 46elks whendelivered-rapport ──────────────────────────────
ALTER TABLE public.sms_log
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ NULL;

DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_log_delivery_status_check') THEN
    ALTER TABLE public.sms_log ADD CONSTRAINT sms_log_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','failed'));
  END IF;
END $c$;

-- Webhooken slår upp raden på elks_id. Utan index blir det en seq scan per
-- levererat SMS; utan unikhet kan två rader dela referens och kvittot landa
-- på fel SMS. Kontrollerat före migrationen: 57 av 57 elks_id är distinkta.
CREATE UNIQUE INDEX IF NOT EXISTS sms_log_elks_id_unik
  ON public.sms_log (elks_id) WHERE elks_id IS NOT NULL;

-- ── 2. communication_log: Resends leveranshändelser ───────────────────────
-- communication_log är den tabell e-post faktiskt loggas till (logEmail i
-- lib/email.ts, lib/nurture.ts). Resend-id:t låg bara i metadata->>'message_id',
-- vilket varken går att indexera billigt eller att lita på som nyckel.
ALTER TABLE public.communication_log
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivery_status     TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ NULL;

DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communication_log_delivery_status_check') THEN
    ALTER TABLE public.communication_log ADD CONSTRAINT communication_log_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','bounced','complained','delayed'));
  END IF;
END $c$;

CREATE UNIQUE INDEX IF NOT EXISTS communication_log_provider_message_id_unik
  ON public.communication_log (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- ── 3. outbound_intents: leveransfakta vid sidan av status-maskinen ───────
ALTER TABLE public.outbound_intents
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NULL,
  ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ NULL;

DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outbound_intents_delivery_status_check') THEN
    ALTER TABLE public.outbound_intents ADD CONSTRAINT outbound_intents_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('delivered','failed'));
  END IF;
END $c$;

-- provider_ref är webhookens enda nyckel in i tabellen.
CREATE INDEX IF NOT EXISTS outbound_intents_provider_ref
  ON public.outbound_intents (provider_ref) WHERE provider_ref IS NOT NULL;

-- Minimal RPC, samma mönster som v249: SECURITY DEFINER, search_path låst,
-- EXECUTE bara till service_role. Den rör ALDRIG status/finished_at/attempts
-- — ett leveransbesked är inte ett sändningsutfall. Idempotent: samma besked
-- två gånger (46elks retry:ar) ger samma rad.
CREATE OR REPLACE FUNCTION public.mark_outbound_delivered(
  p_business_id TEXT, p_provider_ref TEXT, p_status TEXT, p_at TIMESTAMPTZ
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_id TEXT;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('delivered','failed') THEN
    RAISE EXCEPTION 'outbound_delivery_status_invalid' USING ERRCODE='check_violation';
  END IF;
  IF nullif(btrim(p_business_id),'') IS NULL OR nullif(btrim(p_provider_ref),'') IS NULL THEN
    RAISE EXCEPTION 'outbound_delivery_identity_required' USING ERRCODE='check_violation';
  END IF;
  PERFORM public.outbound_lock(p_business_id);
  UPDATE public.outbound_intents
     SET delivery_status = p_status,
         delivered_at = COALESCE(p_at, clock_timestamp())
   WHERE business_id = p_business_id AND provider_ref = p_provider_ref
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'matched', v_id IS NOT NULL, 'delivery_status', p_status);
END $fn$;

REVOKE ALL ON FUNCTION public.mark_outbound_delivered(TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_outbound_delivered(TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;

-- Inkorgen läser kvittot genom den här. Leveransen läggs till; inget fält
-- som fanns tas bort, så befintliga läsare påverkas inte.
CREATE OR REPLACE FUNCTION public.read_outbound_status(p_business_id TEXT, p_source TEXT, p_source_id TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',x.kind,'status',x.status,'defer_reason',x.defer_reason,
           'attempts',x.attempts,'finished_at',x.finished_at,'cancel_requested',x.cancel_requested_at IS NOT NULL,
           'delivery_status',x.delivery_status,'delivered_at',x.delivered_at) ORDER BY x.kind),'[]'::jsonb)
  FROM (SELECT DISTINCT ON (kind) kind,status,defer_reason,attempts,finished_at,cancel_requested_at,delivery_status,delivered_at
          FROM public.outbound_intents WHERE business_id=p_business_id AND source=p_source AND source_id=p_source_id
         ORDER BY kind, created_at DESC) x
$fn$;
REVOKE ALL ON FUNCTION public.read_outbound_status(TEXT,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_outbound_status(TEXT,TEXT,TEXT) TO service_role;

COMMIT;
