# Handymate — jobbspecar för AI-teamet

Inspirerat av "marketing engineer"-tänket (varje agent ska ha en jobbspec lika
tydlig som om ni anställt en person): källa, trigger, filter, output,
godkännande, mått, minne. Skrivet 2026-09-02, grundat i faktisk kod
(file:line), inte i vad respektive agent är TÄNKT att göra.

**Varför det här behövdes:** flera av agenterna beskrivs i produkten/marknads-
föringen på ett sätt som inte stämmer exakt med koden (se Lisas och Mattes
filer). En jobbspec som bara beskriver avsikten är värdelös som facit — den
här samlingen beskriver vad som FAKTISKT händer, med källhänvisningar, så
framtida ändringar kan bedömas mot något konkret.

## Agenterna

| Fil | Agent | Roll | Status |
|---|---|---|---|
| [matte.md](matte.md) | Matte | Chefsassistent, primär chatt + delad autonom motor | Verklig, men två parallella chatt-implementationer |
| [karin.md](karin.md) | Karin | Ekonom | Verklig, egen pipeline |
| [daniel.md](daniel.md) | Daniel | Säljare | Verklig, egen pipeline (+ en namn-endast-yta, se filen) |
| [lars.md](lars.md) | Lars | Projektledare | Verklig, egen pipeline |
| [hanna.md](hanna.md) | Hanna | Marknadschef | Verklig, egen pipeline |
| [lisa.md](lisa.md) | Lisa | Kundservice | Verklig, men "svarar i telefon" är marknadsföringsspråk — se filen |
| [reservationsmotorn.md](reservationsmotorn.md) | (ingen persona) | Föreslår förbehåll i offerter | Verklig, unik — inget agentnamn i UI |

## Det delade chassit (gäller Karin/Daniel/Lars/Hanna, inte Matte/Lisa)

Karin, Daniel, Lars och Hanna delar en generisk "kropp" — det är MEDVETEN
återanvändning av rörledning, inte att de är samma agent (varje agent har
egna dataaggregeringar, hypoteser och tröskelvärden, se respektive fil):

- `lib/agents/shared/thinking-call.ts` — generisk `callAgentWithThinking()`
  (Claude med extended thinking, tolkar JSON-svar).
- `lib/agents/shared/save-and-push.ts` — generisk `saveAndPush()`, skriver
  till `business_knowledge` med `agent_id`, skapar `pending_approvals`-kort
  med `payload.routed_agent` satt.
- `lib/agents/registry.ts` — `AGENT_RUNNERS`, mappar `karin/daniel/lars/hanna/lisa`
  → egna `runXObservation`-funktioner.
- `vercel.json` — fem SEPARATA cron-scheman, en per agent
  (`/api/cron/agent-observations/{karin,daniel,lars,hanna,lisa}`).
- `lib/agents/personalities.ts:236-300` (`routeToAgent`/`matchAgentByPrefix`)
  — prefix-baserad routningstabell: `invoice_*→karin`, `quote_*/lead_*/deal_*
  →daniel`, `booking_*/project_*/job_*→lars`, `campaign_*/reactivation_*
  →hanna`, `phone_call/incoming_sms→lisa`, `manual→matte`.
- **"Väntar på dig"-kön** (`components/dashboard/IdagCore.tsx`) är EN delad
  tabell (`pending_approvals`) och UI, som läser `payload.routed_agent` för
  att välja avatar — men den tabellen matas av fem olika, distinkta motorer,
  inte en. `sql/v132_next_best_action.sql` ("NBA") rankar bara de färdiga
  korten mot varandra för Mattes topplista — genererar inget själv.

## Kända luckor att ta ställning till (upptäckta under kartläggningen, inte fixade)

1. **Godkännandeinställningarna för offert/faktura/bokning är bara prompt-
   text, inte kodgrindar** (se matte.md, avsnitt "Kräver godkännande") — den
   allvarligaste av dessa. `create_quote`/`create_invoice`/`create_booking`
   skriver ovillkorligt till databasen; endast SMS/mejl-UTSKICK är faktiskt
   kod-gated (via `triggerSource`, inte automationsinställningarna).
   Offertutskick är räddat av en separat fail-closed-mekanism, men en
   bokning kan i teorin skapas utan godkännande trots ikryssad inställning.
2. **Lisa "svarar i telefon" är marknadsföringsspråk** — inkommande samtal
   möts av ett statiskt röstmeddelande, inte ett AI-samtal. Se lisa.md.
3. **Dashboardens "Lisa – samtal & SMS besvarade"-ruta räknar en händelse
   (`trigger_type='phone_call'`) som riktiga samtal aldrig skriver** — bara
   demodata. Statistiken är strukturellt missvisande i skarpt läge.
4. **Två parallella Matte-chattimplementationer** — en levande
   (`/api/matte/chat`, den UI faktiskt använder) och en som verkar sakna
   anropande UI (`/api/matte/conversations/[id]/messages`). Samma sak för
   delegering: ett gammalt textmarkör-system (`[DELEGATED:agent_id]`) som
   bara den oanvända ytan tolkar, vid sidan av det riktiga verktygsbaserade
   handoff-systemet den levande ytan använder. Städkandidater.
5. **Matte har inget kvalitetsmått** — `agent_runs` loggar bara drift-
   telemetri (tokens, kostnad, status), inget om svaret faktiskt var bra.
   Tumme-upp/ner finns bara för de nattliga insikts-korten, inte chattsvar.
6. **CLAUDE.md säger "22 agent-tools"** — verkligheten är 49 (i
   `app/api/agent/trigger/tool-definitions.ts`, inte `lib/`). Filen bör
   uppdateras.
7. **Reservationsmotorn har redan räknare** (`times_suggested`/
   `times_accepted`/`consecutive_rejects`) men ingen vy visar
   acceptansgraden — enkel vinst för en framtida tillväxt-cockpit.

Nästa steg (när ni är redo): `docs/growth-os/`-mappen för er egen
marknadsföring, med samma "skriv ner sanningen, inte avsikten"-princip.
