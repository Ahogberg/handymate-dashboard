# Första riktiga offerten — Reality Harness

Datum: 2026-09-01  
Status: byggd och lokalt verifierad, inte committad eller deployad av Codex

## Resultat

Den browserlösa verklighetskedjan bevisar nu:

1. nytt företag väljer jobbtyp och offertmall,
2. mallens fröpriser ersätts av företagets verkliga artikelpriser,
3. artikelkopplade reservationer föreslås,
4. kund, affär, jobbtyp, mall, artikellänkar och reservationer följer med i offerten,
5. samma uppgifter överlever sparning och återöppning,
6. `Skicka` från editorn öppnar den riktiga sänddialogen,
7. offerten får inte status `sent` förrän sändvägen faktiskt har körts.

Facit: `tests/first-quote-reality-harness.spec.ts`.

## Fel som den röda första körningen hittade

### Falskt skickad offert

Editlägets `Skicka` skrev tidigare `status: sent` och visade "Offert skickad" utan att köra `/api/quotes/send`. Nu sparas offerten och detaljsidan öppnas med `?send=true`; endast den riktiga sändvägen äger leveransstatusen.

### Giltighetsdatum flyttades vid autospar

PUT-rutten räknade tidigare `valid_until` från aktuell dag. En senare autospar kunde därför flytta fram samma offerts giltighetsdatum. Beräkningen är nu deterministiskt förankrad i offertens `created_at` via `lib/quotes/validity.ts`.

### Saknad begriplig artikelstart

Onboardingen rekommenderar nu 3–5 återkommande nyckelartiklar per vanlig jobbtyp, exempelvis arbetstid, framkörning och vanligt material. Det är uttryckligen en rekommendation, aldrig en grind. Statusen räknar unika, kopplade och faktiskt prissatta artiklar — inte mallrader.

### Produktionsbuild blockerades av reservationskomponenten

`ReservationSuggestionBox` använde lokal `useState` och klickhanterare utan att vara markerad som klientkomponent. Next-produktionsbygget stoppade. Komponenten har nu en explicit `use client`-gräns; static-/PDF-läget fortsätter gatea bort den.

## Verifiering

- Röd första Reality Harness-körning: 3 av 4 facit föll på de tre felen ovan.
- Riktad offert-/onboardingregression: 286 gröna.
- Sänd-/autosave-facit i desktop + mobile Playwright-projekt: 16 gröna.
- Dokument-/reservationsparitet i desktop + mobile: 42 gröna.
- `npx tsc --noEmit`: rent.
- `npx next build`: exit 0.

Builden loggar befintliga varningar när lokala Supabase-envvariabler saknas under statisk insamling, men slutförs grönt. Ingen migration eller extern skrivning ingår i leveransen.

## Skarpt slutbevis

Efter merge/deploy bör en enda färsk-konto-körning göras med verklig webbläsare:

1. välj en vanlig jobbtyp,
2. prissätt 3–5 nyckelartiklar,
3. starta första offerten från en affär med samma jobbtyp,
4. verifiera förvalda artiklar och föreslagna reservationer,
5. spara, återöppna, förhandsgranska och skicka till ett kontrollerat testmål,
6. verifiera att `sent` och `sent_at` sätts först efter verkligt utskick.

