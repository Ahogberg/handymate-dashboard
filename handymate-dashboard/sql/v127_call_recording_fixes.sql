-- v127_call_recording_fixes.sql
--
-- Bakgrund: Golden Path Fas 2 (Station 13) hittade att POST /api/admin/
-- demo-seed-meeting kraschade med "null value in column recording_id...
-- violates not-null constraint". Källgranskning visade att recording_id
-- är NOT NULL UTAN default (id är en separat uuid-PK med egen
-- gen_random_uuid()-default — recording_id är den textbaserade
-- identifieraren all annan kod frågar efter via .select('recording_id')/
-- .eq('recording_id', ...)).
--
-- ALLA FYRA kända insert-ställen (app/api/admin/demo-seed-meeting,
-- lib/meetings/process-job.ts, app/api/voice/recording,
-- app/api/voice/incoming) saknade fältet — fixat i samma commit som
-- denna migration, i själva applikationskoden. call_recording hade
-- BEKRÄFTAT NOLL rader i hela produktionsdatabasen — hela ringnings-/
-- mötesinspelningsfunktionen har aldrig kunnat spara en enda rad sedan
-- tabellen skapades. Ingen backfill möjlig eller relevant (inga rader
-- att rätta — bara framtida inserts att möjliggöra).
--
-- Denna migration är ett andra skyddslager (utöver kodfixarna): en
-- DEFAULT på recording_id skyddar mot att ett FRAMTIDA insert-ställe gör
-- samma misstag igen.
--
-- from_number/to_number är ÄVEN de NOT NULL utan default. Telefoni-
-- vägarna (voice/incoming, voice/recording) har nu fixats att fylla dem
-- med de riktiga numren (fanns redan i scope, bara aldrig kopplat in —
-- samma buggklass, inte en ren dead-column-fråga där). Men mötesvägen
-- (site-visit, lib/meetings/process-job.ts + demo-seed-meeting) har INGA
-- telefonnummer att sätta — där är NULL det ärliga, korrekta värdet.
-- Utan denna lättning kraschar mötesinserten på from_number/to_number
-- så fort recording_id-defaulten ovan har löst det FÖRSTA felet.

ALTER TABLE call_recording
  ALTER COLUMN recording_id SET DEFAULT ('rec_' || replace(gen_random_uuid()::text, '-', ''));

ALTER TABLE call_recording
  ALTER COLUMN from_number DROP NOT NULL;

ALTER TABLE call_recording
  ALTER COLUMN to_number DROP NOT NULL;
