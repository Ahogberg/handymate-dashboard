-- v231: sales_case — säljgenomgången överlever resan från säljarens skärm
-- till kundens, och in i onboardingen.
--
-- Bakgrund (2026-09-12, Andreas). Handymate Sales Experience bygger en
-- personlig genomgång tillsammans med kunden i mötet och skickar den sedan
-- som en personlig länk. Prototypen sparade caset i localStorage under
-- nyckeln `hm_sales_case`.
--
-- Det bär inte den överlämning som räknas. localStorage är per origin OCH
-- per webbläsare: säljarens browser har caset, kundens har det inte. Öppnar
-- prospektet sin personliga länk på sin egen dator får de demodatan
-- (Svenssons El AB) i stället för sin egen genomgång. Samma vägg står mellan
-- "Kom igång"-knappen och onboardingens förifyllning.
--
-- Därför en rad i databasen med en token i länken — samma mönster som
-- kundportalen (lib/portal-link.ts: customer.portal_token + en
-- token-upplösare på servern).
--
-- ═══ ÅTKOMST ═══
--
-- RLS är PÅ och tabellen har MEDVETET inga policyer. Varken anon eller
-- authenticated kommer åt raderna direkt; all åtkomst går genom
-- app/api/sales-case/*, som äger grindarna:
--   - POST /api/sales-case kräver inloggad session (säljaren).
--   - GET /api/sales-case/[token] är publik — TOKEN ÄR LEGITIMATIONEN,
--     precis som portallänkarna. Därför är token en uuid (122 bitar
--     entropi), aldrig ett löpnummer, och raden går ut efter 90 dagar.
--
-- Payloaden innehåller vad kunden själv berättat i mötet (antal personer,
-- timmar, smärtpunkt) plus vår rekommendation. Ingen personuppgift utöver
-- kontaktpersonens namn och e-post, som kunden lämnat för att få länken.
--
-- Kör: hela filen.

CREATE TABLE IF NOT EXISTS public.sales_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Legitimationen i den personliga länken. UNIQUE så ett uppslag aldrig
  -- kan råka träffa fler än en rad.
  token text NOT NULL UNIQUE,

  -- Denormaliserat ur payloaden: det säljaren behöver se i en lista utan
  -- att packa upp jsonb, och det onboardingen förifyller först.
  business_name text NOT NULL,
  org_number text,

  prospect_name text,
  prospect_email text,

  -- Hela genomgången som Sales Experience byggde den. Formen ägs av
  -- lib/sales/sales-case.ts, inte av databasen — därför jsonb.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Vem skapade caset. business_id är förberedelse för partnerportalen,
  -- där en partner ska se sina egna case och ingen annans.
  created_by_user_id uuid,
  created_by_business_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  -- 90 dagar: länken ska gå att öppna "när ni vill" enligt sidans egen
  -- text, men inte för alltid.
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),

  -- Första gången kunden öppnade länken. Stämplas av GET-routen. Ett
  -- säljsignalvärde: en genomgång som aldrig öppnats är inte samma sak som
  -- en som lästs tre gånger.
  opened_at timestamptz,

  -- Satt när caset faktiskt blev ett konto. Svarar på frågan "ledde
  -- genomgången till en registrering?" utan att gissa.
  consumed_at timestamptz,
  consumed_by_business_id text
);

-- Säljarens egen lista i partnerportalen, nyaste först.
CREATE INDEX IF NOT EXISTS sales_case_created_by_idx
  ON public.sales_case (created_by_business_id, created_at DESC);

-- Städsvep av utgångna case (ingen cron byggd än — indexet finns för den).
CREATE INDEX IF NOT EXISTS sales_case_expires_idx
  ON public.sales_case (expires_at);

ALTER TABLE public.sales_case ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sales_case IS
  'Personlig säljgenomgång (Handymate Sales Experience). Token i länken är legitimationen — RLS är på utan policyer, all åtkomst går genom app/api/sales-case/*. Se v231.';
