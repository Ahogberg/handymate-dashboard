-- Smart Communication Tables
-- AI-driven customer communication system

-- Communication rules (what AI follows)
CREATE TABLE IF NOT EXISTS communication_rule (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB NOT NULL DEFAULT '{}',
  message_template TEXT NOT NULL,
  channel TEXT DEFAULT 'sms' CHECK (channel IN ('sms', 'email', 'both')),
  is_enabled BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_rule_business ON communication_rule(business_id);

-- Communication log (what was sent)
CREATE TABLE IF NOT EXISTS communication_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  customer_id TEXT,
  deal_id TEXT,
  order_id TEXT,
  invoice_id TEXT,
  rule_id TEXT REFERENCES communication_rule(id),
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_reason TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_log_business ON communication_log(business_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_customer ON communication_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_created ON communication_log(created_at);

-- Communication settings (per business)
CREATE TABLE IF NOT EXISTS communication_settings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT UNIQUE NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  auto_enabled BOOLEAN DEFAULT true,
  tone TEXT DEFAULT 'friendly' CHECK (tone IN ('formal', 'friendly', 'personal')),
  max_sms_per_customer_per_week INTEGER DEFAULT 3,
  send_booking_confirmation BOOLEAN DEFAULT true,
  send_day_before_reminder BOOLEAN DEFAULT true,
  send_on_the_way BOOLEAN DEFAULT true,
  send_quote_followup BOOLEAN DEFAULT true,
  send_job_completed BOOLEAN DEFAULT true,
  send_invoice_reminder BOOLEAN DEFAULT true,
  send_review_request BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT '21:00',
  quiet_hours_end TIME DEFAULT '07:00',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE communication_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access communication_rule" ON communication_rule FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access communication_log" ON communication_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access communication_settings" ON communication_settings FOR ALL USING (true) WITH CHECK (true);

-- Seed system rules (defaults for all businesses)
INSERT INTO communication_rule (id, business_id, name, description, trigger_type, trigger_config, message_template, is_system, sort_order) VALUES

('rule_call_received', NULL, 'Efter samtal', 'Tack för samtalet', 'event',
  '{"event": "call_completed", "delay_minutes": 5}',
  'Hej {customer_name}! Tack för ditt samtal. Vi återkommer med mer information inom kort. //{business_name}',
  true, 1),

('rule_quote_sent', NULL, 'Offert skickad', 'När offert skickas till kund', 'event',
  '{"event": "quote_sent", "delay_minutes": 1}',
  'Hej {customer_name}! Du har fått en offert från {business_name}. Se den här: {quote_link}',
  true, 2),

('rule_quote_followup', NULL, 'Offert-påminnelse', 'Om offert inte besvarats', 'condition',
  '{"condition": "quote_pending", "days_since": 3}',
  'Hej {customer_name}! Har du hunnit titta på offerten vi skickade? Hör av dig om du har frågor. //{business_name} {business_phone}',
  true, 3),

('rule_quote_signed', NULL, 'Offert accepterad', 'När kund signerar offert', 'event',
  '{"event": "quote_signed", "delay_minutes": 1}',
  'Tack {customer_name}! Vi har mottagit din accept och hör av oss för att boka in jobbet. //{business_name}',
  true, 4),

('rule_booking_confirmed', NULL, 'Bokning bekräftad', 'När besök bokas', 'event',
  '{"event": "booking_created", "delay_minutes": 1}',
  'Hej {customer_name}! Din bokning är bekräftad: {booking_date} kl {booking_time}. Välkommen! //{business_name}',
  true, 5),

('rule_day_before', NULL, 'Påminnelse dagen innan', 'Dagen innan schemalagt besök', 'condition',
  '{"condition": "booking_tomorrow", "send_time": "18:00"}',
  'Påminnelse: {business_name} kommer imorgon {booking_date} kl {booking_time}. Hör av dig om något ändrats: {business_phone}',
  true, 6),

('rule_on_the_way', NULL, 'Vi är på väg', 'Manuellt trigger - på väg till kund', 'manual',
  '{}',
  'Hej {customer_name}! Vi är på väg och beräknas vara hos dig om ca {eta_minutes} minuter. //{business_name}',
  true, 7),

('rule_job_completed', NULL, 'Jobb avslutat', 'När projekt markeras klart', 'event',
  '{"event": "project_completed", "delay_minutes": 60}',
  'Hej {customer_name}! Jobbet hos dig är nu klart. Tack för att du valde {business_name}! Faktura kommer inom kort.',
  true, 8),

('rule_invoice_sent', NULL, 'Faktura skickad', 'När faktura skickas', 'event',
  '{"event": "invoice_sent", "delay_minutes": 1}',
  'Faktura #{invoice_number} från {business_name} på {invoice_amount} kr. Förfaller {invoice_due_date}.',
  true, 9),

('rule_invoice_reminder', NULL, 'Faktura-påminnelse', 'Om faktura ej betald efter förfall', 'condition',
  '{"condition": "invoice_overdue", "days_since": 5}',
  'Påminnelse: Faktura #{invoice_number} på {invoice_amount} kr förföll {invoice_due_date}. Vänligen betala snarast. //{business_name}',
  true, 10),

('rule_invoice_paid', NULL, 'Betalning mottagen', 'När faktura betalas', 'event',
  '{"event": "invoice_paid", "delay_minutes": 5}',
  'Tack för din betalning på {invoice_amount} kr! Vi uppskattar att du valde {business_name}. Välkommen åter!',
  true, 11),

('rule_review_request', NULL, 'Be om recension', 'Efter betald faktura', 'condition',
  '{"condition": "invoice_paid", "days_since": 2}',
  'Hej {customer_name}! Hur upplevde du jobbet? Vi skulle uppskatta en recension: {review_link} Tack! //{business_name}',
  true, 12)

ON CONFLICT (id) DO NOTHING;
