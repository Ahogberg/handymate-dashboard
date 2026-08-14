# Kostnadsmodell AI/API/SMS per konto — underlag för rörligt tak

Datum: 2026-08-14. Mål: **85 % marginal på AI/API/SMS** = max 15 % av
tier-priset får gå till rörlig kostnad: **Bas ~374 kr/mån, Firman ~900 kr/mån,
Storfirman ~1 800 kr/mån** (2 495 / 5 995 / 11 995 kr ex moms).

Källmärkning genom hela dokumentet:
- **[MÄTT]** — verklig prod-data (agent_runs / cost_event / sms_log / 46elks API)
- **[LISTPRIS]** — `lib/costs/price-list.ts` v2026-08 (kurs 9,60 kr/USD pinnad)
- **[ANTAGANDE]** — explicit antagen volym/storlek, markerad i texten

---

## 1. MätT data ur prod

### 1.1 agent_runs — kostnad per körningstyp [MÄTT, all-time t.o.m. 2026-08-14]

| Körningstyp | Körningar | Snitt USD/körning | Snitt tokens | Kommentar |
|---|---|---|---|---|
| `cron` (nattpaketet, blandat) | 958 | **$0,025** | 2 766 | Sedan mars |
| ekonomi-agenten (automation_rule) | 48 | **$0,080** | 8 857 | Dyraste regelbundna |
| observation: lars | 57 | $0,032 | 5 992 | Kör DAGLIGEN |
| observation: daniel | 65 | $0,021 | 3 080 | 2×/vecka |
| observation: karin | 23 | $0,012 | 2 334 | Kör DAGLIGEN |
| observation: hanna | 22 | $0,012 | 2 175 | 2×/vecka |
| **incoming_sms (agentkörning)** | 6 | **$0,209** | 23 268 | ⚠ Avvikare — se §7 |
| manual (dashboard-trigger) | 8 | $0,130 | 14 410 | |
| job_completed | 6 | $0,010 | 1 082 | |

**Senaste 30 dagarna: ~25 körningar, $0,31 totalt över alla konton.**
Dyraste enskilda kontot senaste 60 dagarna: **$1,88 totalt** (≈ 18 kr).
De flesta konton ligger på ~$0,12/60 dagar. Verklig förbrukning är alltså
i dag **1–2 tiopotenser under** både dagens tak och 15 %-budgeten.

### 1.2 Vad kostar en natt? [MÄTT + LISTPRIS]

Nattpaketet per aktivt konto (vercel.json-scheman verifierade 2026-08-14):

| Cron | Schema | Modell | Kostnad/körning |
|---|---|---|---|
| agent-context (kontext + preferenser + prissättning) | dagligen 05:00 | Sonnet + 2×Haiku | ~$0,01 [LISTPRIS] |
| observation karin | dagligen 06:00 | Sonnet + thinking | $0,012 [MÄTT] |
| observation lars | dagligen 06:10 | Sonnet + thinking | $0,032 [MÄTT] |
| observation lisa | dagligen 07:00 | Sonnet + thinking | ~$0,012 [ANTAGANDE: som karin] |
| observation daniel + hanna | 2×/vecka | Sonnet + thinking | $0,021 + $0,012 [MÄTT] |
| next-best-action | dagligen 07:00 | Sonnet 1500 | ~$0,01 [LISTPRIS] |
| avtal-forslag | dagligen 08:40 | Haiku 500 | ~$0,001 [LISTPRIS] |
| hemsida-forslag | dagligen 08:50 | Sonnet 2000 | ~$0,03 [LISTPRIS] |
| communication-check, check-overdue, quote-follow-up | dagligen | Haiku (bakgrund) | à ~$0,005 [MÄTT: cron-snittet] |

**Summa natt ≈ $0,12/konto/dag ≈ 1,15 kr → ~35 kr/månad i ren baseline.**
(Detta är kostnaden för ett konto som inte gör NÅGONTING — golvet.)

### 1.3 Mötesassistenten [MÄTT — i praktiken noll data]

Prod innehåller EN meeting_job: 2 sekunder, test (2026-08-12). Det finns
inga verkliga Whisper-körningar att kostnadssätta ur data. Ur listan:
**90-minutersmöte = 90 × $0,006 = $0,54 Whisper (5,2 kr) + Haiku
map/reduce-analys ~0,6 kr ≈ 6 kr/möte** [LISTPRIS].

### 1.4 SMS [MÄTT — verifierat mot 46elks fakturering, se §3]

Senaste 30 dagarna: 70 utgående SMS, 100 delar, **43,16 kr** bokfört (3 konton).

---

## 2. Kodkartan — varje AI-yta → modell → frekvens

Fullständig kartläggning 2026-08-14 (två Explore-pass över hela kodbasen).
Modellval är hårdkodade — inga env-vars styr. Central väljare
`lib/ai/get-model.ts` finns men ~2/3 av anropsställena kringgår den.

### 2.1 Frekventa/schemalagda

| Yta | Modell | Storlek (max_tokens ut) | Frekvens |
|---|---|---|---|
| Observation-cronar (karin/daniel/lars/hanna/lisa) | Sonnet + thinking | 12 000 (8 000 thinking) | karin+lars+lisa DAGLIGEN, daniel+hanna 2×/v |
| Agent-triggern (`/api/agent/trigger`) | Sonnet (live: samtal/SMS) / Haiku (bakgrund) | 4 096 × upp till 10 steg | Varje inkommande samtal/SMS/mail + 4 cronar |
| Minnesextraktion efter varje agentkörning | Haiku | 150 | Varje körning + varje Matte-tur |
| Matte-/Jarvis-chatten | Sonnet | 2 048 × upp till ~15 anrop/meddelande | Per användarmeddelande |
| agent-context-natten | **Sonnet** + 2×Haiku | 1 024 | Dagligen per konto |
| next-best-action | Sonnet | 1 500 | Dagligen per konto |
| Intent-klassificering inkommande SMS/mail | Haiku | 1 500 | Varje inkommande |
| Gmail-leadfilter | Haiku | 5 (!) + 500 | Var 15:e minut per mail |
| hemsida-forslag | Sonnet | 2 000 | Dagligen |
| meeting-worker (Whisper + Haiku-analys) | whisper-1 + Haiku | 4 000 | Var 5:e minut (när jobb finns) |
| Samtalsanalys efter inspelning | whisper-1 + Haiku | 2 000 | Per inspelat samtal |

### 2.2 På begäran

| Yta | Modell | Storlek |
|---|---|---|
| AI-offertgenerering (Snabbofferten + lead-förslag) | Sonnet | 3 000 (+vision 1 000/extrabild) |
| **Publika hemsidewidgeten** | **Sonnet** | 300 — ⚠ omätt, otakad, öppen för vem som helst |
| Jobbkompisen röst/foto | Sonnet | 1 000 |
| Egenkontroll-fotoanalys | Sonnet vision | 2 000 |
| Onboarding-chatt, kampanjtext, autopilot-SMS, leads-brev | Haiku | 160–500 |
| Månadsgenomgången | Sonnet | 1 200 (1×/månad) |

Död kod: `lib/ai.ts` (två AI-funktioner utan importörer).
Felaktig kommentar: `gmail-lead-detection.ts:93` säger Sonnet, kör Haiku.

---

## 3. SMS/samtal — verkligt 46elks-pris [MÄTT 2026-08-14]

Läsande API-anrop mot 46elks (`GET /a1/sms`, kontovaluta SEK) — **verklig
debiterad kostnad, inte listpris**: 94 av 95 senaste SMS har cost-fält,
samtliga exakt **5 200/10 000 kr = 0,52 kr per del** (1 del = 5200,
2 delar = 10400, 3 = 15600, 5 = 26000 — perfekt linjärt).

**Stickprov 6/6: `sms_log.cost_ore` (52/104 öre) = 46elks fakturerade
kostnad på öret, matchat per elks_id.** Prislistans varning "overifierat
listpris" kan tas bort för SMS — mätaren bokför exakt rätt.

**Samtal: går INTE att verifiera ännu** — endast ett samtal i 46elks-historiken,
utan kostnadsfält. Vidarekopplingsbenet (0,57 kr/min mobil [LISTPRIS]) förblir
overifierat OCH omätt i koden (`voice/missed` loggar rå payload i väntan på
fakturaavstämning). Detta är sannolikt den största rörliga kostnaden per
aktivt konto — se §7.

---

## 4. "Typisk aktiv månad" per tier

Byggd ur uppmätta per-körning-kostnader (§1) + verifierat SMS-pris (§3) +
listpris för det omätta. Volymerna är [ANTAGANDE] — satta som "kontot används
på riktigt", inte dagens låga pilotnivåer.

Kostnadsbyggstenar per händelse:
- Inkommande samtal, AI-delen: Whisper 6 min (0,35 kr) + Haiku-analys
  (0,15 kr) + agentkörning Sonnet live (~$0,21 [MÄTT] = 2,0 kr) ≈ **2,5 kr**
- Inkommande samtal, telefonidelen: 6 min vidarekoppling × 0,57 kr ≈ **3,4 kr** [LISTPRIS, overifierat]
- Inkommande SMS med agentsvar: intent (0,01) + agentkörning (2,0) + svars-SMS (0,52–1,04) ≈ **2,5 kr**
- Utgående SMS (bekräftelser, påminnelser, nurture): **0,52 kr/del** [MÄTT]
- AI-genererad offert: Sonnet ~4k in + 3k ut ≈ $0,057 ≈ **0,55 kr**
- Matte-meddelande: 1–15 Sonnet-anrop; snitt ~**1 kr**, värsta fall ~3 kr [ANTAGANDE — helt omätt yta]
- Platsbesöksmöte 90 min: ≈ **6 kr**
- Baseline nattpaket: **35 kr/mån** [MÄTT/LISTPRIS blandat, §1.2]

| Post | Bas (1 anv.) | Firman (5 anv.) | Storfirman (team) |
|---|---|---|---|
| Baseline cronar | 35 | 35 | 35 |
| Inkommande samtal (30/75/150 st) | 75 + **102 tel** | 188 + **257 tel** | 375 + **513 tel** |
| Inkommande SMS m. agent (20/50/100) | 50 | 125 | 250 |
| Utgående SMS-delar (60/150/300) | 31 | 78 | 156 |
| AI-offerter (10/30/60) | 6 | 17 | 33 |
| Matte-meddelanden (100/300/600) | 100 | 300 | 600 |
| Möten 90 min (0/4/10) | 0 | 24 | 60 |
| **Totalt kr/mån** | **~400** | **~1 025** | **~2 020** |
| 15 %-budget | 374 | 900 | 1 800 |
| Marginal på AI/API/SMS | **84 %** | **83 %** | **83 %** |

**Slutsatser:**
1. 15 %-budgeten är **realistisk men stram** för ett fullt aktivt konto —
   profilerna landar 7–14 % över. Tre poster dominerar helt: telefonminuterna
   (~25 %), agentkörningar på inkommande (~30 %) och Matte-chatten (~25 %).
   Alla tre är idag **omätta eller felmätta** (§7) — budgeten spricker eller
   håller beroende på ytor vi inte ser.
2. Dagens verkliga förbrukning (topp $1,88/60 dagar) är dock **~50× under**
   profilen — ingen kund använder telefoni/Matte i volym ännu. Taket behövs
   som skydd mot framtida beteende + missbruk, inte mot dagens användning.
3. Modellnedgraderingarna i §6 tar profilerna till ~15–20 % under budgeten
   utan kvalitetsförlust på kundmötande ytor.

---

## 5. Befintlig infrastruktur — vad finns, vad är trasigt

- `agents_globally_paused` + `agent_cost_cap_usd_daily` är **kolumner på
  business_config = per konto**, trots namnet. Ingen admin-UI skriver dem —
  bara manuell SQL (v60-rutinen).
- `checkCostGuards()` (`lib/agents/shared/cost-guard.ts`): paus stoppar allt;
  taket summerar dagens `agent_runs.estimated_cost` (UTC) och stoppar **bara
  system-triggers** (user-triggers går alltid igenom — rätt design). Fail-open
  vid query-fel. `driftlarm`-cronen flaggar konton ≥80 % av taket 3 av 7 dygn
  som uppgraderingskandidater.
- **Per-plan-tak FINNS redan i koden**: `PLAN_COST_CAPS_USD = { starter: 1.5,
  professional: 3.0, business: 8.0 }` som fallback när kolumnen är NULL.
- **HUVUDFYND: plan-taken är död kod i praktiken.** Kolumnen har
  `DEFAULT 5.0` → alla 22 konton har explicit 5,0 [MÄTT] → fallbacken når
  aldrig fram. Alla planer har idag samma tak: $5/dag ≈ 48 kr/dag ≈ 1 440
  kr/mån — dvs. Bas-kontots teoretiska tak är 4× dess 15 %-budget.
- Taket täcker dessutom **bara** det som skrivs till `agent_runs` — Matte,
  offertgen, widgeten, Whisper och telefoni ligger helt utanför spärren.
- Ett konto har `subscription_plan='enterprise'` som saknas i både
  billing_plan och PLAN_COST_CAPS_USD (faller till default).

**Svar på frågan "redan byggt för per-tier-tak?": Ja, arkitekturen är klar —
det som krävs är en migration som NULL:ar orörda default-5,0-värden (så
fallbacken får verka; explicit värde blir ren override) + justerade
plan-belopp + att mätluckorna täpps så taket ser hela kostnaden.**

---

## 6. Rekommenderat tak per tier

Omräkning: 15 % av månadspriset / 30 dagar / 9,60 kr/USD:

| Plan | 15 %-budget/mån | = USD/dag | Dagens kodvärde | **Rekommenderat** |
|---|---|---|---|---|
| starter (Bas) | 374 kr | $1,30 | 1,5 | **1,3** |
| professional (Firman) | 900 kr | $3,12 | 3,0 | **3,1** |
| business (Storfirman) | 1 799 kr | $6,25 | 8,0 | **6,2** (sänkning) |
| enterprise | — | saknas | (default 5,0) | **explicit rad, förslag 10,0** |

Åtgärder (backlog, byggs inte i detta pass):
1. Migration `sql/v1xx_plan_cost_caps.sql`: `UPDATE business_config SET
   agent_cost_cap_usd_daily = NULL WHERE agent_cost_cap_usd_daily = 5.0`
   + `ALTER COLUMN ... DROP DEFAULT` (nya rader ärver plan-fallbacken).
   OBS: cap=0 är ett giltigt värde och får inte röras
   (tests/cost-guard-cap.spec.ts skyddar detta).
2. Justera `PLAN_COST_CAPS_USD` till 1,3 / 3,1 / 6,2 + enterprise-rad.
3. Viktigast långsiktigt: **budgeten är per månad, taket per dag.** Dagstak
   30× under månadsbudgeten stryper legitima toppdagar (offertsprint,
   mötesdag). När mätningen täcker allt (§7): överväg glidande
   7-dagarsfönster i stället för kalenderdygn.

---

## 7. Kostnadsavvikare, prioriterade

1. **Agent-triggerns flat-taxa** (`app/api/agent/trigger/route.ts:539`):
   `tokens × $9/Mtok` oavsett modell och in/ut-mix, skriver aldrig
   `cost_event`. Kodbasens största LLM-volym är felprissatt (överskattar
   Haiku-bakgrundskörningar ~3×, kan underskatta Sonnet-tunga) och osynlig i
   COGS-rapporten. **Åtgärd: räkna med `llmCostUsd()` per faktisk modell +
   skriv cost_event.** Utan detta styr taket på fel siffror.
2. **Matte-chatten helt omätt** — upp till ~15 Sonnet-anrop/meddelande, ~25 %
   av månadsprofilen. **Åtgärd: `meterDirectLlmCall()` per tur** (helpern
   finns redan, byggd för exakt detta).
3. **Telefonibenet omätt + overifierat** — potentiellt största enskilda
   posten (0,57 kr/min listpris). `voice/missed` loggar redan rå payload i
   väntan på avstämning; 46elks-API:t hade bara ett samtal utan kostnadsfält.
   **Åtgärd: när första riktiga 46elks-fakturan med samtal finns: stäm av,
   koppla in `recordCost(call_out)` (koden är förberedd).**
4. **incoming_sms-agentkörningar $0,209/st** [MÄTT] — 23k tokens snitt, 8×
   dyrare än bakgrundskörningar. Drivs av full systemprompt + 623 rader
   verktygsscheman × upp till 10 steg. **Åtgärd: trimma verktygslistan för
   SMS-kontext + utnyttja prompt-cachen hårdare.**
5. **Publika widget-chatten**: Sonnet, omätt, otakad, exponerad utan inlogg =
   missbruksvektor (någon kan tömma budgeten från er publika sajt).
   **Åtgärd: Haiku + rate-limit per IP + `meterDirectLlmCall`.**
6. **Karin + Lars kör dagligen** trots kodkommentar som säger 2×/vecka —
   3,5× fler Sonnet+thinking-körningar än designen avsåg. **Åtgärd: beslut —
   antingen uppdatera kommentaren (medvetet val) eller återställ schemat.**
7. **`thinking-call.ts:189` hårdkodar Sonnet i kostnadsberäkningen** — om en
   agent någonsin byter modell prissätts den fel. Liten fix.

## 8. Frekvent + dyrare modell än nödvändigt (nedgraderingskandidater)

Direkta svar på frågan "körs något frekvent med för dyr modell?":

| Yta | Idag | Frekvens | Bedömning |
|---|---|---|---|
| **agent-context-natten** (`lib/agent/context-engine.ts:11`) | **Sonnet** | dagligen × varje konto | **Tydligast av alla**: ren summering av datasnapshot till 1 024 tokens — klassisk Haiku-uppgift, ~10× billigare, ingen kundmötande kvalitet på spel |
| **Publika widgeten** (`app/api/widget/chat/route.ts:207`) | **Sonnet** | per besökarmeddelande, öppen | 300 tokens småprat med anonym besökare — Haiku räcker, och det stänger samtidigt missbruksrisken delvis |
| **Karin + Lars observationer** | Sonnet + thinking | dagligen | Behåll Sonnet (resonemangstung), men frekvensen är felet: 2×/vecka enligt design, eller en billig Haiku-gate först ("har något ändrats sedan igår?") som hoppar över Sonnet-passet tomma dagar |
| **hemsida-forslag** | Sonnet | dagligen | Innehållsgenerering motiverar Sonnet, men dagligen är omotiverat — veckovis räcker |
| next-best-action | Sonnet | dagligen | Gränsfall: rankning/omdöme, liten prompt, låg kostnad — låt stå tills mätningen visar annat |
| Matte-chatt, offertgen, jobbkompisen | Sonnet | på begäran | Behåll — kundmötande kvalitet är själva produkten |

Uppskattad effekt av de två första + frekvensfixarna: baseline-golvet sjunker
från ~35 till ~15 kr/konto/mån och profilernas totaler hamnar under
15 %-budgeten med marginal.

---

*Underlag: agent_runs/cost_event/sms_log/billing_plan/business_config via
Supabase MCP 2026-08-14; 46elks API-läsning samma dag; två Explore-pass över
hela kodbasen. Inga kodändringar gjorda i detta pass.*
