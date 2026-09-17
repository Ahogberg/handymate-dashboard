-- v256 (2026-09-17): vem gick in i det delade demokontot, och när.
--
-- Andreas beslut: alla partners delar ETT demokonto, och vägen in är en knapp
-- i portalen utan inloggningsuppgifter. Då behövs en logg — delar tio partners
-- ett konto och någon nollställer det mitt i en annans möte, är "vem var inne"
-- den enda fråga som går att besvara efteråt.
--
-- Loggen bär INTE magiclänken. Länken är en engångsnyckel till demokontots
-- session; den ska aldrig hamna i en tabell, en logg eller ett felmeddelande.
--
-- Verifierat läsande 2026-09-17: ingen partner_activity-tabell finns, så den
-- här är ny. partners.id är uuid (lib/partners/auth.ts).

CREATE TABLE IF NOT EXISTS public.partner_demo_entry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners (id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_demo_entry_partner_idx
  ON public.partner_demo_entry (partner_id, created_at DESC);

COMMENT ON TABLE public.partner_demo_entry IS
  'Varje gång en partner öppnar det delade demokontot från portalen. Bär aldrig magiclänken.';

-- Bara service_role. En partner ska inte kunna läsa vilka andra partners som
-- demat, och ingen tenant har något ärende här.
ALTER TABLE public.partner_demo_entry ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_demo_entry FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.partner_demo_entry TO service_role;

-- Read-only verifiering efter körning:
SELECT count(*) AS rader FROM public.partner_demo_entry;
SELECT relrowsecurity FROM pg_class WHERE oid = 'public.partner_demo_entry'::regclass;
