-- Opt-in payment plan ledger. Apply in a transaction before enabling the flag.
BEGIN;
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS payment_plan_quote_id text;
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS payment_plan_work_completed_on date;
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS payment_plan_credit_pending boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.invoice_payment_plan (
  quote_id text PRIMARY KEY,
  business_id text NOT NULL,
  project_id text NOT NULL UNIQUE REFERENCES public.project(project_id),
  customer_id text NOT NULL,
  source jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.invoice_payment_stage (
  invoice_id text PRIMARY KEY REFERENCES public.invoice(invoice_id) DEFERRABLE INITIALLY DEFERRED,
  quote_id text NOT NULL REFERENCES public.invoice_payment_plan(quote_id),
  step integer NOT NULL CHECK (step >= 0),
  kind text NOT NULL CHECK (kind IN ('partial', 'final', 'credit')),
  original_id text UNIQUE REFERENCES public.invoice(invoice_id),
  amounts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_payment_stage_once ON public.invoice_payment_stage(quote_id, step) WHERE kind <> 'credit';
ALTER TABLE public.invoice_payment_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_stage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_payment_plan, public.invoice_payment_stage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.invoice_payment_plan, public.invoice_payment_stage TO service_role;

CREATE OR REPLACE FUNCTION public.payment_plan_source(p_business text, p_project text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('project', to_jsonb(p), 'quote', to_jsonb(q), 'rows',
   COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.id) FROM quote_items i WHERE i.quote_id=q.quote_id), '[]'::jsonb))
 FROM project p JOIN quotes q ON q.quote_id=p.quote_id AND q.business_id=p.business_id AND q.customer_id=p.customer_id
 WHERE p.project_id=p_project AND p.business_id=p_business
$$;

CREATE OR REPLACE FUNCTION public.activate_invoice_payment_plan(p_business text, p_project text, p_source jsonb, p_snapshot jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fresh jsonb; existing invoice_payment_plan; q text;
BEGIN
 PERFORM 1 FROM project WHERE project_id=p_project AND business_id=p_business FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Projektet finns inte'; END IF;
 SELECT * INTO existing FROM invoice_payment_plan WHERE project_id=p_project AND business_id=p_business;
 IF FOUND THEN RETURN to_jsonb(existing); END IF;
 fresh := payment_plan_source(p_business,p_project);
 IF fresh IS NULL OR fresh IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'Underlaget har ändrats. Läs in betalplanen igen'; END IF;
 q := fresh->'quote'->>'quote_id';
 PERFORM 1 FROM quotes WHERE quote_id=q FOR UPDATE;
 IF payment_plan_source(p_business,p_project) IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'Offerten ändrades under aktivering'; END IF;
 IF fresh->'quote'->>'status' NOT IN ('accepted','signed') THEN RAISE EXCEPTION 'Offerten måste vara accepterad'; END IF;
 IF EXISTS (SELECT 1 FROM invoice WHERE business_id=p_business AND (project_id=p_project OR quote_id=q)) THEN RAISE EXCEPTION 'Projektet har redan fakturor. Manuella a conto-belopp måste först stämmas av'; END IF;
 IF jsonb_array_length(p_snapshot->'stages') NOT BETWEEN 2 AND 10 OR (p_snapshot->'amounts'->>'net')::bigint <= 0 THEN RAISE EXCEPTION 'Ogiltig betalplan'; END IF;
 INSERT INTO invoice_payment_plan(quote_id,business_id,project_id,customer_id,source,snapshot)
 VALUES(q,p_business,p_project,fresh->'project'->>'customer_id',fresh,p_snapshot) RETURNING * INTO existing;
 RETURN to_jsonb(existing);
END $$;

CREATE OR REPLACE FUNCTION public.write_payment_plan_invoice(p_business text, p_project text, p_step integer, p_original text, p_row jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan invoice_payment_plan; old invoice; result jsonb; expected jsonb; actual jsonb; used jsonb;
 inv_id text; v_kind text; n integer; reserved_rot numeric; reserved_total numeric; tax_year integer; cols text; fields text; k text;
BEGIN
 SELECT * INTO plan FROM invoice_payment_plan WHERE project_id=p_project AND business_id=p_business FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Betalplan saknas'; END IF;
 IF NOT EXISTS (SELECT 1 FROM project WHERE project_id=p_project AND business_id=p_business AND customer_id=plan.customer_id AND quote_id=plan.quote_id) THEN RAISE EXCEPTION 'Projektets koppling har ändrats'; END IF;
 n := jsonb_array_length(plan.snapshot->'stages');
 IF p_original IS NULL THEN
   SELECT to_jsonb(i) INTO result FROM invoice_payment_stage s JOIN invoice i USING(invoice_id)
    WHERE s.quote_id=plan.quote_id AND s.step=p_step AND s.kind<>'credit';
 ELSE
   SELECT to_jsonb(i) INTO result FROM invoice_payment_stage s JOIN invoice i USING(invoice_id)
    WHERE s.quote_id=plan.quote_id AND s.original_id=p_original;
 END IF;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF EXISTS (SELECT 1 FROM invoice_payment_stage s JOIN invoice i USING(invoice_id) WHERE s.quote_id=plan.quote_id AND s.kind='credit' AND i.status='draft') THEN RAISE EXCEPTION 'Skicka den väntande kreditfakturan innan nästa faktura skapas'; END IF;
 IF p_original IS NOT NULL THEN
   SELECT i.* INTO old FROM invoice i JOIN invoice_payment_stage s USING(invoice_id)
    WHERE i.invoice_id=p_original AND s.quote_id=plan.quote_id AND s.kind<>'credit' FOR UPDATE OF i;
   IF p_row->>'credit_for_invoice_id' IS DISTINCT FROM p_original THEN RAISE EXCEPTION 'Kreditreferensen är felaktig'; END IF;
   IF COALESCE(to_jsonb(old)->>'rot_application_status','') IN ('submitted','skv_requested','approved','paid') OR COALESCE((to_jsonb(old)->>'rot_paid_amount')::numeric,0)>0 THEN RAISE EXCEPTION 'ROT/RUT är redan begärt eller utbetalt. Stäm av återbetalningen innan kreditering'; END IF;
   IF NOT FOUND OR old.status NOT IN ('sent','overdue','paid','customer_paid') THEN RAISE EXCEPTION 'Fakturan kan inte krediteras'; END IF;
   IF EXISTS (SELECT 1 FROM invoice_payment_stage WHERE quote_id=plan.quote_id AND kind='final' AND invoice_id<>p_original) THEN RAISE EXCEPTION 'Slutfakturan måste hanteras innan en tidigare etapp kan krediteras'; END IF;
   SELECT jsonb_object_agg(key,-value::bigint) INTO expected FROM invoice_payment_stage s, jsonb_each_text(s.amounts) WHERE s.invoice_id=p_original;
   SELECT step INTO p_step FROM invoice_payment_stage WHERE invoice_id=p_original;
   v_kind := 'credit';
 ELSE
   IF p_step < 0 OR p_step >= n THEN RAISE EXCEPTION 'Ogiltigt betalsteg'; END IF;
   IF EXISTS (SELECT 1 FROM invoice_payment_stage WHERE quote_id=plan.quote_id AND kind='final') THEN RAISE EXCEPTION 'Planen är slutavräknad'; END IF;
   IF (SELECT count(*) FROM invoice_payment_stage WHERE quote_id=plan.quote_id AND kind<>'credit') <> p_step THEN RAISE EXCEPTION 'Fakturera stegen i ordning'; END IF;
   IF EXISTS (SELECT 1 FROM invoice_payment_stage s JOIN invoice i USING(invoice_id) WHERE s.quote_id=plan.quote_id AND s.kind<>'credit' AND i.status='draft') THEN RAISE EXCEPTION 'Skicka föregående faktura innan nästa steg'; END IF;
   v_kind := CASE WHEN p_step=n-1 THEN 'final' ELSE 'partial' END;
   SELECT jsonb_build_object('net', COALESCE(sum((s.amounts->>'net')::bigint),0), 'vat',COALESCE(sum((s.amounts->>'vat')::bigint),0), 'labor',COALESCE(sum((s.amounts->>'labor')::bigint),0), 'deduction',COALESCE(sum((s.amounts->>'deduction')::bigint),0)) INTO used
    FROM invoice_payment_stage s JOIN invoice i USING(invoice_id) WHERE s.quote_id=plan.quote_id AND (s.kind<>'credit' OR i.status<>'draft');
   IF v_kind='final' THEN
     SELECT jsonb_object_agg(key,value::bigint-(used->>key)::bigint) INTO expected FROM jsonb_each_text(plan.snapshot->'amounts');
   ELSE expected := plan.snapshot->'stages'->p_step->'amounts'; END IF;
   FOREACH k IN ARRAY ARRAY['net','vat','labor','deduction'] LOOP
     IF (expected->>k)::bigint < 0 OR (expected->>k)::bigint + (used->>k)::bigint > (plan.snapshot->'amounts'->>k)::bigint THEN RAISE EXCEPTION 'Offertens belopp får inte överskridas'; END IF;
   END LOOP;
 END IF;
 actual := jsonb_build_object('net',round((p_row->>'subtotal')::numeric*100),'vat',round((p_row->>'vat_amount')::numeric*100),'deduction',round((p_row->>'rot_rut_deduction')::numeric*100),'labor',round(COALESCE((p_row->>'rot_work_cost')::numeric,(p_row->>'rut_work_cost')::numeric,0)*100));
 IF actual IS DISTINCT FROM expected OR p_row->>'business_id' IS DISTINCT FROM p_business OR p_row->>'project_id' IS DISTINCT FROM p_project OR p_row->>'customer_id' IS DISTINCT FROM plan.customer_id OR p_row->>'quote_id' IS DISTINCT FROM plan.quote_id OR p_row->>'invoice_type' IS DISTINCT FROM v_kind OR p_row->>'status' IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Fakturaunderlaget är inaktuellt eller ogiltigt'; END IF;
 IF (SELECT COALESCE(sum((i->>'total')::numeric),0) FROM jsonb_array_elements(p_row->'items') i WHERE COALESCE(i->>'item_type','item')='item')*100 <> (expected->>'net')::bigint THEN RAISE EXCEPTION 'Fakturaraderna stämmer inte med nettobeloppet'; END IF;
 IF round((p_row->>'total')::numeric*100) <> (expected->>'net')::bigint+(expected->>'vat')::bigint OR round((p_row->>'customer_pays')::numeric*100) <> (expected->>'net')::bigint+(expected->>'vat')::bigint-(expected->>'deduction')::bigint THEN RAISE EXCEPTION 'Felaktig fakturasumma'; END IF;
 IF p_original IS NULL AND (expected->>'deduction')::bigint > 0 THEN
   -- Reserve even draft deductions. Parallel stages in different projects
   -- for this customer share the lock; credits count only once issued.
   PERFORM pg_advisory_xact_lock(hashtextextended(p_business || ':' || plan.customer_id,0));
   tax_year := extract(year FROM (p_row->>'invoice_date')::date);
   IF tax_year IS NULL THEN RAISE EXCEPTION 'Fakturadatum krävs för avdragskontroll'; END IF;
   SELECT COALESCE(sum(CASE WHEN rot_rut_type='rot' THEN rot_rut_deduction ELSE 0 END),0), COALESCE(sum(rot_rut_deduction),0)
    INTO reserved_rot,reserved_total FROM invoice
    WHERE business_id=p_business AND customer_id=plan.customer_id
      AND status<>'cancelled' AND (invoice_type<>'credit' OR status IN ('sent','paid','customer_paid'))
      AND extract(year FROM COALESCE(paid_at::date,invoice_date))=tax_year;
   IF reserved_total*100+(expected->>'deduction')::bigint > 7500000 OR
      (plan.snapshot->>'taxType'='rot' AND reserved_rot*100+(expected->>'deduction')::bigint > 5000000) THEN
      RAISE EXCEPTION 'Kundens registrerade avdrag inklusive utkast överskrider årstaket. Stäm av innan fakturering';
   END IF;
 END IF;
 inv_id := 'inv_plan_' || replace(gen_random_uuid()::text,'-','');
 p_row := p_row || jsonb_build_object('invoice_id',inv_id,'payment_plan_quote_id',plan.quote_id);
 INSERT INTO invoice_payment_stage(invoice_id,quote_id,step,kind,original_id,amounts) VALUES(inv_id,plan.quote_id,p_step,v_kind,p_original,expected);
 IF p_original IS NOT NULL THEN UPDATE invoice SET payment_plan_credit_pending=true WHERE invoice_id=p_original; END IF;
 -- Insert only supplied columns, preserving defaults in the existing schema.
 SELECT string_agg(format('%I',key),','),string_agg(format('r.%I',key),',') INTO cols,fields FROM jsonb_each(p_row);
 EXECUTE format('INSERT INTO public.invoice (%s) SELECT %s FROM jsonb_populate_record(NULL::public.invoice,$1) r RETURNING to_jsonb(invoice.*)',cols,fields) INTO result USING p_row;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.protect_payment_plan_invoice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan_id text;
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.payment_plan_quote_id IS NOT NULL THEN RAISE EXCEPTION 'Betalplansfakturor ska krediteras, inte raderas'; END IF;
   RETURN OLD;
 END IF;
 IF NEW.payment_plan_quote_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoice_payment_stage WHERE invoice_id=NEW.invoice_id AND quote_id=NEW.payment_plan_quote_id) THEN RAISE EXCEPTION 'Betalplansreferensen saknar registerpost'; END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
   -- Same lock order as activation: an in-flight ordinary invoice cannot
   -- slip between the no-invoices check and the committed plan.
   PERFORM 1 FROM project WHERE business_id=NEW.business_id
     AND (project_id=NEW.project_id OR quote_id=NEW.quote_id) ORDER BY project_id FOR UPDATE;
   SELECT quote_id INTO plan_id FROM invoice_payment_plan WHERE business_id=NEW.business_id AND quote_id=NEW.quote_id;
   IF plan_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoice_payment_stage WHERE invoice_id=NEW.invoice_id AND quote_id=plan_id) THEN RAISE EXCEPTION 'Använd projektets betalplan för denna offert'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND OLD.payment_plan_quote_id IS NOT NULL THEN
   IF OLD.payment_plan_credit_pending AND NOT NEW.payment_plan_credit_pending THEN RAISE EXCEPTION 'Kreditspärren får inte tas bort'; END IF;
   IF OLD.payment_plan_credit_pending AND (to_jsonb(NEW)->>'rot_application_status') IS DISTINCT FROM (to_jsonb(OLD)->>'rot_application_status') THEN RAISE EXCEPTION 'Fakturan har en kredit. ROT/RUT-ansökan är spärrad'; END IF;

   IF ROW(NEW.vat_rate,NEW.rot_rut_type,NEW.rot_deduction,NEW.rut_deduction,NEW.credit_for_invoice_id,NEW.items,NEW.subtotal,NEW.vat_amount,NEW.total,NEW.customer_pays,NEW.rot_rut_deduction,NEW.rot_work_cost,NEW.rut_work_cost,NEW.quote_id,NEW.project_id,NEW.business_id,NEW.customer_id,NEW.invoice_type,NEW.payment_plan_quote_id)
    IS DISTINCT FROM ROW(OLD.vat_rate,OLD.rot_rut_type,OLD.rot_deduction,OLD.rut_deduction,OLD.credit_for_invoice_id,OLD.items,OLD.subtotal,OLD.vat_amount,OLD.total,OLD.customer_pays,OLD.rot_rut_deduction,OLD.rot_work_cost,OLD.rut_work_cost,OLD.quote_id,OLD.project_id,OLD.business_id,OLD.customer_id,OLD.invoice_type,OLD.payment_plan_quote_id) THEN RAISE EXCEPTION 'Betalplansbelopp är låsta. Använd kreditfaktura'; END IF;
   IF OLD.status<>'draft' AND NEW.status='draft' THEN RAISE EXCEPTION 'Utfärdad betalplansfaktura får inte återställas till utkast'; END IF;
   IF NEW.status='cancelled' THEN RAISE EXCEPTION 'Betalplansfakturor ska krediteras'; END IF;
   IF NEW.invoice_type='credit' AND OLD.status='draft' AND NEW.status<>'draft' THEN
     UPDATE invoice SET status='credited' WHERE invoice_id=NEW.credit_for_invoice_id AND business_id=NEW.business_id;
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS payment_plan_invoice_guard ON public.invoice;
CREATE TRIGGER payment_plan_invoice_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice FOR EACH ROW EXECUTE FUNCTION public.protect_payment_plan_invoice();
REVOKE ALL ON FUNCTION public.payment_plan_source(text,text), public.activate_invoice_payment_plan(text,text,jsonb,jsonb), public.write_payment_plan_invoice(text,text,integer,text,jsonb), public.protect_payment_plan_invoice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_plan_source(text,text), public.activate_invoice_payment_plan(text,text,jsonb,jsonb), public.write_payment_plan_invoice(text,text,integer,text,jsonb) TO service_role;
-- Claim once before any external invoice write. An uncertain outcome without
-- a saved document reference needs reconciliation, never a blind second POST.
CREATE OR REPLACE FUNCTION public.claim_payment_plan_fortnox(p_business text,p_invoice text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inv invoice;
BEGIN
 SELECT * INTO inv FROM invoice WHERE invoice_id=p_invoice AND business_id=p_business AND payment_plan_quote_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF inv.fortnox_sync_status='synced' THEN RETURN false; END IF;
 IF inv.fortnox_sync_attempted_at IS NOT NULL AND inv.fortnox_document_number IS NULL THEN RETURN false; END IF;
 IF inv.fortnox_sync_status='pending' AND inv.fortnox_sync_attempted_at > now()-interval '5 minutes' THEN RETURN false; END IF;
 UPDATE invoice SET fortnox_sync_status='pending',fortnox_sync_attempted_at=now() WHERE invoice_id=p_invoice;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_payment_plan_fortnox(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_plan_fortnox(text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
