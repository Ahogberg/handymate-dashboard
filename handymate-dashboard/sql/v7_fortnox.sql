-- ============================================================
-- V7: Fortnox-djupintegration
-- OAuth-tokens per företag + synkroniseringsstatus per entitet.
-- Run in Supabase SQL Editor
-- ============================================================

-- Fortnox-koppling per företag (vissa kolumner kan redan finnas från tidigare)
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS fortnox_access_token TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fortnox_client_id TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fortnox_company_name TEXT;

-- Synkroniseringsstatus per entitet
CREATE TABLE IF NOT EXISTS fortnox_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,   -- 'invoice' | 'customer' | 'quote'
  entity_id TEXT NOT NULL,     -- handymate-internt id
  fortnox_id TEXT,             -- Fortnox DocumentNumber eller CustomerNumber
  sync_status TEXT DEFAULT 'pending', -- 'pending' | 'synced' | 'error'
  last_synced_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_fortnox_sync_business ON fortnox_sync(business_id, sync_status);

-- RLS
ALTER TABLE fortnox_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fortnox_sync_select" ON fortnox_sync
  FOR SELECT USING (true);

CREATE POLICY "fortnox_sync_insert" ON fortnox_sync
  FOR INSERT WITH CHECK (true);

CREATE POLICY "fortnox_sync_update" ON fortnox_sync
  FOR UPDATE USING (true);

-- Quote-tabell: Fortnox offer-nummer
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS fortnox_offer_number TEXT,
  ADD COLUMN IF NOT EXISTS fortnox_synced_at TIMESTAMPTZ;

-- Seed automation rules för Fortnox-sync (inaktiva tills konto finns)
-- Kör bara om v3_automation_rules existerar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'v3_automation_rules') THEN

    -- Synka ny faktura till Fortnox
    INSERT INTO v3_automation_rules (
      id, business_id, name, description, is_active, is_system,
      trigger_type, trigger_config, action_type, action_config,
      requires_approval, respects_work_hours, respects_night_mode
    )
    SELECT
      gen_random_uuid(),
      bc.business_id,
      'Fortnox: synka faktura',
      'Synkar nya fakturor till Fortnox automatiskt',
      false, -- INAKTIV tills Fortnox-konto finns
      true,
      'event',
      '{"event_name": "invoice_created"}'::jsonb,
      'sync_to_fortnox',
      '{"entity_type": "invoice"}'::jsonb,
      false, false, false
    FROM business_config bc
    WHERE NOT EXISTS (
      SELECT 1 FROM v3_automation_rules r
      WHERE r.business_id = bc.business_id AND r.name = 'Fortnox: synka faktura'
    );

    -- Synka betalning till Fortnox
    INSERT INTO v3_automation_rules (
      id, business_id, name, description, is_active, is_system,
      trigger_type, trigger_config, action_type, action_config,
      requires_approval, respects_work_hours, respects_night_mode
    )
    SELECT
      gen_random_uuid(),
      bc.business_id,
      'Fortnox: registrera betalning',
      'Registrerar betalningar i Fortnox automatiskt',
      false, -- INAKTIV tills Fortnox-konto finns
      true,
      'event',
      '{"event_name": "payment_received"}'::jsonb,
      'sync_to_fortnox',
      '{"entity_type": "payment"}'::jsonb,
      false, false, false
    FROM business_config bc
    WHERE NOT EXISTS (
      SELECT 1 FROM v3_automation_rules r
      WHERE r.business_id = bc.business_id AND r.name = 'Fortnox: registrera betalning'
    );

  END IF;
END $$;
