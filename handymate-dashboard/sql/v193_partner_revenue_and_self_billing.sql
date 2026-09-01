-- v191 — Partner Revenue Reality: append-only liggare, atomiska batchar och riktig självfaktura
--
-- Förutsätter v190 (partnerattributionen låst). Körs MANUELLT i Supabase SQL Editor.
-- Ingen befintlig ekonomisk rad räknas om eller skrivs över. Gamla liggarrader
-- får en deterministisk source_key; alla framtida rättelser blir NYA rader.

BEGIN;

-- 1. Partnerns juridiska/faktureringsmässiga identitet. Inget fält får
-- gissas: batch-RPC:n vägrar skapa självfaktura tills uppgifterna är kompletta.
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS self_billing_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS self_billing_org_number TEXT,
  ADD COLUMN IF NOT EXISTS self_billing_registered_address TEXT,
  ADD COLUMN IF NOT EXISTS self_billing_vat_number TEXT,
  ADD COLUMN IF NOT EXISTS self_billing_vat_registered BOOLEAN,
  ADD COLUMN IF NOT EXISTS self_billing_vat_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS self_billing_f_tax_approved BOOLEAN,
  ADD COLUMN IF NOT EXISTS self_billing_email TEXT,
  ADD COLUMN IF NOT EXISTS payout_bankgiro TEXT,
  ADD COLUMN IF NOT EXISTS payout_plusgiro TEXT,
  ADD COLUMN IF NOT EXISTS payout_account TEXT;

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_self_billing_vat_rate_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_self_billing_vat_rate_check
  CHECK (self_billing_vat_rate IS NULL OR self_billing_vat_rate BETWEEN 0 AND 1);

-- 2. Append-only liggare. Den gamla unikheten partner×kund×period gjorde en
-- spårbar refund-rad omöjlig. source_key blir det nya idempotensankaret.
ALTER TABLE public.partner_commission_ledger
  ADD COLUMN IF NOT EXISTS entry_kind TEXT NOT NULL DEFAULT 'accrual',
  ADD COLUMN IF NOT EXISTS source_key TEXT,
  ADD COLUMN IF NOT EXISTS adjusts_ledger_id UUID REFERENCES public.partner_commission_ledger(id);

ALTER TABLE public.partner_commission_ledger
  DROP CONSTRAINT IF EXISTS partner_commission_ledger_entry_kind_check;
ALTER TABLE public.partner_commission_ledger
  ADD CONSTRAINT partner_commission_ledger_entry_kind_check
  CHECK (entry_kind IN ('accrual', 'adjustment'));

UPDATE public.partner_commission_ledger
SET source_key = 'legacy-accrual:' || partner_id::text || ':' || business_id || ':' || period
WHERE source_key IS NULL;

ALTER TABLE public.partner_commission_ledger
  ALTER COLUMN source_key SET NOT NULL;

ALTER TABLE public.partner_commission_ledger
  DROP CONSTRAINT IF EXISTS partner_commission_ledger_partner_id_business_id_period_key;

CREATE UNIQUE INDEX IF NOT EXISTS partner_commission_ledger_source_key_unique
  ON public.partner_commission_ledger (partner_id, source_key);
CREATE INDEX IF NOT EXISTS partner_commission_ledger_adjusts_idx
  ON public.partner_commission_ledger (adjusts_ledger_id)
  WHERE adjusts_ledger_id IS NOT NULL;

-- 3. Självfakturans frysta livscykel + separat nummerserie per partner/år.
ALTER TABLE public.partner_payout_batch
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date DATE,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS subtotal_sek NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_sek NUMERIC,
  ADD COLUMN IF NOT EXISTS total_incl_vat_sek NUMERIC,
  ADD COLUMN IF NOT EXISTS document_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Refunds och chargebacks kan skapa en ny append-only-rättelse efter att
-- periodens första underlag redan frysts. En batch per partner/period är
-- därför fel idempotensgräns; fakturanumret och liggarradernas source_key
-- är de verkliga unika identiteterna.
ALTER TABLE public.partner_payout_batch
  DROP CONSTRAINT IF EXISTS partner_payout_batch_partner_id_period_key;

ALTER TABLE public.partner_payout_batch
  DROP CONSTRAINT IF EXISTS partner_payout_batch_delivery_status_check;
ALTER TABLE public.partner_payout_batch
  ADD CONSTRAINT partner_payout_batch_delivery_status_check
  CHECK (delivery_status IN ('pending', 'available', 'emailed', 'failed'));
ALTER TABLE public.partner_payout_batch
  DROP CONSTRAINT IF EXISTS partner_payout_batch_review_status_check;
ALTER TABLE public.partner_payout_batch
  ADD CONSTRAINT partner_payout_batch_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'disputed', 'deemed_approved'));

CREATE UNIQUE INDEX IF NOT EXISTS partner_payout_batch_invoice_number_unique
  ON public.partner_payout_batch (invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.partner_self_billing_sequence (
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  invoice_year INTEGER NOT NULL,
  last_number INTEGER NOT NULL CHECK (last_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (partner_id, invoice_year)
);

ALTER TABLE public.partner_self_billing_sequence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_self_billing_sequence_service_role ON public.partner_self_billing_sequence;
CREATE POLICY partner_self_billing_sequence_service_role
  ON public.partner_self_billing_sequence FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.partner_self_billing_sequence FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_self_billing_sequence TO service_role;

-- 4. Atomisk liggarskrivning. Hela partnerns periodbatch går in eller inget.
CREATE OR REPLACE FUNCTION public.record_partner_commission_rows(
  p_partner_id UUID,
  p_period TEXT,
  p_rows JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row JSONB;
  v_inserted INTEGER := 0;
  v_amount NUMERIC := 0;
  v_inserted_amount NUMERIC;
BEGIN
  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltig period' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows måste vara en JSON-array' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'Partner hittades inte' USING ERRCODE = 'P0002';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF COALESCE(v_row->>'source_key', '') = ''
       OR COALESCE(v_row->>'business_id', '') = ''
       OR COALESCE((v_row->>'customer_month')::INTEGER, 0) < 1 THEN
      RAISE EXCEPTION 'Ogiltig provisionsrad' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.partner_commission_ledger (
      partner_id, business_id, referral_id, period, customer_month,
      base_amount_sek, rate, amount_sek, rate_source, tier_snapshot,
      source_billing_event_ids, status, entry_kind, source_key, adjusts_ledger_id
    ) VALUES (
      p_partner_id,
      v_row->>'business_id',
      NULLIF(v_row->>'referral_id', ''),
      p_period,
      (v_row->>'customer_month')::INTEGER,
      (v_row->>'base_amount_sek')::NUMERIC,
      (v_row->>'rate')::NUMERIC,
      (v_row->>'amount_sek')::NUMERIC,
      v_row->>'rate_source',
      COALESCE(v_row->'tier_snapshot', '{}'::jsonb),
      COALESCE(v_row->'source_billing_event_ids', '[]'::jsonb),
      'accrued',
      COALESCE(v_row->>'entry_kind', 'accrual'),
      v_row->>'source_key',
      NULLIF(v_row->>'adjusts_ledger_id', '')::UUID
    )
    ON CONFLICT (partner_id, source_key) DO NOTHING
    RETURNING amount_sek INTO v_inserted_amount;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
      v_amount := v_amount + v_inserted_amount;
    END IF;
  END LOOP;

  UPDATE public.partners p SET
    total_pending_sek = COALESCE((
      SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l
      WHERE l.partner_id = p_partner_id AND l.status = 'accrued'
    ), 0),
    total_earned_sek = COALESCE((
      SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l
      WHERE l.partner_id = p_partner_id AND l.status = 'paid'
    ), 0)
  WHERE p.id = p_partner_id;

  RETURN jsonb_build_object('inserted', v_inserted, 'amount_sek', v_amount);
END;
$$;

-- 5. Batch + nummerserie + fryst dokument + radlänkning i EN transaktion.
CREATE OR REPLACE FUNCTION public.create_partner_self_billing_batch(
  p_partner_id UUID,
  p_period TEXT,
  p_buyer JSONB,
  p_actor TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner public.partners%ROWTYPE;
  v_rows JSONB;
  v_row_ids UUID[];
  v_subtotal NUMERIC;
  v_vat_rate NUMERIC;
  v_vat NUMERIC;
  v_total NUMERIC;
  v_year INTEGER;
  v_sequence INTEGER;
  v_invoice_number TEXT;
  v_invoice_date DATE := CURRENT_DATE;
  v_due_date DATE := CURRENT_DATE + 30;
  v_payout_reference TEXT;
  v_snapshot JSONB;
  v_batch_id UUID;
BEGIN
  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltig period' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partner hittades inte' USING ERRCODE = 'P0002'; END IF;

  v_payout_reference := COALESCE(
    NULLIF(v_partner.payout_bankgiro, ''),
    NULLIF(v_partner.payout_plusgiro, ''),
    NULLIF(v_partner.payout_account, '')
  );
  IF COALESCE(v_partner.self_billing_legal_name, '') = ''
     OR COALESCE(v_partner.self_billing_org_number, '') = ''
     OR COALESCE(v_partner.self_billing_registered_address, '') = ''
     OR COALESCE(v_partner.self_billing_email, '') = ''
     OR v_partner.self_billing_vat_registered IS NULL
     OR v_partner.self_billing_f_tax_approved IS NULL
     OR v_partner.self_billing_vat_rate IS NULL
     OR v_payout_reference IS NULL
     OR (v_partner.self_billing_vat_registered AND COALESCE(v_partner.self_billing_vat_number, '') = '') THEN
    RAISE EXCEPTION 'Partnerns självfaktureringsuppgifter är ofullständiga' USING ERRCODE = '23514';
  END IF;
  IF NOT v_partner.self_billing_vat_registered AND v_partner.self_billing_vat_rate <> 0 THEN
    RAISE EXCEPTION 'Ej momsregistrerad partner måste ha momssats 0' USING ERRCODE = '23514';
  END IF;
  IF COALESCE(p_buyer->>'legalName', '') = ''
     OR COALESCE(p_buyer->>'organizationNumber', '') = ''
     OR COALESCE(p_buyer->>'registeredAddress', '') = ''
     OR COALESCE(p_buyer->>'vatNumber', '') = ''
     OR COALESCE(p_buyer->>'email', '') = '' THEN
    RAISE EXCEPTION 'Handymates faktureringsidentitet är ofullständig' USING ERRCODE = '23514';
  END IF;

  SELECT
    array_agg(l.id ORDER BY l.period, l.created_at, l.id),
    jsonb_agg(jsonb_build_object(
      'customerName', COALESCE(NULLIF(b.company_name, ''), NULLIF(b.business_name, ''), l.business_id),
      'period', l.period,
      'customerMonth', l.customer_month,
      'baseSek', l.base_amount_sek,
      'rate', l.rate,
      'commissionSek', l.amount_sek,
      'kind', l.entry_kind
    ) ORDER BY l.period, l.created_at, l.id),
    ROUND(SUM(l.amount_sek), 2)
  INTO v_row_ids, v_rows, v_subtotal
  FROM public.partner_commission_ledger l
  LEFT JOIN public.business_config b ON b.business_id = l.business_id
  WHERE l.partner_id = p_partner_id
    AND l.status = 'accrued'
    AND l.payout_batch_id IS NULL
    AND l.period <= p_period;

  IF v_row_ids IS NULL OR array_length(v_row_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Inga upplupna rader att bunta' USING ERRCODE = 'P0002';
  END IF;
  IF v_subtotal < 500 THEN
    RAISE EXCEPTION 'Minsta ordinarie utbetalning är 500 kr' USING ERRCODE = '23514';
  END IF;

  v_vat_rate := CASE WHEN v_partner.self_billing_vat_registered THEN v_partner.self_billing_vat_rate ELSE 0 END;
  v_vat := ROUND(v_subtotal * v_vat_rate, 2);
  v_total := ROUND(v_subtotal + v_vat, 2);
  v_year := EXTRACT(YEAR FROM v_invoice_date)::INTEGER;

  INSERT INTO public.partner_self_billing_sequence (partner_id, invoice_year, last_number)
  VALUES (p_partner_id, v_year, 1)
  ON CONFLICT (partner_id, invoice_year) DO UPDATE
    SET last_number = public.partner_self_billing_sequence.last_number + 1,
        updated_at = NOW()
  RETURNING last_number INTO v_sequence;

  v_invoice_number := 'SF-' || v_year::TEXT || '-' || UPPER(LEFT(REPLACE(p_partner_id::TEXT, '-', ''), 6))
    || '-' || LPAD(v_sequence::TEXT, 4, '0');

  v_snapshot := jsonb_build_object(
    'documentType', 'self_billing_invoice',
    'title', 'SJÄLVFAKTURERING',
    'invoiceNumber', v_invoice_number,
    'invoiceDate', v_invoice_date,
    'dueDate', v_due_date,
    'seller', jsonb_build_object(
      'legalName', v_partner.self_billing_legal_name,
      'organizationNumber', v_partner.self_billing_org_number,
      'registeredAddress', v_partner.self_billing_registered_address,
      'vatNumber', CASE WHEN v_partner.self_billing_vat_registered THEN v_partner.self_billing_vat_number ELSE NULL END,
      'email', v_partner.self_billing_email,
      'vatRegistered', v_partner.self_billing_vat_registered,
      'vatRate', v_vat_rate,
      'fTaxApproved', v_partner.self_billing_f_tax_approved,
      'payoutReference', v_payout_reference
    ),
    'buyer', p_buyer,
    'rows', v_rows,
    'subtotalSek', v_subtotal,
    'vatRate', v_vat_rate,
    'vatSek', v_vat,
    'totalSek', v_total,
    'paymentTermsDays', 30,
    'generatedAt', NOW()
  );

  INSERT INTO public.partner_payout_batch (
    partner_id, period, total_sek, status, statement,
    invoice_number, invoice_date, due_date, subtotal_sek, vat_rate, vat_sek,
    total_incl_vat_sek, document_snapshot, delivery_status, delivered_at,
    review_status, created_by
  ) VALUES (
    p_partner_id, p_period, v_subtotal, 'open', v_rows,
    v_invoice_number, v_invoice_date, v_due_date, v_subtotal, v_vat_rate, v_vat,
    v_total, v_snapshot, 'available', NOW(), 'pending', p_actor
  ) RETURNING id INTO v_batch_id;

  UPDATE public.partner_commission_ledger
  SET payout_batch_id = v_batch_id
  WHERE id = ANY(v_row_ids)
    AND payout_batch_id IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liggarraderna kunde inte länkas atomiskt' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'invoice_number', v_invoice_number,
    'subtotal_sek', v_subtotal,
    'vat_sek', v_vat,
    'total_sek', v_total,
    'due_date', v_due_date,
    'actor', p_actor
  );
END;
$$;

-- 6. Partnerns granskning är också atomisk. API:t verifierar JWT:n och
-- skickar alltid den inloggade partnerns id; RPC:n verifierar dessutom att
-- batchen faktiskt tillhör samma partner.
CREATE OR REPLACE FUNCTION public.review_partner_self_billing_batch(
  p_batch_id UUID,
  p_partner_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.partner_payout_batch%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_decision NOT IN ('approved', 'disputed') THEN
    RAISE EXCEPTION 'Ogiltigt granskningsbeslut' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'disputed' AND COALESCE(BTRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Anledning krävs vid bestridande' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_batch
  FROM public.partner_payout_batch
  WHERE id = p_batch_id AND partner_id = p_partner_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Självfakturan hittades inte för partnern' USING ERRCODE = 'P0002';
  END IF;
  IF v_batch.status = 'paid' THEN
    RAISE EXCEPTION 'Utbetald självfaktura kan inte granskas på nytt' USING ERRCODE = '23514';
  END IF;
  IF v_batch.review_status <> 'pending' THEN
    RAISE EXCEPTION 'Självfakturan är redan granskad' USING ERRCODE = '23514';
  END IF;

  UPDATE public.partner_payout_batch
  SET review_status = p_decision,
      reviewed_at = v_now,
      dispute_reason = CASE WHEN p_decision = 'disputed' THEN BTRIM(p_reason) ELSE NULL END
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'review_status', p_decision,
    'reviewed_at', v_now
  );
END;
$$;

-- 7. Betalmarkering: batch + alla liggarrader + totalsummor i EN transaktion.
CREATE OR REPLACE FUNCTION public.mark_partner_self_billing_paid(
  p_batch_id UUID,
  p_paid_by TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch public.partner_payout_batch%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
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
  SET status = 'paid', paid_at = v_now
  WHERE payout_batch_id = p_batch_id AND status = 'accrued';

  UPDATE public.partner_payout_batch
  SET status = 'paid', paid_at = v_now, paid_by = p_paid_by
  WHERE id = p_batch_id;

  UPDATE public.partners p SET
    total_pending_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'accrued'), 0),
    total_earned_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'paid'), 0)
  WHERE p.id = v_batch.partner_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'paid_at', v_now, 'total_sek', v_batch.total_incl_vat_sek);
END;
$$;

REVOKE ALL ON FUNCTION public.record_partner_commission_rows(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_partner_commission_rows(UUID, TEXT, JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.review_partner_self_billing_batch(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_partner_self_billing_batch(UUID, UUID, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.mark_partner_self_billing_paid(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_partner_self_billing_paid(UUID, TEXT) TO service_role;

COMMIT;

-- Manuell kontroll efter körning:
-- SELECT routine_name, security_type FROM information_schema.routines
-- WHERE routine_name IN ('record_partner_commission_rows','create_partner_self_billing_batch','review_partner_self_billing_batch','mark_partner_self_billing_paid');
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name = 'partner_self_billing_sequence' AND grantee IN ('anon','authenticated'); -- 0 rader
-- SELECT count(*) FROM partner_commission_ledger WHERE source_key IS NULL; -- 0
