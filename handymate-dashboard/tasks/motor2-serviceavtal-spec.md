# Motor 2: Serviceavtal-motorn — spec (GODKÄND av Andreas 2026-07-22)

_Flyttas till tasks/ i repot när Motor 1-branchen är mergad._
_Godkänd med TRE-LAGERS-designen: kuraterad avtalskatalog per bransch (lager 1),
AI-matchning på studs mot katalogen (lager 2), AI-förslag på nya katalogposter
via kön (lager 3). Princip: AI väljer och personaliserar — hittar ALDRIG på
priser/intervall. Godkänn på Hanna-kort = erbjudande-SMS (bekräftat)._

## Tes
Ett serviceavtal = återkommande intäkt för hantverkaren utan administration.
Hanna säljer det, Lars schemalägger det, Karin fakturerar det. Varje aktivt
avtal är ett skäl att aldrig lämna Handymate. Ingen nordisk konkurrent har
detta som automatik.

## Verifierad grund (utforskning 2026-07-22)
- booking har redan `kind='service'` (v51) men INGET återkommande-stöd.
- proactive-care JOB_LIFECYCLE = färdig intervalldata per jobbtyp
  (värmepump 12 mån, tak 36 mån, laddbox 12 mån…).
- nurture-motorns enrollment-mönster (`next_action_at`-loop + cron) = seriedrift.
- capacity-fill + review-requests = kö-korts-mönster med dedup + routed_agent.
- autoInvoiceOnComplete kräver quote/projekt — lösa servicebokningar
  fakturerar INTE i dag (gapet Karin-delen fyller).
- week-capacity + availability = Lars kan boka kapacitetsmedvetet.
- Portalen visar inte bokningar/avtal i dag.

## Datamodell — migration `sql/v74_serviceavtal.sql`
```
service_agreement_type (            -- LAGER 1: katalogen, per business
  type_id TEXT PK, business_id TEXT NOT NULL,
  name TEXT NOT NULL,               -- "Våtrumskontroll", "Värmepumpsservice"
  description TEXT,                 -- kundvänlig beskrivning (används i SMS)
  interval_months INTEGER NOT NULL,
  visit_duration_min INTEGER DEFAULT 60,
  price_items JSONB NOT NULL,       -- radmall (fryses in i avtal vid tecknande)
  match_keys TEXT[],                -- jobbtyper/nyckelord för AI-matchning
  is_active BOOLEAN DEFAULT true, seeded BOOLEAN DEFAULT false,
  created_at, updated_at
)
service_agreement (
  agreement_id TEXT PK, business_id TEXT NOT NULL, customer_id TEXT NOT NULL,
  title TEXT NOT NULL,                 -- "Årlig värmepumpsservice"
  job_type TEXT,                       -- grupperingsnyckel (JOB_LIFECYCLE)
  interval_months INTEGER NOT NULL,
  visit_duration_min INTEGER DEFAULT 60,
  price_items JSONB NOT NULL,          -- frusna fakturarader (snapshot-princip)
  rot_rut_type TEXT,
  next_visit_at TIMESTAMPTZ,           -- seriedriftens motor (nurture-mönstret)
  status TEXT DEFAULT 'active',        -- active|paused|cancelled
  created_from_project_id TEXT, notes TEXT,
  created_at, updated_at
)
ALTER TABLE booking ADD COLUMN agreement_id TEXT;  -- serie-koppling
Index: (business_id, status, next_visit_at); booking(agreement_id)
```

## Flödet — fyra delar

### 1. Hanna föreslår (aldrig autonomt)
Daglig cron (mönster: review-requests): completed-projekt senaste 7 dagarna
vars job_type matchar JOB_LIFECYCLE + kunden saknar aktivt avtal + dedup
(7-dagars payload.customer_id-mönstret från capacity-fill). Skapar kö-kort:
▸DEFAULT: **approval_type 'send_sms'** (återanvänder befintlig exekvering
rakt av) — godkänn skickar erbjudande-SMS till kunden: "Hej! Din värmepump
mår bäst av årlig service. Vill du att vi lägger upp det — så hör vi av oss
när det är dags? Svara JA så fixar vi det. /Svensson Bygg". Kortet innehåller
avtalsutkastet i payload så hantverkaren ser exakt vad som erbjuds.
När kunden tackar ja (SMS-svar syns i inkorgen): hantverkaren skapar avtalet
med två klick (del 2). [ANDREAS-VETO: alternativet är att godkännandet skapar
avtalet direkt utan att fråga kunden — snabbare men presumtivt.]

### 2. Avtalet skapas & syns
- "Nytt serviceavtal"-knapp på kundkortet (violett sektion nära Platsbesök):
  form med tjänst (fritext + JOB_LIFECYCLE-förslag), intervall, besökslängd,
  pris (välj Service-mall ur quote_templates ELLER egna rader; fryses till
  price_items), första besöksmånad. Sätter next_visit_at.
- Kundkortet listar kundens avtal (status, nästa besök, pris/besök).
- Ny flik/sektion "Serviceavtal" under befintliga bokningssidan eller
  kundlistan — v1: bara kundkortet + en enkel översikt i kalendern
  (serie-bokningar får avtalsmarkering).

### 3. Lars schemalägger (autonomt OK — internt, inget externt utskick)
Daglig cron: active avtal med next_visit_at inom 21 dagar och ingen obokad
serie-bokning → skapa booking (kind='service', agreement_id, kundens uppgifter,
notes ur avtalstiteln) i LÄMPLIG vecka: kapacitetsmedveten placering
(week-capacity: föredra tunna veckor inom ±1 vecka från måldatum; slot via
availability-helpern inom arbetstid). Efter bokning: next_visit_at +=
interval_months. Kundavisering sker via BEFINTLIGA påminnelse-flödet
(booking-reminders skickar redan autonomt i dag — ingen ny autonomiyta).
Misslyckas kapacitetsplacering: boka måldatum kl 08 ändå (aldrig fastna)
+ flagga i bokningsanteckningen.

### 4. Karin fakturerar efter besök
Hook i complete-job (bredvid befintliga projekt-grenen): booking med
agreement_id + job_status completed → skapa invoice från avtalets
price_items (ny lib/agreements/invoice-visit.ts — återanvänder
fakturainfra: nummerserie, OCR, ROT/RUT på price_items-flaggor).
▸DEFAULT: alltid draft + Karin-kort (review_auto_invoice-mönstret) i v1 —
inga autonoma fakturor förrän förtroendetrappan säger annat. Dedup:
en faktura per booking_id.

## Etappindelning (byggordning, tre-lagers-designen)
- **Etapp 1 (motorn + lager 1):** migration (BÅDA tabellerna) + avtals-CRUD
  (API + kundkortets form/lista; formens tjänsteval = katalogen) +
  katalog-seed per bransch (Fable författar ~15 avtalstyper: bygg
  våtrum 24 mån/altanöversyn 12/tak 36; el elbesiktning 36/laddbox 12/
  solceller 12; VVS värmepump 12/vattenfelsbrytare 12/BRF-stam; måleri
  fasadtvätt 24/fönster 36; + allround) + katalog-redigering under
  Inställningar + Lars serie-cron + Karin besök→faktura.
  (= motorn fungerar för manuellt sålda avtal direkt)
- **Etapp 2 (lager 2):** Hanna-förslagscronen med AI-matchning — Haiku läser
  utfört jobb (titel/offertrader/ÄTA) och väljer bästa 1–2 katalogposter +
  skriver personligt erbjudande-SMS; kortet bär alternativen, godkänn
  skickar. Fallback utan LLM: match_keys-matchning. + portal-avtalsvyn +
  kalenderns serie-markering.
- **Etapp 3 (lager 3):** Matte-katalogväxten — periodisk genomgång av
  avslutade jobbtyper utan katalogtäckning → kö-kort med föreslagen ny
  avtalstyp (namn/intervall/pris) → godkänn = ny katalogpost.

## Avgränsningar v1
- Ingen kund-självservice (acceptera avtal i portalen) — v2.
- Ingen prisindexering/årlig höjning — v2.
- Inga automatiska fakturor — draft + kö alltid.

## Verifiering
- tsc 0 fel + ren build. Facit-tester: nästa-besöks-beräkningen
  (intervall, månadsskiften, DST via svenska datum-helpers) +
  kapacitetsplaceringsvalet (ren funktion).
- Manuellt efter v74: skapa avtal på testkund → Lars-cronen bokar →
  klarmarkera besöket → Karin-utkast med rätt rader dyker upp i kön.
