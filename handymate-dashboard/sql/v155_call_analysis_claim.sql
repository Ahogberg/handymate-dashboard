-- v155: Atomiskt anspråk för samtalsanalysen (etapp 1b, "en väg in").
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND: app/api/voice/analyze (numera lib/voice/analyze-call.ts) hade en
-- dubbelkörningsspärr som bara läste ai_suggestion — mötesgrenen (source =
-- 'site_visit') skriver ALDRIG dit, den skriver pending_approvals. Ett möte
-- kunde alltså analyseras om och om igen (UI:ts Analysera-knapp, eller två
-- samtidiga anrop som båda hann läsa "inga befintliga rader" innan någon
-- hunnit skriva) och varje körning lade på ett nytt set godkännandekort.
-- Spärren var dessutom en SELECT-före-INSERT, inte ett lås — två parallella
-- anrop kunde båda passera kontrollen.
--
-- analysis_claimed_at sätts atomiskt av en UPDATE ... WHERE analysis_claimed_at
-- IS NULL (se claimCallAnalysis i lib/voice/analyze-call.ts) — bara EN
-- körning kan vinna. claimed ≠ analyzed: en krasch mellan claim och klar
-- lämnar analysis_claimed_at satt men analyzed_at null, så ett explicit
-- "Analysera igen" (force: true) kan städa och köra om utan att vänta ut ett
-- lås som aldrig släpps.
--
-- Källkoden är byggd för att TÅLA att denna migration inte körts än —
-- kolumn-saknas-fel (isMissingColumnError, lib/agents/memory.ts) fångas i
-- claimCallAnalysis, och den gamla ai_suggestion-baserade already_analyzed-
-- spärren används som reservväg tills migrationen körts.

ALTER TABLE call_recording ADD COLUMN IF NOT EXISTS analysis_claimed_at TIMESTAMPTZ;
ALTER TABLE call_recording ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

COMMENT ON COLUMN call_recording.analysis_claimed_at IS
  'Atomiskt anspråk på analysen av det här samtalet/mötet — satt av en UPDATE ... WHERE analysis_claimed_at IS NULL (claimCallAnalysis, lib/voice/analyze-call.ts) så att bara en av flera samtidiga analysanrop vinner. Ersätter den ofullständiga already_analyzed-spärren mot ai_suggestion, som aldrig täckte mötesgrenens pending_approvals-kort. NULL = ingen analys pågår eller är gjord. Rensas till NULL vid ett fel i analysen (best effort, så en transient krasch inte permanent blockerar) eller vid ett explicit "Analysera igen" (force: true).';

COMMENT ON COLUMN call_recording.analyzed_at IS
  'Satt när analysen faktiskt slutförts (till skillnad från analysis_claimed_at, som bara betyder att någon PÅBÖRJAT den). claimed ≠ analyzed — ett icke-null anspråk med analyzed_at fortfarande NULL betyder att en analys kraschade eller pågår.';
