-- v215 (2026-09-06): project_checklist.order_id var NOT NULL i produktion
-- trots att alla skrivvägar (approvals: checklist_forslag,
-- playbook_kickoff_suggestion; seed) skapar checklistor per PROJEKT utan
-- order. Driftfynd F01 i PR #16: "null value in column order_id violates
-- not-null constraint" — godkänd elsäkerhetskontroll kunde inte skapas.
-- Tabellen hade 0 rader vid körning. Ingen destruktiv sats.
ALTER TABLE public.project_checklist ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE public.project_checklist DROP CONSTRAINT IF EXISTS project_checklist_project_or_order;
ALTER TABLE public.project_checklist
  ADD CONSTRAINT project_checklist_project_or_order
  CHECK (project_id IS NOT NULL OR order_id IS NOT NULL);
