# Spec: Matte-guidad onboarding — samlad (single source of truth)

**Status:** Design-spec, 2026-06-15. Konsoliderar `roadmap-learning-ai.md` Fas 2.5 + alla onboarding-idéer
från pilotdiskussionen till ETT bygge. **Ersätter** den hyllade formulär-steg-planen (import/kalender som
separata wizard-steg byggs INTE — de fogas in här istället, så onboardingen byggs en gång, rätt.)

---

## Context / varför

Onboardingen ska skapa värde direkt OCH vara "dag noll av AI:n som lär känna företaget". Vi hade flera
lösa idéer (kund-import, kalender-koppling, hemsideskrapning, email-forwarding, Fortnox, "first win",
MCP-migrering). Risken: bygga dem som lösa formulär-steg nu och sedan bygga om allt när den specade
**Matte-konversationsonboardingen** (Fas 2.5) landar. Beslut (Andreas 2026-06-15): **foga in allt i
Matte-onboardingen** — designa och bygg en gång.

Parent-vision: `roadmap-learning-ai.md` → "Fas 2.5 — Matte-guidad onboarding". Denna spec utökar den med
de konkreta verktygs-/data-bitarna och de ärliga begränsningarna vi upptäckt.

---

## Kärnprincip (oförändrad från Fas 2.5)
Konversation med Matte för det icke-uppenbara (vision, ton, arbetssätt) + strukturerad input för det
uppenbara (org-nr, adress). Split-screen: Matte-dialog (60%) + ackumulerande "ditt företag tar form"-panel
(40%). Epistemisk hierarki i panelen: **bekräftat** vs **tolkat** vs **lär mig över tid**. "Hoppa till
formulär"-utgång alltid tillgänglig.

---

## De fem faserna — med nya bitar infogade

### Fas A — Vem ni är
Strukturerad: org-nr, adress, kontakt. Matte sätter ton.
- **Hemsideskrapning (NY):** be om företagets hemsida → skrapa → förfyll namn/bransch/ort. Matte:
  "Jag tittade på er sajt — stämmer det att ni är elektriker i Uppsala?" (bekräftat-vs-tolkat).

### Fas B — Vad ni gör
Konversation + skrapnings-extraktion.
- **Hemsideskrapning → tjänster/specialiteter/ton (NY, kärna):** Firecrawl hämtar sajttext → LLM
  extraherar tjänster, specialiteter, tonläge → Matte validerar ("Så ni gör badrum + el — och tonen är
  personlig/familjär?"). Detta ger agenterna ton + specialiteter UTAN att hantverkaren fyller formulär.

### Fas C — Hur ni jobbar
Arbetstider, prissättning (ROT-defaults), prisintervall. Strukturerad input, Matte ramar.

### Fas D — Verktyg  ← **här bor import + kalender + integrationer**
- **Kund-import (Fas 1-bygge):** CSV-upload (återbruk av befintlig parse/validera/dedup-logik). Överhoppbar.
  Ger framtida automationer data. *Ärligt:* kall import (bara namn/tel/email) ger inget analys-värde dag 1.
- **Kalender-koppling:** Google Calendar OAuth (återbruk `/api/google/connect`). Låter Lisa boka riktiga
  lediga tider från dag 1 — genuint omedelbart värde, kräver ingen historik.
- **Email-forwarding (Fas 2 — blockerad):** kräver per-business inbound-routing (Postmark är hårdkodad
  enbiz idag). Visas som "kommer snart" tills routingen byggts.
- **Fortnox (Fas 2 — blockerad):** licens-blockerad. Visas som "kommer snart".
- **Multi-entitet-migrering / MCP (Fas 3):** importera jobb/offert/faktura/historik (inte bara kunder) —
  DET är vad som tänder agent-analysen. MCP som live-sync-differentiator ovanpå.

### Fas E — Presentation av teamet ("magiskt ögonblick")
Matte introducerar Karin/Daniel/Lars/Lisa med insikter från registrerad + skrapad + importerad data.
- **"First win" hör hemma här** — MEN ärligt: ett *riktigt* analys-baserat first-win (förfallna fakturor,
  svala offerter, reaktivering) kräver historik som kall import saknar. Tills Fas 3 (multi-entitet) +
  pattern-extraction finns, är dag-1-winnen: teamets presentation + "Lisa är live, ring och hör"
  + ev. första bokning i kalendern. Inget fejk-värde.

---

## Återbruk vs nybygge

**Återbruk (finns):**
- Import-logik: extrahera CSV-parse/`formatPhoneNumber`/dedup/batch-insert ur
  [app/dashboard/customers/import/page.tsx](app/dashboard/customers/import/page.tsx) → `lib/customers/import-core.ts`.
- Google OAuth: [connect](app/api/google/connect/route.ts) + [callback](app/api/google/callback/route.ts)
  (+ `source=onboarding`-retur så callback landar i onboardingen, icke-brytande).
- Onboarding-persistens: `onboarding_step` + `onboarding_data` JSONB via [/api/onboarding](app/api/onboarding/route.ts).
- Firecrawl SDK + `FIRECRAWL_API_KEY` + scrapeUrl-mönstret i [scripts/scraping/scrape-craftsmen.ts](scripts/scraping/scrape-craftsmen.ts).
- Matte-chat-infra (agent-trigger / streaming) för konversationen.

**Nybygge:**
- Konversations-UI: split-screen, streaming-Matte, ackumulerings-panel, tolknings-validering, paus/återuppta-state.
- Hemside-self-scrape + LLM-extraktion (tjänster/ton/specialiteter) — produkt-feature, ej prospekt-script.
- Multi-entitet-import (Fas 3) + per-business email-routing (Fas 2).

---

## Ärliga beroenden & begränsningar
- **Pattern-extraction (roadmap Fas 1) krävs** för att Fas E-insikterna ska vara äkta, inte tomma löften.
- **Kall import ≠ agent-värde dag 1.** Analys tänds först med data (Fas 3 multi-entitet / faktisk användning).
- **Email-forwarding** blockerad tills per-business inbound-routing byggts.
- **Fortnox** blockerad tills licensfråga löst (extern).
- **Bee (första piloten) skippar onboarding** (manuell konfig) → detta är för framtida self-serve, **ej
  pilot-blockerande**. Ingen brådska mot midsommar — men det är nästa stora self-serve-investering.

## Föreslagen byggordning
1. **Design-sprint** (1–2 v, kan starta nu): 5 nyckelskärmar (en per fas), Matte:s visuella identitet,
   ackumulerings-narrativ, tempo. (Per roadmap.)
2. **Durabla, UI-agnostiska delar (kan byggas före UI:t utan kastat arbete):** `lib/customers/import-core.ts`
   + `source=onboarding`-plumbing i Google-connect. Förbättrar även dashboard-importen idag.
3. **Konversations-shell** (split-screen, streaming, panel, state) + hybrid strukturerad input.
4. **Fas D-verktyg:** import + kalender inkopplade. Email/Fortnox som "kommer snart".
5. **Fas B-skrapning:** Firecrawl-self-scrape + LLM-extraktion.
6. **Fas E magic moment** (kräver pattern-extraction för äkta insikter).
- **Senare:** multi-entitet-import/MCP (Fas 3), email-routing + Fortnox (Fas 2-blockerare).

## Verifiering (när byggt)
- `tsc` + `next build` rena.
- Hela konversationsflödet A→E mot dev (riktig auth), inkl. "hoppa till formulär"-utgång + paus/återuppta.
- Skrapning: testa mot 2–3 riktiga hantverkar-sajter → rimlig extraktion, Matte validerar.
- Import + kalender-OAuth round-trip i Fas D (landar tillbaka i onboardingen).
- Befintlig-kund-säkerhet: redan onboardade (Bee, `completed_at`) kastas ej in igen.
- Steg-index-fällan: bekräfta dashboard-checken ([app/dashboard/layout.tsx](app/dashboard/layout.tsx)
  `onboarding_step >= 7`) mot nya flödet.
