# Telefoni-integration — strategisk roadmap

**Loggat:** 2026-06-03
**Status:** PLANERING. INTE BYGGE NU.
**Tidslinje:** Q4 2026 / Q1 2027 (Jarvis-etapp 4, månad 4-6 efter pilot).
**Förutsättning:** Pilot-fas + Jarvis etapp 1-3 har visat värde först.

---

## Vision

Telefoni som AI-integrerad del av hantverkarens vardag — inte som "ett VOIP-system bredvid kalendern" utan som en ström där varje samtal automatiskt:

1. Identifieras (caller ID-berikning från CRM)
2. Loggas med kontext (vilket projekt, vilken pågående offert)
3. Kan eskaleras till action (missat samtal → automatisk SMS-svar med ledig tid)
4. Transkriberas och analyseras (vad sa kunden? → matchas mot pågående deal/projekt → uppdatera Karin/Daniel-context)

Detta är där "agent-first" blir konkret för hantverkaren — inte bara "agenter jobbar bredvid mig" utan "agenterna har realtidsdata från det viktigaste touchpoint:et: rösten".

---

## Tre lager — i prioritetsordning

### Lager 1 — Caller ID-berikning

**Vad:** När en kund ringer Christoffer, visar telefonen "Anna Lindberg — Söder-renoveringen — offert väntar svar" istället för bara numret.

**Hur (tekniska val):**

1. **iOS Call Directory Extension + bakgrundssynk** (rekommenderad första väg)
   - En PWA / native-app utvidgning som registrerar app:en som "Call Identification Provider" i iOS
   - Synkar kundlistan från Handymate till lokal SQLite på telefonen
   - iOS slår upp inkommande nummer mot listan → visar kundnamn + kontext
   - **Pro:** native UX, inga proxy-nummer, fungerar offline
   - **Con:** kräver App Store-process, kräver Apple Developer-konto, kräver iOS-utvecklare (vi har inte den kompetensen in-house)

2. **Proxy-nummer-strategi** (mellansteg)
   - 46elks tilldelar ett dedikerat svensk nummer per business
   - Inkommande samtal till proxy-nummret loggas i Handymate + forwardas till Christoffers riktiga nummer
   - **Pro:** ingen native-app behövs, fungerar på Android också
   - **Con:** Christoffer ser proxy-nummret i samtalsloggen, inte kundens. Annan logg-vy än normal telefon.

3. **CallKit-integration på iOS** (avancerat)
   - Native CallKit kan visa rich-info under samtal (foto, kontext, action-knappar)
   - Kräver app som körs och har behörighet till CallKit
   - **Pro:** bästa UX när det fungerar
   - **Con:** komplex implementering, kräver konstant-running native-app

**Min rekommendation för Lager 1:** börja med Call Directory Extension. Det är den minst invasiva native-integrationen och kan utvecklas separat från huvudappen (kan vara liten standalone-iOS-binary som synkar från Handymate-API).

---

### Lager 2 — Missat samtal → automatisk action

**Vad:** Kund ringer Christoffer som inte hinner svara. Inom 30 sekunder får kunden ett SMS: "Hej! Christoffer kan inte svara just nu — han är troligen i jobbet. Du kan boka 30 min via [länk] eller skicka SMS direkt på detta nummer."

**Hur:**
- Bygger på Lager 1 (måste veta vem som ringde + kontext för att personalisera SMS)
- 46elks call-status-webhook triggar på "missed" → server-side beslutar SMS-innehåll → skickas via sendSmsViaElks
- Personalisering: om kund har pågående offert → "Är det offerten på X du vill diskutera?" Om ny lead → introduktions-SMS

**Beroende på pilot-data:** vill Christoffer/piloterna ha automatiserad SMS efter varje missat samtal, eller blir det creepy? Måste pilot-testas innan vi bygger på i 100+ businesses.

**Möjlig MVP utan Lager 1:** generisk SMS-respons utan kundnamn-kontext. "Hej! Jag missade ditt samtal — ring igen, eller SMS:a på detta nummer så återkommer jag." Det är mindre värde men 95% lättare att bygga.

---

### Lager 3 — Transkription + AI-routing

**Vad:** Inspelade samtal transkriberas automatiskt och analyseras av agent:
- Karin: "Kunden klagade på fakturan 1234 — flagga för granskning"
- Daniel: "Kunden vill ha tillägg på Söder-renoveringen — skapa ÄTA-utkast"
- Matte: "Kunden vill boka in en ny tid — föreslå 3 lediga slot"

**Tekniska val:**

1. **Vapi-utvidgning** (förstaval)
   - Vapi har redan röst-stack i kodbasen (`app/api/voice/`-routen finns)
   - Vapi gör Whisper-transkription + LLM-analys som standard
   - Vi skulle utvidga befintlig pipeline för att inkludera business-context från agent-runtime
   - **Pro:** vi äger pipelinen redan, minst lift, behåller flexibilitet
   - **Con:** Vapi-pricing skalas med antal samtal — verifiera ekonomi vid 100+ piloter

2. **Whisper standalone + egen LLM-routing**
   - 46elks call-recording → ladda upp till egen Whisper-instans → skicka transkript till Sonnet
   - **Pro:** full kontroll, billigare per minut vid skala
   - **Con:** mer infrastruktur (filhantering, recording-API:er, Whisper-deployment)

3. **B2B-leverantörer** (utvärdera innan bygg)
   - **Aircall:** PBX med inbyggd transkription, Salesforce-integration
   - **CallTrackingMetrics:** specialiserad på call-tracking + analys
   - **Dialpad:** AI-meeting-platform med call-analys
   - **Pro:** off-the-shelf, snabbt att utvärdera
   - **Con:** vi gifter oss med deras data-modell, sämre integration med våra agents

**Min rekommendation:** Vapi-utvidgning. Vi äger redan dataflödet och kan styra exakt vad transkription matar in i Karin/Daniel/Lisa-aggregaten.

---

## Juridiska förutsättningar — KRITISKT

**TODO innan Lager 3-bygge: konsultera jurist.** Detta är min preliminära förståelse, inte juridisk rådgivning.

### Brottsbalken 4 kap 9a § (olaga avlyssning)

Svensk lag förbjuder inspelning av samtal man **inte är part i**. Om Christoffer (hantverkaren) spelar in samtal med kund:
- Christoffer ÄR part i samtalet → inspelning är laglig
- MEN kunden bör informeras innan/under samtalet, både av etik och GDPR
- Säkraste flöde: "Detta samtal kan komma att spelas in för att förbättra vår service. Vänligen tryck 1 för att fortsätta, eller stanna kvar för att samtal utan inspelning."

### GDPR — Data Protection Impact Assessment (DPIA)

Artikel 35 GDPR kräver DPIA när behandling av personuppgifter är "high risk". Transkription av samtal:
- Innehåller alltid personuppgifter (kundens röst + innehåll)
- Kan innehålla särskilda kategorier (hälsodata, ekonomi)
- Anses generellt som high-risk → DPIA krävs

DPIA-arbetet inkluderar:
- Vilka data behandlas? (röst-recording, transkript, AI-analys-resultat)
- Vad är ändamålet? (förbättra service, automatisera follow-up)
- Lagring + radering (hur länge sparas? när raderas?)
- Säkerhet (kryptering at rest + in transit, åtkomstkontroll)
- Riskbedömning + mitigeringar

DPIA är inget hinder — det är ett standardarbete. Men måste göras innan vi rör ett enda kund-samtal.

### Konsumentskydd

Konsumentlag (2014:1473) reglerar marknadsföring + försäljning. För automatiska SMS efter missat samtal:
- Måste vara tydligt vem som skickar (Handymate / hantverkare)
- Kunden måste ha möjlighet att opt:a ut (svara "STOPP" e.dyl.)
- Spam-/marknadsföring-regler gäller om SMS:et inte är direkt relaterat till pågående ärende

För Lager 2 (automatisk SMS efter missat samtal från befintlig kund) är detta troligen ingen risk — det är "fortsatt service" inte marknadsföring. Men nya leads = kallt SMS = kan vara reglerat. Verifiera med jurist.

### Opt-in-design

Hantverkaren (Christoffer) som operatör måste:
- Informera vid onboarding att samtal kan spelas in/transkriberas
- Möjliggöra för kunder att opt:a ut
- Logga samtycke (när, vem, hur)

Detta är inte trivialt — opt-in-flöden är ofta misslyckade i UX om de blir för formellt juridiska. Vi behöver design-runda för svensk-konsument-tonalitet.

---

## Köp vs bygg

| Komponent | Bygg | Köp | Min rekommendation |
|---|---|---|---|
| Caller ID (iOS Call Directory) | Native iOS-utveckling | — (ingen direkt B2B-produkt) | Bygg — agency-arrangemang eller junior iOS-utv |
| Proxy-nummer | 46elks (vi har relation) | 46elks (samma) | Köp via 46elks |
| Call-recording | 46elks (basic) eller Twilio | Aircall / Dialpad | Köp 46elks-rec (vi har relation) |
| Transkription | Egen Whisper | Vapi / Deepgram / OpenAI Whisper API | **Vapi-utvidgning** (redan i kodbas) |
| LLM-routing | Egna Claude-anrop | Vapi-flows | Bygg (vår styrka, kontroll över agent-prompter) |
| B2B-paket | — | Aircall, Dialpad, CallTrackingMetrics | Utvärdera vid 50+ piloter — om vi har inte tid att bygga, köp |

**Strategi:** bygg det som är vår moat (LLM-routing, agent-integration). Köp det som är commodity (proxy-nummer, recording). Hybrid.

---

## Placering i Jarvis-roadmap

**Inte etapp 1-3.** Telefoni är för stort scope för pilot-fas:
- Etapp 1: agent-stack stabil + Bee-pilot validerad
- Etapp 2: 5-10 piloter + Karin/Daniel/Lisa anpassad till pilot-feedback
- Etapp 3: pattern-extraction → agent-personalisering (Fas 1b)

**Etapp 4 — Q4 2026 / Q1 2027** (månad 4-6 efter pilot-start):
- Lager 1 (caller ID) som första MVP — testa på 3-5 piloter
- Lager 2 (missat samtal) om Lager 1 fungerar
- Lager 3 (transkription) **endast** om DPIA är klar + jurist har givit go

**Förutsättningar för start:**
1. ✅ Pilot-fas har visat värde (DAU, retention, NPS)
2. ✅ Etapp 1-3 är levererade och stabila
3. ⏳ Junior iOS-utvecklare onboardad ELLER agency-arrangemang för Call Directory Extension
4. ⏳ DPIA-genomgång genomförd (5-10 timmar konsult-arbete)
5. ⏳ Budget för Vapi-skalning verifierad mot pricing

---

## Värde-hypotes

**Hypoteser att validera under Q3 2026:**

1. **"Agent-first" blir konkret med röst.** När Karin/Daniel/Lisa har realtidsdata från samtal är de inte bara "schemalagd analys" utan "ständigt närvarande assistans". Det är skillnaden mellan tools och kollega.

2. **Easoft (eller andra inkumbenter) bygger inte detta.** Företagshantverks-SaaS är generellt byggt som CRM med kalender — fokus på "spara data", inte "agera på data". Att lägga till röst-AI kräver omtanke av hela produkten, inte feature-tillägg.
   - **Notering:** Detta är en hypotes, inte verifierad. Easoft kan i teorin partnera med Vapi eller liknande.

3. **Pris-positionering kan dubblas.** Om en hantverkare upplever att Handymate "sköter telefonen åt mig" (inte bara CRM), är värdet inte 299 kr/mån utan 600-1200 kr/mån. Telefonibranschen är van vid den pris-nivån (Aircall: $40-150/user/mån).

4. **Möjlig moat på 12-24 månader.** Att bygga caller ID + missat-samtal + transkription + agent-routing är en multi-månader-stack med integration mellan iOS, telefoni-leverantör, och AI. Konkurrenter som vill replikera måste antingen partnera (dyrt och slow) eller bygga själva (kräver röst-DNA i teamet).
   - **Notering:** Moat-perioden är gissning. Verifiera när konkurrenter börjar röra sig.

---

## Risker att flagga

1. **iOS Apple Developer-process.** Call Directory Extension kräver godkännande från Apple. Reviews kan ta veckor. Build i god marginal.

2. **46elks vs Twilio-spec.** Om 46elks call-recording inte stödjer det vi behöver (t.ex. webhook-mid-call), måste vi byta till Twilio för Lager 2-3. Det är en betydande migrations-kostnad.

3. **Kundernas integritetskänsla.** Många svenska konsumenter är skeptiska till "AI lyssnar på samtalet". Om vi gör Lager 3 fel kan det skada hela Handymate-varumärket. Måste pilotas på frivilliga business + frivilliga kunder först.

4. **Vapi-pricing vid skala.** Vapi tar betalt per minut + per LLM-call. För 100 piloter × 10 samtal/dag × 5 min snitt = 5 000 min/dag = $250-500/dag. Verifiera ekonomi innan commit.

5. **Junior iOS-utv-rekrytering.** Bra iOS-utvecklare är dyra och raras. Agency-arrangemang ofta bättre för engångsbygge — men då tappar vi maintenance-kapacitet.

---

## Nästa steg (när vi börjar planera detta på riktigt)

INTE NU. När vi är redo:

1. **Bokmöte med jurist** — 1-2h konsultation om BRB 4:9a + GDPR DPIA + konsumentlag, specifikt för call-recording + transkription i hantverks-kontext
2. **Vapi-utvärdering** — kontakta Vapi-säljare, fråga om pricing vid 100-500 businesses, fråga om enterprise-features
3. **iOS-resurs-utvärdering** — agency vs in-house, kostnadsuppskattning för Call Directory Extension (3-6 veckor x utvecklare = 150-300k SEK)
4. **3-5 pilot-business som har sagt "telefoni vore drömmen"** — verifiera att hypotes 1 stämmer innan vi commit:ar resurser
5. **DPIA-arbete** — kan starta parallellt med tekniskt planeringsarbete

---

## Relaterat

- `app/api/voice/` — befintlig Vapi-integration (utgångspunkt för Lager 3)
- 46elks-relation — befintlig leverantör för SMS, kan utvidgas till proxy-nummer + recording
- `tasks/roadmap-learning-ai.md` — strategiska visionen (telefoni är del av Fas 4 där)
- `tasks/agent-triggers-map.md` — agenternas nuvarande triggers; transkription utvidgar dem
