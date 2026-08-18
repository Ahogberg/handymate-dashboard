-- v154: Jobbpass V1 (Closeout-to-Lifetime, Etapp Ä)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- När ett projekt avslutas föreslår Lars ett digitalt jobbpass till kunden:
-- en samlad, kundsäker vy över accepterad omfattning, godkända ÄTA, utfört
-- arbete, UTVALDA foton, egenkontroll, fakturareferens och standardgaranti.
-- V1 kopierar ingenting — kundvyn (lib/jobbpass/jobbpass.ts) läser alltid
-- BEFINTLIGA rader direkt vid visning. Den här tabellen bär bara det som
-- inte finns någon annanstans: vilka foton ägaren har valt, om kunden fått
-- frågan om framtida service, publiceringsstatus och den publika token.
--
-- BESLUT
-- Egen liten tabell, inte ett JSONB-fält på project — jobbpasset har en egen
-- livscykel (draft → published) och en egen publik token, till skillnad från
-- automation_settings.owner_absence (sql/v153) som bara är en inställning.
-- Ett projekt kan ha högst ETT jobbpass (UNIQUE(project_id)) — V1 föreslår
-- aldrig fler än ett per avslut.
--
-- selected_photo_ids lagrar project_document.id (INTE lagringspath rakt av)
-- — en id-referens är stabil även om filen döps om eller flyttas, och
-- API-rutten slår alltid upp den FÄRSKA project_document-raden (fil-path,
-- mime-typ) vid varje läsning i stället för att frysa en path som kan bli
-- inaktuell. Samma "referens, aldrig kopia"-princip som
-- lib/projects/commercial-readiness.ts (EvidenceRef).
--
-- token genereras FÖRST vid publicering (status='published') — en draft-rad
-- har ingen giltig publik länk, vilket den publika rutten också verifierar
-- explicit (status måste vara 'published', inte bara "token finns").

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project') IS NULL
     OR to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v154 kräver project och business_config';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.jobbpass (
  -- jp_<slumpsträng> — se lib/jobbpass/jobbpass.ts (jobbpassId()).
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL
    REFERENCES public.project(project_id) ON DELETE CASCADE,

  -- Ägarens urval — id:n mot project_document, aldrig automatiskt.
  selected_photo_ids JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Kundens (eller ägarens å kundens vägnar) samtycke till en framtida
  -- service-påminnelse. Läses av befintliga eftermarknadsflöden — se
  -- getJobbpassServiceConsent i lib/jobbpass/jobbpass.ts. Ingen cron i V1.
  service_consent BOOLEAN NOT NULL DEFAULT FALSE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  token TEXT UNIQUE,
  published_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT jobbpass_one_per_project UNIQUE (project_id),
  CONSTRAINT jobbpass_published_has_token CHECK (
    (status = 'draft' AND token IS NULL AND published_at IS NULL)
    OR (status = 'published' AND token IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_jobbpass_business
  ON public.jobbpass (business_id);

ALTER TABLE public.jobbpass ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jobbpass FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.jobbpass TO service_role;
CREATE POLICY jobbpass_service_role ON public.jobbpass
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT id, business_id, project_id, status, service_consent,
--        jsonb_array_length(selected_photo_ids) AS antal_foton,
--        token IS NOT NULL AS har_token, published_at
-- FROM public.jobbpass
-- ORDER BY created_at DESC
-- LIMIT 20;
