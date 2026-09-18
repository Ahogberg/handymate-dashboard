-- v253 (2026-09-17): jobbtypens upplägg heter som jobbet.
--
-- "Standardrader · <jobbtyp>" var ett systemnamn satt av
-- lib/quotes/job-standard-server.ts vid "Förbered standardrader". Sedan
-- 2026-09-17 skapas upplägget med jobbtypens namn (ett upplägg = ett tryck i
-- offertflödet, flera upplägg visas som varianter). Befintliga rader döps om
-- så gamla och nya konton ser samma sak. Bara rader som bär prefixet OCH är
-- kopplade till en jobbtyp rörs — namn hantverkaren själv skrivit lämnas.
--
-- Verifierat läsande 2026-09-17: 1 rad i produktion (Nordström El AB).

UPDATE public.quote_templates
SET name = substr(name, length('Standardrader · ') + 1),
    updated_at = now()
WHERE name LIKE 'Standardrader · %'
  AND job_type_slug IS NOT NULL;

-- Read-only verifiering efter körning (ska ge 0):
SELECT count(*) FROM public.quote_templates WHERE name LIKE 'Standardrader · %';
