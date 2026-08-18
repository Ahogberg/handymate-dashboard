-- v150: Mission Mandates V1 — avgränsad delegation (hybrid: mätinstrument)
--
-- KÖRS MANUELLT i Supabase SQL Editor. Kräver v144 (mission).
--
-- Ett mandat = ägarens uttryckliga, avgränsade delegation för ETT uppdrag:
-- "teamet får genomföra just detta, inom exakt dessa gränser." V1 är
-- MEDVETET begränsad till de fyra förtjänta-autonomi-typerna
-- (invoice_reminder, booking_reminder, quote_followup_sms, review_request)
-- och bygger IN falsklarmsmätningen rådets autonomigrind kräver —
-- Andreas medvetna rådsbeslut 2026-08-18 (dokumenteras i ACTIVE_ROADMAP).
--
-- Principer:
--   * mnd_<mission_id> — max ETT mandat per uppdrag, idempotent per
--     konstruktion (invmf-mönstret).
--   * INGA räknare lagras — dag-/totalanvändning härleds ur mandat-
--     stämplade kort (payload.mandate_id), Value Ledger-principen.
--   * created_by kommer ALLTID från serverns autentiserade kontext.
--   * Minsta avvikelse vid exekvering ⇒ vanligt godkännandekort — koden
--     (lib/mandates/mission-mandate.ts) är fail-closed; tabellen bär bara
--     gränserna.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.mission') IS NULL THEN
    RAISE EXCEPTION 'v150 kräver v144_mission.sql';
  END IF;
  IF to_regclass('public.business_users') IS NULL THEN
    RAISE EXCEPTION 'v150 kräver business_users';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.mission_mandate (
  -- 'mnd_' + mission_id — ett mandat per uppdrag.
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL
    REFERENCES public.mission(id) ON DELETE CASCADE,

  -- Fryst hash av planstegen mandatet gavs för (fingerprint-prejudikatet).
  -- Planändring ⇒ koden pausar mandatet ('plan_changed') — gamla gränser
  -- får aldrig täcka en ny plan.
  plan_hash TEXT NOT NULL,

  -- Delmängd av de fyra förtjänta-autonomi-typerna. CHECK:en speglar
  -- lib/autonomy/earned-autonomy.ts ALLOWLIST — utökas BARA via ny
  -- migration när en typ förtjänat inträde via publicerat facit.
  allowed_action_types TEXT[] NOT NULL,
  CONSTRAINT mandate_types_within_allowlist CHECK (
    allowed_action_types <@ ARRAY[
      'invoice_reminder', 'booking_reminder',
      'quote_followup_sms', 'review_request'
    ]::text[]
    AND array_length(allowed_action_types, 1) >= 1
  ),

  -- Namngivna mål per typ: { invoice_ids: [...], quote_ids: [...],
  -- booking_ids: [...] } — ett mål utanför listorna täcks ALDRIG.
  targets JSONB NOT NULL,

  daily_cap INTEGER NOT NULL CHECK (daily_cap >= 1 AND daily_cap <= 25),
  total_cap INTEGER NOT NULL CHECK (total_cap >= 1 AND total_cap <= 200),
  -- NULL ⇒ befintliga resolveAutonomyCap-taken gäller (aldrig taklöst).
  amount_cap_kr NUMERIC CHECK (amount_cap_kr IS NULL OR amount_cap_kr > 0),

  -- Koden enforcar dessutom expires_at <= missionens deadline.
  expires_at DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked', 'expired', 'completed')),
  pause_reason TEXT,

  created_by TEXT
    REFERENCES public.business_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,

  CONSTRAINT mandate_one_per_mission UNIQUE (mission_id),
  CONSTRAINT mandate_state_check CHECK (
    (status = 'active' AND revoked_at IS NULL AND paused_at IS NULL)
    OR (status = 'paused' AND paused_at IS NOT NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
    OR (status IN ('expired', 'completed'))
  )
);

CREATE INDEX IF NOT EXISTS idx_mandate_business_active
  ON public.mission_mandate (business_id)
  WHERE status = 'active';

ALTER TABLE public.mission_mandate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mission_mandate FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mission_mandate TO service_role;
CREATE POLICY mandate_service_role ON public.mission_mandate
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid='public.mission_mandate'::regclass AND contype='c';
