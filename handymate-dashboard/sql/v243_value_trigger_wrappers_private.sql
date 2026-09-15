-- v243_value_trigger_wrappers_private.sql — stäng API-vägen till v241:s triggerfunktioner (2026-09-14).
-- De tre wrappers blev SECURITY DEFINER i M1 (PR #72) så att medlemmars RLS-tillåtna skrivningar
-- når producenterna. Triggers kräver inte EXECUTE vid körning (bevisat i PGlite, probe14), men
-- PostgREST exponerar varje funktion i public med PUBLIC-EXECUTE som /rest/v1/rpc/<namn>.
-- Supabase-rådgivaren flaggade det efter körningen av v241. Utan triggerkontext svarar de bara
-- med "trigger functions can only be called as triggers", men ytan ska inte finnas.
-- Körd i produktion 2026-09-14 direkt efter v241 (Supabase MCP, migration v243_value_trigger_wrappers_private).
BEGIN;
REVOKE ALL ON FUNCTION public.value_approval_written() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.value_automation_written() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.value_document_sent() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.value_events_immutable() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
