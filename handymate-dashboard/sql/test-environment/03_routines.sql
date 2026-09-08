-- Snapshot of public schema from pktaqedooyzgvzwipslu, 2026-09-08. No data or secrets.
-- Apply ONLY to isolated test branch eoodwyfxrdjmlqaealhj in numbered order.
SET search_path = public, extensions;
SET check_function_bodies = false;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."update_updated_at"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_case_record()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Increment version
    NEW.version = OLD.version + 1;
    NEW.updated_at = NOW();
    
    -- Protect problem_verbatim (set once)
    IF OLD.problem_verbatim IS NOT NULL AND NEW.problem_verbatim IS DISTINCT FROM OLD.problem_verbatim THEN
        NEW.problem_verbatim = OLD.problem_verbatim;
    END IF;
    
    -- Append problem_notes with timestamp
    IF NEW.problem_notes IS NOT NULL AND NEW.problem_notes IS DISTINCT FROM OLD.problem_notes THEN
        IF OLD.problem_notes IS NOT NULL AND NOT NEW.problem_notes LIKE OLD.problem_notes || '%' THEN
            NEW.problem_notes = OLD.problem_notes || E'\n[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || '] ' || NEW.problem_notes;
        ELSIF OLD.problem_notes IS NULL THEN
            NEW.problem_notes = '[' || TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS') || '] ' || NEW.problem_notes;
        END IF;
    ELSE
        NEW.problem_notes = OLD.problem_notes;
    END IF;
    
    RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."update_case_record"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_reservations()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE reservation
    SET 
        status = 'expired',
        released_at = NOW(),
        release_reason = 'timeout'
    WHERE 
        status = 'held'
        AND expires_at < NOW();
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION public."expire_stale_reservations"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_idempotency_cache()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    affected INTEGER;
BEGIN
    DELETE FROM idempotency_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$function$;
REVOKE ALL ON FUNCTION public."cleanup_idempotency_cache"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_business_by_phone(phone text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    result TEXT;
BEGIN
    SELECT business_id INTO result
    FROM business_phone_numbers
    WHERE phone_number = phone AND is_active = TRUE
    LIMIT 1;
    RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public."get_business_by_phone"(phone text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.increment_usage(p_business_id text, p_field text, p_amount integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    current_period_start DATE := date_trunc('month', CURRENT_DATE)::DATE;
    current_period_end DATE := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
    INSERT INTO business_usage (business_id, period_start, period_end)
    VALUES (p_business_id, current_period_start, current_period_end)
    ON CONFLICT (business_id, period_start) DO NOTHING;
    
    EXECUTE format(
        'UPDATE business_usage SET %I = %I + $1 WHERE business_id = $2 AND period_start = $3',
        p_field, p_field
    ) USING p_amount, p_business_id, current_period_start;
END;
$function$;
REVOKE ALL ON FUNCTION public."increment_usage"(p_business_id text, p_field text, p_amount integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $function$;
REVOKE ALL ON FUNCTION public."update_updated_at_column"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_expired_impersonation_tokens()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    deleted_count INTEGER;
  BEGIN
    DELETE FROM impersonation_tokens
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
  END;
  $function$;
REVOKE ALL ON FUNCTION public."cleanup_expired_impersonation_tokens"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.migrate_quote_items_from_jsonb()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  q RECORD;
  item JSONB;
  idx INTEGER;
  item_id TEXT;
BEGIN
  FOR q IN
    SELECT quote_id, business_id, items, rot_rut_type
    FROM quotes
    WHERE items IS NOT NULL AND jsonb_array_length(items) > 0
    AND NOT EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = quotes.quote_id LIMIT 1)
  LOOP
    idx := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(q.items)
    LOOP
      item_id := 'qi_' || substr(md5(random()::text), 1, 12);
      INSERT INTO quote_items (id, quote_id, business_id, item_type, description, quantity, unit, unit_price, total, is_rot_eligible, is_rut_eligible, sort_order)
      VALUES (
        item_id,
        q.quote_id,
        q.business_id,
        'item',
        COALESCE(item->>'name', item->>'description', ''),
        COALESCE((item->>'quantity')::numeric, 0),
        COALESCE(item->>'unit', 'st'),
        COALESCE((item->>'unit_price')::numeric, 0),
        COALESCE((item->>'total')::numeric, 0),
        CASE WHEN q.rot_rut_type = 'rot' AND COALESCE(item->>'type', '') = 'labor' THEN true ELSE false END,
        CASE WHEN q.rot_rut_type = 'rut' AND COALESCE(item->>'type', '') = 'labor' THEN true ELSE false END,
        idx
      );
      idx := idx + 1;
    END LOOP;
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public."migrate_quote_items_from_jsonb"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_lead_scoring_rules(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO lead_scoring_rules (rule_id, business_id, rule_name, condition, points, enabled)
  VALUES
    (
      'lsr_' || substr(md5(p_business_id || 'answered_call'), 1, 12),
      p_business_id, 'Svarade på samtal',
      '{"type": "answered_call"}', 20, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'specific_job'), 1, 12),
      p_business_id, 'Beskrev specifikt jobb',
      '{"type": "specific_job"}', 15, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'urgency_mentioned'), 1, 12),
      p_business_id, 'Nämnde tidspress/akut',
      '{"type": "urgency_mentioned"}', 25, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'in_service_area'), 1, 12),
      p_business_id, 'Har adress i vårt område',
      '{"type": "in_service_area"}', 10, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'returning_customer'), 1, 12),
      p_business_id, 'Återkommande kund',
      '{"type": "returning_customer"}', 30, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'budget_mentioned'), 1, 12),
      p_business_id, 'Budget nämnd',
      '{"type": "budget_mentioned"}', 15, true
    ),
    (
      'lsr_' || substr(md5(p_business_id || 'unclear_request'), 1, 12),
      p_business_id, 'Oklar förfrågan',
      '{"type": "unclear_request"}', -10, true
    )
  ON CONFLICT (business_id, rule_name) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_lead_scoring_rules"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_automation_rules(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO automation_rules (rule_id, business_id, rule_type, label, description, delay_hours, max_attempts, channel, enabled, message_template, risk_level)
  VALUES
    (
      'rule_' || substr(md5(p_business_id || 'quote_followup'), 1, 12),
      p_business_id,
      'quote_followup',
      'Offertuppföljning',
      'Följer upp skickade offerter som inte fått svar inom angiven tid',
      72,
      3,
      'sms',
      true,
      'Följ upp offert {quote_id} ({total} kr) till {customer}. Var vänlig och personlig, fråga om de har funderingar.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'booking_reminder'), 1, 12),
      p_business_id,
      'booking_reminder',
      'Bokningspåminnelse',
      'Skickar påminnelse kvällen innan ett bokat jobb',
      18,
      1,
      'sms',
      true,
      'Skicka påminnelse om bokning {booking_id} imorgon kl {time} till {customer}. Inkludera adress om tillgänglig.',
      'low'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'invoice_reminder'), 1, 12),
      p_business_id,
      'invoice_reminder',
      'Fakturapåminnelse',
      'Påminner om obetalda fakturor som passerat förfallodatum',
      168,
      3,
      'both',
      true,
      'Skicka vänlig påminnelse om faktura {invoice_id} ({total} kr), förfallen {due_date}. Var artig men tydlig.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_response'), 1, 12),
      p_business_id,
      'lead_response',
      'Snabb lead-respons',
      'Reagerar på nya samtal som inte lett till offert eller bokning inom 1 timme',
      1,
      1,
      'sms',
      false,
      'Ny lead från {phone}. Analysera samtalet och föreslå nästa steg — offert, bokning eller uppföljning.',
      'high'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'project_complete'), 1, 12),
      p_business_id,
      'project_complete',
      'Projekt-avslut',
      'Skapar slutfaktura när ett projekt markeras som klart utan kopplad faktura',
      2,
      1,
      'email',
      false,
      'Projekt {booking_id} ({service_type}) för {customer} är klart. Skapa och förbered slutfaktura baserat på tidrapporter.',
      'high'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_qualify'), 1, 12),
      p_business_id,
      'lead_qualify',
      'Lead-kvalificering',
      'Kvalificerar nya samtal/SMS som leads automatiskt inom 5 minuter',
      1,
      1,
      'sms',
      true,
      'Analysera samtal {conversation_id}, kvalificera lead, skapa i pipeline. Bedöm urgency, jobbtyp och uppskattat värde.',
      'low'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_nurture'), 1, 12),
      p_business_id,
      'lead_nurture',
      'Lead-uppföljning',
      'Följer upp kontaktade leads med score över 50 som inte haft aktivitet på 48h',
      48,
      3,
      'sms',
      true,
      'Följ upp lead {lead_id} ({name}), var personlig baserat på deras förfrågan om {job_type}. Ring eller skicka SMS till {phone}.',
      'medium'
    ),
    (
      'rule_' || substr(md5(p_business_id || 'lead_hot_alert'), 1, 12),
      p_business_id,
      'lead_hot_alert',
      'Het lead-alert',
      'Skickar omedelbar notis till hantverkaren vid akuta/heta leads',
      0,
      1,
      'sms',
      true,
      'Het lead! {name} behöver {job_type} akut. Ring {phone} omedelbart! Skicka SMS till hantverkaren på {owner_phone}.',
      'high'
    )
  ON CONFLICT (business_id, rule_type) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_automation_rules"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.increment_counter(p_business_id text, p_counter_type text)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_value INTEGER;
BEGIN
  INSERT INTO business_counters (business_id, counter_type, last_value)
  VALUES (p_business_id, p_counter_type, 1001)
  ON CONFLICT (business_id, counter_type)
  DO UPDATE SET last_value = business_counters.last_value + 1
  RETURNING last_value INTO new_value;
  RETURN new_value;
END;
$function$;
REVOKE ALL ON FUNCTION public."increment_counter"(p_business_id text, p_counter_type text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_v3_rules(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO v3_automation_rules (business_id, name, description, is_system, is_active, trigger_type, trigger_config, action_type, action_config, requires_approval, respects_work_hours, respects_night_mode)
  VALUES
    -- 1. Morgonrapport
    (p_business_id, 'Morgonrapport', 'Daglig sammanfattning skickas varje vardag kl 07:00', true, true,
     'cron', '{"schedule": "0 7 * * mon-fri"}',
     'run_agent', '{"instruction": "Generera morgonrapport med dagens bokningar, utestående offerter, försenade fakturor och insikter."}',
     false, false, false),

    -- 2. Ny lead — bekräftelse
    (p_business_id, 'Ny lead — bekräftelse', 'Skickar bekräftelse-SMS till nya leads inom 5 minuter', true, true,
     'event', '{"event_name": "lead_created"}',
     'send_sms', '{"template": "Hej! Tack för din förfrågan. Vi återkommer inom kort med mer information. /{{business_name}}"}',
     false, true, true),

    -- 3. Missat samtal
    (p_business_id, 'Missat samtal', 'Skickar SMS vid missat inkommande samtal', true, true,
     'event', '{"event_name": "call_missed"}',
     'send_sms', '{"template": "Hej! Vi missade ditt samtal och ringer upp så snart vi kan. /{{business_name}}"}',
     false, true, true),

    -- 4. Offertuppföljning dag 5 — R1: {{customer_first_name}} (förnamn), inte {{customer_name}} (fullnamn).
    (p_business_id, 'Offertuppföljning dag 5', 'Följer upp obesvarade offerter efter 5 dagar', true, true,
     'threshold', '{"entity": "quote", "field": "days_since_sent", "operator": ">=", "value": 5}',
     'send_sms', '{"template": "Hej {{customer_first_name}}! Vi skickade en offert för {{days}} dagar sedan. Har du hunnit titta på den? Hör av dig om du har frågor! /{{business_name}}"}',
     false, true, true),

    -- 5. Offertuppföljning dag 10 (create_approval — internt, fullnamn oförändrat)
    (p_business_id, 'Offertuppföljning dag 10', 'Andra uppföljningen — kräver godkännande för att ringa', true, true,
     'threshold', '{"entity": "quote", "field": "days_since_sent", "operator": ">=", "value": 10}',
     'create_approval', '{"title": "Ring kund om offert", "description": "Offerten har varit obesvarad i 10+ dagar. Vill du ringa kunden?"}',
     true, true, true),

    -- 6. Fakturapåminnelse dag 1 — R1: {{customer_first_name}}.
    (p_business_id, 'Fakturapåminnelse dag 1', 'Vänlig påminnelse första dagen efter förfallodatum', true, true,
     'threshold', '{"entity": "invoice", "field": "days_overdue", "operator": ">=", "value": 1}',
     'send_sms', '{"template": "Hej {{customer_first_name}}! Din faktura på {{total}} kr förföll {{due_date}}. Vänligen betala så snart du kan. /{{business_name}}"}',
     false, true, true),

    -- 7. Faktura eskalering dag 7 (create_approval — internt, fullnamn oförändrat)
    (p_business_id, 'Faktura eskalering dag 7', 'Striktare påminnelse efter 7 dagar — kräver godkännande', true, true,
     'threshold', '{"entity": "invoice", "field": "days_overdue", "operator": ">=", "value": 7}',
     'create_approval', '{"title": "Faktura {{invoice_number}} — obetald 7+ dagar", "description": "Fakturan till {{customer_name}} har varit obetald i minst 7 dagar. Godkänn för att skicka formell påminnelse."}',
     true, true, true),

    -- 8. Bokningspåminnelse — R1: {{customer_first_name}}.
    (p_business_id, 'Bokningspåminnelse', 'Skickar påminnelse 24h före bokning', true, true,
     'threshold', '{"entity": "booking", "field": "hours_until", "operator": "<=", "value": 24}',
     'send_sms', '{"template": "Hej {{customer_first_name}}! Påminnelse om din bokning imorgon kl {{time}}. Adress: {{address}}. /{{business_name}}"}',
     false, false, true),

    -- 9. Reaktivering 6 mån (AV som default, create_approval — internt, fullnamn oförändrat)
    (p_business_id, 'Reaktivering 6 månader', 'Skickar reaktiverings-SMS till kunder utan aktivitet i 6 månader', true, false,
     'threshold', '{"entity": "customer", "field": "months_since_last_job", "operator": ">=", "value": 6}',
     'create_approval', '{"title": "Reaktivera inaktiv kund", "description": "Kunden har inte haft jobb på 6+ månader. Godkänn för att skicka reaktiverings-SMS."}',
     true, true, true),

    -- 10. Inkommande SMS — notifiera (internt, oförändrat)
    (p_business_id, 'Inkommande SMS — notifiera', 'Loggar och notifierar ägaren när ett SMS tas emot', true, true,
     'event', '{"event_name": "sms_received"}',
     'notify_owner', '{"title": "Nytt SMS från {{phone}}", "message": "{{message}}"}',
     false, true, true)

  ON CONFLICT DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_v3_rules"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_v4_pipeline_stages(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO pipeline_stages (business_id, key, label, sort_order, is_system, color)
  VALUES
    (p_business_id, 'new_lead',      'Ny lead',          1,  true, '#8B5CF6'),
    (p_business_id, 'contacted',     'Kontaktad',        2,  true, '#3B82F6'),
    (p_business_id, 'quote_sent',    'Offert skickad',   3,  true, '#F59E0B'),
    (p_business_id, 'quote_opened',  'Offert öppnad',    4,  true, '#F97316'),
    (p_business_id, 'active_job',    'Aktivt jobb',      5,  true, '#0F766E'),
    (p_business_id, 'invoiced',      'Fakturerad',       6,  true, '#6366F1'),
    (p_business_id, 'completed',     'Avslutad',         7,  true, '#22C55E'),
    (p_business_id, 'lost',          'Förlorad',         99, true, '#EF4444')
  ON CONFLICT (business_id, key) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_v4_pipeline_stages"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_v4_pipeline_rules(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO v3_automation_rules (business_id, name, description, is_system, is_active, trigger_type, trigger_config, action_type, action_config, requires_approval, respects_work_hours, respects_night_mode)
  VALUES
    -- 1. lead_created → new_lead
    (p_business_id, 'Pipeline: Ny lead', 'Flyttar lead till "Ny lead" vid skapande', true, true,
     'event', '{"event_name": "lead_created"}',
     'update_status', '{"stage_key": "new_lead"}',
     false, false, false),

    -- 2. contacted → contacted
    (p_business_id, 'Pipeline: Kontaktad', 'Flyttar lead till "Kontaktad" vid utgående SMS/samtal', true, true,
     'event', '{"event_name": "contacted"}',
     'update_status', '{"stage_key": "contacted"}',
     false, false, false),

    -- 3. quote_sent → quote_sent
    (p_business_id, 'Pipeline: Offert skickad', 'Flyttar lead till "Offert skickad" när offert skickas', true, true,
     'event', '{"event_name": "quote_sent"}',
     'update_status', '{"stage_key": "quote_sent"}',
     false, false, false),

    -- 4. quote_opened → quote_opened + notify_owner
    (p_business_id, 'Pipeline: Offert öppnad', 'Flyttar lead till "Offert öppnad" och notifierar ägaren', true, true,
     'event', '{"event_name": "quote_opened"}',
     'update_status', '{"stage_key": "quote_opened"}',
     false, false, false),

    -- 4b. quote_opened → push-notis (separat regel)
    (p_business_id, 'Notis: Offert öppnad', 'Skickar push-notis när kund öppnar offert — bra läge att ringa', true, true,
     'event', '{"event_name": "quote_opened"}',
     'notify_owner', '{"title": "{{customer_name}} har öppnat offerten", "body": "Bra läge att ringa — kunden tittar just nu på offerten.", "url": "/dashboard/pipeline"}',
     false, false, false),

    -- 5. quote_signed → active_job
    (p_business_id, 'Pipeline: Aktivt jobb', 'Flyttar lead till "Aktivt jobb" vid signering', true, true,
     'event', '{"event_name": "quote_signed"}',
     'update_status', '{"stage_key": "active_job"}',
     false, false, false),

    -- 6. invoice_created → invoiced
    (p_business_id, 'Pipeline: Fakturerad', 'Flyttar lead till "Fakturerad" vid fakturaskapande', true, true,
     'event', '{"event_name": "invoice_created"}',
     'update_status', '{"stage_key": "invoiced"}',
     false, false, false),

    -- 7. payment_received → completed
    (p_business_id, 'Pipeline: Avslutad', 'Flyttar lead till "Avslutad" vid mottagen betalning', true, true,
     'event', '{"event_name": "payment_received"}',
     'update_status', '{"stage_key": "completed"}',
     false, false, false)

  ON CONFLICT DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_v4_pipeline_rules"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_ata_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.ata_number IS NULL THEN
    SELECT COALESCE(MAX(ata_number), 0) + 1
    INTO NEW.ata_number
    FROM project_change
    WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."set_ata_number"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_project_profitability()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  pid TEXT;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN RETURN NEW; END IF;

  UPDATE project SET
    actual_hours = (
      SELECT COALESCE(SUM(duration_minutes) / 60.0, 0)
      FROM time_entry WHERE project_id = pid
    ),
    actual_labor_cost = (
      SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
      FROM time_entry WHERE project_id = pid
    ),
    profitability_status = CASE
      WHEN budget_amount > 0 AND (
        SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
        FROM time_entry WHERE project_id = pid
      ) > budget_amount * 0.95 THEN 'over_budget'
      WHEN budget_amount > 0 AND (
        SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
        FROM time_entry WHERE project_id = pid
      ) > budget_amount * 0.75 THEN 'at_risk'
      ELSE 'on_track'
    END
  WHERE project_id = pid;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."update_project_profitability"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_project_material_cost()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  pid TEXT;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN RETURN NEW; END IF;

  UPDATE project SET
    actual_material_cost = (
      SELECT COALESCE(SUM(total_purchase), 0)
      FROM project_material WHERE project_id = pid
    )
  WHERE project_id = pid;

  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."update_project_material_cost"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.update_deal_stage_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.stage_updated_at = now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."update_deal_stage_timestamp"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.seed_v11_event_rules(p_business_id text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Undvik dubbletter: skippa om regeln redan finns (kontrollera namn)
  INSERT INTO v3_automation_rules (business_id, name, description, is_system, is_active, trigger_type, trigger_config, action_type, action_config, requires_approval, respects_work_hours, respects_night_mode)
  VALUES
    -- 11. Offert accepterad — notifiera ägaren
    (p_business_id, 'Offert accepterad — notifiera', 'Push-notis till ägaren när en offert accepteras av kund', true, true,
     'event', '{"event_name": "quote_accepted"}',
     'notify_owner', '{"title": "Offert accepterad! 🎉", "message": "{{customer_name}} har accepterat offerten på {{total}} kr"}',
     false, true, false),

    -- 12. Arbetsorder skickad — notifiera tilldelad arbetare
    (p_business_id, 'Arbetsorder skickad — notifiera', 'Push-notis när en arbetsorder skickas', true, true,
     'event', '{"event_name": "work_order_sent"}',
     'notify_owner', '{"title": "Ny arbetsorder tilldelad", "message": "En arbetsorder har skickats till {{assigned_phone}}"}',
     false, true, false),

    -- 13. ÄTA skickad — notifiera ägaren
    (p_business_id, 'ÄTA skickad — notifiera', 'Push-notis när en ÄTA skickas till kund för signering', true, true,
     'event', '{"event_name": "ata_sent"}',
     'notify_owner', '{"title": "ÄTA skickad", "message": "ÄTA #{{ata_number}} på {{total}} kr har skickats till {{customer_name}} för signering"}',
     false, false, false),

    -- 14. ÄTA signerad — notifiera + skapa godkännande
    (p_business_id, 'ÄTA signerad — notifiera', 'Push-notis och godkännande-uppgift när kund signerar ÄTA', true, true,
     'event', '{"event_name": "ata_signed"}',
     'notify_owner', '{"title": "ÄTA signerad ✅", "message": "{{signed_by}} har signerat ÄTA #{{ata_number}} på {{total}} kr"}',
     false, false, false)

  ON CONFLICT DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION public."seed_v11_event_rules"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bump_counter(p_business_id text, p_counter_type text, p_min_value integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  new_value INTEGER;
BEGIN
  INSERT INTO business_counters (business_id, counter_type, last_value)
  VALUES (p_business_id, p_counter_type, p_min_value)
  ON CONFLICT (business_id, counter_type)
  DO UPDATE SET last_value = GREATEST(business_counters.last_value, EXCLUDED.last_value)
  RETURNING last_value INTO new_value;
  RETURN new_value;
END;
$function$;
REVOKE ALL ON FUNCTION public."bump_counter"(p_business_id text, p_counter_type text, p_min_value integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."handle_new_user"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."touch_updated_at"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.enforce_two_level_categories()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF (SELECT parent_id FROM product_categories WHERE id = NEW.parent_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Max två kategorinivåer';
    END IF;
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Kategori kan inte vara sin egen förälder';
    END IF;
  END IF;
  RETURN NEW;
END; $function$;
REVOKE ALL ON FUNCTION public."enforce_two_level_categories"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_business_id text)
 RETURNS TABLE(num integer, prefix text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- SET skriver alltid ett icke-NULL nytt värde (COALESCE fångar en
  -- ojourförd/NULL kolumn och startar serien om på 1) — RETURNING läser
  -- POST-update-raden, så "nytt värde - 1" ger tillbaka precis det num
  -- som DENNA invoice ska använda, medan kolumnen redan pekar på nästa.
  RETURN QUERY
  UPDATE business_config
  SET next_invoice_number = COALESCE(business_config.next_invoice_number, 1) + 1
  WHERE business_config.business_id = p_business_id
  RETURNING
    business_config.next_invoice_number - 1 AS num,
    COALESCE(business_config.invoice_prefix, 'FV') AS prefix;
END;
$function$;
REVOKE ALL ON FUNCTION public."next_invoice_number"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_business_member(target_business_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1
        FROM public.business_users AS bu
        WHERE bu.business_id = target_business_id
          AND bu.user_id::TEXT = auth.uid()::TEXT
          AND bu.is_active IS TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.business_config AS bc
        WHERE bc.business_id = target_business_id
          AND bc.user_id::TEXT = auth.uid()::TEXT
      )
    );
$function$;
REVOKE ALL ON FUNCTION public."is_business_member"(target_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.sign_quote_with_options(p_quote_id text, p_business_id text, p_sign_token text, p_selected_option_ids text[], p_signed_at timestamp with time zone, p_signed_by_name text, p_signed_by_ip text, p_signature_data text, p_totals jsonb, p_signed_options jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
REVOKE ALL ON FUNCTION public."sign_quote_with_options"(p_quote_id text, p_business_id text, p_sign_token text, p_selected_option_ids text[], p_signed_at timestamp with time zone, p_signed_by_name text, p_signed_by_ip text, p_signature_data text, p_totals jsonb, p_signed_options jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.reset_demo_tenant(p_business_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_audit_id UUID := gen_random_uuid();
BEGIN
  -- FÖRSTA exekverbara raden i funktionskroppen: fail closed före audit/DELETE.
  -- Oförändrad från v99/v155 — RÖR ALDRIG denna grind.
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_config
    WHERE business_id = p_business_id
      AND is_demo_tenant IS TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Demo reset denied: tenant is not explicitly demo-flagged';
  END IF;

  -- Route-grinden är UX/API-skyddet; RPC:n upprepar även rollgrinden så en
  -- autentiserad demo-anställd inte kan anropa funktionen direkt.
  -- Oförändrad från v99/v155 — RÖR ALDRIG denna grind.
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.business_users
    WHERE business_id = p_business_id
      -- business_users.user_id är TEXT i repots produktionsschema.
      AND user_id = auth.uid()::TEXT
      AND is_active IS TRUE
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Demo reset denied: owner or admin required';
  END IF;

  INSERT INTO public.demo_reset_audit (
    id,
    business_id,
    actor_user_id,
    started_at,
    finished_at,
    ok,
    error_text,
    reset_version
  ) VALUES (
    v_audit_id,
    p_business_id,
    auth.uid(),
    clock_timestamp(),
    NULL,
    NULL,
    NULL,
    'v158'
  );

  -- EXPLICIT DELETE-MANIFEST, löv till rot. Inga dynamiska tabellnamn och
  -- inga exception-block: ett fel avbryter RPC-transaktionen och bevarar det
  -- gamla demotillståndet i sin helhet.

  -- ── Grupp 0 (v155): måste raderas FÖRE pending_approvals/agent_runs/
  --    customer nedan — se v155:s filhuvud "dolda FK-landminor".
  DELETE FROM public.next_best_action WHERE business_id = p_business_id;
  DELETE FROM public.lead_activities WHERE business_id = p_business_id;
  DELETE FROM public.automation_queue WHERE business_id = p_business_id;
  -- call_recording: flyttad hit från TypeScript i v155 — se v155:s filhuvud.
  DELETE FROM public.call_recording WHERE business_id = p_business_id;
  DELETE FROM public.customer_activity WHERE business_id = p_business_id;

  -- ── Ursprungliga v99-blocket, ordagrant oförändrat ──────────────────
  DELETE FROM public.thread_message WHERE business_id = p_business_id;
  DELETE FROM public.agent_handoffs
    WHERE thread_id IN (
      SELECT id FROM public.agent_threads WHERE business_id = p_business_id
    );
  DELETE FROM public.agent_threads WHERE business_id = p_business_id;
  DELETE FROM public.agent_messages WHERE business_id = p_business_id;
  DELETE FROM public.agent_memories WHERE business_id = p_business_id;
  DELETE FROM public.business_knowledge WHERE business_id = p_business_id;
  DELETE FROM public.notification WHERE business_id = p_business_id;
  DELETE FROM public.pending_approvals WHERE business_id = p_business_id;
  DELETE FROM public.agent_runs WHERE business_id = p_business_id;
  DELETE FROM public.pipeline_activity WHERE business_id = p_business_id;

  -- ── Grupp 1 (v155): fristående business_id-skopade tabeller ────
  -- (Mission/Mandate, COGS, Bränsle, Mötesassistenten, kommunikations-
  -- loggar, automation, leads, dokument, tidrapportering, Jobbpass,
  -- efterkalkyl/lärdom/kundfakta.) Ingen av dessa har en blockerande
  -- NO ACTION-FK mot en tabell som redan raderats ovan.
  DELETE FROM public.mission_mandate WHERE business_id = p_business_id;
  DELETE FROM public.mission WHERE business_id = p_business_id;
  DELETE FROM public.cost_event WHERE business_id = p_business_id;
  DELETE FROM public.fuel_ledger WHERE business_id = p_business_id;
  -- operating_experiment (NY, v158): FK bara mot business_config (ON DELETE
  -- CASCADE), inget refererar operating_experiment.id — rent löv, se
  -- filhuvudet. Fristående precis som cost_event/fuel_ledger ovan.
  DELETE FROM public.operating_experiment WHERE business_id = p_business_id;
  -- meeting_segment saknar egen business_id-kolumn — delfråga mot meeting_job.
  DELETE FROM public.meeting_segment
    WHERE job_id IN (SELECT id FROM public.meeting_job WHERE business_id = p_business_id);
  DELETE FROM public.meeting_job WHERE business_id = p_business_id;
  DELETE FROM public.sms_log WHERE business_id = p_business_id;
  DELETE FROM public.sms_conversation WHERE business_id = p_business_id;
  DELETE FROM public.sms_queue WHERE business_id = p_business_id;
  DELETE FROM public.communication_log WHERE business_id = p_business_id;
  DELETE FROM public.automation_activity WHERE business_id = p_business_id;
  DELETE FROM public.inbox_item WHERE business_id = p_business_id;
  DELETE FROM public.nurture_enrollment WHERE business_id = p_business_id;
  -- leads: customer_id REFERENCES customer(customer_id) UTAN ON DELETE
  -- (NO ACTION) — måste ligga före customer nedan.
  DELETE FROM public.leads WHERE business_id = p_business_id;
  DELETE FROM public.travel_entry WHERE business_id = p_business_id;
  DELETE FROM public.customer_document WHERE business_id = p_business_id;
  -- email_conversations: customer_id REFERENCES customer(customer_id) UTAN
  -- ON DELETE (NO ACTION, sql/v9_gmail_polling.sql) — måste ligga före
  -- customer nedan.
  DELETE FROM public.email_conversations WHERE business_id = p_business_id;
  DELETE FROM public.time_checkins WHERE business_id = p_business_id;
  DELETE FROM public.quote_tracking_events WHERE business_id = p_business_id;
  -- invoice_reminders: invoice_id REFERENCES invoice(invoice_id) UTAN
  -- ON DELETE (NO ACTION, sql/invoice_overhaul.sql) — måste ligga före
  -- invoice nedan.
  DELETE FROM public.invoice_reminders WHERE business_id = p_business_id;
  DELETE FROM public.invoice_evidence_manifest WHERE business_id = p_business_id;
  DELETE FROM public.project_events WHERE business_id = p_business_id;
  -- project_document: se v155:s filhuvud "dolda FK-landminor" punkt 2 —
  -- måste ligga före project nedan.
  DELETE FROM public.project_document WHERE business_id = p_business_id;
  DELETE FROM public.project_milestone WHERE business_id = p_business_id;
  DELETE FROM public.work_orders WHERE business_id = p_business_id;
  -- business_twin_forecast: se v155:s filhuvud — måste ligga före project_outcome.
  DELETE FROM public.business_twin_forecast WHERE business_id = p_business_id;
  DELETE FROM public.jobbpass WHERE business_id = p_business_id;
  DELETE FROM public.project_outcome WHERE business_id = p_business_id;
  DELETE FROM public.project_lesson WHERE business_id = p_business_id;
  -- customer_fact: självrefererande superseded_by-kedja raderas i EN
  -- DELETE-sats (samma mönster som redan kördes framgångsrikt i TS-
  -- städningen sedan 2026-08-12 — flyttad in i v155 oförändrad).
  DELETE FROM public.customer_fact WHERE business_id = p_business_id;

  -- ── Ursprungliga v99-blocket, ordagrant oförändrat ──────────────────
  DELETE FROM public.project_log WHERE business_id = p_business_id;
  DELETE FROM public.project_photos WHERE business_id = p_business_id;
  DELETE FROM public.project_checklist WHERE business_id = p_business_id;
  DELETE FROM public.time_entry WHERE business_id = p_business_id;
  DELETE FROM public.project_material WHERE business_id = p_business_id;
  DELETE FROM public.project_change WHERE business_id = p_business_id;
  DELETE FROM public.schedule_entry WHERE business_id = p_business_id;
  DELETE FROM public.booking WHERE business_id = p_business_id;

  DELETE FROM public.quote_items WHERE business_id = p_business_id;
  DELETE FROM public.invoice WHERE business_id = p_business_id;
  DELETE FROM public.project WHERE business_id = p_business_id;
  DELETE FROM public.quotes WHERE business_id = p_business_id;
  DELETE FROM public.deal WHERE business_id = p_business_id;
  DELETE FROM public.customer WHERE business_id = p_business_id;

  -- Ett gammalt manifest får aldrig överleva och peka på rader som just
  -- raderats. Övriga företagsinställningar lämnas orörda.
  DELETE FROM public.business_preferences
  WHERE business_id = p_business_id
    AND key = 'demo_manifest';

  -- Fortnox-SIMLÄGET (D3, app/api/admin/demo-fortnox-sim): utan denna
  -- städning skulle "Återställ demon" radera de simulerade fakturorna/
  -- kunderna ovan men lämna kontot som "Fortnox ansluten" med
  -- synkstatistik som pekar på raderade rader. Loggtabellerna töms och de
  -- fem statuskolumnerna nollas — det ENDA business_config-ingreppet i
  -- hela funktionen, avsiktligt begränsat till simulationens egna fält
  -- (grinden ovan garanterar redan is_demo_tenant).
  DELETE FROM public.fortnox_api_log WHERE business_id = p_business_id;
  DELETE FROM public.fortnox_sync WHERE business_id = p_business_id;
  UPDATE public.business_config
  SET fortnox_connected = FALSE,
      fortnox_company_name = NULL,
      fortnox_connected_at = NULL,
      fortnox_last_synced_at = NULL,
      fortnox_token_expires_at = NULL
  WHERE business_id = p_business_id
    AND is_demo_tenant IS TRUE;

  RETURN v_audit_id;
END;
$function$;
REVOKE ALL ON FUNCTION public."reset_demo_tenant"(p_business_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_invoice_sources(p_business_id text, p_invoice_id text, p_time_entry_ids text[] DEFAULT NULL::text[], p_material_ids text[] DEFAULT NULL::text[], p_change_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_time INT := 0;
  v_material INT := 0;
  v_ata INT := 0;
BEGIN
  IF p_business_id IS NULL OR p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'business_id och invoice_id krävs';
  END IF;

  IF p_time_entry_ids IS NOT NULL AND array_length(p_time_entry_ids, 1) > 0 THEN
    UPDATE public.time_entry
    SET invoiced = TRUE, invoice_id = p_invoice_id
    WHERE business_id = p_business_id
      AND time_entry_id = ANY(p_time_entry_ids)
      -- Idempotent för SAMMA faktura; stjäl aldrig från en annan.
      AND (invoice_id IS NULL OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_time = ROW_COUNT;
  END IF;

  IF p_material_ids IS NOT NULL AND array_length(p_material_ids, 1) > 0 THEN
    UPDATE public.project_material
    SET invoiced = TRUE, invoice_id = p_invoice_id
    WHERE business_id = p_business_id
      AND material_id = ANY(p_material_ids)
      AND (invoice_id IS NULL OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_material = ROW_COUNT;
  END IF;

  IF p_change_ids IS NOT NULL AND array_length(p_change_ids, 1) > 0 THEN
    UPDATE public.project_change
    SET status = 'invoiced', invoice_id = p_invoice_id, invoiced_at = NOW()
    WHERE business_id = p_business_id
      AND change_id = ANY(p_change_ids)
      -- Bara lagliga vägar in i invoiced (lib/ata/lifecycle.ts), plus
      -- idempotent omkörning för samma faktura.
      AND (status IN ('approved', 'signed') OR invoice_id = p_invoice_id);
    GET DIAGNOSTICS v_ata = ROW_COUNT;
  END IF;

  -- Begärda men inte uppdaterade rader = konflikter (annan faktura äger
  -- källan, eller ÄTA i fel status). Anroparen avgör om det är ett fel.
  RETURN jsonb_build_object(
    'time_entries_marked', v_time,
    'materials_marked', v_material,
    'atas_marked', v_ata,
    'time_entries_requested', COALESCE(array_length(p_time_entry_ids, 1), 0),
    'materials_requested', COALESCE(array_length(p_material_ids, 1), 0),
    'atas_requested', COALESCE(array_length(p_change_ids, 1), 0)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public."mark_invoice_sources"(p_business_id text, p_invoice_id text, p_time_entry_ids text[], p_material_ids text[], p_change_ids text[]) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.stamp_margin_target_set_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.margin_target_set_at := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."stamp_margin_target_set_at"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_benchmark_consent(p_business_id text, p_actor_business_user_id text, p_enabled boolean, p_consent_version text)
 RETURNS TABLE(enabled boolean, consent_version text, changed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_is_demo BOOLEAN;
  v_actor_role TEXT;
  v_changed_at TIMESTAMPTZ := NOW();
BEGIN
  IF p_business_id IS NULL OR btrim(p_business_id) = ''
     OR p_actor_business_user_id IS NULL OR btrim(p_actor_business_user_id) = ''
     OR p_enabled IS NULL
     OR p_consent_version IS NULL OR btrim(p_consent_version) = '' THEN
    RAISE EXCEPTION 'Ogiltigt benchmark-samtycke' USING ERRCODE = '22023';
  END IF;
  IF p_consent_version <> 'benchmark-readiness-v1' THEN
    RAISE EXCEPTION 'Okänd version av benchmark-samtycket' USING ERRCODE = '22023';
  END IF;

  -- Hård demo-grind före varje UPDATE/INSERT. Syntetisk demodata får aldrig
  -- bli underlag för framtida branschstatistik.
  SELECT bc.is_demo_tenant
  INTO v_is_demo
  FROM public.business_config bc
  WHERE bc.business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Företaget finns inte' USING ERRCODE = '22023';
  END IF;
  IF v_is_demo IS TRUE THEN
    RAISE EXCEPTION 'Demo-företag får inte bidra till benchmark' USING ERRCODE = '42501';
  END IF;

  SELECT bu.role
  INTO v_actor_role
  FROM public.business_users bu
  WHERE bu.id = p_actor_business_user_id
    AND bu.business_id = p_business_id
    AND bu.is_active IS TRUE;

  IF NOT FOUND OR v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Endast owner/admin får ändra benchmark-samtycke'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.business_config
  SET benchmark_consent_enabled = p_enabled,
      benchmark_consent_version = CASE WHEN p_enabled THEN p_consent_version ELSE NULL END,
      benchmark_consent_changed_at = v_changed_at
  WHERE business_id = p_business_id;

  INSERT INTO public.benchmark_consent_audit (
    business_id,
    actor_business_user_id,
    enabled,
    consent_version,
    created_at
  ) VALUES (
    p_business_id,
    p_actor_business_user_id,
    p_enabled,
    p_consent_version,
    v_changed_at
  );

  RETURN QUERY
  SELECT
    p_enabled,
    CASE WHEN p_enabled THEN p_consent_version ELSE NULL END,
    v_changed_at;
END;
$function$;
REVOKE ALL ON FUNCTION public."set_benchmark_consent"(p_business_id text, p_actor_business_user_id text, p_enabled boolean, p_consent_version text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_gtm_activity(p_account_id uuid, p_admin_user_id uuid, p_channel text, p_outcome text, p_notes text DEFAULT NULL::text, p_happened_at timestamp with time zone DEFAULT now(), p_next_action_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account public.gtm_account%ROWTYPE;
  v_activity_id UUID;
  v_next_status TEXT;
  v_is_contact BOOLEAN;
BEGIN
  IF p_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'admin_user_id is required';
  END IF;
  IF p_channel NOT IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video', 'meeting', 'demo', 'other') THEN
    RAISE EXCEPTION 'invalid channel';
  END IF;
  IF p_outcome NOT IN ('attempted', 'no_answer', 'spoke', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won', 'lost', 'note') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  SELECT * INTO v_account
  FROM public.gtm_account
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;
  IF v_account.status = 'suppressed' THEN RAISE EXCEPTION 'account is suppressed'; END IF;

  IF v_account.contact_basis NOT IN ('warm_intro', 'inbound', 'customer_referral')
     AND v_account.legal_form <> 'limited_company'
     AND p_channel IN ('warm_intro', 'phone', 'linkedin', 'email', 'letter', 'video') THEN
    RAISE EXCEPTION 'cold contact requires classified limited company';
  END IF;

  -- Kall e-post är i V1 bara tillåten när mottagaren är ett aktiebolag
  -- och adressen har en uttrycklig professionell källa. Varma/inbound-spår
  -- får användas oavsett bolagsform. Oklassat läge failar stängt.
  IF p_channel = 'email'
     AND v_account.contact_basis NOT IN ('warm_intro', 'inbound', 'customer_referral')
     AND NOT (
       v_account.legal_form = 'limited_company'
       AND v_account.contact_basis IN ('public_business_contact', 'public_professional_role')
     ) THEN
    RAISE EXCEPTION 'email channel is not eligible';
  END IF;

  INSERT INTO public.gtm_activity (
    account_id, admin_user_id, channel, outcome, notes, happened_at, next_action_at
  ) VALUES (
    p_account_id, p_admin_user_id, p_channel, p_outcome, NULLIF(BTRIM(p_notes), ''),
    COALESCE(p_happened_at, NOW()), p_next_action_at
  ) RETURNING id INTO v_activity_id;

  v_is_contact := p_outcome <> 'note';
  v_next_status := CASE p_outcome
    WHEN 'replied' THEN 'replied'
    WHEN 'meeting_booked' THEN 'meeting_booked'
    WHEN 'demo_booked' THEN 'demo_booked'
    WHEN 'offer_sent' THEN 'offer_sent'
    WHEN 'won' THEN 'won'
    WHEN 'lost' THEN 'lost'
    WHEN 'note' THEN v_account.status
    ELSE 'contacted'
  END;

  UPDATE public.gtm_account
  SET status = v_next_status,
      contact_count = contact_count + CASE WHEN v_is_contact THEN 1 ELSE 0 END,
      last_contact_at = CASE WHEN v_is_contact THEN COALESCE(p_happened_at, NOW()) ELSE last_contact_at END,
      next_action_at = CASE WHEN p_outcome IN ('won', 'lost') THEN NULL ELSE p_next_action_at END,
      updated_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_activity_id;
END;
$function$;
REVOKE ALL ON FUNCTION public."record_gtm_activity"(p_account_id uuid, p_admin_user_id uuid, p_channel text, p_outcome text, p_notes text, p_happened_at timestamp with time zone, p_next_action_at timestamp with time zone) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.suppress_gtm_account(p_account_id uuid, p_admin_user_id uuid, p_reason text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_account public.gtm_account%ROWTYPE;
  v_suppression_id UUID;
BEGIN
  IF p_admin_user_id IS NULL THEN RAISE EXCEPTION 'admin_user_id is required'; END IF;
  IF p_reason NOT IN ('opt_out', 'wrong_person', 'legal_unclear', 'duplicate', 'do_not_contact', 'other') THEN
    RAISE EXCEPTION 'invalid suppression reason';
  END IF;

  SELECT * INTO v_account
  FROM public.gtm_account
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'account not found'; END IF;

  INSERT INTO public.gtm_suppression (
    account_id, org_number, email, phone, reason, notes, created_by
  ) VALUES (
    v_account.id, v_account.org_number,
    COALESCE(v_account.primary_contact_email, v_account.company_email),
    COALESCE(v_account.primary_contact_phone, v_account.company_phone),
    p_reason, NULLIF(BTRIM(p_notes), ''), p_admin_user_id
  )
  ON CONFLICT (account_id) DO UPDATE
    SET reason = EXCLUDED.reason,
        notes = EXCLUDED.notes,
        created_by = EXCLUDED.created_by,
        created_at = NOW()
  RETURNING id INTO v_suppression_id;

  INSERT INTO public.gtm_activity (
    account_id, admin_user_id, channel, outcome, notes
  ) VALUES (
    v_account.id, p_admin_user_id, 'other',
    CASE WHEN p_reason = 'opt_out' THEN 'opt_out' ELSE 'note' END,
    COALESCE(NULLIF(BTRIM(p_notes), ''), 'Kontakt spärrad: ' || p_reason)
  );

  UPDATE public.gtm_account
  SET status = 'suppressed',
      suggested_channel = 'none',
      next_action_at = NULL,
      updated_by = p_admin_user_id,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN v_suppression_id;
END;
$function$;
REVOKE ALL ON FUNCTION public."suppress_gtm_account"(p_account_id uuid, p_admin_user_id uuid, p_reason text, p_notes text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.project_assign_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.project_number IS NULL OR btrim(NEW.project_number) = '' THEN
    NEW.project_number := 'P-' || public.increment_counter(NEW.business_id, 'project');
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."project_assign_number"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_call_processing_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.call_processing <> '{}'::jsonb OR NEW.raw_deleted_at IS NOT NULL OR NEW.project_id IS NOT NULL THEN
        RAISE EXCEPTION 'call_fields_server_owned';
      END IF;
    ELSIF NEW.call_processing IS DISTINCT FROM OLD.call_processing
      OR NEW.raw_deleted_at IS DISTINCT FROM OLD.raw_deleted_at
      OR NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      RAISE EXCEPTION 'call_fields_server_owned';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.raw_deleted_at IS NOT NULL AND (NEW.raw_deleted_at IS DISTINCT FROM OLD.raw_deleted_at
      OR NEW.transcript IS NOT NULL OR NEW.transcript_text IS NOT NULL
      OR NEW.transcript_segments IS NOT NULL OR NEW.transcript_summary IS NOT NULL
      OR NEW.ai_analysis IS NOT NULL OR NEW.recording_url IS NOT NULL) THEN
      RAISE EXCEPTION 'call_raw_data_expired';
    END IF;
    IF OLD.call_processing ? 'version' AND NEW.raw_deleted_at IS NULL
      AND NEW.transcript IS DISTINCT FROM OLD.transcript THEN
      RAISE EXCEPTION 'call_transcript_already_analyzed';
    END IF;
  END IF;
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project p WHERE p.project_id=NEW.project_id
      AND p.business_id=NEW.business_id AND p.customer_id=NEW.customer_id
  ) THEN RAISE EXCEPTION 'call_project_mismatch'; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public."guard_call_processing_fields"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.manage_call_processing(p_business_id text, p_recording_id text, p_operation text, p_token text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.call_recording%ROWTYPE;
  s jsonb;
  card jsonb;
  n integer := 0;
  added integer;
  next_phase text;
BEGIN
  SELECT * INTO r FROM public.call_recording
    WHERE recording_id = p_recording_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recording_not_found'; END IF;
  s := COALESCE(r.call_processing, '{}'::jsonb);
  IF r.raw_deleted_at IS NOT NULL THEN RETURN jsonb_build_object('status','expired','state',s); END IF;

  IF p_operation = 'claim' THEN
    IF s->>'phase' = 'complete' THEN RETURN jsonb_build_object('status','complete','state',s); END IF;
    IF (s->>'lease_until')::timestamptz > now() THEN RETURN jsonb_build_object('status','busy','state',s); END IF;
    -- Historical, potentially half-created batches must not be guessed/rebuilt.
    IF NOT (s ? 'version') AND (
      EXISTS (SELECT 1 FROM public.pending_approvals WHERE business_id=p_business_id AND payload @> jsonb_build_object('recording_id',p_recording_id))
      OR EXISTS (SELECT 1 FROM public.ai_suggestion WHERE recording_id=p_recording_id)
    ) THEN RETURN jsonb_build_object('status','legacy','state',s); END IF;
    IF p_token IS NULL OR length(p_token) < 20 THEN RAISE EXCEPTION 'invalid_token'; END IF;
    s := s || jsonb_build_object('phase','processing','version',1,'token',p_token,
      'lease_until',now()+interval '6 minutes','error_code',null);
  ELSE
    IF s->>'token' IS DISTINCT FROM p_token OR p_token IS NULL
      OR (s->>'lease_until')::timestamptz <= now() THEN RAISE EXCEPTION 'stale_worker'; END IF;
    IF p_operation = 'checkpoint' THEN
      -- Only these two fields may be supplied; never overwrite locks or statuses.
      IF p_data ? 'result' THEN s := s || jsonb_build_object('result',p_data->'result'); END IF;
      IF p_data ? 'pipeline' THEN s := s || jsonb_build_object('pipeline',p_data->'pipeline'); END IF;
    ELSIF p_operation = 'publish' THEN
      IF jsonb_typeof(p_data->'cards') IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_data->'cards') > 40 THEN RAISE EXCEPTION 'invalid_cards'; END IF;
      IF (SELECT count(*) FROM jsonb_array_elements(p_data->'cards') c WHERE c->>'approval_type'='meeting_summary') <> 1
        THEN RAISE EXCEPTION 'missing_summary'; END IF;
      FOR card IN SELECT * FROM jsonb_array_elements(p_data->'cards') LOOP
        IF card->>'approval_type' NOT IN ('meeting_summary','meeting_followup','create_quote_draft','customer_fact','create_ata_draft','project_log_note')
          OR card->>'approval_type' IS NULL OR card->>'id' IS NULL
          OR card->'payload'->>'recording_id' IS DISTINCT FROM p_recording_id THEN RAISE EXCEPTION 'invalid_card'; END IF;
        IF EXISTS (SELECT 1 FROM public.pending_approvals a WHERE a.id=card->>'id'
          AND (a.business_id<>p_business_id OR a.payload->>'recording_id' IS DISTINCT FROM p_recording_id
            OR a.approval_type IS DISTINCT FROM card->>'approval_type')) THEN RAISE EXCEPTION 'card_collision'; END IF;
        INSERT INTO public.pending_approvals(id,business_id,approval_type,title,description,payload,status,risk_level,
          expires_at,routed_agent,routing_role,routed_business_user_id)
        VALUES(card->>'id',p_business_id,card->>'approval_type',card->>'title',card->>'description',card->'payload',
          'pending',COALESCE(card->>'risk_level','high'),now()+interval '7 days',
          card->'payload'->>'routed_agent','owner_admin',card->>'routed_business_user_id')
        ON CONFLICT (id) DO NOTHING;
        GET DIAGNOSTICS added = ROW_COUNT;
        n := n + added;
      END LOOP;
      -- Only amend the informational summary of a still-pending batch, never a
      -- proposal/execution result that a person already reviewed.
      UPDATE public.pending_approvals a SET payload = a.payload || jsonb_build_object(
        'pipeline_action',s->'pipeline'->>'action', 'lead_id',s->'pipeline'->>'leadId',
        'deal_id',s->'pipeline'->>'dealId', 'analysis_partial',COALESCE((p_data->>'pipeline_failed')::boolean,false),
        'forslag',(SELECT count(*) FROM public.pending_approvals b WHERE b.business_id=p_business_id
          AND b.payload->>'recording_id'=p_recording_id AND b.approval_type<>'meeting_summary'))
      WHERE a.business_id=p_business_id AND a.payload->>'recording_id'=p_recording_id
        AND a.approval_type='meeting_summary' AND a.status='pending';
      next_phase := CASE WHEN COALESCE((p_data->>'pipeline_failed')::boolean,false) THEN 'partial' ELSE 'complete' END;
      s := s || jsonb_build_object('phase',next_phase,'finished_at',now(),
        'error_code',CASE WHEN next_phase='partial' THEN 'pipeline_failed' ELSE NULL END);
      UPDATE public.call_recording SET transcript_summary=s->'result'->>'summary', analyzed_at=now()
        WHERE recording_id=p_recording_id AND business_id=p_business_id;
    ELSIF p_operation = 'notify' THEN
      IF s->>'phase' NOT IN ('complete','partial') THEN RAISE EXCEPTION 'not_published'; END IF;
      IF s ? 'notified_at' THEN RETURN jsonb_build_object('claimed',false); END IF;
      -- At-most-once attempt; this is NOT a claim of delivery.
      s := s || jsonb_build_object('notified_at',now());
    ELSIF p_operation = 'release' THEN
      s := (s - 'token' - 'lease_until') || jsonb_build_object('error_code',p_data->>'error_code');
      IF p_data ? 'error_code' THEN s := s || jsonb_build_object('phase','failed'); END IF;
    ELSE RAISE EXCEPTION 'invalid_operation'; END IF;
  END IF;
  UPDATE public.call_recording SET call_processing=s WHERE recording_id=p_recording_id AND business_id=p_business_id;
  RETURN jsonb_build_object('status',CASE WHEN p_operation='claim' THEN 'claimed' ELSE s->>'phase' END,
    'state',s,'cards_created',n,'claimed',true);
END $function$;
REVOKE ALL ON FUNCTION public."manage_call_processing"(p_business_id text, p_recording_id text, p_operation text, p_token text, p_data jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.purge_call_raw_data(p_business_id text, p_recording_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r public.call_recording%ROWTYPE; policy jsonb;
BEGIN
  SELECT value::jsonb INTO policy FROM public.business_preferences
    WHERE business_id=p_business_id AND key='call_retention_policy';
  IF policy->>'enabled' IS DISTINCT FROM 'true'
    OR COALESCE(policy->>'legal_review_ref','')=''
    OR COALESCE(policy->>'provider_deletion_ref','')=''
    OR policy->>'transcript_days' IS DISTINCT FROM '30' THEN RAISE EXCEPTION 'retention_not_approved'; END IF;
  SELECT * INTO r FROM public.call_recording
    WHERE business_id=p_business_id AND recording_id=p_recording_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recording_not_found'; END IF;
  IF r.raw_deleted_at IS NOT NULL THEN RETURN false; END IF;
  IF r.source IS DISTINCT FROM 'phone' OR r.created_at > now()-interval '30 days'
    OR (r.call_processing->>'lease_until')::timestamptz > now() THEN RETURN false; END IF;
  -- Raw transcript has multiple historical aliases. Clear ALL of them plus
  -- cached extraction/analysis, not just the field read by the current UI.
  UPDATE public.call_recording SET transcript=NULL,transcript_text=NULL,transcript_segments=NULL,
    transcript_summary=NULL,ai_analysis=NULL,recording_url=NULL,auto_actions_taken=NULL,
    call_processing=jsonb_build_object('phase','expired','version',1,'purged_at',now()),raw_deleted_at=now()
    WHERE business_id=p_business_id AND recording_id=p_recording_id;
  -- Unreviewed suggestions expire; never leave full source text in old cards.
  -- Confirmed business facts/documents are separate records/purposes and remain.
  UPDATE public.pending_approvals SET
    title='Förslag från gallrat samtal',
    description=NULL,
    payload=jsonb_strip_nulls(jsonb_build_object('recording_id',p_recording_id,'source_expired',true,
      'customer_id',payload->'customer_id','project_id',payload->'project_id','routed_agent',payload->'routed_agent',
      'execution_result',CASE WHEN payload ? 'execution_result' THEN jsonb_build_object(
        'outcome',payload->'execution_result'->'outcome','executed_at',payload->'execution_result'->'executed_at',
        'artifacts',payload->'execution_result'->'artifacts') ELSE NULL END)),
    status=CASE WHEN status='pending' THEN 'expired' ELSE status END
    WHERE business_id=p_business_id AND payload->>'recording_id'=p_recording_id;
  UPDATE public.ai_suggestion SET title='Förslag från gallrat samtal',source_text=NULL,description=NULL,suggested_data='{}'::jsonb,
    status=CASE WHEN status='pending' THEN 'rejected' ELSE status END
    WHERE recording_id=p_recording_id AND business_id=p_business_id;
  INSERT INTO public.call_retention_audit(business_id,recording_id,operation,legal_review_ref,provider_deletion_ref)
    VALUES(p_business_id,p_recording_id,'raw_purged',policy->>'legal_review_ref',policy->>'provider_deletion_ref');
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public."purge_call_raw_data"(p_business_id text, p_recording_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.clear_call_audio_pointer(p_business_id text, p_recording_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE policy jsonb; n integer;
BEGIN
  SELECT value::jsonb INTO policy FROM public.business_preferences WHERE business_id=p_business_id AND key='call_retention_policy';
  IF policy->>'enabled' IS DISTINCT FROM 'true' OR COALESCE(policy->>'legal_review_ref','')=''
    OR COALESCE(policy->>'provider_deletion_ref','')='' OR policy->>'transcript_days' IS DISTINCT FROM '30'
    THEN RAISE EXCEPTION 'retention_not_approved'; END IF;
  UPDATE public.call_recording SET recording_url=NULL
    WHERE business_id=p_business_id AND recording_id=p_recording_id AND source='phone'
      AND transcribed_at IS NOT NULL AND transcript IS NOT NULL AND recording_url IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    INSERT INTO public.call_retention_audit(business_id,recording_id,operation,legal_review_ref,provider_deletion_ref)
      VALUES(p_business_id,p_recording_id,'audio_pointer_cleared',policy->>'legal_review_ref',policy->>'provider_deletion_ref');
  END IF;
  RETURN n > 0;
END $function$;
REVOKE ALL ON FUNCTION public."clear_call_audio_pointer"(p_business_id text, p_recording_id text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.protect_business_config_referred_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'referred_by är låst: partnerattributionen kan bara ändras av Handymate'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public."protect_business_config_referred_by"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_partner_commission_rows(p_partner_id uuid, p_period text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public."record_partner_commission_rows"(p_partner_id uuid, p_period text, p_rows jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.review_partner_self_billing_batch(p_batch_id uuid, p_partner_id uuid, p_decision text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
REVOKE ALL ON FUNCTION public."review_partner_self_billing_batch"(p_batch_id uuid, p_partner_id uuid, p_decision text, p_reason text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.mark_partner_self_billing_paid(p_batch_id uuid, p_paid_by text, p_payment_reference text, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch public.partner_payout_batch%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_paid_at TIMESTAMPTZ := COALESCE(p_paid_at, v_now);
BEGIN
  IF COALESCE(BTRIM(p_payment_reference), '') = '' THEN
    RAISE EXCEPTION 'Betalningsreferens krävs' USING ERRCODE = '23514';
  END IF;

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
  SET status = 'paid', paid_at = v_paid_at
  WHERE payout_batch_id = p_batch_id AND status = 'accrued';

  UPDATE public.partner_payout_batch
  SET status = 'paid', paid_at = v_paid_at, paid_by = p_paid_by,
      payment_reference = BTRIM(p_payment_reference)
  WHERE id = p_batch_id;

  UPDATE public.partners p SET
    total_pending_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'accrued'), 0),
    total_earned_sek = COALESCE((SELECT ROUND(SUM(l.amount_sek)) FROM public.partner_commission_ledger l WHERE l.partner_id = v_batch.partner_id AND l.status = 'paid'), 0)
  WHERE p.id = v_batch.partner_id;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'paid_at', v_paid_at, 'total_sek', v_batch.total_incl_vat_sek, 'payment_reference', BTRIM(p_payment_reference));
END;
$function$;
REVOKE ALL ON FUNCTION public."mark_partner_self_billing_paid"(p_batch_id uuid, p_paid_by text, p_payment_reference text, p_paid_at timestamp with time zone) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_partner_attribution(p_business_id text, p_referral_code text, p_required_agreement_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_business public.business_config%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_referral public.referrals%ROWTYPE;
  v_reason TEXT;
  v_business_email TEXT;
  v_partner_email TEXT;
  v_business_org TEXT;
  v_partner_org TEXT;
BEGIN
  IF COALESCE(BTRIM(p_business_id), '') = ''
     OR COALESCE(BTRIM(p_referral_code), '') = ''
     OR COALESCE(BTRIM(p_required_agreement_version), '') = '' THEN
    RAISE EXCEPTION 'business_id, referral_code and agreement version are required';
  END IF;

  SELECT * INTO v_business
  FROM public.business_config
  WHERE business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.partner_attribution_decision (
      business_id, referral_code, accepted, reason
    ) VALUES (
      p_business_id, UPPER(BTRIM(p_referral_code)), false, 'business_not_found'
    );
    RETURN jsonb_build_object(
      'accepted', false, 'reason', 'business_not_found',
      'partner_id', NULL, 'referral_id', NULL, 'idempotent', false
    );
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE referral_code = UPPER(BTRIM(p_referral_code))
    AND status = 'active'
  FOR SHARE;

  IF NOT FOUND THEN
    v_reason := 'invalid_partner_code';
  ELSIF v_partner.agreement_version IS DISTINCT FROM p_required_agreement_version THEN
    v_reason := 'agreement_not_current';
  END IF;

  IF v_reason IS NULL AND v_business.referred_by IS NOT NULL THEN
    SELECT * INTO v_referral
    FROM public.referrals
    WHERE referred_business_id = p_business_id
      AND referrer_type = 'partner'
      AND partner_id = v_partner.id
    LIMIT 1;

    IF v_business.referred_by = v_partner.referral_code AND FOUND THEN
      INSERT INTO public.partner_attribution_decision (
        business_id, partner_id, referral_code, accepted, reason, referral_id
      ) VALUES (
        p_business_id, v_partner.id, v_partner.referral_code, true, 'accepted', v_referral.id
      );
      RETURN jsonb_build_object(
        'accepted', true, 'reason', 'accepted', 'partner_id', v_partner.id,
        'referral_id', v_referral.id, 'idempotent', true
      );
    END IF;
    v_reason := 'already_attributed';
  END IF;

  v_business_email := LOWER(BTRIM(COALESCE(v_business.contact_email, '')));
  v_partner_email := LOWER(BTRIM(COALESCE(v_partner.email, '')));
  v_business_org := REGEXP_REPLACE(COALESCE(v_business.org_number, ''), '[^0-9]', '', 'g');
  v_partner_org := REGEXP_REPLACE(COALESCE(v_partner.self_billing_org_number, ''), '[^0-9]', '', 'g');

  IF v_reason IS NULL AND (
    (v_business_email <> '' AND v_business_email IN (
      v_partner_email,
      LOWER(BTRIM(COALESCE(v_partner.self_billing_email, '')))
    ))
    OR (v_business_org <> '' AND v_partner_org <> '' AND v_business_org = v_partner_org)
  ) THEN
    v_reason := 'self_referral';
  END IF;

  IF v_reason IS NULL AND EXISTS (
    SELECT 1
    FROM public.business_config existing
    WHERE existing.business_id <> p_business_id
      AND (
        (v_business_email <> '' AND LOWER(BTRIM(COALESCE(existing.contact_email, ''))) = v_business_email)
        OR (
          v_business_org <> ''
          AND REGEXP_REPLACE(COALESCE(existing.org_number, ''), '[^0-9]', '', 'g') = v_business_org
        )
      )
  ) THEN
    v_reason := 'existing_handymate_account';
  END IF;

  -- Enbart dokumenterad tvåvägs-/säljdialog räknas. Ett importerat prospekt
  -- eller ett obesvarat kontaktförsök blockerar inte partnern.
  IF v_reason IS NULL AND EXISTS (
    SELECT 1
    FROM public.gtm_account ga
    JOIN public.gtm_activity act ON act.account_id = ga.id
    WHERE act.happened_at >= NOW() - INTERVAL '180 days'
      AND act.outcome IN ('spoke', 'replied', 'meeting_booked', 'demo_booked', 'offer_sent', 'won')
      AND (
        (v_business_email <> '' AND LOWER(BTRIM(COALESCE(ga.primary_contact_email, ga.company_email, ''))) = v_business_email)
        OR (
          v_business_org <> ''
          AND REGEXP_REPLACE(COALESCE(ga.org_number, ''), '[^0-9]', '', 'g') = v_business_org
        )
      )
  ) THEN
    v_reason := 'existing_sales_relationship';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO public.partner_attribution_decision (
      business_id, partner_id, referral_code, accepted, reason
    ) VALUES (
      p_business_id, v_partner.id, UPPER(BTRIM(p_referral_code)), false, v_reason
    );
    RETURN jsonb_build_object(
      'accepted', false, 'reason', v_reason, 'partner_id', v_partner.id,
      'referral_id', NULL, 'idempotent', false
    );
  END IF;

  INSERT INTO public.referrals (
    referrer_business_id,
    referred_business_id,
    referred_email,
    referrer_type,
    partner_id,
    partner_name,
    status
  ) VALUES (
    'PARTNER',
    p_business_id,
    NULLIF(v_business.contact_email, ''),
    'partner',
    v_partner.id,
    v_partner.name,
    'pending'
  )
  RETURNING * INTO v_referral;

  UPDATE public.business_config
  SET referred_by = v_partner.referral_code
  WHERE business_id = p_business_id;

  INSERT INTO public.partner_attribution_decision (
    business_id, partner_id, referral_code, accepted, reason, referral_id
  ) VALUES (
    p_business_id, v_partner.id, v_partner.referral_code, true, 'accepted', v_referral.id
  );

  RETURN jsonb_build_object(
    'accepted', true, 'reason', 'accepted', 'partner_id', v_partner.id,
    'referral_id', v_referral.id, 'idempotent', false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public."claim_partner_attribution"(p_business_id text, p_referral_code text, p_required_agreement_version text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_partner_self_billing_batch(p_partner_id uuid, p_period text, p_buyer jsonb, p_actor text, p_is_final_payout boolean, p_final_payout_reason text)
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
REVOKE ALL ON FUNCTION public."create_partner_self_billing_batch"(p_partner_id uuid, p_period text, p_buyer jsonb, p_actor text, p_is_final_payout boolean, p_final_payout_reason text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.check_preparation_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project p WHERE p.project_id = NEW.project_id
      AND p.business_id = NEW.business_id AND p.customer_id = NEW.customer_id
  ) THEN RAISE EXCEPTION 'Preparation project must belong to the same business and customer'; END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public."check_preparation_project"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_check(p_key text, p_max integer, p_window_ms bigint)
 RETURNS TABLE(new_count integer, reset_at timestamp with time zone, allowed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_reset TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  INSERT INTO rate_limit_bucket(key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + (p_window_ms || ' milliseconds')::INTERVAL, v_now)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limit_bucket.reset_at < v_now THEN 1 ELSE rate_limit_bucket.count + 1 END,
    reset_at = CASE WHEN rate_limit_bucket.reset_at < v_now THEN v_now + (p_window_ms || ' milliseconds')::INTERVAL ELSE rate_limit_bucket.reset_at END,
    updated_at = v_now
  RETURNING count, rate_limit_bucket.reset_at INTO v_count, v_reset;
  RETURN QUERY SELECT v_count, v_reset, (v_count <= p_max);
END;
$function$;
REVOKE ALL ON FUNCTION public."rate_limit_check"(p_key text, p_max integer, p_window_ms bigint) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.rate_limit_cleanup()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limit_bucket WHERE reset_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
REVOKE ALL ON FUNCTION public."rate_limit_cleanup"() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.increment_auto_approve_count(p_business_id text, p_action_type text, p_count_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;
REVOKE ALL ON FUNCTION public."increment_auto_approve_count"(p_business_id text, p_action_type text, p_count_date date) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.increment_storefront_views(bid text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_views INTEGER;
BEGIN
  UPDATE storefront SET page_views = COALESCE(page_views, 0) + 1 WHERE business_id = bid
  RETURNING page_views INTO v_views;
  RETURN v_views;
END $function$;
REVOKE ALL ON FUNCTION public."increment_storefront_views"(bid text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.demo_quote_cleanup(p_business_id text, p_older_than_days integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff     timestamptz := now() - make_interval(days => GREATEST(p_older_than_days, 0));
  v_is_demo    boolean;
  v_customers  text[];
  v_quotes     text[];
  v_projects   text[];
  v_deals      text[];
  n_customers  integer := 0;
  n_quotes     integer := 0;
  n_projects   integer := 0;
  n_deals      integer := 0;
BEGIN
  SELECT is_demo_tenant INTO v_is_demo
  FROM business_config WHERE business_id = p_business_id;

  IF v_is_demo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'demo_quote_cleanup: % är inte markerat som demo-företag (is_demo_tenant)', p_business_id;
  END IF;

  SELECT COALESCE(array_agg(customer_id), '{}') INTO v_customers
  FROM customer WHERE business_id = p_business_id AND created_at < v_cutoff;

  SELECT COALESCE(array_agg(quote_id), '{}') INTO v_quotes
  FROM quotes
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);

  SELECT COALESCE(array_agg(project_id), '{}') INTO v_projects
  FROM project
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR quote_id = ANY (v_quotes) OR created_at < v_cutoff);

  SELECT COALESCE(array_agg(id), '{}') INTO v_deals
  FROM deal
  WHERE business_id = p_business_id
    AND (customer_id = ANY (v_customers) OR quote_id = ANY (v_quotes) OR created_at < v_cutoff);

  DELETE FROM quote_tracking_events WHERE business_id = p_business_id AND quote_id = ANY (v_quotes);
  DELETE FROM project_milestone     WHERE business_id = p_business_id AND project_id = ANY (v_projects);
  DELETE FROM sms_log               WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);
  DELETE FROM sms_conversation      WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);
  DELETE FROM customer_activity     WHERE business_id = p_business_id AND (customer_id = ANY (v_customers) OR created_at < v_cutoff);

  DELETE FROM pending_approvals WHERE business_id = p_business_id AND created_at < v_cutoff;
  DELETE FROM notification      WHERE business_id = p_business_id AND created_at < v_cutoff;
  DELETE FROM cost_event        WHERE business_id = p_business_id AND created_at < v_cutoff;

  DELETE FROM project  WHERE business_id = p_business_id AND project_id = ANY (v_projects);
  GET DIAGNOSTICS n_projects = ROW_COUNT;

  DELETE FROM quotes   WHERE business_id = p_business_id AND quote_id = ANY (v_quotes);
  GET DIAGNOSTICS n_quotes = ROW_COUNT;

  DELETE FROM deal     WHERE business_id = p_business_id AND id = ANY (v_deals);
  GET DIAGNOSTICS n_deals = ROW_COUNT;

  DELETE FROM customer WHERE business_id = p_business_id AND customer_id = ANY (v_customers);
  GET DIAGNOSTICS n_customers = ROW_COUNT;

  RETURN jsonb_build_object(
    'customers', n_customers,
    'quotes', n_quotes,
    'projects', n_projects,
    'deals', n_deals,
    'cutoff', v_cutoff
  );
END;
$function$;
REVOKE ALL ON FUNCTION public."demo_quote_cleanup"(p_business_id text, p_older_than_days integer) FROM PUBLIC,anon,authenticated;
