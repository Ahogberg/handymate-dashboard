-- Product continuity, separate from financial/value-event activation. No external effects.
BEGIN;
CREATE TABLE public.first_work (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 business_id text NOT NULL UNIQUE REFERENCES public.business_config(business_id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 prepared_at timestamptz,
 quote_id text REFERENCES public.quotes(quote_id) ON DELETE SET NULL,
 first_action_at timestamptz,
 UNIQUE(business_id,id)
);
ALTER TABLE public.first_work ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.first_work FROM PUBLIC,anon,authenticated,service_role;
-- DELETE supports the existing tenant-scoped account-erasure flow, after quote deletion.
GRANT SELECT,DELETE ON public.first_work TO service_role;
ALTER TABLE public.quotes ADD COLUMN first_work_id text;
ALTER TABLE public.quotes ADD CONSTRAINT quote_first_work_tenant FOREIGN KEY(business_id,first_work_id) REFERENCES public.first_work(business_id,id);
CREATE UNIQUE INDEX quote_first_work_once ON public.quotes(business_id,first_work_id) WHERE first_work_id IS NOT NULL;
CREATE FUNCTION public.begin_first_work(p_business_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.first_work; BEGIN
 INSERT INTO public.first_work(business_id) VALUES(p_business_id) ON CONFLICT(business_id) DO NOTHING;
 SELECT * INTO r FROM public.first_work WHERE business_id=p_business_id;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.prepare_first_work(p_business_id text,p_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN UPDATE public.first_work SET prepared_at=coalesce(prepared_at,clock_timestamp()) WHERE business_id=p_business_id AND id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'first_work_not_found'; END IF; END $$;
CREATE FUNCTION public.first_work_quote_written() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.first_work_id IS DISTINCT FROM OLD.first_work_id THEN RAISE EXCEPTION 'first_work_link_immutable'; END IF;
 IF NEW.first_work_id IS NOT NULL THEN
 UPDATE public.first_work SET quote_id=NEW.quote_id,
 first_action_at=CASE WHEN NEW.sent_at IS NOT NULL THEN coalesce(first_action_at,clock_timestamp()) ELSE first_action_at END
 WHERE business_id=NEW.business_id AND id=NEW.first_work_id AND (quote_id IS NULL OR quote_id=NEW.quote_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'first_work_already_linked'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER first_work_quote_producer AFTER INSERT OR UPDATE OF first_work_id,sent_at ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.first_work_quote_written();
REVOKE ALL ON FUNCTION public.begin_first_work(text),public.prepare_first_work(text,text),public.first_work_quote_written() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_first_work(text),public.prepare_first_work(text,text) TO service_role;
CREATE FUNCTION public.first_work_quote_deleted() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE public.first_work SET quote_id=NULL,first_action_at=NULL WHERE business_id=OLD.business_id AND quote_id=OLD.quote_id;
 RETURN OLD;
END $$;
CREATE TRIGGER first_work_quote_cleanup BEFORE DELETE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.first_work_quote_deleted();
REVOKE ALL ON FUNCTION public.first_work_quote_deleted() FROM PUBLIC,anon,authenticated;
COMMIT;
