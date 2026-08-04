-- ETAPP 6c (offert-masterplan.md, faktura-sprinten) — Andreas kör manuellt.
--
-- Fakturan hade ingen egen stilkolumn (till skillnad från quotes.template_style)
-- — HTML/PDF-vägen valde ENDAST via business_config.quote_template_style
-- (se app/api/invoices/pdf/route.ts, lib/invoices/build-invoice-pdf.ts).
-- Fakturaskaparens nya Stil-väljare (QuoteStylePicker, kind="invoice") vore
-- meningslös utan en plats att spara valet — samma mönster som offerten.
--
-- NULL = ingen override → business default används (oförändrat beteende
-- för alla befintliga fakturor).

ALTER TABLE invoice ADD COLUMN IF NOT EXISTS template_style TEXT;

-- Valfri integritetskoll (körs manuellt, inte del av migrationen):
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'invoice' AND column_name = 'template_style';
