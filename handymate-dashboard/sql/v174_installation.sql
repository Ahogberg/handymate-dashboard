-- v174: Installationsregistret (Fastighetspasset steg 2)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Jobbpasset (v154) säger vad som gjordes. Det säger inte vad som SITTER hos
-- kunden: värmepumpen i pannrummet, laddboxen på garageväggen, beredaren i
-- tvättstugan — med tillverkare, modell, serienummer och när den sattes in.
-- Utan det finns ingen tillgång att knyta garanti, service och återkommande
-- intäkt till. Kedjan: utfört arbete → installerad tillgång → (garanti) →
-- servicebehov → återkommande intäkt.
--
-- BESLUT (Andreas sanningsgrindar 2026-08-27)
-- 1. project_material får BARA skapa utkast (status 'draft', source
--    'project_material'). Inköpt/förbrukat material är inte bevis för att
--    produkten installerades — hantverkaren bekräftar.
-- 2. Serienummer blockerar aldrig projektavslut. Raden bär serial_pending
--    ("komplettera senare") och status 'not_applicable' ("ej tillämpligt").
--    Lars frågar bara när projektet är relevant (material finns eller
--    projektnamnet/-beskrivningen pekar på en installation) — se
--    lib/installation/installation.ts (installationRelevance).
-- 4. Serviceintervall bara med källa: 'product_info' (bekräftad produkt-
--    information) eller 'craftsman' (hantverkarens eget val). Aldrig en
--    modellgissning — CHECK-villkoret nedan gör intervall utan källa
--    omöjligt att spara.
-- +  Adress-/platsögonblicksbild från projektet (site_*): samma kund kan ha
--    flera fastigheter och project saknar adresskolumn. Ögonblicksbilden tas
--    ur kundens adress vid utkastet och är redigerbar per rad — aldrig en FK
--    till en fastighetsentitet som inte finns än.
--
-- Garanti (grind 3) ligger INTE här — den kommer i steg 3 som egen rad med
-- typ, garantigivare och källa. Ingen kolumn lovar något i förskott.
--
-- Bara rader med status 'confirmed' når kundvyn (jobbpass/portal).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.project') IS NULL
     OR to_regclass('public.business_config') IS NULL
     OR to_regclass('public.customer') IS NULL
     OR to_regclass('public.project_material') IS NULL THEN
    RAISE EXCEPTION 'v174 kräver project, business_config, customer och project_material';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.installation (
  installation_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  customer_id TEXT
    REFERENCES public.customer(customer_id) ON DELETE SET NULL,
  project_id TEXT
    REFERENCES public.project(project_id) ON DELETE SET NULL,
  -- Materialraden utkastet kom ifrån (grind 1). Raderas materialet lever
  -- installationen kvar — det är den som sitter hos kunden.
  material_id TEXT
    REFERENCES public.project_material(material_id) ON DELETE SET NULL,

  -- Vad
  name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  -- "Komplettera senare" — hantverkaren har inte serienumret till hands.
  -- Blockerar inget; visas som en öppen punkt för ägaren, aldrig för kunden.
  serial_pending BOOLEAN NOT NULL DEFAULT FALSE,
  sku TEXT,
  supplier_name TEXT,
  placement TEXT,

  -- Var — ögonblicksbild, inte relation
  site_address_line TEXT,
  site_postal_code TEXT,
  site_city TEXT,
  site_property_designation TEXT,

  -- När
  installed_at DATE,

  -- Sanning
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'confirmed', 'not_applicable')),
  confirmed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('project_material', 'manual')),

  -- Service (grind 4)
  service_interval_months INTEGER
    CHECK (service_interval_months IS NULL OR service_interval_months BETWEEN 1 AND 240),
  service_interval_source TEXT
    CHECK (service_interval_source IS NULL OR service_interval_source IN ('product_info', 'craftsman')),
  service_note TEXT,
  care_instructions TEXT,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Intervall och källa följs åt: båda eller ingen.
  CONSTRAINT installation_interval_needs_source CHECK (
    (service_interval_months IS NULL) = (service_interval_source IS NULL)
  ),
  -- Bekräftad ⇒ tidsstämpel; obekräftad ⇒ ingen.
  CONSTRAINT installation_confirmed_has_stamp CHECK (
    (status = 'confirmed') = (confirmed_at IS NOT NULL)
  )
);

-- Ett materialutkast per materialrad — sync:en är idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_installation_material
  ON public.installation (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_installation_business_project
  ON public.installation (business_id, project_id);
CREATE INDEX IF NOT EXISTS idx_installation_business_customer
  ON public.installation (business_id, customer_id);

COMMENT ON COLUMN public.installation.status IS
  'draft = utkast (t.ex. ur project_material, bevisar inget) · confirmed = hantverkaren har bekräftat att den sitter hos kunden · not_applicable = ingen installation (t.ex. förbrukningsmaterial)';
COMMENT ON COLUMN public.installation.service_interval_source IS
  'product_info = bekräftad produktinformation · craftsman = hantverkarens eget val. Aldrig en modellgissning (grind 4).';
COMMENT ON COLUMN public.installation.site_address_line IS
  'Ögonblicksbild av platsen vid registreringen — kunden kan ha flera fastigheter, project saknar adress.';

ALTER TABLE public.installation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.installation FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.installation TO service_role;
CREATE POLICY installation_service_role ON public.installation
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'installation'
-- ORDER BY ordinal_position;
--
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint WHERE conrelid = 'public.installation'::regclass;
