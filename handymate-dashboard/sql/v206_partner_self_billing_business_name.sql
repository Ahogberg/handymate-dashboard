-- Partnerprogram: korrigera självfakturans kundnamn mot skarpt business_config-schema.
-- Forutsatter v193 och v205. KORS MANUELLT i Supabase SQL Editor.
-- business_config har business_name, inte company_name. Den tidigare funktionen
-- refererade bada och kunde darfor aldrig skapa ett underlag i skarp databas.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_partner_self_billing_batch(
  p_partner_id UUID,
  p_period TEXT,
  p_buyer JSONB,
  p_actor TEXT,
  p_is_final_payout BOOLEAN,
  p_final_payout_reason TEXT
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
  v_final_reason TEXT := NULLIF(BTRIM(COALESCE(p_final_payout_reason, '')), '');
BEGIN
  IF p_period !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'Ogiltig period' USING ERRCODE = '22023';
  END IF;
  IF p_is_final_payout AND v_final_reason IS NULL THEN
    RAISE EXCEPTION 'Skäl krävs för slututbetalning' USING ERRCODE = '23514';
  END IF;
  IF NOT p_is_final_payout AND v_final_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Slututbetalningsskäl får bara anges för slututbetalning' USING ERRCODE = '23514';
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
      'customerName', COALESCE(NULLIF(b.business_name, ''), l.business_id),
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
  IF v_subtotal < 500 AND NOT p_is_final_payout THEN
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
    'isFinalPayout', p_is_final_payout,
    'finalPayoutReason', v_final_reason,
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
    review_status, created_by, is_final_payout, final_payout_reason
  ) VALUES (
    p_partner_id, p_period, v_subtotal, 'open', v_rows,
    v_invoice_number, v_invoice_date, v_due_date, v_subtotal, v_vat_rate, v_vat,
    v_total, v_snapshot, 'available', NOW(), 'pending', p_actor,
    p_is_final_payout, v_final_reason
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
    'is_final_payout', p_is_final_payout,
    'actor', p_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_self_billing_batch(UUID, TEXT, JSONB, TEXT, BOOLEAN, TEXT)
  TO service_role;

COMMIT;
