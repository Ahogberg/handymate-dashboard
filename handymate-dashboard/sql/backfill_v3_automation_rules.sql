-- backfill_v3_automation_rules.sql
--
-- Seedar default-automationsregler (v3_automation_rules) för BEFINTLIGA företag
-- som saknar dem. Nya företag får dem automatiskt via seedAllDefaults
-- (lib/seed-defaults.ts → seedV3AutomationRules) — denna SQL backfillar bara
-- de som onboardades innan den koden fanns.
--
-- Idempotent: hoppar över företag som redan har is_system-regler (NOT EXISTS).
-- Reglerna här MÅSTE spegla seedV3AutomationRules i lib/seed-defaults.ts.
-- Körs manuellt i Supabase SQL Editor.

INSERT INTO v3_automation_rules (
  id, business_id, name, description, is_active, is_system,
  trigger_type, trigger_config, action_type, action_config,
  requires_approval, respects_work_hours, respects_night_mode
)
SELECT
  'v3r_' || bc.business_id || '_' || r.idx,
  bc.business_id, r.name, r.description, true, true,
  r.trigger_type, r.trigger_config::jsonb, r.action_type, r.action_config::jsonb,
  r.requires_approval, true, true
FROM business_config bc
CROSS JOIN (VALUES
  (0, 'Snabbsvar på ny lead',
      'Skickar ett tack-SMS direkt när en ny förfrågan kommer in.',
      'event', '{"event_name":"lead_received"}',
      'send_sms', '{"template":"Hej {{customer_name}}! Tack för din förfrågan till {{business_name}}. Vi återkommer så snart vi kan."}',
      false),
  (1, 'Svar på missat samtal',
      'SMS:ar tillbaka automatiskt när ett samtal missas.',
      'event', '{"event_name":"call_missed"}',
      'send_sms', '{"template":"Hej! Vi missade tyvärr ditt samtal till {{business_name}} men återkommer så snart vi kan."}',
      false),
  (2, 'Följ upp skickad offert',
      'Skapar en uppföljningspåminnelse 3 dagar efter att en offert skickats.',
      'event', '{"event_name":"quote_sent"}',
      'schedule_followup', '{"days_until":3,"description":"Följ upp skickad offert"}',
      false),
  (3, 'Kund öppnade offert',
      'Notifierar dig när en kund öppnar sin offert — bra läge att höra av sig.',
      'event', '{"event_name":"quote_opened"}',
      'notify_owner', '{"title":"Kund tittar på offerten","body":"En kund har precis öppnat sin offert. Passa på att höra av dig medan den är aktuell."}',
      false),
  (4, 'Påminn om förfallen faktura',
      'Föreslår en betalningspåminnelse när en faktura är 7+ dagar försenad. Kräver ditt godkännande innan den skickas.',
      'threshold', '{"entity":"invoice","field":"days_overdue","operator":">=","value":7}',
      'send_sms', '{"template":"Hej! En vänlig påminnelse om en faktura från {{business_name}} som har förfallit. Hör gärna av dig om du har frågor."}',
      true),
  (5, 'Be om recension efter avslutat jobb',
      'Skapar en påminnelse att be kunden om ett omdöme dagen efter att ett jobb avslutats.',
      'event', '{"event_name":"job_completed"}',
      'schedule_followup', '{"days_until":1,"description":"Be kunden om en recension"}',
      false)
) AS r(idx, name, description, trigger_type, trigger_config, action_type, action_config, requires_approval)
WHERE NOT EXISTS (
  SELECT 1 FROM v3_automation_rules v
  WHERE v.business_id = bc.business_id AND v.is_system = true
);
