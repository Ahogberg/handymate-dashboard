# Teamet i fickan — post-launch-program

Datum: 2026-09-01
Status: beslutad produktinriktning efter launch freeze
Auktoritativ roadmap-post: `docs/council/ACTIVE_ROADMAP.md`, avsnittet
"Teamet i fickan / AgentNotification"

## Produktlöftet

Handymates agentteam ska kännas närvarande även när hantverkaren inte sitter
i systemet. Mobilnotiserna ska inte vara generiska engagemangspuffar. Varje
notis ska hjälpa mottagaren att fatta ett beslut, förstå vad teamet gjort
eller öppna exakt den plats där arbetet fortsätter.

Exempel:

- **Matte behöver ditt beslut** — öppnar det exakta godkännandekortet.
- **Kolla hur det går för teamet med uppdraget** — visar verklig progress,
  blockerare och vem som arbetar med vad.
- **Ny kund på ingång** — öppnar kund/lead/affär med källan synlig.
- **Lars har en fråga om projektet** — öppnar projektets kontext, inte
  startsidan.
- **Karin såg att fakturan blev betald** — verifierat utfall, aldrig bara en
  skickad påminnelse.
- **Daniel har förberett nästa steg** — förslag bakom befintlig
  godkännandegrind.

## Tre notisklasser

1. **Kräver beslut** — tidskänslig och tydligt handlingsbar.
2. **Något viktigt har hänt** — verifierat utfall eller relevant förändring.
3. **Teamuppdatering** — meningsfull status i ett pågående uppdrag, aldrig en
   tom "kom tillbaka"-notis.

## V1-kontrakt

- Agentidentitet på varje notis: avsändare, roll, avatar/färg.
- Exakt deep link till rätt objekt och rätt vy i mobilappen.
- Mottagare väljs efter ansvar/routing, aldrig hela företaget som standard.
- Dedupe vid sändningen, inte bara när observationen skapas.
- Tyst tid, prioritet och TTL.
- Diskret låsskärmstext; känsliga belopp och kunduppgifter visas först efter
  upplåsning.
- En tappad/utgången deep link faller tillbaka till en begriplig kontextvy.
- Misslyckad push får aldrig bokföras som att mottagaren informerats.
- Alla handlingsnotiser återanvänder befintliga approval- och
  verkställighetsgrindar.

## Första händelserna

Prioriterad V1-ordning:

1. beslut/godkännanden;
2. uppdragsprogress och blockerare;
3. projektfrågor och projektöverlämning/Jobbpass;
4. ny verifierad kund/lead/affär;
5. betald faktura eller annat verifierat värdeutfall;
6. daterade kundlöften som närmar sig.

## Arkitekturgränser

- Dashboard/API äger händelsen, mottagaren, dedupe och säker text.
- Mobilappen äger deep-link-tolkning och den visuella agentidentiteten.
- `pending_approvals` förblir beslutssäkerhet, inte ett nytt notissystem.
- Mission Control förblir uppdragskälla; push är en leveranskanal.
- Ingen ny agentmotor, approvalmotor eller parallell observationsplattform.

## Definition of done för V1

- Samma händelse ger högst en push per mottagare och dedupefönster.
- Fel användare eller fel tenant får aldrig notisen eller objektet.
- Tryck på notisen öppnar rätt objekt för samtliga V1-händelser.
- Tyst tid, TTL och känslig låsskärmstext är facit-låsta.
- Delvis misslyckad leverans syns i logg/facit och visas aldrig som framgång.
- Mobilprov finns för kallstart, bakgrund, utloggad session, borttaget objekt
  och utgånget godkännande.

## När vi bygger

Programmet startar efter lanseringsfreeze och efter att färsk-konto-/
tvåkontosbeviset är grönt. Det ska byggas vertikalt en notistyp i taget:
händelse → routing → push → deep link → riktig mobilvy → felväg → facit.
