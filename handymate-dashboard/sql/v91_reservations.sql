-- v91: reservationsmotorn
-- Kör manuellt i Supabase SQL Editor. Idempotent.
-- =============================================================================
--
-- VAD: "Reservationer" i en svensk hantverksoffert är förbehåll som skyddar
-- hantverkaren mot det oförutsedda — "Reservation för dolda fel i bjälklag",
-- "Priset förutsätter att befintligt tätskikt är helt", "Eventuell
-- asbestsanering tillkommer enligt löpande räkning".
--
-- VARFÖR: hantverkare förlorar pengar på problem de inte reserverat sig för,
-- och i dag finns bara ETT fritextfält (quotes.not_included) som ingen orkar
-- fylla i per offert. Genom att koppla reservationer till ARTIKLAR kan
-- systemet föreslå rätt förbehåll medan offerten byggs.
--
-- DESIGNBESLUT — tre triggertyper, alla tre behövs:
--   product  — mest precis, men AI- och fritextrader saknar linked_product_id
--   category — täcker brett (samma mönster som quote_categories redan bär
--              rot_eligible), men för grov ensam: "arbete_bygg" ⇏ asbest
--   keyword  — fångar AI- och fritextrader, och är det ENDA vi kan seeda
--              meningsfullt innan kundens produktbank hunnit fyllas
--
-- DEDUPE blir gratis: flera triggers pekar på samma reservation_id, och
-- matchningen unionerar per reservation → två artiklar som båda utlöser
-- asbest ger ETT förslag med båda källraderna som motivering.
--
-- Verifiering efter körning:
--   SELECT COUNT(*) FROM reservation_texts;
--   SELECT trigger_type, COUNT(*) FROM reservation_triggers GROUP BY 1;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name = 'quotes' AND column_name = 'reservations_snapshot';

-- ============================================================
-- 1. Reservationsbiblioteket
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_texts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,

  -- Kort etikett i UI ("Dolda fel i bjälklag")
  title TEXT NOT NULL,
  -- Själva förbehållstexten som hamnar i kundens dokument
  content TEXT NOT NULL,

  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('system', 'custom')),
  -- Stabil nyckel för seed-idempotens och för att inlärningen ska överleva
  -- att biblioteket seedas om ('res_asbest')
  system_key TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Inlärning: sätts false automatiskt efter tre avvisningar i rad
  suggest_enabled BOOLEAN NOT NULL DEFAULT true,
  times_suggested INTEGER NOT NULL DEFAULT 0,
  times_accepted INTEGER NOT NULL DEFAULT 0,
  consecutive_rejects INTEGER NOT NULL DEFAULT 0,

  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservation_texts_business
  ON reservation_texts(business_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservation_texts_system_key
  ON reservation_texts(business_id, system_key) WHERE system_key IS NOT NULL;

-- ============================================================
-- 2. Triggers — vad som utlöser en reservation
-- ============================================================
CREATE TABLE IF NOT EXISTS reservation_triggers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  reservation_id TEXT NOT NULL REFERENCES reservation_texts(id) ON DELETE CASCADE,

  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('product', 'category', 'keyword')),
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  category_slug TEXT,
  -- Lagras gemener; matchas mot radens beskrivning
  keyword TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  CHECK (
    (trigger_type = 'product'  AND product_id    IS NOT NULL) OR
    (trigger_type = 'category' AND category_slug IS NOT NULL) OR
    (trigger_type = 'keyword'  AND keyword       IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reservation_triggers_business
  ON reservation_triggers(business_id);
CREATE INDEX IF NOT EXISTS idx_reservation_triggers_reservation
  ON reservation_triggers(reservation_id);

-- ============================================================
-- 3. Snapshot på offerten
-- ============================================================
-- Samma juridiska princip som quote_items.component_snapshot (v67:99):
-- offerten är fristående. Ändras bibliotekstexten i efterhand får det ALDRIG
-- ändra en offert som redan skickats till kund.
--
-- Reservationer är dokumentnivå-juridik, inte prissatta rader — därför JSONB
-- på quotes, inte rader i quote_items.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS reservations_snapshot JSONB;

COMMENT ON COLUMN quotes.reservations_snapshot IS
  'Fryst kopia [{reservation_id, title, content}] vid tillägget. Biblioteksändringar påverkar ALDRIG en skapad offert.';

-- ============================================================
-- 4. RLS (v67-mönstret)
-- ============================================================
ALTER TABLE reservation_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service reservation_texts" ON reservation_texts;
CREATE POLICY "Service reservation_texts" ON reservation_texts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service reservation_triggers" ON reservation_triggers;
CREATE POLICY "Service reservation_triggers" ON reservation_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Reservationsbiblioteket läses bara via API:t (service role), aldrig direkt
-- av webbläsaren — därför är den snäva user-policyn trygg här, till skillnad
-- från products (se v89:s varning).
DROP POLICY IF EXISTS "User reservation_texts" ON reservation_texts;
CREATE POLICY "User reservation_texts" ON reservation_texts FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id::text = auth.uid()::text
    UNION
    SELECT business_id FROM business_users  WHERE user_id::text = auth.uid()::text
  )
);
DROP POLICY IF EXISTS "User reservation_triggers" ON reservation_triggers;
CREATE POLICY "User reservation_triggers" ON reservation_triggers FOR ALL USING (
  business_id IN (
    SELECT business_id FROM business_config WHERE user_id::text = auth.uid()::text
    UNION
    SELECT business_id FROM business_users  WHERE user_id::text = auth.uid()::text
  )
);
