-- v148: Frozen Invoice Evidence Manifest V1 (Evidence-to-Payment, Etapp P)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- Manifestet fryser VILKET underlag som fanns när fakturan först levererades
-- till kund — versionsmärkt readiness-verdict + stabila referenser till
-- BEFINTLIGA rader. Aldrig kopierade bilder/dokument/känslig fritext (rådets
-- räcke). Läs-only i V1: blockerar aldrig fakturering; förberedelse-fel
-- larmar högt (driftlarm) men släpper igenom sändningen.
--
-- Deterministiskt id invmf_<invoice_id> ⇒ upsert är idempotent över omskick
-- och retries (freeze-outcome-mönstret). Exekveringsmodell:
--   prepare (status 'prepared') → fysisk sändning → mark delivered.
-- Faller sista steget: reconciler läker via extern evidens (customer_activity/
-- sms_log) — aldrig ett best-effort-hål.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.invoice') IS NULL
     OR to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v148 kräver invoice och business_config';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.invoice_evidence_manifest (
  -- invmf_<invoice_id> — EN manifest per faktura, idempotent per konstruktion.
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  invoice_id TEXT NOT NULL
    REFERENCES public.invoice(invoice_id) ON DELETE CASCADE,
  project_id TEXT,

  -- Versionsmärkning: manifestformatet + readiness-reglerna som gällde.
  manifest_version INTEGER NOT NULL,
  readiness_rules_version INTEGER NOT NULL,

  -- Fryst verdict + slots + refs (tabell/ref_id — aldrig innehåll) +
  -- input-fingerprint för förändringsdetektion (watch-forecast-mönstret).
  readiness_snapshot JSONB NOT NULL,
  input_fingerprint TEXT NOT NULL,

  -- prepared: fryst före sändning. delivered: sändning bekräftad + markerad.
  -- incomplete: leverans skedde men mark-steget föll — reconcilerns arbetskö,
  -- OCH driftlarmets signal. reconciled: läkt i efterhand.
  status TEXT NOT NULL
    CHECK (status IN ('prepared', 'delivered', 'incomplete', 'reconciled')),
  delivery_method TEXT,          -- email/sms/fortnox (första lyckade)
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  reconciled_at TIMESTAMPTZ,
  completeness_flags JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT invmf_one_per_invoice UNIQUE (invoice_id),
  CONSTRAINT invmf_delivered_state CHECK (
    (status = 'prepared' AND delivered_at IS NULL)
    OR (status IN ('delivered', 'incomplete') )
    OR (status = 'reconciled' AND reconciled_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_invmf_business_status
  ON public.invoice_evidence_manifest (business_id, status);
-- Reconcilerns arbetskö.
CREATE INDEX IF NOT EXISTS idx_invmf_incomplete
  ON public.invoice_evidence_manifest (prepared_at)
  WHERE status IN ('prepared', 'incomplete');

ALTER TABLE public.invoice_evidence_manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_evidence_manifest FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.invoice_evidence_manifest TO service_role;
CREATE POLICY invmf_service_role ON public.invoice_evidence_manifest
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;
