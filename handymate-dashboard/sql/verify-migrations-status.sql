-- Migrations-koll v68–v71 (Fas 1-grind, 5 min)
-- Kör i Supabase SQL Editor (HANDYMATE-projektet). Klistra HELA resultatet
-- till Claude. Varje rad svarar "finns kolumnen/tabellen som migrationen
-- skulle skapa?" — true = migrationen är körd i prod.

SELECT
  'v68 quotes.created_by' AS migration,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'quotes' AND column_name = 'created_by') AS kord
UNION ALL
SELECT 'v69 business_config.billing_period_start',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'business_config' AND column_name = 'billing_period_start')
UNION ALL
SELECT 'v70 customer.fortnox_customer_number',
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customer' AND column_name = 'fortnox_customer_number')
UNION ALL
SELECT 'v71 FK time_entry->project (exempel ur FK-svepet)',
  EXISTS (SELECT 1 FROM information_schema.table_constraints tc
          WHERE tc.table_name = 'time_entry' AND tc.constraint_type = 'FOREIGN KEY');
