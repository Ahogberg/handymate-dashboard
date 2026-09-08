# Första arbetsprovet, överlämning och synligt lärande

Beställning 2026-09-08: ta prioritet 1–3 från produktgenomgången till produktion.
Bas: main 8cc1262e. Separat gren; pågående #25/#26 ska inte dupliceras.

## Leveranser

1. Ett avgränsat arbetsprov direkt efter kontoskapande och före full
   konfiguration. Hantverkaren lämnar en riktig förfrågan och ser ett
   offertunderlag. Inga utskick, inga påhittade priser, ingen generell
   provprenumeration. Underlaget följer till den vanliga offertbyggaren.
2. Bestående överlämningskvitto på offerten: faktisk status, nästa bevakning
   och när ägaren behöver agera. Paus, läsfel och saknade förutsättningar
   ska vara synliga. Ett skickat meddelande bevisar inte framtida bevakning.
3. Synlig egen jobbregel i offertarbetet: välj denna offert eller framtida
   jobb av samma typ, förhandsgranska effekten och bekräfta. Återanvänd
   befintligt regel-/jobbtypsunderlag och verifiera skrivbehörighet.

## Genomförande och bevis

- [x] Hämta senaste huvudversion till separat ren arbetskopia.
- [x] Kartlägg befintliga konsumenter, rollgränser och verkligt schema.
- [x] Implementera arbetsprov och återupptagning utan förlorat underlag.
- [x] Implementera överlämningskvitto med samma underlag som bevakningen.
- [x] Implementera regelns förhandsvisning, sparning och återanvändning.
- [x] Prova riktiga komponenter på mobil/desktop och kritiska felvägar.
- [ ] Kör kontraktsgrind, typkontroll och produktionsbygge.
- [ ] Publicera granskningsbar PR, kontrollera CI och produktionsrelease.
- [ ] Redovisa skarpa prov och eventuella kvarstående begränsningar separat.

Datakällor och godkännanden är serverauktoritativa. Arbetsprov får en
beständig kostnadsgräns. Pris, mängd, regelomfattning och utskick får inte
bekräftas av AI eller av en animations avslut. Inga riktiga kundutskick
behövs för verifiering av denna leverans.

## Verifierat i arbetskopian

- 18 riktade kontrakt: kostnadsgrind före AI, roller, företagsfilter på varje
  dataläsning, återförsök, felvägar, verklig regelhämtare och samma klocka som cron.
- 7 webbläsarprov av verkliga komponenter på 375/1280 px: arbetsprov,
  omladdning, explicit ersättning, sparfel, företagsbyte, preview och sen serversparning.
- Hela befintliga kontraktsgrinden: 1 765 godkända, 1 avsiktligt överhoppat,
  samt 17 separata customer-preparation-kontrakt. Den nya extra regelläsartesten
  passerade därefter i den riktade sviten.
- Supabase-katalogen verifierad: inga migrationer behövs. rate_limit_check
  har bigint för tidsfönstret. Jobbtyper, regler och loggkolumner finns.
- Lokal tsc kunde inte slutföras på grund av slut på Windows commit-minne;
  full typkontroll ska passera i CI före merge. Webbläsarprov använder
  fixtures för nätanrop och är inte ett bevis på skarp AI eller leverans.

Arbetsprovets första text/resultat har fliklokal återställning tills Fortsätt
sparar på servern. Underlaget hämtas därifrån i offertbyggaren. Besöksregeln
ändrar beskrivning och gäller bara vald jobbtyp; pris/timmar lämnas för granskning.
Överlämningen läser befintliga inställningar, historik och beslut. Den startar
ingen ny automatisk utskicksprocess och påstår aldrig att en köning är leverans.
