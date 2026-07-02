-- v65_earned_autonomy.sql
-- Förtjänad autonomi: per-åtgärdstyp-state på v3_automation_settings.
-- Form: { "invoice_reminder": { "status": "autonomous", "granted_at": "<iso>" }, ... }
-- Endast beviljande-state persisteras — streaks härleds ur pending_approvals-historik.
-- Körs manuellt i Supabase SQL Editor (konvention).

ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS earned_autonomy JSONB DEFAULT '{}';
