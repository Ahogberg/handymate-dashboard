-- ============================================================================
-- STATUS-INTROSPEKTION 2026-08-21 — vilka väntande migrationer är körda?
-- ============================================================================
-- INTE en migration: 100 % läsande, ändrar ingenting. Kör i Supabase SQL
-- Editor eller via MCP. Täcker alla migrationer flaggade "EJ körd" i minnet
-- sedan 2026-08-10 (v137, v139, v141, v144, v148, v151-v153, v155, v157,
-- v161-v164). Samma mönster som sql/status_migrationer_2026-08-10.sql.
-- ============================================================================

SELECT 'v137: price_list.product_id (produktregister-onboarding)' AS kontroll,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'price_list'
                           AND column_name = 'product_id')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END AS status

UNION ALL
SELECT 'v139: tabellen business_twin_forecast',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'business_twin_forecast')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v141: business_knowledge.job_type',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'business_knowledge'
                           AND column_name = 'job_type')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v144: tabellen mission',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'mission')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v148: tabellen invoice_evidence_manifest (KRITISK — bär hela leveransmanifestet, se not nedan)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'invoice_evidence_manifest')
            THEN 'KÖRD' ELSE 'EJ KÖRD — manifestet har fail-softat tyst hela tiden' END

UNION ALL
SELECT 'v151: customer-documents bucket är PRIVAT (SÄKERHET)',
       COALESCE((SELECT CASE WHEN public THEN 'EJ KÖRD — PUBLIKT LÄSBAR' ELSE 'KÖRD' END
                 FROM storage.buckets WHERE id = 'customer-documents'),
                'BUCKETEN SAKNAS')

UNION ALL
SELECT 'v151: project-files bucket är PRIVAT (SÄKERHET)',
       COALESCE((SELECT CASE WHEN public THEN 'EJ KÖRD — PUBLIKT LÄSBAR' ELSE 'KÖRD' END
                 FROM storage.buckets WHERE id = 'project-files'),
                'BUCKETEN SAKNAS')

UNION ALL
SELECT 'v152: Andreas + demo-kontot är professional/active',
       (SELECT COUNT(*) FROM business_config bc
        JOIN auth.users u ON u.id = bc.user_id
        WHERE u.email IN ('andreashogberg93@gmail.com', 'demo@handymate.se')
          AND bc.subscription_plan = 'professional' AND bc.subscription_status = 'active'
       )::text || ' av 2 konton rätt (förväntat 2)'

UNION ALL
SELECT 'v153: automation_settings.owner_absence',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'automation_settings'
                           AND column_name = 'owner_absence')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v155: reset_demo_tenant() innehåller mission-städningen (v2 av funktionen)',
       COALESCE((SELECT CASE WHEN pg_get_functiondef(p.oid) LIKE '%public.mission%'
                             THEN 'KÖRD' ELSE 'EJ KÖRD (gamla v99-versionen körs fortfarande)' END
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'reset_demo_tenant'),
                'FUNKTIONEN SAKNAS')

UNION ALL
SELECT 'v157: tabellen operating_experiment',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
                         WHERE table_schema = 'public' AND table_name = 'operating_experiment')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v161: project_material.supplier_invoice_id + supplier_invoices.subcontractor_id',
       CASE (SELECT COUNT(*) FROM information_schema.columns
             WHERE (table_name = 'project_material' AND column_name = 'supplier_invoice_id')
                OR (table_name = 'supplier_invoices' AND column_name = 'subcontractor_id'))
         WHEN 2 THEN 'KÖRD' WHEN 0 THEN 'EJ KÖRD' ELSE 'DELVIS — utred!' END

UNION ALL
SELECT 'v162: supplier_invoices.fortnox_supplier_invoice_number (kräver Fortnox-återanslutning för att användas)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'supplier_invoices'
                           AND column_name = 'fortnox_supplier_invoice_number')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v163: invoice.delivery_status',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_schema = 'public' AND table_name = 'invoice'
                           AND column_name = 'delivery_status')
            THEN 'KÖRD' ELSE 'EJ KÖRD' END

UNION ALL
SELECT 'v164: customer.gln_number + invoice.fortnox_einvoice_sent_at (e-faktura, 2026-08-21)',
       CASE (SELECT COUNT(*) FROM information_schema.columns
             WHERE (table_name = 'customer' AND column_name = 'gln_number')
                OR (table_name = 'invoice' AND column_name = 'fortnox_einvoice_sent_at'))
         WHEN 2 THEN 'KÖRD' WHEN 0 THEN 'EJ KÖRD' ELSE 'DELVIS — utred!' END

ORDER BY kontroll;

-- ═══ NOT om v148 ═══
-- lib/invoices/evidence-manifest.ts fail-softar tyst (schemaMissingResult())
-- om tabellen saknas — prepareInvoiceManifest/markInvoiceDelivered har då
-- körts overksamt sedan Etapp P byggdes, utan att någon flödesfunktion
-- kraschat. Om detta visar EJ KÖRD är det troligen den enskilt viktigaste
-- att köra av hela listan: hela leveransmanifestet (Fortnox-först-flödet,
-- dubbelskyddet, delivery_status-läkningen) bygger på den tabellen.
