-- ============================================================================
-- v71: Lägg till saknade FK-constraints som dödar PostgREST-embeds
-- ============================================================================
-- BAKGRUND (2026-07-10): En systematisk svepning av alla embeddade joins
-- (rel:fk_kolumn(...)) mot prod hittade 12 (tabell → fk)-par där FK-relationen
-- SAKNAS. PostgREST avvisar då HELA queryn (PGRST200) — och eftersom koden
-- ofta inte läser error blir symptomet "tyst tomt/trasigt":
--   • project → customer:        dödade ALLA projektstage-flyttar (fixat i kod
--                                 5bccc772; FK:n här läker även logs/pdf +
--                                 time-reports/project-comparison)
--   • generated/customer_document: dokument-API:t 500:ade alltid (fixat i kod)
--   • time_entry → work_type:    tidrapporterings-rutterna (5 filer)
--   • time_entry → project, travel_entry, vehicle_reports, allowance_reports,
--     form_submissions, inventory_transaction, nurture_enrollment,
--     calendar_watches, field_reports: respektive listor/PDF:er felar
--
-- Denna migration lägger till FK:erna så att BEFINTLIG kod börjar fungera —
-- inga kodändringar krävs för paren nedan.
--
-- SÄKERHET:
--   • Varje constraint ligger i eget DO-block med EXCEPTION-hantering: en
--     enskild typkonflikt/befintlig constraint blockerar INTE resten. Läs
--     NOTICE-utskrifterna efter körning — de listar ev. par som inte gick.
--   • Orphan-rader städas först (SET NULL) så ADD CONSTRAINT validerar rent.
--     Verifierat mot prod 2026-07-10: totalt 3 orphan-rader (project 1,
--     time_entry 1, form_submissions 1).
--   • ON DELETE SET NULL för valfria relationer (raden överlever att
--     relationen försvinner). CASCADE endast där barnraden är meningslös
--     utan föräldern (calendar_watches, field_reports, nurture_enrollment).
--   • OBS beteendeförändring: inserts med ogiltiga referenser (t.ex. ett
--     work_type_id som inte finns) FELAR nu i stället för att tyst spara
--     en orphan — det är önskad integritet.
--
-- Kör i Supabase SQL Editor. Idempotent (kan köras om).
-- ============================================================================

-- ── 1. project.customer_id → customer ──────────────────────────────────────
DO $$ BEGIN
  UPDATE project p SET customer_id = NULL
   WHERE p.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = p.customer_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_customer_id_fkey') THEN
    ALTER TABLE project
      ADD CONSTRAINT project_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR project.customer_id: %', SQLERRM;
END $$;

-- ── 2. generated_document.customer_id → customer ───────────────────────────
DO $$ BEGIN
  UPDATE generated_document g SET customer_id = NULL
   WHERE g.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = g.customer_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_document_customer_id_fkey') THEN
    ALTER TABLE generated_document
      ADD CONSTRAINT generated_document_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR generated_document.customer_id: %', SQLERRM;
END $$;

-- ── 3. generated_document.project_id → project ─────────────────────────────
DO $$ BEGIN
  UPDATE generated_document g SET project_id = NULL
   WHERE g.project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = g.project_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_document_project_id_fkey') THEN
    ALTER TABLE generated_document
      ADD CONSTRAINT generated_document_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR generated_document.project_id: %', SQLERRM;
END $$;

-- ── 4. customer_document.customer_id → customer ────────────────────────────
DO $$ BEGIN
  UPDATE customer_document d SET customer_id = NULL
   WHERE d.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = d.customer_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_document_customer_id_fkey') THEN
    ALTER TABLE customer_document
      ADD CONSTRAINT customer_document_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR customer_document.customer_id: %', SQLERRM;
END $$;

-- ── 5. project_document.project_id → project ───────────────────────────────
DO $$ BEGIN
  UPDATE project_document d SET project_id = NULL
   WHERE d.project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = d.project_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_document_project_id_fkey') THEN
    ALTER TABLE project_document
      ADD CONSTRAINT project_document_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR project_document.project_id: %', SQLERRM;
END $$;

-- ── 6. time_entry.project_id → project ─────────────────────────────────────
DO $$ BEGIN
  UPDATE time_entry t SET project_id = NULL
   WHERE t.project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = t.project_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_project_id_fkey') THEN
    ALTER TABLE time_entry
      ADD CONSTRAINT time_entry_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR time_entry.project_id: %', SQLERRM;
END $$;

-- ── 7. time_entry.work_type_id → work_type ─────────────────────────────────
DO $$ BEGIN
  UPDATE time_entry t SET work_type_id = NULL
   WHERE t.work_type_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM work_type w WHERE w.work_type_id = t.work_type_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'time_entry_work_type_id_fkey') THEN
    ALTER TABLE time_entry
      ADD CONSTRAINT time_entry_work_type_id_fkey
      FOREIGN KEY (work_type_id) REFERENCES work_type(work_type_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR time_entry.work_type_id: %', SQLERRM;
END $$;

-- ── 8. allowance_reports.project_id → project ──────────────────────────────
DO $$ BEGIN
  UPDATE allowance_reports a SET project_id = NULL
   WHERE a.project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = a.project_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'allowance_reports_project_id_fkey') THEN
    ALTER TABLE allowance_reports
      ADD CONSTRAINT allowance_reports_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR allowance_reports.project_id: %', SQLERRM;
END $$;

-- ── 9. form_submissions.project_id → project ───────────────────────────────
DO $$ BEGIN
  UPDATE form_submissions f SET project_id = NULL
   WHERE f.project_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM project p WHERE p.project_id = f.project_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'form_submissions_project_id_fkey') THEN
    ALTER TABLE form_submissions
      ADD CONSTRAINT form_submissions_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES project(project_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR form_submissions.project_id: %', SQLERRM;
END $$;

-- ── 10. inventory_transaction.inventory_id → inventory ─────────────────────
-- SET NULL (inte CASCADE): transaktioner är historik/liggare — de ska
-- överleva att artikeln tas bort.
DO $$ BEGIN
  UPDATE inventory_transaction t SET inventory_id = NULL
   WHERE t.inventory_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.id = t.inventory_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_transaction_inventory_id_fkey') THEN
    ALTER TABLE inventory_transaction
      ADD CONSTRAINT inventory_transaction_inventory_id_fkey
      FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR inventory_transaction.inventory_id: %', SQLERRM;
END $$;

-- ── 11. travel_entry.business_user_id → business_users ─────────────────────
DO $$ BEGIN
  UPDATE travel_entry t SET business_user_id = NULL
   WHERE t.business_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM business_users u WHERE u.id = t.business_user_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_entry_business_user_id_fkey') THEN
    ALTER TABLE travel_entry
      ADD CONSTRAINT travel_entry_business_user_id_fkey
      FOREIGN KEY (business_user_id) REFERENCES business_users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR travel_entry.business_user_id: %', SQLERRM;
END $$;

-- ── 12. travel_entry.customer_id → customer ────────────────────────────────
DO $$ BEGIN
  UPDATE travel_entry t SET customer_id = NULL
   WHERE t.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = t.customer_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'travel_entry_customer_id_fkey') THEN
    ALTER TABLE travel_entry
      ADD CONSTRAINT travel_entry_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR travel_entry.customer_id: %', SQLERRM;
END $$;

-- ── 13. vehicle_reports.business_user_id → business_users ──────────────────
DO $$ BEGIN
  UPDATE vehicle_reports v SET business_user_id = NULL
   WHERE v.business_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM business_users u WHERE u.id = v.business_user_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_reports_business_user_id_fkey') THEN
    ALTER TABLE vehicle_reports
      ADD CONSTRAINT vehicle_reports_business_user_id_fkey
      FOREIGN KEY (business_user_id) REFERENCES business_users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR vehicle_reports.business_user_id: %', SQLERRM;
END $$;

-- ── 14. nurture_enrollment.customer_id → customer (CASCADE) ────────────────
-- En nurture-enrollment utan kund är meningslös — följ med kunden.
DO $$ BEGIN
  DELETE FROM nurture_enrollment n
   WHERE n.customer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM customer c WHERE c.customer_id = n.customer_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nurture_enrollment_customer_id_fkey') THEN
    ALTER TABLE nurture_enrollment
      ADD CONSTRAINT nurture_enrollment_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES customer(customer_id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR nurture_enrollment.customer_id: %', SQLERRM;
END $$;

-- ── 15. calendar_watches.calendar_connection_id → calendar_connection ──────
-- En watch utan connection är meningslös — följ med connectionen.
DO $$ BEGIN
  DELETE FROM calendar_watches w
   WHERE w.calendar_connection_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM calendar_connection c WHERE c.id = w.calendar_connection_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_watches_calendar_connection_id_fkey') THEN
    ALTER TABLE calendar_watches
      ADD CONSTRAINT calendar_watches_calendar_connection_id_fkey
      FOREIGN KEY (calendar_connection_id) REFERENCES calendar_connection(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR calendar_watches.calendar_connection_id: %', SQLERRM;
END $$;

-- ── 16. field_reports.business_id → business_config (CASCADE) ──────────────
DO $$ BEGIN
  DELETE FROM field_reports f
   WHERE f.business_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM business_config b WHERE b.business_id = f.business_id);
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'field_reports_business_id_fkey') THEN
    ALTER TABLE field_reports
      ADD CONSTRAINT field_reports_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES business_config(business_id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'HOPPAR field_reports.business_id: %', SQLERRM;
END $$;

-- ============================================================================
-- VERIFIERING (kör efter migrationen — alla 16 ska listas):
-- ============================================================================
SELECT conname, conrelid::regclass AS tabell, confrelid::regclass AS refererar
FROM pg_constraint
WHERE conname IN (
  'project_customer_id_fkey',
  'generated_document_customer_id_fkey',
  'generated_document_project_id_fkey',
  'customer_document_customer_id_fkey',
  'project_document_project_id_fkey',
  'time_entry_project_id_fkey',
  'time_entry_work_type_id_fkey',
  'allowance_reports_project_id_fkey',
  'form_submissions_project_id_fkey',
  'inventory_transaction_inventory_id_fkey',
  'travel_entry_business_user_id_fkey',
  'travel_entry_customer_id_fkey',
  'vehicle_reports_business_user_id_fkey',
  'nurture_enrollment_customer_id_fkey',
  'calendar_watches_calendar_connection_id_fkey',
  'field_reports_business_id_fkey'
)
ORDER BY conname;
