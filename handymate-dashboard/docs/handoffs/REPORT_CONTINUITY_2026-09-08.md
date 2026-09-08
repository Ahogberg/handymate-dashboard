# Rapportkedjan mellan webbsessioner

Bygger på PR #30, som bygger på #29/#28. Ingen produktionsaktivering eller migration utförd.

## Vad kunden får

När kontinuitet är aktiverad sparas de exakta föreslagna delarna före det första
granskningskortet: egen tid, arbetsanteckning, material och ÄTA-förslag. Varje del
kräver fortfarande sitt eget uttryckliga godkännande i befintlig DayClose/Matte-väg.
En annan webbsession kan återläsa planen, se vilka delar som kvitterats och återuppta
nästa del. Ingen ny AI-tolkning eller automatisk exekvering sker vid återupptagning.

ÄTA-kvittensen betyder att ett förslagskort har skapats. Det är inte ett godkänt
ÄTA-arbete, ett skickat kundmeddelande eller en färdig faktura. Kvittenserna beskriver
vad som sparades vid bekräftelsen, inte att underlaget aldrig senare har ändrats.

## Säker återhämtning

- Beständig work_report_session med serverägd person/firma/jobb/datum, fryst plan,
  stabilt request-id, index för nästa del och kvittenser. Ett öppet ärende per
  person/jobb/datum; avstå från det innan en ny kedja börjar för samma omfattning.
- Varje bekräftelse tar ett atomärt lås för exakt verktyg/argument. Ett nytt försök
  efter två minuter kräver en ny uttrycklig användarhandling. Lås-ID hindrar en sen
  misslyckad körning från att rensa en senare körnings lås.
- Alla fyra deltyper använder samma artifact-identitet vid återförsök. Material har
  ett deterministiskt primärnyckelvärde. ÄTA har ett deterministiskt approval-id.
  Befintlig bred ÄTA-deduplicering bevaras, men ett ANNAT kort kvitteras aldrig som
  den här rapportens sparade förslag. Inga kundutskick görs av rapportkedjan.
- Nytt signerat stableArtifacts-fält skiljer nya materialbekräftelser från redan
  utfärdade äldre 15-minuterstoken. Gamla token fortsätter sin tidigare dubblettväg
  och börjar inte skriva nya deterministiska rader ovanpå en äldre sparning.
- Delkvittensen skrivs efter bekräftad skrivning. Om svaret går förlorat efteråt
  återläses samma artefakt vid nästa explicita försök. Osäkerhet blir inte framgång.
- Avstå stoppas när en sparning är in-flight. Utgången kedja (14 dagar) kan läsas
  men inte exekveras; en gammal okvitterad in-flight-del kräver undersökning av
  artefaktens stabila ID innan den kan avslutas. Ingen automatisk upplåsning/radering.
- Ny behörighets-/tilldelningskontroll vid listning, återupptagning, avstående och
  faktiskt sparande. Endast den egna rapporten kan återupptas, även för ägare/admin.
- RLS, explicit endast service_role, SECURITY INVOKER och indragen PUBLIC/anon/
  authenticated-åtkomst. Kontoradering omfattar även de nya rapportplanerna.
- AI-användning bokförs även om lagringen av planen misslyckas efter modellsvaret.

## Aktivering och paus

1. Granska diff och grön slutlig grind på valt integrerat filträd.
2. Kör EN kopia: sql/v2_report_continuity.sql ELLER motsvarande Supabase-migration.
3. Verifiera tabell, RLS/rättigheter, RPC och isolerat testföretag. Ingen cron behövs.
4. Aktivera WORK_REPORT_CONTINUITY_ENABLED=true i backend och prova riktig inloggad
   session, avbruten sparning och återupptagning i en andra webbsession.
5. Paus via flaggan stoppar nya beständiga planer och återupptagnings-API:t. Redan
   signerade journalbekräftelser måste fortsatt hanteras av denna kod/version.
   Behåll tabell och kompatibel bekräftelsekod vid paus; rulla inte tillbaka till
   en gammal skrivare medan nya rapportkedjor fortfarande är öppna.

## Verifiering och gränser

Databas-/RPC-prov kör den riktiga SQL:en, lokalt i PGlite och i CI mot isolerad
PostgreSQL 16 med flera anslutningar. Återhämtningsproven kör riktiga plan-/bekräftelse-
helpers samt de faktiska material- och ÄTA-sparfunktionerna med isolerad generering.
Browserprov på 375/1280 px byter sida efter förlorat svar, återupptar nästa del och
återläser kvittenser. Det är inte ett verkligt iPhone-/TestFlight- eller kundprov.

18 nya prov omfattar även fyra deltyper i samma kedja och samtidiga materialinsättningar.
105 riktade befintliga rapport-/avlastningsprov passerade. Bred kontraktsgrind (1 766 passerade, ett befintligt överhoppat) och
17 Node-prov passerade; slutliga antal, TypeScript, build och CI redovisas i PR.
Supabase-kolumner/primärnycklar kontrollerade läsande. Ingen produktions-DDL utförd.

Detta synkar föreslagna rapportdelar och kvittenser, inte ännu oskickad fritext,
dikteringsljud eller oregistrerat arbete. Native återupptagningsvy, foto/delning,
faktura-/kundlöftesmotor och företagets fullständiga dagsavslut återstår i visionen.
