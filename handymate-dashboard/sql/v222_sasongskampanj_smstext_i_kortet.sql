-- v222 — Väntande säsongskampanjkort: SMS-texten synlig i kortets underrad
-- (beslut Andreas 2026-09-08). Koden: lib/seasonality/campaign-generator.ts.
-- Scoped till pending kort vars beskrivning ännu inte börjar med citattecken.
UPDATE pending_approvals
   SET description = '"' || (payload->>'sms_text') || '"' || E'\n\nTill ' || description
 WHERE approval_type = 'seasonal_campaign'
   AND status = 'pending'
   AND coalesce(payload->>'sms_text', '') <> ''
   AND description !~ '^"';
