-- V12 Canvas Extended — Generisk canvas för lead, projekt, fristående
-- Kör i Supabase SQL Editor

-- Gör canvas generisk — stöd för lead, projekt, fristående
ALTER TABLE project_canvas
  ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- Migrera befintliga rader
UPDATE project_canvas
  SET entity_type = 'project',
      entity_id = project_id::TEXT
  WHERE entity_id IS NULL;

-- Ta bort gammal UNIQUE-constraint, lägg till ny
ALTER TABLE project_canvas
  DROP CONSTRAINT IF EXISTS project_canvas_project_id_key;

ALTER TABLE project_canvas
  ADD CONSTRAINT unique_canvas_entity
  UNIQUE(entity_type, entity_id);

-- Byt namn på tabellen
ALTER TABLE project_canvas RENAME TO canvas_items;

CREATE INDEX IF NOT EXISTS idx_canvas_entity
  ON canvas_items(business_id, entity_type, entity_id);
