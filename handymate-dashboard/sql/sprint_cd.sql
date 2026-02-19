-- Sprint C+D migrations
-- C1: Customer tags & segmentation
-- C3: Duplicate detection
-- C4: Warranty tracking
-- D5: Subcontractor module

-- ============================================
-- C1: Customer Tags
-- ============================================
CREATE TABLE IF NOT EXISTS customer_tag (
  tag_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1', -- hex color for display
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, name)
);

CREATE TABLE IF NOT EXISTS customer_tag_assignment (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES customer_tag(tag_id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tag_business ON customer_tag(business_id);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignment_customer ON customer_tag_assignment(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tag_assignment_tag ON customer_tag_assignment(tag_id);

-- ============================================
-- C4: Warranty Tracking
-- ============================================
CREATE TABLE IF NOT EXISTS warranty (
  warranty_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customer(customer_id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES booking(booking_id),
  invoice_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'claimed', 'voided')),
  warranty_type TEXT DEFAULT 'standard' CHECK (warranty_type IN ('standard', 'extended', 'manufacturer', 'custom')),
  terms TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_business ON warranty(business_id);
CREATE INDEX IF NOT EXISTS idx_warranty_customer ON warranty(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranty_end_date ON warranty(end_date);

-- ============================================
-- C5: Email Templates
-- ============================================
CREATE TABLE IF NOT EXISTS email_template (
  template_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'invoice', 'quote', 'booking', 'reminder', 'follow_up', 'warranty')),
  variables JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_template_business ON email_template(business_id);

-- ============================================
-- D5: Subcontractor Module
-- ============================================
CREATE TABLE IF NOT EXISTS subcontractor (
  subcontractor_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company_name TEXT,
  org_number TEXT,
  phone_number TEXT,
  email TEXT,
  specialization TEXT,
  hourly_rate NUMERIC(10,2),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subcontractor_assignment (
  assignment_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subcontractor_id TEXT NOT NULL REFERENCES subcontractor(subcontractor_id) ON DELETE CASCADE,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES booking(booking_id),
  project_id TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  agreed_rate NUMERIC(10,2),
  total_amount NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcontractor_business ON subcontractor(business_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_assignment_business ON subcontractor_assignment(business_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_assignment_sub ON subcontractor_assignment(subcontractor_id);
