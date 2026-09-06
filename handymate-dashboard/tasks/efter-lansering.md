# Efter lansering — den enda ordnade listan

Uppdaterad 2026-09-05. Ersätter ordningarna i tasks/plan-sann-agentstatus.md,
docs/audits/WOW_GENOMLYSNING_2026-09-05.md och Codex granskningar. När den
här och en annan lista säger olika gäller den här.

Inget nedan byggs före 14 september. Före dess bara sådant som gör
befintliga löften sanna.

| # | Satsning | Dagar | Varför här | Byggstenar som finns |
|---|---|---|---|---|
| 1 | **Jobbet går att utföra** — tillträde, kundval, leverans bekräftade innan bilen åker | 3–4 | Värde varje arbetsdag, wow för den anställde, färre bomkörningar | `lib/job-preparation/load.ts` (laddar omfattning + checklistor, kontrollerar inget), utgående SMS-grind, godkännandekort. Saknas: tillstånd för de tre bekräftelserna; obesvarat = okänt, aldrig klart |
| 2 | **Fakturera enligt betalplan** — delfakturor per steg, slutavräkning, helkredit | 2–3 kvar | Byggt av Codex i PR #12 (avstängt bakom flagga). Beslut 5 sep, efter granskning: efter lansering — triggern på fakturatabellen och förskottsflödet ska inte in fyra dagar före lansering. Kvar: retarget till main när #11 landat, härdning av UPDATE-grenen i triggern, ROT-förskott med Fortnox, ångra-väg för fel utkast, inloggat prov, Fortnox-driftprov, sedan v214 | `lib/invoices/payment-plan/*`, `sql/v214_payment_plan_invoicing.sql`, `tests/payment-plan-invoicing.spec.ts` (27 prov i PGlite), `tasks/plan-betalplansfakturering.md`, `tasks/payment-plan-invoicing.md` |
| 3 | **Överens om vad som ingår** — genomgång till kunden direkt efter signering | 2 | Billigast, hakar i bokningsloopen som lagades 5 sep, skyddar marginalen | `quote_items`, bortvalda tillval (`lib/quotes/margin.ts`), portalen, signeringsflödet. Invändningar blir kort, aldrig ändrade villkor |
| 4 | **Firmans kunskapsbas** — allt teamet vet om firman, synligt för ägaren, läst av agenterna, med bevis | 5–7 (lager 1+2) | Skälet att stanna: värdet växer för varje vecka. Ersätter "Kundkortsmallar" som nu är en del av lager 1. Beslut Andreas 2026-09-06, se avsnittet under tabellen | Råvaran finns: `customer_fact` (v122, godkännandekort), `project_outcome` (v73, fryst efterkalkyl per avslutat jobb, `lib/efterkalkyl/*`), `getEfterkalkylInsight` per jobbtyp, `lib/profitability.ts`, `lib/installation/*`, `agent_memories` (v149, mönster kräver bekräftelse), `company-scan-rows.ts`. Saknas: en samlad yta, mallarna, export av själva kunskapsbasen |
| 5 | **Nästa jobb** — framtida affär fångad på plats | 2–3 | Enda genuint saknade primitiven | `lib/voice/analysis-scope.ts` (+ `future_job`), `lib/matte/intent-agent.ts`, `createLeadAndDeal` i `lib/leads/golden-path.ts`. Saknas: intent, `create_deal`-verktyg, `project_id` på deal |
| 6 | **Fortnox-integrationen bevisad mot ett riktigt bolag** | 1–2 | Ingen kund är kopplad, löftesmatrisen säger "dolt tills bevisat". Utan bevis är kopplingen ett löfte utan täckning | `lib/fortnox.ts` (20 funktioner), `lib/fortnox/*`, `tests/facit-fortnox-*.spec.ts`. Kräver Andreas egen Fortnox-licens: kund, artikel, faktura, betalning, återkörning, felväg. Beslut Andreas 2026-09-05 |
| 7 | **SIE4-export** — bokföringsunderlag till vilken byrå som helst | 2–3 | Byrån väljer bokföringssystem, inte hantverkaren. Med SIE4 fungerar vi med Visma, Bokio och alla andra utan egna API:er. Saknas helt idag | Fakturor, betalningar, leverantörsfakturor, ROT finns. Saknas: kontering mot BAS, #VER/#TRANS-generering, export per period. Beslut Andreas 2026-09-05. Långsiktigt: äg vardagen, leverera underlaget — ersätt inte byråns system |
| 8 | **Portalens boka igen** — förfrågan med installationen som kontext | 2 | Installationsregistret är byggt och synligt för kunden, bara knappen och vägen in saknas | `lib/installation/installation.ts`, `app/api/portal/[token]/installations`, `getCustomerFromPortalToken`. Saknas: `POST /api/portal/[token]/forfragan`, `installation_id` på lead/deal, cron för `service_interval_months` |
| 9 | **Dokumentera innan det byggs in** — rätt foto vid rätt moment | 4–5 | Bra tajming-wow, men kräver momentmodell | `project_workflow_stages`, `lib/egenkontroll/*`, checklistor. Saknas: koppling checklista → moment |
| 10 | **Avvikande fakturapris mot bekräftat inköpspris** | 3 | Den billiga delen av kostnadsbevakningen | `supplier_invoices`, `project_material.purchase_price`. Returer/kreditfakturor har inga tabeller alls — den delen kräver manuell registrering och väntar |
| 11 | **Fyll en avbokning** — accepterat obokat jobb som passar person och plats | 5+ | Intäkt, men flest beroenden | `lib/agents/hanna/capacity-fill.ts` (riktar sig mot nya kunder). Saknas: accepterade obokade jobb, kompetens, restid |
| 12 | **Förklarbar veckoplanering** | — | Först när restid och deadline finns i planeringsdatan | `lib/schedule/person-day.ts`, `DispatchReasoning` |
| 13 | **Field Command** — säg det en gång i fält: tid, ÄTA, bokning ur ett yttrande, med fråga vid tvetydighet, samlat godkännande och kvitto | 5–7 | Skiss från Andreas 2026-09-06 (`docs/design/skisser-2026-09-06/field-command.dc.html`). Kartlagt samma kväll: rapportläget finns men fem byggstenar saknas, se avsnittet nedan. Placering i listan avgör Andreas | `lib/matte/work-report.ts` (fyra verktyg, projekt- och personlåst), `work-report-confirmation.ts` (ett kort per åtgärd), `time_checkins` (v17/v76), mobilappens `MatteSheet`/`ProjectReportCard`, `resolvePersonScheduleQuery` (namnmatchning, bara läsning) |
| 14 | **Karins marginalnotis** — "kunden bad om X på platsbesöket, det finns inte i offerten", fäst vid raden | 4–6 | Skiss från Andreas 2026-09-06 (`docs/design/skisser-2026-09-06/agentnarvaro-offert.dc.html`, mönster 2). Kräver en jämförelsemotor och stabila rad-id som inte finns. Placering avgör Andreas | `customer_fact` (v122, `evidence_quote` ordagrant ur mötet), `assemble-transcript.ts` (tidsstämplad tidslinje), `lib/reservations/match.ts` (mönster för radmatchning), `learning_events` |

## Punkt 4 i detalj — Firmans kunskapsbas (beslut Andreas 2026-09-06)

Tre lager som bygger på varandra. Lager 1 och 2 byggs direkt efter lansering som en punkt. Lager 3 är en egen punkt med villkorstexten som första steg. Ärlighetsregeln gäller överallt: varje påstående i kunskapsbasen pekar på raderna bakom, obekräftade mönster visas som "väntar på ditt ja", aldrig som sanning.

### Lager 1 — synlig för firman: sidan "Din kunskapsbas"
- **Var:** egen sida `/dashboard/kunskap`, grindad till **ägare och admin** via `getCurrentUser` + roll (samma grind som `app/api/customer-preparation/route.ts`). Ett kort på Översikt visar räkningarna och länkar dit: "Teamet vet: 48 kundfakta · 12 efterkalkyler · 6 installationer · 3 bekräftade mönster". Anställda ser inte sidan.
- **Sektioner, var och en med antal, "nytt sedan förra veckan" och bevis-länk per rad:**
  1. *Kunder* — bekräftade `customer_fact` per kund (källa: samtal, mejl, möte). Obekräftade i egen grå rad med länk till kortet.
  2. *Jobb* — `project_outcome` per avslutat projekt: offererat mot utfall i timmar och kronor, ÄTA-antal, marginal. Aggregat per jobbtyp från `getEfterkalkylInsight`. Här ligger det Brickanta kallar Knowledge Base, och det finns redan som data.
  3. *Installationer* — `installation` med nästa service, redan synligt i portalen.
  4. *Betalningsvana* — dagar till betalning per kund ur `invoice` (Karins underlag i `lib/agents/shared/business-aggregate.ts`).
  5. *Mönster teamet bekräftat* — `agent_memories` med `confirmed_at` satt; de obekräftade i väntande kort.
  6. *Mallar* — kundkortsmallarna (tidigare egen punkt): färdiga att slå på ("Betalningsvana", "ROT-kandidat", "Kräver förskott", "Tyst kund med installation"), egen regel på svenska via Matte med förhandsvisning på tre kunder innan den slås på.
- **Export:** en knapp som ger hela kunskapsbasen som CSV via `/api/export` (nya moduler `customer_facts`, `project_outcomes`, `agent_memories`). Kunskapsbasen är skälet att stanna, aldrig ett gisslan. Att kunna ta med sig allt är en del av löftet.
- **Tomt läge:** ny firma ser sex tomma sektioner med en rad var om vad som fyller dem ("Fylls när Lisa fångat ett samtal", "Fylls när ett jobb avslutats"). Aldrig exempeldata.

### Lager 2 — agenterna läser den
- Daniel prissätter mot firmans egna efterkalkyler (finns delvis: `QuoteMarginCard`, `efterkalkyl-insikt`); rätt form är "Liknande jobb hos dig tog 14 timmar, du offererade 10", aldrig "AI:n rekommenderar".
- Lars varnar vid jobbstart när ett jobb liknar ett som gick över budget (`getProjectOutcome` vid `job_completed` finns, saknas vid *start*).
- Karin läser betalningsvanan (finns) och mallarna (saknas).
- Matte får kunskapsbasen i `lib/context/kundkontext.ts` (agentminnet finns där, efterkalkyl och installationer saknas).
- Facit: varje agentpåstående ur kunskapsbasen bär `source_type`/`source_id` och en länk som öppnar raden.

### Lager 3 — branschen i aggregat (egen punkt, senare)
- **Först villkorstexten:** kunden godkänner att firmans siffror bidrar till anonymiserade, aggregerade branschspann, med en flagga per firma för att säga nej. Inget samlas innan texten är ute och flaggan finns.
- **Aldrig enskilda firmors priser.** Bara spann per jobbtyp och region, och bara när minst 20 firmor bidrar. Prisdelning mellan konkurrenter är känsligt konkurrensrättsligt; aggregat med tröskel är den säkra formen. Ta juridisk kontroll innan lansering av lagret.
- **Volymen finns inte än:** 34 offerter i databasen 2026-09-05. Punkten är meningsfull först vid hundratals firmor per bransch.

## Punkt 13 i detalj — Field Command (kartlagt 2026-09-06)

Det som finns och behålls: röst → transkript → Lars i rapportläge, låst till
det projekt klienten skickar och till den egna personen; fyra åtgärdstyper
(`log_time`, `add_work_note`, `log_material`, `create_ata_draft`); signerade
bekräftelsekort med idempotenta skrivningar; ÄTA-utkast utan pris som aldrig
når kunden (exakt skissens bärnstensfärgade "inget pris satt, inget skickas").
Mobilappen (`handymate-mobile`) har redan ytan: `ProjectReportCard` →
`MatteSheet` med `workReport: true`. Bygg där, inte i desktop-Jobbkompisen.

Saknas, i den ordning de bör byggas:
1. **Samlat godkännande.** Idag ett kort per åtgärd, kedjat (`work-report-
   confirmation.ts`, facit i `tests/work-report.spec.ts:337-348`). Skissen:
   en lista med alla delar synliga och EN knapp "Godkänn N · ÄTA väntar på
   pris". Ärlighetsregeln kvar: varje del listad, inget skrivs tyst, ÄTA
   utan pris godkänns aldrig av knappen.
2. **Tid på annan person.** Rapportläget avvisar det medvetet (`work-
   report.ts:62`, 403 "bara din egen tid"). Kräver: `business_user_id` i
   `log_time`-schemat, namnmatchning via samma princip som
   `resolvePersonScheduleQuery` (aldrig gissa, fråga vid flera träffar), och
   en attest-regel: tid som en annan person loggat på mig syns i min attest.
3. **Fråga vid tvetydighet som chips.** Modellen får `ambiguous:true` med
   alternativ idag; klienten renderar inget. Kort med knappar (två Johan,
   vilket jobb) innan något skrivs.
4. **Projekt från incheckning.** `time_checkins` (status active) matas aldrig
   in i Matte. "Du är incheckad på Storgatan 12 sedan 07:52, jag antar det" —
   som förslag, aldrig tyst.
5. **Bokning i rapportläget.** `book_site_visit`/`create_booking` finns bara
   i vanlig chatt. Lars bokar, med samma bekräftelse som övriga delar.
6. **Kvitto och ångra.** Kvittolista per agent och mål (Tid, Kalender, Offert,
   Kund) finns delvis i `DayClose` (`REPORT_LABELS`). "Ångra allt · 30 s"
   saknas helt: kräver en ångra-väg per skrivning (radera tidrad, avboka,
   ta bort utkast) inom fönstret. Mobilappen har 5-sekunders ångra för
   godkännanden (`home.tsx UNDO_MS`), samma mönster.

## Punkt 14 i detalj — Karins marginalnotis (kartlagt 2026-09-06)

Ingen motor jämför idag ett möte eller kundunderlag mot offertrader. Lars
kundunderlagskontroll är uttryckligen förbjuden att påstå vad som ingår i
en offert (`review-contract.ts`), och det ska förbli så tills motorn finns.

Bygg:
1. **Koppling möte → offert.** `meeting_job` och `call_recording` saknar
   `quote_id`. Lägg till, sätt när offerten skapas från ett möte eller när
   kunden matchar och mötet är ≤30 dagar gammalt (som förslag).
2. **Jämförelsemotorn** (`lib/quotes/saknade-rader.ts`): kundlöften och
   önskemål ur `customer_fact` (`fact_type` commitment/preference med
   `evidence_quote`) mot offertens rader. Utfall per önskemål: `finns`,
   `saknas`, `oklart`. Aldrig pris — bara "Uppskattat" från prislistan om en
   artikel matchar, annars "Sätt pris".
3. **Stabila rad-id.** `quote_items.id` regenereras vid varje sparning
   (`app/api/quotes/route.ts:783-789`). Notisen fästs vid `sort_order` +
   beskrivning, eller så införs ett stabilt `rad_nyckel`.
4. **Ytan.** Klientkomponent bredvid raden i redigeringsläget (mönster:
   `ReservationSuggestionBox`), aldrig i det statiska dokumentet
   (`tests/quote-document-parity.spec.ts`). Knappar: Lägg till rad, Visa
   varför (citatet med tidsstämpel, offerten saknar raden, prislistans
   uppskattning), Ingår redan. Beslut skrivs till `learning_events`.

## Beslutat men litet (halv dag var)
- **Ett morgonmejl i stället för tre** (räddningskö, driftlarm, kreditbevakning). Rött i ämnesraden bara när något stoppar kunder, annars tystnad. Beslut Andreas 2026-09-05.

## Parkerat med skäl
- Rapportläget med foto i samma flöde (`/api/jobbuddy/photo` skapar inga händelser).
- `CURATED_TOOL_NAMES` i vanliga Matte-chatten saknar material/anteckning — eget beslut, projektlåsning saknas där.
- Tio uppskjutna idéer från genomlysningen, i prioritetsordning, i docs/audits/WOW_GENOMLYSNING_2026-09-05.md avsnitt 3.
- Mobil projektyta: beslut PWA vs `handymate-mobile` först.
- Bolagsverket-uppslaget: nycklar saknas och schemat är overifierat.
- `communication_settings`: tabellen finns inte, Kommunikation-sidan och Automationer-sidans sparning är döda. Peka om till `automation_settings`.

## Andreas egna punkter (inte kod)
- 46elks: fyll på, slå på automatisk påfyllning. SMS har varit dött sedan 13 aug.
- Kolla inkorgen efter "⚠️ Handymate driftlarm" från augusti — annars saknas Resend-nyckeln i Vercel.
- Push-prenumeration som obligatoriskt steg i uppstartsmötet.
- Stripe live, demokontot med riktig data, App Store-material, EAS-nycklar.

## Beslut 2026-09-05 kväll

**Fakturera enligt betalplan** avgjordes efter lansering (punkt 2 ovan). PR #12 förblir draft med flaggorna av; v214 är inte körd. Delbetalning av en utställd faktura är en annan sak och ligger kvar som egen punkt.
