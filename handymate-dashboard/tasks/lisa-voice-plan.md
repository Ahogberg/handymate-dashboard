# Lisa Voice powered by Matte — realtidsröst-plan (SPARAD, EJ STARTAD)

**Datum:** 2026-08-17. Codex ursprungsplan + Claudes granskning med fyra
korrigeringar inbakade. Beslut: sparad för senare — flywheel-beviset,
v142 och kreditpåfyllningen går före (Andreas sekvens: slutför → migrera
→ verklighetsbevisa → därefter nästa stora bygge).

**Verifierat vid granskningen (2026-08-17):**
- 46elks Realtime Voice API bekräftad mot deras docs: WebSocket,
  bidirektionell PCM (8/16/24 kHz + G.711/Opus m.fl.), explicit
  interrupt-kommando som tömmer buffer, `bye` för graceful avslut,
  första meddelandet bär callid/from/to. ÄR BETA — behåll befintlig
  vidarekoppling som fallback under hela piloten.
- `thread_message`/`agent_handoff`-tabellerna finns (sql/v48–v50) —
  Matte-trådantagandena håller.
- `handymate-voice`-repot finns INTE på utvecklingsmaskinen — legacy-koden
  (Retell-forwarding, Lisa/n8n-hjärnan) är ogranskad. Om n8n-hjärnan lever
  i drift någonstans krävs en explicit avvecklingsplan (etapp 7).

---

## Kärnidé

En tunn realtidstransport ovanpå Matte — INTE en ombyggnad av
agentsystemet (med ETT viktigt undantag, se Korrigering 1). Första målet:
ett riktigt svenskt telefonsamtal till ett demonummer där rösten känner
igen företaget och kunden, hittar ett projekt, frågar vid osäkerhet och
skapar ett säkert strukturerat resultat.

**Identitetsmodellen (avgörande, matchar marknadsföringen):**

```
Extern kund
   ↕
LISA — kundtjänst och hörbar röst (frontstage)
   ↕ intern, osynlig orkestrering
MATTE — förstår, samordnar, routar (orchestrator)
   ↕
Daniel / Lars / Karin (specialister)
   ↕
MATTE — sammanställer verifierat resultat
   ↕
LISA — förklarar det kundsäkert
```

Kunden hör ALLTID Lisa och behöver aldrig veta att Matte/Lars/Karin
finns. Lagras i voice-sessionen som `frontstage_agent = lisa`,
`orchestrator_agent = matte` — INTE via agent_threads.current_agent_id
(som fortsatt ägs av den interna orkestreringen). Dashboarden visar
kedjan transparent ("Lisa tog emot… Matte kopplade… Daniel föreslog") —
Synlig intelligens-principen.

Två produkter ur samma hjärna: **Lisa Voice** (företagets kunder,
telefon) och **Matte Voice** (hantverkaren, mobil/in-app) — olika
identitet, behörighet och samtalsstil.

---

## Claudes fyra korrigeringar (bindande för bygget)

1. **Capability-filtreringen för `external_customer` är agentsystem-
   arbete och byggs FÖRST (ny etapp 1b, före transporten).**
   `actorType: 'external_customer'` finns inte idag — tool-routern,
   Matte-chatten och approval-skapandet antar autentiserad intern
   användare. En extern uppringare får en FILTRERAD verktygsuppsättning,
   facit-låst i eget `tests/voice-actor-capabilities.spec.ts` som räknar
   upp exakt vilka tools en external_customer någonsin kan nå (samma
   stil som behörighetskontraktet). Värdefull även utan röst
   (kundportal-chatt senare). Kunden som säger "markera projektet klart
   och skicka fakturan" → granskningsbart förslag/uppgift, ALDRIG
   verkställande på uppringarens mandat.

2. **Latensmålet ärlighetsjusteras:** första ljud <1s (kvittensfraser:
   "Jag kollar det…"), verifierat svar <5–8s med hörbar mellankvittens.
   En full Matte-tur med verktygsanrop är flera sekunder — det försvinner
   inte för att transporten är snabb. Aldrig ett "1 sekund"-löfte som
   piloten inte kan hålla.

3. **Kostnadsmätning från dag 1:** voice-minuter in i COGS-boken —
   `refType: 'voice_realtime'` via meterDirectLlmCall-mönstret + bucket i
   `lib/costs/fuel.ts` REF_TYPE_BUCKET (den mappningen har missats två
   gånger förr; bränslefacitet fångar den). Annars går Bränsle-mätaren
   och kundens kostnadstak sönder tyst.

4. **Deploymentbeslut FÖRE första kodraden i etapp 2:** långlivade
   WebSockets + låg latens mot svenska nummer → EU-nod (Fly.io/Railway/
   Hetzner). INTE Vercel-routes (WS-stödet är beta med maxlivslängd på
   funktioner). Dashboarden behåller bara korta autentiserade
   bootstrap-/turn-anrop.

Plus två mindre: (a) GDPR — realtidsström till OpenAI/ElevenLabs är en NY
databehandling med nya underbiträden; in i privacy-sidan före pilot med
riktiga kunder; (b) uttalslexikonets begränsning (identifierad kund +
aktiva projekt + liten kandidatlista, ALDRIG hela kundregistret) ska
facit-låsas, inte bara vara en intention.

---

## Målarkitektur

```
Kundens telefon
  ↕
46elks Realtime Voice (beta; befintlig vidarekoppling = fallback)
  ↕ strömmande ljud (WebSocket, PCM)
handymate-voice (separat tjänst, EU-nod)
  ├─ turtagning, avbrott (46elks interrupt), ljud
  ├─ phone number → tenant (ALDRIG klient-skickad business_id)
  ├─ call ID → Matte-tråd
  ├─ uttalslexikon (tenant-begränsat)
  └─ latency-mätning
  ↕ tenantbunden intern API (signerad body, egen voice-hemlighet,
     timestamp + replay-skydd — INTE cron-hemligheten)
Matte (orchestrator) → specialist → befintliga tools/approvals
  → AgentInteraction-resultat
  ↕
handymate-voice → svensk speech-normalizer → TTS → kunden
```

### Moduler i handymate-voice

```
src/
  server.ts
  transports/elks-realtime.ts
  providers/openai-realtime.ts        (kandidat A: speech-to-speech)
  providers/elevenlabs-realtime.ts    (kandidat B: Scribe → Matte → Flash)
  handymate/bootstrap-call.ts
  handymate/run-matte-turn.ts
  voice/swedish-lexicon.ts
  voice/speech-normalizer.ts
  voice/latency-trace.ts
  voice/session.ts
```

### Dashboard-endpoints (interna)

`POST /api/internal/voice/bootstrap` — tar `{providerCallId, from, to}`.
Härleder företaget från `to` (måste vara provisionerat Handymate-nummer),
söker kunden från `from` INOM företaget, skapar/återanvänder Matte-tråd.
Svarar med voiceSessionId, threadId, företagsinfo, ev. kund,
pronunciationHints.

`POST /api/internal/voice/turn` — tar ENDAST `{voiceSessionId,
utteranceId, transcript}`. Tenant/tråd ur den etablerade sessionen.
utteranceId = idempotency key (återanslutning får aldrig dubbelköra).

### voice_session-tabell (smal, sql/vNNN, Andreas kör)

```
voice_session: id, business_id, provider, provider_call_id UNIQUE,
from_number, to_number, customer_id, thread_id, status,
frontstage_agent, orchestrator_agent, actor_type, channel,
model_version, started_at, ended_at, failure_code
```

Ingen kopia av konversationen — meddelanden bor i thread_message,
sammanfattning i call_recording. Tappat WebSocket tappar aldrig
tenant/kund/tråd; samma provider-callback skapar aldrig dubbla sessioner.

### Röstkontraktet (Lisa talar ENDAST customerSafeSpeech)

```ts
type LisaVoiceResult = {
  status: 'answer' | 'clarify' | 'proposal_created'
        | 'employee_followup_required' | 'transferred' | 'failed'
  customerSafeSpeech: string
  confirmedEntities: EntityReference[]
  internalSummary?: string
  approvalId?: string
  assignedAgent?: AgentId
}
```

Regler: `completed`-status bara från verifierat verktygsresultat.
Tvetydig entitet → clarify (aldrig första träffen). Extern kommunikation/
finansiellt → approval. Partial transcript startar ALDRIG en mutation.
Lisa improviserar aldrig från interna tool-results (marginaler,
anteckningar, resonemang läses aldrig upp). Matte får kundens
URSPRUNGLIGA formulering, inte Lisas omskrivning:
`route_to_matte({voiceSessionId, customerUtterance, confirmedEntities,
desiredOutcome, channel: 'external_customer'})`.

### Svenskt uttalslager (deterministisk normalizer före TTS)

ÄTA → "Ä T A" · VVS → "ve ve ess" · 84 500 kr → "åttiofyra tusen
femhundra kronor" · 12 m² → "tolv kvadratmeter" · 2026-08-21 → "den
tjugoförsta augusti". ElevenLabs: uttalsordlistor (alias/IPA). OpenAI:
reference-pronunciation-regler i prompten.

---

## Swedish Voice Quality Lab (etapp 1 — FÖRE all produktionskod)

~120 ljudexempel: ren svenska/telefonsvenska, dialekter,
byggarbetsplatsljud, adresser/kundnamn, ÄTA/ROT/RUT/VVS/Fortnox, belopp
och datum, avbrutna meningar, självkorrigeringar, tvetydiga projekt
("den där offerten", "jobbet hos Andersson").

```ts
type VoiceEvalCase = {
  expectedTranscript?: string
  expectedIntent: string
  expectedEntity?: { type: 'customer'|'project'|'quote'|'invoice'
                     semanticKey: string }
  expectedBehavior: 'answer'|'clarify'|'propose'|'approval_required'|'transfer'
  forbiddenActions: string[]
}
```

Två kandidater körs mot sviten: OpenAI Realtime 2.1 (speech-to-speech)
vs ElevenLabs Scribe Realtime → Matte → Conversational/Flash. Val via
svenska RESULTAT. Mätetal: korrekt intention/entitet/belopp,
förtydligande vid osäkerhet, uttalsbetyg, falska avbrott, tid till
första ljud, task completion, falska framgångsbesked. Sviten bor i
repot, versionerad, repeterbar.

---

## Voice V1 — scope

**SKA:** svara med företagets identitet + AI-disclosure, känna igen
kund från nummer, ta emot ny kund → lead via befintlig golden path,
identifiera ärendekategori, hitta aktiva projekt, läsa enkel
projektstatus, skapa återuppringningsuppgift, koppla vidare akut,
sammanfatta samtalet, skapa approval vid högre risk.

**SKA INTE:** skicka fakturor/offerter, ändra projektstatus, boka
bindande tider, lova pris/leveransdatum, verkställa ÄTA, kontakta
tredje part utan godkännande. Läggs till en i taget efter stabil bas.

**Failover (del av produkten):** Realtime nere → hälsning +
vidarekoppling/meddelande. Matte nere → samla namn/nummer/ärende, ingen
affärshandling. Kund avbryter → stoppa TTS omedelbart. Otydligt projekt
→ fråga. Tool timeout → "Jag kunde inte kontrollera det just nu",
ALDRIG "klart". Brutet samtal → spara senaste verifierade state +
uppföljning.

---

## Leveransplan (korrigerad ordning)

1. **Eval-sviten** + browserbaserat svenskt Realtime-test.
1b. **Capability-filtreringen** för external_customer i agentsystemet
    (Korrigering 1) — facit-låst, byggbar/testbar helt utan röst.
2. Deploymentbeslut (Korrigering 4) → dedikerat 46elks-demonummer genom
   handymate-voice. Kostnadsmätning in från start (Korrigering 3).
3. Matte-bootstrap, beständig tråd, read-only projektfrågor.
4. Lead/task/transfer + approvals.
5. Två pilotföretag, riktiga P50/P95-mätningar (Korrigering 2:s
   ärliga latensmål).
6. Leverantörsval + paketering.
7. Avveckling av legacy (Retell/n8n) när piloten bär.

Uppskattning: 2–3 fokuserade veckor till seriös intern beta
(optimistiskt om eval-sviten tvingar leverantörsbyte sent). Första
fungerande demosamtal betydligt tidigare. Disciplinen: INTE "Matte kan
göra allt via telefon" — först en röstupplevelse som är snabb, svensk,
ärlig och konsekvent.
