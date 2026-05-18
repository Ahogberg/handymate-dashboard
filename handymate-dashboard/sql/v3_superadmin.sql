-- ============================================================
-- v3 — Superadmin-impersonation för Handymate-utvecklare
--
-- Tillåter utvecklare (Andreas idag, ev. teammedlemmar senare) att
-- "logga in som" valfri business för att felsöka utan att kontakta kunden.
--
-- Två modes:
-- 1. READ-only (default, säkrast): hm_impersonate-cookie → server returnerar
--    target business via getAuthenticatedBusiness. Admin är fortfarande
--    sig själv i Supabase-sessionen.
-- 2. Magic-link (opt-in, full access): genererar one-time-token i
--    impersonation_tokens, verify-route logar in admin SOM target user via
--    Supabase Admin API magic-link.
--
-- Säkerhet:
-- - Admin-detection via lib/admin-auth.ts isAdmin() ELLER lib/auth/superadmin.ts
--   isSuperAdmin(): email @handymate.se / ADMIN_EMAILS env-var /
--   user.app_metadata.is_superadmin
-- - Audit-trail i admin_audit_log (befintlig tabell, generisk admin-aktioner)
-- - Magic-link-tokens har 5 min livslängd, single-use
-- - Cookie-livslängder: READ-only 24h, magic-link 2h
--
-- Kör manuellt i Supabase SQL Editor.
-- ============================================================

-- 1. impersonation_tokens — för magic-link-mode (Strategi 2)
-- Koden i app/api/admin/impersonate/[businessId]/route.ts har redan en
-- fallback om tabellen saknas, men för full magic-link-funktion krävs den.
CREATE TABLE IF NOT EXISTS impersonation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_business_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imp_tokens_token
  ON impersonation_tokens(token)
  WHERE used = FALSE;

CREATE INDEX IF NOT EXISTS idx_imp_tokens_admin
  ON impersonation_tokens(admin_user_id, created_at DESC);

COMMENT ON TABLE impersonation_tokens IS
  'One-time-tokens för magic-link-impersonation. Token byts mot Supabase magic-link i verify-route. 5 min livslängd, single-use.';

-- 2. admin_impersonation_log (VALFRI — v2-feature)
--
-- v1 använder befintlig admin_audit_log för impersonation-audit.
-- Denna tabell är förberedd för v2 där vi vill ha bättre detaljerad
-- impersonation-trail (computed duration, IP/UA, reason-fält).
--
-- Kör bara om du vill aktivera detaljerad audit-vy senare.
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
  mode TEXT,  -- 'read_only' eller 'magic_link'
  admin_ip TEXT,
  admin_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_imp_log_admin
  ON admin_impersonation_log(admin_user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_imp_log_target
  ON admin_impersonation_log(target_business_id, started_at DESC);

-- 3. Aktivera Andreas som admin
--
-- ENKELT alternativ: lägg till andreas@byglo.se i ADMIN_EMAILS env-var
-- i Vercel (production environment):
--
--   ADMIN_EMAILS=andreas@byglo.se
--
-- ALTERNATIVT: sätt is_superadmin i app_metadata (kräver service_role):
--
--   UPDATE auth.users
--   SET raw_app_meta_data =
--     coalesce(raw_app_meta_data, '{}'::jsonb) || '{"is_superadmin": true}'::jsonb
--   WHERE email = 'andreas@byglo.se';

-- 4. Verifiering
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('impersonation_tokens', 'admin_impersonation_log');
--   -- → 2 rader (om båda körts) eller 1 (om bara impersonation_tokens)
