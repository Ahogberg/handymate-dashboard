-- ============================================================================
-- v107 — Referral-attribution: vem genererade leaden?
-- ============================================================================
-- Epic C i lead-intake-sprinten (tasks/lead-intake-granskning-2026-08-10.md +
-- tasks/hanna-sales-engine-v2-spec.md spel 1). Målet: "Johansson har genererat
-- 2 leads, 1 vunnet jobb, 148 000 kr" ska vara ett SANT påstående räknat via
-- attributionskärnan — aldrig en anekdot.
--
-- referral_customer_id = den BEFINTLIGA kund vars rekommendation/länk ledde
-- hit. Sätts av referral-länksflödet vid intag; följer med lead → deal så
-- vunnet värde kan attribueras källkunden.
--
-- FK:erna läggs NOT VALID (v87-mönstret): befintliga rader blockerar inte,
-- valideras separat när det passar. ON DELETE SET NULL — raderas källkunden
-- ska leaden/dealen leva vidare, bara utan attribution.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

-- ── 1. Kolumnerna ──────────────────────────────────────────────────
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_customer_id TEXT;
ALTER TABLE deal  ADD COLUMN IF NOT EXISTS referral_customer_id TEXT;

COMMENT ON COLUMN leads.referral_customer_id IS
  'Befintlig kund (customer.customer_id) vars rekommendation genererade leaden. Sätts av referral-flödet; grunden för "kund X har genererat Y kr".';
COMMENT ON COLUMN deal.referral_customer_id IS
  'Ärvs från leaden vid deal-skapande så vunnet värde kan attribueras källkunden utan join mot leads.';

-- ── 2. FK:er (NOT VALID — validera separat) ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_referral_customer_id_fkey') THEN
    ALTER TABLE leads
      ADD CONSTRAINT leads_referral_customer_id_fkey
      FOREIGN KEY (referral_customer_id) REFERENCES customer(customer_id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deal_referral_customer_id_fkey') THEN
    ALTER TABLE deal
      ADD CONSTRAINT deal_referral_customer_id_fkey
      FOREIGN KEY (referral_customer_id) REFERENCES customer(customer_id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

-- ── 3. Nytt källvärde 'referral' i valid_source ───────────────────
-- Postgres tillåter inte ALTER CHECK — DROP + ADD (samma som v56).
-- Listan = v56:s sex värden + referral. Ändras listan igen: uppdatera HÄR,
-- i lib/leads/golden-path.ts-dokumentationen och i alla intag som väljer källa.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS valid_source;
ALTER TABLE leads ADD CONSTRAINT valid_source CHECK (source IN (
  'vapi_call',
  'inbound_sms',
  'website_form',
  'manual',
  'email_lead',
  'email_forward',
  'referral'         -- Epic C: lead via befintlig kunds rekommendationslänk
));

-- ── 4. Index för attributionsfrågan ("alla leads från kund X") ────
CREATE INDEX IF NOT EXISTS idx_leads_referral_customer
  ON leads(business_id, referral_customer_id)
  WHERE referral_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_referral_customer
  ON deal(business_id, referral_customer_id)
  WHERE referral_customer_id IS NOT NULL;

-- ═══ VERIFIERING ═══
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('leads_referral_customer_id_fkey', 'deal_referral_customer_id_fkey', 'valid_source');
