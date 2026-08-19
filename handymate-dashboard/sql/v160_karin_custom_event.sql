-- v160: Karins bolagskalender — egna poster (2026-08-19)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Bolagskalendern har hittills bara visat HÄRLEDDA myndighetsdatum
-- (lib/karin/obligations.ts). Andreas vill kunna lägga in egna poster —
-- "Semesterplanering", "Försäkringsgenomgång" — i samma kalender.
--
-- BESLUT: EGEN TABELL, INTE business_preferences
-- lib/karin/handled-store.ts lagrar "hanterad"-kvittenser i
-- business_preferences (nyckel-värde, en JSON-blob per business_id+key) —
-- rätt val DÄR eftersom det är en enda liten preferens. En lista av egna
-- kalenderposter är något annat: flera fristående rader som var och en ska
-- gå att RADERA INDIVIDUELLT (DELETE /api/karin/events/[id]), ha ett eget
-- skapandedatum och en egen ägare. Att tvinga in det i en JSON-blob hade
-- krävt läs-ändra-skriv med race-risk för varje litet tillägg/borttag —
-- exakt det en riktig tabell med PRIMARY KEY finns till för att undvika.
-- v94 (business_config) gör inte heller susen: det är företagsprofilen,
-- inte en händelselista. Minsta ärliga ingrepp här är alltså en ny tabell,
-- inte en ombyggnad av en befintlig.
--
-- SEMANTIK
-- category='egen' och source='egen' är redan förberedda i
-- lib/karin/calendar.ts (CalendarEvent.source/category) sedan V1 — det här
-- är första gången den grenen faktiskt fylls med data.
--
-- handled_at speglar handled-store.ts:s hanterad-semantik i SCHEMAT, men är
-- medvetet INTE den aktiva sanningskällan i V1: /api/karin/calendar
-- kvitterar/ångrar redan VILKEN händelse-id som helst (härledd eller egen)
-- via business_preferences (samma Kvittera/Ångra-knappar fungerar på egna
-- poster utan en rad ny kod, eftersom kvittens-systemet aldrig frågade vad
-- källan var). Att dessutom skriva samma tillstånd till handled_at hade gett
-- två sanningskällor för samma fråga — precis den fälla handled-store.ts:s
-- egen kommentar varnar för (N4). Kolumnen finns för framtida bruk (t.ex. en
-- egen "arkivera"-handling som inte ska gå igenom kvittens-flödet) men
-- lämnas NULL i V1.
--
-- Idempotent.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v160 kräver business_config';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.karin_custom_event (
  -- kce_<tidsstämpel>_<slump> — se app/api/karin/events/route.ts.
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  note TEXT,
  -- business_users.id — vem som lade in den. NULL om det inte gick att slå upp.
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Reserverad, se BESLUT ovan. Skrivs inte i V1.
  handled_at TIMESTAMPTZ
);

COMMENT ON COLUMN public.karin_custom_event.handled_at IS
  'Reserverad för framtida bruk. V1 använder business_preferences (samma kvittens-flöde som härledda poster) — se v160-kommentaren.';

CREATE INDEX IF NOT EXISTS idx_karin_custom_event_business_date
  ON public.karin_custom_event (business_id, event_date);

ALTER TABLE public.karin_custom_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.karin_custom_event FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.karin_custom_event TO service_role;
CREATE POLICY karin_custom_event_service_role ON public.karin_custom_event
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- ═══ KONTROLL ═══
-- SELECT id, business_id, title, event_date, note, created_by, created_at, handled_at
-- FROM public.karin_custom_event
-- ORDER BY created_at DESC
-- LIMIT 20;
