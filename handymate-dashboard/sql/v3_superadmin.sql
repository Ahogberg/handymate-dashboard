-- ============================================================
-- v3 — Superadmin-impersonation för Handymate-utvecklare
--
-- Tillåter utvecklare (Andreas idag, ev. teammedlemmar senare) att
-- "logga in som" valfri business för att felsöka utan att kontakta kunden.
--
-- Säkerhet:
-- - is_superadmin lagras i auth.users.app_metadata (kan ENDAST sättas
--   via service_role, INTE via UI eller anon-key — Supabase säkerhet)
-- - Varje impersonation loggas i admin_impersonation_log
-- - v1: READ-only effektivt (UI:t förbjuder skriv-actions när impersonated)
--
-- Kör manuellt i Supabase SQL Editor.
-- ============================================================

-- 1. Audit-tabell för impersonations
CREATE TABLE IF NOT EXISTS admin_impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  target_business_id TEXT NOT NULL,
  target_business_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    ELSE NULL END
  ) STORED,
  reason TEXT,
  -- IP/user-agent för forensik om sessionen läcker
  admin_ip TEXT,
  admin_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_imp_log_admin
  ON admin_impersonation_log(admin_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_imp_log_target
  ON admin_impersonation_log(target_business_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_imp_log_active
  ON admin_impersonation_log(admin_user_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE admin_impersonation_log IS
  'Audit-trail för superadmin-impersonation. En rad per start; ended_at sätts via /api/admin/end-impersonation eller efter 24h auto-expiry.';

-- 2. Sätt Andreas som superadmin (KÖR DETTA MANUELLT EFTER TABLE-CREATE)
--
-- Notera: app_metadata kan ENDAST modifieras med service_role-nyckel
-- (inte från frontend, inte med anon-key). Kör i Supabase SQL Editor:
--
--   UPDATE auth.users
--   SET raw_app_meta_data =
--     coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_superadmin": true}'::jsonb
--   WHERE email = 'andreas@byglo.se';
--
-- Verifiera:
--
--   SELECT email, raw_app_meta_data->'is_superadmin' AS is_superadmin
--   FROM auth.users
--   WHERE email = 'andreas@byglo.se';
--   -- → 1 rad: andreas@byglo.se | true

-- 3. Verifiering av table
--
--   SELECT table_name, column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'admin_impersonation_log'
--   ORDER BY ordinal_position;
