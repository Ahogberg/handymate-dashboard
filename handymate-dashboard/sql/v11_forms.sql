-- V11 Formulär & Checklistor (utökade fälttyper)
-- Kör manuellt i Supabase SQL Editor
-- =============================================================================

-- 1. FORM_TEMPLATES — Formulärmallar med rika fälttyper
-- =============================================================================
CREATE TABLE IF NOT EXISTS form_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT,                -- NULL = systemmallar
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                   -- 'egenkontroll', 'safety', 'inspection', 'custom'
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields: [{ id, type: 'checkbox'|'text'|'photo'|'signature'|'header', label, required, description }]
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_templates_business ON form_templates(business_id);

ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_templates_all" ON form_templates;
CREATE POLICY "form_templates_all" ON form_templates FOR ALL USING (true) WITH CHECK (true);

-- 2. FORM_SUBMISSIONS — Ifyllda formulär (kopplat till projekt)
-- =============================================================================
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  project_id TEXT,
  template_id TEXT REFERENCES form_templates(id),
  name TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  -- fields: samma struktur som template men med value/checked/photo_url/signature_data
  answers JSONB NOT NULL DEFAULT '{}',
  -- answers: { [fieldId]: { value, checked, photo_url, signature_data } }
  status TEXT DEFAULT 'draft',     -- 'draft' | 'completed' | 'signed'
  completed_at TIMESTAMPTZ,
  completed_by TEXT,               -- business_user_id
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signature_data TEXT,             -- base64 signatur
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_form_submissions_business ON form_submissions(business_id);
CREATE INDEX IF NOT EXISTS idx_form_submissions_project ON form_submissions(project_id);

ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "form_submissions_all" ON form_submissions;
CREATE POLICY "form_submissions_all" ON form_submissions FOR ALL USING (true) WITH CHECK (true);
