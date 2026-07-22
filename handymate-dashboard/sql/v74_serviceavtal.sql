-- v74: Serviceavtal-motorn (Motor 2, Etapp 1) — katalog + avtal + bokningskoppling.
-- Kör manuellt i Supabase SQL Editor. Idempotent (IF NOT EXISTS överallt).
--
-- Tre-lagers-designen (tasks/motor2-serviceavtal-spec.md):
--   Lager 1 (denna migration): service_agreement_type = kuraterad avtalskatalog
--   per bransch, seedas av lib/agreement-type-defaults.ts. service_agreement =
--   ett tecknat avtal per kund, med FRUSNA prisrader (price_items) — ändras
--   katalogposten senare påverkas inte redan tecknade avtal (snapshot-princip,
--   samma som quote_templates→quotes).
--   Lager 2/3 (senare etapper): AI-matchning + katalogväxt — byggs INTE här.
--
-- booking.agreement_id kopplar en serie-bokning (kind='service') till sitt
-- avtal. Lars-cronen (app/api/cron/service-bookings) skapar dessa autonomt;
-- Karins besök→faktura-hook (lib/agreements/invoice-visit.ts) läser price_items
-- från avtalet via denna koppling.

-- ─────────────────────────────────────────────────────────────────
-- DEL 1: service_agreement_type (katalogen, per business)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_agreement_type (
  type_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,

  name TEXT NOT NULL,                    -- "Våtrumskontroll", "Värmepumpsservice"
  description TEXT,                      -- kundvänlig beskrivning (används i erbjudande-SMS)
  interval_months INTEGER NOT NULL,
  visit_duration_min INTEGER NOT NULL DEFAULT 60,
  price_items JSONB NOT NULL,            -- radmall — fryses in i service_agreement.price_items vid tecknande
  match_keys TEXT[],                     -- jobbtyper/nyckelord för framtida AI-matchning (Etapp 2)
  is_active BOOLEAN NOT NULL DEFAULT true,
  seeded BOOLEAN NOT NULL DEFAULT false, -- true = kom från lib/agreement-type-defaults.ts (branschkatalogen)

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_agreement_type_business
  ON service_agreement_type(business_id, is_active);

ALTER TABLE service_agreement_type ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_service_agreement_type' AND tablename = 'service_agreement_type') THEN
    CREATE POLICY service_service_agreement_type ON service_agreement_type FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_service_agreement_type' AND tablename = 'service_agreement_type') THEN
    CREATE POLICY user_service_agreement_type ON service_agreement_type
      FOR ALL USING (
        business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- DEL 2: service_agreement (tecknade avtal per kund)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_agreement (
  agreement_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,

  title TEXT NOT NULL,                   -- "Årlig värmepumpsservice"
  job_type TEXT,                         -- grupperingsnyckel (JOB_LIFECYCLE-liknande, för framtida matchning)
  interval_months INTEGER NOT NULL,
  visit_duration_min INTEGER NOT NULL DEFAULT 60,
  price_items JSONB NOT NULL,            -- FRUSNA fakturarader vid tecknande — snapshot-princip
  rot_rut_type TEXT,                     -- 'rot' | 'rut' | null — dominerande typ för avtalet (radnivå styr faktiskt avdrag)

  next_visit_at TIMESTAMPTZ,             -- seriedriftens motor (nurture-mönstret) — Lars-cronen läser/skriver detta
  status TEXT NOT NULL DEFAULT 'active', -- active | paused | cancelled

  created_from_project_id TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE service_agreement
  DROP CONSTRAINT IF EXISTS service_agreement_status_check;

ALTER TABLE service_agreement
  ADD CONSTRAINT service_agreement_status_check
  CHECK (status IN ('active', 'paused', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_service_agreement_business_status_nextvisit
  ON service_agreement(business_id, status, next_visit_at);

CREATE INDEX IF NOT EXISTS idx_service_agreement_customer
  ON service_agreement(business_id, customer_id);

ALTER TABLE service_agreement ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_service_agreement' AND tablename = 'service_agreement') THEN
    CREATE POLICY service_service_agreement ON service_agreement FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_service_agreement' AND tablename = 'service_agreement') THEN
    CREATE POLICY user_service_agreement ON service_agreement
      FOR ALL USING (
        business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- DEL 3: booking.agreement_id — seriekoppling
-- Ingen FK-constraint (samma konvention som booking.customer_id/project_id
-- i övrigt: TEXT-koppling utan hård FK, se v51). ON DELETE SET NULL hade
-- krävt FK; vi håller oss till mönstret i denna kodbas (mjuk koppling).
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS agreement_id TEXT;

CREATE INDEX IF NOT EXISTS idx_booking_agreement
  ON booking(agreement_id)
  WHERE agreement_id IS NOT NULL;

COMMENT ON COLUMN booking.agreement_id IS
  'Länk till service_agreement om bokningen är ett automatiskt schemalagt serviceavtalsbesök (kind=service). NULL = ej avtalskopplad bokning.';

-- ─────────────────────────────────────────────────────────────────
-- DEL 4: invoice.booking_id — dedup-nyckel för Karins besök→faktura-hook
-- (lib/agreements/invoice-visit.ts). En faktura per booking_id.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS booking_id TEXT;

CREATE INDEX IF NOT EXISTS idx_invoice_booking
  ON invoice(booking_id)
  WHERE booking_id IS NOT NULL;

COMMENT ON COLUMN invoice.booking_id IS
  'Länk till booking om fakturan skapades från ett serviceavtalsbesök. Dedup-nyckel: en faktura per booking_id (se lib/agreements/invoice-visit.ts).';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM service_agreement_type) AS agreement_types,
  (SELECT COUNT(*) FROM service_agreement) AS agreements,
  (SELECT COUNT(*) FROM booking WHERE agreement_id IS NOT NULL) AS agreement_bookings,
  (SELECT COUNT(*) FROM invoice WHERE booking_id IS NOT NULL) AS agreement_invoices;

-- ROLLBACK (manuellt om behövs):
-- DROP TABLE IF EXISTS service_agreement;
-- DROP TABLE IF EXISTS service_agreement_type;
-- ALTER TABLE booking DROP COLUMN IF EXISTS agreement_id;
-- ALTER TABLE invoice DROP COLUMN IF EXISTS booking_id;
