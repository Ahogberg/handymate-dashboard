-- V45: internal_notes på time_entry
--
-- En anteckning från medarbetaren som BARA syns internt — aldrig på faktura
-- eller i kund-vänd vy. Komplement till `description`, som faktiskt går till
-- kund som fakturarad-text.

ALTER TABLE time_entry
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;
