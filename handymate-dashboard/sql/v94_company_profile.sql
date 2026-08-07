-- ═══════════════════════════════════════════════════════════════════════════
-- v94 — Företagsprofilen: det Karins bolagskalender räknar deadlines ur
-- ═══════════════════════════════════════════════════════════════════════════
--
-- VARFÖR
--
-- En sökning över hela sql/ på fiscal|räkenskap|bokslut|moms_period|vat_period
-- ger noll träffar. Systemet vet alltså ingenting om företagets skatterytm —
-- och utan den går det inte att säga när momsen förfaller.
--
-- Fälten nedan är EXAKT de som styr en deadline. Inget mer. Allt annat i
-- specens onboardinglista (försäkringar, leasing, fordon, kollektivavtal)
-- är avtalshändelser och hör till en senare etapp.
--
-- VARFÖR PROVENANCE PER PROFIL
--
-- Bolagsverkets och SCB:s "värdefulla datamängder" är avgiftsfria och kan ge
-- namn, bolagsform, säte och SNI-kod. Skatteregistreringarna (F-skatt, moms,
-- arbetsgivare) ligger däremot hos Skatteverket bakom en gated portal och
-- måste frågas i onboardingen.
--
-- Gränssnittet måste kunna skilja de två: "registrerat hos Bolagsverket" är
-- något annat än "du svarade det här i onboardingen", och bara det ena går
-- att lita på utan att fråga igen. Därför källa och tidsstämpel.
--
-- Kör i Supabase SQL Editor. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Bolagets form och räkenskapsår ────────────────────────────────────────
-- Bolagsformen avgör vilka skyldigheter som alls gäller: ett aktiebolag ska
-- lämna årsredovisning till Bolagsverket, en enskild firma ska inte.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS company_form TEXT;

COMMENT ON COLUMN business_config.company_form IS
  'ab | ef | hb | kb | ekonomisk_forening | annat. Styr vilka skyldigheter som gäller — AB lämnar årsredovisning, enskild firma gör inte.';

-- Räkenskapsårets SLUTMÅNAD (1–12). 12 = kalenderår, vilket nästan alla
-- hantverksbolag har. Brutet räkenskapsår förskjuter både inkomstdeklaration
-- och årsredovisning, så månaden räcker — datumet är alltid månadens sista.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS fiscal_year_end_month SMALLINT;

ALTER TABLE business_config
  DROP CONSTRAINT IF EXISTS business_config_fiscal_year_end_month_range;

ALTER TABLE business_config
  ADD CONSTRAINT business_config_fiscal_year_end_month_range
  CHECK (fiscal_year_end_month IS NULL OR fiscal_year_end_month BETWEEN 1 AND 12);

COMMENT ON COLUMN business_config.fiscal_year_end_month IS
  'Räkenskapsårets slutmånad 1-12. 12 = kalenderår. NULL = ovetande; kalendern antar då inget utan frågar.';

-- ─── Moms ──────────────────────────────────────────────────────────────────
-- Momsperioden är den enskilt viktigaste uppgiften i hela profilen: den avgör
-- både HUR OFTA och VILKET DATUM momsdeklarationen ska in.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS vat_period TEXT;

ALTER TABLE business_config
  DROP CONSTRAINT IF EXISTS business_config_vat_period_values;

ALTER TABLE business_config
  ADD CONSTRAINT business_config_vat_period_values
  CHECK (vat_period IS NULL OR vat_period IN ('month', 'quarter', 'year', 'none'));

COMMENT ON COLUMN business_config.vat_period IS
  'month | quarter | year | none. Avgör både frekvens och förfallodatum för momsdeklarationen. none = ej momsregistrerad.';

-- ─── Arbetsgivare ──────────────────────────────────────────────────────────
-- Arbetsgivardeklarationen (AGI) och arbetsgivaravgifterna gäller BARA den
-- som betalar ut lön. En enmansfirma utan anställda ska inte påminnas om den.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS is_employer BOOLEAN;

COMMENT ON COLUMN business_config.is_employer IS
  'Betalar företaget ut lön? Styr arbetsgivardeklaration och arbetsgivaravgifter. NULL = ovetande.';

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS employee_count SMALLINT;

-- ─── Redovisningsbyrå ──────────────────────────────────────────────────────
-- Där Karins säkerhet är låg ska hon säga "kolla med din redovisningsbyrå" —
-- och då ska hon kunna säga vem det är.
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS accounting_firm TEXT;

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS accounting_contact TEXT;

-- ─── Provenance ────────────────────────────────────────────────────────────
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS company_profile_source TEXT;

ALTER TABLE business_config
  DROP CONSTRAINT IF EXISTS business_config_company_profile_source_values;

ALTER TABLE business_config
  ADD CONSTRAINT business_config_company_profile_source_values
  CHECK (company_profile_source IS NULL OR company_profile_source IN ('bolagsverket', 'user', 'mixed'));

COMMENT ON COLUMN business_config.company_profile_source IS
  'bolagsverket | user | mixed. Gränssnittet ska kunna skilja registrerad uppgift från något användaren svarat — bara det ena går att lita på utan att fråga igen.';

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS company_profile_fetched_at TIMESTAMPTZ;

-- ═══ KONTROLL ═══
-- SELECT business_id, business_name, org_number, company_form, vat_period,
--        is_employer, fiscal_year_end_month, f_skatt_registered,
--        company_profile_source, company_profile_fetched_at
-- FROM business_config;
