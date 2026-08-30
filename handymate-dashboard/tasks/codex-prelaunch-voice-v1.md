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
verifierade; E och H är gjorda i handymate-mobile och verifierade där.

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
- [x] E. Förbättra Expo-röstvyn: live text + servertranskribering, redigerbar
      bekräftelse, fel-fallback och projektkontext från projektsidan.
      Gjord i handymate-mobile 14a57c9 (main). Kontraktet granskat mot den här
      servern: transcribeAudio träffar /api/matte/transcribe och läser `text`
      precis som routen svarar, och projektsidan skickar project_id/customer_id
      hela vägen in i `context` — där de nu ägarskapsverifieras mot tenanten.
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
- [x] H. Verifiera mobile: Jest-facit och `npx tsc --noEmit`.
      Kört av Claude på mobil-repot: tsc 0 fel, hela sviten 105/105 gröna
      (16 suites). Testet photo-upload som tidigare setts flaka passerade också.
      KVAR: EAS-test på riktig enhet — kan inte köras härifrån.

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
- E och H är nu också klara och verifierade.

FYND vid granskningen av mobilkontraktet (varken Codex eller terminalsessionen
såg det, och det var ingen regression — så hade det alltid varit): mobilen
skickade aldrig `require_confirm_external` och hanterade inte
`pending_confirmation`. "SMS:a Anna att vi kommer imorgon" gick alltså iväg
direkt i mobilen medan samma mening på webben krävde ett tryck — trots att
mobilen är den primära röstytan, där transkriptet dessutom kan ha hört fel.
Andreas valde hela grinden. Byggd i handymate-mobile, branch
`claude/matte-confirmation-gate` (1f76f24): flaggan OCH kortet, aldrig bara
flaggan — en klient som ber om bekräftelse utan att rendera kortet gör
INGENTING medan användaren tror att det gjordes. 9 facit i
__tests__/matte-confirmation.test.ts. Kommentarerna i
lib/agent/external-confirm.ts som påstod att mobilen är "opåverkad" är
rättade; de var sanna när de skrevs men hade blivit vilseledande.
