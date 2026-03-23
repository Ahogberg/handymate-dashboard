-- V25: Lönsamhetsanalys — triggers + projektkolumner
-- Kör manuellt i Supabase SQL Editor

-- 1. Lägg till lönsamhetskolumner på project
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_labor_cost DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_material_cost DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profitability_status TEXT DEFAULT 'on_track';
  -- 'on_track' | 'at_risk' | 'over_budget'

-- 2. Trigger: uppdatera projekt-lönsamhet vid tidrapportering
CREATE OR REPLACE FUNCTION update_project_profitability()
RETURNS TRIGGER AS $$
DECLARE
  pid TEXT;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN RETURN NEW; END IF;

  UPDATE project SET
    actual_hours = (
      SELECT COALESCE(SUM(duration_minutes) / 60.0, 0)
      FROM time_entry WHERE project_id = pid
    ),
    actual_labor_cost = (
      SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
      FROM time_entry WHERE project_id = pid
    ),
    profitability_status = CASE
      WHEN budget_amount > 0 AND (
        SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
        FROM time_entry WHERE project_id = pid
      ) > budget_amount * 0.95 THEN 'over_budget'
      WHEN budget_amount > 0 AND (
        SELECT COALESCE(SUM((duration_minutes / 60.0) * hourly_rate), 0)
        FROM time_entry WHERE project_id = pid
      ) > budget_amount * 0.75 THEN 'at_risk'
      ELSE 'on_track'
    END
  WHERE project_id = pid;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profitability ON time_entry;
CREATE TRIGGER trg_update_profitability
AFTER INSERT OR UPDATE OR DELETE ON time_entry
FOR EACH ROW EXECUTE FUNCTION update_project_profitability();

-- 3. Trigger: uppdatera materialkostnad vid materialändring
CREATE OR REPLACE FUNCTION update_project_material_cost()
RETURNS TRIGGER AS $$
DECLARE
  pid TEXT;
BEGIN
  pid := COALESCE(NEW.project_id, OLD.project_id);
  IF pid IS NULL THEN RETURN NEW; END IF;

  UPDATE project SET
    actual_material_cost = (
      SELECT COALESCE(SUM(total_purchase), 0)
      FROM project_material WHERE project_id = pid
    )
  WHERE project_id = pid;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_material_cost ON project_material;
CREATE TRIGGER trg_update_material_cost
AFTER INSERT OR UPDATE OR DELETE ON project_material
FOR EACH ROW EXECUTE FUNCTION update_project_material_cost();

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_project_profitability ON project(profitability_status)
  WHERE status = 'active';

-- 5. Backfill: uppdatera befintliga projekt
UPDATE project SET
  actual_hours = COALESCE((
    SELECT SUM(duration_minutes) / 60.0 FROM time_entry WHERE time_entry.project_id = project.project_id
  ), 0),
  actual_labor_cost = COALESCE((
    SELECT SUM((duration_minutes / 60.0) * hourly_rate) FROM time_entry WHERE time_entry.project_id = project.project_id
  ), 0),
  actual_material_cost = COALESCE((
    SELECT SUM(total_purchase) FROM project_material WHERE project_material.project_id = project.project_id
  ), 0)
WHERE status = 'active';
