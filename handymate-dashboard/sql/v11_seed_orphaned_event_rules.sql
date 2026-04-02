-- ============================================================
-- V11: Seed-regler för orphaned events
-- Dessa events triggas redan i koden men hade inga regler.
-- Run in Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION seed_v11_event_rules(p_business_id TEXT)
RETURNS void AS $$
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
$$ LANGUAGE plpgsql;

-- Seed för alla befintliga företag
SELECT seed_v11_event_rules(business_id) FROM business_config;
