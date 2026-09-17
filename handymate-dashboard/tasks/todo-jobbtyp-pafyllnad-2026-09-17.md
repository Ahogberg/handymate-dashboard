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
