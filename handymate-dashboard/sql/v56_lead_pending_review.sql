-- v56: Lead-status 'pending_review' + 'declined' + utökade source-värden
-- Kör manuellt i Supabase SQL Editor.
--
-- Bakgrund (2026-05-28): Email-forwarding-bygget (Postmark Inbound → webhook
-- → pending_review-lead → manuell approve via pending_approvals → Golden Path).
--
-- Krävs:
-- 1. status='pending_review' — leads från webhook väntar på operatörsgranskning
-- 2. status='declined' — operatör avvisade leaden (spam, nyhetsbrev, fel kanal)
-- 3. source='email_forward' — Postmark-webhook (forwardade mail)
-- 4. source='email_lead' — Gmail-cron-import. Saknas i CHECK idag, men koden
--    skriver det redan (lib/cron/gmail-lead-import). Lagas medan vi är här.
--
-- Postgres tillåter inte direkt ALTER CHECK — DROP + ADD krävs.

-- ── 1. status-constraint ───────────────────────────────────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE leads ADD CONSTRAINT valid_status CHECK (status IN (
  'pending_review',
  'new',
  'contacted',
  'qualified',
  'quote_sent',
  'won',
  'lost',
  'declined'
));

-- ── 2. source-constraint ───────────────────────────────────────────
ALTER TABLE leads DROP CONSTRAINT IF EXISTS valid_source;
ALTER TABLE leads ADD CONSTRAINT valid_source CHECK (source IN (
  'vapi_call',
  'inbound_sms',
  'website_form',
  'manual',
  'email_lead',      -- Gmail-cron-import (befintlig kod)
  'email_forward'    -- Postmark-webhook (nytt)
));

-- ── 3. Verifiering (kör efter ALTER) ───────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'leads'::regclass
--   AND conname IN ('valid_status', 'valid_source');
