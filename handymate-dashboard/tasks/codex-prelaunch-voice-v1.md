# Prelaunch Voice V1 — Lisa samtalsefterarbete + Matte i mobilen

Status: PÅGÅR 2026-08-30  
Ägare: Codex  
Avgränsning: Fortnox- och lanseringspreflight-filerna i den redan smutsiga
arbetskatalogen lämnas helt orörda.

## Produktlöfte

1. När hantverkaren svarar på ett vidarekopplat kundsamtal spelar Handymate,
   efter uppläst information, in samtalet. Efter avslut kvalificeras det mot
   det slutliga transkriptet. Först då får ett verkligt nytt behov skapa kund,
   lead och affär. Offert och uppföljning landar som granskbara specialistkort.
2. Mobilappens befintliga Matte-docka blir den förstklassiga röstvägen. Den
   visar snabb lokal text men låter serverns transkribering fastställa den text
   användaren godkänner. Projektkontext och inloggad medarbetare kommer från
   serververifierade id:n, aldrig från modellens gissning.

## Plan

- [ ] A. Laga 46elks-routingen: besvarad human_work_hours-väg går genom
      information + recordcall, behåller rätt mottagarnummer och missat-samtal-
      fallback.
- [ ] B. Ta bort förtida kund/lead/deal vid ringsignal. Kvalificerad
      efteranalys använder Golden Path och är idempotent per call-id.
- [ ] C. Telefonsamtalet producerar en sammanfattning och granskbara kort på
      den befintliga approval-rälsen; ingen oidentifierad kundtranskription får
      de interna agentverktygen direkt.
- [ ] D. Gör `log_time` sann för mobilröst: duration, projekt och autentiserad
      business_user; kund härleds från tenant-verifierat projekt och inga
      klockslag hittas på.
- [ ] E. Förbättra Expo-röstvyn: live text + servertranskribering, redigerbar
      bekräftelse, fel-fallback och projektkontext från projektsidan.
- [ ] F. Facit: inspelning i besvarad väg, ingen förtida Golden Path,
      kvalificerad/idempotent lead, extern transkription får inga interna tools,
      samt korrekt person/projekt/duration för tid.
- [ ] G. Verifiera dashboard: riktade tester, `npx tsc --noEmit`,
      `npx next build`.
- [ ] H. Verifiera mobile: Jest-facit och `npx tsc --noEmit`.

## Sanningsgränser

- Telefonnumret är en kandidatmatch, aldrig verifierad identitet.
- Ett okvalificerat/felringt samtal skapar aldrig kund, lead eller affär.
- Samtalsanalys får föreslå offertutkast men aldrig skicka offert.
- Missat samtal fortsätter på den redan byggda Lisa-SMS-vägen.
- `mig` betyder alltid den autentiserade `business_users.id`.
- `det här projektet` betyder bara ett serververifierat `project_id` från
  mobilens aktuella vy.
- Fyra timmar lagras som 240 minuter; start/slut lämnas tomma om de inte sades.

## Review

- Pågår.
