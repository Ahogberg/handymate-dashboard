-- v75_website_url.sql
-- Hemsida-förgreningen (Del 1) — se tasks/hemsida-forgrening-spec.md.
--
-- Lagrar kundens egna hemsida, insamlad i onboardingen (Step2Business,
-- "Har du en hemsida?"). Fältet styr synlighetsvägen efter onboarding:
--   - satt (kunden har egen sajt)   → visa widget-vägen ("AI på hemsidan")
--                                      + Google-recensionsslussen
--   - null (kunden saknar egen sajt) → erbjud microsajten (/dashboard/website)
--
-- Körs MANUELLT av Andreas i Supabase SQL Editor. Koden (app/api/onboarding/
-- route.ts, app/api/onboarding/scrape-website/route.ts, app/dashboard/page.tsx)
-- TÅL att kolumnen saknas fram tills detta körs — se
-- isMissingWebsiteUrlColumn()-mönstret i app/api/onboarding/route.ts (samma
-- mönster som terms_text i app/api/quote-templates/route.ts).

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN business_config.website_url IS
  'Kundens egen hemsida, insamlad i onboardingen (hemsida-förgreningen, 2026-07). '
  'Styr synlighetsvägen efter onboarding: satt → widget + Google-recensioner, '
  'null → erbjud microsajten. Aldrig gissad — antingen angiven av kunden eller null.';

-- Verifiering (kör efter ALTER TABLE ovan):
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'business_config' AND column_name = 'website_url';
