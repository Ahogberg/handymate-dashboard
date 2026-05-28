-- ============================================================
-- V59: Seed-regel för lead_received-eventet (pilot-fix-plan Steg 5)
--
-- Tidigare dead-letter: fireEvent('lead_received', ...) avfyras från
--   - app/api/lead-portal/[code]/route.ts:188 (leverantörsportal-leads)
--   - email-forwarding-bygget (pågående, parallell tråd)
-- men ingen matching rule i v3_automation_rules → ingen automation.
--
-- Action: notify_owner (push-notis + approval) — INTE auto-SMS.
-- Bee Service-pilot kommer få varierade leads från email-forwarding där
-- manuell granskning är säkrare än auto-svar. Christoffer ser nya leads
-- i /dashboard/approvals och kan välja att svara eller agera.
--
-- Senare iteration: när email-forwarding stabilt + Christoffer-feedback
-- bekräftar lead-kvaliteten, kan vi byta till auto-SMS med template.
-- ============================================================

CREATE OR REPLACE FUNCTION seed_v59_lead_received_rule(p_business_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO v3_automation_rules (business_id, name, description, is_system, is_active, trigger_type, trigger_config, action_type, action_config, requires_approval, respects_work_hours, respects_night_mode)
  VALUES
    -- 15. Ny lead från portal/email — notifiera
    (p_business_id, 'Ny lead från portal/email — notifiera',
     'Push-notis och approval när ny lead kommer in via lead-portal eller email-forwarding. Manuell granskning innan svar (leads varierar för mycket för auto-SMS).',
     true, true,
     'event', '{"event_name": "lead_received"}',
     'notify_owner', '{"title": "Ny lead 📋", "message": "Ny förfrågan från {{customer_name}} ({{source}}). Granska och svara via Godkännanden."}',
     false, false, false)

  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Backfill för alla befintliga företag (matchar v11_seed_orphaned_event_rules-mönstret)
SELECT seed_v59_lead_received_rule(business_id) FROM business_config;
