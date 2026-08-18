-- v154: Dedup för sms_conversation mot 46elks webhook-retries.
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND (etapp 1, konsolideringen "en väg in"): 46elks-webhooken (och en
-- eventuell Supabase-spegling av samma inbound) kan POST:a samma SMS mer än
-- en gång vid nätverksretries. sms_conversation-inserten i app/api/sms/
-- incoming/route.ts hade ingen dedup — en retry skrev en andra rad, och den
-- konversationshistorik som matas in i agentprompten förgiftades av
-- dubbletter av samma kundmeddelande.
--
-- provider_message_id lagrar 46elks form-fältet "id" för det inkommande
-- meddelandet. NULL för äldre rader (skrivna innan denna migration) och för
-- STOPP/START-systemkommandon, som aldrig loggas i sms_conversation.
--
-- Källkoden är byggd för att TÅLA att denna migration inte körts än —
-- kolumn-saknas-fel (isMissingColumnError, lib/agents/memory.ts) fångas och
-- inserten görs om utan provider_message_id, aldrig krasch.

ALTER TABLE sms_conversation ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_conversation_provider_dedup
  ON sms_conversation(business_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON COLUMN sms_conversation.provider_message_id IS
  '46elks meddelande-id (form-fältet "id" i inbound-webhooken från app/api/sms/incoming/route.ts). NULL för rader skrivna innan denna migration och för STOPP/START-systemkommandon. Unikt per (business_id, provider_message_id) — se idx_sms_conversation_provider_dedup, som gör en webhook-retry till en no-op istället för en dubblett i konversationshistoriken.';
