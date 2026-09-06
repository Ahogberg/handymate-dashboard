-- v219 (2026-09-06) — samtidiga anrop till create-final-invoice.
--
-- Codex dubblettprov i produktion är grönt för UPPREPADE försök (routen
-- läser befintlig projektfaktura och återanvänder den), men skyddet är
-- läs-sedan-skriv utan databaslås: två samtidiga POST (dubbelklick, två
-- flikar) passerar båda läsningen och skapar två slutfakturor med två
-- nummer. Det här indexet är sista försvarslinjen: högst EN levande
-- slutfaktura per projekt och företag. Makulerad/krediterad slutfaktura
-- får ersättas av en ny. Delfakturor (invoice_type <> 'final') berörs inte.
--
-- Vid en kapplöpning förlorar den andra insatsen med 23505; routen läser
-- då om och returnerar den befintliga (deduplicated). Ett fakturanummer
-- kan i det fallet ha reserverats utan att användas — ett hål i serien är
-- det mindre felet jämfört med två slutfakturor.
--
-- Kontrollerat före körning: 0 projekt med >1 slutfaktura i produktion.

CREATE UNIQUE INDEX IF NOT EXISTS invoice_en_slutfaktura_per_projekt
  ON public.invoice (business_id, project_id)
  WHERE invoice_type = 'final'
    AND project_id IS NOT NULL
    AND status NOT IN ('cancelled', 'credited');
