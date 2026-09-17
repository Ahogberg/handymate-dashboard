# Fyll på från jobbtyp + mallbanken under jobbtypen (2026-09-17)

Andreas: "skapa tom offert, välj olika jobbtypers standardrader som fyller på — sömlöst".
Första valet finns (QuoteJobTypeStart, 2026-09-01). Det som saknas: OLIKA (påfyllning) och
att branschmallarna syns under jobbtypen.

- [x] `lib/quotes/job-type-append.ts` — ren funktion: rubrikrad + rader med group_name, sort_order fortsätter, priser via resolveTemplateItemPrices
- [x] `lib/quotes/job-type-start.ts` — JobTypeStart bär jobTypeName (rubriken)
- [x] `QuoteJobTypeStart` — `pafyllnad`-läge: lokalt val, aldrig automatik, rör aldrig offertens jobbtyp
- [x] `QuoteBuilder` — `applyJobTypeAppend` med funktionell setItems; remsan monteras när items.length > 0
- [x] `TemplateSelector` — sektioner per jobbtyp i inställningarnas ordning, "Lägg under …" (PUT quote-setup), fallback platt lista
- [x] Facit: `tests/job-type-append.spec.ts` (rena + källskanning), +2 i `tests/job-type-start-ui.spec.ts`; parity package.json ↔ contracts.yml
- [x] tsc, contracts, build, mutationstest, commit, push

## Lämnas orörda
Prisupplösning, reservationsmotor, offertskrivare, titel/beskrivning/betalplan vid påfyllning.

## Granskning (2026-09-17)
- tsc rent, contracts 2 523 passed, next build ren. 8 mutationer fångade (ersättning i stället för
  tillägg, titel skrivs om, remsan renderas inte, automatik trots påfyllning, chipval läcker till
  offertens jobbtyp, rubrik = mallnamn, sort_order från 0, koppling utan version).
- Premissen "en offertmall per jobbtyp skapas i onboardingen" stämde inte: onboardingen skapar
  JOBBTYPER; upplägget skapas vid "Förbered standardrader". Bee Service 9 jobbtyper / 1 upplägg.

## Pass 2 — ett begrepp (Andreas: "blir det inte dubbelt?")
- [x] Mallistan bort ur offertstarten (QuoteNewStartChooser + TemplateSelector raderade, 'template' inte längre en väg ut)
- [x] Ett upplägg = ett tryck på chipet; flera = varianter
- [x] "Övriga upplägg" för sparade upplägg utan jobbtyp (7–10 per riktigt konto), försvinner när de kopplats
- [x] Kopplingen mall → jobbtyp i Inställningar → Offertmallar (samma PUT, med version)
- [x] "Spara som upplägg" bär offertens jobbtyp, validerad server-side
- [x] Upplägget heter som jobbet; v253 körd (0 kvar, verifierat)
- [x] Facit: 9 mutationer fångade. tsc rent, contracts 2 742, build ren.

## Pass 3 — två nivåer (Andreas: "jobbtypen blir ett färdigt upplägg, och inuti kan man skapa specifika mallar")
- [x] v254: quote_templates.is_default + partiell unik (ett standardupplägg per jobbtyp); backfill qstd_-raderna
- [x] SetupTemplate.isDefault + standardFor(); länkning kan sätta standard (PUT isDefault)
- [x] Förbered standardrader → is_default; Spara som upplägg → standard om jobbtypen saknar
- [x] Seed: specifika branschmallar → egen jobbtyp ur lib/job-type-catalog (Byte av elcentral → Byta elcentral …), formatmallar → Allmänt arbete; relink av befintliga seedade rader; seed-rutten delar seedQuoteTemplates
- [x] Remsan: jobbtypschip = standardupplägget (ett tryck); varianter som egna chips efter
- [x] Inställningar → Jobbtyper: "Gör till standard"; Offertmallar: badge
- [x] Facit + mutationer; tsc, contracts, build; commit, push
- Granskning pass 3: 8 mutationer fångade (flaggad standard ignoreras, varianter inkl. standard, bred bucket, seedern
  struntar i firmans standard, syskonen släpper inte, chipet lägger inte in, ärvt läge gömmer knappen, spara-som aldrig
  standard). tsc rent, contracts 2 752, build ren. v254 körd i produktion (2 standardupplägg, 0 fel).
- Ej gjort med avsikt: omkopplingen av Bee Service/Nordström körs inte härifrån — den sker när "Hämta färdiga mallar"
  trycks eller vid onboardingens slut, för den skapar jobbtyper på kontot.
