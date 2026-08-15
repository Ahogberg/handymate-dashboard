-- Ett projekt per offert (TD-57, tasks/tech-debt.md, verifierat 2026-08-16).
--
-- Ursprungligen upptäckt i Bee Service-piloten (2026-05-20): dubbel-submit
-- (snabb-klick eller nätverks-retransmission) skapade två projekt av samma
-- offert en sekund isär — samma kund, samma namn, båda orphan-spöken utan
-- timmar/ÄTA/bokningar. Applikationsnivå-kollen i app/api/projects/route.ts
-- (POST, from_quote_id-grenen) täcker det vanliga fallet, men är inte
-- atomisk — det här partiella unika indexet är den verkliga backstoppen mot
-- äkta samtidighet (två nästan simultana requests).
--
-- Partiellt (WHERE quote_id IS NOT NULL): manuellt skapade projekt utan
-- offert-koppling har inget att skydda mot och ska kunna vara hur många
-- som helst — bara offert-kopplingen är unik.
--
-- Ingen backfill/cleanup krävs: kontrollerat direkt mot prod 2026-08-16,
-- noll dubbletter existerar just nu.
CREATE UNIQUE INDEX IF NOT EXISTS project_quote_id_unique
  ON project (quote_id)
  WHERE quote_id IS NOT NULL;
