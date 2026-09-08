-- v221 — Väntande säsongskampanjkort: underraden på svenska med rätt numerus
-- (App Store-skärmdump 2026-09-07 visade "1 kunder · construction · september").
-- Koden rättad i lib/seasonality/campaign-generator.ts (branchLabel + kund/kunder);
-- detta rättar de kort som redan ligger och väntar. Scoped till pending.
UPDATE pending_approvals
   SET description = (payload->>'customer_count')::int
                     || CASE WHEN (payload->>'customer_count')::int = 1 THEN ' kund · ' ELSE ' kunder · ' END
                     || CASE payload->>'branch'
                          WHEN 'electrician' THEN 'El'
                          WHEN 'plumber' THEN 'VVS'
                          WHEN 'construction' THEN 'Bygg'
                          WHEN 'carpenter' THEN 'Snickeri'
                          WHEN 'snickeri' THEN 'Snickeri'
                          WHEN 'painter' THEN 'Måleri'
                          ELSE payload->>'branch'
                        END
                     || ' · ' || (payload->>'month_name')
 WHERE approval_type = 'seasonal_campaign'
   AND status = 'pending'
   AND description ~ '^[0-9]+ kunder · [a-z_]+ · ';
