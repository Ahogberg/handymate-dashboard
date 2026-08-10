-- ============================================================================
-- STATUS-INTROSPEKTION 2026-08-10 — vilka osäkra migrationer är faktiskt körda?
-- ============================================================================
-- INTE en migration: 100 % läsande, ändrar ingenting. Kör i Supabase SQL
-- Editor eller via MCP. Ger facit för listan i tasks/todo.md /
-- minnet pending-migrations (v16, v78, v84, v87, v92, v93, v94, v105)
-- plus radantal för död-kod-utredningen (case_record, human_followup_queue).
--
-- DEL A är helt katalogbaserad (information_schema/pg_catalog) och kan aldrig
-- falla på att en tabell/kolumn saknas. DEL B läser data och får bara köras
-- för de delar DEL A visar KÖRD.
-- ============================================================================

-- ═══ DEL A — körstatus (en rad per kontroll) ═══

SELECT 'v16: tabellen quote_tracking_events' AS kontroll,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'quote_tracking_events')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END AS status

UNION ALL
SELECT 'v16: quotes-kolumnerna (view_count, first/last_viewed_at, total_view_seconds)',
       CASE (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'quotes'
               AND column_name IN ('view_count','first_viewed_at','last_viewed_at','total_view_seconds'))
         WHEN 4 THEN 'KÖRD' WHEN 0 THEN 'EJ KÖRD' ELSE 'DELVIS — utred!' END

UNION ALL
SELECT 'v78: learning_events.reference_id är TEXT (uuid = ej körd)',
       COALESCE((SELECT CASE data_type WHEN 'text' THEN 'KÖRD' ELSE 'EJ KÖRD (' || data_type || ')' END
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'learning_events'
                   AND column_name = 'reference_id'),
                'TABELLEN SAKNAS — v5 ej körd?!')

UNION ALL
SELECT 'v84: tabellen employee_certificate',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'employee_certificate')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v84: RLS-policys på employee_certificate (ska vara 2)',
       (SELECT COUNT(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'employee_certificate')::text || ' st'

UNION ALL
SELECT 'v87: FK deal_customer_id_fkey',
       COALESCE((SELECT CASE WHEN convalidated THEN 'KÖRD + VALIDERAD'
                             ELSE 'KÖRD (NOT VALID — validera separat)' END
                 FROM pg_constraint WHERE conname = 'deal_customer_id_fkey'),
                'EJ KÖRD')

UNION ALL
SELECT 'v92: kolumnen business_config.vat_number',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'business_config'
                           AND column_name = 'vat_number')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v92: bucketen business-assets är publik',
       COALESCE((SELECT CASE WHEN public THEN 'KÖRD' ELSE 'EJ KÖRD (public=false)' END
                 FROM storage.buckets WHERE id = 'business-assets'),
                'BUCKETEN SAKNAS')

UNION ALL
SELECT 'v92: policyn "Public read business-assets" på storage.objects',
       CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                         WHERE schemaname = 'storage' AND tablename = 'objects'
                           AND policyname = 'Public read business-assets')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v93: kolumnen business_config.secondary_branches',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'business_config'
                           AND column_name = 'secondary_branches')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v93: constrainten secondary_branches_not_primary',
       CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                         WHERE conname = 'business_config_secondary_branches_not_primary')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v94: företagsprofilens 9 kolumner på business_config',
       CASE (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'business_config'
               AND column_name IN ('company_form','fiscal_year_end_month','vat_period',
                                   'is_employer','employee_count','accounting_firm',
                                   'accounting_contact','company_profile_source',
                                   'company_profile_fetched_at'))
         WHEN 9 THEN 'KÖRD' WHEN 0 THEN 'EJ KÖRD'
         ELSE 'DELVIS — utred!' END

UNION ALL
SELECT 'v105: levande konton UTAN owner-rad (0 = backfill körd/klar)',
       (SELECT COUNT(*) FROM business_config bc
        WHERE bc.user_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id)
          AND NOT EXISTS (SELECT 1 FROM business_users bu
                          WHERE bu.business_id = bc.business_id
                            AND bu.user_id = bc.user_id))::text || ' st'

UNION ALL
SELECT 'v105: föräldralösa konton (rörs ej av backfillen)',
       (SELECT COUNT(*) FROM business_config bc
        WHERE bc.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = bc.user_id))::text || ' st'

UNION ALL
SELECT 'död-kod: case_record finns? (radestimat, -1 = aldrig analyserad)',
       COALESCE((SELECT 'finns, ~' || reltuples::bigint::text || ' rader'
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'case_record' AND c.relkind = 'r'),
                'TABELLEN FINNS INTE')

UNION ALL
SELECT 'död-kod: human_followup_queue finns? (radestimat)',
       COALESCE((SELECT 'finns, ~' || reltuples::bigint::text || ' rader'
                 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = 'human_followup_queue' AND c.relkind = 'r'),
                'TABELLEN FINNS INTE')

ORDER BY kontroll;

-- ═══ DEL B — datanivå. Kör varje block ENSAMT, och bara om DEL A visar KÖRD
-- för motsvarande objekt (annars felar frågan på saknad kolumn/tabell). ═══

-- B1 (kräver v78 KÖRD): hur många learning_events har landat, per typ?
-- SELECT event_type, COUNT(*) AS antal FROM learning_events
-- GROUP BY event_type ORDER BY antal DESC;

-- B2 (kräver v93 KÖRD): fick Bee sin construction-sekundärbransch?
-- SELECT business_id, business_name, branch, secondary_branches
-- FROM business_config
-- WHERE branch = 'electrician' AND business_name ILIKE '%bee%';

-- B3 (kräver att tabellerna finns): exakta radantal för död-kod-utredningen.
-- SELECT COUNT(*) AS rader, MAX(created_at) AS senaste FROM case_record;
-- SELECT COUNT(*) AS rader, MAX(created_at) AS senaste FROM human_followup_queue;
