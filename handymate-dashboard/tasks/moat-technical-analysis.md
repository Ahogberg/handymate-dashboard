# Teknisk moat-analys — underlag till säljpositionering

_Fable, 2026-07-27. Ren analys, inga byggförslag. Epistemisk märkning:
**[KOD]** = bekräftat i kodbasen (fil angiven) · **[BEDÖMT]** = min bedömning.
Läst mot tasks/capability-inventory.md — där något är BYGGT (ej LIVE) sägs det._

---

## 1. STRUKTURELLA KOPIERINGS-HINDER

Frågan för varje mönster: kräver det OMSKRIVNING av en 2010-tals ERP-kodbas,
eller går det att bulta på?

### 1a. Godkännandekön som primär skrivväg — FUNDAMENTAL (omskrivning)

**[KOD]** Varje agentinitierad extern handling flödar genom `pending_approvals`
med en typad exekverings-switch — **41 approval_type-cases** i
`app/api/approvals/[id]/route.ts` (send_sms, send_quote, invoice_reminder,
publish_microsite, propose-avtal, seasonal_campaign…). Utfall persisteras på
ärendet (`execution_result`). Kön är förstasidans primära yta (IdagCore), inte
en inställningsflik.

**Varför omskrivning:** ett ERP:s skrivvägar är formulär → spara. Att göra
"föreslå → granska → exekvera" till *default* för systemgenererade handlingar
kräver att varje utskicksväg får ett mellanliggande tillstånd, en exekverings-
kontrakt per typ, idempotens (atomisk compare-and-set mot dubbelklick **[KOD]**
route.ts:75-86) och en UI-identitet byggd kring kön. En chatbot-flik är bolt-on;
*kön som produktens ryggrad* är arkitektur. **[BEDÖMT]** En incumbent som
bygger "AI-förslag" utan detta substrat får antingen (a) auto-sändning (skrämmer
deras bas) eller (b) notiser utan exekvering (värdelöst) — mittenläget är den
dyra biten.

### 1b. En delad tool-router för ALLA aktörer — FUNDAMENTAL

**[KOD]** Chat (`/api/matte/chat`), autonom trigger (`/api/agent/trigger`),
bekräftelse-räcket och godkännande-exekveringen kör **samma**
`executeSharedTool`/tool-router (30+ verktyg, `tool-definitions.ts` +
`tool-router.ts`). TD-52-gatingen diskriminerar på `trigger_source`
('user'/'system') **inne i routern**, inte i anropslagren
(`lib/autonomy/agent-gating.ts`).

**Varför det är svårt:** det naturliga sättet för ett ERP-team att bygga en
chatbot är en separat tjänst som anropar befintliga REST-endpoints. Då får man
två exekveringsvägar som glider isär. **[KOD — intern evidens]** Det hände
*oss själva*: den gamla Jobbkompis-vägen hade en parallell faktura-logik med
`invoice_number = Math.random()` tills konsolideringen 2026-07-23
(tasks/ui-ux-audit.md). Om ett AI-first-team med full kontext splittrar sig på
månader, gör en legacy-organisation det garanterat — och divergensen är
buggklassen som dödar förtroendet hos just deras försiktiga kundbas.

### 1c. Förtjänad autonomi (trust-ladder) — FUNDAMENTAL, sekventiellt beroende

**[KOD]** Streak per åtgärdstyp → autonomi-erbjudande som eget kö-kort →
autonom sändning med bypass i cron-vägarna → revoke + 30d cooldown
(`lib/autonomy/earned-autonomy.ts`; redigerade godkännanden räknas korrekt
inte in i streaken, per inventeringen). Status: **BYGGT** — ingen riktig kund
har beviljat autonomi ännu.

**Varför det är svårkopieran:** den förutsätter 1a (kön), per-handlings-
attribution (`agent_id` på loggar **[KOD]**) och approve/reject-historik som
träningsdata. Det är lager tre på ett fundament konkurrenten inte har. Man kan
inte bolta på "AI:n förtjänar självständighet" på ett system där AI:n aldrig
frågat om lov.

### 1d. LLM-native driftlager — MELLANLÄGE (mödosamt men inte omöjligt)

**[KOD]** 31 cron-jobb varav ~10 agentiska, per-business kostnadsvakter +
kill-switch (`checkCostGuards`, `agents_globally_paused`,
`agent_cost_cap_usd_daily`), kostnadsbokföring per körning (`agent_runs` med
USD-kostnad), modellroutning per uppgiftstyp (`lib/ai/get-model.ts`:
Haiku för extraktion/bakgrund, Sonnet för live). Mätt driftkostnad
$0.11–1.56/kund/mån (strategiplanen 1.4).

**[BEDÖMT]** Kopierbart som mönster — men en incumbent utan detta bränner
antingen pengar (fel modell överallt) eller bygger månader av driftinfra innan
första featuren. Det är inte muren; det är vallgraven som gör muren dyr att nå.

### 1e. Snapshot-disciplinen — BOLT-ON-BAR (men semantiken är svensk)

**[KOD]** Frysta priser/rader vid affärshändelser: produktbankens
`component_snapshot`/`labor_amount` på offertrader (v67), avtalens
`price_items` (v74), efterkalkylens frysning vid projektstängning (v73) —
15 filer bär mönstret. **[BEDÖMT]** Ett ERP kan bygga snapshots; det är
etablerad teknik. Det som INTE är trivialt är semantiken snapshotten bär:
ROT-split på arbetsandel per rad, grön teknik-satser på hela radbeloppet,
årstak. Hindret är korrekthetskunskap, inte arkitektur — se §2.

### Sammanfattning §1

| Mönster | Omskrivning eller bolt-on? |
|---|---|
| Godkännandekö som skrivväg (41 typer) | **Omskrivning** |
| En delad tool-router, gating i kärnan | **Omskrivning** |
| Förtjänad autonomi | **Omskrivning** (kräver 1a först) |
| LLM-driftlager (kostnadsvakter, modellroutning) | Mödosam bolt-on |
| Snapshot-mönstret | Bolt-on |
| Chatbot-yta, agentnamn/avatarer, "AI-förslag"-notiser | Trivial bolt-on |

---

## 2. TILLGÅNGAR RANKADE EFTER KOPIERINGSTID

Antagande: resursstark konkurrent, 10–20 utvecklare, legacy-kodbas
(Bygglet/Easoft-klass), ledningsvilja. **⬆ = blir starkare per kund.**

| # | Tillgång | Kopieringstid | Varför |
|---|---|---|---|
| 1 | **Per-kund-datan: efterkalkyl (project_outcome), approve_rate/trust-historik, produktbank-kalkyler** ⬆ | **Featuren: 2–4 mån. Datan: OKOPIERBAR retroaktivt** | **[KOD]** Motor 1 fryser utfall-vs-offert per stängt projekt; trust-ladder ackumulerar godkännande-historik per åtgärdstyp; produktbanken bär firmans egna kalkyler. En konkurrent kan bygga samma funktioner — men kundens 6 månader av inlärd prissättning och förtjänat förtroende flyttar inte med. Detta är den enda tillgången där kopiering inte hjälper dem att ta VÅRA kunder. **[BEDÖMT]** OBS ärlighet: värdet är noll pre-kund-1 — se §3. |
| 2 | **Godkännandekö-arkitekturen + förtjänad autonomi som helhet** | **12–24 mån** | §1a+1c: omskrivning av skrivvägar + sekventiellt beroende + UX-identitet. **[BEDÖMT]** Tiden är inte kodvolym utan organisatorisk: legacy-ERP:ns hela produktlogik och säljkår är byggd kring "användaren gör, systemet lagrar". Kategoribytet är det dyra. |
| 3 | **Svensk back-office-korrekthet** (ROT arbetsandel + årstak + personnummer, grön teknik-satser på rätt bas, produktbankens labor_share-split) | **3–9 mån** | **[KOD]** `lib/quote-calculations.ts` (facit-testad), v67-splitten, årstak-capp. **[BEDÖMT]** Reglerna är offentliga — hindret är korrekthetsdisciplin över alla ytor (offert/faktura/PDF/portal) och att incumbents redan HAR ROT-stöd i någon form. Ensam är detta en medelmur; kombinerad med agent-lagret (agenten som *räknar rätt åt dig*) blir den distinkt. Notera ärligt: vår ROT-fil är aldrig skarpt inlämnad (inventeringen §6). |
| 4 | **Multi-agent-motorn** (6 personor, handoffs, delad router, minne per agent, bekräftelse-räcke) | **4–8 mån för AI-kompetent team; 9–18 mån inne i legacy-org** | **[KOD]** Handoff-mekanik, per-agent-minne, säkerhetsräcket (HMAC-signerade bekräftelser). **[BEDÖMT]** Tekniken är replikerbar för rätt talang — flaskhalsen för incumbents är att rekrytera/behålla den talangen i en legacy-organisation. Se §3 om förvärv. |
| 5 | **Agentiska cron-flottan** (proaktivitet: påminnelser, uppföljningar, kapacitetsfyllnad, avtalsförslag, morgonbrief) | **6–12 mån** | **[KOD]** 31 crons, mönstren dokumenterade i kod. **[BEDÖMT]** Varje enskild cron är enkel; summan + gating + kostnadsvakter + dedup-disciplinen (7d/30d-spärrar, idempotens) är det som tar tid. Deras regelmotorer ("när X, gör Y") täcker en del av ytan — utan LLM-omdömet. |
| 6 | **Kategoripositioneringen i produkt** ("team, inte verktyg" som UX, inte slogan) | **Omedelbart att härma ytligt — år att mena** | **[BEDÖMT]** Namn, avatarer och "AI-medarbetare"-språk kopieras på en sprint. Att det STÄMMER (kön primär, allt gatat, autonomi förtjänas) är §1. Risken är att ytlig kopiering räcker i en demo — se §3. |

**⬆-markering:** endast rad 1 blir automatiskt starkare per kund. Rad 3 blir
starkare per *regeländring* (varje Skatteverkets-justering vi hinner före).
Benchmark-nätverkseffekten (tvärs-firmor) är **inte byggd** — den ligger som
BF2 i gap-backloggen med samtyckes-frö; den får inte räknas som tillgång ännu.

---

## 3. ÄRLIG SÅRBARHETSANALYS

### 3a. Vad kan de kopiera på under 6 månader?

**[BEDÖMT]**, rankat efter sannolikhet:

1. **Chatbot på egen data** — RAG/fråge-bot över kundens projekt och fakturor.
   Billigt, demo-vänligt, och för en köpare som inte synar skillnaden ser det
   ut som "samma sak som Handymate". **Detta är vår största demo-risk.**
2. **Missat-samtal-SMS** — telefoni-feature, veckor inte månader. Vår Tier 0
   är ingen teknisk mur; kilen är att den sitter ihop med CRM/kö/uppföljning.
3. **Påminnelse-/uppföljningsautomatik** — deras regelmotorer gör redan when-X-
   do-Y; att LLM-formulera meddelandetexten är en liten påbyggnad.
4. **"AI-team"-språket** — namn, ansikten, morgonhälsning. En sprint.
5. **Morgondigest** — sammanfattnings-mail över kundens data. Enkel.

Gemensam nämnare: **allt som syns i en 15-minuters demo är kopierbart på
månader.** Det som inte är kopierbart (gating-substrat, per-kund-data,
förtjänad autonomi i drift) syns först efter veckor av användning. Säljvapnet
måste därför tvinga fram jämförelsen på djupet ("be dem visa vad som händer
när AI:n har fel", "vem godkände det där utskicket?") — annars slåss vi på
den yta där vi är lättast att härma.

### 3b. Vilka fördelar är tidsfönster som stängs?

**[BEDÖMT]**

- **Kategorifönstret:** verifierat juli 2026 att nordiska incumbents saknar
  skeppad AI — men Simpro replatformade AI-first i maj med Europa-beachhead,
  och Skaala commoditiserar röst-delen underifrån (299 kr/mån). Fönstret där
  "AI-team" är osagt i Norden är kvartal, inte år.
- **Data-försprånget är ännu inte vårt.** Obekväm symmetri: incumbents sitter
  på år av HISTORISK kunddata (tusentals firmors projekt och priser). Om de
  bygger ett efterkalkyl-lärande har deras kallstart mer data än vår varmstart
  — vårt datamoat-argument håller bara om vi hinner ackumulera *per-kund*-
  historik (som inte flyttar) innan de rör sig. Pre-kund-1 är rad 1 i §2 en
  option, inte en tillgång.
- **Talangfönstret:** LLM-orkestrering blir lättare för varje modellgeneration.
  Det som krävde specialistkunnande 2025 är ramverks-standard 2027. §2 rad 4
  krymper över tid av sig självt.
- **Vår egen verifieringsskuld:** stora delar av det analysen beskriver är
  BYGGT, inte LIVE (inventeringen). Ett moat-narrativ som springer före
  driftbevis är själv en sårbarhet — konkurrenten som pekar på "har ni en enda
  kund som kört detta?" har, just nu, en poäng.

### 3c. Om de KÖPER ett AI-first-bolag i stället för att bygga?

**[BEDÖMT]** Detta är det realistiska hotet — SmartCraft (Bygglet) och EG
(Easoft) är förvärvsmaskiner, och §2:s tidsuppskattningar bygger på att de
bygger själva.

Vad ändras: **§2 rad 4–5 kollapsar** (talang + agentmotor följer med köpet),
tidslinjen för "trovärdig AI-story" går från 12–24 mån till 6–12 mån.

Vad ändras INTE:
1. **Integrationsproblemet byter bara ägare.** Det förvärvade bolagets motor
   måste kopplas in i legacy-ERP:ns skrivvägar — exakt omskrivningen i §1a/1b,
   nu med två kulturer och två kodbaser. Förvärv löser talang, inte arkitektur.
   (Klassiskt utfall: den köpta produkten säljs som fristående "AI-modul" vid
   sidan av — vilket är bolt-on-fällan igen.)
2. **Per-kund-datan** (rad 1) flyttar fortfarande inte.
3. **Svensk skattedjup** följer sällan med ett internationellt AI-förvärv.

**Nettoeffekt på strategin:** förvärvsscenariot komprimerar vårt tidsfönster
men ändrar inte var muren står. Det skärper snarare slutsatsen från §3b: värdet
av att hinna få kunder — vars data och förtroende-historik inte kan förvärvas —
är större än värdet av ytterligare features. (Det är en observation, inte ett
byggförslag.)

---

## Kondensat för strategi-tråden

1. **Muren är substratet, inte ytan:** kö-som-skrivväg + en delad gated
   exekveringskärna + förtjänad autonomi = omskrivning för en incumbent.
   Allt som syns i en demo är kopierbart på månader.
2. **Det enda som blir okopierbart per dag som går är per-kund-datan** —
   och den räknas först när kunderna finns. Moat-klockan startar vid kund 1,
   inte vid feature-merge.
3. **Förvärv är det realistiska konkurrenthotet** och halverar deras tidslinje,
   men flyttar inte integrations- eller datamuren.
4. **Ärlighetsgräns för säljbruk:** inget i detta dokument får presenteras som
   driftbevisat förrän inventeringens BYGGT→LIVE-flyttar skett. Muren är
   verklig i kod; bevisen är fortfarande piloten.
