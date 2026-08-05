# Röst-Lisa teknikval — beslutsunderlag (Fas 2a, resurs→röst-planen)

_2026-08-05, Sonnet-researchagent på webben + repo-genomläsning. Skiljer
"påstår" (leverantörsmarknadsföring) från "visat" (dokumentation/priser/
demos). GATE: Andreas beslutar stack + kostnadsram INNAN en rad kod
(plan-filen). Kompletterar tasks/rost-lisa-spec.md (Våg 4.1, 2026-07-15)
och tasks/telephony-integration-roadmap.md (juridiken)._

## Nuläget i koden (verifierat)

Ingen levande AI-konversation i telefon idag: voice/incoming = 46elks
IVR-routing → vidarekoppling ELLER statisk röstbrevlåda (46elks inbyggda
`tts:sv-SE:`-snippet) → Whisper-transkribering + Claude-analys av det
INSPELADE meddelandet i efterhand. Död rest: supabase/functions/
vapi-webhook (gammalt Vapi-experiment, ej inkopplat). ÖPPEN FRÅGA:
rost-lisa-spec.md nämner `RETELL_AGENT_ID` i Vercel-env från tidigare
experiment — ANDREAS: kolla Vercel-dashboarden vad som testades.

## Huvudfynd

1. **46elks räcker som rör — vi behöver inte byta telefonileverantör.**
   Dokumenterad realtids-audio-streaming via WebSocket (PCM 24 kHz) +
   egen tutorial som bryggar till en AI-röststack; levande svensk demo:
   pizzanummer.se (076-686 77 77) — RING DEN, 2 minuter för känslan.
   46elks själva har dock ingen egen konversations-AI (deras TTS är
   statisk uppspelning, det vi redan använder).
2. **OpenAI Realtime utesluter Claude** — röst-till-röst-modellen ÄR
   LLM:et. Väljer vi den förlorar vi återanvändningen av hela vår
   agent-logik/tool-router. Dessutom flaggad svagare svensk STT (leve-
   rantörsjämförelse, ej oberoende verifierad) — precis den svaghet vår
   sentiment-research pekar ut som avgörande ("äldre lägger på").
3. **Vercel klarar inte samtalsloopen** (WebSocket-beta för ny/begränsad;
   Supabase Edge Functions max 150-400 s wall-clock). Rekommenderad
   arkitektur: HOSTAD röstplattform håller ljudloopen; vår app anropas
   bara via korta webhooks/function-calls (call-started → kontext,
   mittsamtals-funktionsanrop → getWeekCapacity/createBooking/escalate,
   end-of-call → transkript till kundkortet). Arkitektoniskt identiskt
   med dagens 46elks-webhooks — ingen egen realtidsinfra.
4. **Juridiken är plattformsoberoende förutsättning**: DPIA (GDPR art. 35,
   samtalstranskribering = high-risk) + informerad kund + loggat
   samtycke — redan flaggat i telephony-integration-roadmap.md. Gäller
   från FÖRSTA riktiga kundsamtalet.

## Kandidatjämförelse (detaljer + källor i researchen, sammandrag här)

| | Svensk röst | Claude? | EU-data | ca kr/min |
|---|---|---|---|---|
| **Retell AI** | Explicit dokumenterad svenska (egen landningssida — starkast evidens); modulär TTS (kan ta ElevenLabs-röst) | JA | Nej (AWS US, DPA/SCC) | 0,75–3,3 |
| **ElevenLabs Agents** | Trolig bäst-i-klass TTS (namngivna svenska röster) | JA (nativt Sonnet-stöd) | Okänt — fråga dem | 1,3–2,1 + ev. plattak |
| **OpenAI Realtime** | Whisper-baserad, flaggad svagare svenska | **NEJ** | EU-residency finns | 1,6–3,2 (0,5–1 hårt cachead) |
| Vapi | Svag svensk-evidens | JA | Nej (USA, SCC) | 1,1–3,2 |
| Pipecat självhostat | Fritt val | JA | Full kontroll | lägst rörligt, högst byggkostnad — EJ MVP |

Skaala-jämförelsen: 299 kr/mån är en 50-minuters-tier (nästan förbrukad
vid 50 samtal); 400-min-tiern 1 499 kr; däröver okänt. Vid 200+ samtal/
mån är plattformarna prismässigt jämförbara — skiljelinjen är röst-
kvalitet + Claude-stöd, inte pris.

## Rekommendation (agentens, delad av mig)

1. **Retell AI** — starkast dokumenterad svenska + Claude + bäst uppmätt
   latens + warm-transfer som kärnfunktion (matchar eskalering-först).
2. **ElevenLabs Agents** — trolig bästa röstnaturlighet; tvåa enbart på
   tunnare telefoni-/transfer-dokumentation. En spike med riktiga
   testsamtal (dialekt!) avgör 1 vs 2 snabbast.
3. OpenAI Realtime — bara om spiken visar att Claude-förlusten är värd
   priset (det är den sannolikt inte — agent-återanvändningen är poängen).

**MVP-snittet** (= rost-lisa-spec.md Fas 1): koppla in plattformen ENBART
i grenen där voice/incoming idag spelar statisk röstbrevlåda (utanför
arbetstid/missat samtal). Kan aldrig göra dagens upplevelse sämre,
slipper svåraste eskalerings-UX:en i v1, testas på separat nummer före
produktionsnumret. Missed-call-text-back förblir Tier 0-fallback.

## Andreas gate-beslut (väntar)

- [ ] Ring pizzanummer.se för egen känsla av 46elks-vägen
- [ ] Kolla RETELL_AGENT_ID i Vercel — vad testades?
- [ ] Välj: spike Retell + ElevenLabs parallellt (~några hundralappar i
      testminuter) eller direkt en av dem?
- [ ] Kostnadsram OK? (~1-3 kr/min rörligt; 200 samtal/mån ≈ 450-2 000 kr)
- [ ] Juridik-spåret: DPIA + samtyckesflöde måste beställas/skrivas före
      första kundsamtal (plattformsoberoende)

## Öppna frågor researchen inte kunde stänga

46elks SIP-trunk direkt mot OpenAI (otestat, community-flaggat);
ElevenLabs EU-hosting (direktfråga); Skaalas pris >400 min + om de
faktiskt saknar kapacitetsbokning (vår claim, ej externt verifierad).
