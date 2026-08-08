# Matte Orchestration & Demo Story Audit

**Granskningsdatum:** 2026-08-08  
**Omfattning:** read-only arkitekturgranskning av aktuell arbetskopia i `Ahogberg/handymate-dashboard` samt `main` i `Ahogberg/handymate-voice`.  
**Dashboard-snapshot:** `main` vid `acd11f3a`, inklusive dåvarande ej committade arbetskopierade ändringar.  
**Voice-snapshot:** `main` vid `115e0a3d`.  
**Avgränsning:** ingen produktionskod, migration, UI eller demologik har ändrats. Endast denna rapport har skapats.

`AGENTS.md` efterfrågades men finns inte i dashboard-repot eller dess git-rot. `CLAUDE.md`, `ARCHITECTURE.md`, `docs/council/ACTIVE_ROADMAP.md`, relevanta audit-/demodokument, senaste agentcommits och faktisk kod har granskats. Där dokumentation och kod skiljer sig är aktuell kod bedömd som källa till sanning. Produktionsloggar har inte använts, så "körbart" nedan betyder att en aktiv kodväg kan exekvera beteendet — inte att flödet är bevisat i verklig kundtrafik.

## 1. Executive Summary

Matte är **delvis** en fungerande orkestrator. Den nya chatten kan autentisera en användare, ladda företagskontext, låta en modell välja verktyg, byta till en specialist i samma tråd och låta specialisten svara. Men Matte planerar inte ett sammanhängande fleragentsarbete, återtar inte automatiskt samtalet, aggregerar inte delresultat och har inte ett gemensamt, verkställbart kontrakt för intent, entitet och åtgärdsnivå.

Det finns dessutom tre överlappande "hjärnor":

1. nya interaktiva `/api/matte/chat` med riktig trådbaserad handoff;
2. äldre SMS/e-post-flöde med `MatteDecision`, egen action executor och separat agent-trigger;
3. voice-repots fristående Lisa/Claude/n8n-implementation, som i nuvarande server inte ens är inkopplad i den aktiva SIP-forwardingen.

Handymate behöver inte ett nytt agentramverk. De användbara byggblocken finns redan: autentisering och tenantkontext, verktygsrouter, agentprofiler, trådar och meddelanden, approvals, externa bekräftelser, agentobservationer, moments, visuella agentidentiteter och en avgränsad demoreset. Vinsten ligger i att sätta en liten, gemensam orkestreringskontrakt ovanpå dessa och stänga de säkerhets- och sanningsluckor som annars gör en fleragentskedja farlig.

### Samlad nulägesbedömning

| Område | Bedömning | Huvudskäl |
|---|---|---|
| Matte som global router | **PARTIALLY** | Riktig handoff finns, men routingen är fri LLM-resonering och samma chattools ges till alla agenter. |
| Handoff | **NO — inte produktionsredo** | En specialist kan svara i samma tråd, men DB-fel ignoreras, handofftaket är permanent per tråd och Matte återtar inte kontrollen. |
| Fleragentsförfrågan | **NO** | Högst en handoff per request; ingen plan, resultatöverföring, delstatus eller Matte-aggregation. |
| Säker verkställighet | **PARTIALLY** | Approvals och extern bekräftelse finns, men gränsen beror på kanal/UI och flera högriskverktyg kör direkt. |
| Entitetsupplösning | **PARTIALLY** | Kundsökning finns; projekt-, offert- och fakturasökning är otillräcklig och tvetydighet är inte centralt fail-closed. |
| Voice → samma Matte | **PARTIALLY** | Jobbkompisens in-app-röst gör redan rätt; telefoni/voice-repo har parallella och delvis döda AI-vägar. |
| Demo Story Mode | **PARTIALLY** | Realistiskt demokonto, reset, riktiga approvals och moments finns; storymotor, presentatörsstyrning och deterministisk totalreset saknas. |
| Återanvändning av produktions-UI | **YES** | AgentAvatar, cards, approvals, moments, projekts/offert/fakturavyer och Matte-chatten räcker som bas. |

### De fem viktigaste förändringarna

1. **Ett gemensamt orkestreringskontrakt i Matte:** bevara ursprungligt intent, lösta entiteter, önskat utfall, kanal och action level genom hela kedjan.
2. **Säker sekventiell Multi-Agent V1:** Matte planerar högst 2–3 specialister, validerar varje steg, samlar strukturerade resultat och återtar alltid den användarvända sammanfattningen.
3. **En verkställighetsgräns vid verktygsroutern:** enforce per-agent-toolsets, tenantvalidera alla refererade entiteter och återanvänd approvals/extern confirmation konsekvent på alla ytor.
4. **Tillförlitlig entitetsupplösning och synliga fel:** projekt/offert/faktura-sökning, exakt/tvetydig/ingen träff och aldrig mutation mot en antagen entitet.
5. **Deterministisk demo ovanpå riktiga komponenter:** härda resetten, lägg en liten storykonfiguration och presentatörslager ovanpå seedad produktionslik data; koppla därefter telefoni som transport till samma Matte-API.

## 2. Current Matte Architecture

### Aktiv interaktiv kedja

```text
MatteChatModal / Jobbkompisen
  → POST /api/matte/chat
  → getAuthenticatedBusiness()
  → getOrCreateThread()
  → global företagskontext + trådhistorik + agentminne
  → Claude Sonnet 4.6
  → lokalt navigate/handoff eller gemensam tool-router
  → eventuell extern confirmation / pending approval
  → eventuell executeHandoff() och ett nytt agentvarv
  → svarskedja
  → thread_message + agent_threads + minnesextraktion
```

| Steg | Implementerat? | Aktivt använt? | Säkert? | Duplicerat? | Synligt fel? | Evidens |
|---|---|---|---|---|---|---|
| Textinput | Ja | Ja, MatteChatModal och Jobbkompisen | Ja | UI-rendering duplicerad | Ja | `components/MatteChatModal.tsx`, `components/Jobbkompisen.tsx` |
| In-app-röstinput | Ja | Ja | Delvis; transkript kan vara fel | Legacy-röstanalys ligger kvar | Transkript visas, men entitetsfel saknar standardgrind | Jobbkompisen skickar `transcribe_only=1` och sedan samma Matte-chat |
| Auth/tenant | Ja | Ja | I huvudsak ja; business kommer från session | Nej | Authfel synligt | `app/api/matte/chat/route.ts`, `lib/auth.ts` |
| Tråd | Ja | Ja | Delvis; skapande är business-scopat, vissa helpers är bara thread-scopade | Gamla `matte_conversations` finns parallellt | DB-fel kan döljas | `lib/agent/handoff.ts`, `app/api/matte/threads/**` |
| Global kontext | Ja | Ja | Delvis; alla frågor är business-scopade men queryfel blir tomma listor | Äldre resolver laddar annan kontext | Nej, "inga data" kan visas vid DB-fel | `loadGlobalContext()` i chattrouten |
| Sidkontext | Delvis | Ja från Jobbkompisen | Nej som full kontext; quote/invoice-ID används inte av backend | Nej | Nej | `lib/matte/page-context.ts`; chatten använder främst customer/project för trådkoppling |
| Modellval | Ja | Ja | Modellmässigt ja | Trigger-routen har egen modellpolicy | Modellfel blir generiskt HTTP 200-svar | Sonnet 4.6 i Matte-chatten |
| Intent/routing | Delvis | Ja | Promptbaserat och ej testbart som kontrakt | Äldre `intent-agent.ts` har separat strukturerat beslut | Fel specialist kan se legitim ut | `buildSystemPrompt()`, `lib/matte/intent-agent.ts` |
| Tool selection | Ja | Ja | Delvis; alla chatagenter får samma tool-lista | Trigger-routen filtrerar per agent | Toolfel matas till modellen, slutstatus fri text | `TOOLS`, `runAgentTurn()` |
| Tool execution | Ja | Ja | Delvis; batchar körs parallellt och flera mutationsverktyg saknar tenant-/riskvalidering | Deprecated lokal executor samt äldre action executor | Delvis; modellen kan formulera runt fel | `Promise.all()` i chattrouten, `app/api/agent/trigger/tool-router.ts` |
| Extern confirmation | Ja | Bara när klienten begär den | Nej som global gräns; MatteChatModal utelämnar flaggan | Trigger-routen har annan kanalregel | Ja i Jobbkompisen, saknas i MatteChatModal | `require_confirm_external` |
| Approval | Ja | Ja | Delvis; systemet är förbättrat men modellen kan själv ange risknivå och flera verktyg går förbi kön | Flera skapare av approvals | Approval-fel är oftast synligt | `pending_approvals`, `create_approval_request` |
| Handoff | Ja | Ja | Delvis; validering och tak finns, men DB-fel ignoreras | `send_agent_message` och `[DELEGATED:x]` är andra handoffmodeller | Delvis | `executeHandoff()` |
| Specialistrespons | Ja | Ja | Samma konversation och historik, men samma toolset | Trigger-routen ger en annan responsyta | Ja | Chattroutens outer loop |
| Matte återtar kontroll | Nej | Nej | Nej | — | Användaren ser bara specialisten som sista avsändare | Max en handoff per request |
| Svar/aggregation | Fri text | Ja | Nej för delvis utförda kedjor | Trigger-routen returnerar annan struktur | Delvis fel kan döljas i text | Inget gemensamt `AgentResult` |
| Meddelandepersistens | Ja | Ja | Delvis; service-role, DB-error läses inte | Gamla `matte_messages` finns kvar | Nej | `saveThreadMessage()` |
| Minne | Ja | Ja | Delvis; slutagenten får minnesextraktion | `agent_context`, `business_knowledge` och äldre contextsystem överlappar | Nej vid writefel | agent memories + thread summary |
| Observability | Delvis | Trigger-route ja, Matte-chat nej | Otillräcklig för orkestrering | Flera loggtabeller | Chatfel saknar körspår | `agent_runs`, `agent_handoffs`, `thread_message` |

### Två äldre parallella kedjor

**SMS/e-post:** `resolver.ts → intent-agent.ts → action-executor.ts`, och för SMS även `agent-router.ts → /api/agent/trigger`. Denna väg har ett användbart strukturerat `MatteDecision`, men den kan först verkställa actions och därefter trigga en specialist separat. Specialistens resultat återförs inte till den ursprungliga Matte-konversationen. Det är en aktiv, kanalberoende parallell orkestrering — inte en gemensam kärna.

**Gamla Matte-konversationer:** `app/api/matte/conversations/[id]/messages/route.ts` använder `matte_conversations/matte_messages` och tolkar textmarkören `[DELEGATED:agent]`. Markören byter metadata men låter inte specialisten svara i samma konversation. Den nya chatten använder `agent_threads/thread_message`, vilket gör detta till en äldre eller semantiskt död handoffväg.

### Kontextkvalitet

Chatten laddar öppna offerter, förfallna fakturor, aktiva projekt, leads, approvals och dagens bokningar. Det är tillräckligt för en kort företagsöversikt men inte för säker domänverkställighet:

- projektkontext saknar stabila identifierare och kundkoppling i prompten;
- offert/faktura-kontext saknar tillräcklig kund- och detaljinformation;
- ÄTA, faktisk tid/material, utfall, faktureringsberedskap och Revenue Recovery saknas;
- quote/invoice-ID från aktuell sida används inte för riktad lookup;
- databasfel omtolkas som tom verksamhet.

Målbilden bör inte vara mer global promptdata. Matte bör ladda en liten översikt och använda tenant-säkra lookupverktyg när intentet kräver en viss entitet.

### Relevant commitkontext

| Commit | Förändring | Auditens tolkning |
|---|---|---|
| `acd11f3a` | Moments, page context och utökat demo/story-underlag | Gav verkliga återanvändbara primitives, men ingen sammanhängande story engine eller multi-agentplan |
| `98a4268e` | Offert- och agentarbete | Stärkte aktuella agentflöden; beskrivna capabilities måste fortfarande skiljas från chattools som faktiskt exponeras |
| `186099c8` | Röst/foto flyttades till Matte-logik | Jobbkompisens transcribe-only-väg följer målarkitekturen; äldre voice-analyser finns kvar |
| `a88ca542` | Mattes dirigering synlig i hörnbubblan | Handoff blev synligare, men agentavatar/resultat/status har ännu inget gemensamt UI-kontrakt |

Commits visar en tydlig rörelse mot Matte som ansikte och gemensam yta. De ändrar inte kärnfyndet att execution, handoff och kanalpolicy fortfarande är splittrade i slutlig kod.

## 3. Current Agent Team & Capabilities

Agentteamets kanoniska kodlista innehåller sex agenter. Tabellen skiljer mellan profilerade förmågor och faktiskt exekverbara vägar. "Körbar" är kodbevis, inte produktionsanvändningsbevis.

| Agent | Domän | Beskrivna capabilities | Tools faktiskt tillgängliga | Tools faktiskt exekverbara | Tillåtna handoffs | Högriskhandlingar | Approvalkrav i nuläget | UI-närvaro | Kända luckor |
|---|---|---|---|---|---|---|---|---|---|
| **Matte** | Koordinator/chefsassistent | Allmän fråga, routing, företagsöversikt, samordning | Alla profiltools i trigger-routen; kuraterad chattlista med kund, offert, faktura, bokning, projekt/tid, kommunikation, leads, statistik och ekonomi | Ja via både chat och trigger | Alla giltiga agenter | Fakturautkast, offerter, bokning, kundmutation, extern kommunikation | Inkonsekvent: vissa direkt, externa sends bara bekräftade på vissa UI-ytor | MatteChatModal, Jobbkompisen, dashboard | Ingen fleragentsplan, samma tools för alla i chat, återtar inte samtalet |
| **Lars** | Projekt, planering, tid | Bokning, kalender, projektstatus, tid, lönsamhet, utfall och resursplanering | Triggerprofilens Lars-tools; i chatten samma tools som alla | Ja via trigger/chat; observation runner finns | Matte, Karin, Daniel, Hanna | Projektupdate, booking, time entry | Flera går direkt; `create_approval_request` valfritt | Agentkort, moments/observations, chat-attribution | `update_project` arbetar mot booking; saknar robust projektsökning och säker entitetsupplösning |
| **Karin** | Fakturering/ekonomi | Fakturor, reminders, lönsamhet, Fortnox, betalning | Triggerprofil inkl. invoice/Fortnox/sends; chatten saknar vissa specialtools | Ja via trigger/chat; observation runner finns | Matte, Lars, Daniel | Fakturaskapande, synk, reminder/send, finansiell information | Blandat direkt/approval/kanalpolicy | Agentkort, approvals, moments, chat-attribution | Chatten kan skapa invoice direkt men saknar robust invoice lookup; anställdas finansiella behörighet granskas inte i Matte |
| **Daniel** | Offert, lead, ÄTA och prissättning | Leads, offerter, uppföljning, pricing, efterkalkyl, ÄTA-utkast | Triggerprofil inkl. `create_ata_draft`; chatten exkluderar detta verktyg | Ja via trigger/chat, men inte full domänparitet; observation runner finns | Matte, Karin, Lars | Offert/ÄTA, leadmutation, kundkommunikation | Blandat; offertutkast kan skapas direkt | Agentkort, approvals, moments, chat-attribution | En central demonstrerad ÄTA-förmåga finns inte i den interaktiva Matte-chatten |
| **Hanna** | Kundvård/återaktivering | Kundbas, kampanj, review, service/återaktivering | Triggerprofil för kund/leads/sends/sweep; samma chattools | Ja via trigger/chat; observation runner finns | Matte, Karin, Daniel, Lars | Masskontakt och extern kommunikation | Systemtriggers köar ofta send; livekanaler kan skicka direkt | Agentkort, approvals/observations | Profilens triggerbeskrivning och hårdkodad trigger-routing avviker; ingen egen chatbegränsning |
| **Lisa** | Kundservice/telefoni/bokning | Kunduppslag, samtal, site visit, bokning och svar | Triggerprofil för kund/bokning/sends; samma chattools. Voice-repot har separat verktygslista | Dashboard-tools är exekverbara; voice-repots Lisa-handler är inte inkopplad i aktuell `server.js` | Matte, Karin, Daniel, Lars, Hanna | Kundskapande, booking, SMS/e-post | Kanalberoende; `phone_call` betraktas som användarinitierat | Agentkort, telefoni/observations, chat-attribution | Lisa är inte en bevisad talande röstagent; voice-repots AI-väg är död och tenantlös |

`lib/agent/capabilities.ts` beskriver handoffmöjligheter. `lib/agents/personalities.ts` beskriver agenternas verktygsgränser för `/api/agent/trigger`. Den interaktiva Matte-chatten upprätthåller dock inte dessa gränser: specialistens namn påverkar prompten men inte den faktiska tool-listan. Skillnaden mellan "Daniel kan ÄTA" och "Daniel kan göra ÄTA i Matte-chatten" är därför reell.

Agenternas andra produktionsväg är observationer: Karin, Daniel, Lars, Hanna och Lisa kan skapa `business_knowledge`, notifications och ibland approvals. Matte har ingen motsvarande observationsrunner utan fungerar som yta och koordinator.

## 4. Handoff Audit

### De tre handoffmodellerna

| Modell | Faktisk funktion | Samma konversation? | Säkerhetsräcken | Huvudproblem |
|---|---|---:|---|---|
| `executeHandoff()` i Matte-chat | Byter `current_agent_id`, skriver history och kör mottagaren | Ja | Känd agent, allowed targets, max 3 | Writefel kontrolleras inte; taket är livstid; Matte återtar inte kontroll |
| `send_agent_message(type=handoff)` | Sparar agentmeddelande och triggar mottagaren asynkront | Nej | Målagent finns, men inte samma loop-/threadmodell | Leveransfel kan ändå ge success; svaret når inte användartråden |
| `[DELEGATED:agent]` | Textmarkör lagrar `delegated_to` | Nej | I praktiken promptformat | Ingen faktisk specialistrespons eller domänverkställighet |

### Detaljbedömning

- **Target validation:** riktig chat-handoff validerar agent och allowed target. Agent-message-vägen delar inte samma fulla regelverk.
- **Handoff limit:** `MAX_HANDOFFS_PER_THREAD = 3` är ett ackumulerat trådfält, inte ett request-/plan-tak. Efter tre historiska byten blir tråden permanent blockerad.
- **Per request:** Matte-chatten tillåter högst en handoff. Det förhindrar loopar men omöjliggör två specialister och Matte-retur.
- **History:** handoffhistorik skrivs, men inserts/updates läser inte Supabase `error`. Funktionen kan rapportera `ok: true` utan att state ändrats.
- **Current owner:** `current_agent_id` blir specialisten och förblir där. Nästa allmänna fråga kan därför starta hos fel agent.
- **Context:** hela nyliga historiken finns, men `context_for_next_agent` är en fri LLM-sammanfattning. Ursprungligt intent, lösta ID:n, tillstånd och redan utförda actions är inte oföränderliga fält.
- **Announcements:** chattrouten skapar announcements, men MatteChatModal tappar eller tonar ned semantiken och använder alltid Matte-avatar. Handoff syns främst som text/"via agent".
- **Loop prevention:** self/invalid target och tak finns i chat-handoff; det räcker för en enkel överlämning men inte mellan de två andra handoffsystemen.
- **Thread persistence:** trådskapande är business-scopat. `getThread`, `touchThread`, message loading och summary updates använder däremot enbart thread-ID och förlitar sig på att kallande route redan validerat tenant.
- **Stale state:** permanent specialistägande och permanent handoff count gör gamla trådar semantiskt stela.
- **Failure visibility:** ett handofffel kan ges till modellen, men persistensfel är oftast osynliga. `saveThreadMessage()` kontrollerar inte heller Supabase `error`.

### Döda eller semantiskt oanvändbara vägar

- `[DELEGATED:*]` ser ut som delegering men producerar ingen specialisttur.
- `send_agent_message` kan köra en specialist men kan inte returnera dess resultat till den aktiva användarkonversationen.
- `app/api/test/agent-handoff/route.ts` är en autentiserad, muterande `GET` som kan skapa och ändra handoffdata i en verklig tenant. Den är inte en produktionssäker testgrind och provar inte LLM-routing eller samtalsaggregation.
- Handoff announcement lagras men renderas inte med ett konsekvent visuellt kontrakt.

**Slutsats:** den nya chat-handoffen bevisar att arkitekturens kärna fungerar, men nuvarande implementation är **inte produktionsredo som global orkestrering**.

## 5. Intent & Action Routing

### Matte-orkestrering A–H

| Fråga | Svar | Kodevidens |
|---|---|---|
| A. Kan Matte identifiera rätt specialist? | **PARTIALLY** | Agentprofiler och promptinstruktioner finns, men inget strukturerat routingresultat eller förväntningstest. Trigger-routen har separat prefixrouting. |
| B. Kan Matte lämna över? | **YES, tekniskt** | `handoff_to_agent → executeHandoff()` byter agent och kör mottagaren. Säkerhets- och statebristerna gör helheten ej produktionsredo. |
| C. Kan mottagaren svara i samma konversation? | **YES** | Den nya chattroutens outer loop kör specialisten med samma tråd och historik. |
| D. Kan Matte återta kontrollen efteråt? | **NO** | Max en handoff per request och `current_agent_id` förblir specialist. |
| E. Kan flera specialister delta i en request? | **NO** | `MAX_PER_TURN_HANDOFFS = 1`; ingen plan/aggregation. |
| F. Kan en specialist lämna vidare till en andra? | **PARTIALLY** | I en senare användartur eller via agent-message kan det ske; inte som säker sammanhängande request och inte med Matte-sammanfattning. |
| G. Är loopskyddet tillräckligt? | **NO** | Bra grundguard i en väg, men handoffsystemen delar inte tak/history och trådtaket är fel livscykel. |
| H. Bevaras kontext korrekt? | **PARTIALLY** | Historik bevaras, men originalintent, entiteter, actions och resultat är fri text och kan förvrängas. |

### Intent, context, entity och action level i nuläget

Den interaktiva chatten modellerar dessa främst i prompttext:

- **Intent:** fri LLM-resonering, förutom valet av handoff/tool.
- **Context:** global prompttext, trådhistorik och ibland customer/project-kopplad tråd.
- **Entity:** verktygsparametrar; ingen gemensam resolution/status.
- **Action level:** utspritt över tooltyp, `risk_level`, trigger source, approvaltyp och klientflagga.

Den äldre `lib/matte/intent-agent.ts` har däremot `MatteDecision` med intent, confidence, suggestedAgent, entity-ID:n och actions med `autonomous`. Det är användbar evidens för att ett litet strukturerat kontrakt passar domänen, men dess separata action executor ska inte bli en andra execution stack.

### Minsta nyttiga routinglager

Inför inte en intentplattform. Låt Mattes första modellsteg returnera ett litet validerat objekt:

```ts
type OrchestrationIntent = {
  intent: string
  desiredOutcome: string
  entities: Array<{
    kind: 'customer' | 'project' | 'quote' | 'invoice' | 'lead'
    id?: string
    label?: string
    resolution: 'exact' | 'ambiguous' | 'missing'
  }>
  actionLevel: ActionLevel
  specialists: Array<'lars' | 'karin' | 'daniel' | 'hanna' | 'lisa'>
  needsClarification: boolean
}
```

Detta räcker för routingtester, voice-transkript, demo, säkra ID-uppslag och max 2–3 steg. Domänresonemang och naturligt språk ska fortsatt ligga hos modellerna.

### Action levels och nuvarande motsvarigheter

| Önskad nivå | Befintlig motsvarighet | Nuläge |
|---|---|---|
| READ_ONLY | lookup-/stats-/profitability-tools | Kör direkt, rimligt, men queryfel kan se ut som tomt resultat |
| INFORMATIONAL | `business_knowledge`, AgentNewsRow, voice `berattar` | Bra presentationsprimitive, ingen gemensam orkestreringsmetadata |
| PROPOSAL | AgentMoment, voice `foreslar`, fri chattext | Finns, men inte bundet till ett verkställbart actionobjekt |
| REVIEW_REQUIRED | `pending_approvals`, AgentDecisionCard | Stark befintlig primitive som ska återanvändas |
| EXECUTABLE | direkta mutationsverktyg | Saknar central policy per tool/roll/kanal |
| EXTERNAL_SEND | signed external confirmation eller systemqueued approval | Två bra mekanismer men inkonsekvent val mellan UI-ytor |
| FINANCIAL_ACTION | approvals, invoice tools, Fortnox | Delvis; invoice draft kan skapas direkt och chatten rollkontrollerar inte financial access |

`create_approval_request` accepterar modellens `risk_level`; låg/medium risk kan leda till omedelbar execution. Modellen får därmed i praktiken klassificera sin egen säkerhetsgräns. Action level måste i stället komma från serverägd toolmetadata, användarroll och kanal. Modellen kan föreslå nivå, aldrig sänka den.

## 6. Multi-Agent Orchestration

### Exemplet Storgatan

> "Vi är klara på Storgatan, det blev fyra timmar extra och kunden vill ha fakturan idag."

| Del | Trolig ägare | Kan göras idag? | Problem |
|---|---|---|---|
| Hitta rätt projekt | Matte/Lars | Delvis | Ingen robust projektsökning på adress/kund/recent context; mutation får inte ske på antagande |
| Markera arbetsstatus | Lars | Delvis | Projekt/booking-begreppen är blandade i tools och kräver säkert ID |
| Registrera extra tid/ÄTA | Daniel/Lars | Delvis/nej i chatten | `log_time` finns men durationformat och entitet är svaga; `create_ata_draft` saknas i chattool-listan |
| Förbered faktura | Karin | Delvis | Invoice kan skapas, men underlaget och fleragentsresultatet överförs inte strukturerat |
| Godkännande/skick | Approval layer | Delvis | Skapande och extern send har olika gränser; "kunden vill" är inte samma sak som verifierad användarapproval |
| Sammanfatta | Matte | Nej efter specialist | Matte återkommer inte efter handoff |

En request kan alltså inte säkert involvera flera specialister idag. Handoffs är i praktiken en enda sekventiell överlämning. Resultat från agent A kan endast överföras som fri historiktext. Ursprungligt intent saknar immutable representation. Approval kan därför hamna före komplett underlag, actions kan bli delvis genomförda och `Promise.all()` kan mutera flera saker parallellt. Delvis fel saknar en strukturerad, användarsynlig status.

### Rekommenderad Multi-Agent V1

```text
User turn
  → Matte: resolve intent/entities/action level
  → validate plan (1–3 sequential specialist steps)
  → Specialist A: domain reasoning → AgentResult
  → existing Tool Router / Approval boundary
  → Specialist B: receives original intent + validated prior result
  → optional Specialist C
  → Matte: aggregate completed / proposed / awaiting approval / failed
  → persist user-facing interaction chain
```

**Planner:** ja, men som ett litet validerat plansteg i Matte — inte ny service eller generell workflow engine.

**Structured handoff:** ja. Skicka originalintent, validerade entiteter, önskat utfall, action level, tidigare resultat och explicit uppgift. Fri `context_for_next_agent` kan finnas som komplement.

**Execution plan:** högst tre sekventiella steg, inga fria specialist→specialist-svärmar. Matte äger ordningen och validerar tillåten agent/tool/risk.

**Result aggregation:** ja. Varje steg returnerar status, summary, evidence, entities, proposed/completed actions, approval-ID och error. Matte måste bokföra vad som faktiskt hände och alltid ge en slutlig användarsammanfattning.

**Partial failure:** stoppa beroende steg, behåll redan bekräftat resultat, markera exakt vad som är klart och vad som inte utfördes. Svara aldrig "klart" om någon mutation/tool gav error eller okänd status.

**Approval:** placera approval precis före den högriskhandling som ska verkställas, efter att underlaget är komplett. En väntande approval pausar planen; återupptagning måste vara idempotent och bunden till samma business, user/roll, plan, entitet och payload.

**Matte som samtalsägare:** specialister äger domänresonemang, men Matte äger intro, koordinering, slutstatus och nästa steg.

### Rekommenderade ägarskapsgränser

| Lager | Ska äga | Ska inte äga |
|---|---|---|
| Matte | intent, routing, sekventiell koordinering, originalintent och användarsammanfattning | domänspecifik verkställighetslogik eller bypass av approvals |
| Specialist | domänresonemang, evidens, proposal och val av tillåtna domäntools | tenant, slutlig behörighet, fri routing till obegränsat antal agenter |
| Tool Router | validerad faktisk execution, tenant-/permissioncheck och truthful `ToolResult` | fri konversation, egen riskklassificering från modelltext |
| Approval layer | högriskauktorisation, actor, payload, status, idempotency och execution record | routing eller generell presentation |
| Voice | speech transport, STT/TTS, interruption och channel identity | parallell AI-hjärna eller direkta affärsmutationer |
| Demo Story | storyordning, talking points, presenter state och pekare till seedad evidens | fake affärsresultat, generisk tenant reset eller egna produktionskomponenter |

## 7. Structured Agent Result / Interaction Contract

### Vad som returneras idag

| Kodväg | Primärt resultat |
|---|---|
| Matte-chat | Fri assistenttext, agentnamn, optional handoff announcement, optional external confirmation |
| Tool-router | `ToolResult { success, data?, error? }` |
| Agent trigger | Fri sluttext plus `agent_runs` med steps/tool calls/tokens |
| Handoff | `ok/error`, target agent och fri context summary |
| Agent messages | Meddelanderad, optional `handoff_delivered` |
| Approvals | Approval-ID, typ, payload, status och execution result |
| Moments | `AgentMoment` med agent, kind, title, body, value, source och deep link |

Det finns alltså flera bra delar men ingen liten gemensam struktur för ett specialistresultat som Matte kan skicka vidare och summera.

### Rekommenderat minimikontrakt

Använd två närliggande men olika typer:

```ts
type AgentResult = {
  agent: AgentId
  status: 'completed' | 'proposed' | 'awaiting_approval' | 'needs_clarification' | 'failed'
  summary: string
  entities: ResolvedEntity[]
  evidence?: Array<{ label: string; value: string; sourceId?: string }>
  actions?: Array<{
    tool: string
    status: 'proposed' | 'completed' | 'awaiting_approval' | 'failed'
    approvalId?: string
    error?: string
  }>
  routing?: { suggestedNextAgent?: AgentId }
}

type AgentInteraction = {
  id: string
  source: 'chat' | 'voice' | 'proactive' | 'approval' | 'demo'
  agent: AgentId
  mode: 'informational' | 'proposal' | 'question' | 'result' | 'error'
  status: AgentResult['status']
  summary: string
  entity?: ResolvedEntity
  value?: { amount: number; currency: 'SEK'; label: string }
  approvalId?: string
  targetHref?: string
}
```

`AgentResult` är intern koordinering. `AgentInteraction` är en liten presentationsenvelope. De ska inte bli ett universellt eventsystem och behöver inte ersätta toolresultat, DB-rader eller fri text.

### Proaktiva agent moments

Daniel "Den här offerten har stått i sex dagar", Lars "Materialkostnaden avviker" och Karin "Två projekt är faktureringsklara" bör fortsätta uppstå som domänobservationer/approvals i de befintliga systemen. De ska levereras via notifications eller dashboard, adapteras till `AgentInteraction` för enhetlig presentation och kunna öppna en Matte-tråd med rätt entity context. Matte behöver inte vara writer för varje observation och en ny proactive-plattform behövs inte.

När ett moment kräver handling ska det peka på befintlig approval eller skapa en Matte-konversation som först validerar entitet/action level. Ett informational moment får aldrig se ut som redan genomförd action.

### Relation mellan befintliga begrepp

| Begrepp | Ska förbli | Relation till AgentInteraction |
|---|---|---|
| ChatMessage | Konversationsrecord och historik | Adapteras till en interaction när UI behöver rik presentation |
| Approval | Auktoritativ säkerhets-/actionrecord | Refereras via `approvalId`; får aldrig reduceras till ett UI-kort |
| Notification | Leveranskanal/unread-status | Kan leverera en interaction men är inte samma sak |
| AgentMoment | Härlett proaktivt värdefynd | Kan renderas genom samma interaction-komponent |
| DemoStep | Script/presentatörsmetadata | Kan initiera eller peka på riktiga interactions; är inte affärsdata |
| Agent message | Inter-agent-kommunikation | Kan bidra till AgentResult men ska inte automatiskt visas för kund |

Fri text ska vara kvar för svar, förklaringar och specialistens resonemang. Struktur behövs endast där downstream måste routa, verkställa, bekräfta, summera eller visa korrekt status.

## 8. Agent UI & Visual Handoffs

### Befintliga återanvändbara komponenter

- `TEAM` är gemensam metadata för sex agentidentiteter.
- `AgentAvatar` kan visa rätt specialistbild.
- `AgentDecisionCard` visualiserar förslag och frågor kopplade till approvals.
- `AgentNewsRow` passar informationsresultat.
- `MomentCard` och `MomentsProvider` visar proaktiva värdefynd.
- `lib/jarvis/voice.ts` har de begripligare semantiska lägena `berattar`, `foreslar`, `fragar`.
- `lib/jarvis/approval-view.ts` adapterar approvaltyp till agent, attention, label och deep link.
- befintliga projekt-, offert-, faktura- och kundvyer kan vara destinationer för evidens och actions.

MatteChatModal och Jobbkompisen duplicerar däremot meddelanderendering. De visar ofta bara "via Daniel" eller en prick, och MatteChatModal använder Matte-avatar även när specialisten svarar. Handoff announcements har metadata men saknar konsekvent visuell behandling.

### Rekommendation

En liten gemensam `AgentInteractionCard`/renderer är motiverad om den är en adapter ovanpå nuvarande data, inte en ny datamodell. Den bör kunna visa:

- rätt agentavatar och domänetikett;
- informational/proposal/question/result/error;
- löst objekt med klickbar destination;
- belopp/värde när det finns verklig evidens;
- approvalstatus och befintliga approvalknappar;
- tydlig "inte utfört"/"delvis klart"-status.

För en icke-teknisk hantverkskund bör specialisterna inte bli en fri gruppchatt. Bäst modell är:

```text
Matte: "Jag kollar projektet, extrajobbet och fakturaunderlaget."
Daniel: kompakt domänresultat / förslag
Karin: kompakt domänresultat / approval
Matte: "Det här är klart, detta väntar på ditt godkännande och nästa steg är …"
```

Specialistens identitet ger trovärdighet och begriplighet, medan Matte gör att användaren aldrig behöver förstå teamets internorganisation.

### Minsta visuella identitetskontrakt

`AgentId → displayName, role, avatar, accent, shortVerb`. Exempel: Daniel "hittade", Karin "förberedde", Lars "kontrollerade". Metadata bör alltid följa meddelandet/interaktionen serverifrån så UI inte behöver gissa agent från fri text.

## 9. Voice Architecture

### Dashboardens aktuella voice-vägar

Det finns flera lager:

1. **Jobbkompisen, in-app:** audio → `/api/jobbuddy/voice?transcribe_only=1` → transcript → `/api/matte/chat`. Detta är redan rätt princip: voice är inputtransport till samma Matte.
2. **Legacy Jobbkompis:** voice-routen kan fortfarande köra en egen Claude-baserad actionanalys när `transcribe_only` saknas. Den aktiva UI-vägen går runt den, men den parallella hjärnan finns kvar.
3. **`/api/voice/process|analyze|execute`:** separata äldre voice action-vägar.
4. **Dashboardtelefoni:** `/api/voice/incoming` verifierar 46elks-webhook, löser företag från tilldelat telefonnummer, skapar lead/deal/recording och kopplar vidare eller spelar greeting.
5. **Efter samtal/transkript:** `/api/voice/transcribe` kan trigga `/api/agent/trigger` och har legacy fallback.

### `Ahogberg/handymate-voice`

README och fristående filer beskriver:

```text
Incoming call → Whisper → Claude/Lisa → Azure TTS → n8n tools
```

Men aktuell `server.js` importerar inte `call-handler.js`, Whisper, Claude, Azure TTS eller n8n-tools. Den aktiva servern svarar på incoming call genom att koppla till en hårdkodad Retell SIP-adress och loggar call status. Den beskrivna Lisa-kedjan är därför inte inkopplad i serverns runtime.

Den döda/frikopplade `call-handler.js` är dessutom en separat AI-hjärna:

- hårdkodad verksamhet och Lisa-prompt;
- in-memory `Map` för samtal, utan beständig tråd;
- egna verktyg för kunduppslag, kundskapande, tillgänglighet och bokning;
- direkt Claude, Whisper, Azure TTS och n8n webhook;
- ingen Handymate-auth, business resolution, approval eller tenantbunden tool-router.

`services/n8n-tools.js` postar toolnamn och argument till en webhook utan Handymate-tenant/user-kontrakt. Den vägen får inte aktiveras som produktionshjärna.

### Faktisk nulägeskarta

```text
Extern telefon
  → 46elks/dashboardväg: signerad webhook → business via phone → lead/recording/routing
  eller
  → handymate-voice: hardcoded Retell SIP forwarding

In-app voice
  → Whisper transcript → samma Matte-chat och thread

Fristående Lisa AI/n8n
  → finns i kod, men är inte kopplad till voice-serverns aktiva route
```

Voice har alltså både duplicerad affärslogik och döda kodvägar. Den kan bli transport till Matte, men det kräver att den aktiva telefoniintegrationen skickar autentiserad tenantbunden transcript/context till Matte — inte att den fristående Lisa-hjärnan slås på.

## 10. Voice → Matte Target Architecture

### Minsta målarkitektur

```text
Audio / telephony stream
  → STT (partial + final transcript)
  → Voice adapter
      - verified channel identity
      - business/user resolution
      - external conversation ID → agent_thread
  → Matte Orchestration API
  → AgentResult[] + AgentInteraction[]
  → visual response
  → optional TTS
```

**Voice äger:** audio, STT/TTS, interruptions, call/session IDs, latency och transportretry.  
**Matte äger:** intent, entity resolution, routing, plan, confirmation state och summary.  
**Specialister äger:** domänresonemang.  
**Tool router/approval äger:** execution och auktorisation.

### Krav per riskområde

| Område | Rekommendation |
|---|---|
| Authentication | Mobil använder användarsession/bearer. Telefon använder verifierad providerwebhook + server credential; business löses från konfigurerat nummer, aldrig från transkript/body. |
| Tenant | Skicka serverbestämd `businessId`, user/actor och channel i orkestreringscontext. Tool-router måste återvalidera alla entity-ID:n. |
| Continuity | Mappa call/session-ID till beständig `agent_thread`; voice-repots in-memory Map får inte vara source of truth. |
| Context | Bevara tidigare bekräftad entitet och pending confirmation; ladda detalj via tools, inte stor prompt. |
| Latency | Ett litet route/lookupsteg; använd flera specialister endast när requesten kräver det. Streama verbal progress utan att påstå completion. |
| Interruptions | Kör ingen mutation från partial transcript. Avbryt eller supersede pending proposal säkert. |
| Retries | Idempotency key per final utterance/action. Läsningar kan retryas; mutationer kräver known outcome. |
| Confirmation | Läs tillbaka entitet, belopp och effekt. Explicit "ja" binds till exakt proposal; hög risk får gärna flyttas till mobil approvalkort. |
| Transkriptfel | Vid låg säkerhet eller tvetydig entitet: fråga, mutera inte. Spara gärna originaltranskript som evidens men undvik onödig PII. |

### Mobila voice-use cases

| Begäran | Möjlig idag? | Rätt agent | Befintliga tools | Saknas | Risk |
|---|---|---|---|---|---|
| "Logga tre timmar på projektet Andersson" | **PARTIALLY** | Lars | `search_customers`, `log_time` | Projektsökning, duration→start/end, säker employee/project-koppling | Tid på fel kund/projekt |
| "Vi gjorde två extra uttag och material för 1 800" | **NO/PARTIALLY** | Daniel + Lars | `create_ata_draft` finns i triggerprofil, time/materialdata finns i domänen | Tool saknas i Matte-chat, projektresolution, fleragentsunderlag | Fel ÄTA/belopp och dubbelregistrering |
| "Skicka påminnelse till kunden" | **PARTIALLY** | Karin | send SMS/e-mail, invoice reminder i andra flöden | Invoice resolution och enhetlig confirmation | Extern kontakt/fel faktura |
| "Vad borde jag fakturera idag?" | **PARTIALLY** | Karin + Lars | stats, profitability, outcomeverktyg i delar av systemet | Faktureringsklar read model/lookup i chatten | Missvisande intäktsbesked |
| "Vilka projekt behöver min uppmärksamhet?" | **PARTIALLY** | Lars | global active projects, profitability | Projekt-health/attention query och synliga queryfel | Falskt lugn vid tom/felande query |
| "Skapa en offert till Svensson" | **PARTIALLY** | Daniel | customer search + create quote | Exakt ambiguity guard, fullständigt underlag, tenantvaliderad customer reference | Tom/fel kund-offert |

Voice gör inte dessa use cases säkrare av sig själv. Den förstärker behovet av exakt entity resolution, action level och bekräftelse.

## 11. Entity Resolution & Confirmation

### Nuläge

`search_customers` kan söka på namn, telefon och e-post och returnerar flera träffar. `book_site_visit` har ett bra lokalt mönster: vid flera matchningar returneras kandidater i stället för att boka. Mönstret är dock inte gemensamt.

Kritiska luckor:

- inget generellt `search_projects` på namn, adress, kund och nyligen använt;
- ingen fullgod quote/invoice search/detail för Matte;
- `update_project` arbetar i praktiken med booking, vilket gör språket missvisande;
- "den offerten" och "jobbet förra veckan" löses inte via tydligt current/recent entity state;
- page context innehåller quote/invoice-ID men chattbackend använder dem inte till lookup;
- flera service-role-verktyg accepterar user/model-supplied `customer_id` utan att verifiera samma business.

### Minsta säkra resolution

Alla mutationsbara entiteter bör passera samma tre statusar:

| Status | Beteende |
|---|---|
| `exact` | ID är tenantvaliderat och evidens visas innan högriskaction |
| `ambiguous` | returnera högst några tydliga kandidater; ingen mutation |
| `missing` | säg att objektet inte hittades; erbjud sökning/skapande utan falsk success |

Resolution bör väga explicit ID/page context, senast bekräftad entity i tråden, exakt kund-/adress-/nummermatch och därefter fuzzy kandidater. Senast nämnd entity får hjälpa, men aldrig tyst överstyra tvetydighet.

### Standardiserad confirmation-UX

För entitet:

> Jag tror du menar **Badrum — Andersson**, Storgatan 14. Är det rätt?

För proposal/action:

> Daniel föreslår **ÄTA 3 450 kr** för fyra extra timmar.  
> [Godkänn] [Ändra]

Återanvänd befintliga approvals och AgentDecisionCard. Extern confirmationtoken kan återanvändas för kortlivad exakt sendbekräftelse, men bör bindas till user/actor, vara single-use och inte ersätta finansiell approval.

## 12. Existing Demo Infrastructure

### Vad som finns

- explicit `/dashboard/demo`, inte i sidomenyn;
- `/api/admin/demo-reset` med autentisering och exakt `DEMO_BUSINESS_ID`-grind;
- `resetDemoAccount()` med relativt daterad, produktionslik data;
- kunder, deals, quotes/items, invoices, projects, bookings, schedule, approvals, agent runs och observations;
- verkliga quote-beräkningar och riktiga approval payloadformer;
- `AgentMoment` härleds från riktiga approvals och `business_knowledge`;
- produktionskomponenter används för approvals, moments och affärsobjekt;
- one-time demo-teamseed i SQL som resetten medvetet inte rör.

Det finns ingen faktisk 6-stegs story engine, next/previous presenter state eller komplett deterministisk reset. `/dashboard/demo` är i huvudsak återställningskontroll.

### Säkerhet och realism

Den hårda tenantgrinden är en stark start: om `DEMO_BUSINESS_ID` saknas blir svaret alltid 403 och routen tar inte ett godtyckligt business-ID. Seedade telefonnummer går till presentatörens eget nummer och e-post använder demoformat. UI och approvalexecution är riktiga, inte attrapper.

Men resetten är sekventiell och icke-transaktionell. Supabase-deletefel kontrolleras inte. En crash kan lämna en halvresetad tenant. Alla agent-/conversation-/unread-/operativa tabeller rensas inte, och reset är inte auditloggad.

### Överlapp med den föreslagna storyn

Aktuellt seed innehåller bland annat:

- stale quote/uppföljning;
- ÄTA/missed revenue på cirka 8 900 kr;
- materialmiss på cirka 2 400 kr;
- projektmarginalrisk på 9 250 kr;
- invoice/reminder-exempel på cirka 6 000 kr;
- Daniel-, Lisa- och Lars-observationer.

De föreslagna beloppen 84 500 kr och 38 700 kr är inte samma som nuvarande seed. En säljdemo får inte hårdkoda påståenden som inte stöds av den aktuella tenantens verkliga data.

## 13. Demo Story Mode Architecture

### Rekommenderad berättelse

Nuvarande produktrealitet stödjer en bättre sekvens än en ren agentparad:

1. **Matte Morning Brief:** "Tre saker behöver din uppmärksamhet; här är pengarna och risken."
2. **Daniel — intäkt som saknas:** visa verklig stale quote eller ÄTA/missed revenue från seedad data.
3. **Lars — skyddad marginal:** visa 9 250 kr material-/marginalrisk kopplad till riktigt projekt.
4. **Karin — pengar hem:** visa verklig förfallen faktura/reminder och riktig approval, med belopp från data.
5. **Live Matte:** prospektet frågar om ett av dessa riktiga objekt; Matte slår upp och lämnar till högst relevant specialist.
6. **Värderecap:** summera endast verifierade storyvärden och skilj mellan återvunnen intäkt, risk och snabbare cash flow så de inte dubbelräknas.

Om stale quote i seed är värd ett annat belopp än säljmanuset ska UI/manus läsa beloppet från data. Storyn ska demonstrera "finner pengar, skyddar marginal, tar bort admin", inte ett på förhand lovat totalsaldo.

### Produktionskomponenter som ska användas

| Storybehov | Befintlig produktionsyta |
|---|---|
| Agentbudskap | AgentAvatar + chat/AgentNewsRow och framtida gemensam interaction-renderer |
| Värdekort | MomentCard och befintlig value/moments-logik |
| Approval | AgentDecisionCard + riktiga `pending_approvals` |
| Projektkontext | befintlig projektlista/detalj/ekonomi |
| Offertkontext | befintlig offertlista/detalj/public view |
| Fakturakontext | befintlig fakturalista/detalj/reminder |
| Matte live | `/api/matte/chat` och samma agent thread |

Inga demo-only agentkort eller fake approvals behövs.

### Behövs `DemoStory`/`DemoStep`?

**Ja, som lätt kod/config — inte som ny affärsdatabas i V1.** En typad TS-/JSON-konfiguration räcker för en enda eller några få säljberättelser:

```ts
type DemoStep = {
  stepId: string
  agent: AgentId | 'matte'
  talkingPoint: string
  targetRoute: string
  entityKey?: string
  expectedEvidence: string[]
  expectedOutcome: string
  liveAction?: 'open' | 'approve' | 'ask_matte' | 'recap'
}
```

Resetten bör returnera eller lagra en tenantintern manifestmapping från stabila semantiska `entityKey` till nyskapade ID:n. Storykonfigurationen ska peka på dessa, inte bära fake messages eller hårdkodade affärsresultat.

### Datamodell: hybrid

| Alternativ | Bedömning |
|---|---|
| A. Full seedad produktionslik tenant | Hög realism men större resetkomplexitet; ska vara basen för de objekt som visas och muteras |
| B. Fake interaction overlays | Deterministiskt men underminerar hela bevisvärdet och duplicerar UI/logik |
| C. Hybrid | **Rekommenderas:** riktiga seedade objekt/workflows + tunn story/presenter-konfiguration |

Hybrid betyder inte fake resultat. Storylagret bestämmer ordning och talking points; verklig data, komponenter, approvals och live Matte ger evidensen.

## 14. Presenter Mode

Ett presentatörslager är motiverat och har låg till medelhög implementationströskel om det hålls utanför affärslogiken.

### Rekommenderad funktion

```text
Endast presentatören ser:
[Steg 2/6] [Talking point] [Föregående] [Nästa] [Återställ]

Prospektet ser:
ordinarie Handymate-vy, riktiga agentkort, approvals och objekt
```

### Säkerhetsmodell

- synligt endast när aktuell tenant exakt matchar `DEMO_BUSINESS_ID`;
- därutöver owner/admin eller en explicit demo-presentatörsroll;
- reset och presenterstatus är separata rättigheter;
- presenterläge får aldrig låsa upp generiska adminfunktioner eller ändra business-ID via query/body;
- prospectsidan ska vara normal produktion rendering, inte en specialversion.

Presenter progress behöver inte vara en persistent affärsrad i V1. `sessionStorage` är tillräckligt för step/expanded/talking point under en demo. Om två skärmar ska synkroniseras kan en liten server-side session senare motiveras, men bygg inte detta innan behovet är bevisat.

`Reset` ska anropa den säkra resetmekanismen och därefter nollställa presenter state, aktuell demo-thread och client-side seen/unread state. `Next/Previous` ska navigera till storyns riktiga `targetRoute`; det ska inte skapa eller slutföra affärshändelser i bakgrunden.

## 15. Demo Tenant & Reset Safety

### Nulägesrisker

Resetten rensar flera huvudtabeller men inte hela storypåverkande tillståndet. Exempel på kvarvarande eller otillräckligt hanterade områden:

- `agent_threads`, `thread_message`, `agent_handoffs`, `agent_messages`, `agent_memories`;
- notifications/unread och klientens localStorage för moments;
- potentiella projektbarn som time entries, material, ÄTA, foton/loggar beroende på storyutökning;
- call/SMS/e-mail history och externa leveransspår;
- cron-/automationstillstånd och nyligen bearbetade agentfynd;
- delvis data om en delete/insert misslyckas.

Slump-ID:n och relativa datum är bra för färskhet men påverkar stabil referering. Slumpmässiga ID:n gör även att ett lokalt "seen"-state kan bete sig olika mellan resetter.

### Säkrast möjliga reset

1. **Dubbel servergrind:** autentiserad owner/admin och serverbestämd business exakt lika med explicit allowlistad demo tenant.
2. **Ingen generisk parameter:** API:t accepterar aldrig ett valfritt tenant-ID att återställa.
3. **Transaktion:** ett dedikerat tenantbundet RPC-/DB-kommando rensar och seedar atomiskt, eller rollbackar allt.
4. **Explicit tabellmanifest:** varje tabell och deleteordning är kodgranskad; okända/felande deletes avbryter.
5. **Idempotency:** en resetnyckel/run-ID; upprepat call ger samma logiska basläge utan dubbletter.
6. **Deterministisk manifest:** story keys, relativa datum och värden är bestämda; returnera entity mapping till UI.
7. **Auditering:** actor, business, reset version, start/slut, resultat och fel utan onödig kunddata.
8. **External safety:** all syntetisk kontaktdata går till ägd testdestination; externa integrationer är sandboxade eller explicit spärrade utom det moment som presentatören avsiktligt godkänner.
9. **Cron isolation:** demotenant undantas från oförutsägbara crons under presentation eller reset återställer även deras deterministiska state.
10. **Client reset:** clear av storyspecifika storage keys och start av en ny Matte-thread.

Den nuvarande env-grinden ska behållas. Den behöver kompletteras, inte ersättas av ett generiskt resetramverk.

## 16. Live Matte Demo Step

### Kan det fungera med verklig Matte idag?

**PARTIALLY.** Matte kan svara mot global demoöversikt, använda riktiga tools, handa över till en specialist och spara samma tråd. Det räcker för en kontrollerad enkel fråga där objektet är tydligt och data finns i den lilla globala kontexten.

Det räcker inte för en robust fri live-demo eftersom:

- projekt/offert/faktura saknar komplett search/detail;
- page context inte används fullt ut;
- en request kan bara nå en specialist;
- Matte ger ingen slutaggregation;
- tool/queryfel kan presenteras som tomt eller fri text;
- agentminne och tidigare thread owner kan variera mellan körningar;
- modellvariation kan ge annan specialist eller formulering.

### Minsta realistiska live-steg

1. Presenter navigerar till ett seedat objekt genom storymanifestet.
2. Matte får explicit page/entity context som backend tenantvaliderar.
3. Prospektet ställer en naturlig fråga.
4. Matte löser exakt objekt; vid annan/tvetydig fråga ställer den en följdfråga.
5. Matte använder högst en relevant specialist i första demo-versionen, eller Multi-Agent V1 efter att den är klar.
6. Specialistresultatet bygger på riktiga records/tools.
7. Matte sammanfattar fakta och eventuellt förslag; ingen extern/finansiell action sker utan verkligt approvalkort.

### Kontroller för konsekvens utan fake svar

- stabila story/entity keys och bestämd querysortering;
- temperatur/responseformat anpassat för routing och result JSON;
- ny tråd och rensat minne per demo;
- frozen reset version och story version;
- relativa tider satta vid reset men ett gemensamt `demoNow` inom runnen;
- deterministisk dedup och inga cronwrites under storyn;
- presenter-manus med accepterade variationer, inte ett exakt förskrivet AI-citat;
- vid misslyckad tool lookup: synligt fel och presentatörens fallback till objektvyn, aldrig hårdkodat success-svar.

## 17. Security / Tenant Isolation

### Positiva gränser

- Matte-chatten härleder business från autentiserad session, inte från body.
- explicit thread-ID valideras mot business i `getOrCreateThread()`.
- de flesta toolqueries inkluderar `business_id` på huvudtabellen.
- demo-resetten är fail-closed om `DEMO_BUSINESS_ID` saknas.
- dashboardens telefoni verifierar providerwebhook och löser tenant från tilldelat nummer.
- approvals har på senare tid fått bättre CAS, fail-closed execution och result tracking enligt aktuell roadmap/kod.

### Kritiska eller höga risker

| Risk | Evidens | Konsekvens | Prioritet |
|---|---|---|---|
| Service-role skapar objekt med ovaliderad främmande `customer_id` | `create_quote`, `create_invoice`, `create_booking`, `log_time` och direkt customer-ID i site visit | Cross-tenant reference/integritetsbrott om ett främmande ID når verktyget | P0 |
| Specialisttoolsets är prompt-only i chatten | alla agenter får `TOOLS` | Fel specialist/model kan exekvera annan domäns mutation | P0 före multi-agent |
| Extern send-confirmation styrs av klientflagga | Jobbkompisen sätter flaggan, MatteChatModal inte | Samma begäran kan skicka direkt på en yta och fråga på en annan | P0 |
| Finansiella tools/context saknar tydlig rollgrind i Matte-chat | auth ger business men ingen dokumenterad money permissioncheck | Vanlig employee kan potentiellt se/utföra mer än UI-rollen avser | P0/P1, verifiera policykrav |
| DB-fel ignoreras i handoff/message/global context | Supabase `error` läses inte | Falsk success, tappad audit eller falskt "inga fakturor" | P0/P1 |
| Thread helpers är inte alltid business-scopade | get/touch/load/summary med thread-ID | Säkerheten beror på alla callsites; framtida intern endpoint kan tappa tenant | P1 |
| Confirmationtoken saknar tydlig user-/single-use-binding | business/thread/agent/tool/args + TTL | Replay inom giltighet och svag actor attribution | P1 |
| Agent kan ange egen risknivå | `create_approval_request` | Modellen kan sänka säkerhetsgränsen | P1 |
| Voice-repots n8n-tools saknar tenant/auth | tool/webhook payload utan Handymate actor/business | Får aldrig kopplas till prodverktyg | P0 om vägen aktiveras |
| Muterande test-GET | `/api/test/agent-handoff` | Produktionstenant kan få skräp/stale handoffstate | P1 |
| Demo-reset saknar owner/admin och transaktion | exakt tenant men alla autentiserade i den kan anropa | Intern demoanvändare kan förstöra pågående demo; partial reset | P1 |
| Approval ownership defaultar ofta till `any` | generiska approval creators/routing | Fel roll kan godkänna finansiell/external action | P1, domänpolicy krävs |

Business-ID, user identity och tenant context ska följa varje orkestreringssteg som serverägd metadata. Specialister och modeller får aldrig kunna ändra dem. Tool-router gör alltid sista tenant- och permissionkontrollen, även när Matte redan löst entiteten.

## 18. Reliability / Failure Handling

| Fel | Nuläge | Krävd V1-beteende |
|---|---|---|
| Agent unavailable/model timeout | Generiskt svar, ofta HTTP 200 | `failed` result, retrybar status och inget successpåstående |
| Tool error | ToolResult till modellen | Bevara exakt error/status; Matte säger vad som inte gjordes |
| Handoff DB-write misslyckas | Kan returnera ok ändå | Avbryt handoff; current owner får inte antas ändrad |
| Specialist ger ingen finaltext | Generisk fallback | Markera failed/needs clarification; Matte återtar samtalet |
| Partial multi-agent success | Ingen modell | Visa completed per step, stoppa beroenden, erbjud säkert återupptag |
| Approval expired/rejected | Approvaldomänen kan hantera status | Planen måste mappa status till paused/cancelled och inte retrya action |
| External API unavailable | Tool kan returnera fel | Separera "förslag klart" från "meddelande skickat"; known outcome krävs |
| Entity ambiguous | Lokala verktyg varierar | Standardiserat clarificationresultat; noll mutation |
| Voice transcript wrong | Transcript går vidare till Matte | Confidence/confirmation på entitet, belopp och action |
| Context query misslyckas | Tom lista | Synligt degraded context; svara inte "inget finns" |
| Persistens misslyckas efter svar | Oftast osynligt | Logga/correlate, markera response persistence degraded; högrisk action måste ha audit före success |
| Batchtool A lyckas, B misslyckas | Parallel execution och fri sammanfattning | Sekventiell plan eller explicit oberoende batch; strukturerad partial status |

Ett grundkrav bör vara: **ingen användarvänd completion utan bevisad tool-/approvalstatus**. Textmodellens formulering får inte vara systemets source of truth.

## 19. Testing & Observability

### Tester före första implementation wave

**Matte routing**

- billing question → Karin;
- project question → Lars;
- quote/ÄTA question → Daniel;
- customer retention → Hanna;
- phone/customer-service question → Lisa;
- general question → Matte;
- agent/tool-policy mismatch nekas server-side.

**Handoffs**

- valid och invalid target;
- self-handoff och loopförsök;
- max per request/plan, inte lifetime-stale thread;
- originalintent och exact entity-ID bevaras;
- failed DB insert/update får inte returnera success;
- Matte återtar slutägarskap.

**Multi-agent**

- 2-agent sequence och 3-agent maximum;
- 4:e specialist nekas/omplaneras;
- A-resultat går oförändrat till B;
- partial failure och beroende step stoppas;
- approval pausar och återupptar idempotent;
- inga parallella mutationsverktyg när ordning krävs;
- final summary skiljer completed/proposed/failed.

**Entity resolution/security**

- exact, ambiguous och no match för customer/project/quote/invoice;
- cross-tenant ID nekas i varje service-role-tool;
- rollkontroll för financial/external tools;
- body kan inte spoof:a business/user;
- thread access med fel business nekas.

**Demo**

- reset bara explicit demotenant och owner/admin;
- production tenant blockeras även med manipulerad body;
- delete-/insertfel rollbackar;
- två resetter ger samma logiska story;
- story evidence matchar riktiga belopp/statusar;
- stale threads/memory/notifications/seen state rensas;
- reset audit skrivs;
- cron/external integration kan inte göra storyn nondeterministisk.

**Voice**

- final transcript går till samma orchestration service som text;
- provider identity löser rätt tenant och transcript kan inte ändra den;
- external conversation fortsätter samma thread;
- partial transcript exekverar aldrig;
- ambiguous/high-impact action kräver bekräftelse;
- retry skapar inte dubbel time entry/booking/send.

### Befintlig testtäckning

Det finns bra kontraktstester för approvals, approval view, Jarvis voice modes, moments och Matte page context. Det saknas däremot de obligatoriska routing-/handoff-/multi-agent-/entity-/voice-adapter-/demo-isolationstesterna ovan. Den muterande test-GET-routen ersätter inte automatiska browserlösa kontraktstester eller integrationstest mot isolerad databas.

### Befintlig observability

| Signal | Finns? | Kommentar |
|---|---|---|
| Agent runs | Ja i trigger-routen | steps, tools, tokens, kostnad och duration; inte Matte-chatten |
| Handoff logs | Ja | bra tabell, men writefel kan ignoreras |
| Thread messages | Ja | agentmetadata och handoffflagga, men persistensstatus svag |
| Agent messages | Ja | inter-agent mailbox, leveransresultat delvis |
| Approvals | Ja | status, payload och execution result |
| Observations/moments | Ja | `business_knowledge` + härledning |
| Tool/model correlation | Nej gemensamt | saknas över Matte→specialist→tool→approval |
| Voice correlation | Nej gemensamt | call/transcript och agent thread är splittrade |
| Demo reset audit | Nej | behövs före säljberoende reset |

### Minsta observability före Multi-Agent V1

Återanvänd `agent_runs`, `agent_handoffs`, `thread_message` och approvals. Lägg ett gemensamt `orchestrationRunId`/correlation ID i befintlig metadata där möjligt. Logga per step: agent, intent label, entity IDs, tool, action level, status, approval ID, duration och sanitiserat error. Logga inte hela prompts, transkript eller PII som standard.

För Matte-chatten behövs samma run/step/tool outcome som trigger-routen. Ett nytt generellt observability-system behövs inte.

## 20. What NOT to Build

| Förslag | Beslut | Skäl |
|---|---|---|
| Nytt agent framework | **Bygg inte** | Team, tools, prompts, threads, approvals och observations finns redan |
| Autonomous agent swarm | **Bygg inte** | Otydlig ägarskap, kostnad, loops och risk; 2–3 sekventiella specialister räcker |
| Parallella autonoma specialister | **Bygg inte i V1** | Beroenden och partial mutations kräver begriplig ordning |
| Full workflow engine | **Bygg inte** | En liten in-request plan/status räcker; approvals står för pausen |
| Generic event sourcing | **Bygg inte** | Befintliga logs/records är tillräckliga med correlation ID |
| Ny tool-router | **Bygg inte** | Härda och återanvänd den befintliga |
| Ny approvalplattform | **Bygg inte** | N5-kärnan, pending approvals och UI ska återanvändas |
| Separat voice AI brain | **Bygg inte** | Voice ska vara transport till Matte; fristående Lisa/n8n-vägen ska inte aktiveras |
| Fake demo-agent-UI | **Bygg inte** | Produktionskomponenterna kan visa samma story |
| Generic tenant reset | **Bygg inte** | Endast exakt allowlistade demotenants får nå reset |
| Full intent-classification platform | **Bygg inte** | Ett litet schema-validerat route/result-objekt räcker |
| Universal agent event/interaction-databas | **Bygg inte** | AgentInteraction är presentationskontrakt, inte ny source of truth |
| Stor global contextprompt | **Bygg inte** | Verktygslookup är säkrare, billigare och färskare |

## 21. Prioritized Findings P0–P3

### P0 — stäng före utökad orkestrering

| ID | Fynd | Rekommendation |
|---|---|---|
| P0.1 | Service-role-mutationsverktyg tenantvaliderar inte alltid refererade customer/booking/entity-ID:n | Lägg server-side same-business validation i tool-router för varje relation |
| P0.2 | Chatten upprätthåller inte agenternas tool allowlists | Filtrera tools server-side per current specialist och neka mismatch vid execution |
| P0.3 | Extern confirmation beror på klientflagga och finansiell rollgrind är oklar | Serverägd action policy baserad på tool, roll, kanal och payload |
| P0.4 | Handoff/message/context kan rapportera eller antyda success trots Supabase error | Kontrollera varje DB-resultat och gör failure explicit innan fler steg tillåts |
| P0.5 | Voice-repots tenantlösa Lisa/n8n-verktyg skulle kringgå Handymates säkerhetslager om de aktiveras | Aktivera dem inte; bygg endast adapter till Matte/tool-router |

### P1 — krävs för Multi-Agent V1 och pålitlig demo

| ID | Fynd | Rekommendation |
|---|---|---|
| P1.1 | Ingen immutable intent/entity/action-level plan | Litet validerat OrchestrationIntent/plan |
| P1.2 | Högst en handoff, permanent specialistägande, permanent lifetime-tak | Requestbaserad max 3-plan och Matte som start/slutägare |
| P1.3 | Ingen AgentResult/partial failure aggregation | Inför minimalt resultkontrakt och statusdriven Matte-summary |
| P1.4 | Entity resolution saknar projekt/offert/faktura och central ambiguity guard | Tenant-säkra lookup tools och exact/ambiguous/missing |
| P1.5 | Demo-reset är inte atomisk, komplett eller auditloggad | Dedicated demo-only transaction + manifest + reset audit |
| P1.6 | Matte-chat saknar full run/tool observability | Återanvänd agent_runs/handoffs med correlation ID |
| P1.7 | Muterande test-GET kan påverka verklig tenant | Ersätt med isolerade automatiska tester och ta bort/gata endpoint i implementation |

### P2 — konsolidering och produktupplevelse

| ID | Fynd | Rekommendation |
|---|---|---|
| P2.1 | Tre orkestreringshjärnor ger kanalberoende beteende | Låt SMS/e-post/voice anropa samma Matte-kärna och pensionera parallella executors gradvis |
| P2.2 | Chat-UI duplicerar renderer och agentidentitet är svag | Gemensam AgentInteraction-renderer ovanpå befintliga cards/avatarer |
| P2.3 | Page context är halvinkopplad | Backendvalidera och använd quote/invoice/project/customer context till riktad lookup |
| P2.4 | Demo saknar story/presenter state | Tunn typed config + demo-only presenterpanel |
| P2.5 | Proaktiva fynd, notifications och chat visas som separata UX-språk | Adaptera till samma presentationskontrakt; behåll separata domänrecords |

### P3 — senare förbättringar

- fler storyvarianter per bransch efter att en story är stabil;
- server-synkat presenterläge om tvåskärmsbehov bevisas;
- bättre fuzzy/recent entity ranking baserat på mätdata;
- optimerad voice latency, streaming och interruption efter säker textadapter;
- bredare agentminne först när samtycke, retention och kvalitet är definierade.

## 22. Claude Implementation Plan

Följande ordning är härledd från säkerhets- och beroendekedjan. Multi-Agent, demo och voice ska inte byggas parallellt ovanpå den nuvarande osäkra toolgränsen.

### Epic 1 — Orchestration Safety Contract

**Problem:** routing, entity och actionrisk är prompt-/kanalberoende; tool-router är inte fullständigt tenant- och rollvaliderad.  
**Goal:** en serverägd, testbar gräns där samma request får samma säkerhetsbeteende oavsett text, voice eller specialist.  
**Exact scope:** definiera `OrchestrationIntent`, `ResolvedEntity`, `ActionLevel` och toolpolicy; enforce per-agent allowlist; tenantvalidera alla refererade IDs; gemensam external/financial/approval-policy; kontrollera alla Supabase errors; använd full page context genom säkra lookups.  
**Out of scope:** fleragentsplan, ny approvalmotor, ny tool-router, UI-redesign, generell intentklassificering.  
**Dependencies:** aktuell N2/RLS- och approvalstatus verifierad enligt roadmap; roller/permissions måste ha produktbeslut där de är oklara.  
**Existing code to reuse:** `getAuthenticatedBusiness`, `AGENT_CAPABILITIES`, `AGENT_PERSONALITIES`, tool-router, `ToolResult`, approvals, external confirmation, `MatteDecision` som referens — inte executor.  
**Files/domains likely affected:** `app/api/matte/chat/route.ts`, `app/api/agent/trigger/tool-router.ts`, tool definitions, capabilities/personalities, `lib/matte/page-context.ts`, nya små typer/tests under befintlig agentdomän.  
**Schema change?** Nej för första kontraktet.  
**Migration?** Nej.  
**Tests:** routing matrix, tool allowlist, cross-tenant entity IDs, role/action level, confirmation parity, DB-error fail closed, ambiguity.  
**Acceptance criteria:** modellen kan inte sänka risk; fel specialist/tool nekas; främmande entity-ID nekas; båda chatt-UI ger samma sendpolicy; query/writefel kan inte bli success/tom-sanning.  
**Risks:** för hård policy kan blockera legitim employeeanvändning; kräv explicita rollbeslut och tydliga fel.  
**Suggested builder:** Claude, backend/security-spår.  
**Suggested reviewer:** Codex read-only security/tenant review + produktägare för rollpolicy.  
**Can run in parallel?** Delar av UI-neutral testskrivning kan gå parallellt, men hela epiken blockerar Epic 2 och 6.

### Epic 2 — Sequential Multi-Agent V1

**Problem:** en request kan bara byta agent en gång och saknar plan, resultatöverföring och Matte-summary.  
**Goal:** Matte koordinerar säkert 1–3 specialister sekventiellt och förblir samtalsägare.  
**Exact scope:** validerad plan, max tre unika specialiststeg, requestbaserat loopskydd, immutable originalintent/entities, `AgentResult`, sequential execution, approval pause/resume, partial failure, Matte aggregation och återställt thread owner.  
**Out of scope:** swarm, parallel execution, långlivad workflow engine, specialiststyrda fria handoffs, generell compensationmotor.  
**Dependencies:** Epic 1 komplett.  
**Existing code to reuse:** `agent_threads`, `thread_message.metadata`, `agent_handoffs`, `executeHandoff`-validering, `runAgentTurn`, tool-router, approvals och `agent_runs`.  
**Files/domains likely affected:** Matte-chat/orchestration service, handoff/thread helpers, agent result types, run logging och kontraktstester.  
**Schema change?** Helst nej i V1; använd befintlig metadata och logs. Om resumption inte kan göras idempotent utan separat planrad ska en mycket smal schemaändring föreslås separat.  
**Migration?** Nej som default.  
**Tests:** 2-agent, 3-agent max, invalid/loop, context preservation, approval interruption/resume, partial failure, Matte final ownership, no false success.  
**Acceptance criteria:** Storgatan-scenariot kan ge validerad projektmatch, sekventiella domänresultat och en sann Matte-summary utan mer än tre specialister eller oauktoriserad action.  
**Risks:** latens och tokenkostnad; begränsa planner/resultformat och använd multi-agent bara vid verkligt tvärdomänintent.  
**Suggested builder:** Claude, agent/backend-spår.  
**Suggested reviewer:** Codex architecture/reliability review.  
**Can run in parallel?** Nej med Epic 1. UI-adapterns rena design kan förberedas, men integration väntar på resultkontraktet.

### Epic 3 — Shared AgentInteraction UI

**Problem:** chat, moments, observations och approvals har överlappande men inkonsekvent agentpresentation.  
**Goal:** samma visuella språk för text, voice, proactive moments och demo utan att slå ihop domänrecords.  
**Exact scope:** liten AgentInteraction presentation type/adapter, gemensam agentheader/avatar/status, handoff announcement, result/error/partial states och adapters från chat, moment och approval.  
**Out of scope:** ny UI-databas, full dashboard redesign, ersätta approvals/notifications/messages, fake demo cards.  
**Dependencies:** AgentResultfält från Epic 2 stabila; befintlig Jarvis voice semantics bevaras.  
**Existing code to reuse:** `TEAM`, `AgentAvatar`, `AgentDecisionCard`, `AgentNewsRow`, `MomentCard`, `approval-view`, `jarvis/voice`.  
**Files/domains likely affected:** gemensamma agentkomponenter, MatteChatModal, Jobbkompisen, moments/approval adapters.  
**Schema change?** Nej.  
**Migration?** Nej.  
**Tests:** renderer per mode/status/agent, handoff visual, approval delegation, error/partial state, accessibility/mobile layout.  
**Acceptance criteria:** Matte→Daniel→Karin→Matte är visuellt begripligt; rätt agent visas; UI skiljer proposed/approved/completed/failed; befintliga approvalactions förblir auktoritativa.  
**Risks:** överabstraktion; börja med adapters för tre konkreta ytor.  
**Suggested builder:** Claude, UI-spår.  
**Suggested reviewer:** produkt/UX + Codex kontraktgranskning.  
**Can run in parallel?** Ja med Epic 4 efter att resultfältens namn låsts; inte före det.

### Epic 4 — Demo Reset Hardening

**Problem:** resetten är fail-closed mot tenant men icke-atomisk, ofullständig och utan audit.  
**Goal:** snabbt, idempotent, deterministiskt och bevisbart reset endast för explicit demotenant.  
**Exact scope:** owner/admin + env allowlist, explicit resetmanifest, atomisk delete/seed, full story-state cleanup, stable semantic entity manifest, reset version/run, external/cron safety och audit.  
**Out of scope:** generisk production tenant reset, demo-only businesskomponenter, backup/restoreplattform.  
**Dependencies:** exakt produktionsschema och tabellberoenden; beslut om vilka externa integrationer som får demonstreras.  
**Existing code to reuse:** `DEMO_BUSINESS_ID`-grind, `resetDemoAccount`, befintliga seedbuilders/real calculations, demo UI, demo teamseed.  
**Files/domains likely affected:** `lib/demo/**`, demo reset route/page, explicit SQL/RPC, reset tests och dokumentation.  
**Schema change?** Ja, sannolikt en dedikerad SECURITY DEFINER RPC eller motsvarande transaktion samt smal reset-auditrecord.  
**Migration?** Ja; reserverad, manuell SQL enligt projektets regler.  
**Tests:** production tenant blocked, missing env blocked, non-admin blocked, rollback on failure, double reset, complete cleanup, manifest consistency, external endpoints safe.  
**Acceptance criteria:** ingen kodväg kan skicka valfritt tenant-ID; fel lämnar gammalt state intakt; två lyckade resetter ger samma logiska story; run är auditbar och klar på demoacceptabel tid.  
**Risks:** deleteordning och externa sidoeffekter; kräver prod-schema-snapshot och tydlig tabellallowlist.  
**Suggested builder:** Claude för appkod; SQL-ägaren för den reserverade migrationen.  
**Suggested reviewer:** Codex tenant/destructive-action review.  
**Can run in parallel?** Ja med Epic 3 efter att tabellomfattningen låsts; oberoende av Multi-Agent-kod men krävs före skarp storydemo.

### Epic 5 — Demo Story & Presenter Mode

**Problem:** realistisk data och komponenter finns, men säljaren saknar deterministisk ordning, talking points och säker navigering.  
**Goal:** en repeterbar sexstegsberättelse där produktionen själv bevisar värdet.  
**Exact scope:** typad `DemoStory/DemoStep` config, semantic entity mapping, demo-only presenterpanel, next/previous/reset, riktiga routes/evidence, real live Matte-step och datadriven recap.  
**Out of scope:** fake svar, fake agentkort, generell demo-CMS, automatiskt genomförda actions när Next trycks, flera branschstories i V1.  
**Dependencies:** Epic 2 för robust live multi-agentsteg, Epic 3 för visuell kedja, Epic 4 för reset.  
**Existing code to reuse:** demo page/reset, seeded objects, moments, approvals, agent components, production detail pages och Matte chat.  
**Files/domains likely affected:** `lib/demo/**` config/manifest, `/dashboard/demo`, presenterkomponent, story-/isolationstester.  
**Schema change?** Nej i V1; presenter state kan ligga i sessionStorage.  
**Migration?** Nej utöver Epic 4.  
**Tests:** deterministic six steps, route/entity evidence, story values from DB, next/previous/reset, non-demo blocked, prospect UI normal, live Matte fallback.  
**Acceptance criteria:** en ny reset ger samma logiska story; varje talking point kan bevisas i riktiga data; recap dubbelräknar inte; presentatörskontroller syns bara för rätt actor/tenant.  
**Risks:** manus och seed divergerar; versionera story och reset tillsammans och testa evidenskontrakt.  
**Suggested builder:** Claude, demo/UI-spår.  
**Suggested reviewer:** sälj/product owner för storysanning + Codex architecture/security review.  
**Can run in parallel?** Konfigurationsdesign kan gå parallellt sent i Epic 4, men färdig live story väntar på Epic 2–4.

### Epic 6 — Voice Transport Adapter

**Problem:** in-app voice återanvänder Matte, men telefoni och voice-repo har splittrade/dead AI-vägar och saknar gemensam tenantbunden konversation.  
**Goal:** alla sluttranskript går in i samma Matte-orkestrering; voice äger endast transport och optional TTS.  
**Exact scope:** välj aktiv telephony entrypoint, verifierad channel auth, phone→business resolution, external conversation→thread, final transcript request, streamed progress/result, confirmation state, idempotency och optional TTS adapter; stäng/gata parallella voice brains.  
**Out of scope:** ny Lisa-hjärna, n8n tool execution, autonomous phone mutations, full duplexoptimering innan säkerheten är bevisad.  
**Dependencies:** Epic 1–2; produktbeslut om Retell kontra dashboardens 46elks-väg och telefonisk confirmation.  
**Existing code to reuse:** Jobbkompisens transcribe-only→Matte-mönster, dashboard webhook verification/business lookup, `agent_threads`, Matte API, approvals och AgentInteraction.  
**Files/domains likely affected:** dashboard voice routes/adapters, Matte internal API, `Ahogberg/handymate-voice` server integration och tests.  
**Schema change?** Troligen nej om external conversation-ID kan lagras säkert i befintlig metadata; annars en smal unik channel/conversation-mapping.  
**Migration?** Endast om beständig mapping kräver det; designa efter faktisk telephony provider.  
**Tests:** tenant spoofing, same thread continuity, final vs partial transcript, retries/idempotency, interruption, ambiguous entity, explicit high-risk confirmation, no direct n8n mutation.  
**Acceptance criteria:** samma text och transkript ger samma route/actionpolicy; phone tenant kommer endast från verifierad konfiguration; ingen mutation från partial/oklar input; svaret kan visas och eventuellt läsas upp.  
**Risks:** latency, provider choice och call UX; håll första use cases read/propose och flytta högriskapproval till mobil UI.  
**Suggested builder:** Claude eller voice-integrationsägare med tillgång till båda repos.  
**Suggested reviewer:** Codex security/architecture + telephony owner.  
**Can run in parallel?** Transportprototyp med mockat Orchestration API kan starta efter kontraktet i Epic 1, men produktionskoppling väntar på Epic 2 och dess safety tests.

### Exakt implementeringsordning

1. Epic 1 — Orchestration Safety Contract.
2. Epic 2 — Sequential Multi-Agent V1.
3. Epic 3 och Epic 4 kan därefter löpa parallellt.
4. Epic 5 — Demo Story & Presenter, byggd på 2–4.
5. Epic 6 — Voice production adapter; kontraktsarbete kan börja tidigare men aktiveras sist.

## 23. Final Verdict

### Obligatoriska svar A–I

| Fråga | Svar | Kort motivering |
|---|---|---|
| **A. Är Matte redan en funktionell orkestrator?** | **PARTIALLY** | Den kan välja/handa över till en specialist och köra tools i samma tråd, men saknar plan, enforcement, återtag och aggregation. |
| **B. Är nuvarande handoff produktionsredo?** | **NO** | DB-fel kan döljas, tak/state har fel livscykel och de tre handoffmodellerna är inte sammanhängande. |
| **C. Kan en request säkert involvera flera specialister idag?** | **NO** | En handoff per request, ingen resultcontract eller partial failure/approval orchestration. |
| **D. Kan voice återanvända samma Matte-hjärna?** | **PARTIALLY** | In-app voice gör det redan; telefoni och voice-repo behöver en säker adapter och konsolidering. |
| **E. Behövs ett nytt agent framework?** | **NO** | Befintliga agents, tools, threads, approvals, observations och UI-primitives räcker. |
| **F. Är ett gemensamt AgentInteraction-kontrakt motiverat?** | **YES** | Ett litet presentations-/resultkontrakt minskar duplication och möjliggör aggregation, voice, proactive UI och demo. |
| **G. Kan Demo Story Mode använda befintliga produktionskomponenter?** | **YES** | Riktiga cards, approvals, moments, detailvyer, seeded records och Matte finns; story/presenter/reset behöver kompletteras. |

**H. De fem högst prioriterade ändringarna:**

1. Serverägd tenant-, roll-, agent-tool- och action-level-policy.
2. Strukturerat intent/entity/resultkontrakt med fail-visible errors.
3. Sekventiell max 2–3-agentplan där Matte alltid summerar och äger samtalet.
4. Projekt/offert/faktura-resolution med standardiserad ambiguity confirmation.
5. Atomisk demo-reset + verklig story/presenter ovanpå produktionskomponenter, därefter voice-adapter.

**I. Vad ska Claude implementera först?**

Claude ska börja med **Epic 1 — Orchestration Safety Contract**, i denna interna ordning:

1. tool-/roll-/kanalpolicy som servern äger;
2. tenantvalidering av alla service-role-referenser;
3. explicit DB-error propagation och truthful status;
4. små typer för intent, entity resolution och action level;
5. kontraktstester för routing, cross-tenant IDs, ambiguity och confirmation parity.

Först när dessa är gröna bör Claude bygga Multi-Agent V1. Demo och voice multiplicerar annars samma osäkra och kanalberoende beteenden.

### Slutomdöme

Handymate har redan mer än en chatbot: en riktig verktygsrouter, specialistprofiler, approvals, persistent tråd, observationer och ett första fungerande handoffvarv. Det som saknas är inte en ny agentplattform utan ett tunt lager av **koordinerad sanning**: samma intent, samma tenant, samma entitet, samma säkerhetsnivå och samma verifierade resultat genom hela kedjan.

När det lagret finns kan Matte bli den enda naturliga ingången för text, mobil röst och proaktiva moments. Demo Story Mode kan då använda exakt samma komponenter och affärsdata för att visa hur Handymate hittar pengar, skyddar marginal och tar bort administration — utan att demon blir en attrapp och utan att voice blir en parallell AI-produkt.
