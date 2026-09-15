-- V2. Review before activation; requires v235-v241. No flags or external effects.
BEGIN;
-- Preserve all V1 invariants, extending only the trusted kernel branch.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.value_events'::regclass AND contype='c'
 AND (pg_get_constraintdef(oid) ~ 'event_type|source_type|amount_basis|method_version') LOOP
 EXECUTE format('ALTER TABLE public.value_events DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.value_events
 ADD CONSTRAINT value_event_kind CHECK(event_type IN ('opportunity_identified','opportunity_acted','opportunity_dismissed','time_measured','time_estimated','invoice_issued','payment_received','money_state_observed')),
 ADD CONSTRAINT value_source_kind CHECK(source_type IN ('approval','automation_log','quote','invoice','financial_event')),
 ADD CONSTRAINT value_amount_pair CHECK((amount_minor IS NULL)=(amount_basis IS NULL)),
 ADD CONSTRAINT value_event_shape CHECK(
 (method_version=3 AND source_type<>'financial_event' AND (amount_basis IS NULL OR amount_basis='card_estimate') AND
 ((event_type='time_measured' AND minutes_basis='measured' AND minutes IS NOT NULL AND amount_minor IS NULL)
 OR (event_type='time_estimated' AND minutes_basis='estimate' AND minutes IS NOT NULL AND amount_minor IS NULL)
 OR (event_type IN ('opportunity_identified','opportunity_acted','opportunity_dismissed') AND minutes IS NULL)))
 OR (method_version=4 AND source_type='financial_event' AND subject_type='invoice' AND card_id IS NULL AND minutes IS NULL
 AND amount_minor IS NOT NULL AND ((event_type='invoice_issued' AND amount_basis='invoice_total')
 OR (event_type='payment_received' AND amount_basis='payment') OR (event_type='money_state_observed' AND amount_basis='invoice_total'))));
CREATE INDEX value_money_invoice ON public.value_events(business_id,subject_id,seq DESC)
 WHERE event_type='money_state_observed';

-- V1 member access must not expose the newly added owner/admin monetary evidence.
-- Owner/admin clients use the authenticated API; its service reader retains tenant scoping.
CREATE POLICY value_money_api_only ON public.value_events AS RESTRICTIVE FOR SELECT TO authenticated
 USING(event_type NOT IN ('invoice_issued','payment_received','money_state_observed'));

-- Immutable observation, not an additive payment stream. Latest observation wins.
-- All kernel writers take financial_lock; the observation and its source watermark share that lock.
CREATE FUNCTION public.record_value_money_event(p_business_id text,p_event_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.financial_events; inv_id text; issued public.financial_events; rec public.financial_receivables;
 al public.financial_payment_allocations; adj public.financial_receivable_adjustments;
 watermark bigint; gross bigint; billed bigint; allocated bigint; received bigint; paid_at timestamptz;
 snapshot jsonb; receipt public.value_events; identity text; row_id text;
BEGIN
 PERFORM public.financial_lock(p_business_id);
 SELECT * INTO e FROM public.financial_events WHERE business_id=p_business_id AND id=p_event_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'value_money_event_not_found'; END IF;
 identity:='kernel:'||e.id||':state';
 SELECT * INTO receipt FROM public.value_events WHERE business_id=p_business_id AND idempotency_key=identity;
 IF FOUND THEN RETURN jsonb_build_object('inserted',false,'id',receipt.id); END IF;
 CASE e.event_type
 WHEN 'invoice_issued' THEN
 IF e.source_type<>'invoice' OR e.payload->>'invoice_id' IS DISTINCT FROM e.source_id THEN RAISE EXCEPTION 'value_money_source_mismatch'; END IF;
 inv_id:=e.source_id;
 WHEN 'receivable_created','receivable_settled' THEN
 SELECT * INTO rec FROM public.financial_receivables r WHERE r.business_id=p_business_id AND r.id=e.payload->>'receivable_id';
 IF rec.id IS NULL OR rec.invoice_id IS DISTINCT FROM e.payload->>'invoice_id' OR rec.component IS DISTINCT FROM e.payload->>'component'
 OR (e.event_type='receivable_created' AND rec.created_event_id<>e.id)
 -- Settlement is a state event and carries NULL currency; the receivable owns its currency.
 OR (e.currency IS NOT NULL AND e.currency<>rec.currency)
 OR (e.event_type='receivable_settled' AND (e.source_type<>'receivable' OR e.source_id<>rec.id)) THEN RAISE EXCEPTION 'value_money_receivable_mismatch'; END IF;
 inv_id:=rec.invoice_id;
 WHEN 'receivable_adjusted' THEN
 SELECT * INTO adj FROM public.financial_receivable_adjustments a WHERE a.business_id=p_business_id AND a.event_id=e.id;
 IF adj.receivable_id IS NULL OR adj.receivable_id IS DISTINCT FROM e.payload->>'receivable_id' THEN RAISE EXCEPTION 'value_money_adjustment_mismatch'; END IF;
 SELECT invoice_id INTO inv_id FROM public.financial_receivables WHERE business_id=p_business_id AND id=adj.receivable_id;
 WHEN 'payment_allocated','payment_allocation_reversed' THEN
 SELECT * INTO al FROM public.financial_payment_allocations a WHERE a.business_id=p_business_id AND a.id=e.payload->>'allocation_id';
 IF al.id IS NULL OR (e.event_type='payment_allocated' AND al.event_id<>e.id)
 OR (e.event_type='payment_allocation_reversed' AND al.reversal_event_id IS DISTINCT FROM e.id) THEN RAISE EXCEPTION 'value_money_allocation_mismatch'; END IF;
 SELECT invoice_id INTO inv_id FROM public.financial_receivables WHERE business_id=p_business_id AND id=al.receivable_id;
 -- A settlement without allocation does not prove payment of an invoice.
 WHEN 'payment_settled' THEN RETURN jsonb_build_object('inserted',false,'unallocated_event',true);
 -- Future domain writers must define their projection before these can be acknowledged.
 WHEN 'invoice_credited','payment_refunded','payment_disputed' THEN RAISE EXCEPTION 'value_money_domain_mapping_required';
 ELSE RETURN jsonb_build_object('inserted',false,'irrelevant',true);
 END CASE;
 IF (SELECT count(*) FROM public.financial_events WHERE business_id=p_business_id AND event_type='invoice_issued' AND source_type='invoice' AND source_id=inv_id)<>1
 THEN RAISE EXCEPTION 'value_money_issuance_ambiguous'; END IF;
 SELECT * INTO issued FROM public.financial_events f WHERE f.business_id=p_business_id
 AND f.event_type='invoice_issued' AND f.source_type='invoice' AND f.source_id=inv_id;
 IF issued.id IS NULL OR issued.payload->>'invoice_id' IS DISTINCT FROM inv_id OR issued.currency<>'SEK'
 OR issued.amount_minor IS NULL OR issued.amount_minor<0 THEN RAISE EXCEPTION 'value_money_issuance_missing'; END IF;
 SELECT max(seq) INTO watermark FROM public.financial_events WHERE business_id=p_business_id;
 gross:=issued.amount_minor;
 -- Only a credit reduces invoiced value. Write-offs, interest and reclassifications are not sales.
 SELECT greatest(0,gross+coalesce(sum(a.delta_minor),0)) INTO billed
 FROM public.financial_receivable_adjustments a JOIN public.financial_receivables r ON r.business_id=a.business_id AND r.id=a.receivable_id
 WHERE a.business_id=p_business_id AND r.invoice_id=inv_id AND a.reason='credit';
 SELECT * INTO rec FROM public.financial_receivables WHERE business_id=p_business_id AND invoice_id=inv_id AND component='customer';
 IF rec.id IS NULL THEN RAISE EXCEPTION 'value_money_customer_receivable_missing'; END IF;
 SELECT coalesce(sum(a.amount_minor),0),max(p.settled_at) INTO allocated,paid_at
 FROM public.financial_payment_allocations a JOIN public.financial_payments p ON p.business_id=a.business_id AND p.id=a.payment_id
 WHERE a.business_id=p_business_id AND a.receivable_id=rec.id AND a.reversed_at IS NULL AND p.status='settled' AND p.direction='inbound' AND p.currency=issued.currency;
 snapshot:=jsonb_build_object('invoice_id',inv_id,'currency',issued.currency,'issued_event_id',issued.id,
 'observed_through_seq',watermark::text,'observed_at',clock_timestamp(),'issued_minor',gross::text,'billed_minor',billed::text,
 'allocated_customer_minor',allocated::text,'paid_minor',CASE WHEN rec.status='settled' THEN least(allocated,billed) ELSE 0 END::text,
 'customer_settled',rec.status='settled','paid_at',CASE WHEN rec.status='settled' AND allocated>0 THEN paid_at END,
 'customer_status',rec.status,'aggregation','latest_observation_not_sum');
 INSERT INTO public.value_events(business_id,event_type,occurred_at,subject_type,subject_id,amount_minor,amount_basis,source_type,source_id,idempotency_key,payload,method_version)
 VALUES(p_business_id,'money_state_observed',e.occurred_at,'invoice',inv_id,billed,'invoice_total','financial_event',e.id,identity,snapshot,4) RETURNING id INTO row_id;
 IF e.event_type='invoice_issued' THEN
 INSERT INTO public.value_events(business_id,event_type,occurred_at,subject_type,subject_id,amount_minor,amount_basis,source_type,source_id,idempotency_key,payload,method_version)
 VALUES(p_business_id,'invoice_issued',e.occurred_at,'invoice',inv_id,gross,'invoice_total','financial_event',e.id,'kernel:'||e.id||':issued',jsonb_build_object('currency',issued.currency),4);
 ELSIF e.event_type='receivable_settled' AND e.payload->>'component'='customer' THEN
 -- Reconstruct the historical allocated amount at this settlement, even on delayed replay.
 SELECT coalesce(sum(a.amount_minor),0) INTO received FROM public.financial_payment_allocations a
 JOIN public.financial_events ae ON ae.business_id=a.business_id AND ae.id=a.event_id
 LEFT JOIN public.financial_events re ON re.business_id=a.business_id AND re.id=a.reversal_event_id
 WHERE a.business_id=p_business_id AND a.receivable_id=rec.id AND ae.seq<=e.seq AND (re.seq IS NULL OR re.seq>e.seq);
 INSERT INTO public.value_events(business_id,event_type,occurred_at,subject_type,subject_id,amount_minor,amount_basis,source_type,source_id,idempotency_key,payload,method_version)
 VALUES(p_business_id,'payment_received',e.occurred_at,'invoice',inv_id,received,'payment','financial_event',e.id,'kernel:'||e.id||':received',
 jsonb_build_object('currency',issued.currency,'component','customer','aggregation','settlement_checkpoint_not_sum'),4);
 END IF;
 RETURN jsonb_build_object('inserted',true,'id',row_id);
END $$;
REVOKE ALL ON FUNCTION public.record_value_money_event(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_value_money_event(text,text) TO service_role;

CREATE FUNCTION public.read_value_invoice_evidence(p_business_id text,p_invoice_ids text[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; max_seq bigint; cursor_seq bigint; halted timestamptz;
BEGIN
 IF p_invoice_ids IS NULL OR cardinality(p_invoice_ids)>200 THEN RAISE EXCEPTION 'value_money_batch_invalid'; END IF;
 PERFORM public.financial_lock(p_business_id);
 SELECT coalesce(max(seq),0) INTO max_seq FROM public.financial_events WHERE business_id=p_business_id;
 SELECT last_seq,halted_at INTO cursor_seq,halted FROM public.financial_event_consumers WHERE business_id=p_business_id AND consumer='value-ledger';
 IF halted IS NOT NULL OR coalesce(cursor_seq,0)<max_seq THEN RAISE EXCEPTION 'value_money_projection_not_ready'; END IF;
 SELECT coalesce(jsonb_agg(x.payload||jsonb_build_object('value_event_id',x.id,'kernel_event_id',x.source_id)),'[]') INTO result FROM
 (SELECT DISTINCT ON (subject_id) id,subject_id,payload,source_id FROM public.value_events WHERE business_id=p_business_id
 AND event_type='money_state_observed' AND subject_id=ANY(p_invoice_ids) ORDER BY subject_id,seq DESC) x;
 -- A known unissued draft is not invoiced evidence. Any other missing source blocks the read.
 IF EXISTS(SELECT 1 FROM unnest(p_invoice_ids) wanted(id)
 WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) v WHERE v->>'invoice_id'=wanted.id)
 AND NOT EXISTS(SELECT 1 FROM public.invoice i WHERE i.business_id=p_business_id AND i.invoice_id=wanted.id AND i.status='draft'
 AND NOT EXISTS(SELECT 1 FROM public.financial_events e WHERE e.business_id=p_business_id AND e.event_type='invoice_issued' AND e.source_id=i.invoice_id)))
 THEN RAISE EXCEPTION 'value_money_evidence_missing'; END IF;
 RETURN jsonb_build_object('invoices',result,'through_seq',max_seq::text,'source','kernel');
END $$;
REVOKE ALL ON FUNCTION public.read_value_invoice_evidence(text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_value_invoice_evidence(text,text[]) TO service_role;
CREATE FUNCTION public.read_value_payment_window(p_business_id text,p_from timestamptz,p_to timestamptz,p_after text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids text[]; evidence jsonb; result jsonb;
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR p_to<=p_from OR p_after IS NULL THEN RAISE EXCEPTION 'value_money_window_invalid'; END IF;
 PERFORM public.financial_lock(p_business_id);
 SELECT coalesce(array_agg(subject_id ORDER BY subject_id),'{}') INTO ids FROM (
 SELECT * FROM (SELECT DISTINCT ON (subject_id) subject_id,payload FROM public.value_events
 WHERE business_id=p_business_id AND event_type='money_state_observed' AND subject_id>p_after ORDER BY subject_id,seq DESC) latest
 WHERE (payload->>'paid_minor')::bigint>0 AND (payload->>'paid_at')::timestamptz>=p_from AND (payload->>'paid_at')::timestamptz<p_to
 ORDER BY subject_id LIMIT 100) page;
 evidence:=public.read_value_invoice_evidence(p_business_id,ids);
 SELECT coalesce(jsonb_agg(v||jsonb_build_object('customer_id',i.customer_id,'quote_id',i.quote_id,'invoice_number',i.invoice_number) ORDER BY v->>'invoice_id'),'[]') INTO result
 FROM jsonb_array_elements(evidence->'invoices') v JOIN public.invoice i ON i.business_id=p_business_id AND i.invoice_id=v->>'invoice_id';
 RETURN jsonb_build_object('payments',result,'through_seq',evidence->>'through_seq','next_cursor',CASE WHEN cardinality(ids)=100 THEN ids[100] END);
END $$;
REVOKE ALL ON FUNCTION public.read_value_payment_window(text,timestamptz,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_value_payment_window(text,timestamptz,timestamptz,text) TO service_role;
COMMIT;
