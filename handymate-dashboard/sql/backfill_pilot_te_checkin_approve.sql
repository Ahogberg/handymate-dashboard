-- Backfill: 3 pilot-rader i time_entry skapade av /api/checkin/approve
-- INNAN fix(checkin/approve)-commiten. Bägge buggar fanns:
--   1) hourly_rate sattes inte i INSERT → blev NULL/0
--   2) approval_status sattes inte → DB-default 'pending' kickade in,
--      raderna hamnar fel sida i Fas 4/Fas 5-vyerna.
--
-- Kör manuellt i Supabase SQL Editor EFTER att fix-commiten är deployad.
-- Verifierings-SELECT längst ner.

-- ─────────────────────────────────────────────────────────────────
-- DEL 1: hourly_rate
-- Lookup matchar inte specifik user — för pilot-data är Andreas
-- owner och har samma rate, så företags-default räcker. För prod
-- med flera users behövs user-specifik lookup mot time_checkins.user_id.
-- ─────────────────────────────────────────────────────────────────

UPDATE time_entry te
SET hourly_rate = COALESCE(
  (SELECT bu.hourly_rate FROM business_users bu
   WHERE bu.business_id = te.business_id
   LIMIT 1),
  (SELECT bc.default_hourly_rate FROM business_config bc
   WHERE bc.business_id = te.business_id),
  0
)
WHERE business_id = 'biz_al7pjuu5smi'
  AND time_entry_id IN ('te_dbr39ab3x', 'te_y2xo01q72', 'te_lyjbok5x7');

-- ─────────────────────────────────────────────────────────────────
-- DEL 2: approval_status / approved_by / approved_at
-- Samma 3 rader, samma bug — lägger till så raderna syns i
-- Fas 5 "Att fakturera"-vyn (kräver approval_status='approved').
-- approved_at sätts till NOW() — exakt attest-tidsstämpel finns på
-- time_checkins.approved_at men för 3 pilot-rader är NOW() acceptabelt.
-- Filter på approval_status='pending' så att eventuellt redan
-- attesterade rader (manuellt via /api/time-entry/approve) inte rörs.
-- ─────────────────────────────────────────────────────────────────

UPDATE time_entry
SET
  approval_status = 'approved',
  approved_by = business_id,
  approved_at = NOW()
WHERE business_id = 'biz_al7pjuu5smi'
  AND time_entry_id IN ('te_dbr39ab3x', 'te_y2xo01q72', 'te_lyjbok5x7')
  AND approval_status = 'pending';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- Förvänta: alla 3 rader har hourly_rate > 0 och approval_status='approved'
-- ─────────────────────────────────────────────────────────────────

SELECT time_entry_id, hourly_rate, approval_status, approved_by, approved_at
FROM time_entry
WHERE business_id = 'biz_al7pjuu5smi'
  AND time_entry_id IN ('te_dbr39ab3x', 'te_y2xo01q72', 'te_lyjbok5x7');
