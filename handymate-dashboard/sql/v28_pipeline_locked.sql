-- V28: Låst 6-stegs pipeline + automation tasks
-- Kör manuellt i Supabase SQL Editor
-- VIKTIGT: Kör HELA blocket som en query

-- 0. Rensa pipeline_activity FK:er så vi kan ta bort gamla steg
UPDATE pipeline_activity SET from_stage_id = NULL WHERE from_stage_id IS NOT NULL;
UPDATE pipeline_activity SET to_stage_id = NULL WHERE to_stage_id IS NOT NULL;

-- 1. Skapa de 6 låsta stegen per business (ON CONFLICT uppdaterar)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Ny förfrågan', 'new_inquiry', '#6B7280', 1, true, false, false FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Ny förfrågan', color='#6B7280', sort_order=1, is_system=true, is_won=false, is_lost=false;

INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Kontaktad', 'contacted', '#0F766E', 2, true, false, false FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Kontaktad', color='#0F766E', sort_order=2, is_system=true, is_won=false, is_lost=false;

INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Offert skickad', 'quote_sent', '#0D9488', 3, true, false, false FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Offert skickad', color='#0D9488', sort_order=3, is_system=true, is_won=false, is_lost=false;

INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Offert accepterad', 'quote_accepted', '#0F766E', 4, true, false, false FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Offert accepterad', color='#0F766E', sort_order=4, is_system=true, is_won=false, is_lost=false;

INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Vunnen', 'won', '#22C55E', 5, true, true, false FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Vunnen', color='#22C55E', sort_order=5, is_system=true, is_won=true, is_lost=false;

INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Förlorad', 'lost', '#EF4444', 99, true, false, true FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET name='Förlorad', color='#EF4444', sort_order=99, is_system=true, is_won=false, is_lost=true;

-- 2. Migrera deals från gamla steg till nya
-- Ny förfrågan (fånga alla varianter)
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'new_inquiry' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('ny_forfragen','new','new_lead','incoming','lead')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'new_inquiry');

-- Kontaktad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'contacted' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('kontaktad','qualified')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'contacted');

-- Offert skickad (inkl platsbesök-stegen som nu tas bort)
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'quote_sent' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('offert_skickad','platsbesok_bokat','platsbesok_genomfort','negotiation')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'quote_sent');

-- Offert accepterad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'quote_accepted' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('offert_accepterad','accepted')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'quote_accepted');

-- Vunnen (inkl jobb pågår, fakturerad, betalad — allt = vunnen nu)
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'won' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('jobb_pagar','fakturerad','betalad','completed','closed_won')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'won');

-- Förlorad
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'lost' LIMIT 1
) WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('forlorad','closed_lost')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'lost');

-- Deals som pekar på steg som inte finns bland de 6 → flytta till new_inquiry
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps WHERE ps.business_id = deal.business_id AND ps.slug = 'new_inquiry' LIMIT 1
) WHERE stage_id NOT IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('new_inquiry','contacted','quote_sent','quote_accepted','won','lost')
) AND EXISTS (SELECT 1 FROM pipeline_stage WHERE business_id = deal.business_id AND slug = 'new_inquiry');

-- 3. Ta bort gamla steg som inte längre används
DELETE FROM pipeline_stage
WHERE slug NOT IN ('new_inquiry','contacted','quote_sent','quote_accepted','won','lost')
AND id NOT IN (SELECT DISTINCT stage_id FROM deal WHERE stage_id IS NOT NULL);

-- 4. Nya kolumner på deal
ALTER TABLE deal
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ DEFAULT now();

-- 5. Trigger: uppdatera stage_updated_at + won_at/lost_at
CREATE OR REPLACE FUNCTION update_deal_stage_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    NEW.stage_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_stage_timestamp ON deal;
CREATE TRIGGER deals_stage_timestamp
  BEFORE UPDATE ON deal
  FOR EACH ROW EXECUTE FUNCTION update_deal_stage_timestamp();

-- 6. Automation tasks table
CREATE TABLE IF NOT EXISTS deal_automation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  deal_id TEXT NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_auto_tasks_deal ON deal_automation_tasks(deal_id) WHERE executed_at IS NULL AND cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deal_auto_tasks_schedule ON deal_automation_tasks(scheduled_at) WHERE executed_at IS NULL AND cancelled_at IS NULL;

ALTER TABLE deal_automation_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service deal_auto_tasks" ON deal_automation_tasks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User deal_auto_tasks" ON deal_automation_tasks FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);

NOTIFY pgrst, 'reload schema';
