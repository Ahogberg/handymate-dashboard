-- ============================================================
-- V4: Seed 8 pipeline-automationsregler per företag
-- Run in Supabase SQL Editor AFTER v4_pipeline_stages.sql
-- och v3_automation_rules.sql
-- ============================================================

CREATE OR REPLACE FUNCTION seed_v4_pipeline_rules(p_business_id TEXT)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

-- Seed för alla befintliga företag
SELECT seed_v4_pipeline_rules(business_id) FROM business_config;
