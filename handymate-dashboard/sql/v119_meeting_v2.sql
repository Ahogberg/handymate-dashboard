-- v119_meeting_v2.sql (2026-08-11)
--
-- Mötesassistenten V2 — 90-minuters möten via SEGMENTROTATION.
--
-- BAKGRUND: dagens Mötesassistent spelar in ett enda ljudklipp per möte.
-- Whisper (och mobilens bakgrundskörning) klarar inte pålitligt en
-- sammanhängande 90-minuters inspelning. Lösningen: klienten spelar in
-- KOMPLETTA 5-minutersfiler (var och en självständigt avkodningsbar),
-- laddar upp varje fil till en privat bucket i taget, en worker
-- transkriberar varje segment separat via Whisper verbose_json och
-- raderar ljudet direkt efteråt, och en ren funktion
-- (lib/meetings/assemble-transcript.ts) sätter ihop den tidsstämplade
-- helhetstranskriptionen. Om ett segment misslyckas ska det synas som ett
-- explicit hål i transkriptet — aldrig en tyst lucka.
--
-- Två tabeller (meeting_job = mötets livscykel, meeting_segment = varje
-- 5-minutersbit), en kolumn för förmötespåminnelser på booking, och en
-- PRIVAT storage-bucket för ljudet (till skillnad från de publika
-- buckets som fixades i v48 — ljud ska ALDRIG vara publikt läsbart).
--
-- OBS (v115-lärdomen, upprepad i v117/v118): alla policys nedan har
-- EXPLICIT TO-klausul — utan den defaultar Postgres till PUBLIC och
-- tabellen läcker till anon-nyckeln.

-- ── 1. meeting_job — mötets livscykel ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meeting_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  customer_id TEXT,
  booking_id TEXT,
  status TEXT NOT NULL DEFAULT 'capturing'
    CHECK (status IN ('capturing','finalized','processing','ready','failed','abandoned')),
  segment_count INTEGER NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  recording_id TEXT,
  error TEXT,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.meeting_job IS
  'Mötesassistenten V2: ett 90-minutersmöte som samlas ihop av rullande 5-minutersegment. status: capturing (klienten spelar fortfarande in) → finalized (klienten är klar, worker får plocka upp) → processing (worker transkriberar) → ready/failed.';
COMMENT ON COLUMN public.meeting_job.recording_id IS
  'Soft TEXT-länk till call_recording.id när det färdiga transkriptet skrivits dit (husets konvention — inga FK på booking/call_recording).';

CREATE INDEX IF NOT EXISTS idx_meeting_job_business_status
  ON public.meeting_job (business_id, status);
CREATE INDEX IF NOT EXISTS idx_meeting_job_status
  ON public.meeting_job (status)
  WHERE status IN ('finalized','processing','capturing');

-- ── 2. meeting_segment — en rad per uppladdad 5-minutersfil ─────────────

CREATE TABLE IF NOT EXISTS public.meeting_segment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.meeting_job(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  storage_path TEXT,
  duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded','transcribed','failed')),
  transcript TEXT,
  whisper_segments JSONB,
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (job_id, seq)
);

COMMENT ON COLUMN public.meeting_segment.storage_path IS
  'Sökväg i meeting-audio-bucketen. Sätts till NULL av workern efter lyckad transkribering — ljudet raderas, bara texten sparas.';
COMMENT ON COLUMN public.meeting_segment.whisper_segments IS
  'Whisper verbose_json-segmenten [{start,end,text}] relativt segmentets egen start. Underlag för lib/meetings/assemble-transcript.ts.';

CREATE INDEX IF NOT EXISTS idx_meeting_segment_job
  ON public.meeting_segment (job_id, seq);

-- ── 3. RLS: service_role-only på båda tabellerna ─────────────────────────
-- Mötesassistenten går alltid via service-role-API-routes
-- (getAuthenticatedBusiness() i route-handlern) — inga authenticated-
-- policys behövs, klienten når aldrig dessa tabeller direkt.

ALTER TABLE public.meeting_job ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_job_service_role ON public.meeting_job;
CREATE POLICY meeting_job_service_role
  ON public.meeting_job FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.meeting_job FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.meeting_job TO service_role;

ALTER TABLE public.meeting_segment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS meeting_segment_service_role ON public.meeting_segment;
CREATE POLICY meeting_segment_service_role
  ON public.meeting_segment FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.meeting_segment FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.meeting_segment TO service_role;

-- ── 4. booking — förmötespåminnelse ──────────────────────────────────────
-- lib/meetings/reminder-window.ts avgör VILKA bokningar som ska påminnas
-- (rent, testbart); denna kolumn är bara kvittensen som hindrar dubbelpush.

ALTER TABLE public.booking
  ADD COLUMN IF NOT EXISTS meeting_reminder_pushed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.booking.meeting_reminder_pushed_at IS
  'Tidsstämpel när förmötespåminnelse-pushen skickades för Mötesassistenten. NULL = ej skickat.';

CREATE INDEX IF NOT EXISTS idx_booking_meeting_reminder
  ON public.booking (business_id, scheduled_start)
  WHERE meeting_reminder_pushed_at IS NULL;

-- ── 5. Privat storage-bucket för mötesljud ───────────────────────────────
-- Till skillnad från customer-documents/project-files (v48, publika) ska
-- meeting-audio ALDRIG vara publikt läsbart — det är kundsamtal. Ingen
-- SELECT-policy skapas på storage.objects för denna bucket: ljudet nås
-- ENDAST av workern via service-role (som bypassar RLS helt) och raderas
-- omedelbart efter lyckad transkribering. Ingen klient ska någonsin kunna
-- läsa eller lista filer i denna bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('meeting-audio', 'meeting-audio', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ── Verifiering (körs efteråt, läsande) ─────────────────────────────────
-- SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('meeting_job','meeting_segment');
--   → 2 rader
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='booking' AND column_name='meeting_reminder_pushed_at';
--   → 1 rad
--
-- SELECT id, public FROM storage.buckets WHERE id='meeting-audio';
--   → public = false
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('meeting_job','meeting_segment')
--   AND grantee IN ('anon','authenticated');
--   → noll rader
--
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename IN ('meeting_job','meeting_segment');
--   → båda med {service_role}
--
-- SELECT policyname FROM pg_policies
--   WHERE schemaname='storage' AND tablename='objects'
--   AND policyname ILIKE '%meeting%';
--   → noll rader (medvetet — service-role bypassar RLS)
