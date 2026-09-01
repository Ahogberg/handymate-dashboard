-- v194 — Obligatorisk betalningsreferens vid partnerutbetalning
--
-- Andreas-beslut 2026-09-02: partnerutbetalning förblir manuell (bankgiro/plusgiro/konto,
-- en människa gör den riktiga banköverföringen) — men "markera betald" ska kräva ett
-- verkligt spår (betalningsreferens) utöver adminens ord, plus möjlighet att ange det
-- faktiska betaldatumet separat från servertiden.
--
-- Körs MANUELLT i Supabase SQL Editor, precis som v193.

BEGIN;

ALTER TABLE public.partner_payout_batch
  ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- Funktionens parameterlista utökas — DROP krävs, CREATE OR REPLACE byter inte signatur.
DROP FUNCTION IF EXISTS public.mark_partner_self_billing_paid(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.mark_partner_self_billing_paid(
  p_batch_id UUID,
  p_paid_by TEXT,
  p_payment_reference TEXT,
  p_paid_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.partner_payout_batch%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_paid_at TIMESTAMPTZ := COALESCE(p_paid_at, v_now);
BEGIN
  IF COALESCE(BTRIM(p_payment_reference), '') = '' THEN
    RAISE EXCEPTION 'Betalningsreferens krävs' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_batch FROM public.partner_payout_batch WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch hittades inte' USING ERRCODE = 'P0002'; END IF;
  IF v_batch.status = 'paid' THEN RAISE EXCEPTION 'Batchen är redan utbetald' USING ERRCODE = '23514'; END IF;
  IF v_batch.review_status = 'disputed' THEN RAISE EXCEPTION 'Självfakturan är bestridd' USING ERRCODE = '23514'; END IF;

  IF v_batch.review_status = 'pending' THEN
    IF v_batch.delivered_at IS NULL OR v_batch.delivered_at + INTERVAL '10 days' > v_now THEN
      RAISE EXCEPTION 'Självfakturan är ännu inte godkänd' USING ERRCODE = '23514';
    END IF;
    UPDATE public.partner_payout_batch
    SET review_status = 'deemed_approved', reviewed_at = v_now
    WHERE id = p_batch_id;
  END IF;

  UPDATE public.partner_commission_ledger
  SET status = 'paid', paid_at = v_paid_at
  WHERE payout_batch_id = p_batch_id AND status = 'accrued';

  UPDATE public.partner_payout_batch
  SET status = 'paid', paid_at = v_paid_at, paid_by = p_paid_by,
      payment_reference = BTRIM(p_payment_reference)
  WHERE id = p_batch_id;

  UPDATE public.partners p SET
    total_pending_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'accrued'), 0),
    total_earned_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'paid'), 0)
  WHERE p.id = v_batch.partner_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'paid_at', v_paid_at, 'total_sek', v_batch.total_incl_vat_sek, 'payment_reference', BTRIM(p_payment_reference));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_partner_self_billing_paid(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_partner_self_billing_paid(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

COMMIT;

-- Manuell kontroll efter körning:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'partner_payout_batch' AND column_name = 'payment_reference'; -- 1 rad
-- SELECT routine_name, specific_name FROM information_schema.routines WHERE routine_name = 'mark_partner_self_billing_paid'; -- exakt 1 rad (gamla 2-parameter-versionen borta)
