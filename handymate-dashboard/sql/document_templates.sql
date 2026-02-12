-- ============================================
-- Document Library & Template Engine
-- ============================================

-- Mallkategorier
CREATE TABLE IF NOT EXISTS template_category (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT DEFAULT 'FileText',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dokumentmallar
CREATE TABLE IF NOT EXISTS document_template (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT, -- NULL = systemmall
  category_id TEXT REFERENCES template_category(id),
  name TEXT NOT NULL,
  description TEXT,
  content JSONB NOT NULL DEFAULT '[]', -- Array av sektioner
  variables JSONB NOT NULL DEFAULT '[]', -- Variabler som behövs
  branch TEXT, -- Vilken bransch (elektriker, vvs, etc.)
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_template_business ON document_template(business_id);
CREATE INDEX IF NOT EXISTS idx_document_template_category ON document_template(category_id);

-- Genererade dokument
CREATE TABLE IF NOT EXISTS generated_document (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  template_id TEXT REFERENCES document_template(id),
  project_id TEXT,
  customer_id TEXT,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '[]', -- Ifyllt innehåll
  variables_data JSONB DEFAULT '{}', -- Sparade variabelvärden
  status TEXT DEFAULT 'draft', -- draft, completed, signed
  signed_at TIMESTAMPTZ,
  signed_by_name TEXT,
  signed_by_ip TEXT,
  signature_data TEXT, -- Base64 canvas
  customer_signature TEXT, -- Kundens signatur
  customer_signed_name TEXT,
  customer_signed_at TIMESTAMPTZ,
  notes TEXT,
  pdf_url TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_document_business ON generated_document(business_id);
CREATE INDEX IF NOT EXISTS idx_generated_document_project ON generated_document(project_id);
CREATE INDEX IF NOT EXISTS idx_generated_document_customer ON generated_document(customer_id);
CREATE INDEX IF NOT EXISTS idx_generated_document_template ON generated_document(template_id);

-- RLS Policies
ALTER TABLE template_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_document ENABLE ROW LEVEL SECURITY;

-- template_category: alla kan läsa
CREATE POLICY "Anyone can read categories" ON template_category FOR SELECT USING (true);

-- document_template: läs systemmallar + egna
CREATE POLICY "Read system and own templates" ON document_template FOR SELECT
  USING (is_system = true OR business_id IS NULL OR business_id = current_setting('app.business_id', true));

CREATE POLICY "Manage own templates" ON document_template FOR ALL
  USING (business_id = current_setting('app.business_id', true));

-- generated_document: bara egna
CREATE POLICY "Manage own documents" ON generated_document FOR ALL
  USING (business_id = current_setting('app.business_id', true));

-- ============================================
-- Seed: Kategorier
-- ============================================
INSERT INTO template_category (id, name, slug, description, icon, sort_order) VALUES
  ('cat_work_order', 'Arbetsorder', 'work-order', 'Arbetsorder och jobbspecifikationer', 'ClipboardList', 1),
  ('cat_inspection', 'Besiktning', 'inspection', 'Besiktningsprotokoll och kontroller', 'ClipboardCheck', 2),
  ('cat_certificate', 'Intyg & Certifikat', 'certificate', 'Intyg, certifikat och garantier', 'Award', 3),
  ('cat_safety', 'Arbetsmiljö & Säkerhet', 'safety', 'Skyddsronder och riskbedömningar', 'ShieldCheck', 4),
  ('cat_handover', 'Överlämning', 'handover', 'Överlämningsdokument och slutbesiktning', 'FileCheck', 5),
  ('cat_agreement', 'Avtal', 'agreement', 'Kontrakt och överenskommelser', 'FileSignature', 6),
  ('cat_other', 'Övrigt', 'other', 'Övriga dokument', 'File', 7)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Seed: Systemmallar
-- ============================================

-- 1. Arbetsorder (generell)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_work_order', NULL, 'cat_work_order', 'Arbetsorder', 'Standard arbetsorder för alla branscher', NULL, true,
'[
  {"type":"header","text":"ARBETSORDER"},
  {"type":"field_row","fields":[
    {"label":"Ordernummer","variable":"order_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Företagsinformation","fields":[
    {"label":"Företag","variable":"business_name"},
    {"label":"Org.nr","variable":"business_org_number"},
    {"label":"Kontaktperson","variable":"business_contact"},
    {"label":"Telefon","variable":"business_phone"}
  ]},
  {"type":"section","title":"Kundinformation","fields":[
    {"label":"Kund","variable":"customer_name"},
    {"label":"Adress","variable":"customer_address"},
    {"label":"Telefon","variable":"customer_phone"},
    {"label":"E-post","variable":"customer_email"}
  ]},
  {"type":"section","title":"Uppdragsbeskrivning","fields":[
    {"label":"Beskrivning","variable":"work_description","type":"textarea"},
    {"label":"Plats","variable":"work_location"},
    {"label":"Startdatum","variable":"start_date"},
    {"label":"Beräknat slutdatum","variable":"end_date"}
  ]},
  {"type":"section","title":"Material","fields":[
    {"label":"Material som behövs","variable":"materials_needed","type":"textarea"}
  ]},
  {"type":"section","title":"Anteckningar","fields":[
    {"label":"Övrigt","variable":"notes","type":"textarea"}
  ]},
  {"type":"signatures","labels":["Uppdragsgivare","Utförare"]}
]'::JSONB,
'[
  {"key":"order_number","label":"Ordernummer","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"business_name","label":"Företagsnamn","source":"auto","auto_type":"business"},
  {"key":"business_org_number","label":"Org.nr","source":"auto","auto_type":"business"},
  {"key":"business_contact","label":"Kontaktperson","source":"auto","auto_type":"business"},
  {"key":"business_phone","label":"Telefon","source":"auto","auto_type":"business"},
  {"key":"customer_name","label":"Kundnamn","source":"auto","auto_type":"customer"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"customer_phone","label":"Telefon","source":"auto","auto_type":"customer"},
  {"key":"customer_email","label":"E-post","source":"auto","auto_type":"customer"},
  {"key":"work_description","label":"Beskrivning","source":"input","input_type":"textarea"},
  {"key":"work_location","label":"Plats","source":"input","input_type":"text"},
  {"key":"start_date","label":"Startdatum","source":"input","input_type":"date"},
  {"key":"end_date","label":"Beräknat slutdatum","source":"input","input_type":"date"},
  {"key":"materials_needed","label":"Material","source":"input","input_type":"textarea"},
  {"key":"notes","label":"Anteckningar","source":"input","input_type":"textarea"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 2. Elinstallationsintyg (Elektriker)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_el_cert', NULL, 'cat_certificate', 'Elinstallationsintyg', 'Intyg för utförd elinstallation enligt ELSÄK-FS', 'electrician', true,
'[
  {"type":"header","text":"ELINSTALLATIONSINTYG"},
  {"type":"notice","text":"Enligt ELSÄK-FS 2017:3","style":"info"},
  {"type":"field_row","fields":[
    {"label":"Intyg nr","variable":"certificate_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Installationsföretag","fields":[
    {"label":"Företag","variable":"business_name"},
    {"label":"Org.nr","variable":"business_org_number"},
    {"label":"Auktorisation","variable":"el_authorization"},
    {"label":"Ansvarig installatör","variable":"installer_name"}
  ]},
  {"type":"section","title":"Anläggningsägare","fields":[
    {"label":"Namn","variable":"customer_name"},
    {"label":"Adress","variable":"customer_address"},
    {"label":"Fastighetsbeteckning","variable":"property_designation"}
  ]},
  {"type":"section","title":"Installationsuppgifter","fields":[
    {"label":"Typ av installation","variable":"installation_type"},
    {"label":"Beskrivning av utfört arbete","variable":"work_description","type":"textarea"},
    {"label":"Spänningssystem","variable":"voltage_system"},
    {"label":"Huvudsäkring","variable":"main_fuse"},
    {"label":"Antal nya grupper","variable":"new_groups"}
  ]},
  {"type":"section","title":"Kontroll och provning","fields":[
    {"label":"Isolationsmätning utförd","variable":"insulation_test","type":"checkbox"},
    {"label":"Skyddsjordmätning utförd","variable":"earth_test","type":"checkbox"},
    {"label":"Funktionsprovning utförd","variable":"function_test","type":"checkbox"},
    {"label":"Jordfelsbrytare provad","variable":"rcd_test","type":"checkbox"},
    {"label":"Mätvärden","variable":"measurements","type":"textarea"}
  ]},
  {"type":"section","title":"Bedömning","fields":[
    {"label":"Installationen bedöms vara säker att tas i bruk","variable":"safe_for_use","type":"checkbox"},
    {"label":"Anmärkningar","variable":"remarks","type":"textarea"}
  ]},
  {"type":"signatures","labels":["Ansvarig installatör","Anläggningsägare"]}
]'::JSONB,
'[
  {"key":"certificate_number","label":"Intyg nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"business_name","label":"Företag","source":"auto","auto_type":"business"},
  {"key":"business_org_number","label":"Org.nr","source":"auto","auto_type":"business"},
  {"key":"el_authorization","label":"Auktorisation","source":"input","input_type":"text"},
  {"key":"installer_name","label":"Ansvarig installatör","source":"auto","auto_type":"business"},
  {"key":"customer_name","label":"Kundnamn","source":"auto","auto_type":"customer"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"property_designation","label":"Fastighetsbeteckning","source":"auto","auto_type":"customer"},
  {"key":"installation_type","label":"Typ av installation","source":"input","input_type":"text"},
  {"key":"work_description","label":"Beskrivning","source":"input","input_type":"textarea"},
  {"key":"voltage_system","label":"Spänningssystem","source":"input","input_type":"text","default":"230/400V TN-C-S"},
  {"key":"main_fuse","label":"Huvudsäkring","source":"input","input_type":"text"},
  {"key":"new_groups","label":"Antal nya grupper","source":"input","input_type":"text"},
  {"key":"insulation_test","label":"Isolationsmätning","source":"input","input_type":"checkbox"},
  {"key":"earth_test","label":"Skyddsjordmätning","source":"input","input_type":"checkbox"},
  {"key":"function_test","label":"Funktionsprovning","source":"input","input_type":"checkbox"},
  {"key":"rcd_test","label":"Jordfelsbrytare provad","source":"input","input_type":"checkbox"},
  {"key":"measurements","label":"Mätvärden","source":"input","input_type":"textarea"},
  {"key":"safe_for_use","label":"Säker att tas i bruk","source":"input","input_type":"checkbox"},
  {"key":"remarks","label":"Anmärkningar","source":"input","input_type":"textarea"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 3. Egenkontroll el (Elektriker)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_el_inspection', NULL, 'cat_inspection', 'Egenkontroll El', 'Protokoll för egenkontroll av elinstallation', 'electrician', true,
'[
  {"type":"header","text":"EGENKONTROLL ELINSTALLATION"},
  {"type":"field_row","fields":[
    {"label":"Protokoll nr","variable":"protocol_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Objekt","fields":[
    {"label":"Adress","variable":"customer_address"},
    {"label":"Fastighetsbeteckning","variable":"property_designation"},
    {"label":"Beskrivning","variable":"work_description","type":"textarea"}
  ]},
  {"type":"checklist","title":"Kontrollpunkter","items":[
    {"text":"Kabelförläggning korrekt","variable":"check_cables"},
    {"text":"Kopplingsplintar åtdragna","variable":"check_connections"},
    {"text":"Kapslingsklass uppfylld","variable":"check_ip_class"},
    {"text":"Märkning utförd","variable":"check_labeling"},
    {"text":"Isolationsmotstånd OK","variable":"check_insulation"},
    {"text":"Skyddsjord OK","variable":"check_earth"},
    {"text":"Kortslutningsström kontrollerad","variable":"check_short_circuit"},
    {"text":"Jordfelsbrytare funktionstestad","variable":"check_rcd"},
    {"text":"Selektivitet kontrollerad","variable":"check_selectivity"},
    {"text":"Dokumentation uppdaterad","variable":"check_documentation"}
  ]},
  {"type":"section","title":"Mätvärden","fields":[
    {"label":"Isolationsmotstånd (MΩ)","variable":"insulation_value"},
    {"label":"Skyddsjord (Ω)","variable":"earth_value"},
    {"label":"Jordfelsbrytare löser (ms)","variable":"rcd_trip_time"},
    {"label":"Kortslutningsström (kA)","variable":"short_circuit_value"}
  ]},
  {"type":"section","title":"Resultat","fields":[
    {"label":"Godkänd","variable":"approved","type":"checkbox"},
    {"label":"Anmärkningar","variable":"remarks","type":"textarea"}
  ]},
  {"type":"signatures","labels":["Kontrollerande installatör"]}
]'::JSONB,
'[
  {"key":"protocol_number","label":"Protokoll nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"property_designation","label":"Fastighetsbeteckning","source":"auto","auto_type":"customer"},
  {"key":"work_description","label":"Beskrivning","source":"input","input_type":"textarea"},
  {"key":"check_cables","label":"Kabelförläggning","source":"input","input_type":"checkbox"},
  {"key":"check_connections","label":"Kopplingsplintar","source":"input","input_type":"checkbox"},
  {"key":"check_ip_class","label":"Kapslingsklass","source":"input","input_type":"checkbox"},
  {"key":"check_labeling","label":"Märkning","source":"input","input_type":"checkbox"},
  {"key":"check_insulation","label":"Isolationsmotstånd","source":"input","input_type":"checkbox"},
  {"key":"check_earth","label":"Skyddsjord","source":"input","input_type":"checkbox"},
  {"key":"check_short_circuit","label":"Kortslutningsström","source":"input","input_type":"checkbox"},
  {"key":"check_rcd","label":"Jordfelsbrytare","source":"input","input_type":"checkbox"},
  {"key":"check_selectivity","label":"Selektivitet","source":"input","input_type":"checkbox"},
  {"key":"check_documentation","label":"Dokumentation","source":"input","input_type":"checkbox"},
  {"key":"insulation_value","label":"Isolationsmotstånd (MΩ)","source":"input","input_type":"text"},
  {"key":"earth_value","label":"Skyddsjord (Ω)","source":"input","input_type":"text"},
  {"key":"rcd_trip_time","label":"Löstid (ms)","source":"input","input_type":"text"},
  {"key":"short_circuit_value","label":"Kortslutningsström (kA)","source":"input","input_type":"text"},
  {"key":"approved","label":"Godkänd","source":"input","input_type":"checkbox"},
  {"key":"remarks","label":"Anmärkningar","source":"input","input_type":"textarea"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 4. Täthetsprovning VVS (Rörmokare)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_vvs_pressure', NULL, 'cat_inspection', 'Täthetsprovning VVS', 'Protokoll för täthetsprovning av rörinstallation', 'plumber', true,
'[
  {"type":"header","text":"TÄTHETSPROVNINGSPROTOKOLL"},
  {"type":"field_row","fields":[
    {"label":"Protokoll nr","variable":"protocol_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Objekt","fields":[
    {"label":"Adress","variable":"customer_address"},
    {"label":"Fastighetsbeteckning","variable":"property_designation"},
    {"label":"Kund","variable":"customer_name"}
  ]},
  {"type":"section","title":"Provning","fields":[
    {"label":"System","variable":"system_type"},
    {"label":"Rörmaterial","variable":"pipe_material"},
    {"label":"Dimension","variable":"pipe_dimension"},
    {"label":"Provtryck (bar)","variable":"test_pressure"},
    {"label":"Provtid (min)","variable":"test_duration"},
    {"label":"Tryck efter prov (bar)","variable":"pressure_after"},
    {"label":"Temperatur (°C)","variable":"temperature"},
    {"label":"Medium","variable":"test_medium"}
  ]},
  {"type":"section","title":"Resultat","fields":[
    {"label":"Godkänd - Inget tryckfall","variable":"approved","type":"checkbox"},
    {"label":"Anmärkningar","variable":"remarks","type":"textarea"}
  ]},
  {"type":"signatures","labels":["Provningsansvarig","Beställare"]}
]'::JSONB,
'[
  {"key":"protocol_number","label":"Protokoll nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"property_designation","label":"Fastighetsbeteckning","source":"auto","auto_type":"customer"},
  {"key":"customer_name","label":"Kund","source":"auto","auto_type":"customer"},
  {"key":"system_type","label":"System","source":"input","input_type":"select","options":["Tappvatten","Värme","Kyla","Avlopp","Sprinkler"]},
  {"key":"pipe_material","label":"Rörmaterial","source":"input","input_type":"select","options":["Koppar","PEX","PP","Stål","Rostfritt"]},
  {"key":"pipe_dimension","label":"Dimension","source":"input","input_type":"text"},
  {"key":"test_pressure","label":"Provtryck (bar)","source":"input","input_type":"text"},
  {"key":"test_duration","label":"Provtid (min)","source":"input","input_type":"text","default":"30"},
  {"key":"pressure_after","label":"Tryck efter prov (bar)","source":"input","input_type":"text"},
  {"key":"temperature","label":"Temperatur (°C)","source":"input","input_type":"text"},
  {"key":"test_medium","label":"Medium","source":"input","input_type":"select","options":["Vatten","Luft","Nitrogen"]},
  {"key":"approved","label":"Godkänd","source":"input","input_type":"checkbox"},
  {"key":"remarks","label":"Anmärkningar","source":"input","input_type":"textarea"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 5. Slutbesiktning (generell)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_final_inspection', NULL, 'cat_handover', 'Slutbesiktning', 'Protokoll för slutbesiktning av utfört arbete', NULL, true,
'[
  {"type":"header","text":"SLUTBESIKTNINGSPROTOKOLL"},
  {"type":"field_row","fields":[
    {"label":"Protokoll nr","variable":"protocol_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Projekt","fields":[
    {"label":"Projekt","variable":"project_name"},
    {"label":"Adress","variable":"customer_address"},
    {"label":"Beställare","variable":"customer_name"}
  ]},
  {"type":"section","title":"Entreprenör","fields":[
    {"label":"Företag","variable":"business_name"},
    {"label":"Kontaktperson","variable":"business_contact"},
    {"label":"Telefon","variable":"business_phone"}
  ]},
  {"type":"section","title":"Besiktning","fields":[
    {"label":"Typ av besiktning","variable":"inspection_type"},
    {"label":"Beskrivning av utfört arbete","variable":"work_description","type":"textarea"},
    {"label":"Avvikelser/anmärkningar","variable":"deviations","type":"textarea"},
    {"label":"Åtgärder","variable":"actions_needed","type":"textarea"}
  ]},
  {"type":"section","title":"Bedömning","fields":[
    {"label":"Arbetet godkänns","variable":"work_approved","type":"checkbox"},
    {"label":"Arbetet godkänns med anmärkning","variable":"work_approved_remarks","type":"checkbox"},
    {"label":"Arbetet underkänns","variable":"work_rejected","type":"checkbox"},
    {"label":"Garantitid","variable":"warranty_period"}
  ]},
  {"type":"signatures","labels":["Besiktningsman","Beställare","Entreprenör"]}
]'::JSONB,
'[
  {"key":"protocol_number","label":"Protokoll nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"project_name","label":"Projekt","source":"auto","auto_type":"project"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"customer_name","label":"Beställare","source":"auto","auto_type":"customer"},
  {"key":"business_name","label":"Företag","source":"auto","auto_type":"business"},
  {"key":"business_contact","label":"Kontaktperson","source":"auto","auto_type":"business"},
  {"key":"business_phone","label":"Telefon","source":"auto","auto_type":"business"},
  {"key":"inspection_type","label":"Typ","source":"input","input_type":"select","options":["Slutbesiktning","Förbesiktning","Garantibesiktning"]},
  {"key":"work_description","label":"Beskrivning","source":"input","input_type":"textarea"},
  {"key":"deviations","label":"Avvikelser","source":"input","input_type":"textarea"},
  {"key":"actions_needed","label":"Åtgärder","source":"input","input_type":"textarea"},
  {"key":"work_approved","label":"Godkänd","source":"input","input_type":"checkbox"},
  {"key":"work_approved_remarks","label":"Godkänd med anmärkning","source":"input","input_type":"checkbox"},
  {"key":"work_rejected","label":"Underkänd","source":"input","input_type":"checkbox"},
  {"key":"warranty_period","label":"Garantitid","source":"input","input_type":"text","default":"2 år"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 6. Överlämningsdokument (generell)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_handover', NULL, 'cat_handover', 'Överlämningsdokument', 'Dokument för överlämning av avslutat projekt', NULL, true,
'[
  {"type":"header","text":"ÖVERLÄMNINGSDOKUMENT"},
  {"type":"field_row","fields":[
    {"label":"Dokument nr","variable":"document_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Projekt","fields":[
    {"label":"Projektnamn","variable":"project_name"},
    {"label":"Adress","variable":"customer_address"},
    {"label":"Beställare","variable":"customer_name"}
  ]},
  {"type":"section","title":"Utförare","fields":[
    {"label":"Företag","variable":"business_name"},
    {"label":"Org.nr","variable":"business_org_number"},
    {"label":"Kontaktperson","variable":"business_contact"}
  ]},
  {"type":"section","title":"Utfört arbete","fields":[
    {"label":"Beskrivning","variable":"work_description","type":"textarea"},
    {"label":"Utfört under period","variable":"work_period"},
    {"label":"Garantivillkor","variable":"warranty_terms","type":"textarea"},
    {"label":"Garantitid","variable":"warranty_period"}
  ]},
  {"type":"section","title":"Överlämnade handlingar","fields":[
    {"label":"Ritningar","variable":"has_drawings","type":"checkbox"},
    {"label":"Bruksanvisningar","variable":"has_manuals","type":"checkbox"},
    {"label":"Intyg/certifikat","variable":"has_certificates","type":"checkbox"},
    {"label":"Foton","variable":"has_photos","type":"checkbox"},
    {"label":"Serviceavtal","variable":"has_service_agreement","type":"checkbox"},
    {"label":"Övriga handlingar","variable":"other_documents","type":"textarea"}
  ]},
  {"type":"section","title":"Skick och anmärkningar","fields":[
    {"label":"Städning utförd","variable":"cleaned","type":"checkbox"},
    {"label":"Anmärkningar","variable":"remarks","type":"textarea"}
  ]},
  {"type":"signatures","labels":["Överlämnad av","Mottagen av"]}
]'::JSONB,
'[
  {"key":"document_number","label":"Dokument nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"project_name","label":"Projekt","source":"auto","auto_type":"project"},
  {"key":"customer_address","label":"Adress","source":"auto","auto_type":"customer"},
  {"key":"customer_name","label":"Beställare","source":"auto","auto_type":"customer"},
  {"key":"business_name","label":"Företag","source":"auto","auto_type":"business"},
  {"key":"business_org_number","label":"Org.nr","source":"auto","auto_type":"business"},
  {"key":"business_contact","label":"Kontaktperson","source":"auto","auto_type":"business"},
  {"key":"work_description","label":"Beskrivning","source":"input","input_type":"textarea"},
  {"key":"work_period","label":"Period","source":"input","input_type":"text"},
  {"key":"warranty_terms","label":"Garantivillkor","source":"input","input_type":"textarea","default":"Garanti enligt konsumenttjänstlagen."},
  {"key":"warranty_period","label":"Garantitid","source":"input","input_type":"text","default":"2 år"},
  {"key":"has_drawings","label":"Ritningar","source":"input","input_type":"checkbox"},
  {"key":"has_manuals","label":"Bruksanvisningar","source":"input","input_type":"checkbox"},
  {"key":"has_certificates","label":"Intyg/certifikat","source":"input","input_type":"checkbox"},
  {"key":"has_photos","label":"Foton","source":"input","input_type":"checkbox"},
  {"key":"has_service_agreement","label":"Serviceavtal","source":"input","input_type":"checkbox"},
  {"key":"other_documents","label":"Övriga handlingar","source":"input","input_type":"textarea"},
  {"key":"cleaned","label":"Städning utförd","source":"input","input_type":"checkbox"},
  {"key":"remarks","label":"Anmärkningar","source":"input","input_type":"textarea"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;

-- 7. Riskbedömning (generell)
INSERT INTO document_template (id, business_id, category_id, name, description, branch, is_system, content, variables) VALUES
('tpl_risk_assessment', NULL, 'cat_safety', 'Riskbedömning', 'Riskbedömning och skyddsrond', NULL, true,
'[
  {"type":"header","text":"RISKBEDÖMNING"},
  {"type":"field_row","fields":[
    {"label":"Protokoll nr","variable":"protocol_number"},
    {"label":"Datum","variable":"date"}
  ]},
  {"type":"section","title":"Arbetsplats","fields":[
    {"label":"Plats","variable":"work_location"},
    {"label":"Projekt","variable":"project_name"},
    {"label":"Beställare","variable":"customer_name"}
  ]},
  {"type":"checklist","title":"Identifierade risker","items":[
    {"text":"Fall från höjd","variable":"risk_fall"},
    {"text":"Elektrisk fara","variable":"risk_electric"},
    {"text":"Buller","variable":"risk_noise"},
    {"text":"Damm/partiklar","variable":"risk_dust"},
    {"text":"Kemikalier","variable":"risk_chemicals"},
    {"text":"Tunga lyft","variable":"risk_heavy_lifting"},
    {"text":"Vibrerande verktyg","variable":"risk_vibration"},
    {"text":"Trafik","variable":"risk_traffic"},
    {"text":"Asbest","variable":"risk_asbestos"},
    {"text":"Heta arbeten","variable":"risk_hot_work"}
  ]},
  {"type":"section","title":"Åtgärder","fields":[
    {"label":"Skyddsåtgärder","variable":"safety_measures","type":"textarea"},
    {"label":"Skyddsutrustning","variable":"ppe_required","type":"textarea"},
    {"label":"Ansvarig för säkerhet","variable":"safety_responsible"}
  ]},
  {"type":"signatures","labels":["Ansvarig","Medarbetare"]}
]'::JSONB,
'[
  {"key":"protocol_number","label":"Protokoll nr","source":"auto","auto_type":"system"},
  {"key":"date","label":"Datum","source":"auto","auto_type":"system"},
  {"key":"work_location","label":"Plats","source":"input","input_type":"text"},
  {"key":"project_name","label":"Projekt","source":"auto","auto_type":"project"},
  {"key":"customer_name","label":"Beställare","source":"auto","auto_type":"customer"},
  {"key":"risk_fall","label":"Fall","source":"input","input_type":"checkbox"},
  {"key":"risk_electric","label":"El","source":"input","input_type":"checkbox"},
  {"key":"risk_noise","label":"Buller","source":"input","input_type":"checkbox"},
  {"key":"risk_dust","label":"Damm","source":"input","input_type":"checkbox"},
  {"key":"risk_chemicals","label":"Kemikalier","source":"input","input_type":"checkbox"},
  {"key":"risk_heavy_lifting","label":"Tunga lyft","source":"input","input_type":"checkbox"},
  {"key":"risk_vibration","label":"Vibration","source":"input","input_type":"checkbox"},
  {"key":"risk_traffic","label":"Trafik","source":"input","input_type":"checkbox"},
  {"key":"risk_asbestos","label":"Asbest","source":"input","input_type":"checkbox"},
  {"key":"risk_hot_work","label":"Heta arbeten","source":"input","input_type":"checkbox"},
  {"key":"safety_measures","label":"Skyddsåtgärder","source":"input","input_type":"textarea"},
  {"key":"ppe_required","label":"Skyddsutrustning","source":"input","input_type":"textarea","default":"Hjälm, skyddsglasögon, skyddsskor, handskar"},
  {"key":"safety_responsible","label":"Ansvarig","source":"input","input_type":"text"}
]'::JSONB)
ON CONFLICT (id) DO NOTHING;
