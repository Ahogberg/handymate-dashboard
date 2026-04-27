-- V44: Saknade fakturapåminnelse-kolumner i business_config.
--
-- Settings-sidan + cron/check-overdue + cron/send-reminders refererar till
-- dessa kolumner men de fanns inte i DB. Resultat: hela handleSave i
-- /dashboard/settings throw'ade på okänd kolumn → org_number gick inte
-- att spara (Christoffer-bugg).

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS auto_reminder_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_reminder_days INTEGER DEFAULT 7,
  ADD COLUMN IF NOT EXISTS late_fee_percent NUMERIC DEFAULT 8,
  ADD COLUMN IF NOT EXISTS reminder_sms_template TEXT;
