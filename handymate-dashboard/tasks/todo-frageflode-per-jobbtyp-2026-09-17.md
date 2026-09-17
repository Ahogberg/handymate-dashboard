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
