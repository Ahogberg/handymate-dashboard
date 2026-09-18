-- v260: sms_conversation får en identitet, inte bara en telefonsträng.
--
-- Bakgrund (spår 1, "Samtalet blir ett jobb"): inkommande SMS sparades med
-- BARA phone_number. Varje läsare fick därför matcha på råsträngen igen —
-- och 46elks levererar E.164 (+4670…) medan kunder ofta är sparade som
-- "070-123 45 67". Samma person blev olika trådar beroende på väg in.
--
-- customer_id fanns redan (nullable) men skrevs aldrig av sms/incoming.
-- lead_id saknades helt: ett svar från en okänd avsändare blir numera en
-- lead via golden path, och raden ska kunna peka på den.
--
-- Bara additivt. Inga befintliga rader ändras; gamla rader behåller NULL
-- i båda kolumnerna (de skrevs innan rutten kunde fylla dem).
-- customer_id finns redan i produktion men har aldrig haft en fil i sql/ —
-- kolumnkontraktet (tests/column-contract.spec.ts) bygger sin tabellkarta ur
-- den här katalogen, så en odeklarerad kolumn läses som "finns inte". Satsen
-- är en no-op mot prod och gör repots SQL till sanningen igen.
ALTER TABLE sms_conversation ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE sms_conversation ADD COLUMN IF NOT EXISTS lead_id text;

CREATE INDEX IF NOT EXISTS idx_sms_conversation_customer
  ON sms_conversation (business_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_sms_conversation_lead
  ON sms_conversation (business_id, lead_id);
