-- v159: push_tokens.user_id — riktad mobilpush (Expo) mot rätt person
--
-- Bakgrund: pending_approvals.routed_business_user_id slås redan upp till
-- auth-uuid (lib/notifications/approval-push.ts resolveTargetUserId) och
-- skickas som target_user_id till /api/push/send. Web-push
-- (push_subscriptions) honorerar redan target_user_id korrekt. Mobilpush
-- (push_tokens, lib/notifications/expo-push.ts) hade INGEN user_id-kolumn
-- att filtrera på — Expo-leveransen blastade alltid till ALLA push_tokens-
-- rader för businessen, oavsett vem beslutet gällde. Den här kolumnen
-- gör riktad mobilpush möjlig.
--
-- Additiv och nullable — rör ingen befintlig kolumn. Befintliga rader får
-- user_id=NULL och faller tillbaka till dagens blast-beteende (oförändrat,
-- inte en regression) för just den enheten tills den registrerar om sig
-- via POST /api/push-tokens (som från och med denna körning sätter fältet).
--
-- Körs manuellt i Supabase SQL Editor (Andreas kör, inte Claude).

ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Index för snabb per-user-filtrering vid riktad push.
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
