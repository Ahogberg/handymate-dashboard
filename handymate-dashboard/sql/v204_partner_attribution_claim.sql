-- v204 — Partnerattribution: ett atomiskt, fail-closed beslut
--
-- v203 är reserverad av den parallella lanserings-/räddningsmigreringen.
-- Den här migrationen körs MANUELLT i Supabase SQL Editor och aldrig från kod.
--
-- Avtalsregler som nu verkställs:
--   1. bara en aktiv partner som accepterat aktuell avtalsversion kan få attribution,
--   2. partnern kan inte hänvisa sig själv (exakt e-post eller organisationsnummer),
--   3. en befintlig Handymate-kund eller en konkret säljdialog senaste 180 dagarna
--      kan inte attribueras retroaktivt,
--   4. ett företag kan ha högst en partnerattribution,
--   5. varje beslut bokförs utan e-post, org.nr eller annan rå kontaktdata.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.referrals
    WHERE referrer_type = 'partner'
    GROUP BY referred_business_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Dubbletter finns i partnerattributionen. Rätta dem manuellt före v204.';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_partner_per_business
  ON public.referrals (referred_business_id)
  WHERE referrer_type = 'partner';

CREATE TABLE IF NOT EXISTS public.partner_attribution_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN (
    'accepted',
    'invalid_partner_code',
    'agreement_not_current',
    'self_referral',
    'existing_handymate_account',
    'existing_sales_relationship',
    'already_attributed',
    'business_not_found'
  )),
  referral_id TEXT REFERENCES public.referrals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS partner_attribution_decision_business
  ON public.partner_attribution_decision (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_attribution_decision_partner
  ON public.partner_attribution_decision (partner_id, created_at DESC)
  WHERE partner_id IS NOT NULL;

ALTER TABLE public.partner_attribution_decision ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_attribution_decision_service_role
  ON public.partner_attribution_decision;
CREATE POLICY partner_attribution_decision_service_role
  ON public.partner_attribution_decision
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.partner_attribution_decision FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_attribution_decision TO service_role;

CREATE OR REPLACE FUNCTION public.claim_partner_attribution(
  p_business_id TEXT,
  p_referral_code TEXT,
  p_required_agreement_version TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business public.business_config%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_referral public.referrals%ROWTYPE;
  v_reason TEXT;
  v_business_email TEXT;
  v_partner_email TEXT;
  v_business_org TEXT;
  v_partner_org TEXT;
BEGIN
  IF COALESCE(BTRIM(p_business_id), '') = ''
     OR COALESCE(BTRIM(p_referral_code), '') = ''
     OR COALESCE(BTRIM(p_required_agreement_version), '') = '' THEN
    RAISE EXCEPTION 'business_id, referral_code and agreement version are required';
  END IF;

  SELECT * INTO v_business
  FROM public.business_config
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.partner_attribution_decision (
      business_id, referral_code, accepted, reason
    ) VALUES (
      p_business_id, UPPER(BTRIM(p_referral_code)), false, 'business_not_found'
    );
    RETURN jsonb_build_object(
      'accepted', false, 'reason', 'business_not_found',
      'partner_id', NULL, 'referral_id', NULL, 'idempotent', false
    );
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE referral_code = UPPER(BTRIM(p_referral_code))
    AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    v_reason := 'invalid_partner_code';
  ELSIF v_partner.agreement_version IS DISTINCT FROM p_required_agreement_version THEN
    v_reason := 'agreement_not_current';
  END IF;

  IF v_reason IS NULL AND v_business.referred_by IS NOT NULL THEN
    SELECT * INTO v_referral
    FROM public.referrals
    WHERE referred_business_id = p_business_id
      AND referrer_type = 'partner'
      AND partner_id = v_partner.id
    LIMIT 1;

    IF v_business.referred_by = v_partner.referral_code AND FOUND THEN
      INSERT INTO public.partner_attribution_decision (
        business_id, partner_id, referral_code, accepted, reason, referral_id
      ) VALUES (
        p_business_id, v_partner.id, v_partner.referral_code, true, 'accepted', v_referral.id
      );
      RETURN jsonb_build_object(
        'accepted', true, 'reason', 'accepted', 'partner_id', v_partner.id,
        'referral_id', v_referral.id, 'idempotent', true
      );
    END IF;
    v_reason := 'already_attributed';
  END IF;

  v_business_email := LOWER(BTRIM(COALESCE(v_business.contact_email, '')));
  v_partner_email := LOWER(BTRIM(COALESCE(v_partner.email, '')));
  v_business_org := REGEXP_REPLACE(COALESCE(v_business.org_number, ''), '[^0-9]', '', 'g');
  v_partner_org := REGEXP_REPLACE(COALESCE(v_partner.self_billing_org_number, ''), '[^0-9]', '', 'g');

  IF v_reason IS NULL AND (
    (v_business_email <> '' AND v_business_email IN (
      v_partner_email,
      LOWER(BTRIM(COALESCE(v_partner.self_billing_email, '')))
    ))
    OR (v_business_org <> '' AND v_partner_org <> '' AND v_business_org = v_partner_org)
  ) THEN
    v_reason := 'self_referral';
  END IF;

  IF v_reason IS NULL AND EXISTS (
    SELECT 1
    FROM public.business_config existing
    WHERE existing.business_id <> p_business_id
      AND (
        (v_business_email <> '' AND LOWER(BTRIM(COALESCE(existing.contact_email, ''))) = v_business_email)
        OR (
          v_business_org <> ''
          AND REGEXP_REPLACE(COALESCE(existing.org_number, ''), '[^0-9]', '', 'g') = v_business_org
        )
      )
  ) THEN
    v_reason := 'existing_handymate_account';
  END IF;

  -- Enbart dokumenterad tvåvägs-/säljdialog räknas. Ett importerat prospekt
  -- eller ett obesvarat kontaktförsök blockerar inte partnern.
  IF v_reason IS NULL AND EXISTS (
    SELECT 1
    FROM public.gtm_account ga
    JOIN public.gtm_activity act ON act.account_id = ga.id
    WHERE act.happened_at >= NOW() - INTERVAL '180 days'
      AND act.outcome IN ('spoke', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won')
      AND (
        (v_business_email <> '' AND LOWER(BTRIM(COALESCE(ga.primary_contact_email, ga.company_email, ''))) = v_business_email)
        OR (
          v_business_org <> ''
          AND REGEXP_REPLACE(COALESCE(ga.org_number, ''), '[^0-9]', '', 'g') = v_business_org
        )
      )
  ) THEN
    v_reason := 'existing_sales_relationship';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.partner_attribution_decision (
      business_id, partner_id, referral_code, accepted, reason
    ) VALUES (
      p_business_id, v_partner.id, UPPER(BTRIM(p_referral_code)), false, v_reason
    );
    RETURN jsonb_build_object(
      'accepted', false, 'reason', v_reason, 'partner_id', v_partner.id,
      'referral_id', NULL, 'idempotent', false
    );
  END IF;

  INSERT INTO public.referrals (
    referrer_business_id,
    referred_business_id,
    referred_email,
    referrer_type,
    partner_id,
    partner_name,
    status
  ) VALUES (
    'PARTNER',
    p_business_id,
    NULLIF(v_business.contact_email, ''),
    'partner',
    v_partner.id,
    v_partner.name,
    'pending'
  )
  RETURNING * INTO v_referral;

  UPDATE public.business_config
  SET referred_by = v_partner.referral_code
  WHERE business_id = p_business_id;

  INSERT INTO public.partner_attribution_decision (
    business_id, partner_id, referral_code, accepted, reason, referral_id
  ) VALUES (
    p_business_id, v_partner.id, v_partner.referral_code, true, 'accepted', v_referral.id
  );

  RETURN jsonb_build_object(
    'accepted', true, 'reason', 'accepted', 'partner_id', v_partner.id,
    'referral_id', v_referral.id, 'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_partner_attribution(TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_attribution(TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;

-- MANUELL VERIFIERING EFTER KÖRNING:
-- SELECT indexname FROM pg_indexes
--  WHERE tablename='referrals' AND indexname='referrals_one_partner_per_business';
-- SELECT routine_name, security_type FROM information_schema.routines
--  WHERE routine_name='claim_partner_attribution'; -- SECURITY DEFINER
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_name='partner_attribution_decision'
--    AND grantee IN ('anon','authenticated'); -- 0 rader
