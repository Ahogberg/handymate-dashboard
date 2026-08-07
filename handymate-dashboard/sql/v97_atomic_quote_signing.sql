-- V97: atomisk publik offertsignering
-- KÖRS MANUELLT i Supabase SQL Editor. Kör inte från applikationskod.
--
-- Funktionen låser offerthuvudet och skriver kundens tillvalsval, signatur och
-- signerade summor i samma transaktion. Ett fel i något steg rullar därmed
-- tillbaka hela signeringen, motsvarande kompensationsavsikten i PUT-grenen
-- men utan ett mellanläge som andra requests kan observera.

BEGIN;

-- Förhandskontroll: ska returnera 30 rader. STOPPA vid avvikelse.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'quotes' AND column_name IN (
      'quote_id', 'business_id', 'sign_token', 'status', 'valid_until',
      'signed_at', 'signed_by_name', 'signed_by_ip', 'signature_data',
      'accepted_at', 'labor_total', 'material_total', 'subtotal',
      'discount_amount', 'vat_amount', 'total', 'rot_work_cost',
      'rot_deduction', 'rot_customer_pays', 'rut_work_cost', 'rut_deduction',
      'rut_customer_pays', 'rot_rut_eligible', 'rot_rut_deduction',
      'customer_pays', 'signed_options'
    ))
    OR (table_name = 'quote_items' AND column_name IN (
      'id', 'quote_id', 'item_type', 'option_selected'
    ))
  )
ORDER BY table_name, column_name;

CREATE OR REPLACE FUNCTION public.sign_quote_with_options(
  p_quote_id TEXT,
  p_business_id TEXT,
  p_sign_token TEXT,
  p_selected_option_ids TEXT[],
  p_signed_at TIMESTAMPTZ,
  p_signed_by_name TEXT,
  p_signed_by_ip TEXT,
  p_signature_data TEXT,
  p_totals JSONB,
  p_signed_options JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  locked_quote public.quotes%ROWTYPE;
  updated_quote public.quotes%ROWTYPE;
  selected_ids TEXT[] := COALESCE(p_selected_option_ids, ARRAY[]::TEXT[]);
BEGIN
  SELECT q.*
  INTO locked_quote
  FROM public.quotes AS q
  WHERE q.quote_id = p_quote_id
    AND q.business_id = p_business_id
    AND q.sign_token = p_sign_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QUOTE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF locked_quote.status = 'accepted' AND locked_quote.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'QUOTE_ALREADY_SIGNED' USING ERRCODE = 'P0001';
  END IF;
  IF locked_quote.status = 'declined' THEN
    RAISE EXCEPTION 'QUOTE_ALREADY_DECLINED' USING ERRCODE = 'P0001';
  END IF;
  IF locked_quote.status = 'expired'
     OR (locked_quote.valid_until IS NOT NULL AND locked_quote.valid_until < CURRENT_DATE) THEN
    RAISE EXCEPTION 'QUOTE_EXPIRED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(selected_ids) AS selected_option_id(id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.quote_items AS qi
      WHERE qi.id = selected_option_id.id
        AND qi.quote_id = p_quote_id
        AND qi.item_type = 'option'
    )
  ) THEN
    RAISE EXCEPTION 'INVALID_QUOTE_OPTION' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.quote_items AS qi
  SET option_selected = qi.id = ANY(selected_ids)
  WHERE qi.quote_id = p_quote_id
    AND qi.item_type = 'option';

  UPDATE public.quotes AS q
  SET
    status = 'accepted',
    signed_at = p_signed_at,
    signed_by_name = p_signed_by_name,
    signed_by_ip = p_signed_by_ip,
    signature_data = p_signature_data,
    accepted_at = p_signed_at,
    labor_total = CASE WHEN p_totals IS NULL THEN q.labor_total ELSE (p_totals->>'labor_total')::NUMERIC END,
    material_total = CASE WHEN p_totals IS NULL THEN q.material_total ELSE (p_totals->>'material_total')::NUMERIC END,
    subtotal = CASE WHEN p_totals IS NULL THEN q.subtotal ELSE (p_totals->>'subtotal')::NUMERIC END,
    discount_amount = CASE WHEN p_totals IS NULL THEN q.discount_amount ELSE (p_totals->>'discount_amount')::NUMERIC END,
    vat_amount = CASE WHEN p_totals IS NULL THEN q.vat_amount ELSE (p_totals->>'vat_amount')::NUMERIC END,
    total = CASE WHEN p_totals IS NULL THEN q.total ELSE (p_totals->>'total')::NUMERIC END,
    rot_work_cost = CASE WHEN p_totals IS NULL THEN q.rot_work_cost ELSE (p_totals->>'rot_work_cost')::NUMERIC END,
    rot_deduction = CASE WHEN p_totals IS NULL THEN q.rot_deduction ELSE (p_totals->>'rot_deduction')::NUMERIC END,
    rot_customer_pays = CASE WHEN p_totals IS NULL THEN q.rot_customer_pays ELSE (p_totals->>'rot_customer_pays')::NUMERIC END,
    rut_work_cost = CASE WHEN p_totals IS NULL THEN q.rut_work_cost ELSE (p_totals->>'rut_work_cost')::NUMERIC END,
    rut_deduction = CASE WHEN p_totals IS NULL THEN q.rut_deduction ELSE (p_totals->>'rut_deduction')::NUMERIC END,
    rut_customer_pays = CASE WHEN p_totals IS NULL THEN q.rut_customer_pays ELSE (p_totals->>'rut_customer_pays')::NUMERIC END,
    rot_rut_eligible = CASE WHEN p_totals IS NULL THEN q.rot_rut_eligible ELSE (p_totals->>'rot_rut_eligible')::NUMERIC END,
    rot_rut_deduction = CASE WHEN p_totals IS NULL THEN q.rot_rut_deduction ELSE (p_totals->>'rot_rut_deduction')::NUMERIC END,
    customer_pays = CASE WHEN p_totals IS NULL THEN q.customer_pays ELSE (p_totals->>'customer_pays')::NUMERIC END,
    signed_options = CASE WHEN p_totals IS NULL THEN q.signed_options ELSE p_signed_options END
  WHERE q.quote_id = p_quote_id
    AND q.business_id = p_business_id
    AND q.sign_token = p_sign_token
  RETURNING q.* INTO updated_quote;

  RETURN jsonb_build_object(
    'quote_id', updated_quote.quote_id,
    'status', updated_quote.status,
    'total', updated_quote.total,
    'customer_pays', updated_quote.customer_pays
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sign_quote_with_options(
  TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sign_quote_with_options(
  TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, JSONB
) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Manuell verifiering efter körning:
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'sign_quote_with_options';
--
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE specific_schema = 'public' AND routine_name = 'sign_quote_with_options';
