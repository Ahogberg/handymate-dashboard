-- v181: "Skjut upp" på godkännandekort (Mission Control mobil 4a, G1).
-- Additiv. Ett snoozat kort förblir status='pending' men filtreras ur
-- pending-kön tills snoozed_until passerat — ingen statusflipp, ingen
-- exekvering, full reversibilitet.
ALTER TABLE public.pending_approvals
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;
