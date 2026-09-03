-- v210 — transkriptkvalitet: avvisade transkript och talaruppmärkning
--
-- BAKGRUND (Kundkoll-jämförelsen 2026-09-03, docs/audits/):
-- Whisper hittar på text ur tystnad — mätt av fltman/kundkoll som
-- "5 s ren tystnad → ' Tack.'". Vår kedja skickar transkriptet vidare till
-- POST /api/voice/analyze, som föder godkännandekort (ÄTA, byggdagbok,
-- deal-kort, customer_fact). Ett tyst samtal kunde alltså producera ett
-- beslutsunderlag byggt på ingenting.
--
-- lib/transcription/guard.ts avvisar nu sådana transkript. Kolumnerna nedan
-- gör avvisningen SYNLIG i stället för att lämna raden tom — ett tomt
-- transcript som betyder "vi vet inte" får aldrig se ut som ett som betyder
-- "det sades inget". Samma ärlighetsregel som assembleTranscript följer.

-- Varför transkriptet uteblev: 'artefakt' | 'tomt' | 'for_gles' (guard.ts).
-- NULL = ingen avvisning, dvs det normala fallet.
ALTER TABLE call_recording
  ADD COLUMN IF NOT EXISTS transcript_skipped_reason TEXT;

COMMENT ON COLUMN call_recording.transcript_skipped_reason IS
  'Varför inget transkript sparades: artefakt (känd Whisper-hallucination), tomt, for_gles (för lite text mot ljudlängd). NULL = transkriberat normalt. Sätts av lib/transcription/guard.ts.';

ALTER TABLE meeting_segment
  ADD COLUMN IF NOT EXISTS transcript_skipped_reason TEXT;

COMMENT ON COLUMN meeting_segment.transcript_skipped_reason IS
  'Som call_recording.transcript_skipped_reason — samma vakt, samma värden.';

-- TALARUPPMÄRKNING (gpt-4o-transcribe-diarize)
--
-- Analysen vet i dag inte om ett löfte gavs av hantverkaren eller kunden, och
-- det är precis den skillnaden promise_deadlines, ÄTA-förslagen och deal-korten
-- hänger på. Diariseringsmotorn märker upp segmenten; kolumnerna nedan bär
-- resultatet vidare till analysen.
--
-- 46elks recordcall dokumenterar inga kanalval (inspelningen är mono), så
-- Kundkolls tvåspårstrick är inte tillgängligt för oss — uppmärkningen måste
-- ske i transkriberingssteget.
ALTER TABLE call_recording
  ADD COLUMN IF NOT EXISTS transcript_segments JSONB;

COMMENT ON COLUMN call_recording.transcript_segments IS
  'Segment med start/end/text och, när diariseringsmotorn använts, speaker. NULL när motorn inte ger segment.';

-- meeting_segment har redan whisper_segments (start/end/text). Talaren är det
-- nya fältet — läggs bredvid i stället för att ändra formen på befintlig data.
ALTER TABLE meeting_segment
  ADD COLUMN IF NOT EXISTS speaker_segments JSONB;

COMMENT ON COLUMN meeting_segment.speaker_segments IS
  'Talaruppmärkta segment från diariseringsmotorn. whisper_segments lämnas orörd — två format, ingen migrering av gammal data.';

-- Verifiering efter körning:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('call_recording','meeting_segment')
--     AND column_name IN ('transcript_skipped_reason','transcript_segments','speaker_segments');
