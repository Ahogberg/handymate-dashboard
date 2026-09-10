-- 2026-09-10: avsändarnamnet i kundens mobil
--
-- Provsamtalet kl 07:30 gav ett SMS från avsändaren "Test". Orsaken var inte
-- ett tenantläckage utan data: business_config.display_name på Nordström El
-- (biz_al7pjuu5smi) stod som 'Test' sedan kontot sattes upp, och display_name
-- är det som skickas som businessName till sendSmsViaElks (sanitizeSenderId).
--
-- "Nordström El AB" → företagsformen strippas → translittereras →
-- "NordstromEl", exakt 11 tecken, vilket är 46elks tak för alfanumerisk
-- avsändare. Konfigurationen skrivs alltså om till företagets riktiga namn.
--
-- Avgränsat till ett business_id. Kör en SELECT direkt efteråt.

UPDATE business_config
SET display_name = 'Nordström El',
    updated_at = NOW()
WHERE business_id = 'biz_al7pjuu5smi'
  AND display_name = 'Test';
