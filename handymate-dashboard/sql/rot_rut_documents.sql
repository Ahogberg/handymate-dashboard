-- ============================================
-- ROT/RUT, E-signering, Dokument, Byggdagbok & Checklistor
-- Migration för Handymate Dashboard
-- ============================================

-- ==========================================
-- DEL 1: ROT/RUT - Kolumntillägg
-- ==========================================

-- business_config: F-skatt och betalningsuppgifter
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS f_skatt_registered BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS bankgiro TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS plusgiro TEXT;

-- customer: Personnummer och fastighetsbeteckning
ALTER TABLE customer ADD COLUMN IF NOT EXISTS personal_number TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS property_designation TEXT;

-- quotes: ROT/RUT-uppgifter
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS personnummer TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS fastighetsbeteckning TEXT;

-- invoice: ROT/RUT-uppgifter
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS personnummer TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fastighetsbeteckning TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_rut_status TEXT DEFAULT 'pending';

-- ==========================================
-- DEL 2: E-signering - Kolumntillägg
-- ==========================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sign_token TEXT UNIQUE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_by_name TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_by_ip TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signature_data TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_sign_token ON quotes(sign_token) WHERE sign_token IS NOT NULL;

-- ==========================================
-- DEL 3: Projektdokument
-- ==========================================

CREATE TABLE IF NOT EXISTS project_document (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(project_id),
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  category TEXT DEFAULT 'other',
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_document_project ON project_document(project_id);
CREATE INDEX IF NOT EXISTS idx_project_document_business ON project_document(business_id);

-- ==========================================
-- DEL 4: Byggdagbok
-- ==========================================

CREATE TABLE IF NOT EXISTS project_log (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  -- OBS: heter order_id (inte project_id) i LIVE-schemat — historiskt namn
  -- från när projekt hette order. Pekar på project.project_id.
  order_id TEXT NOT NULL,
  business_user_id TEXT,
  date DATE NOT NULL,
  weather TEXT,
  temperature INTEGER,
  description TEXT,
  work_performed TEXT,
  issues TEXT,
  workers_count INTEGER,
  hours_worked NUMERIC,
  materials_used TEXT,
  photos TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  signed_by_customer BOOLEAN,
  customer_signed_at TIMESTAMPTZ
  -- + ata_change_id, attested_by_user_id, attested_at, locked_at, addendum
  --   (sql/v196_byggdagboken.sql)
);

-- Den här DEL:en beskrev fram till 2026-09-02 ett schema som ALDRIG matchade
-- databasen (project_id/log_date/work_description/notes). Tre skrivvägar
-- kopierade kolumnnamnen härifrån och 42703:ade tyst. Kolumnlistan ovan är
-- verifierad mot information_schema i prod 2026-09-02; tests/column-contract
-- .spec.ts läser den.

CREATE INDEX IF NOT EXISTS idx_project_log_project ON project_log(order_id);
CREATE INDEX IF NOT EXISTS idx_project_log_date ON project_log(order_id, date);

-- ==========================================
-- DEL 5: Checklistor
-- ==========================================

CREATE TABLE IF NOT EXISTS checklist_template (
  id TEXT PRIMARY KEY,
  business_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  is_default BOOLEAN DEFAULT false,
  branch TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_template_business ON checklist_template(business_id);

CREATE TABLE IF NOT EXISTS project_checklist (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(project_id),
  business_id TEXT NOT NULL,
  template_id TEXT,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  customer_signature TEXT,
  customer_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_checklist_project ON project_checklist(project_id);

-- ==========================================
-- RLS Policies
-- ==========================================

ALTER TABLE project_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_checklist ENABLE ROW LEVEL SECURITY;

-- project_document: business_id match
CREATE POLICY project_document_policy ON project_document
  FOR ALL USING (true) WITH CHECK (true);

-- project_log: business_id match
CREATE POLICY project_log_policy ON project_log
  FOR ALL USING (true) WITH CHECK (true);

-- checklist_template: business_id match or default
CREATE POLICY checklist_template_policy ON checklist_template
  FOR ALL USING (true) WITH CHECK (true);

-- project_checklist: business_id match
CREATE POLICY project_checklist_policy ON project_checklist
  FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- Supabase Storage bucket for project files
-- ==========================================
-- Run in Supabase Dashboard > Storage:
-- Create bucket: "project-files" (public: false)
-- Policy: Allow authenticated users to upload/read/delete
