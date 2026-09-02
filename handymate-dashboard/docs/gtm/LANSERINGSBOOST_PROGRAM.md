# Lanseringsboost: allt in i Launch Desk (2026-09-02)

Andreas: "ALLT detta är guld. Mata in det snyggt i Launch Desk. Bygg med
Sonnet. Innan lansering vill jag ha alla idéer på plats. Nummer 1 kallar
vi Företagsskannern och driver trafik dit."

Ramar som gäller allt nedan:
- Launch Desk är permission-first (docs/gtm/LAUNCH_DESK.md): inga
  skrapade kataloger eller sociala nätverk, ingen kontakt med enskilda,
  inga utskick från systemet. Vi skrapar smärtan, inte människorna.
- handymate.se ligger i ett annat repo. Publika verktyg byggs här på
  app.handymate.se (t.ex. app.handymate.se/foretagsskannern) och
  handymate.se länkar dit.
- Ingen ny produktbredd för kunden. Detta är säljverktyg och innehåll.
- Alla AI-anrop i publika verktyg: fail-closed IP-tak, honeypot, mätning
  mot ett husföretag.

## Passen (varje pass = en plan i tasks/ + ett Sonnet-bygge + granskning)

| # | Vad | Var | Status |
|---|---|---|---|
| 1a | **Företagsskannern**: publik sida, CSV läses i webbläsaren, riktiga fynd, inget lämnar webbläsaren före kontoskapande; underlaget följer med in i onboardingens import | app/foretagsskannern, StepImportData | plan: tasks/plan-foretagsskannern.md |
| 1b | **Webbplatssignaler i Launch Desk**: läs kontots egen sajt (SSRF-skyddad hämtning som finns), deterministiska signaler (ingen bokning, bara telefon, svarstid, gamla årtal, säsongsstängt, jobbannons) i brief_source_snapshot.signals; AI-utkastet öppnar med signalen | lib/launch-desk, admin/launch | plan: tasks/plan-launch-desk-signaler.md |
| 2 | **Smärtkartan → budskapsbibliotek**: teman, ordlista, ärliga löften per tema i en TS-modul; brief-prompten väljer tema efter konkurrent/bransch; tre jämförelsesidor "Handymate mot X" i app/jamfor | docs/gtm/SMARTKARTA_*, lib/launch-desk/budskap.ts, app/jamfor | research pågår |
| 3 | **Timing-signaler**: Platsbanken/JobTech (öppet API) → "anställer" per konto; Bolagsverket-klienten (finns) → bolagsålder; veckovis uppdatering av signaler för konton i imported/qualified | lib/launch-desk/signaler, cron | efter 1b |
| 4 | **Offertgranskaren** (publikt AI-verktyg): klistra in offert → saknade delar, ROT-fel, ÄTA-klausul; kräver husföretags-mätning + branschpaketen granskade | app/offertgranskaren | efter branschpaketen |
| 5 | **Byråspåret**: kontotyp redovisningsbyrå i Launch Desk, brief-variant som talar om deras hantverkarkunder, partnerprogrammets andel synlig | lib/launch-desk | efter 1b |
| 6 | **Matte-demo via SMS**: publikt demonummer på husföretaget med matte_customer_reply_enabled på; landningssidan visar kortet som skapas | demo-tenant, 46elks | kräver 46elks-saldo |
| 7 | **Kundbevis**: veckorapporten (tasks/spec-sag-det-en-gang-och-veckan.md del B) gör Bee Service till ett kontrollerbart case | lib/value | spec klar |

## Mätning
Företagsskannern: besök → skanning klar → "Skapa konto" → import genomförd
→ betalning. Fyra tal i onboardingtratten (variant 'skanner'). Launch
Desk: konton med signaler → utkast → kontakt → svar → möte.
