-- V27: Hantverkar-anpassade pipeline-steg med låsning
-- Kör manuellt i Supabase SQL Editor
-- VIKTIGT: Kör steg för steg!

-- Steg 1: Spara gamla stage_id → slug-mappning för deals
-- (behövs för att migrera deals till nya steg)

-- Steg 2: Ta bort befintliga systemsteg och skapa nya
-- Först: ta bort gamla steg som inte har deals kopplade
DELETE FROM pipeline_stage
WHERE is_system = true
AND id NOT IN (SELECT DISTINCT stage_id FROM deal WHERE stage_id IS NOT NULL);

-- Steg 3: Uppdatera/skapa de 10 nya systemstegen
-- Använd ON CONFLICT för att uppdatera om slug redan finns

-- 1. Ny förfrågan (gul)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Ny förfrågan', 'ny_forfragen', '#EAB308', 1, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Ny förfrågan', color = '#EAB308', sort_order = 1, is_system = true;

-- 2. Kontaktad (blå)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Kontaktad', 'kontaktad', '#3B82F6', 2, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Kontaktad', color = '#3B82F6', sort_order = 2, is_system = true;

-- 3. Platsbesök bokat (lila)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Platsbesök bokat', 'platsbesok_bokat', '#8B5CF6', 3, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Platsbesök bokat', color = '#8B5CF6', sort_order = 3, is_system = true;

-- 4. Platsbesök genomfört (indigo)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Platsbesök genomfört', 'platsbesok_genomfort', '#6366F1', 4, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Platsbesök genomfört', color = '#6366F1', sort_order = 4, is_system = true;

-- 5. Offert skickad (orange)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Offert skickad', 'offert_skickad', '#F97316', 5, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Offert skickad', color = '#F97316', sort_order = 5, is_system = true;

-- 6. Offert accepterad (lime)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Offert accepterad', 'offert_accepterad', '#84CC16', 6, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Offert accepterad', color = '#84CC16', sort_order = 6, is_system = true;

-- 7. Jobb pågår (teal)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Jobb pågår', 'jobb_pagar', '#0F766E', 7, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Jobb pågår', color = '#0F766E', sort_order = 7, is_system = true;

-- 8. Fakturerad (cyan)
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Fakturerad', 'fakturerad', '#06B6D4', 8, true, false, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Fakturerad', color = '#06B6D4', sort_order = 8, is_system = true;

-- 9. Betalad (grön) — markeras som "vunnen"
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Betalad', 'betalad', '#22C55E', 9, true, true, false
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Betalad', color = '#22C55E', sort_order = 9, is_system = true, is_won = true;

-- 10. Förlorad (röd) — markeras som "förlorad"
INSERT INTO pipeline_stage (id, business_id, name, slug, color, sort_order, is_system, is_won, is_lost)
SELECT gen_random_uuid()::text, business_id, 'Förlorad', 'forlorad', '#EF4444', 99, true, false, true
FROM business_config
ON CONFLICT (business_id, slug) DO UPDATE SET
  name = 'Förlorad', color = '#EF4444', sort_order = 99, is_system = true, is_lost = true;

-- Steg 4: Migrera befintliga deals till nya steg
-- Mappa gamla slugs till nya
UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'ny_forfragen'
)
WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('new', 'new_lead', 'incoming')
);

UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'kontaktad'
)
WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('contacted', 'qualified')
);

UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'offert_skickad'
)
WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('quote_sent', 'proposal', 'negotiation')
);

UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'betalad'
)
WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('won', 'closed_won', 'completed')
);

UPDATE deal SET stage_id = (
  SELECT ps.id FROM pipeline_stage ps
  WHERE ps.business_id = deal.business_id AND ps.slug = 'forlorad'
)
WHERE stage_id IN (
  SELECT id FROM pipeline_stage WHERE slug IN ('lost', 'closed_lost')
);

-- Steg 5: Ta bort gamla steg som inte längre har deals
DELETE FROM pipeline_stage
WHERE slug NOT IN (
  'ny_forfragen', 'kontaktad', 'platsbesok_bokat', 'platsbesok_genomfort',
  'offert_skickad', 'offert_accepterad', 'jobb_pagar', 'fakturerad',
  'betalad', 'forlorad'
)
AND id NOT IN (SELECT DISTINCT stage_id FROM deal WHERE stage_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
