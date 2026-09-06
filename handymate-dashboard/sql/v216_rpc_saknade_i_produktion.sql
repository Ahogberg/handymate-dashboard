-- v216 (2026-09-06): två RPC:er som koden anropar men som aldrig fått en
-- migration — de saknades i både sql/ och produktion. Båda anroparna har
-- fallback (lib/auto-approve.ts steg 8, app/api/storefront/track/route.ts),
-- så inget var trasigt, men facit tests/schema-tider.spec.ts kräver nu att
-- varje .rpc('x') har en CREATE FUNCTION x här. Skrivna mot faktiska
-- kolumner i produktion (information_schema 2026-09-06).

-- Dagsräknare för automatiska godkännanden. Ingen unik nyckel förutsätts på
-- (business_id, action_type, count_date): uppdatera först, annars skapa.
CREATE OR REPLACE FUNCTION public.increment_auto_approve_count(
  p_business_id TEXT, p_action_type TEXT, p_count_date DATE
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE auto_approve_daily_count
     SET count = COALESCE(count, 0) + 1
   WHERE business_id = p_business_id AND action_type = p_action_type AND count_date = p_count_date
  RETURNING count INTO v_count;
  IF v_count IS NULL THEN
    INSERT INTO auto_approve_daily_count (business_id, action_type, count_date, count)
    VALUES (p_business_id, p_action_type, p_count_date, 1)
    RETURNING count INTO v_count;
  END IF;
  RETURN v_count;
END $$;

-- Sidvisningar på hemsidan. Bara företag med en storefront-rad påverkas.
CREATE OR REPLACE FUNCTION public.increment_storefront_views(bid TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_views INTEGER;
BEGIN
  UPDATE storefront SET page_views = COALESCE(page_views, 0) + 1 WHERE business_id = bid
  RETURNING page_views INTO v_views;
  RETURN v_views;
END $$;

REVOKE ALL ON FUNCTION public.increment_auto_approve_count(TEXT, TEXT, DATE), public.increment_storefront_views(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_auto_approve_count(TEXT, TEXT, DATE), public.increment_storefront_views(TEXT) TO service_role;
