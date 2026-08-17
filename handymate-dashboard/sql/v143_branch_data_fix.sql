-- v143_branch_data_fix.sql
--
-- Bakgrund (2026-08-17): lib/product-defaults.ts:getDefaultProducts() slår
-- upp branschsortiment via BRANCH_PRODUCTS[branch] — en sluten uppsättning
-- nycklar (electrician, construction, plumber, carpenter, painter, roofing,
-- flooring, gardening, cleaning, moving, hvac, locksmith, other). Ett
-- business_config.branch-värde som inte matchar någon nyckel faller TYST
-- tillbaka på den generiska 12-artikel-listan ('other') — ingen krasch, men
-- kontot får aldrig sitt riktiga branschsortiment.
--
-- Tre konton upptäcktes med den här luckan när backfill-products kördes som
-- torrkörning: deras lagrade branschvärde är fritext/en äldre etikett som
-- aldrig matchat BRANCH_PRODUCTS-nycklarna.
--
--   business_id            lagrat värde         rättas till
--   bee_services_ab_te6uga "hantverkare"        electrician (+ secondary: construction)
--   elexperten_sthlm       "hantverkare"        electrician
--   biz_kqd07pm4ll         "general_contractor" construction
--
-- Bee bekräftad av Andreas (både elektriker och byggföretag — ska ha båda
-- sortimenten). elexperten_sthlm och biz_kqd07pm4ll bekräftade 2026-08-17.
--
-- KÖRS INNAN backfill-products (dryRun:false) — annars seedas dessa tre med
-- fel/generiskt sortiment och en separat complement-körning hade krävts.
--
-- Verifiera INNAN körning:
select business_id, business_name, branch, secondary_branches
from business_config
where business_id in ('bee_services_ab_te6uga', 'elexperten_sthlm', 'biz_kqd07pm4ll');

-- Kör:
update business_config
set branch = 'electrician',
    secondary_branches = array['construction']
where business_id = 'bee_services_ab_te6uga';

update business_config
set branch = 'electrician'
where business_id = 'elexperten_sthlm';

update business_config
set branch = 'construction'
where business_id = 'biz_kqd07pm4ll';

-- Verifiera EFTER körning — samma tre rader, nu med rätt branschvärden:
select business_id, business_name, branch, secondary_branches
from business_config
where business_id in ('bee_services_ab_te6uga', 'elexperten_sthlm', 'biz_kqd07pm4ll');
