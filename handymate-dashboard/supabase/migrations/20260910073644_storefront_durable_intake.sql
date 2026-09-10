-- Durable storefront intake; apply after portal durable intake. No external sends.
BEGIN;
CREATE OR REPLACE FUNCTION public.receive_storefront_lead_intake(p_business text,p_scope text,p_key text,p_input jsonb)
RETURNS public.lead_intake_request LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.lead_intake_request;
BEGIN
 IF p_scope IS NULL OR length(p_scope) NOT BETWEEN 1 AND 120 OR p_key IS NULL OR length(p_key) NOT BETWEEN 8 AND 100
   OR p_input IS NULL OR jsonb_typeof(p_input)<>'object'
   OR coalesce(jsonb_typeof(p_input->'name'),'null')<>'string' OR length(btrim(p_input->>'name')) NOT BETWEEN 1 AND 200
   OR coalesce(jsonb_typeof(p_input->'phone'),'null')<>'string' OR length(btrim(p_input->>'phone')) NOT BETWEEN 0 AND 80
   OR (nullif(btrim(p_input->>'email'),'') IS NOT NULL AND (jsonb_typeof(p_input->'email')<>'string' OR length(p_input->>'email')>320 OR (p_input->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
   OR (public.lead_intake_phone(p_input->>'phone')='' AND nullif(btrim(p_input->>'email'),'') IS NULL)
 THEN RAISE EXCEPTION 'intake_invalid'; END IF;
 INSERT INTO public.lead_intake_request(business_id,source_scope,request_key,input)
 VALUES(p_business,p_scope,p_key,p_input) ON CONFLICT(business_id,source_scope,request_key) DO NOTHING;
 SELECT * INTO STRICT r FROM public.lead_intake_request WHERE business_id=p_business AND source_scope=p_scope AND request_key=p_key;
 IF r.input IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'intake_request_changed'; END IF;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.complete_lead_intake(p_business text,p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r public.lead_intake_request; c public.customer; matches text[]; phone text; v_email text; stage text; plural_stage text; n integer; source_id uuid; v_category text;
BEGIN
 -- Common ordering: business, receipt, customer, counters. Serializes this
 -- durable path across different requests for the same customer as well.
 PERFORM 1 FROM public.business_config WHERE business_id=p_business FOR NO KEY UPDATE;
 SELECT * INTO r FROM public.lead_intake_request WHERE business_id=p_business AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'intake_missing'; END IF;
 IF r.state='completed' THEN RETURN jsonb_build_object('receipt',to_jsonb(r),'fresh',false); END IF;
 -- This block is a subtransaction. Any failure rolls back ALL entity writes;
 -- the receipt survives and records a retryable state outside that block.
 BEGIN
  phone:=public.lead_intake_phone(r.input->>'phone'); v_email:=nullif(lower(btrim(r.input->>'email')),'');
  IF phone='' AND v_email IS NULL THEN RAISE EXCEPTION 'intake_invalid'; END IF;
  SELECT array_agg(customer_id) INTO matches FROM public.customer WHERE business_id=p_business AND phone<>'' AND public.lead_intake_phone(phone_number)=phone;
  IF coalesce(cardinality(matches),0)=0 AND v_email IS NOT NULL THEN
   SELECT array_agg(customer_id) INTO matches FROM public.customer WHERE business_id=p_business AND lower(btrim(customer.email))=v_email;
  END IF;
  IF coalesce(cardinality(matches),0)>1 THEN RAISE EXCEPTION 'customer_ambiguous'; END IF;
  SELECT id INTO stage FROM public.pipeline_stage WHERE business_id=p_business AND slug='new_inquiry' ORDER BY id LIMIT 1;
  IF stage IS NULL THEN RAISE EXCEPTION 'pipeline_unavailable'; END IF;
  source_id:=nullif(r.input->>'lead_source_id','')::uuid;
  IF source_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lead_sources WHERE business_id=p_business AND id=source_id AND is_active=true) THEN
   RAISE EXCEPTION 'source_unavailable';
  END IF;
  v_category:=nullif(r.input->>'category','');
  IF v_category IS NULL AND source_id IS NOT NULL THEN
   SELECT default_category INTO v_category FROM public.lead_sources WHERE business_id=p_business AND id=source_id;
  END IF;
  IF coalesce(cardinality(matches),0)=1 THEN
   SELECT * INTO STRICT c FROM public.customer WHERE business_id=p_business AND customer_id=matches[1] FOR UPDATE;
   UPDATE public.customer SET phone_number=CASE WHEN coalesce(phone_number,'')='' THEN phone ELSE phone_number END,
     email=CASE WHEN coalesce(customer.email,'')='' THEN nullif(r.input->>'email','') ELSE customer.email END
   WHERE business_id=p_business AND customer_id=c.customer_id;
  ELSE
   INSERT INTO public.customer(customer_id,business_id,name,phone_number,email)
   VALUES('cust_'||gen_random_uuid()::text,p_business,r.input->>'name',phone,nullif(r.input->>'email','')) RETURNING * INTO c;
  END IF;
  UPDATE public.customer SET address_line=r.input->>'address_line'
   WHERE business_id=p_business AND customer_id=c.customer_id AND coalesce(address_line,'')='' AND nullif(r.input->>'address_line','') IS NOT NULL;
  SELECT key INTO plural_stage FROM public.pipeline_stages WHERE business_id=p_business ORDER BY sort_order LIMIT 1;
  r.lead_id:='lead_'||gen_random_uuid()::text; r.deal_id:=gen_random_uuid()::text; r.customer_id:=c.customer_id;
  INSERT INTO public.leads(lead_id,business_id,customer_id,name,phone,email,notes,source,status,pipeline_stage_key,score,lead_number,lead_source_id,source_ref,category,estimated_value)
  VALUES(r.lead_id,p_business,c.customer_id,r.input->>'name',regexp_replace(r.input->>'phone','\s','','g'),nullif(r.input->>'email',''),nullif(r.input->>'message',''),
   'website_form','new',coalesce(plural_stage,'new_lead'),0,'L-'||public.increment_counter(p_business,'lead')::text,source_id,nullif(r.input->>'source_ref',''),v_category,nullif(r.input->>'estimated_value','')::integer);
  n:=public.increment_counter(p_business,'project');
  INSERT INTO public.deal(id,business_id,customer_id,lead_id,title,stage_id,source,deal_number,priority)
  VALUES(r.deal_id,p_business,c.customer_id,r.lead_id,coalesce(nullif(left(r.input->>'message',80),''),'Förfrågan från '||(r.input->>'name')),stage,'website_form',n,'medium');
  IF r.source_scope LIKE 'storefront:%' THEN
   INSERT INTO public.notification(business_id,type,title,message,icon,link,is_read)
   VALUES(p_business,'new_lead','Ny förfrågan via hemsidan',left(r.input->>'name',200),'🌐','/dashboard/pipeline',false);
   UPDATE public.storefront SET contact_form_submissions=coalesce(contact_form_submissions,0)+1 WHERE business_id=p_business;
  END IF;
  UPDATE public.lead_intake_request SET state='completed',error_code=null,customer_id=r.customer_id,lead_id=r.lead_id,deal_id=r.deal_id,
   attempts=attempts+1,updated_at=now() WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('receipt',to_jsonb(r),'fresh',true);
 EXCEPTION WHEN OTHERS THEN
  UPDATE public.lead_intake_request SET state='blocked',error_code=CASE WHEN SQLERRM IN ('customer_ambiguous','pipeline_unavailable','source_unavailable','intake_invalid') THEN SQLERRM ELSE 'storage_error' END,
   attempts=attempts+1,updated_at=now() WHERE id=p_id AND business_id=p_business RETURNING * INTO r;
  RETURN jsonb_build_object('receipt',to_jsonb(r),'fresh',false);
 END;
END $$;
REVOKE ALL ON FUNCTION public.complete_lead_intake(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_lead_intake(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.receive_storefront_lead_intake(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.receive_storefront_lead_intake(text,text,text,jsonb) TO service_role;
COMMIT;
