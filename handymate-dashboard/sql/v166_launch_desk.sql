-- v166: Handymate Launch Desk V1
--
-- Internt superadmin-stöd för Handymates egen lansering. Detta är avsiktligt
-- helt separerat från kundernas leads/leads_outbound och saknar alla
-- sändfunktioner. Bara service_role får läsa eller skriva tabellerna.
--
-- KÖRS MANUELLT i Supabase SQL Editor.

BEGIN;

CREATE TABLE public.gtm_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_number TEXT,
  company_name TEXT NOT NULL,
  legal_form TEXT NOT NULL DEFAULT 'unknown'
    CHECK (legal_form IN ('limited_company', 'sole_trader', 'trading_partnership', 'association', 'other', 'unknown')),
  website TEXT,
  company_phone TEXT,
  company_email TEXT,
  municipality TEXT,
  county TEXT,
  sni_code TEXT,
  industry TEXT,
  employee_band TEXT,
  turnover_band TEXT,

  source_name TEXT NOT NULL,
  source_url TEXT,
  source_checked_at TIMESTAMPTZ NOT NULL,
  source_facts JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(source_facts) = 'array'),
  factual_notes TEXT,
  processing_purpose TEXT NOT NULL DEFAULT 'handymate_b2b_launch'
    CHECK (processing_purpose = 'handymate_b2b_launch'),
  lawful_basis TEXT NOT NULL
    CHECK (lawful_basis IN ('legitimate_interest', 'warm_relationship', 'inbound_request')),
  retention_review_at TIMESTAMPTZ NOT NULL,

  primary_contact_name TEXT,
  primary_contact_role TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  primary_contact_linkedin TEXT,
  contact_basis TEXT NOT NULL DEFAULT 'unknown'
    CHECK (contact_basis IN ('warm_intro', 'inbound', 'customer_referral', 'public_business_contact', 'public_professional_role', 'unknown')),

  fit_score INTEGER NOT NULL DEFAULT 0 CHECK (fit_score BETWEEN 0 AND 100),
  fit_reasons JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(fit_reasons) = 'array'),
  status TEXT NOT NULL DEFAULT 'imported'
    CHECK (status IN ('imported', 'qualified', 'ready', 'contacted', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won', 'lost', 'suppressed')),
  suggested_channel TEXT NOT NULL DEFAULT 'none'
    CHECK (suggested_channel IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video', 'none')),
  owner_user_id UUID,
  next_action_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  contact_count INTEGER NOT NULL DEFAULT 0 CHECK (contact_count >= 0),

  research_summary TEXT,
  relevance_hypothesis TEXT,
  opening_angle TEXT,
  call_opener TEXT,
  email_draft TEXT,
  linkedin_draft TEXT,
  video_script TEXT,
  brief_source_snapshot JSONB,
  brief_generated_at TIMESTAMPTZ,
  brief_generated_by TEXT CHECK (brief_generated_by IN ('ai', 'template')),

  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX gtm_account_org_number_unique
  ON public.gtm_account (org_number)
  WHERE org_number IS NOT NULL;
CREATE INDEX gtm_account_queue
  ON public.gtm_account (status, next_action_at, fit_score DESC);
CREATE INDEX gtm_account_owner
  ON public.gtm_account (owner_user_id, status, next_action_at);
CREATE INDEX gtm_account_retention_review
  ON public.gtm_account (retention_review_at, status);
CREATE INDEX gtm_account_company_name
  ON public.gtm_account (company_name);

CREATE TABLE public.gtm_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.gtm_account(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL,
  channel TEXT NOT NULL
    CHECK (channel IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video', 'meeting', 'demo', 'other')),
  outcome TEXT NOT NULL
    CHECK (outcome IN ('attempted', 'no_answer', 'spoke', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won', 'lost', 'opt_out', 'note')),
  notes TEXT,
  happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX gtm_activity_account
  ON public.gtm_activity (account_id, happened_at DESC);
CREATE INDEX gtm_activity_admin
  ON public.gtm_activity (admin_user_id, happened_at DESC);

CREATE TABLE public.gtm_suppression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID UNIQUE REFERENCES public.gtm_account(id) ON DELETE SET NULL,
  org_number TEXT,
  email TEXT,
  phone TEXT,
  reason TEXT NOT NULL
    CHECK (reason IN ('opt_out', 'wrong_person', 'legal_unclear', 'duplicate', 'do_not_contact', 'other')),
  notes TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (account_id IS NOT NULL OR org_number IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX gtm_suppression_org_number ON public.gtm_suppression (org_number);
CREATE INDEX gtm_suppression_email ON public.gtm_suppression (LOWER(email));
CREATE INDEX gtm_suppression_phone ON public.gtm_suppression (phone);

-- Kontaktutfallet och kontots status skrivs atomiskt. Funktionen skickar
-- ingenting; den bokför bara vad en människa redan har gjort.
CREATE OR REPLACE FUNCTION public.record_gtm_activity(
  p_account_id UUID,
  p_admin_user_id UUID,
  p_channel TEXT,
  p_outcome TEXT,
  p_notes TEXT DEFAULT NULL,
  p_happened_at TIMESTAMPTZ DEFAULT NOW(),
  p_next_action_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account public.gtm_account%ROWTYPE;
  v_activity_id UUID;
  v_next_status TEXT;
  v_is_contact BOOLEAN;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_user_id is required';
  END IF;
  IF p_channel NOT IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video', 'meeting', 'demo', 'other') THEN
    RAISE EXCEPTION 'invalid channel';
  END IF;
  IF p_outcome NOT IN ('attempted', 'no_answer', 'spoke', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won', 'lost', 'note') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  SELECT * INTO v_account
  FROM public.gtm_account
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;
  IF v_account.status = 'suppressed' THEN RAISE EXCEPTION 'account is suppressed'; END IF;

  IF v_account.contact_basis NOT IN ('warm_intro', 'inbound', 'customer_referral')
     AND v_account.legal_form <> 'limited_company'
     AND p_channel IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video') THEN
    RAISE EXCEPTION 'cold contact requires classified limited company';
  END IF;

  -- Kall e-post är i V1 bara tillåten när mottagaren är ett aktiebolag
  -- och adressen har en uttrycklig professionell källa. Varma/inbound-spår
  -- får användas oavsett bolagsform. Oklassat läge failar stängt.
  IF p_channel = 'email'
     AND v_account.contact_basis NOT IN ('warm_intro', 'inbound', 'customer_referral')
     AND NOT (
       v_account.legal_form = 'limited_company'
       AND v_account.contact_basis IN ('public_business_contact', 'public_professional_role')
     ) THEN
    RAISE EXCEPTION 'email channel is not eligible';
  END IF;

  INSERT INTO public.gtm_activity (
    account_id, admin_user_id, channel, outcome, notes, happened_at, next_action_at
  ) VALUES (
    p_account_id, p_admin_user_id, p_channel, p_outcome, NULLIF(BTRIM(p_notes), ''),
    COALESCE(p_happened_at, NOW()), p_next_action_at
  ) RETURNING id INTO v_activity_id;

  v_is_contact := p_outcome <> 'note';
  v_next_status := CASE p_outcome
    WHEN 'replied' THEN 'replied'
    WHEN 'meeting_booked' THEN 'meeting_booked'
    WHEN 'demo_booked' THEN 'demo_booked'
    WHEN 'offer_sent' THEN 'offer_sent'
    WHEN 'won' THEN 'won'
    WHEN 'lost' THEN 'lost'
    WHEN 'note' THEN v_account.status
    ELSE 'contacted'
  END;

  UPDATE public.gtm_account
  SET status = v_next_status,
      contact_count = contact_count + CASE WHEN v_is_contact THEN 1 ELSE 0 END,
      last_contact_at = CASE WHEN v_is_contact THEN COALESCE(p_happened_at, NOW()) ELSE last_contact_at END,
      next_action_at = CASE WHEN p_outcome IN ('won', 'lost') THEN NULL ELSE p_next_action_at END,
      updated_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_activity_id;
END;
$$;

-- Spärr och spårbar notering sker i samma transaktion. Inga generiska
-- produktionsdata kan träffas eftersom funktionen bara accepterar gtm_account.id.
CREATE OR REPLACE FUNCTION public.suppress_gtm_account(
  p_account_id UUID,
  p_admin_user_id UUID,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_account public.gtm_account%ROWTYPE;
  v_suppression_id UUID;
BEGIN
  IF p_admin_user_id IS NULL THEN RAISE EXCEPTION 'admin_user_id is required'; END IF;
  IF p_reason NOT IN ('opt_out', 'wrong_person', 'legal_unclear', 'duplicate', 'do_not_contact', 'other') THEN
    RAISE EXCEPTION 'invalid suppression reason';
  END IF;

  SELECT * INTO v_account
  FROM public.gtm_account
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  INSERT INTO public.gtm_suppression (
    account_id, org_number, email, phone, reason, notes, created_by
  ) VALUES (
    v_account.id, v_account.org_number,
    COALESCE(v_account.primary_contact_email, v_account.company_email),
    COALESCE(v_account.primary_contact_phone, v_account.company_phone),
    p_reason, NULLIF(BTRIM(p_notes), ''), p_admin_user_id
  )
  ON CONFLICT (account_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by,
        created_at = NOW()
  RETURNING id INTO v_suppression_id;

  INSERT INTO public.gtm_activity (
    account_id, admin_user_id, channel, outcome, notes
  ) VALUES (
    v_account.id, p_admin_user_id, 'other',
    CASE WHEN p_reason = 'opt_out' THEN 'opt_out' ELSE 'note' END,
    COALESCE(NULLIF(BTRIM(p_notes), ''), 'Kontakt spärrad: ' || p_reason)
  );

  UPDATE public.gtm_account
  SET status = 'suppressed',
      suggested_channel = 'none',
      next_action_at = NULL,
      updated_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_suppression_id;
END;
$$;

ALTER TABLE public.gtm_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtm_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gtm_suppression ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.gtm_account FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gtm_activity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.gtm_suppression FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.gtm_account TO service_role;
GRANT ALL ON TABLE public.gtm_activity TO service_role;
GRANT ALL ON TABLE public.gtm_suppression TO service_role;

CREATE POLICY gtm_account_service_role ON public.gtm_account
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY gtm_activity_service_role ON public.gtm_activity
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY gtm_suppression_service_role ON public.gtm_suppression
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

REVOKE ALL ON FUNCTION public.record_gtm_activity(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.suppress_gtm_account(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_gtm_activity(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.suppress_gtm_account(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;

-- Verifiera efter körning:
-- SELECT tablename, policyname, roles FROM pg_policies
-- WHERE schemaname = 'public' AND tablename LIKE 'gtm_%' ORDER BY tablename;
-- SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name LIKE 'gtm_%' ORDER BY table_name, grantee;
