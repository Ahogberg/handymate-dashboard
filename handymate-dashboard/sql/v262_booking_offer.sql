-- v262_booking_offer.sql — Spår 3: bokning på svar.
--
-- ═══ VILKET VERKLIGT FEL DETTA STÄNGER ═══
--
-- Slot-SMS:et ("Vi kan komma: 1) … Svara med numret som passar bäst",
-- lib/approvals/booking-times-review.ts) gick ut, kunden svarade "2" — och
-- svaret blev bara ett intent-klassat kort. Erbjudandet fanns ingenstans som
-- data: tiderna låg inne i en approval-payload, utan förfallotid, utan status
-- och utan något sätt att veta om svaret redan hanterats. Koden sa det rakt
-- ut (booking-times-review.ts:118): "Kundens svar hanteras separat innan
-- kalendern ändras".
--
-- Den här tabellen är det saknade ledet: ETT erbjudande = EN rad. Den ger tre
-- saker som en payload aldrig kan ge — ett uppslag på telefonnummer (svaret
-- kommer från kunden, inte från kortet), en förfallotid (48 h), och en
-- status-CAS så två svar på samma erbjudande blir EN bokning.
--
-- Ingen autonomi ligger här: raden bär vad vi erbjöd och vad kunden valde.
-- Bokningen skapas först när hantverkaren trycker på kortet
-- (`booking_offer_confirm`), eftersom tasks/earned-autonomy-spec.md säger att
-- create_booking ALDRIG är autonom.
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_offer (
  id                   TEXT        NOT NULL,
  business_id          TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  -- Kunden erbjudandet redan känner. Kan vara NULL när tiderna gick till en
  -- lead som ännu inte blivit kund — då bär lead_id identiteten.
  customer_id          TEXT        NULL,
  lead_id              TEXT        NULL,
  -- Numret SMS:et gick till, normaliserat. Svaret slås upp på det här.
  phone_e164           TEXT        NOT NULL,
  -- Exakt de tider kunden fick, i ordningen de numrerades i SMS:et:
  -- [{ start, end, label, assigned_user_id? }]. Svaret "2" betyder slots[1].
  slots                JSONB       NOT NULL,
  -- Kortet vars godkännande skickade SMS:et. Erbjudandets id härleds ur det,
  -- så ett omkört godkännande inte kan skapa två erbjudanden.
  source_approval_id   TEXT        NULL,
  -- Andra rundan (upptagen tid ⇒ två nya tider) pekar på sitt ursprung. Max
  -- en runda: ett erbjudande som självt har en förälder får ALDRIG ge ett
  -- tredje SMS — då går ärendet till hantverkaren i stället.
  parent_offer_id      TEXT        NULL,
  status               TEXT        NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','accepted','expired','superseded')),
  chosen_slot          JSONB       NULL,
  expires_at           TIMESTAMPTZ NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at          TIMESTAMPTZ NULL,
  -- Kortet svaret gav, och bokningen kortet gav. Uppslag utan att gräva i
  -- payloads.
  resulting_approval_id TEXT       NULL,
  resulting_booking_id  TEXT       NULL,
  PRIMARY KEY (id),
  -- Tenant-nyckeln: ett erbjudande hör till ETT företag, och en läsning som
  -- glömmer business_id kan aldrig träffa rätt rad av misstag.
  UNIQUE (business_id, id),
  CHECK (jsonb_typeof(slots) = 'array'),
  CHECK (status <> 'accepted' OR chosen_slot IS NOT NULL)
);

-- Uppslaget vid varje inkommande SMS: öppna, ej utgångna erbjudanden för
-- avsändarens nummer i det här företaget.
CREATE INDEX IF NOT EXISTS booking_offer_oppna
  ON public.booking_offer (business_id, phone_e164, expires_at DESC)
  WHERE status = 'open';

-- Ett godkännande som körs om ska inte kunna skapa ett andra erbjudande.
CREATE UNIQUE INDEX IF NOT EXISTS booking_offer_kalla_unik
  ON public.booking_offer (business_id, source_approval_id)
  WHERE source_approval_id IS NOT NULL;

ALTER TABLE public.booking_offer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_offer FROM PUBLIC, anon, authenticated;
-- Samma rättighetsbild som pending_approvals/booking/customer_fact i prod:
-- servern äger skrivningarna, ingen klient når tabellen direkt.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_offer TO service_role;

COMMIT;
