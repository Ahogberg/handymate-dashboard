# Jobbtypsaktivering — sann offertpreview

Datum: 2026-09-01  
Status: byggd och lokalt verifierad, inte committad eller deployad av Codex

## Kundupplevelsen

Den befintliga aktiveringsresan visar nu ett konkret, read-only prov så snart ett företag har valt jobbtyp och offertupplägg:

- jobbtyp och kopplad offertmall,
- upp till fem verkliga mallrader,
- företagets aktuella artikelpris per enhet,
- tydlig skillnad mellan prislös artikel, okopplad rad och enhetsfel,
- tillval markerade som tillval,
- reservationsförslag som den befintliga reservationsmotorn faktiskt matchar,
- tydlig märkning att inget skickas eller accepteras i förhandsvisningen.

Samma komponent visas i onboardingens artikelsteg och under Inställningar → Jobbtyper eftersom båda redan återanvänder `JobTypeQuoteSetup`.

## Sanningsgränser

- Previewn har ingen `fetch`, router, offert-API eller skrivknapp.
- Mallens gamla `unit_price` och `total` finns inte i previewns DTO.
- Endast en aktiv, explicit kopplad artikel med kompatibel enhet kan visa ett pris.
- Ingen totalsumma visas: mängderna hör till det verkliga jobbet och ska granskas i offertvyn.
- Reservationer matchas av `lib/reservations/match.ts`; previewn accepterar eller sparar dem aldrig.
- Om reservationsbiblioteket inte kan läsas sägs det uttryckligen. Ett tomt/felat uppslag presenteras aldrig som bevis för att inga förbehåll behövs.
- Rekommendationen 3–5 nyckelartiklar per jobbtyp är fortsatt vägledning, aldrig onboardinggrind.

## Återanvänd kod

- `inspectTemplate` avgör pris-/kopplingsstatus.
- `matchReservations` avgör verkliga reservationsförslag och dedupe.
- `/api/reservations?include=triggers` är samma biblioteksingång som offerteditorn använder.
- Befintlig mall→jobbtyp-koppling, prisinmatning, första-offertövergång och QuoteBuilder är orörda.

Ingen ny tabell, migration, prismotor, reservationsmotor eller offertskrivare har skapats.

## Förändrade delar

- `components/onboarding/JobTypeQuotePreview.tsx` — ny ren presentationskomponent.
- `lib/quotes/job-type-preview.ts` — ren previewprojektion över befintliga motorer.
- `components/onboarding/JobTypeQuoteSetup.tsx` — läser reservationsbiblioteket fail-soft och monterar previewn.
- `components/onboarding/job-type-setup.css` — responsiv previewyta.
- `lib/quotes/job-type-setup.ts` — bevarar endast radtypen `item`/`option` i den smala DTO:n.
- `tests/job-type-activation-preview.spec.ts` — nytt facit.

## Verifiering

- Första röda körningen: modulen/previewn saknades och facitet föll.
- Riktad preview/setup/reality: 80 gröna i desktop + mobile.
- Bred offert/onboarding/jobbtyp/reservationsregression: 466 gröna.
- `npx tsc --noEmit`: exit 0.
- `npx next build`: exit 0.
- `git diff --check`: inga whitespacefel.

Builden skriver befintliga varningar om lokalt saknade Supabase-envvariabler under statisk sidinsamling men slutförs grönt.

## Kvarvarande skarpprov efter merge/deploy

Använd ett färskt betalt testkonto:

1. välj 1–3 vanliga jobbtyper i onboardingen,
2. hämta eller välj en offertmall och koppla den till en jobbtyp,
3. koppla/prissätt 3–5 nyckelartiklar,
4. kontrollera att previewn uppdateras efter varje sparat pris,
5. kontrollera minst en artikelutlöst reservation,
6. öppna första offerten och jämför rad för rad mot previewn,
7. verifiera att mängder och reservationer fortfarande kräver granskning,
8. spara, återöppna och skicka till ett kontrollerat testmål.

