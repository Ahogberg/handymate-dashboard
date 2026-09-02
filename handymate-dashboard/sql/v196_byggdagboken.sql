-- v196: Byggdagboken — ÄTA-koppling, attest, låsning + revisionshistorik
-- (Etapp D2, ÄTA + byggdagbok-omtaget, 2026-09-02)
--
-- KÖRS MANUELLT i Supabase SQL Editor, EFTER Etapp A–C (ÄTA backend+desktop)
-- är pushat. Dagboks-GET:en (Etapp D4) SELECT:ar ata_change_id/locked_at/
-- attested_at redan i sin FÖRSTA commit — utan den här migrationen 42703:ar
-- den hela vägen. Se sql/v195_ata_dokumentet.sql för föregående steg.
--
-- ═══ VARFÖR ═══
--
-- project_log är i LIVE-schemat redan bredare än sql/rot_rut_documents.sql
-- DEL 4 beskriver (verifierat i prod: id, business_id, order_id, date,
-- weather, temperature, description, work_performed, issues, workers_count,
-- hours_worked, materials_used, photos, created_at, updated_at,
-- signed_by_customer, customer_signed_at) — den filen beskriver ett
-- föråldrat schema och rättas i en separat etapp (D1). Den här migrationen
-- lägger BARA till de fem kolumner byggdagboken saknar för att bevisa sitt
-- värde vid en tvist: vilken ÄTA raden hör till, vem som attesterat den och
-- när, om den är låst, och en tilläggsanteckning som kan läggas till utan
-- att röra originaltexten.
--
-- Låsregeln i sig är BERÄKNAD (se lib/diary/locking.ts, DIARY_LOCK_AFTER_DAYS
-- = 7): en rad är låst när locked_at eller attested_at är satt, eller när
-- date är äldre än sju dagar. locked_at/attested_at här är bara de två
-- MANUELLA/HÄNDELSEDRIVNA ingångarna till den regeln — åldersgränsen kräver
-- ingen kolumn, den räknas fram vid varje läsning.
--
-- project_log_revision är en append-only historik i samma anda som
-- Compliance-underlagets revisionslogg: log_id har MEDVETET ingen FK — raden
-- i project_log kan tas bort (t.ex. GDPR-radering av ett helt projekt), men
-- historiken om VAD som begärdes och VEM som gjorde det ska bestå.
--
-- ═══ KOLLA FÖRST ═══
--   ls sql | grep v19    -- v196 ska vara ledigt

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project_log') IS NULL THEN
    RAISE EXCEPTION 'v196 kräver att project_log redan finns (sql/rot_rut_documents.sql DEL 4)';
  END IF;
  IF to_regclass('public.business_config') IS NULL
     OR to_regclass('public.business_users') IS NULL THEN
    RAISE EXCEPTION 'v196 kräver business_config och business_users';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. project_log — fem nya kolumner, en ADD COLUMN-sats per kolumn
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE project_log ADD COLUMN IF NOT EXISTS ata_change_id TEXT;
ALTER TABLE project_log ADD COLUMN IF NOT EXISTS attested_by_user_id TEXT REFERENCES business_users(id) ON DELETE SET NULL;
ALTER TABLE project_log ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ;
ALTER TABLE project_log ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE project_log ADD COLUMN IF NOT EXISTS addendum TEXT;

-- signed_by_customer/customer_signed_at (redan i live-schemat) rörs INTE —
-- kundsignering av dagboksraden är en annan sak än den interna attesten och
-- har ingen väg i UI ännu (spår framåt, inte den här sprinten).

CREATE INDEX IF NOT EXISTS idx_project_log_order_date ON project_log(order_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_project_log_ata ON project_log(ata_change_id) WHERE ata_change_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. project_log_revision — append-only historik per dagboksrad
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS project_log_revision (
  id TEXT PRIMARY KEY DEFAULT 'plr_' || md5(random()::text || clock_timestamp()::text),

  -- MEDVETET ingen FK mot project_log: raden kan raderas (GDPR/rensning),
  -- historiken om att den funnits och vad som hände med den ska bestå.
  log_id TEXT NOT NULL,

  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,

  changed_by_user_id TEXT REFERENCES business_users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),

  action TEXT NOT NULL CHECK (action IN (
    'create', 'update', 'attest', 'unlock', 'addendum',
    'photo_add', 'photo_remove', 'delete'
  )),

  before JSONB,
  after JSONB
);

CREATE INDEX IF NOT EXISTS idx_project_log_revision_log
  ON project_log_revision(business_id, log_id, changed_at DESC);

-- RLS enligt v101-mönstret (sql/v101_tenant_rls_projektdomanen.sql): exakt
-- två policyer, tenant-medlemmen via is_business_member och service_role.
ALTER TABLE project_log_revision ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_log_revision_tenant_member ON public.project_log_revision;
CREATE POLICY project_log_revision_tenant_member
  ON public.project_log_revision FOR ALL TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS project_log_revision_service_role ON public.project_log_revision;
CREATE POLICY project_log_revision_service_role
  ON public.project_log_revision FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.project_log_revision FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_log_revision TO authenticated;
GRANT ALL ON TABLE public.project_log_revision TO service_role;

COMMIT;

-- ═══ VERIFIERING EFTER KÖRNING ═══

-- 1. De fem nya kolumnerna på project_log finns med rätt typ.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'project_log'
  AND column_name IN ('ata_change_id', 'attested_by_user_id', 'attested_at', 'locked_at', 'addendum')
ORDER BY column_name;

-- 2. Index finns.
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'project_log'
  AND indexname IN ('idx_project_log_order_date', 'idx_project_log_ata');

-- 3. project_log_revision-tabellen och dess index.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'project_log_revision'
ORDER BY ordinal_position;

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'project_log_revision';

-- 4. RLS-policyerna — exakt två, samma form som v101.
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'project_log_revision'
ORDER BY policyname;
