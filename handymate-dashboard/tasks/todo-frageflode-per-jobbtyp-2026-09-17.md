# Frågeflöde per jobbtyp — V1 (2026-09-17)

Andreas: "Vi ska bygga det direkt … frågeflödet ska inte vara ENDA vägen att skapa
en offert … seedade per bransch som kan redigeras, bytas ut och fyllas på …
svar före besöket skippar vi i V1." Bygger ovanpå kontextdokumentet
docs/offert/offertflodet-kontext-2026-09-17.md.

## Beslut
- Frågorna hör till jobbtypen (`job_types.intake_questions jsonb`). NULL = aldrig
  redigerade → seedade förslag räknas fram ur bransch + jobbtypens namn + enheterna i
  standardraderna. `[]` = medvetet inga frågor.
- Svaren hör till offerten (`quotes.intake_answers jsonb`, version 1, med ursprung så
  att kundsvar kan läggas till senare utan ny kolumn).
- Flödet öppnas när hantverkaren trycker ett upplägg i jobbtypsremsan (samma krok som
  i dag: `applyJobTypeStart`). QuoteJobTypeStart (testlåst) rörs inte.
- Antingen-eller: "Hoppa över" ger upplägget orört, "Tillbaka" lämnar allt som det
  var. Fritext, "Bygg själv" och mallar finns kvar som förut.
- Svar → rader: mått/antal med enhet sätter mängd på alla standardrader med samma
  enhet (`equivalentUnit`: exakt eller stavningsvariant som m2/m²/kvm, aldrig omräkning). Ja/nej med "kopplat tillval" kryssar
  tillvalsrader vars beskrivning innehåller texten. Val och fritext går till Matte
  (`source_transcript`) och sparas strukturerat.
- Ingen AI i flödet. Prissättningen är företagets egna priser via samma resolver.

## Filer
- [x] sql/v253_intake_questions.sql — två jsonb-kolumner, körs via MCP, verifieras
- [x] lib/quotes/intake-questions.ts — typer, validering, seedning, svar→rader, svar→text
- [x] lib/quotes/intake-questions-server.ts — läs/skriv per jobbtyp
- [x] app/api/job-types/intake-questions/route.ts — GET ?jobType=, PUT
- [x] lib/quotes/intake-flow.ts — klienthämtning med injicerbar fetch
- [x] components/quotes/IntakeQuestionFlow.tsx — fullskärmsflödet (tryck/röst)
- [x] components/onboarding/JobTypeQuestionsEditor.tsx — redigera/byt ut/fyll på
- [x] components/onboarding/JobTypeQuoteSetup.tsx — montera editorn
- [x] app/dashboard/quotes/_shared/QuoteBuilder.tsx — quickMode 'fragor', svar → rader,
      intakeAnswers i kontext + återställning
- [x] app/dashboard/quotes/_shared/buildQuotePayload.ts + app/api/quotes/route.ts —
      intake_answers sparas
- [x] tests/intake-questions.spec.ts + package.json + .github/workflows/contracts.yml
- [x] tsc, contracts, build, mutationstest, commit, push

## Lämnas orörda
- components/onboarding/QuoteJobTypeStart.tsx (testlåst)
- QuickIntake.tsx:s fritext, D2-vanan, mallväljaren
- AI-genereringens prompt (svaren når den via source_transcript/beskrivning, inte via
  ett nytt promptfält — det tas när kundsvar före besöket byggs)
- Parallella förenklingspasset (ordet "mall" m.m.)

## Granskning (2026-09-17)
- v253 körd via Supabase MCP och verifierad med SELECT mot information_schema:
  job_types.intake_questions jsonb, quotes.intake_answers jsonb.
- tsc rent, contracts 2 765 passed (1 skipped sedan tidigare), next build ren.
- 8 mutationer fångade av tests/intake-questions.spec.ts: mängd även på tillvalsrader,
  öppna frågan tappas ur seedningen, servern accepterar fel version, frågorna hämtas
  före verifieringen, hoppa över lägger aldrig in upplägget, rutten utan force-dynamic,
  läsfel blir tom lista, råa svar skrivs i kolumnen.
- Designfynd under facit: m2/M²/kvm är samma enhet olika stavad — seedningen slog ihop
  dem till en fråga men radmatchningen var exakt, så M²-rader hade missats. Löst med
  `equivalentUnit` (stavningsvarianter, aldrig omräkning) i seedning, enhetslista och
  svar→rader.
- EFTERSLÄNG 2026-09-17 (Andreas fynd i produktion): mängdregeln matchade bara på
  enhet. Bee Services badrumsmall bär beloppet i antalskolumnen med enheten "st"
  och ingen artikelkoppling — ett st-svar hade skrivit över 25 348 med 3. Ny vakt
  `intakeRowTakesQuantity`: en mängdfråga rör bara artikelrader som är kopplade till
  registret. Seedningen läser samma vakt, så en jobbtyp utan kopplade rader får inga
  mängdfrågor, och editorn förklarar varför. 5 nya mutationer fångade (vakten borta,
  tom sträng som koppling, tillval genom vakten, seedning utan vakt, editorns
  förklaring borta). Contracts 2 769 passed.
- Inte klickprovat i webbläsare (ingen inloggning i miljön). Preview-bygget på Vercel
  är byggkontrollen; flödet bör provas på telefon: tryck upplägg → frågor → offert.

## Rivningen paket A (2026-09-17, efter beslut av Andreas)

- **A1 — startvanan bort** (`df82272f`): quick-preferences, banderollen "Vill du
  alltid börja så här?", fem localStorage-nycklar, tre sparade startlägen.
  Kallstart öppnar alltid intaget. 350 rader netto bort.
- **A2 — listvyn bort**: dokumentet är enda radeditorn på alla skärmbredder.
  - FÖRE rivningen flyttades fyra radtyper in i `AddRowSheet` (tillval, fritext,
    delsumma, rabatt). De fanns bara i listvyns "Fler alternativ", alltså bara på
    desktop. Tillval krävs dessutom av nästa steg: kundens val på offertsidan.
  - BLOCKERARE som hittades under kartläggningen: `QuoteRowProductCombo`
    (koppla en BEFINTLIG rad till en artikel) monterades bara i `ItemRow`.
    Utan åtgärd hade rivningen tagit bort enda vägen att koppla en rad till
    registret — samma koppling som `intakeRowTakesQuantity` gör till
    förutsättning för frågeflödets mängdregel. Löst: combon flyttad in i
    `RowEditSheet`s beskrivningsfält, ny prop `onSelectProductForRow`.
  - `UNIT_OPTIONS`/`formatCurrency` flyttade ur `ItemRow` till
    `lib/quotes/item-format.ts` — enheterna måste vara identiska på alla ytor,
    annars matchar varken `sameUnit` eller mängdregeln. Värdena diffade före flytt.
  - Raderat: `QuoteItemsSection`, `QuoteAddRowCombo`, `QuoteProductSearchModal`,
    `ItemRow`. Dött städat: `mainView`, vy-växeln, dnd-sensorerna, `handleDragEnd`,
    `moveItem` (index), grossistingången i offertflödet.
  - MEDVETET TAPP: skapa offertkategori inline mitt i radredigeringen. Fanns bara
    i listvyn. Kategorier skapas i Inställningar → Offertkategorier; radbladet
    väljer bland befintliga. Läggs till i sheeten om någon saknar det.
  - Behållet: `components/ProductSearchModal.tsx` (projektvyn använder den) och
    `@dnd-kit` som beroende (projektvyn sorterar med det).

### Granskning A2
- tsc rent, contracts 2 780 passed, next build ren.
- 5 mutationer fångade: artikelkombon bakom `false ?`, `onSelectProductForRow`
  bortkopplad, tillval borta ur radtyperna, raderad fil återskapad,
  Listvy-knappen återinförd. Mutation 1 slank först igenom — provet kollade att
  komponenten fanns, inte att villkoret kopplade in den. Provet skärptes till att
  läsa grenen.
- Inte klickprovat i webbläsare. Prova på telefon: tryck rad → koppla artikel →
  mängd, och "+ Lägg till rad" → Tillval.

## Bindningar i stället för enhetsmatchning (2026-09-17, efter granskning)

Granskningen utifrån träffade rätt: "hur stor yta?" satte golvytan på både
golv- och väggraden (samma enhet, olika betydelse), och ja/nej kryssade tillval
via delsträng i beskrivningen. Facit låste fast felet (`[1, 6.5, 6.5, …]`).

Beslut: en fråga pekar på RADER via mallradens `id` (stabilt: överlever
redigering och omsortering, 217 av 221 rader bar det redan). Ingen ny kolumn.
0 sparade frågor och 0 svar i produktion → enhetsmatchning och `optionMatch`
borttagna helt, ingen bakåtkompatibilitet.

- [x] sql/v254_template_row_ids.sql — backfyll id på 4 rader, körd via MCP:
      0 utan id, 221 rader, 0 dubbletter inom mall
- [x] lib/quotes/job-standard-server.ts — `productRows` sätter id på nya rader
      (det var vägen som skapade kopplade rader utan id)
- [x] lib/quotes/intake-questions.ts — `targets` på number/yesno, `IntakeTarget`,
      `intakeTargetsFromRows`, `bindIntakeQuestions` (finns, rätt slag, samma
      enhet), `missingIntakeTargets`; seedning EN fråga per kopplad rad och per
      tillval (tak 12); `applyIntakeAnswers` rör bara pekade rader, vakten
      `intakeRowTakesQuantity` gäller fortfarande; svaret på offerten bär `targets`
- [x] lib/quotes/intake-questions-server.ts — `targets` i vyn, sparning binder
      mot upplägget
- [x] components/onboarding/JobTypeQuestionsEditor.tsx — "Sätter mängden på" /
      "Kryssar tillvalet" med kryssruta per rad; annan enhet = avstängd; saknad
      rad = notis + "Glöm de raderna"
- [x] components/quotes/IntakeQuestionFlow.tsx — "Sätter: …" / "Kryssar: …" under
      frågan; QuoteBuilder skickar `targets`
- [x] tests/intake-questions.spec.ts — omskrivet: golvfrågan sätter golvraden och
      BARA den; två rader under en fråga är hantverkarens val; okopplad/borta/fel
      slag ändrar inget; ja/nej på id inte text; bindningsfel 400; seedning per rad
- [x] Mutationstest 6/6 röda: enhetsmatchning igen, textmatchning igen, vakten
      bort, id bort i productRows, blandade enheter tillåtna, "Sätter:" bort
- [x] tsc, contracts, build

Medvetet inte nu: skydd av manuella ändringar (svaren tillämpas en gång, före
redigering), upprepning per rum. Står i målbilden.

## Första jobbresan — bevisad, och de tre listorna kopplade (2026-09-17)

Granskningens omprioritering: bevisa en hel första jobbresa innan mer byggs.
Andreas valde "bevisa resan först, laga bara det som blockerar".

**Mätningen som ändrade planen.** Handymate hade TRE listor som aldrig mött
varandra, och det var en orsak, inte tre symptom:

| Lista | Innehåll | Överlapp |
|---|---|---|
| Onboardingens jobbtyper | 15–17 per bransch, kundens språk | 0 av 15–17 mot mallarnas |
| Mallbanken | 3–7 mallar, två grova jobbtyper | 0 av 22–35 rader mot artiklarna |
| Artikelregistret | 4 prislösa startartiklar | — |

I produktionen: 11 av 14 jobbtyper utan upplägg, 4 av 221 mallrader kopplade.
Frågeflödet kunde alltså aldrig sätta en mängd för en ny firma.

Två idéer föll på mätning innan de byggdes: namnmatchning vid seedning (0
träffar) och återbruk av prisupplösningens fuzzy-matchare (också 0 träffar).

- [x] lib/onboarding/template-articles.ts — artiklar härledda ur mallraderna,
      ALLTID prislösa; tre rader härleds medvetet inte (tim, avsiktlig nollrad,
      redan kopplad). `jobTypeStarters` ger varje jobbtyp utan upplägg
      branschens generella rader
- [x] lib/seed-defaults.ts — härleder, upsertar med stabila id:n och kopplar
      raderna; `sales_price: 0` (NOT NULL, 0 = "pris saknas")
- [x] lib/quotes/lifecycle.ts — `intake_answers` låst efter accept
- [x] lib/quotes/lifecycle.ts — `travel_total` låst. Hittades av
      tests/quote-content-lock.spec.ts som stod OGATAD utanför test:contracts
      och gått röd obemärkt. Facit är nu i grinden
- [x] app/api/projects/route.ts — jobbtypen från OFFERTEN före affären, så
      knappen och create-from-quote ger samma projekt
- [x] lib/invoices/quote-to-invoice-items.ts + fakturamallarna — dolda rader
      faktureras (priset ingår i summan) men behåller sin doldhet
- [x] sql/v255_invoice_job_type.sql + lib/invoices/create-invoice.ts —
      jobbtypen på fakturan, härledd i KÄRNAN så alla åtta vägar får den
- [x] tests/forsta-jobbresan.spec.ts — hela kedjan med riktiga funktioner
- [x] Mutationstest 8/8 röda

**Rättelse:** "Dolda rader faktureras" stod som lucka i inventeringen. Fel —
att de faktureras är rätt (priset ingår i offertens summa, beslut 2026-08-05).
Felet var att de tappade sin doldhet och blev synliga för kunden.

### Kvar, medvetet
- Betalplan → delfakturor (eget paket, blockerar inte resan)
- Frågeflödet kan inte fråga efter TIMMAR: timrader kopplas aldrig, eftersom en
  explicit koppling prövas före timregeln och hade tagit arbetsraden från
  firmans timpris till 0 kr
- Klickprovet registrering → första offert (golden path station 2 är
  uttryckligen "assertion, ej ny registrering")
