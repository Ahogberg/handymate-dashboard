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

Status efter Claudes granskning 2026-08-30 (branch
claude/lisa-prata-matte-integration-ao7nv3): A–D och F–G är genomgångna och
verifierade; E och H ligger kvar i mobil-repot.

- [x] A. Laga 46elks-routingen: besvarad human_work_hours-väg går genom
      information + recordcall, behåller rätt mottagarnummer och missat-samtal-
      fallback.
      Granskat: besvarad väg returnerar nu `ivr: /api/voice/consent`, och
      consent sätter `recordcall` + `whenhangup` på connect-steget.
      Mottagarnumret är bevisligen detsamma i båda rutterna
      (`personal_phone || forward_phone_number`), och consent härleder
      företaget ur det uppringda numret i stället för query-parametern.
- [x] B. Ta bort förtida kund/lead/deal vid ringsignal. Kvalificerad
      efteranalys använder Golden Path och är idempotent per call-id.
- [x] C. Telefonsamtalet producerar en sammanfattning och granskbara kort på
      den befintliga approval-rälsen; ingen oidentifierad kundtranskription får
      de interna agentverktygen direkt.
      Facit finns i tests/samtalsvagen.spec.ts (transkriptet körs aldrig som
      agentinstruktion; samma samtal analyseras en gång).
- [x] D. Gör `log_time` sann för mobilröst: duration, projekt och autentiserad
      business_user; kund härleds från tenant-verifierat projekt och inga
      klockslag hittas på.
      Kolumnerna `default_hourly_rate`, `pricing_settings`,
      `time_require_description`, `require_project` verifierade mot live-DB.
      KOMPLETTERAT av Claude: dubbelregistreringsskydd saknades — röstvägen
      kan skicka samma pass två gånger (dubbeltryck, återanvänd
      bekräftelse-token inom 15 min, eller ett upprepat verktygsanrop).
      Skyddet ligger nu vid skrivningen, inte i transporten.
- [ ] E. Förbättra Expo-röstvyn: live text + servertranskribering, redigerbar
      bekräftelse, fel-fallback och projektkontext från projektsidan.
      ÅTERSTÅR — ligger i Ahogberg/handymate-mobile (inte pushat; senaste
      push där är 2026-08-19). Dashboard-sidan av kontraktet är klar:
      `/api/matte/chat` verifierar sidkontextens id:n mot tenanten och
      injicerar den inloggade användaren, så mobilen kan lita på svaret.
- [x] F. Facit: inspelning i besvarad väg, ingen förtida Golden Path,
      kvalificerad/idempotent lead, extern transkription får inga interna tools,
      samt korrekt person/projekt/duration för tid.
      Tidsdelen saknade facit och finns nu i tests/matte-time-logging.spec.ts
      (10 tester: rätt person, inga påhittade klockslag, ingen dubblett,
      mänskligt ja före skrivning).
- [x] G. Verifiera dashboard: riktade tester, `npx tsc --noEmit`,
      `npx next build`.
      Kört på det sammanslagna trädet: tsc 0 fel, ren build (345 sidor),
      hela Playwright-sviten 5586 gröna / 1 överhoppad.
- [ ] H. Verifiera mobile: Jest-facit och `npx tsc --noEmit`.
      ÅTERSTÅR tillsammans med E, i mobil-repot.

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

Claude 2026-08-30, efter att Codex arbete pushats till main och mergats in i
claude/lisa-prata-matte-integration-ao7nv3:

- Codex två banor är genomgångna. Lanseringsdelen (V3-ägarskap för
  påminnelser, dynamisk /api/health, läsande preflight) rördes inte — den var
  redan komplett och testad.
- Röstbanan var märkt "not verified". Den är nu verifierad: schemat stämmer
  mot live-DB, importerna finns, hela sviten är grön.
- Ett verkligt fynd i skarven mellan våra två arbeten: bekräftelsekortet jag
  byggde signerar en token som är giltig i 15 minuter och kan användas fler
  gånger. I kombination med det nya `log_time` gav ett dubbeltryck två
  tidrader. Åtgärdat vid skrivningen (fem minuters fönster på samma person,
  dag, längd och projekt) så skyddet gäller alla vägar in — inte bara
  chattens knapp.
- Kvar att göra ligger i mobil-repot (E + H).
