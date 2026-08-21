-- v164: E-faktura till foretagskunder via Fortnox
--
-- gln_number pa customer ar den "vaxel" som styr om en faktura skickas som
-- e-faktura via Fortnox (GET /invoices/{DocumentNumber}/einvoice) istallet
-- for Handymates egen PDF/email/SMS-leverans. Ifylld GLN = kunden vill ha
-- e-faktura; tom = oforandrat beteende. Ingen separat toggle behovs.
--
-- fortnox_einvoice_sent_at pa invoice later sendInvoice() veta, aven pa den
-- idempotenta retry-vagen (Fortnox redan bokford, bara leveransen om), om
-- e-fakturan redan gick ivag forra forsoket — annars skulle en retry kunna
-- falla tillbaka till PDF/email trots att e-fakturan redan levererats.

ALTER TABLE customer ADD COLUMN IF NOT EXISTS gln_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fortnox_einvoice_sent_at TIMESTAMPTZ;
