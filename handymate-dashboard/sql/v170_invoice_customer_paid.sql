-- v170: "Kundens del betald" (ROT/RUT) som eget tillstand + fantomkolumner
-- (2026-08-26, Andreas-beslut samma dag: explicit status, inte harledd flagga)
--
-- ═══ VARFOR ═══
-- En ROT/RUT-kund betalar bara SIN del (customer_pays); resterande ar
-- skattereduktionen som Skatteverket betalar ut efter begaran. Fortnox regel
-- (support.fortnox.se): begaran far skickas forst nar betalning registrerats
-- pa hela summan kunden ska betala. Skatteverket: arbetet utfort OCH betalt,
-- begart belopp <= betalt belopp. Handymate kunde inte se det tillstandet:
-- lib/fortnox/sync-payments.ts satte 'paid' bara vid Balance<=0, annars
-- 'overdue' -> paminnelsetrappan jagade kunden for Skatteverkets belopp och
-- fakturan blev aldrig ROT-berattigad.
--
-- ═══ TILLSTANDSMODELL ═══
--   sent|overdue -> customer_paid  (ROT/RUT: kundens del in; paid_at = datum
--                                  kunden betalade = Skatteverkets
--                                  betalningsdatum; automationer kors HAR)
--   sent|overdue -> paid           (ej ROT, eller kund betalade allt;
--                                  settled_at = paid_at)
--   customer_paid -> paid          (Skatteverkets utbetalning / Fortnox
--                                  Balance 0 / manuell slutregistrering;
--                                  settled_at satt, INGA automationer igen)
--   customer_paid -> overdue       FORBJUDET (guard i klassificeraren)
--
-- ═══ FANTOMKOLUMNER (live-verifierade, buntas har) ═══
--   payment_method  finns inte -> lib/fortnox/sync-payments.ts skrev den utan
--                   att lasa felet -> hela 'paid'-skrivningen avvisades tyst
--                   medan marked_paid++ och automationerna kordes anda.
--                   Koden byter till befintliga paid_via (fanns, oanvand).
--   paid_amount     finns inte (UI skickade den, PATCH-rutten tappade den).
--   cancelled_at    finns inte -> app/api/invoices/[id]/status/route.ts
--                   skrev den -> makulering failade tyst.
--   'credited'      saknades i CHECK -> kreditrutten (original -> credited)
--                   failade tyst -> originalet kunde krediteras tva ganger.
--
-- ═══ ORDNING ═══ Migration FORE deploy av koden — annars CHECK-fel pa
-- 'customer_paid' i produktion. Inga ROT-fakturor finns i prod (verifierat
-- 2026-08-26), sa ingen historisk backfill av paid_amount behovs (NULL =
-- "ej registrerat" for aldre rader).
--
-- Schema-verifiering FORE (forvantat: draft,sent,paid,overdue,cancelled):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname='invoice_status_check';

ALTER TABLE invoice DROP CONSTRAINT IF EXISTS invoice_status_check;
ALTER TABLE invoice ADD CONSTRAINT invoice_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'sent'::text,
    'customer_paid'::text,
    'paid'::text,
    'overdue'::text,
    'cancelled'::text,
    'credited'::text
  ]));

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS paid_amount  NUMERIC;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS settled_at   TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

COMMENT ON COLUMN invoice.status IS
  'draft|sent|overdue|customer_paid|paid|cancelled|credited. customer_paid = ROT/RUT-faktura dar kunden betalat SIN del (customer_pays); skattereduktionen vantar pa Skatteverket. paid = helt betald (settled_at satt). Se sql/v170.';
COMMENT ON COLUMN invoice.paid_at IS
  'Datum kunden betalade (sin del). = Skatteverkets betalningsdatum vid ROT/RUT-begaran. Oforandrat vid customer_paid -> paid.';
COMMENT ON COLUMN invoice.paid_amount IS
  'Faktiskt mottaget belopp fran kund (kr). NULL = ej registrerat (aldre rader).';
COMMENT ON COLUMN invoice.settled_at IS
  'Nar fakturan blev HELT betald (Skatteverkets utbetalning / Balance 0 i Fortnox / manuell slutregistrering).';
COMMENT ON COLUMN invoice.cancelled_at IS
  'Nar fakturan makulerades (status cancelled).';
COMMENT ON COLUMN invoice.paid_via IS
  'fortnox|manual|customer_confirmed|swish|bankgiro|card|cash. Ersatter den aldrig existerande payment_method.';
COMMENT ON COLUMN invoice.rot_application_status IS
  'submitted = Fortnox bokforde fakturan med skattereduktion (lib/invoices/sync-to-fortnox.ts). skv_requested = Handymate genererade egen XML-begaran (rot_payment_request_id satt).';

-- Ej-ROT betald = slutbetald per definition. ROT-rader (0 st i prod) rors inte.
UPDATE invoice
SET settled_at = paid_at
WHERE status = 'paid' AND rot_rut_type IS NULL AND settled_at IS NULL AND paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_business_customer_paid
  ON invoice (business_id) WHERE status = 'customer_paid';

-- Facit-verifiering EFTER:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='invoice_status_check';
--     -> ska innehalla customer_paid OCH credited
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='invoice' AND column_name IN ('paid_amount','settled_at','cancelled_at');
--     -> 3 rader
