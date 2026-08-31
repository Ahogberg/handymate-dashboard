-- v186 (Prisslingan V2, pass 5 / UX6): läsande metrics-vy för prisloopen.
-- Icke-destruktiv (CREATE OR REPLACE VIEW). Målbilden: kohortkurvan för
-- prissatt-andel ska stiga av ANVÄNDNING, inte av mer seedning — vyn är
-- måttet på att "priset förtjänas"-loopen faktiskt fungerar.

CREATE OR REPLACE VIEW prisloop_metrics AS
SELECT
  bc.business_id,
  bc.business_name,
  bc.created_at::date                                   AS konto_skapat,
  COUNT(p.id) FILTER (WHERE p.is_active)                AS artiklar_aktiva,
  COUNT(p.id) FILTER (WHERE p.is_active AND p.sales_price > 0)  AS prissatta,
  COUNT(p.id) FILTER (WHERE p.is_active AND p.sales_price <= 0) AS prislosa,
  ROUND(
    100.0 * COUNT(p.id) FILTER (WHERE p.is_active AND p.sales_price > 0)
    / NULLIF(COUNT(p.id) FILTER (WHERE p.is_active), 0), 1
  )                                                     AS prissatt_andel_pct,
  (SELECT COUNT(*) FROM quote_items qi
    WHERE qi.business_id = bc.business_id
      AND qi.created_at > now() - interval '30 days')   AS offertrader_30d,
  (SELECT COUNT(*) FROM quote_items qi
    WHERE qi.business_id = bc.business_id
      AND qi.created_at > now() - interval '30 days'
      AND qi.linked_product_id IS NOT NULL)             AS lankade_rader_30d
FROM business_config bc
LEFT JOIN products p ON p.business_id = bc.business_id
GROUP BY bc.business_id, bc.business_name, bc.created_at;

-- RLS: vyn läses BARA server-side (admin-panelen, service role). Ingen
-- grant till anon/authenticated — samma hållning som v112-svepet.
REVOKE ALL ON prisloop_metrics FROM anon, authenticated;

-- Verifiering:
-- SELECT * FROM prisloop_metrics ORDER BY prissatt_andel_pct DESC LIMIT 5;
