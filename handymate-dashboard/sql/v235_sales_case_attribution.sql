-- v235 (2026-09-15): saljgenomgangen bar partnerns attribution.
--
-- BESLUT Andreas 2026-09-15: partners ska kunna SKAPA case, inte bara visa
-- materialet — och da maste deras attribution folja med in i onboardingen.
--
-- VARFOR EN KOLUMN OCH INTE payload. Attributionen ar ett loffe om PENGAR
-- (lib/partners/commission.ts skriver en rad per partner x kund x manad).
-- Ett sadant faltum far inte ligga i en jsonb-klump som ags av sidans
-- design och kan bytas ut nasta gang kanvasen andras.
--
-- HALET DEN STANGER. Attributionen fryses en gang, vid kontoskapandet:
-- POST /api/auth laser referralCode och claimPartnerAttribution later den
-- atomiska RPC:n avgora. Koden kommer fran ?ref= som forifyller faltet i
-- Step2Business (rad 38). Case-lanken bar i dag INGEN kod — prefillFranCase
-- satter foretagsnamn, org.nr, bolagsform, adress, bransch och ort och
-- inget mer. En partner som gjorde hela genomgangen med sin kund och
-- skickade lanken fick alltsa kunden in med allt ifyllt UTOM det som gor
-- kunden till partnerns. Skrev kunden inte in koden sjalv var affaren
-- oattribuerad och provisionsledgern fick aldrig en rad.
--
-- referral_code satts ALLTID serverside ur partnerns egen rad, aldrig ur
-- anropets body: en kod fran klienten ar en kod nagon annan kan gora
-- ansprak pa. Sjalva bedomningen (self_referral, already_attributed,
-- agreement_not_current ...) gors fortfarande av claimPartnerAttribution
-- vid registreringen — tva domare skulle glida isar.

ALTER TABLE sales_case ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE sales_case ADD COLUMN IF NOT EXISTS created_by_partner_id UUID;

CREATE INDEX IF NOT EXISTS idx_sales_case_partner
  ON sales_case(created_by_partner_id)
  WHERE created_by_partner_id IS NOT NULL;
