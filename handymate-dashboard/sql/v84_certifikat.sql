-- v84: Certifikat/behörigheter per teammedlem (tasks/resurs-masterplan.md, R3).
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- Differentieraren mot Easoft (som har noll certifikatstöd, se planfilen
-- "Interna fynd som styr"). Fritext cert_type medvetet — ingen kuraterad
-- katalog i denna sprint (Heta arbeten / Elbehörighet B / Liftkort m.fl.
-- varierar för mycket mellan branscher för att låsa till en enum nu).
--
-- ID-mönster: matchar service_agreement.sql/sms_campaign-familjen — TEXT
-- PRIMARY KEY, appen genererar id ('cert_' + Date.now() + random, se
-- app/api/team/certificates/route.ts), INGEN DB-default. business_users.id
-- använder gen_random_uuid()::TEXT-default men det mönstret hör till en
-- äldre generation tabeller (business_users.sql) — nyare tabeller
-- (service_agreement, sms_campaign, pending_approvals) låter appen äga
-- id-genereringen, vilket vi följer här för konsekvens med R3-appkoden.
--
-- RLS-mönstret matchar v74_serviceavtal.sql (färskaste CREATE TABLE-
-- migrationen med RLS i repot): service_role FOR ALL (defense-in-depth,
-- API:erna använder ändå getServerSupabase()/service-role och bypassar RLS)
-- + en business-scopad user-policy via business_config.user_id = auth.uid().
-- Samma medvetna begränsning som v74/v77: detta är en grov backstop för
-- eventuella framtida klient-direkta queries mot tabellen, inte den
-- faktiska behörighetsgränsen (owner/admin-skriv-gaten sitter i
-- app/api/team/certificates/route.ts, inte i RLS-policyn).

CREATE TABLE IF NOT EXISTS employee_certificate (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_user_id TEXT NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,

  cert_type TEXT NOT NULL,          -- fritext: "Heta arbeten", "Elbehörighet B", "Liftkort" ...
  cert_number TEXT,
  issued_date DATE,
  valid_until DATE,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_certificate_business_user
  ON employee_certificate(business_id, business_user_id);

CREATE INDEX IF NOT EXISTS idx_employee_certificate_valid_until
  ON employee_certificate(valid_until);

ALTER TABLE employee_certificate ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_employee_certificate' AND tablename = 'employee_certificate') THEN
    CREATE POLICY service_employee_certificate ON employee_certificate FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_employee_certificate' AND tablename = 'employee_certificate') THEN
    CREATE POLICY user_employee_certificate ON employee_certificate
      FOR ALL USING (
        business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- ─────────────────────────────────────────────────────────────────

SELECT COUNT(*) AS employee_certificates FROM employee_certificate;

-- ROLLBACK (manuellt om behövs):
-- DROP TABLE IF EXISTS employee_certificate;
