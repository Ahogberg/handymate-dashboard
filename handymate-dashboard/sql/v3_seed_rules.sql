-- ============================================================
-- V3: Automation Engine — Seed 9 systemregler per företag
-- Run in Supabase SQL Editor AFTER v3_automation_rules.sql
-- ============================================================

CREATE OR REPLACE FUNCTION seed_v3_rules(p_business_id TEXT)
RETURNS void AS $$
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

    -- 4. Offertuppföljning dag 5
    (p_business_id, 'Offertuppföljning dag 5', 'Följer upp obesvarade offerter efter 5 dagar', true, true,
     'threshold', '{"entity": "quote", "field": "days_since_sent", "operator": ">=", "value": 5}',
     'send_sms', '{"template": "Hej {{customer_name}}! Vi skickade en offert för {{days}} dagar sedan. Har du hunnit titta på den? Hör av dig om du har frågor! /{{business_name}}"}',
     false, true, true),

    -- 5. Offertuppföljning dag 10
    (p_business_id, 'Offertuppföljning dag 10', 'Andra uppföljningen — kräver godkännande för att ringa', true, true,
     'threshold', '{"entity": "quote", "field": "days_since_sent", "operator": ">=", "value": 10}',
     'create_approval', '{"title": "Ring kund om offert", "description": "Offerten har varit obesvarad i 10+ dagar. Vill du ringa kunden?"}',
     true, true, true),

    -- 6. Fakturapåminnelse dag 1
    (p_business_id, 'Fakturapåminnelse dag 1', 'Vänlig påminnelse första dagen efter förfallodatum', true, true,
     'threshold', '{"entity": "invoice", "field": "days_overdue", "operator": ">=", "value": 1}',
     'send_sms', '{"template": "Hej {{customer_name}}! Din faktura på {{total}} kr förföll {{due_date}}. Vänligen betala så snart du kan. /{{business_name}}"}',
     false, true, true),

    -- 7. Faktura eskalering dag 7
    (p_business_id, 'Faktura eskalering dag 7', 'Striktare påminnelse efter 7 dagar — kräver godkännande', true, true,
     'threshold', '{"entity": "invoice", "field": "days_overdue", "operator": ">=", "value": 7}',
     'create_approval', '{"title": "Försenad faktura — åtgärd krävs", "description": "Fakturan har varit obetald i 7+ dagar. Godkänn för att skicka formell påminnelse."}',
     true, true, true),

    -- 8. Bokningspåminnelse
    (p_business_id, 'Bokningspåminnelse', 'Skickar påminnelse 24h före bokning', true, true,
     'threshold', '{"entity": "booking", "field": "hours_until", "operator": "<=", "value": 24}',
     'send_sms', '{"template": "Hej {{customer_name}}! Påminnelse om din bokning imorgon kl {{time}}. Adress: {{address}}. /{{business_name}}"}',
     false, false, true),

    -- 9. Reaktivering 6 mån (AV som default)
    (p_business_id, 'Reaktivering 6 månader', 'Skickar reaktiverings-SMS till kunder utan aktivitet i 6 månader', true, false,
     'threshold', '{"entity": "customer", "field": "months_since_last_job", "operator": ">=", "value": 6}',
     'create_approval', '{"title": "Reaktivera inaktiv kund", "description": "Kunden har inte haft jobb på 6+ månader. Godkänn för att skicka reaktiverings-SMS."}',
     true, true, true)

  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed för alla befintliga företag
SELECT seed_v3_rules(business_id) FROM business_config;
