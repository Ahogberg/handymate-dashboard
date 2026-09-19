# Offertflödet som vinner kunden — kontext för nästa pass

Skrivet 2026-09-17 som överlämning till en ny chatt. Allt under "Finns" är
verifierat mot koden och databasen samma dag; inget är gissat. Andreas
beslut: **frågeflöden per jobbtyp** byggs först, mockup senare.

## Idén, i en mening

En hantverkare som använder Handymate ska kunna lämna kundens hem med en
offert som är **specifik för det hemmet, begriplig för kunden och signerbar
på mobilen** — inom en timme, i stället för en PDF tre dagar senare. Det är
det som slår konkurrenten, inte en bild.

## De tre delarna, i byggordning

### 1. Frågeflöde per jobbtyp — FÖRST
Varje jobbtyp får 5–8 frågor som passar just det jobbet (badrum: yta m²,
golvvärme?, bortforsling?, kakel/klinker, tillval). Besvaras på plats med
tryck eller röst. Svaren gör tre saker:
- sätter **mängderna** på jobbtypens standardrader (yta → m²-rader),
- väljer **förbehållen** (finns redan per jobbtyp),
- ger Matte ett underlag som inte är gissat (AI-kontexten prioriterar redan
  den jobbtypskopplade mallen).

Resultat: offerten är prissatt när hantverkaren går ut genom dörren.

### 2. Fotolagring — FÖRE mockupen, betalar sig dubbelt
Före-bilder från besöket OCH referensbilder från liknande jobb på kundens
offertsida (fältet "Referens" finns, men ingen bild). Samma tabell.

### 3. Mockup ur före-bild + svar — SIST, med två spärrar
Genereras **ur svaren** (kakelval, färg, layout), aldrig fritt. Spärr ett:
märkt "Illustration av upplägget — inte ett löfte om utförande". Spärr två:
hantverkaren godkänner bilden via ett vanligt godkännandekort innan kunden
ser den — samma granskningsgräns som allt annat kunden får. Bildmodellen
läggs bakom en adapter (`lib/bild/`) så leverantören går att byta.

### Parallellt med 2, bygger på 1
- **"Så här går det till"** på kundens offertsida: tidslinje per jobbtyp
  (dag 1 rivning, dag 2–3 tätskikt …), härledd ur frågeflödet.
- **Bra / bättre / bäst** = flera upplägg (varianter) per jobbtyp. Tillval
  finns som radtyp (`item_type: 'option'`).
- **Kunden justerar tillval själv** innan signering och ser priset live.
  `option_selected` skrivs redan vid signering — det som saknas är att
  kunden får röra det före.

## Finns (verifierat 2026-09-17)

| Behov | Var | Läge |
|---|---|---|
| Jobbtyper per företag, sorterbara | `job_types` (sort_order), `app/dashboard/settings/job-types` | klart |
| Upplägg per jobbtyp med egna priser | `quote_templates.job_type_slug` (v187), `lib/quotes/job-standard-server.ts` | klart |
| Jobbtypsstart på tom offert | `components/onboarding/QuoteJobTypeStart.tsx`, `lib/quotes/job-type-start.ts` | klart, testlåst |
| Fyll på från annan jobbtyp | `lib/quotes/job-type-append.ts` + `applyJobTypeAppend` i `QuoteBuilder.tsx` | klart 2026-09-17 |
| Prisupplösning mot företagets priser | `lib/quotes/resolve-template-item-prices.ts` | klart |
| Tredelning arbete/material/resa per rad | v252, `recalculateItems` i `lib/quote-calculations.ts` | klart (Codex C8) |
| Förbehåll per jobbtyp | `VisitRuleEditor`, `lib/quotes/visit-rule.ts`, `/api/quotes/visit-rule` | klart |
| Röst → text | Jobbkompisen → `/api/matte/transcribe` | klart |
| Röst → klassificerade händelser | `app/api/voice/analyze/route.ts`, allowlist `lib/voice/analysis-scope.ts` | klart men saknar `time`/`material` |
| AI-offert med jobbtypskontext | `lib/quotes/quote-generation-context.ts` (prioriterar `job_type_slug`) | klart |
| Tillvalsrader | `item_type: 'option'`, `option_selected`/`option_default` | klart |
| ROT/RUT i kronor | `lib/rot-rut-basis.ts`, `lib/quote-calculations.ts` | klart |
| Kundens offertsida + e-signering | `app/quote/[token]/page.tsx` | klart |
| Uppföljning | `app/api/cron/quote-follow-up` (Daniel) | klart |
| Fritextintag i dag | `QuickIntake`: en ruta "Vad ska göras, var, och vad kunden önskat sig …" | kvar som egen väg (Andreas 2026-09-17: frågeflödet är inte enda vägen) |

## Finns INTE (verifierat)

- **Ingen fotolagring.** Ingen tabell i `sql/` matchar photo/bild/image/attachment.
- **Ingen bildgenerering.** Ingen kod, ingen leverantör, inga env-variabler.
- ~~Inga frågor per jobbtyp.~~ **Byggt 2026-09-17 (V1):** `job_types.intake_questions`
  (v253), seedade ur bransch + jobbtypens namn + enheterna i standardraderna när
  kolumnen är NULL, redigerbara i uppsättningsytan (`JobTypeQuestionsEditor` i
  `JobTypeQuoteSetup`, onboarding + Inställningar → Jobbtyper). Logik i
  `lib/quotes/intake-questions.ts`, rutt `/api/job-types/intake-questions`.
- ~~Inga svar på offerten.~~ **Byggt 2026-09-17 (V1):** `quotes.intake_answers` (v253,
  version 1, `source: 'hantverkare'`). Flödet (`components/quotes/IntakeQuestionFlow.tsx`)
  öppnas när ett upplägg trycks i jobbtypsremsan, före upplägget läggs in; mått/antal
  sätter mängd på rader med samma enhet, ja/nej kryssar kopplat tillval, resten går
  som text till `source_transcript`. "Hoppa över" ger upplägget orört. Facit:
  `tests/intake-questions.spec.ts`. Kvar till nästa pass: kundsvar före besöket
  (portalen → leaden → förifyllda frågor), svaren i AI-prompten som eget fält,
  "Så här går det till"-tidslinjen ur svaren.
- "Spara som mall" från en offert skickar inte med jobbtypen (`POST /api/quote-templates` saknar `job_type_slug`) — täpps i förenklingspasset 2026-09-17.

## Pågående parallellt (rör inte)

Förenkling av jobbtyp/mall i offertflödet (Claude, 2026-09-17): ordet
"mall" försvinner ur flödet; jobbtyp → varianter; ett upplägg = ett tryck;
"Standardrader · X" byter namn; "Spara som mall" bär jobbtypen; "Välj
mall"-listan tas bort från offertstarten. Frågeflödet ska byggas OVANPÅ det:
frågorna hör till jobbtypen, svaren till offerten.

## Regler som gäller (CLAUDE.md + beslut)

- All UI-text på svenska, inga tekniska ord. Mobiloptimerat — telefon på bygget.
- Ny SQL som fil i `sql/vNNN_*.sql`, kör via Supabase MCP, verifiera med SELECT.
  Slå alltid upp kolumner i `information_schema` — gissa aldrig.
- Kontraktsgrinden: ny spec läggs i `package.json` `test:contracts` OCH
  `.github/workflows/contracts.yml` i samma ordning (`tests/feature-test-parity.spec.ts`).
- Mutationstesta varje facit. Kör `npx tsc --noEmit`, `npm run test:contracts`, `npx next build`.
- Allt kunden får se går genom godkännandegränsen (`reviewedApprovalFetch` → `ApprovalReviewHost`).
- Känt vs Uppskattat: ett gissat pris märks (`ai_price_missing`), aldrig tyst.

## Öppna frågor för den nya chatten

1. Vem skriver frågorna per jobbtyp — vi (seedade per bransch, som mallbanken) eller hantverkaren själv? Rekommendation: seedade, redigerbara.
2. Ska svaren kunna komma från kunden själv (portalen/förfrågan) innan besöket?
3. Bildmodell och kostnadstak per offert — beslut när fotolagringen finns.
