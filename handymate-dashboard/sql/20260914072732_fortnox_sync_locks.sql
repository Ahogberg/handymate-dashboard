-- Service-only, bounded leases for OAuth rotation and invoice imports. No credentials stored here.
CREATE TABLE IF NOT EXISTS public.fortnox_operation_lock (
 business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 operation text NOT NULL CHECK (operation IN ('oauth', 'invoice-import')),
 owner uuid NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY (business_id, operation)
);
ALTER TABLE public.fortnox_operation_lock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fortnox_operation_lock FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.fortnox_operation_lock TO service_role;
CREATE OR REPLACE FUNCTION public.claim_fortnox_operation(p_business_id text, p_operation text, p_owner uuid, p_renew boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE claimed integer;
BEGIN
 IF p_renew THEN
  UPDATE public.fortnox_operation_lock SET expires_at = clock_timestamp() + interval '90 seconds'
   WHERE business_id=p_business_id AND operation=p_operation AND owner=p_owner AND expires_at > clock_timestamp();
 ELSE
  INSERT INTO public.fortnox_operation_lock (business_id, operation, owner, expires_at)
   VALUES (p_business_id,p_operation,p_owner,clock_timestamp()+interval '90 seconds')
   ON CONFLICT (business_id,operation) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at
   WHERE fortnox_operation_lock.expires_at < clock_timestamp();
 END IF;
 GET DIAGNOSTICS claimed = ROW_COUNT;
 RETURN claimed = 1;
END; $$;
REVOKE ALL ON FUNCTION public.claim_fortnox_operation(text,text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_fortnox_operation(text,text,uuid,boolean) TO service_role;

-- Fail rather than silently delete any historic duplicates. Preflight on 2026-09-14: zero groups.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_fortnox_document_unique ON public.invoice (business_id, fortnox_document_number);
