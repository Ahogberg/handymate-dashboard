# Handymate — Ärlig kapabilitets-inventering

_För pitch-/strategiändamål. Ingen hype — vad som FAKTISKT finns._
_Genererad 2026-07-01. Uppdatera statusar när prod-verifieringar gjorts._

## Statusdefinitioner (läs först)
- **LIVE** = deployat *och* driftsatt/körande i prod sedan tidigare (rimligt bekräftat operativt).
- **BYGGT** = i `main`, kod-vägen wirad, `tsc`+build rent — men **inte** verifierat med
  riktig prod-körning. Den här månadens audits bevisade upprepat att "deployat" ≠ "fungerar".
- **SPEC** = inte byggt.

**Epistemisk brasklapp:** författaren kan bekräfta vad som ligger i `main` och om kod är
kopplad — men inte observera prod-runtime. Statusen lutar därför KONSERVATIVT. Där det står
LIVE är det en slutsats, inte en garanti. Sann "LIVE" kräver pilot-bekräftelse (Bee).
**En pitch byggd på fejk-kapabilitet dödar trovärdighet vid första demon.**

---

## 1. Agenter (6)

Agenterna är INTE sex självständiga AI:n som agerar fritt. De är (a) personas ovanpå en
delad verktygs-motor, (b) nattliga observations-generatorer, (c) ägare av vissa
cron-automationer. Den konversationella agenten (Matte) är ansiktet; automations-motorn
gör de faktiska handlingarna.

| Agent | Roll | Gör KONKRET | Triggers | Status |
|---|---|---|---|---|
| **Matte** | Chefsassistent | Chatt (webb+mobil, 24 verktyg): skapa offert/faktura, slå upp kund, boka, svara. Handoff till specialister. | Användarinitierat + nattlig `agent-context` | **BYGGT** (enad motor Stage 1–3; webbchatt kräver smoke-test) |
| **Karin** | Ekonom | Fakturapåminnelser, ROT/RUT-beräkning, ROT→Skatteverket-fil | `check-overdue` 07:00, `send-reminders` 10:00, obs 06:00 | Påminnelser **LIVE**; ROT-fil **BYGGT** (enhetstestad, aldrig skarpt inlämnad) |
| **Hanna** | Marknadschef | Väcker gamla kunder (gatade förslag), recensionsförfrågningar | `hanna-outbound` 08:30, `review-requests` 09:00, obs 06:15 (sön/ons) | Reaktivering **BYGGT** (gatad); review **BYGGT/LIVE** |
| **Daniel** | Säljare | Följer upp obesvarade/oöppnade offerter, lead-kvalificering | `quote-follow-up` 08:00, obs 06:05 | **BYGGT** — cron wirad, end-to-end i prod EJ bekräftat |
| **Lars** | Projektledare | Projekt-/boknings-koordinering, projekt-hälsa | `project-health` (veckovis), obs 06:10 | **BYGGT** |
| **Lisa** | Kundservice/telefonist | KOPPLAR inkommande samtal till din telefon ELLER tar röstmeddelande + transkriberar. Missat samtal → catch-SMS (Tier 0). | `voice/incoming`-webhook | Routing **LIVE**; Tier 0 **BYGGT**; INGEN pratande röstagent |

**Kritiskt:** Lisa pratar INTE. Ingen realtids-röstagent finns. "Lisa" = samtals-routing
(koppla/röstbrevlåda) + SMS-fångst. Pratande AI i telefon = **SPEC** (Tier 1, Vapi ej inkopplat).

---

## 2. Kärnflöden — Golden Path

`lead → deal → offert → projekt → faktura → betalning`

| Övergång | Automatisk? | Status |
|---|---|---|
| Inkommande samtal/mejl/lead → deal skapas (`createLeadAndDeal`) | Ja | **BYGGT** (fixad denna session) |
| Offert skickad → "Offert skickad" (skapar deal om saknas, `ensureDealForQuote`) | Ja | **BYGGT** |
| Offert accepterad → "Offert accepterad" | Ja | **BYGGT** |
| Faktura betald → "Vunnen" (`findDealByInvoice`-fallback + rätt slug) | Ja | **BYGGT** (var HELT trasig innan — deals nådde aldrig "Vunnen") |
| Riktningsskydd (system kan ej dra deal bakåt) | Ja | **BYGGT** |

**Brutal sanning:** hela Golden Path fixades den här månaden — den var trasig på flera
ställen. Nu kodmässigt hel + deployad, men INGEN verifiering av att en riktig deal flödar
hela vägen till "Vunnen" i prod. → **BYGGT, inte LIVE.**

---

## 3. Integrationer

| Integration | Status | Ärlig kommentar |
|---|---|---|
| **46elks** (SMS + röst) | **LIVE** | SMS-utskick i hela automations-motorn; samtals-routing körande. Vissa flöden fixade denna session. |
| **Stripe** | **BYGGT** | Full checkout/webhook/portal, auditerad + härdad. ALDRIG ett skarpt köp (alla `comp`/fail-open). Kräver Stripe TEST-setup för LIVE. |
| **Fortnox** | **BYGGT men LICENS-BLOCKERAD** | Kod finns, men kräver kundens Integrationslicens 149 kr/mån (Christoffer har ej köpt) → oanvändbar för piloten. Funktionellt = SPEC tills licens. |
| **Google** (kalender/Gmail) | **BYGGT** | Koppling + token-refresh finns. Om piloten kopplat = fungerar; ej bekräftat. |
| **Vapi** (röst-AI) | **SPEC** | INTE inkopplat. Enbart en `vapi_call`-etikett i koden. Röst går via 46elks. |
| **OpenAI Whisper** | **BYGGT** | Transkriberar röstmeddelanden + mobil röst-input (svenska). |

---

## 4. Mobil (Expo-app)

Skärmar: inloggning, idag, godkännanden, projekt, offert, **tid**, verksamhet, profil,
bokningar, deals, **Matte-chatt + röst-input**.

| Funktion | Status |
|---|---|
| Godkännanden (godkänn/avvisa, läser om handling faktiskt skedde) | **BYGGT** (B2-fix klar) |
| Tid, projekt, bokningar, offert | **BYGGT** (ev. LIVE om publicerat bygge finns) |
| Matte chatt + röst-in (tal→text, svenska) | **BYGGT** (Stage 2 + transkript-fix) |

**Brutal sanning:** senaste mobil-fixarna är committade men kräver ett **EAS-app-bygge**
för att nå telefoner. Vad som finns på en publicerad enhet idag är obekräftat.

---

## 5. Lärande / moat

| Förmåga | Beräknas? | Används? | Status |
|---|---|---|---|
| Agent-attribution (agent_id på loggar) | Ja | Ja — per-agent scoreboard | **BYGGT** |
| approve_rate + "trust-ladder" | Ja | Ja — trust-ladder-vy | **BYGGT** |
| Pattern-extraction (nattlig) | Ja | Delvis (matar scoreboard/trust-ladder) | **BYGGT** (delar beräknas men visas tunt) |
| AI-lärda preferenser (ton/pris/stil) | Ja | Ja — i agent-prompten | **BYGGT** (läs+skriv verifierad) |
| agent_context (nattlig företagsanalys) | Ja | Ja — i prompten | **BYGGT** |
| Veckovärde (kr + tid) | Ja | Ja — på huvud-dashboarden | **BYGGT** |

**Moat-bedömning:** lärandet är mer verkligt än väntat (approve_rate, trust-ladder,
preferens-inlärning nattligt). Men svänghjulet är svagt tidigt — kräver historik en ny
hantverkare saknar. Moaten = DJUPET (svensk ROT/Fortnox/faktura-loop), inte agent-tekniken
(commodity, jfr GHL).

---

## 6. Vad som INTE finns (ärligt)

- **Pratande röstagent** (Lisa i telefon, naturlig svenska) — **SPEC**. Röst = koppla/röstbrevlåda + SMS-fångst.
- **Skarpa Stripe-betalningar verifierade** — nej. Behöver TEST-setup.
- **Fortnox användbart** — nej (licens-blockerat).
- **BankID** — **SPEC** (Criipto, ej integrerat).
- **ROT faktiskt inlämnat till Skatteverket** — nej (byggt + enhetstestat, aldrig skarpt).
- **Realtids-samtalstranskribering** — nej. Bara röst*meddelanden* transkriberas.
- **Onboarding self-serve end-to-end** — **BYGGT** (Steg 1–10 finns) men "signup → betala →
  använd utan handpåläggning" ej prod-verifierad; betalvägen gatad på Stripe.
- **Golden Path prod-verifierat** — nej (kodmässigt helt, aldrig kört en riktig deal hela vägen).

---

## Bottom line för pitchen

**Kan visas/lovas UTAN att ljuga idag:**
- Missat samtal → SMS → AI bokar (Tier 0) — kärnkilen.
- CRM + offert + faktura + ROT-beräkning + veckovärde i kronor.
- Gatad proaktiv reaktivering (Hanna).
- Matte-chatt (webb+mobil, text + röst-IN).

**Får INTE sägas i demo (dödar trovärdighet):**
- ❌ "En AI svarar i telefon och pratar" (finns inte).
- ❌ "Kopplar till din Fortnox" (licens-blockerat för kunden).
- ❌ "Betala smidigt i appen" (Stripe ej live-verifierat).
- ❌ Golden Path som bevisat fungerande (kodmässigt helt, ej prod-verifierat).

**Tre verifieringar krävs innan BYGGT → LIVE (och innan betald pilot):**
1. Web-smoke av Golden Path + Matte-historik.
2. Stripe-testköp (4242) → `subscription_status='active'`.
3. EAS-mobilbygge.
