-- STEG 2: Välkomst-SMS vid första portalinteraktion
-- Spår om vi redan skickat portal-välkomsten till kunden

ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_welcomed BOOLEAN DEFAULT false;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_welcomed_at TIMESTAMPTZ;
