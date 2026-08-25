-- v167: quotes_status_check saknar 'pending_approval'
--
-- VERKLIGT REPRO (2026-08-25, Reality Week Pass 2 / A1): fyra-ögon-grinden
-- för offerter (app/api/quotes/send/route.ts) skriver medvetet
-- status='pending_approval' när en icke-ägare/admin skickar en offert över
-- four_eyes_threshold_sek. Den skrivningen har ALDRIG kunnat lyckas —
-- quotes_status_check tillät bara draft/sent/opened/accepted/declined/
-- expired. Effekten: godkännandekortet skapades korrekt, men
-- statusuppdateringen på offerten kastade en 23514 (CHECK-brott), fångades
-- och gav ett ärligt 500-svar till avsändaren — "Godkännande skapad men
-- offertens status kunde inte uppdateras". Offerten blev alltså aldrig
-- låst mot dubbelskick under granskningen.
--
-- 'pending_approval' är INTE en spekulativ tillökning — den är redan
-- appens uttalade kontrakt: tests/quote-lifecycle.spec.ts klassificerar
-- den explicit som ett avsiktligt "arbetsläge" (som draft) i
-- WRITTEN_STATUSES, med en egen kommentar om en tidigare incident där just
-- pending_approval-hanteringen brast. Koden och testerna var redan eniga;
-- det var databasens CHECK-constraint som aldrig synkades.
--
-- Facit-verifiering (kör EFTER migrationen):
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'quotes_status_check';
--   -- ska nu inkludera 'pending_approval' i ARRAY[...]

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;

ALTER TABLE quotes ADD CONSTRAINT quotes_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'sent'::text,
    'opened'::text,
    'accepted'::text,
    'declined'::text,
    'expired'::text,
    'pending_approval'::text
  ]));
