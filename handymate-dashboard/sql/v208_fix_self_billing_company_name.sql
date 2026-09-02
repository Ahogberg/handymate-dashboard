-- EFTERSKRIFT 2026-09-02, efter körning: v206_partner_self_billing_business_name.sql
-- (Codex lane, körd EFTER den här filen) ersätter samma funktion med en
-- likvärdig rättelse — den läser också business_name i stället för det
-- obefintliga company_name. Den gällande definitionen i produktion kommer
-- alltså från v206, inte härifrån. Den här filen står kvar som dokumentation
-- av felet och som den fix som faktiskt öppnade utbetalningsvägen först.
-- OBS för den som kör om äldre migrationer: v205 innehåller en ÄLDRE version
-- av samma funktion. Kör aldrig v205 utan att köra v206 direkt efteråt och
-- verifiera att b.company_name är borta — annars återinförs buggen tyst.
--
-- v208: laga create_partner_self_billing_batch — fantomfältet business_config.company_name
--
-- BAKGRUND (2026-09-02): branschgenomgången av schemadriften hittade att
-- `business_config.company_name` aldrig har funnits — den riktiga kolumnen
-- heter `business_name`. Fantomfältet fixades i TypeScript-rutterna
-- (app/api/admin/partners/commission/route.ts, app/api/partners/dashboard/
-- route.ts) men levde kvar inuti den här SECURITY DEFINER-funktionen, dit
-- kolumnvakten inte når (den skannar .from()-anrop i källkod, inte PL/pgSQL-
-- kroppar).
--
-- FELET: funktionens stora SELECT joinar business_config och läser
--   COALESCE(NULLIF(b.company_name, ''), NULLIF(b.business_name, ''), l.business_id)
-- PostgreSQL planerar satsen först vid körning, så funktionen kunde SKAPAS
-- utan fel men kastar 42703 varje gång den anropas. Verifierat mot skarp bas:
--   ERROR: 42703: column b.company_name does not exist
-- Konsekvens: ingen partner kan få en självfaktura skapad. Hela utbetalnings-
-- vägen är stängd, tyst, tills någon försöker.
--
-- ÄNDRINGEN: exakt den befintliga funktionskroppen (hämtad med
-- pg_get_functiondef ur produktionen), med EN rad ändrad — det obefintliga
-- b.company_name är borta. Allt annat är oförändrat, avsiktligt: det här är
-- en fix, inte ett tillfälle att skriva om utbetalningslogiken.
--
-- Icke-destruktiv: ersätter en funktion som ändå inte kan köra.

CREATE OR REPLACE FUNCTION public.create_partner_self_billing_batch(
  p_partner_id uuid,
  p_period text,
  p_buyer jsonb,
  p_actor text,
  p_is_final_payout boolean,
  p_final_payout_reason text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- v208: b.company_name finns inte och kastade 42703 här. business_name
      -- är den riktiga kolumnen; l.business_id är samma sista utväg som förut.
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
$function$;
