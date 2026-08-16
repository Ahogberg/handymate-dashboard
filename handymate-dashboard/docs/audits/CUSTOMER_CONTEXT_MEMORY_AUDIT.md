# Customer/Project Context & Memory Flow — Code-Verified Audit

> **ÅTGÄRDSSTATUS (2026-08-16, samma kväll, commit `0cf4152f`):** Andreas
> beordrade en omfattande fix av samtliga punkter. Fynd 1 (utgående e-post
> — `lib/comm/log-outbound-email.ts` + send_email-verktyget + Gmail-pollern
> arkiverar nu ägarens mejl), 2 (resolverns e-posthistorik), 3 (SMS-
> speglingen i strypunkten `sendSmsViaElks`, dubbelskrivarna borttagna),
> 4+7 (tidslinjen utökad med samtal/möten/e-post/portal/sms_log-historik/
> offertöppningar/webbchatt), 5 (portal-tråden i resolvern), 6 (Postmark-
> arkivering FÖRE klassificering) och 9:s trunkering (80→300 tecken +
> kanal-tagg) är FIXADE och facit-låsta i
> `tests/customer-context-trail.spec.ts` (18 tester). Fynd 8 är ett
> pitch/verklighets-glapp, ingen kodåtgärd. Kvarstående ur fynd 9:
> STOPP/START-uteslutningen (medvetet beslut, ändrades inte),
> `agent_memories` företags-nyckling + null-embeddings (egen, större
> insats), döda `conversations`-läsningen i tidslinjen (ofarlig, lämnad).
> OBS: fynd 6-fixen räddar bara mejl FRAMÅT — historiskt kastade mejl är
> borta för alltid, precis som rapporten varnade.

**Datum:** 2026-08-16. **Utförd av:** Fable 5-agent (bakgrundskörd), på Andreas
uppdrag, parallellt med Customer Memory V2-bygget (telefonsamtal →
`customer_fact`, se `tasks/todo.md`). Läsanvisning: allt nedan är verifierat
direkt i kod denna session, inte återgivet ur ett äldre dokument — den här
kodbasen har ett dokumenterat mönster av inaktuella audits, både sådana som
överdriver kvarvarande luckor och sådana som underskattar dem.

**Syfte:** kartlägga ALLA ytor där hantverkaren och kunden faktiskt har
kontakt (telefon, möten/platsbesök, SMS, e-post, kundportal, widget-chat),
vad som faktiskt fångas och sparas per yta, vilka agent-verktyg/automationer
som läser det — och var påstådd kontext/minne inte faktiskt är kopplat.
Relevant för två saker: (1) att agenternas kontext verkligen är komplett när
de agerar, (2) en framtida Compliance Agent-idé (kunna peka på exakt vad som
sades när, per kanal, vid tvister eller för redovisning).

---

## Yta 1: Telefonsamtal

**Fångas:** varje inkommande samtal får en `call_recording`-rad vid
ringsignal (`app/api/voice/incoming/route.ts:169-183`). Spelas det in
postar 46elks ljud-URL:en, Whisper transkriberar, och **hela transkriptet
sparas för alltid** i `call_recording.transcript`
(`app/api/voice/transcribe/route.ts:121-127`), plus en
`transcript_summary` från analysen. Ljudet självt ligger kvar hos 46elks
(`recording_url` pekar dit), aldrig i Supabase.

**Viktig verklighetskoll — "Lisa hanterar levande samtal":** Det finns
**ingen levande konversations-AI i telefonen.** `voice/incoming` gör en av
tre saker: spelar en statisk TTS-röstbrevlåda, kopplar till hantverkarens
egen telefon, eller kör en samtyckes-IVR. "Lisa" är helt EFTER-samtal:
transkriptet triggar en agentkörning
(`transcribe/route.ts:170-181`, `trigger: phone_call`). Frågan "har Lisa
tillgång till tidigare fakta UNDER samtalet" är alltså missvisande — det
finns ingen under-samtalet-agent. Den gamla Vapi-integrationen för levande
samtal lever kvar bara som dörra edge-funktioner
(`supabase/functions/vapi-webhook/index.ts`, skriver den nu föräldralösa
`conversations`-tabellen).

**Efter-samtal-kontext:** `phone_call`-prompten injicerar bara transkript +
telefon + längd (`app/api/agent/trigger/system-prompt.ts:311-317`). Ingen
konversationshistorik, inga fakta injiceras — Lisa måste aktivt anropa
verktyg (`search_customers`, sedan `get_customer`) för att lära sig något
om den som ringde.

**Konsumenter av `call_recording.transcript`:** analysmotorn
(`voice/analyze`), efter-samtal-Lisa-körningen, `qualify_lead`. **Inte**
resolvern, **inte** kundtidslinjen — och inget chattverktyg kan hämta ett
gammalt samtalstranskript per kund.

## Yta 2: Platsbesök/mötesinspelningar

**Fångas:** helt transkript sparas. `lib/meetings/process-job.ts`
transkriberar varje segment (verbose_json med per-segment-tidsstämplar i
`meeting_segment.whisper_segments`), bygger ihop hela texten med explicita
luckor för misslyckade segment, och sparar den kompletta texten i en
`call_recording`-rad med `source: 'site_visit'`. Ljudet **raderas
medvetet** efter transkribering (retentionsregeln) — bara text sparas.
Samma analyspipeline som telefonsamtal.

**Lucka (relevant för compliance):** tidsstämplar överlever bara i
`meeting_segment.whisper_segments`; det hopsatta `call_recording.transcript`
är vad allt nedströms ser, och inget exponerar "vem sa vad när" — Whisper
gör ingen talar-identifiering överhuvudtaget. För en produkt som ska stödja
tvistbevis är spåret "ett transkript existerade det här datumet", inte
attribuerbara uttalanden.

## Yta 3: SMS

**Fångas — asymmetriskt, i två tabeller som inte stämmer överens:**
- **Inkommande:** hela texten till `sms_conversation` (roll `user`) —
  `app/api/sms/incoming/route.ts:186-195`. Undantag: STOPP/START-kommandon
  loggas medvetet INTE där — försvarbart, men betyder att själva
  samtyckes-ändrande meddelandet saknas i konversationsposten (lever bara
  som flaggor på `customer` + bekräftelsen i `sms_log`).
- **Utgående:** ALLT utgående går genom `sendSmsViaElks`, som loggar hela
  texten till `sms_log` inklusive misslyckanden (`lib/sms-send.ts:267-294`)
  — bra revisionsspår i sig.
- **MEN** konversationshistorik-konsumenter läser `sms_conversation`, inte
  `sms_log`, och bara **tre skrivare** speglar utgående till
  `sms_conversation`: agentens `send_sms`-verktyg, det manuella
  dashboard-utskicket, och en legacy edge-funktion. **Alla andra utgående
  SMS — godkännandekorts-svar, offertpåminnelser, fakturapåminnelser,
  ÄTA-utskick, nurture, on-my-way, portal-svar-notiser — är osynliga i
  konversationshistoriken.**

**Konsumenter och deras blinda fläckar:** Mattes resolver (senaste 10
raderna av `sms_conversation`, telefonnycklad), den inkommande SMS-agent-
triggern, dashboardens SMS-tråd och kundtidslinjen läser alla
`sms_conversation` — visar alltså kundens meddelanden plus bara
chattliknande svar, missar den transaktionella/proaktiva halvan av
dialogen.

## Yta 4: E-post

**Inkommande (Gmail-pollern):** fångas i `email_conversations`, men
brödtexten **trunkeras till 5000 tecken**. Triggar Mattes e-postintelligens.

**Inkommande (Postmark-lead-intag):** `app/api/email/inbound/route.ts` —
**hela e-postmeddelandets brödtext sparas ALDRIG någonstans.** Bara en
Haiku-tolkad `description` går till leaden, och en 1000-tecken
`body_preview` till godkännandekortets payload. E-post som Steg 1-Haiku
klassar som "inte en lead" **kastas med bara en console.log** — ett
riktigt kundmejl felklassat som skräp lämnar noll sökbart spår.

**Utgående: den enskilt största luckan i hela systemet.** Tre verifierade
fakta tillsammans:
1. Gmail-pollern hoppar explicit över ägarens egna skickade mejl.
2. Agentens `send_email`-verktyg skickar via Gmail API eller Resend och
   **sparar ingenting** — ingen `email_conversations`-rad, ingen
   aktivitetsrad.
3. Ingen `email_log`-liknande tabell finns någonstans (grep-bekräftat noll
   träffar).
Resultat: för e-post behåller systemet permanent bara ENA sidan av varje
konversation.

**Resolver-buggen lever fortfarande:** `resolveEntity()` deklarerar
`channel: 'sms' | 'email'` i `conversationHistory`, men den enda
historik-frågan är `sms_conversation` telefonnycklad, körd bara när
`isPhone` — e-postgrenen ger `[]`. **Mattes Gmail-intelligens kör alltså
intent-agenten på VARJE inkommande e-post med en ALLTID tom
konversationshistorik — den kan inte ens se kundens egna tidigare mejl,
trots att de ligger precis där i `email_conversations`.** Prompten visar
då "Ingen historik". Detta är exakt samma klass av producent/konsument-
missmatch som telefon→customer_fact-buggen som fixades i samma session.

**`read_customer_emails`-verktyget:** läser LIVE Gmail-trådar (bara
utdrag, kräver ansluten Gmail) — rör aldrig sparad `email_conversations`,
så med frånkopplad Gmail har agenten NOLL e-posttillgång trots att datan
finns i DB.

## Yta 5: Kundportal-meddelanden

**Fångas väl:** hela texten, båda riktningar, i `customer_message`, med
offert-kontext-prefix, läskvitton, och varje inkommande meddelande skapar
även ett godkännandekort (agent Daniel) + push.

**Men det är en silo:** `customer_message` läses bara av portal-rutterna,
dashboardens portal-meddelande-API och portalens aktivitetsflöde. **Inte**
av `resolveEntity()`, **inte** av något agentverktyg, **inte** av
kundtidslinjen. En kund som frågar "vad ingår i offerten?" via portalen och
sedan "så är det fast pris?" via SMS möter en Matte vars historik bara
innehåller SMS:et.

## Yta 6: Widget-chatten

**Fångas:** helt transkript som JSONB i `widget_conversation.messages`. Vid
lead-skapande sammanfogas kundens egna meddelanden till `lead.notes`.

**Silo, helt isolerad:** konsumenter av `widget_conversation` är bara
chatt-routen själv och analytics. Ingen `customer_id`-länk, ingen
tidslinjerad, ingen resolver-läsning, inget agentverktyg. Blir besökaren
kund senare är försäljningssamtalet (t.ex. prisintervall AI:n nämnde)
oåtkomligt från all senare kundkontext.

## Yta 7: Övriga "kunden sa/gjorde X"-ytor

- **Offertvisnings-/öppningsspårning** (`quote_tracking_events`) — fångas,
  men inte i tidslinjen.
- **Signeringar** (offert, ÄTA, fältrapport) — egna poster, matar aldrig
  tidslinjen eller agentkontext.
- **`customer_activity`** — det närmaste en kommunikationslogg
  tidslinjen faktiskt läser, men tar emot HÄNDELSE-beskrivningar, inte
  meddelandetext, och inget från röst-/mötes-/e-post-/portal-/
  widget-pipelinerna skriver dit.
- **`agent_memories`** — destillerade en-radare per FÖRETAG, inte per
  kund — hämtningen ignorerar vilken kund körningen gäller. Embeddings är
  `null`, så "relevans" är bara viktighetsordning.
- **Jarvis-specialistagenterna** — läser bara företagsnivå-kontext, ingen
  kundkommunikationsdata alls.

## Yta 8: Kundtidslinjen — finns en komplett per-kund-vy?

`app/api/customers/[id]/timeline/route.ts` har vuxit till **13 sektioner**
(customer_activity, sms_conversation, legacy conversations, quotes,
invoices, bookings, leads, lead_activities, agent_runs, time_entry,
project+project_log, deals+pipeline_activity, customer_fact).

**Verifierat SAKNAS ur tidslinjen — dvs. produkten har INGEN komplett
per-kund-kommunikationslogg någonstans:**
1. **`call_recording`** — telefon- och mötestranskript. "Samtal"-filtret
   läser bara `customer_activity` (manuella loggar) och den döda legacy-
   tabellen `conversations`. Nuvarande pipeline-samtal/möten syns aldrig.
2. **`email_conversations`** — e-post helt frånvarande.
3. **`customer_message`** — portal-tråden frånvarande.
4. **`widget_conversation`** — frånvarande (och olänkbar, ingen customer_id).
5. **`sms_log`** — utgående transaktionell/proaktiv SMS syns i bästa fall
   som `customer_activity`-händelsestubbar, aldrig som meddelandetext.
6. **`quote_tracking_events`**, signeringshändelser — frånvarande.

Den enhetliga inkorgen (`app/dashboard/inkorg/page.tsx`) är kanal-flikad
(SMS/samtal/e-post/inspelningar/möten), inte en sammanslagen per-kund-
kronologi — stänger inte den här luckan heller.

---

## Prioriterad luckelista

Rankad efter skada på (a) agenternas påstådda fullkontext-förmåga och
(b) det framtida compliance/revisionsspår-användningsfallet.

1. **Utgående e-post sparas ALDRIG någonstans** — Gmail-pollern hoppar
   över ägarens mejl; `send_email`-verktyget sparar inget; ingen
   e-postlogg-tabell finns. Kritiskt för både (a) och (b) — halva varje
   e-posttvist är obevisbar, och agenter kan omprissätta/motsäga vad som
   redan mejlats.
2. **`resolveEntity()`s e-posthistorik är fortfarande trasig** —
   deklarerad-men-död `channel: 'email'`; Mattes e-postpipeline kör med
   tom historik på VARJE inkommande mejl trots att inkommande brödtext
   finns sparad. En enda saknad fråga. Kritiskt för (a).
3. **Utgående SMS delad hjärna** (`sms_log` vs `sms_conversation`) —
   majoriteten av utgående SMS-anropsställen når aldrig tabellen alla
   historik-konsumenter läser. Rent konsument-sidans kopplingsfel, samma
   klass som customer_fact-buggen — `sms_log` självt är ett fullgott
   revisionsspår, det är bara olästs.
4. **Tidslinjen är inte den "allt"-vy den ser ut som** — inga samtal,
   inga möten, ingen e-post, ingen portal, ingen widget. Direkt blockerare
   för Compliance Agent-idén.
5. **Portal-tråden osynlig för alla agenter och resolvern** — väl
   fångad, noll kontext-konsumenter.
6. **Postmark-inkommande e-post är förstörande vid infångst** — hela
   brödtexten sparas aldrig; Steg-1-avvisade mejl lämnar inget spår alls.
   Till skillnad från 2-5 kan den här INTE fixas i efterhand — datan finns
   aldrig. Flaggas akut av det skälet.
7. **Widget-chatten helt isolerad** — AI-gjorda prisuttalanden till
   spekulanter oåtkomliga när de blir kunder.
8. **Ingen levande samtalsagent finns** — "Lisa hanterar levande
   telefonsamtal" är i kod en röstbrevlåda + efter-samtal-pipeline. Inte
   en bugg, men ett påstående-vs-verklighet-glapp värt att känna till.
9. **Mindre:** STOPP/START-samtyckesmeddelanden uteslutna ur
   konversationsposten; intent-agenten trunkerar historikmeddelanden till
   80 tecken; `agent_memories` är företags- inte kundnycklad med null-
   embeddings; den döda `conversations`-tabellen läses fortfarande av
   tidslinjens samtalsfilter.

**Osäkerhetsnoter:** Två saker gick inte att bekräfta ur kod ensamt: om
Supabase edge-funktionerna (sms-webhook, scheduled-triggers, vapi-webhook)
fortfarande är driftsatta/tar emot trafik (koden finns, drift-status är en
Supabase-sidans fakta), och gallringspolicy för lösta `pending_approvals`-
rader (relevant för lucka 6 — ingen raderingsjobb hittades i repot, så de
lever sannolikt kvar, men det är en slutsats, inte ett bevis).
