-- ═══════════════════════════════════════════════════════════════════════════
-- v101 — v96:s RLS-mönster utsträckt till resten av projektdomänen
-- (2026-08-09, Project System Audit P0-1)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kräver att v96 redan är
-- körd — funktionen public.is_business_member återanvänds härifrån.
--
-- ═══ VARFÖR ═══
--
-- v96 härdade sex tabeller (project, project_change, project_material,
-- time_entry, supplier_invoices, business_config). Projektauditen listade
-- minst tolv till med villkorslöst öppna policyer — FOR ALL USING (true)
-- till PUBLIC — eller ingen RLS alls:
--
--   projects.sql:            project_milestone
--   business_users.sql:      business_users, project_assignment
--   ai_project_manager.sql:  project_ai_log
--   rot_rut_documents.sql:   project_document, project_log, project_checklist
--   new_tables.sql:          call_recording, ai_suggestion,
--                            supplier, supplier_product
--   (ingen RLS alls):        booking, project_cost
--
-- Det är samma felklass som just bet oss från andra hållet: klientsessionen
-- läste som anon i månader utan att någon märkte det — EFTERSOM tabellerna
-- var öppna. Nu när webbläsaren autentiserar på riktigt (lib/supabase.ts,
-- 2026-08-09) kan dörren stängas utan att någon yta går sönder: medlemmen
-- går genom policyn, alla andra stängs ute.
--
-- Mönstret är identiskt med v96: ersätt samtliga policyer med exakt två —
-- tenant-medlemmen (via is_business_member) och service_role. Idempotent;
-- kan köras om.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $rls_v101$
DECLARE
  target_table TEXT;
  policy_name TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'project_milestone',
    'project_assignment',
    'project_ai_log',
    'project_document',
    'project_log',
    'project_checklist',
    'project_cost',
    'booking',
    'call_recording',
    'ai_suggestion',
    'supplier',
    'supplier_product',
    'business_users'
  ]
  LOOP
    -- Tabeller som ännu inte finns i den här miljön hoppas över tyst —
    -- en disponibel testdatabas har inte nödvändigtvis alla.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = target_table
    ) THEN
      RAISE NOTICE 'v101: tabellen % finns inte här — hoppar över', target_table;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR policy_name IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id))',
      target_table || '_tenant_member',
      target_table
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      target_table || '_service_role',
      target_table
    );

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', target_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', target_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', target_table);
  END LOOP;
END
$rls_v101$;

-- business_users är specialfallet: is_business_member läser den, men
-- funktionen är SECURITY DEFINER (v96) och går därmed förbi RLS — ingen
-- rekursion. Medlemspolicyn ovan täcker läsning av kollegorna i samma
-- företag. Därtill: en användare ska alltid kunna se SIN EGEN rad, även om
-- raden är inaktiverad (is_active = false) — annars kan klienten inte ens
-- förklara för användaren varför inloggningen saknar företag.
DROP POLICY IF EXISTS business_users_own_row ON public.business_users;
CREATE POLICY business_users_own_row
  ON public.business_users
  FOR SELECT
  TO authenticated
  USING (user_id::TEXT = auth.uid()::TEXT);

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- 1. Policyerna: varje tabell ska ha exakt _tenant_member + _service_role
--    (business_users har därtill _own_row).
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'project_milestone', 'project_assignment', 'project_ai_log',
    'project_document', 'project_log', 'project_checklist', 'project_cost',
    'booking', 'call_recording', 'ai_suggestion',
    'supplier', 'supplier_product', 'business_users'
  )
ORDER BY tablename, policyname;

-- 2. Ögonkontroll i appen efteråt (inloggad som ägare OCH som anställd):
--    /dashboard/schema        — bokningar syns och går att flytta
--    /dashboard/inkorg        — Samtal-fliken visar transkript + förslag
--    /dashboard/projects/[id] — milstolpar, dokument, logg, checklista
--    /dashboard/team          — kollegorna listas
--    Tomt någonstans = policyn biter fel; hör av dig innan något ändras.
